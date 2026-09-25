/**
 * v1.2 Phase 1 regression tests: stream-aware Stage 5 (F-4) and
 * stale-symbol pruning (F-1) in `runExtractionPipeline`.
 *
 * Every fixture writes a committed atlas.json whose prose SHAs match
 * the files on disk, so the prose stream is a no-op and the run makes
 * zero model calls (the extraction client throws if called). What the
 * tests observe is purely the structural refresh: Stage 0 import,
 * Stage 3/4 inventory + upsert, the prune step, Stage 5 deletions and
 * the Stage 7 export decision.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join as pathJoin, relative, sep } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { importAtlas } from "../storage/atlas-importer.js";
import { listAllClaims, listSourceShas } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import { listAllSymbols } from "../storage/symbols.js";
import type {
  AtlasClaimEntry,
  AtlasFileV1,
  AtlasSymbolEntry,
} from "../storage/types.js";
import type {
  ContextAtlasConfig,
  ExtractionStream,
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
} from "../types.js";

import type { ExtractionClient } from "./anthropic-client.js";
import { computeFileSha } from "./file-walker.js";
import { runExtractionPipeline } from "./pipeline.js";

const SHA_CLI = "a".repeat(40);
const SHA_SKILL = "b".repeat(40);

const ALL_STREAMS: ReadonlySet<ExtractionStream> = new Set<ExtractionStream>([
  "adr",
  "docstring",
  "commit",
]);

/** Extraction client that fails the test if the pipeline calls it. */
const noCallClient: ExtractionClient = {
  async extract() {
    throw new Error("no model call expected in this test");
  },
};

function tsSym(rel: string, name: string, line = 1): AtlasSymbol {
  return {
    id: `sym:ts:${rel}:${name}`,
    name,
    kind: "function",
    path: rel,
    line,
    language: "typescript",
  };
}

/**
 * Stub TS adapter. `listing` maps repo-relative path → symbols; files
 * in `throwing` make listSymbols throw (simulated tsserver hiccup).
 * Absolute and relative request paths both resolve: an unnormalized
 * relative path would silently list nothing (a false green).
 */
function stubAdapter(
  root: string,
  listing: Record<string, AtlasSymbol[]>,
  throwing: ReadonlySet<string> = new Set(),
): LanguageAdapter {
  return {
    language: "typescript",
    extensions: [".ts"],
    async initialize() {},
    async shutdown() {},
    async listSymbols(p: string) {
      const rel = (isAbsolute(p) ? relative(root, p) : p).split(sep).join("/");
      if (throwing.has(rel)) throw new Error(`simulated LSP failure: ${rel}`);
      return listing[rel] ?? [];
    },
    async getSymbolDetails() {
      return null;
    },
    async findReferences() {
      return [];
    },
    async getDiagnostics() {
      return [];
    },
    async getTypeInfo() {
      return { extends: [], implements: [], usedByTypes: [] };
    },
    async getDocstring() {
      return null;
    },
  };
}

function baseConfig(excludePattern?: string[]): ContextAtlasConfig {
  return {
    version: 1,
    languages: ["typescript"],
    adrs: { path: "docs/adr", format: "markdown-frontmatter" },
    docs: { include: [] },
    git: { recentCommits: 5 },
    index: { model: "claude-opus-4-7" },
    atlas: {
      committed: true,
      path: ".contextatlas/atlas.json",
      localCache: ".contextatlas/index.db",
    },
    ...(excludePattern !== undefined ? { extraction: { excludePattern } } : {}),
  };
}

function entry(sym: AtlasSymbol, fileSha: string): AtlasSymbolEntry {
  return {
    id: sym.id,
    name: sym.name,
    kind: sym.kind,
    path: sym.path,
    line: sym.line,
    file_sha: fileSha,
  };
}

function claim(
  source: string,
  sourcePath: string,
  sourceSha: string,
  symbolIds: string[],
  text: string,
): AtlasClaimEntry {
  return {
    source,
    source_path: sourcePath,
    source_sha: sourceSha,
    severity: "hard",
    claim: text,
    symbol_ids: symbolIds,
  };
}

describe("runExtractionPipeline — v1.2 Phase 1 stream-aware Stage 5 + symbol pruning", () => {
  let tmp: string;
  let db: DatabaseInstance;
  let gitBinary: string;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-prune-"));
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    // Non-existent git binary → hermetic "not a git tree" branch, so
    // git state never forces an export on its own.
    gitBinary = pathJoin(tmp, "no-such-git-binary");
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  const atlasPath = () => pathJoin(tmp, ".contextatlas", "atlas.json");
  const write = (rel: string, body: string): string => {
    const abs = pathJoin(tmp, ...rel.split("/"));
    mkdirSync(pathJoin(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
    return computeFileSha(abs);
  };
  const writeAtlas = (atlas: AtlasFileV1): void => {
    writeFileSync(atlasPath(), JSON.stringify(atlas, null, 2));
  };
  const baseAtlas = (
    sourceShas: Record<string, string>,
    symbols: AtlasSymbolEntry[],
    claims: AtlasClaimEntry[],
  ): AtlasFileV1 => ({
    version: "1.4",
    generated_at: "2026-09-01T00:00:00.000Z",
    generator: {
      contextatlas_version: "1.1.3",
      extraction_model: "claude-opus-4-7",
    },
    source_shas: sourceShas,
    symbols,
    claims,
  });

  /**
   * Three-stream fixture shaped like a Skill-built (or
   * dogfood-script-built) atlas: one ADR, two docstring keys (one with
   * claims, one zero-claim), one CLI-style commit key and one
   * Skill-style bare-sha commit key.
   */
  function threeStreamFixture() {
    const adrSha = write("docs/adr/ADR-01.md", "ADR body — unchanged\n");
    const routerSha = write("src/router.ts", "export class Router {}\n");
    const utilSha = write("src/util.ts", "export function helper() {}\n");
    const Router = tsSym("src/router.ts", "Router");
    const route = tsSym("src/router.ts", "route", 2);
    const helper = tsSym("src/util.ts", "helper");
    writeAtlas(
      baseAtlas(
        {
          "docs/adr/ADR-01.md": adrSha,
          "src/router.ts": routerSha,
          "src/util.ts": utilSha,
          [`commit:${SHA_CLI}`]: SHA_CLI,
          [SHA_SKILL]: SHA_SKILL,
        },
        [entry(Router, routerSha), entry(route, routerSha), entry(helper, utilSha)],
        [
          claim("adr:ADR-01.md", "docs/adr/ADR-01.md", adrSha, [Router.id, helper.id], "adr rule"),
          claim("docstring:src/router.ts", "src/router.ts", routerSha, [Router.id], "router doc"),
          claim(`commit:${SHA_CLI}`, `commit:${SHA_CLI}`, SHA_CLI, [route.id], "cli commit"),
          claim(`commit:${SHA_SKILL}`, SHA_SKILL, SHA_SKILL, [Router.id], "skill commit"),
        ],
      ),
    );
    const adapter = stubAdapter(tmp, {
      "src/router.ts": [Router, route],
      "src/util.ts": [helper],
    });
    return { adapter, Router, route, helper, routerSha, utilSha };
  }

  const run = (
    adapter: LanguageAdapter,
    extra: Partial<Parameters<typeof runExtractionPipeline>[0]> = {},
  ) =>
    runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: noCallClient,
      adapters: new Map<LanguageCode, LanguageAdapter>([["typescript", adapter]]),
      gitBinary,
      ...extra,
    });

  const linksOf = (text: string): string[] =>
    listAllClaims(db).find((c) => c.claim === text)?.symbolIds ?? [];

  it("F-4: docstring claims, their source_shas keys, docstring-file symbols and ADR links all survive an unchanged run", async () => {
    const { adapter, Router, route, helper } = threeStreamFixture();

    const result = await run(adapter);

    expect(result.apiCalls).toBe(0);
    expect(result.filesDeleted).toBe(0);
    expect(result.docstringSourcesDeleted).toBe(0);
    expect(result.symbolsPruned).toBe(0);
    expect(result.claimsOrphaned).toBe(0);
    // The Skill's bare-sha commit key is migrated to `commit:<sha>` (F-5).
    expect(Object.keys(listSourceShas(db)).sort()).toEqual(
      ["docs/adr/ADR-01.md", "src/router.ts", "src/util.ts", `commit:${SHA_CLI}`, `commit:${SHA_SKILL}`].sort(),
    );
    expect(listAllClaims(db).map((c) => c.claim).sort()).toEqual(
      ["adr rule", "cli commit", "router doc", "skill commit"],
    );
    expect(listAllSymbols(db).map((s) => s.id).sort()).toEqual(
      [Router.id, helper.id, route.id].sort(),
    );
    expect(linksOf("adr rule").sort()).toEqual([Router.id, helper.id].sort());
    expect(linksOf("router doc")).toEqual([Router.id]);
    // The F-5 migration alone re-exports the atlas…
    expect(result.commitKeysMigrated).toBe(1);
    expect(result.atlasExported).toBe(true);
    const migrated = readFileSync(atlasPath(), "utf8");
    // …after which an unchanged rerun is a no-op (D5).
    db.close();
    db = openDatabase(":memory:");
    const again = await run(adapter);
    expect(again.commitKeysMigrated).toBe(0);
    expect(again.atlasExported).toBe(false);
    expect(readFileSync(atlasPath(), "utf8")).toBe(migrated);
  });

  it("F-4: commit claims keyed 'commit:<sha>' (CLI) and bare-sha (Skill) survive with their links; the bare form is migrated (F-5)", async () => {
    const { adapter, Router, route } = threeStreamFixture();
    await run(adapter);
    const shas = listSourceShas(db);
    expect(shas[`commit:${SHA_CLI}`]).toBe(SHA_CLI);
    expect(shas[`commit:${SHA_SKILL}`]).toBe(SHA_SKILL);
    expect(shas[SHA_SKILL]).toBeUndefined();
    expect(linksOf("cli commit")).toEqual([route.id]);
    expect(linksOf("skill commit")).toEqual([Router.id]);
    const skill = listAllClaims(db).find((c) => c.claim === "skill commit");
    expect(skill?.sourcePath).toBe(`commit:${SHA_SKILL}`);
  });

  it("F-4 + L-1: without deps.streams (library default, prose only) a changed docstring source keeps its claims and baseline key", async () => {
    const { adapter, routerSha } = threeStreamFixture();
    write("src/router.ts", "export class Router {}\n// edited\n");
    const result = await run(adapter);
    expect(result.docstringSourcesDeleted).toBe(0);
    expect(result.docstringFilesExtracted).toBe(0);
    expect(listSourceShas(db)["src/router.ts"]).toBe(routerSha);
    expect(listAllClaims(db).some((c) => c.claim === "router doc")).toBe(true);
  });

  it("with the docstring stream enabled, a changed docstring source is re-extracted: stale claims replaced, key moved to the new SHA", async () => {
    const { adapter, utilSha } = threeStreamFixture();
    const newSha = write("src/router.ts", "export class Router {}\n// edited\n");
    // The stub adapter documents nothing, so the re-extraction makes no
    // model call and leaves the file with zero claims.
    const result = await run(adapter, { streams: ALL_STREAMS });
    expect(result.apiCalls).toBe(0);
    expect(result.docstringFilesExtracted).toBe(1);
    expect(result.docstringFilesUnchanged).toBe(1);
    const shas = listSourceShas(db);
    expect(shas["src/router.ts"]).toBe(newSha);
    expect(shas["src/util.ts"]).toBe(utilSha);
    expect(listAllClaims(db).some((c) => c.claim === "router doc")).toBe(false);
    expect(result.atlasExported).toBe(true);
  });

  it("F-4: --full (skipShaDiff) keeps docstring + commit keys and claims (library default, prose only)", async () => {
    const { adapter } = threeStreamFixture();
    const client: ExtractionClient = {
      async extract() {
        return {
          result: { claims: [] },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };
    const result = await run(adapter, { skipShaDiff: true, anthropicClient: client });
    expect(result.apiCalls).toBe(1); // the one ADR, re-extracted
    const shas = listSourceShas(db);
    expect(Object.keys(shas)).toContain("src/router.ts");
    expect(Object.keys(shas)).toContain("src/util.ts");
    expect(Object.keys(shas)).toContain(`commit:${SHA_CLI}`);
    expect(Object.keys(shas)).toContain(`commit:${SHA_SKILL}`);
    const texts = listAllClaims(db).map((c) => c.claim).sort();
    expect(texts).toEqual(["cli commit", "router doc", "skill commit"]);
  });

  it("--full with every stream re-extracts docstring files but leaves commits key-gated with their claims (L-7)", async () => {
    const { adapter } = threeStreamFixture();
    const client: ExtractionClient = {
      async extract() {
        return { result: { claims: [] }, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
    const result = await run(adapter, {
      skipShaDiff: true,
      anthropicClient: client,
      streams: ALL_STREAMS,
    });
    expect(result.apiCalls).toBe(1); // the ADR; the stub documents no symbol
    expect(result.docstringFilesExtracted).toBe(2);
    expect(result.docstringFilesUnchanged).toBe(0);
    const texts = listAllClaims(db).map((c) => c.claim).sort();
    expect(texts).toEqual(["cli commit", "skill commit"]);
    const shas = listSourceShas(db);
    expect(Object.keys(shas)).toContain(`commit:${SHA_CLI}`);
    expect(Object.keys(shas)).toContain(`commit:${SHA_SKILL}`);
  });

  it("F-4: a docstring key whose source file was deleted loses its claims + key; its symbols are pruned; linked claims orphan but survive", async () => {
    const { adapter, helper } = threeStreamFixture();
    rmSync(pathJoin(tmp, "src", "router.ts"));

    const result = await run(adapter);

    expect(result.apiCalls).toBe(0);
    expect(result.filesDeleted).toBe(0); // prose-only counter
    expect(result.docstringSourcesDeleted).toBe(1);
    const shas = listSourceShas(db);
    expect(shas["src/router.ts"]).toBeUndefined();
    expect(shas["src/util.ts"]).toBeDefined();
    expect(listAllClaims(db).some((c) => c.claim === "router doc")).toBe(false);
    expect(listAllSymbols(db).map((s) => s.id)).toEqual([helper.id]);
    expect(result.symbolsPruned).toBe(2);
    // ADR claim keeps its surviving link; both commit claims lose their
    // only link and become orphaned (retained, never deleted).
    expect(linksOf("adr rule")).toEqual([helper.id]);
    expect(linksOf("cli commit")).toEqual([]);
    expect(linksOf("skill commit")).toEqual([]);
    expect(result.claimsOrphaned).toBe(2);
    expect(result.orphanedClaimsBySource).toEqual([
      { source: `commit:${SHA_CLI}`, sourcePath: `commit:${SHA_CLI}`, count: 1 },
      { source: `commit:${SHA_SKILL}`, sourcePath: `commit:${SHA_SKILL}`, count: 1 },
    ]);
    expect(result.atlasExported).toBe(true);
  });

  /**
   * Prose-only fixture (the shape a CLI-only `index` produces) with
   * F-1 edits applied on disk after the atlas was written.
   */
  function proseOnlyF1Fixture() {
    const adrSha = write("docs/adr/ADR-01.md", "ADR body\n");
    const keepSha = write("src/keep.ts", "export function Keep() {}\n");
    const goneSha = write("src/gone.ts", "export function Gone() {}\n");
    const oldSha = write("src/old-name.ts", "export function Renamed() {}\n");
    const exclSha = write("src/excluded.ts", "export function Excl() {}\n");
    const Keep = tsSym("src/keep.ts", "Keep");
    const Removed = tsSym("src/keep.ts", "Removed", 5);
    const Gone = tsSym("src/gone.ts", "Gone");
    const RenamedOld = tsSym("src/old-name.ts", "Renamed");
    const Excl = tsSym("src/excluded.ts", "Excl");
    const RenamedNew = tsSym("src/new-name.ts", "Renamed");
    writeAtlas(
      baseAtlas(
        { "docs/adr/ADR-01.md": adrSha },
        [
          entry(Keep, keepSha),
          entry(Removed, keepSha),
          entry(Gone, goneSha),
          entry(RenamedOld, oldSha),
          entry(Excl, exclSha),
        ],
        [
          claim("adr:ADR-01.md", "docs/adr/ADR-01.md", adrSha, [Keep.id, Removed.id], "A keeps Keep"),
          claim("adr:ADR-01.md", "docs/adr/ADR-01.md", adrSha, [Gone.id], "B gone"),
          claim("adr:ADR-01.md", "docs/adr/ADR-01.md", adrSha, [RenamedOld.id], "C renamed"),
          claim("adr:ADR-01.md", "docs/adr/ADR-01.md", adrSha, [Excl.id], "D excluded"),
          claim("adr:ADR-01.md", "docs/adr/ADR-01.md", adrSha, [], "E already unlinked"),
        ],
      ),
    );
    // Apply the edits: delete, rename, drop a symbol from keep.ts.
    rmSync(pathJoin(tmp, "src", "gone.ts"));
    renameSync(pathJoin(tmp, "src", "old-name.ts"), pathJoin(tmp, "src", "new-name.ts"));
    const adapter = stubAdapter(tmp, {
      "src/keep.ts": [Keep],
      "src/new-name.ts": [RenamedNew],
      "src/excluded.ts": [Excl],
    });
    return { adapter, Keep, Removed, Gone, RenamedOld, RenamedNew, Excl };
  }

  it("F-1: prunes deleted-file, renamed-away, removed-from-file and newly-excluded symbols; cascades links; orphans claims without deleting them", async () => {
    const f = proseOnlyF1Fixture();

    const result = await run(f.adapter, {
      config: baseConfig(["src/excluded.ts"]),
    });

    expect(result.apiCalls).toBe(0);
    expect(result.symbolsPruned).toBe(4);
    expect(listAllSymbols(db).map((s) => s.id).sort()).toEqual(
      [f.Keep.id, f.RenamedNew.id].sort(),
    );
    // Claims are never deleted by pruning.
    expect(listAllClaims(db)).toHaveLength(5);
    expect(linksOf("A keeps Keep")).toEqual([f.Keep.id]);
    expect(linksOf("B gone")).toEqual([]);
    expect(linksOf("C renamed")).toEqual([]);
    expect(linksOf("D excluded")).toEqual([]);
    // Newly orphaned by this run: B, C, D. E was already unlinked.
    expect(result.claimsOrphaned).toBe(3);
    expect(result.orphanedClaimsBySource).toEqual([
      { source: "adr:ADR-01.md", sourcePath: "docs/adr/ADR-01.md", count: 3 },
    ]);
    expect(result.unverifiedSymbolFiles).toBe(0);
    expect(result.atlasExported).toBe(true);

    // The exported atlas carries no pruned symbol and no dangling link,
    // so it re-imports cleanly (claim_symbols has a FK on symbols).
    const exported = JSON.parse(readFileSync(atlasPath(), "utf8")) as AtlasFileV1;
    const ids = new Set(exported.symbols.map((s) => s.id));
    expect(ids.has(f.Gone.id)).toBe(false);
    expect(ids.has(f.RenamedOld.id)).toBe(false);
    for (const c of exported.claims) {
      for (const id of c.symbol_ids) expect(ids.has(id)).toBe(true);
    }
    const db2 = openDatabase(":memory:");
    expect(() => importAtlas(db2, exported)).not.toThrow();
    db2.close();
  });

  it("safety: keeps symbols of a file whose listSymbols throws and of a language not configured; counts them unverified", async () => {
    const adrSha = write("docs/adr/ADR-01.md", "ADR body\n");
    const flakySha = write("src/flaky.ts", "export function Flaky() {}\n");
    const pySha = write("pkg/mod.py", "class Thing: pass\n");
    const goneSha = "deadbeef";
    const Flaky = tsSym("src/flaky.ts", "Flaky");
    const Thing: AtlasSymbolEntry = {
      id: "sym:py:pkg/mod.py:Thing",
      name: "Thing",
      kind: "class",
      path: "pkg/mod.py",
      line: 1,
      file_sha: pySha,
    };
    const GonePy: AtlasSymbolEntry = {
      id: "sym:py:pkg/removed.py:GonePy",
      name: "GonePy",
      kind: "class",
      path: "pkg/removed.py",
      line: 1,
      file_sha: goneSha,
    };
    writeAtlas(
      baseAtlas(
        { "docs/adr/ADR-01.md": adrSha },
        [entry(Flaky, flakySha), Thing, GonePy],
        [
          claim("adr:ADR-01.md", "docs/adr/ADR-01.md", adrSha, [Flaky.id, Thing.id], "linked"),
        ],
      ),
    );
    const adapter = stubAdapter(tmp, {}, new Set(["src/flaky.ts"]));
    const warns: string[] = [];
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: unknown): boolean => {
        const text = String(chunk);
        if (text.includes("[warn]")) warns.push(text);
        return true;
      });
    const result = await run(adapter).finally(() => spy.mockRestore());

    // Deleted Python file is pruned even though Python is not configured.
    expect(listAllSymbols(db).map((s) => s.id).sort()).toEqual(
      [Flaky.id, Thing.id].sort(),
    );
    expect(result.symbolsPruned).toBe(1);
    expect(result.unverifiedSymbolFiles).toBe(2);
    expect(linksOf("linked").sort()).toEqual([Flaky.id, Thing.id].sort());
    expect(result.claimsOrphaned).toBe(0);
    const unverifiedWarns = warns.filter((w) => w.includes("unverified"));
    expect(unverifiedWarns).toHaveLength(1);
  });

  it("D5: a no-op rerun leaves atlas.json byte-identical; a prune-only run re-exports", async () => {
    write("docs/adr/ADR-01.md", "---\nid: ADR-01\n---\nMentions Alpha.\n");
    write("src/a.ts", "export function Alpha() {}\n");
    write("src/b.ts", "export function Beta() {}\n");
    const Alpha = tsSym("src/a.ts", "Alpha");
    const Beta = tsSym("src/b.ts", "Beta");
    const adapter = stubAdapter(tmp, { "src/a.ts": [Alpha], "src/b.ts": [Beta] });
    const client: ExtractionClient = {
      async extract() {
        return {
          result: {
            claims: [
              {
                symbol_candidates: ["Alpha"],
                claim: "alpha rule",
                severity: "hard",
                rationale: "r",
                excerpt: "e",
              },
            ],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };
    const first = await run(adapter, { anthropicClient: client });
    expect(first.atlasExported).toBe(true);
    const bytes1 = readFileSync(atlasPath(), "utf8");

    // No-op rerun on a fresh cache.
    db.close();
    db = openDatabase(":memory:");
    const second = await run(adapter);
    expect(second.atlasExported).toBe(false);
    expect(second.symbolsPruned).toBe(0);
    expect(readFileSync(atlasPath(), "utf8")).toBe(bytes1);

    // Prune-only: delete an unlinked source file. No prose change, no
    // git change — the prune alone must trigger the export.
    rmSync(pathJoin(tmp, "src", "b.ts"));
    db.close();
    db = openDatabase(":memory:");
    const third = await run(stubAdapter(tmp, { "src/a.ts": [Alpha] }));
    expect(third.apiCalls).toBe(0);
    expect(third.filesDeleted).toBe(0);
    expect(third.symbolsPruned).toBe(1);
    expect(third.claimsOrphaned).toBe(0);
    expect(third.atlasExported).toBe(true);
    const exported = JSON.parse(readFileSync(atlasPath(), "utf8")) as AtlasFileV1;
    expect(exported.symbols.map((s) => s.id)).toEqual([Alpha.id]);
  });

  it("prose deletion also applies under --full (a prose key absent from the prose walk is dropped)", async () => {
    const aSha = write("docs/adr/ADR-01.md", "one\n");
    const bSha = write("docs/adr/ADR-02.md", "two\n");
    writeAtlas(
      baseAtlas(
        { "docs/adr/ADR-01.md": aSha, "docs/adr/ADR-02.md": bSha },
        [],
        [
          claim("adr:ADR-01.md", "docs/adr/ADR-01.md", aSha, [], "one"),
          claim("adr:ADR-02.md", "docs/adr/ADR-02.md", bSha, [], "two"),
        ],
      ),
    );
    rmSync(pathJoin(tmp, "docs", "adr", "ADR-02.md"));
    const client: ExtractionClient = {
      async extract() {
        return { result: { claims: [] }, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
    const result = await run(stubAdapter(tmp, {}), {
      skipShaDiff: true,
      anthropicClient: client,
    });
    expect(result.filesDeleted).toBe(1);
    expect(Object.keys(listSourceShas(db))).toEqual(["docs/adr/ADR-01.md"]);
    expect(listAllClaims(db).some((c) => c.claim === "two")).toBe(false);
  });
});
