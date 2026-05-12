# CLAUDE.md

Instructions for Claude Code working on the ContextAtlas project.

---

## What This Project Is

ContextAtlas is an MCP server that gives Claude Code a curated atlas of a
user's codebase — fusing LSP-grade structural precision with architectural
intent from ADRs, docs, and git history, delivered in single-call context
bundles.

Read `DESIGN.md` for the full architecture. Read `RUBRIC.md` for benchmark
methodology. Read `README.md` for the public-facing positioning.

## Critical Constraints

These are decisions already made. Do not relitigate them.

- **Language:** TypeScript (Node 20+). No Python or Go in the server code
  itself — those are supported as *target languages* via language adapters,
  not as implementation languages.
- **Dependencies:** Minimize. Required: `@modelcontextprotocol/sdk`,
  `@anthropic-ai/sdk`, `better-sqlite3`, a YAML parser, a glob library.
  Do not add state management libraries, ORMs, or HTTP frameworks.
- **`typescript-language-server` placement:** User-provided, not a
  bundled dependency. The TS adapter spawns it as a subprocess, but the
  binary itself is expected to be on the user's PATH or pointed to via
  config. This keeps the package lean and lets users choose their tsserver
  version. `package.json` lists it as a `peerDependency` — do not
  promote to a direct dependency.
- **LSP client strategy:** Raw JSON-RPC over stdio. No
  `vscode-languageclient` / `vscode-jsonrpc` dependency. The LSP
  subset we need (initialize, documentSymbol, references, diagnostics,
  shutdown) is ~150 lines of framing and fits comfortably in
  `src/adapters/lsp-client.ts` without pulling VS Code's client
  machinery. Rationale: dependency minimization per the constraint
  above, and cleaner control over subprocess lifecycle.
- **Storage:** SQLite via `better-sqlite3`. Single file. No Postgres, no
  Redis, no external services.
- **MCP SDK:** `@modelcontextprotocol/sdk`. Follow their patterns.
- **Output format:** Compact text by default, JSON available via input
  parameter. Compact format is defined in DESIGN.md.
- **Symbol ID format:** `sym:<lang-short-code>:<path>:<name>` (see
  ADR-01). Line numbers are NOT part of the ID — they live as a field
  on the Symbol record. Locked; do not change without updating ADR-01,
  DESIGN.md, and bumping the version.
- **Extraction model:** `claude-opus-4-7` at default effort. Not extended
  thinking. See DESIGN.md section on extraction pipeline.
- **Pre-drafted extraction prompt:** `src/extraction/prompt.ts` holds
  the `EXTRACTION_PROMPT` constant — validated on two empirical bases:
  (1) pre-scaffolding ADR validation on 12 production-grade documents
  (100% JSON parse success, 169 claims extracted correctly across
  hono and httpx ADRs); (2) v0.3 Step 9 docstring calibration on 13
  samples across TypeScript / Python / Go (11/13 PASS; JSON parse
  100%; severity discipline 100%; cost $0.45). The prompt handles
  ADR + docstring inputs via H1 (single shared prompt) design.
  The extraction pipeline imports from this file; do not duplicate
  the prompt elsewhere. The prompt content, severity taxonomy, and
  model choice are frozen per ADR-02; call signatures, error
  handling, and output validation around it evolve with the
  pipeline. Refinements within the prompt require calibration
  evidence parallel to v0.3 Step 9.

  **Frozen-prompt invariant scope clarification (v0.7 Step 2.3.a.0
  amendment per FO-12 / FO-13 substrate-evolution lock):** the
  invariant applies to the **substrate value** (the prompt text
  itself, severity taxonomy, output schema, model choice) — NOT to
  the **load mechanism**. The load mechanism evolves:

    - CLI path (Anthropic API direct): imports the constant from
      `src/extraction/prompt.ts` directly. Unchanged.
    - Claude Code Skills path (`/index-atlas`, `/generate-adrs`,
      subscription-bounded): loads via Read tool against
      `.contextatlas/prompts/extraction.md` +
      `.contextatlas/prompts/generate-adrs.md` artifacts. These
      artifacts are generated at build time (`scripts/generate-
      prompt-artifacts.mjs` runtime-imports the compiled constants
      from `dist/` and writes .md files alongside) and copied into
      the user repo by `contextatlas init`. Sync discipline:
      doctor's `extraction.prompts_artifact_fresh` check warns on
      drift between user-repo artifacts and the installed package's
      canonical source. v0.7 supersedes the prior `!\`contextatlas
      show-prompt\`` bash-injection pattern (Path-γ-via-bash);
      Skills must use Read tool against the artifact for
      substrate-consistency. Legacy `contextatlas show-prompt` +
      `contextatlas show-generate-prompt` CLI subcommands were
      **removed entirely** at v0.7 Step 2.3.b.0 (β-bounded
      substrate-evolution per Travis foundational substrate-
      consistency framing) — empirical evidence at Step 2.3
      Checkpoint 2/3 showed agents continued invoking the
      deprecated subcommands when they remained functional; hard
      removal eliminates the alternative path. v0.7 Step 2.3.b.0
      additionally added `contextatlas validate-atlas` CLI
      subcommand as a MANDATORY workflow gate for `/index-atlas`
      Skill — atlas.json shape is mechanically validated against
      AtlasFileV1 v1.4 schema at the CLI boundary; non-canonical
      atlases fail loudly with specific remediation; Skill workflow
      blocks until atlas validates. Combined with mandatory
      `contextatlas resolve-symbols` + `contextatlas doctor`
      verification steps, the Skill path substantively enforces
      cross-path substrate equivalence with the CLI extraction
      path.

  The same scope clarification applies to `GENERATE_ADRS_PROMPT`
  (canonical at `src/generation/prompt.ts`; build-time artifact at
  `dist/generation/prompt.md`; init-copied to
  `.contextatlas/prompts/generate-adrs.md`).

## Current Version

- **Current:** v0.6 shipped 2026-05-09 (tag `v0.6.0`). v0.7
  planning queues next per launch-bearing reframe (Travis pivot
  at v0.6 Step 7.5).
- **Strategic arc:** [`ROADMAP.md`](ROADMAP.md) covers v0.1 → v1.0.
- **v0.6 outcome:** Early-access pipeline-mechanics + targeted
  matrix-replication subset + cohort infrastructure shipped.
  Stream A pipeline-mechanics (5 items): A4 lazy-spawn + A6
  doctor deep LSP health check + A7 self-use onboarding pipeline
  + H5 doctor multi-dimension state-detection + B13-flag stub
  per pending-resolution architecture. Stream B methodology-
  rigor + matrix-replication subset (4 items): E2 priors
  interpretation discipline + B15 ADR-19 §2 cost recalc + B1
  rubric anchor refinement cycle-close evaluation (NO-TRIGGER
  per Tier 3) + targeted matrix-replication subset (8 cells ×
  n=5 × 2 conditions = ~80 trials; 2 of 4 axes DIVERGED in
  v0.5-vs-v0.6 tier-gradation comparison per Phase-10 §8;
  factual_correctness CLEAN→BORDERLINE; actionability
  BORDERLINE→NOT distinguishable; hallucination + completeness
  preserved). Stream C cohort/instrumentation + B17 self-use
  logging (4 items): cohort feedback template + tool-description
  observability per ADR-20 consent contract + recruitment
  infrastructure + B17 hybrid capture (✓ MET via progress-log-
  distributed synthesis per Q8 lock). 9 named findings (full
  text at Phase-10 ref-doc §11): F1 PRIMARY atlas-substrate-
  version confound surfaces in v0.5-vs-v0.6 tier-gradation
  comparison (atlas-version-correlated effect shift primary
  mechanism; causal investigation deferred to v0.8+); F9
  METHODOLOGY-DESIGN GAP tag-only-not-control pattern (v0.6
  cycle Q5.0.7 atlas-version-tagging discipline captured the
  tag in trial manifests but did NOT specify methodology-
  comparison-must-control-for-atlas-version; tag-AND-control
  pattern for v0.7+ inheritance); F2-F8 finding inventory at
  Phase-10 §11. Tier 3 cohort exposure cancellation per Q7.0.9
  pre-registration framing locked at Step 7.0 (commit `77e523e`)
  before recruitment outcome known; applied at Step 7.5 (commit
  `11e0ddc`) against actual outcome (Travis pivot to feature-
  bearing v0.7 cycle); recruitment infrastructure ships at v1.0
  ready for v0.8+ post-launch cohort exposure execution.
  Substrate-generation thesis preserved via post-launch
  infrastructure inheritance (not abandoned). Cumulative cycle
  spend reconstructed at Step 9.6 ship commit (matches v0.5
  ~$10.25 platform-billed reconstructed precedent). V1.0 ship-
  gate status post-v0.6: criterion #1 parenthetical CLOSED at
  v0.5 (preserved); criterion #1 statistically-meaningful-wins
  PARTIAL via 8-cell subset → v0.8+ matrix-completion;
  criterion #2 PARTIAL via Step 4.5 pipeline-mechanics → v0.7
  empirical verification per launch-bearing reframe; criterion
  #3 NOT MET via Tier 3 cancellation → v0.8+ post-launch.
  Honest 2-of-3 MET + 1 carried forward framing.
- **Methodology limits acknowledged in v0.6 ship narrative:**
  Atlas-substrate-version confound (F1) primary methodology
  limit at v0.6 cycle close — cross-cycle tier-gradation
  comparison must control for atlas-substrate-version; v0.6
  measurements against v0.5.0 atlas (not v0.4.0 atlas v0.5
  baseline used) is methodological substrate-shift; causal
  mechanism investigation deferred to v0.8+ per F1 deferred
  work. F9 methodology-design-gap tag-only-not-control pattern
  observation captures generalizable v0.7+ design discipline
  inheritance: tag-AND-control pattern (not just tag-only) for
  cross-cycle methodology comparison frameworks. 8-cell subset
  matrix-replication (not full matrix-completion; v0.8+ post-
  launch closes statistically-meaningful-wins gate per launch-
  bearing reframe). Tier 3 cohort exposure cancellation (zero
  direct cohort substrate generated at v0.6 cycle; Q7.0.9 pre-
  registration framing preserved honest-scope acknowledgment;
  v0.8+ post-launch re-attempts cohort exposure against
  carried-forward recruitment infrastructure). Single-judge-
  model methodology preserved from v0.5 limit (cross-vendor
  judge-panel graduation deferred to v0.8+). v0.6 cycle
  introduces cycle-execution-time discipline observations: pre-
  registration discipline working-as-designed (Q9 + Q8 + Q10 +
  Q7.0.9 layered framings prevented post-hoc rationalization at
  cycle close); cycle-execution observations captured at
  `v0_7-HANDOFF.md` "Cycle-pre-planning insights" section per
  Q8.0.4 aggregation lock.
- **v0.5 outcome (preserved as historical record):** LLM-judge
  methodology + quality-axis blind-grading methodology shipped.
  Stream A rubric + anonymization
  (single + paired rubric prompts; 5-step anonymization pipeline
  per ADR-19; position-bias post-hoc 0.538 NO TRIGGER below
  strict 0.60). Stream B paired-t statistical methodology +
  Phase-9 reference doc (ADR-19 §4 amendment 2026-05-03 commit
  `05c9fc7` replaces unpaired-pooled with paired-t; 4-level
  aggregation including cross-cell rollup Option B-2 at
  concatenated N=27 differences; threshold pre-registration
  honored under Option α strict three-tier framing). Stream C
  adaptive cost priors (atlas-version-based filter; v0.4.0+
  tagged substrate; cumulative aggregation) + Pipeline
  Integration Discipline section absorbed into CLAUDE.md at
  Step 10.2. Cross-cell rollup distinguishes on 3 of 4 quality
  axes (1 clean / 2 borderline / 1 tied); see ref-doc §6 for
  full per-axis paired-t CI numerics + §8 for cycle-thesis
  evaluation. Nine named findings (full text at ref-doc §7):
  F1 PRIMARY paired-mode unlocks rubric differentiation
  single-mode obscures (with 12:1 ca-favored asymmetry); F2
  anonymization validated by 76% tie rate; F3 cobra/c4 +
  httpx/p2 all-zero Δ; F4 ca-condition variance asymmetry;
  F5 hono h1 beta-ca bimodal exploration intrinsic; F6
  position-dependent JSON output formatting (cycle-emergent;
  distinct from ADR-19 §3 score-bias); F7 cross-order
  agreement strong; F8 cost-projection accuracy at paired-mode
  + failed-call cost-tracking gap; F9 cost-discipline
  preserved (~$10.25 cumulative platform-billed reconstructed
  / ~12% of $51-97 base envelope).
- **Methodology limits acknowledged in v0.5 ship narrative:**
  Quality-axis measured at 5 anchor cells × n=5 trials × 2
  conditions (hono h1 auto-stretch to n=8); not full-matrix
  replication (matrix-replication graduation is v0.6+
  candidate). Cobra/c3 trial-2 base reproducible failure
  under assignment_parity=EVEN accepted via Path A; n=4 at
  cobra/c3 cell. Single-judge-model methodology (Sonnet
  pass-1 vs pass-2 within-judge consistency ≥80% per axis;
  cross-model judge-pool graduation is v0.6+ candidate per
  ref-doc §9). Hallucination CI lower bound below 0.05
  clean-tier threshold but well above 0.001 borderline-floor —
  peer-review-defensible borderline classification, not clean.
  Completeness NOT distinguishable preserved honestly per
  threshold pre-registration discipline.
- **v0.4 outcome (preserved as historical record):** Production-
  installability foundation. Stream A
  substrate hardening (B2 LSP timing-race robustness with
  bounded-poll + readiness-signal pattern across TS/Python/Go
  adapters per ADR-18; A4 directory-aware test-file exclusion; A1
  priors-derived ceiling defaults; A2 retry-overhead modeling;
  commit-message extraction as third claim source; cost-projection
  disclaimer landed in 5 user-facing surfaces). Stream B
  contextatlas-on-itself dogfood + diagnostic-only doctor script
  foundation (5 categories; 17-21 checks; limited-mode for
  unconfigured repos). Stream C bounded-validity matrix-run
  replication (5 cells × n=2 trials; BOUNDED outcome; tokens median
  4.4% / max 45.0%; three-measurement convergence ~4-13%
  replication-noise-floor across extraction-side / matrix-run-side
  / cost-side). Four named findings: filter-shape vs content-
  richness distinction VALIDATED (commit-message filter is
  conventional-commits-flavored; under-captures non-conventional
  corpora); Q3 bifurcated reading SHIPPED (≥30 floor + ≥50 ceiling
  honored independently); bounded-validity replication CONFIRMED;
  cost-projection-vs-platform-billing systematic 3x reduction
  VALIDATED across 4 reference targets.
- **Methodology limits acknowledged in v0.4 ship narrative
  (preserved as historical record):** n=2 trial replication
  (full statistical methodology n>2 deferred to v0.5+; closed
  at v0.5 with n=5 per-cell trials × 5 cells; cross-cell
  rollup paired-t at N=27 differences per axis); calls-Δ
  quantization noise on small-N cells (token-Δ is load-
  bearing metric; calls-bucket reporting at v0.5 Step 10.1
  addresses this); quality-axis blind-grading explicitly
  v0.5+ scope (closed at v0.5 with LLM-judge methodology
  under paired-mode anonymization); Phase 8 substrate cell
  selection finding-anchored not random (full-matrix
  replication remains v0.6+).
- **v0.3 outcome (preserved as historical record):** Stream A atlas
  precision (Theme 1.2 narrower attribution per ADR-16 amendment +
  Theme 1.1 multi-symbol API per ADR-15 + Theme 1.3 atlas schema
  v1.3 with `contextatlas_commit_sha`); Stream B docstring source
  extraction across TS/Python/Go; Stream C methodology hardening;
  Stream D Phase 8 reference run + trace-analysis supplement. Four
  named findings: Theme 1.2 VALIDATED, Stream B VALIDATED, Theme 1.1
  VALIDATED, Theme 2.2 FALSIFIED.
- **v0.2 outcome (preserved as historical record):** Three-language
  baseline established across hono (TypeScript), httpx (Python), and
  cobra (Go). Stream A + Stream B both shipped. v0.2 thesis ("works
  across languages and repos") empirically validated.
- **v0.7+ candidates.** Multiple complementary substrates per
  launch-bearing reframe:
  (1) `v0_7-HANDOFF.md` v0.7 launch-bearing reframe section is
  canonical bridge document for v0.7 cycle pre-planning (PRIMARY
  claude-code-only extraction path + SECONDARY install/setup
  empirical verification + TERTIARY backlog-drain; v0.8+ post-
  launch absorbs F1-F9 methodology amendments + cohort exposure
  execution + Stream B matrix-completion).
  (2) `../ContextAtlas-benchmarks/research/phase-10-v0.6-reference-run.md`
  §9 captures cycle-emergent v0.7+ candidates surfaced during
  v0.6 execution (canonical inventory beyond v0_7-HANDOFF.md
  scope per cycle-emergent-only scope discipline).
  (3) `research/v0.5-candidates.md` remains canonical for
  residual unabsorbed v0.5+ items (absorbed-item in-place
  annotations mark #7/#8/#9/#12 v0.5-Step-10 closures).
  v0.7 cycle target: launch-bearing timeline to v1.0.
- **Historical references:** `STEP-PLAN-V0.6.md` + `STEP-PLAN-V0.5.md`
  + `STEP-PLAN-V0.4.md` + `STEP-PLAN-V0.3.md` + `STEP-PLAN-V0.2.md`
  progress logs document per-step execution arcs; `v0.6-SCOPE.md` +
  `v0.5-SCOPE.md` + `v0.4-SCOPE.md` + `v0.3-SCOPE.md` + `v0.2-SCOPE.md`
  are the scope anchors as shipped; `v0_7-HANDOFF.md` is the
  v0.7 cycle pre-planning canonical bridge document.

When making architectural decisions, check ADRs first. ADR-13
(Pyright) and ADR-14 (gopls) document the language-adapter LSP
contracts; ADR-06 (committed atlas) and ADR-11 (git signal index)
document the atlas-side invariants.

v0.1 shipped with Phase 5 empirical validation (50–71% tool-call
reduction on architectural win-bucket prompts on hono). v0.2
shipped Phase 6 (httpx) + Phase 7 (cobra) reference runs validating
cross-language replication. v0.3 shipped Phase 8 reference run +
trace-analysis supplement (Themes 1.1/1.2 VALIDATED; Theme 2.2
FALSIFIED). v0.4 shipped Stream C bounded-validity replication
(BOUNDED outcome; n=2 across 5 cells). v0.5 shipped Phase-9
reference run with paired-t cross-cell rollup quality-axis
methodology (factual_correctness CLEAN; hallucination + actionability
BORDERLINE; completeness NOT distinguishable per ADR-19). v0.6
shipped Phase-10 reference run with 8-cell matrix-replication
subset (DIVERGED 2-of-4 axes; F1 PRIMARY atlas-substrate-version
confound + F9 methodology-design-gap pattern + 9 named findings)
+ Tier 3 cohort exposure cancellation (per Q7.0.9 pre-registration
framing) + early-access pipeline-mechanics under launch-bearing
reframe (Travis pivot at Step 7.5; v0.7 = launch-bearing not
substrate-generation per `v0_7-HANDOFF.md`). Historical MVP build-
plan details live in git history, not this file.

## Tool scope philosophy

The three tools (`get_symbol_context`, `find_by_intent`,
`impact_of_change`) are not three parallel features. They are one
fused context system with three access patterns:

- `get_symbol_context` — "I know the symbol; give me everything"
- `find_by_intent` — "I don't know the symbol; find it by what it does"
- `impact_of_change` — "I'm about to change this; what breaks?"

The composites (`find_by_intent`, `impact_of_change`) are thin shells
over the primitive (`get_symbol_context`). Most of the hard
engineering is in the primitive; the composites reuse its substrate.
Do not build them as separate parallel systems.

**Protect at all costs:** the primitive and the extraction pipeline.
Regressions there cascade to every composite and every downstream
query.

### Test-file identification convention

Test files are identified primarily via adapter-reported signals
where available (e.g., tsserver's `isTestFile` heuristics), falling
back to filename patterns: `*.test.ts`, `*.spec.ts`, `*.test.tsx`
for TypeScript; `test_*.py`, `*_test.py`, and anything under a
`tests/` directory for Python. The convention is not perfect —
projects using non-standard test layouts may need explicit config
in a future version — but it's sufficient for the benchmark targets
and typical repos.

## ADRs That Constrain This Project

ContextAtlas ADRs live in `docs/adr/`. They constrain ContextAtlas
development itself — the same way ADRs for hono constrain hono
development. When making architectural decisions in this codebase,
check ADRs first.

The ADRs in `benchmarks/adrs/hono/` and `benchmarks/adrs/httpx/` are
*not* about ContextAtlas — they're test fixtures for benchmarking
against those external repos.

## Coding Standards

- **TypeScript strict mode.** `tsconfig.json` sets `strict: true`. Do not
  weaken. Do not use `any` at API surfaces.
- **Small files.** Prefer files under 300 lines. Split when they grow.
- **No circular dependencies.** Adapter → core → storage is the allowed
  direction. Core does not import from adapters directly; adapters are
  loaded via the plugin interface.
- **Tests adjacent to source.** `foo.ts` + `foo.test.ts`. Use Vitest.
- **Error messages are actionable.** Every thrown error should tell the
  user what went wrong and what to do about it.
- **Run `npm test` (full suite) before committing `src/` changes.**
  Type-check + lint alone don't catch assertion regressions like the
  v0.3 Commit 0.5 prose-string case (a `summary.test.ts` assertion
  against a stale prose string went unnoticed for 5 commits because
  pre-commit only ran `node --check` + `typecheck`). Pre-commit hook
  automation deferred to v0.6+ candidate (CLAUDE.md "minimize
  dependencies" principle weighs against husky); developer
  discipline remains the standard.

## Pipeline Integration Discipline

**When wiring a new claim source into the existing extraction
pipeline (e.g., commit-message extraction at v0.4; future
docstring/PR-description/README sources), READ THE PRECEDENT
INTEGRATION FIRST. Do not assume symmetry between the new source
and prior sources.**

The extraction pipeline (per ADR-02 + DESIGN.md) has multiple
stages each new claim source may touch — collection of the source
artifacts; structured extraction via the canonical prompt; symbol
resolution into canonical IDs; persistence; incremental reindex
hash-tracking. See ADR-02 + DESIGN.md for canonical pipeline-stage
decomposition.

**Checked invariant for new claim sources.** When introducing a
new claim source, the PR introducing it must include explicit
cross-references to:

1. The corresponding stage(s) of the precedent claim source
   (e.g., "uses the same walker as ADR documents per
   `src/extraction/walkers.ts`")
2. Any shape divergence from the precedent (e.g., "uses different
   walker because commit-messages live in git history, not
   filesystem")
3. Stage-by-stage symmetry-OR-divergence-OR-not-applicable note
   for each pipeline stage per DESIGN.md decomposition

For symmetric stages, shorthand `Stage N: symmetric to [precedent
reference]` is acceptable. Narrative required only for divergent
stages, where the divergence and its rationale must be explicitly
stated. Stages the new source doesn't touch can be marked `Stage
N: not applicable`.

**Origin.** v0.4 cycle close §process-hygiene notes #2: "Pipeline-
integration scope confusion discipline: when wiring a new claim
source into existing pipeline, verify by reading precedent
integration before drafting new one — don't assume symmetry. Saved
one rework cycle each time at Steps 5 + 7." Symmetry-assumption
errors caused redo work twice in v0.4 because new claim sources
were drafted before precedent was read.

**Enforcement.** Review-gate at PR time. Automated pipeline-
integration linter deferred to v0.6+ candidate (matches CLAUDE.md
"minimize dependencies" principle weighing against linter
additions at v0.5 scope).

## Extraction cost framing (v0.4 Step 6 / Q5 lock; v0.5 Step 10 adaptive priors closure)

Script-reported extraction costs use Anthropic's full-token API
pricing. Actual platform-billed costs reflect prompt-cache discount
(~90% off cached `EXTRACTION_PROMPT` prefix once the first call
warms the cache). v0.4 Step 5 measurements showed ~3x reduction
script-vs-platform across three reference targets:
- cobra: $5.44 script → $1.82 platform
- httpx: $5.53 script → $1.85 platform (estimated; cache-discount-consistent)
- hono: $10.89 script → $3.65 platform (estimated)

**Honest scope-narrative discipline.** Claim conservative
projections; note actual-typically-lower. Don't tune projection
math toward platform-actual values (Q5 lock — pricing volatility
makes maintenance a liability, not a one-time fix). Adaptive
priors-based correction landed at v0.5 Step 10.1 (per
`scripts/aggregate-cost-priors.mjs` in benchmarks repo +
`cost-priors-v0.5.json` versioned snapshot); cumulative
aggregation strategy per Q4(ii) lock; rolling-N aggregation
remains v0.6+ candidate if needed for ongoing cost forecasting.

## Cost-priors interpretation discipline (v0.6 Step 2 / E2 lock)

V0.5 Step 10.1 shipped adaptive cost-priors aggregation
(`scripts/aggregate-cost-priors.mjs` in benchmarks repo +
`cost-priors-v0.5.json` versioned snapshot at benchmarks-repo
root). v0.6 is the first cycle consuming v0.5-aggregated priors;
this section documents cycle-execution-time discipline governing
how cycles consume versioned cost-priors snapshots. **Discipline
is inheritance from v0.5 substrate (not v0.6-specific creation);
future cycles (v0.6+) consuming versioned cost-priors snapshots
apply this discipline.**

**Atlas-version-based filter discipline** (per v0.5 Step 10.1
Q4(i) lock). cost-priors aggregation includes runs from v0.4.0+
atlas-version-tagged substrate; v0.3-and-earlier substrate
excluded as forward-applicable interpretation primary (per
`contextatlas.version_label` prefix on `run-manifest.json`
filtering). Rationale: atlas-version-tagging captures methodology
compatibility (v0.4+ shares scope-doc + ship-gate disciplines);
pre-v0.4 substrate diverges in methodology baseline.

**Cumulative aggregation discipline** (per v0.5 Step 10.1 Q4(ii)
lock). cost-priors aggregation cumulates across all v0.4.0+
substrate runs; cycle history accumulates rather than rolling
window. Rationale: more substrate produces more stable per-cell
cost estimates. Rolling-N aggregation alternative deferred to
v0.8+ candidate per B16 closure (close-as-superseded by atlas-
version-based filter; backward-looking cycle-history aggregate
use case doesn't have evidence-based trigger).

**Mid-cycle priors-update variance discipline** (per Phase-9
ref-doc §10 limit #8). Cycles use static post-prior-cycle-
aggregation priors throughout cycle execution; mid-cycle
adaptive-priors-update introduces methodology variance. v0.6
uses `cost-priors-v0.5.json` snapshot throughout; v0.6 does NOT
re-aggregate mid-cycle. Post-v0.6-cycle aggregation produces
`cost-priors-v0.6.json` snapshot for v0.7 first-cycle consumption.

**Cost-projection-vs-priors-drift discipline.** Budget projections
at scope-doc-drafting time consume current versioned snapshot;
actual cycle costs may drift from priors per substrate-density
variation across cycles. Honest scope-narrative discipline (per
"Extraction cost framing" Q5 lock above): claim conservative
projections; note actual-typically-lower; don't tune projection
math toward platform-actual values.

**Cross-references:**
- v0.5 Step 10.1 Q4(i) + Q4(ii) locks (atlas-version-based filter
  + cumulative aggregation; benchmarks-repo commit `8e39aa6`)
- Phase-9 ref-doc §10 limit #8 (mid-cycle priors-update variance)
- `cost-priors-v0.5.json` versioned snapshot at benchmarks-repo
  root (canonical priors source for v0.6 cycle)
- ADR-19 §2 (full pricing-model context; v0.6 Step 2.2 amendment
  applies Opus 4.7 = 1.67× Sonnet pricing per v0.5 Step 2 finding
  #3)

## What to Ask the User About

Ask before:

- Adding a new runtime dependency (even small ones)
- Changing the MCP tool interface shape
- Changing the symbol ID format
- Changing the output format
- Touching the extraction prompt
- Deciding between "handle this case" and "fail loudly"

Do not ask before:

- Adding tests
- Fixing bugs within established patterns
- Refactoring within a single file
- Adding internal utility functions
- Writing JSDoc / docstrings

## Benchmark Targets

Three external repos are pre-locked. Do not change without discussion:

- `honojs/hono` — TypeScript, 186 source files
- `encode/httpx` — Python, 23 source files
- `spf13/cobra` — Go, 19 source files

ADRs written for all three are in
[`../ContextAtlas-benchmarks/adrs/`](../ContextAtlas-benchmarks/adrs/)
(5 hono + 5 httpx + 8 cobra). Benchmark prompts are in
[`../ContextAtlas-benchmarks/prompts/`](../ContextAtlas-benchmarks/prompts/),
locked per pre-registration discipline. ContextAtlas itself is
dogfooded during development but is not part of the measured
benchmark matrix — the four-condition matrix runs only against the
three external targets above.

## Using ContextAtlas on Itself

As soon as the core tool works, configure ContextAtlas to index its own
ADRs (`docs/adr/`) and documentation. Use it during subsequent development.
This is the dogfooding story — if the tool is not good enough to help
build itself, it is not good enough to ship.

## Common Pitfalls to Avoid

- **Don't reinvent LSP.** Resist the urge to write custom parsers or
  symbol walkers. tsserver and Pyright handle this correctly. Use them.
- **Don't embed.** Vector similarity is tempting for `find_by_intent`
  but out of scope for MVP. Simple text matching against the claim
  field is sufficient. Only revisit if benchmark evidence shows it's
  needed.
- **Don't over-abstract the language adapter.** Two languages is
  sufficient for the abstraction to be real. More generality than that
  is speculative.
- **Don't scope-creep the bundle.** `get_symbol_context` returns a
  symbol-centric bundle. "What are the top N symbols in the repo?" is
  a different query. Do not conflate.
- **Don't make index-time decisions at query time.** The whole point
  is that expensive reasoning happens once at index time. If you find
  yourself adding Anthropic API calls to query resolution, stop and
  reconsider.

## When Things Are Unclear

If you encounter ambiguity not covered by DESIGN.md, RUBRIC.md, README.md,
or this file: ask. Do not guess and make up a convention. The user has
already thought about most cross-cutting concerns and has opinions worth
learning.
