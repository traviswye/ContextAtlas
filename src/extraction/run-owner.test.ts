/**
 * The owner record of the unfinished-run mark (v1.2 Phase 2 review round
 * 2.3): lets the MCP server tell a running `index` from a dead one.
 */

import { spawnSync } from "node:child_process";
import { hostname } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setCacheMeta } from "../storage/cache-meta.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";

import {
  clearRunOwner,
  processExists,
  recordRunOwner,
  RUN_OWNER_KEY,
  unfinishedRunOwner,
} from "./run-owner.js";

describe("run-owner", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  it("processExists: true for this process, false for one that has exited", () => {
    expect(processExists(process.pid)).toBe(true);
    const child = spawnSync(process.execPath, ["-e", ""]);
    expect(child.status).toBe(0);
    expect(typeof child.pid).toBe("number");
    expect(processExists(child.pid!)).toBe(false);
  });

  it("the recorded owner is this process on this host, and alive", () => {
    recordRunOwner(db);
    expect(unfinishedRunOwner(db)).toEqual({
      state: "alive",
      owner: { pid: process.pid, host: hostname() },
    });
  });

  it("dead when the recorded process is gone", () => {
    setCacheMeta(db, RUN_OWNER_KEY, JSON.stringify({ pid: 4242, host: hostname() }));
    expect(unfinishedRunOwner(db, () => false)).toEqual({
      state: "dead",
      owner: { pid: 4242, host: hostname() },
    });
  });

  it("unknown without a usable record, or for another host", () => {
    expect(unfinishedRunOwner(db, () => false)).toEqual({ state: "unknown", owner: null });
    setCacheMeta(db, RUN_OWNER_KEY, "not json");
    expect(unfinishedRunOwner(db, () => false).state).toBe("unknown");
    setCacheMeta(db, RUN_OWNER_KEY, JSON.stringify({ pid: -1, host: hostname() }));
    expect(unfinishedRunOwner(db, () => false).state).toBe("unknown");
    setCacheMeta(db, RUN_OWNER_KEY, JSON.stringify({ pid: 4242, host: "other-machine" }));
    expect(unfinishedRunOwner(db, () => false)).toEqual({
      state: "unknown",
      owner: { pid: 4242, host: "other-machine" },
    });
    clearRunOwner(db);
    expect(unfinishedRunOwner(db).owner).toBeNull();
  });
});
