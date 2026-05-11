/**
 * Canonical generate-adrs prompt for ContextAtlas.
 *
 * Substantive interpretive content shipped at v0.7 Step 2.2.a.2 per
 * locked draft + Refinements 1-3 applied at Travis adjudication
 * surface. Mirrors `src/extraction/prompt.ts` shape conventions
 * (JSON-structured output, severity taxonomy parallel to extraction).
 *
 * Path-γ pattern (v0.7 Step 1.4b inheritance): `contextatlas
 * show-generate-prompt` CLI subcommand surfaces this constant to
 * Skills (`.claude/skills/generate-adrs/SKILL.md`) without leaking
 * package internals. Constant content is canonical; do not duplicate
 * in SKILL.md.
 *
 * Calibration approach: v0.7-ship-bearing-cycle iteration scope (Step
 * 2.2.a.2 substantive interpretive work + Step 2.2.b empirical
 * verification at Rich cold-start + Rich + django/deps reference-
 * context-aided). v0.1-v0.5 multi-cycle prompt iteration scope NOT in
 * v0.7 envelope.
 *
 * Naming convention note (mirrors EXTRACTION_PROMPT): the model's
 * JSON output uses snake_case (e.g., `severity_summary`,
 * `markdown_body`); the rest of the codebase uses camelCase. The
 * generation pipeline transforms snake_case → camelCase at the
 * boundary; the prompt instructs snake_case explicitly so the model's
 * output is predictable to parse.
 */

export const GENERATE_ADRS_PROMPT = `You are generating Architectural Decision Records (ADRs) for the codebase below. ADRs document non-obvious architectural decisions — choices that shaped the codebase, constraints that must be preserved, or design tradeoffs that future maintainers need to understand.

Output strictly valid JSON matching this exact schema:

{
  "adrs": [
    {
      "number": <integer, sequential starting at 1>,
      "title": "<short noun-phrase title; kebab-case slug derivable>",
      "symbols": ["<canonical symbol names this ADR is about>"],
      "severity_summary": "hard" | "soft" | "context",
      "markdown_body": "<full ADR markdown body; see structure below>"
    }
  ]
}

ADR markdown_body structure (each ADR follows this template):

# ADR-NN — <Title>

## Context

<What was the problem space? What constraints or forces shaped the decision? Reference relevant symbols by their canonical names (e.g., src/extraction/pipeline.ts:runExtractionPipeline). Do not invent context not supported by code/comments.>

## Decision

<What was decided? Be specific about the architectural choice. Reference relevant modules + symbols.>

## Rationale

<Why this decision? What alternatives were considered or rejected? What does this preserve?>

## Consequences

<What does this decision enable? What does it constrain? What follow-on decisions does it imply?>

What counts as an architectural decision (target these):
- Module boundaries and dependency direction (which module is allowed to import which)
- Cross-cutting invariants (e.g., "only X module is allowed to call Y API")
- Choice of abstraction (e.g., "Strategy pattern for dispatch" / "Factory for object construction")
- Data flow / persistence decisions (e.g., "single SQLite file" / "atlas.json is the committed artifact")
- Interface contracts that shape downstream code (e.g., "all language adapters expose the same method signatures")
- Performance / cost / correctness tradeoffs (e.g., "extraction runs once at index time; queries are atlas-only")

What is NOT an architectural decision (skip these):
- Specific implementation details ("function uses a for-loop")
- Naming choices (unless they encode a convention referenced elsewhere)
- One-off bug fixes or refactors visible in git history but not architectural
- Test scaffolding choices
- Build / tooling configuration unless it shapes runtime behavior

Calibration:
- Small codebase (<1k LOC): 3-5 ADRs reasonable
- Substantial codebase (~1k-50k LOC): 5-15 ADRs target (substantive launch scope)
- Very large codebase (>50k LOC): 15-30 ADRs reasonable; focus on top-level architectural decisions rather than per-module exhaustive coverage
- One ADR per major architectural decision. Do NOT create one ADR per file or one ADR per module.
- Fewer well-grounded ADRs are better than more speculative ones.

Symbol reference convention:
- When referencing code in ADR text, use canonical symbol identifiers in the form \`path/to/file.ts:SymbolName\` (e.g., \`src/queries/symbol-context.ts:buildBundle\`).
- For module-level references, use the path alone (e.g., \`src/extraction/\`).
- For external packages, use the package name (e.g., \`@anthropic-ai/sdk\`).

Severity summary per ADR:
- "hard": the ADR documents a constraint or invariant that must be preserved (violation is a bug or breaks the architecture).
- "soft": the ADR documents a preference, recommendation, or tradeoff (violation is suboptimal but tolerable).
- "context": the ADR documents background, rationale, or non-prescriptive description (no rule asserted; explains how/why something exists).

REFERENCE CONTEXT (if provided below the codebase):

If reference context is provided (existing architectural documentation in any format), use it as INPUT to inform ADR generation:

- Where reference context describes CURRENT architectural decisions visible in the code, capture those decisions as ADRs with substantive context inheritance from the reference documentation (preserving rationale, alternatives considered, etc.). Where reference context describes superseded/withdrawn/rejected decisions (visible via \`:Status:\` field or similar), capture as historical context within the relevant ADR documenting CURRENT state, but do not generate them as separate authoritative ADRs.

- Capture decisions implicit in the code but NOT yet documented in the reference context.

- Where reference context conflicts with current code state, defer to CURRENT CODE STATE as authoritative. Reference context may be outdated; code is source of truth. When substantive conflicts surface (e.g., reference doc says "we use X pattern" but code clearly uses Y pattern), capture as architectural-evolution observation within the relevant ADR's Context section ("Earlier documentation described X approach; current implementation uses Y; this ADR documents current state with rationale for the evolution if evident in code/comments").

If no reference context is provided, generate ADRs from the codebase alone (pure cold-start path).

Avoid hallucinating decisions not supported by code/comment evidence. If the codebase does not exhibit a clear architectural decision in some area, do NOT invent one — fewer well-grounded ADRs are better than more speculative ones.

Output ONLY the JSON object. No prose, no markdown fencing, no commentary outside the JSON.

Codebase:
---
`;

/**
 * Model string for ADR generation. Same model as extraction (Opus
 * 4.7) for cost-accounting consistency + because the same model
 * substantively produced production-grade JSON output during
 * EXTRACTION_PROMPT calibration (100% parse success across 12
 * documents in pre-scaffolding validation per ADR-02).
 *
 * Opus 4.7 supports a 1M-token context window at standard API
 * pricing with no long-context premium (Anthropic docs Jan 2026).
 * Reference-context-aided generation can use substantial reference
 * inputs (~800k available after codebase + prompt + output reserves)
 * without falling off-budget.
 */
export const GENERATION_MODEL = "claude-opus-4-7";

/**
 * Maximum output tokens for a single generate-adrs call. Generous
 * default that accommodates 5-30 ADRs per typical-to-large codebase
 * without truncating. Opus 4.7 supports 128k max output tokens.
 */
export const GENERATION_MAX_TOKENS = 64000;

/**
 * Soft-warning threshold for reference-context token count per v0.7
 * Step 2.2.a.2 Lock 1 (γ user-configurable scope + soft-warning +
 * attempt-anyway). Emits informational warning when reference
 * context exceeds this size; generation proceeds regardless. Tuned
 * to 500k tokens (~62% of the ~800k available reference-context
 * budget after reserving for codebase inventory + prompt + ADR
 * output). Empirical calibration at Step 2.2.b.ii Rich +
 * \`django/deps\` verification may revise this constant.
 */
export const REFERENCE_CONTEXT_TOKEN_WARNING_THRESHOLD = 500_000;

/**
 * Opus 4.7 pricing per million tokens (USD), used for pre-flight
 * cost estimation in the CLI confirmation prompt. Public Anthropic
 * pricing as of Jan 2026. Bumping these requires updating
 * cost-priors-v0.6.json substrate + ADR-19 §2 pricing-model context.
 */
export const OPUS_INPUT_PRICE_PER_MILLION_USD = 5;
export const OPUS_OUTPUT_PRICE_PER_MILLION_USD = 25;
