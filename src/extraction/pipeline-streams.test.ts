/**
 * v1.2 Phase 2: the three-stream CLI `index` (F-2) — docstring (6c) and
 * commit (6d) streams wired into `runExtractionPipeline`, the F-5 commit
 * key migration (Stage 0.5), the shared budget, per-stream failure
 * reporting and the cost preview.
 *
 * Harness:
 *   - a stub TS adapter that lists symbols by repo-relative path (it
 *     normalizes the absolute paths Stage 3 passes, so a relative/absolute
 *     mismatch cannot silently return no symbols) and serves docstrings by
 *     symbol id;
 *   - a recording extraction client keyed by request body, so each test
 *     can say which sources were (re-)extracted and how often;
 *   - real temporary git repositories (local identity, gpgsign off,
 *     subjects that pass the default commit filter) for the commit stream.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join as pathJoin, relative, sep } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectAtlasOnlyAvailable } from "../queries/atlas-only-mode.js";
import { listAllClaims, listSourceShas } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
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
  SymbolId,
} from "../types.js";

import { ParseError, type ExtractionClient } from "./anthropic-client.js";
import type { CostPreview } from "./cost-preview.js";
import { computeFileSha } from "./file-walker.js";
import { runExtractionPipeline } from "./pipeline.js";
import type { ExtractionResult } from "./prompt.js";

const ALL: ReadonlySet<ExtractionStream> = new Set<ExtractionStream>([
  "adr",
  "docstring",
  "commit",
]);

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

type Docstring = string | null | Error;

/**
 * Stub TS adapter. `listing` maps repo-relative path → symbols (absolute
 * or relative request paths both resolve); `docstrings` maps symbol id →
 * docstring, or an Error to make `getDocstring` throw. Paths in
 * `throwing` make `listSymbols` throw.
 */
function streamAdapter(
  root: string,
  listing: Record<string, AtlasSymbol[]>,
  docstrings: Record<SymbolId, Docstring> = {},
  throwing: ReadonlySet<string> = new Set(),
): LanguageAdapter {
  const rel = (p: string): string =>
    (isAbsolute(p) ? relative(root, p) : p).split(sep).join("/");
  return {
    language: "typescript",
    extensions: [".ts"],
    async initialize() {},
    async shutdown() {},
    async listSymbols(p: string) {
      const r = rel(p);
      if (throwing.has(r)) throw new Error(`simulated LSP failure: ${r}`);
      return listing[r] ?? [];
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
      const d = docstrings[id];
      if (d instanceof Error) throw d;
      return d ?? null;
    },
  };
}

type Reply = ExtractionResult | null | "throw";

/**
 * Extraction client keyed by request body. `respond` decides per body;
 * every request is recorded in order, so tests can count calls per
 * source and check the stream order.
 */
function recordingClient(respond: (body: string) => Reply) {
  const bodies: string[] = [];
  const client: ExtractionClient = {
    async extract(body: string) {
      bodies.push(body);
      const r = respond(body);
      if (r === "throw") throw new Error(`stub failure for: ${body.slice(0, 40)}`);
      return { result: r, usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
  return {
    client,
    bodies,
    count: (body: string) => bodies.filter((b) => b === body).length,
  };
}

function oneClaim(text: string, candidates: string[] = []): ExtractionResult {
  return {
    claims: [
      {
        symbol_candidates: candidates,
        claim: text,
        severity: "hard",
        rationale: "r",
        excerpt: "e",
      },
    ],
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
    atlas: {
      committed: true,
      path: ".contextatlas/atlas.json",
      localCache: ".contextatlas/index.db",
    },
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
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${r.status}): ${r.stderr}`);
  }
  return r.stdout.trim();
}

/** Init a git repo at `root` with one empty commit per subject; returns shas oldest-first. */
function initGitRepo(root: string, subjects: readonly string[]): string[] {
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "tester@example.com"]);
  git(root, ["config", "user.name", "Tester"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  const shas: string[] = [];
  for (const subject of subjects) {
    git(root, ["commit", "-q", "--allow-empty", "-m", subject]);
    shas.push(git(root, ["rev-parse", "HEAD"]));
  }
  return shas;
}

function captureWarnings(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown): boolean => {
      const text = String(chunk);
      if (text.includes("[warn]")) lines.push(text);
      return true;
    });
  return { lines, restore: () => spy.mockRestore() };
}

describe("runExtractionPipeline — v1.2 Phase 2 streams", () => {
  let tmp: string;
  let db: DatabaseInstance;
  let noGit: string;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-streams-"));
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    // Non-existent binary: the git signal and the commit stream both
    // take their "no git" branch without touching a real repository.
    noGit = pathJoin(tmp, "no-such-git-binary");
    db = openDatabase(":memory:");
  });
  afterEach(async () => {
    db.close();
    await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const atlasPath = () => pathJoin(tmp, ".contextatlas", "atlas.json");
  const readAtlas = () => JSON.parse(readFileSync(atlasPath(), "utf8")) as AtlasFileV1;
  const write = (rel: string, body: string): string => {
    const abs = pathJoin(tmp, ...rel.split("/"));
    mkdirSync(pathJoin(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
    return computeFileSha(abs);
  };
  /** Fresh cache, as a new CLI process would have. */
  const freshDb = () => {
    db.close();
    db = openDatabase(":memory:");
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
  const claimTexts = () => listAllClaims(db).map((c) => c.claim).sort();

  // -------------------------------------------------------------------
  // Docstring stream (Stage 6c)
  // -------------------------------------------------------------------

  describe("docstring stream", () => {
    function docFixture() {
      write("src/a.ts", "export function Foo() {}\nexport function Bar() {}\n");
      write("src/plain.ts", "export const x = 1;\n");
      const Foo = tsSym("src/a.ts", "Foo");
      const Bar = tsSym("src/a.ts", "Bar", 2);
      const X = tsSym("src/plain.ts", "x");
      const listing = { "src/a.ts": [Foo, Bar], "src/plain.ts": [X] };
      const docs: Record<SymbolId, Docstring> = {
        [Foo.id]: "Foo doc: routes must stay pure.",
        [Bar.id]: "Bar doc: never block the loop.",
      };
      return { Foo, Bar, X, listing, docs };
    }

    it("extracts one call per documented symbol, keys every walked file (zero-docstring included) and exports", async () => {
      const f = docFixture();
      const rec = recordingClient((body) =>
        body.startsWith("Foo doc")
          ? oneClaim("foo is pure", ["Bar"])
          : body.startsWith("Bar doc")
            ? oneClaim("bar never blocks")
            : "throw",
      );

      const result = await run(streamAdapter(tmp, f.listing, f.docs), rec.client);

      expect(rec.bodies).toHaveLength(2);
      expect(result.apiCalls).toBe(2);
      expect(result.inputTokens).toBe(200);
      expect(result.docstringFilesExtracted).toBe(2);
      expect(result.docstringFilesUnchanged).toBe(0);
      expect(result.docstringSymbolsExtracted).toBe(2);
      expect(result.docstringClaimsWritten).toBe(2);
      expect(result.claimsWritten).toBe(2); // widened total (L-9)
      expect(result.filesExtracted).toBe(0); // prose-only counter
      expect(result.streamsEnabled).toEqual(["adr", "docstring", "commit"]);
      expect(result.failedStreams).toEqual([]);
      const shas = listSourceShas(db);
      expect(shas["src/a.ts"]).toBe(computeFileSha(pathJoin(tmp, "src", "a.ts")));
      expect(shas["src/plain.ts"]).toBe(computeFileSha(pathJoin(tmp, "src", "plain.ts")));
      const foo = listAllClaims(db).find((c) => c.claim === "foo is pure")!;
      expect(foo.source).toBe("docstring:src/a.ts");
      expect(foo.sourcePath).toBe("src/a.ts");
      // Provenance (Foo) plus the resolved cross-reference (Bar).
      expect([...foo.symbolIds].sort()).toEqual([f.Bar.id, f.Foo.id]);
      expect(result.atlasExported).toBe(true);
      const exported = readAtlas();
      expect(Object.keys(exported.source_shas).sort()).toEqual(["src/a.ts", "src/plain.ts"]);
      expect(exported.claims.map((c) => c.claim).sort()).toEqual(["bar never blocks", "foo is pure"]);
    });

    it("SHA gating: an unchanged rerun makes no call and leaves atlas.json byte-identical; only the changed file is re-extracted", async () => {
      const f = docFixture();
      const reply = (body: string): Reply =>
        body.startsWith("Foo doc") ? oneClaim("foo v1") : oneClaim("bar v1");
      const adapter = streamAdapter(tmp, f.listing, f.docs);
      await run(adapter, recordingClient(reply).client);
      const bytes1 = readFileSync(atlasPath(), "utf8");

      freshDb();
      const noop = recordingClient(() => "throw");
      const second = await run(adapter, noop.client);
      expect(noop.bodies).toEqual([]);
      expect(second.apiCalls).toBe(0);
      expect(second.docstringFilesUnchanged).toBe(2);
      expect(second.atlasExported).toBe(false);
      expect(readFileSync(atlasPath(), "utf8")).toBe(bytes1);

      // Edit a.ts: only its two symbols are re-extracted; its old claims
      // are replaced, not duplicated.
      write("src/a.ts", "export function Foo() {}\nexport function Bar() {}\n// edit\n");
      freshDb();
      const third = recordingClient((body) =>
        body.startsWith("Foo doc") ? oneClaim("foo v2") : oneClaim("bar v2"),
      );
      const r3 = await run(adapter, third.client);
      expect(third.bodies).toHaveLength(2);
      expect(r3.docstringFilesExtracted).toBe(1);
      expect(r3.docstringFilesUnchanged).toBe(1);
      expect(claimTexts()).toEqual(["bar v2", "foo v2"]);
      expect(listSourceShas(db)["src/a.ts"]).toBe(computeFileSha(pathJoin(tmp, "src", "a.ts")));
    });

    it("a file whose listSymbols failed is neither extracted nor re-keyed", async () => {
      const f = docFixture();
      await run(streamAdapter(tmp, f.listing, f.docs), recordingClient(() => oneClaim("c")).client);
      const oldKey = listSourceShas(db)["src/a.ts"];
      write("src/a.ts", "export function Foo() {}\n// changed while LSP is down\n");
      freshDb();
      const rec = recordingClient(() => "throw");
      const result = await run(
        streamAdapter(tmp, f.listing, f.docs, new Set(["src/a.ts"])),
        rec.client,
      );
      expect(rec.bodies).toEqual([]);
      expect(result.docstringFilesExtracted).toBe(0);
      expect(listSourceShas(db)["src/a.ts"]).toBe(oldKey);
    });

    it("an error or null result on one symbol keeps the file's old claims and key, reports it, and the next run retries the file", async () => {
      const f = docFixture();
      const adapter = streamAdapter(tmp, f.listing, f.docs);
      await run(adapter, recordingClient((b) => (b.startsWith("Foo") ? oneClaim("foo v1") : oneClaim("bar v1"))).client);
      const oldKey = listSourceShas(db)["src/a.ts"];
      write("src/a.ts", "export function Foo() {}\nexport function Bar() {}\n// v2\n");

      for (const failure of ["throw", null] as const) {
        freshDb();
        const rec = recordingClient((b) => (b.startsWith("Foo") ? oneClaim("foo v2") : failure));
        const result = await run(adapter, rec.client);
        expect(listSourceShas(db)["src/a.ts"]).toBe(oldKey);
        expect(claimTexts()).toEqual(["bar v1", "foo v1"]);
        expect(result.docstringFilesExtracted).toBe(0);
        expect(result.extractionErrors).toHaveLength(1);
        expect(result.extractionErrors[0]!.sourcePath).toBe("src/a.ts");
        expect(result.extractionErrors[0]!.error).toContain(f.Bar.id);
        // Not every attempted call failed (Foo's succeeded).
        expect(result.failedStreams).toEqual([]);
      }

      freshDb();
      const retry = recordingClient((b) => (b.startsWith("Foo") ? oneClaim("foo v2") : oneClaim("bar v2")));
      const r = await run(adapter, retry.client);
      expect(retry.bodies).toHaveLength(2);
      expect(r.docstringFilesExtracted).toBe(1);
      expect(claimTexts()).toEqual(["bar v2", "foo v2"]);
    });

    it("a zero-docstring file is keyed once and is a no-op afterwards", async () => {
      write("src/plain.ts", "export const x = 1;\n");
      const adapter = streamAdapter(tmp, { "src/plain.ts": [tsSym("src/plain.ts", "x")] });
      const first = await run(adapter, recordingClient(() => "throw").client);
      expect(first.apiCalls).toBe(0);
      expect(first.docstringFilesExtracted).toBe(1);
      expect(first.atlasExported).toBe(true);
      const bytes = readFileSync(atlasPath(), "utf8");
      freshDb();
      const second = await run(adapter, recordingClient(() => "throw").client);
      expect(second.atlasExported).toBe(false);
      expect(readFileSync(atlasPath(), "utf8")).toBe(bytes);
    });

    it("every docstring call failing marks the stream failed but the run finishes and exports the other streams' work (L-10 ii)", async () => {
      const f = docFixture();
      write("docs/adr/ADR-01.md", "---\nid: ADR-01\n---\nADR body\n");
      const rec = recordingClient((b) => (b.includes("ADR body") ? oneClaim("adr rule") : "throw"));
      const result = await run(streamAdapter(tmp, f.listing, f.docs), rec.client);
      expect(result.failedStreams).toHaveLength(1);
      expect(result.failedStreams[0]!.stream).toBe("docstring");
      expect(result.failedStreams[0]!.attemptedCalls).toBe(1); // a.ts stops at its first failure
      expect(result.failedStreams[0]!.firstError).toContain(f.Foo.id);
      expect(result.filesExtracted).toBe(1);
      expect(result.atlasExported).toBe(true);
      expect(readAtlas().claims.map((c) => c.claim)).toEqual(["adr rule"]);
      expect(listSourceShas(db)["src/a.ts"]).toBeUndefined();
      // plain.ts needed no call and was keyed.
      expect(listSourceShas(db)["src/plain.ts"]).toBeDefined();
    });

    it("unparseable results on every docstring call are per-source noise: reported, retried, but the stream is not failed", async () => {
      const f = docFixture();
      const adapter = streamAdapter(tmp, f.listing, f.docs);
      for (let runNo = 0; runNo < 2; runNo++) {
        freshDb();
        const rec = recordingClient(() => null);
        const result = await run(adapter, rec.client);
        // a.ts stops at its first unparseable result; it is retried each run.
        expect(rec.bodies).toHaveLength(1);
        expect(result.failedStreams).toEqual([]);
        expect(result.extractionErrors).toHaveLength(1);
        expect(result.extractionErrors[0]!.sourcePath).toBe("src/a.ts");
        expect(result.extractionErrors[0]!.error).toMatch(/no parseable result/);
        expect(listSourceShas(db)["src/a.ts"]).toBeUndefined();
        // The unparseable call was billed and is counted.
        expect(result.inputTokens).toBe(100);
      }
    });

    it("the stream-failure firstError is the first failed call, not an earlier getDocstring read error", async () => {
      write("src/a.ts", "export function A() {}\n");
      write("src/b.ts", "export function B() {}\n");
      const A = tsSym("src/a.ts", "A");
      const B = tsSym("src/b.ts", "B");
      const adapter = streamAdapter(
        tmp,
        { "src/a.ts": [A], "src/b.ts": [B] },
        { [A.id]: new Error("hover request timed out"), [B.id]: "B doc." },
      );
      const rec = recordingClient(() => "throw");
      const result = await run(adapter, rec.client);
      expect(rec.bodies).toEqual(["B doc."]);
      expect(result.failedStreams).toHaveLength(1);
      const first = result.failedStreams[0]!.firstError;
      expect(first).toContain(B.id);
      expect(first).toMatch(/stub failure/);
      expect(first).not.toMatch(/hover request timed out/);
      // The read error is still reported per source.
      expect(result.extractionErrors.map((e) => e.sourcePath).sort()).toEqual([
        "src/a.ts",
        "src/b.ts",
      ]);
    });

    it("library default (no deps.streams) stays prose-only: a changed docstring source keeps its claims and key (L-1 b)", async () => {
      const f = docFixture();
      const adapter = streamAdapter(tmp, f.listing, f.docs);
      await run(adapter, recordingClient((b) => (b.startsWith("Foo") ? oneClaim("foo v1") : oneClaim("bar v1"))).client);
      const oldKey = listSourceShas(db)["src/a.ts"];
      write("src/a.ts", "export function Foo() {}\n// edited\n");
      freshDb();
      const rec = recordingClient(() => "throw");
      const result = await runExtractionPipeline({
        repoRoot: tmp,
        config: baseConfig(),
        db,
        anthropicClient: rec.client,
        adapters: new Map<LanguageCode, LanguageAdapter>([["typescript", adapter]]),
        gitBinary: noGit,
      });
      expect(rec.bodies).toEqual([]);
      expect(result.streamsEnabled).toEqual(["adr"]);
      expect(result.docstringFilesExtracted).toBe(0);
      expect(listSourceShas(db)["src/a.ts"]).toBe(oldKey);
      expect(claimTexts()).toEqual(["bar v1", "foo v1"]);
    });
  });

  // -------------------------------------------------------------------
  // Stage 5 docstring keys (L-11)
  // -------------------------------------------------------------------

  describe("Stage 5: docstring keys of files that exist but are no longer walked (L-11)", () => {
    function seedAtlas(sourceShas: Record<string, string>, claims: AtlasClaimEntry[], symbols: AtlasSymbolEntry[] = []) {
      const atlas: AtlasFileV1 = {
        version: "1.4",
        generated_at: "2026-09-01T00:00:00.000Z",
        generator: { contextatlas_version: "1.1.3", extraction_model: "claude-opus-4-7" },
        source_shas: sourceShas,
        symbols,
        claims,
      };
      writeFileSync(atlasPath(), JSON.stringify(atlas, null, 2));
    }
    const docClaim = (rel: string, sha: string, text: string): AtlasClaimEntry => ({
      source: `docstring:${rel}`,
      source_path: rel,
      source_sha: sha,
      severity: "hard",
      claim: text,
      symbol_ids: [],
    });

    it("deletes an excluded file's key + claims when a configured adapter owns it; keeps a key whose language is not configured", async () => {
      const genSha = write("src/gen.ts", "export const g = 1;\n");
      const pySha = write("pkg/mod.py", "class Thing: pass\n");
      seedAtlas(
        { "src/gen.ts": genSha, "pkg/mod.py": pySha },
        [docClaim("src/gen.ts", genSha, "gen doc"), docClaim("pkg/mod.py", pySha, "py doc")],
      );
      const result = await run(streamAdapter(tmp, {}), recordingClient(() => "throw").client, {
        config: baseConfig({ extraction: { excludePattern: ["src/gen.ts"] } }),
      });
      expect(result.docstringSourcesDeleted).toBe(1);
      const shas = listSourceShas(db);
      expect(shas["src/gen.ts"]).toBeUndefined();
      expect(shas["pkg/mod.py"]).toBe(pySha);
      expect(claimTexts()).toEqual(["py doc"]);
      expect(result.atlasExported).toBe(true);
    });

    it("keeps an excluded file's docstring key and claims when the docstring stream is disabled (frozen)", async () => {
      const genSha = write("src/gen.ts", "export const g = 1;\n");
      seedAtlas({ "src/gen.ts": genSha }, [docClaim("src/gen.ts", genSha, "gen doc")]);
      const result = await run(streamAdapter(tmp, {}), recordingClient(() => "throw").client, {
        config: baseConfig({ extraction: { excludePattern: ["src/gen.ts"] } }),
        streams: new Set<ExtractionStream>(["adr"]),
      });
      expect(result.docstringSourcesDeleted).toBe(0);
      expect(listSourceShas(db)["src/gen.ts"]).toBe(genSha);
      expect(claimTexts()).toEqual(["gen doc"]);
    });
  });

  // -------------------------------------------------------------------
  // Gating and --full
  // -------------------------------------------------------------------

  describe("stream gating and --full (L-6, L-7)", () => {
    it("adr disabled (library set): prose is walked but not extracted; its claims and keys are unchanged", async () => {
      const adrSha = write("docs/adr/ADR-01.md", "ADR body v1\n");
      const atlas: AtlasFileV1 = {
        version: "1.4",
        generated_at: "2026-09-01T00:00:00.000Z",
        generator: { contextatlas_version: "1.1.3", extraction_model: "claude-opus-4-7" },
        source_shas: { "docs/adr/ADR-01.md": adrSha },
        symbols: [],
        claims: [
          {
            source: "adr:ADR-01.md",
            source_path: "docs/adr/ADR-01.md",
            source_sha: adrSha,
            severity: "hard",
            claim: "old rule",
            symbol_ids: [],
          },
        ],
      };
      writeFileSync(atlasPath(), JSON.stringify(atlas));
      write("docs/adr/ADR-01.md", "ADR body v2\n");
      const rec = recordingClient(() => "throw");
      const result = await run(streamAdapter(tmp, {}), rec.client, {
        streams: new Set<ExtractionStream>(["docstring"]),
      });
      expect(rec.bodies).toEqual([]);
      expect(result.filesExtracted).toBe(0);
      expect(result.filesDeleted).toBe(0);
      expect(listSourceShas(db)["docs/adr/ADR-01.md"]).toBe(adrSha);
      expect(claimTexts()).toEqual(["old rule"]);
    });

    it("runs prose, then docstring, then commit whatever order the set lists them in", async () => {
      write("docs/adr/ADR-01.md", "ADR body\n");
      write("src/a.ts", "export function Foo() {}\n");
      const Foo = tsSym("src/a.ts", "Foo");
      initGitRepo(tmp, ["design: split the router"]);
      const rec = recordingClient(() => ({ claims: [] }));
      await run(streamAdapter(tmp, { "src/a.ts": [Foo] }, { [Foo.id]: "Foo doc" }), rec.client, {
        streams: new Set<ExtractionStream>(["commit", "docstring", "adr"]),
        gitBinary: "git",
      });
      expect(rec.bodies).toEqual(["ADR body\n", "Foo doc", "design: split the router"]);
    });

    it("--full re-extracts prose and docstring files but leaves commits key-gated", async () => {
      write("docs/adr/ADR-01.md", "ADR body\n");
      write("src/a.ts", "export function Foo() {}\n");
      const Foo = tsSym("src/a.ts", "Foo");
      initGitRepo(tmp, ["design: split the router"]);
      const adapter = streamAdapter(tmp, { "src/a.ts": [Foo] }, { [Foo.id]: "Foo doc" });
      await run(adapter, recordingClient(() => ({ claims: [] })).client, { gitBinary: "git" });

      freshDb();
      const rec = recordingClient(() => ({ claims: [] }));
      const result = await run(adapter, rec.client, { gitBinary: "git", skipShaDiff: true });
      expect(rec.bodies).toEqual(["ADR body\n", "Foo doc"]);
      expect(result.commitsSkipped).toBe(1);
      expect(result.commitsExtracted).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // Commit stream (Stage 6d) + F-5
  // -------------------------------------------------------------------

  describe("commit stream", () => {
    it("skips with zero calls when the tree is not a git repository, or git cannot run", async () => {
      for (const gitBinary of [noGit, "git"]) {
        freshDb();
        const rec = recordingClient(() => "throw");
        const result = await run(streamAdapter(tmp, {}), rec.client, { gitBinary });
        expect(rec.bodies).toEqual([]);
        expect(result.apiCalls).toBe(0);
        expect(result.commitsExtracted).toBe(0);
        expect(result.extractionErrors).toEqual([]);
        expect(result.failedStreams).toEqual([]);
      }
    });

    it("extracts filter-passing commits under canonical commit:<sha> keys and skips them on the next run", async () => {
      const [design, , refactor] = initGitRepo(tmp, [
        "design: split the router",
        "chore: bump deps",
        "refactor: extract the matcher",
      ]);
      const rec = recordingClient((b) =>
        b.startsWith("design") ? oneClaim("router is split") : { claims: [] },
      );
      const result = await run(streamAdapter(tmp, {}), rec.client, { gitBinary: "git" });
      expect(rec.bodies.sort()).toEqual(["design: split the router", "refactor: extract the matcher"]);
      expect(result.commitsExtracted).toBe(2);
      expect(result.commitClaimsWritten).toBe(1);
      expect(result.commitsSkipped).toBe(0);
      const shas = listSourceShas(db);
      expect(shas[`commit:${design}`]).toBe(design);
      expect(shas[`commit:${refactor}`]).toBe(refactor);
      const c = listAllClaims(db).find((x) => x.claim === "router is split")!;
      expect(c.source).toBe(`commit:${design}`);
      expect(c.sourcePath).toBe(`commit:${design}`);
      expect(result.atlasExported).toBe(true);
      const bytes = readFileSync(atlasPath(), "utf8");

      // Second run at the same HEAD: nothing to do, atlas byte-identical.
      freshDb();
      const again = recordingClient(() => "throw");
      const second = await run(streamAdapter(tmp, {}), again.client, { gitBinary: "git" });
      expect(again.bodies).toEqual([]);
      expect(second.commitsSkipped).toBe(2);
      expect(second.atlasExported).toBe(false);
      expect(readFileSync(atlasPath(), "utf8")).toBe(bytes);
    });

    it("F-5: migrates a Skill-shaped bare-sha atlas to commit:<sha>, does not re-extract it, exports, and is a no-op afterwards", async () => {
      const [sha] = initGitRepo(tmp, ["design: split the router"]);
      const head = sha!;
      const atlas: AtlasFileV1 = {
        version: "1.4",
        generated_at: "2026-09-01T00:00:00.000Z",
        generator: { contextatlas_version: "1.1.3", extraction_model: "claude-opus-4-7" },
        extracted_at_sha: head,
        source_shas: { [head]: head },
        symbols: [],
        claims: [
          {
            source: `commit:${head}`,
            source_path: head,
            source_sha: head,
            severity: "hard",
            claim: "skill commit claim",
            symbol_ids: [],
          },
        ],
      };
      writeFileSync(atlasPath(), JSON.stringify(atlas, null, 2));
      const rec = recordingClient(() => "throw");
      const result = await run(streamAdapter(tmp, {}), rec.client, { gitBinary: "git" });
      expect(rec.bodies).toEqual([]);
      expect(result.commitKeysMigrated).toBe(1);
      expect(result.commitsSkipped).toBe(1);
      expect(result.atlasExported).toBe(true);
      const exported = readAtlas();
      expect(exported.source_shas).toEqual({ [`commit:${head}`]: head });
      expect(exported.claims[0]!.source_path).toBe(`commit:${head}`);
      const bytes = readFileSync(atlasPath(), "utf8");

      freshDb();
      const second = await run(streamAdapter(tmp, {}), recordingClient(() => "throw").client, { gitBinary: "git" });
      expect(second.commitKeysMigrated).toBe(0);
      expect(second.atlasExported).toBe(false);
      expect(readFileSync(atlasPath(), "utf8")).toBe(bytes);
    });

    it("F-5: a sha stored in both forms keeps the commit:<sha> claims and drops the bare duplicates", async () => {
      const [sha] = initGitRepo(tmp, ["design: split the router"]);
      const head = sha!;
      const claimOf = (path: string, text: string): AtlasClaimEntry => ({
        source: `commit:${head}`,
        source_path: path,
        source_sha: head,
        severity: "hard",
        claim: text,
        symbol_ids: [],
      });
      writeFileSync(
        atlasPath(),
        JSON.stringify({
          version: "1.4",
          generated_at: "2026-09-01T00:00:00.000Z",
          generator: { contextatlas_version: "1.1.3", extraction_model: "claude-opus-4-7" },
          extracted_at_sha: head,
          source_shas: { [head]: head, [`commit:${head}`]: head },
          symbols: [],
          claims: [claimOf(head, "bare copy"), claimOf(`commit:${head}`, "canonical copy")],
        }),
      );
      const result = await run(streamAdapter(tmp, {}), recordingClient(() => "throw").client, { gitBinary: "git" });
      expect(result.commitKeysMigrated).toBe(1);
      expect(claimTexts()).toEqual(["canonical copy"]);
      expect(listSourceShas(db)).toEqual({ [`commit:${head}`]: head });
    });

    it("a null result pins the commit key with zero claims and is not retried (L-10 iii)", async () => {
      const [sha] = initGitRepo(tmp, ["design: split the router"]);
      const warnings = captureWarnings();
      const result = await run(streamAdapter(tmp, {}), recordingClient(() => null).client, {
        gitBinary: "git",
      }).finally(() => warnings.restore());
      expect(result.commitsExtracted).toBe(1);
      expect(result.commitClaimsWritten).toBe(0);
      expect(result.failedStreams).toEqual([]);
      expect(listSourceShas(db)[`commit:${sha}`]).toBe(sha);
      expect(warnings.lines.some((l) => l.includes(`commit:${sha}`))).toBe(true);
      freshDb();
      const again = recordingClient(() => "throw");
      await run(streamAdapter(tmp, {}), again.client, { gitBinary: "git" });
      expect(again.bodies).toEqual([]);
    });

    it("malformed JSON (ParseError) on the only pending commit pins it, counts its cost and does not fail the stream", async () => {
      const [sha] = initGitRepo(tmp, ["design: split the router"]);
      let calls = 0;
      const client: ExtractionClient = {
        async extract() {
          calls++;
          throw new ParseError("json-parse", "Here are the claims:", "malformed JSON", {
            inputTokens: 1500,
            outputTokens: 30,
          });
        },
      };
      const warnings = captureWarnings();
      const result = await run(streamAdapter(tmp, {}), client, {
        gitBinary: "git",
      }).finally(() => warnings.restore());
      expect(result.failedStreams).toEqual([]);
      expect(result.commitsExtracted).toBe(1);
      expect(result.extractionErrors).toEqual([]);
      expect(result.apiCalls).toBe(1);
      expect(result.inputTokens).toBe(1500);
      expect(result.costUsd).toBeGreaterThan(0);
      expect(listSourceShas(db)[`commit:${sha}`]).toBe(sha);
      freshDb();
      await run(streamAdapter(tmp, {}), client, { gitBinary: "git" });
      expect(calls).toBe(1);
    });

    it("every commit call failing marks the stream failed, still exports, and leaves the commits unkeyed for a retry", async () => {
      const [sha] = initGitRepo(tmp, ["design: split the router"]);
      const result = await run(streamAdapter(tmp, {}), recordingClient(() => "throw").client, {
        gitBinary: "git",
      });
      expect(result.failedStreams.map((f) => f.stream)).toEqual(["commit"]);
      expect(result.extractionErrors).toEqual([
        { sourcePath: `commit:${sha}`, error: expect.stringContaining("stub failure") },
      ]);
      expect(result.atlasExported).toBe(true); // git state advanced
      expect(listSourceShas(db)[`commit:${sha}`]).toBeUndefined();
      freshDb();
      const retry = recordingClient(() => ({ claims: [] }));
      await run(streamAdapter(tmp, {}), retry.client, { gitBinary: "git" });
      expect(retry.bodies).toEqual(["design: split the router"]);
    });
  });

  // -------------------------------------------------------------------
  // Run-level behaviour
  // -------------------------------------------------------------------

  describe("run level", () => {
    const budgetWarnings = (lines: string[]) => lines.filter((l) => l.includes("budget warning"));

    it("a prose file whose response is malformed JSON stays an error, but its billed usage is counted", async () => {
      write("docs/adr/ADR-01.md", "---\nid: ADR-01\n---\nADR body\n");
      write("docs/adr/ADR-02.md", "---\nid: ADR-02\n---\nsecond body\n");
      const client: ExtractionClient = {
        async extract(body: string) {
          if (body.includes("ADR body")) {
            throw new ParseError("json-parse", "", "malformed", { inputTokens: 700, outputTokens: 9 });
          }
          return { result: oneClaim("second rule"), usage: { inputTokens: 100, outputTokens: 50 } };
        },
      };
      const result = await run(streamAdapter(tmp, {}), client);
      expect(result.extractionErrors.map((e) => e.sourcePath)).toEqual(["docs/adr/ADR-01.md"]);
      expect(result.inputTokens).toBe(800);
      expect(result.outputTokens).toBe(59);
    });

    it("the budget warning fires on docstring spend alone", async () => {
      write("src/a.ts", "export function Foo() {}\n");
      const Foo = tsSym("src/a.ts", "Foo");
      const warnings = captureWarnings();
      await run(streamAdapter(tmp, { "src/a.ts": [Foo] }, { [Foo.id]: "Foo doc" }), recordingClient(() => ({ claims: [] })).client, {
        budgetWarnUsd: 0,
      }).finally(() => warnings.restore());
      expect(budgetWarnings(warnings.lines)).toHaveLength(1);
    });

    it("the budget warning fires on commit spend alone", async () => {
      initGitRepo(tmp, ["design: split the router"]);
      const warnings = captureWarnings();
      await run(streamAdapter(tmp, {}), recordingClient(() => ({ claims: [] })).client, {
        gitBinary: "git",
        budgetWarnUsd: 0,
      }).finally(() => warnings.restore());
      expect(budgetWarnings(warnings.lines)).toHaveLength(1);
    });

    it("the orphan report (6b) runs after 6c: a docstring claim replaced by re-extraction is not reported orphaned", async () => {
      const oldSha = "0".repeat(40);
      const Foo = tsSym("src/a.ts", "Foo");
      const Bar = tsSym("src/a.ts", "Bar", 2);
      const atlas: AtlasFileV1 = {
        version: "1.4",
        generated_at: "2026-09-01T00:00:00.000Z",
        generator: { contextatlas_version: "1.1.3", extraction_model: "claude-opus-4-7" },
        source_shas: { "src/a.ts": oldSha },
        symbols: [Foo, Bar].map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
          path: s.path,
          line: s.line,
          file_sha: oldSha,
        })),
        claims: [
          {
            source: "docstring:src/a.ts",
            source_path: "src/a.ts",
            source_sha: oldSha,
            severity: "hard",
            claim: "bar doc",
            symbol_ids: [Bar.id],
          },
        ],
      };
      writeFileSync(atlasPath(), JSON.stringify(atlas));
      // Bar was removed from the file: the prune drops it, orphaning "bar doc".
      write("src/a.ts", "export function Foo() {}\n");
      const adapter = streamAdapter(tmp, { "src/a.ts": [Foo] }, { [Foo.id]: "Foo doc" });

      const withStream = await run(adapter, recordingClient(() => oneClaim("foo doc")).client);
      expect(withStream.symbolsPruned).toBe(1);
      expect(withStream.claimsOrphaned).toBe(0);
      expect(claimTexts()).toEqual(["foo doc"]);

      // Contrast: prose-only library default keeps the stale claim, orphaned.
      writeFileSync(atlasPath(), JSON.stringify(atlas));
      freshDb();
      const proseOnly = await run(adapter, recordingClient(() => "throw").client, {
        streams: new Set<ExtractionStream>(["adr"]),
      });
      expect(proseOnly.claimsOrphaned).toBe(1);
    });

    it("three-stream no-op: the second run at an unchanged HEAD makes no call and leaves atlas.json byte-identical", async () => {
      write("docs/adr/ADR-01.md", "ADR body\n");
      write("src/a.ts", "export function Foo() {}\n");
      const Foo = tsSym("src/a.ts", "Foo");
      initGitRepo(tmp, ["design: split the router"]);
      const adapter = streamAdapter(tmp, { "src/a.ts": [Foo] }, { [Foo.id]: "Foo doc" });
      const first = await run(adapter, recordingClient(() => oneClaim("c", ["Foo"])).client, { gitBinary: "git" });
      expect(first.apiCalls).toBe(3);
      const bytes = readFileSync(atlasPath(), "utf8");

      freshDb();
      const rec = recordingClient(() => "throw");
      const second = await run(adapter, rec.client, { gitBinary: "git" });
      expect(rec.bodies).toEqual([]);
      expect(second.apiCalls).toBe(0);
      expect(second.atlasExported).toBe(false);
      expect(readFileSync(atlasPath(), "utf8")).toBe(bytes);
    });

    it("cost preview: reported once before any model call with per-stream planned calls; not reported when nothing is planned", async () => {
      write("docs/adr/ADR-01.md", "ADR body\n");
      write("src/a.ts", "export function Foo() {}\nexport function Bar() {}\n");
      const Foo = tsSym("src/a.ts", "Foo");
      const Bar = tsSym("src/a.ts", "Bar", 2);
      const adapter = streamAdapter(tmp, { "src/a.ts": [Foo, Bar] }, { [Foo.id]: "Foo doc", [Bar.id]: "Bar doc" });
      const previews: CostPreview[] = [];
      let callsAtPreview = -1;
      const rec = recordingClient(() => ({ claims: [] }));
      await run(adapter, rec.client, {
        streams: new Set<ExtractionStream>(["adr", "docstring"]),
        onCostPreview: (p) => {
          callsAtPreview = rec.bodies.length;
          previews.push(p);
        },
      });
      expect(previews).toHaveLength(1);
      expect(callsAtPreview).toBe(0);
      const p = previews[0]!;
      expect(p.calls).toBe(3);
      expect(p.streams.map((s) => [s.stream, s.calls])).toEqual([
        ["adr", 1],
        ["docstring", 2],
      ]);
      expect(p.disabled).toEqual(["commit"]);
      expect(p.costLowUsd).toBeGreaterThan(0);
      expect(p.costHighUsd).toBeGreaterThan(p.costLowUsd);

      freshDb();
      const none: CostPreview[] = [];
      await run(adapter, recordingClient(() => "throw").client, {
        streams: new Set<ExtractionStream>(["adr", "docstring"]),
        onCostPreview: (p2) => none.push(p2),
      });
      expect(none).toEqual([]);
    });
  });

  // -------------------------------------------------------------------
  // Interrupted runs: checkpoint exports (v1.2 Phase 2 simplification)
  // -------------------------------------------------------------------

  describe("checkpoint exports: an interrupted run keeps its completed units in atlas.json", () => {
    function threeDocFiles() {
      const listing: Record<string, AtlasSymbol[]> = {};
      const docs: Record<SymbolId, Docstring> = {};
      for (const n of ["a", "b", "c"]) {
        write(`src/${n}.ts`, `export function F${n}() {}\n`);
        const s = tsSym(`src/${n}.ts`, `F${n}`);
        listing[`src/${n}.ts`] = [s];
        docs[s.id] = `doc ${n}`;
      }
      return streamAdapter(tmp, listing, docs);
    }
    /** Succeeds for the first `okCalls` calls, then crashes the run. */
    function crashingClient(okCalls: number): ExtractionClient {
      let calls = 0;
      return {
        async extract(body: string) {
          calls++;
          if (calls <= okCalls) {
            return { result: oneClaim(`claim for ${body}`), usage: { inputTokens: 100, outputTokens: 50 } };
          }
          // A result whose claims cannot be read escapes every per-unit
          // handler: the stand-in for a kill or crash mid-run.
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
    const EVERY_UNIT = { checkpointIntervalMs: 0 };
    const tmpLeft = () => existsSync(`${atlasPath()}.tmp`);

    for (const nextCache of ["a fresh cache", "the same cache"] as const) {
      it(`a run killed mid-docstring stream: atlas.json holds the stored files, and the next run on ${nextCache} bills only the rest`, async () => {
        const adapter = threeDocFiles();
        await expect(run(adapter, crashingClient(2), EVERY_UNIT)).rejects.toThrow(/simulated crash/);
        // Nothing depends on the cache: atlas.json alone carries the work.
        expect(Object.keys(readAtlas().source_shas).sort()).toEqual(["src/a.ts", "src/b.ts"]);
        expect(readAtlas().claims.map((c) => c.claim).sort()).toEqual([
          "claim for doc a",
          "claim for doc b",
        ]);
        expect(tmpLeft()).toBe(false);

        if (nextCache === "a fresh cache") freshDb();
        const rec = recordingClient((b) => oneClaim(`claim for ${b}`));
        const result = await run(adapter, rec.client, EVERY_UNIT);
        expect(rec.bodies).toEqual(["doc c"]);
        expect(result.docstringFilesUnchanged).toBe(2);
        expect(result.atlasExported).toBe(true);
        expect(Object.keys(readAtlas().source_shas).sort()).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
        expect(readAtlas().claims.map((c) => c.claim).sort()).toEqual([
          "claim for doc a",
          "claim for doc b",
          "claim for doc c",
        ]);
      });
    }

    it("the checkpoint at the end of the prose stream saves the prose files before the docstring stream starts (long interval)", async () => {
      write("docs/adr/ADR-01.md", "---\nid: ADR-01\n---\nThe router stays pure.\n");
      const adapter = threeDocFiles();
      // Call 1 is the ADR (prose runs first); call 2, doc a, crashes.
      await expect(
        run(adapter, crashingClient(1), { checkpointIntervalMs: 3_600_000 }),
      ).rejects.toThrow(/simulated crash/);
      expect(Object.keys(readAtlas().source_shas)).toEqual(["docs/adr/ADR-01.md"]);
      expect(readAtlas().claims.map((c) => c.source)).toEqual(["adr:ADR-01.md"]);

      freshDb();
      const rec = recordingClient((b) => oneClaim(`claim for ${b}`));
      await run(adapter, rec.client);
      expect(rec.bodies).toEqual(["doc a", "doc b", "doc c"]);
    });

    it("the checkpoint at the end of the docstring stream saves the docstring files before the commit stream starts (long interval)", async () => {
      initGitRepo(tmp, ["design: split the router"]);
      const adapter = threeDocFiles();
      // Calls 1-3 are the docstring files; call 4, the commit, crashes.
      await expect(
        run(adapter, crashingClient(3), { checkpointIntervalMs: 3_600_000, gitBinary: "git" }),
      ).rejects.toThrow(/simulated crash/);
      expect(Object.keys(readAtlas().source_shas).sort()).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);

      freshDb();
      const rec = recordingClient((b) => oneClaim(`claim for ${b}`));
      await run(adapter, rec.client, { gitBinary: "git" });
      expect(rec.bodies).toEqual(["design: split the router"]);
    });

    it("a keyed commit is a checkpoint unit: a run killed mid-commit stream keeps the commits it keyed, and the next run bills only the rest", async () => {
      initGitRepo(tmp, ["design: split the router", "arch: move auth"]);
      const adapter = streamAdapter(tmp, {});
      await expect(
        run(adapter, crashingClient(1), { ...EVERY_UNIT, gitBinary: "git" }),
      ).rejects.toThrow(/simulated crash/);
      const keys = Object.keys(readAtlas().source_shas);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatch(/^commit:[0-9a-f]{40}$/);

      freshDb();
      const rec = recordingClient((b) => oneClaim(`claim for ${b}`));
      const result = await run(adapter, rec.client, { ...EVERY_UNIT, gitBinary: "git" });
      expect(rec.bodies).toHaveLength(1);
      expect(result.commitsSkipped).toBe(1);
      expect(Object.keys(readAtlas().source_shas)).toHaveLength(2);
    });

    it("each checkpoint logs one info line; only the final export logs `atlas.json written`", async () => {
      const adapter = threeDocFiles();
      const infos: string[] = [];
      const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown): boolean => {
        const text = String(chunk);
        if (text.includes("[info]")) infos.push(text);
        return true;
      });
      try {
        await run(adapter, recordingClient((b) => oneClaim(`claim for ${b}`)).client, EVERY_UNIT);
      } finally {
        spy.mockRestore();
      }
      expect(infos.filter((l) => /pipeline: checkpoint: atlas\.json holds/.test(l))).toHaveLength(3);
      expect(infos.filter((l) => /pipeline: atlas\.json written/.test(l))).toHaveLength(1);
    });

    it("killed after the last unit, before Stage 7: atlas.json already holds every unit, and the next run makes no call", async () => {
      const adapter = threeDocFiles();
      // Checkpoints and Stage 7 both go through finalizeAtlas; the fourth
      // time it writes atlas_meta is Stage 7, after three checkpoints.
      const original = db.prepare.bind(db);
      let finalizes = 0;
      const spy = vi.spyOn(db, "prepare").mockImplementation((sql: string) => {
        if (/INSERT INTO atlas_meta.*ON CONFLICT/s.test(sql) && ++finalizes === 4) {
          throw new Error("simulated crash before Stage 7");
        }
        return original(sql);
      });
      const client = recordingClient((b) => oneClaim(`claim for ${b}`));
      await expect(run(adapter, client.client, EVERY_UNIT)).rejects.toThrow(/before Stage 7/);
      spy.mockRestore();
      expect(Object.keys(readAtlas().source_shas).sort()).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);

      freshDb();
      const noop = recordingClient(() => "throw");
      await run(adapter, noop.client, EVERY_UNIT);
      expect(noop.bodies).toEqual([]);
    });

    it("a checkpoint keeps the extracted_at_sha the run started from; only a finished run stamps HEAD (real git)", async () => {
      const [h1] = initGitRepo(tmp, ["chore: start"]);
      const adapter = threeDocFiles();
      const gitRun = (client: ExtractionClient) =>
        run(adapter, client, { ...EVERY_UNIT, gitBinary: "git" });

      // First run, interrupted: no extracted_at_sha at all, so init's
      // skip and atlas-only mode do not take it as current.
      await expect(gitRun(crashingClient(1))).rejects.toThrow(/simulated crash/);
      expect(readAtlas().extracted_at_sha).toBeUndefined();
      expect(await detectAtlasOnlyAvailable(atlasPath(), h1!)).toBeNull();

      // Finished: stamped.
      await gitRun(recordingClient((b) => oneClaim(`claim for ${b}`)).client);
      expect(readAtlas().extracted_at_sha).toBe(h1);

      // A new commit, then an interrupted run: the checkpoint keeps h1, so
      // the atlas reads stale at h2, as it did before the run.
      write("src/a.ts", "export function Fa() { return 1; }\n");
      git(tmp, ["commit", "-q", "--allow-empty", "-m", "chore: move on"]);
      const h2 = git(tmp, ["rev-parse", "HEAD"]);
      write("src/b.ts", "export function Fb() { return 2; }\n");
      await expect(gitRun(crashingClient(1))).rejects.toThrow(/simulated crash/);
      expect(readAtlas().source_shas["src/a.ts"]).toBeDefined();
      expect(readAtlas().extracted_at_sha).toBe(h1);
      expect(await detectAtlasOnlyAvailable(atlasPath(), h2)).toBeNull();

      // Prior == HEAD (an atlas already current before the run): the
      // checkpoint keeps HEAD, never reading more current than before.
      await gitRun(recordingClient((b) => oneClaim(`claim for ${b}`)).client);
      expect(readAtlas().extracted_at_sha).toBe(h2);
      write("src/c.ts", "export function Fc() { return 3; }\n");
      write("src/a.ts", "export function Fa() { return 4; }\n");
      await expect(gitRun(crashingClient(1))).rejects.toThrow(/simulated crash/);
      expect(readAtlas().extracted_at_sha).toBe(h2);
    });

    it("a run that stores nothing writes no checkpoint: atlas.json stays byte-identical at interval 0", async () => {
      const adapter = threeDocFiles();
      await run(adapter, recordingClient((b) => oneClaim(b)).client, EVERY_UNIT);
      const bytes = readFileSync(atlasPath(), "utf8");
      freshDb();
      const noop = recordingClient(() => "throw");
      const result = await run(adapter, noop.client, EVERY_UNIT);
      expect(noop.bodies).toEqual([]);
      expect(result.atlasExported).toBe(false);
      expect(readFileSync(atlasPath(), "utf8")).toBe(bytes);
    });

    it("atlas.committed: false: no checkpoint is written, and the next run on the same cache bills only the rest", async () => {
      const uncommitted = baseConfig({
        atlas: { committed: false, path: ".contextatlas/atlas.json", localCache: ".contextatlas/index.db" },
      });
      const adapter = threeDocFiles();
      await expect(
        run(adapter, crashingClient(2), { ...EVERY_UNIT, config: uncommitted }),
      ).rejects.toThrow(/simulated crash/);
      expect(existsSync(atlasPath())).toBe(false);

      const rec = recordingClient((b) => oneClaim(`claim for ${b}`));
      await run(adapter, rec.client, { ...EVERY_UNIT, config: uncommitted });
      expect(rec.bodies).toEqual(["doc c"]);
      expect(existsSync(atlasPath())).toBe(false);
      expect(claimTexts()).toEqual(["claim for doc a", "claim for doc b", "claim for doc c"]);
    });

    it("a prose file's claims and key are one unit: a failing insert rolls the file back to its previous claims and key", async () => {
      const oldSha = write("docs/adr/ADR-01.md", "---\nid: ADR-01\n---\nold text\n");
      const adapter = streamAdapter(tmp, {});
      await run(adapter, recordingClient(() => oneClaim("old claim")).client);
      expect(claimTexts()).toEqual(["old claim"]);

      write("docs/adr/ADR-01.md", "---\nid: ADR-01\n---\nnew text\n");
      const two: ExtractionResult = {
        claims: [
          { symbol_candidates: [], claim: "new claim 1", severity: "hard", rationale: "r", excerpt: "e" },
          { symbol_candidates: [], claim: "new claim 2", severity: "hard", rationale: "r", excerpt: "e" },
        ],
      };
      // Armed once the model answers, after Stage 0 re-imported atlas.json:
      // the file's first new claim is stored, its second insert fails.
      const original = db.prepare.bind(db);
      let armed = false;
      let inserts = 0;
      const spy = vi.spyOn(db, "prepare").mockImplementation((sql: string) => {
        if (armed && /INSERT INTO claims \(/.test(sql) && ++inserts === 2) {
          throw new Error("simulated insert failure");
        }
        return original(sql);
      });
      const client = recordingClient(() => {
        armed = true;
        return two;
      });
      await expect(run(adapter, client.client)).rejects.toThrow(/simulated insert failure/);
      expect(inserts).toBe(2);
      spy.mockRestore();
      expect(claimTexts()).toEqual(["old claim"]);
      expect(listSourceShas(db)["docs/adr/ADR-01.md"]).toBe(oldSha);
    });

    it("atlas.committed: false: a leftover atlas.json seeds an empty cache once, then is not read, so nothing is re-billed", async () => {
      initGitRepo(tmp, ["design: split the router", "arch: move auth"]);
      const seedSha = write("docs/adr/ADR-00.md", "seed\n");
      const atlas: AtlasFileV1 = {
        version: "1.4",
        generated_at: "2026-09-01T00:00:00.000Z",
        generator: { contextatlas_version: "1.1.3", extraction_model: "claude-opus-4-7" },
        source_shas: { "docs/adr/ADR-00.md": seedSha },
        symbols: [],
        claims: [
          {
            source: "adr:ADR-00.md",
            source_path: "docs/adr/ADR-00.md",
            source_sha: seedSha,
            severity: "hard",
            claim: "seeded claim",
            symbol_ids: [],
          },
        ],
      };
      writeFileSync(atlasPath(), JSON.stringify(atlas, null, 2));
      const bytes = readFileSync(atlasPath(), "utf8");
      const uncommitted = baseConfig({
        atlas: { committed: false, path: ".contextatlas/atlas.json", localCache: ".contextatlas/index.db" },
      });

      const first = recordingClient(() => ({ claims: [] }));
      const r1 = await run(streamAdapter(tmp, {}), first.client, { config: uncommitted, gitBinary: "git" });
      expect(first.bodies).toHaveLength(2);
      expect(r1.commitsExtracted).toBe(2);
      expect(r1.atlasExported).toBe(false);
      // Seeded from the leftover file (the cache was empty).
      expect(claimTexts()).toEqual(["seeded claim"]);

      for (let i = 0; i < 2; i++) {
        const warnings = captureWarnings();
        const again = recordingClient(() => ({ claims: [] }));
        const r = await run(streamAdapter(tmp, {}), again.client, {
          config: uncommitted,
          gitBinary: "git",
        }).finally(() => warnings.restore());
        expect(again.bodies).toEqual([]);
        expect(r.commitsSkipped).toBe(2);
        const warning = warnings.lines.find((l) => /atlas\.committed is false/.test(l));
        expect(warning).toMatch(/not read/);
        // The way to switch that keeps the cache's work, not a way to lose it.
        expect(warning).toMatch(/delete or move\s+atlas\.json first/);
        expect(warning).not.toMatch(/Delete it/);
      }
      expect(readFileSync(atlasPath(), "utf8")).toBe(bytes);
    });

    it("atlas.committed: false with no atlas.json: nothing is imported and nothing is warned", async () => {
      const uncommitted = baseConfig({
        atlas: { committed: false, path: ".contextatlas/atlas.json", localCache: ".contextatlas/index.db" },
      });
      const adapter = threeDocFiles();
      for (let i = 0; i < 2; i++) {
        const warnings = captureWarnings();
        await run(adapter, recordingClient((b) => oneClaim(b)).client, { config: uncommitted }).finally(
          () => warnings.restore(),
        );
        expect(warnings.lines.filter((l) => /atlas\.committed is false/.test(l))).toEqual([]);
      }
      expect(existsSync(atlasPath())).toBe(false);
    });

    it("--full: a file whose key already matched fails and keeps it, so the run says only another --full retries it; a changed file is left to a plain run", async () => {
      const adapter = threeDocFiles();
      await run(adapter, recordingClient((b) => oneClaim(`v1 ${b}`)).client);
      write("src/c.ts", "export function Fc() { return 1; }\n"); // content changed

      const warnings = captureWarnings();
      const full = recordingClient((b) => (b === "doc b" ? oneClaim("v2 doc b") : "throw"));
      const result = await run(adapter, full.client, { skipShaDiff: true }).finally(() =>
        warnings.restore(),
      );
      expect([...full.bodies].sort()).toEqual(["doc a", "doc b", "doc c"]);
      expect(result.extractionErrors.map((e) => e.sourcePath).sort()).toEqual(["src/a.ts", "src/c.ts"]);
      const warning = warnings.lines.find((l) => /--full re-extracted failed/.test(l));
      expect(warning).toMatch(/1 file\(s\)/);
      expect(warning).toContain("src/a.ts");
      expect(warning).not.toContain("src/c.ts");
      expect(warning).toMatch(/re-run `contextatlas index --full`/);
      expect(result.extractionErrors.find((e) => e.sourcePath === "src/a.ts")?.error).toMatch(
        /unless that kept key already matches its content \(possible after `--full`/,
      );

      // A plain run retries only the changed file.
      const plain = recordingClient((b) => oneClaim(`v3 ${b}`));
      await run(adapter, plain.client);
      expect(plain.bodies).toEqual(["doc c"]);
      expect(claimTexts()).toEqual(["v1 doc a", "v2 doc b", "v3 doc c"]);
    });

    it("--full with every prose call failing: the thrown error says to re-run --full, because a plain run finds every key current", async () => {
      write("docs/adr/ADR-01.md", "---\nid: ADR-01\n---\nThe router stays pure.\n");
      const adapter = threeDocFiles();
      await run(adapter, recordingClient((b) => oneClaim(`v1 ${b}`)).client);

      const revoked = recordingClient(() => "throw");
      const thrown = await run(adapter, revoked.client, { skipShaDiff: true }).then(
        () => null,
        (err: unknown) => String(err),
      );
      expect(thrown).toMatch(/Extraction failed for all 1 document\(s\)/);
      expect(thrown).toMatch(/re-run `contextatlas index --full`/);
      // Only the ADR was attempted: the throw comes before the docstring stream.
      expect(revoked.bodies).toHaveLength(1);

      // The plain run the rebuild would otherwise be left to does nothing.
      const plain = recordingClient((b) => oneClaim(`v2 ${b}`));
      await run(adapter, plain.client);
      expect(plain.bodies).toEqual([]);

      // Without --full the error does not mention it.
      write("docs/adr/ADR-01.md", "---\nid: ADR-01\n---\nThe router stays pure, v2.\n");
      const plainThrown = await run(adapter, revoked.client).then(
        () => null,
        (err: unknown) => String(err),
      );
      expect(plainThrown).toMatch(/Extraction failed for all 1 document\(s\)/);
      expect(plainThrown).not.toMatch(/--full/);
    });

    it("documented limitation: after docs.include narrows, a code file prose keyed with no claims needs --full (or its key removed) for its docstrings", async () => {
      const withDocs = (include: string[]) => baseConfig({ docs: { include } });
      write("src/a.ts", "export function Foo() {}\n");
      const Foo = tsSym("src/a.ts", "Foo");
      const adapter = streamAdapter(tmp, { "src/a.ts": [Foo] }, { [Foo.id]: "Foo doc." });

      // docs.include matches the code file; prose finds no claims. The
      // collision warning names the remedy.
      const warnings = captureWarnings();
      await run(adapter, recordingClient(() => ({ claims: [] })).client, {
        config: withDocs(["src/a.ts"]),
      }).finally(() => warnings.restore());
      const collision = warnings.lines.find((l) => /docs\.include also matches/.test(l));
      expect(collision).toMatch(/remove that path's entry from source_shas/);
      expect(collision).toMatch(/contextatlas index --full/);

      // Narrowed: the zero-claim key looks unchanged to the docstring stream.
      const plain = recordingClient(() => oneClaim("never"));
      await run(adapter, plain.client, { config: withDocs([]) });
      expect(plain.bodies).toEqual([]);

      // The remedy: --full extracts its docstrings.
      const full = recordingClient((b) => (b === "Foo doc." ? oneClaim("foo is pure") : "throw"));
      await run(adapter, full.client, { config: withDocs([]), skipShaDiff: true });
      expect(full.bodies).toEqual(["Foo doc."]);
      expect(claimTexts()).toEqual(["foo is pure"]);
    });
  });
});
