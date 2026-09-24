import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { insertClaim, listAllClaims } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import { listAllSymbols, upsertSymbols } from "../storage/symbols.js";
import type {
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
} from "../types.js";

import {
  coverageFromInventory,
  planSymbolPrune,
  pruneStaleSymbols,
  summarizeOrphanedClaims,
  type SymbolCoverage,
} from "./symbol-prune.js";

const loc = (path: string, name: string) => ({
  id: `sym:ts:${path}:${name}`,
  path,
});

function coverage(over: Partial<SymbolCoverage> = {}): SymbolCoverage {
  return {
    walkedPaths: new Set(),
    listedPaths: new Set(),
    failedPaths: new Set(),
    inventoryIds: new Set(),
    configuredExtensions: new Set([".ts"]),
    fileExists: () => true,
    ...over,
  };
}

describe("planSymbolPrune (D3 rules)", () => {
  it("rule 1: file no longer on disk → prune all its symbols", () => {
    const plan = planSymbolPrune(
      [loc("src/gone.ts", "A"), loc("src/gone.ts", "B")],
      coverage({ fileExists: () => false }),
    );
    expect(plan.pruneIds).toEqual([
      "sym:ts:src/gone.ts:A",
      "sym:ts:src/gone.ts:B",
    ]);
    expect(plan.prunedByReason.fileDeleted).toBe(2);
    expect(plan.unverified).toEqual([]);
  });

  it("rule 1 applies even when the file's language is not configured", () => {
    const plan = planSymbolPrune(
      [{ id: "sym:py:pkg/gone.py:X", path: "pkg/gone.py" }],
      coverage({ fileExists: () => false }),
    );
    expect(plan.pruneIds).toEqual(["sym:py:pkg/gone.py:X"]);
  });

  it("rule 2: walked + listed → prune only symbols missing from the new listing", () => {
    const plan = planSymbolPrune(
      [loc("src/a.ts", "Keep"), loc("src/a.ts", "Removed")],
      coverage({
        walkedPaths: new Set(["src/a.ts"]),
        listedPaths: new Set(["src/a.ts"]),
        inventoryIds: new Set(["sym:ts:src/a.ts:Keep"]),
      }),
    );
    expect(plan.pruneIds).toEqual(["sym:ts:src/a.ts:Removed"]);
    expect(plan.prunedByReason.symbolRemoved).toBe(1);
  });

  it("rule 3: walked but listSymbols failed → keep everything, report unverified", () => {
    const plan = planSymbolPrune(
      [loc("src/flaky.ts", "A"), loc("src/flaky.ts", "B")],
      coverage({
        walkedPaths: new Set(["src/flaky.ts"]),
        failedPaths: new Set(["src/flaky.ts"]),
      }),
    );
    expect(plan.pruneIds).toEqual([]);
    expect(plan.unverified).toEqual([
      { path: "src/flaky.ts", reason: "listing-failed", symbols: 2 },
    ]);
  });

  it("rule 4: exists, not walked, configured extension (now excluded) → prune", () => {
    const plan = planSymbolPrune(
      [loc("src/a.test.ts", "T")],
      coverage(),
    );
    expect(plan.pruneIds).toEqual(["sym:ts:src/a.test.ts:T"]);
    expect(plan.prunedByReason.fileExcluded).toBe(1);
  });

  it("rule 5: exists, not walked, no configured adapter owns the extension → keep, unverified", () => {
    const plan = planSymbolPrune(
      [{ id: "sym:py:pkg/mod.py:Thing", path: "pkg/mod.py" }],
      coverage(),
    );
    expect(plan.pruneIds).toEqual([]);
    expect(plan.unverified).toEqual([
      { path: "pkg/mod.py", reason: "language-not-configured", symbols: 1 },
    ]);
  });

  it("a walked file that no adapter listed or failed on is kept, not pruned", () => {
    const plan = planSymbolPrune(
      [loc("src/odd.ts", "A")],
      coverage({ walkedPaths: new Set(["src/odd.ts"]) }),
    );
    expect(plan.pruneIds).toEqual([]);
    expect(plan.unverified).toEqual([
      { path: "src/odd.ts", reason: "listing-failed", symbols: 1 },
    ]);
  });

  it("output is deterministic (sorted ids and paths) regardless of input order", () => {
    const existing = [
      loc("src/z.ts", "Z"),
      loc("src/a.ts", "B"),
      loc("src/a.ts", "A"),
    ];
    const cov = coverage({ fileExists: () => false });
    expect(planSymbolPrune(existing, cov).pruneIds).toEqual(
      planSymbolPrune([...existing].reverse(), cov).pruneIds,
    );
    expect(planSymbolPrune(existing, cov).pruneIds).toEqual([
      "sym:ts:src/a.ts:A",
      "sym:ts:src/a.ts:B",
      "sym:ts:src/z.ts:Z",
    ]);
  });
});

describe("coverageFromInventory", () => {
  it("collects walked/listed/failed paths, inventory ids and configured extensions", () => {
    const adapter = { extensions: [".ts", ".tsx"] } as unknown as LanguageAdapter;
    const cov = coverageFromInventory({
      repoRoot: "/nonexistent-root",
      sourceFiles: [
        { absPath: "/x/src/a.ts", relPath: "src/a.ts", sha: "1" },
        { absPath: "/x/src/b.ts", relPath: "src/b.ts", sha: "2" },
      ],
      inventory: {
        byName: new Map(),
        allSymbols: [
          {
            id: "sym:ts:src/a.ts:A",
            name: "A",
            kind: "function",
            path: "src/a.ts",
            line: 1,
            language: "typescript",
          },
        ],
        listedPaths: new Set(["src/a.ts"]),
        failedPaths: new Set(["src/b.ts"]),
      },
      adapters: new Map<LanguageCode, LanguageAdapter>([["typescript", adapter]]),
    });
    expect([...cov.walkedPaths].sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect([...cov.listedPaths]).toEqual(["src/a.ts"]);
    expect([...cov.failedPaths]).toEqual(["src/b.ts"]);
    expect([...cov.inventoryIds]).toEqual(["sym:ts:src/a.ts:A"]);
    expect([...cov.configuredExtensions].sort()).toEqual([".ts", ".tsx"]);
    expect(cov.fileExists("src/a.ts")).toBe(false);
  });
});

describe("pruneStaleSymbols + summarizeOrphanedClaims (storage effects)", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  const sym = (path: string, name: string): AtlasSymbol => ({
    id: `sym:ts:${path}:${name}`,
    name,
    kind: "function",
    path,
    line: 1,
    language: "typescript",
    fileSha: "sha",
  });

  it("deletes pruned symbols, cascades claim_symbols, never deletes claims, and reports newly orphaned claims by source", () => {
    const keep = sym("src/keep.ts", "Keep");
    const gone = sym("src/gone.ts", "Gone");
    upsertSymbols(db, [keep, gone]);
    insertClaim(db, {
      source: "adr:ADR-01.md",
      sourcePath: "docs/adr/ADR-01.md",
      sourceSha: "s",
      severity: "hard",
      claim: "mixed",
      symbolIds: [keep.id, gone.id],
    });
    insertClaim(db, {
      source: "adr:ADR-01.md",
      sourcePath: "docs/adr/ADR-01.md",
      sourceSha: "s",
      severity: "hard",
      claim: "only gone",
      symbolIds: [gone.id],
    });
    insertClaim(db, {
      source: "docstring:src/keep.ts",
      sourcePath: "src/keep.ts",
      sourceSha: "s",
      severity: "soft",
      claim: "doc on gone",
      symbolIds: [gone.id],
    });
    insertClaim(db, {
      source: "adr:ADR-02.md",
      sourcePath: "docs/adr/ADR-02.md",
      sourceSha: "s",
      severity: "hard",
      claim: "already unlinked",
      symbolIds: [],
    });

    const outcome = pruneStaleSymbols(
      db,
      coverage({
        walkedPaths: new Set(["src/keep.ts"]),
        listedPaths: new Set(["src/keep.ts"]),
        inventoryIds: new Set([keep.id]),
        fileExists: (p) => p !== "src/gone.ts",
      }),
    );
    expect(outcome.symbolsPruned).toBe(1);
    expect(outcome.unverifiedSymbolFiles).toBe(0);
    expect(listAllSymbols(db).map((s) => s.id)).toEqual([keep.id]);
    expect(listAllClaims(db)).toHaveLength(4);

    const orphans = summarizeOrphanedClaims(db, outcome.affectedClaimIds);
    expect(orphans.claimsOrphaned).toBe(2);
    expect(orphans.bySource).toEqual([
      { source: "adr:ADR-01.md", sourcePath: "docs/adr/ADR-01.md", count: 1 },
      { source: "docstring:src/keep.ts", sourcePath: "src/keep.ts", count: 1 },
    ]);
  });

  it("claims deleted after the prune (e.g. Stage 5) are not reported as orphaned", () => {
    const gone = sym("src/gone.ts", "Gone");
    upsertSymbols(db, [gone]);
    const id = insertClaim(db, {
      source: "docstring:src/gone.ts",
      sourcePath: "src/gone.ts",
      sourceSha: "s",
      severity: "soft",
      claim: "doc",
      symbolIds: [gone.id],
    });
    const outcome = pruneStaleSymbols(db, coverage({ fileExists: () => false }));
    expect(outcome.affectedClaimIds).toEqual([id]);
    db.prepare("DELETE FROM claims WHERE id = ?").run(id);
    expect(summarizeOrphanedClaims(db, outcome.affectedClaimIds)).toEqual({
      claimsOrphaned: 0,
      bySource: [],
    });
  });

  it("no-op when nothing is stale", () => {
    const keep = sym("src/keep.ts", "Keep");
    upsertSymbols(db, [keep]);
    const outcome = pruneStaleSymbols(
      db,
      coverage({
        walkedPaths: new Set(["src/keep.ts"]),
        listedPaths: new Set(["src/keep.ts"]),
        inventoryIds: new Set([keep.id]),
      }),
    );
    expect(outcome).toMatchObject({
      symbolsPruned: 0,
      affectedClaimIds: [],
      unverifiedSymbolFiles: 0,
    });
  });
});
