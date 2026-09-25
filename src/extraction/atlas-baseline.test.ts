/**
 * Stage 0 policy (review fixes): when atlas.json replaces the local
 * cache, when an unfinished run resumes from the cache, and how
 * `atlas.committed: false` treats a leftover atlas.json.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { log } from "../mcp/logger.js";
import { getCacheMeta, setCacheMeta } from "../storage/cache-meta.js";
import { listSourceShas, setSourceSha } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import type { AtlasFileV1 } from "../storage/types.js";

import {
  loadAtlasBaseline,
  markRunFinished,
  RUN_IN_PROGRESS_KEY,
} from "./atlas-baseline.js";

function atlasWith(sourceShas: Record<string, string>): AtlasFileV1 {
  return {
    version: "1.4",
    generated_at: "2026-09-25T00:00:00.000Z",
    generator: { contextatlas_version: "1.2.0", extraction_model: "claude-opus-4-7" },
    source_shas: sourceShas,
    symbols: [],
    claims: [],
  };
}

describe("loadAtlasBaseline", () => {
  let tmp: string;
  let db: DatabaseInstance;
  let atlasPath: string;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-baseline-"));
    atlasPath = pathJoin(tmp, "atlas.json");
    db = openDatabase(":memory:");
    warn = vi.spyOn(log, "warn").mockImplementation(() => {});
  });
  afterEach(async () => {
    warn.mockRestore();
    db.close();
    await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const writeAtlas = (shas: Record<string, string>): void =>
    writeFileSync(atlasPath, JSON.stringify(atlasWith(shas), null, 2));

  describe("atlas.committed: true", () => {
    it("imports atlas.json over the cache and marks the run unfinished", () => {
      writeAtlas({ "docs/a.md": "s1" });
      setSourceSha(db, "stale.md", "x");
      const r = loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: true });
      expect(r).toEqual({ imported: true, resumed: false });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s1" });
      expect(getCacheMeta(db, RUN_IN_PROGRESS_KEY)).toMatch(/^[0-9a-f]{64}$/);
    });

    it("an unfinished run over an unchanged atlas.json resumes: the cache is kept", () => {
      writeAtlas({ "docs/a.md": "s1" });
      loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: true });
      setSourceSha(db, "src/done.ts", "paid-for"); // work the run stored
      const r = loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: true });
      expect(r).toEqual({ imported: false, resumed: true });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s1", "src/done.ts": "paid-for" });
      expect(warn).not.toHaveBeenCalled();
    });

    it("an unfinished run whose atlas.json changed since: imports it, with a warning", () => {
      writeAtlas({ "docs/a.md": "s1" });
      loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: true });
      setSourceSha(db, "src/done.ts", "paid-for");
      writeAtlas({ "docs/a.md": "s2" });
      const r = loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: true });
      expect(r).toEqual({ imported: true, resumed: false });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s2" });
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/did not finish/);
    });

    it("after markRunFinished the next run imports atlas.json again", () => {
      writeAtlas({ "docs/a.md": "s1" });
      loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: true });
      markRunFinished(db);
      expect(getCacheMeta(db, RUN_IN_PROGRESS_KEY)).toBeUndefined();
      setSourceSha(db, "src/other.ts", "x");
      const r = loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: true });
      expect(r.imported).toBe(true);
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s1" });
    });

    it("no atlas.json: the cache is the baseline and a stale mark is cleared", () => {
      setCacheMeta(db, RUN_IN_PROGRESS_KEY, "abc");
      setSourceSha(db, "docs/a.md", "s1");
      const r = loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: true });
      expect(r).toEqual({ imported: false, resumed: false });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s1" });
      expect(getCacheMeta(db, RUN_IN_PROGRESS_KEY)).toBeUndefined();
    });
  });

  describe("atlas.committed: false", () => {
    it("a leftover atlas.json seeds an empty cache", () => {
      writeAtlas({ "docs/a.md": "s1" });
      const r = loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: false });
      expect(r).toEqual({ imported: true, resumed: false });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s1" });
      expect(getCacheMeta(db, RUN_IN_PROGRESS_KEY)).toBeUndefined();
    });

    it("a leftover atlas.json is ignored, with a warning, once the cache has content", () => {
      writeAtlas({ "docs/a.md": "s1" });
      setSourceSha(db, "docs/a.md", "newer");
      const r = loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: false });
      expect(r).toEqual({ imported: false, resumed: false });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "newer" });
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toMatch(/atlas\.committed is false/);
      expect(message).toContain(atlasPath);
      expect(message).toMatch(/Delete it/);
    });

    it("no atlas.json: nothing to do, no warning", () => {
      setSourceSha(db, "docs/a.md", "s1");
      const r = loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: false });
      expect(r).toEqual({ imported: false, resumed: false });
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
