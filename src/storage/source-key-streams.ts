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
