---
name: index-atlas
description: Run ContextAtlas extraction inside Claude Code session (subscription-bounded; no Anthropic API key needed). Walks ADRs, docstrings, and commit messages from the configured repo and extracts architectural claims keyed to code symbols. Persists results to .contextatlas/index.db (SQLite) + atlas.json (committable artifact). This is the canonical Claude Code entry point per ADR-02 v0.7 amendment §Decision entry-point-determined cost model.
---

# index-atlas — ContextAtlas extraction via Claude Code session

## When to use this skill

You're running ContextAtlas extraction inside your Claude Code
session. User invoked you via `/index-atlas` slash command directly,
OR via contextatlas project context surfacing in their session.

This is THE canonical entry point for subscription-bounded
extraction. The `contextatlas` CLI binary uses Anthropic API
direct extraction (different cost model; not this skill's concern).
Per ADR-02 v0.7 amendment §Decision: extraction has two entry
points; each entry point uses the appropriate cost model for its
invocation context.

If user is asking how to extract atlas.json:
- They're working in Claude Code session right now → invoke this skill
- They want CLI / CI/CD / scripting workflow → tell them to use
  `contextatlas index` from terminal (uses Anthropic API direct;
  requires `ANTHROPIC_API_KEY` env var)

## What this skill does

For each source document the user wants indexed (ADRs at
`<repoRoot>/<config.adrs.path>`; optionally docstrings via the
adapter walker; optionally commit messages from git history per
config), this skill:

1. **Walks** source documents in the configured repo.
2. **Extracts** architectural claims from each document by running
   the canonical ContextAtlas extraction prompt against the
   document body. Load the canonical prompt via:

   `` !`contextatlas show-prompt` ``

   This invokes the contextatlas CLI subcommand that outputs the
   canonical EXTRACTION_PROMPT constant from
   `src/extraction/prompt.ts`. The CLI handles path resolution
   internally; works regardless of how user invoked contextatlas
   (installed dependency vs cloned source). Path-γ architectural
   pattern per v0.7 Step 1.4 design adjudication.

3. **Validates** the JSON claims structure against the schema
   (claims array; each claim has `symbol_candidates` + `claim` +
   `severity` + `rationale` + `excerpt`).
4. **Persists** validated claims to `.contextatlas/index.db`
   (SQLite) + `atlas.json` (committable artifact).

## How extraction works

The extraction prompt is canonical to ContextAtlas — DO NOT modify
it. ContextAtlas owns the prompt per ADR-02 §Decision permitted-
modules invariant; this skill consumes the prompt via the
`contextatlas show-prompt` CLI subcommand (Path-γ separation).

For each source document:

1. Read the document body (ADR/docstring/commit message text) using
   the Read tool.
2. Concatenate `EXTRACTION_PROMPT + documentBody + "\n---\n"`.
3. Reason through the document content; produce a JSON output
   matching the schema:

   ```json
   {
     "claims": [
       {
         "symbol_candidates": ["SymbolName1", "SymbolName2"],
         "claim": "Brief architectural claim about the symbol(s)",
         "severity": "hard|soft|context",
         "rationale": "Why this claim matters architecturally",
         "excerpt": "Direct quote from the source document"
       }
     ]
   }
   ```

4. Validate the JSON parses + each claim has all required fields.
   Drop malformed claims (log warning); don't fail the whole run.
5. Persist validated claims to atlas.json + .contextatlas/index.db
   using the Write tool.

## Cost model

Claude Code session tokens (subscription-bounded). Reports
`cost_usd: 0.0` + `cost_model: "subscription-bounded"` in the
extraction summary written to atlas.json metadata. No Anthropic
API key required. Per ADR-02 v0.7 §Consequences cost-accounting-
reflects-entry-point lock.

## Tool usage

This skill uses Claude Code session tools to perform extraction:

- **Bash** for invoking `contextatlas show-prompt` + listing files
  (find / ls for source document discovery)
- **Read** for source document content
- **Write** for atlas.json persistence + (optionally) sqlite db
  initialization

Bundled helper scripts deferred to v0.8+ per v0.7 ship scope; v0.7
ships SKILL.md + cli-show-prompt + ClaudeCodeOnlyExtractor stub
only. SKILL.md instructs Claude how to use Bash/Read/Write tools
to perform work without bundled helper scripts at v0.7.

## Failure modes

- **Source document missing**: log warning; skip the document; continue.
- **Malformed JSON output**: log warning with first 200 chars of
  output; skip the document; continue.
- **Schema validation failure**: drop malformed claims (per-claim
  granularity); log warning; preserve valid claims from same
  document.
- **Persistence write failure**: fail loudly per CLAUDE.md
  "actionable error messages" discipline; surface error to user.
- **`contextatlas show-prompt` command not found**: contextatlas
  binary not on PATH. Tell user to install contextatlas globally
  (`npm install -g contextatlas`) or invoke skill from a directory
  where contextatlas is a dependency.
