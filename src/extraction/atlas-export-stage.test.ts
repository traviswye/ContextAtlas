/**
 * Checkpoint exports (v1.2 Phase 2, `createCheckpointer`): the
 * in-memory policy that decides when `contextatlas index` writes
 * atlas.json during a run. Pipeline-level behaviour (what an interrupted
 * run leaves, what the next run bills) is in `pipeline-streams.test.ts`.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setSourceSha } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import type { AtlasFileV1 } from "../storage/types.js";

import { createCheckpointer, type CheckpointInput } from "./atlas-export-stage.js";

describe("createCheckpointer", () => {
  let tmp: string;
  let db: DatabaseInstance;
  let clock: number;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-checkpoint-"));
    db = openDatabase(":memory:");
    clock = 1_000_000;
  });
  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  const atlasPath = () => pathJoin(tmp, "atlas.json");
  const readAtlas = () => JSON.parse(readFileSync(atlasPath(), "utf8")) as AtlasFileV1;
  const input = (extra: Partial<CheckpointInput> = {}): CheckpointInput => ({
    atlasAbsPath: atlasPath(),
    committed: true,
    contextatlasVersion: "1.2.0-test",
    contextatlasCommitSha: null,
    extractedAtSha: "a".repeat(40),
    intervalMs: 30_000,
    now: () => clock,
    ...extra,
  });

  it("exports nothing before the interval has passed, then exports on the next stored unit", () => {
    const cp = createCheckpointer(db, input());
    setSourceSha(db, "src/a.ts", "sha-a");
    clock += 29_999;
    cp.unitStored();
    expect(existsSync(atlasPath())).toBe(false);

    setSourceSha(db, "src/b.ts", "sha-b");
    clock += 1;
    cp.unitStored();
    expect(readAtlas().source_shas).toEqual({ "src/a.ts": "sha-a", "src/b.ts": "sha-b" });
  });

  it("the interval counts from creation, not from zero: the first unit does not export at once", () => {
    const cp = createCheckpointer(db, input());
    cp.unitStored();
    expect(existsSync(atlasPath())).toBe(false);
  });

  it("interval 0 exports after every stored unit", () => {
    const cp = createCheckpointer(db, input({ intervalMs: 0 }));
    setSourceSha(db, "src/a.ts", "sha-a");
    cp.unitStored();
    expect(Object.keys(readAtlas().source_shas)).toEqual(["src/a.ts"]);
  });

  it("flush exports the pending units, and is a no-op with nothing pending", () => {
    const cp = createCheckpointer(db, input());
    cp.flush();
    expect(existsSync(atlasPath())).toBe(false);

    setSourceSha(db, "src/a.ts", "sha-a");
    cp.unitStored();
    cp.flush();
    const first = statSync(atlasPath()).mtimeMs;
    const text = readFileSync(atlasPath(), "utf8");
    cp.flush(); // nothing new since
    expect(statSync(atlasPath()).mtimeMs).toBe(first);
    expect(readFileSync(atlasPath(), "utf8")).toBe(text);
  });

  it("keeps the extracted_at_sha the run started from, and omits it when there was none", () => {
    setSourceSha(db, "src/a.ts", "sha-a");
    const cp = createCheckpointer(db, input({ intervalMs: 0 }));
    cp.unitStored();
    expect(readAtlas().extracted_at_sha).toBe("a".repeat(40));

    const cp2 = createCheckpointer(db, input({ intervalMs: 0, extractedAtSha: null }));
    cp2.unitStored();
    expect(readAtlas().extracted_at_sha).toBeUndefined();
  });

  it("atlas.committed: false never exports", () => {
    const cp = createCheckpointer(db, input({ committed: false, intervalMs: 0 }));
    setSourceSha(db, "src/a.ts", "sha-a");
    cp.unitStored();
    cp.flush();
    expect(existsSync(atlasPath())).toBe(false);
  });

  it("a failed export warns once, does not throw, keeps the units pending and waits a full interval before retrying", () => {
    const warnings: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown): boolean => {
      const text = String(chunk);
      if (text.includes("[warn]")) warnings.push(text);
      return true;
    });
    try {
      // The directory does not exist, so the write fails.
      const missingDir = pathJoin(tmp, "no-such-dir", "atlas.json");
      const cp = createCheckpointer(db, input({ atlasAbsPath: missingDir }));
      setSourceSha(db, "src/a.ts", "sha-a");
      clock += 30_000;
      expect(() => cp.unitStored()).not.toThrow();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/checkpoint export of atlas\.json failed; the run goes on/);

      // Within the interval after the failure: no retry, no new warning.
      clock += 10_000;
      cp.unitStored();
      expect(() => cp.flush()).not.toThrow();
      expect(warnings).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("units kept pending by a failed export are written by the next successful one", () => {
    const quiet = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      let path = pathJoin(tmp, "no-such-dir", "atlas.json");
      const cp = createCheckpointer(db, {
        ...input({ intervalMs: 0 }),
        get atlasAbsPath() {
          return path;
        },
      });
      setSourceSha(db, "src/a.ts", "sha-a");
      cp.unitStored(); // fails
      path = atlasPath();
      cp.flush();
      expect(Object.keys(readAtlas().source_shas)).toEqual(["src/a.ts"]);
    } finally {
      quiet.mockRestore();
    }
  });
});
