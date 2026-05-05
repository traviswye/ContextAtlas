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
  direct amendment + split documentation).
- [ ] **Step 2.1** — E2 CLAUDE.md addition: "Cost-priors
  interpretation discipline (v0.6 Step 2 / E2 lock)" section
  alongside existing "Extraction cost framing" section.
- [ ] **Step 2.2** — B15 ADR-19 §2 amendment: Opus 4.7 = 1.67×
  Sonnet pricing; amendment marker + revision history entry per
  v0.5 §4 amendment precedent.
- [ ] **Step 2.3** — Step 2 close commit: progress log close
  entry + cross-references between CLAUDE.md section + ADR-19
  amendment.

**Unblocks.** Step 5 Stream B subset cost-budgeting + execution.

---

### Step 3 — Stream A foundations (A4 + A6 + H5)

**Scope.** Stream A pipeline-mechanics core: A4 `buildBundle` lazy-
spawn (atlas-only mode) + A6 doctor script (deep LSP health check
+ structure for multi-dimension state-detection) + H5 multi-
dimension state-detection logic (existing-repo-vs-new-project
branching + ADRs/code/README/DESIGN.md/language/git substrate
detection).

**Substeps.** Step 3.0 design-adjudication substep firms substep-
level breakdown per Step N.0 cadence convention.

**Unblocks.** Step 4 Stream A pipeline assembly.

---

### Step 4 — Stream A pipeline assembly (A7 + B13-flags integration)

**Scope.** A7 self-use onboarding pipeline integrating A4 + A6 +
H5 outputs; B13-flags `--cc-only` boolean opt-in integration into
A7 config setup per Q5 lock. UX flow per Q4 hybrid lock (automated
default path + interactive missing-substrate path per H5 state-
detection); specific message wording firms at Step 4 implementation.

**Substeps.** Step 4.0 design-adjudication substep firms substep-
level breakdown per Step N.0 cadence convention.

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
