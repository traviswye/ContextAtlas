/**
 * GoAdapter smoke tests — Step 9 Commit 3 skeleton.
 *
 * Covers identity (language, extensions), registry wiring, and the
 * placeholder-throws contract for data methods pending Commits 4-5.
 * Lifecycle tests (initialize against real gopls) land in Commit 4
 * when listSymbols has something to exercise.
 */

import { describe, expect, it } from "vitest";

import { GO_EXTENSIONS, GoAdapter, mapGoSymbolKind } from "./go.js";

describe("GoAdapter — skeleton identity", () => {
  it("advertises 'go' as its language code", () => {
    const adapter = new GoAdapter();
    expect(adapter.language).toBe("go");
  });

  it("lists .go as its only extension", () => {
    const adapter = new GoAdapter();
    expect(adapter.extensions).toEqual([".go"]);
    expect(GO_EXTENSIONS).toEqual([".go"]);
  });

  it("accepts an empty options bag", () => {
    expect(() => new GoAdapter()).not.toThrow();
    expect(() => new GoAdapter({})).not.toThrow();
  });
});

describe("GoAdapter — placeholder data methods (pending Commits 4-5)", () => {
  it("listSymbols throws 'not yet implemented'", async () => {
    const adapter = new GoAdapter();
    await expect(adapter.listSymbols("kinds.go")).rejects.toThrow(
      /not yet implemented/,
    );
  });

  it("getSymbolDetails throws 'not yet implemented'", async () => {
    const adapter = new GoAdapter();
    await expect(
      adapter.getSymbolDetails("sym:go:kinds.go:Foo"),
    ).rejects.toThrow(/not yet implemented/);
  });

  it("findReferences throws 'not yet implemented'", async () => {
    const adapter = new GoAdapter();
    await expect(
      adapter.findReferences("sym:go:kinds.go:Foo"),
    ).rejects.toThrow(/not yet implemented/);
  });

  it("getDiagnostics throws 'not yet implemented'", async () => {
    const adapter = new GoAdapter();
    await expect(adapter.getDiagnostics("kinds.go")).rejects.toThrow(
      /not yet implemented/,
    );
  });

  it("getTypeInfo throws 'not yet implemented'", async () => {
    const adapter = new GoAdapter();
    await expect(
      adapter.getTypeInfo("sym:go:kinds.go:Foo"),
    ).rejects.toThrow(/not yet implemented/);
  });
});

describe("mapGoSymbolKind (ADR-14 kind mapping)", () => {
  it("maps struct (23) and type-def/alias (5) to 'class'", () => {
    expect(mapGoSymbolKind(23)).toBe("class");
    expect(mapGoSymbolKind(5)).toBe("class");
  });

  it("maps interface (11) to 'interface'", () => {
    expect(mapGoSymbolKind(11)).toBe("interface");
  });

  it("maps function (12) to 'function'", () => {
    expect(mapGoSymbolKind(12)).toBe("function");
  });

  it("maps method (6) to 'method'", () => {
    expect(mapGoSymbolKind(6)).toBe("method");
  });

  it("maps const (14) and variable (13) to 'variable' (iota members flat per ADR-14 §6)", () => {
    expect(mapGoSymbolKind(14)).toBe("variable");
    expect(mapGoSymbolKind(13)).toBe("variable");
  });

  it("maps unknown kinds to 'other' (fields, namespaces, etc.)", () => {
    expect(mapGoSymbolKind(8)).toBe("other");
    expect(mapGoSymbolKind(2)).toBe("other");
    expect(mapGoSymbolKind(999)).toBe("other");
  });
});
