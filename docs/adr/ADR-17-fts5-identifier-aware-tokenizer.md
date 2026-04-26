---
id: ADR-17
title: FTS5 tokenizer made identifier-aware via `tokenchars '_-'` plus dual-form indexing
status: accepted
severity: hard
symbols:
  - claims_fts
  - sanitizeQuery
  - buildMatchQuery
---

# ADR-17: FTS5 tokenizer made identifier-aware via `tokenchars '_-'` plus dual-form indexing

## Context

[ADR-09](ADR-09-find-by-intent-fts5-bm25.md) shipped `find_by_intent`
on FTS5's default `unicode61` tokenizer. The Step-8 dogfood evidence
table in ADR-09 showed natural-language and camelCase queries
ranking sensibly and explicitly noted "No custom tokenizer added in
v0.1. The contingency flagged in the original draft did not
materialize."

That evidence missed two identifier shapes that the default tokenizer
breaks: **snake_case** (e.g. `narrow_attribution`,
`get_symbol_context`) and **kebab-case** (e.g. `find-by-intent`,
`per-symbol`). `unicode61` treats `_` and `-` as separators, so on
the index side `narrow_attribution` is stored as the two adjacent
tokens `narrow` and `attribution`. On the query side, the existing
sanitizer (`/[^\p{L}\p{N}\s]/gu`) replaces the same characters with
spaces, so the query `narrow_attribution` is sanitized to
`["narrow", "attribution"]` and the MATCH string becomes
`"narrow attribution" OR narrow OR attribution`.

The phrase clause does match the canonical claim — but the OR
fallback also matches every claim that mentions both `narrow` and
`attribution` somewhere, regardless of context. Empirically (against
the v0.3 main-repo atlas):

| Query                | Raw FTS5 hits | Top result                                                            |
|----------------------|---------------|-----------------------------------------------------------------------|
| `narrow_attribution` | **7** hits    | An unrelated symbol-attribution claim, not the canonical flag claim   |
| `find-by-intent`     | **82** hits   | An ADR-16 claim that mentions `find_by_intent` underscore form        |
| `kebab-case`         | **10** hits   | A `--verbose` claim that happens to contain "case"                    |

The canonical claim is technically present in the result set, but it
is not findable in practice — the user types the identifier and gets
noise. We classify this as a **silent search miss**: the tool
returns results, but not the ones the user came for, and there is no
indication that the canonical hit was buried.

camelCase identifiers (`LspClient`, `normalizePath`, `SymbolId`)
were not affected because letters are never separators in
`unicode61`; the camelCase token survives intact (lowercased to a
single token). The Step-8 evidence happened to test only camelCase
forms.

## Decision

### Tokenizer: `unicode61 "tokenchars" '_-'`

Migration v5 drops and recreates `claims_fts` with:

```sql
CREATE VIRTUAL TABLE claims_fts USING fts5(
  claim,
  rationale,
  excerpt,
  content='claims',
  content_rowid='id',
  tokenize="unicode61 tokenchars '_-'"
);
```

`unicode61` retains lowercasing and Unicode category handling — the
only delta is that `_` and `-` are now token characters rather than
separators. Indexed `narrow_attribution` is one token. Indexed
`find-by-intent` is one token. The intent surface remains BM25 over
the same three text columns, so ADR-09's ranking model is preserved.

### Dual-form indexing

A single tokenizer change is not enough on its own. With
`tokenchars '_-'` alone, an indexed claim `narrow_attribution flag`
has tokens `[narrow_attribution, flag]` only — a natural-language
query `narrow attribution` (no underscore) has sanitized tokens
`[narrow, attribution]` and matches nothing in the index. That is a
regression on natural-language search and is exactly the behavior
the user said must not regress.

Migration v5 fixes this by indexing each text column **twice**, once
in the original form and once with `_` and `-` replaced by spaces,
concatenated:

```sql
INSERT INTO claims_fts(rowid, claim, rationale, excerpt)
VALUES (
  new.id,
  new.claim || ' ' || REPLACE(REPLACE(new.claim, '_', ' '), '-', ' '),
  ...
);
```

The FTS index then holds both the intact identifier token AND the
component words. A claim text `narrow_attribution flag controls
extraction` produces the index tokens
`[narrow_attribution, flag, controls, extraction, narrow,
attribution, flag, controls, extraction]`. Now:

- Query `narrow_attribution` matches the intact token directly. The
  phrase clause `"narrow_attribution"` hits exactly the claims
  containing the identifier — no noise from unrelated mentions of
  the component words.
- Query `narrow attribution` matches `narrow` and `attribution` in
  the split half, adjacent — the phrase clause still works.
- Query `flag` matches both halves equally.

`content='claims'` is preserved, so the dual-form expansion lives
only in the FTS index. SELECT-ing `claim`, `rationale`, or `excerpt`
from `claims_fts` still returns the original verbatim text from the
base `claims` table — atlas round-trip remains lossless per ADR-06.

### Sanitizer: preserve `_` and `-`

`sanitizeQuery` was changed from `/[^\p{L}\p{N}\s]/gu` to
`/[^\p{L}\p{N}\s_-]/gu`. Identifier-shaped query tokens now survive
sanitization as single tokens. All other behaviors are unchanged:
non-alphanumeric punctuation still strips to spaces, repeated
whitespace still collapses, Unicode letters/digits still pass
through.

### MATCH-grammar escaping for hyphens

FTS5's MATCH grammar treats `-` between two barewords as the
AND-NOT operator. The bareword query `find-by-intent` parses as
`find NOT by NOT intent` and errors with `no such column: by`. To
defuse this, `buildMatchQuery` now wraps any token containing `-`
in double quotes — turning it into a phrase-of-one — so the `-` is
treated as a literal character. Tokens containing only `_` need no
quoting: FTS5 grammar has no special meaning for underscore.

```ts
function escapeForMatch(token: string): string {
  return token.includes("-") ? `"${token}"` : token;
}
```

The phrase prefix is unchanged — the full token list quoted as one
phrase already escapes any internal `-` correctly.

### Migration shape

Schema version bumps 4 → 5. The migration:

1. Drops the v2-era triggers (`claims_fts_ai`, `_ad`, `_au`).
2. Drops the v2-era `claims_fts` virtual table.
3. Recreates `claims_fts` with the new tokenizer.
4. Recreates the three triggers using the dual-form expansion.
5. Backfills `claims_fts` from the existing `claims` table.

External-content invariants are preserved: the base `claims` table
is never touched, so existing atlases reopen with the same data and
the FTS index simply rebuilds. `LATEST_SCHEMA_VERSION` is
auto-derived from `MIGRATIONS`; no manual bump is needed.

## Rationale

- **Why fix the tokenizer rather than the OR-fallback heuristic.**
  The first instinct is to add a per-token weighting heuristic that
  down-weights component-word OR matches when the user typed an
  identifier. That works for snake_case (the sanitizer can detect
  `_` in the input string) but BM25 doesn't expose per-clause
  weights — we'd need to issue two queries and merge. The tokenizer
  fix puts the structural information (identifier-vs-prose) where
  it actually lives — in the index — and lets BM25's existing
  scoring chain do the right thing without re-architecture.
- **Why dual-form indexing rather than dual-column or two FTS
  tables.** A second FTS table doubles write paths, complicates
  triggers, and requires a result-merging layer at query time.
  Dual-form in a single column is one tokenizer setting, one set of
  triggers, one MATCH query. Index size grows by ~2× on text
  columns (claims are short, this is acceptable). BM25 statistics
  are computed against the dual-form tokens, but every claim
  contains both halves so IDF is uniform across docs and TF doubles
  uniformly — phrase boosts and overall ranking are preserved.
- **Why not the `trigram` tokenizer.** Trigram replaces BM25's
  ranking model entirely, indexes three-character substrings (much
  larger index), and weakens phrase relevance for natural-language
  queries. The bug we are fixing is structural, not lexical —
  trigram is a much bigger hammer than the problem requires and
  would regress the canary cases ADR-09 validated.
- **Why not query-side expansion alone.** Expanding query-side
  tokens to `(narrow_attribution OR narrow OR attribution)` works
  only when the index actually contains the intact token. With the
  default tokenizer the index doesn't have it, so query expansion
  is a no-op for the bug case. With the new tokenizer the index
  has both forms (via dual-form indexing) and query-side expansion
  becomes redundant — a query for `narrow_attribution` matches the
  intact token directly, and a query for `narrow attribution`
  matches the split form. Skipping query expansion keeps
  `buildMatchQuery` small.
- **Why skip camelCase splitting.** The existing dogfood evidence
  showed camelCase queries ranking correctly under the default
  tokenizer (the camelCase token is a single lowercase token). No
  benchmark or dogfood signal yet shows camelCase splitting is
  needed; adding it would expand the surface without empirical
  basis. Listed as a v0.4+ candidate if evidence emerges.
- **Why the new ADR rather than amending ADR-09.** ADR-09's
  Tokenizer subsection (lines 227-262) explicitly committed to the
  default `unicode61` based on dogfood evidence and stated "No
  custom tokenizer added in v0.1." A change of that magnitude
  reads cleaner as a successor ADR with its own Rationale and a
  cross-reference back. ADR-09 stays accurate as the v0.1 record;
  ADR-17 documents the v0.3+ pivot.

## Consequences

- **Schema migration v5.** Existing atlases run the migration on
  next open: drops the old FTS table, recreates with the new
  tokenizer, backfills from `claims`. The base `claims` table is
  untouched, so atlas.json round-trip is unaffected. First open of
  a populated atlas after upgrade does an O(n) backfill — fast even
  on the largest existing atlas (~thousands of claims).
- **Atlas round-trip remains lossless.** External content
  (`content='claims'`) means the FTS index's dual-form expansion is
  not visible to atlas serialization; only the base `claims` table
  is exported.
- **Existing tests pass unchanged.** The `findByIntent` behavioral
  contract — phrase ranks above scattered tokens, severity
  tiebreaker, source alphabetical — is unaffected. The 19
  pre-existing tests in `find-by-intent.test.ts` all pass against
  the new tokenizer; 13 new tests added for ADR-17 specifically.
- **`get_symbol_context` inherits the fix automatically.** ADR-16's
  `sortClaimsByBM25` reuses ADR-09's `sanitizeQuery` and
  `buildMatchQuery` exports. The same identifier-aware behavior now
  applies to `get_symbol_context`'s caller-provided query when
  present.
- **Index size grows ~2× on text columns.** Claims are short (median
  under 200 chars across the dogfood atlas); this is well within
  the SQLite-on-disk overhead budget. No measurable query-time
  cost: BM25 over a dual-form index is the same algorithmic shape
  as over a single-form index.
- **FTS5 NOT-operator collisions are now handled.** Any query token
  containing `-` is automatically quoted by `buildMatchQuery`, so
  user input like `find-by-intent` no longer errors with
  `no such column: by`.
- **Stale evidence in ADR-09.** ADR-09's Tokenizer-behavior table
  (lines 227-262) is now historical. The two zero-match cases it
  documented (`SymbolId`, `LspClient`) are still about claim text
  not containing those literal strings — that part is unchanged.
  But the framing "No custom tokenizer added in v0.1" is superseded
  for v0.3+. We do not edit ADR-09; this ADR's "Decision" is the
  current state, and the cross-reference here is the pointer.

## Non-goals

- **camelCase splitting.** Not required by the bug and not driven
  by dogfood evidence. v0.4+ candidate if benchmarks reveal a real
  case where users type "lsp client" expecting to match `LspClient`
  in claim text.
- **Symbol-name search via FTS.** ADR-09 explicitly excludes this
  and ADR-17 does not change that boundary. `find_by_intent`
  remains a claims search.
- **Per-clause BM25 weighting.** The single-MATCH model from ADR-09
  is preserved. Down-weighting OR fallback for identifier-shaped
  queries is unnecessary now that the index holds the identifier as
  a token directly.
- **Query expansion in `buildMatchQuery`.** Considered and rejected
  in favor of dual-form indexing. Indexed-side coverage is
  algorithmically simpler than maintaining query-side
  identifier-expansion logic.

## Empirical verification

Against the v0.3 main-repo atlas (cloned, migrated to v5,
re-indexed):

| Query                | Pre-fix raw hits | Post-fix raw hits | Top hit shape           |
|----------------------|------------------|-------------------|--------------------------|
| `narrow_attribution` | 7 (noisy)        | **1** (canonical) | The actual flag claim    |
| `find-by-intent`     | 82 (noisy)       | **2** (canonical) | The find_by_intent ADR   |
| `path normalization` | 43               | 43                | `normalizePath` (ADR-01) |
| `language adapter`   | 78               | 78                | `LanguageAdapter` (ADR-03) |
| `LspClient`          | 1                | 1                 | `LspClient` (ADR-13)     |
| `normalizePath`      | 5                | 5                 | `normalizePath` (DESIGN) |

Identifier-shaped queries narrow to canonical hits; natural-language
queries return the same hit count and same top results — no
regression on the canary axes.

`fts5vocab` confirms the index holds both the intact identifier
tokens and their split sub-tokens: `narrow_attribution` (1 doc, 2
hits), `find_by_intent` (15 docs, 23 hits), `query-time` (12 docs,
24 hits), alongside the per-word `narrow` (4 docs), `attribution`
(4 docs), and so on.
