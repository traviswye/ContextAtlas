# ContextAtlas v0.3 Step Plan

**Status:** Active execution plan for v0.3. See `## Revision history`
(bottom of document) for material scope/plan changes during execution.
**Last revised:** 2026-04-25 — initial authoring at v0.3 prep
session close. v0.3 scope per [`v0.3-SCOPE.md`](v0.3-SCOPE.md);
input substrate from
[`../ContextAtlas-benchmarks/research/v0.2-retrospective.md`](../ContextAtlas-benchmarks/research/v0.2-retrospective.md)
+
[`../ContextAtlas-benchmarks/research/v0.3-backlog-inventory.md`](../ContextAtlas-benchmarks/research/v0.3-backlog-inventory.md).
16 numbered steps spanning Streams A/B/C/D + ship gate.

**What this document is:** The execution-level plan for v0.3 — step
order, per-step ship criteria, dependencies, ownership, and progress
tracking. Mirrors STEP-PLAN-V0.2.md structure with one addition
(Owner field per step).

**What this document isn't:** The scope doc. The thesis, stream-level
deliverables, success criteria, and rescope conditions live in
[`v0.3-SCOPE.md`](v0.3-SCOPE.md). This plan *implements* that scope;
it does not redefine it.

**Responsibility split:**

- [`v0.3-SCOPE.md`](v0.3-SCOPE.md) — *what* and *why*. Stable during
  execution; changes trigger revision notes here.
- **This document** — *how* and *when*. Evolves during execution;
  material rescopes get logged in `## Revision history`.

---

## Conventions

### Step structure

Each step below has five fields:

- **Scope.** One-line statement + pointer to the `v0.3-SCOPE.md`
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
    requiring judgment).
  - **Both** — Sequential collaboration (Claude drafts, Travis
    approves/runs/commits, or vice versa).

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
`v0.3-SCOPE.md` OR changes downstream steps' ship criteria.
Tactical adjustments (minor re-ordering within a step, timebox
tweaks) don't need revision notes — rewrite in place with rationale
in the git commit.

---

## Execution order

Streams have natural dependencies enforced by the v0.3-SCOPE.md
Sequencing section's two load-bearing constraints:

1. **Theme 1.2 must precede Stream B.** Adding docstring claims
   without ranking precision would amplify the muddy-bundle
   problem.
2. **Theme 2.1 must precede Stream D.** Without atlas-file-
   visibility filtering, the v0.3 reference run inherits the
   c6-class measurement artifact.

Stream A (precision foundation) lands first. Stream C 2.1 is small
enough to slot anywhere before Stream D — practical placement is
inside the Stream B work window where it doesn't gate other
streams. Stream B follows Stream A. Stream D follows Stream B.
Stream C 2.2/2.3 land alongside Stream D.

```
 [1] Theme 1.2 Fix 1 — ADR authoring validation ─┐
 [2] Theme 1.3 — atlas schema v1.3 commit_sha ───┤
                                                  │
                                                  ↓
 [3] Theme 1.1 — multi-symbol API ADR-N draft
                  │
                  ↓
 [4] Theme 1.1 — multi-symbol implementation + tests
                  │
                  ↓
 [5] Theme 1.2 Fix 2 — narrower attribution + p4 spot-check
 [6] Theme 1.2 Fix 3 — BM25 ranking + ADR-09 amendment + p4 spot-check
                  │
                  ↓
 [7] Stream A finalization — fix-selection decision + flag retirement
                  │
                  ↓ (Theme 1.2 prerequisites Stream B)
 [8] Stream B probe — cross-language docstring surface examination
                  │
                  ↓
 [9] Stream B prompt drafting + calibration on 10–15 examples
                  │
                  ↓
[10] Docstring extraction — language 1 (probe-decided, contract-defining)
                  │
                  ↓
[11] Docstring extraction — languages 2 + 3 + cross-language conformance
                  │
                  ↓
[12] Theme 2.1 — atlas-file-visibility filter + methodology note
                  │ (Theme 2.1 prerequisites Stream D)
                  ↓
[13] Theme 2.3 — Go-specific cost priors (harness-code change)
                  │
                  ↓
[14] v0.3 atlas re-extraction (hono / httpx / cobra)
                  │
                  ↓
[15] Stream D — reference matrix + Phase 8 synthesis (incl. Theme 2.2)
                  │
                  ↓
[16] v0.3 ship gate
```

Steps 5 + 6 may run in either order or in parallel — both are
flag-gated implementations whose spot-checks inform the Step 7
decision. Step 11's per-language order (which is "language 2"
vs "language 3") is probe-decided in Step 8; default Stream B
ordering is Go → TS → Python per the v0.3-SCOPE.md Stream B
item 0 default. Theme 2.2 (cross-harness asymmetry comparison)
is delivered as part of Step 15's Phase 8 synthesis + RUBRIC.md
amendment, not as a separate step — it's a synthesis-time
methodology addition rather than harness code.

---

## Steps

### Step 1 — Theme 1.2 Fix 1: ADR authoring validation

**Scope.** At extraction time, flag frontmatter-declared symbols
that don't resolve. Smallest of the three Theme 1.2 fixes; ships
unconditionally per
[`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream A item 1 Fix 1.

**Ship criteria.**
- [ ] Extraction pipeline emits a warning channel listing
  unresolved frontmatter symbols (per-ADR + total count).
- [ ] Tests cover (a) all-resolve happy path, (b) some-unresolved
  warning path, (c) all-unresolved sanity case.
- [ ] Behavior documented inline in `src/extraction/pipeline.ts`
  (or wherever frontmatter resolution lives) — no new ADR; this
  is additive diagnostic output.
- [ ] No regression in existing 659-passing main-repo test suite.

**Key decisions.**
- Output channel: stderr text vs structured JSON entry in extraction
  result. Default: both — stderr line for human visibility, structured
  field in `ExtractionPipelineResult` for tooling.

**Depends on.** Nothing. Smallest start; ships first.
**Unblocks.** Step 7 (Stream A finalization assumes Fix 1 in atlas).
**Owner.** Claude.
**References.** v0.3-SCOPE.md Stream A item 1 Fix 1; backlog
inventory Theme 1.2; Phase 6 §5.1.

---

### Step 2 — Theme 1.3: atlas schema v1.3 + contextatlas_commit_sha

**Scope.** Bump atlas schema 1.2 → 1.3 with optional
`generator.contextatlas_commit_sha` field. Same additive pattern as
1.0 → 1.1 (ADR-11) and 1.1 → 1.2 (ADR-14 in v0.2). Per
[`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream A item 3.

**Ship criteria.**
- [ ] `src/storage/types.ts`: ATLAS_VERSION = "1.3";
  SUPPORTED_ATLAS_VERSIONS = ["1.0", "1.1", "1.2", "1.3"];
  AtlasGeneratorInfo gains optional `contextatlas_commit_sha?: string`.
- [ ] Extraction pipeline captures `git rev-parse HEAD` from the
  contextatlas package root at extraction time; populates the new
  field.
- [ ] Atlas exporter emits the field when populated; importer reads
  it back; round-trip preserved.
- [ ] Storage migration: not required (field is optional and lives
  in the `generator` JSON blob already in `atlas_meta`).
- [ ] ADR-06 amendment: small block documenting the new field +
  ADR-11/ADR-14 pattern reference.
- [ ] Tests cover round-trip with field present + field absent.

**Key decisions.**
- How does the extraction pipeline find the contextatlas package
  root for `git rev-parse`? Default: `createRequire` package-root
  lookup, same pattern `scripts/run-reference.ts` uses for
  benchmarks-repo provenance.

**Depends on.** Nothing. Independent of Step 1.
**Unblocks.** Step 15 (v0.3 atlas extraction will populate the
field on first emission).
**Owner.** Claude.
**References.** v0.3-SCOPE.md Stream A item 3; backlog inventory
Theme 1.3; ADR-06; ADR-11 precedent.

---

### Step 3 — Theme 1.1: multi-symbol API ADR-N draft

**Scope.** Author ADR-N documenting the multi-symbol
`get_symbol_context` call shape decision: tool-shape (new tool vs
extending existing), output format, error semantics for partial
failures, max-symbols cap. Per
[`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream A item 2 + Open Question
#2.

**Ship criteria.**
- [ ] ADR-N committed at `docs/adr/ADR-N-multi-symbol-context.md`
  with full Context / Decision / Rationale / Consequences /
  Limitations / Non-goals sections (mirroring ADR-13/14).
- [ ] Decision locked: new tool `get_symbols_context([sym])` vs
  option on existing `get_symbol_context(sym | [sym])` — explicit
  rationale either way.
- [ ] Frontmatter symbols list includes the new symbols (the new
  tool function/handler if path A; the modified handler if path
  B). Pre-implementation; will read as unresolved during this
  step's extraction runs (same pattern ADR-13/ADR-14 used for
  PyrightAdapter / GoAdapter).
- [ ] Cross-references to v0.3-SCOPE.md Stream A item 2 + Open
  Question #2.

**Key decisions.**
- New tool vs existing extension (Open Question #2). Default lean:
  extend existing if MCP-SDK serialization handles the union type
  cleanly; new tool if discriminator semantics matter for
  tool-routing. Probe MCP SDK's tool-input schema during ADR
  drafting.

**Depends on.** Nothing. Parallelizable with Steps 1, 2.
**Unblocks.** Step 4 (implementation locks against this ADR).
**Owner.** Claude. ADR-N draft + symbol-list resolution.
**Travis sub-task at ship time:** review ADR-N decisions
(particularly the new-tool-vs-extend-existing call from Open
Question #2) before Step 4 begins.
**References.** v0.3-SCOPE.md Stream A item 2; Phase 7 §5.1
grep-ceiling finding; ADR-13/14 probe-then-decide precedent.

---

### Step 4 — Theme 1.1: multi-symbol implementation + tests

**Scope.** Implement the multi-symbol call shape per Step 3's
ADR-N. Per [`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream A item 2.

**Ship criteria.**
- [ ] MCP tool surface implements ADR-N's chosen shape; existing
  single-symbol path preserved.
- [ ] Output format: per-symbol sub-bundles within a single
  compact-text response. JSON variant follows ADR-04's opt-in
  pattern.
- [ ] Tests cover (a) single-symbol equivalence with old call,
  (b) multi-symbol happy path, (c) partial failure (one symbol
  resolves, one doesn't), (d) max-symbols cap enforcement.
- [ ] Integration test exercises the new shape against the
  contextatlas-self atlas (dogfood pattern from CLAUDE.md).
- [ ] No regression in main-repo test suite.

**Key decisions.**
- None expected at implementation time; ADR-N locks the
  decisions in Step 3.

**Depends on.** Step 3.
**Unblocks.** Step 16 (Phase 8 synthesis exercises this on Go
c4-stream-lifecycle per Stream D scope item 4).
**Owner.** Claude.
**References.** v0.3-SCOPE.md Stream A item 2; ADR-N (from Step 3).

---

### Step 5 — Theme 1.2 Fix 2: narrower attribution + p4 spot-check

**Scope.** Implement narrower claim attribution behind a feature
flag — drop frontmatter-baseline inheritance in
`writeClaimsForFile`. Spot-check on Phase 6 p4-stream-lifecycle
to inform Step 7's decision. Per
[`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream A item 1 Fix 2.

**Ship criteria.**
- [ ] Feature flag `extraction.narrowerAttribution` (or
  equivalent CLI flag) defaults off; flag-on changes the
  attribution mechanic.
- [ ] Tests cover (a) flag-off matches v0.2 attribution exactly,
  (b) flag-on drops frontmatter inheritance, (c) per-claim
  candidates still resolve correctly.
- [ ] **Spot-check measurement on Phase 6 p4-stream-lifecycle**:
  re-extract httpx atlas with flag on, re-run p4 alpha + ca
  cells, capture per-cell metrics. Total spot-check cost
  ~$0.10–0.30. Findings recorded as comment in
  `research/v0.3-stream-a-spot-check.md` (scratch note;
  promotion into Phase 8 synthesis at Step 16).
- [ ] No regression in main-repo test suite.

**Key decisions.**
- Per-claim candidate fallback when frontmatter inheritance
  drops: how aggressive is the candidate-resolver substitute?
  Default: minimal — claims with no resolved candidates surface
  as warnings (composes with Step 1's diagnostic channel).

**Depends on.** Step 1 (Fix 1's diagnostic channel composes
cleanly with the warnings Fix 2 may surface).
**Unblocks.** Step 7 (decision reads Step 5 + Step 6 evidence).
**Owner.** Claude. Implementation + spot-check execution.
**Travis sub-task at ship time:** review spot-check evidence
note before Step 7 begins (decision input).
**References.** v0.3-SCOPE.md Stream A item 1 Fix 2; backlog
inventory Theme 1.2; Phase 6 §5.1.

---

### Step 6 — Theme 1.2 Fix 3: BM25 ranking + ADR-09 amendment + p4 spot-check

**Scope.** Implement BM25 ranking on `get_symbol_context` claims
behind a feature flag. Amend ADR-09 to extend BM25 from
`find_by_intent` to `get_symbol_context`. Spot-check on Phase 6
p4-stream-lifecycle. Per
[`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream A item 1 Fix 3 (BM25
sub-approach; embedding-based deferred to v0.4).

**Ship criteria.**
- [ ] Feature flag `mcp.symbolContextBM25` (or equivalent)
  defaults off; flag-on activates query-aware ranking.
- [ ] MCP tool-interface change: `get_symbol_context` accepts
  optional `query` parameter; when present and flag on, claims
  are BM25-ranked against query.
- [ ] ADR-09 amendment: extends scope from find-by-intent to
  symbol-context; documents the optional-query interface
  change; cross-references ADR-N from Step 3 if multi-symbol
  shape also receives query parameter.
- [ ] Tests cover (a) flag-off behavior unchanged, (b) flag-on
  with query ranks claims, (c) flag-on without query falls back
  to deterministic order.
- [ ] **Spot-check measurement on Phase 6 p4-stream-lifecycle**:
  re-extract httpx atlas (or reuse Step 5's atlas if Fix 2 +
  Fix 3 don't conflict at extraction time), re-run p4 ca cell
  with flag on, capture per-cell metrics. Findings recorded in
  same scratch note as Step 5.
- [ ] No regression in main-repo test suite.

**Key decisions.**
- Whether `query` parameter on `get_symbol_context` is
  always-passed (caller-provided context) or optional. ADR-09
  amendment locks this. Default: optional — backward-compat
  with v0.2 callers; ranking only when query provided.

**Depends on.** Step 1 (Fix 1 unconditionally; Fix 3 composes
above it).
**Unblocks.** Step 7 (decision).
**Owner.** Claude. Implementation + ADR-09 amendment draft +
spot-check execution.
**Travis sub-tasks at ship time:** review ADR-09 amendment
text + review spot-check evidence note before Step 7 begins
(decision input).
**References.** v0.3-SCOPE.md Stream A item 1 Fix 3 + Open
Question #1; backlog inventory Theme 1.2; ADR-09.

---

### Step 7 — Stream A finalization: Theme 1.2 fix-selection + flag retirement

**Scope.** Based on Step 5 + Step 6 spot-check evidence, lock
which Theme 1.2 fixes ship to v0.3 atlas extraction. Retire
losing flag(s); ship winning fix(es) as default behavior. Per
[`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream A item 1 + Open
Question #1.

**Ship criteria.**
- [ ] Decision documented: which combination of Fix 2, Fix 3,
  or both ships in v0.3 atlas extraction. Rationale cites
  Step 5 + Step 6 spot-check evidence.
- [ ] If Fix 2 ships: feature flag retired; behavior becomes
  default. If Fix 3 ships: feature flag retired; query
  parameter becomes documented stable interface.
- [ ] If neither ships (rescope per v0.3-SCOPE.md rescope
  condition #1): rationale documented in
  `research/v0.3-stream-a-spot-check.md` + flagged for
  Phase 8 synthesis.
- [ ] Stream A scope completion confirmed: Fix 1 (Step 1) +
  Theme 1.3 (Step 2) + Theme 1.1 (Step 4) + Theme 1.2
  decision (this step) all shipped.
- [ ] Spot-check note ready for promotion into Phase 8
  synthesis at Step 16.

**Spot-check evidence vs Stream D measurement.** Spot-check
evidence from Steps 5+6 informs fix selection; Stream D atlas
extraction at Step 14 (atlas re-extraction; renumbered from
prior Step 15) locks the chosen fix into v0.3 atlases. If
Stream D measurement contradicts spot-check evidence, that's a
Phase 8 finding (recorded in Step 15 synthesis), not a re-do
trigger. The spot-check is the cheap gate; Stream D is the
rigorous measurement. Both surface evidence; only Stream D's
result ships to v0.3 narrative.

**Key decisions.**
- The decision itself is the ship criterion. Captured in the
  step's progress-log entry.

**Depends on.** Steps 5, 6.
**Unblocks.** Step 8 (Stream B begins; Theme 1.2 ↔ Stream B
sequencing constraint resolved).
**Owner.** Both. Travis decides based on evidence; Claude
executes flag retirement + finalization.
**References.** v0.3-SCOPE.md Stream A item 1 + Open Question
#1 + Rescope Condition #1.

---

### Step 8 — Stream B probe: cross-language docstring surface

**Scope.** Probe phase preceding implementation: examine
docstring surface across TypeScript / Python / Go to inform
Stream B contract design. Decide language implementation order.
Per [`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream B item 0.

**Ship criteria.**
- [ ] Probe artifacts in `docs/adr/docstring-probe-findings.md`
  (mirrors `pyright-probe-findings.md` and `gopls-probe-findings.md`
  pattern).
- [ ] Per-language sample: 5–10 docstrings each from hono /
  httpx / cobra source files. Captured raw form (file:line +
  literal text).
- [ ] Per-language analysis: structured fields available
  (TS JSDoc tags, Python Sphinx/Google/NumPy sections, Go
  natural-prose conventions); claim shape extractable from
  each surface; severity inference signals available.
- [ ] **Stream B sub-decision: language implementation order**
  recorded with rationale. Default (A) Go-first per
  v0.3-SCOPE.md unless probe rules it out.
- [ ] Probe-findings doc cross-referenced from Steps 9, 10, 11,
  12 step bodies.

**Key decisions.**
- Language order (A vs B per v0.3-SCOPE.md). Decided here, not
  in scope doc.
- Whether Go's gopls hover output suffices or direct comment
  parsing required. Probe surfaces evidence either way.

**Depends on.** Step 7 (Stream A complete; sequencing constraint
satisfied).
**Unblocks.** Steps 9, 10, 11, 12 (Stream B implementation
work).
**Owner.** Claude.
**References.** v0.3-SCOPE.md Stream B item 0; v0.2
retrospective §"Pre-implementation surveys"; ADR-13/14
probe-then-decide precedent.

---

### Step 9 — Stream B prompt drafting + calibration

**Scope.** Draft docstring-extraction prompt; calibrate against
10–15 docstring examples surfaced in Step 8 probe; decide
single-prompt vs dual-prompt (with ADR-02 amendment if dual).
Per [`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream B item 5.

**Ship criteria.**
- [ ] Docstring-extraction prompt drafted in
  `src/extraction/docstring-prompt.ts` (or sibling to the
  ADR-extraction prompt, depending on dual-prompt decision).
- [ ] Calibration run: 10–15 docstring examples processed;
  100% JSON parse success required (matches ADR-02 quality
  bar from v0.1's 12-document validation).
- [ ] Severity inference validated: known-`@deprecated` cases
  → `hard`; explicit "must" cases → `hard`; default → `soft`.
- [ ] Decision: single shared prompt (extends EXTRACTION_PROMPT)
  vs dual prompts (separate ADR-prompt + docstring-prompt).
  Rationale documented.
- [ ] If dual-prompt: ADR-02 amendment block landed.
- [ ] Calibration results captured in
  `research/v0.3-docstring-prompt-calibration.md` (scratch
  note; absorbed into Phase 8 synthesis at Step 16 if findings
  shape v0.3 narrative).

**Key decisions.**
- Single vs dual prompt (per v0.3-SCOPE.md Stream B item 5).
  Default lean: dual if calibration shows ADR-prompt's
  ADR-shape priors hurt docstring extraction; single if shape
  is generic enough to reuse.

**Depends on.** Step 8.
**Unblocks.** Steps 10, 11, 12.
**Owner.** Both. Claude drafts prompt + analyzes calibration;
Travis runs API calibration calls (~$1–2 spend) + approves
prompt.
**References.** v0.3-SCOPE.md Stream B item 5; ADR-02; v0.1
prompt validation pattern.

---

### Step 10 — Docstring extraction: language 1 (probe-decided)

**Scope.** Implement docstring extraction for the first language
per Step 8's order decision. Default Go (richest surface). Per
[`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream B items 1/2/3 (specific
language picked at execution).

**Ship criteria.**
- [ ] Extraction pipeline reads docstrings via the language's
  adapter substrate (gopls hover for Go; tsserver hover or
  comment scan for TS; pyright hover for Python).
- [ ] Claims emitted with `source: "docstring:<path>"` (or
  the source-key shape decided in v0.3-SCOPE.md Open Question
  #3 during Step 9 implementation).
- [ ] Symbol-keyed: each docstring's claims attach to the
  documented symbol's SymbolId.
- [ ] Severity inference applied per Step 9's calibration.
- [ ] Tests cover (a) docstring present + parsed correctly,
  (b) docstring absent (no claim), (c) malformed docstring
  (graceful skip with diagnostic).
- [ ] Dogfood validation: extraction produces docstring claims
  on a sample file from the relevant repo (cobra for Go;
  hono for TS; httpx for Python).
- [ ] No regression in main-repo test suite.

**Key decisions.**
- Module-level docstring SymbolId shape (Python — applies
  here if Python is language 1; otherwise resolves in later
  step). Default per v0.3-SCOPE.md Stream B item 2:
  `sym:py:<path>:<module>` synthetic SymbolId.

**Depends on.** Step 9.
**Unblocks.** Step 11 (next language).
**Owner.** Claude.
**References.** v0.3-SCOPE.md Stream B items 1/2/3 (specific
item per probe decision); ADR-13/14 if Go.

---

### Step 11 — Docstring extraction: second and third languages + cross-language conformance

**Scope.** Implement docstring extraction for the two remaining
languages (per Step 8's order decision) and complete the
cross-language conformance pass. Languages 2 and 3 are
mechanical extension of Step 10's contract-defining work — the
adapter substrate differs but the pipeline shape is settled.
Per [`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream B items 1/2/3.

**Ship criteria.**
- [ ] Language 2 docstring extraction shipped: same shape as
  Step 10's contract; reads via the language's adapter
  substrate; emits claims with the v0.3 source-key shape.
- [ ] Language 3 docstring extraction shipped (same shape).
- [ ] Cross-language conformance: all three language docstring
  extractors share the same claim-emission interface; pipeline
  routes per-file by adapter language; no per-language
  special-casing in the pipeline itself, only in the per-adapter
  docstring readers.
- [ ] Multi-language atlas extraction produces docstring claims
  from all three languages in a single run (relevant when
  contextatlas-self dogfoods or for multi-language repos).
- [ ] Tests cover all three languages composing in the same
  atlas extraction run.
- [ ] Dogfood validation: extraction produces docstring claims
  on a sample file from each remaining repo (TS / Python / Go,
  per probe order).
- [ ] Stream B scope completion confirmed: TS / Python / Go all
  shipping docstring claims.
- [ ] No regression in main-repo test suite.

**Key decisions.**
- Module-level docstring SymbolId shape (Python — applies
  here if Python is language 2 or 3 and wasn't resolved in
  Step 10). Default per v0.3-SCOPE.md Stream B item 2:
  `sym:py:<path>:<module>` synthetic SymbolId.

**Depends on.** Step 10 (contract-defining first language
must land before mechanical extension).
**Unblocks.** Step 14 (v0.3 atlas re-extraction).
**Owner.** Claude.
**References.** v0.3-SCOPE.md Stream B items 1/2/3 + closing
note on cross-language conformance.

---

### Step 12 — Theme 2.1: atlas-file-visibility filter + methodology note

**Scope.** Implement trace-time filter excluding cells where
beta's trace references atlas paths. Author the methodology
note during execution per v0.2 retrospective lesson. Per
[`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream C item 1.

**Ship criteria.**
- [ ] Trace-time filter shipped in benchmarks-repo
  `src/harness/run.ts` (or equivalent): post-run pass detects
  cells whose beta trace references `atlases/<repo>/atlas.json`,
  `atlases/<repo>/index.db`, or similar atlas paths; flags
  affected cells.
- [ ] Filter produces structured output usable by synthesis
  authoring (filtered-cells list + per-cell trace excerpt
  showing the contamination).
- [ ] Methodology note authored at
  `research/atlas-file-visibility-benchmark-methodology.md`
  (benchmarks repo): documents the filter + alternative paths
  (clean-workspace mode, atlas-aware prompts) for v0.4+
  consideration.
- [ ] RUBRIC.md amendment documenting the filter as standard
  v0.3+ methodology.
- [ ] Backwards-applied to v0.2 reference data: filter run on
  Phase 5/6/7 traces, contamination rate measured. If the
  c6-class artifact rate is <10% across v0.2 data (per
  rescope condition threshold), trace-time filter approach
  suffices for v0.3.
- [ ] Benchmarks-repo test suite passes (was 197).

**Key decisions.**
- If v0.2 backwards-applied filter shows >10% contamination
  rate, trigger v0.3-SCOPE.md rescope condition #4 (clean-
  workspace mode pivot).

**Depends on.** Nothing structurally — could in principle land
earlier. Placed here to keep Stream A and Stream B work
unblocked. Realistic earliest: after Step 7 (Stream A locks
atlas extraction shape that Stream D will measure against).
**Unblocks.** Step 16 (Stream D synthesis uses filter output).
**Owner.** Claude.
**References.** v0.3-SCOPE.md Stream C item 1 + Rescope
Condition #4; backlog inventory Theme 2.1; v0.2 retrospective
§"Author methodology-issue notes during execution."

---

### Step 13 — Theme 2.3: Go-specific cost priors

**Scope.** Refactor `COST_PRIORS_V0_1` (or its v0.3 successor)
in benchmarks-repo `src/harness/run.ts` to support per-language
bucket scales. Seed Go priors from Phase 7 cobra data. Standalone
harness-code change. Per [`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream
C item 3. (Theme 2.2 — synthesis-doc convention — moves to
Step 15 as a Phase 8 deliverable rather than a separate step;
it's a synthesis-time addition, not harness code.)

**Ship criteria.**
- [ ] `src/harness/run.ts` cost-priors refactored to support
  per-language bucket scales. Default priors seeded from
  Phase 5/6/7 data: hono (TS-baseline) at current values;
  httpx (Python) calibrated against Phase 6; cobra (Go) at
  ~$0.30/cell blended per Phase 7.
- [ ] RUBRIC.md amendment documenting the per-language
  calibration pattern.
- [ ] Step-13 (downstream future-step) budget projection
  updated to $115–150 (per Phase 7 §7) in any docs that
  previously cited $176–210.
- [ ] Benchmarks-repo test suite passes; cost-priors tests
  cover (a) per-language lookup, (b) fallback when language
  not seeded.

**Depends on.** Nothing structurally; small standalone
harness-code change. Practical placement: alongside Step 12's
RUBRIC.md amendment to bundle methodology updates.
**Unblocks.** Step 15 (Phase 8 synthesis cites revised
priors; v0.3 budget projections defensible).
**Owner.** Claude.
**References.** v0.3-SCOPE.md Stream C item 3; backlog
inventory Theme 2.3; Phase 7 §7 + §8.4.

---

### Step 14 — v0.3 atlas re-extraction

**Scope.** Re-extract atlases for hono / httpx / cobra against
the v0.3-sharpened pipeline (Stream A's chosen Theme 1.2 fixes
+ Stream B's docstring extraction across all three languages +
Theme 1.3's commit_sha). First-time-commit per the v0.2 Step 5
pattern (httpx atlas first-time-commit) but for three repos
this time. Per [`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream D item 1.

**Ship criteria.**
- [ ] hono atlas re-extracted: `atlases/hono/atlas.json`
  committed in benchmarks repo; symbol count + claim count
  recorded; sentinel `Hono` present; `contextatlas_commit_sha`
  populated.
- [ ] httpx atlas re-extracted: same shape; sentinel `Client`
  present.
- [ ] cobra atlas re-extracted: same shape; sentinel `Command`
  present.
- [ ] Each atlas's claim count materially higher than v0.2's
  ADR-only count (docstring claims now included).
- [ ] Provenance notes in each atlas's commit message:
  contextatlas commit SHA, extraction model, atlas schema v1.3,
  Stream A chosen-fix configuration.
- [ ] Total extraction cost recorded (~$3–6 per scope doc).
- [ ] Benchmarks repo's `verify-pinned-repos.mjs` passes
  (target SHAs unchanged from v0.2).

**Key decisions.**
- None expected. All shape decisions resolved in Steps 1–13.

**Depends on.** Steps 7 (Stream A complete), 11 (Stream B
complete), 13 (cost priors current).
**Unblocks.** Step 15.
**Owner.** Travis. Runs extraction via
`scripts/extract-benchmark-atlas.mjs <repo>` for each target.
**References.** v0.3-SCOPE.md Stream D item 1; v0.2 Step 5
first-time-commit pattern.

---

### Step 15 — Stream D matrix execution + Phase 8 synthesis (incl. Theme 2.2)

**Scope.** Execute the v0.3 reference matrix on the three new
atlases against the same locked pre-registered prompts. Author
Phase 8 synthesis covering the minimum-three findings + any
additional findings Stream D investigation surfaces. Phase 8
also delivers Theme 2.2 (cross-harness asymmetry comparison
table) as standard synthesis-doc convention — first
implementation here; RUBRIC.md amendment lands as part of this
step. Per [`v0.3-SCOPE.md`](v0.3-SCOPE.md) Stream D items 2-5
+ Stream C item 2.

**Ship criteria.**
- [ ] Three reference matrices executed: hono / httpx / cobra.
  Each: 24/24 cells clean (or rescope per v0.3-SCOPE.md
  rescope condition #3 if matrix contradicts Phase 5/6/7
  patterns on sharpened atlas).
- [ ] **MCP preflight passes** for each beta-ca matrix launch
  (v0.2 Step 7 finding + Step 11 infra).
- [ ] **Hibernation prevention** (`powercfg` per v0.2 Step 6
  finding) applied before each matrix launch.
- [ ] Trace-time filter (Step 12) applied to each matrix's
  output; contamination rate recorded per repo.
- [ ] Reference artifacts promoted to
  `runs/reference/{hono,httpx,cobra}/` per the Phase 5/6/7
  promotion pattern. Per-cell artifacts; run-manifest.json;
  summary.md.
- [ ] **Phase 8 synthesis** at
  `research/phase-8-v0.3-reference-run.md` (benchmarks repo).
  Mandatory minimum (per v0.3-SCOPE.md Stream D item 4):
  Theme 1.2 fix validation on p4-stream-lifecycle; Stream B
  docstring source value; Theme 1.1 multi-symbol API exercise
  on c4-stream-lifecycle (or equivalent grep-ceiling cell).
  Additional findings allowed.
- [ ] **Theme 2.2 deliverable**: Phase 8 includes the
  cross-harness asymmetry comparison (beta-ca-vs-beta vs
  ca-vs-alpha delta tables) as standard methodology. RUBRIC.md
  amendment in this step documents the comparison as v0.3+
  synthesis-doc convention. (Theme 2.2 was originally bundled
  with Theme 2.3 at one Step; split per v0.3 plan revision —
  Theme 2.3 lives as Step 13 harness-code change; Theme 2.2
  lives here as synthesis-time deliverable.)
- [ ] Step-A spot-check note (from Steps 5/6/7) absorbed into
  Phase 8 §"Theme 1.2 fix validation" with rigorous evidence.
  Per Step 7's "spot-check vs Stream D measurement" framing,
  if Phase 8 evidence contradicts Steps 5/6 spot-check
  evidence, that contradiction is the finding — not a re-do
  trigger.
- [ ] Step-9 prompt-calibration note (from Step 9) absorbed
  into Phase 8 if findings shape v0.3 narrative.
- [ ] Total matrix cost recorded against v0.3-SCOPE.md envelope
  (~$15–25).

**Key decisions.**
- Phase 8 length per the v0.2 retrospective lesson: synthesis
  LOC is finding-scaled, not estimate-scaled. Don't pre-anchor
  at "shorter than Phase 5."
- Cross-harness asymmetry hypothesis (Phase 7 §5.3): does
  Phase 8 evidence confirm or falsify it across the three v0.3
  reference runs? Document either way; this is the comparison
  table's first rigorous test.

**Depends on.** Step 14 (atlases ready), Step 12 (filter ready),
Step 13 (priors current).
**Unblocks.** Step 16 (v0.3 ship gate).
**Owner.** Both. Travis runs matrices (3 × `npx tsx
scripts/run-reference.ts`); Claude drafts synthesis from
artifacts + RUBRIC.md amendment; Travis reviews + edits.
**References.** v0.3-SCOPE.md Stream D + Stream C item 2 +
Success Criterion 4 + Open Questions #5 (synthesis depth);
Phase 5/6/7 reference runs; Phase 7 §5.3 cross-harness
asymmetry.

---

### Step 16 — v0.3 ship gate

**Scope.** Verify all v0.3-SCOPE.md success criteria met; refresh
external-facing docs (README, ROADMAP, DESIGN, CLAUDE.md);
package.json bump; annotated tag v0.3.0. External-facing target
(resume + community-sharing) raises bar on doc accuracy. Per
[`v0.3-SCOPE.md`](v0.3-SCOPE.md) Success Criteria.

**Ship criteria.**
- [ ] v0.3-SCOPE.md Success Criterion 1 (Stream A complete)
  verified via committed artifacts: ADR authoring validation
  shipped, Theme 1.2 chosen fix(es) shipped, Theme 1.1
  multi-symbol API shipped with new ADR, atlas schema v1.3
  with commit_sha shipped.
- [ ] Success Criterion 2 (Stream B docstring source landed
  across three languages) verified.
- [ ] Success Criterion 3 (Stream C methodology hardening
  complete) verified.
- [ ] Success Criterion 4 (Stream D Phase 8 reference run
  committed with mandatory minimum findings) verified.
- [ ] Success Criterion 5 (no quality-axis claims published)
  verified — README + Phase 8 synthesis explicitly note
  efficiency + bundle-precision measurement only; quality
  axis remains v0.4 scope.
- [ ] README refresh (mirror v0.2's Step 12 pattern):
  v0.3-shipped status block, headline numbers from Phase 8,
  cross-language replication updated, v0.4 hint queued.
- [ ] ROADMAP.md: v0.3 [IN PROGRESS] → [SHIPPED] with
  empirical-validation block; v0.4 section updated with
  what v0.3 surfaced as v0.4 deliverables.
- [ ] DESIGN.md: atlas schema example bumped to v1.3 with
  `contextatlas_commit_sha` example; multi-symbol tool
  documented; docstring source documented.
- [ ] CLAUDE.md: Current Version block refreshed; Benchmark
  Targets section unchanged (still hono/httpx/cobra unless
  Stream D rescoped).
- [ ] Main-repo test suite green; benchmarks-repo test suite
  green.
- [ ] `package.json` version bumped 0.2.0 → 0.3.0.
- [ ] Annotated tag `v0.3.0` created with summary message.
- [ ] All commits pushed to origin.
- [ ] STEP-PLAN-V0.3.md `## Progress log` complete with all
  16 step entries; revision history block reflects any
  scope changes during execution.

**Key decisions.**
- External-facing target deliverables specifics (Open
  Question #6): what counts as "community-sharing target
  met"? Default: README + Phase 8 synthesis are the
  community-readable surface; blog post / public benchmark
  site are post-v0.3 considerations not blocking the ship.

**Depends on.** Step 15.
**Unblocks.** v0.4 planning. v0.3 ships when this step
shipped.
**Owner.** Both. Claude drafts doc updates; Travis approves
+ runs version-bump commit + tag commands + push.
**References.** v0.3-SCOPE.md Success Criteria + Open Question
#6; v0.2 Step 12 ship-gate pattern.

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

### Step 5 shipped — 2026-04-25 (commit SHA TBD)
- **Scope.** Theme 1.2 Fix 2 — claim-attribution narrowing
  flag (`narrow_attribution`) targeting the Phase 6 §5.1
  muddy-bundle mechanism. Three-state enum (absent | `drop`
  | `drop-with-fallback`) covering Option A and Option E
  from the design-space survey.
- **Outcome — main repo.** Implementation at commit
  [`7e1956a`](https://github.com/traviswye/ContextAtlas/commit/7e1956a):
  schema/parser/CLI/pipeline plumbing + new ship-blocker
  test (v0.2-equivalence canary, parallel role to Step 4's
  BYTE_EQUIVALENCE_EXPECTED). 723/723 tests passing
  (was 698; +25 new). +726 / -26 across 11 files.
- **Outcome — benchmarks repo.** Evidence note at
  [`research/v0.3-stream-a-spot-check.md`](../ContextAtlas-benchmarks/research/v0.3-stream-a-spot-check.md)
  (commit `68e3d1e` in benchmarks repo). Cross-repo
  separation per Phase 5/6/7 pattern.
- **Spot-check empirical findings (single-cell n=1; Stream
  D is rigorous):**
  - Option A (`drop`): 17 of 75 claims attached to zero
    symbols, 8 from ADR-05 (p4-relevant ADR). Regression
    risk materialized exactly as inventory note predicted.
  - Option E (`drop-with-fallback`): 0 zero-symbol claims;
    fallback recovered all 17. Designed behavior verified.
  - Cell efficiency: Option E reduced tool calls vs Phase 6
    baseline by -57%; Option A by -36%. Option E cell also
    22% cheaper than Option A's ($0.48 vs $0.61).
  - Both variants share residual: §5.1 Request-side
    off-target claim still surfaces as top INTENT for
    `content` queries. **Fix 2 alone does not fully close
    the §5.1 mechanism**; Fix 3 is positioned to address
    the residual.
  - **Variant recommendation (scoped):** if Step 7 chooses
    to include Fix 2 in v0.3 default, variant should be
    `drop-with-fallback`. Fix 2 ship/no-ship still Step 7's
    call after reading Step 6's evidence + matrix
    evaluation.
- **Notable decisions.**
  - **Three-state enum, not boolean+boolean.** Option A and
    Option E land as flag values together (~10 LOC for the
    fallback branch), rather than as a sequential
    "implement A first, evaluate, then maybe E" path.
    Travis's call: cheap insurance vs re-implementation if
    A too coarse. Spot-check evidence supports the call —
    Option E recovered the regression risk Option A
    introduced, on the only cell measured.
  - **MAX_SYMBOLS_PER_CALL-style flag location.** Defined
    in `src/types.ts` config + `src/cli-args.ts`, mirroring
    `--budget-warn` precedence (CLI > config > absent).
    Keeps config-vs-flag separation legible.
  - **v0.2-equivalence canary as ship-blocker** (parallel
    to Step 4's BYTE_EQUIVALENCE_EXPECTED). Comment
    sharpened with explicit cross-reference to
    `src/mcp/server.test.ts` and "MUST NOT weaken this
    assertion during refactors" framing — establishes
    canary discipline as a discoverable pattern across
    v0.3 work, not isolated examples.
  - **Verification discipline.** Phase 6 baseline numbers
    (14 calls, 60.8k tokens, "There's an ADR on this"
    framing, "+2 Grep rounds") verified against actual
    `phase-6-httpx-reference-run.md` text before evidence
    note publication. Line/section anchors cited:
    `§3:102` for metrics, `§5.1:172-176` for narrative.
    Same discipline as Step 3 ADR-15 cobra hook fields.
- **Calibration data accumulated (refined from Steps
  2/3/4 cumulative pattern).**
  - **Production code: 30-40% inflation** (Steps 2/3/4
    evidence holds; Step 5 production at +200 LOC vs ~290
    estimate — within calibration).
  - **Test code: 100-130% inflation.** Step 4: +609 vs 270
    estimate (~125% over). Step 5: +471 vs 220 estimate
    (~114% over). The cumulative
    "30-40% inflation" baseline under-counted test work
    specifically. **Refined calibration: split inflation
    factors by surface — production ~30-40%, tests
    ~100-130%.** Future v0.3 step estimates apply
    separately. Driver of test inflation: empirical-
    grounding discipline (per-state assertions, dedup
    edge cases, both-format coverage, contract-grade
    fixtures).
- **Spot-check budget calibration.**
  - **Original $0.40 cap was 8.75× off.** Naive multiplier
    used; honest per-cell cost from
    `phase-5-cost-calibration.md` is $0.58 average for ca
    cells, with p4 ca specifically at 60.8k tokens
    projecting $1.00-1.30. Cap revised to $5.00; actual
    spend $3.57 (Option A + Option E), within cap with
    safety margin used.
  - **Lesson:** spot-check budget envelopes must reference
    `phase-5-cost-calibration.md` per-cell data, not naive
    multipliers. Future Step 6 + Stream D budget estimates
    apply the same grounding.
- **Step 5 deviation flagged.**
  - **Travis-runs-spot-check** (API key environment
    access). Original STEP-PLAN listed Step 5 as
    "Claude implements + spot-check execution" — practical
    constraint required Travis-execution.
  - **Artifact-flowback pattern established:** Travis
    runs commands → pastes raw artifacts → Claude drafts
    synthesis. Reusable for Step 6 spot-check + Stream D
    Steps 14/15 reference runs. The pattern preserves
    Claude's drafting throughput while keeping API spend
    under Travis's direct supervision.
- **Environment finding.**
  - **PowerShell-vs-bash runbook mismatch** caught at
    Phase 1 pre-flight (Phase 1 commands were dual-shell
    by accident; Phase 2 sed/heredoc/$()/2> would have
    failed). Future Travis-executed runbooks should be
    PowerShell-native by default.
- **Verification disciplines exercised across Step 5.**
  Three distinct verification gates fired:
  1. v0.2-equivalence canary (ship-blocker assertion at
     test time)
  2. Phase 6 baseline number citations (line-anchor
     verification before evidence-note publication)
  3. PowerShell-vs-bash command translation (Phase 1
     pre-flight catch)
  Pattern: empirical-grounding discipline manifests in
  multiple forms; identifying each form's gate prevents
  silent drift.
- **Stream D scope implication.**
  - Single-cell evidence (n=1); Stream D Step 15 measures
    across all p1-p6 on httpx + hono + cobra.
  - Phase 6 baseline cost not directly re-extracted in
    Step 5; Stream D will provide direct baseline
    measurements for the chosen v0.3 default.
- **Step 5 ship-criteria verification.**
  - Feature flag with three states (absent | `drop` |
    `drop-with-fallback`) ✓
  - Tests cover (a) flag-off matches v0.2 attribution
    exactly (v0.2-equivalence canary), (b) flag-on drops
    frontmatter inheritance, (c) per-claim candidate
    fallback when frontmatter inheritance drops ✓
  - Spot-check measurement on Phase 6 p4-stream-lifecycle
    with cost data + scratch-note publication ✓
  - No regression in main-repo test suite (723/723) ✓

### Step 4 shipped — 2026-04-25 (45cfa13)
- **Scope.** Theme 1.1 — multi-symbol API implementation
  per ADR-15. Schema + handler + tests + DESIGN.md
  amendment in a single commit.
- **Outcome.** Multi-symbol `get_symbol_context` shipped:
  `oneOf` schema with `string | string[]` input, 10-cap
  enforcement (`MAX_SYMBOLS_PER_CALL`), per-symbol
  partial-failure semantics, named-delimiter compact
  output, JSON `results` envelope, request-order
  preservation, `.trim()`-normalized exact-match dedup.
  Diff: **+1138 / -68 = +1070 net LOC** across 4 files
  (`src/mcp/schemas.ts` +48, `src/mcp/handlers/get-symbol-context.ts`
  +433/-55, `src/mcp/server.test.ts` +609, `DESIGN.md`
  +48).
- **Tests.** **698/698 passing** (was 679; +19 new — 18
  multi-symbol category-(b)-(h) tests + 1 byte-equivalence
  canary in single-symbol describe). TypeScript strict
  typecheck clean. All 8 ADR-15 §Consequences acceptance
  criteria (a-h) green:
  - (a) byte-equivalence canary: **GREEN** — literal
    `.toBe()` match against pre-refactor output captured
    2026-04-25 from probe run against HEAD before any
    handler changes
  - (b) multi-symbol happy path (compact + JSON
    envelope + length-1-array semantics)
  - (c) partial failure (not_found + disambiguation
    inlined; `isError: false`)
  - (d) all-failed (compact `ERR all_symbols_failed
    COUNT N` header + JSON asymmetry per Q4 inline-doc
    decision)
  - (e) cap enforcement (11 → InvalidParams; 10 boundary
    pass; empty rejection)
  - (f) dedup edge cases (4 sub-tests per ADR-15 §8)
  - (g) order preservation (compact + JSON variants)
  - (h) `file_hint` uniform application + control test
- **Notable decisions.**
  - **Byte-equivalence ship-blocker enforcement.** Probe
    captured pre-refactor output BEFORE any handler
    changes; canary asserts literal `.toBe()` match.
    Existing `.toMatch(/pattern/)` tests catch most
    regressions; this catches subtle ones (whitespace,
    ordering, trailing newline). Travis-requested
    explicit ship-blocker comment present on both
    constant and test.
  - **`MAX_SYMBOLS_PER_CALL = 10` location** (Q1
    decision): `src/mcp/schemas.ts` — slight deviation
    from ADR-15 §Consequences which suggested
    `src/mcp/handlers/`. Reasoning: schema's `maxItems`
    is the binding wire-level enforcement; defining at
    the schema boundary keeps both surfaces in sync via
    single import. Documented in the constant's JSDoc.
  - **JSON-format all-failed asymmetry** (Q4 decision):
    JSON uses the same `{ results: [...] }` envelope as
    partial-failure; no `all_symbols_failed` summary
    header (compact-only affordance). Consumers detect
    via `isError: true` + walking `results`. Documented
    inline in handler so future readers don't wonder
    about the asymmetry.
  - **Length-1 array semantics** (Q3 confirmed): `["Foo"]`
    gets multi-symbol envelope with one entry; `"Foo"`
    gets legacy single-bundle shape. Detection on input
    shape, not response. Test (b) verifies this directly.
  - **Optional binary smoke test deferred** (Q2
    decision): in-memory MCP pair tests cover the
    contract; binary-spawn parity is Step 16 ship-gate
    concern. Step 16 planning notes carry "Multi-symbol
    binary smoke test parallel to existing single-symbol
    coverage" as a future-Step-16 reminder.
- **Calibration data point** (refines Step 2/3 pattern):
  - Handler refactor: 250 LOC estimate → 308 net LOC
    actual (~23% over, within 30-40% inflation pattern
    but past explicit 350-LOC threshold cue Travis set
    during proposal). Threshold triggered an accounting
    pause confirming every LOC traceable to spec
    requirements (no padding, no speculative code).
    Travis approved Option 1 (proceed) after the
    accounting; the cue served its intended purpose.
  - Tests: 270 LOC estimate → 609 LOC actual (~125%
    over). Driven by ADR-15's 8 categories each
    needing both compact + JSON variants where
    applicable, dedup needing 4 sub-tests, full fixture
    setup in `beforeEach`, file_hint needing a control
    test for honest exercising.
  - **Cumulative pattern across Steps 2/3/4:**
    implementation estimates need ~30-40% inflation
    when work includes empirical-grounding discipline
    (verification, rendered examples, contract docs,
    actionable validation messages, both-format test
    coverage). Future v0.3 step estimates should apply
    this inflation factor explicitly rather than
    re-discovering it per step.
- **Ship-criteria verification.**
  - MCP tool surface implements ADR-N's chosen shape;
    existing single-symbol path preserved (byte-equivalence
    canary green).
  - Output format: per-symbol sub-bundles within a
    single compact-text response. JSON variant follows
    ADR-04's opt-in pattern via `format: "json"`.
  - Tests cover (a)-(h) per ADR-15 §Consequences plus
    sub-tests for dedup edge cases and JSON-format
    variants. Integration coverage via in-memory MCP
    pair (binary smoke test deferred to Step 16).
  - **No regression in main-repo test suite** —
    698/698 green; pre-Step-4 baseline was 679, every
    pre-existing test still passes.

### Step 3 shipped — 2026-04-25 (550caee)
- **Scope.** Theme 1.1 — multi-symbol API ADR-N draft.
  ADR-15 locks the API surface decisions for the multi-symbol
  `get_symbol_context` call shape (Phase 7 §5.1 grep-ceiling
  closure target).
- **Outcome.** ADR-15 committed at
  `docs/adr/ADR-15-multi-symbol-context.md` — 521 LOC. Eight
  H3 Decision subsections cover tool-shape (extend existing
  per Open Question #2 → Option B), schema + cap (10
  symbols, `MAX_SYMBOLS_PER_CALL`), uniform per-symbol
  options, output format (named delimiters + JSON envelope),
  partial-failure semantics (per-symbol ERR sub-bundles;
  whole-call `isError` only when all failed), disambiguation
  per-symbol, adapter-missing per-symbol, order + dedup
  (input-string-keyed with `.trim()`). All four ADR-13/14
  voice criteria met: rejected alternatives with specific
  reasoning, rendered examples in §4/§5/§6, evidence-grounded
  claims (verified cobra `Command.go:128-146` hook fields),
  Phase 7 §5.1 cited 5×.
- **Notable decisions.**
  - **Open Question #2 resolved → Option B (extend existing
    tool, not new tool).** Rationale: MCP tool selection by
    name not input shape; three-primitive framing in
    CLAUDE.md is load-bearing; backward compat is free with
    `oneOf` first alternative being literal current shape.
  - **Cap = 10** (adjustable sub-decision). Grounded in
    verified cobra `Command` 10-hook-field cluster as the
    exact-fit upper bound; Phase 7 c4's 3-symbol case as
    ~3× headroom calibration.
  - **Per-symbol partial-failure inlining over whole-call
    `isError`.** Whole-call failure forfeits the c4 use case
    directly — the grep-OR analogue produces partial matches,
    so CA's multi-symbol response must too or it's a
    strictly weaker substitute.
  - **Byte-equivalence test as ship-blocker** (Revision 3).
    Backward compat is a verifiable test criterion, not a
    claimed property; existing single-symbol golden-output
    tests must pass unchanged after Step 4.
  - **`.trim()`-normalized exact-string-match dedup**
    (Refinement 2). Input-layer concern, not
    resolution-layer. Edge cases enumerated with
    bidirectional → arrows in §8.
- **Calibration note (refines Step 2's ADR LOC envelope).**
  ADR drafting steps with full
  Decision/Rationale/Consequences/Limitations/Non-goals
  structure **plus rendered examples** in load-bearing
  decisions are **450-550 LOC**, not 350-450. Step 3 actual:
  521 LOC. STEP-PLAN-V0.3 estimate of 250-400 was
  substantially low; future ADR-drafting steps should budget
  450-550 LOC for full structure with examples. Calibration
  data accumulates: Step 2 (schema-bump-with-tests-and-docs)
  +439 LOC, Step 3 (full-structure-ADR-with-examples) 521
  LOC. Both came in above their original v0.3-SCOPE
  estimates. Pattern: estimates need ~30-40% inflation when
  the step includes empirical-grounding discipline (verified
  references, rendered examples, named rejected
  alternatives).
- **Verification discipline applied (v0.2 retrospective
  pattern).** Cobra hook field names verified against actual
  `command.go` source before committing the cap-evidence
  claim. Catch: `oneOf` not yet used in ContextAtlas's own
  schemas (verified via grep), so Revision 1's Option B was
  ruled out and Option C (softer claim) was taken instead.
  Pre-commit verification prevented two unverifiable claims
  from landing.
- **Ship-criteria verification.**
  - ADR-15 committed at expected path with full
    Context/Decision/Rationale/Consequences/Limitations/Non-goals
    sections (mirrors ADR-13/14).
  - Decision §1 explicitly resolves Open Question #2 with
    rejected-alternative reasoning.
  - Frontmatter symbols list: 3 existing
    (`getSymbolContextTool`, `createGetSymbolContextHandler`,
    `parseArgs`) + 1 forward-declared
    (`MAX_SYMBOLS_PER_CALL`, flagged in note callout, same
    pattern ADR-13/14 used for `PyrightAdapter`/`GoAdapter`).
  - Cross-references to v0.3-SCOPE.md Stream A item 2,
    Open Question #2, Phase 7 §5.1 all present.

### Step 2 shipped — 2026-04-25 (14a0356)
- **Scope.** Theme 1.3 — atlas schema v1.3 +
  `generator.contextatlas_commit_sha` provenance field.
- **Outcome.** `AtlasGeneratorInfo` gains optional
  `contextatlas_commit_sha`; `ATLAS_VERSION` bumps 1.2 → 1.3;
  importer + exporter + pipeline + cli-runner wire commit_sha
  through with null / undefined / string semantics matching
  `extracted_at_sha`. New `resolveContextatlasCommitSha()` CLI
  helper walks file-URL → package root → `git rev-parse HEAD`,
  returning null on any failure path (graceful for non-git
  `npm install`-ed binaries). DESIGN.md schema example bumped
  to v1.3; ADR-06 amended with cumulative additive-bump
  pattern reference. 12 new tests; **679/679 passing** (was
  667). +439 / -8 across 11 files.
- **Notable decisions.**
  - Canonical generator key order: `contextatlas_version`,
    `contextatlas_commit_sha`, `extraction_model`. commit_sha
    sits adjacent to its sibling provenance field
    (`contextatlas_version`) rather than at the end so the
    two tool-identity fields read together; rationale captured
    as an inline comment on the exporter literal (Decision 3
    modification).
  - DESIGN.md + ADR-06 amendments **bundled in this commit**
    (Decision 5 modification): documents update WITH the
    change that affects them, not deferred to ship gate.
  - ADR-06 amendment captures cumulative additive-bump
    pattern across three data points (v1.0 → v1.1 ADR-11,
    v1.1 → v1.2 ADR-14, v1.2 → v1.3 v0.3 Theme 1.3) — three
    data points = pattern documented (Decision 6 modification).
- **Calibration notes.**
  1. *Schema-bump LOC envelope.* Full-coverage schema-bump
     steps are 150-200 LOC range, not 50-100. Step 2 actual:
     +439 LOC (~70-100 LOC production, remainder = tests +
     docs). Calibration data for future v0.3 scope
     estimates and v0.4+ schema work.
  2. *Documents-update-with-change discipline.* Introduced
     this step: schema-touching commits include the DESIGN.md
     example bump + ADR amendment in the same commit, not
     deferred to a final docs-batch step. Adopt as v0.3
     pattern; prevents schema-doc drift between commits.
- **Ship-criteria verification.**
  - Round-trip canary: `atlas-exporter.test.ts` "contextatlas_commit_sha
    survives export → import → re-export (v1.3 round-trip)"
    asserts byte-identical re-serialized output through a
    second DB. Passing.
  - Pipeline persistence: pipeline test asserts `atlas_meta`
    row written + `atlas.json` on disk contains the SHA in
    canonical position; null path asserts field absence.
  - Resolver shape contract: `resolveContextatlasCommitSha()`
    returns `^[0-9a-f]{40}$` or null, never throws.
  - Full suite: 679/679 green; 26/26 storage tests
    (importer + exporter); 27/27 cli-runner tests.

### Step 1 shipped — 2026-04-25 (85214eb)
- **Scope.** Theme 1.2 Fix 1 — ADR authoring validation
  surfaces unresolved frontmatter symbols.
- **Outcome.** Pipeline emits `log.warn` summary + cli-runner
  `printFrontmatterWarnings` per-file breakdown by default
  (no `--verbose` required); JSON mode adds
  `frontmatter_unresolved_by_file` array. +369 LOC. 667/667
  passing (was 659).
- **Notable decisions.** Warn-not-error stance preserved for
  legitimate forward-declared symbols (ADR drafting
  precedent: ADR-13 PyrightAdapter, ADR-14 GoAdapter).

---

## Revision history

*Material scope/plan changes during execution. Small tactical
adjustments (timebox tweaks, sub-item re-ordering within a step)
are absorbed into git commits on this file; only changes that
affect v0.3-SCOPE.md OR downstream steps' ship criteria land here.*

*Format:*

```
### YYYY-MM-DD (commit SHA): Step N revised — reason.
Downstream impact: [affected steps].
```

*(No entries yet — v0.3 execution has not begun.)*
