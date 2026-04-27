/**
 * Extraction prompt for ContextAtlas.
 *
 * Validated on two empirical bases:
 *
 * 1. Pre-scaffolding ADR validation: 12 production-grade documents
 *    (10 substantial ADRs from hono + httpx, 2 README files), 100%
 *    JSON parse success, accurate severity classification on 169
 *    extracted claims. Cost: $2.89. See hackathon pre-work notes.
 *
 * 2. v0.3 Step 9 docstring calibration: 13 docstring samples across
 *    TypeScript (hono), Python (httpx), and Go (cobra) per Step 8
 *    probe selection. 11/13 PASS, 2 mild over-extractions, 1 mild
 *    under-extraction; JSON parse 100%; severity discipline 100%.
 *    Cost: $0.45. See ContextAtlas-benchmarks/research/
 *    v0.3-docstring-prompt-calibration.md.
 *
 * The prompt handles two input shapes via H1 (single shared prompt)
 * design: ADR documents (long-form architectural prose) and
 * docstrings (per-symbol short prose). Per Step 9 evidence, the H1
 * design produced shipping-quality output without architectural
 * switch to dual prompts (H2). ADR-02 amendment NOT required —
 * single-prompt-extended is within "extraction prompt" scope.
 *
 * What's expected to evolve during implementation:
 *   - How this prompt is called (function signatures, streaming options)
 *   - Output validation and parsing logic
 *   - Error handling (rate limits, malformed JSON retries)
 *   - Possibly minor prompt tweaks based on edge cases encountered
 *
 * What should NOT change without an ADR update:
 *   - The extraction schema (claims with severity, symbol_candidates,
 *     rationale, excerpt)
 *   - The severity taxonomy (hard / soft / context) and its wording
 *   - The "output ONLY the JSON object" instruction
 *   - The model choice (claude-opus-4-7 — see below, ADR-02, and
 *     DESIGN.md extraction pipeline section)
 *
 * See docs/adr/ADR-02-extraction-sole-api-caller.md for the architectural
 * constraint that this module is the only place allowed to call the
 * Anthropic API.
 *
 * Naming convention note:
 *   The model's JSON output uses snake_case (symbol_candidates). The
 *   rest of the codebase uses camelCase. The ExtractedClaim type below
 *   intentionally mirrors the model's snake_case output — this is the
 *   external boundary, treated the same way YAML config input is.
 *   Do NOT "fix" the casing here; the extraction pipeline (step 5)
 *   handles the conversion when transforming ExtractedClaim → Claim.
 *
 * Type relationship note:
 *   ExtractedClaim (this file) is the raw shape the model returns.
 *   Claim (src/types.ts) is the persisted record used everywhere else
 *   in the codebase. The extraction pipeline transforms each
 *   ExtractedClaim into a Claim by:
 *     - Adding source metadata (source, sourcePath, sourceSha)
 *     - Resolving symbol_candidates → symbolIds via the language adapters
 *     - Preserving severity, claim, rationale, excerpt verbatim
 *   These types are deliberately separate. Do not merge them.
 */

export const EXTRACTION_PROMPT = `You are extracting architectural claims from the input below.

Given the input, extract architectural constraints, preferences, and contextual information present in the prose. Output strictly valid JSON matching this exact schema:

{
  "claims": [
    {
      "symbol_candidates": ["string array of class/function/module names referenced in the prose"],
      "claim": "concise statement of the constraint or fact",
      "severity": "hard" | "soft" | "context",
      "rationale": "why this matters, from the input",
      "excerpt": "short verbatim quote from the input supporting this claim"
    }
  ]
}

Severity taxonomy:
- "hard": explicit constraint, violation is a bug. Signaled by:
  - Mechanical markers: "@deprecated" tag (JSDoc), "Deprecated:" line prefix (godoc), ".. deprecated::" directive (Sphinx)
  - Prose patterns: "must", "MUST", "never", "always", "required", "not allowed" — but only when the prose asserts a constraint on the consumer (e.g., "Implementations MUST handle nil context"). API documentation describing how a library works (e.g., "Cobra requires you to define X") is descriptive, not assertive — default to context.
- "soft": preference or recommendation. Signaled by "should", "prefer", "avoid", "generally", "recommended", "Notice that...", or descriptive cautions ("can be dangerous", "may cause"). Imperative procedural guidance ("Set this to X") is also soft.
- "context": background information or rationale; no rule asserted. Descriptions of why things exist, how they work, or what something is. DEFAULT category for descriptive prose without imperatives.

When mechanical severity signals are absent — for example, Python docstrings often communicate deprecation only via runtime warnings.warn() calls, not in the docstring text itself — do not over-extract hard severity from descriptive prose. Default to context unless prose contains explicit recommendation language.

Skip non-architectural content: YAML frontmatter, license headers, installation instructions, changelogs, deployment steps, version markers, and pure type-shape annotations (e.g., "@param T - The type of X", "@returns Response" without architectural rationale, "method must be one of GET, OPTIONS, HEAD, POST, PUT, PATCH, or DELETE" — enum-of-valid-values is type-shape, not architectural). However: "@param verify - Either True to use SSL context with default CA bundle, False to disable verification" IS architectural — the parameter encodes a security default, not just a type.

If the input contains no architectural claims — for example, a terse implementation contract like "Check if the client is closed" or pure behavioral description without architectural rationale — output {"claims": []}. Do not invent claims to fill output.

For symbol_candidates: extract class/function/module/package names referenced in the prose. For inputs that are docstrings attached to a specific symbol, the documented symbol itself need NOT appear in symbol_candidates (provenance carries that); include only OTHER symbols mentioned.

For external documentation references (Markdown reference links like [Authentication][0] with URL definitions, JSDoc {@link URL} tags, "See also: ..." prose): preserve the human-readable label in the claim text but do not include URLs that would be meaningless out of their original context.

Output ONLY the JSON object. No prose, no markdown fencing, no commentary.

Input:
---
`;

/**
 * Model string for extraction. Locked per ADR-02 and DESIGN.md.
 * Changing this requires updating both documents and a round of
 * re-validation on the benchmark ADR set.
 *
 * Extraction uses Opus 4.7 WITHOUT extended thinking — no `thinking`
 * parameter should be passed to the API. Extraction is a structured
 * output task where we want fast deterministic JSON, not chain-of-
 * thought reasoning. The pre-scaffolding validation (100% JSON parse
 * success across 12 documents) was done without extended thinking.
 */
export const EXTRACTION_MODEL = "claude-opus-4-7";

/**
 * Maximum output tokens for a single extraction call. Conservative
 * default that accommodates dense ADRs without truncating.
 * Observed during validation: substantial ADRs produced ~3000 output
 * tokens; this leaves headroom.
 */
export const EXTRACTION_MAX_TOKENS = 16000;

/**
 * Shape of the expected JSON output from the model. Use this for
 * runtime validation when parsing model responses.
 *
 * Note: fields are snake_case because they mirror the model's JSON
 * output directly. See the file-level naming convention note above.
 */
export interface ExtractionResult {
  claims: ExtractedClaim[];
}

export interface ExtractedClaim {
  symbol_candidates: string[];
  claim: string;
  severity: "hard" | "soft" | "context";
  rationale: string;
  excerpt: string;
}

/**
 * Strip YAML frontmatter before sending a document to the extraction
 * prompt. Frontmatter is metadata, not prose to extract from.
 *
 * Handles the standard `---\n...\n---\n` frontmatter block at the top
 * of a markdown file. Returns the original content if no frontmatter
 * is detected.
 */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) {
    return content;
  }
  const endIndex = content.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return content;
  }
  return content.substring(endIndex + 5);
}