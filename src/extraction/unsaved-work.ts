/**
 * The work an unfinished `contextatlas index` run stored in the local
 * cache but never saved to atlas.json, and how the next run carries it
 * over (v1.2 Phase 2 review round 2).
 *
 * A run stores each unit it extracts (a prose file, a docstring file, a
 * commit) in the cache straight away, but writes atlas.json only at
 * Stage 7. The first resume fix kept the whole cache when atlas.json had
 * not changed. That also kept what the dead run had removed against its
 * own tree and config: symbols Stage 4a pruned (with their claim links)
 * and keys Stage 5 deleted. Once the file came back (a branch switched
 * back, an exclude pattern reverted) those links stayed lost for good. It
 * also kept the commit claims of another branch whose atlas.json is
 * byte-identical.
 *
 * A resume is now additive only. atlas.json is imported as on every run;
 * then only the units the unfinished run stored are carried over: each
 * `source_shas` key whose SHA differs from atlas.json's (or that
 * atlas.json lacks), with the claims stored under it and the symbols
 * those claims link. This run's own Stages 4a and 5 then prune and
 * delete against the current tree and config, and report the orphans.
 * A commit is carried only when it is reachable from the current HEAD.
 */

import {
  deleteClaimsBySourcePath,
  insertClaims,
  listAllClaims,
  listClaimSymbolCandidates,
  listSourceShas,
  setSourceSha,
  type NewClaim,
} from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";
import { getSymbol, upsertSymbol } from "../storage/symbols.js";
import type { Symbol as AtlasSymbol } from "../types.js";

import { COMMIT_KEY_PREFIX, isBareCommitSha } from "./source-keys.js";

/** One stored unit: a source key, its SHA and the claims under it. */
export interface UnsavedUnit {
  readonly key: string;
  readonly sha: string;
  readonly claims: readonly NewClaim[];
}

export interface UnsavedWork {
  readonly units: readonly UnsavedUnit[];
  /** Symbols the carried claims link, as the cache held them. */
  readonly symbols: readonly AtlasSymbol[];
  /** Commit units left out because HEAD cannot reach the commit. */
  readonly commitsLeftOut: number;
}

/**
 * Collect the units the cache holds that atlas.json (`committedShas`)
 * lacks. Call before atlas.json is imported. `isCommitReachable` gets a
 * commit's sha; units of commits it rejects are left out.
 */
export function snapshotUnsavedWork(
  db: DatabaseInstance,
  committedShas: Readonly<Record<string, string>>,
  isCommitReachable: (sha: string) => boolean,
): UnsavedWork {
  const keys = new Map<string, string>();
  let commitsLeftOut = 0;
  for (const [key, sha] of Object.entries(listSourceShas(db))) {
    if (committedShas[key] === sha) continue;
    if (isCommitUnit(key, sha) && !isCommitReachable(sha)) {
      commitsLeftOut++;
      continue;
    }
    keys.set(key, sha);
  }
  if (keys.size === 0) return { units: [], symbols: [], commitsLeftOut };

  const candidates = listClaimSymbolCandidates(db);
  const claimsByKey = new Map<string, NewClaim[]>();
  const linked = new Set<string>();
  for (const c of listAllClaims(db)) {
    if (!keys.has(c.sourcePath)) continue;
    const list = claimsByKey.get(c.sourcePath) ?? [];
    const symbolCandidates = candidates.get(c.id);
    list.push({
      source: c.source,
      sourcePath: c.sourcePath,
      sourceSha: c.sourceSha,
      severity: c.severity,
      claim: c.claim,
      ...(c.rationale !== undefined ? { rationale: c.rationale } : {}),
      ...(c.excerpt !== undefined ? { excerpt: c.excerpt } : {}),
      symbolIds: c.symbolIds,
      ...(symbolCandidates !== undefined ? { symbolCandidates } : {}),
    });
    claimsByKey.set(c.sourcePath, list);
    for (const id of c.symbolIds) linked.add(id);
  }

  const symbols: AtlasSymbol[] = [];
  for (const id of linked) {
    const sym = getSymbol(db, id);
    if (sym !== null) symbols.push(sym);
  }
  const units: UnsavedUnit[] = [...keys].map(([key, sha]) => ({
    key,
    sha,
    claims: claimsByKey.get(key) ?? [],
  }));
  return { units, symbols, commitsLeftOut };
}

/**
 * Write the snapshot back over the freshly imported atlas.json, in one
 * transaction: a linked symbol atlas.json lacks is added (Stage 4a prunes
 * it if it no longer exists), and each unit's claims replace whatever
 * atlas.json holds under its key.
 */
export function restoreUnsavedWork(
  db: DatabaseInstance,
  work: UnsavedWork,
): void {
  db.transaction(() => {
    for (const sym of work.symbols) {
      if (getSymbol(db, sym.id) === null) upsertSymbol(db, sym);
    }
    for (const unit of work.units) {
      deleteClaimsBySourcePath(db, unit.key);
      insertClaims(db, unit.claims);
      setSourceSha(db, unit.key, unit.sha);
    }
  })();
}

/** A commit key, canonical or legacy bare; both map to the sha itself. */
function isCommitUnit(key: string, sha: string): boolean {
  return key.startsWith(COMMIT_KEY_PREFIX) || (isBareCommitSha(key) && key === sha);
}
