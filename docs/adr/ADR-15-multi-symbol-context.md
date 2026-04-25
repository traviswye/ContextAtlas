---
id: ADR-15
title: Multi-symbol get_symbol_context — extend existing tool with array input; per-symbol partial-failure semantics
status: accepted
severity: hard
symbols:
  - getSymbolContextTool
  - createGetSymbolContextHandler
  - parseArgs
  - MAX_SYMBOLS_PER_CALL
---

# ADR-15: Multi-symbol `get_symbol_context` — extend existing tool with array input; per-symbol partial-failure semantics

> **Frontmatter symbols note.** `getSymbolContextTool`,
> `createGetSymbolContextHandler`, and `parseArgs` exist today in
> [`src/mcp/schemas.ts`](../../src/mcp/schemas.ts) and
> [`src/mcp/handlers/get-symbol-context.ts`](../../src/mcp/handlers/get-symbol-context.ts).
> `MAX_SYMBOLS_PER_CALL` does NOT exist yet — it is committed to
> land in the Step 4 implementation commit that follows this ADR.
> Extraction runs between this commit and Step 4 will report
> `MAX_SYMBOLS_PER_CALL` as an unresolved frontmatter hint —
> expected behavior, same pattern ADR-13 and ADR-14 used for their
> forward-declared symbols (`PyrightAdapter`, `GoAdapter`).

## Context

Phase 7's cobra reference run surfaced a structural gap in
ContextAtlas's primitive query API
([Phase 7 §5.1](../../../ContextAtlas-benchmarks/research/phase-7-cobra-reference-run.md)).
On c4 (cobra ADR-04 prefix-matching mapping), alpha (SDK baseline)
issued **a single regex-OR Grep**
(`pattern: "EnablePrefixMatching|hasNameOrAliasPrefix|commandNameMatches"`)
that returned all three target symbols simultaneously. CA fragmented
the same retrieval into **three separate `get_symbol_context` calls
plus one `find_by_intent`** — adding +12.5k tokens of pure structural
overhead with both conditions arriving at equivalent correct answers.
Phase 7's framing: this is *language-paradigm-sensitive*. Go's
exported-symbol idiom (CapitalCase, descriptive, dispersed across
small symbols in a flat-package layout) makes regex-OR Grep efficient
for related-symbol retrieval; CA's single-symbol API cannot compete
on that retrieval pattern. The Phase 7 v0.3 implication, locked into
[v0.3-SCOPE.md Stream A item 2](../../v0.3-SCOPE.md):

> A multi-symbol `get_symbol_context` call shape (or batched
> `find_by_intent` with explicit symbol disjunction) would close
> most of this gap. Worth surfacing upstream as v0.3 API
> consideration.

This ADR locks the API surface decisions before
[Step 4](../../STEP-PLAN-V0.3.md) implementation lands. Decisions
that need locking:

1. **Tool shape — new tool vs. extending existing.** `v0.3-SCOPE.md`
   Open Question #2 left this unresolved. Two shapes are on the
   table: a new `get_symbols_context([sym, …])` tool alongside the
   existing primitive, or extending `get_symbol_context` to accept
   either a single string or an array. This ADR resolves the choice.
2. **Schema + cap.** When extending the existing input,
   `symbol: string | string[]`; how high should the array cap be,
   and on what evidence?
3. **Per-symbol option heterogeneity.** Does each symbol in the
   batch get its own `depth` / `include` / `max_refs` / `file_hint`,
   or are those uniform across the call?
4. **Output format.** Compact-format multi-bundle layout;
   JSON-format envelope shape; both must round-trip cleanly.
5. **Partial-failure semantics.** When 1 of 5 symbols fails to
   resolve, what does the response shape look like? Today's
   single-symbol handler maps every failure mode (not_found,
   disambiguation, no_adapter) to whole-call `isError: true`.
   Multi-symbol cannot inherit that as-is without forfeiting the
   c4 use case.
6. **Order + dedup.** Is response order request-order or
   relevance-ranked? Are duplicate input names collapsed? With what
   matching rule?

The decisions below cite Phase 7 §5.1 evidence and the existing
[`src/mcp/handlers/get-symbol-context.ts`](../../src/mcp/handlers/get-symbol-context.ts)
implementation rather than guesses about likely shapes.

## Decision

### 1. Extend existing tool, do not add a new tool (resolves Open Question #2)

The existing `get_symbol_context` tool is extended to accept either
a single string or a string array. **No new tool is added.**

```jsonc
// schemas.ts inputSchema.properties.symbol — after extension
{
  "oneOf": [
    { "type": "string" },
    {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 10,
      "uniqueItems": false      // dedup is handler-side, see §8
    }
  ]
}
```

**Rejected alternative — separate `get_symbols_context([sym, …])`
tool.** This was the surface form `v0.3-SCOPE.md` Open Question #2
named alongside the extension path. Rejected because:

- **MCP tool selection is by tool name, not input shape.** The
  discriminator concern that would justify a second tool ("how does
  the model know which to call?") is theoretical: the model reads
  the schema, sees that `symbol` accepts either form, and uses the
  array form when retrieving multiple. MCP-SDK supports `oneOf`
  schemas; this is the supported route for multi-shape inputs. Step
  4 implementation will validate end-to-end, with regression caught
  by the byte-equivalence test in Consequences below.
- **Three-primitive framing in [CLAUDE.md](../../CLAUDE.md) is
  load-bearing.** ContextAtlas presents three tools:
  `get_symbol_context` / `find_by_intent` / `impact_of_change`. A
  fourth tool whose only difference is "but with an array" inflates
  the model's per-call context cost (every tool-list serialization
  carries its description) without adding a new mental category.
- **The mental model is "I want context for these symbols."** Whether
  "these" is one symbol or seven, the cognitive operation is the
  same. Two tools force the caller to switch primitives mid-thought
  if they realize they need a second symbol partway through.
- **Backward compatibility is free.** Existing single-symbol
  callers see no change; the schema's `oneOf` first alternative is
  the literal current shape.

### 2. Schema and array cap

`symbol` accepts `string | string[]` per the schema in §1.
**Maximum 10 symbols per call** (`MAX_SYMBOLS_PER_CALL = 10`).

**Cap evidence:** Phase 7 c4 used 3 symbols. 10 leaves comfortable
headroom for typical "behavior cluster" queries — e.g., a request
for all 10 hook fields on cobra's `Command` struct (`PersistentPreRun`,
`PersistentPreRunE`, `PreRun`, `PreRunE`, `Run`, `RunE`, `PostRun`,
`PostRunE`, `PersistentPostRun`, `PersistentPostRunE` —
[`benchmarks/repos/cobra/command.go:128-146`](../../../ContextAtlas-benchmarks/repos/cobra/command.go))
fits exactly at the cap. Phase 7 c4 used 3 symbols; the cap allows
~3× typical headroom while keeping bundle-size predictable. A naive
worst-case at depth=deep with 10 symbols is bounded — bundle assembly
is per-symbol and linear in symbol count, and the per-symbol
`max_refs` cap (default 50) prevents any single bundle from blowing
up.

**Cap is an adjustable sub-decision.** If post-Phase-8 evidence
shows callers consistently bumping against 10, raising it is a
config-only change (single constant in `src/mcp/handlers/`).
Lowering it is also config-only. The contract change this ADR
locks is the **shape** (single-or-array `symbol` input), not the
specific numeric cap.

**Cap exceedance returns `McpError` (protocol-level).** When the
caller sends 11+ items, the response is a JSON-RPC `InvalidParams`
error, same path as malformed `depth`. This is structurally
distinct from per-symbol resolution failure (§5): a cap violation
is the caller using the API wrong, not a runtime mismatch in the
symbol set.

### 3. Per-symbol options are uniform; no per-symbol heterogeneity

`depth`, `include`, `max_refs`, `file_hint`, and `format` apply
**uniformly across all symbols in the batch.** A multi-symbol call
cannot specify "give me `summary` for symbol A but `deep` for
symbol B."

**Rejected alternative — per-symbol option overrides.** A schema
like `symbols: [{name: 'A', depth: 'deep'}, {name: 'B', depth: 'summary'}]`
was considered. Rejected per YAGNI: the c4 use case (the concrete
evidence motivating this work) doesn't need per-symbol
heterogeneity, the most common multi-symbol pattern is "I'm
exploring related symbols at the same depth," and the schema cost
(switching `symbol` from string to object-with-name) breaks the
clean `string | string[]` extension. Per-symbol overrides can be
added in a future ADR if benchmark evidence shows the homogeneous
form is leaving signal on the table.

**`file_hint` interaction.** When `file_hint` is provided alongside
a multi-symbol input, it applies to every name resolution. Use
case: "give me context for `Foo`, `Bar`, `Baz` — they all live in
`src/orders/`." If a caller needs different hints for different
symbols, they should issue separate calls or include the file path
in the symbol input as a full SymbolId
([ADR-01](ADR-01-symbol-id-format.md) format), which bypasses
disambiguation.

### 4. Output format — compact-text concatenation with named delimiters; JSON array

**Compact format (default per [ADR-04](ADR-04-compact-output-default.md)).**
Per-symbol sub-bundles are concatenated, each preceded by a
delimiter line:

```
--- get_symbol_context: <symbol> (N of M) ---
SYM <symbol-id>
SIG <signature>
INTENT
  ...
```

Where `<symbol>` is the **caller's input string verbatim**, `N` is
the 1-indexed position in the request, and `M` is the total batch
size. The delimiter encodes both the input identifier and the
positional context, so consumers parsing the response can map
sub-bundles back to original input strings — load-bearing when
partial failures occur (§5) and the response is no longer in
trivial 1:1 correspondence with successful resolutions.

**Rationale for this delimiter shape.** A bare `--- SYMBOL N/M ---`
delimiter loses the symbol name; with partial failures, a consumer
seeing "sub-bundle 3 of 5 is an ERR block" cannot recover *which*
symbol failed without re-parsing the ERR body. Including the input
string in the delimiter costs 10-30 characters per symbol but makes
the response machine-parseable line-by-line — a lower-friction
debug experience and a safer parse-then-extract path for downstream
tooling.

**JSON format (opt-in via `format: 'json'`).**

```json
{
  "results": [
    { "symbol": "<input-string>", "bundle": { ... }, "error": null },
    { "symbol": "<input-string>", "bundle": null, "error": { "code": "not_found", "message": "..." } }
  ]
}
```

The `results` array is in request order (§8). Each entry has the
caller's input string verbatim, plus exactly one of `bundle` (on
success) or `error` (on per-symbol failure). The shape is symmetric
across success/failure, simplifying consumer code that walks the
array.

**Single-symbol input compatibility.** When `symbol` is a string
(not an array), the compact response is the existing single-bundle
shape (no delimiter line) and the JSON response is the existing
single-bundle object (no `results` envelope). Detection is on
input shape, not response: callers passing `["Foo"]` get the
multi-symbol envelope shape with one entry; callers passing
`"Foo"` get the legacy shape. This preserves byte-level backward
compatibility for every existing caller.

### 5. Partial-failure semantics — per-symbol sub-bundles; whole-call `isError` only when all failed

**Per-symbol failures are inlined as ERR sub-bundles in their
positional slot.** The compact format renders the same `ERR
not_found` / `ERR disambiguation_required` / `ERR no_adapter`
bodies the single-symbol handler produces today, between delimiter
lines:

```
--- get_symbol_context: GhostSymbol (3 of 5) ---
ERR not_found
  MESSAGE Symbol 'GhostSymbol' not found in atlas.
```

The JSON format puts the same ERR information in the entry's
`error` field with `bundle: null`.

**Whole-call `isError: true` is set only when EVERY symbol in the
batch failed to resolve.** When at least one symbol resolved
successfully, `isError: false` and the response carries both
successes and ERR sub-bundles inline.

**Rejected alternative — whole-call `isError: true` on any
failure.** This is the natural extension of single-symbol semantics
but defeats the c4 use case directly: a 5-symbol batch with one
typo'd name would invalidate four good bundles, force a retry,
and erase the token-cost win that motivates the multi-symbol shape
in the first place. Phase 7 §5.1's grep-OR pattern is exactly the
analogue: a regex-OR can return partial matches, and treating CA's
multi-symbol response as all-or-nothing would be a strictly weaker
substitute.

**`isError: true` body when all failed.** A single ERR block
summarizing the count, followed by the per-symbol ERR sub-bundles
in their positional slots. Format: `ERR all_symbols_failed
\n  COUNT <N>\n` followed by the standard delimiter-and-sub-bundle
shape. Consumers can detect "complete failure" from `isError`
without parsing the body, and can extract per-symbol failure
detail when they need it.

```
[isError: true]
ERR all_symbols_failed
  COUNT 3

--- get_symbol_context: GhostA (1 of 3) ---
ERR not_found
  MESSAGE Symbol 'GhostA' not found in atlas.

--- get_symbol_context: GhostB (2 of 3) ---
ERR not_found
  MESSAGE Symbol 'GhostB' not found in atlas.

--- get_symbol_context: GhostC (3 of 3) ---
ERR not_found
  MESSAGE Symbol 'GhostC' not found in atlas.
```

### 6. Disambiguation per-symbol — inlined as ERR sub-bundle, siblings render normally

When a symbol in a multi-symbol batch resolves to multiple
candidates (the same `disambiguation_required` case the
single-symbol handler raises), the disambiguation block is rendered
**in that symbol's positional slot only**. Sibling symbols continue
to render their bundles or their own ERR blocks normally; the call
does not abort.

```
--- get_symbol_context: Foo (1 of 3) ---
[bundle for resolved Foo]

--- get_symbol_context: Bar (2 of 3) ---
ERR disambiguation_required
  CANDIDATES
    sym:ts:src/a.ts:Bar
    sym:ts:src/b.ts:Bar

--- get_symbol_context: Baz (3 of 3) ---
[bundle for resolved Baz]
```

This is consistent with §5: disambiguation is a per-symbol
resolution failure, not a whole-call failure. The caller can issue
a follow-up call with the disambiguated SymbolId for `Bar` while
keeping the resolved bundles for `Foo` and `Baz`.

### 7. Adapter-missing per-symbol — same in-place pattern

`ERR no_adapter` (the case where a symbol's language has no
registered adapter) follows the same pattern: rendered in the
symbol's positional slot, siblings unaffected. A polyglot atlas
with one language adapter unloaded should still answer questions
about every other language in a single call.

### 8. Order preservation + dedup rule (Refinement 2)

**Response order matches request order.** The N-th sub-bundle
in the compact response and the N-th entry in the JSON `results`
array correspond to the N-th symbol in the input array. **No
reordering by relevance, language, or success status.**

**Dedup is exact-string-match with `.trim()` whitespace
normalization, applied before resolution.**

- Input `["foo", "foo"]` → one resolution attempt, one sub-bundle
  for `foo`. The duplicate is silently dropped from the response.
  The response's `M` (total) reflects post-dedup count.
- Input `["foo", "  foo  "]` → trimmed to `["foo", "foo"]`, then
  deduped to `["foo"]`. One sub-bundle.
- Input `["foo", "Foo"]` → **two** sub-bundles. Case-sensitive
  match. The atlas's symbol-resolution layer is case-sensitive
  (per [ADR-01](ADR-01-symbol-id-format.md)); the dedup layer
  matches that semantics.
- Input `["sym:ts:src/a.ts:Foo", "Foo"]` → **two** sub-bundles.
  Different input strings even if they resolve to the same
  underlying symbol. Dedup is an input-layer concern; resolution
  collisions (where a full SymbolId and a plain name resolve to
  the same atlas entry) intentionally produce two response slots
  with byte-identical bundle bodies.

**Rejected alternative — dedup-after-resolution.** Considered
deduping by resolved SymbolId (so input `["sym:ts:foo:Foo", "Foo"]`
would collapse to one bundle). Rejected: the input-string-keyed
shape preserves the caller's mental model (they asked for two
things; they get two answers), and the dedup-after path complicates
partial-failure semantics — a successful resolution that
collapses with a sibling's disambiguation failure is hard to
render cleanly.

**Disambiguation does not deduplicate.** If two distinct input
strings both produce `disambiguation_required` with overlapping
candidate lists, both ERR sub-bundles are rendered. Dedup is
applied to **input strings**, not to resolution outcomes.

## Rationale

- **Extend not new tool.** MCP tool selection is by name, not by
  input shape; the SDK handles `oneOf` schemas natively. The
  three-primitive framing in CLAUDE.md is the user-facing
  abstraction; "but with an array" doesn't earn a fourth slot.
  Backward compatibility for single-symbol callers is free.
- **Cap of 10.** Phase 7 c4 used 3 symbols. 10 leaves headroom for
  "give me the surrounding behavior cluster" without making
  pathological calls easy. The cap is an adjustable sub-decision;
  the contract this ADR locks is the array shape, not the integer.
- **Uniform options.** Heterogeneous per-symbol options would
  switch the schema from `string | string[]` to a mixed object
  array, breaking the clean extension and adding implementation
  surface for a use case the motivating evidence (c4) doesn't need.
  YAGNI; revisit on benchmark evidence.
- **Per-symbol partial-failure inlining.** Whole-call `isError` on
  any failure forfeits the c4 use case directly. The grep-OR
  analogue produces partial matches; CA's multi-symbol response
  must too, or it's a strictly weaker substitute for the pattern
  it's meant to compete with.
- **Named delimiter `--- get_symbol_context: <symbol> (N of M) ---`.**
  Pure positional delimiters lose the symbol identifier when partial
  failures rearrange the success/failure pattern. 10-30 chars per
  delimiter is cheap; machine-parseability of the response is
  load-bearing for downstream tooling and human debugging.
- **Request-order preservation.** Relevance ranking is
  `find_by_intent`'s job ([ADR-09](ADR-09-find-by-intent-fts5-bm25.md)).
  `get_symbol_context` is the "I already know what I want" primitive;
  the caller's input order is the relevant order.
- **Input-string-keyed dedup with `.trim()`.** Matches caller
  mental model (each input-string is one ask). Resolution-keyed
  dedup would collapse semantically-distinct inputs that the
  caller may have had reasons to issue separately, and complicates
  the partial-failure rendering.

## Consequences

- **Schema change in [`src/mcp/schemas.ts`](../../src/mcp/schemas.ts).**
  `symbol` property gains `oneOf: [string, array]` shape. Tool
  description updated to mention multi-symbol support and the
  10-cap. Cap exposed as `MAX_SYMBOLS_PER_CALL` exported constant.
- **Handler refactor in
  [`src/mcp/handlers/get-symbol-context.ts`](../../src/mcp/handlers/get-symbol-context.ts).**
  `parseArgs` learns to accept array input, normalizes to a
  `string[]` internal shape (single string → length-1 array), then
  fans out the existing per-symbol path (resolve → buildBundle →
  render) per item with shared options. Renderer composes
  delimited sub-bundles for arrays; preserves bare bundle for
  single-string inputs.
- **Tests cover** (a) single-string equivalence (existing tests
  remain green; output byte-identical), (b) multi-symbol happy
  path with delimited compact + JSON `results` envelope, (c)
  partial failure with ERR sub-bundles inlined and `isError:
  false`, (d) all-failed case with `isError: true`, (e) cap
  enforcement (11 items → `McpError InvalidParams`), (f) dedup
  rules including whitespace trim and case sensitivity, (g) order
  preservation across mixed success/failure inputs, (h) `file_hint`
  applied uniformly to every batch entry. Integration test
  exercises the new shape against the contextatlas-self atlas
  ([CLAUDE.md dogfood pattern](../../CLAUDE.md)).

  **Byte-level equivalence test (load-bearing for backward compat).**
  Existing single-symbol golden-output tests pass unchanged after
  the multi-symbol implementation lands. Any divergence in
  single-string output indicates regression and blocks Step 4 ship.
  This makes backward compatibility a verifiable test criterion,
  not a claimed property — the `oneOf` schema's first alternative
  must be byte-indistinguishable from today's single-string path.
- **DESIGN.md tool-interface section amended** to document the
  multi-symbol shape, the delimiter format, and the partial-failure
  semantics. Bundled in the same commit per the v0.3
  documents-update-with-change pattern (Step 2 progress log).
- **`impact_of_change` is unchanged in v0.3.** Multi-symbol
  blast-radius semantics is a separate design problem (set-union
  vs. per-symbol blast bundles, ranking, dedup of overlapping
  test/git/refs lists) and is explicitly deferred. Non-goals.
- **`find_by_intent` is unchanged in v0.3.** Multi-query
  `find_by_intent` is a separate concern. Non-goals.
- **No atlas schema change.** This is purely a query-time API
  surface change. No `atlas.json` shape impact, no extraction
  pipeline impact, no storage impact.

## Limitations

Called out explicitly so future readers don't rediscover them as
bugs:

- **Per-symbol options are uniform.** A multi-symbol call with
  `depth: 'deep'` applies that depth to every symbol. Callers
  needing per-symbol depth heterogeneity must split into multiple
  calls. Future revisit gated on benchmark evidence.
- **Order is request-order, not relevance-ranked.** Callers wanting
  relevance ordering use `find_by_intent`, then optionally feed
  the top results into `get_symbol_context` as an array.
- **Cap at 10.** Larger batches must be split client-side.
  Adjustable sub-decision; raise on evidence.
- **Compact-format delimiter is part of the wire contract.** The
  `--- get_symbol_context: <symbol> (N of M) ---` format cannot
  change without breaking consumer parsers. Future refinement
  (e.g., adding a SymbolId to the delimiter once resolved) requires
  a DESIGN.md amendment + ADR addendum.
- **Bundle-size predictability is a heuristic, not a guarantee.**
  10 symbols × default `max_refs: 50` × `depth: 'deep'` can
  produce a large response. Per-symbol `max_refs` is the
  caller's lever for bounding total response size.
- **Token budget is the caller's concern.** Multi-symbol calls
  are intended to *save* tokens vs. N separate calls (delimiter
  overhead is negligible vs. tool-call envelope overhead × N), but
  a 10-symbol deep-depth call can still exceed a model's context
  window in pathological cases. No server-side warning is emitted.

## Non-goals

- **Per-symbol option heterogeneity.** Mixed `depth` / `include`
  / `max_refs` per symbol within one call. v0.3 ships the uniform
  shape only.
- **Streaming partial results.** MCP doesn't stream tool
  responses; the entire compact body or JSON envelope returns
  at once. Out of scope regardless of MCP support — even with
  streaming, the per-symbol resolution work is fast enough that
  batched-response is the simpler shape.
- **Auto-batching adjacent calls.** Combining N successive
  single-symbol calls into one multi-symbol call automatically
  is a client-side concern, not a server-side feature. Out of
  scope.
- **Multi-symbol `find_by_intent`.** Batched intent queries
  ("symbols matching A or B or C") have their own ranking and
  dedup design problems. Phase 7 §5.1 named this as an alternate
  path; v0.3 ships the `get_symbol_context` extension only.
  Revisit if benchmark evidence shows multi-symbol intent queries
  add measurable value beyond what the symbol-array form delivers.
- **Multi-symbol `impact_of_change`.** Blast-radius semantics for
  a symbol set (union? intersection? per-symbol with dedup of
  overlapping refs?) is a separate ADR. Deferred to post-v0.3.
- **Resolution-keyed dedup.** Two distinct input strings that
  resolve to the same SymbolId still produce two response slots.
  Dedup is an input-layer concern.
- **Cap-exceedance graceful degradation.** When the caller sends
  11 items, the response is `McpError InvalidParams`, not "first
  10 served, 11th dropped." Silent truncation is a contract
  hazard; explicit error is the cleaner failure mode.
