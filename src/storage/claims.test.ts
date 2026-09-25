import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteClaimsBySourcePath,
  getSourceSha,
  insertClaim,
  insertClaims,
  listAllClaims,
  listClaimsForSymbol,
  listClaimSymbolCandidates,
  listSourceShas,
  setSourceSha,
  type NewClaim,
} from "./claims.js";
import { type DatabaseInstance, openDatabase } from "./db.js";
import { upsertSymbols } from "./symbols.js";

function seedSymbols(db: DatabaseInstance): void {
  upsertSymbols(db, [
    {
      id: "sym:ts:src/a.ts:Foo",
      name: "Foo",
      kind: "class",
      path: "src/a.ts",
      line: 1,
      language: "typescript",
      fileSha: "sha-a",
    },
    {
      id: "sym:ts:src/b.ts:Bar",
      name: "Bar",
      kind: "class",
      path: "src/b.ts",
      line: 2,
      language: "typescript",
      fileSha: "sha-b",
    },
  ]);
}

describe("claims CRUD", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
    seedSymbols(db);
  });
  afterEach(() => {
    db.close();
  });

  it("insertClaim creates the claim row and all claim_symbols links", () => {
    const claim: NewClaim = {
      source: "ADR-07",
      sourcePath: "docs/adr/ADR-07.md",
      sourceSha: "sha-adr07",
      severity: "hard",
      claim: "must be idempotent",
      rationale: "safe retry",
      excerpt: "All order processing must be safely retryable.",
      symbolIds: ["sym:ts:src/a.ts:Foo", "sym:ts:src/b.ts:Bar"],
    };
    const id = insertClaim(db, claim);
    expect(id).toBeGreaterThan(0);

    const all = listAllClaims(db);
    expect(all).toHaveLength(1);
    const fetched = all[0]!;
    expect(fetched.source).toBe("ADR-07");
    expect(fetched.sourceSha).toBe("sha-adr07");
    expect(fetched.symbolIds.sort()).toEqual([
      "sym:ts:src/a.ts:Foo",
      "sym:ts:src/b.ts:Bar",
    ]);
  });

  it("listClaimsForSymbol returns only claims linked to that symbol", () => {
    insertClaims(db, [
      {
        source: "ADR-01",
        sourcePath: "docs/adr/ADR-01.md",
        sourceSha: "sha1",
        severity: "context",
        claim: "touches Foo",
        symbolIds: ["sym:ts:src/a.ts:Foo"],
      },
      {
        source: "ADR-02",
        sourcePath: "docs/adr/ADR-02.md",
        sourceSha: "sha2",
        severity: "soft",
        claim: "touches Bar only",
        symbolIds: ["sym:ts:src/b.ts:Bar"],
      },
    ]);
    const fooClaims = listClaimsForSymbol(db, "sym:ts:src/a.ts:Foo");
    expect(fooClaims.map((c) => c.source)).toEqual(["ADR-01"]);
  });

  it("deleteClaimsBySourcePath removes claims and their claim_symbols links", () => {
    insertClaims(db, [
      {
        source: "ADR-01",
        sourcePath: "docs/adr/ADR-01.md",
        sourceSha: "s",
        severity: "hard",
        claim: "a",
        symbolIds: ["sym:ts:src/a.ts:Foo"],
      },
      {
        source: "ADR-02",
        sourcePath: "docs/adr/ADR-02.md",
        sourceSha: "s",
        severity: "hard",
        claim: "b",
        symbolIds: ["sym:ts:src/b.ts:Bar"],
      },
    ]);
    const deleted = deleteClaimsBySourcePath(db, "docs/adr/ADR-01.md");
    expect(deleted).toBe(1);
    expect(listAllClaims(db).map((c) => c.source)).toEqual(["ADR-02"]);
    const links = db
      .prepare("SELECT COUNT(*) AS n FROM claim_symbols")
      .get() as { n: number };
    // Only ADR-02's single link remains.
    expect(links.n).toBe(1);
  });

  it("insertClaim's transaction rolls back on failure (foreign key violation)", () => {
    expect(() =>
      insertClaim(db, {
        source: "X",
        sourcePath: "y",
        sourceSha: "z",
        severity: "hard",
        claim: "references a missing symbol",
        symbolIds: ["sym:ts:nonexistent:Sym"],
      }),
    ).toThrow();
    expect(listAllClaims(db)).toHaveLength(0);
  });

  it("source_shas CRUD: set, get, list, upsert", () => {
    setSourceSha(db, "docs/adr/ADR-01.md", "sha1");
    setSourceSha(db, "docs/adr/ADR-07.md", "sha7");
    expect(getSourceSha(db, "docs/adr/ADR-01.md")).toBe("sha1");
    expect(getSourceSha(db, "docs/adr/MISSING.md")).toBeNull();

    setSourceSha(db, "docs/adr/ADR-01.md", "sha1-new");
    expect(getSourceSha(db, "docs/adr/ADR-01.md")).toBe("sha1-new");

    const all = listSourceShas(db);
    expect(all).toEqual({
      "docs/adr/ADR-01.md": "sha1-new",
      "docs/adr/ADR-07.md": "sha7",
    });
  });
});

describe("claims.symbol_candidates (F-7, export-only)", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
    seedSymbols(db);
  });
  afterEach(() => {
    db.close();
  });

  function base(over: Partial<NewClaim> = {}): NewClaim {
    return {
      source: "adr:ADR-01.md",
      sourcePath: "docs/adr/ADR-01.md",
      sourceSha: "s",
      severity: "hard",
      claim: "c",
      symbolIds: ["sym:ts:src/a.ts:Foo"],
      ...over,
    };
  }

  it("stores the raw candidates verbatim, in order, as a JSON array", () => {
    const id = insertClaim(
      db,
      base({ symbolCandidates: ["Zeta", "Foo", "src/a.ts:Foo", "Zeta", ""] }),
    );
    const raw = db
      .prepare("SELECT symbol_candidates FROM claims WHERE id = ?")
      .get(id) as { symbol_candidates: string | null };
    expect(JSON.parse(raw.symbol_candidates!)).toEqual([
      "Zeta",
      "Foo",
      "src/a.ts:Foo",
      "Zeta",
      "",
    ]);
    expect(listClaimSymbolCandidates(db)).toEqual(
      new Map([[id, ["Zeta", "Foo", "src/a.ts:Foo", "Zeta", ""]]]),
    );
  });

  it("stores NULL when candidates are absent or empty; the reader omits them", () => {
    const absent = insertClaim(db, base({ claim: "absent" }));
    const empty = insertClaim(db, base({ claim: "empty", symbolCandidates: [] }));
    const rows = db
      .prepare("SELECT id, symbol_candidates FROM claims ORDER BY id")
      .all() as { id: number; symbol_candidates: string | null }[];
    expect(rows).toEqual([
      { id: absent, symbol_candidates: null },
      { id: empty, symbol_candidates: null },
    ]);
    expect(listClaimSymbolCandidates(db).size).toBe(0);
  });

  it("reader skips a malformed stored value instead of throwing", () => {
    const good = insertClaim(db, base({ claim: "good", symbolCandidates: ["Foo"] }));
    const bad = insertClaim(db, base({ claim: "bad" }));
    const mixed = insertClaim(db, base({ claim: "mixed" }));
    db.prepare("UPDATE claims SET symbol_candidates = ? WHERE id = ?").run(
      "{not json",
      bad,
    );
    db.prepare("UPDATE claims SET symbol_candidates = ? WHERE id = ?").run(
      JSON.stringify(["Bar", 7, null]),
      mixed,
    );
    expect(listClaimSymbolCandidates(db)).toEqual(
      new Map([
        [good, ["Foo"]],
        [mixed, ["Bar"]],
      ]),
    );
  });

  it("never surfaces candidates on Claim (MCP tool output path)", () => {
    insertClaim(db, base({ symbolCandidates: ["Foo", "Ghost"] }));
    const expectedKeys = [
      "claim",
      "excerpt",
      "id",
      "rationale",
      "severity",
      "source",
      "sourcePath",
      "sourceSha",
      "symbolIds",
    ];
    const [fromAll] = listAllClaims(db);
    const [fromSymbol] = listClaimsForSymbol(db, "sym:ts:src/a.ts:Foo");
    for (const claim of [fromAll!, fromSymbol!]) {
      expect(Object.keys(claim).sort()).toEqual(expectedKeys);
      expect(JSON.stringify(claim)).not.toContain("Ghost");
    }
  });

  it("deleteClaimsBySourcePath removes the candidates with the claim", () => {
    insertClaim(db, base({ symbolCandidates: ["Foo"] }));
    deleteClaimsBySourcePath(db, "docs/adr/ADR-01.md");
    expect(listClaimSymbolCandidates(db).size).toBe(0);
  });
});
