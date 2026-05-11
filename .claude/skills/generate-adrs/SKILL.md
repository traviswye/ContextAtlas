---
name: generate-adrs
description: Generate Architectural Decision Records (ADRs) for a codebase by walking the source tree, identifying non-obvious architectural decisions, and writing canonical ContextAtlas-format ADRs to docs/adr/. Runs inside Claude Code session (subscription-bounded; no Anthropic API key needed). Supports optional --reference-context for migrating from heterogeneous existing documentation (Django DEPs, Confluence exports, internal wikis, RFC repos). Canonical Claude Code entry point per ADR-02 v0.7 amendment §Decision entry-point-determined cost model.
---

# generate-adrs — ContextAtlas ADR generation via Claude Code session

## When to use this skill

You're running ContextAtlas ADR generation inside your Claude Code
session. User invoked you via `/generate-adrs` slash command, OR
via contextatlas project context surfacing in their session.

This is THE canonical entry point for subscription-bounded ADR
generation. The `contextatlas generate-adrs` CLI binary uses
Anthropic API direct generation (different cost model; not this
skill's concern). Per ADR-02 v0.7 amendment §Decision: generation
has two entry points; each entry point uses the appropriate cost
model for its invocation context.

If user is asking how to generate ADRs:

- They're working in Claude Code session right now → invoke this skill
- They want CLI / CI/CD / scripting workflow → tell them to use
  `contextatlas generate-adrs` from terminal (uses Anthropic API
  direct; requires `ANTHROPIC_API_KEY` env var)

## What this skill does

Walks the codebase, identifies non-obvious architectural decisions,
and writes canonical ContextAtlas-format ADRs to `docs/adr/` in the
configured repo. Supports optional reference-context input (the
user's existing architectural documentation in any format —
Markdown ADRs, reStructuredText DEPs, Confluence exports,
architectural commentary) which informs ADR generation as PROMPT
INPUT (not direct extraction substrate).

1. **Walk** the codebase: enumerate source files, list top-level
   symbols, capture architectural-narrative-rich root documents
   (README.md, DESIGN.md, CLAUDE.md).
2. **Walk** optional reference context (if user provided
   `--reference-context <path>` via skill argument or
   conversational context). Multi-format support inherited from
   v0.7 Step 2.1.a Scope γ' substrate (.md + .rst; Nygard /
   ADR-NN / Date naming conventions; recursive depth-2 walk).
3. **Load** the canonical generate-adrs prompt via:

   `` !`contextatlas show-generate-prompt` ``

   This invokes the contextatlas CLI subcommand that outputs the
   canonical `GENERATE_ADRS_PROMPT` constant from
   `src/generation/prompt.ts`. The CLI handles path resolution
   internally; works regardless of how user invoked contextatlas
   (installed dependency vs cloned source). Path-γ architectural
   pattern per v0.7 Step 2.2.a.2 design (mirrors Step 1.4b
   `/index-atlas`).

4. **Concatenate** prompt + codebase inventory + reference context
   (if provided) → reason through the input → produce JSON output
   matching the schema:

   ```json
   {
     "adrs": [
       {
         "number": 1,
         "title": "<short noun-phrase title>",
         "symbols": ["<canonical symbol names>"],
         "severity_summary": "hard|soft|context",
         "markdown_body": "<full ADR markdown body>"
       }
     ]
   }
   ```

5. **Validate** JSON parses + each ADR has required fields. Drop
   malformed ADRs (log warning); don't fail the whole run.
6. **Write** each ADR to `docs/adr/ADR-NN-<title-slug>.md` using
   the Write tool. Number = entry's `number` field; slug derived
   from title.

## Reference-context handling

When the user provides reference context via `--reference-context
<path>` flag (CLI) or via skill argument / conversational context
(Skills surface):

- Walk the reference path with Scope γ' multi-format support (.md +
  .rst; 3 naming conventions; recursive depth-2) per v0.7 Step
  2.1.a substrate.
- Concatenate reference context contents into the prompt input
  (after the codebase inventory; before the trailing `---`).
- Token budget: reference context content is concatenated into
  prompt input verbatim per γ user-configurable scope approach.
  Soft warning emits if reference context exceeds 500k tokens
  (informational; generation proceeds). Claude Opus 4.7 supports
  1M context window; ~800k available for reference context after
  reserving for codebase inventory + prompt + ADR output. User
  controls authoritative-substrate boundary via
  `--reference-context <path>` flag scope (CLI) OR skill argument
  (Skills surface). Matches v0.7 user-configured-root philosophy
  per Step 2.1.a substantive framing.

## When to skip reference context

Reference context adds substantive value when user has thoughtful
existing architectural documentation in heterogeneous format
(Django DEPs, Confluence exports, internal wikis, RFC repos).
Reference context adds noise when source is sparse, inconsistent,
or already in canonical format.

When to skip reference context:

- User's existing documentation is already in ContextAtlas ADR
  format → no migration needed; pure codebase generation suffices.
- Codebase has no existing architectural documentation →
  cold-start path (this is the common case for early v1.0 cohort
  users).
- Reference context source is unreliable / known-stale → defer
  to code-only generation.

## Cost model

Claude Code session tokens (subscription-bounded). Reports
`cost_usd: 0.0` + `cost_model: "subscription-bounded"` in the
generation summary. No Anthropic API key required. Per ADR-02
v0.7 §Consequences cost-accounting-reflects-entry-point lock.

## Tool usage

This skill uses Claude Code session tools to perform generation:

- **Bash** for invoking `contextatlas show-generate-prompt` +
  listing files (find / ls for source + reference-context
  discovery)
- **Read** for source file content + reference-context content
- **Write** for ADR file persistence at `docs/adr/`

Bundled helper scripts deferred to v0.8+ per v0.7 ship scope.

## Failure modes

- **Source file unreadable**: log warning; skip; continue.
- **Reference-context path doesn't exist**: fail loudly with
  message; surface to user (they probably typoed the path).
- **Reference-context exceeds soft-warning threshold (500k
  tokens)**: emit informational warning; proceed with generation.
  Substantive message includes measured token count + available
  context window math + proceed-anyway framing. If actual API
  call exceeds 1M context window, Claude API returns error which
  ContextAtlas surfaces with remediation guidance (substantively
  unlikely at v0.7 soft-warning threshold + reasonable codebase
  scale; honest-scope-acknowledgment if encountered).
- **Malformed JSON output**: log warning with first 200 chars;
  retry once; then surface failure to user.
- **Schema validation failure on individual ADRs**: drop malformed
  (per-ADR granularity); preserve valid ADRs from same response.
- **Write failure to docs/adr/**: fail loudly per CLAUDE.md
  "actionable error messages" discipline.
- **`contextatlas show-generate-prompt` command not found**:
  contextatlas binary not on PATH. Tell user to install
  contextatlas globally (`npm install -g contextatlas`) or invoke
  skill from a directory where contextatlas is a dependency.
