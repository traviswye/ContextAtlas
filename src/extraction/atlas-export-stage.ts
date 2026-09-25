/**
 * Stage 7 of `runExtractionPipeline`: persist the generator and
 * staleness fields to `atlas_meta` and, when the atlas is committed,
 * regenerate atlas.json. The pipeline calls this only when the run
 * changed something, so a no-op run leaves atlas.json byte-identical
 * (ADR-12). Moved out of `pipeline.ts` at v1.2 Phase 2, unchanged.
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
  log.info("pipeline: atlas.json written", { path: input.atlasAbsPath });
  return true;
}
