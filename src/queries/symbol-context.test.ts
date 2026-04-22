import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { insertClaims } from "../storage/claims.js";
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

import { buildBundle } from "./symbol-context.js";

// ---------------------------------------------------------------------------
// Test harness: stub adapter returning canned data.
// ---------------------------------------------------------------------------

function stubAdapter(responses: {
  references?: Reference[];
  typeInfo?: TypeInfo;
  diagnostics?: Diagnostic[];
  throwOn?: "references" | "typeInfo" | "diagnostics";
}): LanguageAdapter {
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
      if (responses.throwOn === "references") throw new Error("refs-boom");
      return responses.references ?? [];
    },
    async getDiagnostics() {
      if (responses.throwOn === "diagnostics") throw new Error("diag-boom");
      return responses.diagnostics ?? [];
    },
    async getTypeInfo() {
      if (responses.throwOn === "typeInfo") throw new Error("types-boom");
      return (
        responses.typeInfo ?? {
          extends: [],
          implements: [],
          usedByTypes: [],
        }
      );
    },
  };
}

function sym(over: Partial<AtlasSymbol> = {}): AtlasSymbol {
  return {
    id: "sym:ts:src/a.ts:Foo",
    name: "Foo",
    kind: "class",
    path: "src/a.ts",
    line: 1,
    language: "typescript",
    fileSha: "sha",
    ...over,
  };
}

function ref(path: string, line: number): Reference {
  return {
    id: `ref:ts:${path}:${line}`,
    symbolId: "sym:ts:src/a.ts:Foo",
    path,
    line,
  };
}

// ---------------------------------------------------------------------------

describe("buildBundle", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
    upsertSymbols(db, [sym()]);
  });
  afterEach(() => db.close());

  it("populates intent from storage, sorted by severity then source", () => {
    insertClaims(db, [
      {
        source: "ADR-02",
        sourcePath: "docs/adr/ADR-02.md",
        sourceSha: "s",
        severity: "soft",
        claim: "s2",
        symbolIds: [sym().id],
      },
      {
        source: "ADR-01",
        sourcePath: "docs/adr/ADR-01.md",
        sourceSha: "s",
        severity: "hard",
        claim: "h1",
        symbolIds: [sym().id],
      },
      {
        source: "ADR-03",
        sourcePath: "docs/adr/ADR-03.md",
        sourceSha: "s",
        severity: "hard",
        claim: "h3",
        symbolIds: [sym().id],
      },
    ]);
    return buildBundle(
      { db, adapter: stubAdapter({}) },
      {
        symbol: sym(),
        depth: "standard",
        include: ["intent"],
        maxRefs: 50,
      },
    ).then((bundle) => {
      // Hard before soft; hard sorted by source ADR-01 before ADR-03.
      expect(bundle.intent?.map((c) => c.source)).toEqual([
        "ADR-01",
        "ADR-03",
        "ADR-02",
      ]);
    });
  });

  it("buckets src-rooted refs by the segment AFTER the root prefix", async () => {
    // Every ref is under src/; prior to the Phase-B dogfooding fix this
    // collapsed into a single `[src:3]` cluster with no cross-module
    // signal. Now src/ is stripped and buckets reflect billing vs admin.
    const refs = [
      ref("src/billing/charges.ts", 10),
      ref("src/billing/refunds.ts", 20),
      ref("src/admin/orders.ts", 30),
    ];
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({ references: refs }) },
      { symbol: sym(), depth: "standard", include: ["refs"], maxRefs: 50 },
    );
    expect(bundle.refs?.count).toBe(3);
    const modules = bundle.refs?.clusters.map((c) => c.module) ?? [];
    expect(modules.sort()).toEqual(["admin", "billing"]);
    const billingCluster = bundle.refs?.clusters.find(
      (c) => c.module === "billing",
    );
    expect(billingCluster?.count).toBe(2);
  });

  it("strips other common root prefixes (packages, lib, app, source)", async () => {
    const refs = [
      ref("packages/core/a.ts", 1),
      ref("packages/core/b.ts", 2),
      ref("packages/web/c.ts", 3),
    ];
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({ references: refs }) },
      { symbol: sym(), depth: "standard", include: ["refs"], maxRefs: 50 },
    );
    const modules = bundle.refs?.clusters.map((c) => c.module).sort() ?? [];
    expect(modules).toEqual(["core", "web"]);
  });

  it("buckets differ when refs span multiple top-level directories", async () => {
    const refs = [
      ref("billing/a.ts", 1),
      ref("billing/b.ts", 2),
      ref("admin/a.ts", 3),
    ];
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({ references: refs }) },
      { symbol: sym(), depth: "standard", include: ["refs"], maxRefs: 50 },
    );
    expect(bundle.refs?.clusters.map((c) => c.module).sort()).toEqual([
      "admin",
      "billing",
    ]);
  });

  it("respects maxRefs cap on topIds per cluster", async () => {
    // All four refs share the `billing` module after src/ stripping;
    // the cap-per-cluster is what we want to exercise here.
    const refs = [
      ref("src/billing/a.ts", 1),
      ref("src/billing/b.ts", 2),
      ref("src/billing/c.ts", 3),
      ref("src/billing/d.ts", 4),
    ];
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({ references: refs }) },
      { symbol: sym(), depth: "standard", include: ["refs"], maxRefs: 2 },
    );
    expect(bundle.refs?.clusters[0]?.topIds).toHaveLength(2);
    expect(bundle.refs?.count).toBe(4); // count is unaffected by cap
  });

  it("extracts tests bucket from references via filename pattern", async () => {
    const refs = [
      ref("src/a.ts", 1),
      ref("src/a.test.ts", 10),
      ref("tests/integration.ts", 5),
    ];
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({ references: refs }) },
      { symbol: sym(), depth: "standard", include: ["tests", "refs"], maxRefs: 50 },
    );
    expect(bundle.tests?.files.sort()).toEqual([
      "src/a.test.ts",
      "tests/integration.ts",
    ]);
    expect(bundle.tests?.relatedCount).toBe(2);
  });

  it("tests section is omitted when no test files are referenced", async () => {
    const refs = [ref("src/a.ts", 1), ref("src/b.ts", 2)];
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({ references: refs }) },
      { symbol: sym(), depth: "standard", include: ["tests"], maxRefs: 50 },
    );
    expect(bundle.tests).toBeUndefined();
  });

  it("populates types when any field is non-empty", async () => {
    const bundle = await buildBundle(
      {
        db,
        adapter: stubAdapter({
          typeInfo: {
            extends: ["Base"],
            implements: ["Retryable"],
            usedByTypes: ["Child"],
          },
        }),
      },
      { symbol: sym(), depth: "deep", include: ["types"], maxRefs: 50 },
    );
    expect(bundle.types).toEqual({
      extends: ["Base"],
      implements: ["Retryable"],
      usedByTypes: ["Child"],
    });
  });

  it("types section is omitted when all three fields are empty", async () => {
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({}) },
      { symbol: sym(), depth: "deep", include: ["types"], maxRefs: 50 },
    );
    expect(bundle.types).toBeUndefined();
  });

  it("diagnostics are always included when present (not gated by include)", async () => {
    const diag: Diagnostic = {
      severity: "error",
      message: "TS2304: Cannot find name",
      path: "src/a.ts",
      line: 5,
    };
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({ diagnostics: [diag] }) },
      {
        symbol: sym(),
        depth: "summary",
        include: [], // empty include — diagnostics should still surface
        maxRefs: 50,
      },
    );
    expect(bundle.diagnostics).toEqual([diag]);
  });

  it("tolerates adapter failures on references (renders with empty refs)", async () => {
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({ throwOn: "references" }) },
      { symbol: sym(), depth: "standard", include: ["refs"], maxRefs: 50 },
    );
    expect(bundle.refs).toBeUndefined();
  });

  it("tolerates adapter failures on getTypeInfo", async () => {
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({ throwOn: "typeInfo" }) },
      { symbol: sym(), depth: "deep", include: ["types"], maxRefs: 50 },
    );
    expect(bundle.types).toBeUndefined();
  });

  it("populates git block from index-time commits (ADR-11)", async () => {
    replaceGitCommits(db, [
      {
        sha: "a".repeat(40),
        date: "2026-04-20T10:00:00Z",
        message: "fix: retry",
        authorEmail: "alice@example.com",
        files: ["src/a.ts"],
      },
      {
        sha: "b".repeat(40),
        date: "2026-04-19T10:00:00Z",
        message: "refactor",
        authorEmail: "bob@example.com",
        files: ["src/a.ts"],
      },
      {
        sha: "c".repeat(40),
        date: "2026-04-18T10:00:00Z",
        message: "docs",
        authorEmail: "alice@example.com",
        files: ["src/a.ts"],
      },
    ]);
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({}) },
      {
        symbol: sym(),
        depth: "standard",
        include: ["git"],
        maxRefs: 50,
        gitRecentCommits: 2,
      },
    );
    expect(bundle.git).toBeDefined();
    expect(bundle.git?.commitCount).toBe(3);
    expect(bundle.git?.hot).toBe(true); // 3 >= threshold=2
    expect(bundle.git?.hotThreshold).toBe(2);
    expect(bundle.git?.lastTouched).toBe("2026-04-20T10:00:00Z");
    expect(bundle.git?.lastTouchedAuthor).toBe("alice@example.com");
    // recentCommits capped at gitRecentCommits; newest-first
    expect(bundle.git?.recentCommits).toHaveLength(2);
    expect(bundle.git?.recentCommits[0]?.authorEmail).toBe(
      "alice@example.com",
    );
  });

  it("git block omitted when the file has no git history", async () => {
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({}) },
      {
        symbol: sym(),
        depth: "standard",
        include: ["git"],
        maxRefs: 50,
        gitRecentCommits: 5,
      },
    );
    expect(bundle.git).toBeUndefined();
  });

  it("git block marks cold when commit count is below threshold", async () => {
    replaceGitCommits(db, [
      {
        sha: "a".repeat(40),
        date: "2026-04-20T10:00:00Z",
        message: "fix",
        authorEmail: "alice@example.com",
        files: ["src/a.ts"],
      },
    ]);
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({}) },
      {
        symbol: sym(),
        depth: "standard",
        include: ["git"],
        maxRefs: 50,
        gitRecentCommits: 5,
      },
    );
    expect(bundle.git?.hot).toBe(false);
    expect(bundle.git?.commitCount).toBe(1);
  });

  it("empty intent case renders cleanly (no INTENT section, other signals intact)", async () => {
    const refs = [ref("src/a.ts", 1)];
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({ references: refs }) },
      {
        symbol: sym(),
        depth: "standard",
        include: ["intent", "refs"],
        maxRefs: 50,
      },
    );
    expect(bundle.intent).toEqual([]);
    expect(bundle.refs?.count).toBe(1);
  });
});
