/**
 * Which process set the unfinished-run mark (v1.2 Phase 2 review round
 * 2.3).
 *
 * Stage 0 of an `index` run sets the cache-only mark
 * `index.unfinished_run_atlas_sha256` and Stage 7 clears it. The MCP
 * server holds off re-importing a changed atlas.json while the mark is
 * set, so it does not replace a cache a running `index` is writing to.
 * A run that died (Ctrl-C after the cost preview, a crash, the prose
 * all-failed throw) never clears the mark, and the server used to keep
 * serving the old cache on every start. The mark now names its owner,
 * `{pid, host}`, so the server can tell a live run from a dead one.
 *
 * The check is `process.kill(pid, 0)`, which works on Windows too. A
 * recycled pid makes a dead run look alive; the server's warning then
 * names the way out (delete the local cache). A mark from another host
 * (a cache on a shared drive) or with no owner record cannot be checked
 * and counts as live.
 */

import { hostname } from "node:os";

import { deleteCacheMeta, getCacheMeta, setCacheMeta } from "../storage/cache-meta.js";
import type { DatabaseInstance } from "../storage/db.js";

/** `_meta` key: JSON `{pid, host}` of the run that set the mark. */
export const RUN_OWNER_KEY = "index.unfinished_run_owner";

export interface RunOwner {
  readonly pid: number;
  readonly host: string;
}

/** What is known about the process behind an unfinished-run mark. */
export type RunOwnerState =
  /** The recorded process still exists on this host. */
  | { readonly state: "alive"; readonly owner: RunOwner }
  /** The recorded process no longer exists on this host. */
  | { readonly state: "dead"; readonly owner: RunOwner }
  /** No usable record, or the run was on another host. */
  | { readonly state: "unknown"; readonly owner: RunOwner | null };

/** Record the current process as the owner of the mark. */
export function recordRunOwner(db: DatabaseInstance): void {
  const owner: RunOwner = { pid: process.pid, host: hostname() };
  setCacheMeta(db, RUN_OWNER_KEY, JSON.stringify(owner));
}

/** Drop the owner record (with the mark). */
export function clearRunOwner(db: DatabaseInstance): void {
  deleteCacheMeta(db, RUN_OWNER_KEY);
}

/**
 * Classify the owner of the unfinished-run mark. `isProcessAlive`
 * defaults to {@link processExists}; tests inject it.
 */
export function unfinishedRunOwner(
  db: DatabaseInstance,
  isProcessAlive: (pid: number) => boolean = processExists,
): RunOwnerState {
  const owner = parseOwner(getCacheMeta(db, RUN_OWNER_KEY));
  if (owner === null) return { state: "unknown", owner: null };
  if (owner.host !== hostname()) return { state: "unknown", owner };
  return isProcessAlive(owner.pid) ? { state: "alive", owner } : { state: "dead", owner };
}

/**
 * Whether a process with this pid exists. EPERM (it exists, owned by
 * another user) counts as existing.
 */
export function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function parseOwner(raw: string | undefined): RunOwner | null {
  if (raw === undefined) return null;
  try {
    const value = JSON.parse(raw) as Partial<RunOwner>;
    if (typeof value.pid !== "number" || !Number.isInteger(value.pid) || value.pid <= 0) {
      return null;
    }
    if (typeof value.host !== "string") return null;
    return { pid: value.pid, host: value.host };
  } catch {
    return null;
  }
}
