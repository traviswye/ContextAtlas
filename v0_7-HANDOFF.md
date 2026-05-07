# v0_7-HANDOFF.md — Transitional substrate-storage document

**Status:** Transitional substrate-storage document. Captures
v0.7-relevant substrate from v0.6 cycle-pre-planning session
(2026-05-05) to preserve across session boundaries before v0.7
cycle-pre-planning at v0.6 cycle close.

**Lifecycle:** Created at v0.6 cycle launch (post-Phase-3 v0.6-
SCOPE.md commit `a8d01eb`); consumed at v0.7 Phase 1 enumeration
(post-v0.6 cycle close); retired after v0.7-SCOPE.md drafts
substrate into canonical scope-doc form.

**Related documents:**
- `v0.6-SCOPE.md` (canonical v0.6 scope; commit `a8d01eb`)
- `STEP-PLAN-V0.6.md` (initialized at v0.6 cycle launch Step 1.0)
- `ROADMAP.md` v0.6 [PLANNED] section (current-cycle-planning;
  cross-references this HANDOFF document for v0.7 substrate)
- `ROADMAP.md` v0.7 [PLANNED] section (next-cycle-planning;
  cycle-thesis-level substrate)
- `STEP-PLAN-V0.5.md` Step 11 progress log entry (5 ship-gate
  disciplines + 4 procedural patterns documentation)
- `research/v0.5-candidates.md` (canonical for 9 unabsorbed v0.5+
  items per Q10 two-substrate distinction)
- `../ContextAtlas-benchmarks/research/phase-9-v0.5-reference-run.md`
  §9 (cycle-emergent v0.6+ candidates)

---

## v0.6 cycle-pre-planning session timeline

Single working session 2026-05-05. Three-phase work:
1. **Phase 1** — 48-item backlog enumeration (broad-scan agent +
   close-read merge across canonical + cycle-emergent + ADR
   carry-forwards + methodology limits)
2. **8-item adversarial debate phase** — Items 1-8 + 2 reconsiders
   (Items 2 + 5; Travis personal-notes substrate folded at Item 5)
3. **Phase 2 triage** — classification under Strategy B-with-
   explicit-launch-staging
4. **Phase 3 v0.6-SCOPE.md drafting** — sectional A/B/C/D/E
   surface-inline-before-commit cadence applied recursively
5. **v0.6-SCOPE.md commit** `a8d01eb` (pushed to origin)

---

## Items 1-8 adjudication summary

| Item | Question | Adjudication |
|---|---|---|
| 1 | C1 task-shaped queries — v0.6 or v0.7+? | v0.7 (designed against v0.6 task-shape demand signal; avoids v0.5-Step-6-mistake-pattern) |
| 2 | B13 production-pipeline single-dependency architecture — v0.6 or v1.x? | Split: B13 enters v0.6 Q-list as deferral-lock entry; v0.6 progress-log captures organically; v0.7 adjudicates with substrate. **Reconsider applied:** v0.6 ships flags supporting both architectures (path b: flags-with-explicit-pending-resolution) |
| 3 | Matrix-replication for criterion #1 — v0.6 or v0.7? | Split: subset matrix-replication at v0.6 (3 cells targeted at tier-gradation test points); full matrix-replication at v0.7 |
| 4 | B17 formalize self-use logging — Q-list or dedicated artifact? | Hybrid synthesis with cycle-close-synthesis-decision pattern (progress-log primary + lightweight cross-cutting file secondary; cycle-close synthesis decision per Item 4 procedural pattern) |
| 5 | A7 onboarding-arc cluster scope — minimal or complete? | Onboarding-minimal-with-cohort-feedback-instrumentation (init + smoke + cohort feedback template + tool-description observability). **Reconsider applied:** path β refined with existing-repo-vs-new-project branching per Travis personal-notes substrate; flexibility-as-feature design principle locked |
| 6 | External dogfood trial timing — v0.6 or v0.7? | Split mechanism-shape: v0.6 ships recruitment infrastructure; v0.7 ships external trial execution |
| 7 | Methodology-discipline carry-forwards — cheap-refine or explicit-cycle-attention? | Hybrid bundle with elevated items: tier-1 elevated (E2 + B15) at v0.6 deferral-lock visibility; tier-2 bundled (B2/B5/B6/B7/B9/B11/E1) with cycle-close re-evaluation |
| 8 | Evidence-gated items — aggressive defer to v1.x or some v0.7? | Per-item three-bucket split: tier 1 v0.6-evaluable (B1); tier 2 v0.7-evaluable (B3 + B8); tier 3 already-evaluable defer-with-rejection (C8); tier 4 genuinely-v1.x forward-pointer (C7/C9/C10/C13/D1) |

---

## 4 procedural patterns from debate phase

Compose v0.6 scope-doc structural substrate alongside 5 ship-gate
disciplines from v0.5 cycle close. **9 substrate-carry-forward
patterns total** for v0.6+ inheritance.

1. **Item 2 — Deliberation-Q-list-item vs Deferral-lock-Q-list-
   item distinction.** Single-question visibility for deferred-
   with-clear-handoff decisions (procedural-overhead light;
   substrate-handoff explicit); multi-round Q-list reserved for
   substantive-disagreement decisions (multi-paragraph treatment;
   cycle-thesis-level adjudication).

2. **Item 4 — Cycle-close-synthesis-shape-decision pattern.** Don't
   pre-commit synthesis shape at scope-doc-drafting time; evaluate
   honestly at cycle close based on observed substrate volume.
   Discipline #4 honest-scope-acknowledgment over retroactive-
   checkbox preserved per pattern.

3. **Item 7 — Tier-1-elevated-vs-Tier-2-bundled pattern.** Item-
   level Q-list weight scales with item-load-bearing-weight within
   category. Tier-1 elevated entries get individual deferral-lock
   visibility; tier-2 bundled entries consolidate at single Q-list
   entry covering multiple items with cycle-close re-evaluation
   discipline preventing indefinite-defer.

4. **Item 8 — Evidence-gate-status three-bucket scope-doc shape.**
   Single deliberation produces per-item assignments to evaluable-
   now / v0.6-or-v0.7-evaluable / genuinely-v1.x buckets without
   per-item Q-list overhead. Tier-3 already-evaluable items get
   explicit-rejection-documented at scope-doc; tier-4 genuinely-
   v1.x items consolidate at one-line forward-pointer entry.

---

## 6 v0.6 → v0.7 substrate-handoff dimensions

V0.6 cycle is substrate-generation-not-feature-completion. Each
of v0.7's 4 streams consumes specific v0.6 substrate dimensions:

1. **Cohort task-shape demand signal** (Item 1 lock; Stream C v0.6
   deliverable). Cohort feedback template captures task-shape
   demand observations during cohort exposure. v0.7 Stream D C1
   task-shaped queries (`why_does_this_fail`, `onboard_to_feature`,
   `audit_change`) designed against this empirical signal vs
   designing-in-vacuum.

2. **B13-flag usage substrate** (Item 2 reconsider lock; Stream A
   v0.6 deliverable). v0.6 ships optional flags exposing B13
   architectural choice (Anthropic API + Claude Code dual-
   dependency vs Claude Code only single-dependency). v0.6
   progress-log captures architecture-assumption observations
   organically per discipline #3 surface-inline-before-commit
   cadence. v0.7 Stream D B13 architectural decision evaluates
   v0.6 flag-usage data: which path users default to; what
   friction each produces; does single-dependency reduce setup
   friction substantively.

3. **Targeted matrix-replication subset validation** (Item 3
   split-decision lock; Stream B v0.6 deliverable). v0.6 ships
   3-cell subset (1 ca-favorable + 1 tie-bucket + 1 trick-bucket)
   = 8-cell × n=5 × 2 conditions = ~80 trials testing v0.5 tier-
   gradation generalization at specific test points. v0.7 Stream
   B full matrix-completion: if v0.6 subset confirms, execution-
   only completion; if diverges, methodology amendment work
   alongside trial. v0.7 Stream B B3 evaluation as analysis-pass
   on v0.6 trick-bucket substrate.

4. **B17 self-use observations hybrid capture** (Item 4 cycle-
   close-synthesis-decision pattern; Stream C cross-cutting v0.6
   deliverable). Primary surface: STEP-PLAN-V0.6.md progress-log
   entries with `**Self-use observation:**` sub-blocks. Secondary
   surface: lightweight `research/v0.6-self-use-log.md` append-
   when-observed. v0.7 H2 ADR generation pipeline design consumes
   v0.6 Travis self-use observations on contextatlas atlas
   extraction patterns; v0.7 H1 hook/kickoff design consumes
   v0.6 self-use observations on returning-session UX gaps.

5. **Cohort feedback + tool-description observability + slash-
   command demand signal** (Item 5 reconsider lock; Stream C
   v0.6 deliverable). Structured feedback isolating natural-
   routing failure modes from tool-description failure modes
   from missing-functionality failure modes. Tool-description
   observability data correlates feedback with actual MCP tool
   invocation behavior. v0.7 Stream A H1 + H3 design consumes
   returning-session-UX-gap signal; v0.7 Stream D slash command
   design consumes explicit-invocation demand signal.

6. **Recruitment infrastructure** (Item 6 split mechanism-shape
   lock; Stream C v0.6 deliverable). Recruitment process
   documentation + trialist screening criteria + structured
   feedback template + pre-trial onboarding documentation. v0.7
   Stream C external trial execution inherits + extends for
   systematic external recruitment.

---

## 4 ambiguity adjudications (Phase 1+2 transition)

| Item | Question | Adjudication |
|---|---|---|
| B14 | `src/extraction/pricing.ts` Opus 4.7 staleness fix — v0.5+ housekeeping or v0.6 scope? | Pre-v0.6-housekeeping commit any time before v0.6 cycle close (~30 LOC fix; stale $15/$75 vs verified $5/$25 Opus 4.7 pricing) |
| B16 | Cycle-based aggregation alternative — keep open or close-as-superseded? | CLOSE as superseded by atlas-version-based filter per Q4(i) lock (forward-applicable interpretation primary) |
| C12 | Phase 7 §5.3 hypothesis revisitation — actively-pursue v0.6 or evidence-gated still? | CLOSE as substantively-validated by v0.5 quality-axis cross-cell rollup + cost-discipline preservation. Document validation rationale in v0.6 scope-doc |
| C14 | Cobra contamination drift root-cause investigation — carry forward or drop? | EXPLICITLY DROP. F3 cycle-emergent finding at ref-doc §9 captures broader observation |

---

## V0.7 4-stream item-level descriptions (from Phase 2 lock)

### Stream A — Onboarding-completion (5 items)

- **H1** Hook/kickoff script for Claude Code priming. Returning-
  session UX; runs in background on returning sessions vs visible
  setup pipeline on first session. Concrete realization of B12
  session-state context engine architectural pattern.
- **H2** ADR generation pipeline. Substrate-flexibility input
  dimension per flexibility-as-feature design principle: single
  pipeline accepting available substrate (code patterns + commits
  + README + DESIGN.md as present); descriptive when code-only
  (extracts decisions FROM code patterns); prescriptive when
  DESIGN.md substantive (extracts intent FROM design); quality
  scales with input richness. Replaces earlier "two paths"
  framing (existing-repo Path A vs new-project Path B) with
  substrate-flexibility-as-input-dimension framing.
- **H3** First-session-vs-returning-session routing logic. Coupled
  to H1; routing branch detecting first-session (full pipeline
  visibly) vs returning-session (hook/kickoff background only).
- **C3** README/`docs/` parsing for architectural claims. Folds
  into H2 implementation (README+DESIGN.md scanning is concrete
  realization of C3); H2 substrate-flexibility absorbs C3 scope.
- **B12** Session-state context engine general architectural
  pattern. Captures substrate-archaeology framing for future
  cycles considering extensions to other LLM-coding-tool surfaces;
  H1 is concrete Claude-Code-priming implementation.

### Stream B — Matrix-completion (3 items + methodology amendment work per v0.6 F1-F9)

**Substantively expanded by v0.6 cycle execution per F1-F9
findings.** Original 3 items below preserved; methodology
amendment work absorbed per v0.6-SCOPE §Rescope (2 axes
DIVERGE in v0.5-vs-v0.6 tier-gradation comparison per Step
5.3.b Phase-10 §8 Table 6).

- **Full matrix-replication completion** — remaining cells × n=5
  trials × 2 conditions = ~248 trials minus v0.6 8-cell subset
  (~80 trials) = ~168 trials remaining. Closes v1.0 ship-gate
  criterion #1 statistically-meaningful-wins gate. **v0.6 subset
  DIVERGED on 2 of 4 axes** (factual_correctness CLEAN→BORDERLINE;
  actionability BORDERLINE→NOT-distinguishable per Phase-10 §8);
  v0.7 absorbs methodology amendment work alongside completion.
- **B3** Trick-bucket override Axis 3 empirical validation —
  analysis pass on v0.6 trick-bucket substrate (Q2 v0.6 Stream B
  3-cell minimum); cobra/c6-execute-signature substrate available
  per Step 5.2 + 5.3.a-b shipping.
- **B4** Hono h1 beta-ca bimodal exploration root-cause
  investigation — F5; v0.7 Stream B if matrix-completion surfaces
  root-cause organically.
- **NEW: Atlas-version-control methodology amendment** (per F1
  + F9 substantive findings) — cross-cycle tier-gradation
  comparison must control for atlas-substrate-version. Concrete
  mechanism options at v0.7 design-time: (a) re-measure v0.5
  anchor cells against v0.5.0 atlas (50 trials × ~$20 platform-
  billed control cohort); (b) document confound + treat v0.6 as
  new baseline; (c) hybrid both. Causal mechanism investigation
  (atlas-content-volume vs quality vs time-of-measurement vs
  sample variance) deferred from v0.6 to v0.7 per F1 refinement.

### Stream C — Trial-execution (2 items)

- **External dogfood trial execution** — Item 6 lock; against v0.6-
  shipped recruitment infrastructure. Closes v1.0 ship-gate
  criterion #3 (at least one external trial completed).
- **B8** Sonnet output stability dependence on input ordering —
  analysis pass on v0.7 trial substrate; possible mitigations:
  JSON-only reminder prefix; schema-validation retry; pre-flight
  input validation.

### Stream D — Task-shape-API + B13-decision + substrate-gaps (6 items)

- **C1** Task-shaped bundle queries — Item 1 lock; (`why_does_this_fail`,
  `onboard_to_feature`, `audit_change`); designed against v0.6
  cohort task-shape demand signal.
- **Slash commands** — Item 5 lock; designed against v0.6 demand
  signal; mirrors VS Code / Claude Code slash-command UX precedent.
- **B13 architectural decision** — Item 2 lock; with v0.6 flag-
  usage substrate; ADR amendment if revision approved; flag
  deprecation handled at v0.7+ if approved.
- **A1** `classifyError` catch-all conflates JSON-parse vs API
  errors — substrate gap; cross-cuts task-shape API error-surface
  design.
- **A2** `extractDocstringsForFile` non-idempotent at symbol level
  — cross-cuts H2 re-run UX; symbol-id-keyed idempotency.
- **A3** `pipeline.ts` Stage 5 deletion handling defeats Stream C
  idempotency — paired with A2; claim-source-aware deletion sweep.

---

## V1.0 ship-gate criteria closure timeline

| Criterion | Status post-v0.5 | Status post-v0.6 (projected) | Closes at |
|---|---|---|---|
| #1 quality-axis methodology parenthetical | ✓ CLOSED at v0.5 | ✓ CLOSED | — |
| #1 statistically-meaningful-wins gate | Open (matrix-replication v0.6+) | PARTIALLY ADVANCED (8-cell subset) | v0.7 matrix-completion |
| #2 onboarding pipeline shipped | Open | PARTIALLY ADVANCED (early-access pipeline-mechanics) | v0.7 onboarding-completion (H1 + H2 + H3 + C3 + B12) |
| #3 external dogfood trial | Open | Open (v0.6 ships recruitment infrastructure; not trial execution) | v0.7 trial execution |

V1.0 closure post-v0.7: all ship-gate criteria #1-#3 closed.

---

## V0.7 cycle weight calibration (Phase 2 Adjudication 4)

V0.7 estimated ~2-2.5× v0.5 cycle weight at Phase 2 surface;
substantively heavier than v0.5 + v0.6 cycles.

**Stream-level cost estimates (preview; firms at v0.7-SCOPE.md):**

| Stream | Items | Scope | Cost driver |
|---|---:|---|---|
| Stream A onboarding-completion | 5 | XL cumulative | $$$ (H2 dominates; substrate-flexibility design + implementation) |
| Stream B matrix-completion | 3 | L cumulative | $$$$$ (~168 trials remaining; matrix-completion dominant cost driver) |
| Stream C trial-execution | 2 | M cumulative | $$ (trial execution + analysis pass) |
| Stream D task-shape-API + B13 + substrate-gaps | 6 | XL cumulative | $$ (design + implementation across multiple deliverables) |

**Mitigations (locked at v0.7 scope-doc drafting per v0.6
empirical signal):**
- **Stream rebalancing:** descope substantively-heavier streams
  to v1.x post-launch
- **Cycle splitting:** v0.7 + v0.8 → v1.0 instead of v0.7 → v1.0

V0.6 cycle execution + close empirical signal informs realistic
v0.7 envelope at scope-doc drafting time.

---

## Items 2 + 5 reconsider locks

### Item 2 reconsider — B13 path b (flags-with-explicit-pending-resolution)

V0.6 ships optional flags exposing B13 architectural choice as
user-facing CONFIG-FLAG (not just internal architecture per
original Item 2 framing).

Flags supporting both architectures during v0.7 decision period:
- `--architecture=anthropic-api-claude-code` (default; current
  dual-dependency)
- `--architecture=claude-code-only` (proposed single-dependency)

[Flag names placeholder; subject to UX refinement at A7
implementation Step 1 design phase.]

Explicit scope-doc framing: flags ship at v0.6 with explicit
"pending architectural resolution at v0.7" framing; v0.7 ADR
amendment if revision approved; flag deprecation at v0.7+.

### Item 5 reconsider — Path β refined with existing-repo-vs-new-project

Travis personal-notes substrate folded:
- Existing-repo branching: doctor detects code exists + ADRs missing/sufficient
- New-project branching: doctor detects minimal code + no ADRs + expects valid README + DESIGN.md per Path B requirement
- H2 reframed as single pipeline with substrate-flexibility input dimension (not two coupled items)
- Flexibility-as-feature design principle locked

V0.6 cohort handling for missing-ADR repos: doctor detects;
surfaces explicit guidance ("ContextAtlas requires ADRs; v0.6
doesn't auto-generate; please add ADRs manually then re-run
doctor"). Cohort selection biased toward existing-ADR repos.

V0.7 H2 ADR generation pipeline absorbs:
- Code-pattern inference (existing-repo path)
- README + DESIGN.md scanning (new-project path)
- Substrate-flexibility input dimension as primary design
  principle

---

## v0.6 cycle execution substrate (F1-F9 + methodology amendments)

**Added 2026-05-06 at v0.6 Step 5.4 close** per Path α handoff
amendment lock (matches v0.5→v0.6 inheritance pattern of curated
canonical-bridge capture). v0.6 cycle execution surfaced
substantive empirical findings + methodology amendment scope
substantively expanding original Stream B + Cycle-pre-planning
insights substrate.

**Canonical full substrate:** `../ContextAtlas-benchmarks/research/phase-10-v0.6-reference-run.md`
(11-section + 9 F-findings; auto-generated at Step 5.3.b commit
`23dd385`).

**Honest scope-acknowledgment.** v0.7 cycle scope substantively
expanded by v0.6 empirical findings beyond original Phase 2
substrate-handoff dimensions. Envelope projections (cost / wall-
clock / scope-bounds) firm at v0.7 cycle pre-planning per
substrate absorption — not silent-carry-forward from v0.6
projections.

### F1-F9 substantive findings (Phase-10 ref-doc §11)

- **F1 PRIMARY — Atlas-substrate-version confound surfaces in
  v0.5-vs-v0.6 tier-gradation comparison.** v0.5 baseline
  measured against v0.4.0 atlas; v0.6 measurements against
  v0.5.0 atlas. 5 v0.5 anchor cells (identical prompts;
  identical methodology) attenuate 28-100% on ALL 4 axes when
  re-run against v0.5.0 substrate. Decomposition rules out (β)
  noise-increase; primary mechanism atlas-substrate-version-
  correlated effect shift (γ); causal mechanism deferred to
  v0.7. 2 axes DIVERGE; 2 axes CONFIRM.
- **F2** — Anchor-cell attenuation pattern direction-uniform
  across all 4 axes (no axis strengthens; suggests atlas
  substrate evolution direction reduces ca-vs-beta-ca gap
  globally).
- **F3** — Cell-selection methodology lacked empirical
  differentiation pre-screen (3 v0.6 new cells contributed
  mixed effects per decomposition; theoretical bucket-tier
  framing alone insufficient).
- **F4** — F6 reframing as 2-axis retry policy (v0.5 F6
  position-deterministic framing → stochastic-failure with
  retry-same-config + swap-config orthogonal recovery axes;
  Path A swap-retry harness extension shipped at Step 5.3.a).
- **F5** — All 8 cells trigger variance threshold (vs v0.5
  5/5 anchors); 4 of 5 v0.5 anchors INCREASED variance in
  v0.6 substrate. Substrate-quality observation.
- **F6** — Cross-order agreement attenuated on hallucination
  axis specifically (Sonnet position-blindness reduced).
- **F7** — Cost-projection accuracy improved over v0.5
  baseline.
- **F8** — F6 reproduction at higher incidence (3/5 vs 1/5).
- **F9 METHODOLOGY-DESIGN GAP — tag-only-not-control
  pattern.** v0.6 cycle Q5.0.7 atlas-version-tagging
  discipline captured the tag in trial manifests but did NOT
  specify methodology-comparison-must-control-for-atlas-
  version. F1 confound emerges from this gap. Generalizable
  v0.7+ design discipline lesson.

### 5 methodology amendment scope items for v0.7 absorption

1. **Atlas-version-control methodology amendment** (F1 + F9) —
   cross-cycle tier-gradation comparison must control for
   atlas-substrate-version (re-measurement against current
   atlas; OR document confound + treat as new baseline; OR
   hybrid).
2. **Cell-selection empirical pre-screen methodology
   amendment** (F3) — n=2 dry-run trials per candidate cell
   before n=5 commitment.
3. **2-axis retry policy methodology** (F4) — retry-same-
   config + swap-config orthogonal recovery axes; Path A
   harness extension at Step 5.3.a ships methodology
   improvement; v0.7 inheritance.
4. **Variance-control auto-stretch refinement** (F5) — extend
   stretch to high-variance non-hono cells with budget-
   controlled limit.
5. **Causal mechanism investigation for atlas-version-
   correlated attenuation** (F1 deferred work) — disambiguate
   atlas-content-volume vs quality vs time-of-measurement vs
   sample variance via re-measurement + content-source
   ablation studies.

### Cross-references

- Phase-10 ref-doc full §11 narrative:
  `../ContextAtlas-benchmarks/research/phase-10-v0.6-reference-run.md`
- v0.6 Step 5 close progress log batching:
  `STEP-PLAN-V0.6.md` Step 5.4 entry (commit `f2e0c08`)
- Decomposition analysis substrate:
  `../ContextAtlas-benchmarks/scripts/v0.6-step5.3-decomposition.mjs`
- cost-priors-v0.6.json cumulative snapshot:
  `../ContextAtlas-benchmarks/cost-priors-v0.6.json`

---

## Cycle-pre-planning insights (substrate for v0.7 scope-doc)

Substrate observations from v0.6 cycle-pre-planning + v0.6
cycle-execution that inform v0.7 scope-doc-drafting beyond
Phase 2 lock specifics:

- **Adversarial debate format empirically validates cycle-
  architecture decisions.** 8-item debate phase + 2 reconsiders
  produced substantively-coherent Strategy B-with-explicit-launch-
  staging across cycle-architecture / scope-bounding / procedural-
  pattern dimensions. Debate format scales for cycle-pre-planning
  work; v0.7 cycle-pre-planning at v0.6 cycle close should
  consider similar adversarial format if substantive disagreements
  emerge.

- **Phase 1 enumeration substrate value substantial.** 48-item
  inventory + 8 substrate-handoff dimensions + procedural patterns
  + ambiguity adjudications produce comprehensive cycle-pre-
  planning substrate. Hybrid agent + close-read pattern (Explore
  agent for broad-scan; dev close-read for canonical-context
  sources) efficient for inventory work.

- **Procedural patterns from debate phase extend ship-gate
  discipline framework.** v0.5 introduced 5 ship-gate disciplines
  + 9-step locked sequence with Step 7.5 post-execution
  verification. v0.6 cycle-pre-planning introduced 4 additional
  procedural patterns at scope-doc structural level. Pattern
  composition at v0.6 application time may surface additional
  refinements (Q11-style explicit-flag pattern); v0.7 cycle-pre-
  planning may inherit additional procedural patterns from v0.6
  execution observations.

- **Strategy B-with-explicit-launch-staging methodology-defensible.**
  Across 8-item debate, every adjudication reinforced Strategy B
  framing (vs alternative Strategy A pure-v0.7 deferral or
  Strategy C v0.6-bundle-everything). v0.7 cycle-pre-planning
  should preserve Strategy B framing unless v0.6 cycle execution
  surfaces substantive substrate that warrants reframing.

- **Cycle-weight calibration concern is real.** v0.7 ~2-2.5× v0.5
  estimate at Phase 2 surface; substantial. Mitigations available
  but warrant explicit attention at v0.7 scope-doc drafting; not
  silent-defer-to-execution. **v0.6 cycle execution further
  expanded v0.7 scope per F1-F9 findings + 5 methodology
  amendment scope items**; v0.7 envelope projections firm at
  pre-planning per substrate absorption.

- **F9 tag-only-not-control methodology-design pattern (NEW
  v0.6 cycle execution observation).** v0.6 cycle Q5.0.7 atlas-
  version-tagging discipline captured the tag in trial manifests
  but did NOT specify methodology-comparison-must-control-for-
  atlas-version. Pattern: design-time discipline locks must
  specify what comparison frameworks must enforce, not just
  what trial substrate must record. v0.7+ design discipline
  inheritance: tag-AND-control pattern.

- **Substantive-interpretation cadence pattern (NEW v0.6 cycle
  execution observation).** Discipline #3 surface-inline-before-
  commit cadence applied at substantive-INTERPRETATION moments
  (not just substantive-implementation moments) materially
  improved F-finding framing quality. v0.6 Step 5.3.b
  decomposition surface refined F1 PRIMARY framing from generic
  "v0.5 tier-gradation does NOT fully generalize" to specific
  mechanism-attributed "atlas-substrate-version confound" via
  Path B decomposition analysis. Pattern: when paired-t outcomes
  surface unexpected results, surface decomposition INTERPRETATION
  inline before committing F-finding framing — captures more
  substantively-grounded substrate for downstream consumption.
  v0.7+ cycle-pre-planning + execution: apply discipline #3
  cadence at substantive-interpretation moments not just
  substantive-implementation moments.

- **Cycle-emergent candidate-capture at Phase-10 §9 inheritance
  (NEW v0.6 cycle execution observation).** v0.6 surfaced 6
  cycle-emergent candidates per Phase-10 §9 (529 retry-coverage;
  h10 held_out filter; F6 reframing as 2-axis retry policy;
  variance trigger discipline; atlas-substrate-version-control
  methodology amendment; cell-selection empirical-pre-screen
  methodology amendment). Pattern matches Phase-9 §9 inheritance
  (cycle-emergent-only scope per v0.5 Q10 lock distinction);
  benchmarks-repo Phase-N ref-doc §9 is canonical cycle-emergent
  candidate inventory. v0.7 pre-planning consumes from Phase-10
  §9 directly.

---

## Revision history (v0_7-HANDOFF.md)

- **2026-05-05** — Document created at v0.6 cycle launch (post-
  Phase-3 v0.6-SCOPE.md commit `a8d01eb`). Captures v0.7-relevant
  substrate from v0.6 cycle-pre-planning session for preservation
  across session boundaries before v0.7 cycle-pre-planning at v0.6
  cycle close. Lifecycle: consumed at v0.7 Phase 1 enumeration;
  retired after v0.7-SCOPE.md drafts substrate into canonical
  scope-doc form.

- **2026-05-06** — Path α handoff amendment at v0.6 Step 5.4
  close per v0.5→v0.6 inheritance pattern (curated canonical-
  bridge capture for v0.7 cycle pre-planning). Three sections
  amended: Stream B Matrix-completion expanded with atlas-
  version-control methodology amendment item; NEW section
  "v0.6 cycle execution substrate (F1-F9 + methodology
  amendments)" inserted before Cycle-pre-planning insights
  (captures F1 atlas-substrate-version confound primary finding
  + F9 methodology-design gap + 5 methodology amendment scope
  items + Phase-10 ref-doc cross-reference); Cycle-pre-planning
  insights augmented with 3 NEW v0.6 cycle execution observations
  (cycle-weight calibration v0.6 expansion; F9 tag-only-not-
  control pattern; substantive-interpretation cadence pattern;
  cycle-emergent candidate-capture at Phase-10 §9 inheritance).
  Honest scope-acknowledgment annotation: v0.7 envelope
  projections firm at pre-planning per substrate absorption (not
  silent-carry-forward from v0.6 projections).
