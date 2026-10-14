/**
 * The atlas state the freshness checks inspect (v1.2 Phase 8): source
 * keys and orphaned claims, read from the store that is the source of
 * truth for the repository's `atlas.committed` mode (lead decision L-19):
 *
 *   - `committed: true`  → `atlas.json` (the committed artifact; the
 *     Skill path writes it directly, so a key it leaves behind lives
 *     there, F1);
 *   - `committed: false` → the local cache, opened read-only (`index`
 *     never writes `atlas.json` in that mode).
 *
 * An orphaned claim has no symbol link but names symbols
 * (`symbol_candidates`, F-7): every run re-links those that resolve
 * (`relinkUnlinkedClaims`), so what is left names symbols the tree no
 * longer has, or never had. Claims that name no symbol are not orphans.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { listUnlinkedClaimCandidates } from "../../storage/claims.js";
import { openDatabase } from "../../storage/db.js";
import type { ContextAtlasConfig } from "../../types.js";

export interface AtlasState {
  /** Which store was read, for messages. */
  readonly store: string;
  /** `source_shas` keys. */
  readonly sourceKeys: readonly string[];
  /** `source_path` of each orphaned claim. */
  readonly orphanSourcePaths: readonly string[];
}

export type AtlasStateResult =
  | { readonly kind: "ok"; readonly state: AtlasState }
  /** The store is absent; the atlas checks already report it. */
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly store: string; readonly error: string };

export function loadAtlasState(
  repoRoot: string,
  config: ContextAtlasConfig,
): AtlasStateResult {
  return config.atlas.committed
    ? fromAtlasJson(pathResolve(repoRoot, config.atlas.path), config.atlas.path)
    : fromCache(pathResolve(repoRoot, config.atlas.localCache), config.atlas.localCache);
}

function fromAtlasJson(path: string, label: string): AtlasStateResult {
  if (!existsSync(path)) return { kind: "absent" };
  let atlas: { source_shas?: unknown; claims?: unknown };
  try {
    atlas = JSON.parse(readFileSync(path, "utf8")) as typeof atlas;
  } catch (err) {
    return { kind: "unreadable", store: label, error: String(err) };
  }
  const shas = atlas.source_shas;
  const sourceKeys =
    shas !== null && typeof shas === "object" ? Object.keys(shas as object) : [];
  const orphanSourcePaths: string[] = [];
  for (const c of Array.isArray(atlas.claims) ? atlas.claims : []) {
    if (c === null || typeof c !== "object") continue;
    const claim = c as { source_path?: unknown; symbol_ids?: unknown; symbol_candidates?: unknown };
    const linked = Array.isArray(claim.symbol_ids) && claim.symbol_ids.length > 0;
    const named =
      Array.isArray(claim.symbol_candidates) &&
      claim.symbol_candidates.some((s) => typeof s === "string");
    if (!linked && named && typeof claim.source_path === "string") {
      orphanSourcePaths.push(claim.source_path);
    }
  }
  return { kind: "ok", state: { store: label, sourceKeys, orphanSourcePaths } };
}

function fromCache(path: string, label: string): AtlasStateResult {
  if (!existsSync(path)) return { kind: "absent" };
  try {
    const db = openDatabase(path, { readonly: true });
    try {
      const sourceKeys = (
        db.prepare("SELECT source_path FROM source_shas").all() as { source_path: string }[]
      ).map((r) => r.source_path);
      const orphanIds = new Set(listUnlinkedClaimCandidates(db).map((o) => o.id));
      const orphanSourcePaths = (
        db.prepare("SELECT id, source_path FROM claims").all() as {
          id: number;
          source_path: string;
        }[]
      )
        .filter((r) => orphanIds.has(r.id))
        .map((r) => r.source_path);
      return { kind: "ok", state: { store: label, sourceKeys, orphanSourcePaths } };
    } finally {
      db.close();
    }
  } catch (err) {
    return {
      kind: "unreadable",
      store: label,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
