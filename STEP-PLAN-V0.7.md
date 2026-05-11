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
- [x] **Step 1.1** — Q1.0.2 verification (explicit gate-substep
  per Q1.0.9 refinement; rescope condition #1 trigger surface).
  Read Claude Code Skills + Slash Commands documentation; verify
  extraction-pipeline use case support. **Outcome A** cleared
  cleanly: α Skills mechanism supports use case; β Slash Commands
  functionally identical (skill-with-frontmatter); γ + δ
  architecturally incompatible. Q1.0.2 sub-shape locked α Skills
  primary + β Slash Commands invocation surface (opt-in); skill
  canonical location `.claude/skills/index-atlas/SKILL.md` per
  existing `/claude-api` skill precedent. Shipped 2026-05-09;
  commit `[this commit]`.
- [x] **Step 1.2** — ADR-02 amendment (per Q1.0.11 β lock;
  AFTER Q1.0.2 verification clears; β substantive scope per
  Q1.0.1 — extraction-sole-API-caller framing →
  extraction-via-multiple-paths; CI grep pattern updated).
  Substantive graduation reframe applied (research-cycle
  SOLE-CALLER invariant → v0.7+ production-cycle user-choice
  configuration); Path (iii) 2-mode collapse + 1 legacy alias
  locked per v0.6 actual extraction behavior verification at
  Step 1.2 surface. Lock revisions captured: Q1.0.4 RETURN to
  β-3; Q1.0.8 REVISED to 3-flag user-choice; Q1.0.10 + Q1.0.5
  UNCHANGED. Shipped 2026-05-09; commit `[this commit]`.
- [x] **Step 1.3** — Strategy pattern wrapper module
  (`src/extraction/extractor.ts` interface + skeleton per Q1.0.10
  γ lock; abstraction boundary for path-routing dispatch).
  Shipped 2026-05-10; commit `[this commit]`. 6 module shapes
  applied (Extractor interface + 2 skeleton implementations +
  factory.ts + types.ts edits + 5 NEW test files); 6 design
  adjudications locked (Q1.3.1-Q1.3.6); 2 verifications resolved
  inline; 1316/1316 tests PASS (1303 baseline + 13 new); npm run
  build clean.
- [x] **Step 1.4a** — Mode B full implementation + cli-runner
  Strategy dispatch integration + init/runner Q1.0.4 β-3 +
  Q1.0.8 3-flag wiring (mechanical clusters 1 + 3 + 4 + partial
  5 per Q-pre-4 Path A pre-state amendment splitting Step 1.4
  → 1.4a/1.4b). Mode B end-to-end functional; Mode A still
  throws Step-1.4b-pending error. Shipped 2026-05-10; commit
  `[this commit]`.
- [x] **Step 1.4b** — Path-3 entry-point-determined architectural
  reframe (CLI cannot bridge to Claude Code Skills; reframed from
  config-field-user-choice to entry-point-determined model per
  CLI-can't-bridge-to-Skills architectural reality surfaced at
  Step 1.4b inline design surface). ADR-02 re-amendment + Skills
  mechanism shipped (`.claude/skills/index-atlas/SKILL.md` +
  Path-γ `contextatlas show-prompt` CLI subcommand +
  `ClaudeCodeOnlyExtractor` informational-stub per Q1.0.10 (b)
  sub-lock). 4 Q-lock revisions (Q1.0.4 dropped; Q1.0.8
  simplified; Q1.0.10 (b) stub; Q1.0.5 preserved). Architecture
  field deprecated with 3-variant stderr warning at parser
  layer; field removed at v0.8+. Shipped 2026-05-10; commit
  `[this commit]`.
- [x] **Step 1.5** — Verification + closure work per locked
  Path-3 reframe (substantively lighter than original 7-substep
  ladder Step 1.5 framing per Q1.0.9; cost model accounting +
  flag negation + soft deprecation all shipped at Step 1.4b
  ahead-of-schedule under Path-3 reframe). Verification scan
  complete (no orphaned --api-direct/apiDirect source refs; no
  orphaned architecture-as-runtime-selector source refs; legacy
  compat handling expected per Path-3 deprecation cycle).
  cost_model atlas.json metadata persistence GAP identified —
  Q1.0.5 δ preserved at runtime field; atlas.json metadata
  persistence DEFERRED to v0.8+ per honest-scope
  acknowledgment (atlas schema bump 1.3 → 1.4 + pipeline.ts
  plumbing + exporter integration substantive scope; not v0.7
  scope). Shipped 2026-05-10; commit `[this commit]`.
- [x] **Step 1.6** — Step 1 close. Progress log batching for
  Steps 1.0-1.5 substantively shipped via per-substep entries
  (no batching needed at close); cumulative Step 1 PRIMARY scope
  outcome captured; cost_model persistence gap pre-registered
  for v0.7 ship gate Step 5.5 absorbed-item annotation + v0_8-
  HANDOFF.md substrate at Step 4 cycle-close; Step 2 SECONDARY
  3-repo install/setup empirical verification unblocked.
  Shipped 2026-05-10; commit `[this commit]`.

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

### Step 2 — SECONDARY 2-repo install/setup empirical verification + Path 1 scope expansion (generate-adrs to v0.7 PRIMARY)

**Scope.** v0.6 shipped pipeline-mechanics + smoke test (A4 +
A6 + A7 + H5 + B13-flags integration; Step 4.5 close commit
`64819a7`). v0.7 SECONDARY validates pipeline-mechanics against
real-repo empirical surface beyond Step 4.4 smoke test scope per
Q-pre-2 lock. **Path 1 scope expansion locked at Step 2.0:**
generate-adrs feature added to v0.7 PRIMARY scope at both CLI
+ Skills surfaces per Path-3 entry-point-determined architecture
inheritance. v0.7-SCOPE.md amendment per Q-pre-4 Path A pre-state
amendment framework (Step 2.0.1 separate commit per Option B
lock).

**Target repos locked at Step 2.0** (Q2.0.1):
- **Slot 1:** ContextAtlas-on-itself dogfood (operational
  baseline; 33 ADRs; verifies extraction-given-substrate path)
- **Slot 2:** Rich (Textualize/rich); Medium Python codebase
  + no formal ADRs + rich docstrings + clean architecture;
  verifies cold-start path (generate-adrs → extraction
  end-to-end). Alternative candidates if Rich doesn't fit at
  Step 2.2 entry: Typer OR Pydantic
- **Slot 3:** DROPPED per honest-scope-acknowledgment;
  deferred to v0.8+ post-launch cycle

**Substeps** (firmed at Step 2.0 per Q2.0.4 6-substep ladder lock
+ Path 1 scope expansion):

- [x] **Step 2.0** — Design adjudications (Q2.0.1-Q2.0.4 + Q2.0.X
  locks; 2-repo target firm + 3rd slot dropped per honest-scope;
  4-phase verification protocol; 3-bucket friction-observation
  triage; 6-substep ladder; CLI-vs-Skill equivalence protocol;
  Path 1 scope expansion to v0.7 PRIMARY).
- [x] **Step 2.0.1** — v0.7-SCOPE.md amendment per Option B lock
  (separate commit per Q-pre-4 Path A pre-state amendment
  framework; substantively significant PRIMARY scope expansion
  warrants dedicated commit per discipline #3 cadence applied to
  scope-doc amendments; matches v0.6 Step 8.2 v0_7-HANDOFF.md
  amendment pattern). 9-section amendment: §2 + §4 + §5 + §6 +
  §7 + §8 + §9 + §10 + §Revision history; 3 substantive
  refinements applied (§6 Mitigation calibration-scope-
  difference explicit + §10 condition #8 3-tier severity-
  gradient fallback paths + §Revision history TL;DR prefix).
  Shipped 2026-05-10; commit `[this commit]`.
- [x] **Step 2.1** — ContextAtlas-on-itself verification
  (operational baseline; 4-phase protocol; gate before Step 2.2
  cold-start verification). All 4 phases PASS clean. Atlas
  freshly extracted at HEAD `40d8b77`; 512 claims + 1002 symbols
  + 19 ADRs + 1595 claim-symbol links; cost $0.88 script-
  reported; query latency 0.04-0.70ms (~140-2500× margin under
  sub-100ms ADR-02 invariant). Substrate-consistency between
  state-detection + extraction empirically verified.
  Shipped 2026-05-11; commit `[this commit]`.
- [x] **Step 2.1.a** — FO-1 + FO-2 + FO-3 friction-observation
  fixes + Scope γ' multi-format substrate (.md + .rst + 3
  naming conventions + unified `src/utils/adr-enumeration.ts` +
  custom subset `src/parsing/rst-parser.ts`) + v0.7-SCOPE.md
  amendment per Option A inline (reference-context feature +
  user-configured-root scope + status-subdirectory v0.8+
  deferral + 3 new §6 risks + §7.3' substrate locks + §8
  criteria #17 + #18 + §9 cost framing revision + §10 rescope
  condition #9). 13th cycle-execution observation class
  captured + refinement to class 10 (substrate-verification-at-
  each-substep-boundary). Shipped 2026-05-11; commit
  `[this commit]`.
  (operational baseline; 4-phase protocol; gate before Step 2.2
  cold-start verification).
- [ ] **Step 2.2** — Rich cold-start verification cluster:
  - **Step 2.2.a** — generate-adrs feature implementation (CLI
    subcommand + Skills file + tests; Q2.2.a.1-Q2.2.a.4
    adjudications surface inline at substep entry)
  - **Step 2.2.b** — Rich cold-start verification using
    just-implemented generate-adrs (4-phase protocol +
    generate-adrs cold-start + extraction-after-generation
    end-to-end)
- [ ] **Step 2.3** — CLI-vs-Skill extraction equivalence
  verification per Q2.0.X protocol (applied to extraction
  across target repos with ADRs OR post-generate-adrs at Rich;
  structural-match-first + claim-text-fuzzy + claim-count
  sanity-check).
- [ ] **Step 2.4** — CLI-vs-Skill generate-adrs equivalence
  verification (NEW substep per Path 1 scope expansion;
  parallels Q2.0.X protocol applied to generation feature).
- [ ] **Step 2.5** — Step 2 close (cumulative outcome; v1.0
  ship-gate criterion #2 closure; launch-blocking issues
  triaged per Q2.0.3 protocol).

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

### Step 2.1 shipped — 2026-05-11 (ContextAtlas-on-itself operational baseline 4-phase verification PASS + substrate-consistency empirically verified + 14th cycle-execution observation class captured)

V0.7 Step 2.1 ships ContextAtlas-on-itself dogfood operational baseline 4-phase verification per Q2.0.2 lock. All 4 phases PASS clean against the post-Step-2.1.a substrate. Substrate-consistency between state-detection + extraction empirically verified end-to-end at production surface (FO-2 fix verified). 14th cycle-execution observation class captured per Travis Step 2.1.a lock (estimate-vs-empirical-scope-divergence handling at substantive interpretive work).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 2.1 4-phase verification PASS | main | [this commit] | Phase 1 init (FO-3 fix verified) + Phase 2 doctor 26P/3W/0F (FO-2 fix verified — `19 ADR(s) detected`) + Phase 3 fresh extraction Mode B (5 files / 130 claims / $0.88 cost / 0 errors; atlas at HEAD `40d8b77`) + Phase 4 smoke test query (38-57 claims per ADR-referenced symbol; latency 0.04-0.70ms sub-100ms invariant verified); substrate-consistency between state-detection ADR count (19) and extraction prose discovery (26 = 19 ADRs + 7 doc-bucket) empirically verified |

#### 4-phase verification results

- **Phase 1 — Install & init.** `node dist/index.js init` against existing `.contextatlas.yml` reports `init: existing config preserved` with no misleading languages payload (FO-3 fix empirically verified). Extraction exit code 2 expected — orthogonal to Phase 1 scope (ANTHROPIC_API_KEY env var initially not set; Phase 1 closes before reaching that path).

- **Phase 2 — Doctor.** `node dist/index.js doctor` reports 25 PASS / 4 WARN / 0 FAIL pre-extraction → 26 PASS / 3 WARN / 0 FAIL post-extraction (after Phase 3 refreshed atlas at HEAD). Substantive WARN improvements: `state-detection.adrs.count` reports `19 ADR(s) detected` (FO-2 fix verified — pre-fix this surfaced `0 ADRs matching pattern` WARN); atlas SHA-vs-HEAD consistency restored. Remaining post-extraction WARN is ANTHROPIC_API_KEY-not-set advisory (orthogonal informational; not launch-blocking).

- **Phase 3 — Index (CLI Mode B).** `node dist/index.js index --verbose` executed by Travis with API key set in PowerShell session per Option (ii) execution cadence lock. Substantive outcomes:
  - **files_extracted=5** (3 changed + 2 added) + **files_unchanged=21** + **files_deleted=56** (95-commit-gap cleanup)
  - **claims_written=130** (new); **claims total in atlas=512**; **symbols=1002**; **claim-symbol links=1595**; **distinct symbols with claims=104**
  - **unresolved_candidates=63** (3 ADRs + 2 docs); mostly path refs + MCP tool names + external package refs — non-blocking per ADR-authoring-validation discipline
  - **unresolved_frontmatter_hints=4** (ADR-02 `ExtractionPipeline`; ADR-19 `judgeClient` / `rubricPrompt` / `anonymizeOutput`) — author-intent placeholders for concepts not yet implemented as literal TS symbols; non-blocking
  - **wall_clock_ms=113568** (~113 sec for 19-ADR + 84-source-file substrate); **api_calls=5** (cache-friendly); **cost_usd=$0.8824** script-reported full pricing; platform-billed will be ~$0.30-0.50 with prompt-cache discount
  - **extracted_at_sha=`40d8b77f...`** matches HEAD (Step 2.1.a commit); **atlas_exported=true**; **extraction_errors=0**

- **Phase 4 — Smoke test query.** Throwaway smoke test script (`scripts/phase4-smoke-test.mjs`; deleted post-verification per honest-scope) invoked `buildBundle()` against `.contextatlas/index.db` in atlas-only-mode for 6 target symbols. Substantive outcomes:
  - **atlas-only-mode active** (atlas SHA matches HEAD; no LSP spawn needed for intent-only signal)
  - **Latency 0.04-0.70ms** across 6 symbols — well under sub-100ms ADR-02 query-time invariant (~140-2500× margin)
  - **Substantive bundles returned**: `buildBundle` 38 claims; `LanguageAdapter` 57 claims; `TypeScriptAdapter` 25 claims; sample claim severity=`hard` with substantive ADR-derived text
  - **Symbol resolution** working at production surface (TS adapter symbol-id resolution matches DB claim-symbol link symbol_id format `sym:ts:<path>:<name>` per ADR-01)

#### Substrate-consistency empirical verification

Post-Step-2.1.a FO-2 fix verified end-to-end at production surface. **State-detection ADR count (19) = Extraction ADR-bucket count (19)** through shared `enumerateAdrFiles()` module from `src/utils/adr-enumeration.ts`. Total prose discovery breakdown:

- ADR bucket (19 files): 19 ADR-NN-name.md files matching Scope γ' regex (Nygard / ADR-NN / Date conventions × .md / .rst extensions)
- Doc bucket (7 files): README.md + DESIGN.md + RUBRIC.md at repo root + 3 probe-findings.md files under docs/adr/ (correctly classified as doc-bucket per FO-2 fix; non-conforming basenames fall through to `docs/**/*.md` glob) + ~1 misc doc

Pre-Step-2.1.a divergence (state-detection regex `^\d{4}-.*\.md$` reported 0 against ADR-NN convention while extraction permissively accepted ANY `.md` including probe-findings) eliminated at source. The single shared enumeration module is the substrate-consistency invariant per FO-2 fix architecture.

#### cost_model field verification

Per Step 1.5 honest-scope acknowledgment: `cost_model` field is set on runtime `ExtractionResult` per Q1.0.5 δ at the Strategy-pattern boundary (covered by `factory.test.ts` + `extractors/*.test.ts` unit tests at 1353/1353 PASS). The field is NOT surfaced by the CLI summary line OR persisted to atlas.json (atlas.json metadata persistence DEFERRED to v0.8+ per Step 1.5 GAP). End-to-end Q1.0.5 δ runtime verification is implicit via passing tests; production CLI surface doesn't expose it. v0.7 ship-gate Step 5.5 absorbed-item annotation captures this gap with v0.8+ forward-pointer.

#### Friction observations + 3-bucket triage outcome (Step 2.1)

Per Q2.0.3 lock — 3-bucket friction-observation triage protocol applied at Step 2.1 verification surface:

- **launch-blocking-fix-now bucket** (4 items, all absorbed at Step 2.1.a commit `40d8b77`):
  - FO-1 (USAGE constant drift)
  - FO-2 (state-detection vs extraction ADR enumeration divergence)
  - FO-3 (init log misleading languages payload)
  - Plus Scope γ' multi-format substrate + reference-context feature scope expansion (substantively new launch scope from Travis FIRST/SECOND/THIRD reframes; absorbed inline at Step 2.1.a per Option A)

- **v0.8+ candidate bucket** (1 item):
  - cost_model atlas.json metadata persistence GAP (Q1.0.5 δ pre-registered for v0.8+ per Step 1.5 honest-scope acknowledgment; carried-forward to v0.7 ship-gate Step 5.5 absorbed-item annotation with v0.8+ forward-pointer)

- **honest-scope-acknowledgment bucket** (0 items new at Step 2.1; existing acknowledgments inherited from earlier substeps preserved)

#### 14th cycle-execution observation class captured per Travis Step 2.1.a lock

**14th class — Estimate-vs-empirical-scope-divergence handling at substantive interpretive work.** When implementation work emerges from substantive interpretive scope (parser implementation; prompt engineering; novel architectural primitives), empirical implementation cost may diverge from pre-implementation scope estimate. Bounded over-estimate (35-80%) reflects honest implementation discipline + warrants acceptance with commit-body acknowledgment of cost-vs-estimate divergence (substantive interpretive work has inherent estimate uncertainty). Catastrophic over-estimate (3-5×+) signals substantive scope misjudgment + warrants rescope condition trigger per Q-pre-4 substrate-evolution drift framework. Discipline: estimate cost-vs-empirical accuracy as cycle-execution metadata; track per-substep at progress log; surface bounded acceptance vs catastrophic rescope at trigger moment via inline adjudication.

Substantive distinction from class 10 (substrate-verification-at-each-substep-boundary):
- Class 10: correctness verification (does substrate behave as expected?)
- Class 14: scope-accuracy verification (does work cost match estimate?)
- Different signal sources; different recovery mechanisms; substantive composition (both apply at substep boundaries; serve different verification purposes)

Empirical anchor at v0.7 cycle: Step 2.1.a rST parser at ~270 LOC vs ~150-200 LOC estimate (35-80% bounded over-estimate; accepted with commit-body acknowledgment per Step 2.1.a commit `40d8b77`).

Composes with 13-class enumeration captured through Step 2.1.a = **14-class enumeration at Step 2.1 close** for v0.7 ship-gate working-content-gap-inventory + v0.8+ inheritance.

#### Step 2.1 unblock — Step 2.2 Rich cold-start verification cluster

Step 2.2 cluster unblocked:
- **Step 2.2.a** generate-adrs feature implementation (CLI subcommand + Skills surface + tests + reference-context feature per Step 2.1.a amendment + Q2.2.a.1-Q2.2.a.4 pre-registered adjudications + GENERATE_ADRS_PROMPT canonical prompt drafting at Step 2.2.a surface)
- **Step 2.2.b.i** Pure cold-start: Rich without reference context
- **Step 2.2.b.ii** Reference-context-aided: Rich with `django/deps` reference context

---

### Step 2.1.a shipped — 2026-05-11 (FO-1 + FO-2 + FO-3 friction-observation fixes + Scope γ' multi-format substrate + v0.7-SCOPE.md amendment per Option A inline + 13th cycle-execution observation class)

V0.7 Step 2.1.a ships FO fixes + Scope γ' multi-format substrate (.md + .rst + 3 naming conventions + unified `src/utils/adr-enumeration.ts` module consumed by both state-detection + extraction code paths + custom subset `src/parsing/rst-parser.ts` parser) + v0.7-SCOPE.md amendment per Option A inline (reference-context feature scope expansion + user-configured-root scope framing + status-subdirectory lifecycle v0.8+ deferral). 13th cycle-execution observation class captured + refinement to class 10 (substrate-verification-at-each-substep-boundary). 1353/1353 tests PASS clean.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 2.1.a FO fixes + Scope γ' substrate + amendment | main | [this commit] | FO-1 (USAGE constant + substrate-consistency regression test) + FO-2 (unified ADR enumeration module + multi-format support) + FO-3 (init log differentiation per Option ii) + Scope γ' multi-format substrate + rST parser custom subset (Approach b) + v0.7-SCOPE.md amendment per Option A inline (9-section + 3 new §6 risks + §7.3' substrate locks + §8 #17/#18 + §10 condition #9 with 3-tier fallback) + STEP-PLAN-V0.7.md Step 2.1.a entry + 13th observation class + class 10 refinement |

#### Friction observations + fixes

- **FO-1 — USAGE constant drift artifact from Step 1.4b.** `show-prompt` was added to `KNOWN_SUBCOMMANDS` array at Step 1.4b but the USAGE string at `src/cli-args.ts:182-186` wasn't updated alongside. Fix: USAGE constant rebuilt from `KNOWN_SUBCOMMANDS.join("|")` so substrate-consistency is structurally guaranteed. Regression test in `cli-args.test.ts` asserts USAGE-vs-KNOWN_SUBCOMMANDS substrate-consistency invariant. Launch-blocking-fix-now triage.

- **FO-2 — State-detection vs extraction ADR enumeration divergence.** State-detection used a hard-coded Nygard-only regex `^\d{4}-.*\.md$` (`src/doctor/checks/state-detection.ts:81`); extraction file-walker used permissive `.md`-extension-only filter (`src/extraction/file-walker.ts:216-240`). Doctor reported 0 ADRs against this repo's `ADR-NN-name.md` convention while extraction extracted 22 .md files (including probe-findings notes). Fix: new unified `src/utils/adr-enumeration.ts` module consumed by both code paths; multi-naming regex (Nygard + ADR-NN + Date with trailing `-name` optional) × multi-extension (.md + .rst); recursive walk capped at depth 2 for legitimate sub-organization. Non-conforming `.md` files (probe-findings.md, README.md inside `docs/adr/`) fall through to docs-bucket via `docs/**/*.md` glob — substrate preserved at extraction surface, classification improved (probe-findings classified as "doc" not "adr"). Launch-blocking-fix-now triage.

- **FO-3 — init log "existing config preserved" misleading payload.** `src/init/runner.ts:212` emitted `{languages: [...languages], observability: ...}` payload after preserved-config log line — but `languages` here is filesystem-DETECTED list, not preserved-config-derived. Fix per Option (ii) lock: differentiate `created` path (logs detected languages — current behavior preserved) vs `preserved` path (drops misleading `languages` field; emits status-only message). Launch-blocking-fix-now triage.

#### Scope γ' multi-format substrate

- **Unified ADR enumeration:** `src/utils/adr-enumeration.ts` exports `enumerateAdrFiles(adrDir)` consumed by both `src/doctor/checks/state-detection.ts` + `src/extraction/file-walker.ts`. Eliminates FO-2 divergence at substrate level.

- **Multi-naming regex:** 3 patterns covering Nygard (`0001-name.md|rst`), ADR-NN (`ADR-01-name.md|rst`), Date (`2026-05-11-name.md|rst`); trailing `-name` suffix optional (refined during fixture-rename surface review to cover real-world short forms like `ADR-01.md`).

- **Multi-extension:** `.md` + `.rst` with extension-based format dispatch in pipeline; YAML frontmatter `:symbols:` field for `.md`; rST field-list `:symbols:` field for `.rst`.

- **rST parser custom subset (Approach b):** `src/parsing/rst-parser.ts` ~270 LOC parser + ~150 LOC test fixtures. Supports title detection (overline + underline + underline-only forms), field-list metadata, section headers via adornment-hierarchy (first-occurrence-in-document character → level), plain-text content within sections, inline hyperlinks (\`text <url>\`__ → "text (url)"). NOT supported: rST directives, substitutions, footnotes, tables, transition lines. Primary v0.7 consumer: `parseRstSymbols` mirror of `parseFrontmatterSymbols`. Secondary v0.7+ consumer: `parseRst` structured output for generate-adrs reference-context at Step 2.2.a.

- **Recursive depth-2 walk:** Covers legitimate sub-organization within user-configured ADR root. Cap at 2 prevents unbounded walks. Travis mid-cycle clarification: depth-2 walk handles flat-OR-single-subdirectory organization; does NOT reason about status-subdirectory lifecycle semantics (v0.8+ scope).

#### Test coverage outcome

1353/1353 tests PASS clean. Net +30 tests vs 1323 v0.6 baseline:
- adr-enumeration.test.ts: 11 tests (predicate + walker + fixture combinations)
- rst-parser.test.ts: 12 tests (parseRstSymbols + parseRst across title/field/sections/hyperlinks/empty/unsupported)
- cli-args.test.ts: 2 tests (USAGE substrate-consistency regression)
- Test fixtures renamed across pipeline.test.ts + cli-runner.test.ts + file-walker.test.ts to canonical naming (ADR-101 / ADR-201 / ADR-71/72 / ADR-401/402 / ADR-310/311/312 / ADR-321/322 / ADR-50/51 — all matching ADR-\d+ pattern). Mechanical rename per Scope γ' substrate enforcement.

#### v0.7-SCOPE.md amendment scope (Option A inline)

- **§2 PRIMARY (a) extraction Scope boundaries** — user-configured-root scope-boundary added
- **§2 PRIMARY (b) generate-adrs** — Scope bullets extended (reference-context feature + Scope γ' multi-format substrate); Scope boundaries extended (AsciiDoc/plain-text v0.8+ deferral + reference-context token budget management adjud at Step 2.2.a inline + status-subdirectory lifecycle v0.8+ deferral with full v0.8+ scope framing)
- **§5 substep ladder Step 2** — Step 2.1.a added; Step 2.2.b expanded to b.i + b.ii cluster
- **§6 Risks** — 3 new risk subsections added: multi-format ADR extraction surface regressions; reference-context feature token budget challenges; status-subdirectory misuse at v0.7 launch
- **§7 §7.3'** — Step 2.1.a substrate locks subsection + user-configured-root vs status-subdirectory-reasoning distinction + 13th observation class + class 10 refinement
- **§8 Success criteria** — criteria #17 (multi-format substrate) + #18 (reference-context-aided generate-adrs); closing sentence "All sixteen criteria" → "All eighteen criteria"
- **§9 Cost framing** — generate-adrs row revised (incl. reference-context); cumulative estimate ~$25-70 → ~$30-80
- **§10 Rescope conditions** — condition #9 added with 3-tier severity-gradient fallback paths (cumulative fallback OR split fallback per single-failure-mode signal — (9a) token budget failures only / (9b) rST coverage gap failures only)
- **§Revision history** — 2026-05-11 amendment entry with TL;DR prefix + FIRST/SECOND/THIRD reframe distinction per Refinement 2

#### Travis substantive reframes (3 distinct at Step 2.1.a)

- **FIRST (at FO-2 surface):** Multi-format support combined with multi-naming conventions = low-hanging v0.7 feature. Scope γ original .md-only → Scope γ' .md + .rst.
- **SECOND (substantively distinct):** Reference-context-aided generate-adrs bridges heterogeneous real-world documentation to canonical ContextAtlas-format ADRs. Solves "we can't support every format directly" by turning it into a migration-path feature.
- **THIRD (mid-cycle review at amendment in-flight):** Status-subdirectory lifecycle semantics ≠ directory-organization-preference. User-configured-root scope at v0.7 launch; status-subdirectory lifecycle reasoning v0.8+ scope.

#### 13th cycle-execution observation class + class 10 refinement

**13th class — scope-constraint friction signals feature opportunity.** Step 2.1 surfaced ADR format variability (FO-2) as constraint friction; Travis reframe surfaced feature opportunity (reference-context-aided generate-adrs). Generalizable pattern: when scope friction surfaces, ask whether it signals (a) substantive scope problem needing rescope OR (b) feature opportunity needing scope expansion in a different direction.

**Class 10 refinement — substrate-verification-at-each-substep-boundary.** Mid-cycle review surfaced status-subdirectory semantic distinction that could have produced silent extraction failures against status-organized repos. Sub-pattern: when an implementation surface (recursive depth-2 walk) seems to handle a pattern (status-subdirectory organization) syntactically, verify semantic implications match user intent. "Walks the directory" ≠ "extracts the right substrate." Captured as refinement to class 10 rather than new 14th class to avoid class proliferation; either framing substantively equivalent.

#### Q-pre-4 Path A pre-state amendment discipline applied

Amendment lands BEFORE substantive Step 2.2.a generate-adrs implementation begins against superseded scope. Single commit batches FO fixes + Scope γ' substrate + scope amendment per Option A — refined scope emerged AT Step 2.1.a surface; FO-2 fix substantively requires multi-format substrate; amendment captures the substrate that FO-2 fix enables; cleanest audit trail showing causal chain (substrate observation → scope reframe → fix implementation in one commit boundary).

#### Step 2.1.a unblock — Step 2.1 Phase 3 + 4 execution

Phase 1 + Phase 2 verification PASS at Step 2.1.a re-verify:
- Phase 1: `node dist/index.js init` against existing `.contextatlas.yml` reports `init: existing config preserved` (FO-3 fix verified — no misleading languages payload).
- Phase 2: `node dist/index.js doctor` reports 26 PASS / 3 WARN / 0 FAIL — improved from 25/4/0 pre-Step-2.1.a (FO-2 fix verified — `state-detection.adrs.count` now reports `19 ADR(s) detected` instead of `0 ADRs matching pattern` WARN; 3 remaining WARNs are atlas-stale-SHA + ANTHROPIC_API_KEY-not-set + git-atlas-consistent which are orthogonal).

Phase 3 + 4 execution pending Travis setting `ANTHROPIC_API_KEY` in shell environment + running `node dist/index.js index` per locked Phase 3 + 4 execution cadence after Step 2.1.a push.

---

### Step 2.0.1 shipped — 2026-05-10 (v0.7-SCOPE.md amendment per Option B lock + Q-pre-4 Path A pre-state amendment framework)

V0.7 Step 2.0.1 ships v0.7-SCOPE.md amendment commit capturing
substantive Path 1 scope expansion locked at Step 2.0 (commit
`d52d42c`): generate-adrs feature added to v0.7 PRIMARY scope at
both CLI + Skills surfaces per Path-3 entry-point-determined
architecture inheritance. Q-pre-4 Path A pre-state amendment
framework applied — amendment lands BEFORE substantive Step 2.1+
work begins against superseded scope; preserves audit trail
integrity per substrate-evolution drift discipline.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 2.0.1 v0.7-SCOPE.md amendment | main | [this commit] | 9-section amendment per Option B lock: §2 + §4 + §5 + §6 + §7 + §8 + §9 + §10 + §Revision history; PRIMARY (a) extraction + PRIMARY (b) generate-adrs dual-subsection framing; SECONDARY 3-repo → 2-repo narrative; §7.3' shipped-locks subsection preserves §7.3 deferred-questions as historical record; 3 substantive refinements applied (§6 + §10 + §Revision history) |

#### Amendment scope summary

- **§2 PRIMARY subsections** — PRIMARY (a) extraction renamed for disambiguation; PRIMARY (b) generate-adrs new subsection inserted; SECONDARY narrative 3-repo → 2-repo per Q2.0.1 lock
- **§4 Item-level descriptions** — generate-adrs implementation detail subsection added
- **§5 Substep ladder** — Step 2 entry revised to 6-substep cluster ladder per Q2.0.4; Step 2.0.1 amendment substep explicit
- **§6 Risks** — generate-adrs scope creep risk + mitigation added (Refinement 1: calibration-scope-difference explicit at v0.7-ship-bearing-cycle iteration scope, not v0.1-v0.5 multi-cycle scope)
- **§7 Ambiguity adjudications** — new §7.3' shipped-locks subsection captures Q2.0.1-Q2.0.4 + Q2.0.X + Q2.2.a.1-Q2.2.a.4 (Q-pre-4 Path A: preserves §7.3 deferred-questions as historical record)
- **§8 Success criteria** — criteria #15 + #16 added (generate-adrs functional + CLI-vs-Skill equivalence); closing sentence "All fourteen criteria" → "All sixteen criteria"
- **§9 Cost framing** — generate-adrs row added; SECONDARY 3-repo → 2-repo; cumulative estimate ~$15-50 → ~$25-70
- **§10 Rescope conditions** — condition #8 (generate-adrs scope creep) added (Refinement 2: 3-tier severity-gradient fallback paths — (a) Path 3 fallback Skills-only deferral / (b) full calibration deferral / (c) full feature deferral)
- **§Revision history** — 2026-05-10 amendment entry with full scope summary (Refinement 3: TL;DR prefix opener)

#### Refinement applications (per discipline #3 cadence)

3 substantive refinement passes applied at v0.7-SCOPE.md amendment surface before commit per discipline #3 cadence applied to substantive interpretive scope-doc amendments:

- **Refinement 1 (§6)** — Mitigation language captures calibration-scope-difference explicit framing: v0.7-ship-bearing-cycle iteration scope (Step 2.2.a substantive interpretive work + Step 2.2.b empirical verification) ≠ v0.1-v0.5 multi-cycle prompt iteration scope. Prevents reader-expectation creep toward equivalent rigor.
- **Refinement 2 (§10)** — Rescope condition #8 trigger thresholds explicit (~2 substantive iteration cycles beyond ~1-2 day estimate; OR Generator interface diverges from locked Strategy primitives) + 3-tier severity-gradient fallback paths (a) Path 3 Skills-only deferral / (b) full calibration deferral / (c) full feature deferral. Travis adjudication required at trigger moment.
- **Refinement 3 (§Revision history)** — TL;DR prefix added before existing detailed 2026-05-10 entry narrative. Reader-friendly opener; detailed paragraph follows as full context.

#### Q-pre-4 Path A pre-state amendment discipline applied

Amendment lands BEFORE substantive Step 2.1+ work begins against superseded (3-repo, extraction-only PRIMARY) scope. Preserves audit trail — scope-doc reflects current substrate per cycle execution; superseded pre-state scope captured as historical record via §7.3 preservation (deferred-questions snapshot at pre-amendment substrate) + §Revision history 2026-05-10 entry (substantive rationale + scope-shift narrative).

#### Cycle-execution observation — discipline #3 cadence working as designed at scope-doc amendment surface

3 substantive refinement passes applied at v0.7-SCOPE.md amendment surface (§6 + §10 + §Revision history) before commit. Matches discipline #3 cadence applied to substantive interpretive scope-doc amendments. Dev surfaced amendment text inline before commit; Travis review surfaced 3 refinements; dev applied refinements + commits. Clean cycle-execution discipline precedent for v0.8+ scope-doc amendment cadence inheritance. Composes with existing 12-class enumeration (substrate-evolution drift + discipline #3 cadence + Q-pre-4 Path A pre-state amendment framework working as designed at substantive scope expansion moment); no new observation class required.

#### Step 2.0.1 unblock — Step 2.1 ContextAtlas-on-itself verification

Step 2.1 unblocked. Operational baseline 4-phase protocol verification begins next: install & init + doctor + index CLI Mode B + smoke test query against `C:/CodeWork/contextatlas` (33 ADRs; operational baseline; regression-test gate per Q2.0.2 SECONDARY closure criteria).

---

### Step 2.0 shipped — 2026-05-10 (Step 2 SECONDARY design adjudications + Path 1 generate-adrs scope expansion to v0.7 PRIMARY)

V0.7 Step 2.0 ships Step 2 SECONDARY design adjudications per
Step N.0 cadence convention inheritance from v0.6 + Step 1.
**Substantive Path 1 scope expansion locked** at Step 2.0
design surface per Travis adjudication: generate-adrs feature
added to v0.7 PRIMARY scope at both CLI + Skills surfaces (Path-3
entry-point-determined architecture inheritance). v0.7-SCOPE.md
amendment captured via Q-pre-4 Path A pre-state amendment
framework at separate Step 2.0.1 commit (Option B lock; cleanest
audit trail).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 2.0 design adjudications | main | [this commit] | Q2.0.1-Q2.0.4 + Q2.0.X locks captured; 2-repo target firm (ContextAtlas-on-itself + Rich; 3rd slot dropped per honest-scope); Path 1 generate-adrs scope expansion to v0.7 PRIMARY; 6-substep ladder revised; Q2.2.a.1-Q2.2.a.4 pre-registered for Step 2.2.a; v0.7-SCOPE.md amendment deferred to Step 2.0.1 separate commit per Option B |

#### Q2.0.1 lock — 2-repo target firm + 3rd slot dropped

**Slot 1 — ContextAtlas-on-itself dogfood.** `C:/CodeWork/contextatlas`. Operational baseline; 33 ADRs; verifies extraction-given-substrate path. No additional selection needed.

**Slot 2 — Rich (Textualize/rich).** Medium Python codebase + no formal ADRs + rich docstrings + clean architecture; not used at v0.6 Stream B; verifies cold-start path (generate-adrs → extraction end-to-end). Alternative candidates if Rich doesn't fit at Step 2.2 entry: Typer OR Pydantic. Travis browse + final confirmation at Step 2.2 entry.

**Slot 3 — DROPPED.** Travis personal project + larger third repo deferred to v0.8+ post-launch cycle per honest-scope-acknowledgment. v0.7 SECONDARY ships 2-repo verification scope.

#### Q2.0.2 lock — 4-phase verification protocol per dev draft

LOCK per dev recommendation:
- **Phase 1 Install & init**: fresh checkout + install + `contextatlas init` + UX gap capture
- **Phase 2 Doctor**: `contextatlas doctor` deep LSP health check + config validation pass criteria
- **Phase 3 Index (CLI Mode B)**: `contextatlas index` Anthropic API direct + extraction error capture + cost vs cost-priors comparison
- **Phase 4 Smoke test query**: MCP tool invocation against atlas + query latency + result quality

SECONDARY closure criteria: all repos complete Phases 1-4 without launch-blocking errors; ContextAtlas-on-itself MUST complete cleanly (operational baseline; regression-test gate); ≥1 of 2 repos clean acceptable (other repo friction tolerable IF documented as v0.8+ candidate per Q2.0.3).

#### Q2.0.3 lock — 3-bucket friction-observation triage protocol per dev draft

LOCK 3-bucket triage:
- **Launch-blocking-fix-now**: user-trust impact at v1.0 launch + small fix scope (~50-100 LOC + tests) + actionable → fix inline at Step 2.X verification substep + regression test
- **v0.8+ candidate**: non-launch-blocking + valid feedback + larger scope OR design-question → document at v0_8-HANDOFF.md (drafted at Step 4 cycle-close per v0.6→v0.7 inheritance pattern)
- **Honest-scope-acknowledgment**: limitation discovered + not fixable in v0.7 scope + worth user-facing documentation → update relevant doc (README "Known Limitations" OR DESIGN.md OR ADR amendment); ship with explicit acknowledgment per discipline #4

Triage discipline at Step 2 substep boundary: each substep close enumerates surfaced issues + bucket assignments + dispositions.

#### Q2.0.4 lock — 6-substep ladder per Path 1 scope expansion

LOCK 6-substep ladder revised per Path 1 scope expansion:
- 2.0 design (this substep)
- 2.1 ContextAtlas-on-itself verification (operational baseline)
- 2.2 Rich cold-start verification cluster (2.2.a generate-adrs feature implementation + 2.2.b cold-start verification using just-implemented feature)
- 2.3 CLI-vs-Skill extraction equivalence verification per Q2.0.X
- 2.4 CLI-vs-Skill generate-adrs equivalence verification (NEW per Path 1)
- 2.5 Step 2 close

Substep cluster framing for 2.2 (2.2.a + 2.2.b) preserves numbering without re-numbering ladder. Q-pre-4 Path A pre-state amendment framework applies — substep ladder shape shift BEFORE substantive Step 2.1+ work shipped against old scope.

#### Q2.0.X lock — CLI-vs-Skill extraction equivalence verification protocol per dev draft

LOCK per dev (a)-(d) recommendation:
- **(a) Equivalence-enough criteria**: structural-match-first (≥99% per-claim schema compliance) + claim-text-fuzzy (Levenshtein ≤30% word-diff OR cosine similarity ≥0.7) + claim-count sanity-check (±25% per source doc)
- **(b) Stochastic variance**: n=2 trials per surface per target repo; paired comparison
- **(c) Discrepancy triage**: substantive disagreement → investigate root cause; minor wording → accept-as-noise; path-specific failure modes → honest-scope-acknowledgment documentation
- **(d) Launch-doc framing**: "Both surfaces produce equivalent atlas.json at [X]% structural-match rate" grounded in empirical verification; capability-gaps per surface documented honestly

Methodology inheritance from v0.6 F1 atlas-substrate-version control discipline: comparison MUST hold atlas substrate version constant (paired same-source-doc extractions); not pre-existing atlas-version comparisons.

#### SUBSTANTIVE Path 1 scope expansion — generate-adrs to v0.7 PRIMARY

Per Travis adjudication at Step 2.0 design surface: generate-adrs feature added to v0.7 PRIMARY scope at BOTH surfaces (Path 1 Option C):
- **CLI surface**: `contextatlas generate-adrs` subcommand (Anthropic API direct generation; pay-per-use cost model)
- **Claude Code Skills surface**: `/generate-adrs` slash command (`.claude/skills/generate-adrs/SKILL.md`; subscription-bounded generation; subscription-bounded cost model)

Architectural framing: generate-adrs follows Path-3 entry-point-determined architecture established at Step 1.4b. Two entry points; each uses appropriate cost model for invocation context. Parallel feature to extraction; same architectural primitives (Strategy pattern + Path-γ CLI prompt subcommand + Skills mechanism) apply.

**Substantive rationale for scope expansion**: Real users at v1.0 launch will mostly NOT have ADRs in their codebases. ContextAtlas without ADR-generation tooling is incomplete for the launch user journey. Step 2 SECONDARY empirical verification surfaced the gap at design surface (cold-start path consideration); scope expansion BEFORE substantive Step 2 work shipped honors Q-pre-4 Path A pre-state amendment framework.

Prompt-engineering substantive work at Step 2.2.a generate-adrs implementation: GENERATE_ADRS_PROMPT canonical prompt development is substantive interpretive work (matches /index-atlas SKILL.md content surface pattern at Step 1.4b). Prompt drafted inline at Step 2.2.a surface for Travis review per discipline #3 cadence.

#### Q2.2.a.1-Q2.2.a.4 pre-registered for Step 2.2.a implementation surface

**Q2.2.a.1 — Module organization for generate-adrs feature:**
- (α) NEW `src/generation/` directory parallel to `src/extraction/` — clean architectural separation; future generation-related features have natural home
- (β) Extend `src/extraction/` to include generation-mode — single Strategy interface; mode field distinguishes
- (γ) Skills-only at v0.7; CLI surface deferred OR minimal
- **Dev lean (α)** per Strategy pattern factory clean separation precedent

**Q2.2.a.2 — Path-γ CLI subcommand for generate-adrs prompt loading:**
- Mirror `cli-show-prompt` subcommand pattern: `contextatlas show-generate-prompt` outputs GENERATE_ADRS_PROMPT canonical constant
- SKILL.md at `.claude/skills/generate-adrs/SKILL.md` invokes `` !`contextatlas show-generate-prompt` `` for prompt loading
- **Dev lean (locked)** per Path-γ architectural pattern from Step 1.4b

**Q2.2.a.3 — Strategy pattern reuse vs parallel:**
- (α) Reuse existing Extractor interface; concrete extractors handle both extraction + generation via mode field
- (β) Parallel Generator interface + AnthropicAPIDirectGenerator + ClaudeCodeOnlyGenerator concrete implementations
- (γ) Generator extends Extractor interface (inheritance)
- **Dev lean (β) parallel interface.** Cleaner separation; extraction != generation semantically; reuse via factory pattern (shared CLI subcommand dispatch infrastructure) without forcing single interface to cover both feature scopes

**Q2.2.a.4 — Existing v0.6 substrate verified at Step 2.0**: No `research/prompts/` directory exists. EXTRACTION_PROMPT lives at `src/extraction/prompt.ts`. Generate-adrs follows same pattern: GENERATE_ADRS_PROMPT at `src/generation/prompt.ts` per Q2.2.a.1 lean α. No existing prompt-related infrastructure to reuse; clean greenfield at Step 2.2.a implementation.

#### v0.7-SCOPE.md amendment cadence — Option B lock

LOCK Option B: separate v0.7-SCOPE.md amendment commit at Step 2.0.1 (after Step 2.0 design adjudications + BEFORE Step 2.1 work begins). Cleanest audit trail; substantively significant PRIMARY scope expansion warrants dedicated commit per discipline #3 cadence applied to scope-doc amendments. Matches v0.6 Step 8.2 v0_7-HANDOFF.md amendment pattern (Path α handoff inheritance).

v0.7-SCOPE.md amendment scope at Step 2.0.1:
- §2 PRIMARY scope: add generate-adrs feature alongside extraction-via-Skills (both share Path-3 entry-point-determined architecture)
- §4 Item-level descriptions: add generate-adrs CLI + Skills implementation detail
- §5 Substep ladder: Step 2 SECONDARY ladder revised per Q2.0.4 6-substep lock
- §6 Risks: add risk for generate-adrs cold-start scope creep + prompt-engineering complexity
- §7 Ambiguity adjudications: capture Path 1 lock + generate-adrs architectural pattern follow-on
- §8 Success criteria: add generate-adrs functional criterion + 2-surface equivalence criterion
- §9 Cost framing: revise envelope estimate for generate-adrs additional work (~$10-20 additional cost at SECONDARY verification phase)
- §10 Rescope conditions: add generate-adrs scope creep trigger
- §Revision history: 2026-05-10 entry capturing Path 1 scope expansion rationale + empirical-signal-deferral-rejected framing + Travis adjudication record

ADR-02 minor refinement OR separate amendment captures generate-adrs as research-time / index-time pipeline parallel to extraction; both honor query-time-no-API-calls invariant; Permitted-modules invariant covers both `src/extraction/` + `src/generation/` (or whichever module organization emerges at Step 2.2.a implementation phase per Q2.2.a.1 lock).

#### Cycle-execution observation 12 — empirical-signal-deferral pattern requires verification protocol that actually exercises the scope-in-question

NEW 12th recursive catch-pattern observation class. Step 2.0 surfaced Path 4 (defer generate-adrs scope decision to Step 2 empirical signal) as adjudication option. Analysis revealed Path 4 doesn't generate informative signal without changing Step 2.2 target repo to cold-start path (a repo with ADRs verifies extraction-given-substrate, not generate-adrs need; deferring to such verification generates uninformative signal about the deferred decision).

**Generalizable v0.7+ inheritance pattern:** when considering "defer scope decision to empirical signal" path, verify the verification protocol actually generates the signal needed to make the decision. If verification target doesn't exercise the scope-in-question, empirical signal is uninformative; commit-now or revise verification protocol to generate signal.

Composes with 11-class observation enumeration from Step 1.6 close = **12-class enumeration at Step 2.0 entry** for v0.7+ ship gate working-content-gap-inventory + v0.8+ inheritance.

#### Step 2.0 unblock — Step 2.0.1 v0.7-SCOPE.md amendment commit

Step 2.0.1 (v0.7-SCOPE.md amendment per Option B lock) unblocked. Substantive scope-doc amendment captures Path 1 scope expansion + Step 2 substep ladder revision + envelope expansion + Q2.2.a.1-Q2.2.a.4 pre-registration substrate.

After Step 2.0.1 commit + push, Step 2.1 ContextAtlas-on-itself verification work begins (operational baseline; 4-phase protocol; gate before Step 2.2 cold-start verification).

---

### Step 1.6 shipped — 2026-05-10 (Step 1 PRIMARY scope close + Step 2 SECONDARY unblock)

V0.7 Step 1 PRIMARY scope substantively complete. 8-substep
ladder shipped (1.0/1.1/1.2/1.3/1.4a/1.4b/1.5/1.6) per Path A
pre-state amendments captured along the way (1.4 → 1.4a + 1.4b
split at Step 1.4a; Path-3 entry-point-determined reframe at
Step 1.4b superseded Step 1.2 + 1.4a config-field user-choice
framing as historical record per Q-pre-4 substrate-evolution
drift framework Path C). 1323/1323 tests PASS; npm run build
clean; v0.7 PRIMARY scope substantively delivered.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 1.6 Step 1 close | main | [this commit] | Cumulative Step 1 PRIMARY scope outcome captured; cost_model persistence gap pre-registered for v0.7 ship gate Step 5.5 + v0_8-HANDOFF.md substrate; Step 2 SECONDARY 3-repo install/setup verification unblocked |

#### Step 1 PRIMARY scope cumulative outcome

Substantive deliverables shipped across 8 substeps:

1. **Design adjudications + interface foundation** (Step 1.0 +
   Step 1.3):
   - Step 1.0 design adjudications: Q1.0.1-Q1.0.12 locks + 2
     refinements (Q1.0.8 γ-2 soft deprecation + Q1.0.9 7-substep
     ladder gate-substep refinement). 7-substep ladder later
     amended to 8-substep via Path A pre-state amendment at Step
     1.4a (Q-pre-4 substrate-evolution drift framework).
   - Step 1.3 Strategy pattern wrapper module skeleton (Extractor
     interface + 2 concrete implementations + factory + 5 NEW
     test files; ~600 LOC + 13 new tests). Architectural insight
     surfaced: 2-level Strategy pattern (per-cycle Extractor
     above per-document ExtractionClient).

2. **Q1.0.2 verification gate-substep** (Step 1.1):
   - Claude Code session context API surface verification cleared
     cleanly (Outcome A); α Skills + β Slash Commands architecture
     shape locked; canonical `.claude/skills/index-atlas/SKILL.md`
     location locked; γ + δ shapes architecturally incompatible
     ruled out at verification time.

3. **ADR-02 graduation reframe — twice** (Step 1.2 + Step 1.4b):
   - Step 1.2 first amendment: substantive graduation reframe
     (research-cycle SOLE-CALLER invariant → v0.7+ production-
     cycle user-choice configuration; Path (iii) 2-mode collapse
     + 1 legacy alias). PRESERVED AS HISTORICAL RECORD per Path C
     framework.
   - Step 1.4b re-amendment: Path-3 entry-point-determined model
     supersedes Step 1.2 framing. CLI-cannot-bridge-to-Skills
     architectural reality surfaced at Step 1.4b implementation;
     reframe captures honest production-tool architecture (CLI =
     API direct; /index-atlas skill = subscription-bounded; user
     chooses surface, surface determines cost model).

4. **AnthropicAPIDirectExtractor full implementation** (Step
   1.4a):
   - Wraps existing runExtractionPipeline + createExtractionClient
     flow; reads ExtractorContext.clientOverride for test-seam
     per Q1.0.6 lock; ExtractionSetupError class for ADR-12 exit
     code 2 mapping discipline; cli-runner.ts integrated via
     Strategy dispatch.

5. **Path-3 entry-point-determined architecture** (Step 1.4b):
   - 4 Q-lock revisions: Q1.0.4 dropped + Q1.0.8 simplified
     (--cc-only deprecated no-op + redirect warning; --api-direct
     dropped) + Q1.0.10 (b) sub-lock (ClaudeCodeOnlyExtractor
     informational-stub) + Q1.0.5 preserved (cost_model field at
     runtime; atlas.json persistence deferred per Step 1.5
     verification).
   - Architecture config field deprecated at v0.7+; 3-variant
     stderr warning emission at parser layer; field removed at
     v0.8+.

6. **Skills mechanism functional** (Step 1.4b):
   - `.claude/skills/index-atlas/SKILL.md` (canonical Mode A entry
     point; subscription-bounded extraction in Claude Code session
     tools)
   - `src/extraction/cli-show-prompt.ts` Path-γ CLI subcommand
     (canonical EXTRACTION_PROMPT loading mechanism for Skills
     consumption)
   - ClaudeCodeOnlyExtractor informational-stub (legacy field-
     value redirect; emits stderr message + zero-counts result)

7. **Legacy deprecation cycle** (Step 1.4b):
   - architecture config field deprecated at v0.7+ (3-variant
     warning); removed at v0.8+
   - `--cc-only` flag deprecated no-op + redirect warning;
     removed at v0.8+
   - `--api-direct` flag dropped entirely at v0.7+
   - legacy alias `"anthropic-api-claude-code"` accepted at
     parser; emits deprecation warning; removed alongside field
     at v0.8+

8. **Verification + closure** (Step 1.5):
   - No orphaned source references post-Path-3 reframe
   - cost_model atlas.json metadata persistence GAP identified
     + v0.8+ DEFERRED per honest-scope acknowledgment (Q1.0.5 δ
     preserved at runtime; atlas schema bump + pipeline plumbing
     + exporter integration deferred)

#### cost_model persistence gap — pre-registered carry-forward

Per Step 1.5 honest-scope verification: cost_model field
preserved at ExtractionResult.costModel runtime; atlas.json
metadata persistence DEFERRED to v0.8+ (atlas schema bump v1.3
→ v1.4 + pipeline.ts plumbing + storage/atlas-exporter.ts
integration + tests). Substantive scope; not v0.7 launch-
bearing.

**Pre-registration for v0.7 ship gate Step 5.5 absorbed-item
annotations:** cost_model atlas.json persistence is scope-doc-
locked-but-not-shipped class (composes with v0.6 B14 7th
observation class pattern; deferred-with-honest-scope-
acknowledgment rather than silent-deferral). Step 5.5 captures
v0.7-deferred-to-v0.8+ status with explicit annotation per
Q9.0.6 α-light URL-form annotation pattern inheritance.

**Pre-registration for v0_8-HANDOFF.md substrate at Step 4
cycle-close:** atlas.json cost_model metadata persistence is
v0.8+ scope item (along with F1-F9 methodology amendments +
cohort exposure execution + Stream B matrix-completion). Step
4 close drafts v0_8-HANDOFF.md per v0.6 → v0.7 v0_7-HANDOFF.md
substrate pattern inheritance.

#### 11-class recursive catch-pattern observation enumeration final snapshot

For v0.7+ ship gate working-content-gap-inventory + v0.8+
inheritance:

- **v0.6 1-7**: retrospective infrastructure-block claims drift
  + retrospective document-relationship-anchor claims drift +
  retrospective outcome-bullet pattern consistency drift +
  retrospective version-progression narrative drift + cross-
  surface URL/reference style consistency + substrate-evolution
  drift class + scope-doc-locked-but-not-shipped class
- **v0.7 8**: Travis-product-vision-clarification surface class
  (Step 1.2 3-mode reframing + Path (iii) collapse + Step 1.4b
  Path-3 reframe + Travis adjudication discipline)
- **v0.7 9**: Path-γ CLI subcommand decision substrate for
  package-internals-via-CLI architectural pattern
- **v0.7 10**: substrate-verification-at-each-substep-boundary
  (architectural framing benefits at EACH substep boundary, not
  just design-phase; Step 1.4b CLI-can't-bridge-to-Skills
  surface)
- **v0.7 11**: Step-N→Step-N+1 partial revert/refactor pattern
  (substrate-evolution drift surfacing at substep boundary
  expects partial revert/refactor cost at next substep; healthy
  pattern not cycle-execution failure)

V0.7 cycle surfaced 4 new pattern classes (8-11) substantively
per v0.6 → v0.7 production graduation work. Enumeration
substrate for v0.8+ inheritance.

#### Step 2 SECONDARY unblock framing

Step 2 SECONDARY 3-repo install/setup empirical verification
unblocked per Step 1.6 close. Scope per v0.7-SCOPE.md + Q-pre-2
+ Step 1.4b reframe:

- **3-repo target set**: Travis personal projects + ContextAtlas-
  on-itself dogfood + 1 external repo from cohort screening list
  (specifics firm at Step 2.0 design phase). Fallback: 2-repo
  if 3-repo variance exceeds launch-bearing timeline.
- **Verification protocol**: init + doctor + extraction + smoke
  test pipeline against target repos; friction observation
  capture; fix surfaced launch-blocking issues OR document as
  v0.8+ candidates.
- **CLI-vs-Skill extraction equivalence verification protocol**
  (Q2.0.X pre-registered at Step 1.4a + reframed at Step 1.4b
  per Path-3 terminology): compares CLI extraction output vs
  Skill extraction output (both produce atlas.json; equivalence
  remains substantively meaningful question reframed away from
  config-field-user-choice terminology). Integrates into 3-repo
  verification at each target repo (dual-surface comparison).
- **V1.0 ship-gate criterion #2 closure**: SECONDARY empirical
  verification completes criterion #2 closure path established
  at v0.6 Step 4.5 pipeline-mechanics ship.

Step 2.0 design phase entry next per Step N.0 cadence convention
inheritance from v0.6.

#### Step 1.6 unblock — Step 2.0 design adjudications

Step 2.0 design adjudications unblocked. Per Step N.0 cadence
convention: Q2.0.1-Q2.0.X design adjudications surfaced inline
per discipline #3 cadence; Step 2 substep ladder firmed at
Step 2.0 close.

Inherited Q-list items from Step 1.4a + 1.4b:
- **Q2.0.X — CLI-vs-Skill extraction equivalence verification
  protocol** (pre-registered at Step 1.4a; reframed at Step
  1.4b per Path-3 terminology)

Step 2.0 design adjudications expected to cover:
- 3-repo target firm (Travis personal project specifics;
  external repo from cohort screening list)
- Verification protocol acceptance criteria
- Friction-observation handling protocol (launch-blocking-fix-
  now vs v0.8+-candidate vs honest-scope-acknowledgment)
- CLI-vs-Skill equivalence protocol substantive design
- Step 2 substep ladder firm

---

### Step 1.5 shipped — 2026-05-10 (Verification + closure work + cost_model atlas.json metadata persistence gap → v0.8+)

V0.7 Step 1.5 ships verification scan + closure work per locked
Path-3 reframe. Substantively lighter than original 7-substep
ladder Step 1.5 framing (cost model accounting + flag negation +
soft deprecation all shipped at Step 1.4b ahead-of-schedule under
Path-3 reframe). 1323/1323 tests PASS (baseline preserved from
Step 1.4b); npm run build clean compile.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 1.5 verification + closure | main | [this commit] | Verification scan complete; cost_model atlas.json metadata persistence GAP identified (Q1.0.5 δ preserved at runtime; v0.8+ defer); no orphaned source references; test baseline preserved |

#### Verification scan results (orphaned references)

Grep scan for surfaces affected by Path-3 reframe at Step 1.4b:

- **`--api-direct` / `apiDirect` references**: 3 files
  - `STEP-PLAN-V0.7.md` (historical record entries; expected)
  - `docs/adr/ADR-02-extraction-sole-api-caller.md` (historical
    record in revision history; expected)
  - `src/extraction/factory.ts` (routing comment reference to
    legacy field-value handling; expected)
  - **No orphaned source code references.**

- **`VALID_ARCHITECTURES` + architecture-as-runtime-selector**: 3
  files
  - `src/extraction/factory.test.ts` (routing tests for legacy
    field-value handling; expected)
  - `src/extraction/extractors/claude-code-only.ts` (informational-
    stub comment reference; expected)
  - `src/config/parser.ts` (validateArchitecture function for
    deprecation warning emission; expected)
  - **No orphaned references; all legacy compat handling per
    Path-3 deprecation cycle.**

- **`cost_model` / `costModel` references**: 7 files (extractor
  interface + 2 concrete extractors + their tests + factory.ts
  + extractor.test.ts). All expected; runtime field flow.

#### cost_model atlas.json metadata persistence GAP

Per Q1.0.5 δ preserved lock (at Step 1.4b): cost_model metadata
field useful for atlas.json provenance recording which entry
point generated which extraction artifacts.

**Step 1.5 verification surface:** atlas.json schema does NOT
currently include cost_model field; CLI summary output does NOT
surface cost_model; cost_model is currently runtime-only
(carried by Extractor implementations in TypeScript; returned
in ExtractionResult.costModel; not consumed by pipeline.ts
atlas.json export or cli-runner.ts summary printer).

**Path forward — v0.8+ DEFERRED per honest-scope acknowledgment.**
Atlas.json metadata persistence integration requires:
- Atlas schema bump (v1.3 → v1.4) to add cost_model field
- pipeline.ts plumbing (cost_model from extractor result →
  atlas-exporter writeAtlasJson call)
- storage/atlas-exporter.ts integration (writes cost_model to
  atlas.json metadata block)
- storage/atlas-importer.ts integration (reads cost_model on
  import)
- storage/types.ts type expansion
- Tests for round-trip + schema bump migration

Substantive scope; not v0.7 launch-bearing. v0.8+ post-launch
cycle absorbs alongside other methodology amendments.

Q1.0.5 δ field PRESERVED at runtime: Extractor.costModel +
ExtractionResult.costModel + Path-3 entry-point-determined
cost-model semantics. Atlas.json metadata persistence DEFERRED
to v0.8+. No silent gap; explicit honest-scope acknowledgment
per discipline #4 inheritance.

**v0.8+ candidate annotation added:** atlas.json cost_model
metadata persistence (Q1.0.5 δ atlas.json wiring; deferred per
Step 1.5 honest-scope verification).

#### Test coverage baseline preserved

1323/1323 tests PASS at Step 1.5 entry (baseline from Step
1.4b). No additional tests added at Step 1.5 — verification
scan revealed no gaps requiring new test coverage. Step 1.4b
test additions covered Path-3 reframe + Skills mechanism +
flag handling comprehensively.

#### Cycle-execution observations final enumeration before Step 4 cycle close

**11-class recursive catch-pattern observation enumeration** for
v0.7+ ship-gate working-content-gap-inventory inheritance
(composes v0.6 7-class + v0.7 4 additional classes):

- **v0.6 1**: retrospective infrastructure-block claims drift
- **v0.6 2**: retrospective document-relationship-anchor claims
  drift
- **v0.6 3**: retrospective outcome-bullet pattern consistency
  drift
- **v0.6 4**: retrospective version-progression narrative drift
- **v0.6 5**: cross-surface URL/reference style consistency
- **v0.6 6**: substrate-evolution drift class
- **v0.6 7**: scope-doc-locked-but-not-shipped class
- **v0.7 8**: Travis-product-vision-clarification surface class
  (Step 1.2 3-mode reframing + Path (iii) collapse)
- **v0.7 9**: Path-γ CLI subcommand decision substrate for
  package-internals-via-CLI architectural pattern
- **v0.7 10**: substrate-verification-at-each-substep-boundary
  (architectural framing benefits at EACH substep boundary, not
  just design-phase; Step 1.4b CLI-can't-bridge-to-Skills
  surface)
- **v0.7 11**: Step-N→Step-N+1 partial revert/refactor pattern
  (substrate-evolution drift surfacing at substep boundary
  expects partial revert/refactor cost at next substep;
  healthy pattern not failure)

V0.7 cycle surfaced 4 new pattern classes (8-11) — substantive
architectural-graduation work per v0.6→v0.7 production
transition framing. Pattern enumeration substrate for v0.8+
inheritance.

#### Step 1.5 unblock — Step 1.6 close

Step 1.6 unblocked. Step 1 close commit batches progress log
batching for Steps 1.0-1.5 + Step 1 cumulative outcome
subsection + Step 2 unblock framing.

Step 1 cumulative scope shipped:
- Step 1.0: design adjudications (Q1.0.1-Q1.0.12 + 2
  refinements)
- Step 1.1: Q1.0.2 verification cleared (α Skills architecture)
- Step 1.2: ADR-02 substantive graduation reframe (preserved
  as historical record per Path-3 supersession at Step 1.4b)
- Step 1.3: Strategy pattern wrapper module (skeleton stage)
- Step 1.4a: Mode B full + cli-runner Strategy dispatch +
  init/runner Q1.0.4 β-3 + Q1.0.8 3-flag wiring (preserved as
  historical record per Path-3 supersession at Step 1.4b)
- Step 1.4b: Path-3 entry-point-determined reframe + Skills
  mechanism functional + ADR-02 re-amendment + 4 Q-lock
  revisions
- Step 1.5: verification + closure + cost_model atlas.json
  metadata persistence gap → v0.8+ defer

V0.7 PRIMARY scope (claude-code-only extraction path via
entry-point-determined model) substantively complete pending
Step 1.6 close commit. Step 2 SECONDARY 3-repo install/setup
empirical verification unblocked.

---

### Step 1.4b shipped — 2026-05-10 (Path-3 entry-point-determined reframe + Skills mechanism functional + ADR-02 re-amendment + 4 Q-lock revisions)

V0.7 Step 1.4b ships **substantive architectural reframe** per
CLI-cannot-bridge-to-Skills architectural reality surfaced at
Step 1.4b inline design surface. Path-3 entry-point-determined
model supersedes Step 1.2 config-field-user-choice framing
(Step 1.2 + Step 1.4a entries preserved as historical record
per Q-pre-4 substrate-evolution drift framework Path C).
1323/1323 tests PASS (1321 prior + 2 net new at Step 1.4b after
test scope adjustments); npm run build clean.

**Architectural reality:** Skills execute inside Claude Code
session tools (Bash/Edit/Read/Write); contextatlas CLI binary
is separate sub-process; CLI cannot directly invoke Skills
running in Claude Code session. Step 1.2 + Step 1.4a captured
2-mode user-choice on config field; Step 1.4b implementation
surface revealed the choice CLI claimed to offer isn't
mechanically supported (CLI Mode A would have been redirect
either way).

**Path-3 reframe:** extraction entry point determines cost
model. CLI invocation = Anthropic API direct (always; CLI is
what it is). Claude Code session invocation via /index-atlas
skill = subscription-bounded (always; Skills mechanism is what
it is). User chooses surface based on workflow; surface
determines cost model; no config-field user-choice.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 1.4b Path-3 reframe + Skills mechanism | main | [this commit] | ADR-02 re-amendment + cli-show-prompt subcommand + SKILL.md + ClaudeCodeOnlyExtractor stub + 4 Q-lock revisions + architecture field deprecation (3-variant warning at parser layer) + Step 1.4a Q1.0.4 β-3 + Q1.0.8 3-flag wiring reverted/refactored |

#### ADR-02 re-amendment (Option X per Travis adjudication)

ADR-02 §Decision "User-choice configuration" sub-section
replaced with "Entry-point-determined cost model" framing per
ADR-02 v0.7 Step 1.4b amendment. Two extraction entry points
(CLI = API direct; /index-atlas skill = subscription-bounded);
user chooses surface; surface determines cost model. §Consequences
"User-choice supported architecturally" bullet reframed to
"User selects extraction surface by invocation context."
§Revision history 2026-05-10 entry captures Path-3 reframe + 4
Q-lock revisions + 10th observation class + cross-references;
Step 1.2 amendment preserved as historical record via inline
annotation marker.

#### 4 Q-lock revisions captured (substrate-evolution drift Path C)

- **Q1.0.4 lock dropped** (no default-on-config-field needed; CLI
  is always API direct regardless of config; architecture field
  deprecated at v0.7+; field removed at v0.8+)
- **Q1.0.8 lock revised** (`--cc-only` flag deprecated; no-op at
  v0.7+ + stderr redirect warning to `/index-atlas` skill;
  `--api-direct` flag dropped entirely at v0.7+; flag removed at
  v0.8+)
- **Q1.0.10 lock simplified** (single CLI-invoked extractor
  `AnthropicAPIDirectExtractor`; `ClaudeCodeOnlyExtractor`
  preserved as informational-stub for legacy config-field-value
  path; emits redirect message + zero-counts result per Q1.0.10
  (b) sub-lock)
- **Q1.0.5 lock preserved** (`cost_model` metadata field useful
  for atlas.json provenance; not runtime path-selection concern)

#### Files changed at Step 1.4b

**NEW files:**
- `src/extraction/cli-show-prompt.ts` (Path-γ CLI subcommand)
- `src/extraction/cli-show-prompt.test.ts` (~4 tests)
- `.claude/skills/index-atlas/SKILL.md` (Path-3-reframed +
  Path-γ extraction prompt loading)

**Modified source files:**
- `docs/adr/ADR-02-extraction-sole-api-caller.md` (re-amendment
  per Option X; Step 1.2 preserved as historical record)
- `src/extraction/extractors/claude-code-only.ts` (skeleton →
  informational-stub per Q1.0.10 (b))
- `src/extraction/factory.ts` (simplified routing; 3-config-
  value-to-2-implementation mapping for legacy path)
- `src/config/parser.ts` (architecture field deprecation
  warning emission at parser layer; 3 variants per field value;
  `LoadConfigOptions.writeStderr` test seam added)
- `src/cli-args.ts` (drop `--api-direct` flag entirely; drop
  `apiDirect` from ParsedArgs; preserve `--cc-only` as
  deprecated no-op; add `show-prompt` to Subcommand union +
  KNOWN_SUBCOMMANDS)
- `src/init/runner.ts` (drop architecture field write; --cc-only
  → stderr redirect warning + no field write)
- `src/init/config-scaffold.ts` (remove architecture field from
  scaffolded YAML)
- `src/index.ts` (drop `apiDirect` pass-through; wire
  `show-prompt` subcommand dispatch)

**Modified test files:**
- `src/extraction/extractors/claude-code-only.test.ts` (stub
  behavior tests; redirect message + zero-counts result)
- `src/extraction/factory.test.ts` (simplified routing tests;
  removed `LEGACY_ALIAS_DEPRECATION_WARNING` references)
- `src/cli-args.test.ts` (drop `apiDirect` from EMPTY)
- `src/init/runner.test.ts` (no-architecture-field expectations;
  --cc-only redirect warning verification)
- `src/init/config-scaffold.test.ts` (no-architecture-field
  expectations; removed `architecture:` option from build/write
  signatures)
- `src/config/parser.test.ts` (deprecation warning emission
  tests for 3 field value variants + absent-field-no-warning)
- `src/extraction/cli-runner.test.ts` (remove `architecture:
  anthropic-api-direct` from beforeEach + 5 inline configs;
  CLI default behavior verified)

#### Cycle-execution observation 10 — substrate-verification-at-each-substep-boundary

V0.7 Step 1.4b surfaced **10th recursive catch-pattern
observation class**: architectural framing benefits from
substrate-verification-before-implementation-substep at EACH
substep boundary, not just design-phase. Mid-substep
architectural surprises (like CLI-can't-bridge-to-Skills)
compound if not caught early via gate-substep discipline.

V0.7 cycle surfaced this pattern at 3 substep boundaries:
- **Step 1.1** gate-substep verification cleared Q1.0.2 α
  Skills architecture
- **Step 1.2** Travis 3-mode reframing turn → Path (iii)
  2-mode collapse + v0.6 substrate verification
- **Step 1.4b** implementation reality → Path-3 entry-point-
  determined reframe + Q1.0.4/Q1.0.8/Q1.0.10 lock revisions

Each pivot caught pre-substantive-sunk-cost via Q-pre-4
substrate-evolution drift framework. Composes with v0.6 7-class
+ v0.7 8-class (Travis-product-vision-clarification) + v0.7
9-class (Path-γ CLI subcommand) = **10-class recursive catch-
pattern observation enumeration** for v0.7+ ship-gate working-
content-gap-inventory inheritance.

#### Cycle-execution observation 11 — Step 1.4a → Step 1.4b partial revert/refactor pattern

Step 1.4a (commit `4df3740`) shipped Q1.0.4 β-3 + Q1.0.8 3-flag
mechanical wiring; Step 1.4b Path-3 reframe partially
reverts/refactors that work (drop architecture field write +
drop --api-direct flag + revise --cc-only handling + simplify
factory + revise ClaudeCodeOnlyExtractor).

Pattern observation: even with substrate-verification discipline
at Step 1.1 + 1.2 + 1.4b, Step 1.4a shipped mechanical wiring
against pre-Path-3 framing. That work isn't wasted — it
surfaced Path-3 reality at implementation phase. But Step 1.4b
carries revert/refactor scope alongside new Cluster A + B + C
+ D + E work.

V0.8+ inheritance pattern: when substrate-evolution drift
surfaces at substep boundary, expect partial revert/refactor
cost at the next substep. Plan for it; don't treat it as
cycle-execution failure. V0.7 caught 3 drift moments without
catastrophic rework precisely because each drift surfaced
before substantive sunk-cost beyond one mechanical-wiring
substep. **Healthy pattern; not failure.**

#### Travis mid-cycle direction REFRAMED with entry-point-determined terminology

Mode-A-vs-Mode-B extraction equivalence verification protocol
reframed per Path-3 lock: equivalence verification compares
**CLI extraction output vs Skill extraction output** (not "Mode
A vs Mode B" — both produce atlas.json; comparison remains
substantively equivalent question but reframed away from
config-field user-choice terminology).

Step 2.0 design phase Q-list pre-registration:

**Q2.0.X — CLI-vs-Skill extraction equivalence verification
protocol.** Per Travis mid-cycle direction captured at Step
1.4a progress log; REFRAMED at Step 1.4b per Path-3 entry-
point-determined model. Substantively: (a) what counts as
'equivalent enough' across the two extraction surfaces (claim
count match? fuzzy claim-text similarity threshold? structural
schema match?); (b) how does comparison handle stochastic LLM
output variance (run N trials per surface? compare
distributions?); (c) what discrepancies trigger investigation
vs accept-as-noise; (d) how do equivalence findings inform v1.0
launch document framing. Verification protocol integrates into
Step 2 SECONDARY 3-repo install/setup verification (each target
repo gets dual-surface comparison: CLI extraction + Skills
extraction outputs compared).

#### Step 1.4b unblock — Step 1.5 cost model + tests + flag negation cleanup

Step 1.5 unblocked per substep ladder. Scope per locked Path-3
reframe:
- Final flag-negation cleanup (verify --cc-only deprecation
  warning consistency; verify architecture field deprecation
  warning consistency)
- Test coverage gap analysis (any remaining Step 1.4a
  mechanical-wiring tests not yet revised for Path-3)
- v0.7 cycle-execution observation final capture before Step
  4 cycle close

---

### Step 1.4a shipped — 2026-05-10 (Mode B full + cli-runner Strategy dispatch + init Q1.0.4 β-3 + Q1.0.8 3-flag wiring; 1.4 → 1.4a/1.4b split per Path A pre-state amendment)

V0.7 Step 1.4a ships Mode B full implementation + cli-runner.ts
Strategy dispatch integration + init/runner.ts Q1.0.4 β-3 default
flip + Q1.0.8 3-flag user-choice wiring. Mode B (anthropic-api-
direct) end-to-end functional; Mode A (claude-code-only) still
throws Step-1.4b-pending error per skeleton scope. 1321/1321
tests PASS (1316 prior + 5 net new at Step 1.4a after Step 1.3
test shape adjustments); npm run build clean compile.

**Path A pre-state amendment applied** (per Q-pre-4 substrate-
evolution drift framework): Step 1.4 → Step 1.4a + Step 1.4b
ladder split BEFORE substantive Step 1.4 work shipped against
superseded scope. 7-substep ladder → 8-substep ladder: 1.0
design + 1.1 Q1.0.2 verification + 1.2 ADR-02 amendment + 1.3
Strategy pattern wrapper + **1.4a Mode B + mechanical wiring**
+ **1.4b Mode A Skills functional impl** + 1.5 cost model +
tests + flag negation + 1.6 close. Rationale: substantive
interpretive SKILL.md content drafting warrants dedicated
substep treatment per Q1.0.9 gate-substep precedent; Mode B
mechanical wiring at 1.4a verifies Strategy dispatch end-to-
end before Skills functional impl lands at 1.4b.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 1.4a Mode B + mechanical wiring | main | [this commit] | Cluster 1 AnthropicAPIDirectExtractor full + Cluster 3 cli-runner.ts Strategy dispatch + Cluster 4 init/runner.ts Q1.0.4 β-3 + Q1.0.8 3-flag + Cluster 5 partial tests; Step 1.3 ExtractorContext + ExtractionResult shapes Path A pre-state amended to runtime-resource shape; Step 1.4b unblocked |

#### Cluster 1 — AnthropicAPIDirectExtractor full implementation

`src/extraction/extractors/anthropic-api-direct.ts` (~60 LOC).
Constructs ExtractionClient (reads ExtractorContext.clientOverride
for test-seam injection per Q1.0.6 α + γ + Q1.3.6 lock; falls
through to readEnv-based Anthropic SDK client construction).
Throws **ExtractionSetupError** (new error class) on missing
ANTHROPIC_API_KEY for ADR-12 exit code 2 mapping discipline;
generic Error throws map to exit code 1 (pipeline failure). Calls
runExtractionPipeline with full kwargs; returns ExtractionResult
wrapping pipelineResult + costModel "api".

#### Cluster 3 — cli-runner.ts Strategy dispatch integration

`src/extraction/cli-runner.ts` refactored: removes direct
Anthropic SDK import + ExtractionClient construction (moved into
AnthropicAPIDirectExtractor); replaces direct runExtractionPipeline
call with `getExtractor(config).extract(extractorContext)` Strategy
pattern dispatch. Existing IndexCliOptions.clientOverride test-
seam preserved through ExtractorContext.clientOverride per Q1.3.6.
ExtractionSetupError instanceof check maps to exit code 2; generic
Error catches map to exit code 1. ExtractorContext bundles
runtime resources (db, adapters, readEnv, contextatlasVersion,
contextatlasCommitSha, budgetWarnUsd, narrowAttribution,
clientOverride) per Step 1.3 ExtractorContext interface (Path A
pre-state amended to match runtime needs).

#### Cluster 4 — init/runner.ts Q1.0.4 β-3 default flip + Q1.0.8 3-flag wiring

`src/init/runner.ts`:
- New `apiDirect?: boolean` field in InitRunOptions
- Architecture choice: `apiDirect === true → "anthropic-api-direct"
  (Mode B)` else `"claude-code-only" (Mode A default per β-3)`
- Removes legacy "anthropic-api-claude-code" default (flipped to
  claude-code-only per Q1.0.4 β-3 lock at v0.7+)
- `--cc-only` flag preserved as Mode A explicit selector (NOT
  deprecated; meaningful at v0.7+ per Q1.0.8 lock)

`src/cli-args.ts`:
- New `apiDirect: boolean` field in ParsedArgs interface
- New `--api-direct` flag parser (boolean opt-in; init-subcommand-
  only)
- Mutual-exclusion check: `--cc-only` + `--api-direct` together →
  actionable error

`src/index.ts`:
- Passes `apiDirect: parsed.apiDirect` to runInitSubcommand

`src/init/config-scaffold.ts`:
- ConfigScaffoldOptions.architecture type union updated to match
  v0.7 ContextAtlasConfig.architecture shape (Mode A + Mode B; no
  legacy alias at init-write time — legacy alias accepted at
  config-parse time but new configs always write canonical names)

#### Cluster 5 (partial) — Test coverage at Step 1.4a

5 net new tests after Step 1.3 test shape adjustments + Step 1.4a
test additions:
- `extractor.test.ts` updated: new ExtractionResult shape
  (pipelineResult + costModel); ExtractionSetupError class tests
- `extractors/anthropic-api-direct.test.ts` updated: ExtractionSetupError
  thrown on missing API key + message content verification
- `extractors/claude-code-only.test.ts` updated: Step-1.4b-pending
  error message verification
- `init/runner.test.ts` updated: --cc-only absent → claude-code-
  only default (Q1.0.4 β-3 verification); NEW test for
  --api-direct → anthropic-api-direct
- `cli-runner.test.ts` updated: beforeEach config adds
  `architecture: anthropic-api-direct` (existing tests verify
  Mode B path explicitly at v0.7+; Step 1.0 default flip honesty
  surfaced via explicit-architecture config)
- `cli-args.test.ts` updated: EMPTY ParsedArgs includes
  `apiDirect: false`

#### Path A pre-state amendment to Step 1.3 interface shapes

ExtractorContext interface expanded from 6-field Step 1.3
skeleton to 11-field runtime shape needed for Mode B
implementation:
- Added: sourceRoot, db, adapters, contextatlasVersion,
  contextatlasCommitSha, budgetWarnUsd (optional),
  narrowAttribution (optional), readEnv (required)
- Removed: databasePath (db replaces; lifecycle in cli-runner),
  atlasJsonPath (handled internally by runExtractionPipeline)

ExtractionResult shape changed from 8-field flat (claims + file
counts + token counts + cost_usd + cost_model) to 2-field nested
(pipelineResult: ExtractionPipelineResult + costModel: CostModel).
Rationale: cli-runner.ts summary printing consumes
pipelineResult fields unchanged; new costModel field surfaces
in summary output; avoids duplication of ExtractionPipelineResult
fields across two interfaces.

ExtractionSetupError class added to extractor.ts for ADR-12 exit
code mapping discipline (setup errors → exit code 2; pipeline
errors → exit code 1).

Path A pre-state amendment per Q-pre-4 substrate-evolution drift
framework: adjustments BEFORE substantive Step 1.4a work shipped
against superseded Step 1.3 interface scope. Step 1.3 entries
remain historical record of skeleton-shape state; Step 1.4a entry
captures runtime-shape state.

#### Path-γ CLI subcommand lock for Step 1.4b extraction prompt loading

Travis adjudication at Step 1.4 design surface: Path-γ CLI
subcommand `contextatlas show-prompt` is architectural fit for
Mode A Skills mechanism prompt loading. ContextAtlas owns
canonical prompt per ADR-02 §Decision permitted-modules
invariant; Skills consumes via CLI invocation surface (cwd-
independent; path-resolution-complexity centralized in CLI);
future-extensibility for additional CLI subcommands. Step 1.4b
implementation scope:
- NEW `src/extraction/cli-show-prompt.ts` (matches cli-runner.ts
  pattern; runShowPromptSubcommand function with writeStdout
  injection seam)
- Dispatch wiring in src/index.ts for `contextatlas show-prompt`
  subcommand
- ~5-10 new tests at 1.4b
- Skill invocation: `!`contextatlas show-prompt`` (canonical CLI
  surface cwd-independent)

#### Cycle-execution observation — Travis mid-cycle direction: Mode-A-vs-Mode-B extraction equivalence verification

Travis mid-cycle direction at Step 1.4 design surface: empirical
equivalence verification between Mode A (Skills) and Mode B (API
direct) extractions for Step 2 SECONDARY scope inheritance.

Substantive framing:
- Compare atlas.json outputs across paths against same source
  repos
- Verify near-identical extraction behavior between modes
- Substrate for v1.0 launch document equivalence claims
  (empirical not theoretical)
- Methodology substrate for future Mode comparisons (v0.8+
  extraction paths if added)

Pre-registration for Step 2.0 design phase Q-list:

**Q2.0.X — Mode-A-vs-Mode-B extraction equivalence verification
protocol.** Per Travis mid-cycle direction captured at Step 1.4a
progress log. Substantively: (a) what counts as 'equivalent
enough' (claim count match? fuzzy claim-text similarity
threshold? structural schema match?); (b) how does comparison
handle stochastic LLM output variance (run N trials per mode?
compare distributions?); (c) what discrepancies trigger
investigation vs accept-as-noise; (d) how do equivalence
findings inform v1.0 launch document framing. Verification
protocol integrates into Step 2 SECONDARY 3-repo install/setup
verification (each target repo gets dual-extraction comparison).
Methodology inheritance from v0.6 F1 atlas-substrate-version
control discipline (Mode A vs Mode B comparison must hold atlas
substrate constant — compare extractions producing different
atlas versions; not running queries against pre-existing
different atlas versions).

v0.7-SCOPE.md amendment (if needed for more substantive scope-doc
capture) deferred to Step 2.0 design phase per Q-pre-4
substrate-evolution drift framework Path A pre-state amendment.

#### Cycle-execution observation 9 — Path-γ CLI subcommand decision substrate for v0.8+ inheritance (NEW)

V0.7 Step 1.4 design surface surfaced **9th recursive catch-
pattern observation class**: when Skills mechanism needs to
consume canonical package internals (prompts; schemas; configs;
etc.), CLI subcommand surface is the architectural fit vs
path-resolution-in-skill OR inline-bundling.

Reasoning preserved for v0.8+ inheritance:
- Architectural cleanliness (ADR-02 permitted-modules invariant
  alignment)
- Path-resolution-complexity centralized in CLI (cwd-independent
  via import.meta.url semantics)
- Future-extensibility (CLI subcommand can add flags; Skills
  stays simple)
- Test-pattern matches existing cli-runner.ts precedent

v0.8+ Skills additions (if any) inherit this pattern: package
internals exposed via CLI subcommands; Skills consume via CLI
invocation surface. Composes with v0.6 7-class + v0.7 8-class
(Travis-product-vision-clarification surface class) enumeration
= **9-class recursive catch-pattern observation enumeration**
for v0.7+ ship-gate working-content-gap-inventory.

#### Step 1.4a unblock — Step 1.4b Skills functional implementation

Step 1.4b unblocked. Work scope:
- Cluster 2 — `.claude/skills/index-atlas/SKILL.md` content
  drafting (extraction prompt packaging via Path-γ; bundled
  helper scripts for walk-sources + validate-claims + persist-
  atlas; dynamic context injection patterns)
- NEW `src/extraction/cli-show-prompt.ts` (Path-γ CLI subcommand)
- Subcommand dispatcher wiring updates in src/index.ts
- ClaudeCodeOnlyExtractor full implementation (Skills invocation
  context bridge)
- Cluster 5 continuation tests (~15-25 additional tests)

Substantive interpretive work surface — SKILL.md content surfaced
inline before commit per discipline #3 cadence applied at
substantive interpretive work moment.

---

### Step 1.3 shipped — 2026-05-10 (Strategy pattern wrapper module)

V0.7 Step 1.3 ships Strategy pattern wrapper module per Q1.0.10 γ
lock + Path (iii) 2-mode collapse architecture (ADR-02 v0.7
amendment 2026-05-09). 6 module shapes applied; 6 design
adjudications locked (Q1.3.1-Q1.3.6); 2 verification items
resolved inline; 1316/1316 tests PASS (1303 v0.6 baseline + 13
new at Step 1.3); npm run build clean compile.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 1.3 Strategy pattern wrapper module | main | [this commit] | Extractor interface + 2 skeleton implementations + factory + types.ts edits + parser.ts VALID_ARCHITECTURES expansion + 5 NEW test files; per-cycle Strategy abstraction above existing per-document ExtractionClient; legacy alias deprecation warning emission at factory-time per Q1.0.8 lock |

#### 6 module shapes applied

1. **`src/extraction/extractor.ts`** (NEW) — Strategy interface +
   ExtractorContext dependency injection bag + ExtractionResult shape
   + CostModel type alias. Per-cycle abstraction (above existing
   per-document ExtractionClient); skeleton at Step 1.3, full
   implementations land at Step 1.4.

2. **`src/extraction/extractors/anthropic-api-direct.ts`** (NEW
   skeleton) — Mode B per ADR-02 v0.7 amendment + Path (iii) lock.
   `costModel = "api"`. `extract()` throws Step-1.4-pending error per
   Q1.3.3 fail-loud lock.

3. **`src/extraction/extractors/claude-code-only.ts`** (NEW skeleton)
   — Mode A per Q1.0.2 α Skills architecture. `costModel =
   "subscription-bounded"`. `extract()` throws Step-1.4-pending
   error.

4. **`src/extraction/factory.ts`** (NEW) — `getExtractor(config,
   deps?)` factory function: 3-config-value-to-2-implementation
   routing + legacy alias deprecation warning emission at factory-
   time per Q1.0.8 + Q1.3.2 locks. `LEGACY_ALIAS_DEPRECATION_WARNING`
   exported constant for test verification. Stderr write seam
   (`writeStderr` injection) preserves test-pattern compliance per
   Q1.0.6 α + γ.

5. **`src/types.ts`** edit — `ContextAtlasConfig.architecture` field
   type union expanded from 2-value to 3-value per Path (iii) lock:
   `"claude-code-only" | "anthropic-api-direct" |
   "anthropic-api-claude-code"`. JSDoc refreshed with Mode A/B/legacy
   alias framing + Q1.0.4 β-3 default lock + canonical Skills
   location reference.

6. **`src/config/parser.ts`** edit — `VALID_ARCHITECTURES` constant
   expanded from 2-value to 3-value per Path (iii) lock; ordering
   `claude-code-only` first (default at v0.7+; matches Q1.0.4 β-3
   surface), then `anthropic-api-direct` (Mode B), then
   `anthropic-api-claude-code` (legacy alias). `validateArchitecture`
   JSDoc refreshed with v0.7 amendment cross-reference.

#### Q1.3.1-Q1.3.6 design adjudications locked

- **Q1.3.1** — LOCK per-cycle Strategy abstraction level (above
  ExtractionClient). Per-document mechanics remain implementation
  detail of AnthropicAPIDirectExtractor at Step 1.4.
- **Q1.3.2** — LOCK factory.ts deprecation warning emission point
  (extraction-time emission semantically aligned vs config-parse-
  time which would emit on every config load including non-extraction
  operations).
- **Q1.3.3** — LOCK throw skeleton fail-mode (matches CLAUDE.md
  "fail loudly" discipline; explicit Step-1.4-pending error
  message; Step 1.4 lands functional implementation).
- **Q1.3.4** — LOCK directory structure
  (`src/extraction/extractors/` for concrete implementations;
  `src/extraction/extractor.ts` for interface; `src/extraction/
  factory.ts` for factory).
- **Q1.3.5** — LOCK cli-runner.ts integration deferred to Step 1.4
  (substep decomposition discipline; Step 1.3 ships interface +
  skeletons + factory; Step 1.4 wires factory.ts → cli-runner.ts
  + lands functional Skills implementation).
- **Q1.3.6** — LOCK `IndexCliOptions.clientOverride` preservation
  at Strategy level via `ExtractorContext.clientOverride` field;
  AnthropicAPIDirectExtractor at Step 1.4 reads from context and
  passes to underlying ExtractionClient.

#### 2-level Strategy pattern architectural insight (cycle-execution observation)

V0.7 Step 1.3 surfaced architectural insight worth capture: existing
`ExtractionClient` interface (anthropic-client.ts L87-99) already
operates at per-document level (`extract(documentBody)`). v0.7
Strategy pattern operates at per-cycle level (per-repo extraction-
as-a-whole).

Two-level Strategy pattern emerged:
- **Higher level** — `Extractor` (per-cycle path selection; Mode A
  vs Mode B); v0.7 Step 1.3 abstraction
- **Lower level** — `ExtractionClient` (per-document mechanics; used
  by Mode B AnthropicAPIDirectExtractor; not used by Mode A
  ClaudeCodeOnlyExtractor)

Mode A Skills path doesn't use `ExtractionClient` internally
(executes via Claude Code session tools — Bash/Edit/Read/Write —
not via @anthropic-ai/sdk client). Mode B API direct path uses
`ExtractionClient` internally per-document.

Existing `ExtractionClient` becomes implementation detail of
AnthropicAPIDirectExtractor rather than competing primitive at v0.7
Strategy pattern level. Clean architectural separation;
substantively correct Strategy pattern application at v0.7+ scope.

#### Verification Item 1 + 2 resolution (inline at Step 1.3 implementation)

**Verification Item 1 — `getExtractor` once-per-process guard
needed?** NO guard at v0.7. Both `contextatlas index` (cli-runner.ts)
+ `contextatlas init` (smoke test path; v0.6 Step 4.4 substrate)
trigger extraction; per-invocation warning emission appropriate.
If production scenarios surface noise, add guard at v0.8+. Verified
by checking init/runner.ts L170-178 (init triggers
runIndexSubcommand which would call getExtractor at Step 1.4 wiring).

**Verification Item 2 — factory absent-means-default robustness.**
Parser layer validates architecture field non-empty + valid-set
membership (`validateArchitecture` in src/config/parser.ts L188-
203 throws on empty/invalid). Factory trusts parser-validated
values; no defensive empty-string handling needed. Verified by
reading `validateArchitecture` source. Type-level exhaustiveness
in factory ensures TS catches union expansion regressions
(`const _exhaustive: never = architecture` pattern).

#### Test coverage at Step 1.3

13 new tests added per CLAUDE.md src-changes-require-full-test
discipline (1303 v0.6 baseline + 13 new = 1316/1316 PASS):

- `src/extraction/extractor.test.ts` (3 tests) — Strategy interface
  contract + ExtractorContext shape + ExtractionResult shape
- `src/extraction/extractors/anthropic-api-direct.test.ts` (2 tests)
  — Skeleton compliance + Step-1.4-pending error verification
- `src/extraction/extractors/claude-code-only.test.ts` (2 tests) —
  Skeleton compliance + Step-1.4-pending error verification
- `src/extraction/factory.test.ts` (5 tests) — 3-config-value-to-2-
  implementation mapping + legacy alias stderr deprecation warning
  emission verification + LEGACY_ALIAS_DEPRECATION_WARNING text
  content verification + absent-means-default per Q1.0.4 β-3 lock
- `src/config/parser.test.ts` extension (1 new test) —
  `anthropic-api-direct` parses correctly + existing test regex
  updated to match new VALID_ARCHITECTURES order

#### Step 1.3 unblock — Step 1.4 path-routing dispatch + claude-code-only Skills functional implementation

Step 1.4 unblocked per substep ladder. Functional implementation
scope:

- `cli-runner.ts` integration: replace direct `runExtractionPipeline`
  + `createExtractionClient` flow with `getExtractor(config)` +
  `extractor.extract(context)` Strategy pattern dispatch
- `AnthropicAPIDirectExtractor` full implementation: wraps existing
  `runExtractionPipeline` + `createExtractionClient` flow; reads
  `ExtractorContext.clientOverride` for test-seam injection
- `ClaudeCodeOnlyExtractor` full implementation:
  - `.claude/skills/index-atlas/SKILL.md` content drafting (extraction
    prompt packaging + dynamic context injection patterns + bundled
    helper scripts for file walking + JSON validation + atlas.json
    persistence)
  - Skills mechanism wiring (skill invocation context bridge from
    `extract()` method)
  - Subscription-bounded cost accounting ($0 per-call; cost_model =
    "subscription-bounded")
- `init/runner.ts` revision: Q1.0.4 β-3 default flip (claude-code-
  only default; absent-means-default; init writes explicit-default);
  Q1.0.8 3-flag user-choice (`--cc-only` forces Mode A; `--api-
  direct` forces Mode B; flag-absence selects default)
- Test coverage extensions: integration tests against new Strategy
  pattern dispatch; flag-absence default behavior verification;
  --api-direct flag verification; --cc-only forces Mode A
  verification

---

### Step 1.2 shipped — 2026-05-09 (ADR-02 graduation reframe + Path (iii) 2-mode collapse lock)

V0.7 Step 1.2 ships ADR-02 substantive graduation amendment per
Q1.0.1 β substantive scope lock + Q1.0.11 β timing lock (AFTER
Q1.0.2 verification cleared at Step 1.1). Research-cycle SOLE-
CALLER invariant graduates to v0.7+ production-cycle user-choice
configuration; Path (iii) 2-mode collapse + 1 legacy alias lock
per v0.6 actual extraction behavior verification surfaced at
Step 1.2 surface.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 1.2 ADR-02 amendment | main | [this commit] | ADR-02 substantive graduation reframe (extraction-sole-API-caller → extraction-sole-research-time-extraction-caller; v0.1-v0.6 research-cycle SOLE-CALLER invariant → v0.7+ production-cycle user-choice configuration); Path (iii) 2-mode collapse + 1 legacy alias deprecation cycle locked; 5-refinement framing applied (Historical context + graduation narrative + user-choice framing + Rationale split + Revision history graduation framing); Q1.0.4 + Q1.0.8 lock revisions captured per substrate-evolution drift Path C framework |

#### ADR-02 amendment — 5 substantive refinements applied per Travis adjudication

1. **Historical context section added** (after §Context; before
   §Decision). Captures v0.1-v0.6 research-cycle SOLE-CALLER
   invariant rationale: cost-attribution clarity for research
   methodology + reproducibility for substrate-generation thesis +
   cost-projection-vs-platform-billing 3x-reduction invariant +
   quality-axis methodology cleanly-scoped substrate. Explicit
   framing: "served research-cycle methodology, NOT production-tool
   architectural commitment."

2. **Graduation narrative added** (§Decision opening). Cross-
   references Travis pivot at v0.6 Step 7.5; explicit research-to-
   production transition: "V0.7+ ContextAtlas graduates from research
   project to production tool per launch-bearing reframe."

3. **User-choice framing added** (§Decision sub-section "User-
   choice configuration"). Captures Travis-specific framing: "path
   selection ultimately remains user configuration; system supports
   user-choice; does NOT enforce research-methodological invariant
   on production users."

4. **§Rationale split** distinguishes production-applicable query-
   time invariant rationale (load-bearing for production tool) from
   graduates-to-historical research-cycle SOLE-CALLER rationale.
   Sub-100ms latency + zero query cost + pay-once-at-index-time
   architectural promise preserved as load-bearing; research-cycle
   methodological rationale graduates to §Historical context section.

5. **§Revision history 2026-05-09 entry** captures graduation
   framing explicitly + v0.6 actual extraction behavior verification
   result + Path (iii) lock rationale + backward-compat preservation
   framing + full lock chain cross-references.

#### Path (iii) 2-mode collapse lock per v0.6 actual extraction behavior verification

V0.6 actual extraction behavior verification at Step 1.2 surface
revealed v0.6 ships `architecture` field as config-stub-only;
pipeline doesn't branch on field value; both
`"anthropic-api-claude-code"` and `"claude-code-only"` produced
identical Anthropic API direct extraction at v0.6. The
`"claude-code"` suffix in v0.6 `"anthropic-api-claude-code"` name
referred to user invocation environment (user runs contextatlas
FROM Claude Code session) NOT extraction architecture.

Path (iii) collapse-to-2-substantive-modes locked at v0.7 ship:

- **Mode A** `"claude-code-only"` — Skills mechanism; new at v0.7;
  canonical location `.claude/skills/index-atlas/SKILL.md`;
  subscription-bounded cost model; extraction 100% contained to
  Claude Code session; no Anthropic API key required.
- **Mode B** `"anthropic-api-direct"` — preserves v0.6 actual
  extraction behavior; renamed at v0.7 for naming clarity;
  pay-per-use cost model; standalone CLI; Anthropic API key
  required.
- **Legacy alias** `"anthropic-api-claude-code"` — deprecated alias
  for `"anthropic-api-direct"` (backward-compat for v0.6 users);
  stderr deprecation warning emitted on config-parse; alias removed
  at v0.8+ per honest deprecation cycle.

Backward-compat: v0.6 user configs with legacy name continue
working at v0.7 with warning; behavior unchanged.

#### Lock revisions captured (per substrate-evolution drift Path C framework)

Step 1.0 entries remain historical record of pre-Path-(iii)-
adjudication state per Path C framework lock at Q-pre-4. Step 1.2
entry captures lock revisions per current substrate state:

**Q1.0.4 RETURNS to β-3 lock.** claude-code-only default at v0.7+;
absent-means-default; init writes explicit-default. Aligns with
Travis pivot framing "claude code only is def a priority feature".
3-mode reframing turn surfaced confusion; Path (iii) collapse
returns to original Step 1.0 β-3 lock.

**Q1.0.8 REVISED to 3-flag user-choice.** `--cc-only` forces Mode A
(claude-code-only); meaningful at v0.7+; NOT deprecated. `--api-
direct` forces Mode B (anthropic-api-direct); new at v0.7. Flag-
absence selects default per config (claude-code-only per β-3).
γ-2 soft-deprecation framing was 2-mode artifact; under 3-flag
user-choice both flags stay meaningful.

**Q1.0.10 UNCHANGED.** 2 concrete Strategy implementations
(`ClaudeCodeOnlyExtractor` + `AnthropicAPIDirectExtractor`); legacy
`"anthropic-api-claude-code"` config value accepted at config-parse
time; mapped to `AnthropicAPIDirectExtractor` with deprecation
warning emission. Implementation at Step 1.3 (Strategy pattern
wrapper module) + Step 1.4 (path-routing dispatch + concrete
implementations).

**Q1.0.5 UNCHANGED.** cost_model enum: `"api"` |
`"subscription-bounded"`; no `"hybrid"` value (no hybrid mode).

#### Cycle-execution observation 8 — Travis-product-vision-clarification surface class (NEW v0.7+ inheritance pattern)

V0.7 Step 1.2 surfaced **8th recursive catch-pattern observation
class**: Travis-product-vision-clarification surface class. Mid-
design-phase Travis clarifications can surface architectural
semantics that scope-doc + design-phase adjudications didn't fully
capture (3-mode reframing turn surfaced confusion; v0.6 substrate
verification revealed Path (iii) 2-mode collapse cleanest; Q1.0.4
returns to β-3 lock; Q1.0.8 revises to 3-flag user-choice).

Generalizable v0.7+ inheritance pattern: product-vision adjudications
during design phase benefit from substrate-verification-before-
implementation-scope-expansion. Verification cost is small;
implementation scope expansion cost is large. 7-substep ladder
Q1.0.9 refinement (gate-substep treatment) generalizes to Travis-
product-vision adjudication: substrate-verify before scope-expand.

V0.7+ ship-gate working-content-gap-inventory inherits **8-class
recursive catch-pattern observation enumeration** (composes with
v0.6 7-class enumeration: 1 retrospective infrastructure-block
claims drift + 2 retrospective document-relationship-anchor claims
drift + 3 retrospective outcome-bullet pattern consistency drift +
4 retrospective version-progression narrative drift + 5 cross-
surface URL/reference style consistency + 6 substrate-evolution
drift class + 7 scope-doc-locked-but-not-shipped class + 8 Travis-
product-vision-clarification surface class).

#### Step 1.2 unblock — Step 1.3 Strategy pattern wrapper module

Step 1.3 unblocked per Q1.0.10 γ Strategy pattern lock + Path (iii)
2-mode collapse architecture:

- Define `src/extraction/extractor.ts` interface (`Extractor`
  abstract type + `ExtractorContext` dependency injection type)
- 2 concrete implementations:
  - `ClaudeCodeOnlyExtractor` (Skills path; subscription-bounded;
    no Anthropic API import; canonical location implementation
    references `.claude/skills/index-atlas/SKILL.md`)
  - `AnthropicAPIDirectExtractor` (preserves v0.6 actual extraction
    behavior; `@anthropic-ai/sdk` imports preserved; pay-per-use
    cost model)
- Config-parse layer accepts 3 config values per Path (iii) lock:
  - `"claude-code-only"` → `ClaudeCodeOnlyExtractor`
  - `"anthropic-api-direct"` → `AnthropicAPIDirectExtractor`
  - `"anthropic-api-claude-code"` (legacy) →
    `AnthropicAPIDirectExtractor` + emits stderr deprecation
    warning per Q1.0.8 lock framing
- Stub-client mock pattern per Q1.0.6 α + γ lock (path-routing-
  aware mock)
- Test coverage per CLAUDE.md src-changes-require-full-test
  discipline (1303/1303 baseline preserved + test additions for
  Strategy interface + 2 concrete implementations + config-parse
  layer with legacy alias + deprecation warning emission)

---

### Step 1.1 shipped — 2026-05-09 (Q1.0.2 verification cleared)

V0.7 Step 1.1 Q1.0.2 verification cleared cleanly (Outcome A) per
explicit gate-substep treatment locked at Step 1.0 Q1.0.9
7-substep ladder refinement. Claude Code session context API
surface verified support extraction-pipeline use case via α
Skills mechanism; PRIMARY scope proceeds normally; rescope
condition #1 NOT triggered.

Documentation reading delegated to `claude-code-guide` subagent
(specialized for Claude Code features research); subagent
reviewed official Anthropic Claude Code documentation:
- `https://code.claude.com/docs/en/skills.md` — Skills mechanism
- `https://code.claude.com/docs/en/mcp-servers.md` — MCP server
  integration
- `https://platform.claude.com/docs/en/integrations/mcp-connector.md`
  — MCP connector

| Substep | branch | commit | Notes |
|---|---|---|---|
| 1.1 Q1.0.2 verification | main | [this commit] | Outcome A cleared; α Skills (primary) + β Slash Commands (opt-in) architecture shape locked; canonical skill location `.claude/skills/index-atlas/SKILL.md`; 4-shape capability assessment table embedded below; 4 cycle-execution observations captured |

#### 4-shape capability assessment

| Shape | Mechanism Exists | Surface Prompt + Doc Content | Session Tokens (Subscription-Bounded) | Persist JSON Output | Viability |
|---|---|---|---|---|---|
| **α Skills** | ✓ Yes | ✓ Yes (dynamic context injection via `` !`command` `` syntax) | ✓ Yes (consumes Claude Code session tokens, NOT direct API tokens) | ✓ Yes (Write tool inside session) | **CLEAN FIT** |
| **β Slash Commands** | ✓ Yes (slash commands ARE skills with frontmatter; difference is invocation mechanism) | ✓ Yes (same as α) | ✓ Yes (same as α) | ✓ Yes (same as α) | **FUNCTIONALLY IDENTICAL TO α** |
| **γ Sub-process orchestration** | ✗ Doesn't fit | N/A | N/A | N/A | **NO FIT** — Claude Code has no documented IPC or parent-session-communication mechanism |
| **δ External tool (MCP) invocation** | ✗ Doesn't fit | N/A | N/A | N/A | **NO FIT** — MCP tools called BY Claude not callers OF Claude; ContextAtlas already MCP server (inverted relationship undocumented) |

#### Q1.0.2 lock — Architecture shape

**Locked:** α Skills (primary) + β Slash Commands (opt-in
invocation surface).

**Skill canonical location:** `.claude/skills/index-atlas/SKILL.md`
per existing `/claude-api` skill precedent in same project.
Substrate continuity: existing /claude-api skill provides
implementation pattern reference for index-atlas skill at Step
1.3 + Step 1.4 implementation substeps.

**Slash command surface:** ships at v0.7 alongside α Skills (no
v0.8+ deferral); β is "free" given α implementation
(skill-with-frontmatter pattern); comprehensive user-facing
surfacing benefit at v1.0 launch.

**Implementation shape per α:**
1. Package extraction prompt at `.claude/skills/index-atlas/SKILL.md`
2. Bundled helper scripts handle file walking + JSON validation
   invoked via `` !`command` `` dynamic context injection
3. Write tool persists `atlas.json` from session execution
4. User invokes skill from Claude Code session OR via slash
   command surface (β); subscription-bounded extraction execution

#### Cycle-execution observation 1 — Token consumption model verification

**Subscription-bounded cost model framing per v0.7-SCOPE.md
PRIMARY scope confirmed accurate.** Skills execute entirely
within Claude Code session tools (Bash, Edit, Read, Write);
consume Claude Code session tokens NOT direct API tokens. Q1.0.5
δ separate cost_model field lock applies — cost_usd remains
numeric ($0 for claude-code-only path); cost_model captures
subscription-bounded path semantics.

#### Cycle-execution observation 2 — β Slash Commands architectural equivalence to α Skills

**Functionally identical mechanism.** Slash commands ARE skills
with frontmatter; not separate primitive. Initial 4-shape
framing at Step 1.0 Q1.0.2 surface treated α + β as distinct
implementation shapes; verification revealed they're the same
mechanism with different invocation patterns (manual via skill
invocation vs automatic via slash command surface).

Architectural simplification: ship α Skills primary +
β Slash Commands as opt-in invocation surface in single
implementation cluster (not two separate primitives). Reduces
Step 1.3 + Step 1.4 implementation scope vs treating-as-distinct
counterfactual.

#### Cycle-execution observation 3 — γ + δ architecturally incompatible with extension model

**Both shapes ruled out at verification time.**

- **γ Sub-process orchestration:** Claude Code has no documented
  IPC or parent-session-communication mechanism. Stdio MCP
  servers run as subprocess tools but cannot callback into
  Claude Code's session for extraction calls. `contextatlas
  index` running as a subprocess cannot orchestrate Claude
  Code session token consumption from outside.
- **δ MCP invocation (inverted):** MCP tools are called BY
  Claude, not callers OF Claude. ContextAtlas is already MCP
  server; δ would invert the relationship (contextatlas
  calling Claude Code rather than Claude Code calling
  contextatlas). No documented path for inverted MCP pattern.

α + β suffice; γ + δ would have required architectural
extension to Claude Code itself (out of scope for v0.7 ContextAtlas
work). Verification-substrate ruled out shapes that require
upstream Claude Code changes.

#### Cycle-execution observation 4 — Existing /claude-api skill precedent in same project

`.claude/skills/claude-api/` (or similar location) provides
substrate continuity for index-atlas skill implementation at
Step 1.3 + Step 1.4. Pattern reference for:
- SKILL.md frontmatter structure (skill name + description)
- Bundled helper script patterns
- Dynamic context injection usage
- File persistence patterns

Substrate continuity reduces Step 1.3 wrapper module + Step 1.4
path-routing dispatch implementation friction; existing skill
provides reference implementation for index-atlas skill shape.

#### Step 1.1 unblock — Step 1.2 ADR-02 amendment

Step 1.2 ADR-02 amendment unblocked per Q1.0.11 β lock + locked
α Skills architecture shape. Substantive scope per Q1.0.1 β
lock:

- Reframe ADR-02 from "extraction is sole Anthropic API caller"
  to "extraction is sole research-time-extraction-caller;
  alternative paths permitted (Claude Code session context via
  Skills mechanism)"
- Preserve query-time-no-API-calls invariant verbatim (load-
  bearing invariant unchanged)
- Update CI enforcement grep pattern to extend permitted-modules
  framing (research-time/index-time invariant preserved;
  alternative path accommodated)
- Cross-reference α Skills architecture shape per Step 1.1
  lock
- Cross-reference v0.7-SCOPE.md PRIMARY scope + Q-pre-1 +
  Q1.0.1 + Q1.0.2 + Q1.0.11 lock chain

ADR-02 amendment text drafted inline at Step 1.2 surface
before commit per discipline #3 cadence applied to substantive
ADR amendment work (matches v0.5 + v0.6 ADR amendment surface
pattern).

---

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
