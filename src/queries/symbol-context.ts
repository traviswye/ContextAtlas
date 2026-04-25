/**
 * Bundle builder for get_symbol_context.
 *
 * Accepts a resolved SymbolId plus options and assembles the fused
 * bundle by pulling from: storage (intent + git), the adapter (refs,
 * types, diagnostics), and a test-file classifier (tests bucket).
 *
 * Returns the `SymbolContextBundle` shape from src/types.ts; compact
 * rendering happens downstream in src/formatters/compact.ts.
 */

import { log } from "../mcp/logger.js";
import { listClaimsForSymbol } from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";
import { buildMatchQuery, sanitizeQuery } from "./find-by-intent.js";
import {
  countCommitsForFile,
  listCommitsForFile,
} from "../storage/git.js";
import type {
  BundleDepth,
  BundleSignal,
  Claim,
  Diagnostic,
  LanguageAdapter,
  Reference,
  Symbol as AtlasSymbol,
  SymbolContextBundle,
  SymbolId,
  TypeInfo,
} from "../types.js";
import { isTestFile } from "../utils/test-files.js";

export const ALL_SIGNALS: readonly BundleSignal[] = [
  "refs",
  "intent",
  "git",
  "types",
  "tests",
];

/**
 * Default set applied when the caller does not pass `include`.
 * All five signals. ADR-11 wires git into the default set: with the
 * index-time git extractor populated, the primitive's "return
 * everything in one call" philosophy finally covers every axis.
 */
export const DEFAULT_SIGNALS: readonly BundleSignal[] = [
  "refs",
  "intent",
  "git",
  "types",
  "tests",
];

export interface BuildBundleDeps {
  db: DatabaseInstance;
  adapter: LanguageAdapter;
}

export interface BuildBundleOptions {
  symbol: AtlasSymbol;
  depth: BundleDepth;
  include: readonly BundleSignal[];
  maxRefs: number;
  /**
   * Threshold for the `hot` flag + `recentCommits` cap. Mirrors
   * `config.git.recentCommits` — same knob, same meaning (ADR-11).
   * Optional so existing callers that never include the "git" signal
   * don't have to thread a value through. Defaults to
   * {@link DEFAULT_GIT_BUNDLE_RECENT} when absent.
   */
  gitRecentCommits?: number;
  /**
   * Optional BM25 query string for ranking the intent block (ADR-16,
   * v0.3 Theme 1.2 Fix 3). When present, claims attached to the
   * symbol are FTS5 BM25-ranked against this query, then tiebroken
   * by severity → source → claim_id. When absent, falls back to v0.2
   * deterministic ordering (severity → source → claim_id).
   *
   * **Two-layer gating** at the handler level (see HandlerDeps in
   * `src/mcp/handlers/get-symbol-context.ts`): the
   * `symbolContextBM25` server flag must be on AND the caller must
   * pass a `query` parameter for this option to be set here. Either
   * condition absent → option absent → v0.2 ranking.
   *
   * Differs from find_by_intent's BM25 chain: NO name-overlap
   * tiebreaker, since all claims for a single symbol share the same
   * symbol name (the tiebreaker would be degenerate). See ADR-16
   * Decision section.
   */
  bm25Query?: string;
}

/**
 * Fallback used when the caller omits `gitRecentCommits`. Matches
 * `DEFAULT_GIT_RECENT_COMMITS` in config/defaults.ts — same knob, same
 * meaning — kept as its own constant to avoid an import cycle between
 * query and config layers.
 */
export const DEFAULT_GIT_BUNDLE_RECENT = 5;

export async function buildBundle(
  deps: BuildBundleDeps,
  options: BuildBundleOptions,
): Promise<SymbolContextBundle> {
  const { db, adapter } = deps;
  const { symbol, depth, include, maxRefs } = options;
  const gitRecentCommits =
    options.gitRecentCommits ?? DEFAULT_GIT_BUNDLE_RECENT;
  const signalSet = new Set<BundleSignal>(include);

  const bundle: SymbolContextBundle = {
    version: "1.0",
    symbol,
  };

  // Intent
  if (signalSet.has("intent")) {
    const claims = listClaimsForSymbol(db, symbol.id);
    // ADR-16 BM25 path: only when bm25Query is present (handler-side
    // two-layer gating ensures this option is set only when the
    // server flag is on AND the caller passed a query). Falls back to
    // v0.2 deterministic ordering otherwise — guarded by the
    // v0.2-equivalence canary tests.
    if (options.bm25Query !== undefined) {
      bundle.intent = sortClaimsByBM25(db, claims, options.bm25Query);
    } else {
      bundle.intent = sortClaimsBySeverityThenSource(claims);
    }
  }

  // References + derived tests
  let refs: Reference[] | null = null;
  const needsRefs = signalSet.has("refs");
  const needsTests = signalSet.has("tests");
  if (needsRefs || needsTests) {
    refs = await safeFindReferences(adapter, symbol.id);
  }

  if (needsRefs && refs) {
    bundle.refs = summarizeReferences(refs, maxRefs, depth);
  }

  if (needsTests && refs) {
    const testFiles = uniqueTestFiles(refs);
    if (testFiles.length > 0) {
      bundle.tests = { files: testFiles, relatedCount: testFiles.length };
    }
  }

  // Types
  if (signalSet.has("types")) {
    const ti = await safeGetTypeInfo(adapter, symbol.id);
    if (ti && hasAnyTypeInfo(ti)) {
      bundle.types = {};
      if (ti.extends.length > 0) bundle.types.extends = ti.extends;
      if (ti.implements.length > 0) bundle.types.implements = ti.implements;
      if (ti.usedByTypes.length > 0)
        bundle.types.usedByTypes = ti.usedByTypes;
    }
  }

  // Git — populated from index-time SQLite tables (ADR-11).
  if (signalSet.has("git")) {
    const gitBlock = buildGitBlock(db, symbol.path, gitRecentCommits);
    if (gitBlock) {
      bundle.git = gitBlock;
    }
  }

  // Diagnostics — always included when present, per user decision.
  const diagnostics = await safeGetDiagnostics(adapter, symbol.path);
  if (diagnostics.length > 0) {
    bundle.diagnostics = diagnostics;
  }

  return bundle;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER = { hard: 0, soft: 1, context: 2 } as const;

function sortClaimsBySeverityThenSource(claims: Claim[]): Claim[] {
  return [...claims].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return a.source < b.source ? -1 : a.source > b.source ? 1 : 0;
  });
}

/**
 * BM25-rank a per-symbol claim subset against a query (ADR-16, v0.3
 * Theme 1.2 Fix 3). Issues an FTS5 MATCH query against `claims_fts`,
 * filtered to the input claims' IDs, and merges the resulting BM25
 * scores back onto the claim list. Claims that don't match any query
 * token survive in the result (sorting by POSITIVE_INFINITY → end of
 * list) — this preserves the "all claims for the symbol surface" rule.
 *
 * Sort chain (no name-overlap step, unlike find_by_intent):
 *   1. BM25 score ASC (more negative = better; unmatched = +Infinity → last)
 *   2. Severity (hard > soft > context)
 *   3. Source alphabetical
 *   4. Claim id ASC (final deterministic fallback)
 *
 * Why no name-overlap tiebreaker: in get_symbol_context, all claims
 * belong to the same symbol, so they all share the same name-overlap
 * score against any query — the tiebreaker is degenerate. find_by_intent
 * uses name-overlap because it ranks symbols (potentially many) sharing
 * a single claim via ADR-08 frontmatter-hint fan-out.
 *
 * Empty / whitespace-only queries return claims in v0.2 deterministic
 * order — handler-level gating should prevent this case, but the
 * function handles it defensively.
 */
function sortClaimsByBM25(
  db: DatabaseInstance,
  claims: Claim[],
  query: string,
): Claim[] {
  const { tokens } = sanitizeQuery(query);
  const matchString = buildMatchQuery(tokens);
  if (matchString === null || claims.length === 0) {
    return sortClaimsBySeverityThenSource(claims);
  }

  // Build a Set of claim IDs we care about; the FTS query joins
  // against claims and we filter to this subset client-side. (SQL-side
  // filtering with `c.id IN (...)` is possible but the IN-list cap is
  // small in practice — typical per-symbol claim counts are < 30.
  // Client-side filter keeps the query simple and avoids
  // parameter-list size concerns.)
  const claimIds = new Set(claims.map((c) => c.id));

  type ScoredRow = { id: number; bm25_score: number };
  const scoredRows = db
    .prepare(
      `SELECT c.id AS id, bm25(claims_fts) AS bm25_score
       FROM claims_fts
       JOIN claims c ON c.id = claims_fts.rowid
       WHERE claims_fts MATCH ?`,
    )
    .all(matchString) as ScoredRow[];

  const scoreMap = new Map<number, number>();
  for (const row of scoredRows) {
    if (claimIds.has(row.id)) {
      scoreMap.set(row.id, row.bm25_score);
    }
  }

  return [...claims].sort((a, b) => {
    // Unmatched claims sort to the end via POSITIVE_INFINITY sentinel.
    const scoreA = scoreMap.get(a.id) ?? Number.POSITIVE_INFINITY;
    const scoreB = scoreMap.get(b.id) ?? Number.POSITIVE_INFINITY;
    if (scoreA !== scoreB) return scoreA - scoreB;
    // Tiebreaker chain — same as v0.2 default (no name-overlap step
    // since it's degenerate for per-symbol claims; see docstring).
    const sevDelta = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDelta !== 0) return sevDelta;
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    return a.id - b.id;
  });
}

/**
 * Common root prefixes stripped when computing module bucket keys.
 * Without this, src-rooted repos collapse every ref into a single
 * `[src:N]` cluster — see Phase B dogfooding for the observed UX.
 * A one-level strip is enough in practice; nested cases like
 * `lib/src/foo/` are pathological and intentionally not optimized.
 */
const ROOT_PREFIXES: ReadonlySet<string> = new Set([
  "src",
  "lib",
  "app",
  "packages",
  "source",
]);

export function moduleKeyForPath(path: string): string {
  const parts = path.split("/");
  if (parts.length > 1 && ROOT_PREFIXES.has(parts[0]!)) {
    return parts[1] ?? parts[0]!;
  }
  return parts[0] ?? ".";
}

function summarizeReferences(
  refs: readonly Reference[],
  maxRefs: number,
  _depth: BundleDepth,
): NonNullable<SymbolContextBundle["refs"]> {
  // Bucket by module, stripping common root prefixes (`src`, `lib`,
  // `packages`, etc.) so clusters reflect meaningful project
  // sub-divisions rather than a single `[src:N]` blob.
  const buckets = new Map<string, Reference[]>();
  for (const r of refs) {
    const seg = moduleKeyForPath(r.path);
    const arr = buckets.get(seg);
    if (arr) arr.push(r);
    else buckets.set(seg, [r]);
  }

  const clusters = Array.from(buckets.entries())
    .map(([module, rs]) => ({
      module,
      count: rs.length,
      topIds: rs.slice(0, maxRefs).map((r) => r.id),
    }))
    .sort((a, b) => b.count - a.count);

  return { count: refs.length, clusters };
}

function uniqueTestFiles(refs: readonly Reference[]): string[] {
  const seen = new Set<string>();
  for (const r of refs) {
    if (isTestFile(r.path)) seen.add(r.path);
  }
  return Array.from(seen).sort();
}

function hasAnyTypeInfo(ti: TypeInfo): boolean {
  return (
    ti.extends.length > 0 ||
    ti.implements.length > 0 ||
    ti.usedByTypes.length > 0
  );
}

/**
 * Build the git block for a symbol's file. Returns undefined when the
 * file has no git history in the stored window — bundle consumers omit
 * the section rather than render an empty stub, matching the
 * primitive's "omit empty sections" rule.
 */
function buildGitBlock(
  db: DatabaseInstance,
  filePath: string,
  gitRecentCommits: number,
): NonNullable<SymbolContextBundle["git"]> | undefined {
  const commitCount = countCommitsForFile(db, filePath);
  if (commitCount === 0) return undefined;

  const recent = listCommitsForFile(db, filePath, gitRecentCommits);
  const top = recent[0];
  if (!top) return undefined;

  return {
    lastTouched: top.date,
    lastTouchedAuthor: top.authorEmail,
    recentCommits: recent.map((c) => ({
      sha: c.sha,
      date: c.date,
      message: c.message,
      authorEmail: c.authorEmail,
    })),
    hot: commitCount >= gitRecentCommits,
    commitCount,
    hotThreshold: gitRecentCommits,
  };
}

async function safeFindReferences(
  adapter: LanguageAdapter,
  id: SymbolId,
): Promise<Reference[] | null> {
  try {
    return await adapter.findReferences(id);
  } catch (err) {
    // Stale atlas / tsserver hiccup — log and render with empty refs.
    log.warn("symbol-context: findReferences failed", {
      id,
      err: String(err),
    });
    return null;
  }
}

async function safeGetTypeInfo(
  adapter: LanguageAdapter,
  id: SymbolId,
): Promise<TypeInfo | null> {
  try {
    return await adapter.getTypeInfo(id);
  } catch (err) {
    log.warn("symbol-context: getTypeInfo failed", { id, err: String(err) });
    return null;
  }
}

async function safeGetDiagnostics(
  adapter: LanguageAdapter,
  path: string,
): Promise<Diagnostic[]> {
  try {
    return await adapter.getDiagnostics(path);
  } catch (err) {
    log.warn("symbol-context: getDiagnostics failed", {
      path,
      err: String(err),
    });
    return [];
  }
}
