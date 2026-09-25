/**
 * How the MCP server loads atlas.json into the local cache at startup
 * (v1.2 Phase 2 review round 2.2).
 *
 *   - An empty cache (`isCacheEmpty`: no symbols, claims or source keys)
 *     is seeded from atlas.json, in either mode.
 *   - `atlas.committed: true`: atlas.json is the source of truth
 *     (ADR-06), so it is imported again whenever it differs from the
 *     file this cache last imported or wrote (the SHA-256 kept in the
 *     cache-only `_meta` key `index.key_streams_atlas_sha256`). Before,
 *     a non-empty cache was never replaced: after a `git pull` or an
 *     `/index-atlas` refresh the server kept serving the old atlas with
 *     no warning, and a teammate without an API key had no way to
 *     refresh it short of deleting the cache. Not while an `index` run
 *     over this cache is unfinished (or running): the cache then holds
 *     work atlas.json lacks, and the server serves it with a warning.
 *   - `atlas.committed: false`: the cache is the source of truth, and a
 *     non-empty one is kept, as `contextatlas index` does.
 *
 * A re-import that fails (a malformed or conflicted atlas.json, claims
 * linking unlisted symbols) leaves the cache as it was (the import is
 * one transaction), and the server serves it with a warning, as it did
 * before re-imports existed. Seeding an empty cache still throws: there
 * is nothing else to serve.
 *
 * Every import records the file's SHA-256 and drops the `source_key_streams`
 * records written on top of another file, as Stage 0 does (`adoptAtlas`).
 */

import { existsSync, readFileSync } from "node:fs";

import { importAtlas } from "../storage/atlas-importer.js";
import { getCacheMeta, isCacheEmpty } from "../storage/cache-meta.js";
import type { DatabaseInstance } from "../storage/db.js";
import type { AtlasFileV1 } from "../storage/types.js";

import {
  adoptAtlas,
  atlasFileSha256,
  KEY_STREAMS_ATLAS_KEY,
  RUN_IN_PROGRESS_KEY,
} from "./atlas-baseline.js";

export interface ServerCacheLoadInput {
  atlasAbsPath: string;
  /** `config.atlas.committed`. */
  committed: boolean;
}

/** What {@link loadAtlasForServer} did. */
export type ServerCacheLoad =
  /** The cache was empty and atlas.json was imported. */
  | { readonly action: "seeded" }
  /** `committed: true`: atlas.json changed since the cache last held it. */
  | { readonly action: "reimported" }
  /**
   * The cache is served as it is: it holds this atlas.json already, it
   * is authoritative (`committed: false`), or there is no atlas.json.
   */
  | { readonly action: "kept" }
  /**
   * `committed: true` and atlas.json differs from the cache, but an
   * `index` run over this cache has not finished: the cache is served.
   */
  | { readonly action: "kept-unfinished-run" }
  /**
   * `committed: true` and atlas.json differs from the cache, but it
   * could not be imported: the cache, unchanged, is served.
   */
  | { readonly action: "kept-import-failed"; readonly error: string }
  /** No atlas.json and an empty cache. */
  | { readonly action: "empty" };

/**
 * Bring the cache up to date with atlas.json for serving (see the module
 * header). Throws only when an empty cache cannot be seeded.
 */
export function loadAtlasForServer(
  db: DatabaseInstance,
  input: ServerCacheLoadInput,
): ServerCacheLoad {
  const exists = existsSync(input.atlasAbsPath);
  if (isCacheEmpty(db)) {
    if (!exists) return { action: "empty" };
    importFile(db, readFileSync(input.atlasAbsPath));
    return { action: "seeded" };
  }
  if (!input.committed || !exists) return { action: "kept" };

  const raw = readFileSync(input.atlasAbsPath);
  if (getCacheMeta(db, KEY_STREAMS_ATLAS_KEY) === atlasFileSha256(raw)) {
    return { action: "kept" };
  }
  if (getCacheMeta(db, RUN_IN_PROGRESS_KEY) !== undefined) {
    return { action: "kept-unfinished-run" };
  }
  try {
    importFile(db, raw);
  } catch (err) {
    return {
      action: "kept-import-failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return { action: "reimported" };
}

function importFile(db: DatabaseInstance, raw: Buffer): void {
  const atlas = JSON.parse(raw.toString("utf8")) as AtlasFileV1;
  db.transaction(() => {
    importAtlas(db, atlas);
    adoptAtlas(db, atlasFileSha256(raw));
  })();
}
