# ContextAtlas v0.2 Step Plan

**Status:** Active execution plan for v0.2. See `## Revision history`
(bottom of document) for material scope/plan changes during execution.

**What this document is:** The execution-level plan for v0.2 — step
order, per-step ship criteria, dependencies, and progress tracking.

**What this document isn't:** The scope doc. The thesis, stream-level
deliverables, success criteria, and rescope conditions live in
[`v0.2-SCOPE.md`](v0.2-SCOPE.md). This plan *implements* that scope;
it does not redefine it.

**Responsibility split:**

- [`v0.2-SCOPE.md`](v0.2-SCOPE.md) — *what* and *why*. Stable during
  execution; changes trigger revision notes here.
- **This document** — *how* and *when*. Evolves during execution;
  material rescopes get logged in `## Revision history`.

---

## Conventions

### Step structure

Each step below has four fields:

- **Scope.** One-line statement + pointer to the `v0.2-SCOPE.md`
  section it implements.
- **Ship criteria.** Concrete checkboxes, each verifiable via a
  committed artifact, passing test, or landed ADR. Vague criteria
  ("feature works") are not valid; they hide incomplete shipping.
- **Key decisions.** Choices that surface during execution. Not
  every step has them. When present, the decision itself becomes a
  progress-log note at ship time.
- **Depends on / unblocks.** Explicit step numbers. Drives the
  execution-order diagram below.

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
`v0.2-SCOPE.md` OR changes downstream steps' ship criteria.
Tactical adjustments (minor re-ordering within a step, timebox
tweaks) don't need revision notes — rewrite in place with rationale
in the git commit.

---

## Execution order

Stream A completes before Go adapter work begins in earnest
(steps 1–4 → step 8). httpx reference run slots between Stream A
completion and Go adapter work (steps 5, 6). MCP disclaimer
investigation (step 7) is parallelizable with the Go track.

```
 [1] PyrightAdapter refinements ─┐
 [2] Cost tracking ───────────────┤
 [3] Verbose diagnostics ─────────┤
 [4] TS parity check ─────────────┤
                                  │
                                  ├─→ [5] Re-extract httpx atlas
                                  │         │
                                  │         ↓
                                  │   [6] httpx reference run
                                  │         │
                                  │         ↓ (independent of Go track)
                                  │
                                  └─→ [8] Go LSP probe + ADR
                                            │
                                            ↓
                                      [9] GoAdapter impl + conformance
                                            │
                                            ↓
                                      [10] Cobra benchmark target
                                            │
                                            ↓
                                      [11] Go dogfood + Go reference run
                                            │
 [7] MCP disclaimer (parallelizable; ~2-day timebox)
                                            │
                                            ↓
                                      [12] v0.2 ship gate
```

Steps 1–3 parallelizable; step 4 depends on step 1 (refined
PyrightAdapter informs TS comparison baseline). Step 5 gates on
steps 1–3. Step 7 can start any time Stream A work is in flight.
Step 8 is parallelizable with step 4 (probe is read-only; cannot
destabilize Stream A) — practical earliest start is after steps
1–3. Steps 9–11 sequential within the Go track; step 9 gates on
Stream A complete. Step 12 gates on everything.

---

## Steps

### Step 1 — PyrightAdapter kind-mapping refinements

**Scope.** Fix kind-mapping gaps surfaced during v0.1 httpx dogfood:
`__all__` module list, enum class members, dunder methods. Per
[v0.2-SCOPE.md Stream A #1](v0.2-SCOPE.md).

**Ship criteria.**
- [ ] `__all__` module list resolves to `variable` kind (currently
  `class`).
- [ ] Enum class members (e.g. `CLOSED`, `UNSET`) resolve to a
  coherent kind (either `variable` or new `enum_member`, per key
  decision below).
- [ ] Dunder methods (`__aenter__`, `__enter__`, etc.) resolve to
  `method` kind (currently sometimes `class` via nested-children).
- [ ] Post-filter algorithm covered by unit tests against fixture
  Python source.
- [ ] If new `enum_member` SymbolKind added: ADR-14 landed;
  ADR-01 amended to include it.
- [ ] Conformance suite passes for PyrightAdapter.
- [ ] No regression in TypeScriptAdapter tests.

**Key decisions.**
- Add `enum_member` as new SymbolKind (semantic, but cascades into
  ADR-01 + symbol ID format considerations) OR remap to `variable`
  (simpler, lossier). Default lean: remap to `variable` unless
  conformance reveals semantic value in distinguishing enum
  members. Log decision in progress entry.

**Depends on.** Nothing.
**Unblocks.** Step 4, step 5.
**References.** ADR-01, ADR-13, v0.2-SCOPE.md Stream A #1.

---

### Step 2 — Cost tracking in extraction pipeline

**Scope.** Accumulate per-run cost and token usage from Anthropic
SDK responses; surface in CLI output per ADR-12 contract; add
budget-warning mechanism. Per
[v0.2-SCOPE.md Stream A #2](v0.2-SCOPE.md).

**Ship criteria.**
- [ ] `response.usage` accumulated across all Anthropic API calls
  in an extraction run.
- [ ] `cost_usd`, `input_tokens`, `output_tokens` fields in
  `contextatlas index` stdout summary.
- [ ] Same fields in `--json` output.
- [ ] Budget warning mechanism shipped (exact surface per key
  decision below).
- [ ] Warning fires when cumulative cost exceeds configured
  ceiling; tested.
- [ ] Cost-tracking interface documented in ADR-12 amendment OR
  separate operational note.

**Key decisions.**
- Budget-warning surface: config field (`extraction.budget_warn_usd`)
  vs CLI flag (`--max-cost`) vs both. Lean: config + CLI override,
  matching most tooling conventions. Confirm during implementation.

**Depends on.** Nothing (parallel to steps 1 and 3).
**Unblocks.** Step 5 (extraction runs during v0.2 benefit from cost
visibility).
**References.** ADR-12, v0.2-SCOPE.md Stream A #2.

---

### Step 3 — Verbose diagnostics mode

**Scope.** `--verbose` flag on `contextatlas index` that lists
specific unresolved tokens with their source claims, replacing the
v0.1 count-only reporting. Per
[v0.2-SCOPE.md Stream A #3](v0.2-SCOPE.md).

**Ship criteria.**
- [ ] `--verbose` flag accepted by `contextatlas index`.
- [ ] Output lists specific unresolved token strings (not just
  counts).
- [ ] Each unresolved token attributed to its source claim
  (claim ID or excerpt + source file).
- [ ] Output format documented in ADR-12 amendment or inline
  `--help`.
- [ ] Tests cover flag against a fixture with known-unresolved
  candidates.

**Key decisions.** None expected.

**Depends on.** Nothing (parallel to steps 1 and 2).
**Unblocks.** Step 5 (httpx re-extraction benefits from
unresolved-token visibility).
**References.** v0.2-SCOPE.md Stream A #3.

---

### Step 4 — TypeScriptAdapter parity check

**Scope.** Systematic pass running the Python-adapter dogfood query
set against the TypeScript adapter via the hono atlas. Identify and
fix any Python-only affordances missing in TS. Per
[v0.2-SCOPE.md Stream A #4](v0.2-SCOPE.md).

**Ship criteria.**
- [ ] Full Python-adapter dogfood query set executed against hono
  atlas; results archived.
- [ ] Parity gaps documented (each gap: what's present in Pyright,
  absent in tsserver, or vice versa).
- [ ] For each gap: either fix landed OR explicit deferral note
  with version annotation.
- [ ] Conformance suite extended with any new parity tests
  surfaced by the pass.
- [ ] No regression in either PyrightAdapter or TypeScriptAdapter
  test suite.

**Key decisions.**
- Scope of any identified gap's fix: v0.2 Stream A vs defer to
  v0.3+. Defer decision driven by fix size + benchmark evidence of
  impact.

**Depends on.** Step 1 (PyrightAdapter refined — stable comparison
baseline).
**Unblocks.** Nothing directly; closes Stream A adapter track.
**References.** ADR-03, v0.2-SCOPE.md Stream A #4.

---

### Step 5 — Re-extract httpx atlas against refined PyrightAdapter

**Scope.** Run `contextatlas index --full` on httpx against the
Stream A-refined adapter. Produces the atlas that step 6's
reference run measures. Per
[v0.2-SCOPE.md Stream B #7](v0.2-SCOPE.md).

**Ship criteria.**
- [ ] httpx atlas re-extracted with refined PyrightAdapter (steps
  1–3 shipped).
- [ ] Atlas committed to benchmarks repo at
  `atlases/httpx/` with provenance note (contextatlas commit SHA
  + httpx pinned commit SHA).
- [ ] Atlas diff against v0.1 httpx atlas reviewed; every
  non-trivial kind change (`class`→`variable`, `class`→`method`,
  etc.) traced to a Stream A refinement. Unexplained changes
  investigated before proceeding.
- [ ] Cost-tracking output captured (uses step 2 capability).
- [ ] Unresolved-candidate diff reviewed via step 3's verbose mode;
  no regressions.

**Key decisions.** None expected.

**Depends on.** Steps 1, 2, 3 (refined adapter + cost + diagnostics).
**Unblocks.** Step 6.
**References.** ADR-06, v0.2-SCOPE.md Stream B #7.

---

### Step 6 — httpx reference run + synthesis note

**Scope.** Execute Phase-5-style reference run protocol on httpx:
four conditions (alpha / ca / beta / beta-ca) × six pre-registered
prompts. Commit artifacts in benchmarks repo. Write synthesis note
comparing hono and httpx efficiency patterns. Per
[v0.2-SCOPE.md Stream B #8–10](v0.2-SCOPE.md).

**Ship criteria.**
- [ ] Budget ceiling pre-set before run (target ~$15–16 per Phase
  5 blended rates).
- [ ] `runs/reference/httpx/` populated: `summary.md`,
  `run-manifest.json`, per-cell JSON traces (24 cells, one per
  prompt-condition combination).
- [ ] Synthesis note committed at
  `research/phase-6-httpx-reference-run.md` (naming per key
  decision below).
- [ ] Synthesis includes per-prompt efficiency table, win/tie/
  trick bucket replication analysis vs hono, caveats.
- [ ] v0.2-SCOPE.md Success Criterion 3 satisfied ("artifacts
  committed with Phase-5-comparable data shape").

**Key decisions.**
- Synthesis doc naming: `phase-6-httpx-reference-run.md` (follows
  Phase 5 convention) vs content-named. Default: phase-numbered,
  matching `research/phase-5-reference-run.md`. Confirm at write
  time.

**Depends on.** Step 5.
**Unblocks.** Nothing on critical path; delivers v0.2 cross-repo
validation.
**References.** RUBRIC.md, `research/phase-5-reference-run.md` as
template, v0.2-SCOPE.md Stream B #8–10.

---

### Step 7 — MCP disclaimer investigation

**Scope.** Investigate Claude Code CLI's "I don't have permission to
use the ContextAtlas tools" preamble on beta-ca cells despite
successful MCP calls. 2-day advisory timebox. Per
[v0.2-SCOPE.md Stream A #5](v0.2-SCOPE.md).

**Ship criteria** (one of two paths).

*Path (a) — root-cause and fix:*
- [ ] Root cause identified and documented.
- [ ] Fix landed at our layer (spawn flags, response-shape
  adjustment, or similar).
- [ ] Regression test added ensuring beta-ca output no longer
  carries the disclaimer.

*Path (b) — document as known issue:*
- [ ] Investigation findings documented (hypotheses tested,
  evidence for/against each).
- [ ] README or troubleshooting section describes the behavior +
  user workaround.
- [ ] Upstream tracking pointer (GitHub issue, Claude Code repo,
  or similar) if appropriate.

*Always:*
- [ ] Either (a) or (b) landed; investigation closed.
- [ ] Timebox observed — if still investigating past ~2 days, pick
  (b) and move on.

**Key decisions.**
- (a) vs (b): depends on probe findings. No pre-commitment.

**Depends on.** Nothing (parallelizable — can run concurrently
with steps 8–11).
**Unblocks.** Nothing on critical path; closes Stream A.
**References.** Phase 5 §4.3, §7.2, v0.2-SCOPE.md Stream A #5.

---

### Step 8 — Go LSP probe + ADR-N

**Scope.** Empirical probe of `gopls` capabilities following
ADR-13's pattern. Land ADR-N documenting gopls as the Go adapter's
LSP choice, capturing probe findings. Per
[v0.2-SCOPE.md Stream B #1–2](v0.2-SCOPE.md).

**Ship criteria.**
- [ ] Probe fixture committed (small Go project + probe script)
  under `docs/adr/` or `scripts/` as appropriate.
- [ ] Probe findings document committed (empirical capture,
  pre-ADR-N, mirroring `pyright-probe-findings.md`).
- [ ] ADR-N landed documenting gopls choice, LSP method coverage,
  and any gopls-specific quirks the adapter must work around.
- [ ] Probe confirms ADR-03 interface fits without fundamental
  incompatibility.

**Key decisions.**
- Probe scope: minimum gopls methods required to validate
  viability. At minimum (six methods): `initialize`,
  `textDocument/documentSymbol`, `textDocument/definition`
  (foundational for `findReferences` contract per ADR-13 Pyright
  precedent), `textDocument/references`,
  `textDocument/publishDiagnostics`, `shutdown`. Expand only if
  probe reveals questions.
- If incompatibility found: trigger rescope per v0.2-SCOPE.md
  rescope conditions. Do not proceed to step 9.

**Depends on.** Parallelizable with step 4 — probe is read-only
and cannot destabilize Stream A. Step 9 (implementation) still
gates on Stream A complete, but step 8 does not. Practical
earliest start: as soon as steps 1–3 land a stable PyrightAdapter
baseline, though even that is not a hard technical dependency.
**Unblocks.** Step 9.
**References.** ADR-03, ADR-13, v0.2-SCOPE.md Stream B #1–2.

---

### Step 9 — GoAdapter implementation + conformance

**Scope.** Build `GoAdapter` against gopls; pass the existing
conformance suite. Per
[v0.2-SCOPE.md Stream B #3–4](v0.2-SCOPE.md).

**Ship criteria.**
- [ ] `src/adapters/go-adapter.ts` (or equivalent path) implementing
  the `LanguageAdapter` interface from `src/types.ts`.
- [ ] All five data methods working against Go fixtures:
  `listSymbols`, `getSymbolDetails`, `findReferences`,
  `getDiagnostics`, `getTypeInfo` (per ADR-07 contract).
- [ ] Lifecycle methods `initialize` and `shutdown` implemented per
  interface contract.
- [ ] Conformance suite passes for GoAdapter with no
  language-specific special-casing in the suite itself.
- [ ] Go-specific kind mappings documented (interfaces, struct
  methods, receiver methods, etc.).
- [ ] No circular dependencies introduced; adapter → core → storage
  direction preserved.
- [ ] v0.2-SCOPE.md Success Criterion 2a ("Go adapter shipped with
  conformance suite passing") satisfied.

**Key decisions.**
- Go-specific kind mappings not covered by existing SymbolKind
  enum (e.g., how to represent Go interfaces vs structs). Default:
  reuse existing enum; add new kinds only if conformance forces it.
- Whether conformance suite needs extension for Go (open question
  #1 in v0.2-SCOPE.md). Expected answer: no, but confirm.

**Depends on.** Step 8.
**Unblocks.** Steps 10, 11.
**References.** ADR-03, v0.2-SCOPE.md Stream B #3–4.

---

### Step 10 — Cobra benchmark target registration

**Scope.** Register cobra as the Go benchmark target — author ADRs,
write prompts, pin commit SHA, add to RUBRIC. Cobra-viability gate
happens here; if cobra's architecture turns out too flat
(<~6 ADR-worthy decisions), swap to gin fallback. Per
[v0.2-SCOPE.md Stream B #5](v0.2-SCOPE.md).

**Ship criteria.**
- [ ] Cobra-viability gate: enumerate candidate ADR topics; confirm
  at least 6 are architecturally meaningful (composition/constraint
  decisions, not pure API-surface listings). If fewer, pivot to gin
  and document the pivot in progress log.
- [ ] `benchmarks/adrs/<target>/` with 5–8 authored ADRs using the
  repo's existing ADR format.
- [ ] `prompts/<target>.yml` with 6 prompts in 3/2/1 win/tie/trick
  ratio, per RUBRIC.
- [ ] `configs/<target>.yml` pointing at
  `benchmarks/adrs/<target>/`.
- [ ] Target pinned SHA added to RUBRIC.md Pinned Benchmark
  Targets table.
- [ ] Clone instructions added to RUBRIC.md if reference-run
  reproducibility requires them.

**Key decisions.**
- Cobra vs gin (gate here, not earlier). Default: cobra, per v0.2
  scope thesis. Gin fallback activates only on viability-gate
  failure.
- Prompt selection per bucket. Win prompts should be
  architectural-intent-heavy; tie/trick should probe CLI-runtime or
  trivial-lookup territory respectively.

**Depends on.** Step 9 (need adapter to extract against, validating
target choice).
**Unblocks.** Step 11.
**References.** RUBRIC.md, v0.2-SCOPE.md Stream B #5.

---

### Step 11 — Go dogfood extraction + Go reference run

**Scope.** Extract atlas against the Go benchmark target (cobra or
gin per step 10). Run MVP-scale reference matrix. Verify win-bucket
efficiency pattern replicates cross-language. Per
[v0.2-SCOPE.md Stream B #6](v0.2-SCOPE.md).

**Ship criteria.**
- [ ] Go benchmark target atlas extracted and committed with
  provenance note.
- [ ] Extraction cost captured via step 2's cost tracking; numbers
  within expected envelope (~$2–3 per Go target per v0.2 cost
  envelope).
- [ ] Reference run artifacts in `runs/reference/<target>/`:
  summary, manifest, per-cell traces (24 cells).
- [ ] Synthesis note at
  `research/phase-7-go-reference-run.md` (or next available phase
  number): matrix table (6 prompts × 4 conditions), efficiency
  delta tables (CA vs Alpha, Beta-CA vs Beta), win/tie/trick
  bucket comparison vs hono + httpx baseline, caveats. Target
  ~200–300 LOC — shorter than Phase 5 analysis (skip per-prompt
  deep dives), structurally parallel (executive summary +
  methodology + findings).
- [ ] Win-bucket efficiency pattern compared to hono + httpx
  findings. If pattern fails to replicate on Go, trigger rescope
  per v0.2-SCOPE.md Rescope conditions ("Stream B benchmark fails
  to replicate Phase 5's efficiency pattern").
- [ ] v0.2-SCOPE.md Success Criterion 2b ("Go reference run
  artifacts committed") satisfied.

**Key decisions.**
- Whether the MVP Go reference run results are strong enough to
  count as Stream B success, or whether a broader benchmark is
  needed. Default: MVP-scale sufficient for v0.2; broader is v0.3+.

**Depends on.** Steps 9, 10.
**Unblocks.** Step 12.
**References.** RUBRIC.md, v0.2-SCOPE.md Stream B #6 + Success
Criterion 2.

---

### Step 12 — v0.2 ship gate

**Scope.** Verify all v0.2-SCOPE.md success criteria met; tag
release; refresh version pointers across docs.

**Ship criteria.**
- [ ] v0.2-SCOPE.md Success Criterion 1 (Stream A complete)
  verified via artifacts.
- [ ] v0.2-SCOPE.md Success Criterion 2 (Stream B Go track
  complete) verified via artifacts.
- [ ] v0.2-SCOPE.md Success Criterion 3 (httpx reference run
  complete) verified via artifacts.
- [ ] v0.2-SCOPE.md Success Criterion 4 (benchmark methodology
  demonstrated across three languages) verified — comparable data
  shapes across hono, httpx, and Go benchmark.
- [ ] Version bumped in `package.json`.
- [ ] CHANGELOG entry (if CHANGELOG exists; otherwise flag for
  later version).
- [ ] Release tag `v0.2.0` pushed.
- [ ] Main repo `ROADMAP.md` v0.2 section status updated to
  `[SHIPPED]` with empirical validation block (mirror v0.1
  shipping pattern).
- [ ] Main repo `CLAUDE.md` Current Version block refreshed
  (either v0.3 planning reference or "v0.2 shipped; v0.3 trigger
  pending" per v0.2-SCOPE.md open question #5).
- [ ] Main repo `DESIGN.md` status header refreshed.
- [ ] Main repo `README.md` status block + Headline Results
  refreshed — include Go reference-run + httpx reference-run
  headline numbers, mirroring the Phase 5 populate-pattern.
- [ ] Benchmarks repo `CLAUDE.md` Current Version block refreshed
  (mirror main repo refresh pattern).
- [ ] Benchmarks repo `README.md` status block refreshed with
  v0.2 shipping signal.

**Key decisions.**
- Whether to start v0.3 planning immediately at v0.2 ship, or wait
  for the evidence-based v0.3 trigger (open question #5 in
  v0.2-SCOPE.md). Default: wait for trigger unless v0.2 work
  surfaces the trigger concretely (e.g., Go benchmark dogfood
  shows sparse-ADR limitation).

**Depends on.** Steps 1–11 all shipped.
**Unblocks.** Step 13 (post-v0.2 blind grading) per Phase 5 §7.5.
Step 13 is not part of v0.2; it's the post-ship quality-axis
measurement.
**References.** v0.2-SCOPE.md §Success criteria.

---

## Progress log

*Entries added in reverse-chronological order as steps ship.*

*Format:*

```
### Step N shipped — YYYY-MM-DD (commit SHA)
- Scope: [one-line from step definition]
- Outcome: [1-2 sentences on what actually shipped]
- Notable decisions: [if any surfaced during execution]
- Ship-criteria verification: [each criterion with evidence]
```

*(No entries yet — v0.2 execution pending.)*

---

## Revision history

*Material scope/plan changes during execution. Small tactical
adjustments (timebox tweaks, sub-item re-ordering within a step)
are absorbed into git commits on this file; only changes that
affect v0.2-SCOPE.md OR downstream steps' ship criteria land here.*

*Format:*

```
### YYYY-MM-DD (commit SHA): Step N revised — reason.
Downstream impact: [affected steps].
```

*(No entries yet — plan as originally scoped.)*

---

## Document relationship

- [`v0.2-SCOPE.md`](v0.2-SCOPE.md) — scope doc (what and why;
  parent of this plan).
- [`ROADMAP.md`](ROADMAP.md) — strategic arc (v0.1 → v1.0).
- [`CLAUDE.md`](CLAUDE.md) — operational guidance; Current Version
  block points here during v0.2.
- [`DESIGN.md`](DESIGN.md) — architectural reference.
- [`../ContextAtlas-benchmarks/RUBRIC.md`](../ContextAtlas-benchmarks/RUBRIC.md)
  — benchmark methodology (referenced by steps 6, 11).

This document is superseded by `STEP-PLAN-V0.3.md` when v0.3
planning begins. It remains in-tree as historical record.
