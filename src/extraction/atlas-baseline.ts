/**
 * Stage 0 of `runExtractionPipeline`: decide whether the committed
 * atlas.json replaces the local cache before the run (v1.2 Phase 2
 * review fixes). Two cases used to re-bill work the cache already held:
 *
 *   - An interrupted run (Ctrl-C, a crash, a closed terminal). Every
 *     docstring file and commit is committed to the cache as soon as it
 *     is extracted, but atlas.json is written only at Stage 7. The next
 *     run imported the old atlas.json over the cache and paid for all of
 *     that work again. Now a run records, in the cache-only `_meta`
 *     table, the SHA-256 of the atlas.json it started from and clears
 *     the mark when it finishes. When the next run finds the mark and
 *     atlas.json is byte-identical to what that run started from, the
 *     cache is atlas.json plus the unsaved work, so it is kept and the
 *     run resumes (and must export). When atlas.json changed since (a
 *     pull, a branch switch, a Skill run), it is imported as before:
 *     atlas.json is the source of truth when it is committed (ADR-06).
 *   - `atlas.committed: false` with an atlas.json left over from the
 *     committed workflow. The pipeline imported it on every run but never
 *     exported, so every run re-extracted everything newer than the
 *     leftover file. With `committed: false` the local cache is the
 *     source of truth: atlas.json only seeds an empty cache, as the MCP
 *     server does, and is otherwise ignored with a warning.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { log } from "../mcp/logger.js";
import { importAtlas } from "../storage/atlas-importer.js";
import {
  deleteCacheMeta,
  getCacheMeta,
  isCacheEmpty,
  setCacheMeta,
} from "../storage/cache-meta.js";
import type { DatabaseInstance } from "../storage/db.js";
import type { AtlasFileV1 } from "../storage/types.js";

/**
 * `_meta` key: SHA-256 of the atlas.json an `index` run imported (or
 * resumed from) and has not finished with. Absent between runs.
 */
export const RUN_IN_PROGRESS_KEY = "index.unfinished_run_atlas_sha256";

export interface AtlasBaselineInput {
  atlasAbsPath: string;
  /** `config.atlas.committed`. */
  committed: boolean;
}

export interface AtlasBaseline {
  /** atlas.json was imported into the cache this run. */
  imported: boolean;
  /**
   * The cache was kept because the previous run did not finish and
   * atlas.json has not changed since it started. The run must export
   * even if it changes nothing itself: the cache holds work atlas.json
   * lacks.
   */
  resumed: boolean;
}

/**
 * Load the run's baseline into the cache (see the module header). Throws
 * only when atlas.json cannot be read or parsed, as the import always
 * did.
 */
export function loadAtlasBaseline(
  db: DatabaseInstance,
  input: AtlasBaselineInput,
): AtlasBaseline {
  const { atlasAbsPath } = input;
  const exists = existsSync(atlasAbsPath);

  if (!input.committed) {
    // The cache is authoritative; the resume mark is not used.
    deleteCacheMeta(db, RUN_IN_PROGRESS_KEY);
    if (!exists) return { imported: false, resumed: false };
    if (isCacheEmpty(db)) {
      log.info(
        "pipeline: atlas.committed is false; seeding the empty local cache from atlas.json",
        { path: atlasAbsPath },
      );
      importAtlas(db, parseAtlas(readFileSync(atlasAbsPath)));
      return { imported: true, resumed: false };
    }
    log.warn(
      `pipeline: atlas.committed is false, so the local cache is the source ` +
        `of truth; ignoring ${atlasAbsPath}. It is not updated by this run. ` +
        "Delete it if it is left over from atlas.committed: true, or set " +
        "atlas.committed: true to work from the committed atlas again.",
      { path: atlasAbsPath },
    );
    return { imported: false, resumed: false };
  }

  if (!exists) {
    // No committed baseline: the cache is the baseline, as always.
    deleteCacheMeta(db, RUN_IN_PROGRESS_KEY);
    return { imported: false, resumed: false };
  }

  const raw = readFileSync(atlasAbsPath);
  const hash = createHash("sha256").update(raw).digest("hex");
  const unfinished = getCacheMeta(db, RUN_IN_PROGRESS_KEY);
  if (unfinished === hash) {
    log.info(
      "pipeline: resuming from the local cache: the previous `contextatlas " +
        "index` run stopped before it saved atlas.json, and atlas.json has " +
        "not changed since, so the work that run stored is kept and saved " +
        "by this run",
      { path: atlasAbsPath },
    );
    return { imported: false, resumed: true };
  }
  if (unfinished !== undefined) {
    log.warn(
      "pipeline: the previous `contextatlas index` run did not finish, and " +
        "atlas.json has changed since it started; importing atlas.json. " +
        "Work that run did not save is extracted again.",
      { path: atlasAbsPath },
    );
  }
  log.info("pipeline: importing committed atlas.json", { path: atlasAbsPath });
  importAtlas(db, parseAtlas(raw));
  setCacheMeta(db, RUN_IN_PROGRESS_KEY, hash);
  return { imported: true, resumed: false };
}

/**
 * Mark the run finished: atlas.json (when committed) now holds
 * everything the cache does, so the next run imports it again.
 */
export function markRunFinished(db: DatabaseInstance): void {
  deleteCacheMeta(db, RUN_IN_PROGRESS_KEY);
}

function parseAtlas(raw: Buffer): AtlasFileV1 {
  return JSON.parse(raw.toString("utf8")) as AtlasFileV1;
}
