/**
 * Extraction prompt for ContextAtlas.
 *
 * This prompt was validated pre-scaffolding on 12 production-grade
 * documents (10 substantial ADRs from hono + httpx, 2 README files),
 * achieving 100% JSON parse success and accurate severity classification
 * on 169 extracted claims. Cost: $2.89 total. See the hackathon pre-work
 * notes for the full validation run.
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
 *   - The model choice (claude-opus-4-7 at default effort — see ADR-02
 *     and DESIGN.md extraction pipeline section)
 *
 * See docs/adr/ADR-02-extraction-sole-api-caller.md for the architectural
 * constraint that this module is the only place allowed to call the
 * Anthropic API.
 */

export const EXTRACTION_PROMPT = `You are extracting architectural claims from a document.

Given the document below, extract all architectural constraints, preferences, and contextual information. Output strictly valid JSON matching this exact schema:

{
  "claims": [
    {
      "symbol_candidates": ["string array of class/function/module names referenced"],
      "claim": "concise statement of the constraint or fact",
      "severity": "hard" | "soft" | "context",
      "rationale": "why this matters, from the document",
      "excerpt": "short verbatim quote from the document supporting this claim"
    }
  ]
}

Severity taxonomy:
- "hard": explicit constraint, violation is a bug. Signaled by "must", "never", "always", "required", "not allowed".
- "soft": preference or recommendation. Signaled by "should", "prefer", "avoid", "generally", "recommended".
- "context": background information or rationale, no rule. Descriptions of why things exist or how they work.

Only extract architectural claims. Ignore YAML frontmatter, installation instructions, changelogs, deployment steps, and other non-architectural content.

Output ONLY the JSON object. No prose, no markdown fencing, no commentary.

Document:
---
`;

/**
 * Model string for extraction. Locked per ADR-02 and DESIGN.md.
 * Changing this requires updating both documents and a round of
 * re-validation on the benchmark ADR set.
 */
export const EXTRACTION_MODEL = "claude-opus-4-7";

/**
 * Maximum output tokens for a single extraction call. Conservative
 * default that accommodates dense ADRs without truncating.
 * Observed during validation: substantial ADRs produced ~3000 output
 * tokens; this leaves headroom.
 */
export const EXTRACTION_MAX_TOKENS = 8000;

/**
 * Shape of the expected JSON output from the model. Use this for
 * runtime validation when parsing model responses.
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