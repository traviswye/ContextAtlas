/**
 * v1.2 Phase 2 review round 2.2: pipeline-level regressions around the
 * resume of an interrupted run and the no-atlas.json baseline.
 *
 *   - A resume carries a file's unit only while the working tree still
 *     has that content: a reverted WIP edit or a deleted scratch file is
 *     neither billed again nor exported.
 *   - A resume rolls the key-stream records back with the re-imported
 *     atlas.json, so a record the dead run deleted (Stage 5) or replaced
 *     at the same SHA (the other stream) cannot hide a file from the
 *     stream that must extract it.
 *   - With `atlas.committed: true` and no atlas.json, commits the cache
 *     extracted on another branch are not exported.
 *
 * Harness follows `pipeline-baseline.test.ts`: a stub TS adapter, a
 * recording extraction client keyed by request body, and a real
 * temporary git repository for the commit stream.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join as pathJoin, relative, sep } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import type { AtlasFileV1 } from "../storage/types.js";
import type {
  ContextAtlasConfig,
  ExtractionStream,
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
  SymbolId,
} from "../types.js";

import type { ExtractionClient } from "./anthropic-client.js";
import { runExtractionPipeline } from "./pipeline.js";
import type { ExtractionResult } from "./prompt.js";

const ALL: ReadonlySet<ExtractionStream> = new Set<ExtractionStream>(["adr", "docstring", "commit"]);

function tsSym(rel: string, name: string): AtlasSymbol {
  return { id: `sym:ts:${rel}:${name}`, name, kind: "function", path: rel, line: 1, language: "typescript" };
}

/** Stub TS adapter: repo-relative path → symbols; symbol id → docstring. */
function adapterFor(
  root: string,
  listing: Record<string, AtlasSymbol[]>,
  docstrings: Record<SymbolId, string>,
): LanguageAdapter {
  const rel = (p: string): string => (isAbsolute(p) ? relative(root, p) : p).split(sep).join("/");
  return {
    language: "typescript",
    extensions: [".ts"],
    async initialize() {},
    async shutdown() {},
    async listSymbols(p: string) {
      return listing[rel(p)] ?? [];
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
    async getDocstring(id: SymbolId) {
      return docstrings[id] ?? null;
    },
  };
}

function oneClaim(text: string): ExtractionResult {
  return { claims: [{ symbol_candidates: [], claim: text, severity: "hard", rationale: "r", excerpt: "e" }] };
}

/**
 * Records every request body. `crashOn` marks the body whose result
 * escapes every per-unit handler: the stand-in for a kill mid-run.
 */
function client(
  respond: (body: string) => ExtractionResult | null,
  crashOn: (body: string) => boolean = () => false,
) {
  const bodies: string[] = [];
  const c: ExtractionClient = {
    async extract(body: string) {
      bodies.push(body);
      if (crashOn(body)) {
        return {
          result: {
            get claims(): never {
              throw new Error("simulated crash");
            },
          } as unknown as ExtractionResult,
          usage: { inputTokens: 100, outputTokens: 50 },
        };
      }
      return { result: respond(body), usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
  return { client: c, bodies };
}

function baseConfig(include: string[] = []): ContextAtlasConfig {
  return {
    version: 1,
    languages: ["typescript"],
    adrs: { path: "docs/adr", format: "markdown-frontmatter" },
    docs: { include },
    git: { recentCommits: 5 },
    index: { model: "claude-opus-4-7" },
    atlas: { committed: true, path: ".contextatlas/atlas.json", localCache: ".contextatlas/index.db" },
  };
}

function git(root: string, args: string[]): string {
  const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Tester",
      GIT_AUTHOR_EMAIL: "tester@example.com",
      GIT_COMMITTER_NAME: "Tester",
      GIT_COMMITTER_EMAIL: "tester@example.com",
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed (${r.status}): ${r.stderr}`);
  return r.stdout.trim();
}

describe("runExtractionPipeline — resume and baseline (review round 2.2)", () => {
  let tmp: string;
  let db: DatabaseInstance;
  let noGit: string;
  let quiet: { mockRestore: () => void };

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-resume-pipe-"));
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    noGit = pathJoin(tmp, "no-such-git-binary");
    db = openDatabase(":memory:");
    quiet = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(async () => {
    quiet.mockRestore();
    db.close();
    await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const atlasPath = () => pathJoin(tmp, ".contextatlas", "atlas.json");
  const atlasText = () => readFileSync(atlasPath(), "utf8");
  const readAtlas = () => JSON.parse(atlasText()) as AtlasFileV1;
  const claimsOf = (key: string) =>
    readAtlas()
      .claims.filter((c) => c.source_path === key)
      .map((c) => c.claim);
  const write = (rel: string, body: string): void => {
    const abs = pathJoin(tmp, ...rel.split("/"));
    mkdirSync(pathJoin(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  };
  const run = (
    adapter: LanguageAdapter,
    c: ExtractionClient,
    extra: Partial<Parameters<typeof runExtractionPipeline>[0]> = {},
  ) =>
    runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: c,
      adapters: new Map<LanguageCode, LanguageAdapter>([["typescript", adapter]]),
      gitBinary: noGit,
      streams: ALL,
      ...extra,
    });

  // -------------------------------------------------------------------
  // A carried unit must still be in the working tree
  // -------------------------------------------------------------------

  describe("an interrupted run whose content the tree no longer has", () => {
    const ADR = "---\nid: ADR-01\n---\nFa is the single entry point.\n";
    const files = { a: "export function Fa() {}\n", b: "export function Fb() {}\n" };
    function fixture() {
      write("docs/adr/ADR-01.md", ADR);
      write("src/a.ts", files.a);
      write("src/b.ts", files.b);
      const listing: Record<string, AtlasSymbol[]> = {};
      const docs: Record<SymbolId, string> = {};
      for (const n of ["a", "b", "c", "d"]) {
        const s = tsSym(`src/${n}.ts`, `F${n}`);
        listing[`src/${n}.ts`] = [s];
        docs[s.id] = `doc ${n}`;
      }
      return adapterFor(tmp, listing, docs);
    }
    const replies = (body: string) => oneClaim(`claim for ${body.trim().split("\n").pop()}`);

    /** Run 1 exports; run 2 extracts WIP versions of all three files and dies on b. */
    async function interruptedOnWip(adapter: LanguageAdapter): Promise<string> {
      await run(adapter, client(replies).client);
      const committed = atlasText();
      write("docs/adr/ADR-01.md", ADR + "WIP: Fa may be bypassed.\n");
      write("src/a.ts", "export function Fa() { /* wip */ }\n");
      write("src/b.ts", "export function Fb() { /* wip */ }\n");
      await expect(run(adapter, client(replies, (b) => b === "doc b").client)).rejects.toThrow(
        /simulated crash/,
      );
      return committed;
    }

    it("the WIP is reverted: the next run makes no call and leaves atlas.json byte-identical", async () => {
      const adapter = fixture();
      const committed = await interruptedOnWip(adapter);
      write("docs/adr/ADR-01.md", ADR); // git stash / checkout
      write("src/a.ts", files.a);
      write("src/b.ts", files.b);

      const rec = client(replies);
      const result = await run(adapter, rec.client);
      expect(rec.bodies).toEqual([]);
      expect(result.atlasExported).toBe(false);
      expect(atlasText()).toBe(committed);
    });

    it("only part of the WIP is reverted: the unit still in the tree is carried, the reverted one is not billed", async () => {
      const adapter = fixture();
      await interruptedOnWip(adapter);
      write("src/a.ts", files.a); // revert a.ts only

      const rec = client(replies);
      const result = await run(adapter, rec.client);
      expect(rec.bodies).toEqual(["doc b"]);
      expect(result.atlasExported).toBe(true);
      expect(claimsOf("docs/adr/ADR-01.md")).toEqual(["claim for WIP: Fa may be bypassed."]);
      expect(claimsOf("src/a.ts")).toEqual(["claim for doc a"]);
    });

    it("a scratch file extracted by the dead run was deleted since: no call, atlas.json byte-identical", async () => {
      const adapter = fixture();
      await run(adapter, client(replies).client);
      const committed = atlasText();
      write("src/c.ts", "export function Fc() {}\n");
      write("src/d.ts", "export function Fd() {}\n");
      await expect(run(adapter, client(replies, (b) => b === "doc d").client)).rejects.toThrow(
        /simulated crash/,
      );
      rmSync(pathJoin(tmp, "src", "c.ts"));
      rmSync(pathJoin(tmp, "src", "d.ts"));

      const rec = client(replies);
      const result = await run(adapter, rec.client);
      expect(rec.bodies).toEqual([]);
      expect(result.atlasExported).toBe(false);
      expect(atlasText()).toBe(committed);
    });
  });

  // -------------------------------------------------------------------
  // Key-stream records roll back with the re-import
  // -------------------------------------------------------------------

  describe("key-stream records after an interrupted run", () => {
    const withDocs = (include: string[]) => ({ config: baseConfig(include) });
    const A_TS = "export function Foo() {}\n";
    function fixture(bDoc: string) {
      write("src/a.ts", A_TS);
      write("src/b.ts", "export function Fb() {}\n");
      const Foo = tsSym("src/a.ts", "Foo");
      const Fb = tsSym("src/b.ts", "Fb");
      return adapterFor(tmp, { "src/a.ts": [Foo], "src/b.ts": [Fb] }, { [Foo.id]: "Foo doc.", [Fb.id]: bDoc });
    }
    const noClaims = () => client(() => ({ claims: [] }));

    it("docs.include narrowed, run stopped after Stage 5: the resumed run still extracts the file's docstrings", async () => {
      const adapter = fixture("Fb doc.");
      // docs.include covered src/a.ts: prose keyed it with no claims.
      await run(adapter, noClaims().client, withDocs(["src/a.ts"]));
      // Narrowed; the run deletes the prose key at Stage 5 and is
      // stopped at the cost preview (Ctrl-C).
      await expect(
        run(adapter, noClaims().client, {
          ...withDocs([]),
          onCostPreview: () => {
            throw new Error("interrupted at the preview");
          },
        }),
      ).rejects.toThrow(/interrupted/);

      const rec = client((body) => oneClaim(`claim for ${body}`));
      await run(adapter, rec.client, withDocs([]));
      expect(rec.bodies).toEqual(["Foo doc."]);
      expect(claimsOf("src/a.ts")).toEqual(["claim for Foo doc."]);
    });

    it("docs.include widened, run died after prose re-keyed the file: the resumed run extracts it again rather than losing it", async () => {
      const adapter = fixture("Fb doc.");
      // The docstring stream keyed src/a.ts with no claims.
      await run(adapter, noClaims().client, withDocs([]));
      // Widened: prose extracts src/a.ts at the same SHA, then the run
      // dies in the docstring stream (src/b.ts changed).
      write("src/b.ts", "export function Fb() { /* changed */ }\n");
      const dead = client((body) => oneClaim(`prose rule from ${body.trim()}`), (b) => b === "Fb doc.");
      await expect(run(adapter, dead.client, withDocs(["src/a.ts"]))).rejects.toThrow(/simulated crash/);
      expect(dead.bodies[0]).toContain("export function Foo()");

      const rec = client((body) => oneClaim(`prose rule from ${body.trim()}`));
      await run(adapter, rec.client, withDocs(["src/a.ts"]));
      expect(rec.bodies.some((b) => b.includes("export function Foo()"))).toBe(true);
      expect(claimsOf("src/a.ts")).toEqual([`prose rule from ${A_TS.trim()}`]);
    });

    it("docs.include narrowed, run died after the docstring stream re-keyed the file: the resumed run extracts it again", async () => {
      const adapter = fixture("Fb doc v2.");
      // docs.include covered src/a.ts: prose keyed it with no claims.
      await run(adapter, noClaims().client, withDocs(["src/a.ts"]));
      // Narrowed: Stage 5 drops the prose key, the docstring stream
      // stores src/a.ts at the same SHA, then dies on src/b.ts.
      write("src/b.ts", "export function Fb() { /* changed */ }\n");
      const dead = client((body) => oneClaim(`claim for ${body}`), (b) => b === "Fb doc v2.");
      await expect(run(adapter, dead.client, withDocs([]))).rejects.toThrow(/simulated crash/);
      expect(dead.bodies).toContain("Foo doc.");

      const rec = client((body) => oneClaim(`claim for ${body}`));
      await run(adapter, rec.client, withDocs([]));
      expect(rec.bodies).toContain("Foo doc.");
      expect(claimsOf("src/a.ts")).toEqual(["claim for Foo doc."]);
    });
  });

  // -------------------------------------------------------------------
  // committed: true, no atlas.json, and another branch's commits
  // -------------------------------------------------------------------

  it("no atlas.json on this branch: commits the cache extracted on another branch are not exported", async () => {
    git(tmp, ["init", "-q"]);
    git(tmp, ["config", "user.email", "tester@example.com"]);
    git(tmp, ["config", "user.name", "Tester"]);
    git(tmp, ["commit", "-q", "--allow-empty", "-m", "design: split the router"]);
    const main = git(tmp, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const base = git(tmp, ["rev-parse", "HEAD"]);
    git(tmp, ["checkout", "-q", "-b", "feature-f"]);
    git(tmp, ["commit", "-q", "--allow-empty", "-m", "design: F-only decision"]);
    const fOnly = git(tmp, ["rev-parse", "HEAD"]);

    const adapter = adapterFor(tmp, {}, {});
    const replies = (body: string) => oneClaim(`claim for ${body}`);
    await run(adapter, client(replies).client, { gitBinary: "git" });
    expect(Object.keys(readAtlas().source_shas)).toContain(`commit:${fOnly}`);

    // atlas.json was committed on the feature branch only: on main it is gone.
    git(tmp, ["checkout", "-q", main]);
    rmSync(atlasPath());
    const rec = client(replies);
    const result = await run(adapter, rec.client, { gitBinary: "git" });
    expect(rec.bodies).toEqual([]);
    expect(result.atlasExported).toBe(true);
    const keys = Object.keys(readAtlas().source_shas);
    expect(keys).toContain(`commit:${base}`);
    expect(keys).not.toContain(`commit:${fOnly}`);
    expect(readAtlas().claims.some((c) => /F-only/.test(c.claim))).toBe(false);
  });
});
