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
      return r ?? null;
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

  it("merges frontmatter 'symbols:' hints into every claim from that source", async () => {
    // ADR frontmatter declares Foo as governed; the model's claim
    // doesn't mention Foo in symbol_candidates at all, yet the stored
    // claim should still link to Foo via the frontmatter hint.
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

  it("frontmatter symbols come BEFORE model candidates in the merged order", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-97.md"),
      "---\nid: ADR-97\nsymbols:\n  - Authoritative\n---\nBody.",
    );
    writeFileSync(
      pathJoin(tmp, "src", "x.ts"),
      "export class Authoritative {}\nexport class Inferred {}",
    );
    const adapter = adapterForSrc({
      "x.ts": [
        {
          id: "sym:ts:src/x.ts:Authoritative",
          name: "Authoritative",
          kind: "class",
          path: "src/x.ts",
          line: 1,
          language: "typescript",
        },
        {
          id: "sym:ts:src/x.ts:Inferred",
          name: "Inferred",
          kind: "class",
          path: "src/x.ts",
          line: 2,
          language: "typescript",
        },
      ],
    });
    const client = makeStubClient([
      {
        claims: [
          makeClaim({
            claim: "x",
            symbol_candidates: ["Inferred"], // model picked only Inferred
          }),
        ],
      },
    ]);
    await runExtractionPipeline({
      repoRoot: tmp,
      config: baseConfig(),
      db,
      anthropicClient: client,
      adapters: new Map([["typescript", adapter]]),
    });
    const claims = listAllClaims(db);
    // Author-declared Authoritative comes first; model-inferred Inferred follows.
    expect(claims[0]?.symbolIds).toEqual([
      "sym:ts:src/x.ts:Authoritative",
      "sym:ts:src/x.ts:Inferred",
    ]);
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
});
