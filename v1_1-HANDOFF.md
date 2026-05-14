# v1_1-HANDOFF.md — Cycle-engineering knowledge from v0.8

**Source cycle:** v0.8 (closed 2026-05-14, tag `v0.8.0`)
**Target cycle:** v1.1 (next substantive code-work cycle, post-v1.0
public launch)
**Substrate-record canonical reference:** Travis's session log
(Q1_1_E-SKILL-VALIDATION-LOOP-OBSERVATION.md, 3759 lines at cycle
close)

This handoff captures the cycle-engineering knowledge cluster from
v0.8 for v1.1 inheritance. Not a list of work items — those live
in [`research/v1.1-candidates.md`](research/v1.1-candidates.md).
This is the discipline substrate.

---

## §1 Cycle-completion narrative

v0.8 cycle closed 2026-05-14 with substrate-equivalence work
(v0.7.1 + v0.7.2 + v0.7.3 substep ships) + BM25 activation
(v0.7.3 Ship 1 + v0.8 Ship 4b) + path-comparability validation
(Stage 3 dual F3 dry-runs) + v0.5 efficiency-paradigm re-validation
(Option B 4-condition factorial at 96 trials, $39.40 platform-
billed, fingerprint `d613f0ca1ea3d861`, atlas substrate
`826fd87`).

**Ship commits at v0.8 close:**

- `a5b3edb` v0.7.1 Turn 1 — CLI engineering for /index-atlas
  substrate-equivalence
- `a1f7bc3` v0.7.1 Turn 2 — SKILL.md Phase A/B/C re-architecture
- `6a59ed9` v0.7.1 Turn 3 — ADR-02 amendment + version bump + tag
- `4954a38` v0.7.2 — substrate-currency hotfix (CLI source
  convention + validate-extraction scoping)
- `ab38f54` v0.8 Ship 1 — BM25 activation (handler-side
  `symbol.name` synthesis)
- `826fd87` v0.7.3 — BM25 activation substrate-version bump
- `a8277a3` v0.8 Ship 4b — doctor BM25 recommendation logic +
  ADR-16 behavioral disclosure amendment

**Annotated tags at v0.8 close:** v0.7.0 (carried forward from
v0.7 ship), v0.7.1, v0.7.2, v0.7.3, v0.8.0 (this cycle close).

v0.8 is the last substantive code/features cycle before v1.0
public launch. v1.0 is launch event (no new code/features beyond
ship-prep refresh). v1.1 is the next substantive code-work cycle
post-launch.

---

## §2 Cycle-observations locked across v0.8

### Observation 15 — Skill-vs-CLI substrate-equivalence requires per-feature mechanical floor

Substrate-equivalence at the extraction-claim layer isn't
sufficient for cross-substrate ship readiness. Each user-facing
capability (`validate-extraction`, prompts artifacts, MCP
retrieval) needs an explicit mechanical floor that both substrates
pass before substrate-equivalence is shippable.

**v1.1 application:** any substrate-equivalent surface ship
requires per-feature mechanical-floor enforcement at ship-criteria
authoring time.

### Observation 16 — Substrate-currency-gap-from-earlier-cycle-carried-forward

When core substrate evolves at main-repo (v0.7.1 Skill ship), all
consumer surfaces (target-repo SKILL.md files, doctor checks,
extraction validators) need explicit refresh discipline. Silent
staleness composes across cycles.

**v1.1 application:** substrate evolution at main repo requires
explicit refresh discipline at all consumer surfaces. Doctor checks
should surface staleness before downstream cycles inherit it.

Composes with observation 15 + 19 as the mechanical-floor-
discipline cluster.

### Observation 17 — Target-repo SKILL.md substrate-currency drift discipline

SKILL.md files at user-installation-site drift behind canonical
substrate when atlas extraction pipeline evolves. Surfaced at v0.8
Skill-substrate v0.7.1 ship; closed reactively via v0.7.2 hotfix.

**v1.1 application:** `contextatlas refresh-skills` CLI subcommand
OR doctor warns on SKILL.md substrate-version drift. Captured as
candidate item 9 in v1.1-candidates.

### Observation 18 — Empirical-design-hypothesis-falsification at first-real-measurement surface

Pre-cycle design hypothesis ("CLI substrate triggers more
exploration than Skill") didn't survive first-real-measurement
(substrate-shape invariance at fingerprint level, not divergence).
Worth pre-registering hypothesis at design time and committing to
revision when first-measurement falsifies.

**v1.1 application:** multi-axis measurement methodology (calls +
quality + cost + wall-clock) is more informative than single-axis.
Captured as candidate item 6 in v1.1-candidates.

### Observation 19 — Two-layer measurement-substrate verification at cycle-boundary

When measurement infrastructure inherits from a prior cycle,
verify both:

1. **What the conditions semantically test** (e.g., what does
   `ca` arm actually run? atlas-enabled or vanilla?)
2. **What the metric semantically measures** (e.g., is
   `score = 1/(1+tool_calls)` an efficiency measure or a quality
   measure?)

Both verification layers needed. The pattern surfaced twice in
v0.8 alone:

- **F3 condition semantics (mid-cycle):** inherited "ca vs
  beta-ca" framing from v0.5 (where `ca` was atlas-aided vs
  `beta-ca` was vanilla); at v0.8 both arms are atlas-enabled.
  Travis institutional memory caught.
- **Score-metric semantics (late-cycle):** inherited "score-as-
  quality-proxy" framing from v0.5 context; at v0.8 score formula
  `1/(1+tool_calls)` is tool-economy proxy. Dev fresh-read caught.

**Sub-pattern: dormant-capability-carry-forward.** v0.3-shipped
BM25 capability persisted dormant on `get_symbol_context` for 5+
cycles because activation-layer behavior wasn't surfaced at
cycle-boundary verification. Closed at v0.7.3 (Ship 1).

**v1.1 application (load-bearing):** at v1.1 cycle kickoff,
explicitly verify what each inherited measurement primitive tests
AND what each metric measures before drawing interpretation
conclusions. Don't inherit framing language from earlier cycles
without re-checking semantics at current cycle scope.

### Observation 20 — Measurement-metric assumptions and bucket-design intent must be co-designed at each cycle

Original framing (substrate-evolution mechanism) was incomplete.
Sharper mechanism per dev's fresh-read: bucket predictions
calibrated against an implicit "answer quality" model don't
transfer to a tool-call-count metric without re-derivation.

**v1.1 application:** when bucket design changes OR metric
character shifts, re-derive predictions from current bucket +
current metric explicitly. Captured as candidate item 5 in
v1.1-candidates.

### Observation 21 — Native-tool-vs-atlas substrate competition (WITHDRAWN)

Originally proposed framing: "Claude Code's native Read/Grep/
Glob/LS compete with atlas at certain question shapes." Data
didn't support — the cells where this framing seemed to apply
(httpx/p1, cobra/c5 with `beta=1.000`) were actually 0-tool-call
pretraining answers, not native-tool wins. Withdrawn per dev
fresh-read correction.

**v1.1 inheritance:** treat as cautionary substrate-record note.
Withdrawn observation is itself cycle-engineering knowledge:
pattern-matching to plausible-sounding observations without
verifying the data substrate produces overclaiming. Worth pinning
at v1.1 cycle kickoff as: **verify pattern before naming it**.

### Observation 22 — Dormant-capability lifecycle three-stage tracking

When activating a previously-dormant capability mid-cycle,
mechanical validation (does the code path fire? does activation
produce different outputs?) is achievable with bounded dogfood
scope. Quality validation (does activation produce *better*
outputs?) requires answer-quality methodology that may exceed
cycle scope. Worth distinguishing in launch claims.

Dormant-capability lifecycle has three substantive stages tracked
across cycle boundaries:

1. **dormant-and-undetected** (pre-v0.8 BM25 state)
2. **activation-and-mechanical-validation** (Ship 1 + Ship 4a
   closed this at v0.7.3)
3. **activation-and-quality-validation** (deferred to v1.1 —
   captured as candidate item 3)

**v1.1 application:** for each capability shipped functional this
cycle, explicitly identify which stage it's at. Quality-evidence-
deferred capabilities are worth direct framing in launch claims.

### Observation 23 — Symbol-attribution fallback discipline at extraction-time

Surfaced at v0.8 close via parseArgs dogfood (72 claims on
parseArgs from 4 ADRs, with 100% attachment rates on 2 ADRs that
don't substantively relate to CLI argument parsing). Mechanism:
silent-fallback attribution at extraction-time when claims don't
surface named code symbols.

**v1.1 application:** when ADRs don't surface specific named code
symbols, attribution should produce one of:

- (a) no-symbol attachment with warning,
- (b) attachment to substantively-appropriate inferred symbols, OR
- (c) explicit fallback to a sentinel with operator-visible
  signaling.

Silent fallback to a popular symbol degrades retrieval quality.
Captured as candidate item 1 in v1.1-candidates.

---

## §3 Cycle-discipline patterns worth v1.1+ inheritance

### Pattern 1 — Pre-flight invariant discipline (dev Ship 2)

Ship 2 driver (`scripts/v0.8-option-b-factorial.mjs`) enforced
bucket-distribution + registry-resolution invariants before any
API spend. Failed loudly on configuration drift; no wasted budget
on mis-shaped runs.

**v1.1 application:** measurement-driver scripts at v1.1+ should
enforce pre-flight invariants on locked constants (cell pool
composition, condition matrix, expected outcomes) before first
`runTrial`. Tag-AND-control discipline (F9 pattern) at the
measurement-execution surface.

### Pattern 2 — Pre-result analytical framework discipline (advisor)

Advisor-side counterpart to Pattern 1. Pre-drafted analytical
framework with placeholders for empirical numbers before paste-
back. Prevented post-hoc interpretation drift at measurement-
interpretation surface.

**v1.1 application:** at measurement-driver dispatch time,
pre-draft the analytical framework that will interpret results.
Frame the analysis around the metric definition + the pre-
registered hypothesis + the per-bucket decision tree. Populate
empirical numbers when paste-back lands. Composes with Pattern 1
as F3/F9 derivative pattern at measurement-execution +
measurement-interpretation surfaces.

### Pattern 3 — Non-revisionist ADR amendment discipline

ADR-16 amendments at v0.3 (original chain α decision), Ship 1
(handler-side activation), Ship 4b (doctor recommendation +
behavioral disclosure) preserve historical record while adding
cycle-engineering knowledge. The "this was a limitation at v0.3
ship; it was activated at v0.7.3" narrative is itself the
observation-19 evidence artifact for v1.1+ inheritance.

**v1.1 application:** when ADR decisions evolve across cycles,
amendment-with-historical-preservation. Don't rewrite the
original decision narrative; document what shipped at each cycle
boundary explicitly.

### Pattern 4 — Substrate-version bump discipline

Substep-bounded version-bump commit + annotated tag body +
non-revisionist release-notes substrate at tag body (no separate
CHANGELOG file). v0.7.0/v0.7.1/v0.7.2/v0.7.3 + v0.8.0 all follow
this convention. Composes with substep-boundary discipline
reproducibility pattern.

**v1.1 application:** version bumps remain substep-bounded ship
commits with annotated tag bodies as canonical release-notes
substrate. If `CHANGELOG.md` becomes desired (candidate item 10),
promotion from `git show <tag>` output is straightforward.

### Pattern 5 — First-execution-at-canonical-repo empirical verification

v0.8 surfaced 6+ substrate-currency gaps via this discipline:
Skill substrate file paths, SKILL.md drift, v0.7.0 → v0.7.1 →
v0.7.2 hotfix chain, BM25 dormancy, score-metric semantics,
parseArgs over-fragmentation. All caught at first real execution
against canonical substrate, not in unit-test mocks.

**v1.1 application:** ship readiness includes first-execution-at-
canonical-repo verification step, not just unit-test passage.
Doctor check + integration dogfood on contextatlas-on-itself OR a
benchmark repo before tag.

### Pattern 6 — Cross-role verification at measurement-substrate entry

Observation 19 surfaced twice this cycle through different
cross-role catches: Travis institutional memory caught F3
condition semantics; dev fresh-read caught score-metric
semantics. Neither catch could have been made by the other role
alone — Travis didn't have time to re-read harness code; dev
didn't have v0.5 institutional memory.

**v1.1 application:** at cycle-boundary measurement-substrate
verification, both lead-institutional memory and dev-fresh-read
are needed. Cycle-discipline pattern reproducibility: explicitly
cross-check at measurement-substrate inheritance points.

---

## §4 Open items for v0.9 (separate work shape)

v0.9 is not a substantive code-work cycle. v0.8 is the last
launch-bearing substrate cycle before v1.0 public launch. Two
items worth noting for v0.9 / v1.0-launch-prep context if
relevant:

1. **Cost-count discrepancy reconciliation** between dev count
   and advisor count (~$38 gap surfaced mid-cycle; LOCK C
   envelope dissolved late-cycle per Travis adjudication so
   discrepancy didn't block v0.8 close). Worth substrate-record
   reconciliation at v1.1 cycle prep if cost-tracking returns as
   a constraint.
2. **`powercfg` standby restoration to 1800s** post-v0.8.0 tag
   (cycle-engineering housekeeping; not cycle-engineering
   substrate).

---

## §5 Substantive carry-forward summary

v0.8 closed with launch-bearing substrate intact. Cycle-
engineering knowledge cluster (observations 15-20 + 22 + 23;
observation 21 withdrawn) is the v1.1 inheritance.

**The most-load-bearing v1.1 entry-point is observation 19 +
Pattern 6** (cross-role verification at measurement-substrate
entry). Every other v1.1 candidate scope item is downstream of
getting that discipline right at cycle kickoff.

---

## §6 Substrate references

- [`ROADMAP.md`](ROADMAP.md) v0.8 [SHIPPED] section — cycle
  narrative + V1.0 ship-gate status
- [`research/v1.1-candidates.md`](research/v1.1-candidates.md) —
  v1.1 candidate work-items inventory (renamed from
  `research/v0.8-candidates.md` at v0.8 cycle close)
- [`docs/adr/ADR-16-bm25-symbol-context.md`](docs/adr/ADR-16-bm25-symbol-context.md) —
  three amendments preserving non-revisionist record (v0.3
  original + 2026-04-26 production-vs-benchmark distinction +
  2026-05-14 Ship 1 activation + 2026-05-14 Ship 4b doctor
  recommendation)
- [`docs/adr/ADR-02-extraction-sole-api-caller.md`](docs/adr/ADR-02-extraction-sole-api-caller.md) —
  cycle-observations 15 + 16 canonical captures (v0.7.1 + v0.7.2
  amendments)
- [`v0_7-HANDOFF.md`](v0_7-HANDOFF.md), [`v0_8-HANDOFF.md`](v0_8-HANDOFF.md) —
  prior cycle pre-planning bridge documents, preserved as
  historical record
- Annotated tag bodies at `git show v0.7.0` through
  `git show v0.8.0` — canonical release-notes substrate per
  Pattern 4
