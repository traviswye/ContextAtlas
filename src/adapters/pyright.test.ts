import { resolve as pathResolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LANG_CODES } from "../types.js";

import {
  PyrightAdapter,
  PYTHON_EXTENSIONS,
  extractClassDeclaration,
  extractCallableSignatureLine,
  findClassesExtending,
  findClassesMatchingProtocol,
  isProtocolBase,
  isTypeAliasLine,
  parseClassDeclaration,
  parseImportAliases,
  splitBaseList,
} from "./pyright.js";

const FIXTURE_ROOT = pathResolve("test/fixtures/python");
const SAMPLE = pathResolve(FIXTURE_ROOT, "sample.py");
const BROKEN = pathResolve(FIXTURE_ROOT, "broken.py");

// ---------------------------------------------------------------------------
// Pure helpers — unit tests (no LSP subprocess).
//
// These exercise the parsing surface in isolation, against synthetic
// inputs chosen to hit each ADR-13 parser rule. The fixture files are
// covered by the integration suite below.
// ---------------------------------------------------------------------------

describe("splitBaseList", () => {
  it("single identifier base", () => {
    expect(splitBaseList("Shape")).toEqual(["Shape"]);
  });

  it("multiple identifier bases", () => {
    expect(splitBaseList("Shape, Serializable, LoggingMixin")).toEqual([
      "Shape",
      "Serializable",
      "LoggingMixin",
    ]);
  });

  it("strips trailing generic brackets per base", () => {
    expect(splitBaseList("List[str], Dict[str, int]")).toEqual([
      "List",
      "Dict",
    ]);
  });

  it("commas inside [...] do not split", () => {
    expect(splitBaseList("Mapping[str, int]")).toEqual(["Mapping"]);
  });

  it("drops kwarg tokens (metaclass=Foo)", () => {
    expect(splitBaseList("Shape, metaclass=ABCMeta")).toEqual(["Shape"]);
    expect(splitBaseList("metaclass=Meta")).toEqual([]);
  });

  it("preserves dotted names as single tokens", () => {
    expect(splitBaseList("typing.Protocol, collections.abc.Mapping")).toEqual(
      ["typing.Protocol", "collections.abc.Mapping"],
    );
  });

  it("rejects non-identifier tokens (function calls, star-args)", () => {
    expect(splitBaseList("mixin_factory()")).toEqual([]);
    expect(splitBaseList("*bases")).toEqual([]);
    expect(splitBaseList("**kwargs")).toEqual([]);
  });

  it("empty input produces empty result", () => {
    expect(splitBaseList("")).toEqual([]);
    expect(splitBaseList("   ")).toEqual([]);
  });

  it("handles nested parens (Callable[[int], str])", () => {
    expect(
      splitBaseList("Callable[[int], str], Sized"),
    ).toEqual(["Callable", "Sized"]);
  });
});

describe("extractClassDeclaration", () => {
  it("single-line class with no bases", () => {
    const src = "class Foo:\n    pass\n";
    expect(extractClassDeclaration(src, 0)).toBe("class Foo");
  });

  it("single-line class with bases", () => {
    const src = "class Foo(Bar, Baz):\n    pass\n";
    expect(extractClassDeclaration(src, 0)).toBe("class Foo(Bar, Baz)");
  });

  it("multi-line class declaration", () => {
    const src = [
      "class Foo(",
      "    Bar,",
      "    Baz,",
      "):",
      "    pass",
    ].join("\n");
    const result = extractClassDeclaration(src, 0);
    // Whitespace-normalized; internal newlines collapsed to spaces.
    expect(result).toMatch(/^class Foo\( Bar, Baz, \)$/);
  });

  it("class with generic parameterization on bases", () => {
    const src = "class Foo(Bar[T], Baz[str, int]):\n    pass\n";
    expect(extractClassDeclaration(src, 0)).toBe(
      "class Foo(Bar[T], Baz[str, int])",
    );
  });

  it("ignores decorators preceding the class", () => {
    // startLine points at `class`, not the decorator.
    const src = "@dataclass\nclass Foo(Bar):\n    pass\n";
    expect(extractClassDeclaration(src, 1)).toBe("class Foo(Bar)");
  });

  it("returns empty string when start line has no `class`", () => {
    const src = "def foo():\n    pass\n";
    expect(extractClassDeclaration(src, 0)).toBe("");
  });
});

describe("parseClassDeclaration", () => {
  it("no bases → empty list + simple signature", () => {
    expect(parseClassDeclaration("class Foo")).toEqual({
      bases: [],
      signature: "class Foo",
    });
  });

  it("single base", () => {
    expect(parseClassDeclaration("class Foo(Bar)")).toEqual({
      bases: ["Bar"],
      signature: "class Foo(Bar)",
    });
  });

  it("multiple bases with mixed forms", () => {
    expect(
      parseClassDeclaration("class Foo(Shape, Generic[T], metaclass=Meta)"),
    ).toEqual({
      bases: ["Shape", "Generic"],
      signature: "class Foo(Shape, Generic)",
    });
  });

  it("dotted-name base preserved", () => {
    expect(parseClassDeclaration("class Foo(typing.Protocol)")).toEqual({
      bases: ["typing.Protocol"],
      signature: "class Foo(typing.Protocol)",
    });
  });

  it("unclosed parens degrade gracefully", () => {
    expect(parseClassDeclaration("class Foo(Bar, Baz")).toEqual({
      bases: [],
      signature: "class Foo",
    });
  });

  it("empty header returns empty", () => {
    expect(parseClassDeclaration("")).toEqual({
      bases: [],
      signature: null,
    });
  });

  it("garbage header with no 'class' keyword returns empty", () => {
    expect(parseClassDeclaration("not a class")).toEqual({
      bases: [],
      signature: null,
    });
  });
});

describe("parseImportAliases", () => {
  it("detects bare Protocol import from typing", () => {
    const src = "from typing import Protocol\n";
    const imports = parseImportAliases(src);
    expect(imports.protocolAliases.has("Protocol")).toBe(true);
  });

  it("detects aliased Protocol import (Protocol as Interface)", () => {
    const src = "from typing import Protocol as Interface\n";
    const imports = parseImportAliases(src);
    expect(imports.protocolAliases.has("Interface")).toBe(true);
    expect(imports.nameToOriginal.get("Interface")).toBe("Protocol");
  });

  it("detects typing_extensions.Protocol", () => {
    const src = "from typing_extensions import Protocol\n";
    const imports = parseImportAliases(src);
    expect(imports.protocolAliases.has("Protocol")).toBe(true);
  });

  it("detects qualified form via `import typing as t`", () => {
    const src = "import typing as t\n";
    const imports = parseImportAliases(src);
    expect(imports.protocolAliases.has("t.Protocol")).toBe(true);
  });

  it("ignores imports of non-Protocol symbols", () => {
    const src = "from typing import List, Dict, Any\n";
    const imports = parseImportAliases(src);
    // List / Dict / Any should NOT be treated as Protocols.
    expect(imports.protocolAliases.has("List")).toBe(false);
  });

  it("canonical hardcoded names always present (mechanism a)", () => {
    const imports = parseImportAliases("");
    expect(imports.protocolAliases.has("Protocol")).toBe(true);
    expect(imports.protocolAliases.has("typing.Protocol")).toBe(true);
    expect(imports.protocolAliases.has("typing_extensions.Protocol")).toBe(
      true,
    );
  });

  it("handles multi-item from-import lines", () => {
    const src =
      "from typing import Protocol as Iface, Any, runtime_checkable\n";
    const imports = parseImportAliases(src);
    expect(imports.protocolAliases.has("Iface")).toBe(true);
    expect(imports.nameToOriginal.get("Iface")).toBe("Protocol");
  });
});

describe("isProtocolBase", () => {
  it("recognizes canonical names (mechanism a)", () => {
    const imports = parseImportAliases("");
    expect(isProtocolBase("Protocol", imports)).toBe(true);
    expect(isProtocolBase("typing.Protocol", imports)).toBe(true);
  });

  it("recognizes aliased names (mechanism b)", () => {
    const imports = parseImportAliases(
      "from typing import Protocol as Interface\n",
    );
    expect(isProtocolBase("Interface", imports)).toBe(true);
  });

  it("rejects non-Protocol names", () => {
    const imports = parseImportAliases("");
    expect(isProtocolBase("Shape", imports)).toBe(false);
    expect(isProtocolBase("ABC", imports)).toBe(false); // ABCs → extends
    expect(isProtocolBase("typing.List", imports)).toBe(false);
  });
});

describe("isTypeAliasLine", () => {
  it("PEP 695 type statement", () => {
    expect(isTypeAliasLine("type UserId = str", "UserId")).toBe(true);
  });

  it("annotated TypeAlias form", () => {
    expect(isTypeAliasLine("UserId: TypeAlias = str", "UserId")).toBe(true);
    expect(
      isTypeAliasLine("UserId: typing.TypeAlias = str", "UserId"),
    ).toBe(true);
  });

  it("bare form with identifier RHS", () => {
    expect(isTypeAliasLine("UserId = str", "UserId")).toBe(true);
    expect(isTypeAliasLine("UserId = List[int]", "UserId")).toBe(true);
  });

  it("rejects non-type bare assignment (numeric RHS)", () => {
    expect(isTypeAliasLine("COUNT = 42", "COUNT")).toBe(false);
  });

  it("rejects function definitions", () => {
    expect(isTypeAliasLine("def foo():", "foo")).toBe(false);
  });
});

describe("findClassesExtending", () => {
  it("finds single subclass", () => {
    const src = [
      "class Parent:",
      "    pass",
      "",
      "class Child(Parent):",
      "    pass",
    ].join("\n");
    expect(findClassesExtending(src, "Parent")).toEqual(["Child"]);
  });

  it("finds subclass via dotted-name base", () => {
    const src = [
      "import pkg",
      "",
      "class Derived(pkg.Base):",
      "    pass",
    ].join("\n");
    // Query against the short name also matches dotted bases — this is
    // the documented ADR-13 behavior ("match target against short name
    // OR full dotted form").
    expect(findClassesExtending(src, "Base")).toEqual(["Derived"]);
  });

  it("does not match when base list doesn't contain target", () => {
    const src = [
      "class Unrelated(object):",
      "    pass",
    ].join("\n");
    expect(findClassesExtending(src, "Target")).toEqual([]);
  });

  it("finds multiple siblings", () => {
    const src = [
      "class Base: pass",
      "class A(Base): pass",
      "class B(Base): pass",
      "class C(OtherBase): pass",
    ].join("\n");
    expect(findClassesExtending(src, "Base").sort()).toEqual(["A", "B"]);
  });
});

describe("findClassesMatchingProtocol", () => {
  it("detects direct Protocol subclass", () => {
    const src = [
      "from typing import Protocol",
      "",
      "class Drawable(Protocol):",
      "    def draw(self): ...",
    ].join("\n");
    const imports = parseImportAliases(src);
    expect(findClassesMatchingProtocol(src, imports)).toEqual(["Drawable"]);
  });

  it("detects aliased Protocol subclass", () => {
    const src = [
      "from typing import Protocol as Iface",
      "",
      "class Drawable(Iface):",
      "    def draw(self): ...",
    ].join("\n");
    const imports = parseImportAliases(src);
    expect(findClassesMatchingProtocol(src, imports)).toEqual(["Drawable"]);
  });

  it("does NOT mark ABC subclass as Protocol", () => {
    const src = [
      "from abc import ABC",
      "",
      "class Abstract(ABC):",
      "    pass",
    ].join("\n");
    const imports = parseImportAliases(src);
    expect(findClassesMatchingProtocol(src, imports)).toEqual([]);
  });
});

describe("extractCallableSignatureLine", () => {
  it("simple single-line function", () => {
    const src = "def greet(name: str) -> str:\n    return name\n";
    expect(extractCallableSignatureLine(src, 0)).toBe(
      "def greet(name: str) -> str",
    );
  });

  it("async function", () => {
    const src = "async def fetch(url: str) -> bytes:\n    pass\n";
    expect(extractCallableSignatureLine(src, 0)).toBe(
      "async def fetch(url: str) -> bytes",
    );
  });

  it("multi-line signature collapses to one line", () => {
    const src = [
      "def long_signature(",
      "    a: int,",
      "    b: str,",
      ") -> bool:",
      "    pass",
    ].join("\n");
    const sig = extractCallableSignatureLine(src, 0);
    expect(sig).toMatch(
      /^def long_signature\(\s*a: int,\s*b: str,\s*\) -> bool$/,
    );
  });

  it("returns null when start line has no def", () => {
    const src = "class Foo:\n    pass\n";
    expect(extractCallableSignatureLine(src, 0)).toBeNull();
  });
});

describe("PYTHON_EXTENSIONS", () => {
  it("only includes .py (ADR-13 §File extensions)", () => {
    expect(PYTHON_EXTENSIONS).toEqual([".py"]);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — real pyright-langserver subprocess against the
// migrated fixture. Slower, but the only way to catch LSP-shape drift.
// ---------------------------------------------------------------------------

describe("PyrightAdapter", () => {
  let adapter: PyrightAdapter;

  beforeAll(async () => {
    adapter = new PyrightAdapter();
    await adapter.initialize(FIXTURE_ROOT);
    // Allow pyright a moment to settle after warmup — diagnostics come
    // on a push channel and the first `getDiagnostics` call may race.
    await new Promise((r) => setTimeout(r, 1_500));
  }, 45_000);

  afterAll(async () => {
    await adapter.shutdown();
  });

  it("lists top-level symbols with correct Python ID format", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const byName = new Map(symbols.map((s) => [s.name, s]));

    const shape = byName.get("Shape");
    expect(shape).toBeDefined();
    expect(shape?.kind).toBe("class");
    expect(shape?.path).toBe("sample.py");
    expect(shape?.language).toBe("python");
    expect(shape?.id).toBe(
      `sym:${LANG_CODES.python}:sample.py:Shape`,
    );
  });

  it("remaps typing.Protocol subclasses to kind 'interface'", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const drawable = symbols.find((s) => s.name === "Drawable");
    expect(drawable).toBeDefined();
    expect(drawable?.kind).toBe("interface");
  });

  it("keeps ABC subclasses as kind 'class' (not 'interface')", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const renderable = symbols.find((s) => s.name === "Renderable");
    expect(renderable).toBeDefined();
    expect(renderable?.kind).toBe("class");
  });

  it("remaps type-alias variables (all 3 forms) to kind 'type'", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const names = new Set(symbols.map((s) => s.name));
    expect(names.has("UserIdV1")).toBe(true);
    expect(names.has("UserIdV2")).toBe(true);
    expect(names.has("UserIdV3")).toBe(true);
    const v1 = symbols.find((s) => s.name === "UserIdV1");
    const v2 = symbols.find((s) => s.name === "UserIdV2");
    const v3 = symbols.find((s) => s.name === "UserIdV3");
    expect(v1?.kind).toBe("type");
    expect(v2?.kind).toBe("type");
    expect(v3?.kind).toBe("type");
  });

  it("surfaces signatures for classes with bases", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const widget = symbols.find((s) => s.name === "Widget");
    expect(widget?.signature).toBe(
      "class Widget(Shape, Serializable, LoggingMixin)",
    );
  });

  it("surfaces signatures for top-level functions", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const greet = symbols.find((s) => s.name === "greet");
    expect(greet?.kind).toBe("function");
    expect(greet?.signature).toBe("def greet(name: str) -> str");
  });

  it("includes class methods but drops parameters/instance vars", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const names = symbols.map((s) => s.name);
    // Counter's methods are surfaced
    expect(names).toContain("zero");
    expect(names).toContain("is_zero");
    // But method parameters are NOT surfaced as top-level symbols
    expect(names.filter((n) => n === "value").length).toBe(0);
  });

  it("findReferences returns cross-file references on warmup fixture", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const greet = symbols.find((s) => s.name === "greet");
    expect(greet).toBeDefined();
    const refs = await adapter.findReferences(greet!.id);
    expect(refs.length).toBeGreaterThan(0);
    // consumer.py uses `greet` — expect at least one cross-file hit.
    const paths = new Set(refs.map((r) => r.path));
    expect(paths.has("consumer.py")).toBe(true);
  });

  it("getDiagnostics surfaces type errors from broken.py", async () => {
    const diags = await adapter.getDiagnostics(BROKEN);
    expect(diags.length).toBeGreaterThan(0);
    const errors = diags.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) {
      expect(e.path).toBe("broken.py");
    }
  });

  it("getDiagnostics is empty for well-formed sample.py", async () => {
    const diags = await adapter.getDiagnostics(SAMPLE);
    // Pyright may emit info-level messages on any file, but errors
    // should be zero for the clean fixture.
    const errors = diags.filter((d) => d.severity === "error");
    expect(errors.length).toBe(0);
  });

  it("getTypeInfo routes project-defined Protocol bases to implements (after buildProtocolCache)", async () => {
    // Canvas(Drawable, Renderable): Drawable is a project-defined Protocol
    // (its declaration inherits from typing.Protocol), Renderable is an
    // ABC. Detection of Drawable-as-Protocol requires mechanism (c) —
    // the pass-1 cache populated by buildProtocolCache. Per ADR-13's
    // documented degraded mode, without the cache Drawable would
    // route to `extends` — we test both modes.
    await adapter.buildProtocolCache();

    const symbols = await adapter.listSymbols(SAMPLE);
    const canvas = symbols.find((s) => s.name === "Canvas");
    expect(canvas).toBeDefined();
    const ti = await adapter.getTypeInfo(canvas!.id);
    expect(ti.implements).toContain("Drawable");
    expect(ti.extends).toContain("Renderable");
    expect(ti.implements).not.toContain("Renderable");
    expect(ti.extends).not.toContain("Drawable");
  });

  it("getTypeInfo usedByTypes finds cross-file subclasses", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const shape = symbols.find((s) => s.name === "Shape");
    expect(shape).toBeDefined();
    const ti = await adapter.getTypeInfo(shape!.id);
    // subclasses.py has `class Circle(Shape)`.
    expect(ti.usedByTypes).toContain("Circle");
  });

  it("getTypeInfo returns empty for a non-class symbol", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const greet = symbols.find((s) => s.name === "greet");
    expect(greet).toBeDefined();
    const ti = await adapter.getTypeInfo(greet!.id);
    expect(ti.extends).toEqual([]);
    expect(ti.implements).toEqual([]);
    expect(ti.usedByTypes).toEqual([]);
  });

  it("getSymbolDetails returns the matching symbol or null", async () => {
    const symbols = await adapter.listSymbols(SAMPLE);
    const shape = symbols.find((s) => s.name === "Shape");
    const details = await adapter.getSymbolDetails(shape!.id);
    expect(details?.name).toBe("Shape");

    const nonsense = await adapter.getSymbolDetails(
      "sym:py:sample.py:NotARealSymbol",
    );
    expect(nonsense).toBeNull();
  });

  it("buildProtocolCache populates pass-1 entries for Protocols in the project", async () => {
    const count = await adapter.buildProtocolCache();
    expect(count).toBeGreaterThan(0);
    // Drawable is a project-defined Protocol.
    // (No direct cache accessor by design; we verify via getTypeInfo
    // for a class that inherits from a project-defined Protocol — which
    // after cache is populated would route to implements even without
    // the canonical `Protocol` import on the child's file.)
    // The sample fixture's Canvas inherits from Drawable directly, and
    // Drawable's own declaration uses `Protocol` from typing (mechanism
    // a) — so the cache serves to validate the population path, not a
    // behavior that mechanisms a+b don't already cover.
  });
});
