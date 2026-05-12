/**
 * V0.8 Step 2.2.b A3 regression tests — substantively converted from
 * Step 2.2.a empirical reproduction investigation substrate per LOCK 3
 * Option γ (convert tests 2-4 into A3 regression tests at A3 ship
 * commit time; preserves audit substrate as regression protection).
 *
 * Regression coverage:
 *   - Test 1 (A2 absorbed-at-earlier-cycle): retained as v0.3 Stream B
 *     substrate preservation regression test (assertions unchanged;
 *     verifies file-level claim delete via deleteClaimsBySourcePath
 *     substantively wipes renamed-symbol stale claims)
 *   - Tests 2-4 (A3 fix-state post-LOCK 2.a + LOCK 2.b): assertions
 *     substantively inverted to match post-fix behavior — Stage 5 now
 *     calls deleteSymbolsByPath(X) alongside deleteClaimsBySourcePath
 *     (X); commit claims at source_path "commit:<sha>" survive Stage 5
 *     deletion (LOCK 2.b retain discipline) with symbolIds = [] post-
 *     cascade (claim_symbols rows cascade-deleted via deleteSymbolsByPath
 *     manual cascade)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteClaimsBySourcePath,
  insertClaim,
  listAllClaims,
} from "./claims.js";
import { openDatabase, type DatabaseInstance } from "./db.js";
import {
  deleteSymbolsByPath,
  listAllSymbols,
  upsertSymbols,
} from "./symbols.js";

describe("v0.8 A2 + A3 regression tests (post-A3-fix state at pipeline.ts Stage 5)", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // Test 1 (A2 absorbed-at-earlier-cycle regression test) — v0.3 Stream B
  // substrate preservation; assertions UNCHANGED from investigation.
  // -------------------------------------------------------------------------

  it("A2 regression — renamed-symbol file re-extraction substantively wipes stale claims via deleteClaimsBySourcePath (v0.3 Stream B substrate preserved)", () => {
    upsertSymbols(db, [
      {
        id: "sym:ts:src/x.ts:foo",
        name: "foo",
        kind: "function",
        path: "src/x.ts",
        line: 1,
        language: "typescript",
        fileSha: "sha-v1",
      },
    ]);

    insertClaim(db, {
      source: "docstring:src/x.ts",
      sourcePath: "src/x.ts",
      sourceSha: "sha-v1",
      severity: "context",
      claim: "foo docs",
      symbolIds: ["sym:ts:src/x.ts:foo"],
    });

    expect(listAllClaims(db)).toHaveLength(1);

    // File re-extracted with renamed symbol foo→bar:
    deleteClaimsBySourcePath(db, "src/x.ts"); // extractDocstringsForFile line 818
    upsertSymbols(db, [
      {
        id: "sym:ts:src/x.ts:bar",
        name: "bar",
        kind: "function",
        path: "src/x.ts",
        line: 1,
        language: "typescript",
        fileSha: "sha-v2",
      },
    ]);
    insertClaim(db, {
      source: "docstring:src/x.ts",
      sourcePath: "src/x.ts",
      sourceSha: "sha-v2",
      severity: "context",
      claim: "bar docs",
      symbolIds: ["sym:ts:src/x.ts:bar"],
    });

    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.claim).toBe("bar docs");
    expect(claims[0]!.symbolIds).toEqual(["sym:ts:src/x.ts:bar"]);
  });

  // -------------------------------------------------------------------------
  // Tests 2-4 (A3 post-fix regression) — assertions INVERTED to match
  // post-LOCK-2.a + LOCK-2.b A3 fix-state at pipeline.ts Stage 5.
  // -------------------------------------------------------------------------

  it("A3 regression — Stage 5 file deletion cascades claim_symbols rows for commit claims via deleteSymbolsByPath (LOCK 2.a Stage 5 placement)", () => {
    upsertSymbols(db, [
      {
        id: "sym:ts:src/x.ts:foo",
        name: "foo",
        kind: "function",
        path: "src/x.ts",
        line: 1,
        language: "typescript",
        fileSha: "sha-v1",
      },
    ]);

    insertClaim(db, {
      source: "commit:abc123",
      sourcePath: "commit:abc123", // commit-extractor convention
      sourceSha: "abc123",
      severity: "context",
      claim: "commit touches foo",
      symbolIds: ["sym:ts:src/x.ts:foo"],
    });

    expect(listAllClaims(db)).toHaveLength(1);

    // Simulate post-A3-fix Stage 5 for deleted file src/x.ts:
    //   pipeline.ts:343-345 (post-fix):
    //     deleteClaimsBySourcePath(db, deletedPath)
    //     deleteSymbolsByPath(db, deletedPath)  // NEW per A3 LOCK 2.a
    //     DELETE FROM source_shas WHERE source_path = deletedPath
    deleteClaimsBySourcePath(db, "src/x.ts");
    deleteSymbolsByPath(db, "src/x.ts");

    // LOCK 2.b retain discipline: commit claim SURVIVES at source_path
    // "commit:abc123" (historical-narrative substrate preserved)
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.source).toBe("commit:abc123");

    // BUT: claim_symbols rows referencing foo cascade-deleted via
    // deleteSymbolsByPath manual cascade (symbols.ts:151-154). Commit
    // claim's symbolIds substantively now empty — orphan-claim-shell
    // preserved per LOCK 2.b retain discipline.
    expect(claims[0]!.symbolIds).toEqual([]);

    // Symbol foo gone (deleteSymbolsByPath wiped from symbols table)
    const symbols = listAllSymbols(db);
    expect(symbols).toHaveLength(0);
  });

  it("A3 regression — Stage 5 file deletion preserves commit claims with multi-symbol linkages where some symbols persist (selective cascade)", () => {
    // Setup: file X has symbol foo; file Y has symbol bar. Commit C
    // references both.
    upsertSymbols(db, [
      {
        id: "sym:ts:src/x.ts:foo",
        name: "foo",
        kind: "function",
        path: "src/x.ts",
        line: 1,
        language: "typescript",
        fileSha: "sha-x",
      },
      {
        id: "sym:ts:src/y.ts:bar",
        name: "bar",
        kind: "function",
        path: "src/y.ts",
        line: 1,
        language: "typescript",
        fileSha: "sha-y",
      },
    ]);

    insertClaim(db, {
      source: "commit:abc123",
      sourcePath: "commit:abc123",
      sourceSha: "abc123",
      severity: "context",
      claim: "commit touches foo + bar",
      symbolIds: ["sym:ts:src/x.ts:foo", "sym:ts:src/y.ts:bar"],
    });

    // Only file X deleted; file Y persists
    deleteClaimsBySourcePath(db, "src/x.ts");
    deleteSymbolsByPath(db, "src/x.ts");

    // Commit claim survives with bar-only symbolIds (selective cascade)
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.symbolIds).toEqual(["sym:ts:src/y.ts:bar"]);

    // Symbol bar persists; symbol foo gone
    const symbols = listAllSymbols(db);
    expect(symbols.map((s) => s.id).sort()).toEqual(["sym:ts:src/y.ts:bar"]);
  });

  it("A3 regression — Stage 5 deletion is idempotent (repeated deletion no-op)", () => {
    upsertSymbols(db, [
      {
        id: "sym:ts:src/x.ts:foo",
        name: "foo",
        kind: "function",
        path: "src/x.ts",
        line: 1,
        language: "typescript",
        fileSha: "sha-v1",
      },
    ]);
    insertClaim(db, {
      source: "commit:abc123",
      sourcePath: "commit:abc123",
      sourceSha: "abc123",
      severity: "context",
      claim: "commit touches foo",
      symbolIds: ["sym:ts:src/x.ts:foo"],
    });

    // First deletion
    deleteClaimsBySourcePath(db, "src/x.ts");
    deleteSymbolsByPath(db, "src/x.ts");

    // Repeated deletion — no-op, no error
    expect(() => deleteClaimsBySourcePath(db, "src/x.ts")).not.toThrow();
    expect(() => deleteSymbolsByPath(db, "src/x.ts")).not.toThrow();

    // Final state unchanged from after first deletion
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.symbolIds).toEqual([]);
    expect(listAllSymbols(db)).toHaveLength(0);
  });
});
