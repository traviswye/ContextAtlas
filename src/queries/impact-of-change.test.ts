import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { insertClaim } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import { replaceGitCommits } from "../storage/git.js";
import { upsertSymbols } from "../storage/symbols.js";
import type {
  Diagnostic,
  LanguageAdapter,
  Reference,
  Symbol as AtlasSymbol,
  SymbolId,
  TypeInfo,
} from "../types.js";

import { buildImpactBundle } from "./impact-of-change.js";

function stubAdapter(over: {
  refs?: Reference[];
  typeInfo?: TypeInfo;
  diagnostics?: Diagnostic[];
} = {}): LanguageAdapter {
  return {
    language: "typescript",
    extensions: [".ts"],
    async initialize() {},
    async shutdown() {},
    async listSymbols() {
      return [];
    },
    async getSymbolDetails() {
      return null;
    },
    async findReferences(_id: SymbolId) {
      return over.refs ?? [];
    },
    async getDiagnostics() {
      return over.diagnostics ?? [];
    },
    async getTypeInfo() {
      return (
        over.typeInfo ?? { extends: [], implements: [], usedByTypes: [] }
      );
    },
  };
}

function sym(over: Partial<AtlasSymbol> = {}): AtlasSymbol {
  return {
    id: "sym:ts:src/orders/processor.ts:OrderProcessor",
    name: "OrderProcessor",
    kind: "class",
    path: "src/orders/processor.ts",
    line: 42,
    language: "typescript",
    fileSha: "abc",
    signature: "class OrderProcessor",
    ...over,
  };
}

describe("buildImpactBundle", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
    upsertSymbols(db, [sym()]);
  });
  afterEach(() => db.close());

  it("composes the primitive bundle plus co-change plus risk signals", async () => {
    insertClaim(db, {
      source: "ADR-07",
      sourcePath: "docs/adr/ADR-07.md",
      sourceSha: "s",
      severity: "hard",
      claim: "must be idempotent",
      symbolIds: [sym().id],
    });
    insertClaim(db, {
      source: "ADR-09",
      sourcePath: "docs/adr/ADR-09.md",
      sourceSha: "s",
      severity: "soft",
      claim: "retry budget bounded",
      symbolIds: [sym().id],
    });

    replaceGitCommits(db, [
      {
        sha: "a".repeat(40),
        date: "2026-04-20T10:00:00Z",
        message: "fix",
        authorEmail: "alice@example.com",
        files: ["src/orders/processor.ts", "src/orders/queue.ts"],
      },
      {
        sha: "b".repeat(40),
        date: "2026-04-19T10:00:00Z",
        message: "refactor",
        authorEmail: "bob@example.com",
        files: [
          "src/orders/processor.ts",
          "src/orders/queue.ts",
          "test/orders.test.ts",
        ],
      },
    ]);

    const adapter = stubAdapter({
      refs: [
        {
          id: "ref:ts:src/orders/api.ts:10",
          symbolId: sym().id,
          path: "src/orders/api.ts",
          line: 10,
        },
        {
          id: "ref:ts:test/orders.test.ts:5",
          symbolId: sym().id,
          path: "test/orders.test.ts",
          line: 5,
        },
      ],
    });

    const impact = await buildImpactBundle(
      { db, adapter },
      { symbol: sym(), gitRecentCommits: 2 },
    );

    // Bundle carries the primitive signals.
    expect(impact.bundle.intent).toHaveLength(2);
    expect(impact.bundle.refs?.count).toBe(2);
    expect(impact.bundle.tests?.relatedCount).toBe(1);
    expect(impact.bundle.git?.hot).toBe(true);

    // Co-change: queue.ts co-occurs in 2 commits; test file in 1.
    expect(impact.coChange.map((c) => c.filePath)).toEqual([
      "src/orders/queue.ts",
      "test/orders.test.ts",
    ]);
    expect(impact.coChange[0]?.coCommitCount).toBe(2);

    // Risk signals derived from the bundle.
    expect(impact.riskSignals.hardClaims).toBe(1);
    expect(impact.riskSignals.softClaims).toBe(1);
    expect(impact.riskSignals.contextClaims).toBe(0);
    expect(impact.riskSignals.testFiles).toBe(1);
    expect(impact.riskSignals.hot).toBe(true);
  });

  it("returns empty co-change array when the file has no shared commits", async () => {
    replaceGitCommits(db, [
      {
        sha: "a".repeat(40),
        date: "2026-04-20T10:00:00Z",
        message: "fix",
        authorEmail: "alice@example.com",
        files: ["src/orders/processor.ts"],
      },
    ]);
    const impact = await buildImpactBundle(
      { db, adapter: stubAdapter({}) },
      { symbol: sym(), gitRecentCommits: 5 },
    );
    expect(impact.coChange).toEqual([]);
  });

  it("risk signals default to zero when no signal sources populated", async () => {
    const impact = await buildImpactBundle(
      { db, adapter: stubAdapter({}) },
      { symbol: sym(), gitRecentCommits: 5 },
    );
    expect(impact.riskSignals.hot).toBe(false);
    expect(impact.riskSignals.commitCount).toBe(0);
    expect(impact.riskSignals.testFiles).toBe(0);
    expect(impact.riskSignals.diagnostics).toBe(0);
    expect(impact.riskSignals.hardClaims).toBe(0);
  });

  it("respects coChangeLimit cap", async () => {
    replaceGitCommits(db, [
      {
        sha: "a".repeat(40),
        date: "2026-04-20T10:00:00Z",
        message: "fix",
        authorEmail: "alice@example.com",
        files: [
          "src/orders/processor.ts",
          "a.ts",
          "b.ts",
          "c.ts",
          "d.ts",
          "e.ts",
          "f.ts",
        ],
      },
    ]);
    const impact = await buildImpactBundle(
      { db, adapter: stubAdapter({}) },
      { symbol: sym(), coChangeLimit: 3 },
    );
    expect(impact.coChange).toHaveLength(3);
  });
});
