# STEP-PLAN-V0.6.md

**Status:** Active execution plan for v0.6. See `## Revision history`
for material rescopes; routine progress-log entries in `## Progress
log`.

**Initialized:** 2026-05-05 (Step 1.0 work post-Phase-3 v0.6-SCOPE.md
commit `a8d01eb` + substrate-preservation commit `b416d7b`)

---

## Conventions

### Step structure

Steps are numbered top-level units of v0.6 cycle work. Each step has
a scope statement + substep checklist + unblock condition for next
step. Substeps ship via commits; substep-shipping logged to
`## Progress log`.

V0.6 ladder shape diverges from v0.5 clean substep-bounded sequential
ladder per Q7 lock. Three substep types apply:

- **Substep-bounded sequential** (Steps 1-6 + 9): each substep has
  defined scope; ships via commits; sequential ordering enforced by
  dependency map per v0.6-SCOPE.md §Sequencing.
- **Cross-cutting** (Step 7): wall-clock spans Step 6 completion
  through cycle close; substantive content captured continuously in
  progress-log per discipline #3 surface-inline-before-commit
  cadence; running-log updated weekly OR when substantive cohort
  observation surfaces (append-when-observed semantics per B17
  hybrid capture pattern; sparse-is-OK).
- **Cycle-close-bounded** (Step 8): triggered by cycle close not
  preceded substep completion; aggregates substrate from Steps 5-7
  for B1 evaluation + B17 synthesis decision + tier-2 bundled re-
  evaluation.

### Step N.0 design-adjudication cadence

Steps 2-8 each open with a Step N.0 design-adjudication substep
that locks Step N's substep-level breakdown per discipline #3
surface-inline-before-commit cadence applied to step design phase.
Step N.0 mirrors Step 1.0 pattern: design adjudications surfaced
inline; locks captured in progress-log; subsequent substeps execute
against locked structure. Step N.0 substep is substep-bounded
sequential regardless of overall Step N type (Step 7's cross-cutting
nature applies post-Step-7.0; Step 8's cycle-close-bounded nature
applies post-Step-8.0).

### Progress log entries

When a step ships, append entry to `## Progress log` reverse-
chronological. Format:

```
### Step N shipped — YYYY-MM-DD

[Ship-narrative paragraphs]

| Substep | branch | commit | Notes |
|---|---|---|---|
| ... | ... | ... | ... |

[Additional narrative paragraphs / forward-pointers]
```

Cross-cutting Step 7 progress-log entries follow append-when-
observed semantics; substantive cohort observations + B17 captures
logged inline as they emerge; weekly cadence floor.

### Revision history entries

Material rescopes (cycle-thesis-affecting; rescope-condition
triggers; cycle-architecture changes) get logged in
`## Revision history`. Format:

```
- **YYYY-MM-DD (commit SHA): Step N revised — reason.**
```

Lock-refinement-during-execution-with-explicit-flag pattern applies
per v0.5 Step 11.3 Q11-style precedent: locks set at scope-doc-
drafting-time can refine at execution-time IF refinement adds
substrate value AND refinement is explicitly flagged for audit
trail.

---

## Execution order

Per Q7 ladder-shape adjudication lock at Step 1.0:

1. **Step 1** — Initialization + Q4/Q5/Q6 design adjudications +
   Q7 ladder lock (substep-bounded; meta)
2. **Step 2** — Stream B foundations (E2 priors interpretation +
   B15 ADR-19 §2 cost projection recalculation) (substep-bounded
   sequential; B; T-S scope; no dependencies; unblocks Stream B
   subset budgeting)
3. **Step 3** — Stream A foundations (A4 lazy-spawn + A6 doctor
   structure + H5 multi-dimension state-detection logic) (substep-
   bounded sequential; A; gates Step 4)
4. **Step 4** — Stream A pipeline assembly (A7 onboarding pipeline
   + B13-flags integration with `--cc-only` boolean opt-in flag
   per Q5 lock) (substep-bounded sequential; A; integrates Step 3
   outputs; user-facing UX per Q4 hybrid lock)
5. **Step 5** — Stream B targeted matrix-replication subset (8
   cells × n=5 × 2 conditions = ~80 trials per v0.6-SCOPE.md §7.1
   Q2) (substep-bounded; **parallelizable with Steps 3-4 wall-
   clock; no substep-sequencing enforcement; Step 5 completion
   order vs Step 4 determined by execution-time substrate
   generation**)
6. **Step 6** — Stream C tooling (cohort feedback template + tool-
   description observability via `--observe` flag with opt-in
   consent per Q6 lock + ADR-20 cohort observability contract +
   recruitment infrastructure) (substep-bounded; C; coincident with
   Step 4 wall-clock; ready by A7 completion)
7. **Step 7** — Cohort exposure + feedback collection + B17 capture
   (**cross-cutting**; wall-clock spans Step 6 completion through
   cycle close; B17 hybrid capture per v0.6-SCOPE.md §7.1 Q3
   concurrent throughout)
8. **Step 8** — Cycle-close evaluations (B1 rubric anchor refinement
   evaluation per Q9 + B17 synthesis decision per Q8 + tier-2
   bundled methodology-discipline cycle-close re-evaluation per
   Q10) (**cycle-close-bounded**; meta)
9. **Step 9** — Ship gate (9-step locked sequence per v0.5+ canonical
   inheritance including Step 7.5 post-execution verification;
   package.json bump 0.5.0 → 0.6.0; annotated tag `v0.6.0` per v0.5
   SHA-free precedent) (substep-bounded sequential; meta)

**Substantive ordering rationale per v0.6-SCOPE.md §Sequencing:**
Stream A pipeline-mechanics gates Stream C cohort exposure (Step 6
ready by A7 completion at Step 4); Stream B parallelizable with
Stream A (Step 5 absorbs Stream A design-uncertainty slack per
Item 3 rigor argument; matrix-replication is execution-bounded
work).

---

## Steps

### Step 1 — Initialization + design adjudications

**Scope.** STEP-PLAN-V0.6.md initialization + Q4/Q5/Q6 design
adjudications (per v0.6-SCOPE.md §7.2 Step-1-design-phase deferrals)
+ Q7 ladder-shape adjudication (per Section B observation flag).

**Substeps.**

- [x] **Step 1.0** — Initialization + Q7 ladder lock + Q4/Q5/Q6
  adjudications surfaced + locked per discipline #3 surface-inline-
  before-commit cadence.

**Unblocks.** Steps 2-6 implementation work.

---

### Step 2 — Stream B foundations (E2 + B15)

**Scope.** Stream B methodology-rigor foundations: E2 priors
interpretation discipline (load-bearing for v0.6 cost-projection
accuracy per v0.6-SCOPE.md Methodology limit #8) + B15 ADR-19 §2
cost projection recalculation (Opus 4.7 = 1.67× Sonnet pricing per
Step 2 finding #3). T-S scope; no dependencies; unblocks Stream B
subset budgeting at Step 5.

**Substeps.**

- [x] **Step 2.0** — Design adjudications: Q2.0.1-Q2.0.4 locks
  (CLAUDE.md addition section name + two distinct substeps +
  direct amendment + split documentation). Commit `92321d3`.
- [x] **Step 2.1** — E2 CLAUDE.md addition: "Cost-priors
  interpretation discipline (v0.6 Step 2 / E2 lock)" section
  alongside existing "Extraction cost framing" section. Commit
  `9aab055`.
- [x] **Step 2.2** — B15 ADR-19 §2 amendment: Opus 4.7 = 1.67×
  Sonnet pricing; amendment marker + revision history entry per
  v0.5 §4 amendment precedent. Initial commit `e803031` +
  separate backfill commit `dcb505d` per v0.5 SHA-backfill
  precedent.
- [x] **Step 2.3** — Step 2 close commit: progress log batching
  for Steps 2.1 + 2.2 + 2.3; cross-references between CLAUDE.md
  section + ADR-19 amendment confirmed bidirectional. (this
  commit)

**Unblocks.** Step 5 Stream B subset cost-budgeting + execution.

---

### Step 3 — Stream A foundations (A4 + A6 + H5)

**Scope.** Stream A pipeline-mechanics core: A4 `buildBundle` lazy-
spawn (atlas-only mode) + A6 doctor script (deep LSP health check
+ structure for multi-dimension state-detection) + H5 multi-
dimension state-detection logic (existing-repo-vs-new-project
branching + ADRs/code/README/DESIGN.md/language/git substrate
detection).

**Substeps.**

- [x] **Step 3.0** — Design adjudications: Q3.0.1-Q3.0.8 locks
  (distinct substeps; sample symbol traversal; independent
  detection; entry-check lazy-spawn; A4→A6→H5 ordering; atlas
  + HEAD-match detection; hybrid threshold pattern with refined
  placeholders; unit + integration tests).
- [x] **Step 3.1** — A4 buildBundle lazy-spawn implementation
  (entry-check + method-signature classification per Q3.0.4 +
  Q3.0.6 locks).
- [x] **Step 3.2.a** — A6 doctor core implementation (deep LSP
  health check + sample symbol traversal per Q3.0.2; state-
  detection CheckCategory framework for H5 integration).
- [x] **Step 3.2.b** — A6 doctor integration tests (TS + Go
  fixtures-passes; Pyright + gopls regression deferred per
  honest-scope-acknowledgment per discipline #4).
- [x] **Step 3.3** — H5 multi-dimension state-detection logic
  implementation (independent per-dimension detection per
  Q3.0.3; hybrid threshold pattern per Q3.0.7 with refined
  placeholders firmed at Step 3.3 design).
- [ ] **Step 3.4** — Step 3 close commit: progress log batching
  for Steps 3.1 + 3.2.a + 3.2.b + 3.3 + 3.4.

**Substep ladder refinement audit trail.** Original Q3.0.1 lock at
Step 3.0 specified 3.2 as single substep. Refined at execution-
time per Q11-style explicit-flag pattern: Step 3.2 split into
3.2.a (core implementation) + 3.2.b (integration tests) per dev-
flagged scope-anxiety at Step 3.2 surface adjudication. Matches
v0.5 Step 5 multi-substep precedent; methodology-hygiene
preserved.

**Unblocks.** Step 4 Stream A pipeline assembly.

---

### Step 4 — Stream A pipeline assembly (A7 + B13-flags integration)

**Scope.** A7 self-use onboarding pipeline integrating A4 + A6 +
H5 outputs; B13-flags `--cc-only` boolean opt-in integration into
A7 config setup per Q5 lock. UX flow per Q4 hybrid lock (automated
default path + interactive missing-substrate path per H5 state-
detection); specific message wording firms at Step 4 implementation.

**Substeps.**

- [x] **Step 4.0** — Design adjudications: Q4.0.1-Q4.0.13 locks
  (7-substep ladder; new init subcommand; H5 state-detection
  reuse via stateDetectionChecks; two doctor runs; --cc-only
  boolean opt-in per Q5 lock; runIndexSubcommand reuse; first-
  symbol-from-atlas smoke test; structured sectioned success
  message with [OK] ASCII marker; routing taxonomy 4 routes;
  auto-register .mcp.json with idempotent behavior; minimal flag
  surface; idempotent skip-when-present; unit + integration
  tests).
- [x] **Step 4.1** — `init` subcommand entry-point + parseArgs
  wiring + new file scaffold (`src/init/runner.ts`) per Q4.0.2
  lock.
- [x] **Step 4.2** — Config setup walkthrough + B13-flags
  `--cc-only` integration + `.contextatlas.yml` scaffold writer
  per Q4.0.5 lock + Q5 lock applicability.
- [x] **Step 4.3** — Doctor invocation orchestration + H5 state-
  driven routing decision module (`src/init/routing.ts`) per
  Q4.0.3 + Q4.0.4 + Q4.0.9 locks.
- [x] **Step 4.4** — Atlas creation (runIndexSubcommand reuse) +
  smoke test (first-symbol-from-atlas) + MCP registration
  (`.mcp.json` upsert) per Q4.0.6 + Q4.0.7 + Q4.0.10 locks.
- [x] **Step 4.5** — Success message + first-query suggestion UX
  (structured sectioned with [OK] ASCII marker) per Q4.0.8 lock.
- [ ] **Step 4.6** — Step 4 close commit: progress log batching
  for Steps 4.1 + 4.2 + 4.3 + 4.4 + 4.5 + 4.6.

**Unblocks.** Step 6 Stream C tooling readiness (cohort feedback
template + observability prerequisite); Step 7 cohort exposure
(post-Step-6 + recruitment).

---

### Step 5 — Stream B targeted matrix-replication subset

**Scope.** 8 cells × n=5 × 2 conditions = ~80 trials per v0.6-
SCOPE.md §7.1 Q2 lock (3 additional cells: 1 ca-favorable + 1 tie-
bucket + 1 trick-bucket; tier-gradation test points). Specific
cell identities firm at Step 5.0 design-adjudication. Methodology
infrastructure inherited from v0.5 (rubric / harness / paired-t
stats per ADR-19 + Phase-9 reference doc) without modification.

**Substeps.** Step 5.0 design-adjudication substep firms substep-
level breakdown per Step N.0 cadence convention.

**Unblocks.** v0.7 Stream B Q14 matrix-completion (substrate-
handoff) + Q16 B3 evaluation (analysis pass on v0.6 trick-bucket
substrate) per v0.6-SCOPE.md §v0.7 forward-pointers.

---

### Step 6 — Stream C tooling

**Scope.** Cohort feedback template (per v0.6-SCOPE.md Stream C
specification) + tool-description observability via `--observe`
flag with opt-in default + explicit consent prompt per Q6 lock +
ADR-20 cohort observability contract drafting + recruitment
infrastructure (recruitment process + trialist screening criteria
+ structured feedback template + pre-trial onboarding documentation).

**Substeps.** Step 6.0 design-adjudication substep firms substep-
level breakdown per Step N.0 cadence convention. ADR-20 drafting
alongside `--observe` flag UX implementation.

**Unblocks.** Step 7 cohort exposure (recruitment infrastructure
ready) + cohort feedback collection (template + observability
ready).

---

### Step 7 — Cohort exposure + feedback collection + B17 capture (cross-cutting)

**Scope.** Cohort recruitment + early-access exposure +
feedback collection + B17 self-use logging hybrid capture (per
v0.6-SCOPE.md §7.1 Q3 lock primary surface progress-log + secondary
surface `research/v0.6-self-use-log.md` append-when-observed).
Wall-clock spans Step 6 completion through cycle close.

**Cross-cutting documentation discipline (per Step 7 documentation
pattern lock):** running-log updated weekly OR when substantive
cohort observation surfaces (append-when-observed semantics per B17
hybrid capture; sparse-is-OK; cycle-close synthesis decision per
Q9 evaluates running-log substrate volume honestly).

**Substeps.** Step 7.0 design-adjudication substep firms cross-
cutting documentation discipline + cohort recruitment kickoff per
Step N.0 cadence convention. Subsequent substeps emergent during
execution:

- Cohort recruitment (initial outreach to Travis network)
- First-cohort-exposure (initial early-access invitations
  honored)
- Ongoing feedback collection (cohort feedback template applied
  to each cohort participant; tool-description observability data
  captured for opt-in consent participants)
- B17 hybrid capture (progress-log self-use observations +
  research/v0.6-self-use-log.md cross-cutting captures)

**Unblocks.** Step 8 cycle-close evaluations (cohort feedback
substrate + B17 captured substrate aggregated).

---

### Step 8 — Cycle-close evaluations (cycle-close-bounded)

**Scope.** Cycle-close-triggered evaluations:

- **B1 rubric anchor refinement evaluation** (per v0.6-SCOPE.md
  Q9): evaluates against v0.6 cohort feedback substrate; refinement
  only IF cohort surfaces concerns; ADR-19 §3 amendment if refinement
  triggers (analogous to ADR-19 §4 paired-t amendment pattern).
- **B17 self-use logging cycle-close synthesis decision** (per
  Q8): honest evaluation against captured substrate volume — ✓
  MET / △ PARTIAL with v0.7 forward-pointer / progress-log-
  distributed synthesis per Item 4 procedural pattern.
- **Tier-2 bundled methodology-discipline cycle-close re-evaluation**
  (per Q10): identify any items that surfaced organically during
  cycle warranting v0.7 elevation OR remain v1.x default per Item
  7 procedural pattern.

**Substeps.** Step 8.0 design-adjudication substep firms cycle-
close evaluation order + synthesis criteria per Step N.0 cadence
convention.

**Unblocks.** Step 9 ship gate.

---

### Step 9 — Ship gate

**Scope.** v0.6 ship gate per v0.5+ canonical 9-step locked
sequence inheritance:
1. Pre-flight verification (npm test main + benchmarks)
2. Apply working content (doc updates per ship discipline)
3. Stage explicit-paths
4. Create ship commit via HEREDOC
5. Verify commit landed
6. Create annotated tag `v0.6.0` via HEREDOC per v0.5 SHA-free
   precedent
7. Verify tag created
7.5. **Post-execution verification (canonical Step 7.5 inheritance):
   inspect committed body + tagged body for HEREDOC escape artifacts;
   encoding issues; formatting drift; cross-document SHA reference
   accuracy. STOP if artifacts caught; apply Path X amend + tag re-
   create per pre-push window affordance.**
8. Capture ship-commit SHA
9. (Cross-repo back-reference at separate commit + 9.8-style
   backfill if applicable per v0.5 ship-gate precedent)

**Substeps.** Substep-level breakdown follows v0.5 Step 11
substep-ladder pattern; v0.6 substeps numbered 9.1, 9.2.a-d, 9.3,
9.4, 9.5, 9.6, 9.7, 9.8 mirroring v0.5 Step 11.1, 11.2.a-d, 11.3,
11.4, 11.5, 11.6, 11.7, 11.8 substep structure (pre-flight +
external-doc inline surfaces + verification table + tag message
+ absorbed-item annotations + ship commit + tag operation + cross-
repo back-reference + SHA backfill if applicable).

**Unblocks.** v0.6 cycle close; v0.7 cycle-pre-planning per Strategy
B-with-explicit-launch-staging.

---

## Progress log

*Entries added in reverse-chronological order as steps ship.*

### Step 4.6 shipped — 2026-05-05 (Step 4 close)

V0.6 Step 4 closes per Stream A pipeline assembly specification
at v0.6-SCOPE.md. A7 self-use onboarding pipeline shipped per
Q4.0.1-Q4.0.13 locks at Step 4.0 + sub-adjudication clusters at
Steps 4.2-4.5 (Q4.2.1-Q4.2.6 + Q4.3.1-Q4.3.5 + Q4.4.1-Q4.4.7 +
Q4.5.1-Q4.5.5; 36 total adjudications across Step 4). Step N
close progress log batching pattern applied: Step 4.1 + 4.2 +
4.3 + 4.4 + 4.5 + 4.6 close progress log entries batched in
this single close commit per v0.5+ inheritance.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 4.6 close | main | [this commit] | Step 4 close + progress log batching for Steps 4.1 + 4.2 + 4.3 + 4.4 + 4.5 + 4.6 |

#### Step 4 cumulative outcome — Stream A pipeline assembly shipped

A7 self-use onboarding pipeline shipped per v0.6-SCOPE.md Stream
A specification:
- A7 `contextatlas init` subcommand orchestrates v0.6 onboarding
  pipeline integrating A4 lazy-spawn (Step 3.1) + A6 doctor (Step
  3.2.a + 3.2.b) + H5 multi-dimension state-detection (Step 3.3)
  into user-facing CLI flow
- Detect-then-scaffold reorder + first doctor run (gateway check)
  + H5 state-driven routing decision + atlas creation (idempotent
  skip-when-current) + smoke test (atlas-only mode validation) +
  .mcp.json idempotent upsert + sectioned success message +
  language-aware first-query suggestions
- B13-flags `--cc-only` boolean opt-in integration into config
  setup (architecture field added to ContextAtlasConfig schema;
  cohort substrate captures architectural-choice usage data for
  v0.7 architectural decision)

v0.6-SCOPE.md success criterion #1 (Stream A pipeline-mechanics
shipped + tested) **✓ MET** at Step 4.5 close (substantive
shipping; Step 4.6 is mechanical batching).

Step 5 Stream B targeted matrix-replication subset unblocked
next per v0.6-SCOPE.md §Sequencing recommended execution order.

#### Step 4 cumulative deliverable counts

- 7 commits across 7 substeps
- ~3,000 LOC across Step 4 (~390 + 275 + 393 + 628 + 952 + 640
  net Step 4 LOC; Step 4.6 close progress log batching adds
  STEP-PLAN-V0.6.md edit only)
- 90 net new tests across Step 4 (1153 → 1243; +14 [4.1] + +13
  [4.2] + +18 [4.3] + +19 [4.4] + +26 [4.5])
- Six new src/init/ modules: runner.ts + routing.ts + config-
  scaffold.ts + mcp-registration.ts + smoke-test.ts + success-
  message.ts (each with adjacent .test.ts file per CLAUDE.md
  adjacent-tests discipline)

#### Cycle-execution observation 1 — Step N.0 cadence applied at substep level

Step N.0 design-adjudication cadence convention extended to
substep-level for substantive substeps. Q4.2.1-Q4.2.6 + Q4.3.1-
Q4.3.5 + Q4.4.1-Q4.4.7 + Q4.5.1-Q4.5.5 sub-adjudication
clusters (28 sub-adjudications across 4 substeps) each surfaced
inline before commit per discipline #3 cadence applied at
substep-design-phase work.

Methodology pattern observation: Step N.0 cadence at top-level
(Step 4.0) anchors substep ladder; sub-adjudications at substep-
design-phase (Step 4.X surface review) refine implementation
specifics. Two-tier adjudication structure preserves clean audit
trail without bloating Step 4.0 with implementation-detail
adjudications. Pattern carry-forward to Steps 5+ where
substantive design surfaces warrant sub-adjudication clusters.

#### Cycle-execution observation 2 — Q4.4.7 dogfood integration test deferred

Q4.4.7 locked dogfood integration test with skip-when-current
path. Dev's design-time analysis surfaced flakiness concerns:
process.cwd() against contextatlas repo introduces
extracted_at_sha drift relative to HEAD during active dev;
.mcp.json write side-effect on test repo. Both add flakiness
without robust coverage.

Refinement applied at execution-time per Q11-style execution-
time refinement pattern: "no dogfood integration test at v0.6;
coverage redistributed across smoke-test.test.ts (sample-atlas
fixture; real importAtlasFile + listAllSymbols + buildBundle
reads) + runner.test.ts Step 4.4 atlas+smoke+MCP behavior tests
(orchestration paths covered against tmp dir + sample-atlas
fixture); cohort exposure at Step 7 covers full extraction path
per Q4.0.13 + Q4.4.7 framing." Discipline #3 surface-during-
implementation cadence applied.

#### Cycle-execution observation 3 — readPackageVersion shared utility annotation

Step 4.4 surface review verification result: src/index.ts
readPackageVersion is private + location-bound (its
import.meta.url resolves relative to src/index.ts; reuse from
src/init/runner.ts walks wrong path). Direct reuse requires
refactor (export + signature change to take moduleUrl parameter
OR extract to shared utility module).

Pragmatic resolution applied at Step 4.4: inline
readContextAtlasVersion helper in runner.ts (~12 LOC) using same
multi-level walk pattern as resolveContextatlasCommitSha from
cli-runner.ts:286-308 + resolveContextAtlasBinary from Step 4.4
design. Avoids brittle "0.6-dev" hardcode without expanding
scope to refactor src/index.ts.

Q11-style annotation: shared utility module extraction (e.g.,
`src/utils/package-meta.ts`) deferred to Step 4.5 OR v0.7+
pending substantive cross-module reuse demand. Substrate-
archaeology-readability preserved.

#### Discipline #3 cadence-catches at Step 4

Two cadence-catches recorded at Step 4 surface reviews:
- **16th instance — Step 4.0 Q4.0.5 surface (flag UX):** Dev's
  Q4.0.5 surface re-introduced `--architecture=<api|claude-code-
  only>` form that conflated Section A v0.6-SCOPE.md placeholder
  framing with Q5 lock from Step 1.0. Travis adjudication: apply
  Q5 lock per "B13-flags --cc-only boolean opt-in integration
  into A7 config setup per Q5 lock" (STEP-PLAN-V0.6.md §4 scope
  text). Q5 lock applicability re-established + Q11-style
  refinement clause added at Step 4.0 commit body.
- **17th instance — Step 4.4 implementation (smoke test pre-
  flight check):** Dev caught at first test run that
  openDatabase requires `.contextatlas/` directory to exist;
  added pre-flight check (existsSync atlas + cache paths) that
  surfaces missing atlas as actionable smoke failure before
  opening db. Discipline #3 surface-during-implementation cadence
  working.

Cumulative across v0.5 + v0.6 cycles: 17 cadence-catches
recorded; pattern continues to validate discipline #3 + #4
paired operation (catches at surface; honest-scope at execution).

---

### Step 4.5 shipped — 2026-05-05

V0.6 Step 4.5 ships sectioned success message + first-query
suggestion UX + exit code flip per Q4.0.8 lock + [OK] ASCII
marker refinement at Step 4.0 + Q4.5.1-Q4.5.5 sub-adjudications.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 4.5 | main | 9328bf0 | 26 net new tests; 640 insertions / 19 deletions across 6 files |

#### Implementation summary

Five sub-adjudications locked at Step 4.5 surface (Q4.5.1-
Q4.5.5):
- Q4.5.1 (β) src/init/success-message.ts new file (matches
  src/init/ pure-function module pattern)
- Q4.5.2 (α) struct-at-end accumulation pattern;
  InitSuccessState shape
- Q4.5.3 (α) atlasSymbolCount added to SmokeTestResult success
  path
- Q4.5.4 (α) symbol-name-based with kind-tag for language-aware
  first-query suggestions; works across all 3 supported langs
  without per-language template proliferation
- Q4.5.5 route-to-exit-code mapping flip: automated paths
  return exit code 0 on success (was 2 fail-loudly per Q4.2.6)

Sectioned success message renders 4 sections (Setup / Smoke /
Try-in-next-Claude-Code-session / Re-run) with [OK] ASCII
markers throughout per Q4.0.8 + cohort-process discipline +
[OK] refinement at Step 4.0 (terminal output reliability across
cohort participant terminal configurations).

In-place test flip per single-source-of-truth discipline:
4 existing runner.test.ts tests flipped from exitCode:2 to
exitCode:0 per Q4.5.5 + Q4.5 Point 6 lock.

#### Q4.2.6 fail-loudly framing finally lifted

Q4.2.6 locked at Step 4.2 design surface: "preserve fail-loudly
with exit code 2 between Step 4.2 and Step 4.5 commits; Step
4.5 commit flips final exit code semantics." Q4.5.5 lock at
Step 4.5 design surface: automated + automated-with-warning
paths flip to exit code 0; smoke-fail preserves exit code 2 per
Q4.0.7; doctor-fail + atlas-fail preserve exit code 1 per
ADR-12. Fail-loudly framing finally lifted at Step 4.5 close.

#### Step 4.5 unblock

Step 4.6 close (progress log batching) unblocked next per
Q4.0.1 ladder + 7-substep specification.

---

### Step 4.4 shipped — 2026-05-05

V0.6 Step 4.4 ships atlas creation (runIndexSubcommand reuse) +
smoke test (first-symbol-from-atlas in-process buildBundle) +
MCP registration (.mcp.json idempotent upsert) per Q4.0.6 +
Q4.0.7 + Q4.0.10 locks at Step 4.0 + Q4.4.1-Q4.4.7 sub-
adjudications.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 4.4 | main | 78f4a37 | 19 net new tests; 952 insertions / 57 deletions across 6 files |

#### Implementation summary

Seven sub-adjudications locked at Step 4.4 surface (Q4.4.1-
Q4.4.7):
- Q4.4.1 (α) stub adapter (NEVER_CALLED_ADAPTER) + atlas-only
  mode validates A4 lazy-spawn end-to-end via smoke test path;
  doctor deep health check covers LSP path separately (non-
  overlapping coverage)
- Q4.4.2 (α) first symbol by id from listAllSymbols
  (deterministic; sorted by id)
- Q4.4.3 (α) pre-check via detectAtlasOnlyAvailable; skip
  extraction if atlas current with HEAD
- Q4.4.4 (α) pass-through with init exit code 1 on any non-zero
  from runIndexSubcommand
- Q4.4.5 (α) src/init/mcp-registration.ts file location
- Q4.4.6 (α) walk-up from import.meta.url for binary path
  resolution; falls back to process.execPath
- Q4.4.7 LOCK: real-extraction test uses idempotent skip-when-
  current path (avoids real Anthropic API cost)

readPackageVersion verification result (Point 5 refinement):
inline helper readContextAtlasVersion in runner.ts (~12 LOC)
avoids brittle "0.6-dev" hardcode; shared utility module
refactor opportunity recorded as Q11-style annotation for v0.7+.

Q4.4.7 dogfood integration test deferred per execution-time
flakiness analysis (extracted_at_sha drift + .mcp.json write
side-effect); coverage redistributed across smoke-test.test.ts
(sample-atlas fixture) + runner.test.ts (orchestration paths) +
cohort exposure at Step 7.

A4 lazy-spawn empirical validation: smoke test exercises atlas-
only mode end-to-end; NEVER_CALLED_ADAPTER stub canary throws
if A4 fails to gate adapter calls; ~500ms-per-query optimization
works in integrated pipeline.

Smoke test pre-flight check caught at first test run: openDatabase
requires `.contextatlas/` directory to exist; pre-flight check
(existsSync atlas + cache paths) surfaces missing atlas as
actionable smoke failure before opening db. Discipline #3
surface-during-implementation cadence 17th instance.

#### Step 4.4 unblock

Step 4.5 (success message + first-query suggestion UX + exit
code flip) unblocked per Q4.0.8 lock + [OK] ASCII marker
refinement at Step 4.0.

---

### Step 4.3 shipped — 2026-05-05

V0.6 Step 4.3 ships doctor gateway invocation + H5 state-driven
routing module per Q4.0.3 + Q4.0.4 + Q4.0.9 locks at Step 4.0 +
Q4.3.1-Q4.3.5 sub-adjudications.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 4.3 | main | 10c0549 | 18 net new tests; 628 insertions / 63 deletions across 6 files |

#### Implementation summary

Five sub-adjudications locked at Step 4.3 surface (Q4.3.1-
Q4.3.5):
- Q4.3.1 (α) collectChecks direct call per Q4.0.4 lock
- Q4.3.2 (α) src/init/routing.ts pure function module
- Q4.3.3 (α) detectLanguagesFromFilesystem helper refactor +
  LanguageCode subset filter (typescript / python / go)
- Q4.3.4 (α) detect-then-scaffold reorder; STEP_4_2_LANGUAGES_
  PLACEHOLDER removed from runner.ts; Q4.2.4 Q11-style refinement
  realized
- Q4.3.5 route-to-exit-code mapping clarifies Q4.2.6 fail-loudly
  applies to automated path only; interactive paths exit code 0
  per Q4.0.9; doctor FAIL exit code 1 per ADR-12

[init] prefix verification result: existing convention is
`<subcommand>:` colon-prefix in stderr log lines (per
src/extraction/cli-runner.ts); NO prefix in stdout structured
output (per doctor's formatText). Init follows both: log.error
/log.info use "init: ..." prefix; route messages on stdout use
no prefix.

Routing taxonomy 4 routes per Q4.0.9 lock: existing-repo-with-
ADRs (automated) / existing-repo-missing-ADRs (interactive
guidance) / new-project (interactive guidance) / substantive-
content-warning (advisory inline within automated path). All
paths default non-interactive (print guidance + exit cleanly per
Q4.0.9).

#### Step 4.3 unblock

Step 4.4 (atlas creation + smoke test + MCP registration)
unblocked per Q4.0.6 + Q4.0.7 + Q4.0.10 locks.

---

### Step 4.2 shipped — 2026-05-05

V0.6 Step 4.2 ships config setup + B13-flags --cc-only
integration + .contextatlas.yml scaffold writer per Q4.0.5
lock + Q5 lock applicability + Q4.2.1-Q4.2.6 sub-adjudications.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 4.2 | main | f14cb04 | 13 net new tests; 393 insertions / 37 deletions across 7 files |

#### Implementation summary

Six sub-adjudications locked at Step 4.2 surface (Q4.2.1-
Q4.2.6):
- Q4.2.1 (α) top-level architecture field placement
- Q4.2.2 (α) optional with absent-means-default
- Q4.2.3 (α) src/init/config-scaffold.ts file location
- Q4.2.4 (β) pure-function scaffold writer + placeholder
  caller; Step 4.2 hard-codes ["typescript"] languages
  placeholder; Step 4.3 wires H5 detection per Q11-style
  refinement (realized at Step 4.3)
- Q4.2.5 (α) single function with result enum (created |
  preserved)
- Q4.2.6 (α) preserve fail-loudly with exit code 2 between
  Step 4.2 and Step 4.5 commits (lifted at Step 4.5 close)

Methodology pattern observation: Step N.0 design-adjudication
cadence convention applied at substep level for substantive
substeps (first instance at Q4.2.1-Q4.2.6 cluster); pattern
carries forward to Q4.3, Q4.4, Q4.5 sub-adjudication clusters.

ContextAtlasConfig schema bump: architecture field added
(optional with default "anthropic-api-claude-code"; type union
"anthropic-api-claude-code" | "claude-code-only"). Parser
TOP_LEVEL_KEYS extended; validateArchitecture wired per
existing per-section-validator pattern.

Pure function scaffold writer + idempotent shape per Q4.2.5
single-function-with-result-enum lock; YAML header comment for
cohort UX provenance + DESIGN.md cross-reference.

#### Step 4.2 unblock

Step 4.3 (doctor invocation orchestration + H5 state-driven
routing) unblocked per Q4.0.3 + Q4.0.4 + Q4.0.9 locks.

---

### Step 4.1 shipped — 2026-05-05

V0.6 Step 4.1 ships init subcommand entry-point + parseArgs
wiring + new file scaffold (`src/init/runner.ts`) per Q4.0.2
lock + Q4.0.13 unit-test coverage.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 4.1 | main | 582d52d | 14 net new tests; 275 insertions / 11 deletions across 5 files |

#### Implementation summary

Subcommand wiring per Q4.0.2 lock:
- Subcommand union extended: `"mcp" | "index" | "doctor" |
  "init"`
- KNOWN_SUBCOMMANDS adds `"init"`; SUBCOMMAND_SUGGESTIONS
  removes `"init"` → `"index"` entry (init now real subcommand)
- ParsedArgs adds `ccOnly: boolean` field
- parseArgs body adds `--cc-only` flag handling (boolean form
  only per Q5 lock + Q4.0.5 refinement; no --cc-only=value form)
- Compatibility rules: `--cc-only` only with init; `--json` now
  also accepted with init (compat error message updated)
- USAGE string updated to mention `[index|doctor|init]` +
  `[--cc-only]`; mechanical typo fix (trailing double-space
  before "(see ADR-08, ADR-11, ADR-12)" → single space)
- src/index.ts adds `subcommand === "init"` dispatch branch
  parallel to existing doctor/index dispatches per Q4.0.2 lock

Runner scaffold (src/init/runner.ts) — Step 4.1 scope: scaffold
+ signature only. Returns exit code 2 ("setup error: not yet
implemented") with log.error stderr message — fail-loudly per
CLAUDE.md guidance prevents silent confusion between Step 4.1
scaffold and Step 4.2-4.5 orchestration commits.

Test seams pre-emptive per DoctorRunOptions/IndexCliOptions
pattern (writeStdout + writeStderr fields).

#### Step 4.1 unblock

Step 4.2 (config setup + B13-flags --cc-only integration +
.contextatlas.yml scaffold writer) unblocked per Q4.0.5 lock +
Q5 lock applicability.

---

### Step 4.0 shipped — 2026-05-05

V0.6 Step 4 (Stream A pipeline assembly: A7 self-use onboarding
pipeline + B13-flags `--cc-only` integration) opens with Step
4.0 design-adjudication substep per Step N.0 cadence convention.
Q4.0.1-Q4.0.13 design adjudications surfaced + locked per
discipline #3 surface-inline-before-commit cadence applied to
step-design-phase work. Heavier substep ladder than Step 3
(7 substeps vs 5) per A7 user-facing UX breadth as predicted at
Step 3.4 close.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 4.0 design adjudications | main | [this commit] | Q4.0.1-Q4.0.13 locks captured; Step 4 substep ladder firmed (4.0 → 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6) |

#### Q4.0.1 lock — Substep structure

**Locked:** (β) distinct substeps. Step 4 substep ladder:
- Step 4.0 — Design adjudications (this commit)
- Step 4.1 — `init` subcommand entry-point + parseArgs wiring +
  new file scaffold (`src/init/runner.ts`)
- Step 4.2 — Config setup walkthrough + B13-flags `--cc-only`
  integration + `.contextatlas.yml` scaffold writer
- Step 4.3 — Doctor invocation orchestration + H5 state-driven
  routing decision module (`src/init/routing.ts`)
- Step 4.4 — Atlas creation (runIndexSubcommand reuse) + smoke
  test + MCP registration (`.mcp.json` upsert)
- Step 4.5 — Success message + first-query suggestion UX
- Step 4.6 — Step 4 close commit

Methodology rationale: matches v0.5 Step 5 + v0.6 Step 2 + v0.6
Step 3 multi-substep precedent. Each substep ships discrete
artifact; substep-bounded ship-discipline preserves cleaner audit
trail; scope-anxiety pre-empted at design time per Q11-style
refinement-anticipation pattern. Heavier ladder than Step 3
(7 substeps vs Step 3's 5 after 3.2 split) per A7 user-facing
UX breadth (entry-point + config setup + B13 + doctor + atlas
+ smoke + MCP registration + success UX).

#### Q4.0.2 lock — A7 entry-point design

**Locked:** (α) new `init` subcommand alongside existing
`index` + `doctor`. Mirrors ADR-12 partition discipline ("flags
compose, subcommands partition"). Concrete changes at Step 4.1:
- `src/cli-args.ts`: add `"init"` to `KNOWN_SUBCOMMANDS`; remove
  `init` from `SUBCOMMAND_SUGGESTIONS` (currently maps `init` →
  `index`); add `Subcommand` union member; add init-specific
  flag compatibility rules
- `src/index.ts`: add `subcommand === "init"` dispatch branch
  before MCP server setup (parallel to existing dispatches)
- New file: `src/init/runner.ts` exports `runInitSubcommand`
  (parallel to runDoctorSubcommand + runIndexSubcommand)

#### Q4.0.3 lock — H5 state-detection integration shape

**Locked:** (α) reuse `stateDetectionChecks(ctx)` and parse
DoctorCheck statuses (id-based lookup) to derive routing
decision in dedicated `src/init/routing.ts` module. Avoids
duplicating detection logic; H5 detection-layer-separation
observation preserved (A7 = consumer; H5 = detection layer);
state-driven not state-enforcement per Travis personal-notes
substrate. Routing decision module isolated for testable in
isolation.

#### Q4.0.4 lock — A6 doctor invocation pattern within A7

**Locked:** (α) two doctor runs (start + end) per v0.6-SCOPE.md
user-facing goal explicit specification (lines 143 + 152).
Doctor-fail handling distinguished by run position:
- First doctor run (state-detection-bearing): WARN proceeds with
  H5-driven conditional guidance; FAIL aborts init with
  actionable message
- Second doctor run (post-atlas verification): WARN acceptable;
  FAIL surfaces but doesn't abort (atlas already created)

Reuses `collectChecks(repoRoot)` from src/doctor/runner.ts
(in-process invocation; no subprocess spawn).

#### Q4.0.5 lock — B13-flags integration point

**Locked:** (α) flag writes to `.contextatlas.yml` only at v0.6.
ContextAtlasConfig schema bump at Step 4.2 implementation adds
`architecture` field (`"anthropic-api-claude-code" |
"claude-code-only"`). Default: `"anthropic-api-claude-code"`
(current dual-dependency; preserves backward compat).

**Q5 lock applicability re-established (refinement to dev's
Q4.0.5 surface).** Dev's Q4.0.5 surface re-introduced
`--architecture=<api|claude-code-only>` form that conflated
Section A v0.6-SCOPE.md placeholder framing with Q5 lock from
Step 1.0 (commit `99bf42c`). Q5 lock applies per STEP-PLAN-V0.6
§4 Step 4 scope text: "B13-flags `--cc-only` boolean opt-in
integration into A7 config setup per Q5 lock."

Flag UX: `--cc-only` boolean opt-in matching ADR-16
`--narrow_attribution` precedent. Flag-to-field mapping:
- `--cc-only` present → architecture = `"claude-code-only"`
- `--cc-only` absent → architecture = `"anthropic-api-claude-code"`
  (default)

If Step 4.2 implementation reading surfaces empirical reason
boolean opt-in is wrong, Q11-style explicit-flag pattern at
Step 4.2 close progress log captures refinement. Otherwise Q5
lock stands.

Rejected (β) for v0.6: claude-code-only path's MCP-config
implications not yet designed (v0.7 architectural decision);
v0.6 captures usage data only without altering server shape.

#### Q4.0.6 lock — Atlas creation step

**Locked:** (α) reuse existing `runIndexSubcommand` (exported
from src/extraction/cli-runner.ts:116). Init becomes pure
orchestrator over existing primitives (doctor + index + smoke
test); no duplicated extraction code; matches "extraction model
unchanged" v0.6 scope discipline. Pre-population for A4 lazy-
spawn benefit: extraction emits atlas.json + extracted_at_sha;
subsequent smoke-test query through MCP server uses atlas-only
mode (no adapter spawn cost); v0.6-SCOPE.md A4 framing realized
at this composition.

#### Q4.0.7 lock — Smoke test invocation

**Locked:** (α) first-symbol-from-atlas (parallels findSampleSymbol
logic from src/doctor/checks/sample-symbol.ts). In-process
`buildBundle` invocation (NOT subprocess MCP server) — avoids
stdio JSON-RPC protocol round-trip + spawning second contextatlas
process during init.

Smoke-test FAIL: surfaces error + actionable message ("Smoke
test failed; atlas extraction may have produced empty atlas —
verify ADRs are well-formed"); init exits with code **2**
(post-atlas-but-smoke-test-fail) distinguishing from setup-fail
(exit code 1).

#### Q4.0.8 lock — Success message + first-query suggestion UX

**Locked:** (α) structured sectioned message (Setup / Smoke /
Suggestion / Re-run sections).

**[OK] ASCII marker refinement (vs ✓ checkmark).** Replace
✓ checkmark with `[OK]` ASCII for terminal output reliability
across cohort participant terminal configurations. Per CLAUDE.md
emoji guidance ("Only use emojis if the user explicitly requests
it") + cohort-process discipline (terminal capability variance
across participant environments).

Refined sample shape:
```
[OK] ContextAtlas init complete

Setup:
  - Config: .contextatlas.yml created
  - Atlas: .contextatlas/atlas.json (123 symbols extracted)
  - MCP: .mcp.json registered (contextatlas server)

Smoke test:
  [OK] get_symbol_context returned bundle for sym:ts:src/foo.ts:bar
       (5 claims, 12 references, 0.234s)

Try in your next Claude Code session:
  "What does the foo function do?" — invokes get_symbol_context
  "Find symbols related to authentication" — invokes find_by_intent

Re-run:
  contextatlas doctor   # verify atlas + LSP health
  contextatlas index    # refresh atlas (after ADR/code changes)
```

Specific wording firms at Step 4.5 implementation per Q11-style
pattern. First-query suggestions language-aware if H5 detected
language; smoke-test symbol's name plumbs into suggestion.

#### Q4.0.9 lock — Interactive path message wording

**Locked:** Routing taxonomy (4 routes) driven by H5 detection
output:
- **existing-repo-with-ADRs** (ADR count ≥1; code substantive)
  → automated path (no interactive prompts)
- **existing-repo-missing-ADRs** (code substantive; ADR count =0)
  → interactive guidance (print + exit clean)
- **new-project** (code <substantive threshold; no ADRs;
  minimal/no README/DESIGN.md) → interactive guidance (print +
  exit clean)
- **substantive-content-warning** (e.g., README sparse but
  >0 words) → advisory inline within automated path

All paths default non-interactive (print guidance + exit
cleanly; no prompts blocking on user input). v0.7 H1 layer adds
interactive prompts based on cohort feedback. Specific wording
defers to Step 4.3 surface (routing module) inline per Q4 lock
framing + Q11-style pattern. UX shape (sectioned routing
decision + actionable guidance + re-run instructions) is locked.

#### Q4.0.10 lock — MCP server registration shape

**Locked:** (α) auto-register at repo root `.mcp.json` per v0.6-
SCOPE.md A7 framing explicit specification. Schema:
```json
{ "mcpServers": { "contextatlas": { "command": "node", "args": ["<absolute path to dist/index.js>"] } } }
```

Idempotent behavior:
- `.mcp.json` exists with `contextatlas` server entry → leave
  as-is + log info
- Exists but no contextatlas entry → merge into existing
  mcpServers preserving other entries
- Absent → create with single contextatlas entry

Args path resolution: walks from contextatlas binary
`__dirname` to find `dist/index.js` (mirrors src/index.ts:50-55
readPackageVersion pattern); falls back to `process.execPath`.

#### Q4.0.11 lock — init flag surface

**Locked:** (α) minimal flag surface for v0.6:
- `--cc-only` (B13-flags per Q5 lock + Q4.0.5 refinement; boolean
  opt-in)
- `--config-root <path>` (ADR-08 inheritance)
- `--json` (scriptable output; mirrors index/doctor pattern)

Deferred flags (`--force`, `--dry-run`, `--skip-smoke-test`,
`--non-interactive`) to v0.7+ contingent on cohort feedback per
v0.6-SCOPE.md substrate-generation-not-feature-completion thesis.

#### Q4.0.12 lock — Idempotency / re-run behavior

**Locked:** (α) idempotent skip-when-present:
- `.contextatlas.yml` exists → log info; skip config setup
- `.contextatlas/atlas.json` exists + extracted_at_sha matches
  HEAD → log info; skip extraction
- `.mcp.json` has contextatlas entry → log info; skip
  registration
- All present + current → init becomes effective `doctor + smoke
  test` orchestration

Surfaces `--force` flag deferral cleanly (v0.7+ if cohort
feedback warrants).

#### Q4.0.13 lock — Test coverage scope

**Locked:** (α) unit tests + integration tests per Q3.0.8
inheritance + CLAUDE.md adjacent-tests discipline.

Unit tests cover:
- Routing decision module (`src/init/routing.ts`): 6+ tests
  covering H5-state → route mapping (4 routes per Q4.0.9 lock)
- MCP-registration upsert helper: idempotent behavior; merge-
  into-existing case; create-fresh case; invalid-existing-shape
  case
- `.contextatlas.yml` scaffold writer: B13-flags plumbing;
  default values; ContextAtlasConfig schema validation
- Smoke test runner: success path; FAIL path with actionable
  message + exit code 2

Integration tests cover:
- Happy-path: init contextatlas-on-itself dogfood (verifies
  doctor pass + atlas extraction + smoke test pass + success
  message rendered + .mcp.json written)
- Missing-substrate: empty repo fixture (verifies new-project
  routing path; interactive guidance message; no atlas created;
  clean exit)
- Existing-repo-missing-ADRs: code-only fixture (verifies
  missing-ADRs routing path)
- Idempotency: run init twice on same repo; second run skip-
  when-present per Q4.0.12

Cohort smoke tests deferred to Step 7 cohort exposure work per
Q3.0.8 inheritance.

#### Step 4.0 unblock

Step 4.1 (`init` subcommand entry-point + parseArgs wiring +
new file scaffold) work unblocked per Q4.0.1-Q4.0.13 locks.
Step 4.1 surface should include:
- Pre-implementation reading of cli-args.ts + index.ts dispatch
  shape (already surveyed at Step 4.0 design phase)
- Implementation specification per Q4.0.2 lock (subcommand +
  parseArgs + new file scaffold)
- Test coverage per Q4.0.13 lock (unit tests adjacent to source)

---

### Step 3.4 shipped — 2026-05-05 (Step 3 close)

V0.6 Step 3 closes per Stream A foundations specification at
v0.6-SCOPE.md. A4 buildBundle lazy-spawn (atlas-only mode) + A6
doctor (deep LSP health check + state-detection CheckCategory
framework) + H5 multi-dimension state-detection all shipped per
Q3.0.1-Q3.0.8 locks at Step 3.0 + Q3.1-Q3.3 surface-time
refinements. Step N close progress log batching pattern applied:
Step 3.1 + 3.2.a + 3.2.b + 3.3 + 3.4 close progress log entries
batched in this single close commit.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 3.4 close | main | [this commit] | Step 3 close + progress log batching for Steps 3.1 + 3.2.a + 3.2.b + 3.3 + 3.4 |

#### Step 3 cumulative outcome — Stream A foundations shipped

Stream A pipeline-mechanics core shipped per v0.6-SCOPE.md
Stream A specification:
- A4 buildBundle lazy-spawn (atlas-only mode + method-signature
  classification; per-request detection cadence; commit
  `490f4ba`)
- A6 doctor (deep LSP health check via initialize → didOpen →
  diagnostic-arrival → shutdown sequence with sample symbol
  traversal per Q3.0.2; state-detection CheckCategory framework
  populated; commits `52ee846` core + `2cef348` integration
  tests)
- H5 multi-dimension state-detection (6 independent per-
  dimension detectors: ADRs/code/README/DESIGN.md/language/git
  per Q3.0.3 + Q3.3.1-Q3.3.6 locks; runner integration in both
  limited + normal mode; commit `b3af9e5`)

v0.6-SCOPE.md success criterion #1 (Stream A pipeline-mechanics
shipped + tested) **PARTIALLY ADVANCED** at Step 3 close: A4 +
A6 + H5 substantive substrate landed; A7 self-use onboarding
pipeline + B13-flags `--cc-only` integration remain at Step 4
(Stream A pipeline assembly per v0.6-SCOPE.md §Sequencing).

Step 4 (Stream A pipeline assembly: A7 onboarding pipeline + B13-
flags integration per Q5 lock) unblocked next per v0.6-SCOPE.md
§Sequencing recommended execution order.

#### Q3.0.1 lock refinement audit trail

Per Q11-style explicit-flag pattern (consistent with v0.6 cycle
methodology): Step 3 substep ladder refined at execution-time.
Original Q3.0.1 lock at Step 3.0 specified 3.2 as single substep
(3.0 → 3.1 → 3.2 → 3.3 → 3.4). Refined at Step 3.2 surface
adjudication (Adjudication 4 lock — Path β scope-split): Step 3.2
split into 3.2.a (core implementation: deep LSP health check +
sample-symbol helper + unit tests) + 3.2.b (integration tests:
TS + Go fixtures-passes only).

Refinement rationale: dev-flagged scope-anxiety at Step 3.2
surface; integration tests are distinct artifact class (real-
adapter spawn + fixture-dependent assertions vs mocked-adapter
unit tests at 3.2.a). Substep-bounded ship-discipline preserves
cleaner audit trail; matches v0.5 Step 5 multi-substep precedent;
methodology-hygiene preserved.

#### Cycle execution observation — discipline #3 cadence catches

Discipline #3 surface-inline-before-commit cadence caught two
substantive issues at pre-commit verification during Step 3
execution:
- **Step 2.2 chicken-and-egg backfill mechanism** (14th cadence-
  catch instance across cycle pattern): I initially proposed
  `--amend --no-edit` for ADR-19 §4 SHA backfill; verification
  revealed v0.5 used separate-commit backfill precedent
  (commits 05c9fc7 + 204a506). Travis adjudication: apply v0.5
  precedent per "precedent inheritance overrides recommendation"
  extended principle.
- **Step 3.2.b two integration-test deferrals** (15th cadence-
  catch instance): Pre-commit test surfaced (a) Pyright write-
  after-end race condition during LSP shutdown lifecycle; (b)
  empirical finding that current gopls v0.21.1 handles `go.mod`-
  less directories gracefully (v0.5+ candidate #6 motivating
  example does NOT reproduce). Both routed to honest-scope-
  acknowledgment over retroactive-checkbox per discipline #4.

Cycle pattern continues to validate discipline #3 + #4 paired
operation (catches at surface; honest-scope at execution).

#### v0.5+ candidate #6 status update

V0.5+ candidate #6 motivating example (gopls workspace-load
failure on `go.mod`-less directories) **does NOT reproduce
against current upstream gopls v0.21.1**. Per Step 3.2.b
empirical verification: gopls returns "pass" status when
spawned against `go.mod`-less repo state.

Substantive value of A6 deep health check **preserved beyond
specific motivating example**: the initialize → didOpen →
diagnostic-arrival → shutdown sequence with sample symbol
traversal catches OTHER adapter regressions per implementation
scope (per v0.6-SCOPE.md §Stream A A6 framing; per Q3.0.2 lock
at Step 3.0 surface). Positive cycle-execution finding: upstream
gopls fixed the original motivating regression.

V0.5+ candidate #6 reproduction status flagged for v0.6+
investigation per Phase-9 ref-doc §9 candidate-capture pattern;
benchmarks-repo canonical home for cycle-emergent-only candidate
inventory.

#### Phase-9 ref-doc §9 candidate-capture routing

Both Step 3.2.b deferrals routed to Phase-9 ref-doc §9
candidate-capture pattern at v0.6 cycle close per Travis
Observation 2 lock at Step 3.2.b surface; benchmarks-repo
canonical home per v0.5 precedent:
- Pyright doctor-integration test deferred (write-after-end
  race condition in Pyright LSP shutdown lifecycle; test
  logic works but cleanup throws; unit coverage compensates
  via 9 unit tests at Step 3.2.a level using mocked
  createAdapter)
- gopls regression synthetic test deferred (per v0.5+
  candidate #6 status update above)

---

### Step 3.3 shipped — 2026-05-05

V0.6 Step 3.3 ships H5 multi-dimension state-detection logic per
Q3.3.1-Q3.3.8 locks at Step 3.3 surface review (Q3.0.3 +
Q3.0.7 placeholder locks at Step 3.0 carried forward).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 3.3 | main | b3af9e5 | 20 new tests; 846 insertions across 4 files |

#### Implementation summary

Six independent dimension detectors per Q3.3.1 single-file lock
+ Q3.3.2-Q3.3.6 per-dimension adjudications:
1. **ADRs** — pattern `^\d{4}-.*\.md$` in resolved ADR dir
   (config-driven `.contextatlas.yml` adrs.path OR canonical
   `docs/adr/` fallback per Q3.3.2). ADR pattern-matching
   refinement applied per existing v0.4+ ADR convention (matches
   `docs/adr/` files in this repo).
2. **code** — walkForSourceFiles + binary present + substantive
   ≥5 advisory per Q3.3.3 hybrid lock. walkForSourceFiles export
   refinement applied per Q3.3.3 verification (exported from
   sample-symbol.ts at this step for code-dimension reuse).
3. **README** — file existence binary + word count ≥300
   substantive per Q3.3.4 + Q3.0.7 placeholder. Raw word count
   refinement applied per Q3.3.4 lock (whitespace-split + filter-
   non-empty; not markdown-stripped — consistency over accuracy).
4. **DESIGN.md** — file existence binary + word count ≥500
   substantive per Q3.3.4 + Q3.0.7 placeholder.
5. **languages** — configured `.contextatlas.yml` languages OR
   auto-detect via extensions scan per Q3.3.5 hybrid.
6. **git** — atlas committed + extracted_at_sha matches HEAD per
   Q3.3.6 (atlas-only-mode helpers reused for git-dimension
   detection; readHeadSha + detectAtlasOnlyAvailable from
   src/queries/atlas-only-mode.ts).

#### Test coverage

20 new tests per Q3.0.8 unit + integration test scope:
- 5 ADRs unit tests (canonical fallback / empty / numbered /
  pattern-filter / config-driven path)
- 3 code unit tests (no source / sparse / substantive)
- 3 README unit tests (absent / sparse / substantive)
- 3 DESIGN.md unit tests (absent / sparse / substantive)
- 3 languages unit tests (none / auto-detect / configured)
- 1 git unit test (no .git → warn)
- 2 aggregator integration tests (happy-path on contextatlas
  dogfood + synthetic missing-substrate fixture per Q3.3.8
  refinement; covers cohort-participant-missing-substrate case)

#### Runner integration

stateDetectionChecks runs in BOTH limited mode AND normal mode
(graceful null-config handling per Q3.3.2 + Q3.3.5 fallback
patterns).

#### H5 detection-layer separation preserved

Per H5 detection-layer-separation observation lock at Step 3.0:
H5 produces detection layer; A6 doctor consumes for verbose-mode
UX; cohort recruitment infrastructure consumes for participant
selection criteria. Each consumer references H5 detection output
for its own purpose without coupling H5 implementation to
consumer concerns.

#### Step 3.3 unblock

Step 3.4 close (progress log batching for Steps 3.1 + 3.2.a +
3.2.b + 3.3 + 3.4) unblocked next per Q3.0.1 lock + refinement.

---

### Step 3.2.b shipped — 2026-05-05

V0.6 Step 3.2.b ships A6 doctor integration tests per
Adjudication 4 lock (Path β scope-split) at Step 3.2 surface.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 3.2.b | main | 2cef348 | 2 new integration tests; 112 insertions across 3 files |

#### Original vs shipped scope

Original scope per Adjudication 4 lock: 4 integration tests
planned (TS + Pyright + Go fixtures-passes + gopls regression
synthetic).

Shipped scope: 2 integration tests (TS + Go fixtures-passes
only). Two honest-scope-acknowledgment deferrals captured per
discipline #4:

**Pyright doctor-integration test deferred.** Write-after-end
race condition surfaced in Pyright LSP shutdown lifecycle during
pre-commit test run. Test logic works (initialize → findSampleSymbol
→ findReferences sequence completes); cleanup throws uncaught
exception during shutdown teardown. Unit coverage compensates
via 9 unit tests at Step 3.2.a level using mocked createAdapter.

**gopls regression synthetic test deferred.** Empirical finding
at pre-commit test run: current gopls v0.21.1 handles `go.mod`-
less directories gracefully (returns "pass" status). v0.5+
candidate #6 motivating example does NOT reproduce against
current upstream. Honest-scope-acknowledgment over retroactive-
checkbox preferred per discipline #4 (faking assertion would
preserve checkbox while masking empirical truth).

#### gopls version specificity

Tested against `golang.org/x/tools/gopls v0.21.1`. v0.5+
candidate #6 motivating example was captured against earlier
gopls version (specific version not preserved at v0.5 candidate
capture time); upstream fix landed sometime before v0.21.1.

#### Phase-9 ref-doc §9 candidate-capture routing

Both deferrals routed to Phase-9 ref-doc §9 candidate-capture
pattern at v0.6 cycle close per Travis Observation 2 lock at
Step 3.2.b surface; benchmarks-repo canonical home per v0.5
precedent. Cycle-emergent-only candidate inventory scope
preserved per v0.5 Q10 lock distinction.

#### Step 3.2.b unblock

Step 3.3 (H5 multi-dimension state-detection logic
implementation) unblocked per Step 3.2.a CheckCategory framework
+ Step 3.2.b integration test substrate.

---

### Step 3.2.a shipped — 2026-05-05

V0.6 Step 3.2.a ships A6 doctor core implementation per Q3.0.2
lock (sample symbol traversal scope) + Q3.0.8 lock (unit tests
adjacent to source).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 3.2.a | main | 52ee846 | 16 new tests; 719 insertions across 5 files |

#### Implementation summary

- **state-detection CheckCategory addition** — populated
  doctor/types.ts CheckCategory union with `"state-detection"`
  variant; framework for H5 plug-in at Step 3.3.
- **checkDeepHealth function** — added to src/doctor/checks/lsp.ts;
  full sequence per Q3.0.2: createAdapter → initialize →
  findSampleSymbol → findReferences → shutdown. Failure modes:
  adapter construction / initialize / findReferences / shutdown
  / timeout → fail; no source files / no symbols → warn.
  DEEP_HEALTH_TIMEOUT_MS=30s vs spawn_test 10s ceiling.
- **findSampleSymbol helper** — added to new
  src/doctor/checks/sample-symbol.ts; walks repo for first source
  file matching adapter extensions; returns first symbol via
  adapter.listSymbols. Per Q3.0.2 lock: 1 symbol per language
  adapter detected; runtime discovery from actual repo state
  (matches v0.5+ candidate #6 motivating example — workspace-
  load failure surfaces only when running against actual user-
  repo state).
- **9 unit tests for checkDeepHealth + 7 unit tests for
  findSampleSymbol** per Q3.0.8 unit test coverage.

#### Adjudication 3 verification result

`lsp.test.ts` NEW per CLAUDE.md "Tests adjacent to source.
`foo.ts` + `foo.test.ts`. Use Vitest" discipline. Existing tests
previously lived in shared runner.test.ts (consolidated test
file pattern). Step 3.2.a verification confirmed the adjacent-
test discipline was the appropriate convention; new file created
rather than appending to runner.test.ts.

#### Step 3.2.a unblock

Step 3.2.b (A6 doctor integration tests) unblocked per Path β
scope-split lock at Step 3.2 surface adjudication.

---

### Step 3.1 shipped — 2026-05-05

V0.6 Step 3.1 ships A4 buildBundle lazy-spawn (atlas-only mode)
per Q3.0.4 entry-check + Q3.0.6 atlas-only-mode detection +
Q3.0.8 unit + integration tests locks.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 3.1 | main | 490f4ba | 19 new tests; ~300 LOC across 5 files |

#### Implementation summary

- **detectAtlasOnlyAvailable + readHeadSha helpers** — new
  src/queries/atlas-only-mode.ts; per Q3.0.6 lock atlas.json
  existence + extracted_at_sha HEAD-match auto-detection.
- **isAtlasOnlySafeScope helper** — added to
  src/queries/symbol-context.ts; method-signature classification
  (atlas-only-safe vs lsp-live-required) per Q3.0.4 +
  Q3.0.6 locks.
- **buildBundle entry-check** — diagnostics gated on
  `!atlasOnlyMode` per Travis Observation 1 lock at Step 3.1
  surface. Diagnostics-skip-in-atlas-only-mode behavior change
  captured: when atlas-only mode active, diagnostics field
  omitted from bundle (LSP-live data not available without
  adapter spawn; atlas substrate doesn't carry diagnostics).
- **Per-request detection cadence** — `detectAtlasOnlyAvailable`
  invoked per buildBundle call at handler-side
  (src/mcp/handlers/get-symbol-context.ts) using
  `readHeadSha(process.cwd())` + atlas.json path. Per
  architectural confirmation at Step 3.1 surface: per-request
  cadence chosen over server-startup-cached approach (avoids
  staleness-on-extraction-during-server-lifetime; cost negligible
  at small atlas.json + git HEAD read).

#### Test coverage

19 new tests per Q3.0.8 unit test scope:
- 7 isAtlasOnlySafeScope unit tests (method-signature
  classification matrix)
- 5 buildBundle integration-style tests with countingStubAdapter
  (verifies adapter NOT spawned in atlas-only mode for atlas-
  only-safe scopes; verifies adapter IS spawned for lsp-live-
  required scopes)
- 7 atlas-only-mode helper unit tests
  (detectAtlasOnlyAvailable + readHeadSha)

#### Step 3.1 unblock

Step 3.2 (A6 doctor script implementation) unblocked per Q3.0.5
A4 → A6 → H5 ordering lock.

---

### Step 3.0 shipped — 2026-05-05

V0.6 Step 3 (Stream A foundations: A4 buildBundle lazy-spawn +
A6 doctor script + H5 multi-dimension state-detection) opens
with Step 3.0 design-adjudication substep per Step N.0 cadence
convention. Q3.0.1-Q3.0.8 design adjudications surfaced + locked
per discipline #3 surface-inline-before-commit cadence applied
to step-design-phase work.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 3.0 design adjudications | main | [this commit] | Q3.0.1-Q3.0.8 locks captured; Step 3 substep ladder firmed (3.0 → 3.1 → 3.2 → 3.3 → 3.4) |

#### Q3.0.1 lock — Substep structure

**Locked:** (β) distinct substeps. Step 3 substep ladder:
- Step 3.0 — Design adjudications (this commit)
- Step 3.1 — A4 buildBundle lazy-spawn implementation
- Step 3.2 — A6 doctor script implementation
- Step 3.3 — H5 multi-dimension state-detection logic
- Step 3.4 — Step 3 close commit

Methodology rationale: matches v0.5 Step 5 + v0.6 Step 2 multi-
substep precedent. Each item ships discrete artifact (A4
buildBundle code path; A6 doctor script; H5 detection logic
module); substep-bounded ship-discipline preserves cleaner audit
trail.

#### Q3.0.2 lock — A6 deep LSP health check sequence + symbol-traversal scope

**Locked:** (α) sample symbol traversal. Full sequence per v0.6-
SCOPE.md Stream A: `initialize → didOpen → diagnostic-arrival →
shutdown` with symbol traversal. Sample scope: 1 symbol per
language adapter detected (TS/Python/Go); verify findReferences
returns. Catches gopls workspace-load failure on `go.mod`-less
directories (v0.5+ candidate #6 motivating example) without
sampling-cost-explosion at every `contextatlas init` invocation.

#### Q3.0.3 lock — H5 multi-dimension detection implementation pattern

**Locked:** (α) independent detection per substrate dimension.
Each detector module checks one dimension (ADRs / code / README
/ DESIGN.md / language / git); state report aggregates flags
from each. Matches v0.6-SCOPE.md Section A user-facing-goal
explicit specification + flexibility-as-feature design principle.
Q4 hybrid UX lock verbose-mode summary requires per-dimension
reporting which (α) supports cleanly.

#### Q3.0.4 lock — A4 lazy-spawn integration pattern

**Locked:** (α) entry-check with atlas-only mode detection. Detect
atlas-only mode at buildBundle entry; if so, skip adapter spawn
entirely; else spawn-as-usual. Method-signature classification
handles spawn-on-demand for live-data needs (atlas-only-safe vs
lsp-live-required methods). Simpler than thunk/lazy-init pattern;
matches v0.5+ candidate #4 fix-shape spec.

#### Q3.0.5 lock — Step 3 substep ordering

**Locked:** (α) A4 → A6 → H5. Per v0.6-SCOPE.md §Sequencing +
dependency analysis. A4 lazy-spawn independent (touches
buildBundle code path; standalone-implementable); A6 doctor
independent of A4 but logically follows; H5 depends on A6
(detection logic plugs into A6 doctor framework as sub-module).
Sequential ordering matches warmup-substep discipline (smallest
scope first per Step 5 v0.5 precedent).

#### Q3.0.6 lock — A4 atlas-only-mode detection logic

**Locked:** (α) atlas.json existence + extracted_at_sha HEAD-
match. Auto-detection minimizes user-facing UX changes; matches
ADR-06 "committed atlas as canonical artifact" inheritance.
Methods requiring LSP-live data (diagnostic resolution; recently-
edited file re-symbolization) override via internal method-
signature check; spawn happens lazily when these methods invoked
even after entry-check succeeds.

Specific implementation detail: query method classifies as
"atlas-only-safe" or "lsp-live-required"; entry-check sets atlas-
only mode flag; lsp-live-required methods invoke spawn-on-demand
via small wrapper.

#### Q3.0.7 lock — H5 missing-substrate threshold + substantive-content detection

**Locked:** (γ) hybrid pattern — file-existence binary +
substantive-content advisory. Doctor's verbose-mode output uses
advisory information ("README detected but sparse — for best
results, expand to include architecture overview").

**Refined placeholder thresholds** (firms further at Step 3.3 H5
implementation design):
- README ≥ 300 words (revised from initial placeholder 100; 100
  too low to discriminate "sparse" from "non-existent" — README
  with title + 3-line description is ~30 words)
- DESIGN.md ≥ 500 words (revised from initial placeholder 200;
  ADR-bootstrap-pattern input needs substantive architectural
  intent communication)
- ADRs ≥ 1 ADR (binary count unchanged; quality threshold
  deferred to v0.7 H2 ADR generation work per v0.6-SCOPE.md
  Methodology limit #14)

Specific threshold values still firm at Step 3.3 H5
implementation design phase via discipline #3 surface-inline
cadence (consistent with v0.6 cycle pattern of threshold details
deferred to implementation step). Refined values are improved
placeholders; Step 3.3 surface re-confirms or refines further.

#### Q3.0.8 lock — Test coverage scope

**Locked:** (β) unit tests + integration tests. Unit tests cover:
A4 atlas-only-mode classification logic; A6 LSP health check
state machine; H5 per-dimension detection logic. Integration
tests cover: A6 against real TS/Python/Go adapters on
contextatlas + cobra HEAD (matches v0.4 doctor script integration
test discipline). Cohort smoke tests deferred to Step 7 cohort
exposure work.

Matches v0.5+ existing test discipline (CLAUDE.md "Tests adjacent
to source. `foo.ts` + `foo.test.ts`. Use Vitest") + v0.4
conformance suite precedent.

#### H5 detection-layer separation observation

H5 detection layer is shared substrate for three concerns; clean
separation worth capturing for archaeology readers:

- **H5 = detection layer:** detects state per-dimension
  (independent detection logic per Q3.0.3 lock); no enforcement;
  no UX rendering; pure detection module
- **A6 doctor = consumer of H5 output for verbose-mode UX:**
  doctor's verbose-mode summary uses H5 state report + Q3.0.7
  substantive-content advisory thresholds to render user-facing
  guidance
- **Cohort recruitment infrastructure = consumer of H5 output
  for participant selection criteria:** existing-ADR-repos biased
  selection per v0.6 cohort recruitment criteria (Item 6 lock at
  Step 6 implementation)

Q3.0.7 dev recommendation framing slightly conflated H5 threshold
+ cohort selection bias. Clean framing per Travis adjudication:
H5 implementation focuses on detection layer; doctor verbose-mode
UX firms at Step 3.2 A6 implementation; cohort selection criteria
firm at Step 6 recruitment infrastructure. Each consumer
references H5 detection output for its own purpose without
coupling H5 implementation to consumer concerns.

#### Step 3.0 unblock

Step 3.1 (A4 buildBundle lazy-spawn implementation) work
unblocked per Q3.0.1-Q3.0.8 locks. Step 3.1 surface should
include:
- Pre-implementation reading of buildBundle code path (current
  state)
- Implementation specification per Q3.0.4 + Q3.0.6 locks
- Method-signature classification logic (atlas-only-safe vs
  lsp-live-required)
- Test coverage per Q3.0.8 lock (unit tests adjacent to source
  + integration tests against benchmark targets)

---

### Step 2.3 shipped — 2026-05-05 (Step 2 close)

V0.6 Step 2 closes per Stream B foundations specification at
v0.6-SCOPE.md. E2 priors interpretation discipline + B15 ADR-19
§2 cost projection recalculation shipped per Q2.0.1-Q2.0.4 locks
at Step 2.0. Step N close progress log batching pattern applied:
Step 2.1 + 2.2 (initial + backfill) + 2.3 progress log entries
batched in this single close commit.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 2.3 close | main | [this commit] | Step 2 close + progress log batching for Steps 2.1 + 2.2 + 2.3 |

#### Step 2 cumulative outcome

Stream B foundations shipped per v0.6-SCOPE.md Stream B
specification:
- E2 priors interpretation discipline (CLAUDE.md "Cost-priors
  interpretation discipline (v0.6 Step 2 / E2 lock)" section;
  commit `9aab055`)
- B15 ADR-19 §2 cost projection recalculation (initial commit
  `e803031` + backfill commit `dcb505d` per v0.5 SHA-backfill
  precedent)

Stream B subset budgeting unblocked at Step 5 — E2 + B15
establish methodology baseline (priors-interpretation discipline
+ Opus 4.7 pricing recalculation) for v0.6 targeted matrix-
replication subset cost-projection.

v0.6-SCOPE.md success criterion #3 (Stream B E2 priors
interpretation discipline + B15 ADR-19 §2 cost projection
recalculation shipped) ✓ MET.

Step 3 Stream A foundations (A4 lazy-spawn + A6 doctor script +
H5 multi-dimension state-detection) unblocked next per v0.6-
SCOPE.md §Sequencing recommended execution order. Step 3.0
design-adjudication substep first per Step N.0 cadence
convention.

#### Cycle execution observation: discipline #3 worked as designed at Step 2.2

At Step 2.2 verification step (precedent-check before commit per
Travis spec for v0.5 §4 paired-t amendment date-handling
verification), discipline #3 surface-inline-before-commit cadence
caught chicken-and-egg backfill mechanism issue: original Step
2.2 cadence spec used `git commit --amend` pattern; v0.5
precedent used separate-commit backfill (resolves amend chicken-
and-egg where amend creates new SHA but body must reference
initial commit SHA).

Dev surfaced verification observation alongside (a) date-handling
precedent confirmation; Travis adjudicated apply v0.5 separate-
commit backfill precedent per "precedent inheritance overrides
recommendation" principle extended from date-handling dimension
to backfill mechanism dimension. Both v0.5 + v0.6 amendment-
marker-cadence dimensions inherited via precedent-match.

Step 2.2 ships 2 commits (`e803031` + `dcb505d`) matching v0.5
§4 amendment 2-commit precedent (`05c9fc7` + `204a506`) exactly.
Substrate-archaeology-readability preserved.

This is the **13th instance of discipline #3** applied across
v0.5 + v0.6 substrate (12 instances at v0.5 ship-gate + 1
instance at v0.6 Step 2.2 verification step). Recursive
discipline operability at any cycle moment confirmed at v0.6
execution.

#### Step 2 unblock

Step 3 Stream A foundations work unblocked. Step 3.0 design-
adjudication substep first per Step N.0 cadence convention.
Step 3 deliverables per v0.6-SCOPE.md Stream A foundations
specification: A4 lazy-spawn (atlas-only mode) + A6 doctor
script (deep LSP health check) + H5 multi-dimension state-
detection logic.

---

### Step 2.2 shipped — 2026-05-05

V0.6 Step 2.2 ships ADR-19 §2 cost-projection amendment per
Q2.0.3 lock matching v0.5 §4 paired-t amendment at commit
`05c9fc7` precedent.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 2.2.a Initial amendment | main | `e803031` | ADR-19 §2 amendment 3 components with `[backfill SHA]` placeholder |
| 2.2.b SHA backfill | main | `dcb505d` | Replaces `[backfill SHA]` placeholder with `e803031` at 2 locations (blockquote + revision history) |

#### B15 amendment scope

Three components shipped:
- Amendment blockquote (top of §2): documents §2 amendment scope
  + cross-references to v0.5 Step 2 findings #3 + #4 + CLAUDE.md
  cost-priors interpretation discipline section (commit
  `9aab055`)
- Updated Option A cost-projection content (within §2): replaces
  pre-amendment "$100 absolute upper bound" Sonnet-baseline-
  referenced framing with Opus 4.7 verified pricing ($5/$25 base
  per v0.5 Step 2 finding #4; ~1.67× Sonnet baseline per finding
  #3); projects ~$33-50 theoretical upper bound; empirical anchor
  v0.5 cycle actual ~$10.25 platform-billed reconstructed
- Revision history entry (append after v0.5 §4 paired-t amendment
  entry): full amendment provenance per v0.5 §4 amendment
  revision-history pattern

Pattern-match to v0.5 §4 amendment 2-commit precedent: initial
commit ships with `[backfill SHA]` placeholder; separate backfill
commit replaces with actual initial commit SHA per chicken-and-
egg-avoidance pattern. v0.5: `05c9fc7` + `204a506`; v0.6:
`e803031` + `dcb505d`.

#### B15 cross-reference completion

Bidirectional cross-reference pattern with CLAUDE.md "Cost-priors
interpretation discipline (v0.6 Step 2 / E2 lock)" section
(commit `9aab055`) completed at this step:
- CLAUDE.md section forward-references ADR-19 §2 (placed at
  Step 2.1)
- ADR-19 §2 amendment backward-references CLAUDE.md section
  (placed at Step 2.2)

Pattern preserved per Q2.0.4 split lock.

#### B15 chicken-and-egg observation surfaced at verification

At Step 2.2 verification step per Travis spec (verify v0.5 §4
paired-t amendment date-handling pattern), dev surfaced additional
observation about backfill mechanism: v0.5 precedent uses
separate-commit backfill (commits `05c9fc7` + `204a506`); Travis
spec used `git commit --amend` pattern with chicken-and-egg
problem (amend creates new SHA; body must reference initial
commit SHA; amend pattern doesn't compose).

Travis adjudicated apply v0.5 separate-commit backfill precedent
per "precedent inheritance overrides recommendation" principle
extended from date-handling dimension to backfill mechanism
dimension. Discipline #3 surface-inline-before-commit cadence
caught divergence at verification step before commit; substrate-
discipline preserved.

#### Step 2.2 unblock

Step 2.3 close commit batches progress log entries for Steps 2.1
+ 2.2 + 2.3 per Step N close progress log batching pattern.

---

### Step 2.1 shipped — 2026-05-05

V0.6 Step 2.1 ships E2 priors interpretation discipline as new
CLAUDE.md section "Cost-priors interpretation discipline (v0.6
Step 2 / E2 lock)" alongside existing "Extraction cost framing"
section per Q2.0.1 lock.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 2.1 E2 CLAUDE.md addition | main | `9aab055` | "Cost-priors interpretation discipline (v0.6 Step 2 / E2 lock)" section addition; 4 sub-disciplines documented |

#### E2 4 sub-disciplines documented

Section captures 4 sub-disciplines as inheritance from v0.5
substrate (NOT v0.6-specific creation per inheritance-framing
observation flag at Step 2.0):
- Atlas-version-based filter discipline (per v0.5 Step 10.1
  Q4(i) lock; v0.4.0+ tagged substrate; forward-applicable
  interpretation primary)
- Cumulative aggregation discipline (per v0.5 Step 10.1 Q4(ii)
  lock; rolling-N alternative deferred to v0.8+ per B16
  closure)
- Mid-cycle priors-update variance discipline (per Phase-9
  ref-doc §10 limit #8; static priors throughout cycle)
- Cost-projection-vs-priors-drift discipline (interpretation
  guidance for budget-projection accuracy)

Explicit cross-references to v0.5 substrate sources: Phase-9
ref-doc §10 limit #8; v0.5 Step 10.1 Q4(i)/(ii) locks (benchmarks-
repo commit `8e39aa6`); cost-priors-v0.5.json provenance.

#### E2 inheritance-framing applied

Section frames discipline as inheritance from v0.5 substrate;
v0.6 is FIRST CYCLE applying discipline; future cycles (v0.6+)
consuming versioned cost-priors snapshots apply this discipline.

#### E2 forward cross-reference to ADR-19 §2 amendment

Section forward-references ADR-19 §2 (full pricing-model context;
v0.6 Step 2.2 amendment applies Opus 4.7 = 1.67× Sonnet pricing
per v0.5 Step 2 finding #3). Backward-reference completion lands
at Step 2.2 (ADR-19 §2 amendment cross-references CLAUDE.md
section).

Cycle-execution-time discipline canonical home pattern matches
v0.5 Pipeline Integration Discipline precedent (CLAUDE.md
absorbed pipeline-integration discipline at v0.5 Step 10.2 commit
`ef99b92`; same pattern preserved for cost-priors discipline at
v0.6 Step 2.1).

#### Step 2.1 unblock

Step 2.2 (B15 ADR-19 §2 amendment) implementation work unblocked
per Q2.0.3 lock; bidirectional cross-reference pattern completed
at Step 2.2.

---

### Step 2.0 shipped — 2026-05-05

V0.6 Step 2 (Stream B foundations: E2 priors interpretation
discipline + B15 ADR-19 §2 cost projection recalculation) opens
with Step 2.0 design-adjudication substep per Step N.0 cadence
convention. Q2.0.1-Q2.0.4 design adjudications surfaced + locked
per discipline #3 surface-inline-before-commit cadence applied to
step-design-phase work.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 2.0 design adjudications | main | [this commit] | Q2.0.1-Q2.0.4 locks captured; Step 2 substep ladder firmed (2.0 → 2.1 → 2.2 → 2.3) |

#### Q2.0.1 lock — E2 priors interpretation discipline documentation location

**Locked:** (α) CLAUDE.md section addition. Section name:
"Cost-priors interpretation discipline (v0.6 Step 2 / E2 lock)"
matching v0.5 Step 10 precedent format ("Extraction cost framing
(v0.4 Step 6 / Q5 lock; v0.5 Step 10 adaptive priors closure)").

Methodology rationale: matches v0.5 Step 10.2 Pipeline Integration
Discipline precedent — CLAUDE.md is canonical home for cycle-
execution-time discipline guidance. E2 priors interpretation is
analogous: discipline guidance for future cycles consuming
versioned cost-priors snapshots; lives alongside existing
Extraction cost framing section.

#### Q2.0.2 lock — E2 + B15 substep structure

**Locked:** (β) two distinct substeps. Step 2 substep ladder:
- Step 2.0 — Design adjudications (this commit)
- Step 2.1 — E2 CLAUDE.md addition
- Step 2.2 — B15 ADR-19 §2 amendment
- Step 2.3 — Step 2 close commit

Methodology rationale: matches v0.5 Step 5 multi-substep precedent
(5.0 design + 5.1 stats.ts + 5.2 reporting.ts + 5.3 scripts/lib/
stats.mjs + 5.4 close). Substep-bounded ship-discipline preserves
cleaner audit trail for archaeology readers.

#### Q2.0.3 lock — B15 ADR-19 §2 amendment pattern

**Locked:** (α) direct amendment to ADR-19 §2. Matches v0.5 Step
5.0 §4 paired-t amendment at commit `05c9fc7` precedent. Amendment
specifications:
- §2 content updated with Opus 4.7 = 1.67× Sonnet pricing applied
  (per Step 2 finding #3; Opus 4.7 verified pricing 2026-04-30)
- Amendment marker: "**§2 amendment 2026-05-XX commit `[backfill
  SHA]`** replaces Sonnet-baseline-referenced framing with current
  Opus 4.7 pricing"
- ADR-19 revision history entry mirroring v0.5 §4 amendment
  revision-history pattern
- Commit SHA backfill discipline per v0.5 SHA-placeholder-backfill
  precedent

Methodology rationale: maintains ADR canonical-decision-record
property; precedent inheritance preserved; archaeology-reader
navigation simple (single ADR-19 file with revision history showing
amendments).

#### Q2.0.4 lock — Cost-projection-discipline documentation scope split

**Locked:** (α) split. Distinct purposes warrant distinct documents:
- **ADR-19 §2 amendment (B15 work):** canonical-decision-record
  updates only — Opus 4.7 pricing recalc; cost-projection
  methodology-rigor for matrix-replication subset budgeting.
- **CLAUDE.md cost-priors interpretation discipline section (E2
  work):** cycle-execution-time discipline for future cycles
  consuming versioned cost-priors snapshots (atlas-version-based
  filter discipline + cumulative aggregation discipline + mid-
  cycle priors-update variance discipline + cost-projection-vs-
  priors-drift discipline).

Bidirectional cross-reference pattern: CLAUDE.md section references
ADR-19 §2 amendment for full pricing-model context; ADR-19 §2
amendment references CLAUDE.md section for application-discipline
context.

#### Inheritance framing observation for Step 2.1

The 4 sub-disciplines enumerated for CLAUDE.md addition are
**inheritance from v0.5 substrate**, not v0.6-specific creation.
Step 2.1 implementation explicitly cross-references v0.5 substrate
sources:
- Phase-9 ref-doc §10 limit #8 (mid-cycle priors-update variance)
- v0.5 Step 10.1 Q4(i) lock (atlas-version-based filter forward-
  applicable interpretation primary)
- v0.5 Step 10.1 Q4(ii) lock (cumulative aggregation discipline;
  rolling-N deferred to v0.6+ candidate per B16 closure)
- v0.5 cost-priors-v0.5.json provenance (snapshot at benchmarks-
  repo root; versioned discipline)

Framing: discipline guidance for FUTURE cycles consuming versioned
cost-priors snapshots, with v0.6 as first-cycle applying discipline.
CLAUDE.md addition documents EXISTING discipline applicable to
v0.6+ cycles, not new discipline introduced at v0.6.

#### Step 2.0 unblock

Step 2.1 (E2 CLAUDE.md addition) + Step 2.2 (B15 ADR-19 §2
amendment) implementation work unblocked per Q2.0.1-Q2.0.4 locks.

---

### Step 1.0 shipped — 2026-05-05

V0.6 cycle launches with STEP-PLAN-V0.6.md initialization. Step 1.0
work executes initialization + Q7 ladder-shape adjudication +
Q4/Q5/Q6 design adjudications surfacing per discipline #3 surface-
inline-before-commit cadence applied to Step-1-design-phase work
per v0.6-SCOPE.md §7.2 Q-list deferral.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 1.0 STEP-PLAN-V0.6 init | main | [this commit] | STEP-PLAN-V0.6.md created with 9-step ladder per Q7 lock; Q4/Q5/Q6 adjudications surfaced + locked; Step 1.0 entry captured |

#### Q7 ladder-shape lock

Per Section B observation flag at v0.6-SCOPE.md commit `a8d01eb`:
v0.6 ladder shape diverges from v0.5 clean step-by-step ladder per
cycle-substrate-shape difference (cross-cutting cohort exposure +
cycle-close-bounded evaluations don't fit substep-bounded sequential
ladder).

**Locked:** 9-step ladder with mixed step types:
- Steps 1-6 + 9: substep-bounded sequential
- Step 7: cross-cutting (wall-clock spans Step 6 completion through
  cycle close; B17 capture concurrent; running-log discipline per
  Step 7 documentation pattern lock)
- Step 8: cycle-close-bounded (triggered by cycle close not
  preceded substep completion)

**Step 5 parallelization clarification:** Stream B subset
parallelizable with Steps 3-4 wall-clock; no substep-sequencing
enforcement; Step 5 completion order vs Step 4 determined by
execution-time substrate generation.

**Step N.0 design-adjudication cadence (per Conventions section
addition):** Steps 2-8 each open with Step N.0 design-adjudication
substep mirroring Step 1.0 pattern; design adjudications surfaced
inline; locks captured in progress-log; subsequent substeps execute
against locked structure.

Lock-refinement-during-execution-with-explicit-flag pattern applies
per v0.5 Step 11.3 Q11-style precedent.

#### Q4 lock — A7 onboarding pipeline UX flow detail design

**Locked:** Hybrid (γ) — automated default path + interactive
missing-substrate path per H5 multi-dimension state-detection
logic.

**Specific UX flow draft (firms specific message wording at Step 4
implementation):**

1. `contextatlas init` invocation
2. H5 multi-dimension state-detection runs (silent if all substrate
   present; verbose summary if missing-substrate detected)
3. **Automated path (existing-repo-with-ADRs):** config setup
   runs with sensible defaults + B13 default architecture; atlas
   extraction; doctor re-run; smoke test invocation; success
   message with first-query suggestion.
4. **Interactive path (missing-substrate):** H5-driven specific
   guidance:
   - Existing-repo-missing-ADRs case: "ContextAtlas requires ADRs
     in `docs/adr/`; v0.6 doesn't auto-generate; please add ADRs
     manually then re-run `contextatlas init`."
   - New-project case: "ContextAtlas detected new-project state
     (no ADRs + minimal code). For best results, please add
     README.md + DESIGN.md per ADR-bootstrap pattern; v0.7 H2 ADR
     generation pipeline will scaffold further."
   - User re-runs init after addressing guidance.

Aligns with flexibility-as-feature design principle per v0.6-
SCOPE.md guiding principles; leverages H5 multi-dimension state-
detection investment; cohort exposure spans both ready-to-go +
missing-substrate cases providing substrate for v0.7 H2 design
across both paths.

#### Q5 lock — B13-flags flag-name UX design

**Locked:** Boolean opt-in flag `--cc-only` (default = current
dual-dependency architecture; flag enables single-dependency path).

End-user UX optimal: default users (most cases) zero typing;
advanced users discover via `--help`. Aligns with v0.5+ flag UX
precedents (`--narrow_attribution` per ADR-16). No flag-name
collisions with existing ContextAtlas flags or `--observe` (Q6
lock).

**Cohort feedback template question added (per Q5 lock substrate-
handoff):**

> "Did you encounter the `--cc-only` flag during install?
>  - Yes, organically
>  - Yes, via `--help`
>  - No
>  - Didn't know existed"

Captures architectural-choice awareness as v0.7 substrate signal
explicitly per Item 2 reconsider lock + Q12 v0.7 architectural
decision substrate-handoff. v0.7 evaluates B13 flag-usage substrate
including this awareness data.

#### Q6 lock — Tool-description observability `--observe` flag UX + ADR-20 scope

**Locked:** `--observe` flag with opt-in default + explicit consent
prompt + new ADR (ADR-20 cohort observability contract).

**ADR-20 scope (firms at Step 6 implementation):**
- **Data collected:** MCP tool invocations (tool name; conversational
  context surrounding invocation; tool-use traces if surfaceable
  via Anthropic API)
- **Storage:** lightweight log file local to user; cohort
  participants explicitly consent to inclusion in cohort feedback
  aggregation
- **Use:** v0.7 H2 + H1 + slash-command design substrate; tool-
  description-tuning target surfacing
- **Retention:** cohort exposure window + cycle-close synthesis;
  deletion process documented
- **Cross-references:** cohort recruitment process + screening
  criteria + structured feedback template

ADR-20 drafting at Step 6 implementation alongside `--observe`
flag UX. Privacy/data handling discipline preserved per cohort-
process discipline + ADR-20 canonical-decision-record.

#### Step 7 cross-cutting documentation pattern lock

**Locked:** Step 7 cross-cutting running log updated weekly during
cohort exposure window OR when substantive cohort observation
surfaces (e.g., critical pipeline-mechanics gap surfaces; cohort
feedback reveals tool-description-tuning target). Append-when-
observed semantics per B17 hybrid capture; sparse-is-OK; cycle-
close synthesis decision per Q9 evaluates running-log substrate
volume honestly.

#### Step 1.0 unblock

Steps 2-6 implementation work unblocked per Q4/Q5/Q6/Q7 locks.
Step 2 Stream B foundations (E2 priors interpretation discipline +
B15 ADR-19 §2 cost projection recalculation) starts next per
recommended execution order at v0.6-SCOPE.md §Sequencing; Step
2.0 design-adjudication substep first per Step N.0 cadence
convention.

---

## Revision history

- **2026-05-05** — STEP-PLAN-V0.6.md initialized at v0.6 cycle
  launch (post-Phase-3 v0.6-SCOPE.md commit `a8d01eb` + substrate-
  preservation commit `b416d7b`). Q7 ladder-shape adjudication
  locked at Step 1.0: 9-step ladder with substep-bounded sequential
  Steps 1-6 + 9 + cross-cutting Step 7 + cycle-close-bounded
  Step 8. Q4/Q5/Q6 design adjudications surfaced + locked per
  discipline #3 surface-inline-before-commit cadence applied at
  Step-1-design-phase per v0.6-SCOPE.md §7.2 Q-list deferral. Step
  7 documentation pattern locked (weekly running-log + when-
  substantive-observation-surfaces; append-when-observed). Step
  N.0 design-adjudication cadence convention added (Steps 2-8 open
  with Step N.0 design-adjudication substep mirroring Step 1.0
  pattern).
