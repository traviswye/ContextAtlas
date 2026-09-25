/**
 * Prose and docstring units to extract again on the next run (v1.2
 * Phase 2 review round 2.3).
 *
 * A prose or docstring unit whose extraction fails keeps its previous
 * claims and key, and the next run retries it (L-10 (i)): the key still
 * names the old content, so the SHA gate sees the file as changed. Under
 * `index --full` that is not so. `--full` re-extracts files whose key
 * already equals their current SHA, so after a failure the next plain
 * `index` saw nothing to do, made no call and exited 0, while the error
 * message promised a retry. The only way back was another `--full` over
 * every file.
 *
 * Every failed prose or docstring unit is therefore recorded here, in
 * the cache-only `_meta` table, and the next run extracts it whatever
 * its key says; a unit that succeeds is removed. The list is local to
 * this cache, like the other `_meta` state: a fresh clone does not
 * retry another machine's failures.
 */

import { deleteCacheMeta, getCacheMeta, setCacheMeta } from "../storage/cache-meta.js";
import type { DatabaseInstance } from "../storage/db.js";

import type { ShaDiff } from "./file-walker.js";

/** `_meta` key: JSON array of source keys (relPaths) to extract again. */
export const RETRY_SOURCE_KEYS_KEY = "index.retry_source_keys";

/** The recorded keys. */
export function listRetryKeys(db: DatabaseInstance): Set<string> {
  const raw = getCacheMeta(db, RETRY_SOURCE_KEYS_KEY);
  if (raw === undefined) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    return new Set(Array.isArray(value) ? value.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

/** A unit failed: extract it on the next run. */
export function markForRetry(db: DatabaseInstance, key: string): void {
  const keys = listRetryKeys(db);
  if (keys.has(key)) return;
  keys.add(key);
  save(db, keys);
}

/** A unit succeeded: drop it from the list. */
export function clearRetry(db: DatabaseInstance, key: string): void {
  const keys = listRetryKeys(db);
  if (!keys.delete(key)) return;
  save(db, keys);
}

/**
 * Keep only keys the run still walks (a deleted or no longer walked
 * file has nothing to retry). Returns the kept set.
 */
export function pruneRetryKeys(
  db: DatabaseInstance,
  walked: (key: string) => boolean,
): Set<string> {
  const keys = listRetryKeys(db);
  const kept = new Set([...keys].filter(walked));
  if (kept.size !== keys.size) save(db, kept);
  return kept;
}

/**
 * The prose diff with every unchanged file on the retry list moved to
 * `changed`, so the prose stream extracts it again.
 */
export function withRetries(diff: ShaDiff, retry: ReadonlySet<string>): ShaDiff {
  if (retry.size === 0) return diff;
  const forced = diff.unchanged.filter((f) => retry.has(f.relPath));
  if (forced.length === 0) return diff;
  return {
    ...diff,
    unchanged: diff.unchanged.filter((f) => !retry.has(f.relPath)),
    changed: [...diff.changed, ...forced],
  };
}

function save(db: DatabaseInstance, keys: ReadonlySet<string>): void {
  if (keys.size === 0) {
    deleteCacheMeta(db, RETRY_SOURCE_KEYS_KEY);
    return;
  }
  setCacheMeta(db, RETRY_SOURCE_KEYS_KEY, JSON.stringify([...keys].sort()));
}
