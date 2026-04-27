import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  listAllClaims,
  listSourceShas,
} from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import { listAllSymbols } from "../storage/symbols.js";
import type {
  ContextAtlasConfig,
  Diagnostic,
  LanguageAdapter,
  LanguageCode,
  Reference,
  Symbol as AtlasSymbol,
  SymbolId,
} from "../types.js";

import type { ExtractionClient } from "./anthropic-client.js";
import { deriveSourceName, runExtractionPipeline } from "./pipeline.js";
import type { ExtractedClaim, ExtractionResult } from "./prompt.js";

// ---------------------------------------------------------------------------
// Test harness: in-memory filesystem via tmp dir, stub adapter, stub client
// ---------------------------------------------------------------------------

function makeStubAdapter(
  language: LanguageCode,
  extensions: readonly string[],
  symbolsByAbsPath: (absPath: string) => AtlasSymbol[],
): LanguageAdapter {
  return {
    language,
    extensions,
    async initialize() {},
    async shutdown() {},
    async listSymbols(filePath: string) {
      return symbolsByAbsPath(filePath);
    },
    async getSymbolDetails(_id: SymbolId) {
      return null;
    },
    async findReferences(_id: SymbolId): Promise<Reference[]> {
      return [];
    },
    async getDiagnostics(_path: string): Promise<Diagnostic[]> {
      return [];
    },
    async getDocstring(_id: SymbolId): Promise<string | null> {
      return null;
    },
  };
}

function makeStubClient(
  responses: Array<ExtractionResult | null | "throw">,
): ExtractionClient {
  let i = 0;
  return {
    async extract(_body: string) {
      const r = responses[i++];
      if (r === "throw") throw new Error("stub-client failure");
      // Default usage stamp for stubbed responses — lets the pipeline's
      // usage accumulator exercise without requiring every pipeline
      // test to care about token counts.
      return { result: r ?? null, usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
}

function baseConfig(): ContextAtlasConfig {
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
  };
}

function makeClaim(
  over: Partial<ExtractedClaim> & Pick<ExtractedClaim, "claim">,
): ExtractedClaim {
  return {
    symbol_candidates: over.symbol_candidates ?? [],
    claim: over.claim,
    severity: over.severity ?? "hard",
    rationale: over.rationale ?? "because",
    excerpt: over.excerpt ?? "excerpt",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("deriveSourceName", () => {
  it("uses YAML frontmatter id when present", () => {
    const raw =
      "---\nid: ADR-42\ntitle: x\n---\n\n# Heading\nbody";
    expect(deriveSourceName("/tmp/whatever.md", raw)).toBe("ADR-42");
  });

  it("falls back to ADR-\\d+ pattern in filename (case-insensitive)", () => {
    expect(deriveSourceName("/tmp/adr-03-foo.md", "body")).toBe("ADR-03");
    expect(deriveSourceName("/tmp/ADR-07-idempotency.md", "body")).toBe("ADR-07");
  });

  it("falls back to basename-without-extension as last resort", () => {
    expect(deriveSourceName("/tmp/README.md", "body")).toBe("README");
  });
});

describe("runExtractionPipeline", () => {
  let tmp: string;
  let db: DatabaseInstance;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-pipe-"));
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  function adapterForSrc(symbolsByFile: Record<string, AtlasSymbol[]>) {
    return makeStubAdapter("typescript", [".ts"], (absPath) => {
      const hit = Object.entries(symbolsByFile).find(([k]) =>
        absPath.endsWith(k),
      );
      return hit ? hit[1] : [];
    });
  }

  it("extracts claims from a single ADR, writes atlas.json, resolves symbols", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-07-idempotency.md"),
      "---\nid: ADR-07\n---\nBody mentions OrderProcessor.",
    );
    writeFileSync(
      pathJoin(tmp, "src", "processor.ts"),
      "export class OrderProcessor {}",
    );

    const adapter = adapterForSrc({
      "processor.ts": [
        {
          id: "sym:ts:src/processor.ts:OrderProcessor",
          name: "OrderProcessor",
          kind: "class",
          path: "src/processor.ts",
          line: 1,
          language: "typescript",
          // Signatures are stamped at the adapter boundary (TypeScript
          // adapter's listSymbols). Stubs mimic that by returning
          // populated signatures, and the pipeline must persist them.
          signature: "class OrderProcessor extends BaseProcessor<Order>",
        },
      ],
    });

    const client = makeStubClient([
      {
        claims: [
          makeClaim({
            claim: "must be idempotent",
            severity: "hard",
            symbol_candidates: ["OrderProcessor"],
          }),
        ],
      },
    ]);

    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
    });

    expect(result.filesExtracted).toBe(1);
    expect(result.claimsWritten).toBe(1);
    expect(result.atlasExported).toBe(true);
    expect(result.unresolvedCandidates).toBe(0);

    // Claim was inserted and linked to the symbol.
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.source).toBe("ADR-07");
    expect(claims[0]?.symbolIds).toEqual([
      "sym:ts:src/processor.ts:OrderProcessor",
    ]);

    // Signatures must flow through the pipeline into storage — without
    // them, get_symbol_context renders SIG-less bundles for every symbol.
    const storedSymbols = listAllSymbols(db);
    const storedProcessor = storedSymbols.find(
      (s) => s.name === "OrderProcessor",
    );
    expect(storedProcessor?.signature).toBe(
      "class OrderProcessor extends BaseProcessor<Order>",
    );

    // atlas.json was written to disk with the signature included.
    const atlasPath = pathJoin(tmp, ".contextatlas", "atlas.json");
    const onDisk = readFileSync(atlasPath, "utf8");
    expect(onDisk).toContain("OrderProcessor");
    expect(onDisk).toContain("must be idempotent");
    expect(onDisk).toContain(
      '"signature": "class OrderProcessor extends BaseProcessor<Order>"',
    );
  });

  it("no-op when all SHAs match the committed atlas baseline", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      "body v1",
    );
    const adapter = adapterForSrc({});
    const client = makeStubClient([
      { claims: [makeClaim({ claim: "initial" })] },
    ]);

    // First run: populates atlas.
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
    });

    // Second run on fresh DB + same disk state should be a no-op:
    // atlas.json is imported, all SHAs match, zero extractions.
    const db2 = openDatabase(":memory:");
    const silentClient = makeStubClient([]); // no responses — none should be needed
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db: db2,
      anthropicClient: silentClient,
      adapters: new Map([["typescript", adapter]]),
    });
    expect(result.filesExtracted).toBe(0);
    expect(result.filesUnchanged).toBe(1);
    expect(result.apiCalls).toBe(0);
    expect(result.atlasExported).toBe(false);
    db2.close();
  });

  it("skipShaDiff forces full re-extract even when SHAs match baseline (ADR-12 --full)", async () => {
    writeFileSync(pathJoin(tmp, "docs", "adr", "A.md"), "v1");
    writeFileSync(pathJoin(tmp, "docs", "adr", "B.md"), "v1");
    const adapter = adapterForSrc({});
    const client1 = makeStubClient([
      { claims: [makeClaim({ claim: "A1" })] },
      { claims: [makeClaim({ claim: "B1" })] },
    ]);
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client1,
      adapters: new Map([["typescript", adapter]]),
    });

    // Second run on fresh DB, same disk state. Without skipShaDiff
    // this is a no-op (all SHAs match baseline). With skipShaDiff,
    // both files re-extract. Exercises `contextatlas index --full`.
    const db2 = openDatabase(":memory:");
    const client2 = makeStubClient([
      { claims: [makeClaim({ claim: "A2" })] },
      { claims: [makeClaim({ claim: "B2" })] },
    ]);
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db: db2,
      anthropicClient: client2,
      adapters: new Map([["typescript", adapter]]),
      skipShaDiff: true,
    });
    expect(result.filesExtracted).toBe(2);
    expect(result.filesUnchanged).toBe(0);
    expect(result.apiCalls).toBe(2);
    db2.close();
  });

  it("re-extracts only the changed file", async () => {
    writeFileSync(pathJoin(tmp, "docs", "adr", "A.md"), "v1");
    writeFileSync(pathJoin(tmp, "docs", "adr", "B.md"), "v1");
    const adapter = adapterForSrc({});
    const client1 = makeStubClient([
      { claims: [makeClaim({ claim: "claim-A-v1" })] },
      { claims: [makeClaim({ claim: "claim-B-v1" })] },
    ]);
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client1,
      adapters: new Map([["typescript", adapter]]),
    });

    // Change only B.md. Fresh DB, same on-disk atlas.
    writeFileSync(pathJoin(tmp, "docs", "adr", "B.md"), "v2 — changed");
    const db2 = openDatabase(":memory:");
    const client2 = makeStubClient([
      { claims: [makeClaim({ claim: "claim-B-v2" })] },
    ]);
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db: db2,
      anthropicClient: client2,
      adapters: new Map([["typescript", adapter]]),
    });
    expect(result.filesExtracted).toBe(1);
    expect(result.filesUnchanged).toBe(1);
    expect(result.apiCalls).toBe(1);
    const claims = listAllClaims(db2).map((c) => c.claim).sort();
    expect(claims).toEqual(["claim-A-v1", "claim-B-v2"]);
    db2.close();
  });

  it("cleans up claims + source_shas when a file is deleted from disk", async () => {
    writeFileSync(pathJoin(tmp, "docs", "adr", "A.md"), "v1");
    writeFileSync(pathJoin(tmp, "docs", "adr", "B.md"), "v1");
    const adapter = adapterForSrc({});
    const client1 = makeStubClient([
      { claims: [makeClaim({ claim: "A" })] },
      { claims: [makeClaim({ claim: "B" })] },
    ]);
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client1,
      adapters: new Map([["typescript", adapter]]),
    });

    // Delete B.
    rmSync(pathJoin(tmp, "docs", "adr", "B.md"));
    const db2 = openDatabase(":memory:");
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db: db2,
      anthropicClient: makeStubClient([]),
      adapters: new Map([["typescript", adapter]]),
    });
    expect(result.filesDeleted).toBe(1);
    expect(result.atlasExported).toBe(true);

    const shas = listSourceShas(db2);
    expect(Object.keys(shas)).toEqual(["docs/adr/A.md"]);
    const claims = listAllClaims(db2).map((c) => c.claim);
    expect(claims).toEqual(["A"]);
    db2.close();
  });

  it("does not write atlas.json when atlas.committed is false", async () => {
    writeFileSync(pathJoin(tmp, "docs", "adr", "A.md"), "v1");
    const cfg = baseConfig();
    cfg.atlas.committed = false;
    const adapter = adapterForSrc({});
    await runExtractionPipeline({
      repoRoot: tmp,
      config: cfg,
      db,
      anthropicClient: makeStubClient([{ claims: [makeClaim({ claim: "x" })] }]),
      adapters: new Map([["typescript", adapter]]),
    });
    const atlasPath = pathJoin(tmp, ".contextatlas", "atlas.json");
    expect(() => readFileSync(atlasPath, "utf8")).toThrow();
  });

  it("empty corpus is not an error; symbols still indexed", async () => {
    writeFileSync(pathJoin(tmp, "src", "a.ts"), "export class X {}");
    const adapter = adapterForSrc({
      "a.ts": [
        {
          id: "sym:ts:src/a.ts:X",
          name: "X",
          kind: "class",
          path: "src/a.ts",
          line: 1,
          language: "typescript",
        },
      ],
    });
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: makeStubClient([]),
      adapters: new Map([["typescript", adapter]]),
    });
    expect(result.filesExtracted).toBe(0);
    expect(result.symbolsIndexed).toBe(1);
    expect(listAllSymbols(db)).toHaveLength(1);
  });

  it("throws when every attempted extraction errors (config/key problem)", async () => {
    writeFileSync(pathJoin(tmp, "docs", "adr", "A.md"), "v1");
    writeFileSync(pathJoin(tmp, "docs", "adr", "B.md"), "v1");
    const adapter = adapterForSrc({});
    await expect(
      runExtractionPipeline({
        repoRoot: tmp,
        config: baseConfig(),
        db,
        anthropicClient: makeStubClient(["throw", "throw"]),
        adapters: new Map([["typescript", adapter]]),
      }),
    ).rejects.toThrow(/Extraction failed for all 2 document\(s\)/);
  });

  it("tolerates per-document failure when others succeed", async () => {
    writeFileSync(pathJoin(tmp, "docs", "adr", "A.md"), "v1");
    writeFileSync(pathJoin(tmp, "docs", "adr", "B.md"), "v1");
    const adapter = adapterForSrc({});
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: makeStubClient([
        { claims: [makeClaim({ claim: "A-ok" })] },
        "throw",
      ]),
      adapters: new Map([["typescript", adapter]]),
    });
    expect(result.filesExtracted).toBe(1);
    expect(result.extractionErrors).toHaveLength(1);
    expect(result.claimsWritten).toBe(1);
  });

  it("frontmatter 'symbols:' recovers claims that resolve to zero symbols (Path X fallback)", async () => {
    // Under v0.3 Step 7 A1 default (drop-with-fallback), frontmatter
    // is no longer merged into every claim. Instead, frontmatter
    // resolves only as a fallback when the claim's own candidates
    // resolve to zero symbols. The model returns empty
    // symbol_candidates here, so the fallback fires and the claim
    // links to Foo via frontmatter recovery.
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-99.md"),
      "---\nid: ADR-99\nsymbols:\n  - Foo\n---\nSome architectural claim body.",
    );
    writeFileSync(pathJoin(tmp, "src", "x.ts"), "export class Foo {}");
    const adapter = adapterForSrc({
      "x.ts": [
        {
          id: "sym:ts:src/x.ts:Foo",
          name: "Foo",
          kind: "class",
          path: "src/x.ts",
          line: 1,
          language: "typescript",
        },
      ],
    });
    const client = makeStubClient([
      {
        claims: [
          makeClaim({
            claim: "some architectural rule",
            severity: "hard",
            symbol_candidates: [], // model didn't pick up Foo
          }),
        ],
      },
    ]);
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
    });
    expect(result.unresolvedFrontmatterHints).toBe(0);
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.symbolIds).toEqual(["sym:ts:src/x.ts:Foo"]);
  });

  it("counts frontmatter hints that don't resolve and still persists the claim", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-98.md"),
      "---\nid: ADR-98\nsymbols:\n  - Ghost\n  - Real\n---\nBody.",
    );
    writeFileSync(pathJoin(tmp, "src", "x.ts"), "export class Real {}");
    const adapter = adapterForSrc({
      "x.ts": [
        {
          id: "sym:ts:src/x.ts:Real",
          name: "Real",
          kind: "class",
          path: "src/x.ts",
          line: 1,
          language: "typescript",
        },
      ],
    });
    const client = makeStubClient([
      {
        claims: [
          makeClaim({
            claim: "some rule",
            symbol_candidates: [], // model empty
          }),
        ],
      },
    ]);
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
    });
    // Ghost doesn't exist in the codebase — counted as a frontmatter miss,
    // but the claim still persists and links to Real.
    expect(result.unresolvedFrontmatterHints).toBe(1);
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.symbolIds).toEqual(["sym:ts:src/x.ts:Real"]);
  });

  it("reports unresolved symbol candidates without failing", async () => {
    writeFileSync(pathJoin(tmp, "docs", "adr", "A.md"), "v1");
    const adapter = adapterForSrc({});
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: makeStubClient([
        {
          claims: [
            makeClaim({
              claim: "something",
              symbol_candidates: ["NonExistent1", "NonExistent2"],
            }),
          ],
        },
      ]),
      adapters: new Map([["typescript", adapter]]),
    });
    expect(result.claimsWritten).toBe(1);
    expect(result.unresolvedCandidates).toBe(2);
    const claims = listAllClaims(db);
    expect(claims[0]?.symbolIds).toEqual([]);
  });

  it("persists contextatlasCommitSha to atlas_meta and atlas.json (v1.3)", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      "---\nid: ADR-01\n---\nbody\n",
    );
    const adapter = adapterForSrc({});
    const client = makeStubClient([
      { claims: [makeClaim({ claim: "x", symbol_candidates: [] })] },
    ]);
    const sha = "e".repeat(40);
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
      contextatlasVersion: "0.3.0",
      contextatlasCommitSha: sha,
    });
    expect(result.atlasExported).toBe(true);
    const metaRow = db
      .prepare("SELECT value FROM atlas_meta WHERE key = ?")
      .get("generator.contextatlas_commit_sha") as
      | { value: string }
      | undefined;
    expect(metaRow?.value).toBe(sha);
    const atlasOnDisk = readFileSync(
      pathJoin(tmp, ".contextatlas", "atlas.json"),
      "utf8",
    );
    expect(atlasOnDisk).toContain(`"contextatlas_commit_sha": "${sha}"`);
    expect(atlasOnDisk).toContain('"version": "1.3"');
  });

  it("omits contextatlas_commit_sha from atlas.json when null is passed (binary not in git)", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      "---\nid: ADR-01\n---\nbody\n",
    );
    const adapter = adapterForSrc({});
    const client = makeStubClient([
      { claims: [makeClaim({ claim: "x", symbol_candidates: [] })] },
    ]);
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
      contextatlasVersion: "0.3.0",
      contextatlasCommitSha: null,
    });
    const atlasOnDisk = readFileSync(
      pathJoin(tmp, ".contextatlas", "atlas.json"),
      "utf8",
    );
    expect(atlasOnDisk).not.toContain("contextatlas_commit_sha");
  });

  it("supports external ADR root with configRoot separate from repoRoot (ADR-08)", async () => {
    // Three-location fixture mirroring the benchmarks-repo architecture:
    //   tmp/benchmarks-root/
    //     .contextatlas.yml     ← config
    //     adrs/
    //       ADR-EXT.md          ← external ADR
    //   tmp/source-root/
    //     example.ts            ← source code (separate tree)
    //
    // The pipeline is invoked with repoRoot=source-root, configRoot=
    // benchmarks-root. Pre-ADR-08 this would crash in walkProseFiles
    // with "path not under root"; now it works end-to-end.
    const benchmarksRoot = pathJoin(tmp, "benchmarks-root");
    const adrDir = pathJoin(benchmarksRoot, "adrs");
    const sourceRoot = pathJoin(tmp, "source-root");
    mkdirSync(adrDir, { recursive: true });
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(pathJoin(benchmarksRoot, ".contextatlas"), { recursive: true });
    writeFileSync(
      pathJoin(adrDir, "ADR-EXT.md"),
      "---\nid: ADR-EXT\n---\n\nExtPoint must be stable across releases.\n",
    );
    writeFileSync(
      pathJoin(sourceRoot, "example.ts"),
      "export class ExtPoint {}\n",
    );

    const adapter = makeStubAdapter("typescript", [".ts"], (absPath) =>
      absPath.endsWith("example.ts")
        ? [
            {
              id: "sym:ts:example.ts:ExtPoint",
              name: "ExtPoint",
              kind: "class",
              path: "example.ts",
              line: 1,
              language: "typescript",
            },
          ]
        : [],
    );
    const client = makeStubClient([
      {
        claims: [
          makeClaim({
            claim: "ExtPoint must be stable across releases",
            severity: "hard",
            symbol_candidates: ["ExtPoint"],
          }),
        ],
      },
    ]);

    const config: ContextAtlasConfig = {
      version: 1,
      languages: ["typescript"],
      adrs: { path: "adrs", format: "markdown-frontmatter" },
      docs: { include: [] },
      git: { recentCommits: 5 },
      index: { model: "claude-opus-4-7" },
      atlas: {
        committed: true,
        path: ".contextatlas/atlas.json",
        localCache: ".contextatlas/index.db",
      },
    };

    const result = await runExtractionPipeline({
      repoRoot: sourceRoot,
      configRoot: benchmarksRoot,
      config,
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
    });

    // Claim persisted, linked to the source-tree symbol.
    expect(result.filesExtracted).toBe(1);
    expect(result.claimsWritten).toBe(1);
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    // source_path is relative to the ADR dir (outside-source-root
    // branch of proseRelPath), matching ADR-08's stated rule.
    expect(claims[0]?.sourcePath).toBe("ADR-EXT.md");
    expect(claims[0]?.source).toBe("ADR-EXT");
    expect(claims[0]?.symbolIds).toEqual(["sym:ts:example.ts:ExtPoint"]);

    // atlas.json was written in the config's home, not the source
    // tree — matching the "atlas.path resolves against configRoot"
    // behavior the pipeline now enforces.
    const atlasInBenchmarks = pathJoin(
      benchmarksRoot,
      ".contextatlas",
      "atlas.json",
    );
    expect(() => readFileSync(atlasInBenchmarks, "utf8")).not.toThrow();
    const atlasText = readFileSync(atlasInBenchmarks, "utf8");
    expect(atlasText).toContain("ExtPoint");
    expect(atlasText).toContain("ADR-EXT.md");
  });
});

// ---------------------------------------------------------------------------
// Budget warning (v0.2 Stream A #2)
//
// Default stub usage is 100 input + 50 output tokens per call. Under
// Opus 4.7 pricing ($15/M input + $75/M output), that's
// (100/1e6 * 15) + (50/1e6 * 75) = 0.0015 + 0.00375 = $0.00525 per call.
// Tests pick thresholds relative to that unit cost.
// ---------------------------------------------------------------------------

import { vi } from "vitest";

function captureWarnings(): {
  lines: string[];
  restore: () => void;
} {
  const lines: string[] = [];
  const spy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown): boolean => {
      const text = typeof chunk === "string" ? chunk : String(chunk);
      if (text.includes("[warn]")) lines.push(text);
      return true;
    });
  return { lines, restore: () => spy.mockRestore() };
}

describe("runExtractionPipeline — budget warning", () => {
  let tmp: string;
  let db: DatabaseInstance;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-pipeline-budget-"));
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeAdrs(n: number): void {
    for (let i = 1; i <= n; i++) {
      writeFileSync(
        pathJoin(tmp, "docs", "adr", `ADR-${String(i).padStart(2, "0")}.md`),
        `---\nid: ADR-${i}\n---\nbody\n`,
      );
    }
  }

  it("no warning fires when budgetWarnUsd is undefined", async () => {
    writeAdrs(3);
    const warnings = captureWarnings();
    const adapter = makeStubAdapter("typescript", [".ts"], () => []);
    const client = makeStubClient([
      { claims: [] },
      { claims: [] },
      { claims: [] },
    ]);
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
    });
    warnings.restore();
    const budgetWarnings = warnings.lines.filter((l) =>
      l.includes("budget warning"),
    );
    expect(budgetWarnings).toHaveLength(0);
  });

  it("no warning fires when cumulative cost stays under threshold", async () => {
    writeAdrs(2);
    // 2 calls * $0.00525 = $0.0105 cumulative, threshold $1.00 → no warning.
    const warnings = captureWarnings();
    const adapter = makeStubAdapter("typescript", [".ts"], () => []);
    const client = makeStubClient([{ claims: [] }, { claims: [] }]);
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
      budgetWarnUsd: 1.0,
    });
    warnings.restore();
    const budgetWarnings = warnings.lines.filter((l) =>
      l.includes("budget warning"),
    );
    expect(budgetWarnings).toHaveLength(0);
  });

  it("fires exactly one warning when cumulative cost exceeds threshold", async () => {
    writeAdrs(3);
    // 3 calls * $0.00525 = $0.01575. Threshold $0.005 is crossed on
    // first batch (batchSize default 3 → all three fire before the
    // post-batch check). Warning should fire once.
    const warnings = captureWarnings();
    const adapter = makeStubAdapter("typescript", [".ts"], () => []);
    const client = makeStubClient([
      { claims: [] },
      { claims: [] },
      { claims: [] },
    ]);
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
      budgetWarnUsd: 0.005,
    });
    warnings.restore();
    const budgetWarnings = warnings.lines.filter((l) =>
      l.includes("budget warning"),
    );
    expect(budgetWarnings).toHaveLength(1);
    expect(budgetWarnings[0]).toContain("cumulativeCostUsd");
    expect(budgetWarnings[0]).toContain('"budgetUsd":0.005');
  });

  it("fires exactly one warning across many batches even when all exceed", async () => {
    // 6 files → 2 batches (batchSize 3). Threshold crossed after
    // first batch; second batch is way past. Still exactly one warning.
    writeAdrs(6);
    const warnings = captureWarnings();
    const adapter = makeStubAdapter("typescript", [".ts"], () => []);
    const client = makeStubClient(
      Array.from({ length: 6 }, () => ({ claims: [] })),
    );
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
      budgetWarnUsd: 0.001, // far below cost of one call
    });
    warnings.restore();
    const budgetWarnings = warnings.lines.filter((l) =>
      l.includes("budget warning"),
    );
    expect(budgetWarnings).toHaveLength(1);
  });

  it("threshold of zero fires on first batch (warn-on-any-cost)", async () => {
    writeAdrs(1);
    const warnings = captureWarnings();
    const adapter = makeStubAdapter("typescript", [".ts"], () => []);
    const client = makeStubClient([{ claims: [] }]);
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
      budgetWarnUsd: 0,
    });
    warnings.restore();
    const budgetWarnings = warnings.lines.filter((l) =>
      l.includes("budget warning"),
    );
    expect(budgetWarnings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ADR authoring validation (v0.3 Step 1 — Theme 1.2 Fix 1)
// ---------------------------------------------------------------------------

describe("runExtractionPipeline — ADR authoring validation", () => {
  let tmp: string;
  let db: DatabaseInstance;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-pipeline-adr-validation-"));
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  function adapterForSrc(symbolsByFile: Record<string, AtlasSymbol[]>) {
    return makeStubAdapter("typescript", [".ts"], (absPath) => {
      const hit = Object.entries(symbolsByFile).find(([k]) =>
        absPath.endsWith(k),
      );
      return hit ? hit[1] : [];
    });
  }

  it("all-resolve happy path: ADR authoring validation warning silent", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-clean.md"),
      "---\nid: ADR-clean\nsymbols:\n  - Real\n---\nBody.",
    );
    writeFileSync(pathJoin(tmp, "src", "x.ts"), "export class Real {}");
    const warnings = captureWarnings();
    const adapter = adapterForSrc({
      "x.ts": [
        {
          id: "sym:ts:src/x.ts:Real",
          name: "Real",
          kind: "class",
          path: "src/x.ts",
          line: 1,
          language: "typescript",
        },
      ],
    });
    const client = makeStubClient([
      { claims: [makeClaim({ claim: "rule", symbol_candidates: ["Real"] })] },
    ]);
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
    });
    warnings.restore();
    expect(result.unresolvedFrontmatterHints).toBe(0);
    const adrValidationWarnings = warnings.lines.filter((l) =>
      l.includes("ADR authoring validation"),
    );
    expect(adrValidationWarnings).toHaveLength(0);
  });

  it("some-unresolved warning path: warn line fires once with totals + file count", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-mixed-A.md"),
      "---\nid: ADR-mixed-A\nsymbols:\n  - Ghost\n  - Real\n---\nBody.",
    );
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-mixed-B.md"),
      "---\nid: ADR-mixed-B\nsymbols:\n  - AlsoGhost\n---\nBody.",
    );
    writeFileSync(pathJoin(tmp, "src", "x.ts"), "export class Real {}");
    const warnings = captureWarnings();
    const adapter = adapterForSrc({
      "x.ts": [
        {
          id: "sym:ts:src/x.ts:Real",
          name: "Real",
          kind: "class",
          path: "src/x.ts",
          line: 1,
          language: "typescript",
        },
      ],
    });
    const client = makeStubClient([
      { claims: [makeClaim({ claim: "rule A", symbol_candidates: [] })] },
      { claims: [makeClaim({ claim: "rule B", symbol_candidates: [] })] },
    ]);
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
    });
    warnings.restore();
    // Two unresolved frontmatter symbols (Ghost in ADR-A; AlsoGhost in ADR-B)
    // across two files.
    expect(result.unresolvedFrontmatterHints).toBe(2);
    const adrValidationWarnings = warnings.lines.filter((l) =>
      l.includes("ADR authoring validation"),
    );
    expect(adrValidationWarnings).toHaveLength(1);
    expect(adrValidationWarnings[0]).toMatch(/2 unresolved frontmatter/);
    expect(adrValidationWarnings[0]).toMatch(/2 file/);
  });

  it("all-unresolved sanity case: warn line fires once with correct totals", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-broken-A.md"),
      "---\nid: ADR-broken-A\nsymbols:\n  - GhostA1\n  - GhostA2\n---\nBody.",
    );
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-broken-B.md"),
      "---\nid: ADR-broken-B\nsymbols:\n  - GhostB1\n---\nBody.",
    );
    // No source symbols at all — every frontmatter declaration unresolved.
    const warnings = captureWarnings();
    const adapter = adapterForSrc({});
    const client = makeStubClient([
      { claims: [makeClaim({ claim: "rule A", symbol_candidates: [] })] },
      { claims: [makeClaim({ claim: "rule B", symbol_candidates: [] })] },
    ]);
    const result = await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
    });
    warnings.restore();
    expect(result.unresolvedFrontmatterHints).toBe(3);
    const adrValidationWarnings = warnings.lines.filter((l) =>
      l.includes("ADR authoring validation"),
    );
    expect(adrValidationWarnings).toHaveLength(1);
    expect(adrValidationWarnings[0]).toMatch(/3 unresolved frontmatter/);
    expect(adrValidationWarnings[0]).toMatch(/2 file/);
  });
});

// ---------------------------------------------------------------------------
// v0.3 Theme 1.2 Fix 2 — narrow_attribution flag (Phase 6 §5.1 mechanism)
//
// Three flag states: undefined (baseline), "drop" (Option A), and
// "drop-with-fallback" (Option E). Tests construct an ADR fixture
// mirroring the Phase 6 ADR-05 muddy-bundle pattern: frontmatter declares
// 2 symbols, claims fall into two groups — those whose model candidates
// resolve to specific symbols, and those whose model candidates resolve
// to nothing (would attach to zero symbols under Option A).
// ---------------------------------------------------------------------------

describe("runExtractionPipeline — narrow_attribution (v0.3 Fix 2)", () => {
  let tmp: string;
  let db: DatabaseInstance;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-pipeline-narrow-"));
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  function setupFixture() {
    // ADR with 2 frontmatter symbols (both resolve in inventory).
    // Two extracted claims:
    //   - Claim A: model candidates include "SpecificClass" → resolves
    //     specifically. Frontmatter inheritance would broaden to 3 symbols.
    //   - Claim B: model candidates empty → under "drop", attaches to
    //     zero symbols (Option A regression risk). Under
    //     "drop-with-fallback", recovers to the 2 frontmatter symbols.
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-99.md"),
      "---\nid: ADR-99\nsymbols:\n  - BaseFoo\n  - BaseBar\n---\nBody.",
    );
    writeFileSync(
      pathJoin(tmp, "src", "x.ts"),
      "export class BaseFoo {}\nexport class BaseBar {}\nexport class SpecificClass {}",
    );
    const adapter = makeStubAdapter("typescript", [".ts"], (absPath) =>
      absPath.endsWith("x.ts")
        ? [
            {
              id: "sym:ts:src/x.ts:BaseFoo",
              name: "BaseFoo",
              kind: "class",
              path: "src/x.ts",
              line: 1,
              language: "typescript",
            },
            {
              id: "sym:ts:src/x.ts:BaseBar",
              name: "BaseBar",
              kind: "class",
              path: "src/x.ts",
              line: 2,
              language: "typescript",
            },
            {
              id: "sym:ts:src/x.ts:SpecificClass",
              name: "SpecificClass",
              kind: "class",
              path: "src/x.ts",
              line: 3,
              language: "typescript",
            },
          ]
        : [],
    );
    const client = makeStubClient([
      {
        claims: [
          makeClaim({
            claim: "claim-A specific",
            symbol_candidates: ["SpecificClass"],
          }),
          makeClaim({
            claim: "claim-B vague",
            symbol_candidates: [], // model gave no specific candidates
          }),
        ],
      },
    ]);
    return { adapter, client };
  }

  it("flag undefined (Step 7 A1 ship default): drop-with-fallback semantics — Phase 6 §5.1 mechanism resolved", async () => {
    // v0.3 Step 7 A1 ship-default canary. Originally a Step 5
    // v0.2-equivalence canary protecting the v0.2 baseline
    // (frontmatter merged into every claim). v0.3 Step 7 Decision
    // A1 deliberately moves the production default forward to
    // drop-with-fallback semantics — Phase 6 §5.1's muddy-bundle
    // mechanism is resolved by the new default, and the v0.2
    // baseline is no longer reachable via the public API. This
    // canary's role transitions from "protect v0.2 baseline" to
    // "protect new ship default": when narrowAttribution is
    // undefined, claim attribution must behave identically to
    // explicit "drop-with-fallback" (claim-specific candidates
    // only, with frontmatter fallback when claim resolves to zero
    // symbols). Any divergence here means the Fix 2 default-flip
    // regressed.
    //
    // Ship-blocker for Step 14 Stream A closure; future readers
    // MUST NOT weaken this assertion during refactors. Canary
    // discipline established by Step 4 (ADR-15) and continued here
    // makes regression-protection a discoverable pattern across
    // v0.3 work.
    const { adapter, client } = setupFixture();
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
      // narrowAttribution: undefined (Step 7 A1 ship default)
    });
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(2);
    const claimA = claims.find((c) => c.claim === "claim-A specific")!;
    const claimB = claims.find((c) => c.claim === "claim-B vague")!;
    // New default: claim A resolves to SpecificClass via its own
    // candidate (length > 0; fallback does NOT fire). Claim B
    // resolves to zero symbols from its empty model candidates;
    // fallback fires and recovers BaseFoo + BaseBar from
    // frontmatter. v0.2 baseline merge into claim A is no longer
    // reachable.
    expect(claimA.symbolIds).toEqual(["sym:ts:src/x.ts:SpecificClass"]);
    expect(claimB.symbolIds.sort()).toEqual([
      "sym:ts:src/x.ts:BaseBar",
      "sym:ts:src/x.ts:BaseFoo",
    ]);
  });

  it("flag 'drop' (Option A): frontmatter inheritance dropped; claim-B becomes invisible", async () => {
    const { adapter, client } = setupFixture();
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
      narrowAttribution: "drop",
    });
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(2);
    const claimA = claims.find((c) => c.claim === "claim-A specific")!;
    const claimB = claims.find((c) => c.claim === "claim-B vague")!;
    // Option A: only model candidates count. Claim A keeps SpecificClass.
    // Claim B has empty candidates → ZERO symbols. This is the Option A
    // regression risk (claim becomes invisible to get_symbol_context).
    expect(claimA.symbolIds).toEqual(["sym:ts:src/x.ts:SpecificClass"]);
    expect(claimB.symbolIds).toEqual([]);
  });

  it("flag 'drop-with-fallback' (Option E): zero-symbol claims recover to frontmatter", async () => {
    const { adapter, client } = setupFixture();
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
      narrowAttribution: "drop-with-fallback",
    });
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(2);
    const claimA = claims.find((c) => c.claim === "claim-A specific")!;
    const claimB = claims.find((c) => c.claim === "claim-B vague")!;
    // Option E: claim A still narrow (SpecificClass only — fallback
    // does NOT fire because symbolIds.length > 0). Claim B recovers
    // via fallback to BaseFoo + BaseBar.
    expect(claimA.symbolIds).toEqual(["sym:ts:src/x.ts:SpecificClass"]);
    expect(claimB.symbolIds.sort()).toEqual([
      "sym:ts:src/x.ts:BaseBar",
      "sym:ts:src/x.ts:BaseFoo",
    ]);
  });

  it("flag 'drop': claim with no resolvable frontmatter and no candidates still produces zero-symbol claim (no synthetic recovery)", async () => {
    // ADR has only unresolvable frontmatter symbols + empty model
    // candidates. Under "drop", no fallback applies — claim attaches
    // to zero symbols. This is Option A's intended degenerate case;
    // documented in the regression-risk framing.
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-100.md"),
      "---\nid: ADR-100\nsymbols:\n  - DoesNotExist\n---\nBody.",
    );
    const adapter = makeStubAdapter("typescript", [".ts"], () => []);
    const client = makeStubClient([
      {
        claims: [makeClaim({ claim: "vague claim", symbol_candidates: [] })],
      },
    ]);
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
      narrowAttribution: "drop",
    });
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.symbolIds).toEqual([]);
  });

  it("flag 'drop-with-fallback': fallback only fires when frontmatter HAS resolvable entries", async () => {
    // Same setup as above but with drop-with-fallback. Frontmatter
    // entries don't resolve, so there's nothing to fall back to.
    // Claim still attaches to zero symbols — fallback gracefully
    // no-ops rather than synthesizing symbols out of unresolvable
    // names.
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-100.md"),
      "---\nid: ADR-100\nsymbols:\n  - DoesNotExist\n---\nBody.",
    );
    const adapter = makeStubAdapter("typescript", [".ts"], () => []);
    const client = makeStubClient([
      {
        claims: [makeClaim({ claim: "vague claim", symbol_candidates: [] })],
      },
    ]);
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
      narrowAttribution: "drop-with-fallback",
    });
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.symbolIds).toEqual([]);
  });

  it("flag undefined ≡ explicit 'drop-with-fallback' (Step 14 Stream A closure equivalence)", async () => {
    // Step 14 Stream A closure equivalence canary. The Step 7 A1
    // ship default makes undefined narrowAttribution semantically
    // identical to explicit "drop-with-fallback". This test
    // protects that contract: any future refactor that diverges
    // these two paths breaks the Pattern 2 retention story (the
    // explicit form is meant to be a 1:1 alias for the default,
    // kept for symmetry with rollback discipline).
    //
    // Run both paths on identical fixtures and assert the resulting
    // claim attributions match exactly.
    async function runWith(narrow: "drop-with-fallback" | undefined) {
      const innerDb = openDatabase(":memory:");
      const innerTmp = mkdtempSync(pathJoin(tmpdir(), "ca-pipeline-eq-"));
      mkdirSync(pathJoin(innerTmp, "docs", "adr"), { recursive: true });
      mkdirSync(pathJoin(innerTmp, "src"), { recursive: true });
      mkdirSync(pathJoin(innerTmp, ".contextatlas"), { recursive: true });
      writeFileSync(
        pathJoin(innerTmp, "docs", "adr", "ADR-99.md"),
        "---\nid: ADR-99\nsymbols:\n  - BaseFoo\n  - BaseBar\n---\nBody.",
      );
      writeFileSync(
        pathJoin(innerTmp, "src", "x.ts"),
        "export class BaseFoo {}\nexport class BaseBar {}\nexport class SpecificClass {}",
      );
      const adapter = makeStubAdapter("typescript", [".ts"], (absPath) =>
        absPath.endsWith("x.ts")
          ? [
              { id: "sym:ts:src/x.ts:BaseFoo", name: "BaseFoo", kind: "class", path: "src/x.ts", line: 1, language: "typescript" },
              { id: "sym:ts:src/x.ts:BaseBar", name: "BaseBar", kind: "class", path: "src/x.ts", line: 2, language: "typescript" },
              { id: "sym:ts:src/x.ts:SpecificClass", name: "SpecificClass", kind: "class", path: "src/x.ts", line: 3, language: "typescript" },
            ]
          : [],
      );
      const client = makeStubClient([
        {
          claims: [
            makeClaim({ claim: "claim-A specific", symbol_candidates: ["SpecificClass"] }),
            makeClaim({ claim: "claim-B vague", symbol_candidates: [] }),
          ],
        },
      ]);
      // Use the same baseConfig but pin atlas/cache paths into innerTmp
      // so the run can write its outputs without colliding with the
      // describe-block's tmp.
      const cfg = baseConfig();
      await runExtractionPipeline({
        repoRoot: innerTmp,
        config: cfg,
        db: innerDb,
        anthropicClient: client,
        adapters: new Map([["typescript", adapter]]),
        ...(narrow !== undefined ? { narrowAttribution: narrow } : {}),
      });
      const out = listAllClaims(innerDb)
        .map((c) => ({ claim: c.claim, symbolIds: [...c.symbolIds].sort() }))
        .sort((a, b) => a.claim.localeCompare(b.claim));
      innerDb.close();
      rmSync(innerTmp, { recursive: true, force: true });
      return out;
    }
    const undefResult = await runWith(undefined);
    const explicitResult = await runWith("drop-with-fallback");
    expect(undefResult).toEqual(explicitResult);
  });
});
