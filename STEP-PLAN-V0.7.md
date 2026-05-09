# STEP-PLAN-V0.7.md

**Status:** Active execution plan for v0.7 launch-bearing cycle to
v1.0. See `## Revision history` for material rescopes; routine
progress-log entries in `## Progress log`.

**Initialized:** 2026-05-09 (Step 1.0 work post-Phase-3 v0.7-SCOPE.md
commit `a6d2594`).

---

## Conventions

### Step structure

Steps are numbered top-level units of v0.7 cycle work. Each step has
a scope statement + substep checklist + unblock condition for next
step. Substeps ship via commits; substep-shipping logged to
`## Progress log`.

V0.7 ladder shape inherits v0.6 substep-bounded-sequential pattern
per launch-bearing-narrowed scope (5 substantive work clusters vs
v0.6's 9 steps). Substep types applying at v0.7:

- **Substep-bounded sequential** (Steps 1-3 + 5): each substep has
  defined scope; ships via commits; sequential ordering enforced by
  dependency map per v0.7-SCOPE.md §Sequencing.
- **Cycle-close-bounded** (Step 4): cycle-close triggered;
  evaluates substrate from Steps 1-3 per Q-pre-3 surface
  observations + cycle-close synthesis decisions inheriting v0.6
  Step 8 pattern.

### Step N.0 design-adjudication cadence

Steps 1-5 each open with a Step N.0 design-adjudication substep
that locks Step N's substep-level breakdown per discipline #3
surface-inline-before-commit cadence applied to step design phase.
Inheritance from v0.6 Step N.0 cadence convention; pattern
established at v0.6 Step 1.0 + applied at every step (2.0/3.0/4.0/
5.0/6.0/7.0/8.0/9.0).

### Progress log entries

When a step ships, append entry to `## Progress log` reverse-
chronological. Format mirrors v0.6 STEP-PLAN-V0.6.md progress log
entries:

```
### Step N.X shipped — YYYY-MM-DD

[Ship-narrative paragraphs]

| Substep | branch | commit | Notes |
|---|---|---|---|
| N.X.Y | ... | ... | ... |

#### Q-lock summaries (if applicable)

#### Cycle-execution observations (if applicable)
```

### Substrate-evolution drift framework (per Q-pre-4 lock)

V0.7 cycle pre-registers substrate-evolution drift framework:

- **Path C (post-state framing)** — DEFAULT for substrate-
  evolution after substantive work shipped against pre-state
  scope. Earlier-cycle-substrate-docs preserved as historical
  record; later-cycle-shipped-state reflects current substrate
  per cycle execution.
- **Path A (update-pre-state framing)** — APPLIES for mid-cycle
  scope adjustment BEFORE substantive work shipped against
  superseded scope. Surfaces via amendment commit with explicit
  scope-acknowledgment pre-state vs post-state framing change.

Discipline anchored at Q-pre-4 lock; cycle-execution discipline
preserves substrate-continuity via narrative documentation at
canonical bridge surface (cross-repo back-reference at ship gate
inheritance from v0.6 Step 9.7 precedent).

---

## Cross-references

- [`v0.7-SCOPE.md`](v0.7-SCOPE.md) — canonical v0.7 scope-doc
  (commit `a6d2594`); 14 success criteria + Q-pre-1 through
  Q-pre-6 locks + 7 rescope conditions
- [`v0_7-HANDOFF.md`](v0_7-HANDOFF.md) — v0.7 cycle pre-planning
  bridge document; launch-bearing reframe section + Phase 2
  4-stream historical record + cycle-pre-planning insights +
  v0.6 cycle execution substrate F1-F9
- [`v0.6-SCOPE.md`](v0.6-SCOPE.md) — v0.6 scope anchor (shipped
  2026-05-09; commit `a8d01eb`); 15-criterion pattern + cycle-
  pre-planning Phase 1+2 narrative inheritance
- [`STEP-PLAN-V0.6.md`](STEP-PLAN-V0.6.md) — v0.6 cycle per-
  step execution log; ship gate 9-substep ladder pattern +
  7-class recursive catch-pattern observation enumeration
- [`research/v0.5-candidates.md`](research/v0.5-candidates.md)
  — substrate-gap items A1+A2+A3 source for v0.7 Step 3
  TERTIARY scope
- [Phase-10 ref-doc §12](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/phase-10-v0.6-reference-run.md)
  — v0.6 ship cross-repo back-reference revision history
  (substrate-evolution drift narrative inheritance for v0.7
  ship gate)

---

## Cycle structure

V0.7 cycle ships v1.0 public launch via 5 substantive steps:

- **Step 0** — Skipped at pre-planning per v0.7-SCOPE.md §5
  refinement 2 lock. No housekeeping items identified at v0.7
  cycle entry.
- **Step 1** — PRIMARY B13 functional implementation
  (claude-code-only extraction path)
- **Step 2** — SECONDARY 3-repo install/setup empirical
  verification
- **Step 3** — TERTIARY A1+A2+A3 substrate gap fixes
- **Step 4** — Cycle-close evaluations (cycle-close-bounded)
- **Step 5** — Ship gate (v0.7.0 + v1.0.0 dual-tag per Q-pre-5)

---

## Steps

### Step 0 — Skipped at pre-planning

**Locked at v0.7-SCOPE.md §5 refinement 2.** No housekeeping
items identified at v0.7 cycle entry pre-planning. v0.6 cycle
Step 0 captured B14 housekeeping (Opus 4.7 pricing fix; absorbed
at v0.6 Step 9.6 ship commit per scope-doc-locked-but-not-shipped
catch class observation). v0.7 inherits pricing fix at v0.6.0
baseline.

If items surface during v0.7 cycle execution that retrospectively
fit Step 0 framing, surface as separate substep at appropriate
point in cycle (substep numbering preserves convention via
0.5-suffix or re-numbering).

---

### Step 1 — PRIMARY B13 functional implementation (claude-code-only extraction path)

**Scope.** v0.6 shipped B13-flag stub per pending-resolution
architecture (Item 2 reconsider lock; commit `f14cb04` config-
field substrate); v0.7 ships single-dependency claude-code-only
extraction path as functional implementation. ADR-02 amendment
required (extraction-sole-API-caller framing →
extraction-via-multiple-paths per Q1.0.1 β substantive lock).

**Substeps** (firmed at Step 1.0 per Q1.0.9 7-substep ladder
lock — Q1.0.2 verification as explicit gate-substep refinement):

- [x] **Step 1.0** — Design adjudications (Q1.0.1-Q1.0.12 locks;
  STEP-PLAN-V0.7.md initialization; 12 sub-adjudications + 2
  refinements applied: Q1.0.8 γ-2 soft deprecation + Q1.0.9
  7-substep gate-substep refinement). Shipped 2026-05-09; commit
  `[this commit]`.
- [ ] **Step 1.1** — Q1.0.2 verification (explicit gate-substep
  per Q1.0.9 refinement; rescope condition #1 trigger surface).
  Read Claude Code Skills + Slash Commands documentation; verify
  extraction-pipeline use case support. Outcome A clears →
  proceed to Step 1.2; Outcome B fails → rescope condition #1
  triggers; PRIMARY scope adjusts via Path A; Travis call.
- [ ] **Step 1.2** — ADR-02 amendment (per Q1.0.11 β lock;
  AFTER Q1.0.2 verification clears; β substantive scope per
  Q1.0.1 — extraction-sole-API-caller framing →
  extraction-via-multiple-paths; CI grep pattern updated).
- [ ] **Step 1.3** — Strategy pattern wrapper module
  (`src/extraction/extractor.ts` interface + skeleton per Q1.0.10
  γ lock; abstraction boundary for path-routing dispatch).
- [ ] **Step 1.4** — Path-routing dispatch logic + claude-code-
  only concrete implementation (per Q1.0.3 α config-flag-based
  dispatch lock + Q1.0.4 β-3 hybrid default lock; runner.ts reads
  `architecture` field; absent-means-default claude-code-only;
  init writes explicit-default per Q4.2.2 inheritance).
- [ ] **Step 1.5** — Cost model accounting integration + tests +
  `--api-direct` flag negation + `--cc-only` soft deprecation
  (per Q1.0.5 δ separate cost_model field lock + Q1.0.6 α+γ
  combined test pattern lock + Q1.0.8 γ-2 soft deprecation
  refinement; emits stderr warning on `--cc-only` use; v0.8+
  removes flag entirely).
- [ ] **Step 1.6** — Step 1 close (progress log batching for
  Steps 1.1-1.5 ships; cycle-execution observations captured
  per discipline #3 cadence).

**Unblocks.** Step 2 SECONDARY (3-repo install/setup verification)
+ Step 3 TERTIARY (A1+A2+A3 substrate gap fixes) per v0.7-
SCOPE.md §Sequencing (parallel-or-sequential per Step 1 design
phase outcome on path-routing implementation timing).

**Test coverage.** Per CLAUDE.md src-changes-require-full-test
discipline: 1303/1303 v0.6 baseline + v0.7 test additions for
new B13 functional implementation modules (mocked Claude Code
session context responses per Q1.0.6 stub-client pattern;
path-routing branch tests; cost model accounting verification).

---

### Step 2 — SECONDARY 3-repo install/setup empirical verification

**Scope.** v0.6 shipped pipeline-mechanics + smoke test (A4 +
A6 + A7 + H5 + B13-flags integration; Step 4.5 close commit
`64819a7`). v0.7 SECONDARY validates pipeline-mechanics against
real-repo empirical surface beyond Step 4.4 smoke test scope per
Q-pre-2 lock (3-repo target set; 2-repo fallback if variance
exceeds timeline at Step 2.0 design phase).

**Substeps** (firmed at Step 2.0 per Step N.0 cadence convention):

- [ ] **Step 2.0** — Design adjudications (Q2.0.1-Q2.0.3+ locks;
  3-repo target firm per Q-pre-2; verification protocol;
  acceptance criteria; friction-observation handling protocol).
- [ ] **Step 2.1+** — Verification substeps (firm at 2.0 design
  phase; per-repo verification execution; friction observation
  capture).
- [ ] **Step 2.N** — Step 2 close (verification outcome
  documentation; v1.0 ship-gate criterion #2 closure assessment;
  launch-blocking issues triaged per Q2.0.3 protocol).

**Unblocks.** Step 4 cycle-close evaluations (Step 2 outcome
surfaces v1.0 ship-gate criterion #2 closure status; Tier 3
inheritance discipline if SECONDARY rescope condition #2
triggers).

---

### Step 3 — TERTIARY A1+A2+A3 substrate gap fixes

**Scope.** Per Q-pre-3 lock + v0.7-SCOPE.md §2 TERTIARY scope:
A1 `classifyError` catch-all + A2 `extractDocstringsForFile`
non-idempotent + A3 `pipeline.ts` Stage 5 deletion handling
(paired substrate gaps from `research/v0.5-candidates.md` #1
+ #2 + #3; ~90-300 LOC total scope estimate; user-trust impact
at v1.0 launch).

**Substeps** (firmed at Step 3.0 per Step N.0 cadence convention):

- [ ] **Step 3.0** — Design adjudications (Q3.0.1-Q3.0.3+ locks;
  A1 classifyError split design; A2 idempotency model; A3
  deletion sweep design).
- [ ] **Step 3.1** — A1 classifyError split implementation
  (specific classification taxonomy; user-facing error reporting;
  unit tests).
- [ ] **Step 3.2** — A2 extractDocstringsForFile idempotency
  implementation (symbol-id-keyed idempotency model; integration
  tests against fixture).
- [ ] **Step 3.3** — A3 pipeline.ts Stage 5 deletion handling
  implementation (claim-source-aware deletion sweep; file-
  deletion idempotency; integration tests against fixture).
- [ ] **Step 3.4** — Step 3 close (progress log batching for
  Steps 3.1-3.3; A1+A2+A3 cumulative LOC + test coverage
  verification).

**Unblocks.** Step 4 cycle-close evaluations (Step 3 outcome
surfaces TERTIARY closure status; rescope condition #3 triggers
if scope creep beyond ~90-300 LOC envelope).

---

### Step 4 — Cycle-close evaluations (cycle-close-bounded)

**Scope.** Cycle-close-triggered evaluations matching v0.6 Step 8
pattern. Inheritance from v0.6 Step 8.0 Q8.0.1-Q8.0.8 design
adjudications pattern.

**Substeps** (firmed at Step 4.0 per Q4.0 design adjudications
inheritance from v0.6 Step 8.0 pattern; expected: 3-substep
compressed split per v0.6 Step 8.1 Q8.0.1 γ lock precedent OR
adjusted per v0.7-specific cycle-close substrate volume):

- [ ] **Step 4.0** — Design adjudications (Q4.0.1+ locks per
  v0.6 Q8.0 pattern inheritance; v0.7-specific cycle-close
  evaluations selection).
- [ ] **Step 4.1** — Cycle-close evaluations bundle (mechanical
  recording of pre-registered evaluation outcomes if compressed
  split locks).
- [ ] **Step 4.2** — v0_8-HANDOFF.md amendment + Step 4 close
  (v0.8+ post-launch substrate handoff per launch-bearing
  reframe inheritance pattern; matches v0.6 Step 8.2 v0_7-
  HANDOFF.md amendment precedent).

**Unblocks.** Step 5 ship gate (Step 4 entire arc is Step 5
prerequisite per v0.6 Q8.0.6 lock inheritance).

---

### Step 5 — Ship gate (v0.7 + v1.0 dual-tag)

**Scope.** v0.7 + v1.0 ship gate per Q-pre-5 lock (single ship-
gate; v0.7.0 + v1.0.0 dual tags pointing at same commit).
9-substep ladder pattern matches v0.6 Step 9 inheritance + v0.7-
specific dual-tag adjustments.

**Substeps** (firmed at Step 5.0 per Q5.0 design adjudications
inheritance from v0.6 Q9.0 pattern):

- [ ] **Step 5.0** — Design adjudications (Q5.0.1+ locks per
  v0.6 Q9.0 pattern inheritance; Q5.0.X dual-tag operation
  semantics + Q5.0.Y Step 5.5 absorbed-item annotation expanded
  scope + Q5.0.Z package.json bump shape per v0.7-SCOPE.md §7.6
  inheritance).
- [ ] **Step 5.1** — Pre-flight verification (npm test main
  1303/1303+ PASS + benchmarks-repo green + npm run build clean
  + working-content gap inventory + cross-document consistency
  verification + cycle-thesis surface enumeration; 7-class
  recursive catch-pattern observation classes scan per v0.6
  Step 9.1 inheritance + NEW classes if v0.7-specific surface).
- [ ] **Step 5.2.a-d** — External-doc inline surfaces (README +
  ROADMAP + CLAUDE.md + DESIGN.md per Q5.0 lock; Path 1 README
  coordination canonical-state-first per Q-pre-6 + v0.6 Q9.0.3
  inheritance; Travis launch-side polish post-ship).
- [ ] **Step 5.3** — Verification table inline (14-criterion
  6-column verification table per v0.6 Q9.0.4 6-column
  inheritance + Q5.0 lock).
- [ ] **Step 5.4** — Tag message inline (v0.7.0 + v1.0.0 dual
  tag bodies per Q-pre-5 lock; v0.7.0 cycle-close framing;
  v1.0.0 public-launch framing; SHA-free body per v0.5.0 +
  v0.6.0 precedent inheritance).
- [ ] **Step 5.5** — Absorbed-item annotations (expanded scope
  per Q-pre-3 surface observation: 5+ items including v0.5-
  candidates.md #6 partial-absorbed at v0.6 A6 + #13 partial-
  absorbed at v0.6 A7 + A1 + A2 + A3 absorbed-at-v0.7 via
  TERTIARY scope; URL-form per Q9.0.6 α-light inheritance).
- [ ] **Step 5.6** — Ship commit + dual-tag HEREDOC alongside
  (single ship commit per Q-pre-5; v0.7.0 + v1.0.0 tags
  pointing at same commit; package.json bump per Q5.0.Z lock at
  Step 5.0 design phase — lean single bump to 1.0.0).
- [ ] **Step 5.7** — Cross-repo back-reference (benchmarks-
  repo Phase-N ref-doc revision history if applicable; v0.7
  cycle may not generate Phase-N ref-doc since launch-bearing
  cycle has no matrix-replication run; potentially skip per
  Q5.0 lock).
- [ ] **Step 5.8** — SHA backfill (STEP-PLAN-V0.7.md Step 5
  progress log + v0_7-HANDOFF.md placeholder fills + cross-
  repo SHA placeholder per Q9.0.9 α inheritance; v0.5 11.8 +
  v0.6 9.8 minimal-scope precedent).

**9-step locked sequence (v0.5+ canonical inheritance).** Per
v0.6-SCOPE.md §SC #15 + v0.7-SCOPE.md §8 #12:
1. Pre-flight verification (npm test main + benchmarks)
2. Apply working content (doc updates per ship discipline)
3. Stage explicit-paths
4. Create ship commit via HEREDOC
5. Verify commit landed
6. Create annotated tags `v0.7.0` + `v1.0.0` via HEREDOC per
   v0.5 + v0.6 SHA-free precedent (dual-tag operation)
7. Verify tags created
7.5. Post-execution verification (canonical Step 7.5 inheritance):
   inspect committed body + tagged bodies for HEREDOC escape
   artifacts; encoding issues; formatting drift; cross-document
   SHA reference accuracy. STOP if artifacts caught; apply Path
   X amend + tag re-create per pre-push window affordance.
8. Capture ship-commit SHA
9. (Cross-repo back-reference at separate commit + 5.8-style
   backfill if applicable per v0.5 + v0.6 ship-gate precedent)

**Unblocks.** v1.0 public launch trigger; launch-document
publication post-v1.0 ship per Q-pre-6 lock (Travis-readiness
timeline; not blocking).

---

## Progress log

*Entries added in reverse-chronological order as steps ship.*

### Step 1.0 shipped — 2026-05-09

V0.7 cycle execution opens with Step 1.0 design-adjudication
substep per Step N.0 cadence convention inheritance from v0.6.
Q1.0.1-Q1.0.12 design adjudications surfaced + locked per
discipline #3 surface-inline-before-commit cadence applied to
step-design-phase work; 12 sub-adjudications locked with 2
refinements (Q1.0.8 γ-2 soft deprecation + Q1.0.9 7-substep
ladder gate-substep refinement).

STEP-PLAN-V0.7.md initialized at this commit (mirrors v0.6 STEP-
PLAN-V0.6.md initialization at commit `99bf42c`); cycle structure
overview + Steps 1-5 substep ladders + Step 1.0 progress log
entry.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 1.0 design adjudications | main | [this commit] | Q1.0.1-Q1.0.12 locks captured + 2 refinements applied; Step 1 substep ladder firmed (7-substep per Q1.0.9 gate-substep refinement); STEP-PLAN-V0.7.md initialized |

#### Q1.0.1 lock — ADR-02 amendment scope

**Locked:** (β) substantive ADR-02 amendment.

Reasoning: preserves load-bearing query-time vs research-time
invariant while accommodating new claude-code-only path.
Reframes "extraction is sole Anthropic API caller" to
"extraction is sole research-time-extraction-caller; alternative
paths permitted (Claude Code session context)". CI enforcement
grep pattern extends naturally. Matches v0.5 Step 2.0 amendment
precedent (`aeaa5e0` extending permitted-modules to
`src/grading/`).

Recorded at Step 1.2 ADR-02 amendment substep (per Q1.0.11 β
timing lock).

#### Q1.0.2 lock — Claude Code session context API surface verification

**Locked:** Defer sub-shape decision to Step 1.1 explicit
verification substep per Q1.0.9 7-substep gate-substep
refinement.

Reasoning: Q1.0.2 IS substantive rescope-trigger risk worth
explicit gate-substep treatment. If verification clears → proceed
to Step 1.2 ADR-02 amendment + Step 1.3 wrapper module + etc.
If verification fails → rescope condition #1 triggers; PRIMARY
scope adjusts via Path A; B13 functional implementation may
defer to v0.8+.

Sub-shape options surfaced (α Skill-based / β Slash-command-
based / γ Sub-process orchestration / δ External tool
invocation) firm at Step 1.1 verification substep.

#### Q1.0.3 lock — Path-routing branch architecture

**Locked:** (α) config-flag-based dispatch.

Reasoning: matches v0.6 stub substrate inheritance + simplest
implementation + user-controlled (no surprises). Default behavior
set per Q1.0.4 separately.

`ContextAtlasConfig.architecture` field already exists per v0.6
Step 4.2 commit `f14cb04`; runner.ts reads field; extraction
pipeline branches on field value at Step 1.4 implementation.

#### Q1.0.4 lock — Default extraction path post-amendment

**Locked:** (β-3) hybrid — claude-code-only default + absent-
means-default per Q4.2.2 inheritance + init writes explicit-
default.

Reasoning: aligns with Travis pivot framing ("claude code only
is def a priority feature"). User gets claude-code-only by
default; can opt-in to API-direct via `--api-direct` flag (per
Q1.0.8 γ-2 lock); explicit-write at init preserves v0.6 Q4.2.2
absent-means-default discipline.

User-facing default UX: first-run init writes
`architecture: "claude-code-only"` explicit-default to
`.contextatlas.yml`; runner.ts treats absent-field as claude-
code-only (preserves v0.6 Q4.2.2 absent-means-default
discipline).

#### Q1.0.5 lock — Cost model accounting for subscription-bounded path

**Locked:** (δ) separate cost_model field.

Reasoning: type-stable; explicit semantics; clearer for users;
minimal test churn. cost_usd remains numeric ($0 for claude-
code-only); cost_model captures path semantics ("api" |
"subscription-bounded"). Avoids type-mixing (β); avoids
field-suppression breaking summary parsing (γ); provides
explicit semantics user-facing (vs implicit-zero α).

Implemented at Step 1.5 cost model accounting integration
substep.

#### Q1.0.6 lock — Mocked Claude Code session context responses for unit tests

**Locked:** (α + γ combined) stub-client pattern + path-
routing branch test pattern.

Reasoning: matches existing `stubClient` pattern in
`cli-runner.test.ts` (extends naturally for claude-code-only
path); test dispatch branch + claude-code-only-specific
assertions in unified test surface.

Implemented at Step 1.5 test suite extensions substep.

#### Q1.0.7 lock — Subscription-bounded path testing strategy

**Locked:** (α) manual integration tests at SECONDARY.

Reasoning: test suite stays fast + deterministic + offline;
SECONDARY 3-repo verification at Step 2 IS the integration
test surface for claude-code-only. Matches v0.6 Step 4.4
atlas creation + smoke test discipline (real-pipeline-
validation at end-to-end test surface).

Automated subprocess-based integration tests (β) deferred —
complex; potentially flaky; not v0.7 scope.

#### Q1.0.8 lock — `--cc-only` flag deprecation timing

**Locked:** (γ-2) soft deprecation refinement.

`--cc-only` becomes deprecated-no-op (emits stderr warning
"default behavior; flag deprecated; will be removed at v0.8+")
+ `--api-direct` new explicit opt-out flag. v0.8+ removes
`--cc-only` entirely.

Reasoning: v0.6 users with `--cc-only` in workflows don't hit
unexpected errors at v0.7 upgrade; warning informs migration;
flag removal at v0.8+ is honest deprecation cycle. γ-1 outright
removal would be breaking change without deprecation period.

Implemented at Step 1.5 cost model + flag negation substep.

#### Q1.0.9 lock — Step 1 substep ladder shape

**Locked:** 7-substep ladder with Q1.0.2 verification as
explicit gate-substep refinement.

7 substeps:
- 1.0 design (this substep)
- 1.1 Q1.0.2 verification (explicit gate-substep)
- 1.2 ADR-02 amendment (per Q1.0.11 β; AFTER verification)
- 1.3 Strategy pattern wrapper module (per Q1.0.10 γ)
- 1.4 Path-routing dispatch logic + claude-code-only impl
- 1.5 Cost model + tests + flag negation + soft deprecation
- 1.6 close

Reasoning: Q1.0.2 verification as explicit gate substep
prevents sunk-cost on Step 1.2-1.5 implementation if
verification fails. 6-substep ladder buries verification
inside implementation flow; 7-substep makes gate-explicit.

#### Q1.0.10 lock — claude-code-only path implementation locus

**Locked:** (γ) Strategy pattern.

Interface in `src/extraction/extractor.ts` + concrete
implementations (`api-direct.ts` + `claude-code-only.ts`).
Clean abstraction; extensible (future paths plug into
interface); testable (mock at interface boundary); matches
CLAUDE.md "small files; under 300 lines" discipline.

Slight upfront cost; substantial maintenance benefit. Avoids
β single-pipeline-with-branch pattern (existing pipeline.ts
larger) + α new-directory pattern (over-decomposition for
v0.7 scope).

Implemented at Step 1.3 wrapper module substep.

#### Q1.0.11 lock — ADR-02 amendment commit timing

**Locked:** (β) Step 1.2 ADR-02 amendment.

Shifted from Step 1.1 (in original 6-substep ladder) to Step
1.2 (in 7-substep ladder per Q1.0.9 refinement); ADR-02
amendment AFTER Q1.0.2 verification clears at Step 1.1.

Reasoning: matches v0.5 Step 2.0 precedent (`aeaa5e0`); ADR
commitments anchor implementation work at start; design intent
captured contractually before code. Q1.0.2 verification as
gate-substep ensures ADR amendment doesn't ship if PRIMARY
scope rescopes via Path A.

#### Q1.0.12 lock — Backwards-compat at v0.6 `architecture: "claude-code-only"` config-flag users

**Locked:** (α) explicit announcement at v0.7 release notes /
ROADMAP v0.7 [SHIPPED] section at v0.7 Step 5 ship gate.

V0.6 ships flag-accepted-no-op (config field exists; runner.ts
reads field; extraction pipeline does NOT branch — runs
Anthropic API path regardless of field value). v0.7 makes flag
operational.

Honest-scope-acknowledgment: users with `architecture:
"claude-code-only"` in v0.6 configs will see behavioral change
at v0.7 upgrade. Release notes + ROADMAP entry note this
explicitly per user-respectful discipline (matches v0.6 cohort
cohort-facing tone inheritance pattern).

Surface location: Step 5.2.a README v0.7 [SHIPPED] block + Step
5.2.b ROADMAP v0.7 [SHIPPED] section + Step 5.4 v1.0.0 tag body
public-launch framing.

#### Step 1.0 unblock — Step 1.1 Q1.0.2 verification

Step 1.1 (Q1.0.2 verification) unblocked. Explicit gate-substep
per Q1.0.9 refinement; rescope condition #1 trigger surface.

Read Claude Code Skills + Slash Commands documentation; verify
which mechanism (α Skill / β Slash-command / γ Sub-process /
δ External tool) supports:
- Surfacing extraction prompt + source documents to running
  Claude Code session
- Running prompt in subscription-bounded context
- Persisting structured output (atlas.json) from session

**Outcome A — verification clears:** Proceed to Step 1.2
ADR-02 amendment per Q1.0.11 β lock; architecture shape locked
per verification outcome.

**Outcome B — verification fails:** Rescope condition #1
triggers; PRIMARY scope adjusts via Path A (per Q-pre-4 lock);
B13 functional implementation may defer to v0.8+; Travis call.

Surface verification result inline before Step 1.2 substep
entry per discipline #3 cadence (substantively-interpretive
moment per recursive catch-pattern discipline class #6
substrate-evolution drift framework).

---

## Revision history

- **2026-05-09** — STEP-PLAN-V0.7.md initialized at v0.7 Step
  1.0 design adjudications commit. Mirrors v0.6 STEP-PLAN-
  V0.6.md initialization pattern (commit `99bf42c`); cycle
  structure overview + Steps 1-5 substep ladders firmed at
  scope-doc-time-locked + Step-N.0-time-firmed convention
  inheritance from v0.6. Q1.0.1-Q1.0.12 design adjudications
  locked + 2 refinements applied (Q1.0.8 γ-2 soft deprecation
  + Q1.0.9 7-substep ladder gate-substep refinement).
