/**
 * Stage 0 of `runExtractionPipeline`: load the run's baseline into the
 * local cache (v1.2 Phase 2 review fixes, rounds 1, 2 and 2.2).
 *
 *   - `atlas.committed: true` with an atlas.json: it is imported over the
 *     cache on every run (ADR-06: the committed atlas is the source of
 *     truth). One addition: an unfinished run. A run stores each unit it
 *     extracts in the cache straight away but writes atlas.json only at
 *     Stage 7, so a Ctrl-C or a crash used to cost all of that work again.
 *     A run records, in the cache-only `_meta` table, the SHA-256 of the
 *     atlas.json it started from and clears the mark when it finishes.
 *     When the next run finds the mark and atlas.json is byte-identical,
 *     the units the unfinished run stored are carried over the import
 *     (`unsaved-work.ts`): additive only, so nothing that run deleted or
 *     pruned against its own tree survives; a commit is carried only
 *     when the current HEAD reaches it, and a file's unit only while the
 *     working tree still has that content (round 2.2). The
 *     `source_key_streams` records are rolled back with the import to
 *     their state when the unfinished run started (round 2.2). A resumed
 *     run always exports.
 *   - `atlas.committed: true` without an atlas.json: the cache is the
 *     baseline, and the run must write atlas.json even if it changes
 *     nothing (it was deleted, or the atlas was kept uncommitted until
 *     now). Commits the cache extracted on another branch are dropped
 *     first (`foreign-commits.ts`, round 2.2).
 *   - `atlas.committed: false`: the local cache is the source of truth.
 *     atlas.json only seeds an empty cache (the MCP server and the init
 *     smoke test use the same `isCacheEmpty` rule) and is otherwise
 *     ignored with a warning.
 *
 * Every import of an atlas.json this cache did not write or import last
 * also drops the cache-only `source_key_streams` records (round 2): they
 * describe keys this cache wrote, and another writer may have re-keyed a
 * path at the same SHA. A run that changes the cache without importing
 * atlas.json (`committed: false`, or no atlas.json) drops the record of
 * which atlas.json the cache holds (round 2.3), so the next import, and
 * the MCP server's startup check, treat the cache as holding none.
 *
 * The unfinished-run mark names the process that set it
 * (`run-owner.ts`, round 2.3), so the MCP server can tell a live run
 * from a dead one.
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
import {
  clearRunStartKeyStreams,
  clearSourceKeyStreams,
  restoreRunStartKeyStreams,
  saveRunStartKeyStreams,
} from "../storage/source-key-streams.js";
import type { AtlasFileV1 } from "../storage/types.js";

import { dropUnreachableCommits } from "./foreign-commits.js";
import type { CommitReachability } from "./git-extractor.js";
import { clearRunOwner, recordRunOwner } from "./run-owner.js";
import { restoreUnsavedWork, snapshotUnsavedWork } from "./unsaved-work.js";

/**
 * `_meta` key: SHA-256 of the atlas.json an `index` run imported (or
 * resumed from) and has not finished with. Absent between runs.
 */
export const RUN_IN_PROGRESS_KEY = "index.unfinished_run_atlas_sha256";

/**
 * `_meta` key: SHA-256 of the atlas.json the `source_key_streams`
 * records were written on top of (the last one this cache imported or
 * wrote).
 */
export const KEY_STREAMS_ATLAS_KEY = "index.key_streams_atlas_sha256";

/**
 * `_meta` key: SHA-256 of the atlas.json whose import the run-start copy
 * of the `source_key_streams` records follows (round 2.2). A resume
 * restores the copy only when this matches.
 */
export const RUN_START_KEY_STREAMS_KEY = "index.run_start_key_streams_atlas_sha256";

export interface AtlasBaselineInput {
  atlasAbsPath: string;
  /** `config.atlas.committed`. */
  committed: boolean;
  /**
   * Where a commit (by sha) stands relative to the current HEAD. A
   * resumed run carries over only "reachable" commits; with no
   * atlas.json, "unreachable" ones are dropped from the cache. Omitted:
   * every commit is "unknown" (none carried, none dropped).
   */
  commitReachability?: (sha: string) => CommitReachability;
  /**
   * Whether the file a prose or docstring key names has `sha` in the
   * working tree now. A resumed run carries over only such units.
   * Omitted: none are.
   */
  isSourceCurrent?: (key: string, sha: string) => boolean;
}

export interface AtlasBaseline {
  /** atlas.json was imported into the cache this run. */
  imported: boolean;
  /**
   * The previous run did not finish, atlas.json has not changed since it
   * started, and the units it stored were carried over the import.
   */
  resumed: boolean;
  /**
   * Stage 7 must write atlas.json even if this run changes nothing: the
   * cache holds work atlas.json lacks (a resume), or `atlas.committed` is
   * true and there is no atlas.json.
   */
  mustExport: boolean;
}

/**
 * Load the run's baseline into the cache (see the module header). Throws
 * only when atlas.json cannot be read, parsed or imported, as the import
 * always did.
 */
export function loadAtlasBaseline(
  db: DatabaseInstance,
  input: AtlasBaselineInput,
): AtlasBaseline {
  const { atlasAbsPath } = input;
  const exists = existsSync(atlasAbsPath);
  const reachability = input.commitReachability ?? (() => "unknown" as const);

  if (!input.committed) {
    // The cache is authoritative; the resume mark is not used.
    clearRunMark(db);
    const seeded = exists && isCacheEmpty(db);
    if (seeded) {
      log.info(
        "pipeline: atlas.committed is false; seeding the empty local cache from atlas.json",
        { path: atlasAbsPath },
      );
      const raw = readFileSync(atlasAbsPath);
      db.transaction(() => {
        importAtlas(db, parseAtlas(raw));
        adoptAtlas(db, atlasFileSha256(raw));
      })();
    } else if (exists) {
      log.warn(
        `pipeline: atlas.committed is false, so the local cache is the source ` +
          `of truth; ignoring ${atlasAbsPath}. It is not updated by this run. ` +
          "Delete it if it is left over from atlas.committed: true, or set " +
          "atlas.committed: true to work from the committed atlas again.",
        { path: atlasAbsPath },
      );
    }
    // This run changes the cache and writes no atlas.json (round 2.3).
    deleteCacheMeta(db, KEY_STREAMS_ATLAS_KEY);
    return { imported: seeded, resumed: false, mustExport: false };
  }

  if (!exists) {
    // No committed baseline: the cache is the baseline, as always, and
    // this run writes atlas.json. The cache outlives a branch switch, so
    // it can hold commits of another branch; those must not reach this
    // branch's atlas.json (round 2.2). Until Stage 7 writes it, the
    // cache holds no atlas.json (round 2.3: a crashed run followed by a
    // checkout of the old file must not look in sync).
    clearRunMark(db);
    deleteCacheMeta(db, KEY_STREAMS_ATLAS_KEY);
    const dropped = dropUnreachableCommits(db, reachability);
    if (dropped > 0) {
      log.info(
        `pipeline: no atlas.json; leaving out ${dropped} commit(s) the local ` +
          "cache extracted that the current HEAD does not reach (another branch)",
        { path: atlasAbsPath },
      );
    }
    return { imported: false, resumed: false, mustExport: true };
  }

  const raw = readFileSync(atlasAbsPath);
  const hash = atlasFileSha256(raw);
  const atlas = parseAtlas(raw);
  const unfinished = getCacheMeta(db, RUN_IN_PROGRESS_KEY);
  const resuming = unfinished === hash;
  const unsaved = resuming
    ? snapshotUnsavedWork(db, atlas.source_shas ?? {}, {
        isCommitReachable: (sha) => reachability(sha) === "reachable",
        isSourceCurrent: input.isSourceCurrent ?? (() => false),
      })
    : null;
  if (unfinished !== undefined && !resuming) {
    log.warn(
      "pipeline: the previous `contextatlas index` run did not finish, and " +
        "atlas.json has changed since it started; importing atlas.json. " +
        "Work that run did not save is extracted again.",
      { path: atlasAbsPath },
    );
  }

  log.info("pipeline: importing committed atlas.json", { path: atlasAbsPath });
  db.transaction(() => {
    importAtlas(db, atlas);
    adoptAtlas(db, hash);
    if (unsaved !== null) {
      // The records go back to what they were when the unfinished run
      // started, as its claims and keys just did; a carried unit brings
      // its own record back.
      if (getCacheMeta(db, RUN_START_KEY_STREAMS_KEY) === hash) {
        restoreRunStartKeyStreams(db);
      } else {
        clearSourceKeyStreams(db);
      }
      restoreUnsavedWork(db, unsaved);
    } else {
      saveRunStartKeyStreams(db);
      setCacheMeta(db, RUN_START_KEY_STREAMS_KEY, hash);
    }
    setCacheMeta(db, RUN_IN_PROGRESS_KEY, hash);
    recordRunOwner(db);
  })();

  const resumed = unsaved !== null && unsaved.units.length > 0;
  if (resumed) {
    log.info(
      `pipeline: resuming: the previous \`contextatlas index\` run stopped ` +
        `before it saved atlas.json; keeping the ${unsaved.units.length} ` +
        "source(s) it extracted, which this run saves",
      { path: atlasAbsPath, commitsLeftOut: unsaved.commitsLeftOut },
    );
  }
  if (unsaved !== null && unsaved.commitsLeftOut > 0) {
    log.info(
      `pipeline: not keeping ${unsaved.commitsLeftOut} commit(s) the ` +
        "unfinished run extracted that the current HEAD does not reach " +
        "(another branch)",
    );
  }
  if (unsaved !== null && unsaved.sourcesLeftOut > 0) {
    log.info(
      `pipeline: not keeping ${unsaved.sourcesLeftOut} source(s) the ` +
        "unfinished run extracted whose content the working tree no " +
        "longer has (reverted, switched away or deleted)",
    );
  }
  return { imported: true, resumed, mustExport: resumed };
}

/**
 * Mark the run finished: atlas.json (when committed) now holds
 * everything the cache does, so the next run imports it again. The MCP
 * server also uses it to drop a dead run's mark when it re-imports a
 * changed atlas.json over that run's work (round 2.3).
 */
export function markRunFinished(db: DatabaseInstance): void {
  clearRunMark(db);
}

/**
 * Record that Stage 7 wrote `atlasText` to atlas.json: the
 * `source_key_streams` records now describe that file, so the next run's
 * import of it keeps them.
 */
export function recordAtlasWritten(
  db: DatabaseInstance,
  atlasText: string,
): void {
  setCacheMeta(db, KEY_STREAMS_ATLAS_KEY, atlasFileSha256(Buffer.from(atlasText, "utf8")));
}

/**
 * The cache now holds the atlas.json with SHA-256 `hash` (imported or
 * seeded). Records written on top of another file are dropped. Also used
 * by the MCP server's startup import (`server-cache-load.ts`).
 */
export function adoptAtlas(db: DatabaseInstance, hash: string): void {
  if (getCacheMeta(db, KEY_STREAMS_ATLAS_KEY) === hash) return;
  clearSourceKeyStreams(db);
  setCacheMeta(db, KEY_STREAMS_ATLAS_KEY, hash);
}

/** SHA-256 (hex) of an atlas.json file's bytes. */
export function atlasFileSha256(raw: Buffer): string {
  return createHash("sha256").update(raw).digest("hex");
}

function clearRunMark(db: DatabaseInstance): void {
  deleteCacheMeta(db, RUN_IN_PROGRESS_KEY);
  clearRunOwner(db);
  deleteCacheMeta(db, RUN_START_KEY_STREAMS_KEY);
  clearRunStartKeyStreams(db);
}

function parseAtlas(raw: Buffer): AtlasFileV1 {
  return JSON.parse(raw.toString("utf8")) as AtlasFileV1;
}
