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

---

## §7 v0.9 Stream A close — Ruby adapter ship substrate-record (added 2026-05-16)

**Cycle:** v0.9.0 — Stream A scope (Ruby adapter ship)
**Closed:** 2026-05-16
**Status:** Operationally complete; Phase 6 (weekend Rails dogfood) parallel non-blocker
**Next:** v0.9.1 (Streams B-E launch execution; no formal tag) → v1.0.0 public launch

### Cycle scope

v0.9 was launch-prep cycle, not feature cycle (per §4 v0.8-close
framing). Stream A turned out to be a substantive code-work scope
extension: shipped Ruby adapter as the fourth supported language
at v1.0 launch, extending the TS/Python/Go matrix established at
v0.2. Streams B-E (repo cleanup + launch positioning + visual
assets + execution) ship as v0.9.1 work folding directly into
v1.0.0 public launch.

§4 v0.8-close framing ("v0.9 is not a substantive code-work
cycle") preserved as honest substrate-record per Pattern 3 non-
revisionist discipline. Reader sees v0.8-close-anticipated framing
vs v0.9-actual-outcome evolution.

### Commit chain — Stream A

**Probe phase (Substeps 1-5):**
- `5da4100` — Substep 1 probe scaffold
- `f3faafb` — Substep 2 Rails fixture
- `3bb15e8` → `815125f` — Correction sweeps (ruby-lsp version anchor; Pattern 7 four-axis canonicalized)
- `b6ea824` — Path B paranoia drop (pause-vs-verify discipline canonicalized)
- `0bde75f` → `bf05c9c` → `ebc241e` → `a7e6f85` → `a1ddb01` — Substep 3 probe implementation (8 probes + Windows cmd.exe wrap + PATH enrichment + tzinfo + baseline preservation)
- `70d111d` — Substep 4 ADR-21 authored (702 lines)
- `f614c78` — Substep 5 Path R-III (cohort-version amendment)

**Phase 1-2 (version anchor + type substrate):**
- `17988be` — Ruby 4.0.3 probe re-execution + ADR-21 §Cohort-version range surgical revision
- `df374d6` — LanguageCode + LANG_CODES additions

**Phase 3 (RubyAdapter implementation):**
- `0569e97` — 3.1 Skeleton (419 LOC)
- `8e40e63` — 3.2 listSymbols (514 LOC + URL-encoding dedup utility)
- `a76c1c4` — Mid-3.2 ADR-21 §Rationale surgical revision (Φ-γ-variant self.method preserve verbatim)
- `b7967e4` — 3.3 getSymbolDetails (272 LOC; hover-based; forward-composition prose reserved for 3.7)
- `1f7ff52` — 3.4 findReferences (224 LOC + ADR-21 §Limitations Constant-references addendum)
- `d9e39ea` — 3.5 getDiagnostics (242 LOC; pull-model net-new substrate)
- `9888d72` — 3.6 getTypeInfo (357 LOC + ADR-21 §Limitations getTypeInfo addendum)
- `5c93898` — 3.7 getDocstring (179 LOC; consumes 3.3 prose field)
- `8cd0666` — 3.8 Phase 3 close

**Phase 4 (conformance test substrate):**
- `43b7396` — Pre-Substep-4.1 verification (top-level def for empirical kind-12 confirmation)
- `c54ff7c` — Path β (α-FALSIFIED; conformance harness functionSymbol flexibility for Ruby kind-6-uniform callable mapping)
- `6f9ae29` — Substep 4.1 fixture promotion + reshape
- `eb69d53` — Substep 4.2 probe substrate archival (K-2-ii consolidated subdirectory)
- `ec62c1a` — Substep 4.3 conformance test scaffold + Path P-1 PATH-enrichment helper + Phase 4 close

**Phase 5 (Ruby integration sweep, Z-3 hybrid):**
- `ffcfceb` — Substep 5.1 docs + init + Rails excludePatterns
- `6570440` — Substep 5.2 doctor Ruby/Rails check surface (10 checks)

**Phase 6:** parallel weekend Rails dogfood (Travis-paced; non-blocking)

### Quantitative summary

- ~30 substantive commits across Stream A
- Adapter substrate: ~1300 LOC (`src/adapters/ruby.ts`) + ~535 LOC (`src/doctor/checks/ruby-environment.ts`) ≈ 1835 LOC implementation
- Test substrate: 94 unit tests (`ruby.test.ts`) + 14 conformance tests (`ruby.conformance.test.ts`) + 8 doctor environment tests (`ruby-environment.test.ts`) = 116 Ruby-specific tests
- ADR-21 final size: 851 lines; 5 substantive amendments within cycle
- Wall-clock: ~11 days actual vs 3-4 weeks estimate (substantively ahead of pace)

### Cycle-discipline observations validated in v0.9

**(1) Pattern 7 four-axis verification.** Structural-precedent / measurement-claim / version-anchor / dependency-constraint. Canonicalized in commit body `815125f`. Fired multiple times across cycle.

**(2) Pattern 7 axis 5 canonicalized + sub-decomposed.** Three empirical instances across cycle promote axis 5 from candidate to canonical:
- **5a Cross-reference-claim-coherence** — cited precedents claim what we say they claim. Two instances: `a76c1c4` §Rationale gopls direction inversion + 3.4 includeDeclaration claim inversion.
- **5b Substrate-coverage-completeness** — empirical substrate covers the range of cases ADR/adapter scope claims to handle. One instance: `c54ff7c` Path β kind-6 top-level def catch (probe #1 baseline didn't cover top-level def).

Both surface at downstream empirical verification, not at authoring-time documentation review.

**(3) Pause-and-surface vs verify-and-act discipline.** Canonicalized at `b6ea824`. Scope-affecting decisions pause-and-surface; constraint-correcting decisions verify-and-act. Applied empirically across all 8 Phase 3 substeps + Phase 4 surgical revisions.

**(4) Substep-bounded ship-commit discipline.** Each substep one commit; mid-substep surgical revisions ship as separate commits per `b6ea824` boundary.

**(5) Empirical-survey-before-decomposition discipline.** Phase 5 Z-3 hybrid decomposition emerged from dev's empirical survey of existing surface. Pre-deciding decomposition without survey risks over- or under-decomposition. Same discipline pattern fired again at v0.9 close — dev's empirical grep of cycle-artifact cross-references caught migration scope drafted without empirical grounding (30+ reference files; 15+ markdown links would break). Migration dropped from v0.9 close → Stream B substep per dev empirical catch.

**(6) Skip-with-rationale pattern.** Substep 5.1 — 4 surfaces deliberately not touched (CLAUDE.md, MCP schemas, benchmark targets, historical TS+Python framing) each with explicit reason. Future-reader sees why surface wasn't touched.

**(7) Forward-composition design pattern.** Phase 3 — `parseRubyHoverContent` at 3.3 returns `{ signature, prose }` with prose reserved for 3.7. Single hover request, single markdown parse, two field consumers. Design choice at earlier substep prevented redundant parsing at later substep.

**(8) Execution-discipline (staging-set verification).** Two empirical instances:
- 4.1 post-commit catch (partial-stage shipped; amend per Path X authorization)
- 4.3 pre-commit catch (heredoc apostrophe; `git status --short` reinforcement)

Different mechanisms; same category — commit fires against unintended/incomplete stage state. Pattern: multi-file substep commits require `git status --short` empirical check before commit fires. Reinforced via commit-via-F file pattern after 4.3 heredoc lesson; applied cleanly across 4.2 + 4.3 + 5.1 + 5.2 + this Sub-close-2.

**(9) Cross-adapter conformance harness flexibility as discipline pattern.** Two instances at v1.0:
- `classSymbol`: "class" OR "interface" (line 50, pre-existing precedent)
- `functionSymbol`: "function" OR "method" (Path β `c54ff7c`)

Conformance harness accommodates language-semantic-divergence via per-language flexibility. Not exception; pattern.

**(10) K-2-ii consolidated archival pattern.** ADR-13 (Pyright) + ADR-14 (gopls) probe substrate stayed at live paths post-adapter-ship. Ruby K-2-ii consolidated subdirectory archival (`docs/adr/ruby-lsp-probe/`) is NEW discipline-pattern refinement, not precedent-inheritance.

**(11) LSP-server-install-variation correlates with PATH-enrichment-helper need.** Three v1.0 adapter precedents: pyright (no enrichment), gopls (enrichment), Ruby (enrichment for wider install variation — RubyInstaller versions / rbenv / RVM / chocolatey / Homebrew Intel + Apple Silicon / system).

**(12) Doctor-substrate null-filter-at-orchestrator pattern.** Non-applicable checks return null + filtered at orchestrator (Rails-conditional / platform-conditional / suppress-when-not-applicable). Cleaner cohort UX than PASS-with-irrelevant-message.

**(13) Adapter divergence axes decomposition.** Empirical instances of adapter implementation divergence from precedent, empirically grounded across two axes:
- **LSP response-shape conventions** — concrete instances at observation (14) Probing-against-actual-channel-pattern discipline and (17) Diagnostic-delivery-channel-axis
- **Language-structural-properties** — concrete instances at Path β kind-6-uniform (observation 9 reference) and usedByTypes Pyright-pass-1-skip (Phase 3.6)

Adapter pattern uniformity at base-class shape; adapter implementation divergence at per-LSP response-handling AND per-language semantic-structural-properties.

**(14) Probing-against-actual-channel-pattern discipline.** Probe script's `count: 0` for broken.rb was probe-script design choice (push-channel handler), not ruby-lsp behavior gap. Cross-adapter probe substrate quality depends on probing against the actual delivery channel, not assumed channel from precedent adapters.

**(15) Rename-detection threshold composes with file size + modification scope.** Substep 4.1 `consumer.rb` (delete+create at <50% similarity) vs Substep 4.2 probe artifacts (97% similarity). Smaller modifications on larger files preserve continuity even at coincident-with-rename surface.

**(16) Fixture-substrate-version vs cohort-actual-version axis.** Distinct from Pattern 7's four verification axes. Probe substrate captured at Ruby 3.3 → cohort developers actually run Ruby 4.0+. Path V-a at Phase 1 closed the gap rather than carrying as v1.1 amendment.

**(17) Diagnostic-delivery-channel-axis as substrate-design dimension.** Push-model (Pyright/gopls publishDiagnostics notifications) vs pull-model (ruby-lsp textDocument/diagnostic LSP 3.17 request). Net-new substrate at Ruby.

**(18) Fixture-authoring discipline pattern.** Distinct from Pattern 7. Matches framework-generator-defaults (Rails 8.0 fixture; Gemfile follows Rails 8 conventions) + LSP add-on architectural model (ruby-lsp-rails requires bootable Rails app).

**(19) ADR-21 amendment frequency observation.** 5 substantive amendments within v0.9 cycle. Cross-adapter precedent: ADR-13 + ADR-14 §Symbol-kind sections shipped at original authoring without substantive amendments. ADR-21's amendment frequency reflects Ruby's structural complexity (no functions-vs-methods semantic split, class methods kind-12 divergence) vs Python/Go's relative LSP-mapping cleanliness. Substantive ADRs for structurally-complex languages should expect 3-5 §Symbol-kind mapping amendments within shipping cycle.

### Stream A backlog → v1.1

**Concrete v1.1 triggers (release-version-gated or cohort-feedback-gated):**

1. **`db/migrate/**` and `public/uploads/**` exclude pattern decisions.** v0.9.0 Substep 5.1 deliberately omitted from conservative Rails-excludePattern tier as potentially-substantive-content. v1.1 cohort feedback informs whether default-exclude makes sense.

2. **rbenv shims / RVM / chocolatey install detection refinements.** v0.9.0 Substep 5.2 doctor substrate covers these via filesystem + path checks. v1.1 candidate: surface non-PATH install detection findings empirically and refine heuristics.

3. **ruby-lsp 0.27+ probe re-execution.** Current v1.0 baseline anchors at ruby-lsp 0.26.9 + ruby-lsp-rails 0.4.8. When ruby-lsp 0.27 + ruby-lsp-rails 0.5 stable releases, re-run probe substrate against new versions. ADR-21 §Cohort-version range updates.

4. **Rails 8.1 + ruby-lsp-rails 0.5 compatibility.** v1.0 ships against Rails 8.0; cohort developers on Rails 8.1 may surface add-on friction. Empirical verification at v1.1.

**Phase 6 dogfood spillover:**

5. **Phase 6 weekend dogfood findings.** Travis recognition-service + commons Rails work-repo dogfood. Composes to ADR-21 §probe #6 (b) amendment if load-bearing findings surface; Limitations subsection candidates for add-on-enabled behavior differing from documentation citation.

**Scope expansion (substep deferrals):**

6. **ERB / .rake / .gemspec language extension support.** v1.0 ships `.rb` only. v1.1 candidate: add ERB template support (mixed Ruby + HTML/text); rake task + gemspec coverage. ADR-21 + LANG_CODES amendments.

7. **Deep ActiveSupport::Concern bubble-up.** v1.0 ships shallow `implements: ["ConcernModule"]`; deep Concern bubble-up (included do hooks, class_methods do blocks surfacing) deferred to v1.1.

8. **Multi-mixin-per-line + nested-block-scope-aware parsing.** Substep 3.6 declaration parser v1.0 scope handles top-level class body includes; v1.1 candidate for sophisticated mixin scanning.

9. **getTypeInfo `usedByTypes` implementation.** v1.0 ships empty array (degraded mode per language-structural-property local-parseability). v1.1 candidate: pass-1 inventory walk if cohort demands cross-class type-usage queries.

### Stream A test-infrastructure observations → v1.1 investigation candidates

**EBUSY tmpdir Windows flake (recurring across v0.9 cycle).** Test-infrastructure category, separate from Pattern 7. Multiple instances across Phase 3-5 substeps; isolated re-runs consistently pass. Worth v1.1 investigation — root cause analysis + remediation. May require test-infrastructure architectural change or simply tmpdir cleanup discipline.

### Tooling-discipline observations

**Heredoc-apostrophe interaction with single-quoted bash delimiter.** v0.9.0 4.3 catch. Workaround: commit-via-F file pattern. Worth v1.1 inheritance for any cycle authoring commit bodies with apostrophes.

**Multi-Ruby-install PATH precedence subtlety on Windows.** v0.9.0 Phase 1 catch — `where.exe` empirical disambiguation needed when both 3.3 + 4.0 RubyInstaller installs coexist. Doctor substrate handles via `lsp.ruby.multiple_ruby_installs` check (Substep 5.2).
