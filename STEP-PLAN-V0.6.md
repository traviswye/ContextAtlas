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

**Substeps.**

- [x] **Step 5.0** — Design adjudications: Q5.0.1-Q5.0.12 locks
  (5-substep ladder; ca-favorable cell httpx/p3 + tie-bucket
  cell hono/h10 + trick-bucket cell deferred-to-5.1; atlas-
  version-tagging refinement at Q5.0.7 — fresh n=5 for all 8
  cells; cost framing per honest-scope-narrative discipline;
  explicit cost-approval gate at Step 5.2 surface).
- [x] **Step 5.1** — Methodology setup: cell-selection final
  lock (httpx/p3 + hono/h10 + cobra/c6 trick-bucket) + trial-
  script wiring (NEW v0.6-step5-orchestrator.mjs) + dry-run
  smoke test on cobra/c4.
- [x] **Step 5.2** — Full trial execution: 8 cells × n=5 × 2
  conditions = 86 trials (with hono/h1 auto-stretch); $33.39
  script-reported / ~$15.80 platform-billed actual; recovered
  from 529 outage + filterStep7 h10→h5 substitution at trial 67.
- [x] **Step 5.3.a** — Production grading harness (Q5.3.1 split
  refinement applied): 43 base pairs + 9 cross-order regrades
  + 2 swap-retry recoveries; cobra/c3 effective n=5/5; v0.5 F6
  reframing as 2-axis retry policy (Path A swap-retry harness
  extension).
- [x] **Step 5.3.b** — Statistical analysis + Phase-10 ref-doc
  + cost-priors-v0.6.json snapshot: tier-gradation-compare
  module; aggregate-cost-priors constant bumps; doc-gen hybrid
  generation; decomposition analysis. Substantive empirical
  finding: F1 atlas-substrate-version confound (5 anchors
  attenuate 28-100% on ALL 4 axes against v0.5.0 substrate);
  F9 methodology-design gap (tag-only-not-control pattern);
  9 F-findings drafted.
- [ ] **Step 5.4** — Step 5 close commit: progress log batching
  for Steps 5.0 + 5.1 + hotfix + 5.2 + 5.3.a + 5.3.b + 5.4
  close synthesis + v0.7 methodology amendment scope capture.

**Substep ladder refinement audit trail.** Original Q5.0.1 lock
at Step 5.0 specified 5-substep ladder (5.0/5.1/5.2/5.3/5.4).
Q5.3.1 refinement at Step 5.3 surface review applied Q11-style
explicit-flag pattern: Step 5.3 split into 5.3.a (grading
orchestration) + 5.3.b (statistical analysis + ref-doc); matches
Step 3.2 → 3.2.a/3.2.b precedent + v0.5 Step 8/9 split structure.
Final ladder: 5.0 → 5.1 → 5.2 → 5.3.a → 5.3.b → 5.4.

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

**Substeps.**

- [x] **Step 6.0** — Design adjudications: Q6.0.1-Q6.0.9 locks
  (5-substep per-item ladder; markdown cohort feedback template
  at research/cohort/feedback-template.md; server-level
  observability interception; --observe hybrid wiring
  init+mcp; ADR-20 8-section structure with consent framing
  earlier; research/cohort/ subdirectory; sanitize.ts hybrid
  privacy treatment with ~12-15 tests; ~25-33 net new tests
  for Step 6.2 observability code; clean Step 6 → Step 7
  coupling).
- [x] **Step 6.1** — B17 cohort feedback template (markdown at
  research/cohort/feedback-template.md per scope-doc §Stream C
  lines 418-427 specification). Shipped 2026-05-07; commit
  `69548f4`; 234 LOC NEW; 5 refinements applied.
- [x] **Step 6.2** — Tool-description observability (--observe
  flag + ContextAtlasConfig observability section + server-
  level interception + sanitize.ts privacy filter +
  observe.ts log writer + tests). Shipped 2026-05-07; commit
  `a624390`; 16 files; +1289/-6; 52 net new tests
  (1251 → 1303); 6 sub-adjudications + 3 refinements.
- [x] **Step 6.3** — ADR-20 cohort observability contract
  drafting (8 sections per Q6.0.5 refinement: Scope; Consent
  process; Data collected; Storage; Use; Retention;
  Participant rights; Cross-references). Shipped 2026-05-07;
  commit `dcd3c4d`; 1 file; +361 LOC; 5 open questions
  resolved + 0 cross-reference discrepancies surfaced.
- [x] **Step 6.4** — Recruitment infrastructure (3 docs at
  research/cohort/{recruitment-process,screening-criteria,
  pre-trial-onboarding}.md). Shipped 2026-05-07; commit
  `e9601e8`; 3 files; +574 LOC; 5 open questions resolved +
  2 refinements applied.
- [x] **Step 6.5** — Step 6 close commit: progress log
  batching for Steps 6.1 + 6.2 + 6.3 + 6.4 + 6.5 close
  synthesis + 6 cycle-execution observations.

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

**Substeps** (firmed at Step 7.0 per Q7.0.1 cross-cutting
substep ladder lock):

- [x] **Step 7.0** — Design adjudications (Q7.0.1-Q7.0.12 locks;
  cross-cutting Step 7 ladder shape; 3-tier honest evaluation
  framing pre-registration; framed-stub surfaces ready;
  pre-trial-onboarding.md amendment for inspection checkpoint
  visibility).
- [x] **Step 7 cross-cutting** — Cohort exposure execution
  CANCELLED at Step 7.5 per Travis pivot to feature-bearing
  v0.7 cycle (claude-code-only architectural work + v1.0
  launch target). Tier 3 evaluation framing applied per
  Q7.0.9 pre-registration. Recruitment infrastructure (Step
  6.4) + observability instrumentation (Step 6.2) + ADR-20
  contract (Step 6.3) carry forward to v0.7+ post-launch
  cycle for cohort exposure re-attempt.
- [x] **Step 7.5** — Step 7 close commit: Tier 3 framing
  application + cohort exposure cancellation rationale
  documented + framed-stub surfaces preserved for v0.7+
  inheritance. Shipped 2026-05-08; commit `[this commit]`.

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

**Substeps** (firmed at Step 8.0 per Q8.0.1 compressed split lock):

- [x] **Step 8.0** — Design adjudications (Q8.0.1-Q8.0.8 locks;
  3-substep compressed split; B1 NO-TRIGGER per Tier 3; B17
  ✓ MET via progress-log-distributed synthesis; Q10 tier-2
  7-item walkthrough; v0.7 launch-bearing reframe scope
  captured for Step 8.2 amendment).
- [x] **Step 8.1** — Cycle-close evaluations bundle (B1 +
  B17 + Q10 mechanically recorded per Q8.0.2 + Q8.0.3 +
  Q8.0.7 locks). Shipped 2026-05-08; commit `[this commit]`.
- [x] **Step 8.2** — v0_7-HANDOFF.md amendment + Step 8
  close (substantive interpretive — Travis pivot direction
  reframe per Q8.0.5 Refinement; cycle-execution observation
  aggregation per Q8.0.4; ~2-4 hours wall-clock; surface
  inline before commit per discipline #3 cadence). Shipped
  2026-05-08; commit `[this commit]`.

**Unblocks.** Step 9 ship gate (Step 8 entire arc is
prerequisite per Q8.0.6 lock).

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

### Step 8.2 shipped — 2026-05-08 (Step 8 close)

V0.6 Step 8.2 v0_7-HANDOFF.md amendment + Step 8 close shipped
per Q8.0.5 Refinement launch-bearing reframe lock + Q8.0.4
cycle-execution observation aggregation lock. Substantively
interpretive — discipline #3 surface-inline-before-commit
cadence applied to handoff doc amendment per Q8.0.1 dedicated
substep framing.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 8.2 close | main | [this commit] | v0_7-HANDOFF.md 4-amendment scope applied (Q8.0.5 launch-bearing reframe + Q8.0.4 cycle-execution observation aggregation + ship-gate criteria table update + revision history entry); Step 8 entire arc complete; Step 9 ship gate prerequisites met per Q8.0.6 lock |

#### Cross-reference verification

Verification pass between Q8.0.5 reframe scope (locked at Step
8.0 commit `864aeb9`) and Travis pivot direction at Step 7.5
(commit `11e0ddc`):

- PRIMARY claude-code-only extraction path framing matches
  Step 7.5 "Priority feature: claude-code-only extraction path
  (B13 functional implementation; ADR-02 amendment scope)"
- SECONDARY install/setup pipeline real-repo verification
  framing matches Step 7.5 cycle-thesis preservation framing
  (recruitment infrastructure carried forward; v0.7 dogfooding)
- TERTIARY backlog-drain matches Step 7.5 "Backlog drain: items
  from v0.6/v0.7 deferred backlog triaged at v0.7 scope-doc
  drafting time"
- DEFERRED-to-v0.8+ enumeration matches Step 7.5 "Methodology
  amendments from v0.6 F1-F9 substrate ... likely deferred to
  v0.8+" + Tier 3 cohort cancellation framing
- 4-5 day timeline matches Step 7.5 "Timeline: 4-5 day target"
- V1.0 ship-gate criteria status (#1 PARTIAL + #2 MET + #3 NOT
  MET) matches Step 7.5 "v1.0 launch trigger: post-v0.7 ship"
  framing

Outcome: 0 discrepancies between Q8.0.5 reframe scope and Travis
pivot direction at Step 7.5. Q8.0.5 Refinement applied verbatim
at Step 8.2 amendment.

#### Amendment A — v0.7 cycle launch-bearing reframe section

NEW `## v0.7 cycle launch-bearing reframe (Travis pivot at v0.6
Step 7.5)` section inserted after existing `## v0.6 cycle
execution substrate` section per Q2 chronological accumulation
order lock. Content per Q8.0.5 Refinement scope:

- Reframe rationale (substrate-generation thesis preserved via
  post-launch infrastructure inheritance)
- PRIMARY claude-code-only extraction path (B13 functional +
  ADR-02 amendment + cost model shift)
- SECONDARY install + setup pipeline real-repo verification
  (A7 onboarding empirical testing beyond Step 4.4 smoke test)
- TERTIARY backlog-drain launch-blocking items
- DEFERRED-to-v0.8+ enumeration (F1-F9 methodology amendments;
  cohort exposure execution; Stream B matrix-completion)
- v0.7 cycle target 4-5 day timeline to v1.0 launch
- V1.0 ship-gate criteria status post-v0.7 launch table
- Implications for original Phase 2 4-stream framing per Q1
  preservation lock (4-stream sections preserved as historical
  record with implications-block annotation pointing back)

#### Amendment B — Cycle-pre-planning insights augmentation

Per Q8.0.4 aggregation lock — cycle-execution observations
aggregate into existing v0_7-HANDOFF.md "Cycle-pre-planning
insights" section (vs creating parallel surface). 3 cumulative
entries appended:

- Step 6.5 (a-f) cumulative cycle-execution observations
  (one-line summary each; STEP-PLAN-V0.6.md Step 6.5 progress-
  log forward-pointer to commit `5ba1893` for full per-
  observation framing)
- Step 7.5 cohort exposure cancellation pre-registration-
  discipline-preserved observation (Q7.0.9 3-tier framing
  locked at Step 7.0 commit `77e523e` before outcome known;
  Tier 3 application at Step 7.5 commit `11e0ddc` is honest-
  scope discipline not retrofit)
- Step 8.1 cycle-close layered pre-registration discipline
  observation (Q9 + Q8 + Q10 + Q7.0.9 layered framings
  prevented post-hoc rationalization; generalizable v0.7+
  cycle-close synthesis discipline inheritance pattern)

#### Amendment C — V1.0 ship-gate criteria closure timeline table

Existing 4-row table at v0_7-HANDOFF.md "## V1.0 ship-gate
criteria closure timeline" section replaced with updated 4-row
table. Status post-v0.6 column updated from projected status
to actual outcome:

- Criterion #1 statistically-meaningful-wins: PARTIAL via
  8-cell subset at v0.6 with DIVERGED 2-of-4 axes; closes at
  v0.8+ matrix-completion (per launch-bearing reframe — was
  v0.7 matrix-completion; defers post-launch)
- Criterion #2 onboarding pipeline shipped: PARTIAL via early-
  access pipeline-mechanics at v0.6 Step 4.5; closes at v0.7
  empirical verification per launch-bearing reframe (was v0.7
  onboarding-completion full-stream; narrows to install/setup
  verification)
- Criterion #3 external dogfood trial: NOT MET via Tier 3
  cancellation at v0.6 Step 7.5; recruitment infrastructure
  ships at v1.0; closes at v0.8+ post-launch cohort exposure
  execution (was v0.7 trial execution; defers post-launch)

V1.0 closure framing: honest 2-of-3 MET + 1 carried forward
(criterion #3 to v0.8+; criterion #1 statistically-meaningful-
wins also carries forward via PARTIAL framing). Substrate-
generation thesis preserved via post-launch infrastructure
inheritance.

#### Amendment D — Revision history entry

2026-05-08 entry appended per dev-drafted shape covering 4-
amendment scope summary.

#### Step 8 cumulative outcome

Step 8 entire arc complete (3-substep compressed split per
Q8.0.1 lock):

- Step 8.0 design adjudications (commit `864aeb9`): Q8.0.1-
  Q8.0.8 locks captured; Step 8 substep ladder firmed; Q8.0.5
  Refinement scope captured for Step 8.2 amendment
- Step 8.1 cycle-close evaluations bundle (commit `a80a0a9`):
  B1 NO-TRIGGER per Tier 3 + B17 ✓ MET via progress-log-
  distributed synthesis + Q10 7-item tier-2 walkthrough 0
  elevations
- Step 8.2 v0_7-HANDOFF.md amendment + Step 8 close (this
  commit): 4-amendment scope applied per locked spec

Step 9 ship gate prerequisites met per Q8.0.6 lock — Step 8
entire arc is Step 9 prerequisite. Ship gate template ready
for execution: pre-flight verification (npm test main +
benchmarks); apply working content; stage explicit-paths;
ship commit via HEREDOC; v0.6.0 tag operation; Step 7.5 post-
execution verification; cross-repo back-reference.

#### Cycle-execution observation — pre-registration discipline working as designed (Step 8 cumulative)

Step 8 entire arc demonstrates pre-registration discipline
working-as-designed cycle-execution pattern. Layered pre-
registrations across cycle execution:

- Q7.0.9 3-tier cohort evaluation framing (Step 7.0 design
  adjudications) → Tier 3 application at Step 7.5
- Q9 B1 conditional refinement framing (scope-doc) → NO-
  TRIGGER mechanical mapping at Step 8.1
- Q8 B17 three-option synthesis framing (scope-doc) → ✓ MET
  via progress-log-distributed synthesis at Step 8.1
- Q10 tier-2 elevation gate framing (scope-doc) → 0 tier-1
  elevations 7-item walkthrough at Step 8.1
- Q8.0.5 Refinement launch-bearing reframe scope (Step 8.0
  design adjudications) → Step 8.2 amendment verbatim
  application

Pattern: cycle-thesis-bearing pre-registrations + step-design-
phase pre-registrations layer to substantively reduce cycle-
close cognitive load + prevent narrative-fitting-to-outcome
bias. Generalizable v0.7+ cycle-close synthesis discipline
inheritance pattern (already captured at Amendment B v0_7-
HANDOFF.md augmentation).

#### Step 8.2 unblock — Step 9 ship gate

Step 9 ship gate substantively unblocked. Step 9.0 design-
adjudication substep next per Step N.0 cadence convention.
v0.6 ship gate executes per v0.5+ canonical 9-step locked
sequence inheritance (pre-flight verification + apply working
content + stage explicit-paths + ship commit HEREDOC + v0.6.0
tag operation + Step 7.5 post-execution verification + cross-
repo back-reference).

---

### Step 8.1 shipped — 2026-05-08

V0.6 Step 8.1 cycle-close evaluations bundle shipped per
Q8.0.1 compressed split lock + Q8.0.2 + Q8.0.3 + Q8.0.7 sub-
adjudication outcomes. Mechanical recording of pre-registered
evaluation outcomes; documentation-bearing only; zero API
spend.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 8.1 evaluations bundle | main | [this commit] | B1 NO-TRIGGER per Tier 3 + B17 ✓ MET via progress-log-distributed synthesis + Q10 7-item tier-2 walkthrough 0 elevations |

#### B1 rubric anchor refinement evaluation — NO-TRIGGER per Tier 3

Q9 lock at scope-doc framing: "Evaluates against v0.6 cohort
feedback substrate at cycle close. Refinement only IF cohort
surfaces concerns about Axis 1 (factual_correctness) or Axis 4
(hallucination) anchor calibration."

**Cohort outcome:** Tier 3 (0 cohort substrate) per Step 7.5
close. Cohort exposure execution cancelled at v0.6 cycle per
Travis pivot to feature-bearing v0.7 cycle.

**B1 evaluation outcome:** NO-TRIGGER. Pre-registered
conditional refinement-only-IF-cohort path; 0 cohort substrate
= NO-TRIGGER by pre-registered framing.

**F1-F9 substrate non-applicability check:** F1-F9 substrate is
methodology-substrate (atlas-version-confound, methodology-
design-gap, retry-policy reframing, etc.), not anchor-
calibration-substrate. F1 is atlas-version-confound; F9 is
methodology-design-gap; neither is rubric-anchor-calibration
concern. Q9 framing explicitly scoped to cohort surfacing
Axis 1 or Axis 4 calibration concerns; F1-F9 do not satisfy
this trigger.

**Carry-forward annotation:** Conditional re-evaluation gate
carried forward to v0.7+ cohort substrate landing. When v0.7+
post-launch cohort exposure executes against v1.0-shipped
recruitment infrastructure, B1 re-evaluation triggers if
cohort participants surface Axis 1 or Axis 4 anchor calibration
concerns. Until cohort substrate lands, anchor-calibration
status remains v0.5-validated baseline.

#### B17 self-use logging cycle-close synthesis decision — ✓ MET

Q8 lock at scope-doc pre-registered three options:
- ✓ MET (substantive substrate across both surfaces)
- △ PARTIAL (sparse with v0.7 forward-pointer)
- progress-log-distributed synthesis (Item 4 procedural pattern)

**Decision:** ✓ MET via progress-log-distributed synthesis.

**Substrate volume across surfaces:**
- **Primary surface** (STEP-PLAN-V0.6.md progress-log
  `**Self-use observation:**` sub-blocks + cycle-execution
  observation entries): Substantive — Step 6.5 close synthesis
  captured 6 cycle-execution observations (a-f); Step 5.4
  close captured F1-F9 substantive findings; Step 7.5 close
  captured cohort exposure cancellation rationale + Tier 3
  application.
- **Secondary surface** (`research/v0.6-self-use-log.md`):
  Empty — sparse-is-OK per Q3 lock; cycle-execution
  observations fit substep-bounded shape rather than cross-
  cutting shape.

**Decision recording:** Step 7.5 close already established
"✓ MET via progress-log-distributed synthesis" via self-use-log
status update. Step 8.1 records the decision formally without
adding new aggregation surface (avoids substrate-pollution per
Q3 framing; sparse-is-OK preserved at secondary surface).

**v0.7+ inheritance:** B17 hybrid capture pattern (primary
progress-log + secondary self-use-log) carries forward to
v0.7+ cycle execution per scope-doc Q3 lock procedural pattern
inheritance.

#### Q10 tier-2 bundled deferral 7-item cycle-close re-evaluation

Pre-registration framing at scope-doc Q10: "if any item
surfaces as load-bearing during v0.6 execution, elevates to
tier-1 at cycle close." Per-item walkthrough per Q8.0.7 lock:

| Item | v0.6 surface? | Outcome | Carry forward |
|---|---|---|---|
| **B2** per-axis direction-agreement metric reformulation | NOT surfaced | tier-2 default | v0.8+ |
| **B5** cost-projection cache-discount calculator | NOT surfaced | tier-2 default | v0.8+ |
| **B6** variance trigger threshold language domain-specificity | NOT surfaced | tier-2 default | v0.8+ |
| **B7** output substrate density LOC inflation driver | NOT surfaced | tier-2 default | v0.8+ |
| **B9** failed-call cost-tracking gap | PARTIAL (F8 cost-projection accuracy + failed-call gap framing in Phase-9 ref-doc; v0.6 Phase-10 inherits framing without new issue) | tier-2 default with annotation | v0.8+ |
| **B11** explicit cache-control header configuration | NOT surfaced | tier-2 default | v0.8+ |
| **E1** MAD threshold empirically unanchored | NOT surfaced | tier-2 default | v0.8+ |

**Outcome:** 0 tier-1 elevations. All 7 carry to v0.8+ default
per pre-registered framing. Q10 cycle-close re-evaluation
prevents indefinite organic-refinement-without-refinement
per dev-rigor-lens survival-bias concern from Item 7 debate;
explicit checkpoint addressed without surfacing forced
elevations against substrate.

#### Cycle-execution observation — pre-registration discipline working as designed

Pre-registered framing at Step N.0 design phases (Q9 B1
conditional refinement + Q8 B17 three-option synthesis + Q10
tier-2 elevation gate; layered with Q7.0.9 3-tier cohort
evaluation framing) prevented post-hoc rationalization at
cycle close. Each evaluation outcome (B1 NO-TRIGGER + B17 ✓
MET + Q10 0 elevations) maps directly to a pre-registered
path; no retrofitting needed.

This pattern observation generalizes for v0.7+ cycle-close
synthesis discipline: pre-registration at substep design phase
substantively reduces cycle-close synthesis cognitive load +
prevents narrative-fitting-to-outcome bias. Cycle-thesis-
bearing pre-registrations (like Q7.0.9 3-tier framing)
particularly benefit from explicit pre-registration locks at
design-phase substeps.

#### Step 8.1 unblock

Step 8.2 (v0_7-HANDOFF.md amendment + Step 8 close) unblocked.
Step 8.2 substantively interpretive — handoff doc amendment
per Q8.0.5 Refinement launch-bearing reframe + cycle-execution
observation aggregation per Q8.0.4 lock; surface inline before
commit per discipline #3 cadence at substantively-interpretive
moments.

---

### Step 8.0 shipped — 2026-05-08

V0.6 Step 8 (cycle-close evaluations) opens with Step 8.0
design-adjudication substep per Step N.0 cadence convention.
Q8.0.1-Q8.0.8 design adjudications surfaced + locked per
discipline #3 surface-inline-before-commit cadence applied to
step-design-phase work.

Step 8 work shape: documentation-bearing only; zero API spend
per Step 7.0 Q7.0.6 inheritance; test coverage not applicable
(1303/1303 baseline preserved); lighter weight than Steps 1-6
substantive implementation per scope-doc §Sequencing item 8.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 8.0 design adjudications | main | [this commit] | Q8.0.1-Q8.0.8 locks captured; Step 8 substep ladder firmed (3-substep compressed split per Q8.0.1: 8.0 design / 8.1 evaluations bundle / 8.2 forward-pointer + close); v0.7 launch-bearing reframe scope captured for Step 8.2 amendment per Q8.0.5 Refinement |

#### Q8.0.1 lock — Substep ladder shape

**Locked:** (γ) compressed split — 8.0 design / 8.1 evaluations
bundle (B1 + B17 + Q10) / 8.2 forward-pointer + close.

Reasoning: each cycle-close evaluation is mechanical given pre-
registered framing — B1 evaluates against cohort substrate
(none per Tier 3); B17 partially honored at Step 7.5 (progress-
log-distributed synthesis); Q10 is checklist walk through 7
bundled items. Splitting each into its own substep imposes
ceremony without substantive content. Compressed split preserves
substep boundary discipline (clean audit trail) while batching
the mechanical evaluations. v0.7 forward-pointer drafting +
Step 8 close warrants own substep because v0_7-HANDOFF.md
amendment is substantively interpretive (Travis pivot direction
substrate; v0.7 cycle reframe).

#### Q8.0.2 lock — B1 rubric anchor refinement evaluation

**Locked:** (α) NO-TRIGGER per Tier 3 + (γ) carry-forward
annotation.

Reasoning: Q9 framing at scope-doc is explicit — "Refinement
only IF cohort surfaces concerns." Tier 3 = 0 cohort = NO-
TRIGGER by pre-registered framing. F1-F9 substrate is
methodology-substrate, not anchor-calibration-substrate; F1 is
atlas-version-confound, F9 is methodology-design-gap — neither
is rubric-anchor-calibration concern. Carry-forward annotation
captures conditional re-evaluation gate for v0.7+ cohort
substrate landing.

Recorded at Step 8.1 evaluations bundle.

#### Q8.0.3 lock — B17 cycle-close synthesis pattern

**Locked:** (α) affirm progress-log-distributed synthesis ✓ MET.

Reasoning: Q8 lock pre-registered three options — ✓ MET / △
PARTIAL with v0.7 forward-pointer / progress-log-distributed
synthesis per Item 4. Step 7.5 already established "✓ MET via
progress-log-distributed synthesis" via self-use-log status
update. Step 8 records the decision formally; doesn't need new
aggregation surface. Adding cumulative surface would substrate-
pollute (Q3 lock explicitly framed sparse-is-OK; secondary
surface should not be retrofit-aggregated).

Recorded at Step 8.1 evaluations bundle.

#### Q8.0.4 lock — Cycle-execution observation aggregation pattern

**Locked:** (γ) aggregate into v0_7-HANDOFF.md "Cycle-pre-
planning insights" section.

Reasoning: v0_7-HANDOFF.md is canonical bridge surface for v0.7
cycle pre-planning per its lifecycle. Existing "Cycle-pre-
planning insights" section already exists (L431). Step 5.4
close already amended this doc with F1-F9 + 5 methodology
amendments. Aggregating cycle-execution observations into
existing canonical surface preserves substrate continuity;
alternative parallel surface would create duplicate-substrate
risk.

Specifically: amend v0_7-HANDOFF.md "Cycle-pre-planning
insights" section with cumulative observation set (Step 6.5
(a-f) + Step 7.5 Tier 3 application + cohort cancellation
substrate) at Step 8.2.

#### Q8.0.5 lock — v0.7 scope-doc forward-pointers framing

**Locked:** (β) amend v0_7-HANDOFF.md with substantive v0.7
cycle reframe section + Refinement applied (explicit launch-
bearing reframe).

**Refinement applied:** v0.7 cycle is launch-bearing not
substrate-generation-bearing per Travis pivot at Step 7.5.
Original handoff framing (Stream B matrix-completion + 5
methodology amendments + cohort-exposure carry-forward)
substantively reframed.

**v0.7 cycle reframe scope (to be applied at Step 8.2 amendment):**

PRIMARY:
- claude-code-only extraction path (B13 functional implementation;
  ADR-02 amendment from extraction-sole-API-caller to extraction-
  via-multiple-paths; cost model shift from API-pay-per-use to
  subscription-bounded)

SECONDARY:
- Install + setup pipeline real-repo verification (A7 onboarding
  pipeline tested empirically beyond Step 4.4 smoke test;
  Travis-side dogfooding on real codebases)

TERTIARY:
- Backlog-drain items launch-blocking (specific items locked at
  v0.7 cycle pre-planning; expected scope: small)

DEFERRED TO v0.8+:
- F1-F9 methodology amendments (atlas-version-control [F1]; cell-
  selection empirical pre-screen [F3]; 2-axis retry policy [F4
  F6 reframing]; variance-control auto-stretch [F5]; causal
  mechanism investigation [F1 deferred]; F9 tag-only-not-control
  pattern observation)
- Cohort exposure execution (Tier 3 pre-registration applied at
  Step 7.5; recruitment infrastructure ships at v1.0 ready for
  post-launch real-world cohort)
- Stream B matrix-completion (full 8-cell vs partial subset;
  statistically-meaningful-wins gate work)

**v0.7 cycle target:** 4-5 day timeline to v1.0 launch.

**v1.0 ship-gate criteria status post-launch:**
- #1 statistically-meaningful-wins: PARTIAL via v0.6 Stream B
  subset; full matrix at v0.8+
- #2 onboarding pipeline shipped: MET via v0.6 Step 4.5 + v0.7
  empirical verification
- #3 external dogfood trial: NOT MET at v1.0 launch; v1.0 ships
  with cohort exposure infrastructure ready for post-launch
  real-world cohort

**Honest scope-acknowledgment:** v1.0 ship with NOT-MET on
criterion #3 is explicit trade-off for launch timing per Travis
pivot. Cohort substrate-generation thesis preserved via post-
launch recruitment infrastructure inherited from v0.6 cycle.

Reasoning: Travis pivot at Step 7.5 substantively reframes v0.7
as launch-bearing not substrate-generation-bearing. Without
amendment, v0.7 scope-doc drafting consumes contradictory
signals (handoff doc original framing vs Step 7.5 progress log
Travis direction). Amendment preserves substrate continuity per
v0.5→v0.6 precedent (Step 5.4 close amended handoff doc with
F1-F9 substrate per Path α).

Substep 8.2 substantively interpretive — discipline #3 cadence
applies; surface inline before commit per Q8.0.1 dedicated
substep framing.

#### Q8.0.6 lock — Step 9 ship gate prerequisites from Step 8

**Locked:** (γ) Step 8 entire arc is Step 9 prerequisite.

Reasoning: ship-gate template is sequenced (pre-flight
verification first; ship commit references cumulative cycle
substrate; v0.6.0 tag message references cycle-close
evaluations). Without Step 8 close, ship commit message is
incomplete. v0.5 precedent (Step 11 ship gate followed Step 10
close) followed sequential pattern. Step 8 close commit
unblocks Step 9 substep ladder execution.

#### Q8.0.7 lock — Q10 tier-2 bundled deferral cycle-close re-evaluation

**Locked:** 7-item tier-2 walkthrough; 0 tier-1 elevations;
all 7 carry to v0.8+ default.

Per-item evaluation:

| Item | Surface during v0.6? | Outcome |
|---|---|---|
| B2 (per-axis direction-agreement metric reformulation) | NOT surfaced | tier-2 default; carry to v0.8+ |
| B5 (cost-projection cache-discount calculator) | NOT surfaced | tier-2 default; carry to v0.8+ |
| B6 (variance trigger threshold language domain-specificity) | NOT surfaced | tier-2 default; carry to v0.8+ |
| B7 (output substrate density LOC inflation driver) | NOT surfaced | tier-2 default; carry to v0.8+ |
| B9 (failed-call cost-tracking gap) | PARTIAL — F8 cost-projection accuracy + failed-call gap inherits Phase-9 framing | tier-2 default; carry to v0.8+ with annotation |
| B11 (explicit cache-control header configuration) | NOT surfaced | tier-2 default; carry to v0.8+ |
| E1 (MAD threshold empirically unanchored) | NOT surfaced | tier-2 default; carry to v0.8+ |

Pre-registered framing at scope-doc Q10: "if any item surfaces
as load-bearing during v0.6 execution, elevates to tier-1 at
cycle close." 0 elevations confirms tier-2 bundled deferral
default holds; prevents indefinite organic-refinement-without-
refinement per dev-rigor-lens survival-bias concern from Item 7
debate.

Recorded at Step 8.1 evaluations bundle.

#### Q8.0.8 lock — Step 8 commit cadence

**Locked:** (α) 3 commits per substep matching Q8.0.1
compressed split.

Reasoning: substep boundary discipline preserves clean audit
trail per Steps 2-6 precedent. 8.0 design adjudication is its
own commit (this commit). 8.1 evaluations bundle is mechanical
but substantively records B1/B17/Q10 cycle-close decisions —
separate commit aids v0.7 substrate readers. 8.2 forward-
pointer + close is substantively interpretive (handoff doc
amendment) — separate commit per Step 5.4 close + v0_7-
HANDOFF.md amendment precedent.

#### Step 8.0 unblock

Step 8.1 (cycle-close evaluations bundle) unblocked.
Mechanical work — B1 NO-TRIGGER + B17 ✓ MET + Q10 7-item
walkthrough recorded into substep close progress log entry.

Step 8.2 substantively interpretive at Step 8.1 close —
v0_7-HANDOFF.md amendment surface inline before commit per
discipline #3 cadence; Q8.0.5 Refinement scope documented at
this entry serves as drafting anchor.

---

### Step 7.5 shipped — 2026-05-08 (Step 7 close)

V0.6 Step 7 closes per Travis cycle-execution direction lock
2026-05-08: cohort exposure execution cancelled at v0.6 cycle;
Tier 3 evaluation framing pre-registration applied per Q7.0.9
lock; recruitment infrastructure carries forward to v0.7+
post-launch cycle.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 7.5 close | main | [this commit] | Step 7 close + Tier 3 framing application + cohort exposure cancellation rationale documented + framed-stub surfaces preserved |

#### Cohort exposure cancellation rationale

Travis pivot to feature-bearing v0.7 cycle targeting v1.0 launch
in 4-5 day timeline. Cohort exposure execution at v0.6 deferred
to v0.7+ post-launch cycle. Substantive reasoning:

- v0.6 cycle scope-doc thesis (substrate-generation under
  cohort exposure) preserved in spirit via Stream A pipeline-
  mechanics + Stream B methodology rigor + Stream C tooling
  shipped; cohort exposure execution would extend cycle wall-
  clock by ~2-4 weeks per pre-trial-onboarding.md framing
- Travis priority shift: claude-code-only architectural work
  (B13 functional implementation; ADR-02 amendment scope) is
  v1.0-launch-bearing; 4-5 day timeline doesn't accommodate
  cohort exposure window
- Cohort exposure infrastructure shipped at Step 6 substantively
  inherits to v0.7+ — no infrastructure rework needed; v0.7+
  cycle re-attempts against carried-forward substrate
  (recruitment + screening + onboarding + feedback template +
  observability instrumentation + ADR-20 consent contract)
- 3-tier evaluation framing pre-registration at Q7.0.9
  anticipated this fallback path explicitly; Tier 3
  classification is honest-scope discipline, not retrofit

#### Tier 3 evaluation framing application per Q7.0.9 pre-registration

**Tier 3 (0 participants) classification.** Cohort substrate
quality: zero direct cohort substrate generated at v0.6 cycle.
Cycle-thesis re-evaluation per v0.6-SCOPE.md §12 risk #12: v0.6
ships pipeline-mechanics + methodology rigor without cohort
substrate; v0.7 inherits recruitment infrastructure and re-
attempts cohort exposure post-v1.0-launch.

This matches the Tier 3 pre-registered framing exactly. Pre-
registration discipline preserved — tier evaluation locked at
Step 7.0 (commit `77e523e`) before recruitment outcome known;
applied at Step 7.5 against actual recruitment outcome
(cancelled). Honest-scope discipline anchors Step 8 cycle-
close synthesis + Step 9 ship gate framing.

#### Cohort substrate empty-state honest acknowledgment

- `research/v0.6-cohort-substrate.md`: 0 cohort submissions
  landed (Tier 3); framed-stub preserved for v0.7+ inheritance
  with status update at top noting Tier 3 application
- `research/v0.6-self-use-log.md`: 0 entries landed; cycle-
  execution observations captured at primary B17 surface
  (STEP-PLAN-V0.6.md progress-log Step 6.5 close synthesis
  (a-f) + this Step 7.5 entry); framed-stub preserved for
  v0.7+ inheritance with status update at top noting cycle-
  close synthesis decision per Q8 lock as ✓ MET via progress-
  log-distributed synthesis

Q3 lock (B17 hybrid capture) + Q8 lock (cycle-close synthesis
decision) both honored — sparse-is-OK; substantive substrate
captured at primary progress-log surface; cycle-close
synthesis frames substrate quality honestly per pre-registered
discipline.

#### Cycle-emergent candidates surfaced at Step 7.5

**Cohort exposure carry-forward to v0.7+ post-launch cycle.**
Recruitment infrastructure + observability instrumentation +
ADR-20 contract substantively complete at v0.6 ship; v0.7+
post-launch cycle re-attempts cohort exposure against carried-
forward substrate. Captured for v0.7+ candidates absorption.

#### v0.7 cycle pre-planning substantive reframe

Travis direction at Step 7.5 cancellation:
- **Priority feature:** claude-code-only extraction path (B13
  functional implementation; ADR-02 amendment scope —
  extraction prompting in Claude Code session context vs
  Anthropic API direct)
- **Backlog drain:** items from v0.6/v0.7 deferred backlog
  triaged at v0.7 scope-doc drafting time
- **Timeline:** 4-5 day target
- **v1.0 launch trigger:** post-v0.7 ship
- **Methodology amendments from v0.6 F1-F9 substrate** (atlas-
  version-control; cell-selection empirical pre-screen;
  others): likely deferred to v0.8+ given launch focus
- **Cohort exposure infrastructure carry-forward:** recruitment
  + observability ship at v1.0 ready for post-launch real-world
  cohort

v0.7 scope-doc drafting surfaces inline for Travis review
before commit per discipline #3 cadence at scope-doc level.

#### Step 7.5 unblock

Step 8 cycle-close evaluations unblocked. Steps 8-9 are dev-
bearing cycle-close synthesis + ship-packaging work; lighter
weight than Steps 1-6 substantive implementation per scope-doc
§Sequencing item 8 (B1 rubric anchor refinement evaluation;
deferred to cycle close) + item 9 (v0.6 cycle close + ship
gate per 9-step locked sequence inheritance from v0.5 including
Step 7.5 post-execution verification).

---

### Step 7.0 shipped — 2026-05-07

V0.6 Step 7 (cohort exposure cross-cutting) opens with Step 7.0
design-adjudication substep per Step N.0 cadence convention.
Q7.0.1-Q7.0.12 design adjudications surfaced + locked per
discipline #3 surface-inline-before-commit cadence applied to
step-design-phase work.

Step 7 transitions to cross-cutting cohort exposure execution
rhythm — documentation-bearing rather than implementation-
bearing; wall-clock cohort-cadence-dependent (~2-4 weeks per
pre-trial-onboarding.md framing); Travis-side recruitment
outreach + cohort participant communication + substrate
aggregation.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 7.0 design adjudications | main | [this commit] | Q7.0.1-Q7.0.12 locks captured; Step 7 substep ladder firmed (cross-cutting + Step 7.5 close per Q7.0.1 lock); 2 framed-stub surfaces created (research/v0.6-self-use-log.md + research/v0.6-cohort-substrate.md); pre-trial-onboarding.md amended for inspection checkpoint visibility per Q7.0.12 refinement |

#### Q7.0.1 lock — Substep ladder shape

**Locked:** (β) single cross-cutting substep + optional sub-
commits when substantive observations surface + Step 7.5 close.

Reasoning: scope-doc Q7 lock explicitly framed Step 7 as "cross-
cutting substep for cohort feedback / B17 capture; cycle-close
substep for B1 + B17 synthesis." v0.6 ladder diverges from v0.5
step-by-step pattern intentionally for cross-cutting items.
Cohort cadence is participant-driven, not substep-driven.
Splitting Step 7 into 6 phases would impose substep-boundary
rhythm on inherently cross-cutting work.

#### Q7.0.2 lock — Recruitment activation timeline

**Locked:** (β) post-Step-7.0-landing.

Surfaces design-adjudication-locked discipline; Step 7.0
establishes what cohort exposure "execution" means before
outreach starts. Travis can begin outreach at any pace
post-7.0 lock; no calendar-bound trigger imposed.

#### Q7.0.3 lock — Substrate aggregation pattern

**Locked:** (γ) two-surface split — `research/v0.6-cohort-
substrate.md` (cohort participants) + `research/v0.6-self-use-
log.md` (Travis self-use B17).

Reasoning: cohort substrate is participant-submitted material
(different consent + provenance dimension per ADR-20); self-use-
log is Travis-side B17 capture. Conflating creates provenance
ambiguity at v0.7 substrate consumption — when v0.7 cycle pre-
planning reads "substrate observation X", was X observed by
Travis using ContextAtlas on ContextAtlas (B17) or by cohort
participant Y using ContextAtlas on their own repo? Different
generalizability-claim weight. Two-surface split preserves
provenance.

#### Q7.0.4 lock — Cohort participant submission mechanism

**Locked:** (δ) channel-matched submission (Q5 deferred from
Step 6.4 closed).

Per-participant: whichever channel was used during recruitment
(matching pre-trial-onboarding.md "channel you used during
recruitment"). Preserves operational flexibility per Q4 lock at
Step 6.4 ambiguous-by-design contact channel; reduces friction
for cohort participants. Encrypted-attachment guidance handled
per-participant if any participant flags concern.

#### Q7.0.5 lock — Cycle-close timing relative to cohort exposure window

**Locked:** (γ) target post-cohort-exposure window with honest
acknowledgment fallback.

Substrate-quality-respects-cohort-cadence is consistent with
v0.6 substrate-generation thesis. Concrete framing: target
~2-4 weeks cohort exposure window per pre-trial-onboarding.md;
if window slips past target without recruitment success, cycle
close on (α) fallback path with explicit framing per Q7.0.9
3-tier evaluation pre-registration. Cycle does not extend
indefinitely waiting for cohort.

#### Q7.0.6 lock — Step 7 cost-bearing dimension

**Locked:** (α) zero direct API spend on Travis-side + explicit
caveat.

- Cohort participants run their own ContextAtlas → their own
  Anthropic API usage (participant-side; Travis does not bear)
- Travis-side recruitment outreach: zero cost
- Substrate aggregation at cycle close: zero cost (analysis
  pass on submitted markdown + JSONL; no API spend)
- Cohort observability instrumentation cost is participant-
  bearing per ADR-20 §1

Captures matches v0.6 cycle envelope estimates (Stream C zero
direct API spend per scope-doc §Cost framing).

#### Q7.0.7 lock — Test coverage scope per CLAUDE.md

**Locked:** (α) not-applicable + rescope-trigger caveat.

Step 7 work shape is execution + documentation; code changes
expected: 0; test count baseline preserved at 1303/1303 through
Step 7.

Rescope-trigger caveat: if mid-Step-7 cohort observations
surface critical pipeline-mechanics gaps requiring code changes
(per scope-doc §12 risk #6), rescope event triggers; code
changes shipped under separate substep with full test coverage
per CLAUDE.md test discipline. Step 7 baseline-preserve
discipline holds otherwise.

#### Q7.0.8 lock — Cycle-emergent candidate-capture pattern

**Locked:** (β) two-surface split per Q7.0.3 + cycle-close
cross-reference into v0.7 absorption.

- Friction observed by Travis → `research/v0.6-self-use-log.md`
- Friction observed by cohort participants → `research/v0.6-
  cohort-substrate.md`
- Substep-bounded observations → progress-log Self-use
  observation sub-blocks (primary B17 capture surface)
- Cycle-close synthesis cross-references all three into v0.7-
  candidates.md absorption at v0.7 cycle pre-planning

#### Q7.0.9 lock — 3-tier honest evaluation framing pre-registration

**Locked:** Cycle thesis-bearing pre-registration; anchors
Step 8 cycle-close synthesis (Q8 lock) + Step 9 ship gate
framing.

- **Tier 1 (≥3 participants):** Cohort substrate framed as
  "directional + selection-biased Travis-network"; v0.7 cycle
  pre-planning consumes substrate with selection-bias
  acknowledgment.
- **Tier 2 (1-2 participants):** Cohort substrate framed as
  "anecdotal-only; cycle-thesis preserves substrate-generation
  framing without statistical claims"; v0.7 cycle pre-planning
  consumes substrate as case-study material.
- **Tier 3 (0 participants):** Cycle-thesis re-evaluation per
  v0.6-SCOPE.md §12 risk #12; v0.6 ships pipeline-mechanics +
  methodology rigor without cohort substrate; v0.7 inherits
  recruitment infrastructure and re-attempts cohort exposure.

Pre-registration discipline: tier evaluation framing locks
honest-scope discipline; cycle close evaluates against pre-
registered tiers rather than retrofitting framing to recruitment
outcome.

#### Q7.0.10 lock — research/v0.6-self-use-log.md + cohort-substrate.md creation timing

**Locked:** (γ) framed stub at Step 7.0 for both files.

Both `research/v0.6-self-use-log.md` and `research/v0.6-cohort-
substrate.md` created at Step 7.0 with brief framing headers +
no entries until substantive observations surface (sparse-is-OK
per B17 Q3 lock). Mirrors `research/cohort/feedback-template.md`
pattern (substrate present + ready before cohort exposure)
without substrate-pollution. Both files created in this commit.

#### Q7.0.11 lock — pre-trial-onboarding.md delivery mechanism

**Locked:** (γ) participant-channel-matched delivery.

Operational flexibility consistent with Q4 ambiguous-channel lock
at Step 6.4. Repo-link option for GitHub-comfortable participants;
copy-paste for participants without GitHub access; either approach
preserves non-bureaucratic framing.

#### Q7.0.12 lock — Cohort observability data participant-inspection step

**Locked:** (β) explicit checkpoint WITH refinement on placement.

**Refinement applied:** Path A — amend `research/cohort/pre-
trial-onboarding.md` (Step 6.4 commit `e9601e8`) with explicit
inspection checkpoint sentence in §How to submit feedback
subsection on observability log. Reasoning: pre-trial-onboarding.
md is the canonical participant-facing artifact; inspection-
before-submission flow should be visible there at onboarding
time, not only at Step 7 substrate aggregation documentation.
Participants reading pre-trial-onboarding.md before trial start
should see complete submission flow framing. Alternative defer
to recruitment outreach verbal communication is documentation-
drift risk; canonical written framing should match operational
reality.

Amendment landed in this commit (~5 LOC at L117-122 of pre-
trial-onboarding.md).

#### Step 7.0 unblock

Recruitment activation unblocked per Q7.0.2 lock. Travis begins
cohort outreach at desired pace post-Step-7.0-landing.

Mid-Step-7 commits surface optionally if substantive cohort
observations land OR if rescope events trigger code changes
per Q7.0.7 caveat. Step 7.5 close commit aggregates cohort
substrate at cycle close per Q7.0.5 timing lock + Q7.0.9
3-tier evaluation framing.

---

### Step 6.5 shipped — 2026-05-07 (Step 6 close)

V0.6 Step 6 closes per Stream C tooling specification at
v0.6-SCOPE.md. 4 Stream C items shipped (B17 cohort feedback
template + tool-description observability + ADR-20 cohort
observability contract + recruitment infrastructure); cohort
exposure substrate operational for Step 7 execution.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 6.5 close | main | [this commit] | Step 6 close + progress log batching for Steps 6.1 + 6.2 + 6.3 + 6.4 + 6.5 close synthesis + 6 cycle-execution observations |

#### Step 6 cumulative outcome — Stream C tooling shipped

Stream C tooling shipped per v0.6-SCOPE.md §Stream C
specification + Q6.0.1-Q6.0.9 + Q6.2.1-Q6.2.6 sub-adjudication
clusters. Cumulative deliverables:

- **B17 cohort feedback template** (Step 6.1; commit `69548f4`)
  — 234 LOC structured markdown; per-session + post-trial
  split; cohort-collegial framing
- **Tool-description observability** (Step 6.2; commit
  `a624390`) — 16 files / +1289 LOC; sanitize.ts (PII
  denylist + SAFE_FIELDS allowlist + path-stripping) +
  observe.ts (JSONL writer + session_id + Observation shape)
  + parser.ts validateObservability + cli-args.ts --observe
  flag + init/runner.ts plumbing + mcp/server.ts server-level
  interception + index.ts startup wiring
- **ADR-20 cohort observability contract** (Step 6.3; commit
  `dcd3c4d`) — 361 LOC; 8-section ADR per Q6.0.5 refinement
  (Scope first; Consent early); 5 open questions resolved
- **Recruitment infrastructure** (Step 6.4; commit `e9601e8`)
  — 574 LOC across 3 markdown docs (recruitment-process
  internal-facing + screening-criteria internal-facing +
  pre-trial-onboarding participant-facing); Item 6 4-substrate-
  component coverage

**Step 6 deliverable counts:**
- 5 commits (6.0 + 6.1 + 6.2 + 6.3 + 6.4)
- ~2,460 LOC across substantive substeps (1289 Step 6.2 +
  361 Step 6.3 + 574 Step 6.4 + 234 Step 6.1 + 230 Step 6.0
  STEP-PLAN edit)
- 52 net new tests at Step 6.2 (1251 → 1303 baseline)
- Test count: 1303/1303 PASS at Step 6.2 close (final Step 6
  baseline)

v0.6-SCOPE.md success criterion #3 (Stream C cohort
observability instrumentation shipped) PARTIALLY ADVANCED at
Step 6: instrumentation + contract + recruitment infrastructure
shipped; cohort exposure execution deferred to Step 7 per Item 6
v0.6-ships-infrastructure / v0.7-executes-scaled-trial split.

#### Cycle-execution observations from Step 6 batch

Six substantive observations captured during Step 6 execution
worth carrying forward to v0.7+ cycle-execution discipline
substrate:

**(a) ADR-implementation cross-reference verification
discipline** — Step 6.3 cross-reference verification table
surfaced 0 discrepancies between ADR-20 commitments and Step
6.2 implementation behavior. Contract-first design discipline
(Q6.2 sub-adjudications at Step 6.2 design phase anticipated
ADR-20 commitments substantively) prevented post-implementation
contract drift. Pattern observation: load-bearing contract-
implementation pairs benefit from contract-anticipating
implementation-design at substep boundary, not contract-
documents-whatever-shipped pattern. Substrate for v0.7+
contract-implementation work.

**(b) Privacy-load-bearing test rigor observation** — ~52 net
new tests at Step 6.2; ~18 sanitize.ts tests with +3-6 over
projection per Q6.0.7 substantive risk profile. Substantively
heaviest single-substep test count growth in v0.6 cycle.
Methodology pattern: privacy-load-bearing implementation
warrants higher test coverage rigor than typical utility
modules. Generalizes for v0.7+ privacy-relevant substrate (e.g.,
centralized telemetry if shipped post-v0.6 ADR-20 §Limitations
expansion).

**(c) Cohort-facing tone inheritance pattern** — Feedback
template at Step 6.1 → ADR-20 at Step 6.3 → recruitment
infrastructure at Step 6.4: consistent collegial framing
across cohort-facing artifacts (plain language; participant-
collaborator framing; honest substrate-generation thesis
disclosure; explicit consent + opt-out paths). Substrate for
v0.7+ cohort-facing artifact authoring; tone inheritance
pattern documents how new cohort-facing artifacts maintain
consistency.

**(d) Step 6 weight comparison vs Steps 3-4** — Step 6 lighter
than Step 4 by LOC (~3,000 LOC Step 4 cumulative vs ~2,460 LOC
Step 6 cumulative) but heavier by privacy + cohort
consideration density per substep. Privacy-load-bearing
dimension at Step 6.2 + cohort-facing interpretive work at
Step 6.3 + Step 6.4 add cognitive load not present in Steps
3-4 internal-facing pipeline work. Pattern: LOC-only weight
comparison undersells consideration-density-load on cohort/
privacy/contract-shaped substeps.

**(e) Substantive-interpretation cadence pattern at Step 6.3**
— Similar to F1 PRIMARY framing at Step 5.3.b decomposition
analysis; 24th discipline #3 cadence-catch instance in v0.6
cycle execution. Cross-reference verification at substantive-
interpretive moments (cohort-contract-anticipating
implementation behavior alignment) materially improved
cohort-contract framing quality vs commit-without-verification
counterfactual. Substantive-interpretive moments warrant
discipline #3 cadence-catch even when scope appears mechanical
(ADR drafting against shipped substrate looks mechanical;
verification reveals 0 discrepancies but only because contract-
first design anticipated commitments).

**(f) Q11-style execution-time refinement at Step 6.2** —
config-scaffold.ts new module addition during implementation
not in original Step 6.2 surface; Q11-style scope-clarifying
refactor separating scaffold-writing logic from runner.ts.
Matches Step 4.3 detect-then-scaffold reorder + Step 5.2
h10→h5 substitution + Step 5.3 ladder split pattern. Pattern
observation: execution-time refinements at substep boundaries
preserve substrate quality without scope creep when refactor
is genuinely scope-clarifying (separation of concerns) rather
than scope-expanding (new feature surface).

#### Step 6 unblock — Step 7 cohort exposure operational

Step 7 cohort exposure cross-cutting work unblocked. Recruitment
infrastructure operational (Step 6.4); observability
instrumentation operational (Step 6.2); consent contract drafted
(Step 6.3); feedback template operational (Step 6.1).

Step 7.0 design-adjudication substep firms cross-cutting
documentation discipline + cohort recruitment kickoff per Step
N.0 cadence convention.

---

### Step 6.4 shipped — 2026-05-07

Recruitment infrastructure shipped per v0.6 Step 6.4 lock at
Step 6.4 surface review (Q6.0.6 file-structure lock; 5 open
questions resolved + 2 minor refinements applied).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 6.4 recruitment infrastructure | main | `e9601e8` | 3 files; +574 LOC; recruitment-process.md (~140 LOC internal-facing) + screening-criteria.md (~135 LOC internal-facing) + pre-trial-onboarding.md (~210 LOC participant-facing) |

#### Item 6 4-substrate-component coverage

Per v0.6-SCOPE.md §Stream C Item 6 specification (4 substrate
components):

- **Recruitment process documentation** → recruitment-process.md
  (cohort target sizing 3-8; Travis-network outreach channels;
  outreach framing talking points; application/screening flow;
  initial conversation expectations)
- **Trialist screening criteria** → screening-criteria.md (5
  required qualifying criteria: language coverage; codebase
  characteristics; time commitment; structured-feedback
  willingness; existing Claude Code familiarity; out-of-scope
  + soft-preference criteria enumerated)
- **Structured feedback template integration** → pre-trial-
  onboarding.md "How to provide feedback" + screening-criteria.md
  soft-preference signals
- **Pre-trial onboarding documentation** → pre-trial-onboarding.md
  (welcome + collaborator framing; trial scope + duration;
  v0.6 scope-disclaimer; time commitment; two-stream feedback
  manual + observability; setup walkthrough; consent + opt-out
  paths; first-session expectations; Q&A contact)

#### Open questions resolved (5)

- Q1 cohort target size: 3-8 participants (substantive lower
  bound for selection-bias mitigation; cycle-close synthesis
  manageability upper bound)
- Q2 compensation framing: "no compensation at v0.6 cycle"
  explicit clarity (recompense implicit via early-access
  relationship + influence on v0.7 design)
- Q3 first-session example patterns: 3 examples covering
  atlas-tool target patterns (architectural / symbol-level /
  impact-analysis)
- Q4 Q&A contact channel: ambiguous-by-design — operational
  flexibility for Travis network variation
- Q5 submission instructions: deferred to Step 7 cohort
  exposure execution per-cohort specifics

#### Refinements applied (2)

- **Refinement A** (recruitment-process.md L47): talking-points
  framing clarification — "These talking points represent
  substantive content to convey; adapt language to match
  candidate + relationship; substantive points are what
  matters, not verbatim wording" — clarifies talking-points
  pattern serves substantive-content-coverage rather than
  scripted-language-prescription
- **Refinement B** (pre-trial-onboarding.md cross-references):
  scope cleanup — removed internal-facing docs (recruitment-
  process.md + screening-criteria.md) from participant-facing
  cross-references; kept ADR-20 + feedback-template.md only;
  cross-references serve participant's needs without creating
  curiosity-friction

Cohort-collegial framing inheritance from feedback template
(Step 6.1 commit `69548f4`) + ADR-20 (Step 6.3 commit
`dcd3c4d`): plain language; non-bureaucratic; active voice +
second-person where participant-facing; time commitment
surfaced up-front; consent + opt-out paths explicit;
substrate-generation thesis transparent.

#### Step 6.4 unblock

Step 6.5 (Step 6 close commit batching progress log entries)
unblocked. Recruitment infrastructure operational substrate
for Step 7 cohort exposure execution.

---

### Step 6.3 shipped — 2026-05-07

ADR-20 cohort observability contract drafted per v0.6 Step 6.3
lock at Step 6.3 surface review (Q6.0.5 section-ordering
refinement; 5 open questions resolved; substantive interpretive
moment of Step 6 per discipline #3 surface-inline-before-commit
cadence).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 6.3 ADR-20 cohort observability contract | main | `dcd3c4d` | 1 file; +361 LOC; 8-section ADR-20 per Q6.0.5 section-ordering refinement |

#### 8-section structure per Q6.0.5 section-ordering refinement

1. **Scope** (in/out enumeration; MCP tools/call boundary;
   explicit out-of-scope: user prompts, source code, atlas
   content, identity-revealing PII, network telemetry)
2. **Consent process** (--observe flag IS consent signal per
   Q6.0.4 hybrid wiring; two opt-in pathways: init writes
   config + per-session mcp override; v0.6 opt-out via config
   edit; --no-observe deferred to v0.7+ per Q6.2.6)
3. **Data collected** (concrete table of 9 observation fields;
   session_id derivation SHA256(pid:timestamp).slice(0,16);
   sanitization enumeration; What's NOT logged reiterated)
4. **Storage** (local-only; .contextatlas/observe-log.jsonl
   default; JSONL append-only; no remote upload; no log
   rotation v0.6; submission framing generic with Step 6.4
   forward-pointer)
5. **Use** (4 enumerated v0.7 design substrates; use boundaries)
6. **Retention** (cohort exposure window + cycle-close
   synthesis; specifics firm at v0.7 per cohort-scale empirical;
   deletion process)
7. **Participant rights** (Access + Deletion + Portability +
   Refusal of submission; no identity correlation by design)
8. **Cross-references** (Step 6.2 implementation; Step 6.1
   feedback template; Step 6.4 forward-pointers; related ADRs)

#### Cross-reference verification surfaced 0 discrepancies

ADR-20 commitments verified against Step 6.2 implementation
behavior (commit `a624390`) — 0 discrepancies surfaced. Cross-
reference verification covered:
- "Email patterns redacted" ↔ PII_PATTERNS sanitize.ts:28 ✓
- "Home-dir paths replaced" ↔ stripPaths Unix + Windows ✓
- "Tool name + kind preserved verbatim" ↔ SAFE_FIELDS allowlist ✓
- "session_id anonymized; not user-correlatable" ↔
  SHA256(pid:timestamp).slice(0,16) cached per process ✓
- "JSONL append-only" ↔ appendFileSync(line + "\n") ✓
- "--observe IS consent signal" ↔ cli-args.ts flag accepted
  init+mcp; rejected index/doctor ✓
- "Per-session override via mcp --observe" ↔ index.ts
  parsed.observe || config.observability?.enabled ✓
- "tools/list NOT observed" ↔ server.ts interception only on
  CallToolRequestSchema ✓

Contract-first design discipline (Q6.2 sub-adjudications at
Step 6.2 design phase anticipated ADR-20 commitments
substantively) prevented post-implementation contract drift.
Substrate observation captured at Step 6.5 close synthesis (a)
above.

#### Open questions resolved (5)

- Q1 severity: hard (privacy commitments load-bearing; ADR-19
  precedent)
- Q2 symbols frontmatter: 5 entries (createObservabilityWriter,
  getSessionId, sanitize, stripPaths, stripPII)
- Q3 §4 storage submission framing: generic with Step 6.4
  forward-pointer (premature commitment without recruitment-
  infrastructure substrate)
- Q4 §6 retention day-count: generic with v0.7 cycle pre-
  planning firm-up annotation
- Q5 §3 PII pattern completeness: v0.6 v1 minimal-defensible-
  baseline disclosure (honest disclosure substantively more
  transparent than unspecified "we strip PII")

Plain-language participant-facing tone inheritance from
feedback template (Step 6.1 commit `69548f4`); 24th discipline
#3 cadence-catch instance in v0.6 cycle execution
(substantive-interpretation cadence pattern observation
captured at Step 6.5 close synthesis (e) above).

#### Step 6.3 unblock

Step 6.4 (recruitment infrastructure) unblocked. ADR-20
contract substrate operational for cross-references in
recruitment-process.md + pre-trial-onboarding.md.

---

### Step 6.2 shipped — 2026-05-07

Tool-description observability implementation shipped per v0.6
Step 6.2 lock at Step 6.2 surface review (Q6.2.1-Q6.2.6 sub-
adjudications + 3 refinements; single-commit cadence per
Point 7 lock batching 7 implementation slices).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 6.2 tool-description observability | main | `a624390` | 16 files; +1289/-6; 4 new in src/observability/ + 12 modified across config/cli-args/init/mcp/index/types; 52 net new tests (1251 → 1303) |

#### Six sub-adjudications locked

- **Q6.2.1 JSONL format** (newline-delimited JSON; one
  observation per line; atomic single-line writes via
  fs.appendFileSync; log rotation deferred to v0.7+ pending
  size empirical)
- **Q6.2.2 observation shape** (timestamp + session_id + tool
  + request_args + response{status, latency_ms, result_summary?,
  error_message?}; Refinement 1 adds contextatlas_version
  field per cycle-version provenance)
- **Q6.2.3 sanitize hybrid** (PII denylist + SAFE_FIELDS
  allowlist + path-stripping; PII_PATTERNS v0.6 v1 minimal-
  defensible-baseline annotated for v0.7+ extension per
  Refinement 2)
- **Q6.2.4 server interception via CreateServerOptions**
  (observabilityWriter + observabilityCwd; wraps tools/call
  dispatch; tools/list NOT observed; defensive try/catch
  swallows writer errors so observability never breaks tool
  surface)
- **Q6.2.5 --observe flag IS the consent signal** (Q4.0.9
  non-blocking + Q6.0.4 hybrid wiring; flag accepted by both
  init [writes config observability.enabled: true] and mcp
  [per-session override]; rejected by index/doctor)
- **Q6.2.6 --no-observe deferred to v0.7+** pending cohort
  empirical feedback per Refinement 3 + scope-doc Stream C

#### Three refinements applied

- **Refinement 1** (contextatlas_version observation field):
  cycle-version provenance per Q5.1.3 atlas-version-tagging
  discipline inheritance; computed at writer-creation time
  from package.json
- **Refinement 2** (sanitize.ts v0.7+ extension annotation):
  PII_PATTERNS scoped to email shapes only at v0.6 v1; honest-
  scope-acknowledgment per Q5 lock + Phase-10 §9 cycle-emergent
  candidate framing
- **Refinement 3** (--no-observe deferral annotation):
  docstring notes deferral with v0.7+ cohort-feedback gate;
  v0.6 cycle cohort participants opt-in via --observe;
  opt-out is config-edit (set observability.enabled: false)

Single-commit cadence per Point 7 lock batched 7
implementation slices spanning 8 files (incl. config-scaffold.ts
scope-clarifying refactor — emits observability section into
scaffold per Q6.0.4 hybrid wiring; not in original Step 6.2
surface but emerged during implementation per Q11-style
refinement pattern observation captured at Step 6.5 close
synthesis (f) above).

#### Test count growth: 1251 → 1303 (+52 net new across 7 files)

- sanitize.test.ts: 18 tests (privacy-load-bearing rigor per
  Q6.0.7; +3-6 over projection appropriate per substantive
  risk profile — path-stripping Unix+Windows; PII patterns;
  allowlist preservation; defensive cycles+depth+unicode)
- observe.test.ts: 8 tests (JSONL append-only; multi-call
  order; parent dir creation; contextatlas_version field
  presence; error path; session-id stability)
- parser.test.ts: +7 (validateObservability happy/empty/
  invalid/unknown-key paths)
- cli-args.test.ts: +7 (--observe init+mcp accepted; index+
  doctor rejected; duplicate rejected; combines with --cc-only)
- config-scaffold.test.ts: +4 (observe absent/false → no
  section; observe true → enabled: true; round-trip via
  loadConfig)
- runner.test.ts: +2 (--observe true/absent scaffold writes)
- server.test.ts: +6 (writer fires on success+error; tools/list
  not observed; PII sanitized before writer; session-id stable
  across calls; absent writer baseline)

Substantively heaviest single-substep test count growth in
v0.6 cycle (privacy-load-bearing observation captured at Step
6.5 close synthesis (b) above).

#### Consent contract enforcement

- Default: observability.enabled = false
- Cohort participants opt-in via --observe flag (writes
  enabled: true into config OR per-session override)
- --observe flag IS the consent signal — no separate prompt
- Two-layer consent: feedback-template-voluntary +
  observability-flag-opt-in
- Sanitization happens server-side before writer sees args —
  PII never lands in observe-log.jsonl

ADR-20 forward-pointer landed at Step 6.3 (commit `dcd3c4d`)
documenting what Step 6.2 substrate does.

#### Step 6.2 unblock

Step 6.3 (ADR-20 cohort observability contract drafting)
unblocked. Implementation substrate operational for cross-
reference verification at Step 6.3 surface review.

---

### Step 6.1 shipped — 2026-05-07

B17 cohort feedback template shipped per v0.6 Step 6.1 lock at
Step 6.1 surface review (Q6.0.2 markdown format + Q6.0.6
research/cohort/ subdirectory location + 5 refinements applied
per Travis adjudication).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 6.1 B17 cohort feedback template | main | `69548f4` | 1 file; +234 LOC NEW research/cohort/feedback-template.md |

#### Per-session + post-trial split structure

Template structured into two complementary sections per cohort-
process discipline:

- **Per-session feedback** (fill when atlas-relevant; ~5-10
  min/session): Session ID auto-generated by --observe; atlas
  tool invocation outcome (5 options); usefulness rating (5
  options); free-text missed/wrong invocations; surprise/
  noteworthy capture
- **Post-trial structured feedback** (fill once at end of
  cohort exposure; ~30-45 min): trial scope; codebase
  characteristics (language; LOC bucket; ADR presence); setup
  walkthrough friction; tool-description tuning targets;
  natural-routing failure modes; missing-functionality
  signals

Three failure modes isolated per cohort-process discipline:
natural-routing failure / tool-description failure / missing-
functionality failure.

#### Five refinements applied per Travis adjudication

- Active-voice first option (positive-framing precedence
  pattern; "Claude correctly invoked an atlas tool" precedes
  failure modes)
- Trial scope subsection (calendar window + session count +
  average session length captured separately from codebase
  characteristics)
- Two-layer consent clarification (feedback template
  voluntary at every point; observability data capture
  governed separately by --observe flag opt-in)
- LOC-only repo size buckets (symbol count auto-captured via
  observability log; no double-counting at template fill time)
- Per-session filling cadence (sparse-is-OK; honest sparse
  beats forced verbose; sessions doing unrelated work don't
  need feedback entries)

Cohort-collegial tone inheritance pattern (substrate observation
captured at Step 6.5 close synthesis (c) above): plain language;
participant-collaborator framing; honest substrate-generation
thesis disclosure.

Cross-references to ADR-20 (Step 6.3 forward-pointer at
template-write time; closed at Step 6.3 commit `dcd3c4d`) +
Step 6.4 work products (TBD recruitment-process.md +
screening-criteria.md + pre-trial-onboarding.md forward-
pointers; closed at Step 6.4 commit `e9601e8`).

#### Step 6.1 unblock

Step 6.2 (tool-description observability) unblocked. Feedback
template substrate operational for cohort-feedback / observability
two-layer consent framing referenced at ADR-20 §1 (Step 6.3).

---

### Step 6.0 shipped — 2026-05-06

V0.6 Step 6 (Stream C tooling: B17 cohort feedback template +
tool-description observability + ADR-20 cohort observability
contract drafting + recruitment infrastructure) opens with
Step 6.0 design-adjudication substep per Step N.0 cadence
convention. Q6.0.1-Q6.0.9 design adjudications surfaced +
locked per discipline #3 surface-inline-before-commit cadence
applied to step-design-phase work.

Stream C work has NOT been touched yet through cycle execution
(per Step 1.0 §Sequencing recommended execution order); design-
adjudication phase substantively new work. Greenfield substrate
verified: no existing `--observe` flag in cli-args.ts; no
existing observability hooks in src/mcp/server.ts.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 6.0 design adjudications | main | [this commit] | Q6.0.1-Q6.0.9 locks captured; Step 6 substep ladder firmed (6.0 → 6.1 → 6.2 → 6.3 → 6.4 → 6.5); 5-substep per-item ladder per Step 4 precedent |

#### Q6.0.1 lock — Substep ladder shape

**Locked:** (β) 5-substep per-item ladder. Step 6 substep ladder:
- Step 6.0 — Design adjudications (this commit)
- Step 6.1 — B17 cohort feedback template
- Step 6.2 — Tool-description observability
- Step 6.3 — ADR-20 cohort observability contract drafting
- Step 6.4 — Recruitment infrastructure
- Step 6.5 — Step 6 close commit

Methodology rationale: matches Step 4 per-item implementation
pattern; per-substep ship-discipline preserves cleaner audit
trail; each item is substantive standalone work (markdown
template + observability code + ADR documentation +
recruitment infrastructure).

#### Q6.0.2 lock — B17 cohort feedback template format + location

**Locked:** (α) markdown template. Format: markdown narrative
with template fields cohort participants fill. Cohort
participants more likely to engage with markdown than
structured YAML; aggregation can parse via simple regex when
needed; matches v0.5 research/ doc pattern.

**Refinement applied:** file location lock to
`research/cohort/feedback-template.md` per Q6.0.6 cohort-
substrate co-location consistency. Resolves dev's surface
ambiguity between Q6.0.2 v0.6-cohort-feedback-template.md
framing and Q6.0.6 subdirectory framing.

Template scope per v0.6-SCOPE.md §Stream C lines 418-427:
session-level fields (did Claude invoke atlas tool; usefulness
rating; free-text on missed/wrong invocations) + per-session
tool-invocation log (auto-captured via observability; template
references) + codebase-characteristics + setup-walkthrough-
friction.

#### Q6.0.3 lock — Tool-description observability instrumentation point

**Locked:** (β) server-level interception. Single observability
gate; consistent shape across tools; minimal handler-touching.
Wraps the request handler chain at src/mcp/server.ts; logs
incoming request + outgoing response.

**What gets logged per request:**
- Tool name (e.g., `get_symbol_context`)
- Request args (sanitized — strip PII via Q6.0.7 privacy
  treatment)
- Response shape: success/error + latency + symbol-id-or-result-
  count
- Timestamp + session-id (anonymized hash of conversation
  context)
- NOT logged: user prompt content; full conversational history;
  PII

#### Q6.0.4 lock — `--observe` flag wiring

**Locked:** (γ) hybrid wiring. `init --observe` writes to
`.contextatlas.yml` `observability.enabled: true` field
(persistent cohort consent); MCP server reads config + activates
observability; `mcp --observe` flag override available for per-
session opt-in/out without config edit.

**Config schema addition:** new top-level `observability`
section in ContextAtlasConfig (`enabled: boolean` +
`log_path: string` defaults to `.contextatlas/observe-log.jsonl`).

#### Q6.0.5 lock — ADR-20 cohort observability contract sections

**Locked:** 8 sections per Q6 (Step 1.0) lock + Step 6.0
section-ordering refinement.

**Section-ordering refinement applied:** place Consent process
earlier (section 2); add Scope as section 1 per ADR convention.
Cohort participants reading ADR-20 should see consent framing
before data-collection details; participant-facing reading
flow.

8-section ordering:
1. Scope (what observability covers)
2. Consent process (opt-in default; init walkthrough explicit
   prompt; participant-facing language)
3. Data collected (concrete enumeration)
4. Storage (local-only file; no remote upload at v0.6)
5. Use (v0.7 H2/H1/slash-command design substrate)
6. Retention (cohort exposure window)
7. Participant rights (access; deletion-on-request; portability)
8. Cross-references (recruitment + screening + feedback template
   + B17 hybrid capture)

#### Q6.0.6 lock — Recruitment infrastructure file structure

**Locked:** (β) `research/cohort/` subdirectory. Each component
substantive ~50-150 LOC; subdirectory keeps related substrate
organized; aligns with v0.5 research/ structuring patterns.

Files:
- `research/cohort/recruitment-process.md` (Travis network
  outreach + early-access framing)
- `research/cohort/screening-criteria.md` (TS/Python/Go + ADRs
  preferred + structured feedback willingness)
- `research/cohort/pre-trial-onboarding.md` (what to expect;
  how to provide feedback; time commitment; scope-disclaimer)
- `research/cohort/feedback-template.md` (Q6.0.2 lock)

#### Q6.0.7 lock — Privacy treatment (sanitize.ts hybrid)

**Locked:** hybrid (denylist + allowlist). Strip absolute paths
(replace with relative or `<repo-root>`); strip user-identifiable
strings (email-shaped patterns; common identity-leak patterns);
preserve tool names + symbol kinds + latencies + response sizes.

**Sanitize test rigor refinement applied:** privacy treatment
is load-bearing for ADR-20 contract; if sanitize fails to strip
PII, observability framework violates consent contract. Higher
test coverage rigor than typical Stream C documentation work.

Suggested ~12-15 tests for sanitize.ts:
- Path-stripping tests (absolute → relative; `<repo-root>`
  substitution; Windows + Unix edge cases)
- Identity-pattern tests (email shapes; common identity-leak
  patterns)
- Allowlist preservation tests (tool names; symbol kinds;
  latencies; response sizes)
- Defensive edge-case tests (null inputs; deeply nested objects;
  circular references; unicode)

#### Q6.0.8 lock — Test coverage scope

**Locked:** per Q4.0.13 inheritance + Q6.0.7 sanitize refinement.

Test counts:
- `src/observability/observe.ts` (NEW; log writer): ~6-8 tests
  covering log-shape correctness + file-write atomicity +
  rotation if log size exceeds threshold
- `src/observability/sanitize.ts` (NEW; PII filter): ~12-15
  tests per Q6.0.7 refinement
- Server-level interception: ~4-6 integration tests verifying
  observability fires on tool invocation; verifying NO
  observability when disabled
- cli-args.ts --observe parsing: ~3-4 unit tests (similar to
  --cc-only pattern)

**Total Step 6.2 net new tests: ~25-33**

No test coverage: ADR-20 (documentation); cohort feedback
template (markdown); recruitment markdown (documentation).

#### Q6.0.9 lock — Step 6 → Step 7 coupling

**Locked:** clean boundary. Step 6 ships infrastructure
(tooling + documentation); Step 7 cohort exposure invokes
infrastructure with actual cohort participants.

Step 7 dependencies on Step 6 outputs:
- B17 feedback template ready
- Observability instrumentation operational
- ADR-20 contract published (consent baseline)
- Recruitment infrastructure documented (Travis can invoke)

#### Cost projection — zero API spend

Stream C work: zero API spend (documentation + code
instrumentation; no Anthropic API calls). Wall-clock medium
weight (~1-2 weeks if substantive cohort outreach +
observability code). Per-substep estimates:
- 6.1 cohort feedback template: ~2-4 hours
- 6.2 tool-description observability: ~1-2 days (instrumentation
  + sanitize + flag wiring + tests)
- 6.3 ADR-20 contract: ~4-8 hours
- 6.4 recruitment infrastructure: ~4-8 hours

No cost-approval gate required (matches Steps 3-4 zero-API-
spend framing).

#### Step 6.0 unblock

Step 6.1 (B17 cohort feedback template markdown at
research/cohort/feedback-template.md) work unblocked per
Q6.0.1-Q6.0.9 locks.

---

### Step 5.4 shipped — 2026-05-06 (Step 5 close)

V0.6 Step 5 closes per Stream B targeted matrix-replication
subset specification at v0.6-SCOPE.md. Empirical substrate
generated + statistical findings published + Phase-10 ref-doc
substrate handed forward to v0.7 + cost-priors-v0.6.json
cumulative snapshot for v0.7 consumption per Q5.0.10 cross-
repo work split lock.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 5.4 close | main | [this commit] | Step 5 close + progress log batching for Steps 5.0 + 5.1 + hotfix + 5.2 + 5.3.a + 5.3.b + 5.4 close synthesis + v0.7 methodology amendment scope capture |

#### Step 5 cumulative outcome — Stream B subset shipped

Stream B targeted matrix-replication subset shipped per v0.6-
SCOPE.md §7.1 Q2 lock + Q5.0.1-Q5.0.12 + Q5.3.1-Q5.3.6 +
Q5.3.b.1-Q5.3.b.5 sub-adjudication clusters. Cumulative
deliverables:
- 86/86 trials complete (8 cells × n=5 × 2 conditions + hono/h1
  auto-stretch +6) per v0.6-SCOPE.md substrate-generation
  thesis
- 52 LLM-judge grades (43 effective base + 9 cross-order
  regrades) per ADR-19 §3 paired-mode anonymization methodology
  inheritance from v0.5
- Phase-10 v0.6 reference-run doc shipped (~224 LOC; 11-section
  structure per Phase-9 inheritance) with 9 F-findings drafted
- cost-priors-v0.6.json cumulative snapshot (156 source runs
  aggregated from v0.4 + v0.5 + v0.6 cycle substrate per Q4(ii)
  cumulative aggregation lock at Step 2)
- Total cycle cost: $34.07 script-reported / ~$16.48 platform-
  billed (within $40 cap + $14-22 envelope)

v0.6-SCOPE.md success criterion #1 (Stream B 8-cell subset
complete) ✓ MET. Statistically-meaningful-wins gate work
continues at v0.7 with methodology amendments absorbed per F1
+ F9 substantive findings.

#### Substantive empirical finding — F1 PRIMARY atlas-substrate-version confound

Per Step 5.3.b Phase-10 ref-doc §11 F1 PRIMARY finding +
Step 5.3.b decomposition analysis: 5 v0.5 anchor cells
(identical prompts; identical methodology) attenuate 28-100%
on ALL 4 axes when re-run against v0.5.0 atlas substrate (vs
v0.5 baseline measured against v0.4.0 atlas):
- factual_correctness: 0.370 → 0.250 (32% attenuation; tier
  CLEAN→BORDERLINE)
- completeness: 0.037 → 0.000 (100% attenuation; both not-dist)
- actionability: 0.148 → 0.071 (52% attenuation; tier
  BORDERLINE→NOT-distinguishable)
- hallucination: 0.296 → 0.214 (28% attenuation; tier
  BORDERLINE→NOT-distinguishable)

Decomposition rules out (β) noise-increase as primary driver
(anchor-cell CIs comparable width across versions). Primary
mechanism is atlas-substrate-version-correlated effect shift
(γ); causal mechanism deferred to v0.7 investigation. 2 of 4
axes DIVERGE in tier-gradation comparison; 2 CONFIRM.

#### F9 METHODOLOGY-DESIGN GAP — tag-only-not-control pattern

v0.6 cycle design (Step 5.0 Q5.0.7 atlas-version-tagging
discipline lock) captured atlas-version-tag in trial manifests
but did NOT specify methodology-comparison-must-control-for-
atlas-version. F1 atlas-substrate-version-confound finding
emerges from this gap. Pattern observation: tag-only-not-
control methodology gap. Generalizable lesson for v0.7+ design
discipline.

#### v0.7 methodology amendment scope (captured for v0.7-SCOPE.md absorption)

Per v0.6-SCOPE.md §Rescope: "If v0.6 subset DIVERGES: v0.7
absorbs methodology amendment work alongside dogfood trial."
2 axes DIVERGE per Step 5.3.b Phase-10 §8 Table 6.

Substantive amendments expanded from F-findings:

1. **Atlas-version-control methodology amendment** (F1 + F9) —
   Cross-cycle tier-gradation comparison must control for
   atlas-substrate-version. Concrete mechanism: re-measure v0.5
   anchor cells against v0.5.0 atlas at v0.7 (50 trials × ~$20
   platform-billed) OR document confound + treat v0.6 as new
   baseline. Hybrid option: both as control + ongoing-substrate.

2. **Cell-selection empirical pre-screen methodology amendment**
   (F3) — 3 v0.6 new cells contributed mixed effects per
   decomposition; theoretical bucket-tier framing alone
   insufficient. Empirical pre-screen via n=2 dry-run per
   candidate cell before n=5 commitment.

3. **2-axis retry policy methodology** (F4 F6 reframing) —
   v0.5 F6 framing refined from position-deterministic to
   stochastic-failure-with-orthogonal-recovery-axes (retry-
   same-config + swap-config). Path A harness extension at
   Step 5.3.a ships methodology improvement; v0.7 inheritance
   applies across grading harnesses.

4. **Variance-control auto-stretch refinement** (F5) — v0.6
   substrate ALL 8 cells trigger ≥0.2 variance threshold (vs
   v0.5 5/5); auto-stretch policy currently hono/h1-only;
   methodology candidate to extend stretch to high-variance
   non-hono cells with budget-controlled limit.

5. **Causal mechanism investigation for atlas-version-correlated
   attenuation** (F1 deferred work) — Multiple plausible
   mechanisms (atlas-content-volume; quality; time-of-
   measurement; sample variance). v0.7 investigation could
   disambiguate via re-measurement (per #1) + content-source
   ablation studies.

#### Six cycle-execution observations from Step 5

1. **Q11-style execution-time refinement pattern applied
   multiple times in Step 5**: Q5.3.1 substep ladder split to
   5.3.a + 5.3.b at Step 5.3 surface; Q5.0.7 atlas-version-
   tagging framing refinement at Step 5.1; Q5.0.2 cell-
   selection refinement at Step 5.2 trial-67 h10→h5
   substitution. Pattern preserves audit trail while allowing
   substantive design-time-locks to refine at execution-time
   per empirical evidence.

2. **Discipline #3 cadence-catch instances 18-23 in Step 5**:
   - 18th — state-detection silent-drop bug at Step 5.1 dist
     rebuild (hotfix commit `68a1dc9`; pre-existing tech debt
     from Step 3.3)
   - 19th — hono/h10 held_out filter at Step 5.2 trial-67
     (Q5.0.2 design-time substrate-verification gap)
   - 20-22nd — F6 reframing during Step 5.3.a swap-retry
     implementation (count discrepancy verification + organic-
     retry-vs-swap-retry disambiguation + cobra/c3 empirical
     n=5/5 achievement)
   - 23rd — substantive-interpretation cadence-catch at Step
     5.3.b decomposition surface (Path B disambiguation refined
     F1 PRIMARY framing from generic "DIVERGES" to specific
     mechanism-attributed atlas-substrate-version-confound
     finding)

3. **Honest-scope-acknowledgment per discipline #4 applied at
   multiple deferrals**: h5 task_category divergence at Step
   5.2 (h10 absent → h5 impact); F6 reproduction interpretation
   ambiguity at Step 5.3.a (judge-model-unchanged verification
   refined framing); causal mechanism deferral at Step 5.3.b
   F1 (correlation vs causation distinction).

4. **Cost projection iteration discipline refinement**: Step
   5.0 estimate ($24-30) used cost-priors-v0.5.json platform-
   billed baseline conflated with script-reported framing;
   Step 5.1 surface refined projection ($36-39); Step 5.2
   actual ($33.39) within both bounds. Cycle-observation
   pattern: cost-projection-methodology requires explicit
   script-reported-vs-platform-billed framing at design-time;
   refinement candidate for v0.7+ cycle-pre-planning template.

5. **Empirical-evaluation rhythm shift observation**: Steps
   5 substantive work shape transitioned from code-
   implementation (Steps 3-4) to methodology-execution +
   statistical-inference. Discipline #3 cadence applied across
   rhythm shift at consistent rigor; surface format adapted
   appropriately (methodology-inheritance reading + cell-
   selection criteria + cost-projection + statistical analysis
   pattern + cost-approval-gate framework vs pre-implementation
   reading + spec + drafts + tests pattern). Pattern carries
   forward to v0.7+ empirical-evaluation cycles.

6. **Substantive-interpretation cadence observation (NEW
   pattern)**: Discipline #3 surface-inline-before-commit
   cadence applied at substantive-INTERPRETATION moments (not
   just substantive-implementation moments) materially
   improved F-finding framing quality. Step 5.3.b decomposition
   surface refined F1 PRIMARY from generic "v0.5 tier-
   gradation does NOT fully generalize" to specific mechanism-
   attributed "atlas-substrate-version confound" via Path B
   decomposition analysis. Pattern: when paired-t outcomes
   surface unexpected results, surface decomposition INTERPRETATION
   inline before committing F-finding framing — captures more
   substantively-grounded substrate for v0.7+ consumption.

---

### Step 5.3.b shipped — 2026-05-06

V0.6 Step 5.3.b ships statistical analysis + Phase-10
reference-doc + cost-priors-v0.6.json cumulative snapshot per
Q5.3.b.1-Q5.3.b.5 sub-adjudications locked at Step 5.3.b
surface review.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 5.3.b | benchmarks | 23dd385 | 5 sub-adjudications locked; tier-gradation-compare module + tests; aggregate-cost-priors constant bumps; doc-gen hybrid generation; decomposition analysis; Phase-10 ref-doc 11-section structure; F1-F9 F-findings drafted |

#### Implementation summary

Five sub-adjudications locked at Step 5.3.b surface (Q5.3.b.1-
Q5.3.b.5):
- Q5.3.b.1 (γ) hybrid ref-doc generation strategy (auto-fill
  §1-§8 tables + dev-prefilled §9-§11 narrative)
- Q5.3.b.2 (β) bump aggregate-cost-priors.mjs constants
  directly (OUTPUT_PATH → cost-priors-v0.6.json;
  ORCHESTRATOR_DIR_PATTERNS adds /^v0\.6-step\d+/)
- Q5.3.b.3 two-function tier-gradation-compare signature
  (classifyTier + compareTierGradations)
- Q5.3.b.4 (α) hardcode v0.5 outcomes from Phase-9 §6 Table 2
  with comment annotation
- Q5.3.b.5 Phase-10 ref-doc location:
  benchmarks/research/phase-10-v0.6-reference-run.md

#### F1 PRIMARY substantive finding

Atlas-substrate-version confound surfaces in v0.5-vs-v0.6
tier-gradation comparison. Per Step 5.3.b decomposition
analysis: 5 v0.5 anchor cells attenuate 28-100% on ALL 4 axes
when re-run against v0.5.0 atlas substrate. Decomposition
rules out (β) noise-increase as primary driver. Primary
mechanism is atlas-substrate-version-correlated effect shift
(γ); causal mechanism deferred to v0.7 investigation.

#### F9 METHODOLOGY-DESIGN GAP — tag-only-not-control

Q5.0.7 atlas-version-tagging discipline captured the tag in
trial manifests but did NOT specify methodology-comparison-
must-control-for-atlas-version. v0.7 methodology amendment
must include explicit-control-for-atlas-version-when-comparing-
tier-gradations.

#### Step 5.3.b unblock

Step 5.4 close (progress log batching + v0.7 methodology
amendment scope capture) unblocked next per Q5.0.10 cross-
repo work split lock.

---

### Step 5.3.a shipped — 2026-05-06

V0.6 Step 5.3.a ships production grading harness + 43 base
pairs + 9 cross-order regrades + 2 swap-retry recoveries per
Q5.3.1-Q5.3.6 locks at Step 5.3 surface review (sub-substep
split refinement applied per Q11-style pattern).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 5.3.a | main | c2aabc4 | 6 sub-adjudications + harness extension Phase 3 swap-retry; cobra/c3 effective n=5/5; F6 reframing as 2-axis retry policy |

#### Implementation summary

Six sub-adjudications locked at Step 5.3 surface (Q5.3.1-
Q5.3.6) including (β) Q5.3.1 split refinement to 5.3.a + 5.3.b
substeps (matches Step 3.2.a/3.2.b precedent + v0.5 Step 8/9
structure).

NEW: scripts/v0.6-step5.3-grading-harness.mjs (~700 LOC;
mirrors v0.5-step8 pattern with v0.6-specific config + Phase 3
swap-retry extension). Total grades: 52 (43 effective base —
41 Phase 1 + 2 Phase 3 swap-retry — + 9 cross-order regrades).
$0.6829 script-reported (well within $5 cap + $2 budget).

#### Substantive F6 reframing finding

cobra/c3 trial-0 recovered organically via Phase 1 retry on
resume (no swap needed; same anonymization parameters worked
on retry); trials 2 + 4 recovered via Phase 3 swap-retry with
forceSwapAB. Refines v0.5 F6 framing from position-deterministic
to stochastic-failure-with-orthogonal-recovery-axes.

#### Step 5.3.a unblock

Step 5.3.b (statistical analysis + Phase-10 ref-doc + cost-
priors-v0.6.json snapshot) unblocked next per Q5.3.1 split
ladder.

---

### Step 5.2 shipped — 2026-05-06

V0.6 Step 5.2 ships full 86-trial production replication per
v0.6-SCOPE.md §7.1 Q2 lock + Step 5.0 + Step 5.1 substrate.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 5.2 (CELLS edit) | benchmarks | 8ce2646 | h10 → h5 substitution per Q11-style refinement at trial-67 pause |

#### Implementation summary

86/86 trials complete per orchestrator final state. $33.39
script-reported / ~$15.80 platform-billed cumulative. 0
failures (after recovery). Two execution incidents handled:

1. **Trial-67 pause: hono/h10 stripped by filterStep7**
   (bucket=held_out). Q5.0.2 cell-selection design-time
   substrate-verification gap. Q11-style refinement applied:
   h10 → h5-hono-generics substitution. 19th discipline #3
   cadence-catch instance.

2. **529 outage during resume** (15:22-15:29 UTC; 8 trial
   failures; 0 cost incurred per run-reference halted pre-
   manifest). Recovered via simple retry per existing
   Z_ANTHROPIC_529_OUTAGE methodology substrate. Path B
   retry-coverage-of-529 cycle-emergent candidate captured
   for Phase-10 §9.

#### Variance check observation

ALL 8 cells triggered ≥0.2 token range/μ threshold. 7 non-hono
triggers accepted per Path α methodology-consistency lock
(matches v0.5 Phase-9 precedent of accepting non-hono variance
+ documenting as methodology limit; n=5 paired-t maintained).
4 of 5 v0.5 anchors INCREASED variance in v0.6 substrate.

#### Step 5.2 unblock

Step 5.3.a (production grading harness) unblocked next per
Q5.3.1 split ladder.

---

### Hotfix shipped — 2026-05-05

State-detection CheckCategory missing from doctor text formatter
+ sample-symbol type annotation hotfix.

| Substep | branch | commit | Notes |
|---|---|---|---|
| hotfix | main | 68a1dc9 | Pre-existing tech debt surfaced at Step 5.1 dist rebuild |

#### Implementation summary

Two TypeScript build errors blocking benchmarks-repo trial
execution:

1. **src/doctor/output/text.ts CATEGORY_LABEL Record missing
   "state-detection" key** — Step 3.3 added "state-detection"
   to CheckCategory union but didn't update CATEGORY_LABEL
   Record OR `order` array. Result: state-detection checks
   silently dropped from doctor text output since Step 3.3
   ship.

2. **src/doctor/checks/sample-symbol.ts:99-113 type annotation**
   — `let entries: ReturnType<typeof readdirSync>` picked
   union's last overload; corrected to `Dirent<string>[]`.

8 bug-prevention tests added (CATEGORY_LABEL completeness +
section-header rendering for all 6 CheckCategory values).
Pre-commit suite: 1251/1251 PASS (1243 baseline + 8 new).

18th discipline #3 cadence-catch instance + tier-extension
pattern observation: caught at downstream Step 5.1 dist
rebuild rather than upstream Step 3.3 surface-inline.

---

### Step 5.1 shipped — 2026-05-06

V0.6 Step 5.1 ships methodology setup + cell-selection final
lock + trial-script wiring + dry-run smoke test per Q5.1.1-
Q5.1.4 sub-adjudications locked at Step 5.1 surface.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 5.1 (amended) | benchmarks | 2ab0b5a | 4 sub-adjudications; final cell list 8 cells (2/3/3); orchestrator (~430 LOC); dry-run smoke verified; pre-push amend per Path X precedent (missing Co-Authored-By trailer fix) |

#### Implementation summary

Four sub-adjudications locked at Step 5.1 surface:
- Q5.1.1 trick-bucket cell: cobra/c6-execute-signature
  (Go-balanced final 2 hono / 3 httpx / 3 cobra distribution)
- Q5.1.2 NEW scripts/v0.6-step5-orchestrator.mjs per per-
  cycle pattern
- Q5.1.3 (α) atlas-version-tagging via current 0.5.0 + cycle-
  version-via-run-uuid-prefix; v0.5 precedent followed; fresh-
  evidence-base intent satisfied
- Q5.1.4 cobra/c4-subcommand-resolution as dry-run smoke cell

NEW: scripts/v0.6-step5-orchestrator.mjs (~430 LOC; mirrors
v0.5-step7 with v0.6-specific config + COST_CAP_USD=40 script-
reported semantic verified at Step 5.1 surface).

Cost projection iteration documented: Step 5.0 estimate
$24-30 → Step 5.1 surface refined $36-39 → smoke empirical
$0.70/trial → Step 5.2 actual $33.39 (closer to surface
estimate than smoke outlier).

Hotfix surfacing cross-reference (commit 68a1dc9): smoke
preflight detected dist staleness + ANTHROPIC_API_KEY env-
var fix; both resolved before smoke verification.

Pre-push amend per Path X precedent: 73415e0 → 2ab0b5a
(Co-Authored-By trailer added; convention consistency).

#### Step 5.1 unblock

Step 5.2 (cost-approval gate + full trial execution) unblocked
next per Step 5.0 lock.

---

### Step 5.0 shipped — 2026-05-05

V0.6 Step 5 (Stream B targeted matrix-replication subset: 8 cells
× n=5 × 2 conditions = ~80 trials per v0.6-SCOPE.md §7.1 Q2 lock)
opens with Step 5.0 design-adjudication substep per Step N.0
cadence convention. Q5.0.1-Q5.0.12 design adjudications surfaced
+ locked per discipline #3 surface-inline-before-commit cadence
applied to step-design-phase work.

Step 5 work shape transitions from Steps 3-4 code-implementation
rhythm to empirical-evaluation rhythm (methodology setup +
trial execution + statistical analysis + substrate aggregation).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 5.0 design adjudications | main | [this commit] | Q5.0.1-Q5.0.12 locks captured; Step 5 substep ladder firmed (5.0 → 5.1 → 5.2 → 5.3 → 5.4) |

#### Q5.0.1 lock — Substep ladder shape

**Locked:** (γ) 5-substep ladder. Step 5 substep ladder:
- Step 5.0 — Design adjudications (this commit)
- Step 5.1 — Methodology setup (cell-selection final lock + trial-
  script wiring + dry-run smoke test)
- Step 5.2 — Full trial execution (cost-bearing substep; explicit
  approval gate)
- Step 5.3 — Statistical analysis + substrate aggregation +
  Phase-10 ref-doc drafting
- Step 5.4 — Step 5 close commit

Methodology rationale: trial execution is wall-clock-heavy + cost-
bearing; isolating as own substep allows clean checkpoint after
expensive execution. Step 5.3 batches analysis + aggregation per
output→input coupling. Matches v0.5 Phase-9 reference run
structure.

#### Q5.0.2 lock — Cell selection (3 new cells)

**Locked partial cells (specific identities firmed):**
- **ca-favorable: httpx/p3-custom-auth.** Python win-bucket;
  balances language coverage (v0.5 anchors are TS+Go heavy with
  only p2/p4 representing Python). Tests v0.5 +0.370 factual_
  correctness CLEAN generalization across language.
- **tie-bucket: hono/h10-env-type-on-context.** First held-out
  tie-bucket prompt; type-system question fits tie-bucket motif
  (ContextAtlas atlas-claims may not capture runtime type
  narrowing nuances better than baseline). Tests v0.5 +0.037
  completeness NOT distinguishable generalization.
- **trick-bucket: deferred-to-Step-5.1.** Trick-bucket prompt
  inventory verification surfaces at Step 5.1 implementation.
  If absent in current frozen prompt set, surfaces as rescope
  candidate per scope-doc §Rescope conditions (drop trick-bucket
  from v0.6 subset; defer B3 evaluation to v0.7 with broader
  prompt-set work).

Total v0.6 substrate: 5 anchor cells (httpx/p4 + cobra/c3 +
httpx/p2 + hono/h1 + cobra/c4) + 3 new = 8 cells × n=5 × 2
conditions = 80 trials baseline (or 7 cells × 70 trials if
trick-bucket dropped).

#### Q5.0.3 lock — Condition specification

**Locked:** v0.5 inheritance. Condition A = ca (ContextAtlas);
Condition B = beta-ca (baseline Claude Code without ContextAtlas
MCP). Per v0.5 Phase-9 ref-doc + ADR-19 LLM-judge methodology
specification. v0.6 inherits without modification per scope-doc
"Stream B inherits methodology infrastructure from v0.5 without
modification" framing.

#### Q5.0.4 lock — n=5 trial count + auto-stretch policy

**Locked:** v0.5 inheritance. n=5 baseline; auto-stretch n=5→8
for cells exhibiting variance ≥ hono/h1 v0.5 baseline (calls
range/μ ≥60% per Phase-9 ref-doc §5).

Statistical power: n=5 paired-t with σ-typical = 0.5 axis-points
detects effect size ≥0.4 at α=0.05 per v0.5 Step 6 power analysis.

#### Q5.0.5 lock — Cost framing per honest-scope-narrative discipline

**Locked:** Cost projection per CLAUDE.md "Extraction cost
framing" Q5 lock + Phase-9 ref-doc cost-projection-vs-platform-
billing 3x discipline:
- Script-reported projection: ~$24-30 with Opus 4.7 1.67×
  Sonnet adjustment per ADR-19 §2 amendment at Step 2.2
- Platform-billed expected: ~$8-12 per cache-discount empirical
  substrate (v0.5 cumulative $10.25 platform-billed vs $51-97
  base envelope = ~12-20% ratio)
- v0.6-SCOPE.md $14-22 envelope reads as platform-billed-target;
  falls within envelope per cache-discount

**Mid-cycle priors-update variance discipline** per CLAUDE.md
"Cost-priors interpretation discipline (v0.6 Step 2 / E2 lock)"
+ Phase-9 ref-doc §10 limit #8: v0.6 uses static cost-priors-
v0.5.json snapshot throughout Step 5 execution; no mid-cycle
re-aggregation. Post-v0.6-cycle aggregation produces cost-priors-
v0.6.json snapshot at Step 5.3 for v0.7 first-cycle consumption.

**Rescope to 7 cells available** if Step 5.2 surfaces cost-
approval concern OR if trick-bucket inventory absent (cell count
naturally drops to 7).

#### Q5.0.6 lock — Trial-execution infrastructure reuse

**Locked:** v0.5 paired-t harness inheritance.
- `scripts/run-reference.ts` — v0.5 trial execution harness
- `scripts/lib/stats.mjs` — paired-t per ADR-19 §4 (23 tests
  in stats.test.ts; mature)
- `scripts/aggregate-cost-priors.mjs` — cost-priors aggregator
- LLM-judge harness from v0.5 Step 2 (paired-mode anonymization
  per ADR-19)

New code at Step 5.3: v0.5-vs-v0.6 tier-gradation comparison
rollup (lives in benchmarks-repo `scripts/v0.6-stepN-*.mjs` per
existing per-step naming convention).

#### Q5.0.7 lock — Statistical analysis pattern + atlas-version-tagging refinement

**Locked:** ADR-19 §4 + Phase-9 methodology inheritance.
- Per-axis paired-t per cell × condition: 8 cells × 4 axes = 32
  paired-t evaluations
- Cross-cell rollup at concatenated N differences per Phase-9
  ref-doc Option B-2
- Per-axis tier classification per ADR-19 thresholds: clean (CI
  excludes ≥+0.05) / borderline (CI excludes ≥+0.001 but not
  ≥+0.05) / not-distinguishable (CI includes 0)
- Comparison rollup: v0.6 per-axis tier vs v0.5 per-axis tier;
  CONFIRMS / DIVERGES classification (DIVERGES → rescope
  condition trigger)

**Atlas-version-tagging refinement applied (Q5.0.7 substantive
refinement at Step 5.0 surface review).** LOCK: fresh n=5 for
all 8 cells (40 trials × 2 conditions = 80 trials). NOT replay
v0.5 substrate for anchor cells.

Reasoning per Travis adjudication:
- **Atlas-version-tagging discipline per E2 + Q4(i) lock at
  Step 2.1 (commit `9aab055`):** v0.5 trial manifests are
  contextatlas-version-tagged v0.5; v0.6 trial manifests
  tagged v0.6. Replaying v0.5 substrate as v0.6 evidence
  conflates atlas versions.
- **Forward-applicable interpretation primary discipline** per
  CLAUDE.md "Cost-priors interpretation discipline (v0.6 Step
  2 / E2 lock)" — v0.6 substrate should be v0.6-extracted to be
  valid v0.6 evidence.
- Cost overhead methodologically defensible (~$24 script-
  reported vs ~$5 if replay).

N count under fresh-n=5 lock:
- 8 cells × n=5 = 40 differences baseline
- Auto-stretch budget headroom for ≥1 cell if hono/h1-baseline
  variance pattern surfaces (n=5→8 same-cell extension)
- Cross-cell rollup N ≈ 40 (no v0.5 inheritance arithmetic;
  clean v0.6 evidence base)

#### Q5.0.8 lock — Substrate-aggregation pattern

**Locked:** v0.5 Phase-9 inheritance.
- Per-trial manifests land in `benchmarks-repo/runs/<timestamp>/
  run-manifest.json` (atlas-version-tagged via
  `contextatlas.version_label`)
- `cost-priors-v0.6.json` snapshot generated at Step 5.3 close
  via `scripts/aggregate-cost-priors.mjs --window v0.4-v0.6`
  (extends cost-priors-v0.5.json window per Q4(ii) cumulative
  aggregation lock at Step 2)
- Phase-10 ref-doc (`benchmarks-repo/research/phase-10-v0.6-
  reference-run.md`) drafted at Step 5.3 close per Phase-9
  inheritance pattern

#### Q5.0.9 lock — Test coverage scope

**Locked:** Reused stats.mjs already tested (23 tests; no new
tests needed). New code at Step 5.3:
- v0.5-vs-v0.6 tier-gradation comparison module: 4-6 new tests
  (per-axis CONFIRMS/DIVERGES classification + edge cases)
- Trial execution harness reuse: smoke-test against single cell
  at Step 5.1 dry-run

Specific test counts firm at Step 5.1 + Step 5.3 surface inline
per Q11-style pattern.

#### Q5.0.10 lock — Benchmarks-repo vs main-repo scope

**Locked:** Step 5 work primarily in
`C:/CodeWork/ContextAtlas-benchmarks/` (matches v0.5 Phase-9
precedent: trial execution + statistical analysis + cost-priors
aggregation + reference-doc all in benchmarks-repo).

Main-repo touches:
- Step 5.4 close: STEP-PLAN-V0.6.md progress log batching
- ADR amendments (if methodology adjustment surfaces from
  DIVERGES outcome): main-repo `docs/adr/` + bidirectional
  cross-references per v0.5 ADR-19 §4 amendment precedent
- v0.6-SCOPE.md: no edits expected unless rescope condition
  triggers per scope-doc §Rescope conditions

**Cross-repo SHA audit trail discipline** per v0.5 ship-gate
inheritance: each Step 5 commit captures contextatlas SHA in
benchmarks-repo run manifests; reverse cross-references at
Step 5.4 close.

#### Q5.0.11 lock — Cycle-emergent candidate-capture pattern

**Locked:** Phase-9 ref-doc §9 inheritance. v0.6 cycle-emergent
candidates surface during Step 5 execution → captured in
`benchmarks-repo/research/phase-10-v0.6-reference-run.md` §9
(cycle-emergent-only scope per v0.5 Q10 cycle-lock distinction).

Phase-10 ref-doc drafted at Step 5.3 close as substrate for v0.7
scope-doc consumption per Phase-9 → v0.6-SCOPE.md inheritance
precedent.

#### Q5.0.12 lock — Trick-bucket prompt selection (deferred to Step 5.1)

**Locked:** Trick-bucket cell selection deferred to Step 5.1
verification. Step 5.1 surface verifies trick-bucket inventory
in current `prompts/*.yml` frozen set. If trick-bucket prompts
exist → lock specific cell at Step 5.1 surface. If absent →
surface to Travis with rescope option (drop trick-bucket from
v0.6 subset; defer B3 evaluation to v0.7) per scope-doc §Rescope
conditions.

#### Cost-approval gate at Step 5.2 (per Q5.0.5 + Point 7 framing)

Step 5.2 trial execution is the cost-bearing substep ($8-12
estimated platform-billed; $24-30 script-reported with Opus 4.7
1.67× adjustment). Explicit Travis cost approval at Step 5.2
surface required before invoking trial harness; dry-run at Step
5.1 (1-2 trials) confirms infrastructure cost-free before
committing to full run.

#### Step 5.0 unblock

Step 5.1 (methodology setup + cell selection final lock + trial-
script wiring + dry-run smoke test) work unblocked per
Q5.0.1-Q5.0.12 locks. Step 5.1 surface should include:
- Pre-implementation reading of `scripts/run-reference.ts`
  benchmarks-repo trial-execution harness
- Trick-bucket prompt inventory verification (Q5.0.12
  verification step)
- Cell-selection final lock (8 cells if trick-bucket inventory
  exists; 7 cells if absent + rescope approved)
- Trial-script wiring (parameters: 8/7 cells × 2 conditions ×
  n=5 = 70-80 trials baseline; auto-stretch budget headroom)
- Dry-run smoke test on smallest cell to verify harness end-to-
  end before Step 5.2 cost-approval gate

---

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
