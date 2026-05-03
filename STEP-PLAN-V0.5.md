# ContextAtlas v0.5 Step Plan

**Status:** Active execution plan for v0.5. See `## Revision history`
(bottom of document) for material scope/plan changes during execution.
**Last revised:** 2026-04-29 — initial authoring at v0.5 prep
session close. v0.5 scope per [`v0.5-SCOPE.md`](v0.5-SCOPE.md)
(commit `a695036`; status `[LOCKED]`); ROADMAP refresh per
`ROADMAP.md` (v0.4 ship refresh, commit `454fcc8`). 11 numbered
steps spanning Streams A/B/C + ship gate.

**What this document is:** The execution-level plan for v0.5 — step
order, per-step ship criteria, dependencies, ownership, and progress
tracking. Mirrors STEP-PLAN-V0.4.md structure.

**What this document isn't:** The scope doc. The thesis, stream-level
deliverables, success criteria, and rescope conditions live in
[`v0.5-SCOPE.md`](v0.5-SCOPE.md). This plan *implements* that scope;
it does not redefine it.

**Responsibility split:**

- [`v0.5-SCOPE.md`](v0.5-SCOPE.md) — *what* and *why*. Stable during
  execution; changes trigger revision notes here.
- **This document** — *how* and *when*. Evolves during execution;
  material rescopes get logged in `## Revision history`.

---

## Conventions

### Step structure

Each step below has six fields:

- **Scope.** One-line statement + pointer to the `v0.5-SCOPE.md`
  section it implements.
- **Ship criteria.** Concrete checkboxes, each verifiable via a
  committed artifact, passing test, or landed ADR. Vague criteria
  ("feature works") are not valid; they hide incomplete shipping.
- **Key decisions.** Choices that surface during execution. Not
  every step has them. When present, the decision itself becomes a
  progress-log note at ship time.
- **Depends on / Unblocks.** Explicit step numbers. Drives the
  execution-order diagram below.
- **Owner.** Who does the work. Three values:
  - **Claude** — Claude Code does the implementation work (code,
    tests, ADR text drafts, doc drafts).
  - **Travis** — User does the work directly (runs API calls,
    commits prompts under pre-registration, makes scope decisions
    requiring judgment, owns launch-doc personal notes).
  - **Both** — Sequential collaboration (Claude drafts, Travis
    approves/runs/commits, or vice versa).
- **References.** Scope-doc sections, prior ADRs, prior STEP-PLAN
  entries that anchor this step.

### Progress log entries

When a step ships, append an entry to `## Progress log` using this
format:

```
### Step N shipped — YYYY-MM-DD (commit SHA)
- Scope: [one-line from step definition]
- Outcome: [1-2 sentences on what actually shipped]
- Notable decisions: [if any surfaced during execution]
- Ship-criteria verification: [each criterion with evidence]
```

Reverse-chronological. Most recent on top.

### Revision history entries

If a step's scope, ship criteria, or dependencies change materially
*during execution*, append a revision note:

```
### 2026-MM-DD (commit SHA): Step N revised — reason.
Downstream impact: [affected steps].
```

**Threshold: material rescope.** Log if the change affects
`v0.5-SCOPE.md` OR changes downstream steps' ship criteria.
Tactical adjustments (minor re-ordering within a step, timebox
tweaks) don't need revision notes — rewrite in place with rationale
in the git commit.

---

## Execution order

Streams have natural dependencies enforced by the v0.5-SCOPE.md
Sequencing section:

1. **Step 1 design phase precedes all infrastructure
   implementation (Steps 2-5).** Rubric DESIGN, judge-model
   escalation criterion, anonymization protocol, statistical
   methodology, threshold values lock at Step 1; downstream
   implementation references the locks.
2. **Step 2 LLM-judge harness precedes Step 3 graded-output
   protocol.** Rubric prompt needs judge-call abstraction to wire
   against (per scope-doc Sequencing).
3. **Step 3 graded-output protocol precedes Step 4 double-blind
   harness AND Step 5 statistical tooling.** Step 5 is parallel-
   able with Step 4 (independent code surfaces).
4. **Step 6 pre-flight calibration MUST precede Step 7 production
   replication (gate-condition).** Within-judge consistency +
   Travis-intuition correlation thresholds clear before Step 7
   spends $25-40+.
5. **Step 7 production replication precedes Step 8 grading run.**
   Grading runs on Step 7 outputs; sequence is mechanical.
6. **Step 9 synthesis follows Steps 7-8.** Synthesis absorbs
   replication + grading data into phase-9 reference doc.
7. **Step 10 methodology riders follow Step 8.** #9 + #12 consume
   Step 7-8 trial/cost data; #7 + #8 cluster with Stream C for
   coherent ship.
8. **Step 11 ship gate follows Steps 9-10.** Cycle-close
   verification depends on synthesis + riders both shipped.

```
                 [1] Investigation + design phase
                              │
                              ↓
                             [2] LLM-judge harness
                              │
                              ↓
                             [3] Graded-output protocol
                              │
                  ┌───────────┴───────────┐
                  ↓                       ↓
                 [4] Double-blind     [5] Statistical
                     harness              tooling
                  │                       │
                  └───────────┬───────────┘
                              │
                  (Stream A complete)
                              ↓
                             [6] Pre-flight calibration
                              │   (gate-condition; Step 7
                              │    blocks if thresholds fail)
                              ↓
                             [7] Full statistical replication
                              │   (biggest API spend)
                              ↓
                             [8] Grading run
                              │   (second-biggest API spend)
                              ↓
                             [9] Synthesis + phase-9 ref doc
                              │
                              ↓
                            [10] Methodology riders
                              │   (Stream C: #9 + #12 + #7 + #8)
                              ↓
                            [11] v0.5 ship gate
```

Steps 1 → 2 → 3 → (4 ∥ 5) is sequential within Stream A with the
Step 4/5 parallel-able branch post-Step-3. Step 6 gates Step 7
(hard gate per scope-doc). Steps 7 → 8 → 9 → 10 → 11 is
sequential cycle-close.

---

## Steps

### Step 1 — Investigation + design phase

**Scope.** Design-lock all v0.5 methodology decisions before
infrastructure implementation begins. Per
[`v0.5-SCOPE.md`](v0.5-SCOPE.md) Stream A core components
(rubric design, anonymization protocol, statistical tooling
decisions) + §Decisions and open questions §7.2 (Q2 rubric
DESIGN; Q3 anonymization) + §7.3.1 (Step 6 stretch trigger
threshold).

**Ship criteria.**
- [ ] **Step 1.1 — Rubric design lock.** 4 axes (factual
  correctness; completeness; actionability; hallucination); 0-3
  scale; worked examples (2-3 per axis); edge-case handling
  (truncated outputs; non-English content; format-anomaly cases).
  Per F1 two-lock-point clarification: DESIGN at Step 1; PROMPT
  TEXT at Step 3.
- [ ] **Step 1.2 — Judge-model escalation criterion finalization.**
  Q1 escalation criterion deferred at scope-doc lock per §7.1.1.
  Pin lenience/strictness threshold for Sonnet → Opus escalation
  (e.g., "Sonnet calibration scores within ±X% of Travis-intuition
  per axis; outside band triggers Opus escalation").
- [ ] **Step 1.3 — Anonymization protocol lock.** Q3 5-step
  protocol locked: (a) strip condition labels (ca / beta-ca /
  alpha / beta); (b) strip filename markers (compact_format.txt
  etc.); (c) randomize A/B presentation order with logged seed;
  (d) judge prompt format-ignoring instruction; (e) post-hoc
  position-correlation verification trigger ≥60/40 → style-
  normalization stretch goal.
- [ ] **Step 1.4 — Statistical methodology lock.** CI library
  choice: Node-native simple-statistics vs implement t-distribution
  CI computation directly (decide based on Node-ecosystem
  licensing + dependency minimization principle). Aggregation
  tooling shape (per-cell + cross-cell; phase-9 reference doc
  scaffolding).
- [ ] **Step 1.5 — Threshold values lock.** Within-judge
  consistency ≥X% per-axis (lean ≥80%); Travis-intuition
  correlation coefficient ≥X (lean ≥0.6); Step 6 stretch-trigger
  threshold confirmed at >20% per-cell variance per scope-doc P3
  refinement.
- [ ] **Step 1.6 — ADR-19 draft.** LLM-judge methodology + rubric
  design + anonymization protocol cross-cutting ADR. Mirrors v0.4
  ADR-18 pattern (LSP timing-race readiness-signal cross-cutting
  reference). Load-bearing reference for Steps 2-8.

**Key decisions.**
- Q2 rubric design lock (per F1 DESIGN scope).
- Q3 anonymization protocol lock.
- CI library choice (simple-statistics vs t-distribution from
  scratch).
- Threshold values: within-judge consistency %; Travis-intuition
  correlation coefficient.
- Sonnet → Opus escalation criterion shape.
- Whether axes 1+4 (factual ↔ hallucination) compress to 3 axes
  if Step 6 calibration shows redundancy (deferred trigger;
  decision at Step 6 if surfaced).

**Depends on.** Nothing. Foundational Stream A item.
**Unblocks.** Steps 2, 3, 4, 5 (all infrastructure implementation
references Step 1 design lock); Step 6 (calibration thresholds
set at Step 1.5).
**Owner.** Both (Claude drafts design proposals + ADR-19 text;
Travis reviews + approves design decisions; Travis owns rubric
semantics for self-use signal incorporation per scope-doc §Self-
use during v0.5 cycle).
**References.** v0.5-SCOPE §Stream A core components; §Decisions
and open questions §7.2 Q2 + Q3; §7.3.1 stretch decision; §Self-
use during v0.5 cycle (rubric-design feedback signal); ADR-19
(to be drafted at 1.6); v0.4 ADR-18 pattern precedent.

---

### Step 2 — LLM-judge harness implementation

**Scope.** Build judge-call abstraction with Sonnet 4.6 default +
Opus 4.7 escalation backup; output capture; per-call cost
tracking; deterministic-where-possible; judge-agreement statistics
primitives. Per [`v0.5-SCOPE.md`](v0.5-SCOPE.md) Stream A LLM-
judge harness component.

**Ship criteria.**
- [ ] **Step 2.1 — Judge-client module.** `src/grading/judge-
  client.ts` (final placement per Step 1.4 decision); Sonnet 4.6
  default + Opus 4.7 escalation toggle; output capture; per-call
  cost tracking. Estimated ~200-300 LOC.
- [ ] **Step 2.2 — Deterministic-where-possible config.**
  Temperature set; seed if Anthropic API supports; documented
  config surface.
- [ ] **Step 2.3 — Judge-agreement statistics primitives.**
  `src/grading/agreement-stats.ts` (final placement per Step 1.4
  decision); within-judge consistency computation; cross-
  presentation-order agreement; correlation coefficient
  primitives.
- [ ] **Step 2.4 — Test coverage.** Mocked judge-API responses;
  cost-tracking correctness; statistics computation correctness
  against known distributions.
- [ ] **Step 2.5 — Probe runs against real Sonnet API.** Small
  dev-time spend; validates harness end-to-end.

**Key decisions.**
- Final placement of `judge-client.ts` vs `agreement-stats.ts`
  (Step 1.4 decision propagates).
- Mocking strategy for tests (vitest mocks vs fixture-based).

**Depends on.** Step 1.
**Unblocks.** Step 3 (graded-output protocol wires against judge-
client); Step 6 (calibration uses judge-client).
**Owner.** Claude (implementation + tests); Travis (probe-run
sign-off if API spend triggers >$1).
**References.** v0.5-SCOPE §Stream A LLM-judge harness;
§Decisions and open questions §7.1.1 judge-model lock; ADR-19
(drafted Step 1.6).

---

### Step 3 — Graded-output protocol (rubric prompt + harness wiring)

**Scope.** Rubric prompt text committed to source per F1 PROMPT
TEXT lock (Step 3); 4-axis scoring + harness wiring against Step
2 judge-client. Per [`v0.5-SCOPE.md`](v0.5-SCOPE.md) Stream A
graded-output protocol component.

**Ship criteria.**
- [ ] **Step 3.1 — Rubric prompt text drafted.** Per Step 1.1
  DESIGN lock: 4 axes (factual correctness; completeness;
  actionability; hallucination); 0-3 scale; worked examples;
  edge-case handling. Estimated 2000-4000 characters per
  `EXTRACTION_PROMPT` precedent.
- [ ] **Step 3.2 — Rubric prompt committed to source.**
  `src/grading/rubric-prompt.ts` analogous to
  `src/extraction/prompt.ts` precedent. Frozen per ADR-19;
  refinements require calibration evidence parallel to v0.3
  Step 9 docstring-calibration discipline.
- [ ] **Step 3.3 — 4-axis scoring harness.** Parses judge output;
  per-axis 0-3 score capture; aggregate scoring; ~150-250 LOC.
- [ ] **Step 3.4 — Harness wiring to Step 2 judge-client.**
  Rubric prompt feeds judge-client; output capture parses
  scores.
- [ ] **Step 3.5 — Test coverage.** Rubric-prompt parsing
  correctness; scoring correctness on fixture outputs.
- [ ] **Step 3.6 — Probe runs.** Dev-time API spend; validates
  end-to-end protocol.

**Key decisions.**
- Final placement of `rubric-prompt.ts`.
- Whether axes 1+4 paired (factual ↔ hallucination) compress to
  3 axes — decision deferred to Step 6 calibration if redundancy
  surfaces.

**Depends on.** Steps 1, 2.
**Unblocks.** Step 4 (anonymization wraps the protocol); Step 6
(calibration grades use rubric prompt).
**Owner.** Claude.
**References.** v0.5-SCOPE §Stream A graded-output protocol;
F1 two-lock-point clarification; ADR-19; ADR-02 (extraction
prompt single-source-of-truth precedent).

---

### Step 4 — Double-blind harness implementation

**Scope.** Output anonymization pipeline + judge-agreement
metrics + post-hoc verification harness. Per
[`v0.5-SCOPE.md`](v0.5-SCOPE.md) Stream A double-blind harness
component.

**Ship criteria.**
- [ ] **Step 4.1 — Output anonymization pipeline.** 5-step
  protocol per Step 1.3 lock: strip condition labels (ca /
  beta-ca / alpha / beta); strip filename markers
  (compact_format.txt etc.); randomize A/B presentation order
  with logged seed; metadata stripping. Estimated ~150-250 LOC.
- [ ] **Step 4.2 — Judge prompt format-ignoring instruction.**
  Wired into Step 3 rubric prompt as explicit instruction:
  "Ignore output format; evaluate substance against rubric."
- [ ] **Step 4.3 — Judge-agreement metrics.** Within-judge
  consistency via re-grade same trial; cross-presentation-order
  agreement; Travis-intuition correlation captured at Step 6.
- [ ] **Step 4.4 — Post-hoc position-correlation verification
  harness.** Computes position correlation across grading
  outputs; >60/40 trigger flag for style-normalization stretch
  goal per scope-doc.
- [ ] **Step 4.5 — Test coverage.** Anonymization correctness
  (label/marker stripping; seed reproducibility); metrics
  computation correctness.
- [ ] **Step 4.6 — Style-normalization stretch deferred.** Only
  ships if Step 8 post-hoc verification triggers.

**Key decisions.**
- Anonymization seed persistence policy (committed alongside
  trial outputs vs. ephemeral).

**Depends on.** Steps 1, 3.
**Unblocks.** Step 6 (calibration uses double-blind harness);
Steps 7-8 (production trials run through anonymization).
**Owner.** Claude.
**References.** v0.5-SCOPE §Stream A double-blind harness;
§Methodology limits output style leakage; §Decisions and open
questions §7.2.2 anonymization protocol; ADR-19.

---

### Step 5 — Statistical tooling implementation

**Scope.** CI computation library + per-cell + aggregate
reporting infrastructure. Parallel-able with Step 4 per v0.5-
SCOPE Sequencing. Per
[`v0.5-SCOPE.md`](v0.5-SCOPE.md) Stream A statistical tooling
foundation.

**Ship criteria.**
- [ ] **Step 5.1 — CI computation library implementation.** Per
  Step 1.4 lock decision (simple-statistics vs roll-our-own
  t-distribution); estimated ~100-200 LOC.
- [ ] **Step 5.2 — 95% CI on per-cell efficiency metrics at
  n≥5.** Tokens / calls / cost per-cell CI computation.
- [ ] **Step 5.3 — Aggregation tooling for cross-cell summary.**
  Per-condition + per-bucket aggregates; Phase 8 §6 framing
  reused.
- [ ] **Step 5.4 — Per-cell + aggregate reporting
  infrastructure.** Phase-9 reference doc scaffolding; auto-
  generated variance tables; ship-narrative credibility-line
  generation; ~100-150 LOC.
- [ ] **Step 5.5 — Test coverage.** CI computation correctness
  against known distributions; aggregation correctness on
  fixture trial data.

**Key decisions.**
- Library choice (Step 1.4 decision propagates).
- t-distribution lookup table approach if rolling our own.

**Depends on.** Step 1 (statistical methodology lock; library
choice).
**Unblocks.** Step 7 (production replication uses CI tooling);
Step 9 (synthesis uses aggregation tooling).
**Owner.** Claude.
**References.** v0.5-SCOPE §Stream A statistical tooling
foundation; §Methodology limits n=5 vs full statistical rigor.

---

### Step 6 — Pre-flight grading calibration (gate-condition)

**Scope.** Pre-flight calibration on Step 9 anchor cells before
Step 7 production replication. Within-judge consistency check +
Travis-intuition correlation. Both metrics MUST clear pre-defined
thresholds before Step 7 starts. Per
[`v0.5-SCOPE.md`](v0.5-SCOPE.md) Stream B pre-flight grading
calibration.

**Ship criteria.**
- [ ] **Step 6.1 — Within-judge consistency check execution.**
  10 trials × 2 passes × 4 axes via Sonnet 4.6 (batched-prompt-
  strategy). Per-axis score stability captured; aggregate
  consistency stat computed.
- [ ] **Step 6.2 — Travis-intuition correlation calibration.**
  Travis manually grades 3-5 trials × 4 axes = 12-20 manual
  grades. Judge-vs-Travis per-axis correlation computed.
- [ ] **Step 6.3 — Threshold verification.** Within-judge
  consistency ≥ Step 1.5 locked %; Travis-intuition correlation
  ≥ Step 1.5 locked coefficient. **Both gate Step 7.**
- [ ] **Step 6.4 — Calibration outputs persisted.** To phase-9
  reference doc OR companion artifact (placement decision
  deferred to Step 9; placeholder location at Step 6).
- [ ] **Step 6.5 — Step 7 stretch decisions.** n=7-8 stretch
  trigger if Step 6 calibration surfaces >20% per-cell variance
  on existing Step 9 anchors; tie/trick-bucket cell expansion
  budget review (post-Step-6 budget remaining).
- [ ] **Step 6.6 — Opus escalation gate.** If Sonnet calibration
  fails thresholds, escalate to Opus 4.7 + re-calibrate. Cost
  adder $15-20 per scope-doc; documented in Step 6 progress
  log entry.

**Key decisions.**
- Threshold pass/fail (per axis + aggregate).
- Opus escalation triggered or not.
- n=7-8 stretch on which cells (high-variance flagged at Step 6).
- Tie/trick expansion budget gate (remaining $ vs $80 trigger).
- Whether axes 1+4 compress to 3 axes if redundancy surfaced
  (per Step 1 deferred trigger).

**Depends on.** Steps 1, 2, 3, 4, 5 (full Stream A complete).
**Unblocks.** Step 7 (production replication; gate-condition).
**Owner.** Both (Claude implements calibration scripts + reports;
Travis runs API calibration + does manual grading + adjudicates
threshold decisions).
**References.** v0.5-SCOPE §Stream B pre-flight grading
calibration; §Decisions and open questions §7.3.1 stretch
decision; §Rescope conditions Step 6 calibration thresholds
fail; §Cost envelope (Step 6 base $10-25 + Opus escalation
$15-20).

---

### Step 7 — Full statistical replication (production-scale)

**Scope.** Production replication at scope-doc-locked anchor
cells × n=5 trials × ca + beta-ca conditions = ~50 production
trials. Plus optional stretch (tie/trick-bucket cells; n=7-8
high-variance cells per Step 6 decision). Per
[`v0.5-SCOPE.md`](v0.5-SCOPE.md) Stream B full statistical
replication.

**Ship criteria.**
- [ ] **Step 7.1 — Trial methodology pre-flight.** Identical to
  v0.4 Step 9 (no prompt changes; no condition changes; only
  re-runs); v0.4-shipped atlases as substrate (apples-to-apples
  vs Step 9 trials).
- [ ] **Step 7.2 — Anchor-cell trials run.** 5 anchor prompts ×
  n=5 × 2 conditions (ca + beta-ca) = 10 anchor cells × 5 = 50
  production trials. Anchor prompts: httpx/p4-stream-lifecycle;
  cobra/c3-hook-lifecycle; httpx/p2-http3-transport;
  hono/h1-context-runtime; cobra/c4-subcommand-resolution.
- [ ] **Step 7.3 — Stretch n=7-8 on high-variance cells.** Per
  Step 6 decision; cells flagged at Step 6 calibration receive
  n=7-8 trials.
- [ ] **Step 7.4 — Optional tie/trick-bucket cell expansion.**
  Per Step 6 decision; 2-3 cells × n=5 if budget remains.
- [ ] **Step 7.5 — Trial outputs persisted.** Run-manifest JSON
  files; provenance captured (judge model version; rubric
  version; anonymization seed; cell metadata; v0.4-shipped
  atlas SHA).
- [ ] **Step 7.6 — Per-cell metrics + CI computation.** Tokens
  / calls / cost recorded per trial; CI computation via Step 5
  tooling; per-cell + aggregate variance reported.
- [ ] **Step 7.7 — Variance check.** If per-cell variance >50%
  on multiple cells, escalate per scope-doc rescope conditions;
  recovery path: stretch n=7-8 on flagged cells (cost adder
  $5-10) per scope-doc.

**Key decisions.**
- Stretch n=7-8 cell selection (per Step 6 decision propagates).
- Tie/trick expansion cells (per Step 6 decision propagates).
- Variance escalation if >50% surfaced (per scope-doc rescope).

**Depends on.** Step 6 (calibration gate-condition cleared).
**Unblocks.** Step 8 (grading runs on Step 7 outputs).
**Owner.** Both (Claude implements trial scripts + monitoring;
Travis runs API replication + adjudicates stretch decisions +
commits).
**References.** v0.5-SCOPE §Stream B full statistical
replication; §Decisions and open questions §7.1.2 anchor list
lock; §Rescope conditions Step 7 unexpected variance; §Cost
envelope (Step 7 base $25-40 + stretch $10-15).

---

### Step 8 — Grading run (blind-grade Step 7 outputs)

**Scope.** All Step 7 production-replication outputs blind-graded
across 4 rubric axes; per-axis judge-agreement statistics
captured; per-cell + aggregate scoring. Output anonymization
protocol enforced; post-hoc position-correlation verification.
Per [`v0.5-SCOPE.md`](v0.5-SCOPE.md) Stream B grading run.

**Ship criteria.**
- [ ] **Step 8.1 — Step 7 trial outputs anonymized.** Via Step 4
  double-blind harness; 5-step protocol applied.
- [ ] **Step 8.2 — Grading-call execution.** 50+ grading calls
  across all conditions (depends on judge cost-per-call × output
  count × axes); per scope-doc cost estimate $15-25.
- [ ] **Step 8.3 — Per-axis 0-3 scores captured.** Aggregate
  per-cell + per-condition summaries computed via Step 5
  tooling.
- [ ] **Step 8.4 — Judge-agreement statistics computed.** Within-
  judge consistency on regrade subset; Travis-intuition
  correlation extended to grading data per Step 1.5 threshold.
- [ ] **Step 8.5 — Post-hoc position-correlation verification.**
  Computed via Step 4.4 harness; >60/40 triggers style-
  normalization stretch goal (re-render outputs through uniform
  formatter; re-grade subset).
- [ ] **Step 8.6 — Grading outputs persisted.** Run-manifest
  format; provenance (judge model version; rubric version;
  anonymization seed; cell metadata).
- [ ] **Step 8.7 — Variance check + rescope condition.** If
  quality-axis surfaces honest limits ("ties on most non-
  architectural prompts; wins on architectural-intent prompts
  only" per RUBRIC prediction), document per scope-doc rescope
  framing.

**Key decisions.**
- Style-normalization stretch trigger fires or not (>60/40
  position-correlation).
- Quality-axis honest-limits framing if surfaced (per scope-doc
  rescope conditions).

**Depends on.** Step 7 (production replication outputs).
**Unblocks.** Step 9 (synthesis absorbs grading findings).
**Owner.** Both (Claude implements grading scripts; Travis runs
API grading + commits).
**References.** v0.5-SCOPE §Stream B grading run; §Methodology
limits output style leakage; §Rescope conditions Step 8 grading
honest limits; §Cost envelope (Step 8 grading $15-25).

---

### Step 9 — Synthesis + phase-9 reference doc

**Scope.** Synthesize v0.5 evidence package; Phase-9 reference
doc shipped with named v0.5 findings; launch-narrative
credibility line escalation from v0.4 §8.7 floor to v0.5 ceiling.
Per [`v0.5-SCOPE.md`](v0.5-SCOPE.md) success criterion #8.

**Ship criteria.**
- [ ] **Step 9.1 — Per-cell + aggregate findings synthesized.**
  Efficiency CI bounds per cell; quality-axis blind-graded
  findings per win/tie/trick bucket; methodology defensibility
  framing.
- [ ] **Step 9.2 — Named v0.5 findings drafted.** TBD at
  synthesis time; expected: efficiency CI bounds VALIDATED;
  quality-axis findings per bucket; methodology defensibility
  CONFIRMED.
- [ ] **Step 9.3 — Phase-9 reference doc placement decision.**
  Per §7.3.2 deferred lock: new
  `research/phase-9-v0.5-reference-run.md` (benchmarks repo) OR
  companion supplement amendment per synthesis size.
- [ ] **Step 9.4 — Launch-narrative credibility line escalation
  drafted.** From v0.4 §8.7 floor ("v0.3 findings replicate
  within trial variance") to v0.5 ceiling ("CI-bounded efficiency
  wins + blind-graded quality measurements + judge-agreement
  statistics; methodology defensible under peer review").
- [ ] **Step 9.5 — Cross-cell summary published.** CI-bounded
  efficiency wins + blind-graded quality measurements + judge-
  agreement statistics; per-condition + per-bucket aggregates.
- [ ] **Step 9.6 — v1.0 ship-gate criterion #1 closure framing
  drafted.** Per ROADMAP §v1.0 ship criteria; closes on v0.5.

**Key decisions.**
- Phase-9 reference doc placement (Q7 deferred lock decision).
- Named-findings list (final wording at synthesis).
- Launch-narrative credibility line wording (Travis-owned voice;
  Claude drafts).

**Depends on.** Steps 7, 8.
**Unblocks.** Step 10 (riders absorb synthesis findings); Step
11 ship gate.
**Owner.** Both (Claude drafts synthesis + reference doc; Travis
approves named findings + credibility line + commits).
**References.** v0.5-SCOPE §Stream B (Step 9 synthesis closure);
§Decisions and open questions §7.3.2 phase-9 placement;
§Methodology limits acknowledged; ROADMAP §v1.0 ship criterion
#1.

---

### Step 10 — Stream C methodology riders

**Scope.** Smaller methodology-companion items shipping alongside
Stream A/B without scope balloon. Four items per
[`v0.5-SCOPE.md`](v0.5-SCOPE.md) Stream C.

**Ship criteria.**
- [ ] **Step 10.1 — #9 calls quantization → call-bucket
  reporting.** Switch variance reporting to call-buckets (1-3 /
  4-7 / 8+) for cells with low-N trial counts. ~30-60 LOC in
  benchmarks-repo reporting tooling. No API spend.
- [ ] **Step 10.2 — #12 adaptive per-repo cost ceilings (post-
  cycle aggregation).** `scripts/aggregate-cost-priors.mjs` in
  benchmarks repo; aggregates rolling N-run window from existing
  run-manifest JSON files; output `cost-priors-v0.5.json`
  (versioned snapshot). v0.5 cycle uses static v0.4-Step-3
  priors throughout (R1 refinement); adaptive priors apply to
  v0.6+ first runs. ~80-150 LOC + manifest aggregation. No API
  spend.
- [ ] **Step 10.3 — #7 schema-driven test data generation
  (parser.test.ts).** Replace hardcoded valid-keys regex with
  schema-derived test fixtures. Eliminates fragility recurrence
  per process-improvement candidate. ~50-100 LOC test-infra
  rework. No API spend.
- [ ] **Step 10.4 — #8 pipeline-integration scope-confusion
  discipline (CLAUDE.md formalization).** Lift discipline to
  CLAUDE.md as checked invariant for new claim sources. ~30-60
  LOC CLAUDE.md addition. No API spend.

**Key decisions.**
- None substantial; all four items have prior precedent or
  well-bounded scope.

**Depends on.** Step 8 (#9 + #12 absorb Step 7-8 trial/cost
data).
**Unblocks.** Step 11 ship gate.
**Owner.** Claude.
**References.** v0.5-SCOPE §Stream C; §Decisions and open
questions §7.1.4 adaptive priors lock;
[`research/v0.5-candidates.md`](research/v0.5-candidates.md) #7,
#8, #9, #12.

---

### Step 11 — v0.5 ship gate

**Scope.** v0.5 ship gate; matches v0.4 Step 11 single-ship-
commit pattern. Doc refresh + version bump + STEP-PLAN-V0.5
stamp + annotated tag v0.5.0. Per
[`v0.5-SCOPE.md`](v0.5-SCOPE.md) success criteria #1-#14.

**Ship criteria.**
- [ ] **Step 11.1 — Doc refresh bundle.** README + ROADMAP +
  DESIGN + CLAUDE.md updated for v0.5 ship per v0.4 Step 11
  pattern. Production-tool framing carried forward; methodology-
  rigor narrative landed; quality-axis blind-graded findings
  cited; v1.0 ship-gate criterion #1 closure noted.
- [ ] **Step 11.2 — Test suite green pre-bump.** Main-repo
  `npm test` PASS (859/859 v0.4 baseline + v0.5 test additions);
  benchmarks-repo green.
- [ ] **Step 11.3 — SCOPE-success-criteria verification.** All
  14 v0.5-SCOPE.md success criteria checked against committed
  artifacts. Verification block content lives in Step 11
  progress-log entry at cycle close per v0.4 ship-criteria-
  verification pattern; criteria-to-step mapping below for pre-
  cycle clarity:
  - SCOPE #1 (LLM-judge harness) verified at Step 2 + cycle
    close.
  - SCOPE #2 (graded-output protocol) verified at Step 1
    (DESIGN) + Step 3 (TEXT) + cycle close. **Multi-step
    verification trail** per F1 two-lock-point clarification.
  - SCOPE #3 (double-blind harness) verified at Step 4 + cycle
    close.
  - SCOPE #4 (statistical tooling) verified at Step 5 + cycle
    close.
  - SCOPE #5 (Step 6 calibration thresholds clear) verified at
    Step 6.
  - SCOPE #6 (Step 7 statistical replication) verified at Step
    7.
  - SCOPE #7 (Step 8 grading run) verified at Step 8.
  - SCOPE #8 (Phase-9 reference doc) verified at Step 9.
  - SCOPE #9 (methodology riders shipped) verified at Step 10.
  - SCOPE #10 (no quality-axis over-claims) — discipline
    criterion checked at Step 11.
  - SCOPE #11 (backlog discipline preserved) — Step 11.
  - SCOPE #12 (self-use during cycle documented) — Step 11
    (Travis-owned outside repo per Option B).
  - SCOPE #13 (test suites green) — Step 11.2.
  - SCOPE #14 (standard ship-gate) — Steps 11.4-11.7.
- [ ] **Step 11.4 — package.json bump 0.4.0 → 0.5.0.** Travis-
  owned per ownership split.
- [ ] **Step 11.5 — STEP-PLAN-V0.5 progress log Step 11 stamp.**
  Closeout stamp documenting all 11 ship criteria + v0.5 cycle
  closure. Embedded ship-criteria-verification block (14 criteria
  × evidence) per v0.4 precedent.
- [ ] **Step 11.6 — Annotated tag v0.5.0.** Tag message drafted
  by Claude; Travis approves before tagging. Push tag to origin.
- [ ] **Step 11.7 — All commits pushed.** v0.5 cycle definitively
  closes when origin reflects the tag.

**Key decisions.**
- Per-commit ladder shape (likely 4-5 commits matching v0.4
  pattern: doc refresh + version bump + stamp + tag).
- Self-use atlas refresh timing (BEFORE ship commit per v0.4
  precedent — atlas captures final substrate state; ship commit
  adds doc refreshes + version bump only).

**Depends on.** Steps 9, 10.
**Unblocks.** v0.5 closure; v0.6 planning queues next session.
**Owner.** Both (Claude drafts doc updates + stamp + tag message;
Travis approves + bumps + tags + pushes).
**References.** v0.5-SCOPE §Success criteria #1-#14; v0.4 STEP-
PLAN Step 11 pattern (ship-criteria-verification block in
progress log at cycle close); F1 two-lock-point clarification
(criterion #2 multi-step trail); STEP-PLAN-V0.5 §Revision
history (2026-04-29 initial drafting entry) documents Step 11.3
substep-addition rationale (deliberate refinement vs v0.4
6-substep pattern).

---

## Progress log

*Entries added in reverse-chronological order as steps ship.*

### Step 3 shipped — 2026-05-03

**Scope:** Canonical rubric prompt text per ADR-19 §1 + §3;
F1 PROMPT TEXT lock at Step 3 commits canonical rubric to
source.

**Outcome:** `src/grading/rubric-prompt.ts` shipped with two
exported constants (`RUBRIC_PROMPT_SINGLE`;
`RUBRIC_PROMPT_PAIRED`) pre-composed per ADR-02
`EXTRACTION_PROMPT` single-source-of-truth precedent. Lint-style
regression sentinel tests in `rubric-prompt.test.ts` catch
axis-name drops; JSON schema spec regressions; anti-RLHF
instruction loss; framing-prefix divergence between SINGLE and
PAIRED. Step 4 (double-blind harness) unblocks per
STEP-PLAN-V0.5 dependency graph.

**Substep summary:**

| Substep | Commit | Subject |
|---|---|---|
| 3.1+3.2 | `6ed89ce` | `rubric-prompt.ts` canonical text (378 LOC) |
| 3.5 | [this commit] | `rubric-prompt.test.ts` regression sentinels + Step 3 close |

**Notable decisions:**

- Two-constants pre-composed pattern (`RUBRIC_PROMPT_SINGLE` +
  `RUBRIC_PROMPT_PAIRED` + private `RUBRIC_PROMPT_BODY`) per
  Decision A of Step 3 design lock; matches ADR-02
  `EXTRACTION_PROMPT` precedent.
- Worked anchors via ONE pair of verbatim Phase 5 §5.1 fragments
  (ALPHA H4 + CA H4) + per-axis criteria-by-reference per
  Decision B; honest "real output" labeling.
- Axis 4 score-0 anchor labeled "hypothetical-illustrative" per
  ADR-19 §1 transparency note; `validator.fabricatedMethod()`
  name chosen for clearer hypothetical signal vs plausibly-real
  `validator.checkSchema()` (Q3 review refinement).
- Axis 2 score-3 anchor tightened to separate architectural
  anchor from mechanical flow requirements (Q1 review
  refinement; future Sonnet sees only opening fragment, not full
  answer).
- Six edge cases handled inline per ADR-19 §1 spec.
- `judge-client.ts` unchanged per Decision D; `req.rubricPrompt`
  stays required parameter.
- No probe-run at Step 3 per Decision C; Step 6 calibration
  ($10-25 envelope) IS canonical rubric's empirical test.
- 2-commit substep ladder per Decision E (3.1+3.2 + 3.5 close
  folded together).
- Step 3.5 test-design refinement: whitespace-normalized
  substring helper introduced for assertions whose target spans
  line boundaries (anti-RLHF instruction wraps after "do" in
  PAIRED canonical text). Regression sentinels resilient to
  line-wrap changes; catch word-drop, not wrap-position drift.

**Cumulative deltas:**

| Metric | Value |
|---|---:|
| LOC delta | +378 (`rubric-prompt.ts`) + 144 (test file) = 522 |
| Test delta | +18 (937 → 955) |
| Test files added | 1 |
| API spend | $0 (no probe per Decision C) |

**LOC scope-vs-estimate calibration:**

| Substep | Kickoff | Refined | Actual | Ratio (kickoff) | Ratio (refined) |
|---|---:|---:|---:|---:|---:|
| 3.1+3.2 | ~80 (2000-4000 chars) | 100-180 | 378 | 4.7× | 2.1× |
| 3.5 | ~80-120 | n/a | 144 | 1.4× | n/a |
| **Total** | **~200** | — | **522** | **2.6× weighted** | — |

Pattern continues from Step 2: kickoff estimates run light
(~2-5×); refined estimates land closer (~1.5-2× for prompt-text
work, ~1.4× for test-only work). Test-only substep (3.5) was
the closest-to-estimate substep across Steps 2-3; rationale:
test scope is cleanly bounded by spec count (5-8 sentinels →
written as 18 individual `it()` cases for per-axis clarity;
boundary expansion not scope creep).

**Test count progression:**

- 3.1+3.2: no tests (canonical text commit)
- 3.5: +18 (937 → 955; 4 describe blocks × 5-7 sentinels;
  per-axis-name cases broken out for readability)

Per-axis breakdown of test additions:
- `RUBRIC_PROMPT_SINGLE` block: 6 `it()` cases (axis names;
  scale; schema; discipline line; worked anchors; framing)
- `RUBRIC_PROMPT_PAIRED` block: 7 `it()` cases (same set + anti-
  RLHF instruction; paired-mode framing)
- Structural distinctness block: 3 `it()` cases (length; framing
  divergence; anti-RLHF PAIRED-only)
- Honest-labeling discipline block: 2 `it()` cases (hypothetical
  label; real-output label)

**API spend transparency:**

- Step 3 cumulative: $0 (no probe per Decision C)
- v0.5 cumulative through Step 3: $0.00891 (Step 2 probe runs
  only)
- Substantive API spend deferred to Step 6 calibration ($10-25
  envelope) per scope-doc; canonical rubric's empirical test is
  Step 6 within-judge consistency + Travis-intuition correlation
  on n=10 substrate.

**Findings carried forward:**

1. **Test-design pattern: whitespace-normalized substring
   helper for prose-content regression sentinels.** The
   anti-RLHF instruction "do not invent distinctions to break
   ties" wraps after "do" in canonical PAIRED text; raw
   `.toContain()` failed despite the instruction being
   present. Fix: `containsNormalized()` helper collapses
   whitespace before substring check. Pattern applies to any
   future test of multi-word instructions in prose-style
   constants where line-wrapping is a formatting choice. Caught
   pre-merge by following CLAUDE.md `npm test` discipline.

2. **18 vs 5-8 test cases — boundary expansion not scope
   creep.** Step 3 design proposal #6 projected 5-8 sentinels;
   actual ship has 18 individual `it()` cases. Rationale:
   per-axis-name checks broken into separate cases for
   readability and per-test failure isolation (if `factual_
   correctness` drops from PAIRED, the failure points at that
   exact axis rather than a generic "all-axes" assertion). 4
   logical sentinel groups (axis presence; schema; framing;
   honest labeling); 18 mechanical assertions implementing
   them. Same conceptual coverage; finer failure granularity.

3. **Estimation calibration extends across Step 3.** Kickoff-
   refined-actual ratios mirror Step 2 pattern: kickoff ~3×
   light; refined ~1.5-2× light. v0.6+ cycle LOC budgeting
   should continue applying ~3× kickoff multiplier. Step 3
   test-only substep (3.5) was closest-to-estimate (~1.4×);
   suggests test-substep estimation is materially more
   tractable than text-substep estimation (test scope binds
   to spec count; text scope binds to substantive content
   coverage which is harder to estimate at kickoff).

**Step 4 unblock:** double-blind harness implementation per
ADR-19 §3 + Step 1.3 5-step anonymization protocol lock.
Empirical strip-list already derived in ADR-19 §3 (inspection
of `httpx/p4-stream-lifecycle/ca.json` +
`httpx/p2-http3-transport/beta-ca.json`); Step 4 implements
against locked spec. Estimated LOC per scope-doc: ~150-250
across anonymization pipeline + agreement metrics + post-hoc
verification. Apply Step 2/3 calibration multiplier (~3× kickoff;
~1.7× refined) for v0.5 cycle estimation discipline.

---

### Step 2 shipped — 2026-05-01

**Scope:** LLM-judge harness implementation per
`v0.5-SCOPE.md` §Stream A LLM-judge harness component.
Sonnet 4.6 default + Opus 4.7 escalation toggle; output capture;
per-call cost tracking; deterministic-where-possible config;
judge-agreement statistics primitives.

**Outcome:** Stream A LLM-judge harness shipped. 5 substeps
across 7 commits; 4 production modules (`types.ts`, `pricing.ts`,
`judge-client.ts`, `agreement-stats.ts`) + 3 test files in
`src/grading/`; ADR-02 amended at Step 2.0 to permit `src/grading/`
as second `@anthropic-ai/sdk` caller; probe validated end-to-end
against real Sonnet 4.6 with PROBE PASS at $0.00891. Steps 3-5
unblocked.

**Substep summary:**

| Substep | Commit | Subject |
|---|---|---|
| 2.0 | `aeaa5e0` | ADR-02 amendment (extend permitted-modules to include `src/grading/`) |
| 2.1 | `d9bd006` | `types.ts` + `pricing.ts` foundational modules |
| 2.2 | `0b7bdc7` | `judge-client.ts` dual-mode (`gradeSingle` + `gradePair` per ADR-19 §3) |
| 2.3 | `3733d9c` | `agreement-stats.ts` (Step 6 gate metrics + threshold constants) |
| 2.4 (probe v1) | `4289b55` | Probe script first version |
| 2.4 (recalibration) | `d4e9d4d` | Criterion 3 floor 50 → 20 |
| 2.4 (close) | `dd7d87c` | Probe execution record |

**Notable decisions:**

- ADR-02 amendment (Step 2.0): `src/grading/` added as second
  permitted Anthropic API caller; query-time invariant preserved.
- Path B (dual-mode `gradeSingle` + `gradePair`) lock at Step 2.2:
  `gradeSingle` for Step 6 calibration; `gradePair` for Step 8
  production paired-comparison per ADR-19 §3 framing.
- Spearman tied-rank-Pearson implementation matches scipy default;
  for 0-3 ordinal scale, simplified formula `1 − 6Σd²/(n(n²−1))` is
  inexact when ties exist.
- Probe Criterion 3 floor recalibration (50 → 20) after Sonnet
  produced compliant compact JSON at 35 tokens; second run PROBE
  PASS bitwise-identical to first.

**Cumulative deltas:**

| Metric | Value |
|---|---:|
| LOC delta | +2327 insertions / −11 deletions / 2316 net |
| Test delta | +78 (859 baseline → 937) |
| Test files added | 3 |
| API spend | $0.00891 (two probe runs) |

**LOC scope-vs-estimate calibration:**

| Substep | Kickoff | Refined | Actual | Ratio (kickoff) | Ratio (refined) |
|---|---:|---:|---:|---:|---:|
| 2.0 | ~10 | n/a | 18 | 1.8× | n/a |
| 2.1 | ~80 | n/a | 250 | 3.1× | n/a |
| 2.2 | ~400 | ~500 | 846 | 2.1× | 1.7× |
| 2.3 | ~150 | ~480 | 799 | 5.3× | 1.7× |
| 2.4 | ~80 | n/a | 414 (probe + recal + close combined) | 5.2× | n/a |
| **Total** | **~720** | — | **2327** | **3.2× weighted** | — |

Pattern: kickoff estimates ~2-5× light; refined estimates
(post-design-proposal) ~1.5-2× light. Empirical evidence about
kickoff-stage estimation calibration; documented for v0.6+ cycle
budgeting refinement.

**Test count progression:**

- 2.0: no tests (doc commit)
- 2.1: +14 (859 → 873; pricing arithmetic + type-safety
  `@ts-expect-error`)
- 2.2: +30 (873 → 903; classifyError canaries + retry loop +
  schema validation across single + paired modes)
- 2.3: +34 (903 → 937; per-function boundary cases + Spearman
  textbook anchors + gate evaluation paths)
- 2.4: no tests (probe is dev-time scaffolding; not unit test
  substrate)

Test count estimates were ~1.4× light on average (consistent with
LOC pattern).

**API spend transparency:**

- Step 2 cumulative: $0.00891 across two probe runs
  ($0.004455 each at Sonnet 4.6 pricing verified 2026-04-30)
- Both runs below $1 cost-discipline threshold; Travis pre-approval
  scope held throughout
- Substantive API spend deferred to Step 6 ($10-25 calibration
  envelope) + Steps 7-8 (Stream B production + grading)

**Findings carried forward:**

1. **Finding 2 (Step 6 calibration substrate)** — Sonnet scored
   `hallucination=1` on the probe's verifiable httpx answer
   (`httpx/_models.py:635-639` + ADR-05 citations). Three plausible
   interpretations (Sonnet weak on httpx internals; placeholder
   rubric anchors underspecified; subtle overclaim in answer); Step
   6 calibration with Travis-intuition baseline adjudicates. If
   pattern recurs with factual-axis correlation < 0.6 AND other axes
   pass, Step 1.3 Option A→B pivot triggers (inline ADR ground-truth
   for Step 8 grading per ADR-19 §3). See
   `scripts/v0.5-step2-probe-output.md` §Finding 2.

2. **Finding 3 (Step 6 calibration substrate)** — Two probe runs
   produced bitwise-identical scores at temperature 0 on
   compact-JSON output workload. Suggests Sonnet 4.6 may be MORE
   deterministic than ADR-19 §2 "approximately-deterministic"
   framing implied — for compact-JSON workloads. Doesn't generalize
   to verbose grading-rationale workloads; Step 6 on canonical
   rubric is the empirical test; n=2 directional only; v0.5 design
   preserves the conservative caveat.

3. **Cost projection observation** — Opus 4.7 verified pricing
   ($5/$25 per MTok at 2026-04-30) is ~1.67× Sonnet (5/3 ratio),
   not the order-of-magnitude jump older pricing implied. ADR-19
   §2 Step 7-8 Option A cost projection (full Opus production)
   should be recalculated against current pricing pre-Step-6
   calibration. Pricing-ratio invariant test in `pricing.test.ts`
   serves as regression sentinel.

4. **`src/extraction/pricing.ts` staleness** — verified 2026-04-30:
   has stale Opus 4.7 pricing ($15/$75 vs verified $5/$25).
   Travis-flagged as separate small-housekeeping commit, NOT
   bundled into Step 2. Awaits Travis launch; not Step 2 scope.

5. **Estimation calibration insight** — kickoff LOC estimates ran
   ~3× light on average; design-proposal-refined estimates ~1.7×
   light. Not noise; pattern persisted across 5 substeps. v0.6+
   cycle LOC budgeting should apply 3× multiplier to kickoff
   estimates as default + surface design-proposal refinement before
   implementation begins.

6. **Substep decomposition refinement** — Step 2 originally listed
   5 ship-criteria substeps (2.1-2.5; per STEP-PLAN-V0.5 §Step 2).
   During execution, substep 2.0 (ADR-02 amendment) was introduced
   ahead of original 2.1; original 2.1-2.5 shifted to 2.1-2.4 + 2.5
   close. Refinement was substantive per the discovered ADR-02
   boundary; ship criteria coverage unchanged.

**Estimation calibration note for v0.6+ cycles:**

v0.5 Step 2 substep LOC actuals consistently ran 2-5× larger than
kickoff estimates. Refinement during design-proposal phase improved
accuracy to ~1.5-2×. Pattern persisted across all 5 substeps; not
noise. v0.6+ cycle LOC estimates should:

a. Apply ~3× multiplier to kickoff estimates as default
b. Surface design-proposal refinement BEFORE implementation begins
   (not after) for improved accuracy
c. Treat "kickoff estimate" as anchor for scope shape, not LOC
   budget — actual LOC depends on test coverage density + interface
   design surface that emerges during design phase

**Step 3 unblock:** graded-output protocol (rubric prompt text per
F1 PROMPT TEXT lock) unblocks per STEP-PLAN-V0.5 dependency graph.
Step 3 implements canonical rubric prompt committed to source per
ADR-19 §1; replaces the placeholder rubric used in Step 2.4 probe.
Step 3 prompt commits at `src/grading/rubric-prompt.ts` analogous
to `src/extraction/prompt.ts` precedent (ADR-02 single-source-of-
truth pattern).

---

## Revision history

- **2026-04-29** — Initial drafting at v0.5 prep session close.
  11 numbered steps spanning Streams A/B/C + ship gate. Mirrors
  STEP-PLAN-V0.4.md structure (6-field per-step structure;
  sub-steps as nested ship-criteria checkboxes; SCOPE success
  criteria verified at Step 11 cycle-close per v0.4 precedent).
  Drafted per [`v0.5-SCOPE.md`](v0.5-SCOPE.md) (commit `a695036`;
  status `[LOCKED]`) §Sequencing 11-step decomposition. Step 1
  sub-step decomposition: 5 design lock substeps + ADR-19 draft
  (mirrors v0.4 Step 1 ADR-13/14 amendments pattern). Step 11
  has 7 substeps vs v0.4's 6 — deliberate v0.5 refinement adding
  Step 11.3 SCOPE-success-criteria verification substep
  (rationale: 14 criteria > v0.4's 10 + F1 two-lock-point
  multi-step trail for criterion #2 warrants explicit pre-cycle
  visibility; verification block content still lives in progress-
  log at cycle close per v0.4 pattern). Drafted following 3
  pre-drafting confirmations (C1 6-field structure mirror; C2
  Step 1 sub-step granularity; C3 no 1:1 SCOPE-criterion-to-step
  mapping; v0.4-pattern Step 11 cycle-close verification block).
