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
import {
  parsePythonModuleDocstring,
  parsePythonBodyDocstring,
} from "../adapters/pyright.js";
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
// Section 1b: Python parser unit tests (Step 11 Commit 1 skeleton)
// ---------------------------------------------------------------------------
//
// Skeleton tests for v0.3 Stream B Step 11 Commit 1: covers happy
// paths for module-level + body-level docstring parsing per PEP 257
// subset. Full behavioral coverage (parser edge cases + extractor
// integration with PyrightAdapter mock) lands in Commit 2 (Substep 11.2).

describe("parsePythonModuleDocstring (parser unit tests)", () => {
  it("happy path — extracts module docstring after shebang + encoding + imports", () => {
    const source = [
      "#!/usr/bin/env python",
      "# -*- coding: utf-8 -*-",
      "",
      "from __future__ import annotations",
      "",
      '"""Module purpose: defines the public interface for the foo subsystem."""',
      "",
      "import os",
    ].join("\n");
    expect(parsePythonModuleDocstring(source)).toBe(
      "Module purpose: defines the public interface for the foo subsystem.",
    );
  });

  it("returns null when first statement is not a docstring", () => {
    const source = [
      "from __future__ import annotations",
      "",
      "import os",
      "",
      "MAX_SIZE = 100  # not a docstring",
    ].join("\n");
    expect(parsePythonModuleDocstring(source)).toBeNull();
  });

  it("preserves multi-paragraph structure with PEP 257 dedent", () => {
    const source = [
      '"""',
      "First paragraph describing the module.",
      "",
      "Second paragraph with more detail.",
      '"""',
      "",
      "import os",
    ].join("\n");
    const result = parsePythonModuleDocstring(source);
    expect(result).toContain("First paragraph");
    expect(result).toContain("Second paragraph");
    expect(result).toMatch(/First paragraph describing the module\.\n\nSecond paragraph/);
  });

  it("module without shebang/encoding/imports — first statement is docstring", () => {
    const source = [
      '"""Simplest module docstring."""',
      "",
      "from os import path",
    ].join("\n");
    expect(parsePythonModuleDocstring(source)).toBe(
      "Simplest module docstring.",
    );
  });

  it("parenthesized multi-line __future__ import before module docstring", () => {
    const source = [
      "from __future__ import (",
      "    annotations,",
      "    division,",
      ")",
      "",
      '"""Module docstring after multi-line future import."""',
    ].join("\n");
    expect(parsePythonModuleDocstring(source)).toBe(
      "Module docstring after multi-line future import.",
    );
  });
});

describe("parsePythonBodyDocstring (parser unit tests)", () => {
  it("happy path — class with single-line docstring", () => {
    const source = [
      "class Foo:",
      '    """Foo represents a thing."""',
      "    def method(self): pass",
    ].join("\n");
    expect(parsePythonBodyDocstring(source, 1)).toBe("Foo represents a thing.");
  });

  it("function with multi-line docstring + decorator", () => {
    const source = [
      "@property",
      "def name(self) -> str:",
      '    """',
      "    The display name of this object.",
      "",
      "    Computed lazily on first access.",
      '    """',
      "    return self._name",
    ].join("\n");
    // Decorator on line 1; symbol's declLine points at `def name` line 2
    // (per LSP selectionRange convention).
    const result = parsePythonBodyDocstring(source, 2);
    expect(result).toContain("The display name of this object.");
    expect(result).toContain("Computed lazily on first access.");
  });

  it("returns null when function has no docstring", () => {
    const source = [
      "def foo(x: int) -> int:",
      "    return x + 1",
    ].join("\n");
    expect(parsePythonBodyDocstring(source, 1)).toBeNull();
  });

  it("multi-line signature with paren nesting (colon detection)", () => {
    const source = [
      "def request(",
      "    method: str,",
      "    url: str,",
      "    *,",
      "    timeout: float = 5.0,",
      ") -> Response:",
      '    """Send an HTTP request and return the Response."""',
      "    pass",
    ].join("\n");
    expect(parsePythonBodyDocstring(source, 1)).toBe(
      "Send an HTTP request and return the Response.",
    );
  });

  it("triple-single-quote variant (''') extracts content", () => {
    const source = [
      "class Foo:",
      "    '''Foo described with single triple-quotes.'''",
    ].join("\n");
    expect(parsePythonBodyDocstring(source, 1)).toBe(
      "Foo described with single triple-quotes.",
    );
  });

  it("string prefix variants (r/f) extract content correctly", () => {
    const sourceR = [
      "def foo():",
      '    r"""Raw docstring with \\n preserved."""',
    ].join("\n");
    expect(parsePythonBodyDocstring(sourceR, 1)).toBe(
      "Raw docstring with \\n preserved.",
    );
    const sourceF = [
      "def bar():",
      '    f"""F-string docstring (rare but allowed)."""',
    ].join("\n");
    expect(parsePythonBodyDocstring(sourceF, 1)).toBe(
      "F-string docstring (rare but allowed).",
    );
  });

  it("returns null when first body statement is not a string", () => {
    const source = [
      "def foo():",
      "    return 42",
    ].join("\n");
    expect(parsePythonBodyDocstring(source, 1)).toBeNull();
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

// ---------------------------------------------------------------------------
// Section 3: extractDocstringsForFile — Python behavioral tests (Step 11 Commit 3)
// ---------------------------------------------------------------------------
//
// Mirrors Step 10 Commit 2 (Go behavioral suite) pattern with language:
// "python" + Python-shaped symbols. Mock adapter bypasses parser per
// Step 11 Commit 3 scoping Open Question 1; parser unit-tested in
// Section 1b. Real PyrightAdapter integration validated by Commit 4
// httpx live calibration.

describe("extractDocstringsForFile (Python behavioral)", () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  // Test #1 — Happy path with cross-references; Channel A + B both present.
  it("happy path: documented Python class produces claim with Channel A + Channel B both attached", async () => {
    const documented = makeSymbol("MyClass", "src/module.py", "sha-mod", "python");
    const crossRef = makeSymbol("Logger", "src/log.py", "sha-log", "python");
    upsertSymbols(db, [documented, crossRef]);
    const inventory = makeInventory([documented, crossRef]);

    const docstringText = "MyClass uses Logger for diagnostic recording.";
    const adapter = makeStubAdapter({
      language: "python",
      extensions: [".py"],
      symbolsByPath: new Map([["src/module.py", [documented]]]),
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
                claim: "MyClass records diagnostics via Logger",
                severity: "context",
                rationale: "behavioral relationship",
                excerpt: "uses Logger for diagnostic recording",
              },
            ],
          },
        ],
      ]),
    });

    const result = await extractDocstringsForFile(
      db, adapter, "src/module.py", "sha-mod", inventory, client,
    );

    expect(result.claimsWritten).toBe(1);
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    const claim = claims[0]!;
    expect(claim.symbolIds).toContain(documented.id); // Channel A
    expect(claim.symbolIds).toContain(crossRef.id);   // Channel B
    expect(claim.symbolIds).toHaveLength(2);
    expect(claim.source).toBe("docstring:src/module.py");
  });

  // Test #2 — Module-level synthesis E2E (LOAD-BEARING for Commit 2 architecture).
  it("module-level synthesis E2E: <module> SymbolId produces claim attached to module symbol", async () => {
    const moduleSym: AtlasSymbol = {
      id: "sym:py:src/module.py:<module>",
      name: "<module>",
      kind: "module",
      path: "src/module.py",
      line: 1,
      language: "python",
      fileSha: "sha-mod",
    };
    upsertSymbols(db, [moduleSym]);
    const inventory = makeInventory([moduleSym]);

    const docstringText = "Module purpose: defines the public interface.";
    const adapter = makeStubAdapter({
      language: "python",
      extensions: [".py"],
      symbolsByPath: new Map([["src/module.py", [moduleSym]]]),
      docstringsBySymbolId: new Map([[moduleSym.id, docstringText]]),
    });
    const client = makeStubClient({
      responsesByDocstring: new Map([
        [
          docstringText,
          {
            claims: [
              {
                symbol_candidates: [],
                claim: "Module defines the public interface for foo subsystem",
                severity: "context",
                rationale: "module-level scope statement",
                excerpt: "defines the public interface",
              },
            ],
          },
        ],
      ]),
    });

    const result = await extractDocstringsForFile(
      db, adapter, "src/module.py", "sha-mod", inventory, client,
    );

    expect(result.claimsWritten).toBe(1);
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.symbolIds).toContain(moduleSym.id);
    expect(claims[0]!.symbolIds).toHaveLength(1);
    expect(claims[0]!.source).toBe("docstring:src/module.py");
    // Verify isExportedSymbol("<module>", "python") returned true
    // (otherwise we'd have apiCalls === 0 and claimsWritten === 0).
    expect(result.symbolsExported).toBe(1);
    expect(result.apiCalls).toBe(1);
  });

  // Test #3 — No docstring → 0 claims (graceful).
  it("no docstring: Python class without docstring produces zero claims", async () => {
    const sym = makeSymbol("MyClass", "src/module.py", "sha-mod", "python");
    upsertSymbols(db, [sym]);
    const inventory = makeInventory([sym]);

    const adapter = makeStubAdapter({
      language: "python",
      extensions: [".py"],
      symbolsByPath: new Map([["src/module.py", [sym]]]),
      docstringsBySymbolId: new Map([[sym.id, null]]),
    });
    const client = makeStubClient({ responsesByDocstring: new Map() });

    const result = await extractDocstringsForFile(
      db, adapter, "src/module.py", "sha-mod", inventory, client,
    );

    expect(result.claimsWritten).toBe(0);
    expect(result.symbolsExported).toBe(1);
    expect(result.symbolsWithDocstring).toBe(0);
    expect(result.apiCalls).toBe(0);
  });

  // Test #4 — Underscore-private filter (Python-specific exported logic).
  it("underscore-private filter: _helper symbol skipped before extraction call", async () => {
    const exported = makeSymbol("PublicClass", "src/lib.py", "sha-lib", "python");
    const privateSym = makeSymbol("_private_helper", "src/lib.py", "sha-lib", "python");
    upsertSymbols(db, [exported, privateSym]);
    const inventory = makeInventory([exported, privateSym]);

    const adapter = makeStubAdapter({
      language: "python",
      extensions: [".py"],
      symbolsByPath: new Map([["src/lib.py", [exported, privateSym]]]),
      docstringsBySymbolId: new Map([
        [exported.id, "Public class description."],
        [privateSym.id, "should never reach extraction"],
      ]),
    });
    const client = makeStubClient({
      responsesByDocstring: new Map([
        [
          "Public class description.",
          {
            claims: [
              {
                symbol_candidates: [],
                claim: "PublicClass is documented",
                severity: "context",
                rationale: "documentation",
                excerpt: "Public class description",
              },
            ],
          },
        ],
      ]),
    });

    const result = await extractDocstringsForFile(
      db, adapter, "src/lib.py", "sha-lib", inventory, client,
    );

    expect(result.symbolsProcessed).toBe(2);
    expect(result.symbolsExported).toBe(1); // Only PublicClass
    expect(result.apiCalls).toBe(1);
    expect(listAllClaims(db)).toHaveLength(1);
  });

  // Test #5 — Dunder method allow.
  it("dunder method allow: __init__ with docstring extracted (passes isExportedSymbol)", async () => {
    const init = makeSymbol("MyClass.__init__", "src/lib.py", "sha-lib", "python");
    upsertSymbols(db, [init]);
    const inventory = makeInventory([init]);

    const adapter = makeStubAdapter({
      language: "python",
      extensions: [".py"],
      symbolsByPath: new Map([["src/lib.py", [init]]]),
      docstringsBySymbolId: new Map([[init.id, "Initialize MyClass with default state."]]),
    });
    const client = makeStubClient({
      responsesByDocstring: new Map([
        [
          "Initialize MyClass with default state.",
          {
            claims: [
              {
                symbol_candidates: [],
                claim: "MyClass.__init__ initializes default state",
                severity: "context",
                rationale: "constructor documentation",
                excerpt: "Initialize MyClass with default state",
              },
            ],
          },
        ],
      ]),
    });

    const result = await extractDocstringsForFile(
      db, adapter, "src/lib.py", "sha-lib", inventory, client,
    );

    expect(result.symbolsExported).toBe(1); // Dunder NOT filtered as private
    expect(result.apiCalls).toBe(1);
    expect(result.claimsWritten).toBe(1);
  });

  // Test #6 — Multi-symbol Python file: aggregation + filter composition.
  it("multi-symbol Python: aggregates correctly across class + function + private + dunder", async () => {
    const cls = makeSymbol("PublicClass", "src/lib.py", "sha-lib", "python");
    const func = makeSymbol("public_func", "src/lib.py", "sha-lib", "python");
    const priv = makeSymbol("_private", "src/lib.py", "sha-lib", "python");
    const dunder = makeSymbol("PublicClass.__str__", "src/lib.py", "sha-lib", "python");
    upsertSymbols(db, [cls, func, priv, dunder]);
    const inventory = makeInventory([cls, func, priv, dunder]);

    const adapter = makeStubAdapter({
      language: "python",
      extensions: [".py"],
      symbolsByPath: new Map([["src/lib.py", [cls, func, priv, dunder]]]),
      docstringsBySymbolId: new Map([
        [cls.id, "PublicClass docstring."],
        [func.id, "public_func docstring."],
        [priv.id, "should never reach"],
        [dunder.id, "String representation."],
      ]),
    });
    const client = makeStubClient({
      responsesByDocstring: new Map([
        ["PublicClass docstring.", { claims: [{ symbol_candidates: [], claim: "PublicClass desc", severity: "context", rationale: "doc", excerpt: "PublicClass docstring" }] }],
        ["public_func docstring.", { claims: [{ symbol_candidates: [], claim: "public_func desc", severity: "context", rationale: "doc", excerpt: "public_func docstring" }] }],
        ["String representation.", { claims: [{ symbol_candidates: [], claim: "__str__ desc", severity: "context", rationale: "doc", excerpt: "String representation" }] }],
      ]),
    });

    const result = await extractDocstringsForFile(
      db, adapter, "src/lib.py", "sha-lib", inventory, client,
    );

    expect(result.symbolsProcessed).toBe(4);
    expect(result.symbolsExported).toBe(3); // cls + func + dunder; _private filtered
    expect(result.apiCalls).toBe(3);
    expect(result.claimsWritten).toBe(3);
    expect(listAllClaims(db)).toHaveLength(3);
  });

  // Test #7 — Provenance only (Channel A alone; Channel B empty).
  it("provenance only: empty symbol_candidates yields claim with documented symbol alone (Channel A)", async () => {
    const sym = makeSymbol("MyClass", "src/lib.py", "sha-lib", "python");
    const otherInInventory = makeSymbol("Other", "src/other.py", "sha-other", "python");
    upsertSymbols(db, [sym, otherInInventory]);
    const inventory = makeInventory([sym, otherInInventory]);

    const adapter = makeStubAdapter({
      language: "python",
      extensions: [".py"],
      symbolsByPath: new Map([["src/lib.py", [sym]]]),
      docstringsBySymbolId: new Map([[sym.id, "Self-contained documentation."]]),
    });
    const client = makeStubClient({
      responsesByDocstring: new Map([
        [
          "Self-contained documentation.",
          {
            claims: [
              {
                symbol_candidates: [],
                claim: "MyClass is self-describing",
                severity: "context",
                rationale: "doc",
                excerpt: "Self-contained",
              },
            ],
          },
        ],
      ]),
    });

    const result = await extractDocstringsForFile(
      db, adapter, "src/lib.py", "sha-lib", inventory, client,
    );

    expect(result.claimsWritten).toBe(1);
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.symbolIds).toContain(sym.id); // Channel A present
    expect(claims[0]!.symbolIds).toHaveLength(1);   // Channel B empty
    expect(claims[0]!.symbolIds).not.toContain(otherInInventory.id);
  });
});

// ---------------------------------------------------------------------------
// Section 4: Multi-language conformance precursor (Step 11 Commit 3)
// ---------------------------------------------------------------------------
//
// Single-test precursor for Step 11 Commit 8 cross-language conformance
// suite. Verifies Go + Python adapters compose correctly through the
// same extractDocstringsForFile pipeline path: per-language adapter
// substrate differs; pipeline routes by language; both languages'
// claims appear with correct source markers in shared atlas DB.
//
// TS adapter joins this suite at Commit 8 once Commit 5 (TS impl) lands.

describe("multi-language conformance precursor (Go + Python)", () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("Go + Python adapters produce correct claims composing in same atlas", async () => {
    // Shared inventory spanning both languages
    const goSym = makeSymbol("GoFunc", "lib.go", "sha-go", "go");
    const pySym = makeSymbol("PyClass", "lib.py", "sha-py", "python");
    upsertSymbols(db, [goSym, pySym]);
    const inventory = makeInventory([goSym, pySym]);

    const goAdapter = makeStubAdapter({
      language: "go",
      extensions: [".go"],
      symbolsByPath: new Map([["lib.go", [goSym]]]),
      docstringsBySymbolId: new Map([[goSym.id, "GoFunc does Go things."]]),
    });
    const pyAdapter = makeStubAdapter({
      language: "python",
      extensions: [".py"],
      symbolsByPath: new Map([["lib.py", [pySym]]]),
      docstringsBySymbolId: new Map([[pySym.id, "PyClass describes Python things."]]),
    });

    const client = makeStubClient({
      responsesByDocstring: new Map([
        [
          "GoFunc does Go things.",
          {
            claims: [
              {
                symbol_candidates: [],
                claim: "GoFunc operates in Go land",
                severity: "context",
                rationale: "go documentation",
                excerpt: "GoFunc does Go things",
              },
            ],
          },
        ],
        [
          "PyClass describes Python things.",
          {
            claims: [
              {
                symbol_candidates: [],
                claim: "PyClass operates in Python land",
                severity: "context",
                rationale: "python documentation",
                excerpt: "PyClass describes Python things",
              },
            ],
          },
        ],
      ]),
    });

    // Run extraction sequentially per file (pipeline routes per adapter
    // language; each call uses its own adapter)
    await extractDocstringsForFile(db, goAdapter, "lib.go", "sha-go", inventory, client);
    await extractDocstringsForFile(db, pyAdapter, "lib.py", "sha-py", inventory, client);

    // Both languages' claims present, with correct source markers
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(2);

    const claimsBySource = new Map(claims.map((c) => [c.source, c]));
    expect(claimsBySource.has("docstring:lib.go")).toBe(true);
    expect(claimsBySource.has("docstring:lib.py")).toBe(true);

    expect(claimsBySource.get("docstring:lib.go")?.symbolIds).toContain(goSym.id);
    expect(claimsBySource.get("docstring:lib.py")?.symbolIds).toContain(pySym.id);
  });
});
