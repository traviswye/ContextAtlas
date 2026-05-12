---
name: prime-atlas
description: Prime your Claude Code session with ContextAtlas tools substrate
  at the start of each session in a ContextAtlas-configured repo. Verifies
  the MCP connection by probing the atlas + introduces the three MCP tools
  (get_symbol_context, find_by_intent, impact_of_change) with when-to-use
  guidance. Run this once per session before architectural work that would
  benefit from ContextAtlas's fused symbol + ADR + git + tests bundles per
  ADR-02 query-time-no-API-calls invariant.
model: claude-opus-4-7
effort: xhigh
---

# prime-atlas — Per-session ContextAtlas priming + MCP verification

## When to use this skill

You're starting a Claude Code session in a ContextAtlas-configured
repo. User invoked you via `/prime-atlas` slash command at session
open, OR via contextatlas project context surfacing in their session.

This is THE canonical per-session entry point. Run once per session
before architectural work. Pattern: cohort users run `contextatlas
init` once per repo (substantive scaffold) + `/index-atlas` to build
the atlas substrate + `/prime-atlas` at the start of each session
post-init to verify the MCP connection + prime the session with
when-to-use guidance for the three ContextAtlas MCP tools.

If user is asking how to use ContextAtlas tools in this session:
- They want to verify setup is working + want introduction to the
  tools → invoke this skill
- They want to extract atlas.json (first-time setup or refresh after
  ADR/code changes) → tell them to run `/index-atlas` first
- They want to generate ADRs (new repo without ADRs) → tell them to
  run `/generate-adrs` first

## What this skill does

1. **Loads** the atlas substrate via Read tool against:

   `.contextatlas/atlas.json` (relative to cwd)

   This file is produced by `contextatlas index` (CLI) or
   `/index-atlas` (Skill) — the substantive ContextAtlas substrate.
   If the file is absent → instruct user to run `contextatlas init`
   then `/index-atlas` first, and exit this skill (do NOT proceed to
   probe step).

2. **Validates** the atlas substrate shape:
   - JSON parses successfully
   - Top-level `symbols` array exists AND has ≥1 entry
   - If `symbols` array is empty → atlas built but empty; instruct
     user to run `/index-atlas` to populate, and exit.

3. **Verifies `.mcp.json`** via Read tool against:

   `.mcp.json` (at repo root)

   Verify the file exists + contains a `mcpServers.contextatlas`
   entry. If absent OR missing the contextatlas entry → instruct
   user to run `contextatlas init` (which idempotently upserts the
   entry per the canonical mcp-registration substrate), and exit.

4. **Probes** the MCP connection by invoking the `get_symbol_context`
   MCP tool with `symbol` = the first entry's `id` field from the
   loaded atlas's `symbols[]` array (sentinel symbol; deterministic
   + atlas-content-agnostic per v0.8 LOCK B.2 substrate).

   Interpret the probe outcome per the failure-modes matrix below.

5. **Surfaces** the tools-introduction prompt to the user when the
   probe succeeds — substantive when-to-use guidance for the three
   ContextAtlas MCP tools. See "Tools introduction" section below
   for the canonical content.

6. **Reports** session-ready confirmation + suggests next steps based
   on the kind of architectural work the user is about to do.

## Failure modes

| Probe outcome | Surface to user | Suggested remediation |
|---|---|---|
| Tool call succeeds + returns symbol bundle | ✓ MCP connected; atlas substrate aligned | Session ready; surface tools-introduction prompt + report success |
| Tool not found / "unknown tool" error | ✗ MCP server not connected | Instruct user to verify `.mcp.json` contains `contextatlas` server entry + restart Claude Code (MCP config loads at session start) |
| Tool returns ERR not_found for sentinel symbol | ⚠ MCP connected but atlas substrate stale | Suggest `/index-atlas` refresh; substrate may not reflect current code/ADR state |
| Atlas.json missing | ✗ Substrate not built | Instruct user: run `contextatlas init` + `/index-atlas` (or `contextatlas index` CLI) first |
| Atlas.json present but `symbols` array empty | ⚠ Atlas built but no symbols indexed | Suggest `/index-atlas` re-run; substrate empty (possibly extraction did not complete) |
| Atlas.json malformed JSON | ✗ Substrate corrupt | Suggest fresh `/index-atlas` (or `contextatlas index --full`) to rebuild substrate |
| `.mcp.json` missing | ✗ MCP registration missing | Instruct user: run `contextatlas init` (idempotently upserts the `mcpServers.contextatlas` entry per canonical mcp-registration substrate) |

In every failure mode, exit the skill cleanly after reporting the
remediation — do NOT proceed to the probe step on substrate failures
(atlas missing/empty/malformed; .mcp.json missing). The session
substantively cannot be primed until the underlying substrate state
is corrected.

## Tools introduction

When the probe succeeds, surface this substantive when-to-use guidance
to the user (paraphrased to the user's question/context if they
substantively asked something specific; otherwise present as canonical
introduction):

### Three MCP tools for ContextAtlas-aware development

**`get_symbol_context(symbol)`** — symbol-centric bundle. Returns
everything keyed to a known symbol in one call: LSP definition +
references + types + diagnostics; architectural claims from ADRs
+ docstrings + commit messages (with severity + rationale +
excerpts); recent git commits touching the symbol; tests
referencing the symbol. Use when you know the symbol you want
context for ("OrderProcessor", "renderTemplate", "AuthMiddleware").

**`find_by_intent(query)`** — FTS5+BM25 search across claim text +
rationale + excerpt. Returns ranked symbols by what they do, not
by what they're named. Use when you want to find symbols by
intent ("authentication middleware", "retry policy", "idempotency
constraints") without knowing names. Composite usage: `find_by_intent`
surfaces candidates → `get_symbol_context` for details on the top
match.

**`impact_of_change(symbol)`** — blast-radius analysis. Returns
the symbol's downstream consumers (callers, importers, test
references) with their relationships, scaled to inform "if I
change X, what should I verify?" Use when planning a refactor or
proposing a breaking change to a symbol.

### When to use ContextAtlas vs primitive tools

ContextAtlas tools FIRST when the question is architectural:
- "Why does X have to be Y?" → get_symbol_context returns ADR
  claims explaining
- "What pattern handles authentication?" → find_by_intent surfaces
  the relevant symbols
- "What breaks if I change this?" → impact_of_change shows the
  blast radius

Primitive Grep + read patterns FIRST when the question is
character-level:
- "Find every usage of string 'foo'" → Grep is correct
- "Read this specific file" → Read tool is correct
- "What's the literal source at line 42?" → Read tool is correct

Composite usage substantively the substantive cohort UX pattern:
ContextAtlas tools for architectural framing → primitive tools for
character-level verification of specific changes.

### Cohort UX awareness

**Atlas-version awareness.** The atlas reflects the code + ADR
state at extraction time, not necessarily current. After
substantive ADR or code changes, refresh via `/index-atlas` (Skill)
or `contextatlas index` (CLI). SHA-diff incremental refresh per
ADR-12 substrate is substantively cheap (~$0.20-1 per refresh for
typical incremental changes).

**Compact vs JSON format.** `get_symbol_context` returns compact
format by default (token-dense for LLM consumption per ADR-04);
pass `format: "json"` for structured tool-use parsing. find_by_intent
+ impact_of_change use compact format only.

**Query-time-no-API-calls invariant.** Per ADR-02, all three tools
are deterministic substrate lookups — no Anthropic API calls at
query time. Cost is bounded; latency is fast; results are
reproducible across cohort users with the same atlas substrate.

### Edge cases + boundaries

- **Unknown symbol** → `get_symbol_context` returns `ERR not_found`.
  Don't retry blindly; verify the symbol exists (use find_by_intent
  if you know what it does but not its name).
- **FTS5 query patterns** for find_by_intent: quoted phrases for
  exact match ("\"order processing\""); AND/OR operators for
  combination ("auth AND retry"); BM25 ranking handles relevance.
- **Atlas refresh after ADR/code changes** is cohort responsibility
  per cohort UX pattern. /prime-atlas verifies the substrate is
  present + reachable; it does NOT verify substrate currency vs
  current code state.

## Tool usage

This skill uses the following tools:

- **Read** — to load `.contextatlas/atlas.json` + `.mcp.json` at
  workflow steps 1 + 3. Do NOT use Bash + cat or other indirection;
  Read tool is the canonical substrate access pattern.
- **MCP tool: `get_symbol_context`** — to probe MCP connection at
  workflow step 4. The sentinel symbol's `id` field from the
  loaded atlas's `symbols[]` array is the probe argument.

Do NOT use Bash for any step of this workflow. Do NOT modify the
atlas or `.mcp.json` from within this skill — /prime-atlas is a
read-only verification + priming workflow. Substrate modifications
substantively belong at `/index-atlas` (Skill) or `contextatlas init`
(CLI) per established canonical write surfaces.

## Cross-references

- [`ADR-02`](docs/adr/ADR-02-extraction-sole-api-caller.md) —
  extraction substrate + query-time-no-API-calls invariant
- [`ADR-04`](docs/adr/ADR-04-compact-output-format.md) — compact
  output format substrate for LLM-dense token consumption
- [`ADR-09`](docs/adr/ADR-09-find-by-intent.md) — find_by_intent
  FTS5+BM25 substrate
- [`ADR-12`](docs/adr/ADR-12-sha-diff-incremental-reindex.md) —
  SHA-diff incremental refresh substrate
- [`/index-atlas`](.claude/skills/index-atlas/SKILL.md) — atlas
  substrate extraction via Claude Code session (subscription-
  bounded)
- [`/generate-adrs`](.claude/skills/generate-adrs/SKILL.md) — ADR
  generation for repos lacking architectural decisions substrate
- [`README.md`](README.md) — cohort entry paths + install/setup
  + ContextAtlas overview
- [`CLAUDE.md`](CLAUDE.md) — project working-instructions + Current
  Version + cohort UX framing
