/**
 * Stale-symbol pruning (v1.2 Phase 1; F-1 fix).
 *
 * Stage 0 imports the committed atlas's symbols and Stage 4 only
 * upserts the fresh inventory, so without this step symbols from
 * deleted, renamed, moved or newly-excluded source files — and symbols
 * removed from files that still exist — survive every refresh. The
 * pruner compares the symbols stored in the database with what the
 * current run could verify and removes the ones that are provably gone.
 *
 * Rules, applied per stored symbol path (first match wins):
 *   1. the file no longer exists on disk → prune all its symbols;
 *   2. the file was walked and listed → prune its symbols missing from
 *      the new listing;
 *   3. the file was walked but listing failed (tsserver hiccup), or no
 *      adapter answered for it → keep everything, report unverified;
 *   4. the file exists, was not walked, and a configured adapter owns
 *      its extension (so an exclude pattern now drops it) → prune;
 *   5. the file exists, was not walked, and no configured adapter owns
 *      its extension (language not configured this run) → keep,
 *      report unverified.
 *
 * Pruning cascades `claim_symbols` rows. Claims are never deleted
 * here: a claim that loses its last symbol link becomes "orphaned" and
 * is reported, because the source still says what it says. v1.2
 * Phase 3 enqueues orphaned claims' sources for Tier 1 re-extraction.
 *
 * `planSymbolPrune` is pure so the Skill path's symbol writer
 * (`contextatlas resolve-symbols`, which works on atlas.json rather
 * than SQLite) applies the same rules.
 */

import { existsSync } from "node:fs";
import { posix, resolve as pathResolve } from "node:path";

import { log } from "../mcp/logger.js";
import {
  listClaimIdsLinkedToSymbols,
  listUnlinkedClaims,
} from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";
import {
  deleteSymbolsByIds,
  listSymbolLocations,
} from "../storage/symbols.js";
import type { LanguageAdapter, LanguageCode, SymbolId } from "../types.js";

import type { SourceFile } from "./file-walker.js";
import type { SymbolInventoryWithCoverage } from "./resolver.js";

export interface SymbolLocation {
  id: SymbolId;
  path: string;
}

/** What the current run could verify about source files. */
export interface SymbolCoverage {
  /** relPaths the source walk produced (after exclude patterns). */
  walkedPaths: ReadonlySet<string>;
  /** relPaths whose listing succeeded. */
  listedPaths: ReadonlySet<string>;
  /** relPaths whose listing threw. */
  failedPaths: ReadonlySet<string>;
  /** Symbol IDs in the fresh inventory. */
  inventoryIds: ReadonlySet<SymbolId>;
  /** Extensions owned by the adapters configured for this run. */
  configuredExtensions: ReadonlySet<string>;
  /** Existence check for a repo-relative path. */
  fileExists: (relPath: string) => boolean;
}

export type UnverifiedReason = "listing-failed" | "language-not-configured";

export interface UnverifiedSymbolFile {
  path: string;
  reason: UnverifiedReason;
  /** Number of stored symbols kept at this path. */
  symbols: number;
}

export interface SymbolPrunePlan {
  /** Symbol IDs to delete, sorted. */
  pruneIds: SymbolId[];
  prunedByReason: {
    fileDeleted: number;
    symbolRemoved: number;
    fileExcluded: number;
  };
  /** Paths whose stored symbols were kept without verification, sorted. */
  unverified: UnverifiedSymbolFile[];
}

export function coverageFromInventory(args: {
  repoRoot: string;
  sourceFiles: readonly SourceFile[];
  inventory: SymbolInventoryWithCoverage;
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>;
}): SymbolCoverage {
  const { repoRoot, sourceFiles, inventory, adapters } = args;
  const listedPaths = new Set(inventory.listedPaths);
  // Guard against adapter/walker path-form drift: a path that carries
  // fresh symbols was listed, whatever the walker called it.
  for (const s of inventory.allSymbols) listedPaths.add(s.path);
  const configuredExtensions = new Set<string>();
  for (const adapter of adapters.values()) {
    for (const ext of adapter.extensions) configuredExtensions.add(ext);
  }
  return {
    walkedPaths: new Set(sourceFiles.map((f) => f.relPath)),
    listedPaths,
    failedPaths: new Set(inventory.failedPaths),
    inventoryIds: new Set(inventory.allSymbols.map((s) => s.id)),
    configuredExtensions,
    fileExists: (relPath) => existsSync(pathResolve(repoRoot, relPath)),
  };
}

/** Decide which stored symbols to prune. Pure; deterministic output. */
export function planSymbolPrune(
  existing: readonly SymbolLocation[],
  coverage: SymbolCoverage,
): SymbolPrunePlan {
  const byPath = new Map<string, SymbolId[]>();
  for (const { id, path } of existing) {
    const ids = byPath.get(path);
    if (ids) ids.push(id);
    else byPath.set(path, [id]);
  }

  const pruneIds: SymbolId[] = [];
  const prunedByReason = { fileDeleted: 0, symbolRemoved: 0, fileExcluded: 0 };
  const unverified: UnverifiedSymbolFile[] = [];

  for (const path of [...byPath.keys()].sort()) {
    const ids = byPath.get(path)!;
    if (!coverage.fileExists(path)) {
      pruneIds.push(...ids);
      prunedByReason.fileDeleted += ids.length;
    } else if (coverage.listedPaths.has(path)) {
      const gone = ids.filter((id) => !coverage.inventoryIds.has(id));
      pruneIds.push(...gone);
      prunedByReason.symbolRemoved += gone.length;
    } else if (
      coverage.failedPaths.has(path) ||
      coverage.walkedPaths.has(path)
    ) {
      unverified.push({ path, reason: "listing-failed", symbols: ids.length });
    } else if (coverage.configuredExtensions.has(posix.extname(path))) {
      pruneIds.push(...ids);
      prunedByReason.fileExcluded += ids.length;
    } else {
      unverified.push({
        path,
        reason: "language-not-configured",
        symbols: ids.length,
      });
    }
  }

  pruneIds.sort();
  return { pruneIds, prunedByReason, unverified };
}

export interface SymbolPruneOutcome {
  symbolsPruned: number;
  /** Claims that lost at least one link (candidates for orphaning). */
  affectedClaimIds: number[];
  unverifiedSymbolFiles: number;
  plan: SymbolPrunePlan;
}

/**
 * Apply the prune plan to the database: delete stale symbols and
 * cascade their links. Warns once when symbols were kept unverified.
 */
export function pruneStaleSymbols(
  db: DatabaseInstance,
  coverage: SymbolCoverage,
): SymbolPruneOutcome {
  const plan = planSymbolPrune(listSymbolLocations(db), coverage);
  const affectedClaimIds = listClaimIdsLinkedToSymbols(db, plan.pruneIds);
  const symbolsPruned = deleteSymbolsByIds(db, plan.pruneIds);

  if (symbolsPruned > 0) {
    log.info("symbol prune: removed stale symbols", {
      symbolsPruned,
      ...plan.prunedByReason,
    });
  }
  warnUnverified(plan.unverified);

  return {
    symbolsPruned,
    affectedClaimIds,
    unverifiedSymbolFiles: plan.unverified.length,
    plan,
  };
}

/** Log one warning summarizing symbols kept without verification. */
export function warnUnverified(unverified: readonly UnverifiedSymbolFile[]): void {
  if (unverified.length === 0) return;
  const count = (reason: UnverifiedReason) =>
    unverified.filter((u) => u.reason === reason).length;
  log.warn(
    `symbol prune: kept the stored symbols of ${unverified.length} unverified ` +
      "file(s) — listSymbols failed for the file, or its language is not " +
      "configured for this run. They were neither refreshed nor pruned; " +
      "re-run once the language server is healthy / the language is configured.",
    {
      unverifiedFiles: unverified.length,
      listingFailed: count("listing-failed"),
      languageNotConfigured: count("language-not-configured"),
      sample: unverified.slice(0, 10).map((u) => u.path),
    },
  );
}

export interface OrphanedClaimSource {
  /** Claim `source` field (e.g. `adr:ADR-06.md`, `commit:<sha>`). */
  source: string;
  /** Claim `source_path` — the source_shas key a re-extraction targets. */
  sourcePath: string;
  count: number;
}

export interface OrphanedClaimsSummary {
  claimsOrphaned: number;
  /** Sorted by source, then sourcePath. */
  bySource: OrphanedClaimSource[];
}

/**
 * Count the claims this run orphaned: among the claims that lost a
 * link during the prune, those that still exist and have no link left.
 * Call after every stage that may delete or rewrite claims (Stage 5
 * deletions, Stage 6 re-extraction) so only surviving orphans count.
 */
export function summarizeOrphanedClaims(
  db: DatabaseInstance,
  affectedClaimIds: readonly number[],
): OrphanedClaimsSummary {
  const rows = listUnlinkedClaims(db, affectedClaimIds);
  const counts = new Map<string, OrphanedClaimSource>();
  for (const row of rows) {
    const key = `${row.source}\u0000${row.sourcePath}`;
    const hit = counts.get(key);
    if (hit) hit.count++;
    else counts.set(key, { source: row.source, sourcePath: row.sourcePath, count: 1 });
  }
  const bySource = [...counts.values()].sort((a, b) =>
    a.source === b.source
      ? compare(a.sourcePath, b.sourcePath)
      : compare(a.source, b.source),
  );
  return { claimsOrphaned: rows.length, bySource };
}

/**
 * Warn about newly orphaned claims, listing their sources. The claims
 * stay in the atlas but no longer reach any symbol bundle; v1.2
 * Phase 3 enqueues these sources for Tier 1 re-extraction.
 */
export function warnOrphanedClaims(summary: OrphanedClaimsSummary): void {
  if (summary.claimsOrphaned === 0) return;
  log.warn(
    `symbol prune: ${summary.claimsOrphaned} claim(s) lost their last symbol ` +
      "link and are now orphaned (kept, not deleted). Re-extract their " +
      "sources to re-attach them.",
    {
      claimsOrphaned: summary.claimsOrphaned,
      sources: summary.bySource.map((s) => `${s.source} (${s.count})`),
    },
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
