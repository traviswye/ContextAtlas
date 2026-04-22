---
id: ADR-09
title: find_by_intent uses SQLite FTS5 with BM25 ranking and a two-phase exact-then-token query
status: accepted
severity: hard
symbols:
  - findByIntent
  - handleFindByIntent
  - claims_fts
---

# ADR-09: find_by_intent uses SQLite FTS5 with BM25 ranking and a two-phase exact-then-token query

## Context

`find_by_intent` answers "I don't know the symbol; find it by what
it does." The tool takes a natural-language query ("where is payment
idempotency enforced?") and returns symbols whose extracted claims
match the query.

Per DESIGN.md this is a thin composite over the claims table — not
a new infrastructure layer. The architectural question is how to
rank matches: what counts as "more relevant" for a claim → query
pairing, without introducing query-time model calls (ADR-02) or
embeddings (DESIGN.md's "don't embed" for MVP).

Three implementation axes need to be locked before coding, plus the
shape of the tool's response and its CLI-adjacent concerns:

1. **Index substrate.** SQLite LIKE (ad-hoc full-scan) vs FTS5
   (virtual table with tokenizer + ranking).
2. **Ranking.** Hand-rolled (token overlap counts) vs built-in
   (BM25 from FTS5).
3. **Result shape.** Minimal symbol list vs rich records with
   matched intent + signature + score.
4. **Response format.** Compact text or JSON, consistent with
   `get_symbol_context`.
5. **Pagination.** Defaults, caps, cursor semantics.
6. **Query-time purity.** Reaffirming ADR-02 against any
   temptation to LLM-rerank results.

## Decision

### Substrate: FTS5 virtual table over claims

A virtual table `claims_fts` indexes the `claim + rationale +
excerpt` text columns of the `claims` table. The FTS index is
maintained by triggers that mirror `INSERT / UPDATE / DELETE` on
`claims`. A new migration (schema v2) adds the virtual table and
triggers.

On `importAtlas`, base-table inserts trigger FTS inserts — no
separate FTS-specific import path. Atlas round-trip stays lossless:
`atlas.json` contains claims only; FTS is a derived local index.

Source is **not** indexed in FTS. It's an identifier-shaped filter
("ADR-07"), not a search axis. Filtering by source is post-MVP.

### Ranking: FTS5 BM25 with phrase boost via MATCH grammar

Queries are sanitized (non-alphanumeric stripped to spaces) and
passed to FTS5 via the `MATCH` operator as:

```
"<sanitized exact phrase>" OR word1 OR word2 OR word3
```

FTS5's built-in BM25 scorer ranks results — exact-phrase hits rank
higher than scattered-token hits because BM25's term-frequency
component heavily weights adjacent occurrences. One query, no
manual two-pass merging.

`bm25()` returns a negative number where more-negative = more
relevant. The query `ORDER BY bm25(claims_fts) ASC LIMIT ?` gives
best-first truncated to the requested page.

### Tiebreakers

Full sort chain (primary score first, then tiebreakers in order).
The name-overlap tiebreaker was added during step-8 dogfood after
the ADR-08 frontmatter-hint interaction was observed — see the
Rationale and Consequences sections below for the motivation and
the empirical finding that drove it.

1. **BM25 ascending** (more negative = more relevant). Primary
   score from FTS5.
2. **Name-overlap with query tokens, descending.** Count of
   case-insensitive substring hits of sanitized query tokens in
   the symbol's name. Higher overlap ranks higher.
3. **Severity:** `hard > soft > context`. Matches the primitive's
   intent ordering in `buildBundle` — callers used to that
   ordering get consistent treatment across tools.
4. **Source alphabetical.** Deterministic and reviewable.
5. **Claim id** (integer, insert order). Final deterministic
   fallback when everything else ties.

### Response shape: per-match rich record

Each returned match carries:

- `symbol_id` — the canonical ID
- `name`, `path`, `line`, `kind` — from the linked symbol
- `signature` — if present on the symbol
- `matched_intent` — `{ source, severity, claim, rationale?,
  excerpt? }` (the specific claim that produced the match; a
  symbol may be matched via multiple claims, we surface the
  top-scoring one)

Deliberately **no `relevance` score** in the response. BM25 scores
aren't calibrated across queries; surfacing "0.94" would read as a
probability. Rank is implicit in array order. Callers who need more
context call `get_symbol_context` on any returned `symbol_id`.

### Response format

Mirrors the primitive's convention: compact text by default, JSON
opt-in via a `format` input parameter. The schema adds `format`
alongside existing `query` + `limit` fields; default is `"compact"`.

Compact output shape (matches `get_symbol_context`'s vocabulary —
`SYM`, `SIG`, `INTENT` — so LLMs familiar with primitive output
parse it without re-learning):

```
MATCHES 3 [query="payment idempotency"]
  SYM sym:ts:src/orders/processor.ts:OrderProcessor src/orders/processor.ts:42 class
    SIG class OrderProcessor extends BaseProcessor<Order>
    INTENT ADR-07 hard "must be idempotent"
  SYM sym:ts:src/billing/charges.ts:ChargeHandler src/billing/charges.ts:18 class
    SIG class ChargeHandler
    INTENT ADR-07 hard "must be idempotent when billing"
  SYM sym:ts:src/orders/queue.ts:OrderQueue src/orders/queue.ts:5 class
    INTENT ADR-03 soft "queue must not reorder on retry"
```

Zero matches render as `MATCHES 0 [query="..."]` with no body lines
— consistent with the primitive's "omit empty sections" rule.

### Pagination

- `limit` input, default 5, max 50. Callers wanting more narrow
  their query.
- No `offset` / cursor for MVP. Single-page semantics keep the
  tool's response bounded and composable with other tools.

### No query-time LLM calls — reaffirmation of ADR-02

`find_by_intent` is query-time. ADR-02 forbids Anthropic API calls
outside the extraction pipeline. This tool's ranking is 100% SQL +
FTS5 BM25, executed locally against the committed atlas's derived
index. No embeddings, no LLM re-ranking, no external services.

If benchmark evidence later shows BM25 is insufficient for real
queries, the options in order of preference are:

1. Improve the sanitizer / MATCH string construction
2. Add filters (severity, source) to narrow before ranking
3. Add a custom tokenizer (camelCase splitting, etc.)
4. Consider embedding-based re-ranking as a separate ADR with
   evidence

None of these replaces the "no query-time LLM" bound.

## Rationale

- **FTS5 over LIKE.** LIKE would force us to hand-roll tokenization
  (non-trivial for Unicode correctness) and hand-roll ranking
  (reinventing BM25 badly). The "simpler" option is larger and
  worse. FTS5 ships in `better-sqlite3`'s default build.
- **BM25 over custom scoring.** BM25 bakes in term frequency,
  inverse document frequency, and length normalization — all three
  are real concerns for claim ranking. Reinventing any of them
  ships a regression against the default.
- **Single MATCH string over two-pass merging.** `"exact phrase"
  OR word1 OR word2` lets BM25 do phrase-vs-scatter weighting in
  one query. Manual merging duplicates logic the scorer already
  has.
- **No relevance score in response.** Users overtrust numeric
  confidence. Rank-only avoids false precision.
- **Source not in FTS index.** Identifier-shaped fields produce
  noise in natural-language FTS. Filters on source are a separate
  mechanism if needed later.
- **`format` input for symmetry with `get_symbol_context`.** A
  unified vocabulary across tools lets LLMs and programmatic
  consumers pick their format once rather than per-tool.
- **Name-overlap tiebreaker justified by ADR-08 interaction.**
  ADR-08's frontmatter-hint resolver auto-links each extracted
  claim to every symbol the source ADR's frontmatter declares it
  governs. A single claim with text `normalizePath must be called
  at every ingest boundary`, extracted from ADR-01, is linked to
  `normalizePath` AND to `SymbolId` / `Symbol` / `LANG_CODES`
  (ADR-01's governance set). All four symbols share the same
  claim, same BM25 score, same severity, same source, and same
  claim id — the original three-level tiebreaker chain couldn't
  distinguish them, so query `normalizePath` returned arbitrary
  ordering where name-match should rank first. The name-overlap
  tiebreaker resolves this cleanly: symbols whose name contains
  query tokens rank above siblings that were attached via
  frontmatter hint. Purely local computation, no model, no
  external deps — ADR-02's no-query-time-LLM bound still holds.

## Consequences

- New schema migration v2. The existing migration runner from step
  3 extends cleanly — one new entry in `MIGRATIONS`, no refactor.
- Importing an old (pre-v2) atlas runs the v2 migration, which
  populates `claims_fts` from `claims` via the INSERT trigger on
  each imported claim. Atlas round-trip remains lossless.
- `insertClaim` / `deleteClaimsBySourcePath` / `importAtlas` do
  not need changes — the triggers keep FTS in sync automatically.
  A canary test verifies FTS row count matches `claims` row count
  after each of those operations.
- Query sanitization strips operators. Users cannot pass FTS5
  MATCH syntax directly (no manual `"phrase"`, `col:word`,
  `NEAR()`). This is a deliberate constraint — user input is
  natural language; advanced query DSL is post-MVP.
- Empty query after sanitization (e.g. `"!!!"` → ""): tool returns
  `MATCHES 0` with a hint in the compact text, not an error.
  Matches the primitive's "render cleanly when there's nothing"
  pattern.
- **Clustering behavior on common terms.** v0.1 may return
  clustered top-N results when a query term appears densely in
  nearby files (e.g., five hits from one module for `"payment"`).
  The BM25 ranking is per-claim with no diversity post-processing.
  Diversity/clustering heuristics are post-MVP and evidence-gated
  like embeddings — ship if benchmarks show it matters.
- **Tokenizer behavior — verified during step-8 dogfood, shipped
  as-is.** FTS5's default `unicode61` tokenizer lowercases and
  splits on non-letter-or-digit characters. Empirical check
  against the main-repo atlas produced these reproducible results
  (query → top-3 by name):

  | Query                          | Top-3 result names                 |
  |--------------------------------|-------------------------------------|
  | `normalizePath`                | normalizePath, LANG_CODES, Symbol  |
  | `LanguageAdapter`              | LanguageAdapter, TypeScriptAdapter, TypeInfo |
  | `path normalization`           | normalizePath, LANG_CODES, Symbol  |
  | `language adapter`             | LanguageAdapter, TypeScriptAdapter, TypeInfo |
  | `symbol identity`              | Symbol, SymbolId, LANG_CODES       |
  | `adapter plugin`               | LanguageAdapter, TypeScriptAdapter, TypeInfo |
  | `SymbolId` (exact identifier)  | *zero matches*                     |
  | `LspClient` (exact identifier) | *zero matches*                     |

  Observations:
  - Identifier substrings that appear in claim prose tokenize and
    match correctly. `normalizePath` appears literally in 4 ADR-01
    claims; the query hits all 4 and the name-overlap tiebreaker
    ranks the namesake symbol first.
  - Descriptive-phrase queries return the expected symbols in
    sensible order, confirming the `unicode61` tokenizer handles
    our natural-language claim content without help.
  - The two zero-match cases are correct, not failures: the
    literal strings `SymbolId` and `LspClient` do not appear in
    any claim text. ADR authors wrote `"Symbol IDs"` (plural
    phrase) rather than `"SymbolId"` (camelCase identifier);
    `LspClient` is never mentioned by name in any ADR. Since
    `find_by_intent` is a claims search, not a symbol-name
    search, a user who knows the symbol name by literal form
    should use `get_symbol_context` directly.

  No custom tokenizer added in v0.1. The contingency flagged in
  the original draft did not materialize.
- **Name-overlap tiebreaker — architectural context preserved in
  the Rationale section above.** Pre-fix observation: query
  `normalizePath` returned `LANG_CODES` at rank 1 and the
  namesake `normalizePath` symbol outside the top 3. Post-fix
  (verified against main-repo atlas): `normalizePath` at rank 1,
  `LANG_CODES` / `Symbol` as tied ADR-08 siblings at ranks 2-3.
  The fix is ~15 lines in `src/queries/find-by-intent.ts` plus a
  regression test locking the scenario.

## Non-goals

- **Embedding-based semantic search.** Explicitly deferred per
  DESIGN.md. Evidence-gated via benchmarks, not speculative.
- **Cross-claim reasoning.** `find_by_intent` returns symbols
  whose single claim best matches the query; it doesn't compose
  claims across multiple ADRs into a synthesized answer. That's
  closer to what `get_symbol_context` + reading the bundle
  provides.
- **Faceted search / filters in the input.** `severity_filter`
  and `source_filter` are natural extensions but are post-MVP.
  Input today is `query` + `limit` + `format`.
- **Pagination cursors.** Single page; `limit`-bounded.
- **Search over symbol metadata** (names, paths). `find_by_intent`
  is about claims — if a caller knows the symbol name, they use
  `get_symbol_context`.
- **Raw FTS5 MATCH syntax for sophisticated callers.** All input
  sanitized; the MATCH string construction is internal. A
  `raw_query: bool` escape hatch is a post-MVP conversation if
  real use cases appear.

## Post-v0.1 extensions worth tracking

These are captured here as forward pointers, not as commitments.
None are scheduled; each is evidence-gated against real benchmark
or dogfood data:

- **Faceted search input** — `severity_filter` and `source_filter`
  as narrowing parameters.
- **Raw FTS5 MATCH syntax** — `raw_query: bool` escape hatch for
  sophisticated callers (non-default, opt-in).
- **Custom tokenizer** — if camelCase identifier queries prove
  weak in practice; scope is ~20 lines.
- **Diversity / clustering heuristics** — if top-N clustering
  becomes a real complaint from benchmark results.
- **Embedding-based re-ranking** — last-resort option after
  sanitizer, filters, and tokenizer improvements have been
  exhausted. A separate ADR with its own rationale would be
  required; ADR-02's "no query-time LLM" bound applies (embeddings
  computed at index time, re-ranking at query time is pure
  vector math).
