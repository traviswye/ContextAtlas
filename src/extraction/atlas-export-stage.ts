/**
 * Stage 7 of `runExtractionPipeline`: persist the generator and
 * staleness fields to `atlas_meta` and, when the atlas is committed,
 * regenerate atlas.json. The pipeline calls this only when the run
 * changed something, so a no-op run leaves atlas.json byte-identical
 * (ADR-12). Moved out of `pipeline.ts` at v1.2 Phase 2.
 *
 * Checkpoint exports (v1.2 Phase 2, {@link createCheckpointer}): with
 * `atlas.committed: true` the run also writes atlas.json while it
 * extracts, so an interrupted run loses at most the paid work since the
 * last checkpoint. The next run imports that atlas.json at Stage 0 as
 * usual, and the SHA gates skip the units it holds; no cache-only state
 * is involved. Each checkpoint is the same export as Stage 7 over the
 * units stored so far (every unit is written in one transaction), with
 * one difference: it keeps the `extracted_at_sha` the run started from,
 * so a checkpoint never reads more current than the atlas did before
 * the run (only Stage 7 stamps HEAD).
 */

import { log } from "../mcp/logger.js";
import { ATLAS_META_KEYS } from "../storage/atlas-importer.js";
import { exportAtlasToFile } from "../storage/atlas-exporter.js";
import type { DatabaseInstance } from "../storage/db.js";
import { ATLAS_VERSION } from "../storage/types.js";

import { EXTRACTION_MODEL } from "./prompt.js";

export interface FinalizeAtlasInput {
  atlasAbsPath: string;
  /** `config.atlas.committed`: write atlas.json when true. */
  committed: boolean;
  contextatlasVersion: string | undefined;
  /** See `ExtractionPipelineDeps.contextatlasCommitSha`. */
  contextatlasCommitSha: string | null | undefined;
  /** Git HEAD at extraction time, or null outside a git tree. */
  headSha: string | null;
}

/** Update atlas_meta and export; returns whether atlas.json was written. */
export function finalizeAtlas(
  db: DatabaseInstance,
  input: FinalizeAtlasInput,
): boolean {
  const newGeneratedAt = new Date().toISOString();
  // Use EXTRACTION_MODEL (the model the extraction client actually
  // called) rather than config.index.model (which is forward-compat
  // config that today isn't consulted by the client). Atlas metadata
  // should reflect what code did, not what config declared.
  const extractionModel = EXTRACTION_MODEL;
  const contextatlasVer = input.contextatlasVersion ?? "0.0.0";

  // Persist ALL generator + staleness fields to atlas_meta. Without
  // this, exportAtlas would fall back to "unknown"/"0.0.0"/missing —
  // which is exactly the bug dogfooding caught for v1.0.
  const setMeta = db.prepare(
    "INSERT INTO atlas_meta (key, value) VALUES (?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  const deleteMeta = db.prepare("DELETE FROM atlas_meta WHERE key = ?");
  setMeta.run(ATLAS_META_KEYS.version, ATLAS_VERSION);
  setMeta.run(ATLAS_META_KEYS.generatedAt, newGeneratedAt);
  setMeta.run(ATLAS_META_KEYS.generatorExtractionModel, extractionModel);
  setMeta.run(ATLAS_META_KEYS.generatorContextatlasVersion, contextatlasVer);
  // contextatlas_commit_sha (atlas v1.3+) — null sentinel from the
  // caller means "explicitly absent" (e.g., binary not in a git
  // checkout); undefined means "fall back to stored value", matching
  // the exporter's null/undefined convention.
  if (
    input.contextatlasCommitSha !== undefined &&
    input.contextatlasCommitSha !== null
  ) {
    setMeta.run(
      ATLAS_META_KEYS.generatorContextatlasCommitSha,
      input.contextatlasCommitSha,
    );
  } else if (input.contextatlasCommitSha === null) {
    deleteMeta.run(ATLAS_META_KEYS.generatorContextatlasCommitSha);
  }
  if (input.headSha !== null) {
    setMeta.run(ATLAS_META_KEYS.extractedAtSha, input.headSha);
  } else {
    deleteMeta.run(ATLAS_META_KEYS.extractedAtSha);
  }

  if (!input.committed) return false;
  exportAtlasToFile(db, input.atlasAbsPath, {
    generatedAt: newGeneratedAt,
    contextatlasVersion: contextatlasVer,
    contextatlasCommitSha: input.contextatlasCommitSha ?? null,
    extractionModel,
    extractedAtSha: input.headSha ?? null,
  });
  // The caller logs the write: Stage 7 "atlas.json written", a checkpoint
  // its own line, so each export logs one info line.
  return true;
}

/**
 * Minimum time between two checkpoint exports inside a stream (lead
 * decision F7). Checked only when a unit has been stored: units differ
 * by 10x in duration (a prose batch takes about 30-90 s, a docstring
 * call about 3-8 s), so time bounds the paid work at risk better than a
 * unit count. An export of an 8 MB atlas takes about 60 ms.
 */
export const DEFAULT_CHECKPOINT_INTERVAL_MS = 30_000;

export interface CheckpointInput extends Omit<FinalizeAtlasInput, "headSha"> {
  /**
   * The `extracted_at_sha` the run started from (null when absent). A
   * checkpoint keeps it; only Stage 7 stamps the current HEAD.
   */
  extractedAtSha: string | null;
  /** See {@link DEFAULT_CHECKPOINT_INTERVAL_MS}; 0 exports after every unit. */
  intervalMs: number;
  /** Test seam: the clock. Default `Date.now`. */
  now?: () => number;
}

export interface Checkpointer {
  /**
   * A unit was stored (a prose file, a docstring file, a keyed commit):
   * exports when the interval has passed since the last export.
   */
  unitStored(): void;
  /** Exports now if any unit was stored since the last export. */
  flush(): void;
}

/**
 * Checkpoint exports for one run. Does nothing with `atlas.committed:
 * false` (every stored unit is already durable in the cache, the source
 * of truth) or while no unit is pending, so a run that stores nothing
 * never writes atlas.json before Stage 7. A failed export is logged
 * once as a warning and the run goes on (lead decision F7): the units
 * stay pending for the next checkpoint or Stage 7, which still fails
 * loudly.
 */
export function createCheckpointer(
  db: DatabaseInstance,
  input: CheckpointInput,
): Checkpointer {
  const now = input.now ?? Date.now;
  let pending = 0;
  let lastExport = now();
  let warned = false;

  const flush = (): void => {
    if (!input.committed || pending === 0) return;
    try {
      finalizeAtlas(db, {
        atlasAbsPath: input.atlasAbsPath,
        committed: input.committed,
        contextatlasVersion: input.contextatlasVersion,
        contextatlasCommitSha: input.contextatlasCommitSha,
        headSha: input.extractedAtSha,
      });
      log.info("pipeline: checkpoint: atlas.json holds the work stored so far", {
        unitsSinceLastCheckpoint: pending,
      });
      pending = 0;
    } catch (err) {
      if (!warned) {
        warned = true;
        log.warn(
          "pipeline: checkpoint export of atlas.json failed; the run goes on " +
            "and retries at the next checkpoint, and Stage 7 writes atlas.json " +
            "at the end. Until then an interruption loses the work since the " +
            "last successful checkpoint.",
          { path: input.atlasAbsPath, err: String(err) },
        );
      }
    }
    // Advanced on failure too: a failing export is not retried at every
    // unit boundary.
    lastExport = now();
  };

  return {
    unitStored(): void {
      pending++;
      if (now() - lastExport >= input.intervalMs) flush();
    },
    flush,
  };
}
