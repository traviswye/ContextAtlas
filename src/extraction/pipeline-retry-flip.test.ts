/**
 * v1.2 Phase 2 review round 2.3: pipeline-level regressions.
 *
 *   - A prose or docstring file whose re-extraction failed under
 *     `--full` is retried by the next plain run (its key already names
 *     its current SHA, so the SHA gate alone skipped it and the run
 *     exited 0 while the error promised a retry).
 *   - An `atlas.committed: false` run changes the cache without writing
 *     atlas.json, so its key-stream records must not survive the next
 *     committed import of the same atlas.json (a zero-claim docstring
 *     key was deleted as a prose key after a config experiment).
 *
 * Harness follows `pipeline-resume.test.ts`: a stub TS adapter and a
 * recording extraction client keyed by request body; no git.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join as pathJoin, relative, sep } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listAllClaims } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import type {
  ContextAtlasConfig,
  ExtractionStream,
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
  SymbolId,
} from "../types.js";

import { type ExtractionClient, ParseError } from "./anthropic-client.js";
import { runExtractionPipeline } from "./pipeline.js";
import type { ExtractionResult } from "./prompt.js";
import { listRetryKeys } from "./retry-keys.js";

const ALL: ReadonlySet<ExtractionStream> = new Set<ExtractionStream>(["adr", "docstring", "commit"]);
const FOO: AtlasSymbol = {
  id: "sym:ts:src/a.ts:Foo",
  name: "Foo",
  kind: "function",
  path: "src/a.ts",
  line: 1,
  language: "typescript",
};

function stubAdapter(root: string, docstrings: Record<SymbolId, string>): LanguageAdapter {
  const rel = (p: string): string => (isAbsolute(p) ? relative(root, p) : p).split(sep).join("/");
  return {
    language: "typescript",
    extensions: [".ts"],
    async initialize() {},
    async shutdown() {},
    async listSymbols(p: string) {
      return rel(p) === "src/a.ts" ? [FOO] : [];
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

type Reply = ExtractionResult | null | Error;

/** Records every request body; `respond` returns a result, null, or an error to throw. */
function client(respond: (body: string) => Reply) {
  const bodies: string[] = [];
  const c: ExtractionClient = {
    async extract(body: string) {
      bodies.push(body.trim());
      const reply = respond(body.trim());
      if (reply instanceof Error) throw reply;
      return { result: reply, usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
  return { client: c, bodies };
}

const claimed = (tag: string) => (body: string): ExtractionResult => ({
  claims: [
    {
      symbol_candidates: [],
      claim: `${tag}: ${body.split("\n").pop()}`,
      severity: "hard",
      rationale: "r",
      excerpt: "e",
    },
  ],
});

function config(committed: boolean, include: string[] = []): ContextAtlasConfig {
  return {
    version: 1,
    languages: ["typescript"],
    adrs: { path: "docs/adr", format: "markdown-frontmatter" },
    docs: { include },
    git: { recentCommits: 5 },
    index: { model: "claude-opus-4-7" },
    atlas: { committed, path: ".contextatlas/atlas.json", localCache: ".contextatlas/index.db" },
  };
}

describe("runExtractionPipeline — review round 2.3", () => {
  let tmp: string;
  let db: DatabaseInstance;
  let quiet: { mockRestore: () => void };

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-retry-flip-"));
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    writeFileSync(pathJoin(tmp, "docs", "adr", "ADR-01.md"), "---\nid: ADR-01\n---\nFoo must stay pure.\n");
    writeFileSync(pathJoin(tmp, "src", "a.ts"), "export function Foo() {}\n");
    db = openDatabase(":memory:");
    quiet = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(async () => {
    quiet.mockRestore();
    db.close();
    await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const atlasText = () => readFileSync(pathJoin(tmp, ".contextatlas", "atlas.json"), "utf8");
  const claimsOf = (key: string) =>
    listAllClaims(db)
      .filter((c) => c.sourcePath === key)
      .map((c) => c.claim);
  const run = (
    c: ExtractionClient,
    extra: Partial<Parameters<typeof runExtractionPipeline>[0]> = {},
    docstrings: Record<SymbolId, string> = { [FOO.id]: "Foo docs." },
  ) =>
    runExtractionPipeline({
      repoRoot: tmp,
      config: config(true),
      db,
      anthropicClient: c,
      adapters: new Map<LanguageCode, LanguageAdapter>([["typescript", stubAdapter(tmp, docstrings)]]),
      gitBinary: pathJoin(tmp, "no-such-git-binary"),
      streams: ALL,
      ...extra,
    });

  describe("a failure under --full is retried by the next plain run", () => {
    it("a docstring call that threw an API error", async () => {
      await run(client(claimed("v1")).client);
      expect(claimsOf("src/a.ts")).toEqual(["v1: Foo docs."]);

      const full = client((b) => (b === "Foo docs." ? new Error("429 rate_limit_error") : claimed("v2")(b)));
      const r2 = await run(full.client, { skipShaDiff: true });
      expect(r2.failedStreams.map((f) => f.stream)).toEqual(["docstring"]);
      expect(claimsOf("src/a.ts")).toEqual(["v1: Foo docs."]);

      const plain = client(claimed("v3"));
      const r3 = await run(plain.client);
      expect(plain.bodies).toEqual(["Foo docs."]);
      expect(r3.failedStreams).toEqual([]);
      expect(claimsOf("src/a.ts")).toEqual(["v3: Foo docs."]);
      expect(r3.atlasExported).toBe(true);
      expect(JSON.parse(atlasText()).claims.map((c: { claim: string }) => c.claim)).toContain("v3: Foo docs.");

      // Retried and stored: the next plain run has nothing to do.
      const again = client(claimed("v4"));
      await run(again.client);
      expect(again.bodies).toEqual([]);
      expect(listRetryKeys(db).size).toBe(0);
    });

    it("a docstring response that did not parse (malformed JSON)", async () => {
      await run(client(claimed("v1")).client);
      const full = client((b) =>
        b === "Foo docs." ? new ParseError("json-parse", "{", "malformed JSON") : claimed("v2")(b),
      );
      const r2 = await run(full.client, { skipShaDiff: true });
      expect(r2.failedStreams).toEqual([]);
      expect(r2.extractionErrors.map((e) => e.sourcePath)).toEqual(["src/a.ts"]);

      const plain = client(claimed("v3"));
      await run(plain.client);
      expect(plain.bodies).toEqual(["Foo docs."]);
      expect(claimsOf("src/a.ts")).toEqual(["v3: Foo docs."]);
    });

    it("an ADR whose response was null (max_tokens)", async () => {
      await run(client(claimed("v1")).client);
      expect(claimsOf("docs/adr/ADR-01.md")).toEqual(["v1: Foo must stay pure."]);

      const full = client((b) => (b.includes("Foo must stay pure.") ? null : claimed("v2")(b)));
      await run(full.client, { skipShaDiff: true });
      expect(claimsOf("docs/adr/ADR-01.md")).toEqual(["v1: Foo must stay pure."]);

      const plain = client(claimed("v3"));
      await run(plain.client);
      expect(plain.bodies).toEqual(["Foo must stay pure."]);
      expect(claimsOf("docs/adr/ADR-01.md")).toEqual(["v3: Foo must stay pure."]);
    });

    it("a retry for a file that has since been deleted is dropped", async () => {
      await run(client(claimed("v1")).client);
      await run(
        client((b) => (b === "Foo docs." ? new Error("503 overloaded") : claimed("v2")(b))).client,
        { skipShaDiff: true },
      );
      expect([...listRetryKeys(db)]).toEqual(["src/a.ts"]);
      await rm(pathJoin(tmp, "src", "a.ts"));
      await run(client(claimed("v3")).client);
      expect(listRetryKeys(db).size).toBe(0);
    });
  });

  it("atlas.committed: false records do not survive the next committed import (config experiment reverted)", async () => {
    // Run 1: committed; the docstring stream keys src/a.ts with no claims.
    const docs = { [FOO.id]: "Foo docs." };
    const none = () => client(() => ({ claims: [] }));
    await run(none().client, {}, docs);
    const h1 = atlasText();
    expect(JSON.parse(h1).source_shas["src/a.ts"]).toBeDefined();

    // Run 2: a local experiment, committed: false with docs.include over
    // src/a.ts. The prose stream re-keys src/a.ts at the same SHA.
    await run(none().client, { config: config(false, ["src/a.ts"]) }, docs);
    expect(atlasText()).toBe(h1);

    // Run 3: config reverted (committed: true, docs.include []), with the
    // docstring stream off. Nothing changed against atlas.json.
    const rec = none();
    const r3 = await run(rec.client, { streams: new Set<ExtractionStream>(["adr", "commit"]) }, docs);
    expect(rec.bodies).toEqual([]);
    expect(r3.filesDeleted).toBe(0);
    expect(r3.docstringSourcesDeleted).toBe(0);
    expect(r3.atlasExported).toBe(false);
    expect(atlasText()).toBe(h1);
  });
});
