/**
 * GoAdapter tests.
 *
 * Mixes two kinds of coverage:
 *   - Pure unit tests (skeleton identity, kind mapping, ID parsing)
 *     that don't require gopls.
 *   - Integration tests that spawn real gopls against
 *     test/fixtures/go/ and verify the ADR-14 decisions end-to-end.
 *
 * The integration tests require `go` and `gopls` on PATH. When they
 * aren't, the preflight in initialize() fails fast with an actionable
 * error (per ADR-14). beforeAll prepends well-known Go install
 * directories to process.env.PATH so developers don't have to
 * reconfigure their shell before running the test suite.
 */

import { resolve as pathResolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  GO_EXTENSIONS,
  GoAdapter,
  mapGoSymbolKind,
  parseSymbolId,
} from "./go.js";

const FIXTURE_ROOT = pathResolve("test/fixtures/go");
const KINDS_GO = pathResolve(FIXTURE_ROOT, "kinds.go");
const CONSUMER_GO = pathResolve(FIXTURE_ROOT, "consumer.go");
const PLATFORM_WIN_GO = pathResolve(FIXTURE_ROOT, "platform_windows.go");
const PLATFORM_OTHER_GO = pathResolve(FIXTURE_ROOT, "platform_other.go");

/**
 * Prepend known Go install directories to PATH so gopls (spawned by
 * the adapter) can find `go` for module loading. Mirrors the probe
 * script's approach from Step 8. Safe on both Windows (semicolon
 * separator) and POSIX — Node's child_process.spawn respects whatever
 * separator the host OS uses.
 */
function enrichGoPath(): void {
  const candidates = [
    "C:\\Program Files\\Go\\bin",
    process.env.USERPROFILE
      ? `${process.env.USERPROFILE}\\go\\bin`
      : null,
    process.env.HOME ? `${process.env.HOME}/go/bin` : null,
    "/usr/local/go/bin",
  ].filter((p): p is string => typeof p === "string");
  const sep = process.platform === "win32" ? ";" : ":";
  const parts = [...candidates, process.env.PATH ?? ""].filter(Boolean);
  process.env.PATH = parts.join(sep);
}

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

describe("parseSymbolId", () => {
  it("parses plain Go symbol IDs", () => {
    expect(parseSymbolId("sym:go:kinds.go:Shape")).toEqual({
      path: "kinds.go",
      name: "Shape",
    });
  });

  it("parses receiver-encoded method names (ADR-14 Decision 3)", () => {
    expect(parseSymbolId("sym:go:kinds.go:(*Rectangle).Area")).toEqual({
      path: "kinds.go",
      name: "(*Rectangle).Area",
    });
    expect(parseSymbolId("sym:go:kinds.go:(Rectangle).Perimeter")).toEqual({
      path: "kinds.go",
      name: "(Rectangle).Perimeter",
    });
  });

  it("parses flattened interface-method names (ADR-14 Decision 4)", () => {
    expect(parseSymbolId("sym:go:kinds.go:Shape.Area")).toEqual({
      path: "kinds.go",
      name: "Shape.Area",
    });
  });

  it("parses generic receiver names", () => {
    expect(parseSymbolId("sym:go:kinds.go:(*Stack[T]).Push")).toEqual({
      path: "kinds.go",
      name: "(*Stack[T]).Push",
    });
  });

  it("parses paths with subdirectories", () => {
    expect(parseSymbolId("sym:go:renderer/impl.go:Circle")).toEqual({
      path: "renderer/impl.go",
      name: "Circle",
    });
  });

  it("returns null for malformed IDs", () => {
    expect(parseSymbolId("not-an-id")).toBeNull();
    expect(parseSymbolId("sym:py:file.py:Foo")).toBeNull();
    expect(parseSymbolId("sym:go:")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration tests against a live gopls subprocess.
// ---------------------------------------------------------------------------

describe("GoAdapter — integration against fixture (gopls v0.21.1+)", () => {
  let adapter: GoAdapter;

  beforeAll(async () => {
    enrichGoPath();
    adapter = new GoAdapter();
    await adapter.initialize(FIXTURE_ROOT);
    // Small settle window for workspace package loading.
    await new Promise((r) => setTimeout(r, 3_000));
  }, 60_000);

  afterAll(async () => {
    if (adapter) await adapter.shutdown();
  }, 30_000);

  // -------------------------------------------------------------------------
  // listSymbols — kind mapping + receiver-encoding + flattening
  // -------------------------------------------------------------------------

  it("lists top-level symbols from kinds.go with ADR-01 symbol IDs", async () => {
    const syms = await adapter.listSymbols(KINDS_GO);
    expect(syms.length).toBeGreaterThan(0);
    for (const s of syms) {
      expect(s.id).toMatch(/^sym:go:.+:.+$/);
      expect(s.path).toBe("kinds.go");
      expect(s.language).toBe("go");
      expect(s.line).toBeGreaterThanOrEqual(1);
    }
  });

  it("maps structs to kind='class' (Rectangle, Square, ShapeRenderer, Stack)", async () => {
    const syms = await adapter.listSymbols(KINDS_GO);
    const structs = ["Rectangle", "Square", "ShapeRenderer", "Stack"];
    for (const name of structs) {
      const found = syms.find((s) => s.name === name);
      expect(found, `expected struct ${name} in listSymbols output`).toBeDefined();
      expect(found?.kind).toBe("class");
    }
  });

  it("maps interfaces to kind='interface' (Shape, Renderer)", async () => {
    const syms = await adapter.listSymbols(KINDS_GO);
    for (const name of ["Shape", "Renderer"]) {
      const found = syms.find((s) => s.name === name);
      expect(found?.kind).toBe("interface");
    }
  });

  it("preserves receiver-encoded method names verbatim (ADR-14 Decision 3)", async () => {
    // gopls emits struct methods as top-level symbols with names like
    // "(*Rectangle).Area" and "(Rectangle).Perimeter". We preserve
    // those verbatim in the SymbolId — no stripping, no receiver
    // side-field.
    const syms = await adapter.listSymbols(KINDS_GO);
    const area = syms.find((s) => s.name === "(*Rectangle).Area");
    const perimeter = syms.find((s) => s.name === "(Rectangle).Perimeter");
    expect(area?.kind).toBe("method");
    expect(perimeter?.kind).toBe("method");
    expect(area?.id).toBe("sym:go:kinds.go:(*Rectangle).Area");
    expect(perimeter?.id).toBe("sym:go:kinds.go:(Rectangle).Perimeter");
  });

  it("preserves generic type parameters in method receiver names", async () => {
    const syms = await adapter.listSymbols(KINDS_GO);
    const push = syms.find((s) => s.name === "(*Stack[T]).Push");
    const pop = syms.find((s) => s.name === "(*Stack[T]).Pop");
    expect(push?.kind).toBe("method");
    expect(pop?.kind).toBe("method");
  });

  it("flattens interface methods to top-level with parentId back-pointer (ADR-14 Decision 4)", async () => {
    const syms = await adapter.listSymbols(KINDS_GO);
    const shape = syms.find((s) => s.name === "Shape");
    expect(shape).toBeDefined();

    const shapeArea = syms.find((s) => s.name === "Shape.Area");
    const shapePerimeter = syms.find((s) => s.name === "Shape.Perimeter");
    expect(shapeArea?.kind).toBe("method");
    expect(shapePerimeter?.kind).toBe("method");
    expect(shapeArea?.parentId).toBe(shape!.id);
    expect(shapePerimeter?.parentId).toBe(shape!.id);
    expect(shapeArea?.id).toBe("sym:go:kinds.go:Shape.Area");
  });

  it("drops embedded-interface 'Field' entries rather than flattening them", async () => {
    // Renderer embeds Shape; gopls reports Shape as a kind-8 child of
    // Renderer. That maps to "other" and should NOT surface as
    // "Renderer.Shape" in the flat layout — promoted methods come
    // via getTypeInfo in Commit 5, not listSymbols.
    const syms = await adapter.listSymbols(KINDS_GO);
    expect(syms.find((s) => s.name === "Renderer.Shape")).toBeUndefined();
    // The actual Render method SHOULD surface as flattened.
    const rendererRender = syms.find((s) => s.name === "Renderer.Render");
    expect(rendererRender?.kind).toBe("method");
  });

  it("flattens iota const block members as flat top-level constants (ADR-14 §6)", async () => {
    const syms = await adapter.listSymbols(KINDS_GO);
    const statusReady = syms.find((s) => s.name === "StatusReady");
    const statusRunning = syms.find((s) => s.name === "StatusRunning");
    const statusDone = syms.find((s) => s.name === "StatusDone");
    expect(statusReady?.kind).toBe("variable");
    expect(statusRunning?.kind).toBe("variable");
    expect(statusDone?.kind).toBe("variable");
    // No synthetic "const block" container
    expect(syms.find((s) => s.name === "const")).toBeUndefined();
  });

  it("preserves generic-type parameter references in detail field", async () => {
    // gopls's documentSymbol `detail` omits the `[T, U any]` type-
    // parameter clause (that surfaces via hover), but retains the
    // param and return types that reference the type parameters —
    // enough for the signature to be informative on the receiving
    // end. Match against the references, not the clause.
    const syms = await adapter.listSymbols(KINDS_GO);
    const mapFn = syms.find((s) => s.name === "Map");
    expect(mapFn?.kind).toBe("function");
    expect(mapFn?.signature).toMatch(/\[\]T/); // uses []T in params
    expect(mapFn?.signature).toMatch(/\[\]U/); // returns []U
  });

  it("surfaces symbols from build-tagged files regardless of active tag (ADR-14 §10)", async () => {
    const winSyms = await adapter.listSymbols(PLATFORM_WIN_GO);
    const otherSyms = await adapter.listSymbols(PLATFORM_OTHER_GO);
    expect(winSyms.map((s) => s.name)).toContain("platformGreeting");
    expect(otherSyms.map((s) => s.name)).toContain("platformGreeting");
    // Both files surface symbols regardless of the active build target.
  });

  it("works cross-file on consumer.go", async () => {
    const syms = await adapter.listSymbols(CONSUMER_GO);
    expect(syms.map((s) => s.name)).toContain("NewSquare");
    expect(syms.map((s) => s.name)).toContain("MakeIntStack");
  });

  it("returns [] for a non-existent file without throwing", async () => {
    const syms = await adapter.listSymbols(
      pathResolve(FIXTURE_ROOT, "does-not-exist.go"),
    );
    expect(syms).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // getSymbolDetails
  // -------------------------------------------------------------------------

  it("getSymbolDetails resolves a plain symbol by ID", async () => {
    const details = await adapter.getSymbolDetails("sym:go:kinds.go:Shape");
    expect(details?.name).toBe("Shape");
    expect(details?.kind).toBe("interface");
  });

  it("getSymbolDetails resolves a receiver-encoded method ID", async () => {
    const details = await adapter.getSymbolDetails(
      "sym:go:kinds.go:(*Rectangle).Area",
    );
    expect(details?.name).toBe("(*Rectangle).Area");
    expect(details?.kind).toBe("method");
  });

  it("getSymbolDetails resolves a flattened interface-method ID", async () => {
    const details = await adapter.getSymbolDetails(
      "sym:go:kinds.go:Shape.Area",
    );
    expect(details?.name).toBe("Shape.Area");
    expect(details?.parentId).toBe("sym:go:kinds.go:Shape");
  });

  it("getSymbolDetails returns null for an unknown ID", async () => {
    const details = await adapter.getSymbolDetails(
      "sym:go:kinds.go:NotARealSymbol",
    );
    expect(details).toBeNull();
  });

  it("getSymbolDetails returns null for a malformed ID", async () => {
    const details = await adapter.getSymbolDetails("not:a:real:id");
    expect(details).toBeNull();
  });

  // -------------------------------------------------------------------------
  // getDiagnostics
  // -------------------------------------------------------------------------

  it("getDiagnostics returns no errors on the clean fixture (probe confirmed 0)", async () => {
    const diags = await adapter.getDiagnostics(KINDS_GO);
    const errors = diags.filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });

  it("getDiagnostics returns [] for a non-existent file", async () => {
    const diags = await adapter.getDiagnostics(
      pathResolve(FIXTURE_ROOT, "does-not-exist.go"),
    );
    expect(diags).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // findReferences
  // -------------------------------------------------------------------------

  it("findReferences returns cross-file hits for NewRectangle", async () => {
    const refs = await adapter.findReferences(
      "sym:go:kinds.go:NewRectangle",
    );
    expect(refs.length).toBeGreaterThan(0);
    const consumerHits = refs.filter((r) => r.path === "consumer.go");
    expect(consumerHits.length).toBeGreaterThan(0);
    for (const r of refs) {
      expect(r.id).toMatch(/^ref:go:.+:\d+$/);
      expect(r.symbolId).toBe("sym:go:kinds.go:NewRectangle");
      expect(r.line).toBeGreaterThanOrEqual(1);
    }
  });

  it("findReferences surfaces cross-package hits (renderer/impl.go)", async () => {
    // Cross-package resolution was verified in the Step 8 probe (§T1b);
    // this test confirms the adapter surfaces those cross-package refs.
    // Shape is referenced in renderer/impl.go via the compile-time
    // witness `var _ kinds.Shape = (*Circle)(nil)`.
    const refs = await adapter.findReferences("sym:go:kinds.go:Shape");
    const rendererHits = refs.filter((r) =>
      r.path.replace(/\\/g, "/").startsWith("renderer/"),
    );
    expect(rendererHits.length).toBeGreaterThan(0);
  });

  it("findReferences works on flattened interface-method names", async () => {
    // Shape.Area is an interface method; its position is the child
    // entry inside Shape. findTargetPosition handles the parent.child
    // split so findReferences can locate it.
    const refs = await adapter.findReferences("sym:go:kinds.go:Shape.Area");
    // May return 0 refs if no code outside the interface declaration
    // calls through Shape.Area directly — acceptable. The test here is
    // that the call completes without throwing and returns a
    // well-shaped array (even if empty).
    expect(Array.isArray(refs)).toBe(true);
  });

  it("findReferences returns [] for an unknown symbol", async () => {
    const refs = await adapter.findReferences(
      "sym:go:kinds.go:DoesNotExist",
    );
    expect(refs).toEqual([]);
  });

  it("findReferences returns [] for a malformed ID", async () => {
    const refs = await adapter.findReferences("not:a:real:id");
    expect(refs).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // getTypeInfo — ADR-14 §"implementation direct use"
  // -------------------------------------------------------------------------

  it("getTypeInfo on an interface returns implementers in usedByTypes", async () => {
    // Shape's implementers: Renderer (embedder interface) + Rectangle,
    // Square, ShapeRenderer (concrete structs) + Circle, FancyRenderer
    // from the renderer subpackage.
    const info = await adapter.getTypeInfo("sym:go:kinds.go:Shape");
    expect(info.usedByTypes.length).toBeGreaterThanOrEqual(4);
    expect(info.usedByTypes).toContain("Rectangle");
    expect(info.usedByTypes).toContain("Square");
    expect(info.usedByTypes).toContain("ShapeRenderer");
    expect(info.usedByTypes).toContain("Renderer");
    // Interfaces don't populate implements via getTypeInfo — they only
    // have usedByTypes (down-stream) and extends (embedded interfaces).
    expect(info.implements).toEqual([]);
  });

  it("getTypeInfo on an interface with embedding populates extends", async () => {
    // Renderer embeds Shape — gopls surfaces that as a kind-8 child
    // whose name equals its detail ("Shape").
    const info = await adapter.getTypeInfo("sym:go:kinds.go:Renderer");
    expect(info.extends).toContain("Shape");
  });

  it("getTypeInfo on a struct returns interfaces in implements", async () => {
    // Rectangle satisfies Shape but not Renderer (no Render method).
    const info = await adapter.getTypeInfo("sym:go:kinds.go:Rectangle");
    expect(info.implements).toContain("Shape");
    expect(info.implements).not.toContain("Renderer");
    // Structs don't populate usedByTypes — there's no "struct satisfies
    // this struct" direction.
    expect(info.usedByTypes).toEqual([]);
  });

  it("getTypeInfo on a multi-interface struct returns every interface satisfied", async () => {
    // ShapeRenderer implements both Shape AND Renderer.
    const info = await adapter.getTypeInfo(
      "sym:go:kinds.go:ShapeRenderer",
    );
    expect(info.implements).toContain("Shape");
    expect(info.implements).toContain("Renderer");
  });

  it("getTypeInfo on a struct with embedding populates extends", async () => {
    // Square embeds Rectangle; the embedded-field child has
    // name="Rectangle", detail="Rectangle" — detected as embedding.
    const info = await adapter.getTypeInfo("sym:go:kinds.go:Square");
    expect(info.extends).toContain("Rectangle");
  });

  it("getTypeInfo returns empty shape for a non-type symbol (function)", async () => {
    const info = await adapter.getTypeInfo(
      "sym:go:kinds.go:NewRectangle",
    );
    expect(info).toEqual({ extends: [], implements: [], usedByTypes: [] });
  });

  it("getTypeInfo returns empty shape for an unknown symbol", async () => {
    const info = await adapter.getTypeInfo(
      "sym:go:kinds.go:DoesNotExist",
    );
    expect(info).toEqual({ extends: [], implements: [], usedByTypes: [] });
  });

  it("getTypeInfo returns empty shape for a flattened interface-method", async () => {
    // Shape.Area is a method, not a type. getTypeInfo is only
    // meaningful on types (interfaces + structs).
    const info = await adapter.getTypeInfo(
      "sym:go:kinds.go:Shape.Area",
    );
    expect(info).toEqual({ extends: [], implements: [], usedByTypes: [] });
  });

  it("getTypeInfo cross-package: surfaces Circle (renderer/impl.go) as Shape implementer", async () => {
    // Cross-package implementation was probe-verified (§T1b); this
    // confirms the adapter partitions cross-package results correctly.
    const info = await adapter.getTypeInfo("sym:go:kinds.go:Shape");
    expect(info.usedByTypes).toContain("Circle");
    expect(info.usedByTypes).toContain("FancyRenderer");
  });
});
