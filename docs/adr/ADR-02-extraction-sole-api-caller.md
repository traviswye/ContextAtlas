---
id: ADR-02
title: Extraction is the sole research-time-extraction-caller in the codebase
status: accepted
severity: hard
symbols:
  - ExtractionPipeline
  - LanguageAdapter
---

# ADR-02: Extraction is the sole research-time-extraction-caller in the codebase

## Context

ContextAtlas's value proposition rests on a clean separation: expensive
reasoning happens at index time, cheap lookups happen at query time. If
query-time code paths start making expensive model calls — for
"smart disambiguation," for "summarizing long bundles," for any reason —
the performance and cost characteristics fundamentally change. Queries
stop being sub-100ms. Costs stop being predictable. The architecture
silently becomes something else.

This is a load-bearing invariant. It must be enforced, not just
intended.

## Historical context (v0.1-v0.6 research-cycle SOLE-CALLER invariant)

V0.1 through v0.6 ran ContextAtlas as a research project under a
SOLE-CALLER invariant: extraction was the only Anthropic API caller
in the codebase (extended at v0.5 to include grading per the v0.5
Step 2.0 amendment below). The invariant served research-cycle
methodology, not production-tool architecture:

- **Cost-attribution clarity for research methodology.** Extraction
  was the only cost driver; everything else (LSP queries, storage,
  git integration) was free. Per-cycle cost reconstruction was
  clean — `cumulative cycle spend = extraction spend`. v0.1-v0.6
  ship gates documented platform-billed reconstructed spend
  against this clean attribution.
- **Reproducibility for substrate-generation thesis.** Locked
  extraction prompt (`src/extraction/prompt.ts` per ADR-02
  permitted-modules); locked failure modes; controlled token
  budgets. Quality-axis methodology + matrix-replication subsets
  + statistical rigor work all built on this reproducibility
  substrate.
- **Cost-projection-vs-platform-billing 3x-reduction invariant.**
  Q5 lock at v0.4 cycle established the systematic ~3x reduction
  pattern (script-reported full-token API pricing vs platform-
  billed prompt-cache-discount actuals). Single-caller scope made
  the invariant cleanly measurable + verifiable across cycles.
- **Quality-axis methodology cleanly-scoped substrate.** v0.5
  Phase-9 reference doc + paired-t cross-cell rollup methodology
  + ADR-19 LLM-judge methodology all consumed extraction-scoped
  substrate. Single-caller invariant kept methodology surface
  area minimal.

The research-cycle SOLE-CALLER invariant served research-cycle
methodology; it was NOT a production-tool architectural commitment.
v0.7 launch-bearing cycle graduates this invariant: see §Decision
below.

## Decision

### Research-time / index-time extraction (two substantive paths; user-choice configuration)

V0.7+ ContextAtlas graduates from research project to production tool
per launch-bearing reframe (Travis pivot at v0.6 Step 7.5). The
research-cycle SOLE-CALLER invariant (above) graduates to v0.7+
production-cycle user-choice configuration.

Two substantive extraction paths now coexist:

1. **Anthropic API direct path** (existing v0.6 behavior; renamed at
   v0.7 for naming clarity). The extraction pipeline (`src/extraction/`)
   and the v0.5 grading harness (`src/grading/`) are the only modules
   in the codebase permitted to import from `@anthropic-ai/sdk` or
   otherwise call the Anthropic API directly. Both are research-time /
   index-time only. Cost model: pay-per-use (Anthropic API direct
   billing). Standalone CLI; Anthropic API key required.

2. **Claude Code Skills path** (new at v0.7). `.claude/skills/index-
   atlas/SKILL.md` runs extraction inside a user's Claude Code session,
   consuming subscription-bounded session tokens rather than direct
   Anthropic API tokens. The Skills extraction path does NOT import
   from `@anthropic-ai/sdk` (executes within Claude Code session
   context via Bash + Edit + Read + Write tools); the existing
   permitted-modules invariant for `@anthropic-ai/sdk` imports is
   preserved. Cost model: subscription-bounded ($0 per-call;
   consumes Claude Code session tokens). Extraction 100% contained
   to Claude Code session; no Anthropic API key required.

Both extraction paths are research-time / index-time mechanisms; both
honor the query-time invariant below.

### User-choice configuration

Three config values accepted at v0.7+; two substantive runtime modes
+ one legacy deprecated alias:

- **`architecture: "claude-code-only"`** → Claude Code Skills path
  (Mode A; subscription-bounded; new at v0.7; extraction 100%
  contained to Claude Code session; no Anthropic API key required).
- **`architecture: "anthropic-api-direct"`** → Anthropic API direct
  path (Mode B substantive name; preserves v0.1-v0.6 extraction
  behavior; renamed at v0.7 for naming clarity; pay-per-use cost
  model; standalone CLI; Anthropic API key required).
- **`architecture: "anthropic-api-claude-code"`** → deprecated legacy
  alias for `"anthropic-api-direct"` (backward-compat for v0.6 users
  with config files using legacy name; stderr deprecation warning
  emitted on config-parse: `"anthropic-api-claude-code is deprecated
  alias for anthropic-api-direct; will be removed at v0.8+; please
  update .contextatlas.yml"`; alias removed at v0.8+ per honest
  deprecation cycle).

Default at v0.7+: `claude-code-only` (Mode A; per v0.7 cycle Q1.0.4
β-3 hybrid lock; absent-means-default; init writes explicit-default).

CLI flag overrides preserve user-choice at runtime:
- `--cc-only` forces Mode A (claude-code-only)
- `--api-direct` forces Mode B (anthropic-api-direct)
- flag-absence selects default per config OR claude-code-only if no
  config (β-3 absent-means-default)

Users may choose based on:

- **Cost framing preference.** Subscription-bounded (Mode A; flat-
  rate) vs explicit per-call (Mode B; pay-per-use semantics).
- **Workflow integration.** Claude Code session integration (Mode A)
  vs standalone CLI (Mode B).
- **Rate limit envelope preferences.** Different rate-limit headroom
  considerations under each cost model.
- **Anthropic API availability / account configuration.** Users
  without direct Anthropic API access can use Mode A; users with API
  access can choose either mode.

ContextAtlas suggests defaults (Mode A claude-code-only at v0.7+),
but path selection ultimately remains user configuration. The system
supports user-choice; it does NOT enforce research-methodological
invariant on production users.

### Query-time invariant (load-bearing; preserved verbatim AND extended)

Query-time code paths — MCP tool handlers, language adapters, storage
layer, git integration, config parsing — MUST NOT call the Anthropic
API under any circumstances.

Language adapters MUST NOT call the Anthropic API. They are local
tooling wrappers (tsserver, Pyright); introducing model calls into the
adapter layer would violate the query-time invariant.

**Extended at v0.7+:** Query-time code paths MUST NOT invoke Claude
Code Skills, slash commands, or any other model-execution mechanism
either. Query-time stays local-only: SQLite lookups + LSP calls +
filesystem reads. The Skills path is research-time / index-time only,
matching the API direct path's scope.

## Rationale

### Query-time invariant rationale (load-bearing for production tool)

The query-time invariant remains load-bearing at v0.7+ production
launch and beyond:

- **Sub-100ms latency for interactive use.** Model calls add seconds;
  ContextAtlas's value prop on "instant context lookup" depends on
  zero model calls at query time.
- **Zero query cost for predictable user cost story.** Query-time
  model calls (whether API or Skills) cost user money/tokens; "pay
  once at index time" is the architectural promise.
- **Architectural promise: pay once at index time.** Both extraction
  paths honor this promise; query-time stays free regardless of
  selected extraction path.

### Research-cycle SOLE-CALLER rationale (graduates to historical context)

The original SOLE-CALLER rationale served research-cycle methodology:
cost-attribution clarity, reproducibility for substrate generation,
3x-reduction invariant for cost-projection methodology, quality-axis
methodology cleanly-scoped substrate. See §Historical context above
for full enumeration. These concerns DO NOT translate to production-
tool user choice; they served research methodology that v0.1-v0.6
shipped against.

The graduation rationale: research-cycle methodological invariant
informed v0.1-v0.6 ship gates; v0.7+ production-cycle ship gates
inherit the load-bearing query-time invariant + production-tool
user-choice configuration. Research-cycle invariant artifacts (cost-
priors snapshots; matrix-replication substrate; quality-axis methodology
documentation) preserved as historical record per v0.5 + v0.6 + v0.7
inheritance discipline.

## Consequences

- Features that would naturally want a model call at query time
  ("disambiguate these three candidates," "summarize this long claim")
  must be handled differently:
  - Move the work to index time (pre-compute and store)
  - Fall back to deterministic heuristics (pick first, truncate, etc.)
  - Expose the ambiguity to the caller and let Claude decide
- This rule can be enforced mechanically:
  - A grep for imports of `@anthropic-ai/sdk` outside `src/extraction/`
    and `src/grading/` should return zero matches. CI may enforce this.
  - The Claude Code Skills path for extraction lives at
    `.claude/skills/index-atlas/`; query-time modules MUST NOT
    invoke this skill (or any equivalent skill mechanism). Skills-
    path query-time-prohibition is documented at v0.7 ship; CI
    mechanical enforcement of the Skills-path-prohibition deferred
    to v0.8+ if needed.
- Two substantive research-time / index-time extraction paths coexist:
  - **Mode A — Claude Code Skills path** —
    `.claude/skills/index-atlas/SKILL.md` runs extraction inside
    Claude Code session context; subscription-bounded cost model
    ($0 per-call; consumes session tokens); suitable for users with
    Claude Code subscriptions who prefer flat-rate cost framing.
  - **Mode B — Anthropic API direct path** — `src/extraction/` calls
    `@anthropic-ai/sdk` for Opus 4.7 model invocation; pay-per-use
    cost model; suitable for users with Anthropic API access OR
    teams who prefer per-call billing semantics.
- **Cost-accounting reflects path-selection.** `cost_usd` field
  reports numeric Anthropic API cost ($0 for Mode A); `cost_model`
  field captures path semantics (`"api"` | `"subscription-bounded"`)
  per separate-field discipline (Q1.0.5 δ lock).
- **User-choice supported architecturally.** Users select extraction
  path via `.contextatlas.yml` `architecture` field (3 accepted
  values: `"claude-code-only"`, `"anthropic-api-direct"`, or legacy
  `"anthropic-api-claude-code"` deprecated alias) OR CLI flags
  (`--cc-only` forces Mode A; `--api-direct` forces Mode B). Two
  substantive runtime modes (Mode A Skills path + Mode B API direct
  path); legacy `"anthropic-api-claude-code"` config value preserved
  as deprecated alias for `"anthropic-api-direct"` to honor v0.6
  user backward-compat; alias removed at v0.8+ per Q1.0.8 honest
  deprecation cycle. Defaults at v0.7+ favor Mode A claude-code-only
  per Q1.0.4 β-3 hybrid lock (claude-code-only default; absent-means-
  default; init writes explicit-default).

## Revision history

- **2026-04-30** — v0.5 Step 2.0 amendment: extended permitted-modules
  list to include `src/grading/` for v0.5 LLM-judge harness work.
  Trigger: ADR-19 §2 + STEP-PLAN-V0.5 Step 2 surfaced ADR-02 boundary
  at design-proposal time per investigation-first discipline. Load-
  bearing invariant unchanged (query-time vs research-time / index-
  time separation; sub-100ms queries; zero query cost preserved);
  permitted-modules list expanded by one to reflect the invariant's
  research-time application. CI enforcement grep pattern updated
  correspondingly.

- **2026-05-09** — v0.7 Step 1.2 amendment: substantive graduation
  reframe per v0.7 launch-bearing cycle (Travis pivot at v0.6 Step
  7.5) + Path (iii) 2-mode collapse lock per v0.6 actual extraction
  behavior verification at Step 1.2 surface. v0.1-v0.6 research-
  cycle SOLE-CALLER invariant graduates to v0.7+ production-cycle
  user-choice configuration. Title reframed from "Extraction
  pipeline is the only Anthropic API caller in the codebase" to
  "Extraction is the sole research-time-extraction-caller in the
  codebase".

  V0.6 actual extraction behavior verification at Step 1.2 surface
  revealed v0.6 ships `architecture` field as config-stub-only;
  pipeline doesn't branch on field value; both
  `"anthropic-api-claude-code"` and `"claude-code-only"` produced
  identical Anthropic API direct extraction at v0.6. The
  `"claude-code"` suffix in v0.6 `"anthropic-api-claude-code"`
  name referred to user invocation environment (user runs
  contextatlas FROM Claude Code session) NOT extraction
  architecture.

  Path (iii) collapse-to-2-substantive-modes locked at v0.7 ship:
  Mode A `"claude-code-only"` (Skills mechanism; new at v0.7;
  canonical location `.claude/skills/index-atlas/SKILL.md`) +
  Mode B `"anthropic-api-direct"` (preserves v0.6 actual extraction
  behavior; renamed at v0.7 for naming clarity); legacy
  `"anthropic-api-claude-code"` preserved as deprecated alias for
  `"anthropic-api-direct"` with stderr warning emission; alias
  removed at v0.8+ per honest deprecation cycle. Backward-compat:
  v0.6 user configs with legacy name continue working at v0.7
  with warning; behavior unchanged.

  Path selection at user discretion per Q1.0.4 β-3 default
  (claude-code-only at v0.7+; absent-means-default; init writes
  explicit-default) + Q1.0.8 3-flag user-choice (`--cc-only`
  forces Mode A; `--api-direct` forces Mode B; flag-absence
  selects default). Query-time invariant preserved verbatim AND
  extended (query-time MUST NOT invoke Skills mechanism either).
  Cost model accounting per Q1.0.5 δ separate cost_model field
  (`"api"` | `"subscription-bounded"`). CI enforcement grep
  pattern unchanged (Skills path doesn't add `@anthropic-ai/sdk`
  imports; permitted-modules invariant preserved).

  Research-cycle methodological rationale (cost-attribution
  clarity + reproducibility for substrate generation +
  3x-reduction invariant + quality-axis methodology cleanly-
  scoped substrate) graduates to §Historical context section;
  production-cycle invariants (query-time-no-API-calls; sub-
  100ms; zero query cost; user-choice path selection) remain
  load-bearing.

  v0.7 cycle pre-planning cross-references: v0.7-SCOPE.md commit
  `a6d2594` (PRIMARY scope framing); STEP-PLAN-V0.7.md Step 1.0
  commit `5ad0f2e` (Q1.0.1-Q1.0.12 design adjudications); STEP-
  PLAN-V0.7.md Step 1.1 commit `dc81f49` (Q1.0.2 α Skills
  architecture verification cleared); v0.6 cycle Step 4.2 commit
  `f14cb04` (B13-flag stub substrate); v0.5 Step 2.0 amendment
  commit `aeaa5e0` (preceding revision history precedent).
