/**
 * Query layer for `find_by_intent` — the architectural decisions
 * land in ADR-09. In brief:
 *
 *   - Substrate: SQLite FTS5 virtual table `claims_fts`
 *   - Ranking: built-in BM25 (negative scores, best = most-negative)
 *   - Query: `"exact phrase" OR tok1 OR tok2 ...` — lets BM25 do
 *     phrase-vs-scatter weighting in one pass
 *   - Response: one record per linked symbol, top-scoring claim
 *     surfaced as `matchedIntent`. No `relevance` score on the wire.
 *
 * User input is always sanitized before it hits FTS5. Operators,
 * quotes, and MATCH syntax cannot come through directly — a
 * `raw_query` escape hatch is a post-MVP conversation (see ADR-09's
 * "post-v0.1 extensions" section).
 */

import type { DatabaseInstance } from "../storage/db.js";
import type { Severity, SymbolKind } from "../types.js";

export interface FindByIntentMatch {
  symbolId: string;
  name: string;
  path: string;
  line: number;
  kind: SymbolKind;
  signature?: string;
  matchedIntent: {
    source: string;
    severity: Severity;
    claim: string;
    rationale?: string;
    excerpt?: string;
  };
}

export interface FindByIntentOptions {
  query: string;
  /** Caller-provided cap. The function also clamps to a hard max. */
  limit: number;
}

/** Absolute ceiling regardless of what the caller passes. */
export const MAX_LIMIT = 50;

/**
 * Strip non-letter / non-digit / non-whitespace, normalize whitespace
 * runs to single spaces, trim. Unicode letters/digits are preserved
 * via `\p{L}` / `\p{N}` so non-ASCII claim text doesn't get garbled.
 *
 * Exported for direct unit testing; callers typically go through
 * {@link findByIntent}.
 */
export function sanitizeQuery(input: string): {
  cleaned: string;
  tokens: string[];
} {
  const cleaned = input
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.length > 0 ? cleaned.split(" ") : [];
  return { cleaned, tokens };
}

/**
 * Build the FTS5 MATCH string from a token list. Returns null when
 * there are no tokens — callers treat that as "empty query, zero
 * matches," not as an error.
 *
 * Shape: `"exact phrase" OR tok1 OR tok2 ...`. The quoted prefix
 * lets BM25 boost contiguous occurrences; the OR-joined suffix
 * catches scattered-token matches. One MATCH call, BM25 handles
 * the ordering.
 */
export function buildMatchQuery(tokens: readonly string[]): string | null {
  if (tokens.length === 0) return null;
  const phrase = `"${tokens.join(" ")}"`;
  if (tokens.length === 1) return phrase;
  const orTerms = tokens.join(" OR ");
  return `${phrase} OR ${orTerms}`;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  hard: 0,
  soft: 1,
  context: 2,
};

/**
 * Count how many of the query's tokens appear as a case-insensitive
 * substring inside the symbol's name.
 *
 * Why this exists: ADR-08's frontmatter-hint resolver auto-links a
 * claim to every symbol declared in its source ADR's frontmatter.
 * A claim about `normalizePath` extracted from ADR-01 ends up linked
 * to `normalizePath` AND to `SymbolId` / `Symbol` / `LANG_CODES` (the
 * three symbols ADR-01 declares it governs). These four symbols all
 * tie on BM25 score (same claim), same severity, same source, same
 * claim id. Without a name-overlap tiebreaker, their display order
 * is arbitrary — query "normalizePath" can return `LANG_CODES` ahead
 * of `normalizePath`, which is confusing.
 *
 * Scoring is deliberately cheap: substring inclusion, not tokenized
 * match. Cheap to compute, robust against camelCase (query
 * "normalizePath" matches symbol name "normalizePath" with token
 * count 1) and against partial-phrase queries.
 */
function nameOverlapScore(
  symbolName: string,
  queryTokens: readonly string[],
): number {
  const lowerName = symbolName.toLowerCase();
  let hits = 0;
  for (const tok of queryTokens) {
    if (tok.length > 0 && lowerName.includes(tok.toLowerCase())) hits++;
  }
  return hits;
}

/**
 * Run the find_by_intent query against the given DB. Returns
 * ranked matches up to `limit` (clamped to MAX_LIMIT).
 */
export function findByIntent(
  db: DatabaseInstance,
  options: FindByIntentOptions,
): FindByIntentMatch[] {
  const { tokens } = sanitizeQuery(options.query);
  const matchString = buildMatchQuery(tokens);
  if (matchString === null) return [];

  const limit = Math.max(1, Math.min(MAX_LIMIT, options.limit));

  // Over-fetch so we can apply tiebreakers + symbol-linkage expansion
  // (one claim may link to multiple symbols) before truncating to the
  // caller's limit. A per-claim query that fans out to symbols can
  // drop well below the raw FTS hit count, so the over-fetch factor
  // gives us headroom without unbounded cost.
  const overfetch = Math.min(limit * 5, 200);

  type Row = {
    claim_id: number;
    bm25_score: number;
    source: string;
    severity: string;
    claim: string;
    rationale: string | null;
    excerpt: string | null;
  };

  const rows = db
    .prepare(
      `SELECT
         c.id          AS claim_id,
         bm25(claims_fts) AS bm25_score,
         c.source      AS source,
         c.severity    AS severity,
         c.claim       AS claim,
         c.rationale   AS rationale,
         c.excerpt     AS excerpt
       FROM claims_fts
       JOIN claims c ON c.id = claims_fts.rowid
       WHERE claims_fts MATCH ?
       ORDER BY bm25(claims_fts) ASC
       LIMIT ?`,
    )
    .all(matchString, overfetch) as Row[];

  const linkStmt = db.prepare(
    "SELECT s.id, s.name, s.path, s.line, s.kind, s.signature " +
      "FROM claim_symbols cs " +
      "JOIN symbols s ON s.id = cs.symbol_id " +
      "WHERE cs.claim_id = ?",
  );

  type SymRow = {
    id: string;
    name: string;
    path: string;
    line: number;
    kind: string;
    signature: string | null;
  };

  interface RankedMatch extends FindByIntentMatch {
    bm25: number;
    claimId: number;
    nameOverlap: number;
  }

  const ranked: RankedMatch[] = [];
  const seenSymbols = new Set<string>();

  for (const row of rows) {
    const syms = linkStmt.all(row.claim_id) as SymRow[];
    for (const sym of syms) {
      // A symbol may be matched via several claims; surface only the
      // top-scoring one (rows are already BM25-ordered ASC).
      if (seenSymbols.has(sym.id)) continue;
      seenSymbols.add(sym.id);
      ranked.push({
        symbolId: sym.id,
        name: sym.name,
        path: sym.path,
        line: sym.line,
        kind: sym.kind as SymbolKind,
        signature: sym.signature ?? undefined,
        matchedIntent: {
          source: row.source,
          severity: row.severity as Severity,
          claim: row.claim,
          rationale: row.rationale ?? undefined,
          excerpt: row.excerpt ?? undefined,
        },
        bm25: row.bm25_score,
        claimId: row.claim_id,
        nameOverlap: nameOverlapScore(sym.name, tokens),
      });
    }
  }

  // Sort chain (ADR-09, refined during step-8 dogfood):
  //   1. BM25 ascending (more negative = better)
  //   2. Name-overlap descending — disambiguates ties from ADR-08
  //      frontmatter-hint fan-out where N symbols share one claim
  //   3. Severity: hard > soft > context
  //   4. Source alphabetical
  //   5. Claim id (final deterministic fallback)
  ranked.sort((a, b) => {
    if (a.bm25 !== b.bm25) return a.bm25 - b.bm25;
    if (a.nameOverlap !== b.nameOverlap) return b.nameOverlap - a.nameOverlap;
    const sevDelta =
      SEVERITY_ORDER[a.matchedIntent.severity] -
      SEVERITY_ORDER[b.matchedIntent.severity];
    if (sevDelta !== 0) return sevDelta;
    if (a.matchedIntent.source !== b.matchedIntent.source) {
      return a.matchedIntent.source < b.matchedIntent.source ? -1 : 1;
    }
    return a.claimId - b.claimId;
  });

  // Strip internal ranking fields before returning.
  return ranked.slice(0, limit).map(
    ({
      bm25: _bm25,
      claimId: _claimId,
      nameOverlap: _nameOverlap,
      ...publicFields
    }) => publicFields,
  );
}
