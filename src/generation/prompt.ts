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

# Audience and purpose

Your audience is a senior engineer joining this project in 18 months. They need to understand WHY each decision was made, not just WHAT it was. Each ADR must equip them to:

- Defend the decision in a code review against someone proposing the alternative.
- Recognize when a proposed change would silently break the invariant the ADR records.
- Distinguish between cosmetic changes (safe) and decision-level changes (require ADR amendment).

ADRs that read as topic-level summaries ("Rich uses duck typing for renderables") are insufficient. ADRs that read as deep investigations ("Rich uses duck typing for renderables because subclass-based extension would require users to either monkey-patch or wrap external types; this rejects two specific alternatives — class hierarchy and registry — for reasons visible at \`rich/protocol.py:is_renderable\` and the \`__subclasshook__\` pattern in \`rich/abc.py:RichRenderable\`") are the target.

# Investigative discipline (load-bearing)

Before writing ANY ADR, you MUST investigate the codebase substantively for each architectural decision candidate:

1. **Read the load-bearing implementation files** for each candidate — not just enumerate symbol names from a directory listing. Read the actual function bodies, class definitions, interface declarations, error handling paths.

2. **Cite specific line numbers** for the symbols you reference. \`src/router.ts:98\`, \`rich/console.py:_write_buffer at line 1652\`, \`src/types.ts:127+\`. An ADR without line-level grounding is shallow by definition.

3. **Quote specific code patterns** where they illustrate the decision. A 3-15 line code snippet in the Decision or Rationale section is substantively more useful than a verbal description of the same code.

4. **Enumerate alternatives considered** with substantive detail. Name specific alternatives (not "other approaches were considered"). For each alternative, explain what it would have required and why it was rejected. Where the codebase shows evidence of alternatives (commented-out code, "TODO: consider X" patterns, abandoned-approach commits, comparison tables in comments), cite them.

5. **Track cross-file dependencies and patterns** that participate in the decision. A decision is rarely localized to one file; the ADR should surface the full surface area.

The depth ceiling for ADRs generated from cold investigation (no prior knowledge of the codebase's history) is bounded — you cannot recover original-author intent, cycle history, or production-incident-driven decisions that aren't visible in code/comments. Aim for what cold investigation CAN reach: line-level grounding, code-pattern citation, alternatives inferred from code structure, failure modes visible in error-handling code.

# Output schema

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

# ADR markdown_body structure

Each ADR follows this template:

\`\`\`
---
id: ADR-NN
title: <full title>
status: accepted
severity: hard | soft | context
symbols:
  - <canonical symbol 1>
  - <canonical symbol 2>
---

# ADR-NN: <Title>

## Context

<Substantive paragraphs — typically 2 or more — establishing the problem
space, the constraints or forces shaping the decision, and the stakes if
the decision is gotten wrong. Reference specific symbols with line
numbers (\`src/router.ts:98\`); include code snippets where they
illustrate the problem; name specific alternatives considered.>

## Decision

<What was decided? Be specific. Enumerate sub-rules (MUST / MUST NOT)
where the decision has multiple load-bearing parts. Reference exact
file locations and symbol names. Include code snippets that illustrate
the decision pattern in practice.>

## Rationale

<Why this decision over alternatives? Make multiple distinct cases
(typically 3-7 bullets or paragraphs). For each alternative considered,
explain what it would have required and why it was rejected. Cite
specific code patterns or invariants the decision preserves.>

## Consequences

<What does this decision enable, constrain, or imply? Surface concrete
failure modes (e.g., "Forgetting normalizePath() at an ingest boundary
creates a bifurcation where some IDs use backslash"); review-time
invariants (e.g., "any code that tries to extract line from ID is
broken"); downstream code patterns that depend on this decision.
Generic statements like "this enables flexibility" or "this may have
implications" are NOT sufficient — name specific failure modes and
invariants.>
\`\`\`

# Calibration examples — depth contrast

GOOD Context section (target depth):

> Configuration surface is where MVP projects either stay focused or get
> dragged into scope creep. Every "just one more config option" adds
> parsing complexity, documentation burden, and user confusion. Every
> inheritance chain ("my project config inherits from my team config")
> doubles the mental model.
>
> ContextAtlas's config needs are limited: language list, ADR path, doc
> globs, git settings, extraction model, and atlas sync options. Roughly
> seven top-level sections. Deliberately compact.

(Establishes stakes; names what scope creep looks like; explains
constraint with specifics.)

SHALLOW Context section (do NOT write like this):

> ContextAtlas needs configuration. The config defines languages and paths.

(No stakes; no alternatives; no specifics.)

GOOD Rationale enumeration (target depth):

> - **A single file is greppable, copyable, reviewable in a single PR.**
> - **No inheritance means no debugging of "what config is actually
>   active?" questions.**
> - **YAML is the standard for dev-tool config files** (GitHub Actions,
>   Docker, Kubernetes, CircleCI). Not introducing a less-familiar format.

(Multiple distinct cases; each names a concrete alternative or
counterfactual; references specific comparables.)

SHALLOW Rationale (do NOT write like this):

> - Simple is better.
> - YAML is standard.
> - Reduces complexity.

(No alternatives named; no concrete grounding.)

GOOD Consequences section (target depth):

> - Moving a symbol to a different file changes its ID. A file split or
>   move from src/orders/ to src/billing/ produces a new ID and
>   invalidates claims bound to the old one. This is correct behavior —
>   the symbol has been relocated — and incremental reindex rebinds
>   claims as part of its normal flow.
> - The Symbol record is the authoritative source of line information.
>   Consumers that need a line number (for jump-to-definition, log
>   output, etc.) read the \`line\` field from the Symbol record, never
>   parse it out of the ID. Any code that tries to extract line from ID
>   is broken.
> - normalizePath() is a single enforcement point. It MUST be called at
>   every ingest boundary: reading file paths from LSP, parsing config,
>   importing atlas.json, scanning ADR directories. Forgetting it
>   anywhere creates a bifurcation where some IDs use backslash and some
>   use forward-slash, silently producing "duplicate" symbols. Code
>   review should flag any path-handling code that doesn't go through
>   this utility.

(Named failure modes; review-time invariants; concrete downstream
impacts.)

SHALLOW Consequences (do NOT write like this):

> - This enables flexibility.
> - May have implications for future development.
> - Users should be aware of the trade-off.

(No named failure modes; no review invariants; no concrete grounding.)

# What counts as an architectural decision (target these)

- Module boundaries and dependency direction (which module is allowed to import which)
- Cross-cutting invariants (e.g., "only X module is allowed to call Y API")
- Choice of abstraction (e.g., "Strategy pattern for dispatch" / "Factory for object construction")
- Data flow / persistence decisions (e.g., "single SQLite file" / "atlas.json is the committed artifact")
- Interface contracts that shape downstream code (e.g., "all language adapters expose the same method signatures")
- Performance / cost / correctness tradeoffs (e.g., "extraction runs once at index time; queries are atlas-only")
- Protocol / dunder / extensibility-point design (e.g., duck-typed renderable protocol)
- Backend / platform abstraction patterns (e.g., legacy Windows renderer as dedicated backend, not feature flag)

# What is NOT an architectural decision (skip these)

- Specific implementation details ("function uses a for-loop")
- Naming choices (unless they encode a convention referenced elsewhere)
- One-off bug fixes or refactors visible in git history but not architectural
- Test scaffolding choices
- Build / tooling configuration unless it shapes runtime behavior

# Calibration — number of ADRs

- Small codebase (<1k LOC): 3-5 ADRs reasonable
- Substantial codebase (~1k-50k LOC): 5-15 ADRs target (substantive launch scope)
- Very large codebase (>50k LOC): 15-30 ADRs reasonable; focus on top-level architectural decisions rather than per-module exhaustive coverage
- One ADR per major architectural decision. Do NOT create one ADR per file or one ADR per module.
- Fewer well-grounded ADRs are better than more speculative ones.
- An ADR exceeding 600 lines is probably bundling multiple decisions; split into two narrower-scoped ADRs instead.

# Symbol reference convention

- When referencing code in ADR text, use canonical symbol identifiers in the form \`path/to/file.ts:SymbolName\` (e.g., \`src/queries/symbol-context.ts:buildBundle\`).
- Where helpful, include line numbers: \`src/router.ts:98\` or \`rich/console.py:Console at line 1652\`.
- For module-level references, use the path alone (e.g., \`src/extraction/\`).
- For external packages, use the package name (e.g., \`@anthropic-ai/sdk\`).

# Severity summary per ADR

- "hard": the ADR documents a constraint or invariant that must be preserved (violation is a bug or breaks the architecture).
- "soft": the ADR documents a preference, recommendation, or tradeoff (violation is suboptimal but tolerable).
- "context": the ADR documents background, rationale, or non-prescriptive description (no rule asserted; explains how/why something exists).

# Reference context handling

If reference context is provided (existing architectural documentation in any format), use it as INPUT to inform ADR generation:

- Where reference context describes CURRENT architectural decisions visible in the code, capture those decisions as ADRs with substantive context inheritance from the reference documentation (preserving rationale, alternatives considered, etc.). Where reference context describes superseded/withdrawn/rejected decisions (visible via \`:Status:\` field or similar), capture as historical context within the relevant ADR documenting CURRENT state, but do not generate them as separate authoritative ADRs.

- Capture decisions implicit in the code but NOT yet documented in the reference context.

- Where reference context conflicts with current code state, defer to CURRENT CODE STATE as authoritative. Reference context may be outdated; code is source of truth. When substantive conflicts surface (e.g., reference doc says "we use X pattern" but code clearly uses Y pattern), capture as architectural-evolution observation within the relevant ADR's Context section.

If no reference context is provided, generate ADRs from the codebase alone (pure cold-start path).

# Anti-hallucination discipline

Avoid hallucinating decisions not supported by code/comment evidence. If the codebase does not exhibit a clear architectural decision in some area, do NOT invent one — fewer well-grounded ADRs are better than more speculative ones.

When you cite a line number, the line must exist in the file. When you reference a symbol, the symbol must exist. When you describe a code pattern, you must have actually read code that exhibits it.

# Output discipline

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
