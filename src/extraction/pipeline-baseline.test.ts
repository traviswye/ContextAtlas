/**
 * v1.2 Phase 2 review fixes: pipeline-level regressions around the
 * run's baseline (Stage 0), the prose all-failed check and the
 * pinned-commit retry hint.
 *
 *   - `atlas.committed: true` with no atlas.json always writes one.
 *   - One unparseable prose file does not stop the other streams.
 *   - A prose call failing with an API error on every file still throws.
 *   - The pin warning names both places a pinned key can live.
 *
 * Interrupted runs (checkpoint exports) are covered in
 * `pipeline-streams.test.ts`.
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

import { listAllClaims } from "../storage/claims.js";
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

describe("runExtractionPipeline — Stage 0 and baseline (review fixes)", () => {
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

  it("the pinned-commit warning names both places the key can live: atlas.json (committed) and the local cache (not committed)", async () => {
    initGitRepo(tmp, ["design: split the router"]);
    for (const committed of [true, false]) {
      const config = baseConfig({
        atlas: { committed, path: ".contextatlas/atlas.json", localCache: ".contextatlas/index.db" },
      });
      db.close();
      db = openDatabase(":memory:");
      const warnings = captureWarnings();
      await run(adapterFor(tmp, {}), recordingClient(() => null).client, {
        config,
        gitBinary: "git",
      }).finally(() => warnings.restore());
      const pin = warnings.lines.find((l) => /no parseable result/.test(l));
      expect(pin).toBeDefined();
      expect(pin).toMatch(/remove the "commit:[0-9a-f]{40}" entry from source_shas/);
      expect(pin).toMatch(/in atlas\.json with atlas\.committed: true/);
      expect(pin).toMatch(/in the local cache \(atlas\.local_cache, table source_shas\) with atlas\.committed: false/);
      rmSync(atlasPath(), { force: true });
    }
  });
});
