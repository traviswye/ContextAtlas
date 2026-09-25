/**
 * Which stream last keyed a source path, and at which SHA (v1.2 Phase 2
 * review fix; migration 7). Cache-only: never exported to atlas.json,
 * never cleared by the atlas importer.
 *
 * The prose stream (ADRs, `docs.include`) and the docstring stream
 * (source files) both key a file by its relPath at the same file SHA.
 * A key with claims is classified by the claims' `source` prefix; a key
 * with no claims used to fall back to `docs.include` membership or the
 * path's extension, so a zero-claim key written by one stream looked
 * "unchanged" to the other after `docs.include` changed, and the file
 * was never extracted again. The writers record their stream here, and
 * classification consults it (`classifySourceKeys` in
 * `extraction/source-keys.ts`) when the key still holds the recorded
 * SHA.
 *
 * Coverage is this machine's local cache only: a fresh clone has no
 * rows and classifies zero-claim keys as before.
 *
 * The rows describe keys this cache wrote on top of one atlas.json. When
 * `contextatlas index` imports a different atlas.json (a pull, a branch
 * switch, a Skill run), another writer may have re-keyed a path at the
 * same SHA, which the SHA check cannot see, so the rows are dropped
 * ({@link clearSourceKeyStreams}) and classification falls back to the
 * fresh-clone rules (review round 2; `atlas-baseline.ts`).
 *
 * A run changes rows as it goes (Stage 5 drops a deleted key's row; a
 * stream re-keying a path replaces it), but writes atlas.json only at
 * Stage 7. So each run saves the rows as they stood after its Stage 0
 * import ({@link saveRunStartKeyStreams}, migration 8), and a resume
 * after an interrupted run restores that copy with the re-imported
 * atlas.json ({@link restoreRunStartKeyStreams}; review round 2.2).
 */

import type { DatabaseInstance } from "./db.js";

/** The streams that key source paths by relPath. */
export type KeyedStream = "prose" | "docstring";

export interface SourceKeyStream {
  readonly stream: KeyedStream;
  /** The key's value when the stream wrote it. */
  readonly sha: string;
}

/** Record that `stream` keyed `sourcePath` at `sha` (insert or replace). */
export function recordSourceKeyStream(
  db: DatabaseInstance,
  sourcePath: string,
  stream: KeyedStream,
  sha: string,
): void {
  db.prepare(
    `INSERT INTO source_key_streams (source_path, stream, source_sha)
     VALUES (?, ?, ?)
     ON CONFLICT(source_path) DO UPDATE SET
       stream = excluded.stream, source_sha = excluded.source_sha`,
  ).run(sourcePath, stream, sha);
}

/** Every recorded key, by source path. Unknown stream values are skipped. */
export function listSourceKeyStreams(
  db: DatabaseInstance,
): Map<string, SourceKeyStream> {
  const rows = db
    .prepare("SELECT source_path, stream, source_sha FROM source_key_streams")
    .all() as Array<{ source_path: string; stream: string; source_sha: string }>;
  const out = new Map<string, SourceKeyStream>();
  for (const r of rows) {
    if (r.stream !== "prose" && r.stream !== "docstring") continue;
    out.set(r.source_path, { stream: r.stream, sha: r.source_sha });
  }
  return out;
}

/** Forget one path's record (no-op when absent). */
export function deleteSourceKeyStream(
  db: DatabaseInstance,
  sourcePath: string,
): void {
  db.prepare("DELETE FROM source_key_streams WHERE source_path = ?").run(
    sourcePath,
  );
}

/** Forget every record (a different atlas.json was imported). */
export function clearSourceKeyStreams(db: DatabaseInstance): void {
  db.exec("DELETE FROM source_key_streams;");
}

/**
 * Save the current rows as the run-start copy (replacing any earlier
 * copy). Called by Stage 0 when a run starts from a freshly imported
 * atlas.json.
 */
export function saveRunStartKeyStreams(db: DatabaseInstance): void {
  db.exec(
    "DELETE FROM source_key_streams_run_start; " +
      "INSERT INTO source_key_streams_run_start (source_path, stream, source_sha) " +
      "SELECT source_path, stream, source_sha FROM source_key_streams;",
  );
}

/**
 * Replace the current rows with the run-start copy: what an interrupted
 * run changed is undone, as its claims and keys are by the re-import.
 */
export function restoreRunStartKeyStreams(db: DatabaseInstance): void {
  db.exec(
    "DELETE FROM source_key_streams; " +
      "INSERT INTO source_key_streams (source_path, stream, source_sha) " +
      "SELECT source_path, stream, source_sha FROM source_key_streams_run_start;",
  );
}

/** Drop the run-start copy (the run finished, or there is none to resume). */
export function clearRunStartKeyStreams(db: DatabaseInstance): void {
  db.exec("DELETE FROM source_key_streams_run_start;");
}
