/**
 * Stage 0 policy (review fixes, rounds 1 and 2): atlas.json is imported
 * over the local cache, an unfinished run carries over only the units it
 * stored, `atlas.committed: false` treats a leftover atlas.json as a
 * seed, a committed atlas with no atlas.json must be written, and the
 * cache-only key-stream records only survive the import of an atlas.json
 * this cache wrote or imported last.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { log } from "../mcp/logger.js";
import { getCacheMeta, setCacheMeta } from "../storage/cache-meta.js";
import {
  deleteClaimsBySourcePath,
  deleteSourceSha,
  insertClaim,
  listAllClaims,
  listSourceShas,
  setSourceSha,
} from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import {
  listSourceKeyStreams,
  recordSourceKeyStream,
} from "../storage/source-key-streams.js";
import { deleteSymbolsByIds, getSymbol, upsertSymbol } from "../storage/symbols.js";
import type { AtlasClaimEntry, AtlasFileV1, AtlasSymbolEntry } from "../storage/types.js";

import {
  type AtlasBaselineInput,
  KEY_STREAMS_ATLAS_KEY,
  loadAtlasBaseline,
  markRunFinished,
  recordAtlasWritten,
  RUN_IN_PROGRESS_KEY,
  RUN_START_KEY_STREAMS_KEY,
} from "./atlas-baseline.js";

function atlasWith(
  sourceShas: Record<string, string>,
  symbols: AtlasSymbolEntry[] = [],
  claims: AtlasClaimEntry[] = [],
): AtlasFileV1 {
  return {
    version: "1.4",
    generated_at: "2026-09-25T00:00:00.000Z",
    generator: { contextatlas_version: "1.2.0", extraction_model: "claude-opus-4-7" },
    source_shas: sourceShas,
    symbols,
    claims,
  };
}

const FA: AtlasSymbolEntry = {
  id: "sym:ts:src/a.ts:Fa",
  name: "Fa",
  kind: "function",
  path: "src/a.ts",
  line: 1,
  file_sha: "sha-a",
};

function adrClaim(text: string, symbolIds: string[]): AtlasClaimEntry {
  return {
    source: "adr:ADR-01.md",
    source_path: "docs/adr/ADR-01.md",
    source_sha: "adr-1",
    severity: "hard",
    claim: text,
    symbol_ids: symbolIds,
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

  const writeAtlas = (
    shas: Record<string, string>,
    symbols: AtlasSymbolEntry[] = [],
    claims: AtlasClaimEntry[] = [],
  ): string => {
    const text = JSON.stringify(atlasWith(shas, symbols, claims), null, 2);
    writeFileSync(atlasPath, text);
    return text;
  };
  /** Stage 0 as the pipeline runs it; by default every stored file unit is still in the tree. */
  const load = (extra: Partial<AtlasBaselineInput> = {}) =>
    loadAtlasBaseline(db, {
      atlasAbsPath: atlasPath,
      committed: true,
      isSourceCurrent: () => true,
      ...extra,
    });
  /** A unit a run stores: key + one claim. */
  const storeUnit = (key: string, sha: string, text: string, source = `docstring:${key}`): void => {
    insertClaim(db, {
      source,
      sourcePath: key,
      sourceSha: sha,
      severity: "soft",
      claim: text,
      symbolIds: [],
    });
    setSourceSha(db, key, sha);
  };

  describe("atlas.committed: true", () => {
    it("imports atlas.json over the cache and marks the run unfinished", () => {
      writeAtlas({ "docs/a.md": "s1" });
      setSourceSha(db, "stale.md", "x");
      const r = load();
      expect(r).toEqual({ imported: true, resumed: false, mustExport: false });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s1" });
      expect(getCacheMeta(db, RUN_IN_PROGRESS_KEY)).toMatch(/^[0-9a-f]{64}$/);
    });

    it("an unfinished run over an unchanged atlas.json resumes: the units it stored are carried over", () => {
      writeAtlas({ "docs/a.md": "s1" });
      load();
      storeUnit("src/done.ts", "paid-for", "paid claim"); // work the run stored
      const r = load();
      expect(r).toEqual({ imported: true, resumed: true, mustExport: true });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s1", "src/done.ts": "paid-for" });
      expect(listAllClaims(db).map((c) => c.claim)).toEqual(["paid claim"]);
      expect(warn).not.toHaveBeenCalled();
    });

    it("a resume is additive only: what the unfinished run deleted or pruned comes back from atlas.json (review round 2)", () => {
      // atlas.json links an ADR claim to Fa and keys src/a.ts.
      writeAtlas(
        { "docs/adr/ADR-01.md": "adr-1", "src/a.ts": "sha-a" },
        [FA],
        [adrClaim("routes stay pure", [FA.id])],
      );
      load();
      // The dead run saw a tree without src/a.ts: Stage 4a pruned Fa
      // (cascading the claim link) and Stage 5 deleted the key.
      deleteSymbolsByIds(db, [FA.id]);
      deleteClaimsBySourcePath(db, "src/a.ts");
      deleteSourceSha(db, "src/a.ts");
      // It also stored one unit before it died.
      storeUnit("src/b.ts", "sha-b", "b claim");

      const r = load();
      expect(r.resumed).toBe(true);
      expect(listSourceShas(db)).toEqual({
        "docs/adr/ADR-01.md": "adr-1",
        "src/a.ts": "sha-a",
        "src/b.ts": "sha-b",
      });
      const adr = listAllClaims(db).find((c) => c.claim === "routes stay pure");
      expect(adr?.symbolIds).toEqual([FA.id]);
      expect(getSymbol(db, FA.id)).not.toBeNull();
    });

    it("a carried unit replaces atlas.json's claims under its key and keeps its links and the symbols they name", () => {
      writeAtlas({ "docs/adr/ADR-01.md": "adr-1" }, [], [adrClaim("old wording", [])]);
      load();
      // The dead run re-extracted ADR-01 at a new SHA, linking a symbol
      // atlas.json does not list.
      const fb = { ...FA, id: "sym:ts:src/b.ts:Fb", name: "Fb", path: "src/b.ts", file_sha: "sha-b" };
      upsertSymbol(db, {
        id: fb.id,
        name: fb.name,
        kind: "function",
        path: fb.path,
        line: 1,
        language: "typescript",
        fileSha: fb.file_sha,
      });
      deleteClaimsBySourcePath(db, "docs/adr/ADR-01.md");
      insertClaim(db, {
        source: "adr:ADR-01.md",
        sourcePath: "docs/adr/ADR-01.md",
        sourceSha: "adr-2",
        severity: "hard",
        claim: "new wording",
        symbolIds: [fb.id],
        symbolCandidates: ["Fb"],
      });
      setSourceSha(db, "docs/adr/ADR-01.md", "adr-2");

      expect(load().resumed).toBe(true);
      expect(listSourceShas(db)).toEqual({ "docs/adr/ADR-01.md": "adr-2" });
      const claims = listAllClaims(db);
      expect(claims.map((c) => c.claim)).toEqual(["new wording"]);
      expect(claims[0]?.symbolIds).toEqual([fb.id]);
      expect(getSymbol(db, fb.id)?.path).toBe("src/b.ts");
    });

    it("a resume carries a commit only when the current HEAD reaches it (another branch's commit is left out)", () => {
      const onBranch = "a".repeat(40);
      const elsewhere = "b".repeat(40);
      writeAtlas({ "docs/a.md": "s1" });
      load();
      storeUnit(`commit:${onBranch}`, onBranch, "reachable", `commit:${onBranch}`);
      storeUnit(`commit:${elsewhere}`, elsewhere, "other branch", `commit:${elsewhere}`);
      const r = load({
        commitReachability: (sha) => (sha === onBranch ? "reachable" : "unreachable"),
      });
      expect(r.resumed).toBe(true);
      expect(Object.keys(listSourceShas(db)).sort()).toEqual([`commit:${onBranch}`, "docs/a.md"]);
      expect(listAllClaims(db).map((c) => c.claim)).toEqual(["reachable"]);
    });

    it("an unfinished run that stored nothing new is not a resume: nothing to force an export", () => {
      writeAtlas({ "docs/a.md": "s1" });
      load();
      deleteSourceSha(db, "docs/a.md"); // a Stage 5 deletion, nothing stored
      const r = load();
      expect(r).toEqual({ imported: true, resumed: false, mustExport: false });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s1" });
    });

    it("an unfinished run whose atlas.json changed since: imports it, with a warning", () => {
      writeAtlas({ "docs/a.md": "s1" });
      load();
      setSourceSha(db, "src/done.ts", "paid-for");
      writeAtlas({ "docs/a.md": "s2" });
      const r = load();
      expect(r).toEqual({ imported: true, resumed: false, mustExport: false });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s2" });
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/did not finish/);
    });

    it("after markRunFinished the next run imports atlas.json again", () => {
      writeAtlas({ "docs/a.md": "s1" });
      load();
      markRunFinished(db);
      expect(getCacheMeta(db, RUN_IN_PROGRESS_KEY)).toBeUndefined();
      setSourceSha(db, "src/other.ts", "x");
      const r = load();
      expect(r.imported).toBe(true);
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s1" });
    });

    it("no atlas.json: the cache is the baseline, a stale mark is cleared, and the run must export (review round 2)", () => {
      setCacheMeta(db, RUN_IN_PROGRESS_KEY, "abc");
      setSourceSha(db, "docs/a.md", "s1");
      const r = load();
      expect(r).toEqual({ imported: false, resumed: false, mustExport: true });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s1" });
      expect(getCacheMeta(db, RUN_IN_PROGRESS_KEY)).toBeUndefined();
    });
  });

  describe("key-stream records (review round 2)", () => {
    it("are dropped when an atlas.json this cache did not write is imported", () => {
      writeAtlas({ "src/a.ts": "x" });
      recordSourceKeyStream(db, "src/a.ts", "prose", "x");
      load();
      expect(listSourceKeyStreams(db).size).toBe(0);
      expect(getCacheMeta(db, KEY_STREAMS_ATLAS_KEY)).toMatch(/^[0-9a-f]{64}$/);
    });

    it("are kept when the imported atlas.json is the one this cache last wrote", () => {
      const text = writeAtlas({ "src/a.ts": "x" });
      recordAtlasWritten(db, text);
      recordSourceKeyStream(db, "src/a.ts", "prose", "x");
      load();
      expect(listSourceKeyStreams(db).get("src/a.ts")).toEqual({ stream: "prose", sha: "x" });
    });

    it("are kept on the next import of the atlas.json this cache imported last", () => {
      writeAtlas({ "src/a.ts": "x" });
      load();
      markRunFinished(db);
      recordSourceKeyStream(db, "src/a.ts", "docstring", "x");
      load();
      expect(listSourceKeyStreams(db).get("src/a.ts")?.stream).toBe("docstring");
    });
  });

  describe("review round 2.2", () => {
    it("a resume leaves out a file unit whose content the working tree no longer has", () => {
      writeAtlas({ "docs/adr/ADR-01.md": "adr-1", "src/a.ts": "sha-a" }, [], [adrClaim("committed", [])]);
      load();
      // The dead run extracted WIP versions of both files; the user then
      // reverted src/a.ts but kept the ADR edit.
      storeUnit("src/a.ts", "sha-a-wip", "WIP claim");
      deleteClaimsBySourcePath(db, "docs/adr/ADR-01.md");
      storeUnit("docs/adr/ADR-01.md", "adr-1-wip", "WIP ADR claim", "adr:ADR-01.md");

      const r = load({ isSourceCurrent: (key) => key === "docs/adr/ADR-01.md" });
      expect(r.resumed).toBe(true);
      expect(listSourceShas(db)).toEqual({ "docs/adr/ADR-01.md": "adr-1-wip", "src/a.ts": "sha-a" });
      expect(listAllClaims(db).map((c) => c.claim)).toEqual(["WIP ADR claim"]);
    });

    it("nothing still in the tree: not a resume, and atlas.json stands", () => {
      writeAtlas({ "src/a.ts": "sha-a" });
      load();
      storeUnit("src/a.ts", "sha-a-wip", "WIP claim");
      storeUnit("src/scratch.ts", "sha-s", "scratch claim"); // deleted since
      const r = load({ isSourceCurrent: () => false });
      expect(r).toEqual({ imported: true, resumed: false, mustExport: false });
      expect(listSourceShas(db)).toEqual({ "src/a.ts": "sha-a" });
      expect(listAllClaims(db)).toEqual([]);
    });

    it("a resume rolls the key-stream records back: a record Stage 5 deleted comes back", () => {
      const text = writeAtlas({ "src/a.ts": "S" });
      recordAtlasWritten(db, text);
      recordSourceKeyStream(db, "src/a.ts", "prose", "S");
      load();
      deleteSourceSha(db, "src/a.ts"); // Stage 5 of the dead run
      expect(listSourceKeyStreams(db).get("src/a.ts")).toBeUndefined();

      load();
      expect(listSourceKeyStreams(db).get("src/a.ts")).toEqual({ stream: "prose", sha: "S" });
    });

    it("a resume rolls the key-stream records back: a same-SHA re-key by the other stream is undone with its claims", () => {
      const text = writeAtlas({ "src/a.ts": "S" });
      recordAtlasWritten(db, text);
      recordSourceKeyStream(db, "src/a.ts", "docstring", "S");
      load();
      // The dead run's prose stream keyed the file at the same SHA.
      storeUnit("src/a.ts", "S", "prose claim", "adr:a.ts");
      recordSourceKeyStream(db, "src/a.ts", "prose", "S");

      load();
      expect(listAllClaims(db)).toEqual([]);
      expect(listSourceKeyStreams(db).get("src/a.ts")).toEqual({ stream: "docstring", sha: "S" });
    });

    it("a carried unit brings its own record", () => {
      const text = writeAtlas({ "src/a.ts": "S" });
      recordAtlasWritten(db, text);
      recordSourceKeyStream(db, "src/a.ts", "prose", "S");
      load();
      storeUnit("src/a.ts", "S2", "docstring claim");
      recordSourceKeyStream(db, "src/a.ts", "docstring", "S2");

      expect(load().resumed).toBe(true);
      expect(listSourceKeyStreams(db).get("src/a.ts")).toEqual({ stream: "docstring", sha: "S2" });
    });

    it("a run-start copy taken for another atlas.json is not restored: the records are dropped", () => {
      writeAtlas({ "src/a.ts": "S" });
      load();
      recordSourceKeyStream(db, "src/a.ts", "prose", "S");
      setCacheMeta(db, RUN_START_KEY_STREAMS_KEY, "another-file");
      load();
      expect(listSourceKeyStreams(db).size).toBe(0);
    });

    it("markRunFinished drops the run-start copy", () => {
      const text = writeAtlas({ "src/a.ts": "S" });
      recordAtlasWritten(db, text);
      recordSourceKeyStream(db, "src/a.ts", "prose", "S");
      load();
      markRunFinished(db);
      expect(getCacheMeta(db, RUN_START_KEY_STREAMS_KEY)).toBeUndefined();
      const copy = db.prepare("SELECT COUNT(*) AS n FROM source_key_streams_run_start").get() as { n: number };
      expect(copy.n).toBe(0);
    });

    it("no atlas.json: commits of another branch are dropped; reachable and unknown commits stay", () => {
      const reachable = "a".repeat(40);
      const elsewhere = "b".repeat(40);
      const unknown = "c".repeat(40);
      storeUnit(`commit:${reachable}`, reachable, "on this branch", `commit:${reachable}`);
      storeUnit(`commit:${elsewhere}`, elsewhere, "another branch", `commit:${elsewhere}`);
      storeUnit(unknown, unknown, "beyond a shallow clone", `commit:${unknown}`); // legacy bare key
      setSourceSha(db, "docs/a.md", "s1");
      const r = load({
        commitReachability: (sha) =>
          sha === reachable ? "reachable" : sha === elsewhere ? "unreachable" : "unknown",
      });
      expect(r).toEqual({ imported: false, resumed: false, mustExport: true });
      expect(Object.keys(listSourceShas(db)).sort()).toEqual([
        unknown,
        `commit:${reachable}`,
        "docs/a.md",
      ]);
      expect(listAllClaims(db).map((c) => c.claim).sort()).toEqual([
        "beyond a shallow clone",
        "on this branch",
      ]);
    });
  });

  describe("atlas.committed: false", () => {
    it("a leftover atlas.json seeds an empty cache", () => {
      writeAtlas({ "docs/a.md": "s1" });
      const r = loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: false });
      expect(r).toEqual({ imported: true, resumed: false, mustExport: false });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "s1" });
      expect(getCacheMeta(db, RUN_IN_PROGRESS_KEY)).toBeUndefined();
    });

    it("a leftover atlas.json is ignored, with a warning, once the cache has content", () => {
      writeAtlas({ "docs/a.md": "s1" });
      setSourceSha(db, "docs/a.md", "newer");
      const r = loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: false });
      expect(r).toEqual({ imported: false, resumed: false, mustExport: false });
      expect(listSourceShas(db)).toEqual({ "docs/a.md": "newer" });
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toMatch(/atlas\.committed is false/);
      expect(message).toContain(atlasPath);
      expect(message).toMatch(/Delete it/);
    });

    it("no atlas.json: nothing to do, no warning", () => {
      setSourceSha(db, "docs/a.md", "s1");
      const r = loadAtlasBaseline(db, { atlasAbsPath: atlasPath, committed: false });
      expect(r).toEqual({ imported: false, resumed: false, mustExport: false });
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
