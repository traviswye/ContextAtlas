---
id: ADR-16
title: BM25 ranking extended to get_symbol_context — claim ranking with optional caller-provided query
status: accepted
severity: hard
symbols:
  - sortClaimsByBM25
  - HandlerDeps
  - ServerRuntimeContext
  - BuildBundleOptions
---

# ADR-16: BM25 ranking extended to `get_symbol_context` — claim ranking with optional caller-provided query

> **Frontmatter symbols note.** `HandlerDeps`,
> `ServerRuntimeContext`, and `BuildBundleOptions` exist today (in
> `src/mcp/handlers/get-symbol-context.ts`, `src/mcp/server.ts`,
> and `src/queries/symbol-context.ts` respectively).
> `sortClaimsByBM25` is committed to land in the Step 6
> implementation commit alongside this ADR. Same forward-declaration
> pattern as ADR-13 / ADR-14 / ADR-15.

## Context

Phase 6 §5.1 (`../../../ContextAtlas-benchmarks/research/phase-6-httpx-reference-run.md`)
documented a muddy-bundle mechanism on the httpx p4-stream-lifecycle
cell where `get_symbol_context` returned bundles whose top INTENT
line was off-target. The mechanism analysis (also in
[`atlas-claim-attribution-ranking.md`](../../../ContextAtlas-benchmarks/research/atlas-claim-attribution-ranking.md))
identifies three composed gaps:

- **Gap 1** — claim-attribution inheritance: frontmatter symbols
  inherit as a per-claim baseline, dominating per-symbol ranking.
  Addressed by Fix 2 (Step 5; commit `7e1956a`).
- **Gap 2** — per-symbol ranking is deterministic but not
  query-aware. When CA queries `Response`, all 17 attached claims
  return in `severity → source → claim_id` insertion order. The
  first claim is "essentially arbitrary" relative to query context.
- **Gap 3** — tool asymmetry: `find_by_intent` uses BM25 (ADR-09);
  `get_symbol_context` does not.

[Step 5's spot-check](../../../ContextAtlas-benchmarks/research/v0.3-stream-a-spot-check.md)
showed Fix 2 alone does not fully close §5.1's mechanism — the
off-target Request-side claim still surfaces as top INTENT for
`content` queries even after frontmatter inheritance is dropped.
The residual signal comes from Gaps 2 + 3 — the deterministic-not-
query-aware ranking + the tool asymmetry. **This ADR addresses
Gap 2 + Gap 3 directly** by extending ADR-09's BM25 ranking
primitive from `find_by_intent` to `get_symbol_context`'s intent
block, gated behind an optional caller-provided query parameter.

Decisions that need locking:

1. **Query string composition.** Where does the BM25 query string
   come from — caller-provided, server-derived, or a fixed
   ranking with no query at all? ADR-09's BM25 chain assumes a
   query exists; without one, BM25 has nothing to score against.
2. **Tiebreaker chain.** With a query, does BM25 dominate the
   sort, or does severity stay primary with BM25 as a tiebreaker
   within each severity bucket?
3. **Server flag vs always-on.** Should v0.3 ship BM25 ranking
   as default-on, default-off-but-flag-accessible, or strictly
   opt-in?
4. **Multi-symbol composition** (ADR-15 cross-reference). Does
   the query parameter apply per-symbol or uniformly across the
   batch?
5. **Backward compatibility.** What happens to existing v0.2
   callers who don't pass a query?

## Decision

### 1. Query string is caller-provided via optional `query` parameter

`get_symbol_context`'s tool input schema gains an optional `query`
field. When provided, the server-side BM25 path activates (subject
to flag gating, §3 below). When absent, ranking falls back to v0.2
deterministic order (`severity → source → claim_id`).

```jsonc
{
  "symbol": "Response",
  "query": "stream lifecycle response read state",  // optional, ADR-16
  // ... existing fields unchanged
}
```

**Rejected alternative — server-derived query.** Synthesizing a
query from the symbol name + nearby symbols + path tokens was
considered. Rejected because (a) "what query does this symbol
imply" is design-debate territory with no clear right answer; (b)
caller-provided queries match the `find_by_intent` precedent (same
ranking primitives, same query semantics — symmetric tool surface);
(c) caller-driven querying preserves ADR-02's no-query-time-LLM
rule cleanly (no inference required to derive the query).

**Rejected alternative — always-on BM25 with no query.** Without a
query, BM25 ranks only by static FTS5 features (term frequency,
length normalization). This doesn't address the muddy-bundle case
where the goal is *query-relevance* re-ranking. It would also
introduce a non-deterministic ordering without giving the caller
any control. Rejected.

### 2. Tiebreaker chain α — BM25 dominates when query provided

The sort chain when `query` is provided + flag is on:

1. **BM25 ASC** (more negative = better; unmatched = `+Infinity` →
   sorts last)
2. **Severity** (hard > soft > context)
3. **Source alphabetical**
4. **Claim id ASC** (final deterministic fallback)

When `query` is absent OR flag is off, the chain falls back to v0.2:

1. **Severity** (hard > soft > context)
2. **Source alphabetical**
3. **Claim id ASC** (insertion order)

**Rejected alternative — tiebreaker β (severity dominates, BM25 is
tiebreaker within severity buckets).** Rejected because the
muddy-bundle problem (Phase 6 §5.1) IS that severity-first ordering
surfaces an off-target claim — all 17 ADR-05 claims tie on
`severity=hard`, and the only way to differentiate is BM25
re-ranking. Choosing β would preserve exactly the ranking Phase 6
§5.1 documented as broken. The "give me everything important" use
case where severity-first matters is the no-query path, which the
v0.2 fallback already serves.

**No name-overlap tiebreaker** (departure from ADR-09's chain). In
`get_symbol_context`, all claims belong to a single symbol — they
all share the same name-overlap score against any query. The
tiebreaker is degenerate here. ADR-09's chain uses name-overlap
because `find_by_intent` ranks symbols (potentially many) sharing a
single claim via ADR-08 frontmatter-hint fan-out — that scenario
doesn't apply here.

### 3. Server flag `mcp.symbolContextBM25` gates the BM25 path; default off

A new config field `mcp.symbol_context_bm25: boolean` controls
whether the BM25 path is available at all. Defaults to `false`
(v0.2 baseline preserved). When `true`, BM25 activates only when
the caller also passes a `query` parameter — **two-layer gating**:

- Server flag `false` + caller query present → query silently
  ignored, v0.2 ranking used.
- Server flag `true` + caller query absent → BM25 path NOT
  activated, v0.2 ranking used.
- Server flag `true` + caller query present → BM25 ranking active.
- Server flag `false` + caller query absent → v0.2 ranking (the
  baseline path).

**Rejected alternative — flag default-on.** Rejected because Step 7
hasn't yet decided whether Fix 3 ships in v0.3 default. Default-off
keeps v0.2 callers byte-equivalent regardless of how `query`
parameters propagate.

**Rejected alternative — no flag (always available when query
provided).** Rejected because Step 7 needs the on/off toggle to
ship "Fix 3 available but not default" if the spot-check + matrix
evaluation favors that configuration. The flag is the mechanism
for that.

### 4. Multi-symbol composition — query applies uniformly (ADR-15 §3)

When `get_symbol_context` is called with `symbol: string[]`
(ADR-15 multi-symbol mode), the `query` parameter applies uniformly
to every symbol in the batch. No per-symbol query overrides.
Matches ADR-15 §3's uniform-per-symbol-options rule for `depth`,
`include`, `max_refs`, and `file_hint`.

This means a multi-symbol call like:

```jsonc
{
  "symbol": ["Response", "ResponseNotRead", "BoundSyncStream"],
  "query": "stream lifecycle response read state"
}
```

…BM25-ranks each symbol's claim subset against the same query.
Claims that don't match (sort to the end via `+Infinity` sentinel)
are still surfaced in each sub-bundle, just below the matched
claims.

### 5. Backward compatibility — v0.2 callers see no change

Two contracts protected by ship-blocker canary tests in
`src/queries/symbol-context.test.ts`:

- **CANARY 1** — `bm25Query` absent: claim ranking is byte-identical
  to v0.2 (severity → source → claim_id). Tested directly at the
  `buildBundle` API.
- **CANARY 2** — `bm25Query` present: BM25 path activates and
  reorders claims. Tested with the Phase 6 §5.1 muddy-bundle
  pattern (multiple claims same severity, different relevance).

Plus handler-level integration tests (in `src/mcp/server.test.ts`)
verify both gates of the two-layer flag/query gating.

Canary discipline parallel to Step 4
([ADR-15](ADR-15-multi-symbol-context.md))'s
`BYTE_EQUIVALENCE_EXPECTED` and Step 5 (Fix 2)'s v0.2-equivalence
canary in `pipeline.test.ts`. Forms a 3-data-point pattern across
v0.3 work — future readers MUST NOT weaken these assertions during
refactors.

## Rationale

- **Reuse ADR-09's primitives.** `sanitizeQuery` and
  `buildMatchQuery` are already exported from
  `src/queries/find-by-intent.ts`. The BM25 SQL is a small variant
  of the existing find_by_intent query, filtered to a single
  symbol's claim subset. Reuse minimizes implementation surface
  and ensures the two tools' BM25 semantics stay aligned.
- **Two-layer gating** (flag + query). Either alone is
  insufficient: flag-only without caller cooperation can't activate
  the path; caller-only without admin opt-in could surprise
  operators with unintended ranking changes when Stream D
  measurement reveals issues. Both together give Step 7 the
  configuration matrix it needs.
- **No name-overlap tiebreaker.** Documented above. Future readers
  expecting symmetry with ADR-09's chain need to know this is a
  deliberate scope adjustment, not an oversight.
- **POSITIVE_INFINITY sentinel for unmatched claims.** Preserves
  the rule "all claims attached to the symbol surface in the
  bundle" — non-matching claims sort to the end rather than being
  filtered out. This matters because `get_symbol_context`'s
  contract is "give me everything," not "give me the relevant
  subset." (Filtering is `find_by_intent`'s job.)
- **Optional config flag location** (`mcp.symbol_context_bm25`).
  New `mcp` config section established here; future MCP-server
  query-time knobs land in the same section.

## Consequences

- **Schema change in [`src/mcp/schemas.ts`](../../src/mcp/schemas.ts).**
  `query` property added to `getSymbolContextTool.inputSchema`.
  Backward-compatible (optional field; existing callers unaffected).
- **Handler change in
  [`src/mcp/handlers/get-symbol-context.ts`](../../src/mcp/handlers/get-symbol-context.ts).**
  `parseArgs` parses optional `query`; trims whitespace; treats
  empty as absent. Two-layer gating in `resolveSingle`:
  `bm25Query` only flows to `buildBundle` when both server flag is
  on AND caller query is present.
- **Query layer change in
  [`src/queries/symbol-context.ts`](../../src/queries/symbol-context.ts).**
  New `sortClaimsByBM25` helper; `buildBundle` branches between
  `sortClaimsByBM25` and `sortClaimsBySeverityThenSource` based on
  `bm25Query` presence.
- **Config change in [`src/types.ts`](../../src/types.ts) +
  [`src/config/parser.ts`](../../src/config/parser.ts).** New `mcp`
  config section with `symbolContextBM25?: boolean`.
- **Server context change in
  [`src/mcp/server.ts`](../../src/mcp/server.ts) +
  [`src/index.ts`](../../src/index.ts).**
  `ServerRuntimeContext.symbolContextBM25?` plumbed from config.
- **Tests cover** (a) v0.2-equivalence canary at buildBundle layer,
  (b) BM25-activation canary at buildBundle layer, (c) handler-level
  two-layer gating (4 combinations of flag × query), (d) multi-symbol
  query uniformity per ADR-15 §3, (e) edge cases (empty query, no
  matches, zero claims, mixed-severity tiebreaker).
- **DESIGN.md tool-interface section amended** to document the
  `query` parameter + the two-layer gating + the chain α
  tiebreakers.
- **No atlas schema change.** This is purely query-time;
  `claims_fts` is already populated by ADR-09's existing
  infrastructure. No re-extraction needed.
- **No breaking change to ADR-09.** Find-by-intent's BM25 chain
  (with name-overlap) stays as documented. ADR-09 gets a small
  back-link in its "Post-v0.1 extensions worth tracking" section
  noting the BM25-extension trajectory was delivered here.

## Limitations

- **Implementation vs activation gap.** This ADR ships the
  *implementation* of BM25 ranking on `get_symbol_context`. It does
  NOT establish *activation* — i.e., it doesn't ensure that
  CA-style MCP clients actually pass a `query` parameter when
  calling the tool. Existing clients (including the ca-agent in
  `ContextAtlas-benchmarks`) call `get_symbol_context` without a
  query string. Without activation work — prompt engineering, tool
  description updates, system-prompt instructions guiding the
  caller to pass relevant queries — `mcp.symbol_context_bm25 =
  true` is dead code on the client side. Step 7 must consider this
  gap when evaluating Fix 3's ship/no-ship decision; the Step 6
  spot-check evidence note documents it explicitly.
- **n=1 measurement at Step 6.** Step 6's spot-check is unit-level
  only (Path 1 in the methodology survey). Cell-level measurement
  is deferred to Stream D (Step 15) which re-runs the full
  benchmarks matrix.
- **No diversity / clustering post-processing.** When many claims
  match the query (e.g., 17 ADR-05 claims all matching "stream"),
  BM25 ranks them by match strength without diversification.
  Top-N could be tightly clustered around one sub-topic. ADR-09
  flags this as a post-v0.1 concern; same applies here.
- **Single-symbol claims subset only.** This BM25 path scores
  claims attached to a single symbol. Cross-symbol BM25 ranking
  (e.g., "give me the highest-relevance claim across all of these
  symbols") is `find_by_intent`'s territory, not extended here.
- **No query history / user feedback loops.** BM25 is stateless;
  v0.3 doesn't track which queries hit which claims or use that
  to tune ranking. Future evidence-gated extension if real usage
  patterns motivate it.

## Non-goals

- **Server-derived query strings.** Any "what query does this
  symbol imply?" inference logic is rejected as design-debate
  territory (see Decision §1 rejected alternatives).
- **Default-on flag in v0.3.** Step 7 reads spot-check evidence
  + matrix evaluation to decide whether Fix 3 ships as v0.3
  default. This ADR defines the surface; Step 7 owns the ship
  decision.
- **Embedding-based ranking.** Explicitly deferred to v0.4+ per
  ADR-09 + DESIGN.md "don't embed" rule. This ADR uses FTS5 BM25
  exclusively.
- **Cross-tool query parameter unification.** Whether
  `find_by_intent`'s `query` and `get_symbol_context`'s `query`
  could share a common spelling / parameter shape is a stylistic
  question for a future ADR if the surfaces grow more parameters.
  v0.3 ships them as parallel surfaces with the same ranking
  primitives.
- **Activation engineering.** Prompt engineering to teach CA
  clients to pass relevant queries to `get_symbol_context` is out
  of v0.3 scope. Stream D measures whether the implementation is
  worth shipping; activation engineering is a Stream D follow-up
  (or v0.4 work) gated on that evidence.
