# ContextAtlas v0.2 Step Plan

**Status:** Active execution plan for v0.2. See `## Revision history`
(bottom of document) for material scope/plan changes during execution.
**Last revised:** 2026-04-23 — Step 4 rescoped pre-implementation
(5-gap TS-parity finding + Steps 4b/4c added). See
`## Revision history`. Steps 1, 2, 3 shipped 2026-04-23.

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
                                  │
                                  ├─→ [4b] Re-extract hono atlas
                                  │         │
                                  │         ↓
                                  │   [4c] Phase 5 spot-check (h4 cells)
                                  │         │ ↘
                                  │         ↓   (explicit check-in gate)
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
steps 1–3. Steps 4b/4c added post-Phase-C-findings (2026-04-23
revision) — 4b gates on step 4, 4c gates on 4b and imposes an
**explicit check-in gate** before v0.2 continues to step 5 (4c's
outcome may trigger pause if Phase 5's thesis doesn't replicate on
the refined atlas). Step 7 can start any time Stream A work is in
flight. Step 8 is parallelizable with step 4 (probe is read-only;
cannot destabilize Stream A) — practical earliest start is after
steps 1–3. Steps 9–11 sequential within the Go track; step 9 gates
on Stream A complete. Step 12 gates on everything.

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

*Reframed 2026-04-23; see `## Revision history`.*

**Scope.** Mirror Python's integration-test coverage density on the
TS side. Close the three confirmed gaps (Gap 1 class members, Gap 2
namespace children, Gap 5 type-alias signature bleed) surfaced by
the Phase C hono spot-check, plus a time-boxed Gap 3 (complex class
signature) investigation. Per
[v0.2-SCOPE.md Stream A #4](v0.2-SCOPE.md) and
[`docs/ts-adapter-parity-check.md`](docs/ts-adapter-parity-check.md).

**Ship criteria.**
- [ ] Parity matrix doc committed at
  `docs/ts-adapter-parity-check.md` with Phase C findings filled in.
- [ ] `test/fixtures/typescript/parity.ts` fixture committed.
- [ ] TS parity integration tests added to
  `src/adapters/typescript.test.ts` covering Gaps 1, 2, 5 behaviors.
- [ ] Gap 1 (class members): top-level `listSymbols` iterates
  `sym.children` for kind=5 (Class) and kind=11 (Interface);
  children that map to kind `"other"` are filtered. Test coverage:
  class with methods, interface with members, both return children.
- [ ] Gap 2 (namespace children): same children-iteration extended
  to kind=2 (Module/Namespace). Test coverage: namespace with
  interfaces inside returns those interfaces.
- [ ] Gap 5 (type-alias signature bleed): `extractTypeAliasHeader`
  terminates on a new top-level-declaration boundary when the
  previous lines look complete. Test coverage: ASI-style type-alias
  followed by another declaration produces signature bounded at
  the first type alias.
- [ ] Gap 3 (complex class signature): investigation time-boxed to
  ≤ ½ day. Fix if ≤ 30 LOC, defer to v0.3 with rationale otherwise.
- [ ] Gap 4 (arrow-function signature): explicit deferral note at
  `docs/ts-adapter-parity-check.md` with v0.3 annotation.
- [ ] Conformance suite continues passing unchanged.
- [ ] No regression in either adapter's test suite.

**Key decisions.**
- Filter children whose mapped kind is `"other"` — matches Python's
  policy. Keeps children-iteration from surfacing property fields,
  constructors, and other LSP-kind noise.
- Gap 3 fix-or-defer decision gated on observed complexity during
  investigation. Default lean: defer unless the bug is a small
  terminating-condition issue.

**Depends on.** Step 1 (PyrightAdapter refined — stable comparison
baseline).
**Unblocks.** Step 4b.
**References.** ADR-03, v0.2-SCOPE.md Stream A #4,
`docs/ts-adapter-parity-check.md`.

---

### Step 4b — Re-extract hono atlas against refined TypeScriptAdapter

*Added 2026-04-23 during Step 4 rescope; see `## Revision history`.*

**Scope.** Run `contextatlas index --full` on hono against the
Step-4-refined TypeScriptAdapter. Produces the hono atlas that
Step 4c's spot-check measures against. Mirrors Step 5's pattern
for httpx.

**Ship criteria.**
- [ ] hono atlas re-extracted with refined TypeScriptAdapter (Step
  4 shipped).
- [ ] Atlas committed to benchmarks repo at `atlases/hono/` with
  provenance note (contextatlas commit SHA + hono pinned commit
  SHA).
- [ ] Atlas diff against v0.1 hono atlas reviewed; changes align
  with Step 4 refinements (class methods surface, namespace
  children surface, type-alias signatures no longer bleed).
  Unexplained changes investigated before proceeding.
- [ ] Cost-tracking output captured (uses Step 2 capability).
- [ ] Symbol count delta documented (expect significant increase —
  Hono class's ~50+ methods now surface; JSX namespace's
  interfaces now surface).

**Key decisions.** None expected.

**Depends on.** Step 4.
**Unblocks.** Step 4c.
**References.** ADR-06, `docs/ts-adapter-parity-check.md`.

---

### Step 4c — Phase 5 spot-check on refined hono atlas

*Added 2026-04-23 during Step 4 rescope; see `## Revision history`.*

**Scope.** Re-run two Phase 5 cells (h4-alpha, h4-ca) against the
Step-4b-refined hono atlas. Verify the 7.3× efficiency delta
persists. Tiny cost (~$0.35, ~5 min). Determines whether Phase 5
analysis stands with a footnote or needs revision.

**Ship criteria.**
- [ ] h4-alpha cell re-run against refined atlas; result artifact
  committed in benchmarks repo alongside (not replacing) the
  original Phase 5 h4-alpha trace.
- [ ] h4-ca cell re-run against refined atlas; result artifact
  committed alongside original.
- [ ] Comparison table (original vs refined) documented in
  benchmarks repo.
- [ ] Outcome decision landed: either footnote appended to
  `research/phase-5-reference-run.md` (expected case) OR revision
  of that document (unexpected case, triggers pause).

**Key decisions.**
- **Expected outcome (interpretation A in revision history):** 7.3×
  delta persists at similar or slightly smaller magnitude (e.g.,
  6–8×). Phase 5 analysis stands with an adapter-gap footnote that
  includes the directional-asymmetry framing — the gap most
  plausibly affected modest-win cells more than showcase cells, so
  any measurement shift understates modest wins rather than
  overstates showcase wins.
- **Unexpected outcome:** delta pattern reverses or collapses (e.g.,
  h4-ca no longer materially faster than h4-alpha). **Pause v0.2
  execution.** Rewrite `research/phase-5-reference-run.md`. Discuss
  v0.1-claim implications before proceeding.
- Regardless of outcome: pause for explicit check-in before
  proceeding to Step 5.

**Depends on.** Step 4b.
**Unblocks.** Step 5 (via explicit check-in — not automatic).
**References.** `../ContextAtlas-benchmarks/research/phase-5-reference-run.md`,
`docs/ts-adapter-parity-check.md`.

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
- [ ] Atlas diff against v0.1 httpx atlas reviewed; if any changes
  appear (expected: minimal or none given Step 1 shipped
  zero-fix), trace them to a known source. Unexplained changes
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

### Step 3 shipped — 2026-04-23 (commits 9cd982f, 893a53b)
- Scope: `--verbose` flag on `contextatlas index` that lists
  specific unresolved tokens with source-claim attribution
  (Stream A #3), replacing v0.1's count-only reporting.
- Outcome: Two commits. (A) `9cd982f` adds the
  `FileUnresolvedDetail` + `UnresolvedClaimDetail` types,
  threads per-file detail through `writeClaimsForFile` →
  `ExtractionPipelineResult.unresolvedDetails`, adds the
  `--verbose` boolean flag on `index`, wires `printVerboseUnresolved`
  in cli-runner to emit a grouped-by-file block to stderr. (B)
  `893a53b` amends ADR-12 with a "Verbose diagnostics (v0.2
  amendment)" section documenting the flag + output format + the
  stderr-channel decision.
- Notable decisions:
  - Output channel: stderr (follows `npm --verbose` / `git --verbose`
    convention). Keeps stdout summary pinned to ADR-12's stable
    contract.
  - Grouped by source file (not per-token lines). Debug ergonomics
    win — users ask "what's wrong with this ADR?" not "where does
    this token appear?" Still greppable for either question.
  - Claim text truncated at 60 characters with "..." marker. Keeps
    terminal lines readable. If ambiguity surfaces (two claims in
    same file with near-identical truncated text), revisit.
  - Frontmatter unresolveds included alongside claim-candidate
    unresolveds. Same ADR-to-symbol drift class; separating would
    force chasing the same bug through two output formats.
  - Zero-unresolved case silent on stderr. Default summary's
    `unresolved_candidates=0` already confirms success; a
    "no unresolved candidates" cheerleader line would be noise.
  - Default summary line unchanged. No speculative `unresolved_files=N`
    field — add only if evidence shows users want it.
  - JSON stdout unchanged. `--verbose` and `--json` orthogonal.
    Surfacing unresolved detail in JSON is an additive-schema question
    worth deferring until CI consumers ask for it.
  - Commits split: implementation + documentation, matching Step 2's
    pattern. Two commits, not three — scope was contained.
- Ship-criteria verification:
  - `--verbose` flag accepted by `contextatlas index`: passes via
    cli-args.test.ts "--verbose sets the verbose flag with index
    subcommand" + 4 other flag tests.
  - Output lists specific unresolved token strings (not just
    counts): passes via cli-runner.test.ts "--verbose emits per-file
    block when unresolved claim candidates exist" — asserts
    `Ghost, AlsoGhost` tokens appear in output, not just a count.
  - Each unresolved token attributed to its source claim: same test
    asserts `[claim: "must be idempotent" (hard)] Ghost, AlsoGhost`
    structure — claim excerpt + severity attribution.
  - Output format documented: ADR-12 amendment `893a53b` under
    "Verbose diagnostics (v0.2 amendment)".
  - Tests cover flag against a fixture with known-unresolved
    candidates: 4 cli-runner tests (zero-case silence, populated
    block, truncation, flag-off silence).
- Tests: 546 passing repo-wide (was 537 at Step 2 close; +9 new).

### Step 2 shipped — 2026-04-23 (commits d4c7fc2, 56fd33c, 9b51751)
- Scope: Cost tracking in extraction pipeline (Stream A #2) — surface
  per-run cost + budget-warning mechanism per ADR-12 contract.
- Outcome: Three commits. (A) `d4c7fc2` propagates Anthropic SDK
  `usage` through `ExtractionClient` → `ExtractionPipelineResult` →
  `cli-runner` summary (both `key=value` and `--json` modes), adds
  `src/extraction/pricing.ts` with Opus 4.7 constants + dated
  verification comment. (B) `56fd33c` adds the budget-warning
  mechanism: new top-level `extraction:` config section with
  `budget_warn_usd`, `--budget-warn <usd>` CLI flag, CLI-wins
  precedence, fire-once-per-run warning. (C) `9b51751` amends ADR-12
  with a "Cost visibility (v0.2 amendment)" section documenting the
  three new summary fields + the budget mechanism, under its
  pre-existing "new keys may be added" stability guarantee.
- Notable decisions:
  - Budget-warning surface: new top-level `extraction:` config
    section (not folded into `atlas:` or `adrs:`) so future
    extraction-specific config has a clean home.
  - CLI flag named `--budget-warn` (matches config key minus `_usd`
    suffix). Rejected `--max-cost` — "max" implies hard cap, which
    we explicitly don't do.
  - Fire-once-per-run warning. Avoids log spam when threshold is
    crossed early.
  - `cost_usd` stdout format: 4 decimals (not 2). Sub-cent
    development iterations remain informative
    (`cost_usd=0.0053` vs `0.00`); large runs still readable
    (`2.9500`). Threshold comparisons use raw `costUsd` full
    precision, independent of display format.
  - Commits split: original 3-commit plan collapsed to 2
    implementation commits + 1 documentation commit. Separating
    key=value output from `--json` output would have been mechanical
    (same `printSummary` function).
  - Orchestrator-level interactive budget prompt (Travis's Phase-5
    observation) explicitly deferred to benchmarks repo. Filed at
    `../ContextAtlas-benchmarks/research/budget-prompt-enhancement.md`.
- Ship-criteria verification:
  - `response.usage` accumulated across API calls: passes via
    `anthropic-client.test.ts` "usage propagation" describe block
    + pipeline-level integration.
  - `cost_usd`, `input_tokens`, `output_tokens` in stdout summary
    (both modes): passes via `cli-runner.test.ts`
    "key=value summary includes input_tokens, output_tokens,
    cost_usd" and "--json summary includes ... as numbers".
  - Budget warning mechanism shipped: config + CLI flag both work,
    precedence verified, fire-once verified. Tests in
    `pipeline.test.ts` "budget warning" describe block (5 tests)
    + `cli-runner.test.ts` precedence describe block (5 tests).
  - Cost-tracking interface documented: ADR-12 amendment
    `9b51751` under "Cost visibility (v0.2 amendment)".
- Tests: 537 passing repo-wide (was 508 at Step 1 close; +29 new
  across pricing.test.ts, anthropic-client.test.ts,
  pipeline.test.ts, cli-args.test.ts, parser.test.ts,
  cli-runner.test.ts).

### Step 1 shipped — 2026-04-23 (commit bcf032f)
- Scope: Fix kind-mapping gaps surfaced during v0.1 httpx dogfood
  (`__all__`, enum class members, dunder methods).
- Outcome: Probe revealed current PyrightAdapter already satisfies
  all three targets via existing code paths. No production code
  changes required. Fixture + 4 assertion tests added as regression
  protection; spot-check against real httpx source (3 files)
  confirmed fixture results match real-world behavior.
- Notable decisions:
  - Default lean honored — remap enum members to `variable`, no new
    SymbolKind, no ADR-14.
  - Scope-doc framing ("currently `class`") was imprecise; actual
    current state was already correct via kind-14 (Constant) and
    `isModuleLevelAssignment` paths. Framing delta is corrected in
    revision history, not a scope change.
- Ship-criteria verification:
  - `__all__` → `variable`: passes via test
    `"__all__ module list resolves to kind 'variable'"`
    (pyright.test.ts, "kind-mapping refinements" describe block).
  - Enum members → `variable`: passes via test
    `"enum class members resolve to kind 'variable'"` (covers
    CLOSED, UNSET, OPEN). Mechanism: Pyright emits LSP kind=14
    (Constant) for class-level enum values → `mapPyrightKind`
    returns `variable`.
  - Dunder methods → `method`: passes via tests
    `"async dunder methods resolve to kind 'method'"` and
    `"sync dunder methods resolve to kind 'method'"` (covers
    `__aenter__`, `__aexit__`, `__enter__`, `__exit__`). Mechanism:
    Pyright emits LSP kind=6 (Method) as children of kind=5
    classes; existing children loop in `listSymbols` picks them up.
  - Post-filter algorithm covered by unit tests: 4 new assertions
    in `pyright.test.ts`.
  - ADR-14: not needed (no new SymbolKind).
  - Conformance suite: 68/68 pyright tests pass.
  - No TS regression: 47/47 typescript tests pass.

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

### 2026-04-23 (Step 4 rescope pre-implementation): TS-parity check reframed, scope expanded, Steps 4b/4c added.

Step 4 was scoped as ~1 day of parity polish, referencing a
"Python-adapter dogfood query set" as if it were a discrete
committed artifact. Survey revealed no such set exists — Python
integration-test coverage density (from httpx dogfood work during
v0.1) is the de facto parity baseline. Step 4's real deliverable is
mirroring that density on the TS side. Step plan reworked to
reflect the reframing.

A Phase C hono spot-check (3 files: `jsx/base.ts`, `hono-base.ts`,
`http-exception.ts`) surfaced **5 material gaps** in the TS adapter:

1. **Class members not surfaced** (HIGH). TS `listSymbols` iterates
   only top-level symbols; Python adapter iterates `sym.children`
   for kind=5. `Hono` class's ~50+ methods invisible to ContextAtlas.
2. **Namespace children not surfaced** (MEDIUM). `export namespace
   JSX { interface Element { ... } }` — inner interfaces dropped.
3. **Complex class signatures not populated** (MEDIUM). Signature
   extractor fails on generic + multi-line class headers like
   `class Hono<E, S, BasePath>`.
4. **Arrow-function exports have no signature** (LOW-MEDIUM).
   `export const fn = () => ...` resolves to `kind=variable` with
   empty signature.
5. **Type-alias signature bleeds into next symbol** (BUG).
   `extractTypeAliasHeader` terminates only on `;`; hono's ASI
   convention means it scans into the following declaration.

**Scope decisions:**
- Fix in v0.2 Step 4: Gaps 1, 2, 5 (HIGH + MEDIUM + BUG severity).
  Calibrated fix sizes: ~25 LOC, ~3 LOC, ~15 LOC respectively.
- Defer to v0.3: Gap 4 (arrow-function sig — quality-of-bundle, not
  correctness; common pattern, but deferrable).
- Investigate-then-decide: Gap 3 (complex class sig — fix if ≤30
  LOC, defer otherwise).

**Step plan additions — Steps 4b and 4c added:**
- **Step 4b** — Re-extract hono atlas in benchmarks repo against
  the Step-4-refined TypeScriptAdapter. Mirrors Step 5's pattern for
  httpx. The Phase 5 hono atlas was extracted with Gap 1 present,
  so the v0.2-refined adapter produces a materially different atlas.
- **Step 4c** — Phase 5 spot-check on h4-alpha and h4-ca cells
  against the refined atlas. Verify the 7.3× efficiency delta
  persists. ~$0.35, ~5 min.

**Interpretation framing for 4c outcome:**

Gap 1 (class-members-missing) was present during v0.1 extraction, so
Phase 5 benchmark measured against an incomplete hono atlas. Two
possible readings:

- **(A) Thesis holds.** Phase 5 efficiency came from
  exploration-avoidance via ADR-surfaced intent, not bundle
  comprehensiveness. h4's 7.3× gain was ADR-04 framing; h4-alpha
  burned 21 calls on type-inference chains, not method enumeration,
  so method-surface gap wouldn't have helped alpha faster. Expected.
- **(B) Findings overstated.** Some prompts succeeded trivially on
  incomplete data; real deltas smaller.

The gap was directionally *asymmetric* — most plausibly affected
cells with *modest* CA wins (h2, h3) where richer bundles would have
improved CA results. The *showcase* wins (h4) derived from ADR-surfaced
intent, not class enumeration, so shouldn't have been inflated.
Findings may be mildly *understated* on modest-win cells rather than
overstated on showcase cells. Interpretation (A) + asymmetry
reasoning make a thesis-reversing outcome unlikely, but this is
post-hoc and must be verified empirically.

**Commitments:**
- **Expected 4c outcome:** efficiency delta persists at similar or
  slightly smaller magnitude. Phase 5 analysis stands with an
  adapter-gap footnote added to
  `../ContextAtlas-benchmarks/research/phase-5-reference-run.md`
  including the directional-asymmetry framing so future readers
  understand why modest numerical shifts don't invalidate the thesis.
- **Unexpected 4c outcome (pattern reverses):** v0.2 execution
  pauses. The Phase 5 synthesis gets revised, not footnoted. Broader
  discussion on what this means for v0.1 claims precedes any v0.2
  continuation.
- After Step 4c ships, execution pauses for explicit check-in
  regardless of outcome, before proceeding to Step 5.

**Downstream impact on Step 5:** no change in scope — Step 5 already
re-extracts httpx against the refined Python adapter. Step 4b is
the hono analog. Step 4c is unique to the hono situation because
the existing Phase 5 artifact uses the pre-refinement atlas; no
equivalent Phase 5 artifact exists for httpx to spot-check against.

Reference: [`docs/ts-adapter-parity-check.md`](docs/ts-adapter-parity-check.md).

### 2026-04-23 (commit bcf032f): Step 1 shipped as verification, not surgery.
Step 1 was scoped as ~1-2 days of adapter modification (fix three
kind-mapping bugs). Actual outcome was probe + regression-test
addition — current PyrightAdapter already satisfied all three
targets via existing code paths (LSP kind=14 Constant handling
for enum members, `isModuleLevelAssignment` for `__all__`,
children-loop for dunders). Scope-doc framing "currently `class`"
was imprecise.

Downstream impact: Step 5's atlas-diff criterion relaxes from
"trace every non-trivial kind change to a Stream A refinement"
to "expect minimal or no changes given Step 1 shipped zero-fix;
trace any that appear." Step 5 ship criterion updated in the
same commit as this revision note.

No change to v0.2-SCOPE.md — Step 1's target behavior is
achieved; scope is delivered. **Observation for future steps:
starting-state assumptions in scope doc should be verified
empirically before declaring ship criteria, when the scope items
trace back to backlog observations rather than empirically-
confirmed bugs.**

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
