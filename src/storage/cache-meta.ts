/**
 * Cache-only bookkeeping in the `_meta` table (v1.2 Phase 2 review
 * fixes). `_meta` already holds the schema version; it is never
 * exported to atlas.json and never cleared by the atlas importer, so a
 * value stored here survives the Stage 0 re-import of atlas.json.
 *
 * Only small key/value facts about the local cache itself belong here
 * (for example, "an `index` run started from this atlas.json and has
 * not finished"). Anything that describes the atlas belongs in
 * `atlas_meta`, which round-trips through atlas.json.
 */

import type { DatabaseInstance } from "./db.js";

/** Read one cache-only value; undefined when unset. */
export function getCacheMeta(
  db: DatabaseInstance,
  key: string,
): string | undefined {
  const row = db
    .prepare("SELECT value FROM _meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

/** Set one cache-only value (insert or replace). */
export function setCacheMeta(
  db: DatabaseInstance,
  key: string,
  value: string,
): void {
  db.prepare(
    "INSERT INTO _meta (key, value) VALUES (?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

/** Remove one cache-only value (no-op when unset). */
export function deleteCacheMeta(db: DatabaseInstance, key: string): void {
  db.prepare("DELETE FROM _meta WHERE key = ?").run(key);
}

/**
 * Whether the cache holds no atlas content: no symbols, no claims and
 * no source keys. A cache that has only git commits or atlas_meta rows
 * is still empty in this sense.
 */
export function isCacheEmpty(db: DatabaseInstance): boolean {
  const row = db
    .prepare(
      "SELECT EXISTS (SELECT 1 FROM symbols) OR " +
        "EXISTS (SELECT 1 FROM claims) OR " +
        "EXISTS (SELECT 1 FROM source_shas) AS has_content",
    )
    .get() as { has_content: number };
  return row.has_content === 0;
}
