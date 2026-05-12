# v0_8-HANDOFF.md — Transitional substrate-storage document

**Purpose.** Canonical bridge document for v0.8 cycle pre-planning
inheritance from v0.7 cycle close. Post-v1.0-launch posture per
v0.7 launch-bearing reframe (v1.0 public launch substrate complete
at v0.7 ship; v0.8+ candidates queued post-launch per
[`research/v0.8-candidates.md`](research/v0.8-candidates.md)).

Mirrors v0_7-HANDOFF.md precedent at structure scale. Bounded
~150-200 LOC per Travis Step 5.0 LOCK 6 (β v0.5/v0.6 precedent;
§1-§4 framework).

---

## §1 Cycle-completion narrative

V0.7 launch-bearing cycle to v1.0 public launch substrate complete
landed 2026-05-12.

- **Ship commit:** `fe3ae7e` — "Step 5.3: v0.7.0 ship —
  launch-bearing cycle to v1.0 substrate complete" (3 files:
  CLAUDE.md + README.md + package.json; 197 insertions / 49
  deletions; ship-prep edits per LOCK 3 Scope (b) full launch-
  narrative refresh).

- **Annotated tag:** `v0.7.0` at ship commit `fe3ae7e` —
  "v0.7.0: launch-bearing cycle to v1.0 substrate complete"
  (annotated tag per v0.5/v0.6 precedent; tag body verified
  clean of HEREDOC artifacts via Step 7.5 post-execution
  verification + Adjudication 3 atomic ship-gate discipline-
  leveraging in-place fix for cosmetic `~$0.23` escape pattern;
  pre-fix tag SHA `8ab6cc1` deleted locally; recreated annotated
  tag points at same ship commit `fe3ae7e`).

- **Cross-repo back-reference:** benchmarks-repo `c2a1592` —
  "v0.7 ship cross-repo back-reference: Phase-10 §12 (v0.7
  launch entry; main-repo ship fe3ae7e + annotated tag v0.7.0)"
  (42 LOC appended at `research/phase-10-v0.6-reference-run.md`
  §12 revision history; honest LOCK 5 framing: v0.7 launch-
  bearing cycle main-repo only; benchmarks substrate generation
  deferred to v0.8+ post-launch per F1 atlas-substrate-version
  confound + matrix-completion deferral).

- **Step 5.5 close commit:** this commit (lands atlas refresh +
  v0_8-HANDOFF.md + STEP-PLAN-V0.7.md progress log per γ-1
  absorption shape; SHA reference back-filled at next handoff
  document update per established cross-document SHA-backfill
  pattern).

- **Package bump observation (FO-15 cascade empirically
  realized):** package.json bumped `0.6.0 → 0.7.0` at Step 5.2
  ship-prep edits; cascade through provenance fields empirically
  realized at Step 5.5 atlas refresh post-package-bump
  (`contextatlas_version="0.7.0"` populated at atlas.json
  generator block; `extracted_at_sha` advances to ship commit
  `fe3ae7e`). FO-15 self-absorbed at Step 2.4 Checkpoint 3;
  cascade is empirically right behavior per locked v0.7
  substrate. Step 5.5 atlas refresh cost: $0.1944 / 36.5s / 1
  changed file (README.md re-extracted per Phase 4 SHA-diff
  incremental refresh detecting Step 5.2 ship-prep edits);
  ADR-12 incremental refresh substrate empirically validated
  at runtime ship-gate surface.

- **CLAUDE.md Current Version block update:** ship commit
  `fe3ae7e` substantively updates Current Version block (v0.6 →
  v0.7 transition; v0.7 outcome + methodology limits inserted;
  v0.6 preserved as historical record; v0.7+ candidates →
  v0.8+ candidates pointer to `research/v0.8-candidates.md` +
  v0_8-HANDOFF.md; Historical references add STEP-PLAN-V0.7.md
  + v0.7-SCOPE.md + v0_8-HANDOFF.md; trailing prose paragraph
  adds v0.7 sentence).

## §2 Substrate-inheritance framing

- **research/v0.8-candidates.md** — 21 v0.8+ forward-pointer
  candidates consolidated at v0.7 cycle close per Step 4 LOCK 5
  directive (honest scope-locking framing; context-window-
  resilience substrate; working substrate for v0.8 scope-doc
  drafting; NOT v1.0-release-bearing; F2-sequencing-style
  discipline preserved). Categories:
    - Substrate Evolution (7): β-3 empirical CLI cost+depth
      measurement; Reference-context A/B; CLI multi-call
      investigation orchestrator; validate-atlas auto-
      invocation at index; contextatlas-on-itself Skill cohort
      entry path validation; /update-atlas Skill (contingent);
      Cross-ADR linkage emergence at CLI
    - Mechanical Absorption (3): FO-15 invariant; FO-16
      invariant; SDK upgrade ^0.27.0 → ^0.32.0
    - Cohort UX Refinement (4): commit-message filter for
      ContextAtlas; FO-9 PS wrapper; FO-11 --overwrite flag;
      FO-14 Skills-substrate-currency
    - Test Substrate (1): Flaky LSP-interaction tests inventory
    - TERTIARY deferred (3): A1 + A2 + A3 substrate gaps
    - Cross-cycle inheritance (3): CC1 cross-model measurement;
      CC2 recommended_model; CC3 Skill pre-flight model-
      detection

- **17 Class-15 cycle-execution observations** preserved
  (substrate-distributed progress-log entries per Option b
  v0.6 Q8 aggregation precedent; capstone composition at
  named-framework-target 15 held through Step 3.2 close; v0.7
  ship-gate substep cluster surfaced 2 additional cycle-close-
  emergent instances per Step 5.5 LOCK Option C honest empirical
  pattern recognition — instance 16 dev-empirical-correction-
  of-advisor-attribution-framing-at-destructive-action-boundary
  at Step 5.2/5.3 atlas.json revert surface + instance 17 dev-
  empirical-cosmetic-blemish-detection-at-canonical-launch-
  artifact-surface + atomic-ship-gate-discipline-leveraging-for-
  remediation at Step 5.4 surface).

- **v0.7-SCOPE.md verification outcome** (per Step 4 cycle
  thesis evaluation): 3-of-4 tier MET + TERTIARY deferred to
  v0.8+. PRIMARY (a) ✓ MET; PRIMARY (b) ✓ MET; SECONDARY ✓
  MET; TERTIARY deferred to v0.8+ per honest-scope-
  acknowledgment.

- **V1.0 ship-gate criteria evolution post-v0.7:** 2-of-3 MET
  + 2 carried-forward:
    - criterion #1 quality-axis methodology parenthetical ✓
      MET (CLOSED at v0.5; preserved post-v0.7)
    - criterion #1 statistically-meaningful-wins △ PARTIAL
      (v0.6 8-cell subset → v0.8+ matrix-completion)
    - criterion #2 user-can-install-without-friction ✓ MET
      (newly CLOSES at v0.7 via PRIMARY (a) + PRIMARY (b)
      pipeline-mechanics empirical verification)
    - criterion #3 external dogfood trial ✗ NOT MET (v0.6
      Tier 3 cancellation → v0.8+ post-launch cohort exposure
      execution against carried-forward recruitment
      infrastructure)

## §3 v0.8 cycle pre-planning surface

Post-v1.0-launch posture. Forward-pointer scope handoff scope
items grouped by carry-forward dimension:

- **Cohort exposure execution** (v0.6 Tier 3 deferred):
  execute cohort exposure against carried-forward v0.6
  recruitment infrastructure (feedback template + tool-
  description observability + ADR-20 consent contract +
  recruitment infrastructure; B17 hybrid capture preserved
  per Q9.0.11 lock at v0.6 Step 9.0). Closes V1.0 ship-gate
  criterion #3.

- **F1 atlas-substrate-version confound causal investigation**
  (v0.6 finding): cross-cycle tier-gradation comparison must
  control for atlas-substrate-version; v0.6 measurements
  against v0.5.0 atlas (not v0.4.0 atlas v0.5 baseline)
  exposed methodological substrate-shift; causal mechanism
  investigation deferred to v0.8+. F9 methodology-design-gap
  tag-only-not-control pattern observation inherited as v0.8+
  design discipline (tag-AND-control pattern for cross-cycle
  methodology comparison frameworks).

- **Stream B matrix-completion graduation** (v0.6 8-cell
  subset → v0.8+ full matrix): v0.6 shipped 8-cell matrix-
  replication subset (5 anchors + 3 tier-gradation test
  points); v0.8+ closes statistically-meaningful-wins gate
  per criterion #1 second parenthetical via full matrix-
  completion.

- **Cross-vendor judge-panel graduation** (v0.5+ single-judge-
  model limit): single-judge-model methodology preserved from
  v0.5 limit through v0.6 + v0.7 cycles; cross-vendor judge-
  panel graduation deferred to v0.8+ post-launch per Phase-9
  ref-doc §9 candidates table.

- **21 cycle-emergent candidates** at `research/v0.8-
  candidates.md` (categorized inventory; honest scope-locking
  discipline framing; v0.8 scope-doc drafting substrate).

## §4 v0.7-SCOPE.md absorbed-item annotations

Per v0_7-HANDOFF §4 precedent (mark scope-doc items
absorbed-at-cycle-close vs deferred-to-v0.8+).

- **PRIMARY (a) — claude-code-only extraction path:** ✓
  ABSORBED at v0.7 cycle close. B13 functional implementation
  + Path-3 entry-point-determined architecture shipped (ADR-02
  graduation + §1.4b/§2.3.a/b/c/§2.4.a amendments; Strategy
  pattern + Skills mechanism + legacy deprecation cycle;
  /index-atlas SKILL.md subscription-bounded path empirically
  validated at rich-skill/).

- **PRIMARY (b) — Generate-adrs feature:** ✓ ABSORBED at v0.7
  cycle close. CLI subcommand + Skills SKILL.md + refined
  GENERATE_ADRS_PROMPT (Step 2.3.c.0 4-dimension refinement);
  Scope γ' multi-format substrate; reference-context
  empirically validated; β-1 + β-2 closed CLI substrate-
  equivalence at Step 2.4.a.

- **SECONDARY — Install + setup empirical verification:** ✓
  ABSORBED at v0.7 cycle close (substantively scoped to 2-repo
  ContextAtlas-on-itself + Rich per Travis mid-cycle scope
  refinement). Both repos complete Phase 1-4 per Q2.0.2
  closure criteria; 4-cohort entry-surface framing shipped
  (CLI + Skill × cold-start + reference-context).

- **TERTIARY — A1 + A2 + A3 substrate-gap fixes:** ✗ DEFERRED
  to v0.8+ at `research/v0.8-candidates.md` TERTIARY deferred
  category per Step 4 LOCK 5 honest-scope-acknowledgment;
  Travis Lock 2 cycle-pacing discipline preserved.

---

## Revision history (v0_8-HANDOFF.md)

- **2026-05-12 (Step 5.5 close handoff)** — initial draft per
  Travis Step 5.0 LOCK 6 (β v0.5/v0.6 precedent; ~150-200 LOC
  bounded; §1-§4 framework structure mirrors v0_7-HANDOFF.md
  precedent). Substrate-inheritance bridge from v0.7 launch-
  bearing cycle close to v0.8+ post-launch cycle pre-planning.
  Cross-repo back-reference benchmarks-repo `c2a1592` → main-
  repo ship `fe3ae7e` + annotated tag `v0.7.0`.
