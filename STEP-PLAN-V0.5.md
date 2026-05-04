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

### Step 9 shipped — 2026-05-04

**Scope:** Phase-9 reference doc generation per scope-doc Q7.3.2
deferred lock + Step 9 design proposal Q1-Q10 lock + STEP-PLAN-
V0.5 Step 9. Pure-doc + pure-math synthesis; no API spend; no
new substrate generation. Consumes Step 6 calibration + Step 7
production substrate + Step 8 production grading; computes
paired-t per ADR-19 §4 amendment via Step 5.3 sibling stats.mjs;
synthesizes v0.5 cycle thesis evidence.

**Outcome:** Cycle thesis substantively supported under Option α
strict three-tier framing. Cross-cell rollup paired-t at N=27
demonstrates calibrated tier-gradation:
- 1 axis CLEAN distinguishable (factual_correctness; LB 0.176)
- 2 axes BORDERLINE distinguishable (hallucination LB 0.032;
  actionability LB 0.005)
- 1 axis NOT distinguishable (completeness; LB -0.039)

Plus supplementary 12:1 ca-favored direction asymmetry (24/2 in
non-tie comparisons; F1 sub-observation; independent inferential
lens). Reference doc shipped at benchmarks-repo commit
`e32b5dd`; v0.5 thesis ("methodology defensible under peer
review") evidence captured via calibrated tier-gradation rather
than flat positive.

**Substep summary:**

| Substep | Repo | SHA | Subject |
|---|---|---|---|
| 9.0 design | (no commit) | (n/a) | Q1-Q10 lock + α/β/γ adjudication → Option α |
| 9.1 doc-gen + ref doc | benchmarks | `e32b5dd` | doc-gen script (429 LOC) + reference doc (792 lines) |
| 9.2 close | main | [this commit] | Progress log + main-repo audit-trail copy + bidirectional SHA |

**Notable decisions:**

- **Q1-Q10 design lock** (benchmarks-repo doc location;
  doc-gen script with paired-t primitives; Option A inline
  compute with port-compatibility comments; cross-repo
  coordination; 3-substep ladder; faster drafting cadence
  with mid-9.1 table-surface compromise; 9-finding list
  with F1 PRIMARY hierarchy; methodology-limits explicit
  with 3 new at v0.5; v0.6+ candidates with explicit
  source attribution; 800-1500 line scope).
- **Option α (strict three-tier framing) per threshold-
  discipline lock.** Pre-registered tier criteria
  (≥0.05 = clean; 0.001-0.05 = borderline; ≤0 = not
  distinguishable) honored without post-hoc adjustment
  after precision-dump data observation. Three-tier outcome
  scores stronger as reviewable methodology than two-tier
  framing would (Option β implicit grouping was wrong by
  Travis's own threshold criteria; Option γ over-hedged).
- **Pre-condition 1 (actionability raw value resolved at
  9.1.b spot-check):** LB 0.005 → tier (b) borderline;
  triggered three-tier framing in §6 + §8. Threshold-
  discipline catch surfaced honestly.
- **Pre-condition 2 (cobra/c3 degenerate-CI caveat):**
  documented at §4 + §6 + §10. All 4 cobra/c3 paired
  comparisons returned identical Δ=+1.0 on factual +
  hallucination; CI degenerate-to-point [1.00, 1.00];
  technically distinguishable but reflects within-cell
  perfect-consistency rather than CI-test inferential
  strength.
- **Q3 Option A inline compute** with port-compatibility
  comments at retro-complete-port sites (`reporting.ts.
  generateVarianceTable` + cross-cell rollup table generator
  identified; v0.6+ retro-complete becomes copy-paste).
- **Q6 9.1.a/b/c sub-substep cadence** (single 9.1 commit
  per Q6 lock; mid-9.1 table-surface for spot-check
  compromise lowered post-commit rework risk on first-time
  CI computation).
- **Q7(i) Step 7 PRIMARY demoted to F4 cycle-level**
  (v0.5 PRIMARY = F1 paired-mode-unlocks-differentiation;
  Step 7 ca-condition variance asymmetry remains
  substantive but not cycle-PRIMARY).
- **Q7(ii) F8 absorption of Finding 7** (failed-call
  cost-tracking gap absorbed into F8 cost-projection-
  accuracy finding; F8 becomes "cost-projection accuracy
  at paired-mode + failed-call cost-tracking gap"
  combined finding).
- **12:1 asymmetry absorbed into F1 sub-observation**
  (preserves Q7 9-finding lock; supplementary inferential
  lens beyond cross-cell rollup paired-t).
- **Q9 candidates table all 15 retained** with explicit
  source attribution per Q9 all-15-present-unless-
  explicitly-filtered discipline. None filtered as out-of-
  scope.

**Threshold pre-registration disclosure (from §6 + §8):**
tier criteria locked at Step 9.1.b spot-check kickoff
(2026-05-04 session) BEFORE precision values were computed.
Threshold not pre-cycle-registered (substrate generated
before threshold lock at Step 9.1.b). Honored as stated; no
post-hoc threshold adjustment after data observation.
Disclosed transparently for peer-review reproducibility.

**Cumulative deltas:**

| Metric | Value |
|---|---:|
| LOC delta — benchmarks repo (9.1) | +1221 (doc-gen 429 + ref doc 792) |
| LOC delta — main repo (9.2) | ~150 (progress log + audit-trail copy) |
| Test delta | 0 (Step 9 is pure-doc + pure-math; no tests added) |
| API spend | $0 (Step 9 consumes prior substrate; no API calls) |
| v0.5 cumulative platform-billed (reconstructed) | ~$10.25 ($0.181 Step 6 + $9.61 Step 7 + ~$0.45 Step 8); ~12% of $51-97 base envelope |

**9 named findings carried forward** (full text in benchmarks-
repo ref doc §7; reference here for cycle-close audit trail):

1. **F1 PRIMARY**: Paired-mode unlocks rubric differentiation
   that single-mode obscures (with 12:1 asymmetry sub-
   observation)
2. **F2**: Anonymization pipeline empirically validated by
   76% tie rate (82/108 axis-comparisons)
3. **F3**: cobra/c4 + httpx/p2 all-zero Δ across all 4 axes
   (Step 9 investigation candidate documented as questions)
4. **F4**: ca-condition systematic variance asymmetry (Step
   7 cycle-level; demoted from Step 7 PRIMARY per Q7(i))
5. **F5**: Hono h1 beta-ca bimodal exploration intrinsic
   (n=8 stretch INCREASED variance 104.6% → 129.9%; not
   n-driven)
6. **F6**: Position-dependent JSON output formatting (NEW;
   distinct from §3 score-bias; cobra/c3 trial-2
   reproducible)
7. **F7**: Cross-order agreement strong (83-100% per axis;
   Sonnet largely position-blind on scores)
8. **F8**: Cost-projection accuracy at paired-mode + failed-
   call cost-tracking gap (combined per Q7(ii); paired-mode
   ~1:1 ratio differs from Step 7 2.14× cache discount)
9. **F9**: Cost-discipline preserved across cycle (~$10.25
   / ~12% of base envelope)

**§9 v0.6+ candidates table:** 15 candidates with explicit
source attribution per Q9 lock retained in benchmarks-repo
ref doc §9. Step 10 v0.5+ candidates capture substrate is
§9 of the reference doc; Step 10 formalization (not
regeneration) per cycle-close cadence.

**§10 methodology limits:** 11 acknowledged (8 inherited + 3
new at v0.5: Path A substrate gap; F6 position-dependent JSON;
per-axis direction-agreement metric degeneracy attributed to
Step 5.1 stats.ts implementation surfaced at Step 6 per Q8).

**Step 10 unblock:** Stream C methodology riders / v0.5+
candidates capture per STEP-PLAN-V0.5 Step 10. Substrate is §9
of the reference doc (15 candidates × explicit source
attribution); Step 10 work is formalization (not
regeneration).

**v0.5 cycle progress through Step 9:** 9/11 steps shipped
(Stream A complete: Steps 1-5; Stream B complete: Step 6 + 7
+ 8 + 9). Remaining: Step 10 v0.5+ candidates capture; Step 11
ship-gate.

---

### Step 8 shipped — 2026-05-04

**Scope:** Production grading per ADR-19 §3 (paired-mode + 5-step
anonymization protocol) + §4 (paired-t amendment lock) +
STEP-PLAN-V0.5 Step 8. 28 paired comparisons (Step 7 substrate
within-trial-index pairing) + 7 cross-order regrade subset
(deterministic from STEP8_RUN_UUID); canonical
`RUBRIC_PROMPT_PAIRED` + Step 4 anonymize.ts + Step 2.2
judge-client gradePair.

**Outcome:** 34/35 production grades shipped (27/28 base + 7/7
cross-order); cobra/c3 trial-2 base reproducibly failed JSON
parse under assignment=EVEN (Path A acceptance; Finding 6
emergent observation). Position-bias NO TRIGGER (0.538 < 0.60
threshold; Step 4 strict comparison). Style-normalize stretch
skipped per conditional activation lock. Step 9 Phase-9
reference doc generation unblocks per STEP-PLAN-V0.5 dependency
graph.

**Substep summary (ladder renumbered Option I per Q9 fold):**

| Substep | Repo | SHA | Subject |
|---|---|---|---|
| 8.0 design | (no commit) | (n/a) | Q1-Q10 lock per design proposal |
| 8.1 harness | main | `241af7a` | Grading harness implementation (614 LOC) |
| 8.1 execution | main | `bf5313c` | 34/35 base+cross-order substrate (36 files; 2297 LOC) |
| 8.1 retry evidence | main | `a3388a1` | Reproducible failure classification + harness manifest-clobber fix |
| 8.2 position-bias | main | `e45813c` | Pure-math post-hoc; NO TRIGGER at 0.538; stretch skipped |
| 8.3 close | main | [this commit] | Progress log + 7 findings + Step 9 unblock |

Original ladder: 8.0 / 8.1 / 8.2 cross-order / 8.3 position-bias
/ 8.4 close. Cross-order folded into 8.1 execution (single
harness run handles both base + cross-order in sequence;
deterministic; no Travis interim adjudication needed). Renumbered
8.3 → 8.2 (position-bias); 8.4 → 8.3 (close).

**Notable decisions:**

- Q1-Q10 design lock (28-pair within-trial-index pairing per
  ADR-19 §4 amendment; Step 4 anonymize.ts unchanged; cross-order
  regrade subset 7 pairs deterministic shuffle; position-bias
  post-hoc strict >0.60 trigger; two-script architecture;
  scores_recovered_by_condition orchestrator-level field;
  cost-cap $5; persistence layout per Step 6.1 audit-trail
  pattern; ladder renumbering per fold; hardcoded Step 7
  substrate path).
- Path A acceptance for cobra/c3 trial-2 base reproducible
  failure (vs Path B substitution or Path C investigation):
  substrate gap acknowledged transparently; methodology
  cleanliness preserved over substrate uniformity.
- Step 4 §6.4 Interp A activation: style-normalize stretch only
  on position-bias trigger; NO TRIGGER at 0.538 means stretch
  skipped (no pre-emptive activation).
- Cross-order regrade subset: 7 pairs (mid-range of ADR-19 §3
  5-10 substrate); deterministic shuffle
  `SHA256(STEP8_RUN_UUID:pair_uuid)[:8]`; reproducible.
- 76% tie rate (82/108 axis-comparisons) empirically validates
  anonymization pipeline effectiveness + Finding 1 PRIMARY
  mechanism.

**Cumulative deltas:**

| Metric | Value |
|---|---:|
| LOC delta (5 commits) | +3358 (harness 614 + execution evidence 2297 + retry evidence net +30 + 8.2 script 267 + 8.3 close ~150) |
| Test delta | 0 (Step 8 is execution; harness scripts dev-time scaffolding) |
| API spend (script-projected) | $0.4394 |
| API spend (platform-billed reconstructed) | ~$0.4524 ($0.4394 script + ~$0.013 estimated failed-retry; Finding 7) |
| v0.5 cumulative platform-billed (reconstructed) | ~$10.25 ($9.80 prior + ~$0.45 Step 8 reconstructed) |
| Wall-clock | ~80 seconds first-run + ~5 seconds retry |
| Cost-cap $5 | not hit (max running $0.4394; never paused) |

Reconstructed = script-tracked + estimated failed-retry; not
verified against Anthropic console. Verification via dashboard
deferred (would settle Finding 7 measurement; not blocking for
Step 8 close).

**Per-cell paired-mode aggregate Δ** (mean ca - beta-ca per axis;
positive = ca higher; * = Path A reduced n):

| Cell | n | factual | complete | action | halluc |
|---|---:|---:|---:|---:|---:|
| httpx/p4-stream-lifecycle | 5 | +0.60 | 0.00 | +0.20 | +0.20 |
| cobra/c3-hook-lifecycle | 4* | +1.00 | +0.25 | +0.50 | +1.00 |
| httpx/p2-http3-transport | 5 | 0.00 | 0.00 | 0.00 | 0.00 |
| hono/h1-context-runtime | 8 | +0.38 | 0.00 | +0.13 | +0.38 |
| cobra/c4-subcommand-resolution | 5 | 0.00 | 0.00 | 0.00 | 0.00 |

**Position-bias diagnostic:** aggregate imbalance 0.538 (max
axis = factual_correctness 0.600 exactly at threshold; strict >
does NOT trigger). Style-normalize stretch skipped per Step 4
§6.4 Interp A. Sonnet largely position-blind on scores per
ADR-19 §3 empirically validated.

**76% tie rate empirical observation:** 82/108 axis-comparisons
across 27 base pairs produced ties between ca and beta-ca
scoring. Empirical evidence that anonymization pipeline strips
condition-identifying signal effectively; Sonnet treats paired
answers as substantively equivalent on most comparisons;
differentiation surfaces only on cells with substantive
condition difference (3 of 5 cells per per-cell Δ table).
Reinforces Finding 1 (PRIMARY) mechanism.

**7 findings carried forward:**

1. **PRIMARY: Paired-mode unlocks rubric differentiation that
   single-mode obscures.** Step 6 single-mode showed Sonnet
   hallucination defaults to 1 across 20/20 trials (no
   comparator framing); Step 8 paired-mode shows differentiated
   scoring across pairs (range 0.00 to +1.00 mean Δ;
   Travis-priors-aligned). Step 6 Branch D offset-disclosure
   framing was mode-specific not structural; v0.5 thesis
   methodologically strengthened. Single-mode and paired-mode
   are different operational regimes; rubric calibrates
   correctly when given comparator framing. v0.5 reference doc
   leads with this finding rather than hedges it.

2. **cobra/c4 + httpx/p2 all-zero Δ across all 4 axes.**
   Unexpected for cobra/c4 (Theme 1.1 multi-symbol API closure
   cell expected ca advantage). Three interpretations:
   substrate (both produced similar quality); rubric (Sonnet
   blind spot for these specific answer pairs); anonymization
   (stripped differentiating signal). Step 9 synthesis
   investigation candidate.

3. **Cross-order agreement strong (83-100% per axis at n=6
   cross-order pairs);** Sonnet judge largely position-blind on
   scores. Validates ADR-19 §3 expected behavior empirically.

4. **gradePair production reliability: 1/35 first-run JSON
   parse failure (2.9%);** reproducible on retry under same
   assignment_parity (Finding 6 root cause). Resume mechanism
   handles transient cases cleanly; reproducible cases require
   investigation.

5. **Cost-projection accuracy at paired-mode: $0.4394
   script-projected; ~$0.4524 reconstructed platform-billed**
   (script + estimated failed-retry; not dashboard-verified).
   Reconstructed ratio ~1:1 (vs Step 7 claude-code 2.14× cache
   discount); paired-mode canonical-rubric workload doesn't
   show Step 7's discount, possibly because explicit
   cache-control headers not set on gradePair calls. v0.6+
   harness refinement candidate: explicit cache-control header
   configuration for repeated-prefix workloads + dashboard
   verification at cycle close.

6. **Position-dependent JSON output formatting (NEW empirical
   observation).** cobra/c3 trial-2 reproducibly fails JSON
   parse under assignment=EVEN (A=ca, B=beta-ca) but succeeds
   under assignment=ODD (A=beta-ca, B=ca). Same prompt + same
   answers + same rubric; only A/B label assignment differs.
   Distinct from ADR-19 §3 score-based position bias concept;
   this is OUTPUT-FORMATTING asymmetry. Single occurrence at
   n=28 (3.6%); not predicted by v0.5 design locks. v0.6+
   candidate: investigate Sonnet output stability dependence on
   input ordering for paired comparisons; possible mitigations
   include explicit JSON-only reminder prefix; schema-validation
   retry mechanism; pre-flight input validation.

7. **Failed-call cost-tracking gap.** Failed gradePair retries
   consume API spend (~$0.013 per retry estimated) but don't
   update script-tracked totalCost (only successful grades
   increment state.totalCost). For Step 8.1 first-run + retry:
   $0.4394 script-tracked vs ~$0.4524 reconstructed
   platform-billed (delta inferred, not measured; dashboard
   verification deferred). v0.6+ harness refinement candidate:
   track API call costs regardless of grade success.

**Bonus harness improvements landed at Step 8.1 retry evidence
commit `a3388a1`:**
- Resume manifest-clobber bug patched (harness now reads + merges
  existing manifest at resume start; prevents future clobber on
  retry-only runs that hit reproducible failures)
- One-off manifest reconstruction performed (recovered 34
  entries from per-pair JSONs via deterministic anonymize()
  re-invocation)

**Step 9 unblock:** Phase-9 reference doc generation. Pure-doc
work; consumes Step 7 production substrate (56 trials;
ca-condition variance asymmetry; hono h1 bimodal; etc.) + Step
8 production grading (34/35 paired grades; 76% tie rate;
per-cell Δ; Finding 6 emergent observation; cross-order
agreement strong; position-bias clean) as primary substrate.
Synthesizes v0.5 cycle thesis with paired-mode-unlocks-
differentiation as PRIMARY finding.

**v0.5 cycle progress through Step 8:** 8/11 steps shipped
(Stream A complete; Stream B complete: Step 6 calibration +
Step 7 production replication + Step 8 production grading).
Remaining: Step 9 Phase-9 reference doc; Step 10 v0.5+
candidates capture; Step 11 ship-gate.

---

### Step 7 shipped — 2026-05-04

**Scope:** Production replication per scope-doc §7.1.2 + ADR-19
§3 + Step 1.5 thresholds lock. 5 anchor cells × n=5 trials × 2
conditions (ca + beta-ca) + hono h1 auto-stretch (n=8) = 56
production trials. v0.4-shipped atlas substrate (current shipped
per Q9 lock).

**Outcome:** Production substrate generated; 56/56 trials AUDIT
PASS; ca-condition systematic variance asymmetry pattern surfaced
as empirical finding (not methodology failure); hono h1 beta-ca
bimodal exploration documented as intrinsic. Step 8 grading
unblocks per STEP-PLAN-V0.5 dependency graph.

**Substep summary:**

| Substep | Repo | SHA | Subject |
|---|---|---|---|
| 7.0 design | (no commit) | (n/a) | 10-point design proposal lock (Q1-Q10) |
| 7.1 harness | bench | `cec8be6` | Production orchestrator script (578 LOC) |
| 7.1 execution evidence | main | `a801347` | run-manifest + index + per-cell stats + execution-summary (886 LOC) |
| 7.2 stretch adjudication | (folded into 7.4) | (n/a) | Branch C/D non-hono; lenient ship-with-disclosure hono |
| 7.3 audit script | bench | `9007dff` | Pure-math audit verifier (387 LOC) |
| 7.3 audit evidence | main | `3a3a8bc` | Audit report copy (37 LOC) |
| 7.4 close | main | [this commit] | Progress log + adjudication outcomes |

**Notable decisions:**

- Q1-Q10 design lock at Step 7.0 (substep ladder; existing
  run-reference.ts unchanged; orchestrator-level trial-index
  wrapper; sequential execution with per-cell condition
  alternation; resume-from-failure idempotent; cost-cap mid-run
  pause at $25; hono auto-stretch + other-cell adjudicated;
  trial substrate via gitignore-respecting summary-only commit;
  v0.4.0 atlas SHA; calibration substrate parity acceptable per
  Q10 framing).
- Atlas SHA v0.4.0 (current shipped) per Q9 lock. Step 6
  calibration (v0.3.0 substrate) / Step 7 production (v0.4.0
  substrate) parity methodologically sound (rubric-application
  properties measured at calibration are atlas-version-agnostic
  per Q10 explicit framing).
- Step 7.2 stretch adjudication: **Branch C/D for non-hono cells**
  (accept variance + disclose); **lenient ship-with-disclosure for
  hono h1 catastrophic 104.6%** per Step 6 Branch D precedent.
- Substrate investigation skipped per Travis direction; bimodal
  pattern documented as empirical finding without root-cause
  attribution. v0.6+ candidate.

**Cumulative deltas:**

| Metric | Value |
|---|---:|
| LOC delta (benchmarks repo) | +1851 (orchestrator 578 + audit 387 + raw substrate ~886 gitignored) |
| LOC delta (main repo) | +1149 (execution evidence 886 + audit report 37 + close commit ~150 progress log + 76 reused) |
| Test delta | 0 (Step 7 is execution + audit; harness scripts dev-time scaffolding) |
| API spend (script-projected) | $20.5310 |
| API spend (platform-billed actual) | **$9.61** (~2.14× cache discount; consistent with v0.4 Step 5 measured ratios) |
| v0.5 cumulative (platform-billed) | $9.80 ($0.18985 prior + $9.61 Step 7) |
| Trials | 56/56 AUDIT PASS |
| Wall-clock | ~40 minutes orchestrator execution |
| Cost-cap $25 | not hit (max running $20.53 script-projected; never paused) |

**Anchor cell substrate (5 cells per scope-doc §7.1.2):**

| Cell | Trials | ca tokens range/μ | beta-ca tokens range/μ | Stretch |
|---|---|---:|---:|---|
| httpx/p4-stream-lifecycle | n=5 + n=5 | 63.0% | 16.2% | none |
| cobra/c3-hook-lifecycle | n=5 + n=5 | 57.5% | 67.9% | none |
| httpx/p2-http3-transport | n=5 + n=5 | 23.5% | 4.2% | none |
| hono/h1-context-runtime | n=8 + n=8 | 51.3% | 104.6% | auto (Q7 lock) |
| cobra/c4-subcommand-resolution | n=5 + n=5 | 45.5% | 6.6% | none |

**Findings carried forward:**

1. **ca-condition systematic variance asymmetry (Step 7 primary
   methodology finding).** ca tokens range/μ at 23-63% across all
   5 cells; beta-ca at 4-17% on 3 of 5 cells (cobra c3 + hono h1
   are exceptions). Reading: structural property of atlas-mediated
   exploration. ca condition uses MCP atlas tools (find_by_intent
   / get_symbol_context) producing different path traversals
   trial-to-trial; baseline beta-ca (grep/read) is more procedural
   → more deterministic. NOT substrate noise — empirical signal
   about how ca behaves. Paired-t difference computation per ADR-19
   §4 amendment handles mathematically (trial-difficulty
   correlation pairs out within trial-pairs).

2. **Hono h1 beta-ca bimodal exploration (catastrophic 104.6%
   variance).** Per-trial token sequence n=8: 30396, 43742, 64724,
   32297, 83694, 26004, 27456, 47047. Two cluster modes: efficient
   (~26-32k) and sprawled (~64-84k). Stretch n=5→8 did NOT reduce
   variance (range expanded from baseline). Intrinsic exploration
   variance, not n-driven. Substrate investigation skipped per
   Travis direction; bimodal pattern documented as observed
   without root-cause attribution. v0.6+ candidate: investigate
   path-divergence root cause if reviewer feedback warrants.

3. **Cost-projection cache discount (Step 7 secondary finding).**
   Script-projected $20.53 vs platform-billed $9.61 = 2.14× ratio.
   Consistent with v0.4 Step 5 measured cache discount ratios.
   Orchestrator's pricing constants in run-reference.ts don't
   account for cache discount. v0.6+ candidate: cost-projection
   calculator should reflect cache discount per cycle planning
   accuracy refinement. Not blocking for v0.5 (actual cost well
   under envelope; v0.5 cycle cost discipline pattern intact).

4. **Variance trigger threshold language needs domain-specific
   specification.** Scope-doc §Rescope catastrophic >100%
   threshold targets QUALITY-axis rubric concerns; efficiency
   metrics (tokens; calls; cost) are continuous unbounded values
   where >100% range/mean is meaningful but not catastrophic.
   v0.6+ refinement candidate: scope-doc threshold language
   should distinguish quality-axis (>100% = methodology
   breakdown) vs efficiency-metric (>100% = real bimodal
   pattern; finding not failure).

5. **Output substrate density LOC inflation driver confirmed.**
   Step 7.1 orchestrator ran ~1.4× honest target (578 LOC vs
   400-700 range upper); Step 7.1 execution evidence ~1.6× target
   (886 LOC vs 550 honest target). Pattern matches Step 5/6
   finding #5 (test substrate density) + Step 6.1 finding #3
   (audit-trail markdown writers). v0.6+ cycle planning heuristic
   refinement: estimate output substrate density independently
   from design-lock depth + test substrate density. Three
   distinct calibration variables now empirically observed.

**Cost-discipline transparency:**

- Step 7 cumulative: $9.61 platform-billed
- v0.5 cumulative through Step 7: $9.80
- Scope-doc envelope: $51-97 base / $80 rescope-investigation
  trigger / $100 absolute upper bound
- Step 7 actual ~10% of base envelope; well within cycle budget
- Step 8 production grading projected $15-25 (scope-doc); revised
  projection per Step 7 cache discount data: ~$6-10 actual

**Step 8 unblock:** production grading per ADR-19 §3 paired-mode
+ Step 4 anonymization pipeline + Step 3 `RUBRIC_PROMPT_PAIRED` +
Step 5 stats primitives. Consumes Step 7 substrate (56 trials →
28 paired comparisons via Step 4 `anonymize.ts`). Second-
substantive API spend in v0.5 cycle (Step 6 calibration $0.18;
Step 7 production $9.61; Step 8 grading projected $6-10).

**v0.5 cycle progress through Step 7:** 7/11 steps shipped
(Stream A complete; Step 6 calibration; Step 7 production
replication). Remaining: Step 8 grading; Step 9 Phase-9 reference
doc; Step 10 v0.5+ candidates capture; Step 11 ship-gate.

---

### Step 6 shipped — 2026-05-03

**Scope:** Pre-flight grading calibration per ADR-19 §5 + Step
1.5 thresholds lock. Within-judge consistency check + Travis-
intuition correlation; gate-condition substep before Step 7
production replication.

**Outcome:** Gate evaluation: **Branch D adjudication** (explicit
offset disclosure per ADR-19 §2). Within-judge consistency PASS
at +20pt margin; aggregate Spearman 0.74 PASS at +0.14 margin;
per-axis direction-agreement degenerate at n=5 + constant-vector
substrate (methodology-refinement candidate for v0.6+). Step 7
production replication unblocks per ADR-19 §5 with offset
disclosure framing.

**Substep summary:**

| Substep | SHA | Subject |
|---|---|---|
| 6.0 design | (no commit) | Design proposal lock; 9 specifics adjudicated |
| 6.1 within-judge | `23ac7d4` + `02e6b41` | Harness script (+465 LOC) + execution evidence (+455 LOC, 21 files); PROBE PASS |
| 6.2 Travis-intuition | `3ba2aef` | Phase A worksheet template (+419 LOC); Travis filled |
| 6.3 gate evaluation | `585ccfc` | Gate eval script + report + filled grades (+572 LOC); Branch D adjudication |
| 6.4 close | [this commit] | Progress log entry; offset disclosure documented |

**Notable decisions:**

- Q1-Q9 design lock at Step 6.0 (substrate selection; threshold
  preservation; cost projection; workflow detail; methodology;
  persistence; substep ladder; npm build pre-flight).
- Phase A unmediated grading methodology lock (priors-vs-Sonnet
  baseline; Phase B rubric-mediated diagnostic conditional on
  Phase A failing — never triggered since Phase A Spearman
  passed).
- **Branch D adjudication** (explicit offset disclosure per
  ADR-19 §2; Spearman PASSES; systematic-strictness diagnostic;
  ADR-19 §2 explicitly permits this recovery path). Branch B
  (rubric refinement) queued as v0.6+ candidate IF reviewer
  feedback post-v0.5-ship surfaces concerns.
- Trick-bucket override empirical validation deferred to Step 7
  if applicable (substrate-limited at Step 6; h6-fetch-signature
  not in Step 9 substrate; honest scope-limit acknowledgment).

**Cumulative deltas:**

| Metric | Value |
|---|---:|
| LOC delta | +1911 (harness 465 + execution evidence 455 + worksheet 419 + gate-eval substrate 572) |
| Test delta | 0 (Step 6 is execution; harness scripts dev-time scaffolding) |
| API spend | $0.180942 (Step 6.1 within-judge; 20 Sonnet 4.6 calls; mid-range of $0.10-0.24 projection) |
| Cumulative v0.5 spend | $0.18985 (Step 2 probe + Step 6.1) |
| Test files added | 0 (no unit tests) |

**Gate evaluation results (per ADR-19 §5):**

Within-judge consistency:
- Per-axis within-1-point: 100% all 4 axes (vs ≥80% threshold)
- Per-axis exact-match: 90% / 90% / 80% / 100% (diagnostic; not
  gating)
- Bitwise determinism: 7/10 trials (Finding 3 partial
  generalization at canonical rubric)

Phase A (Travis priors vs Sonnet pass-1):
- Aggregate Spearman: 0.7406 (vs ≥0.6 threshold; +0.14 margin)
  — **PASS**
- Per-axis direction agreement: 20% / 40% / 40% / 40% (vs ≥75%
  threshold) — **FAIL** (interpretation below)
- Per-axis MAD (Travis − Sonnet; positive = Travis higher):
  factual +0.80; completeness +0.40; actionability +0.60;
  hallucination +0.40

**Direction-agreement failures interpretation:** Largely
artifactual at n=5 + constant-vector substrate. Travis = constant
3 on completeness + actionability across all 5 trials (no Travis
direction signal); Sonnet = constant 1 on hallucination (no
Sonnet direction signal). The strict `sign()` comparison treats
constant-vector vs varied-vector pairs as disagreement; real
meaningful disagreement only present on factual_correctness
axis (where both have variance) at 20% direction agreement.

**ADR-19 §2 diagnostic match:** systematic-strictness pattern
(high correlation + uniform positive MAD across all 4 axes;
Travis grades 0.40-0.80 points higher than Sonnet across the
board). Per ADR-19 §2 verbatim: *"Systematic lenience/strictness
only (high correlation, large MAD): Judge tracks Travis on
different scale; bias is correctable. Recovery: Rubric anchor
refinement OR explicit offset disclosure — never escalation
alone."*

**Findings 2-3 adjudication:**

Finding 2 (hallucination=1 pattern): **PARTIALLY-REPRODUCES**.
- Sonnet scored hallucination=1 on 100% of 20 calls
- Travis matched at hallucination=1 on 3/5 trials where actual
  overclaim issues present (httpx p4 mutually-exclusive
  read/iter_bytes; hono h1 Node adapter uncertainty; cobra c4
  db-not-prefix-of-database)
- Travis graded hallucination=0 on 2/5 trials with no
  fabrications detected (cobra c3 + httpx p2)
- Interpretation: Sonnet defaults to halluc=1 across all
  answers; Travis priors distinguish actual-overclaim from
  clean. Axis 4 anchor systematic strictness; correctable via
  offset disclosure (Branch D) or anchor refinement (v0.6+
  candidate).

Finding 3 (bitwise determinism): **PARTIAL generalization**.
7/10 trials bitwise-identical at canonical rubric (vs Step 2.4
placeholder rubric n=2 full bitwise). ADR-19 §2 "approximately-
deterministic" framing preserved as accurate; "fully
deterministic" framing ruled out. Honest acknowledgment for v0.5
final reporting.

**Findings carried forward:**

1. **Sonnet 4.6 systematic strictness on canonical rubric.**
   Travis-intuition baseline shows +0.40 to +0.80 MAD across all
   4 axes; uniform positive offset; ADR-19 §2 disclosure-band
   tolerable. Pattern is "judge tracks Travis ranking on
   different scale," not "judge measures wrong thing."

2. **Per-axis direction-agreement metric degeneracy at n=5 +
   constant-vector substrate.** v0.6+ methodology-refinement
   candidate. Possible remediations: substrate ≥10; tied-score
   handling that doesn't auto-fail constant-vector cases; per-
   axis-direction-agreement weighting by per-axis variance.
   Worth noting in v0.6+ statistical methodology refinement
   work.

3. **Output substrate density as separate LOC-inflation driver
   from design-lock depth and test substrate density.** Step 6.1
   harness landed 1.55× target; markdown audit-trail writers
   expand LOC similarly to test-substrate density (Step 5
   finding #5). Three distinct calibration variables for v0.6+
   cycle planning: design-lock depth + test substrate density +
   output substrate density.

4. **Trick-bucket override (Axis 3) empirical validation
   deferred to Step 7** production if applicable cells exercise
   pattern. If no Step 7 cells exercise trick-bucket, override
   remains theoretically-locked-but-empirically-unvalidated
   through v0.5 cycle close — honest scope acknowledgment for
   v0.5 final reporting.

**Branch D offset disclosure language for v0.5 final reporting:**

> v0.5 quality-axis grading uses Sonnet 4.6 LLM-judge with
> explicit calibration disclosure: Sonnet judge applied canonical
> rubric ~0.5pt stricter than Travis-intuition baseline on
> average across all 4 axes (per-axis MAD: factual +0.80;
> completeness +0.40; actionability +0.60; hallucination +0.40;
> positive = Travis grades higher). Rankings track at Spearman
> 0.74 against Travis priors, indicating Sonnet tracks ranking
> correctly on different scale. Quality-axis findings reported
> with explicit MAD disclosure per ADR-19 §2 lenience/strictness
> recovery path; aggregate effect-size + uncertainty framing;
> no NHST p-value interpretation.

**v0.6+ candidates queued (Step 6 surfacings):**

- Rubric anchor refinement (Axis 1 + Axis 4 specifically) IF
  reviewer feedback post-v0.5-ship surfaces concerns; ADR-19 §2
  anchor refinement path.
- Per-axis direction-agreement metric reformulation for small-N
  + constant-vector substrate handling.
- Trick-bucket override Axis 3 empirical validation if not
  surfaced organically at Step 7.

**Step 7 unblock:** production replication per STEP-PLAN-V0.5
dependency graph. Step 7 runs canonical extraction pipeline +
grading at production substrate per ADR-19 §3 paired-mode +
Step 4 anonymization pipeline + Step 5 stats primitives. ~$25-40
envelope per scope-doc.

---

### Step 5 shipped — 2026-05-03

**Scope:** Statistical tooling implementation per ADR-19 §4 +
Step 1.4 statistical methodology lock. Three modules: stats.ts
(paired-t CI primitives + 4-level aggregation pipeline);
reporting.ts (Phase-9 stubs + distinguishableColumnCaption full);
sibling scripts/lib/stats.mjs in benchmarks repo. ADR-19 §4
amendment surfaced + adjudicated mid-execution.

**Outcome:** Stream A close substep. 5/5 v0.5 steps shipped
(Steps 1-5). 6 commits across 2 repos (5 main + 1 benchmarks).
ADR-19 §4 paired-t amendment landed at Step 5.0 ahead of
implementation. Step 6 calibration (first substantive API
spend; $10-25 envelope; gate-condition discipline before Step 7
production) unblocks per STEP-PLAN-V0.5 dependency graph.

**Substep summary:**

| Substep | Repo | Commit | Subject |
|---|---|---|---|
| 5.0 amendment | main | `05c9fc7` | ADR-19 §4 paired-t amendment (4 edits; +80/-9) |
| 5.0 backfill | main | `204a506` | SHA placeholder backfill (+1/-1) |
| 5.1 stats.ts | main | `1258feb` | paired-t CI primitives + 4-level aggregation (+870; +45 tests) |
| 5.2 reporting.ts | main | `14c606a` | Phase-9 stubs + caption full (+243; +12 tests) |
| 5.3 stats.mjs sibling | bench | `e8cf482` | benchmarks-repo sibling per non-DRY policy (+726; +36 tests) |
| 5.4 close | main | [this commit] | STEP-PLAN-V0.5 progress log + Revision history entry |

**Notable decisions:**

- Q1 paired-vs-unpaired adjudication → Option B (paired-t) +
  ADR-19 §4 amendment per investigation-first surfacing during
  Step 5 design proposal. Original Step 1.4 lock chose unpaired-
  pooled by default-textbook framing without explicit adjudication;
  Step 5 implementation forced explicit choice.
- Q2 two-module decomposition (stats.ts + reporting.ts); matches
  existing src/grading/ one-concept-per-file pattern.
- Q3 t-distribution lookup table df=1..30 + ∞ (Option B scope per
  paired-t; df>30 z-asymptote fallback at <2% narrow-CI bias).
- Q4 generic-over-metric API surface (primitives are
  metric-agnostic; same pipeline serves quality axes + efficiency
  metrics).
- Q5 raw values flow via PerCellDifference.rawDifferences field
  (implementation-time refinement over Q5 lock — "PerCellAggregate
  is derived view"; PerCellDifference embeds rawDifferences for
  cross-cell rollup pipeline coupling).
- Q6 reporting stubs at Step 5 with distinguishableColumnCaption
  full implementation exception (caption is static string per
  ciLevel; no Step 7 dependency).
- Q7 sibling cross-repo per ADR-19 §4 non-DRY policy; copy-paste
  parity at commit time; bidirectional SHA audit trail.
- Q8 5-commit substep ladder (4 main + 1 benchmarks; close adds
  6th main commit).
- L1-L5 ADR-19 amendment edits applied (amendment marker
  callout + CI computation paragraph rewrite + Rationale bullet +
  §Revision history section creation; API naming
  `differenceOfMeansCI` per L5).
- Cross-cell rollup B-2 lock (paired-t at concatenated N=25
  differences; not weighted-mean of per-cell differences). Lower-
  amendment-scope path consistent with existing ADR-19 §4
  "n=25 per condition" wording.

**Cumulative deltas:**

| Metric | Value |
|---|---:|
| LOC delta | +1920 across both repos (main: +1194; benchmarks: +726) |
| Test delta | +57 main (1039 → 1096); +36 bench (252 → 288); +93 combined cross-repo |
| Test files added | 3 (stats.test.ts main; reporting.test.ts main; stats.test.ts bench) |
| API spend | $0 (pure-math; no API calls) |

**LOC scope-vs-estimate calibration:**

| Substep | Refined target | Actual | Ratio |
|---|---:|---:|---:|
| 5.0 amendment + backfill | n/a | 81 | doc-only |
| 5.1 stats.ts | 540 | 870 | 1.61× |
| 5.2 reporting.ts | 180 | 243 | 1.35× |
| 5.3 stats.mjs sibling | 430 | 726 | 1.69× |
| 5.4 close | n/a | ~150 | doc-only |
| **Combined main** | **~720** | **1194** | **1.66× weighted** |
| **Sibling bench** | **~430** | **726** | **1.69×** |

Step 5 calibration drift vs Step 4 (1.04×). Pattern: design-
lock-depth correlation holds for narrow-scope substeps (5.2 stub
scope; bounded test substrate); breaks for substeps with broad
test substrate (5.1 + 5.3 textbook anchor coverage ran beyond
projection). Test substrate density emerges as separate
calibration variable from design-lock depth.

**Test count progression:**

- 5.0: no tests (doc commits)
- 5.1: +45 main (1039 → 1084; t-table 11 + variance 5 + mean 2 +
  rangeOverMean 5 + meanWithCI 5 + differenceOfMeansCI 9 +
  aggregation pipeline 8)
- 5.2: +12 main (1084 → 1096; caption regression sentinels 8 +
  stub-shape compliance 3 + VarianceTableRow shape 1)
- 5.3: +36 bench (252 → 288; mirrors main stats.test.ts substrate
  in JS flavor)
- 5.4: no tests (doc commit)

**API spend transparency:**

- Step 5 cumulative: $0 (pure-math; no Anthropic API calls)
- v0.5 cumulative through Step 5: $0.00891 (Step 2 probe runs
  only)
- Substantive API spend deferred to Step 6 calibration ($10-25
  envelope per scope-doc); Step 6 IS the first cycle's
  substantive API spend AND the gate-condition before Step 7
  production replication ($25-40+).

**Findings carried forward:**

1. **PerCellDifference.rawDifferences pipeline coupling.**
   Q5 lock specified "raw values" flow but didn't pin how —
   carry-on-aggregate vs separate-param. Resolved during 5.1
   implementation: PerCellDifference embeds rawDifferences;
   downstream cross-cell rollup flatMaps embedded values.
   Caller doesn't thread raw values separately. Reinforces
   Step 4 finding #4: design-lock-depth requirement extends
   to API-flow specifics, not just function signatures.

2. **df>30 z-asymptote fallback (~2% narrow-CI bias).** Per Q3
   lock; tested at df=31 and df=100. Acceptable per textbook
   convention. Documented in stats.ts module header. v0.5
   stretch substrate at unpaired-pooled n=20+25 (df=43) would
   have exceeded df=1..30 range; paired-t at v0.5 stretch n=25
   pairs (df=24) keeps comfortably within tabulated coverage.

3. **aggregateCrossCellRollup math equivalence.** Option B-2
   "paired-t at concatenated N=25 differences" implemented as
   single-sample-t on differences vector (mathematically
   equivalent; same formula at the math level — paired-t IS
   single-sample-t-on-differences). Documented in stats.ts
   module header for future archaeology readers.

4. **TypeScript noUnusedParameters strict-mode requires
   underscore-prefix for stub parameters.** Caught during 5.2
   reporting stub implementation; eslint-disable comments are
   insufficient (TS compiler check is separate). Underscore
   prefix is the standard idiom. Pattern carried forward for
   v0.6+ stub scaffolding work.

5. **Test substrate density as separate calibration variable.**
   Step 5 calibration drift (5.1: 1.61×; 5.2: 1.35×; 5.3:
   1.69×) vs Step 4 (1.04×). Pattern: design-lock-depth
   correlation holds for narrow-scope substeps (5.2 stub
   scope); breaks for substeps with broad test substrate (5.1
   + 5.3 textbook anchor coverage ran beyond projection).
   v0.6+ heuristic refinement: estimate test substrate density
   independently (count textbook anchors; boundary cases;
   integration tests); apply density multiplier separately
   from design-lock-depth multiplier.

6. **Vitest include-pattern parity discipline (cross-repo).**
   Benchmarks repo `*.test.{ts,tsx}` filter forced
   `.test.mjs → .test.ts` rename despite implementation `.mjs`
   spec. Mixed-extension implementation+test is fine when test
   extension matches Vitest include pattern; matters when
   crossing repo boundaries with different Vitest config.
   Pattern: verify destination-repo test-runner config before
   sibling-implementation commit.

**Estimation calibration note for v0.6+ cycles** (incorporating
Finding 5 heuristic refinement):

v0.5 Step 5 calibration drift highlighted test substrate density
as separate variable from design-lock depth. Step 4 hit 1.04×
because both were tightly bounded; Step 5.1 hit 1.61× because
test substrate (textbook anchor coverage with extensive pre/post
assertions) ran broader than projected despite adequate design-
lock depth. v0.6+ cycle LOC budgeting should:

a. Estimate test substrate density independently (count
   textbook anchors; boundary cases; integration tests).
b. Apply density multiplier separately from design-lock-depth
   multiplier.
c. Bounded substeps (stubs; small-scope test substrate) hold
   close to refined estimates; broad-substrate substeps (math
   primitives with textbook verification) require ~1.5-2× even
   with design-lock-depth in place.

**Stream A close: 5/5 v0.5 steps shipped (Steps 1-5).** Stream
B (Step 6 calibration; first substantive API spend; $10-25
envelope; gate-condition discipline before Step 7 production)
unblocks per STEP-PLAN-V0.5 dependency graph.

**Step 6 unblock:** pre-flight grading calibration on Step 9
anchor cells. Within-judge consistency check + Travis-intuition
correlation; both metrics MUST clear pre-defined thresholds
before Step 7 production replication starts. Rescope-condition
discipline applies if calibration thresholds fail (Opus
escalation; rubric refinement; or descope to statistical-only-
rigor framing per scope-doc §Rescope conditions).

---

### Step 4 shipped — 2026-05-03

**Scope:** Double-blind harness implementation per ADR-19 §3 +
Step 1.3 5-step anonymization protocol lock. Three modules:
output anonymization pipeline + position-bias verification
metric + style-normalization stretch transformer.

**Outcome:** Stream A double-blind harness shipped. 3 substeps
across 4 commits (3 substep + 1 close); 3 production modules
in `src/grading/` + 3 test files. 1222 LOC delta (1.04× honest
target — first v0.5 substep series to land within estimate
band). Step 5 (statistical tooling) unblocks per STEP-PLAN-V0.5
dependency graph.

**Substep summary:**

| Substep | Commit | Subject |
|---|---|---|
| 4.1 | `b582f76` | `anonymize.ts` + tests (572 LOC; 43 tests) |
| 4.2 | `0faba72` | `position-bias.ts` + tests (350 LOC; 15 tests) |
| 4.3 | `fba1500` | `style-normalize.ts` + tests (300 LOC; 26 tests) |
| 4.4 | [this commit] | STEP-PLAN-V0.5 progress log + Revision history entry for §4.6 reframe |

**Sequencing note:** Steps 4 and 5 are formally parallel-able
per scope-doc sequencing diagram; v0.5 execution chose
sequential ordering (4 → 5) for review-cadence simplicity. Both
ship in v0.5 cycle regardless of ordering choice. Documents
deliberate choice rather than implicit drift.

**Notable decisions:**

- Three-module decomposition (`anonymize` / `position-bias` /
  `style-normalize`) per Decision A; matches existing
  `src/grading/` one-concept-per-file pattern.
- Manifest schema includes `pair_uuid`, `cell_id`, `trial_index`,
  `run_uuid`, `seed`, `assignment_parity`, `assignment {A,B}`,
  `ca_source_path`, `beta_ca_source_path`, `presentation_id`,
  `cross_order_regrade`, `created_at`, `anonymization_version=1`
  per Decision B; `presentation_id` derived from second
  SHA256(seed) formatted as 8-4-4-4-12 UUID layout.
  `original_metrics_hash` deferred (speculative).
- Replacement token `[artifact]` (square brackets) per Decision D
  refinement — `<artifact>` flagged with HTML/markdown rendering
  ambiguity + TypeScript-generics conflict; switched to
  journalism/legal redaction convention.
- Field-validation throws per Decision C: cell_id `:` collision;
  run_uuid `:` collision; non-integer or negative trial_index.
  Fail loudly per CLAUDE.md.
- Cross-order regrade realized via `forceSwapAB?: boolean` flag
  on `AnonymizeOptions` (cleaner API than re-derived seed; same
  effect; deterministic given inputs + flag).
- Position-bias trigger is aggregate-only (per-axis at n=25
  too noisy to gate independently); per-axis reported for
  diagnostic visibility. Trigger boundary STRICT `> 0.60`
  (exactly 60/40 does NOT trigger; verified via dual-direction
  boundary test).
- Style-normalize implementation deviates from ADR-19 §3 letter
  on two points per Decision E (both approved):
  (1) bullets stripped entirely vs ADR-19 §3 "bullets →
  semicolons" (reason: list-grouping reconstruction adds
  parsing fragility); (2) no 80-col wrap vs ADR-19 §3 "wrap at
  80 cols" (reason: line-wrap shifts token boundaries; defeats
  determinism goal). Both deviations preserve §3 substantive
  requirement (remove formatting bias) with simpler
  implementation. ADR-19 §3 NOT amended — deviations are
  implementation refinements, not methodology changes.
- Style-normalize implementation lands at Step 4 (vs STEP-PLAN-
  V0.5 §4.6 literal "deferred until Step 8 trigger") per
  Decision F Interp A; activation remains conditional on Step 8
  position-bias trigger. Rescope logged as Revision history
  entry below.
- Style-normalize 9-step pipeline preserves source-code refs
  (file:line + ADR-NN) and snake_case identifiers
  (underscore-emphasis bounded by non-word chars to avoid
  mangling factual_correctness, get_symbol_context). Backtick
  stripping loops for nested cases (emphasis-stripping can
  expose previously-nested backticks).
- 4-commit substep ladder per Decision G (3 substep + 1 close);
  matches Step 2 substep-source-pairing precedent.

**Cumulative deltas:**

| Metric | Value |
|---|---:|
| LOC delta | +1222 (572 + 350 + 300; close commit doc-only) |
| Test delta | +84 (955 → 1039) |
| Test files added | 3 |
| API spend | $0 |

**LOC scope-vs-estimate calibration:**

| Substep | Refined target | Actual | Ratio |
|---|---:|---:|---:|
| 4.1 anonymize | 350+280=630 | 572 | 0.91× (under!) |
| 4.2 position-bias | 200+130=330 | 350 | 1.06× |
| 4.3 style-normalize | 130+80=210 | 300 | 1.43× |
| **Total** | **~1170** | **1222** | **1.04×** |

First v0.5 substep series to land within estimate band.
Pattern likely driven by: (a) ADR-19 §3 substrate already-locked
(no design surface evolving during implementation); (b)
Decision A-G design-lock phase resolved 7 implementation choices
ahead of kickoff. v0.6+ cycle estimation discipline may benefit
from forcing more decision-lock ahead of substep kickoff to
replicate this calibration.

**Test count progression:**

- 4.1: +43 (955 → 998; stripFilenameMarkers 12 + deriveSeed 9 +
  abParity 4 + derivePresentationId 3 + anonymize 9 +
  decodeAssignment 1 + manifest I/O 5)
- 4.2: +15 (998 → 1013; boundary-value imbalance 7 + per-axis
  disaggregation 3 + report shape 3 + trigger boundary 2)
- 4.3: +26 (1013 → 1039; markdown stripping 10 + content
  preservation 5 + whitespace normalization 5 + invariants 4 +
  realistic mixed inputs 2)

**API spend transparency:**

- Step 4 cumulative: $0 (pure data-transformation modules; no
  Anthropic API calls; ADR-02 amendment permits `src/grading/`
  but this step's modules don't actually call API)
- v0.5 cumulative through Step 4: $0.00891 (Step 2 probe runs
  only)
- Substantive API spend still deferred to Step 6 calibration
  ($10-25 envelope) per scope-doc

**Findings carried forward:**

1. **Replacement-token convention for prose-grading redaction:
   `[artifact]` over `<artifact>`.** Travis-flagged real
   concerns with `<...>`: HTML/markdown rendering ambiguity
   (judge sees redacted text; markdown→HTML rendering may
   interpret `<artifact>` as HTML tag); TypeScript-generics
   visual conflict (code blocks contain `<T>` patterns).
   Square-bracket convention follows journalism/legal
   redaction precedent and avoids both ambiguities. Pattern
   for v0.6+ when redacting in prose meant for LLM
   consumption.

2. **Style-normalize idempotency requires care with ordered
   transformations.** Two specific traps caught by test
   substrate: (a) backtick stripping must loop because
   emphasis-stripping can expose nested backticks; (b)
   underscore-emphasis must be bounded by non-word chars to
   avoid mangling snake_case identifiers (factual_correctness,
   get_symbol_context). Test substrate (6-input idempotency
   loop) caught these pre-commit.

3. **Position-bias trigger boundary precision is load-bearing.**
   ADR-19 §3 says "imbalance > 0.60"; implementation matches
   STRICTLY (exactly 60/40 = 0.6 does NOT trigger; 60.5/39.5 =
   0.605 does). Boundary verification test asserts both
   directions to lock the strict-greater behavior.

4. **Substep series LOC estimation tractability correlates
   with design-lock-phase depth.** Step 4 landed at 1.04×
   honest target after 7 design-lock decisions resolved
   pre-kickoff (Decisions A-G); Steps 2/3 ran 1.5-3× because
   design surface evolved during execution. Heuristic for
   v0.6+: front-load design-lock decisions; defer
   implementation kickoff until decisions resolved.

5. **forceSwapAB flag preferred over re-derived-seed for
   cross-order regrade.** Re-derived seed only swaps A/B
   stochastically (~50% of the time); ADR-19 §3 cross-order
   intent is GUARANTEED swap. Flag-based API guarantees swap
   while preserving determinism (given inputs + flag, same
   output). Cleaner contract; manifest entry's
   `cross_order_regrade` boolean reflects flag state for
   post-hoc decoding.

**Step 5 unblock:** statistical tooling implementation
(CI computation library via roll-our-own t-distribution lookup
per Step 1.4 lock + per-cell + aggregate reporting
infrastructure). Estimated LOC per scope-doc: ~200-350 kickoff;
applying 3× v0.5 calibration multiplier projects ~600-1050
actual.

---

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

- **2026-05-03 (commit `05c9fc7`)**: Step 5.0 ADR-19 §4
  amendment shipped at main-repo commit `05c9fc7`. Difference-of-
  means formula updated from unpaired-pooled (df=n_A+n_B−2) to
  paired-t (df=n−1) per Step 5 design proposal investigation-
  first surfacing. Cross-cell rollup math clarified as paired-t
  at concatenated N=25 differences (Option B-2 lock). Welch's
  correction paragraph removed (moot under paired-t). Step 5
  implementation (Steps 5.1-5.3) consumes paired-t formula per
  amendment. Trigger: Step 5 design proposal forced explicit
  paired-vs-unpaired choice at primitive-implementation time;
  original Step 1.4 lock chose unpaired-pooled by default-
  textbook framing without explicit adjudication. Travis
  adjudication 2026-05-03: paired-t methodologically correct for
  v0.5 substrate (structurally paired; trial-difficulty variance
  shared between conditions). ADR-19 §Revision history entry
  committed at amendment SHA; STEP-PLAN-V0.5 entry referencing
  it committed at Step 5.4 close commit.

- **2026-05-03 (commit `8df1490`)**: Step 4.6 reframe.
  Original §4.6 said "Style-normalization stretch deferred. Only
  ships if Step 8 post-hoc verification triggers." Original
  phrasing was scope ambiguous (implementation deferred OR
  activation deferred?). Reframed: "Style-normalization
  implementation ships at Step 4; activation conditional on
  Step 8 post-hoc verification trigger (>60/40 imbalance per
  ADR-19 §3)." Substantively cleaner — Step 4 is natural place
  for Stream A infrastructure; Step 8 is API spend (bad pacing
  for implementation under cycle pressure); test substrate
  cheap at Step 4; ~$0 cost difference. Disambiguates
  implementation-vs-activation scope. Downstream impact: Step 8
  consumes already-shipped `styleNormalize()` if trigger fires;
  no implementation work at Step 8.

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
