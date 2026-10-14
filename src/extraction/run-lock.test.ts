import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  STALE_AFTER_MS,
  acquireRunLock,
  acquireWaiterSlot,
  liveRunLock,
  runLockPath,
  waitForRunLock,
} from "./run-lock.js";

describe("run lock (v1.2 Phase 5)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(pathJoin(tmpdir(), "ca-run-lock-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const writeLock = (info: object) => {
    mkdirSync(pathJoin(root, ".contextatlas", "local"), { recursive: true });
    writeFileSync(runLockPath(root), JSON.stringify(info));
  };

  it("acquires, reports the holder to a second taker, and releases", () => {
    const first = acquireRunLock(root, "incremental");
    expect(first.acquired).toBe(true);
    expect(liveRunLock(root)?.pid).toBe(process.pid);
    const second = acquireRunLock(root, "structural");
    expect(second.acquired).toBe(false);
    if (!second.acquired) expect(second.holder.mode).toBe("incremental");
    if (first.acquired) first.release();
    expect(existsSync(runLockPath(root))).toBe(false);
    expect(liveRunLock(root)).toBeNull();
  });

  it("takes over a lock whose process is gone, one that is too old, and an unreadable one", () => {
    for (const stale of [
      { pid: 2 ** 30, host: hostname(), mode: "full", started_at: new Date().toISOString() },
      { pid: process.pid, host: "elsewhere", mode: "full", started_at: new Date(Date.now() - STALE_AFTER_MS - 1).toISOString() },
      { nonsense: true },
    ]) {
      writeLock(stale);
      const result = acquireRunLock(root, "incremental");
      expect(result.acquired).toBe(true);
      if (result.acquired) result.release();
    }
  });

  it("treats a recent lock from another host as live", () => {
    writeLock({ pid: 1, host: "elsewhere", mode: "full", started_at: new Date().toISOString() });
    expect(acquireRunLock(root, "structural").acquired).toBe(false);
  });

  it("allows one waiter; the waiter gets the lock once it is released", async () => {
    const held = acquireRunLock(root, "full");
    const slot = acquireWaiterSlot(root, "structural");
    expect(slot.acquired).toBe(true);
    expect(acquireWaiterSlot(root, "structural").acquired).toBe(false);
    const waiting = waitForRunLock(root, "structural", { pollMs: 10 });
    setTimeout(() => {
      if (held.acquired) held.release();
    }, 50);
    const got = await waiting;
    expect(got.acquired).toBe(true);
    expect(liveRunLock(root)?.mode).toBe("structural");
    if (got.acquired) got.release();
    if (slot.acquired) slot.release();
  });

  it("a wait gives up at its timeout and returns the holder", async () => {
    const held = acquireRunLock(root, "full");
    const got = await waitForRunLock(root, "structural", { pollMs: 5, timeoutMs: 30 });
    expect(got.acquired).toBe(false);
    if (held.acquired) held.release();
  });
});
