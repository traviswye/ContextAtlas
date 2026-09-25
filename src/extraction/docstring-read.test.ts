/**
 * Docstring stream, read side (v1.2 Phase 2): the zero-API read that
 * decides which symbols of a file need a docstring extraction call.
 */

import { describe, expect, it } from "vitest";

import type {
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
  SymbolId,
} from "../types.js";

import {
  groupSymbolsByPath,
  isExportedSymbol,
  readFileDocstrings,
} from "./docstring-read.js";

const REL = "src/lib.go";

function sym(name: string, path = REL, language: LanguageCode = "go"): AtlasSymbol {
  return {
    id: `sym:go:${path}:${name}`,
    name,
    kind: "function",
    path,
    line: 1,
    language,
    fileSha: "sha-any",
  };
}

type DocstringBehaviour = string | null | Error;

/** Adapter serving docstrings by symbol id; records getDocstring calls. */
function stubAdapter(docstrings: ReadonlyMap<SymbolId, DocstringBehaviour>): {
  adapter: LanguageAdapter;
  docstringCalls: SymbolId[];
} {
  const docstringCalls: SymbolId[] = [];
  const adapter: LanguageAdapter = {
    language: "go",
    extensions: [".go"],
    async initialize() {},
    async shutdown() {},
    async listSymbols() {
      throw new Error("the read must not re-list symbols");
    },
    async getSymbolDetails() {
      return null;
    },
    async findReferences() {
      return [];
    },
    async getDiagnostics() {
      return [];
    },
    async getTypeInfo() {
      return { extends: [], implements: [], usedByTypes: [] };
    },
    async getDocstring(id: SymbolId) {
      docstringCalls.push(id);
      const d = docstrings.get(id);
      if (d instanceof Error) throw d;
      return d ?? null;
    },
  };
  return { adapter, docstringCalls };
}

const A = sym("FuncA");
const B = sym("FuncB");
const C = sym("FuncC");
const LOGGER = sym("Logger", "src/log.go");

describe("readFileDocstrings", () => {
  it("keeps exported symbols with a non-empty docstring, in listing order", async () => {
    const priv = sym("helper");
    const { adapter, docstringCalls } = stubAdapter(
      new Map<SymbolId, DocstringBehaviour>([
        [A.id, "A doc."],
        [priv.id, "never read"],
        [B.id, null],
        [C.id, "  \n "],
        [LOGGER.id, "Logger doc."],
      ]),
    );

    const read = await readFileDocstrings(adapter, [A, priv, B, C, LOGGER]);

    expect(read.symbolsProcessed).toBe(5);
    expect(read.symbolsExported).toBe(4);
    expect(read.entries).toEqual([
      { symbolId: A.id, docstring: "A doc." },
      { symbolId: LOGGER.id, docstring: "Logger doc." },
    ]);
    expect(read.errors).toEqual([]);
    // Unexported symbols are filtered before any LSP request.
    expect(docstringCalls).not.toContain(priv.id);
  });

  it("records a getDocstring failure and keeps reading the rest", async () => {
    const { adapter } = stubAdapter(
      new Map<SymbolId, DocstringBehaviour>([
        [A.id, new Error("hover timed out")],
        [B.id, "B doc."],
      ]),
    );

    const read = await readFileDocstrings(adapter, [A, B]);

    expect(read.entries).toEqual([{ symbolId: B.id, docstring: "B doc." }]);
    expect(read.errors).toHaveLength(1);
    expect(read.errors[0]!.symbolId).toBe(A.id);
    expect(read.errors[0]!.error).toMatch(/getDocstring failed for/);
    expect(read.errors[0]!.error).toMatch(/hover timed out/);
  });

  it("reads nothing for an empty listing", async () => {
    const { adapter, docstringCalls } = stubAdapter(new Map());
    const read = await readFileDocstrings(adapter, []);
    expect(read).toEqual({
      symbolsProcessed: 0,
      symbolsExported: 0,
      entries: [],
      errors: [],
    });
    expect(docstringCalls).toEqual([]);
  });
});

describe("groupSymbolsByPath", () => {
  it("groups by path, keeping first-seen path order and listing order", () => {
    const x = sym("X", "src/b.go");
    const grouped = groupSymbolsByPath([A, x, B, LOGGER]);
    expect([...grouped.keys()]).toEqual([REL, "src/b.go", "src/log.go"]);
    expect(grouped.get(REL)).toEqual([A, B]);
  });
});

describe("isExportedSymbol", () => {
  it("Go: exported iff the trailing name component is capitalized", () => {
    expect(isExportedSymbol("Run", "go")).toBe(true);
    expect(isExportedSymbol("run", "go")).toBe(false);
    expect(isExportedSymbol("Shape.Area", "go")).toBe(true);
    expect(isExportedSymbol("Shape.area", "go")).toBe(false);
  });

  it("Python: <module> and dunders are exported; other leading underscores are private", () => {
    expect(isExportedSymbol("<module>", "python")).toBe(true);
    expect(isExportedSymbol("Client.__init__", "python")).toBe(true);
    expect(isExportedSymbol("public_func", "python")).toBe(true);
    expect(isExportedSymbol("_helper", "python")).toBe(false);
    expect(isExportedSymbol("Client.__mangled", "python")).toBe(false);
  });

  it("TypeScript and other languages: permissive", () => {
    expect(isExportedSymbol("internalHelper", "typescript")).toBe(true);
    expect(isExportedSymbol("_private", "typescript")).toBe(true);
  });
});
