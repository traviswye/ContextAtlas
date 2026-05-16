# ContextAtlas v0.4 Step Plan

**Status:** Active execution plan for v0.4. See `## Revision history`
(bottom of document) for material scope/plan changes during execution.
**Last revised:** 2026-04-28 — initial authoring at v0.4 prep
session close. v0.4 scope per [`v0.4-SCOPE.md`](v0.4-SCOPE.md)
(commit `e8b5114`); ROADMAP rewrite per `roadmap.md`
(commit `d3d7733`). 11 numbered steps spanning Streams A/B/C +
ship gate.

**What this document is:** The execution-level plan for v0.4 — step
order, per-step ship criteria, dependencies, ownership, and progress
tracking. Mirrors STEP-PLAN-V0.3.md structure.

**What this document isn't:** The scope doc. The thesis, stream-level
deliverables, success criteria, and rescope conditions live in
[`v0.4-SCOPE.md`](v0.4-SCOPE.md). This plan *implements* that scope;
it does not redefine it.

**Responsibility split:**

- [`v0.4-SCOPE.md`](v0.4-SCOPE.md) — *what* and *why*. Stable during
  execution; changes trigger revision notes here.
- **This document** — *how* and *when*. Evolves during execution;
  material rescopes get logged in `## Revision history`.

---

## Conventions

### Step structure

Each step below has six fields:

- **Scope.** One-line statement + pointer to the `v0.4-SCOPE.md`
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
`v0.4-SCOPE.md` OR changes downstream steps' ship criteria.
Tactical adjustments (minor re-ordering within a step, timebox
tweaks) don't need revision notes — rewrite in place with rationale
in the git commit.

---

## Execution order

Streams have natural dependencies enforced by the v0.4-SCOPE.md
Sequencing section:

1. **Stream A core (Steps 1-4) must precede Stream A re-extraction
   (Step 5).** Re-extraction validates substrate-hardening + commit-
   message extraction integrate cleanly.
2. **Stream A re-extraction (Step 5) must precede Streams B + C.**
   Stream B dogfood needs hardened substrate; Stream C validity
   confirmation needs apples-to-apples atlases for re-test.
3. **Stream B dogfood (Step 7) precedes doctor script (Step 8).**
   Dogfood query result informs doctor script's "useful query"
   acceptance criterion.

Steps 1-4 are independent — can run in any order or parallel. After
Step 5 completes, Steps 6 / 7→8 / 9 fan out as parallel branches;
all converge at Step 10.

```
 [1] B2 LSP timing-race ────────┐
 [2] A4 directory exclusion ────┤
 [3] A1+A2+A7 small items ──────┤
 [4] Commit-message extraction ─┤
                                │ (Stream A core complete)
                                ↓
 [5] Stream A re-extraction (cobra → httpx → hono)
                                │ + Q3 threshold decision
                                │
                  ┌─────────────┼─────────────┐
                  ↓             ↓             ↓
                 [6]           [7]           [9]
              capacity      Stream B      Stream C
              + cost         dogfood      bounded
              disclaimer        │         validity
                  │             ↓             │
                  │            [8]            │
                  │          doctor           │
                  │          script           │
                  │             │             │
                  └─────────────┼─────────────┘
                                ↓
                         [10] Final synthesis +
                              launch-doc update
                                ↓
                         [11] v0.4 ship gate
```

Steps 1-4 may run in any order or in parallel. Step 6 is
capacity-permitting + cost-disclaimer (independent of Stream B/C).
Steps 7+8 are sequenced (dogfood → doctor script). Step 9 starts
post-Step-5 in parallel with Steps 6+7+8. All branches converge at
Step 10.

---

## Steps

### Step 1 — B2: LSP adapter timing-race robustness

**Scope.** Replace fixed-ceiling polling pattern with bounded-poll +
explicit readiness-signal across TS / Pyright / gopls adapters.
v0.3 Commit 1.5 (`04f5b9d`) shipped a symptom fix on TS only;
v0.4 generalizes the pattern. Per
[`v0.4-SCOPE.md`](v0.4-SCOPE.md) Stream A B2.

**Ship criteria.**
- [ ] **Step 1.1 — Pattern design.** Readiness-signal abstraction +
  bounded-poll wrapper documented; OQ4 resolved (unified vs
  per-adapter divergence).
- [ ] **Step 1.2 — TS adapter.** `getDiagnostics` migrated from
  v0.3's 5s timeout to bounded-poll pattern; tsserver readiness
  signal source identified + integrated.
- [ ] **Step 1.3 — Pyright adapter.** Same pattern applied;
  pyright readiness signal source identified.
- [ ] **Step 1.4 — gopls adapter.** Same pattern applied; gopls
  readiness signal source identified.
- [ ] **Step 1.5 — ADR-13/14 amendments.** If pattern affects
  documented behavior, amend ADR-13 (Pyright) + ADR-14 (gopls).
- [ ] **Step 1.6 — Test coverage.** New pattern covered across all
  three adapters; existing 810/810 PASS preserved.

**Key decisions.**
- OQ4 — bounded-poll + readiness-signal pattern unified vs
  per-adapter. Default: unified-with-per-adapter-config (per
  scope-doc rescope condition default). If divergence balloons,
  rescope condition fires (descope to TS-adapter-only per Stream A
  SC #1 explicit allowance).

**Depends on.** Nothing. Foundational Stream A item.
**Unblocks.** Step 5 (re-extraction validates substrate-hardening
doesn't break extraction).
**Owner.** Claude.
**References.** v0.4-SCOPE.md Stream A B2; ADR-13; ADR-14;
v0.3 Commit 1.5 (`04f5b9d`) symptom fix.

---

### Step 2 — A4: Directory-aware test-file exclusion

**Scope.** Replace filename-based `excludePattern` with config-driven
glob patterns supporting directory-aware exclusion. Per
[`v0.4-SCOPE.md`](v0.4-SCOPE.md) Stream A A4.

**Ship criteria.**
- [ ] **Step 2.1 — Config schema.** `.contextatlas/config.yaml`
  gains `excludePattern` glob array; per-language adapter defaults
  documented; user-override semantics explicit.
- [ ] **Step 2.2 — Implementation.** Extraction pipeline applies
  glob-based exclusion at file-discovery time; matches against
  full path not just filename.
- [ ] **Step 2.3 — Default patterns per language.** TS:
  `tests/**`, `**/test/**`, `*.test.ts(x)`, `*.spec.ts(x)`. Python:
  `tests/**`, `**/test/**`, `test_*.py`, `*_test.py`. Go:
  `*_test.go`, `tests/**` (Go's built-in test discovery handles
  most cases).
- [ ] **Step 2.4 — Test fixtures + assertions.** Each adapter's
  test-fixtures cover (a) filename-match exclusion, (b) directory-
  match exclusion, (c) user-override scenario.

**Depends on.** Nothing.
**Unblocks.** Step 5 (re-extraction picks up new exclusion behavior).
**Owner.** Claude.
**References.** v0.4-SCOPE.md Stream A A4; CLAUDE.md current
"may need explicit config in a future version" note;
Phase 8 §9.4.

---

### Step 3 — A1 + A2 + A7: Small Stream A items bundled

**Scope.** Three small Stream A items bundled per v0.3 Step 13
precedent (per-language cost priors + RUBRIC calibration in one
step). A1 plumbs priors-derived ceiling defaults; A2 adds retry-
overhead modeling; A7 surface-level cobra contamination drift
investigation with bounded-fix scope. Per
[`v0.4-SCOPE.md`](v0.4-SCOPE.md) Stream A A1, A2, A7.

**Ship criteria.**
- [ ] **Step 3.1 — A1: priors-derived ceiling defaults.** Step 13
  per-repo cost priors at the budget gate are RepoName-keyed; v0.4
  plumbs priors-derived defaults into the ceiling-default mechanism
  (~30 LOC extension per Phase 8 §9.2 estimate).
- [ ] **Step 3.2 — A2: retry-overhead modeling.** Add retry-
  probability field to cost priors with target-specific values from
  v0.3 observed-retry data (hono structural retry pattern).
- [ ] **Step 3.3 — A7: trace inspection.** Surface-level inspection
  on the 6 v0.3-flagged cobra cells vs the 4 v0.2-flagged cells;
  document finding (root cause hypothesis + supporting evidence).
- [ ] **Step 3.4 — A7: cheap fix conditional.** Fix lands ONLY if
  ≤30 LOC + no test substrate change required (Q8 lock); above-
  threshold defers to v0.5+ regardless of root-cause clarity.
- [ ] **Step 3.5 — Test coverage.** A1 + A2 changes tested at
  cost-tracking + budget-gate boundaries.

**Depends on.** Nothing.
**Unblocks.** Step 5 (re-extraction picks up new priors-derived
defaults; A7 finding documented for re-extraction context).
**Owner.** Claude.
**References.** v0.4-SCOPE.md Stream A A1/A2/A7; v0.3 Step 13
precedent; Phase 8 §9.2/§9.3; trace-analysis-supplement §7.

---

### Step 4 — Commit-message extraction implementation

**Scope.** Build commit-message extraction pipeline as new claim
source. Implementation only (validation across 3 substrates lands
in Step 5 via re-extraction). Per
[`v0.4-SCOPE.md`](v0.4-SCOPE.md) Stream A commit-message extraction
subsection.

**Ship criteria.**
- [ ] **Step 4.1 — Commit-message corpus filter.** Architectural-
  intent regex pattern: `design:`, `arch:`, `ADR-related` keywords
  starting candidates; configurable per-repo patterns; OQ5 resolved
  (default conservative — false-positives worse than false-
  negatives).
- [ ] **Step 4.2 — Git log parsing module.** Parses commit
  metadata (SHA, date, author, message) for filter-matching commits
  via `git log` invocation.
- [ ] **Step 4.3 — Claim extraction integration.** Existing
  `EXTRACTION_PROMPT` applied to commit-message corpus; same
  schema/severity/source pattern as docstring extraction.
- [ ] **Step 4.4 — Atlas integration.** New claim format
  `source: "commit:<sha>"` alongside existing `"docstring:<path>"`
  + `"ADR-NN"` shapes. Atlas exporter + importer round-trip the
  new format.
- [ ] **Step 4.5 — DESIGN.md amendment.** Document new claim source
  format (extends the existing claim-source bullet shipped in v0.3
  Step 16 Commit 1).
- [ ] **Step 4.6 — Test coverage.** Unit tests on filter regex +
  git-log-parsing + claim extraction; integration test on a small
  fixture repo.

**Key decisions.**
- OQ5 — commit-message corpus filter default conservative.
  Default-set vs strict-set: lean default-set (`design:`, `arch:`,
  `ADR-related`); strict-set is per-repo override.

**Depends on.** Nothing (parallel with Steps 1-3).
**Unblocks.** Step 5 (re-extraction integrates commit-message
claims per Q3 threshold).
**Owner.** Claude.
**References.** v0.4-SCOPE.md Stream A commit-message extraction;
v0.3 Step 11 docstring extraction precedent.

---

### Step 5 — Stream A re-extraction + Q3 threshold decision

**Scope.** Re-extract 3 v0.3 atlases at pinned v0.2 SHAs with
substrate-hardening (Steps 1-3) + commit-message claims (Step 4)
integrated. Per Step 14 cobra-first-validation precedent. Q3
threshold measurement determines integration outcomes per scope-doc
partial-pass scenarios. Per
[`v0.4-SCOPE.md`](v0.4-SCOPE.md) Stream A commit-message extraction
density threshold + Sequencing section.

**Ship criteria.**
- [ ] **Step 5.1 — Pre-flight verification.** Main-repo `npm test`
  green (810/810 PASS or post-v0.4 count); substrate-hardening
  tests cover Steps 1-3 changes.
- [ ] **Step 5.2 — Cobra re-extraction.** Per cobra-first-
  validation precedent (smallest target catches integration bugs
  at minimum cost). Atlas committed.
- [ ] **Step 5.3 — Q3 threshold measurement on cobra.** Commit-
  derived architectural-intent claim count measured; bimodal-aware
  threshold decision (≥30 with any ≥50) applied.
- [ ] **Step 5.4 — Httpx re-extraction.** Atlas committed.
- [ ] **Step 5.5 — Hono re-extraction.** Atlas committed.
- [ ] **Step 5.6 — Q3 partial-pass scenario decision.** Per scope-
  doc enumeration: all-pass / 2-of-3-pass / bimodal / all-fail.
  Decision drives which atlases ship with commit-message claims
  integrated vs docstring-only.
- [ ] **Step 5.7 — Atlas integration commits.** Per-passing-repo
  atlas commits with provenance (substrate-hardening SHAs +
  commit-message SHA + per-repo claim density measurement).

**Key decisions.**
- Q3 partial-pass outcomes per scope-doc Stream A subsection.

**Depends on.** Steps 1, 2, 3, 4.
**Unblocks.** Step 7 (Stream B dogfood needs hardened substrate);
Step 9 (Stream C validity needs hardened atlases for re-test).
**Owner.** Both (Claude implements; Travis runs API extraction +
approves Q3 decision + commits).
**References.** v0.4-SCOPE.md Stream A; v0.3 Step 14
re-extraction precedent (cobra-first-validation discipline).

---

### Step 6 — Capacity-permitting absorption + cost-projection disclaimer

**Scope.** Capacity-permitting absorption of B1 + B3 + A3 (gated on
day-3-OR-$30-spend trigger); cost-projection disclaimer ships
unconditionally in 5 user-facing surfaces. Per
[`v0.4-SCOPE.md`](v0.4-SCOPE.md) Stream A capacity-permitting
absorption + cost-projection disclaimer subsections.

**Ship criteria.**
- [ ] **Step 6.1 — Capacity trigger check.** Day 3 of v0.4
  execution OR $30 cumulative spend, whichever first. If trigger
  NOT met, B1+B3+A3 explicitly defer to v0.5+ with stamps (no
  silent absorption).
- [ ] **Step 6.2 — B1: file-case-mismatch hygiene** (if absorbed).
  Canonicalize via case-flip-via-tmp dance once cross-platform
  compat confirmed. Reusable for any other case-mismatched paths.
- [ ] **Step 6.3 — B3: npm-test discipline standard** (if
  absorbed). Document the pattern; possibly enforce via pre-commit
  hook (decision during execution).
- [ ] **Step 6.4 — A3: schema-version detection automation** (if
  absorbed). Replace hardcoded `version_label` string with atlas-
  derived detection per Phase 8 §9.1.
- [ ] **Step 6.5 — Cost-projection disclaimer in 5 surfaces.**
  `extract-benchmark-atlas.mjs` console output + `run-reference.ts`
  console output + README + CLAUDE.md cost framing + RUBRIC.md
  cost-priors section caveat. Unconditional ship; not gated on
  capacity.

**Key decisions.**
- Capacity trigger check happens during this step; result drives
  6.2/6.3/6.4 ship vs defer.

**Depends on.** Step 5 (capacity-permitting absorption decision
needs Stream A core landed).
**Unblocks.** Step 11 (ship gate).
**Owner.** Both (Claude drafts + commits; Travis approves capacity
trigger).
**References.** v0.4-SCOPE.md Stream A capacity-permitting
absorption; cost-projection disclaimer Q5 lock.

---

### Step 7 — Stream B dogfood (contextatlas-on-itself extraction)

**Scope.** Run full extraction pipeline on contextatlas main repo;
verify atlas valid; concrete `get_symbol_context` query yielding
useful architectural-intent bundle for launch-doc material. Per
[`v0.4-SCOPE.md`](v0.4-SCOPE.md) Stream B dogfood subsection.

**Ship criteria.**
- [ ] **Step 7.1 — Run extraction on contextatlas main repo.**
  Atlas extracted at HEAD; cost recorded.
- [ ] **Step 7.2 — Atlas verification.** atlas.json schema valid
  (v1.3) + sentinel symbol present + claim count >0 + provenance
  populated (commit_sha + extraction_model).
- [ ] **Step 7.3 — Concrete query selection.** OQ3 resolved:
  `LspClient` / `runExtractionPipeline` / `LanguageAdapter`
  candidate decided based on bundle quality + launch-doc material
  value.
- [ ] **Step 7.4 — Capture query result.** Query result captured
  for launch-doc "How I would use this on my codebase" section
  material. Not a test artifact; a demonstration artifact.

**Key decisions.**
- OQ3 — concrete dogfood query selection.

**Depends on.** Step 5 (need hardened substrate + commit-message
extraction available).
**Unblocks.** Step 8 (doctor script's "useful query" criterion
informed by dogfood query result); Step 11.
**Owner.** Both (Claude implements; Travis runs API extraction +
commits).
**References.** v0.4-SCOPE.md Stream B dogfood; OQ3.

---

### Step 8 — Stream B doctor script implementation + acceptance test

**Scope.** Doctor script CLI subcommand with diagnostic-only checks;
acceptance test green on contextatlas-on-itself + cobra HEAD. Per
[`v0.4-SCOPE.md`](v0.4-SCOPE.md) Stream B doctor script subsection.

**Ship criteria.**
- [ ] **Step 8.1 — Doctor script CLI surface.** OQ1 resolved:
  `contextatlas doctor` subcommand vs separate binary. Default
  lean (a) — subcommand on existing CLI.
- [ ] **Step 8.2 — Diagnostic checks.** Six checks: config present
  + atlas exists + atlas pinned SHA matches HEAD (or N commits
  behind) + atlas schema version current (v1.3+) + LSP server
  installed/working + extraction-prerequisites present.
- [ ] **Step 8.3 — Output format.** OQ2 resolved: text-primary
  + `--json` flag for machine output. PASS/WARN/FAIL per check
  + actionable next-step text on FAIL/WARN.
- [ ] **Step 8.4 — Acceptance test on contextatlas-on-itself.**
  Doctor script reports green on contextatlas (substrate-hardening
  + dogfood loop closed).
- [ ] **Step 8.5 — Acceptance test on cobra HEAD.** Confirmation
  gate per Q2: cobra HEAD ≠ pinned v0.2 SHA `88b30ab8` at
  execution. If equal, switch to httpx HEAD or pull cobra to
  recent post-pinning SHA.
- [ ] **Step 8.6 — Test coverage.** Unit tests on each diagnostic
  check + integration test on full doctor-script invocation
  surface.

**Key decisions.**
- OQ1 — doctor script CLI surface.
- OQ2 — doctor script output format.

**Depends on.** Step 7 (dogfood substrate informs "useful query"
acceptance criterion).
**Unblocks.** Step 11 (ship gate).
**Owner.** Both (Claude implements + tests; Travis runs cobra HEAD
acceptance test).
**References.** v0.4-SCOPE.md Stream B doctor script; OQ1, OQ2;
Q2 acceptance test lock.

---

### Step 9 — Stream C bounded validity confirmation

**Scope.** Re-run 5 high-leverage Phase 8 cells under n=2 trials
each; trial-variance measurement; Phase 8.5 supplement OR
amendment per OQ6. NOT full quality-axis methodology. Per
[`v0.4-SCOPE.md`](v0.4-SCOPE.md) Stream C.

**Ship criteria.**
- [ ] **Step 9.1 — Cell selection finalization.** 5 cells per Q1
  lock: p4-stream-lifecycle + 3 win-bucket cells (one per repo;
  highest-token-reduction per repo) + cobra c4-subcommand-
  resolution.
- [ ] **Step 9.2 — Trial 1 execution.** All 5 cells run once
  against v0.4 re-extracted atlases. Per-cell tokens / calls /
  cost recorded.
- [ ] **Step 9.3 — Trial 2 execution.** All 5 cells re-run.
  Per-cell metrics recorded.
- [ ] **Step 9.4 — Trial-variance measurement + analysis.**
  Variance across trials per cell; confidence framing
  ("findings replicate within ±X%"). Decision point: if >20%
  divergence on multiple cells, expand to n=3 on divergent cells
  (~$5-8 additional); if >50% divergence, escalate to full
  quality-axis methodology evaluation per scope-doc rescope
  condition.
- [ ] **Step 9.5 — Phase 8.5 supplement OR amendment.** OQ6
  resolved: amendment to existing supplement (<100 LOC) vs new
  doc.
- [ ] **Step 9.6 — Theme 2.2 asymmetric-depth note.** Explicit
  framing per Q1 lock: "Theme 2.2 falsification finding remains
  'consistent with single-run result' under v0.4 bounded validity
  rather than 'rigorously re-tested'; full hypothesis revisitation
  per A6 deferred to v0.5+."

**Key decisions.**
- OQ6 — supplement amendment vs new doc.
- Theme 2.2 asymmetric depth (Q1 refinement lock).
- Step 9.4 divergence escalation: 20% expand to n=3; 50% escalate
  to full quality-axis methodology evaluation.

**Depends on.** Step 5 (hardened substrate required for
apples-to-apples).
**Unblocks.** Step 10 (synthesis absorbs Stream C findings).
**Owner.** Both (Claude implements measurement scripts; Travis
runs API trials + commits).
**References.** v0.4-SCOPE.md Stream C; Phase 8 + supplement;
Q1 lock.

---

### Step 10 — Final synthesis + launch-document personal-notes update

**Scope.** Synthesize v0.4 cycle outcomes; Stream B dogfood + Stream
C validity material absorbs into Travis's launch-document personal
notes (outside repo). Per
[`v0.4-SCOPE.md`](v0.4-SCOPE.md) success criterion #8.

**Ship criteria.**
- [ ] **Step 10.1 — Stream B dogfood material → launch-doc.**
  Concrete `get_symbol_context` query result + bundle excerpt
  captured for "How I would use this on my codebase" section.
- [ ] **Step 10.2 — Stream C validity findings → launch-doc.**
  Trial-variance summary supports launch-doc credibility line:
  "v0.3 findings replicate within trial variance; full quality-
  axis blind-grading methodology is v0.5+ scope."
- [ ] **Step 10.3 — Cost transparency section → launch-doc.**
  Cost-projection disclaimer framing absorbed into launch-doc
  cost-story section.
- [ ] **Step 10.4 — v0.4 cycle outcomes synthesis.** 3-stream
  closure summary; Q3 outcome framing; capacity-permitting status;
  v0.4 → v0.5+ trigger evaluation.
- [ ] **Step 10.5 — Launch-doc personal-notes update.** Travis-
  owned artifact (outside repo per Option B); not committed but
  referenced as v0.4 success-criterion artifact.

**Depends on.** Steps 7, 8, 9.
**Unblocks.** Step 11.
**Owner.** Travis (launch-doc is personal notes; Claude provides
material).
**References.** v0.4-SCOPE.md success criterion #8; launch-doc
Option B framing.

---

### Step 11 — v0.4 ship gate

**Scope.** v0.4 ship gate; matches v0.3 Step 16 ship-gate pattern.
Doc refresh + version bump + STEP-PLAN-V0.4 stamp + annotated tag
v0.4.0. Per [`v0.4-SCOPE.md`](v0.4-SCOPE.md) success criteria
#9-#10.

**Ship criteria.**
- [ ] **Step 11.1 — Doc refresh bundle.** README + ROADMAP +
  DESIGN + CLAUDE.md updated for v0.4 ship per v0.3 Step 16
  Commit 1 pattern. Production-tool framing carried forward;
  methodology limits surfaced honestly; no quality-axis claims.
- [ ] **Step 11.2 — Test suite green pre-bump.** Main-repo
  `npm test` green (810/810 PASS or post-v0.4 count); benchmarks-
  repo green.
- [ ] **Step 11.3 — package.json bump 0.3.0 → 0.4.0.** Travis-
  owned per ownership split.
- [ ] **Step 11.4 — STEP-PLAN-V0.4 progress log Step 11 stamp.**
  Closeout stamp documenting all 11 ship criteria + v0.4 cycle
  closure.
- [ ] **Step 11.5 — Annotated tag v0.4.0.** Tag message drafted
  by Claude; Travis approves before tagging. Push tag to origin.
- [ ] **Step 11.6 — All commits pushed.** v0.4 cycle definitively
  closes when origin reflects the tag.

**Key decisions.**
- Per-commit ladder shape (likely 4-5 commits matching v0.3
  Step 16 pattern: doc refresh + maybe-fix-commit + version bump
  + stamp + tag).

**Depends on.** Steps 6, 10.
**Unblocks.** v0.4 closure; v0.5+ planning queues next session.
**Owner.** Both (Claude drafts doc updates + stamp + tag message;
Travis approves + bumps + tags + pushes).
**References.** v0.4-SCOPE.md success criteria #9-#10; v0.3 Step
16 ship-gate pattern.

---

## Progress log

*Entries added in reverse-chronological order as steps ship.*

### Step 11 shipped — 2026-04-29 (this commit + tag `v0.4.0`)

**Scope.** Final v0.4 step. Verify all v0.4-SCOPE.md success
criteria met; refresh CLAUDE.md current-version + ROADMAP cycle-
close + STEP-PLAN-V0.4 progress log + v0.4-SCOPE cycle-close;
bump package.json `0.3.0` → `0.4.0`; annotated tag `v0.4.0`.
Single-ship-commit pattern (Travis Step 11 framing; v0.3 used
4-commit ladder, v0.4 simplifies). Self-use atlas refreshed at
Step 10 substrate SHA (`8e20aae`) BEFORE this commit per Step
11 sequencing — atlas captures final substrate state; ship
commit adds doc refreshes + version bump only.

**Outcome — v0.4 SHIPPED.** All 10 v0.4-SCOPE.md success criteria
satisfied. Three streams delivered: Stream A substrate hardening
+ commit-message extraction + cost-projection disclaimer; Stream
B contextatlas-on-itself dogfood + diagnostic-only doctor
script; Stream C bounded-validity matrix-run replication. Four
named findings (filter-shape vs content-richness VALIDATED; Q3
bifurcated reading SHIPPED; bounded-validity CONFIRMED; cost
3x systematic VALIDATED). Cumulative spend $43.80 script /
~$14.50 platform — comfortably below $50 ceiling.

**Cycle close — process-hygiene notes (absorbed from Step 10.1).**

*Methodological process notes (5):*

1. `parser.test.ts` hardcoded valid-keys regex fragility recurred
   at Steps 2 + 4. Test-as-mirror-of-implementation, brittle by
   construction. Lifted to v0.5+ candidate #7 (schema-driven
   test data generation).
2. Pipeline-integration scope confusion discipline: when wiring
   a new claim source into existing pipeline, verify by reading
   precedent integration before drafting new one — don't assume
   symmetry. Saved one rework cycle each time at Steps 5 + 7.
   Lifted to v0.5+ candidate #8 (formalize in CLAUDE.md as
   checked invariant).
3. v0.X-tagged script modification discipline established:
   `v0.4-stepN-*.mjs` scripts are step-bound substrate;
   substantive modifications after step closes get new script +
   shared utility, not in-place rewrites. Step 5.7 atlas content
   drop honored this pattern.
4. Trace-analysis amendments benefit from set-difference framing
   (which cells are in/out of the band) over aggregate-Δ-only
   framing. Step 9 §8 amendment used per-cell variance +
   outlier-classification rather than median-only.
5. Cost-projection vs platform-billing systematic 3x discrepancy
   measured at Step 5 across 3 reference targets; validates Q5
   lock (don't tune projection math toward platform-actuals;
   pricing volatility makes maintenance a liability). Disclaimer
   landed in 5 user-facing surfaces at Step 6.

*Empirical findings (4):*

1. Filter-shape vs content-richness distinction (Stream C commit-
   message filter is conventional-commits-prefix-anchored;
   substrate not following convention under-captures: 5/129 =
   3.9% selectivity in self-use vs design-target ~30%). Filter
   correct *for its target corpus*; corpus-fit is v0.5+
   concern (candidate #5).
2. Q3 bifurcated reading (B3 lock): single ≥50-claims gate
   refined to ≥30 floor (per-repo atlas-content gate) + ≥50
   ceiling (launch-narrative gate). Both honored independently;
   hono integrated 31 above floor; cobra/httpx Stream C dropped
   below floor; aggregate +31 puts 3-repo total above ≥50
   ceiling.
3. Cache-discount ratio range 2-3x driven by per-file
   documentation density (adapter files with rich JSDoc burn
   more uncached tokens per Stream B call; dogfood ratio 2x vs
   benchmark-target 3x).
4. Three-measurement variance convergence on ~4-13% replication-
   noise-floor: extraction-side ~4% (Step 5 httpx Stream B
   re-run vs v0.3 baseline) + matrix-run-side tokens 4.4%
   (Step 9 median across 5 cells) + cost-side 8.4% (Step 9
   median across 5 cells). Independent dimensions land in same
   band; substantiates bounded-validity claim.

*Investigation-discipline patterns (3):*

1. Empirical fact-check before locking hypothesis. Step 4
   attribution reframe: original hypothesis ("LLM-drafted
   commits richer than human-drafted") falsified by data already
   on disk before Travis approved design. No API spend; no
   fictional rework.
2. Stochastic vs deterministic distinction via diagnostic-
   before-rerun. Step 5 httpx 24-error spike: 3-sample
   diagnostic with full instrumentation rather than blind full
   re-run. Result: 0/2 valid samples reproduced → classified
   transient → full re-run cleared cleanly. Cost: 3 samples
   vs full re-run.
3. Investigation-before-implementation discipline. Step 1.1b
   probe (LSP timing race characterization) and Step 4 ADR-
   style attribution reframe both pre-empted design errors.
   Pattern: when a step proposes a fix, run a sub-step probe
   first to confirm diagnosis, not just symptom.

**Step-by-step cycle summary:**

- **Step 1 (B2 LSP timing-race robustness).** Two-readiness-
  signals architecture (`waitForServerReady` + `waitForDiagnostics`)
  across 3 adapters (TS / pyright / gopls); ADR-18 captures
  cross-cutting pattern; 3000ms ceiling tuned for vitest 5s
  test timeout fit; two-condition short-circuit (skip
  waitForServerReady when warmup opens 0 files OR no
  tsconfig/jsconfig present).
- **Step 2 (A4 directory-aware test-file exclusion).** Replaces
  filename-based exclusion; conservative defaults ship per-
  language (`*.test.ts` etc. for TS; `tests/` + `test_*.py` /
  `*_test.py` for Python). minimatch-direct integration in
  `walkSourceFiles`.
- **Step 3 (A1 + A2 priors-derived ceilings + retry-overhead).**
  `RETRY_OVERHEAD_V0_3` constant + `lookupCostPriorWithRetry`
  + `projectedCeilingForRepo` in benchmarks harness.
- **Step 4 (commit-message extraction).** Third claim source
  alongside ADR + docstring; ADR-style attribution reframe
  (commits as architectural-intent statements, not code-change
  log); `DEFAULT_SUBJECT_PREFIX_PATTERNS` +
  `DEFAULT_BODY_ANYWHERE_PATTERNS` conservative-default filter.
- **Step 5 (Stream A re-extraction).** cobra/httpx/hono atlases
  at v0.4 substrate. Q3 bifurcated reading: hono integrates 31
  commit claims above ≥30 floor; cobra/httpx commit claims
  dropped below floor via post-process script. httpx 24-error
  transient classified + cleared via 3-sample diagnostic +
  re-run. $24.43 script-projected.
- **Step 6 (cost-projection disclaimer + capacity absorption).**
  5-surface disclaimer landed (`extract-benchmark-atlas.mjs`
  console + `run-reference.ts` console + README + CLAUDE.md +
  RUBRIC.md). Concrete 3x measurement data anchor:
  cobra/httpx/hono cache-discount ratios.
- **Step 7 (contextatlas-on-itself dogfood).** `dogfood-extract.mjs`
  orchestrator (~210 LOC); 3-stream extraction; 743 symbols /
  822 claims at SHA `32deffe`. Filter-shape vs content-richness
  finding empirically surfaces here.
- **Step 8 (doctor script).** Diagnostic-only foundation; 5
  categories (config / atlas / sha / lsp / extraction); 17-21
  checks; limited-mode for unconfigured repos; text + JSON
  output. ~1267 LOC across `src/doctor/` tree.
- **Step 9 (bounded-validity matrix-run).** 5 cells × n=2 trials;
  BOUNDED outcome per scope-doc Step 9.4 lock; supplement
  amendment §8 (~140 LOC) lands in benchmarks repo
  (`phase-8-trace-analysis-supplement.md`); commit `2efc7ba`.
- **Step 10 (synthesis).** v0.5+ candidate seeding
  (`research/v0.5-candidates.md`; 13 candidates renumbered
  consecutively); Step 11 prep checklist
  (`research/v0.4-step11-prep-checklist.md`); ROADMAP refresh.
  Commit `8e20aae`.
- **Step 11 (this commit, ship gate).** Self-use atlas refresh
  at SHA `8e20aae` (768 symbols / 825 claims; +0.4% claims vs
  Step 7 baseline within ~4-13% noise floor; $7.56 script /
  ~$2.50 platform). Doc refreshes + version bump + tag.

**Ship-criteria verification:**

- ✅ Stream A substrate-hardening complete (B2 + A4 + A1 + A2);
  A7 cobra contamination drift root-cause documented as v0.5+
  candidate (within scope-doc descope clause).
- ✅ Stream A commit-message extraction shipped per Q3 outcome
  (hono integrated; cobra/httpx dropped per ≥30 floor; B3
  bifurcated reading honored).
- ✅ Stream A cost-projection disclaimer in 5 surfaces.
- ✅ Stream B dogfood + doctor shipped; doctor green on
  contextatlas + cobra HEAD acceptance.
- ✅ Stream C bounded validity confirmed (5 cells × n=2; BOUNDED;
  supplement §8 amendment).
- ✅ No quality-axis claims published (v0.5+ scope explicit).
- ✅ Backlog discipline preserved (`research/v0.5-candidates.md`
  is canonical reference; 13 candidates with explicit
  placement criteria).
- ✅ Launch-document personal notes Travis-owned outside repo
  per Option B.
- ✅ Test suites green pre-bump: main 859/859 PASS; benchmarks
  252/252 PASS + 9 skipped integration.
- ✅ Standard ship-gate: package.json bump `0.3.0` → `0.4.0`;
  annotated tag `v0.4.0`; STEP-PLAN-V0.4.md progress log
  complete (this entry); all commits pushed.

---

## Revision history

- **2026-04-28** — Initial drafting at v0.4 prep session close.
  11 numbered steps spanning Streams A/B/C + ship gate. Mirrors
  STEP-PLAN-V0.3.md structure. Drafted per
  [`v0.4-SCOPE.md`](v0.4-SCOPE.md) (commit `e8b5114`) Sequencing
  section + structure proposal locks (D1-D7 approved with parallel-
  branch diagram refinement + Step 9.4 divergence-escalation
  refinement per Travis turn analysis).
