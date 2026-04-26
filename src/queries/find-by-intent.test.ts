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

// ---------------------------------------------------------------------------
// ADR-17 — identifier-aware tokenizer
//
// The default unicode61 tokenizer split `_` and `-` as separators, which
// shredded identifier-shaped names into common-word fragments. A query
// for `narrow_attribution` ranked behind any claim that happened to
// mention "narrow" and "attribution" elsewhere because the OR-fallback
// in buildMatchQuery dominated the phrase boost. ADR-17 reconfigures
// the tokenizer with `tokenchars '_-'` and indexes a split-form copy
// of the text alongside the original so natural-language queries still
// reach identifier-bearing content.
// ---------------------------------------------------------------------------

describe("sanitizeQuery — ADR-17 identifier-shaped tokens", () => {
  it("preserves snake_case as a single token", () => {
    expect(sanitizeQuery("narrow_attribution")).toEqual({
      cleaned: "narrow_attribution",
      tokens: ["narrow_attribution"],
    });
  });

  it("preserves kebab-case as a single token", () => {
    expect(sanitizeQuery("find-by-intent")).toEqual({
      cleaned: "find-by-intent",
      tokens: ["find-by-intent"],
    });
  });

  it("preserves dotted-then-underscored mixes as expected (dot still strips)", () => {
    // Dots remain separators — "a.b_c" yields ["a", "b_c"]. This is the
    // pre-existing behavior; only `_` and `-` were added to the keep-set.
    expect(sanitizeQuery("extraction.narrow_attribution")).toEqual({
      cleaned: "extraction narrow_attribution",
      tokens: ["extraction", "narrow_attribution"],
    });
  });

  it("camelCase still survives as one token (letters aren't separators)", () => {
    expect(sanitizeQuery("LspClient")).toEqual({
      cleaned: "LspClient",
      tokens: ["LspClient"],
    });
  });
});

describe("buildMatchQuery — ADR-17 hyphen escaping", () => {
  it("quotes a single kebab-case token to escape FTS5's NOT operator", () => {
    // FTS5's MATCH grammar treats `-` between barewords as AND-NOT;
    // unquoted `find-by-intent` would parse as `find NOT by NOT intent`
    // and error on column resolution. Quoting forces phrase semantics.
    expect(buildMatchQuery(["find-by-intent"])).toBe('"find-by-intent"');
  });

  it("quotes hyphenated tokens inside the OR-fallback list", () => {
    expect(buildMatchQuery(["per-symbol", "claims"])).toBe(
      '"per-symbol claims" OR "per-symbol" OR claims',
    );
  });

  it("leaves snake_case tokens unquoted (no FTS5 grammar conflict)", () => {
    expect(buildMatchQuery(["narrow_attribution"])).toBe(
      '"narrow_attribution"',
    );
  });
});

describe("findByIntent — ADR-17 regression: identifier-shaped queries", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => db.close());

  it("snake_case query hits the canonical claim and outranks unrelated word-overlap noise", () => {
    // The bug: a query for `narrow_attribution` (sanitized to two
    // tokens, MATCH'd as `"narrow attribution" OR narrow OR
    // attribution`) silently lost the canonical claim under any other
    // claim that happened to mention `narrow` and `attribution`
    // elsewhere. Post-fix: the identifier survives sanitization as a
    // single token and the index holds it as a single token, so the
    // canonical claim is the strongest hit.
    seedSymbol(db, "sym:ts:a.ts:NarrowFlag", "NarrowFlag", "a.ts");
    seedSymbol(db, "sym:ts:b.ts:Noise", "Noise", "b.ts");
    seedClaim(db, {
      source: "ADR-X",
      severity: "hard",
      claim:
        "v0.3 ships extraction.narrow_attribution as drop-with-fallback default-on; opt-out is explicit narrow_attribution: off.",
      symbolId: "sym:ts:a.ts:NarrowFlag",
    });
    seedClaim(db, {
      source: "ADR-Y",
      severity: "hard",
      claim:
        "Symbol attribution must narrow to direct call sites, not transitive references.",
      symbolId: "sym:ts:b.ts:Noise",
    });
    seedClaim(db, {
      source: "ADR-Z",
      severity: "soft",
      claim:
        "Attribution cardinality should narrow under high-fanout symbols.",
      symbolId: "sym:ts:b.ts:Noise",
    });

    const matches = findByIntent(db, {
      query: "narrow_attribution",
      limit: 5,
    });
    expect(matches.length).toBeGreaterThan(0);
    // The canonical claim ranks first; unrelated word-overlap noise
    // does not bury it.
    expect(matches[0]?.name).toBe("NarrowFlag");
    expect(matches[0]?.matchedIntent.source).toBe("ADR-X");
  });

  it("kebab-case query hits the canonical claim", () => {
    seedSymbol(db, "sym:ts:a.ts:KebabFeature", "KebabFeature", "a.ts");
    seedSymbol(db, "sym:ts:b.ts:Other", "Other", "b.ts");
    seedClaim(db, {
      source: "ADR-X",
      severity: "hard",
      claim:
        "The find-by-intent tool is a thin composite over the claims table.",
      symbolId: "sym:ts:a.ts:KebabFeature",
    });
    seedClaim(db, {
      source: "ADR-Y",
      severity: "context",
      claim:
        "Find the right symbol by intent rather than name when exploring.",
      symbolId: "sym:ts:b.ts:Other",
    });

    const matches = findByIntent(db, { query: "find-by-intent", limit: 5 });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.name).toBe("KebabFeature");
  });

  it("snake_case query matches identifier-bearing content as a single index token (raw FTS5 contract)", () => {
    // Lower-level invariant: the FTS5 index actually stores the
    // identifier as a token. If the tokenizer were ever reverted to
    // unicode61 default, the token wouldn't exist and this would fail.
    seedSymbol(db, "sym:ts:a.ts:Flag", "Flag", "a.ts");
    seedClaim(db, {
      source: "ADR-X",
      severity: "hard",
      claim: "narrow_attribution flag controls extraction grouping",
      symbolId: "sym:ts:a.ts:Flag",
    });

    // fts5vocab exposes the actual token list. Confirm the intact
    // token is present (proves tokenizer config) AND the split tokens
    // are present (proves dual-form indexing).
    db.exec("CREATE VIRTUAL TABLE cv USING fts5vocab(claims_fts, row);");
    const terms = db
      .prepare(
        "SELECT term FROM cv WHERE term IN ('narrow_attribution', 'narrow', 'attribution')",
      )
      .all() as { term: string }[];
    const termSet = new Set(terms.map((t) => t.term));
    expect(termSet.has("narrow_attribution")).toBe(true);
    expect(termSet.has("narrow")).toBe(true);
    expect(termSet.has("attribution")).toBe(true);
  });
});

describe("findByIntent — ADR-17 canary: natural-language queries do not regress", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => db.close());

  it("natural-language phrase query still matches identifier-bearing content", () => {
    // Dual-form indexing's purpose: a user typing "narrow attribution"
    // (no underscore) should still find a claim that uses the
    // identifier form `narrow_attribution`. Without the split-form
    // half of the indexed text, the intact-token-only index would
    // miss this.
    seedSymbol(db, "sym:ts:a.ts:Flag", "Flag", "a.ts");
    seedClaim(db, {
      source: "ADR-X",
      severity: "hard",
      claim:
        "narrow_attribution flag controls extraction grouping for ADR-09",
      symbolId: "sym:ts:a.ts:Flag",
    });

    const matches = findByIntent(db, {
      query: "narrow attribution",
      limit: 5,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe("Flag");
  });

  it("phrase ranks above scattered-token matches (BM25 invariant preserved)", () => {
    // Re-asserts the ADR-09 contract under the new tokenizer: an
    // adjacent phrase outranks documents where the same words appear
    // scattered.
    seedSymbol(db, "sym:ts:a.ts:Alpha", "Alpha", "a.ts");
    seedSymbol(db, "sym:ts:b.ts:Beta", "Beta", "b.ts");
    seedClaim(db, {
      source: "ADR-1",
      severity: "hard",
      claim: "must handle payment idempotency correctly",
      symbolId: "sym:ts:a.ts:Alpha",
    });
    seedClaim(db, {
      source: "ADR-2",
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

  it("multi-word natural-language query matches partial overlap claims", () => {
    seedSymbol(db, "sym:ts:a.ts:NormPath", "NormPath", "a.ts");
    seedSymbol(db, "sym:ts:b.ts:OtherSym", "OtherSym", "b.ts");
    seedClaim(db, {
      source: "ADR-1",
      severity: "hard",
      claim: "Path normalization is required at every ingest boundary",
      symbolId: "sym:ts:a.ts:NormPath",
    });
    seedClaim(db, {
      source: "ADR-2",
      severity: "soft",
      claim: "Boundaries between layers must be enforced.",
      symbolId: "sym:ts:b.ts:OtherSym",
    });
    const matches = findByIntent(db, {
      query: "path normalization",
      limit: 5,
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.name).toBe("NormPath");
  });
});
