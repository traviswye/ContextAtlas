/**
 * The `contextatlas index` run lock (v1.2 Phase 5): one run at a time
 * per repository, so a hook-triggered Tier 0 run never writes the
 * shared cache while another `index` run does, and the MCP server can
 * defer an atlas reload until the run ends (ADR-12 2026-10-14
 * amendment, Phase 5 section).
 *
 * Two lock files under `.contextatlas/local/`, each created exclusively
 * (`wx`) and holding the owner's pid, host, mode and start time:
 *   - `index.lock` — held by the running `index` run;
 *   - `index.next` — held by at most one structural run waiting for
 *     `index.lock`. Further structural runs exit at once: the waiter
 *     reads the tree when it starts, so it covers their changes.
 *
 * A lock is stale, and taken over, when its owner is a process on this
 * host that no longer exists, when it is older than
 * {@link STALE_AFTER_MS} (an owner on another host sharing the
 * directory, or a reused pid), or when it cannot be parsed.
 */

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { resolve as pathResolve } from "node:path";

import { ensureLocalStateDir, localStateDir } from "./local-state.js";

export interface RunLockInfo {
  readonly pid: number;
  readonly host: string;
  readonly mode: string;
  readonly started_at: string;
}

/** A lock older than this is treated as abandoned. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export function runLockPath(configRoot: string): string {
  return pathResolve(localStateDir(configRoot), "index.lock");
}

export function waiterLockPath(configRoot: string): string {
  return pathResolve(localStateDir(configRoot), "index.next");
}

export type AcquireResult =
  | { readonly acquired: true; readonly release: () => void }
  | { readonly acquired: false; readonly holder: RunLockInfo };

/** Take `index.lock` for this process, replacing a stale one. */
export function acquireRunLock(
  configRoot: string,
  mode: string,
  now: Date = new Date(),
): AcquireResult {
  return acquireLockFile(configRoot, runLockPath(configRoot), mode, now);
}

/** Take the single waiter slot (`index.next`) for this process. */
export function acquireWaiterSlot(
  configRoot: string,
  mode: string,
  now: Date = new Date(),
): AcquireResult {
  return acquireLockFile(configRoot, waiterLockPath(configRoot), mode, now);
}

/**
 * Wait for `index.lock` while holding the waiter slot, polling every
 * `pollMs`. Resolves with the acquired lock (the slot is released), or
 * with the holder if `timeoutMs` passes first.
 */
export async function waitForRunLock(
  configRoot: string,
  mode: string,
  options: { pollMs?: number; timeoutMs?: number } = {},
): Promise<AcquireResult> {
  const pollMs = options.pollMs ?? 1000;
  const deadline = Date.now() + (options.timeoutMs ?? STALE_AFTER_MS);
  for (;;) {
    const result = acquireRunLock(configRoot, mode);
    if (result.acquired || Date.now() >= deadline) return result;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/** The live holder of `index.lock`, or null when it is free or stale. */
export function liveRunLock(configRoot: string, now: Date = new Date()): RunLockInfo | null {
  const holder = readLock(runLockPath(configRoot));
  return holder !== null && isLive(holder, now) ? holder : null;
}

function acquireLockFile(
  configRoot: string,
  path: string,
  mode: string,
  now: Date,
): AcquireResult {
  ensureLocalStateDir(configRoot);
  const info: RunLockInfo = {
    pid: process.pid,
    host: hostname(),
    mode,
    started_at: now.toISOString(),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(path, JSON.stringify(info) + "\n", { flag: "wx" });
      let released = false;
      return {
        acquired: true,
        release: () => {
          if (released) return;
          released = true;
          if (readLock(path)?.pid === process.pid) rmSync(path, { force: true });
        },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    const holder = readLock(path);
    if (holder !== null && isLive(holder, now)) return { acquired: false, holder };
    rmSync(path, { force: true });
  }
  const holder = readLock(path);
  if (holder !== null) return { acquired: false, holder };
  throw new Error(
    `Could not create the lock file ${path}. Check that .contextatlas/local/ is writable.`,
  );
}

function readLock(path: string): RunLockInfo | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as RunLockInfo;
    return typeof parsed?.pid === "number" && typeof parsed.started_at === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function isLive(holder: RunLockInfo, now: Date): boolean {
  const age = now.getTime() - Date.parse(holder.started_at);
  if (!Number.isFinite(age) || age > STALE_AFTER_MS) return false;
  if (holder.host !== hostname()) return true;
  if (holder.pid === process.pid) return true;
  try {
    process.kill(holder.pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to another user.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
