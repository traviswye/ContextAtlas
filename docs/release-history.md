# ContextAtlas Release History

Cycle-narrative substrate for ContextAtlas releases — what each cycle
shipped, why it mattered, and the load-bearing empirical findings.
Companion to [`CHANGELOG.md`](../CHANGELOG.md), which tracks version
releases per [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
convention (Added/Changed/Fixed/etc. per version).

The two surfaces compose:

- **CHANGELOG.md** — version-release tracking; what changed at each
  semver tag; cohort-facing release-notes convention
- **release-history.md** (this file) — substantive cycle narrative;
  what shipped + why it mattered + cycle-emergent findings;
  substrate-record discipline preservation

For per-cycle scope authorship + step-plan substrate, see
[`docs/cycles/v0_X/`](cycles/) (cycle subdirectories with original
SCOPE + STEP-PLAN + HANDOFF documents).

For cycle-engineering knowledge clusters (cycle-discipline patterns,
substrate-record observations, v1.1 inheritance candidates), see
[`../v1_1-HANDOFF.md`](../v1_1-HANDOFF.md).

---

## v0.1 (initial MVP)

Initial public substrate. Tools: `get_symbol_context` (the primitive
— full four-signal fusion of LSP + ADR claims + git + tests) +
`find_by_intent` (thin composite; FTS5 + BM25 ranking over claims
table per ADR-09) + `impact_of_change` (thin composite; primitive +
git co-change + test-impact data). Infrastructure: core MCP server
skeleton; TypeScript language adapter via `typescript-language-server`;
Python language adapter via Pyright per ADR-13; Opus 4.7 index-time
extraction pipeline (validated 100% parse success across 12
production-grade documents tested); SQLite storage with SHA-based
incremental reindex (atlas schema v1.0 → v1.1 with additive git-signal
addition per ADR-11). Phase 5 empirical validation on hono — 50-71%
tool-call reduction on architectural win-bucket prompts.

## v0.2 shipped (2026-04-25)

Adapter quality polish (Stream A) + Go adapter via `gopls` (ADR-14)
with cobra benchmark target + cross-repo httpx reference run +
cross-language cobra reference run (Stream B). Three-language
baseline established. Three v0.3+ investigation findings logged in
benchmarks-repo Phase 7 synthesis. See
[`v0.2-SCOPE.md`](cycles/v0_2/v0.2-SCOPE.md) for the original
stream-level scope and the Phase 6/7 synthesis docs for empirical
findings.

## v0.3 shipped (2026-04-28)

Stream A atlas precision (Theme 1.2 narrower attribution + Theme 1.1
multi-symbol API per ADR-15 + Theme 1.3 atlas schema v1.3 with
`contextatlas_commit_sha`); Stream B docstring source extraction
across TS/Python/Go; Stream C methodology hardening (atlas-file-
visibility filter + per-language cost priors + cross-harness
asymmetry comparison convention); Stream D Phase 8 reference run +
supplement. Four named findings (3 VALIDATED + 1 FALSIFIED).
Cumulative spend across Step 14 atlas re-extraction + Step 15
reference run: $55.67. See
[`v0.3-SCOPE.md`](cycles/v0_3/v0.3-SCOPE.md) for original
stream-level scope; Phase 8 synthesis docs for empirical detail.

## v0.4 shipped (2026-04-29)

Stream A substrate hardening (LSP adapter timing-race robustness via
two-readiness-signals architecture per ADR-18; directory-aware
test-file exclusion; priors-derived ceiling defaults; commit-message
extraction as third claim source; cost-projection disclaimer in 5
user-facing surfaces); Stream B contextatlas-on-itself dogfood +
diagnostic-only doctor script foundation (5 categories; 17-21
checks); Stream C bounded-validity matrix-run replication (5 cells ×
n=2 trials; BOUNDED outcome; tokens median 4.4% / max 45.0%;
three-measurement convergence ~4-13% replication-noise-floor). Four
named findings: filter-shape vs content-richness distinction
VALIDATED; Q3 bifurcated reading SHIPPED; bounded-validity
replication CONFIRMED; cost-projection-vs-platform-billing systematic
3x reduction VALIDATED. Cumulative spend: ~$43.80 script-projected /
~$14.50 platform-billed estimated; below $50 ceiling. See
[`v0.4-SCOPE.md`](cycles/v0_4/v0.4-SCOPE.md) for original
stream-level scope.

## v0.5 shipped (2026-05-04)

Stream A LLM-judge harness + rubric prompt + 5-step anonymization
pipeline (per ADR-19; position-bias post-hoc 0.538 NO TRIGGER);
Stream B paired-t statistical methodology + Phase-9 reference doc
(4-level aggregation including cross-cell rollup at N=27 differences
per axis; ADR-19 §4 amendment 2026-05-03 replaces unpaired-pooled);
Stream C adaptive cost priors + Pipeline Integration Discipline
(methodology riders #7/#8/#9/#12). Substrate: 5 anchor cells × n=5
trials × 2 conditions; hono h1 auto-stretch to n=8. Cross-cell
rollup distinguishes on 3 of 4 quality axes (1 CLEAN / 2 BORDERLINE
/ 1 NOT distinguishable per Option α strict three-tier framing);
threshold pre-registration honored. Nine named findings (full text
at Phase-9 reference doc §7): F1 PRIMARY paired-mode unlocks rubric
differentiation single-mode obscures; F2-F9 per ref-doc §7. V1.0
ship-gate criterion #1 quality-axis methodology parenthetical CLOSED
at v0.5; statistically-meaningful-wins gate remains open
(matrix-replication graduation v0.6+). Cumulative spend: ~$10.25
platform-billed reconstructed / ~12% of $51-97 base envelope. See
[`v0.5-SCOPE.md`](cycles/v0_5/v0.5-SCOPE.md) for original
stream-level scope.

## v0.6 shipped (2026-05-09)

Stream A pipeline-mechanics (A4 lazy-spawn + A6 doctor deep LSP
health check + H5 multi-dimension state-detection + A7 self-use
onboarding pipeline + B13-flag stub per pending-resolution
architecture); Stream B targeted matrix-replication subset (8 cells ×
n=5 × 2 conditions = ~80 trials; DIVERGED 2-of-4 axes vs v0.5
anchor-cell baseline per Phase-10 §8; F1 PRIMARY atlas-substrate-
version confound surfaced + 9 named findings at Phase-10 ref-doc);
Stream C cohort infrastructure (feedback template + tool-description
observability + ADR-20 consent contract + recruitment infrastructure
+ B17 self-use logging hybrid capture). Tier 3 cohort exposure
cancellation per Q7.0.9 pre-registration framing — recruitment
infrastructure ships at v1.0 ready for v0.8+ post-launch cohort
exposure execution per launch-bearing reframe (Travis pivot at v0.6
Step 7.5 — v0.7 = launch-bearing not substrate-generation). V1.0
ship-gate status post-v0.6: criterion #1 parenthetical CLOSED at
v0.5 (preserved); criterion #1 statistically-meaningful-wins PARTIAL
via 8-cell subset → v0.8+ matrix-completion; criterion #2 PARTIAL
via Step 4.5 pipeline-mechanics → v0.7 empirical verification;
criterion #3 NOT MET via Tier 3 cancellation → v0.8+ post-launch.
Honest 2-of-3 MET + 1 carried forward framing. See
[`v0.6-SCOPE.md`](cycles/v0_6/v0.6-SCOPE.md) for original
stream-level scope; [`v0_7-HANDOFF.md`](cycles/v0_7/v0_7-HANDOFF.md)
for v0.7 launch-bearing reframe + v0.8+ deferral substrate.

## v0.7 shipped (2026-05-12)

Launch-bearing cycle ship to v1.0 public launch substrate complete,
under 3-tier scope (PRIMARY claude-code-only + SECONDARY install/
setup + TERTIARY deferred). PRIMARY (a): Path-3 entry-point-
determined architecture shipped (CLI = Anthropic API direct; Skills
= subscription-bounded; ADR-02 graduation + re-amendment; Strategy
pattern + Skills mechanism + legacy deprecation cycle). PRIMARY (b):
generate-adrs feature shipped with investigative-depth-per-decision-
candidate workflow + canonical depth-floor mechanical enforcement
via `validate-adrs`; CLI substrate-equivalence closed at Step 2.4.a
(β-1 extended thinking 32k budget + β-2 auto-invoke validate-adrs
post-generation). SECONDARY: contextatlas-on-itself dogfood at Step
3 atlas refresh (CLI Phase 4 SHA-diff incremental empirically
validated; α SKILL.md `/index-atlas` refresh-aware workflow
amendment). TERTIARY substrate-gap fixes deferred to v0.8+ per
locked scope. 4-cohort entry-surface framing shipped (CLI + Skill ×
cold-start + reference-context). 15 Class-15 cycle-execution
observations captured (capstone composition). 21 v0.8+ forward-
pointer candidates consolidated at
[`research/v1.1-candidates.md`](../research/v1.1-candidates.md)
(renamed from `research/v0.8-candidates.md` at v0.8 cycle close).
V1.0 ship-gate status post-v0.7: 2-of-3 MET + 2 carried-forward
(criterion #1 parenthetical CLOSED at v0.5 preserved; criterion #1
statistically-meaningful-wins PARTIAL via v0.6 8-cell subset → v0.8+
matrix-completion; criterion #2 newly CLOSED at v0.7 via PRIMARY (a)
+ PRIMARY (b) pipeline-mechanics empirical verification; criterion
#3 NOT MET via v0.6 Tier 3 cancellation → v0.8+ post-launch cohort
exposure execution). See
[`v0.7-SCOPE.md`](cycles/v0_7/v0.7-SCOPE.md) for original
tier-level scope; [`v0_8-HANDOFF.md`](cycles/v0_8/v0_8-HANDOFF.md)
for v0.8 cycle pre-planning canonical bridge document.

## v0.8 shipped (2026-05-14)

Substrate-equivalence + path-comparability + BM25 activation cycle —
last substantive code/features cycle before v1.0 public launch prep.
Substrate-equivalence work (v0.7.1 + v0.7.2 + v0.7.3 substep ships)
closed Skill-substrate parity to CLI at 65-83% claim ratio across
hono/httpx/cobra benchmarks (depth-floor ≥8 ADRs preserved). BM25
activation closed v0.3-era dormancy on `get_symbol_context` via
handler-side `symbol.name` synthesis (Ship 1) + doctor BM25
recommendation gate (Ship 4b; ADR-16 amendment for behavioral
disclosure). Path-comparability validated via Stage 3 dual F3
dry-runs (api+atlas ≈ cc+atlas within 5-16%). v0.5 efficiency
paradigm re-validated via Option B 4-condition factorial (96 trials,
$39.40 platform-billed; 5 of 6 non-trick cells reduce tool-call
count at alpha-vs-ca contrast; 2 biggest wins ≥50% reductions —
httpx/p1 −62%, hono/h5 −56%; cobra/c3 flagged as single atlas-
induced-over-exploration case for v1.1 investigation). 9
cycle-observations 15-23 locked (observation 21 withdrawn per dev
fresh-read correction). V1.0 ship-gate status post-v0.8: 2-of-3 MET
+ 1 carried forward preserved. See
[`v0.8 cycle artifacts`](cycles/v0_8/) for detail;
[`../v1_1-HANDOFF.md`](../v1_1-HANDOFF.md) §1-§6 for
cycle-engineering knowledge cluster.

## v0.9 shipped (2026-05-16 → ongoing v1.0 launch execution)

Launch-prep cycle closing Ruby adapter ship + repo launch substrate
before v1.0 public launch.

*v0.9.0 Stream A — Ruby adapter ship.* Fourth supported language at
v1.0 launch; ~1300 LOC adapter (`src/adapters/ruby.ts`) + ~535 LOC
doctor environment substrate
(`src/doctor/checks/ruby-environment.ts`); 116 Ruby-specific tests
(94 unit + 14 conformance + 8 doctor); ADR-21 at 851 lines with 5
substantive cycle amendments; ruby-lsp 0.26.x + ruby-lsp-rails 0.4.x
stable-compatible pair; Ruby 3.3+ minimum, 4.0+ recommended;
dual-pattern install (Rails-detected bundler vs direct gem);
pull-model diagnostics (LSP 3.17 net-new substrate-design dimension);
kind-6-uniform callable mapping (Path β empirical falsification of
original kind-12 hypothesis at Phase 4 mid-substep). v0.9.0 tagged
at Sub-close-3 commit (`3427611`) preserving Stream A operational
close.

*v0.9.1 Stream B — Repo cleanup operationally closed.* Cycle docs
migration to `docs/cycles/v0_X/` subdirectories (B.1; ~28 external
cross-reference link sweep) + MIT License transition from "All
Rights Reserved" placeholder (B.2) + community substrate authoring
(B.3: CONTRIBUTING + CODE_OF_CONDUCT + SECURITY + SUPPORT +
CHANGELOG with Keep-a-Changelog 1.1.0 backfill + .github/ issue
templates + PR template + minimal CI workflow) + package metadata
finalization + `docs/language-adapter-guide.md` external contributor
onboarding (B.4); post-close URL case correction (camelCase
ContextAtlas brand) + version inflection 0.7.3 → 0.9.0 + V-1 test
fixture currency repair.

*v0.9.1 Streams C-E — Launch execution.* Launch positioning + visual
assets + execution (in progress; folds into v1.0.0 public launch
event without separate v0.9.1 tag per locked framing).

*Phase 6 weekend Rails work-repo dogfood.* Parallel Travis-paced
non-blocker; composes to v1.1 amendments if substantive findings
surface from recognition-service + commons Rails work-repos.

See [`../v1_1-HANDOFF.md`](../v1_1-HANDOFF.md) §7 for v0.9 Stream A
close cycle-engineering substrate (19 cycle-discipline observations
+ 11 v1.1 backlog items including substrate-currency-repair cluster
+ tooling-discipline observations) and
[`v1_1-INHERITANCE-SUBSTRATE.md`](v1_1-INHERITANCE-SUBSTRATE.md) for
prospective adapter-authoring reference.
