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

// ---------------------------------------------------------------------------
// v0.3 Theme 1.2 Fix 3 — BM25 ranking on get_symbol_context (ADR-16)
//
// Two ship-blocker canaries (parallel role to Step 4 BYTE_EQUIVALENCE_EXPECTED
// in src/mcp/server.test.ts and Step 5 v0.2-equivalence canary in
// src/extraction/pipeline.test.ts):
//
//   1. bm25Query absent → v0.2 deterministic ordering preserved exactly.
//      (Server-flag-off OR caller-no-query both fall through to this path
//      via handler-side gating; this test locks the option-absent
//      contract directly.)
//   2. bm25Query present → BM25 ranking activates; claims matching the
//      query rank ahead of unmatched claims; severity becomes a
//      tiebreaker rather than the primary sort key.
//
// Canary discipline established by Step 4 (ADR-15) and Step 5 (Fix 2)
// continues here as a 3-data-point pattern. Future readers MUST NOT
// weaken these assertions during refactors.
// ---------------------------------------------------------------------------

describe("buildBundle — BM25 intent ranking (Fix 3, ADR-16)", () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = openDatabase(":memory:");
    upsertSymbols(db, [
      {
        id: "sym:ts:src/orders/processor.ts:OrderProcessor",
        name: "OrderProcessor",
        kind: "class",
        path: "src/orders/processor.ts",
        line: 42,
        signature: "class OrderProcessor",
        language: "typescript",
        fileSha: "abc",
      },
    ]);
    // Three claims attached to OrderProcessor — same severity (hard),
    // same source (ADR-07). Phase 6 §5.1 muddy-bundle pattern: all
    // claims tie on severity + source, so v0.2 ordering falls back to
    // claim id (insertion order). Different claim TEXT lets BM25
    // distinguish them when given a query.
    insertClaims(db, [
      {
        source: "ADR-07",
        sourcePath: "docs/adr/ADR-07.md",
        sourceSha: "s",
        severity: "hard",
        // Inserted FIRST → wins claim-id tiebreaker under v0.2.
        // Off-target relative to "payment idempotency" query.
        claim: "request-side streaming uses a generator object",
        symbolIds: ["sym:ts:src/orders/processor.ts:OrderProcessor"],
      },
      {
        source: "ADR-07",
        sourcePath: "docs/adr/ADR-07.md",
        sourceSha: "s",
        severity: "hard",
        // On-target for "payment idempotency" query. Inserted SECOND →
        // loses to first claim under v0.2 ordering despite better match.
        claim: "payment idempotency must be enforced via retry budget",
        symbolIds: ["sym:ts:src/orders/processor.ts:OrderProcessor"],
      },
      {
        source: "ADR-07",
        sourcePath: "docs/adr/ADR-07.md",
        sourceSha: "s",
        severity: "hard",
        // Partial match — "idempotency" hit but no "payment".
        claim: "idempotency keys live for 24 hours",
        symbolIds: ["sym:ts:src/orders/processor.ts:OrderProcessor"],
      },
    ]);
  });

  afterEach(() => {
    db.close();
  });

  function symbol(): AtlasSymbol {
    return {
      id: "sym:ts:src/orders/processor.ts:OrderProcessor",
      name: "OrderProcessor",
      kind: "class",
      path: "src/orders/processor.ts",
      line: 42,
      signature: "class OrderProcessor",
      language: "typescript",
      fileSha: "abc",
    };
  }

  it("CANARY 1 — bm25Query absent: v0.2 deterministic ordering preserved exactly", async () => {
    // Step 6 v0.2-equivalence canary (ADR-16 ship-blocker). Parallel
    // role to Step 4's BYTE_EQUIVALENCE_EXPECTED (server.test.ts) and
    // Step 5's v0.2-equivalence canary (pipeline.test.ts). Asserts
    // that omitting bm25Query produces the same intent ordering as
    // pre-Step-6 code: severity → source → claim_id ASC.
    //
    // This canary fires regardless of how server-side gating evolves
    // (handler-level flag check, config-level flag, future env-var
    // override): the option-absent contract at the buildBundle layer
    // is the single load-bearing assertion.
    //
    // Future readers MUST NOT weaken this assertion during refactors.
    // Canary discipline as a 3-data-point pattern across v0.3 work.
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({}) },
      {
        symbol: symbol(),
        depth: "standard",
        include: ["intent"],
        maxRefs: 50,
        // bm25Query absent → fallback to v0.2 ordering.
      },
    );
    const claims = bundle.intent ?? [];
    expect(claims).toHaveLength(3);
    // v0.2: insertion order (claim id ASC) wins all tiebreakers since
    // severity + source are identical.
    expect(claims[0]?.claim).toBe(
      "request-side streaming uses a generator object",
    );
    expect(claims[1]?.claim).toBe(
      "payment idempotency must be enforced via retry budget",
    );
    expect(claims[2]?.claim).toBe("idempotency keys live for 24 hours");
  });

  it("CANARY 2 — bm25Query present: matched claims rank ahead of unmatched (Phase 6 §5.1 mechanism check)", async () => {
    // Step 6 BM25-activation canary (ADR-16 ship-blocker). Asserts
    // that providing bm25Query reorders claims away from v0.2's
    // insertion-order fallback. This is the Phase 6 §5.1 muddy-bundle
    // mechanism check: when all claims tie on severity + source, BM25
    // against a query DOES distinguish them.
    //
    // Without this canary, the BM25 path could silently no-op (e.g.,
    // FTS5 trigger broken, sanitizer dropping all tokens) without
    // failing existing tests — the v0.2 fallback would mask the
    // regression.
    //
    // Future readers MUST NOT weaken this assertion.
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({}) },
      {
        symbol: symbol(),
        depth: "standard",
        include: ["intent"],
        maxRefs: 50,
        bm25Query: "payment idempotency",
      },
    );
    const claims = bundle.intent ?? [];
    expect(claims).toHaveLength(3);
    // BM25 ranks "payment idempotency must be enforced..." first
    // (exact phrase + both query tokens). "idempotency keys..." is
    // partial match (one token). The off-target "request-side
    // streaming..." matches NEITHER token → unmatched → sorts last
    // via POSITIVE_INFINITY sentinel.
    expect(claims[0]?.claim).toBe(
      "payment idempotency must be enforced via retry budget",
    );
    expect(claims[1]?.claim).toBe("idempotency keys live for 24 hours");
    expect(claims[2]?.claim).toBe(
      "request-side streaming uses a generator object",
    );
  });

  it("bm25Query empty/whitespace falls back to v0.2 ordering (defensive)", async () => {
    // Handler-level gating should prevent empty queries from reaching
    // here, but the helper handles the case defensively. Empty-query
    // BM25 has nothing to rank against, so falls back to v0.2.
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({}) },
      {
        symbol: symbol(),
        depth: "standard",
        include: ["intent"],
        maxRefs: 50,
        bm25Query: "   ",
      },
    );
    const claims = bundle.intent ?? [];
    // Same as CANARY 1: insertion order wins.
    expect(claims[0]?.claim).toBe(
      "request-side streaming uses a generator object",
    );
  });

  it("bm25Query with no matching claims: all claims unmatched → fall back to v0.2 ordering within unmatched bucket", async () => {
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({}) },
      {
        symbol: symbol(),
        depth: "standard",
        include: ["intent"],
        maxRefs: 50,
        bm25Query: "completely unrelated phrase tokenization",
      },
    );
    const claims = bundle.intent ?? [];
    expect(claims).toHaveLength(3);
    // All three claims tie at POSITIVE_INFINITY (none match query
    // tokens). Tiebreaker chain falls through to severity → source
    // → id, which means insertion order wins (same as CANARY 1
    // since severity + source are identical across all three).
    expect(claims[0]?.claim).toBe(
      "request-side streaming uses a generator object",
    );
  });

  it("bm25Query when symbol has zero claims: returns empty intent (no crash)", async () => {
    upsertSymbols(db, [
      {
        id: "sym:ts:src/empty.ts:Lone",
        name: "Lone",
        kind: "class",
        path: "src/empty.ts",
        line: 1,
        language: "typescript",
        fileSha: "x",
      },
    ]);
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({}) },
      {
        symbol: {
          id: "sym:ts:src/empty.ts:Lone",
          name: "Lone",
          kind: "class",
          path: "src/empty.ts",
          line: 1,
          language: "typescript",
          fileSha: "x",
        },
        depth: "standard",
        include: ["intent"],
        maxRefs: 50,
        bm25Query: "anything",
      },
    );
    expect(bundle.intent).toEqual([]);
  });

  it("bm25Query with mixed-severity claims: BM25 dominates, severity is tiebreaker (ADR-16 chain α)", async () => {
    // Different severities + same BM25 score (no claim text matches
    // query) → severity becomes the load-bearing tiebreaker. Verifies
    // chain choice (α): BM25 dominates when query provided, severity
    // is only the tiebreaker, not the primary key.
    db.close();
    db = openDatabase(":memory:");
    upsertSymbols(db, [
      {
        id: "sym:ts:src/x.ts:Foo",
        name: "Foo",
        kind: "class",
        path: "src/x.ts",
        line: 1,
        language: "typescript",
        fileSha: "x",
      },
    ]);
    insertClaims(db, [
      {
        source: "ADR-09",
        sourcePath: "docs/adr/ADR-09.md",
        sourceSha: "s",
        severity: "context", // sorts LAST under v0.2 (severity-first)
        claim: "payment idempotency exact match here",
        symbolIds: ["sym:ts:src/x.ts:Foo"],
      },
      {
        source: "ADR-09",
        sourcePath: "docs/adr/ADR-09.md",
        sourceSha: "s",
        severity: "hard", // sorts FIRST under v0.2
        claim: "completely unrelated topic",
        symbolIds: ["sym:ts:src/x.ts:Foo"],
      },
    ]);
    const bundle = await buildBundle(
      { db, adapter: stubAdapter({}) },
      {
        symbol: {
          id: "sym:ts:src/x.ts:Foo",
          name: "Foo",
          kind: "class",
          path: "src/x.ts",
          line: 1,
          language: "typescript",
          fileSha: "x",
        },
        depth: "standard",
        include: ["intent"],
        maxRefs: 50,
        bm25Query: "payment idempotency",
      },
    );
    const claims = bundle.intent ?? [];
    expect(claims).toHaveLength(2);
    // BM25 wins: the context-severity claim (better match) ranks
    // above the hard-severity claim (no match). This would be REVERSED
    // under v0.2 ordering — that's the whole point of Fix 3.
    expect(claims[0]?.severity).toBe("context");
    expect(claims[0]?.claim).toBe("payment idempotency exact match here");
    expect(claims[1]?.severity).toBe("hard");
  });
});
