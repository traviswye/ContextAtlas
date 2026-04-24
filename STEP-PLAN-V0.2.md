# ContextAtlas v0.2 Step Plan

**Status:** Active execution plan for v0.2. See `## Revision history`
(bottom of document) for material scope/plan changes during execution.
**Last revised:** 2026-04-24 — Step 7 shipped (MCP disclaimer
investigation: Path (a) — root cause was harness missing
`--allowedTools` on CLI spawn, not an upstream Claude Code
quirk; 100% of MCP calls in beta-ca cells were blocked across
both Phase 5 and Phase 6 runs; fix landed with regression
tests; all 11 affected cells re-run; Phase 5 and Phase 6
synthesis docs amended). Stream A complete. Step 8+ (Go track)
queue. Steps 1–6, 4b, 4c, 7 shipped 2026-04-23/24.

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
- [x] Root cause identified and documented.
      (`ContextAtlas-benchmarks/research/beta-ca-mcp-permission-block-finding.md`)
- [x] Fix landed at our layer (spawn flags, response-shape
  adjustment, or similar).
      (`--allowedTools` added to CLI spawn argv in
      `src/harness/claude-code-driver.ts`; extracted to
      `buildClaudeSpawnArgs` for testability. Benchmarks commit
      `c5b9486`.)
- [x] Regression test added ensuring beta-ca output no longer
  carries the disclaimer.
      (5 unit tests on `buildClaudeSpawnArgs` verifying
      `--allowedTools` composition; full 11-cell re-run produces
      zero "Claude requested permissions to use" messages.)

*Path (b) — document as known issue:* N/A — Path (a) taken.

*Always:*
- [x] Either (a) or (b) landed; investigation closed.
- [x] Timebox observed — if still investigating past ~2 days, pick
  (b) and move on. (Investigation completed same day.)

**Key decisions.**
- (a) vs (b): **(a) taken.** Root cause found within a single
  investigation session; fix is one spawn flag + test; far lower
  cost than documenting a user-workaround.
- **Re-run scope: all 11 affected cells.** Option C (fix + re-run +
  retroactive corrections) chosen over Option A (fix-only) or
  Option B (fix + re-run without synthesis-doc amendments). The
  re-run artifacts are the evidence that anchors the retroactive
  corrections; committing the fix without correcting the Phase 5
  and Phase 6 synthesis docs would leave the committed record
  built on invalidated data.
- **Preservation convention:** v1 MCP-blocked artifacts kept
  alongside v2 artifacts as `beta-ca-v1-permission-blocked.json`
  in each cell directory. Supports the methodology-correction
  audit trail.

**Depends on.** Nothing (parallelizable — can run concurrently
with steps 8–11).
**Unblocks.** Nothing on critical path; closes Stream A.
**References.** Phase 5 §4.3, §7.2 (superseded/resolved);
Phase 6 §5.3 (amended); research note
`ContextAtlas-benchmarks/research/beta-ca-mcp-permission-block-finding.md`;
v0.2-SCOPE.md Stream A #5.

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
- **Pre-run operational requirement (from Step 6):** apply
  `powercfg -change -standby-timeout-ac 0` and
  `-hibernate-timeout-ac 0` before launching the matrix; restore
  post-run. Prevents hibernation-during-matrix ambiguity
  documented at
  `../ContextAtlas-benchmarks/research/reference-run-hibernation-gotcha.md`.
- **Pre-run operational requirement (from Step 7):** run an MCP
  preflight probe before launching the matrix. A single probe
  cell invoked with a prompt that triggers at least one MCP tool
  call; abort the matrix if any tool result contains
  `"Claude requested permissions to use"`. Catches harness
  permission regressions before they invalidate a full matrix.
  Implementation: ~20-LOC addition to `scripts/run-reference.ts`,
  or a standalone script invoked from the wrapper. The Step 7
  fix (benchmarks `c5b9486`) patches the known regression; the
  preflight prevents future ones.

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

### Step 7 shipped — 2026-04-24 (benchmarks commits b03b633, c5b9486, 0d79317, 14e264d, 92b3491)
- Scope: Investigate Claude Code CLI's permission-disclaimer
  preamble on beta-ca cells. Per v0.2-SCOPE.md Stream A #5.
- Outcome: **Path (a) — root-caused and fixed.** The "disclaimer"
  was not a model quirk but a 100% MCP block at the CLI
  permission layer: every MCP tool call across all 11 beta-ca
  cells (Phase 5 h1–h5 + Phase 6 p1–p6) returned a
  permission-request message rather than atlas data, because
  the harness spawn-args block missed `--allowedTools`. Under
  `--bare`, Claude Code still enforces the permission system;
  `--strict-mcp-config` and `--allowedTools` are orthogonal
  concerns the v0.1 harness conflated. Fix shipped, tests
  added, 11 affected cells re-run, Phase 5 and Phase 6
  synthesis docs amended with v1/v2 diffs.
- Notable decisions:
  - **Path (a) taken over Path (b).** Root cause found within
    one investigation session; a single spawn-flag fix is far
    cheaper than documenting a user-workaround. Timebox (~2
    days advisory) was not consumed — investigation completed
    same day.
  - **Option C for re-run + corrections.** Re-ran all 11
    affected cells *and* amended the Phase 5 and Phase 6
    synthesis docs. Leaving v1 numbers in place while shipping
    the fix would have left the committed record built on
    invalidated data; amendments are part of the ship.
  - **Preservation convention for v1 artifacts.** Original
    blocked cells preserved as
    `beta-ca-v1-permission-blocked.json` alongside
    post-fix `beta-ca.json` in each cell directory. The v1
    artifacts are the *evidence* that supports the
    methodology-correction research note; deleting them would
    weaken the audit trail.
  - **Retroactive Phase 5 §4.3 correction is the most
    consequential amendment.** The original hypothesis
    ("model mis-labels its own access") was wrong. Corrected
    interpretation: Claude Code's permission layer did exactly
    what it's supposed to do; the harness was the bug. This
    strengthens the Phase 5/6 "beta-ca-cheaper-than-beta"
    headline under v2 — v1's beta-ca cost figures were
    partly artificial (short MCP-blocked answers from
    training priors), v2's are real CA tool effect.
  - **Narrow claim verification matters.** Early draft
    said "h1 and h4 beta-ca happened to be materially correct
    because the non-MCP substrate was sufficient." Verification
    against actual answer text found h1 was substrate-correct
    (Read+Bash produced source-cited answer) but h4 was
    training-prior-correct (zero source reads; self-caveated as
    unverified). Narrowed the claim before committing the
    research note.
  - **Sharpens v0.2 Step 11 scope.** Added MCP preflight
    check as a new Step 11 ship criterion: a pre-matrix probe
    that aborts if MCP returns a permission-request string.
    The fix patches the known bug; the preflight prevents the
    next one.
  - **Hono h3/h4 cost ratios shift under v2.** v1 showed
    beta-ca h3 −73% vs beta (driven partly by the block
    short-circuiting the cell) and h4 −66%. v2 shows h3 −23%
    and h4 −54% — h4 retains its largest-win position; h3
    narrows because v2 h3-beta-ca actually used atlas tools
    (more work = more tokens). The directional claim
    ("beta-ca cheaper than beta on every measured prompt")
    survives.
- Ship-criteria verification:
  - Path (a) all three criteria [x] (root cause documented;
    fix landed; regression test). Path (b) N/A.
  - Always criteria [x] (investigation closed same day;
    timebox observed).
  - Research note at
    `ContextAtlas-benchmarks/research/beta-ca-mcp-permission-block-finding.md`
    (benchmarks `b03b633`). Fix at
    `src/harness/claude-code-driver.ts` (benchmarks `c5b9486`)
    with 5 new unit tests on `buildClaudeSpawnArgs`.
  - Re-run artifacts promoted with preservation convention
    (benchmarks `0d79317`). Phase 5 amended (benchmarks
    `14e264d`). Phase 6 amended (benchmarks `92b3491`).
  - Full benchmarks test suite green: 192 passed / 9 skipped
    after fix; no regressions.
- Tests: 5 new main-repo-equivalent (benchmarks-repo) tests
  on `buildClaudeSpawnArgs` verifying `--allowedTools`
  composition. Full benchmarks suite 192 passing. Main repo
  tests unchanged.
- Next steps:
  - **Stream A complete.** Steps 4, 4b, 4c, 7 all shipped.
  - **Step 8 queues.** Go LSP probe + ADR. Parallelizable
    with step 4 / already done.
  - **Step 11 preflight requirement documented** in step
    body above; implement as part of Step 11 execution.

### Step 6 shipped — 2026-04-24 (benchmarks commits 0e6a932, 40682d6, 868e7f8, b04c8ca, 831a0ca)
- Scope: Execute Phase-5-style reference run protocol on httpx
  (4 conditions × 6 prompts = 24 cells). Commit artifacts.
  Write synthesis note comparing hono and httpx efficiency
  patterns. Per v0.2-SCOPE.md Stream B #8–10.
- Outcome: **Cross-repo thesis validation: replicates on
  Python.** Matrix ran clean (24/24 cells, 0 errors, 1 retry)
  at $8.36 cost (~50% under $13–16 projection) and ~15 min
  compute. Win-bucket pattern held on 3 of 4 cells (p1 −75%,
  p2 −25%, p3 −38%); p4-stream-lifecycle was the exception,
  surfacing a claim-attribution + ranking precision finding
  that sharpens v0.3+ scope. Tie/trick buckets behaved per
  RUBRIC. Cross-harness correctness differential discovered
  on p6-beta-ca (fills the Phase 5 unmeasured cell): beta-ca
  6 calls + correct answer vs beta 11 calls + partially-wrong
  answer due to atlas-artifact-spelunking in benchmark repo
  tree.
- Notable decisions:
  - **p4 finding sharpens v0.3 scope beyond "Stream C"
    (docstring/README mining).** The atlas has 17 claims from
    ADR-05 directly answering p4's prompt, but
    claim-attribution inheritance + deterministic per-symbol
    ranking surface an off-target claim first. More claim
    sources won't fix this; needs attribution precision +
    query-aware ranking. Three candidate fixes documented in
    `atlas-claim-attribution-ranking.md` (benchmarks commit
    `868e7f8`).
  - **p6 cross-harness correctness differential is genuinely
    new evidence.** Phase 5's beta-ca story was
    efficiency-only (cheaper than beta); Step 6 shows CA
    tools deliver *correctness* on the same cell where beta,
    going atlas-spelunking, answered the wrong question by
    accident. Beta's baseline is inflated by
    atlas-artifact-discoverability (§8 in synthesis) — noted
    as methodology caveat — but the correctness differential
    stands.
  - **Cost calibration across two repos:** Python ~50% under
    projection vs hono at $14 ceiling. Step 11 ceiling
    proposed $14–16 (midway between data points); don't
    tighten just because Go is structurally simpler.
  - **Compute calibration:** 0.40 min/file hono vs 0.65
    min/file httpx. "Mostly linear with some constant
    overhead" interpretation (orchestrator baseline exists
    but doesn't dominate). Useful for Step 11 time projection.
  - **Hibernation methodology gotcha.** Host hibernated
    mid-matrix; orchestrator survived and finalized p6 on
    resume. Initial wall-clock read (70 min) conflated
    compute with user-absent time — real compute ~15 min for
    p1–p5. Filed at `reference-run-hibernation-gotcha.md`
    (benchmarks commit `831a0ca`) with detection heuristic +
    `powercfg` prevention. Step 11 execution should apply
    the pre-run `powercfg` commands (now in Step 11 body).
  - **Four v0.3+ backlog items now filed from v0.2 execution:**
    budget-prompt-enhancement (Step 2),
    atlas-contextatlas-commit-sha-gap (Step 5),
    atlas-claim-attribution-ranking (Step 6 — most
    substantive), reference-run-hibernation-gotcha (Step 6).
    Pattern: execution-surfaced observations captured where
    discovered rather than batched at v0.3 planning time.
- Ship-criteria verification:
  - Budget ceiling pre-set: $18 (vs ~$15 projection per
    v0.2-SCOPE.md cost envelope). Actual $8.36, no halt.
  - `runs/reference/httpx/` populated: 24 per-cell artifacts
    + `run-manifest.json` + `summary.md`. Benchmarks commit
    `0e6a932`.
  - Synthesis note committed at
    `research/phase-6-httpx-reference-run.md`. Original commit
    `40682d6`; amended with compute-time corrections at
    `b04c8ca`.
  - Synthesis includes per-prompt efficiency table,
    win/tie/trick bucket replication analysis vs hono,
    caveats, three investigation subsections, cost + compute
    envelope comparison, v0.3+ implications. All required
    elements present.
  - v0.2-SCOPE.md Success Criterion 3 satisfied: "httpx
    reference run complete with Phase-5-comparable data
    shape" — confirmed via `runs/reference/httpx/` structure
    matching `runs/reference/hono/`.
- Tests: N/A — Step 6 is measurement + analysis, no code.
  Step 4's 583 main-repo tests + 187 benchmarks-repo tests
  continue to apply.
- Next steps:
  - **Stream A complete + httpx cross-repo artifact shipped.**
    Remaining Stream B work: Step 7 (MCP disclaimer
    investigation — parallelizable), Step 8 (Go LSP probe +
    ADR), Steps 9–11 (Go adapter + benchmark + reference
    run), Step 12 (v0.2 ship gate).
  - **Step 11 calibration data (cobra):** 19 source files
    (`.go`, non-test), 17 test files, 36 total `.go` files,
    66 total non-`.git` files. At httpx's calibrated 0.65
    min/file, cobra matrix compute projects ~12–15 min.
    Budget ceiling recommendation: $14–16 per existing Step
    11 calibration — don't tighten just because repo is
    small; Python came in ~50% under projection but Go
    could surprise in either direction.
  - **Step 8 probe consideration:** Original cobra-over-gin
    choice (v0.2-SCOPE.md training-data asymmetry reasoning)
    assumed sufficient architectural density. 19 source
    files is tight. Scope-doc fallback to gin if probe
    surfaces "<6 ADR-worthy decisions" remains active.
    Step 8 probe should explicitly answer: does cobra's
    architectural surface support 6+ meaningful ADRs before
    Step 10 authoring commits?
  - **Step 11 execution reminder:** apply
    `powercfg -change -standby-timeout-ac 0` and
    `-hibernate-timeout-ac 0` before launching the matrix;
    restore post-run. Per
    `reference-run-hibernation-gotcha.md` prevention.

### Step 5 shipped — 2026-04-24 (benchmarks commits 93ef22a, ac71be9)
- Scope: Re-extract httpx atlas against refined PyrightAdapter
  (Steps 1–3 shipped). First-time-tracked commit of httpx
  atlas in benchmarks repo.
- Outcome: **Atlas metrics matched v0.1 baseline exactly.**
  symbols 1179 (v0.1: 1179), claims 80 (v0.1: 80), source_shas 5
  (same 5 httpx ADRs). LSP pre-filter inventory 1303 vs v0.1's
  pre-filter count (not captured in v0.1 artifact — no direct
  comparison possible, but post-filter exact match validates
  adapter stability). Extraction: $1.32 / 5 API calls / ~2 min
  wall clock. Step 1's verification finding ("PyrightAdapter
  needs no fixes") confirmed at production scale; the fresh
  adapter produces byte-equivalent output to v0.1's on the same
  ADR inputs (modulo Opus stochasticity on claim wording, which
  still yielded the same claim count).
- Notable decisions:
  - v0.1 httpx atlas was never committed to benchmarks repo —
    it existed locally from close-out dogfood (2026-04-22) but
    stayed untracked. Step 5 is therefore the first-time commit
    of this artifact in git history. The on-disk v0.1 atlas
    served as comparison baseline before extraction overwrote
    it; baseline metrics captured pre-extraction to preserve
    comparability.
  - Atlas schema v1.1 fields (`generator.contextatlas_version`,
    `generator.extraction_model`, `extracted_at_sha`) all
    populate correctly. A transient "missing fields" concern
    during verification turned out to be a bug in my own
    verification script (checking wrong top-level field names
    instead of nested `generator.*` paths). No actual atlas
    bug — fields are schema-correct.
  - **Schema observation filed for v0.3+ backlog:** atlas.json
    tracks `generator.contextatlas_version` ("0.0.1", stable
    across all Step 1–4 work) but NOT a contextatlas commit
    SHA. Run-manifests in benchmarks/runs/ capture that SHA
    for reproducibility; atlas.json alone cannot differentiate
    pre-fix vs post-fix atlases. Filed at
    `../ContextAtlas-benchmarks/research/atlas-contextatlas-commit-sha-gap.md`
    (benchmarks commit `ac71be9`). Not v0.2 scope.
  - Cross-language validation of Step 2 + Step 3 in production:
    `cost_usd=$1.32`, `input_tokens`/`output_tokens` populated;
    `--verbose` correctly emitted Python-ADR unresolved
    candidates. First time either capability exercised on
    Python source beyond hono's TypeScript dogfood.
- Ship-criteria verification:
  - httpx atlas re-extracted with refined PyrightAdapter:
    benchmarks commit `93ef22a`. Atlas at `atlases/httpx/atlas.json`.
  - Provenance: contextatlas commit `055aa4b` (main repo HEAD
    at Step 4c close) + httpx pinned `26d48e0...` per RUBRIC.
    Atlas schema v1.1.
  - Atlas diff against v0.1 baseline: **zero content change**
    on post-filter symbols (1179 = 1179) and claims (80 = 80).
    No unexplained changes; Step 1's zero-fix finding upheld.
  - Cost-tracking output captured via Step 2 capability:
    `cost_usd=1.3200` (ish — user-reported value).
  - Unresolved-candidate diff reviewed via Step 3's verbose mode:
    no regressions surfaced.
- Tests: N/A — Step 5 is artifact-production, not code. Step 4's
  583 passing repo-wide tests continue to apply. Benchmarks repo
  187 tests still passing.

### Step 4c shipped — 2026-04-24 (benchmarks commits 7863273, 44d23fd)
- Scope: Phase 5 spot-check on h4-ca against refined hono atlas
  (Step 4b artifact). Verify 7.3× efficiency delta persists;
  apply directional-asymmetry framing to interpretation.
- Outcome: **Thesis survives; v0.2 continues to Step 5.** h4-ca
  re-ran at $0.75 vs Phase 5's $0.52 (+44% cost, +67% tool calls,
  −15% wall clock). ca/alpha cost ratio dropped 7.3× → 3.93× but
  still a substantial CA win over alpha baseline. The finding
  matches **interpretation (A) with nuance** framed in the
  pre-implementation rescope entry — richer atlas enabled deeper
  investigation, not efficiency regression with no quality gain.
  Phase 5 analysis preserved as historical record; Step 4c
  findings documented as a footnote (§9 in
  `phase-5-reference-run.md`) plus 4 inline pointers.
- Notable decisions:
  - h4-alpha NOT re-run. Minimal-baseline agent has no MCP
    connection and doesn't consume the atlas; Phase 5's
    h4-alpha measurement stands as unchanged baseline. Saves
    ~$3 in unnecessary re-measurement. Revised the step plan's
    original estimate of $0.35 once the alpha-is-atlas-
    independent observation surfaced during survey.
  - **Mechanism validation is arguably the primary finding —
    more than the numerical ratio.** Phase 5's 2 opening `Grep`
    calls were replaced by Step 4c's 2 `find_by_intent`
    queries. Exploration relocated from source-code (Bash/Grep)
    to atlas layer (MCP). Validates the architectural thesis
    at the mechanism level, which is what future versions
    (v0.3+ fusion, v0.4 semantic, v0.5 task-shaped) depend on.
    Numerical efficiency on any specific prompt is downstream
    of mechanism; mechanism is what generalizes.
  - Interpretation (A) chosen over (B): answer quality went UP
    alongside cost (ASCII flow diagram added, specific file:line
    citations, git-hot observation from atlas layer, richer
    generic-parameter semantics). "(A) with nuance" because the
    4 symbols Step 4c walked (`validator`, `ToSchema`, `Client`,
    `HandlerInterface`) are all top-level type aliases that
    v0.1 also surfaced — the v0.2 atlas provided *cleaner
    signatures* (Gaps 3 and 5 fixes) rather than novel symbols.
    Model elected thoroughness; atlas enabled it.
  - Directional-asymmetry framing refined: showcase cells
    (h4) weren't inflated by the gap (original framing stands)
    AND had their cost suppressed because richer bundles weren't
    available for deeper investigation (new framing). Phase 5's
    7.3× and Step 4c's 3.93× are both "CA dominating alpha via
    intent-first exploration" — different points on the same
    efficiency/depth curve, not different conclusions.
  - **Step 13 implication captured for v0.3+:** CA's value scales
    with atlas richness rather than being a fixed efficiency
    boost. Step 13 grading methodology should specifically
    measure answer quality at **matched cost budgets**, not
    just at matched prompt inputs. A grader comparing "alpha
    with $N" vs "CA with $N" captures the quality-at-cost curve
    that single-axis efficiency measurement misses.
  - Documentation path: footnote (§9) + 4 inline pointers
    (executive summary bullet 2, §3 header, §5.1 end, §6.1
    end). Pointers prevent readers who cite specific Phase 5
    numbers from carrying an overstated ratio forward without
    context.
  - n=1 vs n=1 variance caveat captured. Multi-run medians
    (step 13 scope) needed to decompose run-to-run noise from
    genuine refined-atlas effect. Step 4c reports directional
    evidence, not a statistically isolated measurement.
- Ship-criteria verification:
  - h4-ca cell re-run against refined atlas: benchmarks commit
    `7863273`. Artifact committed at
    `runs/spotchecks/step-4c/hono/h4-validator-typeflow/ca.json`.
    .gitignore updated to allow `runs/spotchecks/` tree.
  - Comparison table populated with actual numbers: §9
    quantitative section of `phase-5-reference-run.md`.
  - `research/phase-5-reference-run.md` updated — §9 footnote
    (~180 lines) + 4 inline pointers. Benchmarks commit
    `44d23fd`.
  - Explicit check-in decision landed: §9 §Decision subsection
    reads "Thesis survives. v0.2 execution continues to Step 5
    per STEP-PLAN-V0.2.md. No pause triggered."
- Tests: N/A — Step 4c is measurement + analysis, no code.

### Step 4b shipped — 2026-04-23 (benchmarks repo commit 352b22e)
- Scope: Re-extract hono atlas against the Step-4-refined
  TypeScriptAdapter. Produces the baseline atlas for Step 4c's
  Phase 5 spot-check.
- Outcome: Full `--full` re-extraction ran against hono's pinned
  commit `cf2d2b7`. Symbol count shifted **1923 → 2154** (+12%,
  +231 symbols). LSP inventory pre-filter 2335 vs v0.1's 1923
  (+21%). Claims essentially unchanged (80 → 78 — within
  extraction noise on same 5 ADRs). Wall clock 74s; cost $1.35
  across 5 API calls. Benchmarks-repo commit `352b22e` landed
  with an abbreviated message (vim editing issue during commit
  authorship) — rich context lives in this progress log entry and
  the Step 4 fix commits it references.
- Notable decisions:
  - +12% symbol delta is smaller than the initial 1.5–2× estimate.
    The estimate was anchored on the Phase C spot-check's +40%
    scaling for `jsx/base.ts` (pathology-heavy file). Most hono
    files aren't pathology-heavy — the bulk of hono's architectural
    surface is regular exports that v0.1 already handled correctly.
    +231 symbols is real evidence the fixes land in production,
    not noise. The sub-estimate result does not indicate fixes
    failing to land.
  - **First live validation of Step 2 cost tracking in production.**
    `cost_usd=1.3487`, `input_tokens=16647`, `output_tokens=14653`
    all surfaced correctly in the key=value stdout summary. Step 2
    works as designed at real workload scale.
  - **First live validation of Step 3 `--verbose` in production.**
    100 unresolved tokens emitted across 5 files, correctly
    attributed to specific claims with severity annotations
    (hard / soft / context). Most unresolveds are path-prefixed
    references in claim text (e.g., `src/middleware`, `hono/tiny`,
    `@hono/node-server`) rather than symbol-name misses — expected
    behavior for ADR prose that names directories / package paths
    alongside symbol identifiers; not an adapter regression.
  - Observation (not acted on): `atlases/httpx/` appears untracked
    in benchmarks-repo `git status`. Pre-existing from Phase 5
    work, not introduced by Step 4b. Flagged for future cleanup;
    outside Step 4 scope.
- Ship-criteria verification:
  - hono atlas re-extracted with refined TypeScriptAdapter:
    benchmarks-repo commit `352b22e`.
  - Atlas provenance: contextatlas commit `79228b1` (Step 4 code
    shipped) + hono pinned commit
    `cf2d2b7edcf07adef2db7614557f4d7f9e2be7ba`.
  - Atlas diff reviewed; changes align with Step 4 refinements
    (class methods, namespace children, corrected signatures).
    No unexplained kind changes.
  - Cost-tracking output captured via Step 2 capability:
    `cost_usd=1.3487`, `input_tokens=16647`, `output_tokens=14653`.
  - Symbol count delta documented: 1923 → 2154 (+12%).
- Tests: N/A — Step 4b is an artifact-production step, not code.
  Step 4's 583 passing repo-wide tests continue to apply.

### Step 4 shipped — 2026-04-23 (commits 16fb9cc, 8d2ef94, 36b2c87, 7646243, 1aca8bf, 79228b1)
- Scope: TypeScriptAdapter parity check (Stream A #4). Reframed
  from the original scope doc's "Python-adapter dogfood query set"
  language to "mirror Python's integration-test coverage density
  on TS side" — see `## Revision history` for the rescope entry
  and the 5-gap finding that triggered it.
- Outcome: Six commits. Phase C spot-check against three hono
  files (`jsx/base.ts`, `hono-base.ts`, `http-exception.ts`)
  surfaced five material gaps: class members missing (Gap 1),
  namespace children missing (Gap 2), complex class signature
  truncation via generic `= {}` default (Gap 3), arrow-function
  signatures empty (Gap 4), type-alias signature bleed under ASI
  convention (Gap 5). Four of five fixed in v0.2; Gap 4 deferred
  to v0.3 with rationale. Parity fixture + integration tests
  added per Step 1 pattern — tests protect against regression
  even for the one behavior that was already correct (Gap 5
  corollary on multi-line object-shape type aliases).
- Notable decisions:
  - Scope expanded pre-implementation (~1 day → 2–3 days) when
    Phase C surfaced 5 gaps. Revision history entry documents the
    rescope and the directional-asymmetry framing the user
    established for interpreting Step 4c's outcome.
  - Gap 4 (arrow-function signatures) deferred to v0.3 — not
    correctness (surfaced symbol is correctly typed as variable;
    just lacks signature detail); requires a distinct
    signature-extraction path; better revisited alongside v0.3
    claim-source enrichment. Rationale captured in
    `docs/ts-adapter-parity-check.md` §Deferred-to-v0.3.
  - Gap 3 fixed via character-level generic-depth tracking in
    `extractDeclarationHeader`. 14 LOC, well under the 30-LOC
    timebox threshold the user set for Gap 3. Keeps `{` inside
    `<… = {}>` from triggering premature termination.
  - Gap 5 fix exported a new helper `looksLikeNewTopLevelDeclaration`
    so the boundary heuristic is unit-testable in isolation.
    Column-0 anchor distinguishes new declarations from indented
    continuation lines inside multi-line object-shape or union
    type-alias bodies.
  - Known limitation documented (not a gap): TS fields typed as
    function (hono's `get!: HandlerInterface<…>` pattern) don't
    surface as methods. Consistent with Python's drop-instance-vars
    policy — no Python analog exists for function-typed fields.
    Hono's `route` method (actual method declaration) surfaces
    correctly; the HTTP verb properties stay as fields. Future
    fix surfaces documented in parity doc if evidence warrants.
- Ship-criteria verification:
  - Parity matrix doc committed at
    `docs/ts-adapter-parity-check.md` with Phase C findings filled
    in: commit `79228b1`.
  - `test/fixtures/typescript/parity.ts` fixture committed:
    commit `8d2ef94`.
  - TS parity integration tests in `src/adapters/typescript.test.ts`
    under `"parity (v0.2 Stream A #4)"` describe block: 5 tests,
    all pass.
  - Gap 1 (class/interface children iteration): passes via
    "class members are surfaced" + "interface members are surfaced"
    tests. Production verification on hono: `jsx/base.ts` went
    25→35 symbols; `HTTPException.getResponse` now surfaces with
    signature `getResponse(): Response`; `Hono.route` method
    surfaces.
  - Gap 2 (namespace children): passes via "namespace children
    are surfaced" test. Production verification: JSX namespace's
    inner types (`Element`, `ElementChildrenAttribute`,
    `IntrinsicElements`, `IntrinsicAttributes`) all surface
    correctly.
  - Gap 5 (type-alias signature bleed): passes via "type-alias
    signature does not bleed..." test + 3 new
    `extractTypeAliasHeader` unit tests covering ASI cases +
    28 `looksLikeNewTopLevelDeclaration` unit tests. Production
    verification: `Props` signature on `jsx/base.ts` now clean
    `type Props = Record<string, any>`.
  - Gap 3 (generic-default truncation): passes via "complex
    generic class signature with '= {}' default" test.
    Production verification: `Hono` class signature fully
    populated with all four type parameters including
    `S extends Schema = {}`.
  - Gap 4 deferral: passes via
    `docs/ts-adapter-parity-check.md` §Deferred-to-v0.3 with
    explicit rationale.
  - Conformance suite continues passing unchanged: 68/68
    pyright + 47/47 typescript.
  - No regression in either adapter's test suite: 583 passing
    repo-wide (+37 new since Step 3 close — 5 parity integration
    tests, 3 ASI-convention unit tests, 28
    `looksLikeNewTopLevelDeclaration` unit tests, 1
    complex-class-signature test).
- Tests: 583 passing repo-wide (was 546 at Step 3 close; +37 new).

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

### 2026-04-24 (Step 4c outcome): interpretation (A) with nuance — thesis survives.
The Phase 5 spot-check (h4-ca re-run on refined hono atlas) found
the CA/alpha cost ratio dropped from 7.3× to 3.93×, with richer
answer output and a mechanism shift (`Grep` → `find_by_intent`).
This matches interpretation (A) framed in the pre-implementation
rescope entry below. Thesis survives; v0.2 continues to Step 5.

**Documentation path: footnote, not revision.**
`phase-5-reference-run.md` §9 appended (~180 lines covering
context, metrics, mechanism validation, qualitative comparison,
interpretation, updated asymmetry framing, v0.3+ implication,
caveats, decision). Four inline pointers added (executive summary
bullet 2, §3 header, §5.1 end, §6.1 end) to surface the
re-measurement caveat to readers citing specific Phase 5 numbers.
Phase 5 analysis preserved as historical record.

**One amendment to the original framing:** the directional-
asymmetry claim "showcase cells weren't inflated" still stands,
but also: **showcase cells had their cost suppressed** because
richer bundles weren't available for deeper investigation.
Phase 5's 7.3× and Step 4c's 3.93× are both "CA dominating alpha
via intent-first exploration" at different points on the same
efficiency/depth curve, not different conclusions.

**Additional insight for v0.3+ planning:** CA's value scales with
atlas richness. Step 13 grading methodology should specifically
measure answer quality at matched cost budgets, not just matched
inputs. Captured in `phase-5-reference-run.md` §9 §Implication.

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
