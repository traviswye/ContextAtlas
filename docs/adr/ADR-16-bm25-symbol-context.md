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

## Amendment (2026-04-26): production-vs-benchmark activation distinction

Non-revisionist. The Limitations section above stays unchanged. This
block clarifies a framing distinction surfaced during Step 7
alignment-check dialogue (preceding ROADMAP `f33113b`'s "What
ContextAtlas Is FOR" subsection).

**The conflation in the original framing.** The "Implementation vs
activation gap" Limitation cited the synthetic ca-agent in
`ContextAtlas-benchmarks` as evidence that `get_symbol_context` is
called without a query string. That observation is empirically
correct — Phase 6 ca traces show shape `{ symbol: "content" }`;
the ca-agent in
[`../../../ContextAtlas-benchmarks/src/harness/ca-agent.ts`](../../../ContextAtlas-benchmarks/src/harness/ca-agent.ts)
adapts allowlisted MCP tools via `adaptAllowlistedMcpTools` without
query-parameter synthesis. But the original framing extended the
activation gap as universal across all MCP clients, including Claude
Code in production. That extension was unwarranted.

**Two distinct caller contexts:**

- **Synthetic ca-agent (benchmarks repo) — measurement substrate.**
  Reads `tools/list`, adapts tools via `adaptAllowlistedMcpTools`,
  defers to the alpha-agent loop's tool-use decisions. Does NOT
  synthesize queries from user prompts. **Empirically verified
  activation gap** — Phase 6 trace shape confirms.
- **Claude Code (production target) — actual deployment.** Reads
  MCP tool descriptions, has its own tool-selection reasoning,
  adapts parameter usage based on description hints. **Empirically
  unverified** for Fix 3, qualitatively different from synthetic
  ca-agent behavior because Claude Code's tool-use reasoning is
  not the alpha-agent loop.

**Production target = beta-ca.** Among the four benchmark conditions
(alpha / ca / beta / beta-ca), ContextAtlas's production deployment
is beta-ca: Claude Code with CA MCP connected. Alpha / ca / beta
triangulate around beta-ca; they are measurement substrates, not
parallel production targets. See ROADMAP "What ContextAtlas Is FOR"
subsection for the broader production-orientation framing.

**Implications for Step 7 + Stream D.** Step 7's Decision B
(ship default-on / Reading 3 / defer) should be evaluated through
the production lens, not the synthetic-harness lens. Stream D's
Fix 3 measurement carries methodological caveat: aggregate metrics
across all four conditions would mask Fix 3's effect because the
ca condition cannot exercise the activation path by construction.
Production-relevant Fix 3 evidence comes from beta-ca specifically;
ca measurements would show Fix 3 ≈ baseline regardless of whether
Fix 3 helps in production.

**Framing source.** [`ROADMAP.md`](../../ROADMAP.md) "What
ContextAtlas Is FOR" subsection (committed at `f33113b`) is the
canonical reference for the production-tool-vs-research-experiment
framing this amendment applies to Fix 3 specifically.

**Non-goal of this amendment.** Reopening any ADR-16 architectural
decision (chain α, two-layer gating, schema). The chain α choice
was made before the Step 6 spot-check ran; the 7-of-8 cross-severity-
promotion evidence confirmed but did not change it. Future
reconsideration follows ROADMAP rescope conditions, not
amendment-here.

## Amendment (2026-05-14, v0.8 Step 1): handler-side query synthesis closes the v0.3-era activation gap

Non-revisionist. The Decision §3 two-layer gating description and
the Limitations "Implementation vs activation gap" entry stay
unchanged as historical record of the v0.3 ship state. This block
documents the v0.8 Step 1 activation-layer amendment.

**What changed.** The handler at
[`src/mcp/handlers/get-symbol-context.ts`](../../src/mcp/handlers/get-symbol-context.ts)
moves from two-layer gating (server flag AND caller query both
required) to **server-flag-only gating with symbol-name synthesis
fallback**:

```ts
// pre-v0.8 — two-layer gating
...(deps.symbolContextBM25 === true && args.query !== undefined
  ? { bm25Query: args.query } : {}),

// post-v0.8 Step 1 — server-flag-only, synth fallback
...(deps.symbolContextBM25 === true
  ? { bm25Query: args.query ?? symbol.name } : {}),
```

**What did NOT change.**

- `buildBundle`'s API-level contract (`bm25Query` present →
  BM25; `bm25Query` absent → v0.2 fallback). CANARY 1 in
  `src/queries/symbol-context.test.ts` continues passing untouched.
- The server flag `mcp.symbol_context_bm25` default-off behavior.
  Flag-off path remains byte-equivalent to v0.2.
- Decision §4 multi-symbol composition rule. When caller passes
  `query`, every symbol in the batch uses that uniform query;
  when caller omits `query`, each symbol synthesizes from its own
  resolved `symbol.name` — preserves the uniform-when-provided /
  per-symbol-when-absent split cleanly.
- Decision §2 chain α tiebreaker hierarchy (BM25 → severity →
  source → claim_id).

**Why synthesis-from-symbol-name was the chosen activation path.**
Decision §1 originally rejected "server-derived query" as design-
debate territory with no clear right answer. The v0.8 amendment
narrows the scope: synthesis is bounded to `symbol.name` (the
resolved canonical name from the atlas symbol record), not free-
form inference. The bare symbol name is already known to be
relevant to the bundle being returned (it IS the bundle subject);
using it as a BM25 query says "rank claims that talk about this
symbol explicitly above claims that don't" — which is exactly the
muddy-bundle remediation Phase 6 §5.1 motivated. Caller-provided
queries still win when present, so the "what query does this
symbol imply" design debate Decision §1 rejected stays out of
scope at the handler — synthesis is a deterministic single-
expression fallback, not inference.

**Degenerate-name edge cases.** Symbols whose names tokenize to
nothing under FTS5's `unicode61 tokenchars '_-'` configuration
(ADR-17) — pure punctuation, Unicode-only operators, etc. —
synthesize to a query that `sanitizeQuery` reduces to empty
tokens. `buildMatchQuery` returns `null` for empty token lists;
`sortClaimsByBM25` falls through to `sortClaimsBySeverityThenSource`
within the all-unmatched bucket. Net effect: degenerate-name
synthesis degrades gracefully to v0.2 ordering within that
symbol's slot. Explicit test coverage in
`src/mcp/server.test.ts` ("flag-on + no query + punctuation-heavy
symbol name").

### Cycle-observation 19 (NEW; canonical capture at this amendment): dormant-capability-carry-forward sub-pattern

Composes with cycle-observations 15 (Skill-vs-CLI substrate-
equivalence requires per-feature mechanical floor; canonical
capture at ADR-02 v0.7.1 amendment) and 16 (substrate-currency-
gap-from-earlier-cycle-carried-forward-and-surfaced-by-
mechanical-floor; canonical capture at ADR-02 v0.7.2 amendment)
at the orthogonal "activation-vs-implementation" layer.

**Pattern.** When a mechanically-functional capability ships with
caller-activation as a separate concern — the implementation is
production-ready, but the activation chain requires deliberate
caller behavior the cycle didn't surface or instrument — the
capability can remain dormant across multiple subsequent cycles
without anyone noticing.

**Why.** "Default off, opt-in available" framing obscures the
distinction between:
- *Mechanically dormant* — flag off; capability cannot fire; no
  caller-side behavior matters. Cheap to surface (config audit).
- *Activationally dormant* — flag on at deployment; capability
  can fire but doesn't because no caller exercises the activation
  chain. Expensive to surface (requires caller-trace inspection,
  not config audit).

The v0.3 ADR-16 Limitations section explicitly documented the
gap. Despite that, BM25=on at the v1.0-trajectory deployment
config remained activationally dormant through v0.3 → v0.4 →
v0.5 → v0.6 → v0.7 (five cycles). The discipline failure wasn't
*recognition* of the gap (recognition was captured); it was
*verification at next cycle's measurement entry-points*. Each
cycle's measurement substrate (Phase 6 / Phase 7 / Phase 8 /
Phase 9 / Phase 10 reference runs; v0.7 dogfood) could have
caught the dormancy by inspecting a single CA trace, but
didn't, because no cycle's success criteria forced an
activation-trace inspection.

**How to apply.** When shipping a mechanically-functional
capability with caller-activation as a separate concern:

1. Document the activation path explicitly in the ADR
   Limitations or a dedicated "Activation" section (ADR-16
   already did this — necessary but not sufficient).
2. **Add an activation verification to the next cycle's
   measurement entry-points.** Examples: a trace-shape
   assertion in benchmark output ("at least one CA call to
   tool X passed parameter Y"); a doctor-script check ("did
   any call in the last N invocations exercise parameter Y");
   a tool-description QA gate.
3. If activation isn't shipped concurrently with implementation,
   gate the implementation behind a "DORMANT" status flag in
   the substrate (not "accepted"), surfacing at config-audit
   that the capability needs activation work.
4. Treat activation as load-bearing for any cycle whose
   measurements would be affected by activation. The v0.6
   F1 atlas-substrate-version confound is a structurally
   parallel pattern: the substrate variable was captured (tag-
   only) but not controlled at measurement entry-points (the
   F9 tag-AND-control gap). Activation-tag-AND-activation-
   control is the v0.8 inheritance.

**Empirical evidence.** v0.8 Step 1 ca-agent trace investigation
(Asks 1–3 parallel batch) confirmed:
- ADR-16 amendment (2026-04-26) documented the activation gap
  for the synthetic ca-agent path.
- `src/harness/tools/ca-adapter.ts:108` `adaptMcpTool` passes
  `args` verbatim from the model's tool_use input → no query
  synthesis at the harness layer. Unchanged from v0.3 through
  v0.8.
- v0.5 / v0.6 / v0.7 cycles did not include trace-shape
  inspection of ca-agent `get_symbol_context` calls.
- BM25=on at deployment-config remained activationally dormant
  through five cycles before v0.8 Step 1 closed it.

**Closure pattern.** Handler-side synthesis (this amendment) is
the immediate fix — moves activation from caller responsibility
to handler responsibility, so the activation chain is closed
mechanically regardless of caller behavior. v0.8 Option B
factorial run + doctor-script BM25 recommendation logic (post-
Ship-1 work) re-verifies the activation at measurement entry-
points, establishing the discipline the v0.3 → v0.7 cycles
didn't apply.

**Generalizes to v0.9+ inheritance.** When v0.9+ ships any
mechanically-functional capability with a caller-activation
component (server flags that depend on caller behavior; new
tool parameters; new MCP capabilities requiring client
adoption), the cycle must:
- Document activation path in ADR/Limitations (necessary baseline)
- Add an activation verification check to the next cycle's
  measurement entry-points (the v0.8 amendment delta — necessary
  AND sufficient)

**Composes with cycle-observations 15 + 16** as the third element
of the "mechanical-floor-discipline" cluster: 15 covers
substrate-equivalence floors; 16 covers substrate-currency
floors across cycle boundaries; 19 covers activation floors at
caller boundaries. All three patterns share the same generative
shape: a substrate-relevant property was *recognized* but not
*mechanically enforced at the measurement / verification
entry-point*.

**Substrate-record reference location.** This amendment.
v0.8 substrate-record (Travis's session log) line 2982 captures
the cycle-context lock chain (Adjudication 1–3 + ADDENDUM AC).

## Amendment (2026-05-14, v0.8 Ship 4b): synthesis-vs-severity-first behavioral disclosure + doctor recommendation

Non-revisionist. The Ship 1 amendment above stays unchanged.
This block documents the v0.8 Ship 4b ship: a doctor check that
advises on enabling `mcp.symbol_context_bm25`, plus user-facing
disclosure of the synthesis-vs-severity-first behavioral shift
that surfaces when the flag is on.

### Behavioral disclosure — synthesis-vs-severity-first ordering

Pre-Ship-1 (v0.3 → v0.7.2): when the server flag was off OR the
caller didn't pass `query`, claim ranking fell through to
`severity → source → claim_id` (v0.2 default). Users on the
default flag-off path saw a triage-first ordering — hard
severity invariants surfaced ahead of context-severity supporting
material.

Post-Ship-1 (v0.7.3+) at flag-on: the handler synthesizes
`bm25Query = args.query ?? symbol.name`. BM25 score dominates
the sort chain α (Decision §2 above). The user-visible behavior
shifts:

- **Without query, synthesis fallback** — top-5 surfaces claims
  whose text mentions the symbol name by token, regardless of
  severity. Context-severity claims with name mentions can rank
  ahead of hard-severity claims that don't. Empirically observed
  at v0.8 Ship 4a dogfood against the hono v0.8-cli atlas:
  - `Context` symbol (17 claims) — v0.2 baseline top-5 was 5/5
    hard-severity; synthesis top-5 is 4 hard + 1 context.
  - `Hono` symbol (27 claims) — v0.2 baseline top-5 was 5/5
    hard-severity; synthesis top-5 is 5/5 context-severity
    (each mentions "Hono" or a variant by name).

- **With caller-provided query** — top-5 surfaces semantically
  relevant claims first, which is the originally intended
  behavior (matches what `find_by_intent`'s BM25 chain produces
  per ADR-09). Empirically the cleanest ranking when caller
  knows the user's intent.

**Why this matters for users.** Operators who chose flag-off
implicitly relied on severity-first triage. Enabling the flag
materially changes what surfaces in the top-N of bundles for
densely-attached symbols. Neither ordering is universally
better — they optimize for different reading patterns:
- Severity-first: "show me the hard invariants I must respect"
- BM25-with-synthesis: "show me the claims most-relevant to the
  symbol I asked about"
- BM25-with-caller-query: "show me the claims most-relevant to
  my actual question"

Users who prefer severity-first ordering should leave the flag
at its default (`false`). Users who want relevance-weighted
ordering should enable the flag and (optionally) instruct their
MCP clients to pass meaningful `query` parameters where
possible.

### Doctor recommendation gate (Ship 4b)

`contextatlas doctor` now emits an `atlas.bm25_recommendation`
check that fires one of four outcomes based on a 2×2 matrix of
{flag-on / flag-off} × {dense / sparse}:

- **flag-off + dense** → WARN: `RECOMMEND enable
  mcp.symbol_context_bm25`. Detail surfaces config snippet +
  pointer to this ADR for the behavioral disclosure above.
- **flag-off + sparse** → PASS: not recommended at current
  atlas density (rationale: severity-first ordering already
  surfaces all attached claims per bundle at low density).
- **flag-on + dense** → PASS: already enabled at density that
  benefits.
- **flag-on + sparse** → PASS with note: enabled but reordering
  invisible at current density.

"Dense" is defined as **any symbol in the atlas carrying ≥6
claims attached**, per ADDENDUM AJ Option A lock. Rationale
(Ship 4a empirical): with top-5 bundle return, ≤5 attached
claims means top-5 surfaces all of them → reorder is
user-invisible. At 6+ claims, top-5 must SELECT from a longer
pool → ranking choice becomes user-visible. Validated at hono
v0.8-cli dogfood across 4/4 densely-attached symbols (Context,
Hono, Router, compose) showing 3-5 top-5 position reorders
under BM25=on vs v0.2 baseline.

The recommendation lives in
[`src/doctor/checks/atlas.ts`](../../src/doctor/checks/atlas.ts)
via `bm25RecommendationCheck` + the pure `computeBM25DensitySignal`
helper. Both exported for direct unit testing in
`src/doctor/checks/bm25-recommendation.test.ts`.

### Quality-axis measurement deferred (v0.9+ candidate)

Ship 4a measured **ordering shift** under BM25=on vs BM25=off —
not whether BM25-reordered bundles produce *better Claude
responses*. The retrieval-relevance changes empirically; the
downstream-task-quality consequence is empirically untested at
this cycle. Worth v0.9+ candidate: extend the Ship 4a dogfood
methodology with answer-quality grading (LLM-judge or rubric-
based) against BM25-on vs BM25-off bundles, at a fixed atlas
substrate, to close the activation→quality evidence loop.

Composes with v0.9+ inheritance shape per the 2026-05-14 v0.8
Step 1 amendment: "shipping mechanically-functional capability
with caller-activation requirement" generalizes to "validating
quality-axis consequences of activation at next measurement
entry-points." The Ship 4b doctor-check closes the activation-
verification loop at the *user-advisory* layer; the v0.9+
quality-axis measurement closes it at the *evidence* layer.

### Substrate-record reference location

This amendment. v0.8 substrate-record line 3517 captures
ADDENDUM AJ (Adjudication: Option A threshold + cycle-
observation 21 withdrawal + score-metric semantics correction).
v0.8 Ship 4a empirical paste-back captures the 4/4-densely-
attached-symbols evidence underlying the ≥6 threshold choice.
