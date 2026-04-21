import { resolve as pathResolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LANG_CODES } from "../types.js";

import {
  TypeScriptAdapter,
  extractDeclarationHeader,
  findEnclosingSymbolNode,
  parseTypeRelationshipsFromDeclaration,
  stripGenericBrackets,
} from "./typescript.js";

const FIXTURE_ROOT = pathResolve("test/fixtures/typescript");
const SAMPLE = pathResolve(FIXTURE_ROOT, "sample.ts");
const BROKEN = pathResolve(FIXTURE_ROOT, "broken.ts");

describe("TypeScriptAdapter", () => {
  let adapter: TypeScriptAdapter;

  beforeAll(async () => {
    adapter = new TypeScriptAdapter();
    await adapter.initialize(FIXTURE_ROOT);
  }, 30_000);

  afterAll(async () => {
    await adapter.shutdown();
  });

  it("lists top-level symbols with names, kinds, and repo-relative paths", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const byName = new Map(symbols.map((s) => [s.name, s]));

    const calc = byName.get("Calculator");
    expect(calc).toBeDefined();
    expect(calc?.kind).toBe("class");
    expect(calc?.path).toBe("sample.ts");
    expect(calc?.language).toBe("typescript");
    expect(calc?.id).toBe(
      `sym:${LANG_CODES.typescript}:sample.ts:Calculator`,
    );

    const greet = byName.get("greet");
    expect(greet).toBeDefined();
    expect(greet?.kind).toBe("function");

    const userId = byName.get("UserId");
    expect(userId).toBeDefined();
    // tsserver reports type aliases as a LSP kind in the type/variable range.
    expect(["type", "variable", "interface"]).toContain(userId?.kind);
  });

  it("symbol IDs do not include line numbers (ADR-01)", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    for (const s of symbols) {
      expect(s.id).not.toMatch(/:\d+$/);
      expect(s.line).toBeGreaterThan(0);
    }
  });

  it("findReferences returns consumer.ts call site for Calculator", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const calc = symbols.find((s) => s.name === "Calculator");
    expect(calc).toBeDefined();

    const refs = await adapter.findReferences(calc!.id);
    expect(refs.length).toBeGreaterThan(0);
    const inConsumer = refs.filter((r) => r.path === "consumer.ts");
    expect(inConsumer.length).toBeGreaterThan(0);
    for (const r of inConsumer) {
      expect(r.symbolId).toBe(calc!.id);
      expect(r.id).toMatch(/^ref:ts:consumer\.ts:\d+$/);
    }
  });

  it("getDiagnostics returns an empty list for a clean file", async () => {
    const diags = await adapter.getDiagnostics(SAMPLE);
    expect(Array.isArray(diags)).toBe(true);
    // Clean file — should have no errors. (Warnings/info would be unusual here.)
    const errors = diags.filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });

  it("getDiagnostics surfaces type errors from a broken fixture", async () => {
    const diags = await adapter.getDiagnostics(BROKEN);
    const errors = diags.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) {
      expect(e.path).toBe("broken.ts");
      expect(e.line).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — unit-tested directly with synthetic inputs.
// ---------------------------------------------------------------------------

describe("stripGenericBrackets", () => {
  it("removes a single balanced bracket span", () => {
    expect(stripGenericBrackets("class Foo<T>")).toBe("class Foo");
  });
  it("removes nested brackets", () => {
    expect(stripGenericBrackets("class Foo<Bar<Baz<T>>>")).toBe("class Foo");
  });
  it("removes generic constraints", () => {
    expect(stripGenericBrackets("class Box<T extends Widget>")).toBe(
      "class Box",
    );
  });
  it("preserves content around the brackets", () => {
    expect(
      stripGenericBrackets("class Foo<T> extends Bar<U> implements Baz<V>"),
    ).toBe("class Foo extends Bar implements Baz");
  });
  it("leaves unbalanced input as-is", () => {
    // `>` without a matching `<` is not stripped.
    expect(stripGenericBrackets("a > b")).toBe("a > b");
  });
});

describe("parseTypeRelationshipsFromDeclaration", () => {
  it("parses single extends", () => {
    expect(
      parseTypeRelationshipsFromDeclaration(
        "export class Triangle extends Polygon",
      ),
    ).toEqual({ extends: ["Polygon"], implements: [] });
  });
  it("parses single implements", () => {
    expect(
      parseTypeRelationshipsFromDeclaration(
        "export class Shape implements Drawable",
      ),
    ).toEqual({ extends: [], implements: ["Drawable"] });
  });
  it("parses multiple implements", () => {
    expect(
      parseTypeRelationshipsFromDeclaration(
        "export class Decal implements Printable, Drawable",
      ),
    ).toEqual({ extends: [], implements: ["Printable", "Drawable"] });
  });
  it("parses extends + implements combined", () => {
    expect(
      parseTypeRelationshipsFromDeclaration(
        "export class Polygon extends Shape<Drawable> implements Printable",
      ),
    ).toEqual({ extends: ["Shape"], implements: ["Printable"] });
  });
  it("does NOT register a generic constraint as a parent", () => {
    expect(
      parseTypeRelationshipsFromDeclaration("export class Box<T extends Widget>"),
    ).toEqual({ extends: [], implements: [] });
  });
  it("parses interface extending multiple interfaces", () => {
    expect(
      parseTypeRelationshipsFromDeclaration(
        "export interface Auditable extends Drawable, Printable",
      ),
    ).toEqual({ extends: ["Drawable", "Printable"], implements: [] });
  });
  it("returns empty arrays for a class with no relationships", () => {
    expect(
      parseTypeRelationshipsFromDeclaration("export class Widget"),
    ).toEqual({ extends: [], implements: [] });
  });
  it("handles abstract + generic constraint + implements together", () => {
    expect(
      parseTypeRelationshipsFromDeclaration(
        "export abstract class Shape<T extends Drawable> implements Drawable",
      ),
    ).toEqual({ extends: [], implements: ["Drawable"] });
  });
  it("returns empty for non-declarations", () => {
    expect(parseTypeRelationshipsFromDeclaration("const x = 5")).toEqual({
      extends: [],
      implements: [],
    });
    expect(parseTypeRelationshipsFromDeclaration("")).toEqual({
      extends: [],
      implements: [],
    });
  });
});

describe("extractDeclarationHeader", () => {
  it("returns a single-line declaration up to the brace", () => {
    const src = "class Foo extends Bar implements Baz {\n  body\n}\n";
    expect(extractDeclarationHeader(src, 0)).toBe(
      "class Foo extends Bar implements Baz",
    );
  });
  it("joins a declaration split across multiple lines", () => {
    const src = "class Foo\n  extends Bar\n  implements Baz, Qux {\n  body\n}\n";
    // Exact whitespace count depends on the joiner; the parser collapses
    // runs of whitespace before extracting tokens, so what matters here
    // is that all the declaration tokens survive.
    const out = extractDeclarationHeader(src, 0);
    expect(out.replace(/\s+/g, " ")).toBe(
      "class Foo extends Bar implements Baz, Qux",
    );
  });
  it("stops at the line budget if no brace is found", () => {
    const src = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
    const out = extractDeclarationHeader(src, 0, 3);
    expect(out.split(" ").length).toBeLessThan(20);
  });
});

describe("findEnclosingSymbolNode", () => {
  type Sym = {
    name: string;
    kind: number;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } };
    children?: Sym[];
  };

  const mk = (name: string, startL: number, endL: number, children: Sym[] = []): Sym => ({
    name,
    kind: 5,
    range: { start: { line: startL, character: 0 }, end: { line: endL, character: 100 } },
    selectionRange: { start: { line: startL, character: 0 }, end: { line: startL, character: name.length } },
    children,
  });

  it("returns the innermost enclosing symbol node", () => {
    const tree: Sym[] = [
      mk("Outer", 0, 100, [
        mk("Inner", 10, 50, [mk("Deepest", 20, 30)]),
      ]),
    ];
    expect(
      findEnclosingSymbolNode(tree as never, { line: 25, character: 5 })?.name,
    ).toBe("Deepest");
  });

  it("returns the parent when children don't contain the position", () => {
    const tree: Sym[] = [mk("Outer", 0, 100, [mk("Inner", 10, 20)])];
    expect(
      findEnclosingSymbolNode(tree as never, { line: 50, character: 5 })?.name,
    ).toBe("Outer");
  });

  it("returns null when no symbol contains the position", () => {
    const tree: Sym[] = [mk("Foo", 0, 10)];
    expect(
      findEnclosingSymbolNode(tree as never, { line: 20, character: 0 }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration tests: full getTypeInfo flow through real tsserver.
// ---------------------------------------------------------------------------

const SHAPES = pathResolve(FIXTURE_ROOT, "types/shapes.ts");

describe("TypeScriptAdapter.getTypeInfo", () => {
  let adapter: TypeScriptAdapter;

  beforeAll(async () => {
    adapter = new TypeScriptAdapter();
    await adapter.initialize(FIXTURE_ROOT);
  }, 30_000);

  afterAll(async () => {
    await adapter.shutdown();
  });

  async function typeInfoFor(name: string) {
    const symbols = await adapter.listSymbols(SHAPES);
    const target = symbols.find((s) => s.name === name);
    expect(target, `symbol '${name}' not found in shapes.ts`).toBeDefined();
    return adapter.getTypeInfo(target!.id);
  }

  it("single extends (Triangle extends Polygon)", async () => {
    const info = await typeInfoFor("Triangle");
    expect(info.extends).toEqual(["Polygon"]);
    expect(info.implements).toEqual([]);
  });

  it("single implements (Shape implements Drawable, generic constraint excluded)", async () => {
    const info = await typeInfoFor("Shape");
    expect(info.extends).toEqual([]);
    expect(info.implements).toEqual(["Drawable"]);
  });

  it("multiple implements (Decal implements Printable, Drawable)", async () => {
    const info = await typeInfoFor("Decal");
    expect(info.extends).toEqual([]);
    expect(info.implements.sort()).toEqual(["Drawable", "Printable"]);
  });

  it("extends + implements combined (Polygon)", async () => {
    const info = await typeInfoFor("Polygon");
    expect(info.extends).toEqual(["Shape"]);
    expect(info.implements).toEqual(["Printable"]);
  });

  it("generic constraint does NOT leak into extends (Box<T extends Widget>)", async () => {
    const info = await typeInfoFor("Box");
    expect(info.extends).toEqual([]);
    expect(info.implements).toEqual([]);
  });

  it("interface extending multiple interfaces (Auditable)", async () => {
    const info = await typeInfoFor("Auditable");
    expect(info.extends.sort()).toEqual(["Drawable", "Printable"]);
    expect(info.implements).toEqual([]);
  });

  it("class with no type relationships (StandaloneMarker)", async () => {
    const info = await typeInfoFor("StandaloneMarker");
    expect(info.extends).toEqual([]);
    expect(info.implements).toEqual([]);
    expect(info.usedByTypes).toEqual([]);
  });

  it("usedByTypes: Polygon has Triangle and Square as direct children", async () => {
    const info = await typeInfoFor("Polygon");
    expect(info.usedByTypes.sort()).toEqual(["Square", "Triangle"]);
  });

  it("usedByTypes: direct children only — no transitive closure", async () => {
    // Shape.usedByTypes should include Polygon but NOT Triangle/Square
    // (those are Polygon's children, not Shape's direct children).
    const info = await typeInfoFor("Shape");
    expect(info.usedByTypes).toContain("Polygon");
    expect(info.usedByTypes).not.toContain("Triangle");
    expect(info.usedByTypes).not.toContain("Square");
  });

  it("usedByTypes: interface Drawable is implemented by multiple classes", async () => {
    const info = await typeInfoFor("Drawable");
    // Drawable is implemented by Shape and Decal, and extended by Auditable.
    // All are direct children.
    const names = new Set(info.usedByTypes);
    expect(names.has("Shape")).toBe(true);
    expect(names.has("Decal")).toBe(true);
    expect(names.has("Auditable")).toBe(true);
  });
});
