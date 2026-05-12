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

### Research-time / index-time extraction (two entry points; entry-point-determined cost model)

V0.7+ ContextAtlas graduates from research project to production tool
per launch-bearing reframe (Travis pivot at v0.6 Step 7.5). The
research-cycle SOLE-CALLER invariant (above) graduates to v0.7+
production-cycle entry-point-determined architecture.

Two extraction entry points coexist:

1. **Anthropic API direct path via CLI** (existing v0.6 behavior;
   preserved at v0.7 as canonical CLI behavior). The extraction
   pipeline (`src/extraction/`) and the v0.5 grading harness
   (`src/grading/`) are the only modules in the codebase permitted
   to import from `@anthropic-ai/sdk` or otherwise call the
   Anthropic API directly. Both are research-time / index-time
   only. Cost model: pay-per-use (Anthropic API direct billing).
   Invocation: `contextatlas index` CLI subcommand. Suitable for
   standalone CLI usage, CI/CD integration, scripting,
   non-Claude-Code workflows.

2. **Claude Code Skills path via slash command** (new at v0.7).
   `.claude/skills/index-atlas/SKILL.md` runs extraction inside a
   user's Claude Code session, consuming subscription-bounded
   session tokens rather than direct Anthropic API tokens. The
   Skills extraction path does NOT import from `@anthropic-ai/sdk`
   (executes within Claude Code session context via Bash + Edit +
   Read + Write tools); the existing permitted-modules invariant
   for `@anthropic-ai/sdk` imports is preserved. Cost model:
   subscription-bounded ($0 per-call; consumes Claude Code session
   tokens). Invocation: `/index-atlas` Claude Code slash command.
   Suitable for users actively working in Claude Code.

Both extraction paths are research-time / index-time mechanisms; both
honor the query-time invariant below.

### Entry-point-determined cost model (no config-field user-choice)

Extraction has two entry points; each entry point uses the
appropriate cost model for its invocation context:

1. **CLI invocation (`contextatlas index`)**: Anthropic API direct
   extraction. Pay-per-use cost model. Suitable for standalone CLI
   usage, CI/CD integration, scripting, non-Claude-Code workflows.
   Users with Anthropic API access OR teams preferring per-call
   billing semantics.

2. **Claude Code session invocation (`/index-atlas` slash command)**:
   subscription-bounded extraction inside Claude Code session
   context. Suitable for users actively working in Claude Code.
   Users with Claude Code subscriptions; no Anthropic API key
   required.

User chooses surface; surface determines cost model; no config-
field user-choice on a binary. The `architecture` config field at
`.contextatlas.yml` deprecated at v0.7+; field removed at v0.8+.
Legacy v0.6 configs with `architecture` field set continue parsing
cleanly with stderr deprecation warning emission per Q1.0.8 lock.

**Architectural rationale (CLI cannot bridge to Skills):** Skills
execute inside Claude Code session tools (Bash + Edit + Read +
Write); the `contextatlas` CLI binary is a separate sub-process
spawned by user OR by Claude Code as tool invocation. CLI cannot
directly invoke Skills running in Claude Code session. v0.6 + early
v0.7 design phases captured "user-choice between modes on config
field" framing; v0.7 Step 1.4b implementation surfaced the
architectural reality that the choice CLI claimed to offer wasn't
mechanically supported. Path-3 entry-point-determined model honors
this architectural reality (per substrate-evolution drift
discipline at Q-pre-4 framework).

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
entry-point-determined extraction architecture. Research-cycle
invariant artifacts (cost-priors snapshots; matrix-replication
substrate; quality-axis methodology documentation) preserved as
historical record per v0.5 + v0.6 + v0.7 inheritance discipline.

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
- Two extraction entry points coexist:
  - **CLI entry point** — `contextatlas index` invokes
    `src/extraction/` Anthropic API direct path; pay-per-use cost
    model; canonical CLI behavior; suitable for users with
    Anthropic API access OR teams preferring per-call billing
    semantics.
  - **Claude Code Skills entry point** — `/index-atlas` slash command
    invokes `.claude/skills/index-atlas/SKILL.md`; subscription-
    bounded cost model ($0 per-call; consumes session tokens);
    canonical Claude Code session behavior; suitable for users with
    Claude Code subscriptions.
- **Cost-accounting reflects entry point.** `cost_usd` field
  reports numeric Anthropic API cost ($0 for Skills entry point);
  `cost_model` field captures path semantics (`"api"` |
  `"subscription-bounded"`) as atlas.json metadata recording which
  entry point generated which extraction artifacts (per Q1.0.5 δ
  lock preservation).
- **User selects extraction surface by invocation context.**
  Anthropic API direct invocation via CLI (`contextatlas index`);
  Claude Code Skills invocation via `/index-atlas` slash command.
  Each surface uses the appropriate cost model for its context;
  no runtime path-selection on user config field. Legacy
  `architecture` config field accepted at v0.7+ with stderr
  deprecation warning emission per Q1.0.8 lock; field removed at
  v0.8+. Legacy `--cc-only` CLI flag accepted at v0.7+ as
  informational no-op with redirect message to `/index-atlas`
  skill; flag removed at v0.8+ per honest deprecation cycle.

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
  behavior verification at Step 1.2 surface. **PRESERVED AS
  HISTORICAL RECORD** per Q-pre-4 substrate-evolution drift
  framework Path C application; Step 1.4b Path-3 reframe below
  supersedes config-field user-choice framing captured here.
  Original Step 1.2 amendment captured: title reframe from
  "Extraction pipeline is the only Anthropic API caller in the
  codebase" to "Extraction is the sole research-time-extraction-
  caller in the codebase"; two research-time/index-time extraction
  paths permitted (Anthropic API direct + Claude Code Skills);
  query-time invariant preserved verbatim AND extended; research-
  cycle methodological rationale graduated to §Historical context
  section. Step 1.2 commit `bc30783`.

- **2026-05-10** — v0.7 Step 1.4b substantive architectural reframe
  per CLI-cannot-bridge-to-Skills architectural reality surfaced at
  Step 1.4b Cluster C Skills-invocation-mechanism design decision.
  Path-3 entry-point-determined model supersedes Step 1.2 config-
  field user-choice framing.

  Architectural reality: Skills execute inside Claude Code session
  tools (Bash/Edit/Read/Write); contextatlas CLI binary is separate
  sub-process; CLI cannot directly invoke Skills running in Claude
  Code session. Step 1.2 ADR-02 amendment captured 2-mode user-
  choice on config field; Step 1.4b surfaced that the choice CLI
  claims to offer isn't actually mechanically supported (CLI Mode
  A would have been redirect message either way).

  Path-3 reframe: extraction entry point determines cost model.
  CLI invocation = Anthropic API direct. Claude Code session
  invocation via /index-atlas skill = subscription-bounded. User
  chooses surface based on workflow; surface determines cost
  model.

  Substrate-evolution drift per Q-pre-4 framework Path C
  application: Step 1.2 ADR-02 amendment preserved as historical
  record of pre-Step-1.4b-discovery state; Step 1.4b amendment
  captures post-architectural-reality state. Honest scope-
  acknowledgment per discipline #4 — research-project-informed
  architectural assumptions surfaced inadequately during design
  phase; substrate verification at implementation phase corrected
  framing without catastrophic rework via early gate-substep
  discipline (Step 1.1 verification + Step 1.4b inline surface).

  Lock revisions at Step 1.4b:
  - **Q1.0.4 lock dropped** (no default needed; architecture field
    deprecated at v0.7+; field removed at v0.8+)
  - **Q1.0.8 lock revised** (`--cc-only` flag deprecated; no-op
    at v0.7+ with redirect warning; `--api-direct` flag dropped
    entirely at v0.7+; both flags removable at v0.8+)
  - **Q1.0.10 lock simplified** (single CLI-invoked extractor
    `AnthropicAPIDirectExtractor`; `ClaudeCodeOnlyExtractor`
    preserved as informational-stub for legacy config-field-value
    path + architecture field set scenarios; emits redirect message
    + zero-counts result per Q1.0.10 (b) sub-lock)
  - **Q1.0.5 lock preserved** (cost_model metadata field useful
    for atlas.json provenance; not runtime path-selection
    concern)

  Architecture config field deprecation cycle: field accepted at
  parser layer (preserves v0.6 user-config backward-compat);
  stderr deprecation warning emission on config-parse (3 warning
  variants per field value: anthropic-api-direct value, claude-
  code-only value, anthropic-api-claude-code legacy alias);
  field removed at v0.8+.

  v0.7 cycle pre-planning cross-references: STEP-PLAN-V0.7.md
  Step 1.4b commit `[this commit]` (Path-3 reframe +
  ClaudeCodeOnlyExtractor stub + cli-show-prompt subcommand +
  SKILL.md content + entry-point-determined architecture lock +
  4 Q-lock revisions); Step 1.2 commit `bc30783` (preserved as
  historical record of pre-Path-3 state); Step 1.4a commit
  `4df3740` (preserved as historical record of pre-Path-3
  mechanical wiring state; Q1.0.4 β-3 + Q1.0.8 3-flag wiring
  shipped at Step 1.4a now reverted/refactored at Step 1.4b).

  Cycle-execution observation 10 (NEW 10th recursive catch-
  pattern observation class): architectural framing benefits from
  substrate-verification-before-implementation-substep at EACH
  substep boundary, not just design-phase. Mid-substep
  architectural surprises (like CLI-can't-bridge-to-Skills)
  compound if not caught early via gate-substep discipline. v0.7
  cycle surfaced this pattern at 3 substep boundaries (Step 1.1
  gate-substep + Step 1.2 review + Step 1.4b implementation
  reality); each pivot caught pre-substantive-sunk-cost via
  Q-pre-4 substrate-evolution drift framework. Composes with v0.6
  7-class + v0.7 8-class (Travis-product-vision-clarification) +
  v0.7 9-class (Path-γ CLI subcommand) = 10-class recursive catch-
  pattern observation enumeration for v0.7+ ship-gate working-
  content-gap-inventory inheritance.

- **2026-05-11** — v0.7 Step 2.3.a substrate-consistency closure
  amendment: substantive Path-γ Read-tool refactor + Skill→LSP
  bridge per Travis Decision-3-α lock at Step 2.3 Checkpoint 2
  disposition surface. Covers BOTH Step 2.3.a.0 (Path-γ refactor)
  AND Step 2.3.a.1 (Approach D resolve-symbols bridge) in a single
  comprehensive amendment per Travis Lock 4.

  **Driver:** Step 2.3 Checkpoint 2 empirical verification at
  rich-skill/ Claude Code session surfaced 3 substantive
  divergences from canonical Skill workflow:
  1. FO-12: bash-injection prompt-load pattern requires
     `Bash(contextatlas:*)` allowlist + introduces first-run
     permission gate friction
  2. FO-13: Skill agent improvised Python-script-based atlas
     encoding instead of responding with JSON literal directly
     (substantively non-equivalent to canonical workflow)
  3. Substrate non-equivalence: Skill produced claims-only atlas
     (`symbols: []`, `claims[].symbol_ids: []`) because Claude
     Code Skills lack LSP tool access; CLI baseline atlas has
     full LSP-resolved symbol substrate

  Travis Decision-3-α framing: substantive substrate-consistency
  claim at v1.0 launch substantively requires ContextAtlas's
  onboarding substrate (ADRs + extractions + atlas) to be
  consistent across entry points. Substrate inconsistency
  substantively undermines launch-narrative claim of reliable
  architectural context. Elevated from v0.8+ candidate to v0.7
  launch-blocking scope.

  **§permitted-modules invariant extension:**

  Two new substrate categories permitted:
  - Build-time-generated prompt artifacts: `dist/extraction/
    prompt.md` + `dist/generation/prompt.md` (derived from canonical
    `src/extraction/prompt.ts:EXTRACTION_PROMPT` +
    `src/generation/prompt.ts:GENERATE_ADRS_PROMPT` via
    `scripts/generate-prompt-artifacts.mjs` at npm build time).
    Single-source-of-truth at .ts preserved; .md artifacts derived;
    init-time copy into user repo's `.contextatlas/prompts/`;
    Claude Code Skills consume via Read tool. Parity test
    (`src/extraction/prompt-artifact-parity.test.ts`) guards
    against silent build-script drift.
  - `contextatlas resolve-symbols` CLI subcommand
    (`src/extraction/cli-resolve-symbols.ts`): Skill→LSP bridge.
    Reads claims-only atlas; spawns LSP adapters; resolves raw
    symbol candidates via R8 name-form normalization
    (`src/extraction/resolver.ts:expandCandidateForms` +
    `resolveCandidatesWithNormalization`); writes enriched atlas
    atomically. Zero API cost (local LSP subprocess only).

  **§Decision entry-point-determined cost model extension:**

  Substantive distinction surfaced between two categories of bash
  invocation within Claude Code Skills:
  - **Avoidable static-content-load bash** (REMOVED at Step
    2.3.a.0): the prompt-load step using `` !`contextatlas
    show-prompt` `` and `` !`contextatlas show-generate-prompt` ``
    bash injection. Substantively replaceable by Read tool against
    a static .md artifact; substrate-consistency-friendly
    (deterministic content; survives Claude Code session
    permission gate without first-run friction). Replaced by
    Read-tool-against-`.contextatlas/prompts/*.md` pattern.
  - **Necessary subprocess-interaction bash** (ADDED at Step
    2.3.a.1): the end-of-Skill `contextatlas resolve-symbols`
    invocation. Substantively NOT replaceable by Read tool — LSP
    servers are inherently dynamic subprocesses; symbol-walk
    requires subprocess interaction; cannot be substituted by file
    reads. Bounded to single end-of-workflow invocation (not per-
    document); covered by existing `Bash(contextatlas:*)`
    allowlist; no expansion of permission gate surface.

  **§Consequences cost-accounting clarification:**

  Skill path tail-step `contextatlas resolve-symbols` is **zero
  API cost** (local LSP subprocess only; no Anthropic API call).
  Skill path cost-model substantively preserved: subscription
  tokens absorbed for extraction reasoning + zero for LSP
  resolution. Cohort cost-model framing at v1.0 launch documents
  unchanged from Path-3 entry-point-determined model.

  **Substantive substrate-consistency claim defended:**

  Post-Step-2.3.a substep cluster, both entry points produce
  atlases substantively equivalent at the substrate layer:
  - CLI path (`contextatlas index`): API-direct extraction +
    inline LSP resolution → full-fidelity atlas
  - Skill path (`/index-atlas` Claude Code Skill): subscription-
    bounded extraction + end-of-Skill `contextatlas
    resolve-symbols` bridge → full-fidelity atlas

  Both paths populate `symbols[]` via same LSP walk substrate;
  both paths populate `claims[].symbol_ids` via same resolver
  substrate (with R8 normalization specifically catching Skill-
  produced canonical file-path-symbol form + Python dotted
  notation observed at v0.7 Step 2.2.b cluster empirical surface).

  **Atlas schema v1.4 bump rationale:**

  Optional `claims[].symbol_candidates?: string[]` field added
  (atlas schema v1.4 per `src/storage/types.ts`). Populated by
  Skill-path extraction at write time; consumed by `contextatlas
  resolve-symbols` at LSP-resolution time; retained on persisted
  atlas as honest-scope-acknowledgment substrate for unresolved
  candidates (records what LLM extracted; what LSP could and
  could not resolve). Absent on CLI-path atlases (inline
  resolution; no transit state needed). Backward-compatible:
  earlier-version atlases import cleanly with the field absent
  per ATLAS_VERSION minor-bump precedent.

  **Cross-references:**
  - Step 2.3.a.0 commit (Path-γ refactor + prompt artifact
    substrate)
  - Step 2.3.a.1 commit (this amendment + resolve-symbols bridge)
  - CLAUDE.md frozen-prompt invariant scope clarification (v0.7
    Step 2.3.a.0 amendment): substrate value canonical; load
    mechanism evolves
  - `.claude/skills/index-atlas/SKILL.md` workflow steps 4-6:
    canonical schema v1.4 write + end-of-Skill resolve-symbols
    invocation with substantive bash-rationale framing
  - `.claude/skills/generate-adrs/SKILL.md` Read-tool prompt-load
    pattern

  Cycle-execution observation 11 (NEW): substantive product-
  judgment surface at empirical-evidence-warranting moment.
  Travis Decision-3-α at Step 2.3 Checkpoint 2 elevated this
  substep cluster from v0.8+ candidate to v0.7 launch-blocking
  scope per substantive cohort-substrate-consistency framing.
  Dev investigation surfaced Approach D bounded engineering path
  (~3-5 cycle days; reuses existing LSP adapter substrate);
  empirical implementation verified the bounded scope holds.
  Composes with 10-class enumeration → 11-class for v0.7+ ship-
  gate working-content-gap-inventory inheritance.

- **2026-05-11** — v0.7 Step 2.3.b.0 β-bounded mechanical-
  enforcement substrate amendment. Empirical re-verification at
  Step 2.3 Checkpoint 2/3 post-Step-2.3.a substep cluster
  surfaced that the SKILL.md text-tightening approach did NOT
  bind agent behavior across Claude Code sessions: agents
  continued invoking the deprecated `show-prompt` /
  `show-generate-prompt` CLI subcommands (Step 2.3.a.0 substrate
  unused) AND invented non-canonical atlas schemas (`"version":
  "1"`, `sources` nesting, custom `cost_usd` / `cost_model`
  top-level fields) AND skipped the mandatory `resolve-symbols`
  invocation entirely (Step 2.3.a.1 substrate unused). R4
  manifestation per LOCK 5 contingency framing — closer to
  Outcome C than Outcome B.

  **Driver:** Travis foundational substrate-consistency framing
  ("It's unacceptable for CLI and CC to have different
  foundationally even if a model doesn't give word for word 1:1
  atlas back between the two") substantively requires mechanical
  enforcement of canonical schema + workflow ordering at the
  CLI boundary, not text-only SKILL.md spec compliance hope.

  **Empirical insight:** SKILL.md is instructional substrate;
  agents read instructions; agents decide whether to follow
  them. Cross-session variance is substrate-evolution-stable.
  Mechanical enforcement at CLI exit codes substantively binds
  in ways text instructions do not.

  **§permitted-modules invariant extension:**

  Two changes:
  - **REMOVED** the deprecated `contextatlas show-prompt` +
    `contextatlas show-generate-prompt` CLI subcommands entirely.
    No backward-compat path. Skills load canonical prompts only
    via Read tool against `.contextatlas/prompts/*.md` artifacts
    (init-copied at Step 2.3.a.0). Empirical evidence: when the
    deprecated subcommand existed, agents chose it because Bash
    was familiar pattern; removal eliminates the alternative.
  - **ADDED** `contextatlas validate-atlas` CLI subcommand
    (`src/extraction/cli-validate-atlas.ts`). Parses
    `.contextatlas/atlas.json`; validates against canonical
    AtlasFileV1 schema (currently v1.4); structured remediation
    guidance to stderr on failure (exit 2); exit 0 on success.
    Specific failure modes cover empirical D4' divergences:
    version mismatch + missing/wrong generator + non-canonical
    sources nesting + missing top-level keys + invalid claim
    shape + non-canonical top-level fields (cost_usd, cost_model,
    repo, sources).

  **§Decision mandatory workflow gates extension:**

  `/index-atlas` Skill workflow now has three mandatory CLI gates
  (per SKILL.md "MANDATORY GATES" section):
  - **Step 5b validate-atlas gate**: after atlas.json write,
    Skill MUST invoke `contextatlas validate-atlas` and block on
    non-zero exit. Specific remediation in stderr → fix atlas →
    re-validate loop until exit 0.
  - **Step 6 resolve-symbols invocation**: MANDATORY (atlas is
    incomplete without LSP-resolved symbol IDs; downstream MCP
    query tools cannot operate).
  - **Step 7 doctor verification**: after resolve-symbols, Skill
    MUST invoke `contextatlas doctor` and verify
    `atlas.has_symbols` reports PASS before reporting workflow
    success.

  **Canonical schema embedded in SKILL.md:**

  `/index-atlas/SKILL.md` now embeds a complete realistic
  AtlasFileV1 v1.4 example with explicit schema invariants
  (top-level fields exact list; per-claim field requirements;
  severity enum constraints). Agents mimic by example rather
  than inferring from type-reference; concrete examples bind
  more reliably than abstract type references.

  **§Consequences cohort install path:**

  Cohort install path unchanged structurally at v1.0 (4 steps:
  npm install + Skills copy + allowlist + init); the
  `Bash(contextatlas:*)` allowlist substantively covers all
  three mandatory gate invocations. Cost model unchanged:
  subscription tokens for extraction reasoning + zero API for
  validate-atlas + resolve-symbols + doctor.

  **Substantive substrate-consistency claim defended via
  mechanical enforcement (not text-instructional hope):**

  Post-Step-2.3.b.0, the Skill path produces atlases that pass
  `contextatlas validate-atlas` (schema canonical) AND complete
  `contextatlas resolve-symbols` (symbols + symbol_ids populated)
  AND pass `contextatlas doctor` atlas.has_symbols check.
  Equivalent substrate to CLI extraction path at the feature
  layer; text content may vary (model-output variance) but
  schema + symbol resolution are mechanically guaranteed.

  **Escalation contingency preserved:**

  If empirical re-verification at rich-skill/ Claude Code session
  shows mandatory gates still substantively skipped despite hard
  removal of alternatives + mandatory framing, escalation path
  to β-full (Skill-as-MCP-orchestrator architecture; agent
  reasoning isolated; MCP tools enforce ordering by interface
  contract) at v0.7 per Travis Lock 3 — no wall-clock or cost
  ceiling per Travis Lock 2.

  **Cross-references:**
  - Step 2.3 Checkpoint 2/3 empirical evidence (R4
    manifestation; D4' atlas schema fidelity divergence)
  - Step 2.3.b.0 commit (this amendment + validate-atlas CLI
    + deprecated CLI removal + SKILL.md mandatory gates +
    canonical schema embed)
  - CLAUDE.md frozen-prompt invariant scope clarification
    (extended at this Step 2.3.b.0 amendment to cover removed
    show-prompt/show-generate-prompt + validate-atlas mandatory
    gate)
  - `.claude/skills/index-atlas/SKILL.md` "Canonical atlas
    schema (v1.4)" section + "MANDATORY GATES" section

  Cycle-execution observation 12 (NEW): substantive empirical
  evidence overruling text-only-tightening assumption at
  substep-cluster maturity. Step 2.3.a substep cluster
  substantively delivered engineering substrate (build artifacts
  + init copy + resolve-symbols bridge + ADR-02 amendment);
  Step 2.3 re-verification empirically refuted text-binding
  hypothesis; Step 2.3.b.0 substep added mechanical-enforcement
  layer that engineering text-instructions alone substantively
  could not provide. Pattern: substrate-evolution at cycle
  maturity benefits from empirical-evidence-driven iteration;
  text-tightening returns diminish; mechanical enforcement at
  CLI boundary is the load-bearing substrate. Composes with
  11-class enumeration → 12-class for v0.7+ ship-gate working-
  content-gap-inventory inheritance.

- **2026-05-12** — v0.7 Step 2.3.c.0 generation-side β-bounded
  amendment per Travis Lock 1 + refinement adjudications.
  Empirical Step 2.3 closure (commit `d9b6271`) confirmed
  extraction-side β-bounded binds (Outcome A); but Travis
  surfaced substantive product judgment that generated ADR
  depth/quality at the rich-skill empirical surface
  substantively under-shoots the canonical ContextAtlas/Hono
  ADR depth ceiling. Generation has no β-bounded equivalent at
  Step 2.3.b.0 close — text-only SKILL.md prompt-tightening
  is the same hope-pattern β-bounded extraction was a response
  to. Step 2.3.c.0 ships the generation-side mechanical-floor
  substrate.

  **Driver:** Travis foundational substrate-consistency framing
  ("ADRs are the backbone — atlas quality is bounded by ADR
  quality") + "single most important step" + "cost/wall-clock
  irrelevant; best model possible." The depth gap between
  hand-crafted (ContextAtlas ADR-12 ~600+ lines; Hono ADR-04
  ~250 lines with alternatives-considered enumeration + code
  snippets + named failure modes) and Skill-generated (~30-40
  lines) substantively undermines launch-narrative claim
  unless mechanically bounded.

  **§permitted-modules invariant extension:**

  Two changes:
  - **GENERATE_ADRS_PROMPT substantively refined** in 4
    dimensions: audience framing (senior-engineer-in-18-months
    discipline), investigative discipline (load-bearing file
    reads + line-number citations + code-pattern quoting +
    alternatives-considered enumeration), failure-mode
    discipline (named failure modes + review invariants in
    Consequences), calibration examples (inline good-vs-
    shallow contrast per section). Cold-codebase ceiling
    honest framing acknowledged (cold investigation can't
    recover original-author intent / cycle history /
    production-incident-driven decisions; aim for what cold-
    investigation CAN reach).
  - **ADDED** `contextatlas validate-adrs` CLI subcommand
    (`src/generation/cli-validate-adrs.ts`). Parses
    `docs/adr/*.md`; validates each ADR against canonical
    depth-floor invariants: frontmatter + canonical sections
    + ≥2 symbol-with-line-number citations + ≥2 substantive
    Context paragraphs + ≥2 distinct named alternatives with
    text content beyond bullet label (tightened per Travis lock
    — harder-to-game than keyword matching) + ≥1 fenced code
    block + ≥3 Rationale items + ≥3 Consequences items +
    600-line ceiling hard fail with split-suggestion
    remediation (per Travis lock — bundled-decision flag).

  **§Decision Skill workflow Phase A/B/C extension:**

  `/generate-adrs/SKILL.md` workflow restructured to three
  MANDATORY phases:
  - **Phase A** — investigative-depth-per-decision-candidate
    framing. Read load-bearing implementation files; note line
    numbers; track cross-file patterns; identify alternatives
    visible in code/commits. NO file-count floor (per Travis
    lock: file-count floor was unenforceable proxy; investigative
    discipline binds via Phase C output invariants instead).
  - **Phase B** — ADR writing using canonical prompt + Phase A
    investigation. Direct JSON response (no script
    improvisation per FO-13 absorbed at Step 2.3.b.0); each
    ADR follows canonical template with depth invariants.
  - **Phase C** — MANDATORY `contextatlas validate-adrs` gate.
    Non-zero exit triggers re-investigate + re-write + re-
    validate loop. Workflow blocks until all ADRs pass.

  **§Decision model+thinking enforcement:**

  Both `/index-atlas` + `/generate-adrs` SKILL.md frontmatter
  pinned to `model: claude-opus-4-7` + `effort: xhigh`.
  Claude Code Skills support model + effort frontmatter
  fields per https://code.claude.com/docs/en/skills.md;
  override binds for the Skill invocation regardless of user
  session model. `effort: xhigh` on Opus 4.7 activates
  adaptive reasoning that includes extended thinking. This
  mechanically eliminates cross-cohort variance from session-
  model inheritance.

  **§Consequences deliberate cost-narrative shift:**

  V0.6 cost-narrative ("~$0.50 cold-start; ~$1-3 with
  reference-context for generate-adrs") is superseded for v0.7
  launch. Expected cost: $5-15 per repo at v1.0 for
  `generate-adrs` (CLI path with extended thinking +
  investigative file reads). Deliberate quality-cost trade-off
  per Travis Lock 2 "no wall-clock or cost ceiling I am not
  willing to take." Skill path: subscription-bounded but
  substantively higher session-token consumption than v0.6
  cycle framing.

  Launch document substrate updated to frame generate-adrs as
  "one-time-per-repo investment in foundational ADR substrate
  that determines atlas quality" — NOT recurring cost.
  Subsequent `contextatlas index` runs reuse ADRs at fractional
  cost.

  **Substantive cohort substrate-consistency claim at v1.0:**

  Post-Step-2.3.c.0, CLI + Skill paths produce ADRs that pass
  `contextatlas validate-adrs` mechanical floor invariants —
  canonical depth substantively defended via mechanical
  enforcement at CLI boundary, not text-instructional hope.
  Text content varies (cold-investigation ceiling per honest-
  scope framing) but depth substantively raised vs Step 2.3.b
  baseline.

  **Cross-references:**
  - Step 2.3.c.0 commit (this amendment + GENERATE_ADRS_PROMPT
    4-dimension refinement + SKILL.md model+effort frontmatter
    pinning + validate-adrs CLI + SKILL.md Phase A/B/C
    workflow + CLAUDE.md cost-narrative deliberate-shift)
  - Step 2.4 calibration target (cold-investigation reachable
    success bar; NOT hand-crafted ceiling per honest framing)
  - claude-code-guide investigation outcome (frontmatter
    model + effort pinning is canonical Skill model-
    enforcement path; subprocess-spawn pattern is alternative
    for multi-phase model variance; not needed for this case)

  Cycle-execution observation 13 (NEW): Skill output depth is
  bounded by both prompt + workflow structure + mechanical
  enforcement layers — none alone is sufficient. Step 2.3.c.0
  ships all three concurrently rather than iteratively because
  empirical evidence at Step 2.3 + 2.3.b suggested each
  layer's absence substantively undermines depth quality.
  Composes with 12-class enumeration → 13-class for v0.7+
  ship-gate working-content-gap-inventory inheritance.

- **2026-05-12** — v0.7 Step 2.4.a CLI substrate-evolution
  amendment per Travis Lock 1 + Option β scope. Driver:
  Travis sidebar-surfaced CLI-vs-Skill substrate-equivalence
  audit question before Step 2.4 closure lock. Audit
  findings: refined `GENERATE_ADRS_PROMPT` (Step 2.3.c.0) +
  model pinning were already equivalent across both
  surfaces; extended thinking + auto-invoke validate-adrs
  gates were Skill-side only at Step 2.3.c.0 close. Step
  2.4.a brings CLI substrate to substrate-equivalent at the
  API-parameter + mechanical-floor-enforcement layers.

  **§Decision CLI substrate-equivalence extension:**

  Two CLI substrate-evolution changes:
  - **β-1 extended thinking enabled at CLI generation API
    call.** `src/generation/generators/anthropic-api-direct.ts`
    adds `thinking: { type: "enabled", budget_tokens:
    32_000 }` parameter to the `anthropic.messages.create`
    call. Closes API-parameter-equivalence with Skill
    `effort: xhigh` frontmatter pinning (per claude-code-
    guide investigation: xhigh on Opus 4.7 activates
    adaptive reasoning that includes extended thinking).
    SDK 0.27.3 type-cast workaround documented inline (cast
    to `Anthropic.Messages.MessageCreateParamsNonStreaming`
    bypasses excess-property check; runtime API forwards
    parameter unmodified; thinking blocks in response are
    naturally skipped by `extractTextFromResponse` consuming
    only `type === "text"` blocks). v0.8+ SDK upgrade to
    `^0.32.0` candidate retained for canonical typed surface.
  - **β-2 auto-invoke validate-adrs post-generation at CLI.**
    `src/generation/cli-runner.ts` imports
    `runValidateAdrsSubcommand` from `./cli-validate-adrs.js`
    and invokes post-`generator.generate()` with structured
    remediation on non-zero exit. Closes Skill-side-only
    MANDATORY Phase C gate gap. Refined stderr remediation
    template covers canonical CLI cohort paths forward
    (manually edit failing ADRs + re-validate OR remove
    docs/adr/ for fresh attempt). FO-11 status honestly
    acknowledged in template (no --overwrite flag at v0.7;
    v0.8+ candidate). Graceful-abort path preserved via
    `filesGenerated === 0` short-circuit to prevent
    confusing "no ADRs found" error when user declines
    cost confirmation.

  **§Decision architectural Phase A framing (Framing 1
  honest-scope-acknowledgment):**

  CLI and Skill paths post-Step-2.4.a produce ADRs that pass
  the same canonical depth-floor invariants via mechanical
  `validate-adrs` enforcement at both surfaces. Their
  reasoning regimes differ architecturally:

  - CLI single-shot: one Anthropic API call with extended
    thinking enabled (32k budget); model receives codebase
    inventory + optional reference context + prompt in one
    input. Investigation discipline bound by prompt text +
    validate-adrs canonical-depth-floor mechanical
    enforcement.
  - Skill multi-step: Claude Code Skill session can dispatch
    Phase A investigation via parallel Explore subagents
    before Phase B writing; depth empirically substantively
    higher (~370k input tokens of investigation observed at
    Step 2.4 re-verification). Investigation discipline
    bound by Skill workflow phases + validate-adrs Phase C
    gate.

  Both paths produce canonical-depth-floor-compliant ADRs.
  Investigation-depth-variance between paths is acknowledged
  as v0.8+ refinement candidate — CLI multi-call
  investigation orchestrator pattern would close the
  architectural gap; not substrate-blocking at v1.0 per
  validate-adrs mechanical floor at both surfaces.

  **§Consequences post-Step-2.4.a substrate-equivalence
  matrix:**

  | Substrate layer | Skill | CLI | Status |
  |---|---|---|---|
  | Refined `GENERATE_ADRS_PROMPT` | Via Read tool | Via direct import | EQUIVALENT |
  | Model pinning | `model: claude-opus-4-7` frontmatter | `GENERATION_MODEL` constant | EQUIVALENT |
  | Extended thinking | `effort: xhigh` frontmatter | `thinking: { type: "enabled", budget_tokens: 32_000 }` (β-1) | EQUIVALENT |
  | validate-adrs gate | MANDATORY Phase C | Auto-invoked post-generation (β-2) | EQUIVALENT |
  | Multi-step investigation workflow | Parallel Explore subagents possible | Single-shot API call | ARCHITECTURAL DIFFERENCE (acknowledged) |

  **§Consequences β-3 empirical CLI cost measurement
  deferral:**

  Step 2.4.b β-3 empirical CLI cost+depth measurement at
  refined Step 2.3.c.0 substrate deferred to v0.8+ post-
  launch per Travis Lock 1 Path B disposition. Launch
  documents at v1.0 frame cost inferentially as "expected
  $5-15 per repo; empirical lock at v0.8+ post-launch."
  Honest-scope-acknowledgment preserves cycle integrity
  without launch-narrative claim drift; β-1 + β-2 closed
  the substantive substrate-equivalence gaps at API-
  parameter + mechanical-enforcement layers.

  **§Consequences test substrate additions:**

  `src/generation/cli-runner.ts` adds `generatorOverride?:
  Generator` test seam (parallel pattern to extraction
  cli-runner's `clientOverride`); enables substantive
  isolated testing of β-2 paths without real Anthropic API
  calls. 7 new tests cover β-1 source content assertions +
  β-2 end-to-end paths (PASS / FAIL / setup-error) via
  generatorOverride.

  **Cross-references:**
  - Step 2.4.a commit (this amendment + β-1 + β-2
    engineering)
  - Step 2.3.c.0 commit `6125d44` (refined prompt +
    SKILL.md frontmatter pinning + validate-adrs CLI +
    Phase A/B/C workflow)
  - Step 2.4 closure commit (β-4 documentation +
    architectural Framing 1 honest-scope-acknowledgment +
    4-cohort-entry-surface matrix empirical defense)

  Cycle-execution observation 14 (NEW): substrate-evolution
  audit-before-closure discipline. Travis compare-surfaces-
  before-locking pattern surfaced bounded CLI-vs-Skill gaps
  before Step 2.4 closure lock; Option β absorption added
  ~90 LOC + 7 tests within Step 2.4 substep cluster;
  substantive substrate-equivalence claim defended without
  launch-narrative claim drift. Composes with 13-class
  enumeration → 14-class for v0.7+ ship-gate working-
  content-gap-inventory inheritance.
