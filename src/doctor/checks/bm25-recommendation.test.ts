/**
 * v0.8 Ship 4b — BM25 recommendation logic tests.
 *
 * Covers the per-symbol density gate (≥6 claims, per ADDENDUM AJ
 * Option A lock) + the four outcome shapes (flag×density 2×2 matrix)
 * + edge cases (empty atlas, malformed claims, multi-symbol claims).
 *
 * Threshold rationale (Ship 4a empirical): with top-5 bundle return,
 * symbols carrying ≤5 claims have their full claim set surfaced
 * regardless of ranking — reorder is invisible. At 6+ claims, top-5
 * must SELECT from a longer pool → ranking choice becomes user-
 * visible. Hono v0.8-cli dogfood validated this empirically at 4/4
 * densely-attached symbols (Context=17, Hono=27, Router=6, compose=12).
 */
import { describe, expect, it } from "vitest";

import {
  bm25RecommendationCheck,
  computeBM25DensitySignal,
} from "./atlas.js";
import type { CheckContext } from "../types.js";
import type { ContextAtlasConfig } from "../../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClaim(symbolIds: readonly string[]): {
  symbol_ids: readonly string[];
} {
  return { symbol_ids: symbolIds };
}

function makeConfig(bm25Enabled: boolean | undefined): ContextAtlasConfig {
  return {
    version: 1,
    languages: ["typescript"],
    adrs: { path: "docs/adr/", format: "markdown-frontmatter" },
    docs: { include: [] },
    atlas: {
      committed: true,
      path: ".contextatlas/atlas.json",
      localCache: ".contextatlas/index.db",
    },
    ...(bm25Enabled === undefined
      ? {}
      : { mcp: { symbolContextBM25: bm25Enabled } }),
  };
}

function makeCtx(bm25Enabled: boolean | undefined): CheckContext {
  return {
    repoRoot: "/fake/repo",
    config: makeConfig(bm25Enabled),
    configPath: "/fake/repo/.contextatlas.yml",
    configError: null,
  };
}

// ---------------------------------------------------------------------------
// computeBM25DensitySignal — pure-data fold
// ---------------------------------------------------------------------------

describe("computeBM25DensitySignal", () => {
  it("returns zeros for an empty claims array", () => {
    const s = computeBM25DensitySignal([]);
    expect(s.totalClaims).toBe(0);
    expect(s.qualifyingSymbols).toBe(0);
    expect(s.maxCount).toBe(0);
    expect(s.maxSymbol).toBeNull();
    expect(s.perSymbolCount.size).toBe(0);
  });

  it("counts a single claim attached to one symbol", () => {
    const s = computeBM25DensitySignal([makeClaim(["sym:ts:src/foo.ts:Foo"])]);
    expect(s.totalClaims).toBe(1);
    expect(s.perSymbolCount.get("sym:ts:src/foo.ts:Foo")).toBe(1);
    expect(s.maxCount).toBe(1);
    expect(s.qualifyingSymbols).toBe(0); // below threshold
  });

  it("multi-symbol claims contribute +1 to each referenced symbol", () => {
    const s = computeBM25DensitySignal([
      makeClaim(["A", "B", "C"]),
      makeClaim(["A", "B"]),
      makeClaim(["A"]),
    ]);
    expect(s.totalClaims).toBe(3);
    expect(s.perSymbolCount.get("A")).toBe(3);
    expect(s.perSymbolCount.get("B")).toBe(2);
    expect(s.perSymbolCount.get("C")).toBe(1);
    expect(s.maxCount).toBe(3);
    expect(s.maxSymbol).toBe("A");
  });

  it("reaches qualifyingSymbols=1 at exactly the threshold (6 claims)", () => {
    const claims = Array.from({ length: 6 }, () => makeClaim(["S1"]));
    const s = computeBM25DensitySignal(claims);
    expect(s.maxCount).toBe(6);
    expect(s.qualifyingSymbols).toBe(1);
  });

  it("stays at qualifyingSymbols=0 just below threshold (5 claims)", () => {
    const claims = Array.from({ length: 5 }, () => makeClaim(["S1"]));
    const s = computeBM25DensitySignal(claims);
    expect(s.maxCount).toBe(5);
    expect(s.qualifyingSymbols).toBe(0);
  });

  it("counts multiple qualifying symbols independently", () => {
    const claims = [
      ...Array.from({ length: 7 }, () => makeClaim(["A"])),
      ...Array.from({ length: 6 }, () => makeClaim(["B"])),
      ...Array.from({ length: 3 }, () => makeClaim(["C"])),
    ];
    const s = computeBM25DensitySignal(claims);
    expect(s.qualifyingSymbols).toBe(2); // A and B qualify, C does not
    expect(s.maxCount).toBe(7);
    expect(s.maxSymbol).toBe("A");
  });

  it("ignores malformed claims defensively", () => {
    const claims: unknown[] = [
      null,
      "not an object",
      { symbol_ids: "not an array" },
      { symbol_ids: [123, "valid:id"] }, // 123 is not a string → ignored
      makeClaim(["valid"]),
    ];
    const s = computeBM25DensitySignal(claims);
    // Only the last two claims contribute. 'valid:id' from #4 + 'valid' from #5.
    expect(s.totalClaims).toBe(5); // raw length includes malformed entries
    expect(s.perSymbolCount.get("valid")).toBe(1);
    expect(s.perSymbolCount.get("valid:id")).toBe(1);
    expect(s.maxCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// bm25RecommendationCheck — 2×2 outcome matrix (flag × density)
// ---------------------------------------------------------------------------

describe("bm25RecommendationCheck — 2×2 flag×density matrix", () => {
  // 7 claims attached to the same symbol → dense
  const denseClaims = Array.from({ length: 7 }, () =>
    makeClaim(["sym:ts:src/router.ts:Router"]),
  );
  // 3 claims spread across 3 symbols → sparse (no symbol reaches 6)
  const sparseClaims = [
    makeClaim(["sym:ts:src/a.ts:A"]),
    makeClaim(["sym:ts:src/b.ts:B"]),
    makeClaim(["sym:ts:src/c.ts:C"]),
  ];

  it("flag-OFF + DENSE → WARN with RECOMMEND ENABLE message", () => {
    const result = bm25RecommendationCheck(denseClaims, makeCtx(false));
    expect(result.id).toBe("atlas.bm25_recommendation");
    expect(result.category).toBe("atlas");
    expect(result.status).toBe("warn");
    expect(result.message).toMatch(/RECOMMEND enable mcp\.symbol_context_bm25/);
    expect(result.message).toContain("7 claims");
    expect(result.message).toContain("1 symbol(s) with ≥6 claims");
    expect(result.message).toContain("sym:ts:src/router.ts:Router");
    expect(result.detail).toMatch(/symbol_context_bm25: true/);
    expect(result.detail).toMatch(/ADR-16/);
  });

  it("flag-OFF + DENSE: triggers WARN even when bm25 key absent from config (undefined ≠ true)", () => {
    const result = bm25RecommendationCheck(denseClaims, makeCtx(undefined));
    expect(result.status).toBe("warn");
    expect(result.message).toMatch(/RECOMMEND enable/);
  });

  it("flag-OFF + SPARSE → PASS with SKIP rationale", () => {
    const result = bm25RecommendationCheck(sparseClaims, makeCtx(false));
    expect(result.status).toBe("pass");
    expect(result.message).toMatch(/not recommended at this density/);
    expect(result.message).toContain("3 claims");
    expect(result.detail).toMatch(/severity-then-source ordering/);
  });

  it("flag-ON + DENSE → PASS already-enabled-at-density-that-benefits", () => {
    const result = bm25RecommendationCheck(denseClaims, makeCtx(true));
    expect(result.status).toBe("pass");
    expect(result.message).toMatch(/enabled; atlas density supports it/);
    expect(result.message).toContain("1 symbol(s) with ≥6 claims");
    expect(result.message).toContain("max=7 on sym:ts:src/router.ts:Router");
    expect(result.detail).toBeUndefined();
  });

  it("flag-ON + SPARSE → PASS with note about density-below-threshold", () => {
    const result = bm25RecommendationCheck(sparseClaims, makeCtx(true));
    expect(result.status).toBe("pass");
    expect(result.message).toMatch(/enabled \(atlas total: 3 claims/);
    expect(result.detail).toMatch(/reordering is invisible/);
  });
});

// ---------------------------------------------------------------------------
// Edge cases — empty atlas + multi-symbol max-tie-break + many qualifying
// ---------------------------------------------------------------------------

describe("bm25RecommendationCheck — edge cases", () => {
  it("empty atlas → PASS SKIP (zero claims, zero qualifying)", () => {
    const result = bm25RecommendationCheck([], makeCtx(false));
    expect(result.status).toBe("pass");
    expect(result.message).toMatch(/not recommended at this density/);
    expect(result.message).toContain("0 claims");
  });

  it("multiple qualifying symbols: message reports count + max", () => {
    const claims = [
      ...Array.from({ length: 10 }, () => makeClaim(["BigSym"])),
      ...Array.from({ length: 8 }, () => makeClaim(["MidSym"])),
      ...Array.from({ length: 6 }, () => makeClaim(["JustQualifying"])),
      ...Array.from({ length: 2 }, () => makeClaim(["Sparse"])),
    ];
    const result = bm25RecommendationCheck(claims, makeCtx(false));
    expect(result.status).toBe("warn");
    expect(result.message).toContain("26 claims");
    expect(result.message).toContain("3 symbol(s) with ≥6 claims");
    expect(result.message).toContain("max=10 on BigSym");
  });

  it("boundary case at exactly 5 claims attached → SKIP (below threshold)", () => {
    const claims = Array.from({ length: 5 }, () =>
      makeClaim(["sym:ts:src/foo.ts:Foo"]),
    );
    const result = bm25RecommendationCheck(claims, makeCtx(false));
    expect(result.status).toBe("pass");
    expect(result.message).toMatch(/not recommended at this density/);
  });

  it("boundary case at exactly 6 claims attached → RECOMMEND (at threshold)", () => {
    const claims = Array.from({ length: 6 }, () =>
      makeClaim(["sym:ts:src/foo.ts:Foo"]),
    );
    const result = bm25RecommendationCheck(claims, makeCtx(false));
    expect(result.status).toBe("warn");
    expect(result.message).toMatch(/RECOMMEND enable/);
    expect(result.message).toContain("max=6");
  });

  it("null config (limited mode shouldn't reach this check, but defensive)", () => {
    const ctx: CheckContext = {
      repoRoot: "/fake",
      config: null,
      configPath: null,
      configError: null,
    };
    const denseClaims = Array.from({ length: 7 }, () =>
      makeClaim(["sym:ts:src/foo.ts:Foo"]),
    );
    // config=null treats bm25Enabled as false (undefined !== true) → WARN
    const result = bm25RecommendationCheck(denseClaims, ctx);
    expect(result.status).toBe("warn");
  });
});
