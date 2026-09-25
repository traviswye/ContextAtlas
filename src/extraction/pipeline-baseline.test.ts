/**
 * v1.2 Phase 2 review round 2: pipeline-level regressions around the
 * run's baseline (Stage 0), the key-stream records, the prose all-failed
 * check and the pinned-commit retry hint.
 *
 *   - A resume is additive: what an unfinished run deleted or pruned
 *     against a transient tree does not survive once the file is back,
 *     and the orphans a resumed run's prune finds are reported.
 *   - A resume never carries a commit the current HEAD cannot reach.
 *   - `atlas.committed: true` with no atlas.json always writes one.
 *   - Key-stream records written on top of another atlas.json do not
 *     re-bill or delete keys after a branch switch or a pull.
 *   - One unparseable prose file does not stop the other streams.
 *   - With `atlas.committed: false` the pin warning names the cache.
 *
 * Harness follows `pipeline-streams.test.ts`: a stub TS adapter, a
 * recording extraction client keyed by request body, and real temporary
 * git repositories for the commit stream.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join as pathJoin, relative, sep } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listAllClaims, listSourceShas } from "../storage/claims.js";
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

import { ParseError, type ExtractionClient } from "./anthropic-client.js";
import { runExtractionPipeline } from "./pipeline.js";
import type { ExtractionResult } from "./prompt.js";

const ALL: ReadonlySet<ExtractionStream> = new Set<ExtractionStream>([
  "adr",
  "docstring",
  "commit",
]);

function tsSym(rel: string, name: string): AtlasSymbol {
  return { id: `sym:ts:${rel}:${name}`, name, kind: "function", path: rel, line: 1, language: "typescript" };
}

/** Stub TS adapter: repo-relative path → symbols; symbol id → docstring. */
function adapterFor(
  root: string,
  listing: Record<string, AtlasSymbol[]>,
  docstrings: Record<SymbolId, string> = {},
): LanguageAdapter {
  const rel = (p: string): string =>
    (isAbsolute(p) ? relative(root, p) : p).split(sep).join("/");
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

function oneClaim(text: string, candidates: string[] = []): ExtractionResult {
  return {
    claims: [{ symbol_candidates: candidates, claim: text, severity: "hard", rationale: "r", excerpt: "e" }],
  };
}

/** Records every request body; `respond` decides the reply per body. */
function recordingClient(respond: (body: string) => ExtractionResult | null) {
  const bodies: string[] = [];
  const client: ExtractionClient = {
    async extract(body: string) {
      bodies.push(body);
      return { result: respond(body), usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
  return { client, bodies };
}

/**
 * Succeeds for the first `okCalls` calls, then returns a result whose
 * claims cannot be read: it escapes every per-unit handler, the stand-in
 * for a kill or crash mid-run (as in `pipeline-streams.test.ts`).
 */
function crashingClient(okCalls: number): ExtractionClient {
  let calls = 0;
  return {
    async extract(body: string) {
      calls++;
      if (calls <= okCalls) {
        return { result: oneClaim(`claim for ${body}`), usage: { inputTokens: 100, outputTokens: 50 } };
      }
      return {
        result: {
          get claims(): never {
            throw new Error("simulated crash");
          },
        } as unknown as ExtractionResult,
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    },
  };
}

function baseConfig(extra: Partial<ContextAtlasConfig> = {}): ContextAtlasConfig {
  return {
    version: 1,
    languages: ["typescript"],
    adrs: { path: "docs/adr", format: "markdown-frontmatter" },
    docs: { include: [] },
    git: { recentCommits: 5 },
    index: { model: "claude-opus-4-7" },
    atlas: { committed: true, path: ".contextatlas/atlas.json", localCache: ".contextatlas/index.db" },
    ...extra,
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

function initGitRepo(root: string, subjects: readonly string[]): void {
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "tester@example.com"]);
  git(root, ["config", "user.name", "Tester"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  for (const subject of subjects) commitEmpty(root, subject);
}

function commitEmpty(root: string, subject: string): string {
  git(root, ["commit", "-q", "--allow-empty", "-m", subject]);
  return git(root, ["rev-parse", "HEAD"]);
}

function captureWarnings(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown): boolean => {
    const text = String(chunk);
    if (text.includes("[warn]")) lines.push(text);
    return true;
  });
  return { lines, restore: () => spy.mockRestore() };
}

describe("runExtractionPipeline — Stage 0 and baseline (review round 2)", () => {
  let tmp: string;
  let db: DatabaseInstance;
  let noGit: string;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-baseline-pipe-"));
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    noGit = pathJoin(tmp, "no-such-git-binary");
    db = openDatabase(":memory:");
  });
  afterEach(async () => {
    db.close();
    await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const atlasPath = () => pathJoin(tmp, ".contextatlas", "atlas.json");
  const readAtlas = () => JSON.parse(readFileSync(atlasPath(), "utf8")) as AtlasFileV1;
  const write = (rel: string, body: string): void => {
    const abs = pathJoin(tmp, ...rel.split("/"));
    mkdirSync(pathJoin(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  };
  const run = (
    adapter: LanguageAdapter,
    client: ExtractionClient,
    extra: Partial<Parameters<typeof runExtractionPipeline>[0]> = {},
  ) =>
    runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map<LanguageCode, LanguageAdapter>([["typescript", adapter]]),
      gitBinary: noGit,
      streams: ALL,
      ...extra,
    });

  // -------------------------------------------------------------------
  // A resume is additive only
  // -------------------------------------------------------------------

  describe("an unfinished run on a transient tree", () => {
    const A_TS = "export function Fa() {}\n";
    /** ADR-01 links Fa; src/a.ts and src/b.ts carry docstrings. */
    function fixture() {
      write("docs/adr/ADR-01.md", "---\nid: ADR-01\n---\nFa must stay pure.\n");
      write("src/a.ts", A_TS);
      write("src/b.ts", "export function Fb() {}\n");
      const listing: Record<string, AtlasSymbol[]> = {};
      const docs: Record<SymbolId, string> = {};
      for (const n of ["a", "b", "c", "d"]) {
        const s = tsSym(`src/${n}.ts`, `F${n}`);
        listing[`src/${n}.ts`] = [s];
        docs[s.id] = `doc ${n}`;
      }
      return adapterFor(tmp, listing, docs);
    }
    const replies = (body: string): ExtractionResult =>
      body.includes("Fa must stay pure") ? oneClaim("Fa stays pure", ["Fa"]) : oneClaim(`claim for ${body}`);
    const adrLinks = () =>
      readAtlas().claims.find((c) => c.claim === "Fa stays pure")?.symbol_ids;

    /** Run 1 exports; run 2 (src/a.ts gone, c and d new) stores c and dies on d. */
    async function interruptedWithoutA(adapter: LanguageAdapter): Promise<void> {
      const first = recordingClient(replies);
      await run(adapter, first.client);
      expect(adrLinks()).toEqual(["sym:ts:src/a.ts:Fa"]);
      rmSync(pathJoin(tmp, "src", "a.ts"));
      write("src/c.ts", "export function Fc() {}\n");
      write("src/d.ts", "export function Fd() {}\n");
      await expect(run(adapter, crashingClient(1))).rejects.toThrow(/simulated crash/);
    }

    it("the file comes back: the resumed run keeps the claim's link and bills only the unfinished work", async () => {
      const adapter = fixture();
      await interruptedWithoutA(adapter);
      write("src/a.ts", A_TS); // `git checkout -- src/a.ts`, a branch switched back

      const rec = recordingClient(replies);
      const result = await run(adapter, rec.client);
      // c was stored by the dead run and is carried over; a.ts is not re-billed.
      expect(rec.bodies).toEqual(["doc d"]);
      expect(result.atlasExported).toBe(true);
      expect(adrLinks()).toEqual(["sym:ts:src/a.ts:Fa"]);
      expect(Object.keys(readAtlas().source_shas).sort()).toEqual([
        "docs/adr/ADR-01.md",
        "src/a.ts",
        "src/b.ts",
        "src/c.ts",
        "src/d.ts",
      ]);
    });

    it("the file stays deleted: the resumed run's own prune reports the orphaned claim", async () => {
      const adapter = fixture();
      await interruptedWithoutA(adapter);

      const warnings = captureWarnings();
      const rec = recordingClient(replies);
      const result = await run(adapter, rec.client).finally(() => warnings.restore());
      expect(rec.bodies).toEqual(["doc d"]);
      expect(result.symbolsPruned).toBe(1);
      expect(result.claimsOrphaned).toBe(1);
      expect(warnings.lines.some((l) => /orphaned/.test(l))).toBe(true);
      expect(adrLinks()).toEqual([]);
    });
  });

  describe("an unfinished run and git history", () => {
    it("a commit extracted on another branch is not carried over to this one", async () => {
      initGitRepo(tmp, ["design: split the router"]);
      const main = git(tmp, ["rev-parse", "--abbrev-ref", "HEAD"]);
      const adapter = adapterFor(tmp, {});
      await run(adapter, recordingClient(() => oneClaim("base")).client, { gitBinary: "git" });

      git(tmp, ["checkout", "-q", "-b", "feature-x"]);
      const x1 = commitEmpty(tmp, "design: X-only decision one");
      const x2 = commitEmpty(tmp, "design: X-only decision two");
      await expect(run(adapter, crashingClient(1), { gitBinary: "git" })).rejects.toThrow(
        /simulated crash/,
      );
      const stored = [x1, x2].filter((s) => listSourceShas(db)[`commit:${s}`] !== undefined);
      expect(stored).toHaveLength(1);

      // atlas.json (untracked here, identical on both branches) is unchanged.
      git(tmp, ["checkout", "-q", main]);
      const rec = recordingClient(() => oneClaim("main"));
      await run(adapter, rec.client, { gitBinary: "git" });
      expect(rec.bodies).toEqual([]);
      const keys = [...Object.keys(listSourceShas(db)), ...Object.keys(readAtlas().source_shas)];
      expect(keys.filter((k) => k === `commit:${x1}` || k === `commit:${x2}`)).toEqual([]);
      expect(readAtlas().claims.some((c) => /X-only/.test(c.claim))).toBe(false);
    });

    it("a commit reachable from HEAD is carried over and not billed again", async () => {
      initGitRepo(tmp, ["design: split the router"]);
      const adapter = adapterFor(tmp, {});
      await run(adapter, recordingClient(() => oneClaim("base")).client, { gitBinary: "git" });
      commitEmpty(tmp, "design: next decision one");
      commitEmpty(tmp, "design: next decision two");
      await expect(run(adapter, crashingClient(1), { gitBinary: "git" })).rejects.toThrow(
        /simulated crash/,
      );

      const rec = recordingClient((b) => oneClaim(`claim for ${b}`));
      const result = await run(adapter, rec.client, { gitBinary: "git" });
      expect(rec.bodies).toHaveLength(1);
      expect(result.atlasExported).toBe(true);
      const commitKeys = Object.keys(readAtlas().source_shas).filter((k) => k.startsWith("commit:"));
      expect(commitKeys).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------
  // committed: true without atlas.json
  // -------------------------------------------------------------------

  it("atlas.committed: true and atlas.json deleted: a no-change run writes it again", async () => {
    write("docs/adr/ADR-01.md", "---\nid: ADR-01\n---\nbody\n");
    const adapter = adapterFor(tmp, {});
    await run(adapter, recordingClient(() => oneClaim("rule")).client);
    const before = readAtlas();
    rmSync(atlasPath());

    const rec = recordingClient(() => oneClaim("never"));
    const result = await run(adapter, rec.client);
    expect(rec.bodies).toEqual([]);
    expect(result.atlasExported).toBe(true);
    expect(existsSync(atlasPath())).toBe(true);
    expect(readAtlas().claims.map((c) => c.claim)).toEqual(before.claims.map((c) => c.claim));
  });

  // -------------------------------------------------------------------
  // Key-stream records after a different atlas.json is imported
  // -------------------------------------------------------------------

  describe("key-stream records written on top of another atlas.json", () => {
    const withDocs = (include: string[]) => baseConfig({ docs: { include } });
    function zeroClaimFile() {
      write("src/a.ts", "export function Foo() {}\n");
      const Foo = tsSym("src/a.ts", "Foo");
      return adapterFor(tmp, { "src/a.ts": [Foo] }, { [Foo.id]: "Foo doc." });
    }
    const noClaims = () => recordingClient(() => ({ claims: [] }));

    it("switching between branches whose docs.include differ does not re-bill the file either way", async () => {
      const adapter = zeroClaimFile();
      const quiet = captureWarnings();
      try {
        // main (docs.include []): the docstring stream keys src/a.ts.
        const m = noClaims();
        await run(adapter, m.client, { config: withDocs([]) });
        expect(m.bodies).toEqual(["Foo doc."]);
        const mainAtlas = readFileSync(atlasPath(), "utf8");

        // feature (docs.include matches it): prose keys it.
        const f = noClaims();
        await run(adapter, f.client, { config: withDocs(["src/a.ts"]) });
        expect(f.bodies).toHaveLength(1);
        const featureAtlas = readFileSync(atlasPath(), "utf8");

        for (let i = 0; i < 2; i++) {
          writeFileSync(atlasPath(), mainAtlas); // git checkout main
          const back = noClaims();
          const r = await run(adapter, back.client, { config: withDocs([]) });
          expect(back.bodies).toEqual([]);
          expect(r.filesDeleted).toBe(0);

          writeFileSync(atlasPath(), featureAtlas); // git checkout feature
          const again = noClaims();
          await run(adapter, again.client, { config: withDocs(["src/a.ts"]) });
          expect(again.bodies).toEqual([]);
        }
      } finally {
        quiet.restore();
      }
    });

    it("a pulled atlas.json keying the file as a docstring source keeps it frozen while the docstring stream is disabled", async () => {
      const adapter = zeroClaimFile();
      const quiet = captureWarnings();
      try {
        // This machine once had docs.include over src/a.ts: prose keyed it.
        await run(adapter, noClaims().client, { config: withDocs(["src/a.ts"]) });
        // A teammate's atlas.json keys the same file at the same SHA (their
        // docstring stream wrote it); only the file differs.
        const pulled = readAtlas();
        pulled.generated_at = "2026-09-26T00:00:00.000Z";
        writeFileSync(atlasPath(), JSON.stringify(pulled, null, 2) + "\n");

        const rec = noClaims();
        const r = await run(adapter, rec.client, {
          config: withDocs([]),
          streams: new Set<ExtractionStream>(["adr", "commit"]),
        });
        expect(rec.bodies).toEqual([]);
        expect(r.filesDeleted).toBe(0);
        expect(listSourceShas(db)["src/a.ts"]).toBeDefined();
      } finally {
        quiet.restore();
      }
    });
  });

  // -------------------------------------------------------------------
  // One unparseable prose file
  // -------------------------------------------------------------------

  it("malformed JSON on the only pending prose file is reported, but the docstring and commit streams still run", async () => {
    initGitRepo(tmp, ["design: split the router"]);
    write("docs/adr/ADR-01.md", "---\nid: ADR-01\n---\nBAD body\n");
    write("src/a.ts", "export function Foo() {}\n");
    const Foo = tsSym("src/a.ts", "Foo");
    const adapter = adapterFor(tmp, { "src/a.ts": [Foo] }, { [Foo.id]: "Foo doc." });
    const bodies: string[] = [];
    const client: ExtractionClient = {
      async extract(body: string) {
        bodies.push(body);
        if (body.includes("BAD body")) {
          throw new ParseError("json-parse", "", "malformed", { inputTokens: 700, outputTokens: 9 });
        }
        return { result: oneClaim(`claim for ${body}`), usage: { inputTokens: 100, outputTokens: 50 } };
      },
    };
    const result = await run(adapter, client, { gitBinary: "git" });
    expect(result.extractionErrors.map((e) => e.sourcePath)).toEqual(["docs/adr/ADR-01.md"]);
    expect(result.failedStreams).toEqual([]);
    expect(result.docstringFilesExtracted).toBe(1);
    expect(result.commitsExtracted).toBe(1);
    expect(bodies).toContain("Foo doc.");
    expect(bodies).toContain("design: split the router");
    expect(listAllClaims(db).map((c) => c.claim).sort()).toEqual([
      "claim for Foo doc.",
      "claim for design: split the router",
    ]);
  });

  it("a prose call that throws an API error on every file still fails the run loudly", async () => {
    write("docs/adr/ADR-01.md", "---\nid: ADR-01\n---\nbody\n");
    const client: ExtractionClient = {
      async extract() {
        throw new Error("401 invalid x-api-key");
      },
    };
    await expect(run(adapterFor(tmp, {}), client)).rejects.toThrow(
      /Extraction failed for all 1 document\(s\).*401 invalid x-api-key/,
    );
  });

  // -------------------------------------------------------------------
  // Pinned commit retry hint
  // -------------------------------------------------------------------

  it("atlas.committed: false: the pinned-commit warning points at the local cache, not atlas.json", async () => {
    initGitRepo(tmp, ["design: split the router"]);
    const config = baseConfig({
      atlas: { committed: false, path: ".contextatlas/atlas.json", localCache: ".contextatlas/index.db" },
    });
    const warnings = captureWarnings();
    await run(adapterFor(tmp, {}), recordingClient(() => null).client, {
      config,
      gitBinary: "git",
    }).finally(() => warnings.restore());
    const pin = warnings.lines.find((l) => /no parseable result/.test(l));
    expect(pin).toBeDefined();
    expect(pin).toMatch(/local cache/);
    expect(pin).toContain(pathJoin(tmp, ".contextatlas", "index.db"));
    expect(pin).toMatch(/DELETE FROM source_shas WHERE source_path = 'commit:[0-9a-f]{40}'/);
    expect(pin).not.toMatch(/from source_shas in atlas\.json/);
  });
});
