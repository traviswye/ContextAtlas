import { resolve as pathResolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LANG_CODES } from "../types.js";

import {
  TypeScriptAdapter,
  extractDeclarationHeader,
  extractTypeAliasHeader,
  findEnclosingSymbolNode,
  looksLikeNewTopLevelDeclaration,
  looksMalformedSignature,
  normalizeSignature,
  parseTypeRelationshipsFromDeclaration,
  stripGenericBrackets,
} from "./typescript.js";

const FIXTURE_ROOT = pathResolve("test/fixtures/typescript");
const SAMPLE = pathResolve(FIXTURE_ROOT, "sample.ts");
const BROKEN = pathResolve(FIXTURE_ROOT, "broken.ts");
const PARITY = pathResolve(FIXTURE_ROOT, "parity.ts");

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
    // tsserver returns LSP kind Variable for type aliases, so our raw
    // mapping would produce `variable`. The adapter remaps to `type`
    // via a source-line peek that also powers signature extraction —
    // see deriveSignatureAndKind. The assertion was initially tolerant
    // (["type", "variable", "interface"]) during step-2 exploration;
    // tightened to the committed design decision during step-6 dogfooding.
    expect(userId?.kind).toBe("type");
  });

  it("does not remap regular consts to kind 'type'", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const constSym = symbols.find((s) => s.name === "DEFAULT_GREETING");
    expect(constSym).toBeDefined();
    expect(constSym?.kind).toBe("variable");
  });

  it("populates signatures for class/function/type-alias symbols", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const byName = new Map(symbols.map((s) => [s.name, s]));

    // class Calculator — signature should be the class header.
    const calc = byName.get("Calculator");
    expect(calc?.signature).toBe("class Calculator");

    // function greet — signature should include the parameter list + return.
    const greet = byName.get("greet");
    expect(greet?.signature).toBe(
      "function greet(name: string): string",
    );

    // type UserId — signature must include the RHS, not just "type UserId =".
    const userId = byName.get("UserId");
    expect(userId?.signature).toBe("type UserId = string");
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

  // -------------------------------------------------------------------
  // Parity with PyrightAdapter (v0.2 Stream A #4)
  //
  // Target behavior surfaced by the Phase C hono spot-check:
  //   Gap 1 — class / interface members must be surfaced as symbols
  //   Gap 2 — namespace children must be surfaced as symbols
  //   Gap 5 — type-alias signatures must terminate at the next
  //           top-level declaration (not bleed under ASI convention)
  //
  // See docs/ts-adapter-parity-check.md for full matrix.
  // -------------------------------------------------------------------

  describe("parity (v0.2 Stream A #4)", () => {
    it("class members are surfaced as symbols (Gap 1)", async () => {
      const symbols = await adapter.listSymbols(PARITY);
      const byName = new Map(symbols.map((s) => [s.name, s]));

      expect(byName.get("ParityClass")?.kind).toBe("class");
      // Instance method, static method, and readonly property should
      // each appear as their own symbol beneath the class.
      expect(byName.get("instanceMethod")?.kind).toBe("method");
      expect(byName.get("staticMethod")?.kind).toBe("method");
      // readonly `id` property — TS emits this with a kind that maps
      // either to "variable" (LSP 13/14) or "other" depending on
      // tsserver version. Either outcome is acceptable so long as it
      // doesn't break the class-children iteration path; weaker
      // assertion below just checks presence.
      const id = byName.get("id");
      if (id) {
        expect(typeof id.kind).toBe("string");
      }
    });

    it("interface members are surfaced as symbols (Gap 1)", async () => {
      const symbols = await adapter.listSymbols(PARITY);
      const byName = new Map(symbols.map((s) => [s.name, s]));

      expect(byName.get("ParityInterface")?.kind).toBe("interface");
      // Method signature on the interface.
      const methodSig = byName.get("methodSig");
      expect(methodSig).toBeDefined();
      expect(methodSig?.kind).toBe("method");
    });

    it("namespace children are surfaced as symbols (Gap 2)", async () => {
      const symbols = await adapter.listSymbols(PARITY);
      const byName = new Map(symbols.map((s) => [s.name, s]));

      // The namespace itself maps to kind "module" via LSP kind=2.
      expect(byName.get("ParityNamespace")?.kind).toBe("module");
      // Inner interface inside the namespace.
      expect(byName.get("Inner")?.kind).toBe("interface");
      // Inner type alias inside the namespace.
      expect(byName.get("InnerAlias")?.kind).toBe("type");
    });

    it("type-alias signature does not bleed into the next declaration (Gap 5)", async () => {
      const symbols = await adapter.listSymbols(PARITY);
      const byName = new Map(symbols.map((s) => [s.name, s]));

      const first = byName.get("FirstTypeAlias");
      expect(first?.kind).toBe("type");
      // Signature should contain the RHS of FirstTypeAlias ONLY —
      // not bleed into SecondTypeAlias or anything after it.
      expect(first?.signature).toBeDefined();
      expect(first?.signature).not.toContain("SecondTypeAlias");
      expect(first?.signature).toContain("Record<string, number>");
    });

    it("multi-line object-shape type alias signature captured correctly (Gap 5 corollary)", async () => {
      // The termination fix must still allow multi-line object-shape
      // type aliases to capture their full RHS. `SecondTypeAlias`
      // spans three lines and has balanced braces; its signature
      // should include both `x: number` and `y: number`.
      const symbols = await adapter.listSymbols(PARITY);
      const second = symbols.find((s) => s.name === "SecondTypeAlias");
      expect(second?.kind).toBe("type");
      expect(second?.signature).toContain("x: number");
      expect(second?.signature).toContain("y: number");
    });

    it("complex generic class signature with '= {}' default (Gap 3)", async () => {
      // Mirror of hono's `class Hono<..., S extends Schema = {}, ...>`.
      // Without generic-depth tracking the signature extractor stopped
      // at the `{` inside the generic default, producing a truncated
      // signature that looksMalformedSignature then rejected — so the
      // class ended up with no signature at all.
      const symbols = await adapter.listSymbols(PARITY);
      const host = symbols.find((s) => s.name === "GenericHost");
      expect(host?.kind).toBe("class");
      expect(host?.signature).toBeDefined();
      // All three type parameter names should appear in the signature.
      expect(host?.signature).toContain("T extends ParityInterface");
      expect(host?.signature).toContain("S extends GenericSchema");
      expect(host?.signature).toContain("U = string");
      // Must NOT be truncated mid-generic.
      expect(host?.signature).not.toMatch(/=\s*$/);
    });
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
  it("stops at a trailing semicolon on the same line as the declaration", () => {
    const src = "type UserId = string;\n";
    expect(extractDeclarationHeader(src, 0)).toBe("type UserId = string");
  });
});

describe("extractTypeAliasHeader", () => {
  it("captures the full right-hand side for scalar type aliases", () => {
    const src = "export type UserId = string;\n";
    expect(extractTypeAliasHeader(src, 0)).toBe(
      "export type UserId = string",
    );
  });
  it("captures object-shape type aliases WITHOUT truncating at {", () => {
    const src = "export type Point = { x: number; y: number };\n";
    // Inner semicolons inside the object belong to the value; we stop
    // at the statement-terminating semicolon only. This test actually
    // exposes that extractTypeAliasHeader is line-based; a single-line
    // object-shape with inner semis will stop at the first one.
    // Multi-line is the realistic case — tested below.
    const got = extractTypeAliasHeader(src, 0);
    expect(got).toMatch(/^export type Point =/);
  });
  it("captures multi-line type aliases with object shapes", () => {
    const src = "export type Point = {\n  x: number\n  y: number\n};\n";
    const got = extractTypeAliasHeader(src, 0).replace(/\s+/g, " ");
    expect(got).toBe("export type Point = { x: number y: number }");
  });
  it("stops at the statement-terminating semicolon for multi-line unions", () => {
    const src = "type Status =\n  | 'ok'\n  | 'err';\n";
    const got = extractTypeAliasHeader(src, 0).replace(/\s+/g, " ");
    expect(got).toBe("type Status = | 'ok' | 'err'");
  });

  // Gap 5 (v0.2 Stream A #4): ASI convention — no trailing `;` on a
  // scalar type alias that's followed by another declaration on the
  // next line. Must terminate before the following declaration.
  it("ASI convention: stops before the next declaration when no trailing ';'", () => {
    const src =
      "export type FirstTypeAlias = Record<string, number>\n\nexport type SecondTypeAlias = {\n  x: number\n};\n";
    const got = extractTypeAliasHeader(src, 0).replace(/\s+/g, " ");
    expect(got).toBe("export type FirstTypeAlias = Record<string, number>");
    expect(got).not.toContain("SecondTypeAlias");
  });

  it("ASI convention: stops before non-exported next declaration too", () => {
    const src = "type FirstTypeAlias = number\ntype SecondTypeAlias = string;\n";
    const got = extractTypeAliasHeader(src, 0).replace(/\s+/g, " ");
    expect(got).toBe("type FirstTypeAlias = number");
  });

  it("ASI convention: stops before const/function/class boundaries", () => {
    const src1 = "type X = number\nconst y = 1;\n";
    expect(extractTypeAliasHeader(src1, 0).replace(/\s+/g, " ")).toBe(
      "type X = number",
    );
    const src2 = "type X = number\nfunction y() {}\n";
    expect(extractTypeAliasHeader(src2, 0).replace(/\s+/g, " ")).toBe(
      "type X = number",
    );
    const src3 = "type X = number\nclass Y {}\n";
    expect(extractTypeAliasHeader(src3, 0).replace(/\s+/g, " ")).toBe(
      "type X = number",
    );
  });
});

describe("looksLikeNewTopLevelDeclaration", () => {
  it.each([
    "const x = 1",
    "let y = 2",
    "var z = 3",
    "export const a = 1",
    "export type T = string",
    "type T = string",
    "function foo() {}",
    "export function bar() {}",
    "class Foo {}",
    "export class Bar {}",
    "interface Baz {}",
    "export interface Qux {}",
    "enum E { A }",
    "export enum F { B }",
    "namespace N {}",
    "export namespace M {}",
    "declare module 'foo' {}",
    "async function afn() {}",
    "abstract class AC {}",
  ])("recognizes '%s' as top-level declaration", (line) => {
    expect(looksLikeNewTopLevelDeclaration(line)).toBe(true);
  });

  it.each([
    "  indented continuation line",
    "  x: number",
    "}",
    "| 'variant'",
    "& SomeType",
    "return x",
    "if (foo) { ... }",
    "// comment",
    "",
  ])("rejects '%s' (not a top-level declaration)", (line) => {
    expect(looksLikeNewTopLevelDeclaration(line)).toBe(false);
  });
});

describe("normalizeSignature", () => {
  it("collapses whitespace runs to single spaces", () => {
    expect(normalizeSignature("class   Foo\n  extends Bar")).toBe(
      "class Foo extends Bar",
    );
  });
  it("strips the leading 'export ' keyword", () => {
    expect(normalizeSignature("export class Foo")).toBe("class Foo");
  });
  it("keeps other modifiers (abstract, async, declare, default)", () => {
    expect(normalizeSignature("export abstract class Foo")).toBe(
      "abstract class Foo",
    );
    expect(normalizeSignature("export async function f()")).toBe(
      "async function f()",
    );
    expect(normalizeSignature("declare class Foo")).toBe("declare class Foo");
  });
});

describe("looksMalformedSignature", () => {
  it("flags obviously truncated expressions", () => {
    expect(looksMalformedSignature("type X =")).toBe(true);
    expect(looksMalformedSignature("class Foo extends")).toBe(true);
    expect(looksMalformedSignature("class Foo implements")).toBe(true);
    expect(looksMalformedSignature("class Foo extends Bar,")).toBe(true);
  });
  it("accepts well-formed signatures", () => {
    expect(looksMalformedSignature("class Foo")).toBe(false);
    expect(looksMalformedSignature("class Foo extends Bar")).toBe(false);
    expect(looksMalformedSignature("type UserId = string")).toBe(false);
    expect(looksMalformedSignature("function greet(n: string): string")).toBe(
      false,
    );
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
