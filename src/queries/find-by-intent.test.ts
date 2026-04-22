import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { insertClaim, type NewClaim } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import { upsertSymbols } from "../storage/symbols.js";
import type { Severity, Symbol as AtlasSymbol } from "../types.js";

import {
  buildMatchQuery,
  findByIntent,
  MAX_LIMIT,
  sanitizeQuery,
} from "./find-by-intent.js";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("sanitizeQuery", () => {
  it("preserves letter/digit tokens, drops everything else", () => {
    expect(sanitizeQuery("payment idempotency")).toEqual({
      cleaned: "payment idempotency",
      tokens: ["payment", "idempotency"],
    });
  });

  it("strips punctuation to spaces", () => {
    expect(sanitizeQuery("path/to/file.ts?foo=bar")).toEqual({
      cleaned: "path to file ts foo bar",
      tokens: ["path", "to", "file", "ts", "foo", "bar"],
    });
  });

  it("normalizes repeated whitespace and trims", () => {
    expect(sanitizeQuery("   one   two\t\tthree   ")).toEqual({
      cleaned: "one two three",
      tokens: ["one", "two", "three"],
    });
  });

  it("all-punctuation input → empty tokens", () => {
    expect(sanitizeQuery("!!!???...")).toEqual({ cleaned: "", tokens: [] });
  });

  it("empty string → empty tokens", () => {
    expect(sanitizeQuery("")).toEqual({ cleaned: "", tokens: [] });
  });

  it("unicode letters/digits preserved (non-ASCII safe)", () => {
    // \p{L} covers non-ASCII letters; \p{N} covers digits.
    // café → one token (no separator); hello世界 → one token.
    expect(sanitizeQuery("café")).toEqual({
      cleaned: "café",
      tokens: ["café"],
    });
    expect(sanitizeQuery("hello 世界")).toEqual({
      cleaned: "hello 世界",
      tokens: ["hello", "世界"],
    });
  });
});

describe("buildMatchQuery", () => {
  it("single token → phrase form only", () => {
    expect(buildMatchQuery(["idempotency"])).toBe('"idempotency"');
  });

  it("multiple tokens → phrase OR each token", () => {
    expect(buildMatchQuery(["payment", "idempotency"])).toBe(
      '"payment idempotency" OR payment OR idempotency',
    );
  });

  it("empty token list → null (signals no-query)", () => {
    expect(buildMatchQuery([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration against a real in-memory DB
// ---------------------------------------------------------------------------

interface SeedClaim {
  source: string;
  severity: Severity;
  claim: string;
  rationale?: string;
  excerpt?: string;
  symbolId: string;
}

function seedSymbol(
  db: DatabaseInstance,
  id: string,
  name: string,
  path: string,
): AtlasSymbol {
  const sym: AtlasSymbol = {
    id,
    name,
    kind: "class",
    path,
    line: 1,
    language: "typescript",
    fileSha: "sha-" + id,
    signature: `class ${name}`,
  };
  upsertSymbols(db, [sym]);
  return sym;
}

function seedClaim(db: DatabaseInstance, seed: SeedClaim): void {
  const nc: NewClaim = {
    source: seed.source,
    sourcePath: `docs/adr/${seed.source}.md`,
    sourceSha: "sha-" + seed.source,
    severity: seed.severity,
    claim: seed.claim,
    ...(seed.rationale !== undefined ? { rationale: seed.rationale } : {}),
    ...(seed.excerpt !== undefined ? { excerpt: seed.excerpt } : {}),
    symbolIds: [seed.symbolId],
  };
  insertClaim(db, nc);
}

describe("findByIntent — end-to-end against FTS5", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => db.close());

  it("returns empty for a query that sanitizes to nothing", () => {
    seedSymbol(db, "sym:ts:x.ts:Foo", "Foo", "x.ts");
    seedClaim(db, {
      source: "ADR-01",
      severity: "hard",
      claim: "must be idempotent",
      symbolId: "sym:ts:x.ts:Foo",
    });
    expect(findByIntent(db, { query: "!!!", limit: 5 })).toEqual([]);
  });

  it("returns empty when no claim matches any token", () => {
    seedSymbol(db, "sym:ts:x.ts:Foo", "Foo", "x.ts");
    seedClaim(db, {
      source: "ADR-01",
      severity: "hard",
      claim: "must be idempotent",
      symbolId: "sym:ts:x.ts:Foo",
    });
    expect(
      findByIntent(db, { query: "completely unrelated query", limit: 5 }),
    ).toEqual([]);
  });

  it("exact phrase ranks above scattered-token matches", () => {
    seedSymbol(db, "sym:ts:a.ts:Alpha", "Alpha", "a.ts");
    seedSymbol(db, "sym:ts:b.ts:Beta", "Beta", "b.ts");
    seedClaim(db, {
      source: "ADR-01",
      severity: "hard",
      claim: "must handle payment idempotency correctly",
      symbolId: "sym:ts:a.ts:Alpha",
    });
    seedClaim(db, {
      // Both tokens present but not adjacent; the phrase query won't
      // hit this, only the OR terms will.
      source: "ADR-02",
      severity: "hard",
      claim: "payment flow has stages; idempotency of writes matters",
      symbolId: "sym:ts:b.ts:Beta",
    });
    const matches = findByIntent(db, {
      query: "payment idempotency",
      limit: 5,
    });
    expect(matches).toHaveLength(2);
    expect(matches[0]?.name).toBe("Alpha");
    expect(matches[1]?.name).toBe("Beta");
  });

  it("surfaces the top-scoring claim on symbols linked via multiple claims", () => {
    seedSymbol(db, "sym:ts:x.ts:OrderProcessor", "OrderProcessor", "x.ts");
    // Two claims on the same symbol; the phrase match should win.
    seedClaim(db, {
      source: "ADR-03",
      severity: "soft",
      claim: "stubs exist for orders sometimes",
      symbolId: "sym:ts:x.ts:OrderProcessor",
    });
    seedClaim(db, {
      source: "ADR-01",
      severity: "hard",
      claim: "payment idempotency is required",
      symbolId: "sym:ts:x.ts:OrderProcessor",
    });
    const matches = findByIntent(db, {
      query: "payment idempotency",
      limit: 5,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.matchedIntent.source).toBe("ADR-01");
    expect(matches[0]?.matchedIntent.severity).toBe("hard");
  });

  it("ties break by severity (hard > soft > context) then source alphabetical", () => {
    seedSymbol(db, "sym:ts:a.ts:A", "A", "a.ts");
    seedSymbol(db, "sym:ts:b.ts:B", "B", "b.ts");
    seedSymbol(db, "sym:ts:c.ts:C", "C", "c.ts");
    // Three claims with identical text → identical BM25 score. The
    // tiebreaker stack decides the order.
    seedClaim(db, {
      source: "ADR-02",
      severity: "soft",
      claim: "retries everywhere",
      symbolId: "sym:ts:a.ts:A",
    });
    seedClaim(db, {
      source: "ADR-99",
      severity: "hard",
      claim: "retries everywhere",
      symbolId: "sym:ts:b.ts:B",
    });
    seedClaim(db, {
      source: "ADR-05",
      severity: "hard",
      claim: "retries everywhere",
      symbolId: "sym:ts:c.ts:C",
    });
    const matches = findByIntent(db, { query: "retries everywhere", limit: 5 });
    // Severity hard wins over soft → B and C come before A.
    // Among the two hards, source ADR-05 comes before ADR-99.
    expect(matches.map((m) => m.name)).toEqual(["C", "B", "A"]);
  });

  it("respects the caller's limit", () => {
    for (let i = 0; i < 7; i++) {
      seedSymbol(db, `sym:ts:x${i}.ts:S${i}`, `S${i}`, `x${i}.ts`);
      seedClaim(db, {
        source: `ADR-${i}`,
        severity: "hard",
        claim: "idempotency required",
        symbolId: `sym:ts:x${i}.ts:S${i}`,
      });
    }
    const matches = findByIntent(db, { query: "idempotency", limit: 3 });
    expect(matches).toHaveLength(3);
  });

  it("clamps excessive limit to MAX_LIMIT", () => {
    for (let i = 0; i < MAX_LIMIT + 5; i++) {
      seedSymbol(db, `sym:ts:x${i}.ts:S${i}`, `S${i}`, `x${i}.ts`);
      seedClaim(db, {
        source: `ADR-${i}`,
        severity: "hard",
        claim: "idempotency required",
        symbolId: `sym:ts:x${i}.ts:S${i}`,
      });
    }
    const matches = findByIntent(db, { query: "idempotency", limit: 9999 });
    expect(matches).toHaveLength(MAX_LIMIT);
  });

  it("clamps non-positive limit to at least 1", () => {
    seedSymbol(db, "sym:ts:x.ts:Foo", "Foo", "x.ts");
    seedClaim(db, {
      source: "ADR-01",
      severity: "hard",
      claim: "must handle idempotency",
      symbolId: "sym:ts:x.ts:Foo",
    });
    const matches = findByIntent(db, { query: "idempotency", limit: 0 });
    expect(matches).toHaveLength(1);
  });

  it("name-overlap tiebreaker: when claims fan out to multiple symbols, the symbol whose name contains the query wins", () => {
    // Simulates ADR-08's frontmatter-hint fan-out: one claim linked
    // to several symbols. Only `normalizePath` shares a token with
    // the query. Without the name-overlap tiebreaker, the four
    // symbols would tie on BM25/severity/source/claim_id and fall
    // into arbitrary order.
    upsertSymbols(db, [
      {
        id: "sym:ts:src/utils/paths.ts:normalizePath",
        name: "normalizePath",
        kind: "function",
        path: "src/utils/paths.ts",
        line: 1,
        language: "typescript",
        fileSha: "s1",
      },
      {
        id: "sym:ts:src/types.ts:SymbolId",
        name: "SymbolId",
        kind: "type",
        path: "src/types.ts",
        line: 1,
        language: "typescript",
        fileSha: "s2",
      },
      {
        id: "sym:ts:src/types.ts:Symbol",
        name: "Symbol",
        kind: "interface",
        path: "src/types.ts",
        line: 1,
        language: "typescript",
        fileSha: "s3",
      },
      {
        id: "sym:ts:src/types.ts:LANG_CODES",
        name: "LANG_CODES",
        kind: "variable",
        path: "src/types.ts",
        line: 1,
        language: "typescript",
        fileSha: "s4",
      },
    ]);
    insertClaim(db, {
      source: "ADR-01",
      sourcePath: "docs/adr/ADR-01.md",
      sourceSha: "s",
      severity: "hard",
      claim: "normalizePath must be called at every ingest boundary",
      symbolIds: [
        "sym:ts:src/types.ts:SymbolId",
        "sym:ts:src/types.ts:Symbol",
        "sym:ts:src/types.ts:LANG_CODES",
        "sym:ts:src/utils/paths.ts:normalizePath",
      ],
    });
    const matches = findByIntent(db, { query: "normalizePath", limit: 10 });
    expect(matches[0]?.name).toBe("normalizePath");
  });

  it("matches across the rationale and excerpt columns, not just claim", () => {
    seedSymbol(db, "sym:ts:x.ts:Foo", "Foo", "x.ts");
    seedClaim(db, {
      source: "ADR-01",
      severity: "hard",
      claim: "handles recovery correctly",
      rationale: "because idempotency is required on retry",
      excerpt: "the system must be idempotent",
      symbolId: "sym:ts:x.ts:Foo",
    });
    const matches = findByIntent(db, { query: "idempotency", limit: 5 });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe("Foo");
  });
});
