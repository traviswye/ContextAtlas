/**
 * MCP server startup load (v1.2 Phase 2 review round 2.2): with
 * `atlas.committed: true` a changed atlas.json (a pull, an /index-atlas
 * refresh) replaces the cache; a running `index` run and
 * `atlas.committed: false` keep it. Round 2.3: a dead run's mark does
 * not keep it, and a cache an `index` run changed without importing
 * atlas.json (`committed: false`) does not count as holding atlas.json.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getCacheMeta, setCacheMeta } from "../storage/cache-meta.js";
import { insertClaim, listAllClaims, setSourceSha } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import {
  listSourceKeyStreams,
  recordSourceKeyStream,
} from "../storage/source-key-streams.js";
import type { AtlasFileV1 } from "../storage/types.js";

import {
  KEY_STREAMS_ATLAS_KEY,
  loadAtlasBaseline,
  recordAtlasWritten,
  RUN_IN_PROGRESS_KEY,
} from "./atlas-baseline.js";
import { RUN_OWNER_KEY } from "./run-owner.js";
import { loadAtlasForServer } from "./server-cache-load.js";

function atlas(claim: string): AtlasFileV1 {
  return {
    version: "1.4",
    generated_at: "2026-09-25T00:00:00.000Z",
    generator: { contextatlas_version: "1.2.0", extraction_model: "claude-opus-4-7" },
    source_shas: { "docs/adr/ADR-01.md": `sha-of-${claim}` },
    symbols: [],
    claims: [
      {
        source: "adr:ADR-01.md",
        source_path: "docs/adr/ADR-01.md",
        source_sha: `sha-of-${claim}`,
        severity: "hard",
        claim,
        symbol_ids: [],
      },
    ],
  };
}

describe("loadAtlasForServer", () => {
  let tmp: string;
  let db: DatabaseInstance;
  let atlasPath: string;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-server-load-"));
    atlasPath = pathJoin(tmp, "atlas.json");
    db = openDatabase(":memory:");
  });
  afterEach(async () => {
    db.close();
    await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const writeAtlas = (claim: string): string => {
    const text = JSON.stringify(atlas(claim), null, 2);
    writeFileSync(atlasPath, text);
    return text;
  };
  const load = (committed = true, isProcessAlive?: (pid: number) => boolean) =>
    loadAtlasForServer(db, {
      atlasAbsPath: atlasPath,
      committed,
      ...(isProcessAlive !== undefined ? { isProcessAlive } : {}),
    });
  const claims = () => listAllClaims(db).map((c) => c.claim);

  it("an empty cache is seeded from atlas.json, in either mode", () => {
    writeAtlas("pull 1");
    expect(load(false)).toEqual({ action: "seeded" });
    expect(claims()).toEqual(["pull 1"]);
    expect(getCacheMeta(db, KEY_STREAMS_ATLAS_KEY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("no atlas.json and an empty cache", () => {
    expect(load()).toEqual({ action: "empty" });
  });

  it("atlas.committed: true: a pulled atlas.json replaces the cache seeded from the old one", () => {
    writeAtlas("pull 1");
    load();
    writeAtlas("pull 2");
    expect(load()).toEqual({ action: "reimported" });
    expect(claims()).toEqual(["pull 2"]);
  });

  it("atlas.committed: true: an unchanged atlas.json keeps the cache", () => {
    writeAtlas("pull 1");
    load();
    setSourceSha(db, "marker", "kept"); // would be wiped by an import
    expect(load()).toEqual({ action: "kept" });
    expect(claims()).toEqual(["pull 1"]);
  });

  it("atlas.committed: true: the atlas.json `index` wrote last keeps the cache", () => {
    const text = writeAtlas("written by index");
    insertClaim(db, {
      source: "adr:ADR-01.md",
      sourcePath: "docs/adr/ADR-01.md",
      sourceSha: "s",
      severity: "hard",
      claim: "cache copy",
      symbolIds: [],
    });
    recordAtlasWritten(db, text);
    expect(load()).toEqual({ action: "kept" });
    expect(claims()).toEqual(["cache copy"]);
  });

  it("atlas.committed: true: a cache with no record of what it holds (before 1.2) re-imports once", () => {
    writeAtlas("committed");
    setSourceSha(db, "docs/adr/ADR-01.md", "older");
    expect(load()).toEqual({ action: "reimported" });
    expect(load()).toEqual({ action: "kept" });
    expect(claims()).toEqual(["committed"]);
  });

  it("atlas.committed: true: an unfinished `index` run keeps the cache", () => {
    writeAtlas("pull 1");
    load();
    setCacheMeta(db, RUN_IN_PROGRESS_KEY, "some-atlas");
    writeAtlas("pull 2");
    // No owner record (a mark set before round 2.3): cannot be checked.
    expect(load()).toEqual({ action: "kept-unfinished-run", owner: null });
    expect(claims()).toEqual(["pull 1"]);
  });

  describe("an unfinished-run mark with an owner (review round 2.3)", () => {
    const markRun = (owner: { pid: number; host: string }): void => {
      setCacheMeta(db, RUN_IN_PROGRESS_KEY, "hash-of-pull-1");
      setCacheMeta(db, RUN_OWNER_KEY, JSON.stringify(owner));
    };

    it("a run that is still running keeps the cache", () => {
      writeAtlas("pull 1");
      load();
      const owner = { pid: 4242, host: hostname() };
      markRun(owner);
      writeAtlas("pull 2");
      expect(load(true, () => true)).toEqual({ action: "kept-unfinished-run", owner });
      expect(claims()).toEqual(["pull 1"]);
    });

    it("a run that died: a changed atlas.json is re-imported and the dead run's mark is dropped", () => {
      writeAtlas("pull 1");
      load();
      const owner = { pid: 4242, host: hostname() };
      markRun(owner);
      insertClaim(db, {
        source: "adr:ADR-02.md",
        sourcePath: "docs/adr/ADR-02.md",
        sourceSha: "wip",
        severity: "hard",
        claim: "unsaved work of the dead run",
        symbolIds: [],
      });
      writeAtlas("refreshed by /index-atlas");
      expect(load(true, () => false)).toEqual({ action: "reimported", abandonedRun: owner });
      expect(claims()).toEqual(["refreshed by /index-atlas"]);
      expect(getCacheMeta(db, RUN_IN_PROGRESS_KEY)).toBeUndefined();
      expect(getCacheMeta(db, RUN_OWNER_KEY)).toBeUndefined();
      expect(load(true, () => false)).toEqual({ action: "kept" });
    });

    it("a run that died with atlas.json unchanged: the cache (with its work) is kept for `index` to resume", () => {
      writeAtlas("pull 1");
      load();
      markRun({ pid: 4242, host: hostname() });
      expect(load(true, () => false)).toEqual({ action: "kept" });
      expect(getCacheMeta(db, RUN_IN_PROGRESS_KEY)).toBe("hash-of-pull-1");
    });

    it("a run on another machine sharing the cache cannot be checked and keeps the cache", () => {
      writeAtlas("pull 1");
      load();
      const owner = { pid: 4242, host: `${hostname()}-elsewhere` };
      markRun(owner);
      writeAtlas("pull 2");
      expect(load(true, () => false)).toEqual({ action: "kept-unfinished-run", owner });
    });
  });

  it("atlas.committed: true: an atlas.json that cannot be imported leaves the cache as it was", () => {
    writeAtlas("pull 1");
    load();
    writeFileSync(atlasPath, "<<<<<<< HEAD\n{}\n=======\n"); // a conflicted pull
    const conflicted = load();
    expect(conflicted.action).toBe("kept-import-failed");
    expect(claims()).toEqual(["pull 1"]);

    // A `symbols: []` Skill refresh before resolve-symbols has run.
    const refresh = atlas("refresh");
    refresh.claims[0]!.symbol_ids = ["sym:ts:src/a.ts:Gone"];
    writeFileSync(atlasPath, JSON.stringify(refresh, null, 2));
    const dangling = load();
    expect(dangling).toMatchObject({ action: "kept-import-failed" });
    expect(dangling.action === "kept-import-failed" ? dangling.error : "").toMatch(
      /contextatlas resolve-symbols/,
    );
    expect(claims()).toEqual(["pull 1"]);
  });

  it("a re-import drops the key-stream records written on top of the old file", () => {
    writeAtlas("pull 1");
    load();
    recordSourceKeyStream(db, "src/a.ts", "prose", "S");
    writeAtlas("pull 2");
    load();
    expect(listSourceKeyStreams(db).size).toBe(0);
  });

  it("atlas.committed: false: a non-empty cache is kept whatever atlas.json holds", () => {
    writeAtlas("leftover");
    setSourceSha(db, "docs/adr/ADR-01.md", "cache");
    // atlas.json differs from what the cache holds: kept, with a warning
    // (review round 2.3).
    expect(load(false)).toEqual({ action: "kept-uncommitted" });
    expect(claims()).toEqual([]);
  });

  it("atlas.committed: false: a cache seeded from this atlas.json is kept without a warning", () => {
    writeAtlas("seed");
    expect(load(false)).toEqual({ action: "seeded" });
    expect(load(false)).toEqual({ action: "kept" });
  });

  it("atlas.committed: true after an atlas.committed: false `index` run changed the cache: atlas.json is re-imported (review round 2.3)", () => {
    writeAtlas("committed");
    expect(load()).toEqual({ action: "seeded" });
    // Stage 0 of a committed:false run, then its local-only work.
    loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: false });
    insertClaim(db, {
      source: "adr:ADR-01.md",
      sourcePath: "docs/adr/ADR-01.md",
      sourceSha: "edited",
      severity: "hard",
      claim: "claim from an ADR edit since reverted",
      symbolIds: [],
    });
    // Back to atlas.committed: true with atlas.json unchanged.
    expect(load()).toEqual({ action: "reimported" });
    expect(claims()).toEqual(["committed"]);
  });

  it("atlas.committed: true after a run without atlas.json died and the file came back: atlas.json is re-imported (review round 2.3)", () => {
    writeAtlas("committed");
    load();
    rmSync(atlasPath);
    // Stage 0 of a committed:true run with no atlas.json, then a crash
    // after it stored work; `git checkout` restores the file.
    loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: true });
    insertClaim(db, {
      source: "adr:ADR-01.md",
      sourcePath: "docs/adr/ADR-01.md",
      sourceSha: "other",
      severity: "hard",
      claim: "work of the crashed run",
      symbolIds: [],
    });
    writeAtlas("committed");
    expect(load()).toEqual({ action: "reimported" });
    expect(claims()).toEqual(["committed"]);
  });
});
