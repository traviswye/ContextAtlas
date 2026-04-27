/**
 * v0.3 Step 10 Commit 2 — docstring extraction behavioral tests.
 *
 * Replaces Commit 1's skeleton with full behavioral coverage per Step
 * 10 ship criterion 5 (a/b/c) + Travis's 7-test scope lock + Refinement
 * 1 (parser malformation expansion) + Refinement 2 (explicit Channel
 * A/B assertions).
 *
 * Test substrate: hybrid per Step 10 scoping question (d). Mock
 * adapter for behavioral coverage (fast, deterministic; bypasses gopls
 * subprocess); parser tests exercise parseDocstringFromGoplsHover
 * directly. Real-GoAdapter integration validated by Substep 10.5 live
 * cobra calibration (Commit 3).
 *
 * Two-channel attribution per Step 10 architecture:
 *   - Channel A (provenance): documented SymbolId always attached
 *   - Channel B (cross-references): symbol_candidates resolved via
 *     existing resolveCandidates path
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseDocstringFromGoplsHover } from "../adapters/go.js";
import { listAllClaims } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import { upsertSymbols } from "../storage/symbols.js";
import type {
  Diagnostic,
  LanguageAdapter,
  LanguageCode,
  Reference,
  Symbol as AtlasSymbol,
  SymbolId,
  TypeInfo,
} from "../types.js";

import type { ExtractionClient } from "./anthropic-client.js";
import { extractDocstringsForFile } from "./pipeline.js";
import type { ExtractionResult } from "./prompt.js";
import type { SymbolInventory } from "./resolver.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface StubAdapterConfig {
  language: LanguageCode;
  extensions: readonly string[];
  symbolsByPath: Map<string, AtlasSymbol[]>;
  docstringsBySymbolId: Map<SymbolId, string | null>;
}

function makeStubAdapter(config: StubAdapterConfig): LanguageAdapter {
  return {
    language: config.language,
    extensions: config.extensions,
    async initialize() {},
    async shutdown() {},
    async listSymbols(filePath: string) {
      return config.symbolsByPath.get(filePath) ?? [];
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
    async getTypeInfo(_id: SymbolId): Promise<TypeInfo> {
      return { extends: [], implements: [], usedByTypes: [] };
    },
    async getDocstring(id: SymbolId): Promise<string | null> {
      return config.docstringsBySymbolId.get(id) ?? null;
    },
  };
}

interface StubClientConfig {
  responsesByDocstring: Map<string, ExtractionResult | null>;
}

function makeStubClient(config: StubClientConfig): ExtractionClient {
  return {
    async extract(body: string) {
      const result = config.responsesByDocstring.get(body) ?? null;
      // Stub usage stamp matches pipeline.test.ts pattern.
      return { result, usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
}

function makeSymbol(
  name: string,
  path: string,
  fileSha: string,
  language: LanguageCode = "go",
): AtlasSymbol {
  const langCode =
    language === "go" ? "go" : language === "typescript" ? "ts" : "py";
  return {
    id: `sym:${langCode}:${path}:${name}`,
    name,
    kind: "function",
    path,
    line: 1,
    language,
    fileSha,
  };
}

function makeInventory(symbols: readonly AtlasSymbol[]): SymbolInventory {
  const byName = new Map<string, AtlasSymbol[]>();
  for (const sym of symbols) {
    const existing = byName.get(sym.name) ?? [];
    existing.push(sym);
    byName.set(sym.name, existing);
  }
  return { byName, allSymbols: [...symbols] };
}

// ---------------------------------------------------------------------------
// Section 1: parseDocstringFromGoplsHover (parser unit tests)
// ---------------------------------------------------------------------------
//
// Covers Travis's Refinement 1 malformation cases (3a-3d) at the
// parser level. Sample 3a (null/undefined hover response) is handled
// in GoAdapter.getDocstring before the parser is invoked; absorbed by
// behavioral test "no docstring" below since mock adapter returns
// null in that case.

describe("parseDocstringFromGoplsHover (parser unit tests)", () => {
  it("happy path — extracts trimmed section 2 from valid 3-section hover", () => {
    const hoverValue = [
      "```go",
      "func NoArgs(cmd *Command, args []string) error",
      "```",
      "",
      "---",
      "",
      "NoArgs returns an error if any args are included.",
      "",
      "",
      "---",
      "",
      "[`cobra.NoArgs` on pkg.go.dev](https://pkg.go.dev/...)",
    ].join("\n");
    expect(parseDocstringFromGoplsHover(hoverValue)).toBe(
      "NoArgs returns an error if any args are included.",
    );
  });

  it("preserves multi-paragraph structure (Sample #5 ExactValidArgs case)", () => {
    const hoverValue = [
      "```go",
      "func ExactValidArgs(n int) PositionalArgs",
      "```",
      "",
      "---",
      "",
      "ExactValidArgs returns an error if there are not exactly N positional args OR there are any positional args that are not in the `ValidArgs` field of `Command`",
      "",
      "Deprecated: use MatchAll(ExactArgs(n), OnlyValidArgs) instead",
      "",
      "",
      "---",
    ].join("\n");
    const result = parseDocstringFromGoplsHover(hoverValue);
    expect(result).toContain("ExactValidArgs returns an error");
    expect(result).toContain("Deprecated: use MatchAll");
    // Paragraph break preserved between behavioral spec and Deprecated marker.
    expect(result).toMatch(/Command`\n\nDeprecated:/);
  });

  it("3b/3c — returns null when fewer than 2 sections (signature only, no separator)", () => {
    const hoverValue = "```go\nfunc Foo()\n```";
    expect(parseDocstringFromGoplsHover(hoverValue)).toBeNull();
  });

  it("returns section 2 when exactly 2 sections present (no metadata trailing)", () => {
    // Some symbols may have signature + doc but no pkg.go.dev metadata
    // section. Parser should still extract the doc.
    const hoverValue = [
      "```go",
      "var MyVar int",
      "```",
      "",
      "---",
      "",
      "MyVar is a documented variable.",
    ].join("\n");
    expect(parseDocstringFromGoplsHover(hoverValue)).toBe(
      "MyVar is a documented variable.",
    );
  });

  it("3d — returns null when section 2 is whitespace-only", () => {
    const hoverValue = [
      "```go",
      "func Foo()",
      "```",
      "",
      "---",
      "",
      "   ",
      "",
      "---",
      "",
      "trailing metadata",
    ].join("\n");
    expect(parseDocstringFromGoplsHover(hoverValue)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Section 2: extractDocstringsForFile (behavioral integration tests)
// ---------------------------------------------------------------------------

describe("extractDocstringsForFile (behavioral)", () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  // Test #1 — Happy path with cross-references; Channel A + B both present.
  it("happy path: extracted claim attaches both documented symbol (Channel A) and cross-reference (Channel B)", async () => {
    const documented = makeSymbol("MyFunc", "src/lib.go", "sha-lib");
    const crossRef = makeSymbol("Logger", "src/log.go", "sha-log");
    upsertSymbols(db, [documented, crossRef]);
    const inventory = makeInventory([documented, crossRef]);

    const docstringText = "MyFunc uses Logger to record events.";
    const adapter = makeStubAdapter({
      language: "go",
      extensions: [".go"],
      symbolsByPath: new Map([["src/lib.go", [documented]]]),
      docstringsBySymbolId: new Map([[documented.id, docstringText]]),
    });
    const client = makeStubClient({
      responsesByDocstring: new Map([
        [
          docstringText,
          {
            claims: [
              {
                symbol_candidates: ["Logger"],
                claim: "MyFunc records events via Logger",
                severity: "context",
                rationale: "behavioral relationship",
                excerpt: "uses Logger to record events",
              },
            ],
          },
        ],
      ]),
    });

    const result = await extractDocstringsForFile(
      db,
      adapter,
      "src/lib.go",
      "sha-lib",
      inventory,
      client,
    );

    expect(result.claimsWritten).toBe(1);
    expect(result.symbolsExported).toBe(1);
    expect(result.symbolsWithDocstring).toBe(1);
    expect(result.apiCalls).toBe(1);

    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    const claim = claims[0]!;
    // Refinement 2 — explicit Channel A + B assertions
    expect(claim.symbolIds).toContain(documented.id); // Channel A (provenance)
    expect(claim.symbolIds).toContain(crossRef.id); // Channel B (cross-ref)
    expect(claim.symbolIds).toHaveLength(2);
    expect(claim.source).toBe("docstring:src/lib.go");
    expect(claim.severity).toBe("context");
  });

  // Test #2 — No docstring → 0 claims (graceful).
  // Absorbs malformation case 3a (null hover) at the integration boundary
  // since mock adapter returns null when getDocstring would have been null.
  it("no docstring: exported symbol with no doc comment produces zero claims", async () => {
    const sym = makeSymbol("MyFunc", "src/lib.go", "sha-lib");
    upsertSymbols(db, [sym]);
    const inventory = makeInventory([sym]);

    const adapter = makeStubAdapter({
      language: "go",
      extensions: [".go"],
      symbolsByPath: new Map([["src/lib.go", [sym]]]),
      docstringsBySymbolId: new Map([[sym.id, null]]),
    });
    const client = makeStubClient({ responsesByDocstring: new Map() });

    const result = await extractDocstringsForFile(
      db,
      adapter,
      "src/lib.go",
      "sha-lib",
      inventory,
      client,
    );

    expect(result.claimsWritten).toBe(0);
    expect(result.symbolsExported).toBe(1);
    expect(result.symbolsWithDocstring).toBe(0);
    expect(result.apiCalls).toBe(0);
    expect(listAllClaims(db)).toHaveLength(0);
  });

  // Test #3 — Empty/whitespace docstring → 0 claims (graceful).
  it("empty docstring: whitespace-only docstring text produces zero claims", async () => {
    const sym = makeSymbol("MyFunc", "src/lib.go", "sha-lib");
    upsertSymbols(db, [sym]);
    const inventory = makeInventory([sym]);

    const adapter = makeStubAdapter({
      language: "go",
      extensions: [".go"],
      symbolsByPath: new Map([["src/lib.go", [sym]]]),
      docstringsBySymbolId: new Map([[sym.id, "   \n  "]]),
    });
    const client = makeStubClient({ responsesByDocstring: new Map() });

    const result = await extractDocstringsForFile(
      db,
      adapter,
      "src/lib.go",
      "sha-lib",
      inventory,
      client,
    );

    expect(result.claimsWritten).toBe(0);
    expect(result.symbolsWithDocstring).toBe(0);
    expect(result.apiCalls).toBe(0);
    expect(listAllClaims(db)).toHaveLength(0);
  });

  // Test #4 — Unexported filter (cost protection + scope discipline).
  it("unexported filter: lowercase symbol skipped before extraction call", async () => {
    const exported = makeSymbol("Public", "src/lib.go", "sha-lib");
    const unexported = makeSymbol("private", "src/lib.go", "sha-lib");
    upsertSymbols(db, [exported, unexported]);
    const inventory = makeInventory([exported, unexported]);

    const adapter = makeStubAdapter({
      language: "go",
      extensions: [".go"],
      symbolsByPath: new Map([["src/lib.go", [exported, unexported]]]),
      // Both have docstrings, but unexported should never be queried.
      docstringsBySymbolId: new Map([
        [exported.id, "Public function description."],
        [unexported.id, "should never reach extraction"],
      ]),
    });
    const client = makeStubClient({
      responsesByDocstring: new Map([
        [
          "Public function description.",
          {
            claims: [
              {
                symbol_candidates: [],
                claim: "Public is a documented function",
                severity: "context",
                rationale: "documentation",
                excerpt: "Public function description",
              },
            ],
          },
        ],
      ]),
    });

    const result = await extractDocstringsForFile(
      db,
      adapter,
      "src/lib.go",
      "sha-lib",
      inventory,
      client,
    );

    expect(result.symbolsProcessed).toBe(2);
    expect(result.symbolsExported).toBe(1); // Only Public counted as exported
    expect(result.apiCalls).toBe(1); // Only Public's docstring sent
    expect(listAllClaims(db)).toHaveLength(1);
  });

  // Test #5 — Multi-symbol file: claims aggregated correctly.
  it("multi-symbol: file with mix of doc/no-doc symbols aggregates results correctly", async () => {
    const symA = makeSymbol("FuncA", "src/lib.go", "sha-lib");
    const symB = makeSymbol("FuncB", "src/lib.go", "sha-lib");
    const symC = makeSymbol("FuncC", "src/lib.go", "sha-lib");
    upsertSymbols(db, [symA, symB, symC]);
    const inventory = makeInventory([symA, symB, symC]);

    const adapter = makeStubAdapter({
      language: "go",
      extensions: [".go"],
      symbolsByPath: new Map([["src/lib.go", [symA, symB, symC]]]),
      docstringsBySymbolId: new Map([
        [symA.id, "FuncA does X."],
        [symB.id, null], // No docstring
        [symC.id, "FuncC does Z."],
      ]),
    });
    const client = makeStubClient({
      responsesByDocstring: new Map([
        [
          "FuncA does X.",
          {
            claims: [
              {
                symbol_candidates: [],
                claim: "FuncA does X",
                severity: "context",
                rationale: "doc",
                excerpt: "does X",
              },
            ],
          },
        ],
        [
          "FuncC does Z.",
          {
            claims: [
              {
                symbol_candidates: [],
                claim: "FuncC does Z",
                severity: "context",
                rationale: "doc",
                excerpt: "does Z",
              },
            ],
          },
        ],
      ]),
    });

    const result = await extractDocstringsForFile(
      db,
      adapter,
      "src/lib.go",
      "sha-lib",
      inventory,
      client,
    );

    expect(result.symbolsProcessed).toBe(3);
    expect(result.symbolsExported).toBe(3);
    expect(result.symbolsWithDocstring).toBe(2); // A + C
    expect(result.apiCalls).toBe(2);
    expect(result.claimsWritten).toBe(2);

    const claims = listAllClaims(db);
    expect(claims).toHaveLength(2);
    const claimsByText = new Map(claims.map((c) => [c.claim, c]));
    expect(claimsByText.get("FuncA does X")?.symbolIds).toContain(symA.id);
    expect(claimsByText.get("FuncC does Z")?.symbolIds).toContain(symC.id);
  });

  // Test #6 — Cross-reference resolution (Channel B explicit verification).
  it("cross-reference resolution: docstring referencing other symbol resolves via Channel B", async () => {
    const documented = makeSymbol("Storage", "src/storage.go", "sha-storage");
    const crossRefA = makeSymbol("Database", "src/db.go", "sha-db");
    const crossRefB = makeSymbol("Mutex", "src/sync.go", "sha-sync");
    const unrelated = makeSymbol("Helper", "src/util.go", "sha-util");
    upsertSymbols(db, [documented, crossRefA, crossRefB, unrelated]);
    const inventory = makeInventory([documented, crossRefA, crossRefB, unrelated]);

    const docstringText =
      "Storage backs persistence; uses Database with Mutex protection.";
    const adapter = makeStubAdapter({
      language: "go",
      extensions: [".go"],
      symbolsByPath: new Map([["src/storage.go", [documented]]]),
      docstringsBySymbolId: new Map([[documented.id, docstringText]]),
    });
    const client = makeStubClient({
      responsesByDocstring: new Map([
        [
          docstringText,
          {
            claims: [
              {
                symbol_candidates: ["Database", "Mutex"], // Both resolvable in inventory
                claim: "Storage backs persistence using Database + Mutex",
                severity: "context",
                rationale: "architectural composition",
                excerpt: "uses Database with Mutex protection",
              },
            ],
          },
        ],
      ]),
    });

    const result = await extractDocstringsForFile(
      db,
      adapter,
      "src/storage.go",
      "sha-storage",
      inventory,
      client,
    );

    expect(result.claimsWritten).toBe(1);
    expect(result.unresolvedCandidates).toBe(0);

    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    const claim = claims[0]!;
    // Channel B explicit assertion: cross-references resolved via inventory
    expect(claim.symbolIds).toContain(crossRefA.id);
    expect(claim.symbolIds).toContain(crossRefB.id);
    // Channel A also present
    expect(claim.symbolIds).toContain(documented.id);
    // Unrelated symbol NOT pulled in
    expect(claim.symbolIds).not.toContain(unrelated.id);
    expect(claim.symbolIds).toHaveLength(3);
  });

  // Test #7 — Provenance only (Channel A explicit; Channel B empty).
  it("provenance only: empty symbol_candidates yields claim with documented symbol alone (Channel A)", async () => {
    const documented = makeSymbol("Solo", "src/solo.go", "sha-solo");
    const otherInInventory = makeSymbol("Other", "src/other.go", "sha-other");
    upsertSymbols(db, [documented, otherInInventory]);
    const inventory = makeInventory([documented, otherInInventory]);

    const docstringText = "Solo describes itself with no external references.";
    const adapter = makeStubAdapter({
      language: "go",
      extensions: [".go"],
      symbolsByPath: new Map([["src/solo.go", [documented]]]),
      docstringsBySymbolId: new Map([[documented.id, docstringText]]),
    });
    const client = makeStubClient({
      responsesByDocstring: new Map([
        [
          docstringText,
          {
            claims: [
              {
                symbol_candidates: [], // Channel B empty
                claim: "Solo is self-describing",
                severity: "context",
                rationale: "documentation",
                excerpt: "describes itself",
              },
            ],
          },
        ],
      ]),
    });

    const result = await extractDocstringsForFile(
      db,
      adapter,
      "src/solo.go",
      "sha-solo",
      inventory,
      client,
    );

    expect(result.claimsWritten).toBe(1);

    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    const claim = claims[0]!;
    // Refinement 2 — explicit Channel A alone assertion
    expect(claim.symbolIds).toContain(documented.id); // Channel A present
    expect(claim.symbolIds).toHaveLength(1); // Channel B empty; total = 1
    // Verify other inventory symbol NOT spuriously included
    expect(claim.symbolIds).not.toContain(otherInInventory.id);
  });
});
