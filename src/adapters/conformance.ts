/**
 * Shared behavioral conformance spec for LanguageAdapter implementations
 * (ADR-03).
 *
 * Each adapter's own test file imports `runConformanceSuite` and calls
 * it against its fixture directory. The shared assertions are
 * deliberately language-agnostic — they check the shape of the
 * contract (return types, happy-path/error-path discipline, lifecycle
 * behavior) rather than language-specific details (TypeScript hover
 * format, Python Protocol routing, etc.). Language-specific
 * assertions live in each adapter's own `<adapter>.test.ts`.
 *
 * Fixture requirements (must hold for both TypeScript and Python
 * fixtures feeding this suite):
 *   - `sample.{ts,py}` — at least one class, one function, one
 *     additional symbol (variable / type / anything)
 *   - `broken.{ts,py}` — deliberate type error, produces ≥1 diagnostic
 *   - `consumer.{ts,py}` — references to the class and function in
 *     sample (so findReferences returns ≥1 hit each)
 *
 * Why a callable function, not a describe block: the same test
 * scaffolding applies to each adapter but with different fixtures
 * and different expected symbol names. A function parameterized on
 * both keeps the suite composable without `.each` pyramids.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LANG_CODES, type LanguageAdapter } from "../types.js";

export interface ConformanceFixtureSpec {
  /**
   * Absolute path to the fixture root. Adapter initializes against
   * this. Must contain the files described in `files` below.
   */
  fixtureRoot: string;
  /**
   * Filenames (relative to `fixtureRoot`) for the three required
   * fixture files. Different adapters use different extensions.
   */
  files: {
    sample: string;
    broken: string;
    consumer: string;
  };
  /**
   * Names of the symbols the conformance suite probes. The fixture
   * must declare each of these in `sample`, and the conformance
   * suite assumes:
   *   - `classSymbol`: has kind === "class" OR "interface"
   *     (Python Protocol → interface is allowed)
   *   - `functionSymbol`: has kind === "function"
   *   - `referencedSymbol`: appears in `consumer` (for findReferences)
   */
  symbols: {
    classSymbol: string;
    functionSymbol: string;
    referencedSymbol: string;
  };
}

/**
 * Run the full conformance suite against a fresh adapter instance.
 *
 * Pass a factory (not an adapter) so the suite can own lifecycle —
 * initialize at beforeAll, shutdown at afterAll. This matches the
 * reality that adapters are stateful (open files, diagnostics cache)
 * and each suite run wants a clean slate.
 */
export function runConformanceSuite(
  name: string,
  makeAdapter: () => LanguageAdapter,
  spec: ConformanceFixtureSpec,
): void {
  describe(`LanguageAdapter conformance — ${name}`, () => {
    let adapter: LanguageAdapter;

    const sampleAbs = `${spec.fixtureRoot}/${spec.files.sample}`;
    const brokenAbs = `${spec.fixtureRoot}/${spec.files.broken}`;

    beforeAll(async () => {
      adapter = makeAdapter();
      await adapter.initialize(spec.fixtureRoot);
      // Small settle for any push-channel diagnostics.
      await new Promise((r) => setTimeout(r, 1_500));
    }, 60_000);

    afterAll(async () => {
      if (adapter) await adapter.shutdown();
    }, 30_000);

    // ---------------------------------------------------------------
    // Identity + shape invariants
    // ---------------------------------------------------------------

    it("advertises a language code and non-empty extensions list", () => {
      expect(adapter.language).toBeTruthy();
      expect(Array.isArray(adapter.extensions)).toBe(true);
      expect(adapter.extensions.length).toBeGreaterThan(0);
      for (const ext of adapter.extensions) {
        expect(ext.startsWith(".")).toBe(true);
      }
    });

    // ---------------------------------------------------------------
    // listSymbols
    // ---------------------------------------------------------------

    it("listSymbols returns non-empty for the sample fixture", async () => {
      const symbols = await adapter.listSymbols(sampleAbs);
      expect(symbols.length).toBeGreaterThan(0);
    });

    it("every returned symbol has the expected ID format", async () => {
      const symbols = await adapter.listSymbols(sampleAbs);
      for (const s of symbols) {
        expect(s.id).toMatch(/^sym:[a-z]+:.+:.+$/);
        expect(s.name).toBeTruthy();
        expect(s.path).toBeTruthy();
        expect(s.line).toBeGreaterThanOrEqual(1);
        expect(typeof s.kind).toBe("string");
        expect(s.language).toBe(adapter.language);
      }
    });

    it("listSymbols contains the fixture's class symbol with an accepted kind", async () => {
      const symbols = await adapter.listSymbols(sampleAbs);
      const cls = symbols.find((s) => s.name === spec.symbols.classSymbol);
      expect(cls).toBeDefined();
      // Python's Protocol→interface remap means the adapter may
      // legitimately return "interface" for what the fixture calls
      // a class symbol. Both are acceptable.
      expect(["class", "interface"]).toContain(cls?.kind);
    });

    it("listSymbols contains the fixture's function symbol with kind 'function'", async () => {
      const symbols = await adapter.listSymbols(sampleAbs);
      const fn = symbols.find((s) => s.name === spec.symbols.functionSymbol);
      expect(fn).toBeDefined();
      expect(fn?.kind).toBe("function");
    });

    it("listSymbols on a non-existent file returns empty (does not throw)", async () => {
      const bogus = `${spec.fixtureRoot}/does-not-exist${adapter.extensions[0]!}`;
      await expect(adapter.listSymbols(bogus)).resolves.toEqual([]);
    });

    // ---------------------------------------------------------------
    // getSymbolDetails
    // ---------------------------------------------------------------

    it("getSymbolDetails returns the matching symbol for a known ID", async () => {
      const symbols = await adapter.listSymbols(sampleAbs);
      const target = symbols.find(
        (s) => s.name === spec.symbols.classSymbol,
      );
      expect(target).toBeDefined();
      const details = await adapter.getSymbolDetails(target!.id);
      expect(details?.name).toBe(spec.symbols.classSymbol);
    });

    it("getSymbolDetails returns null for a made-up ID", async () => {
      const fakeId = `sym:${LANG_CODES[adapter.language]}:does-not-exist:Nothing`;
      await expect(adapter.getSymbolDetails(fakeId)).resolves.toBeNull();
    });

    // ---------------------------------------------------------------
    // findReferences
    // ---------------------------------------------------------------

    it("findReferences returns at least one cross-file hit for a referenced symbol", async () => {
      const symbols = await adapter.listSymbols(sampleAbs);
      const target = symbols.find(
        (s) => s.name === spec.symbols.referencedSymbol,
      );
      expect(target).toBeDefined();
      const refs = await adapter.findReferences(target!.id);
      expect(refs.length).toBeGreaterThan(0);
      // Each ref has the expected shape.
      for (const r of refs) {
        expect(r.id).toMatch(/^ref:[a-z]+:.+:\d+$/);
        expect(r.symbolId).toBe(target!.id);
        expect(r.path).toBeTruthy();
        expect(r.line).toBeGreaterThanOrEqual(1);
      }
      // At least one reference should be in consumer.
      const paths = new Set(refs.map((r) => r.path));
      expect(paths.has(spec.files.consumer)).toBe(true);
    });

    it("findReferences returns an empty array for a made-up ID (does not throw)", async () => {
      const fakeId = `sym:${LANG_CODES[adapter.language]}:${spec.files.sample}:NotARealSymbol`;
      await expect(adapter.findReferences(fakeId)).resolves.toEqual([]);
    });

    // ---------------------------------------------------------------
    // getDiagnostics
    // ---------------------------------------------------------------

    it("getDiagnostics surfaces errors from the broken fixture", async () => {
      const diags = await adapter.getDiagnostics(brokenAbs);
      expect(diags.length).toBeGreaterThan(0);
      const errors = diags.filter((d) => d.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
      for (const e of errors) {
        expect(e.message).toBeTruthy();
        expect(e.path).toBe(spec.files.broken);
        expect(e.line).toBeGreaterThanOrEqual(1);
      }
    });

    it("getDiagnostics returns no errors for the clean sample", async () => {
      const diags = await adapter.getDiagnostics(sampleAbs);
      const errors = diags.filter((d) => d.severity === "error");
      expect(errors.length).toBe(0);
    });

    // ---------------------------------------------------------------
    // getTypeInfo
    // ---------------------------------------------------------------

    it("getTypeInfo returns the expected shape for the class symbol", async () => {
      const symbols = await adapter.listSymbols(sampleAbs);
      const target = symbols.find(
        (s) => s.name === spec.symbols.classSymbol,
      );
      expect(target).toBeDefined();
      const ti = await adapter.getTypeInfo(target!.id);
      expect(Array.isArray(ti.extends)).toBe(true);
      expect(Array.isArray(ti.implements)).toBe(true);
      expect(Array.isArray(ti.usedByTypes)).toBe(true);
    });

    it("getTypeInfo returns the empty shape for a non-existent symbol", async () => {
      const fakeId = `sym:${LANG_CODES[adapter.language]}:${spec.files.sample}:NotARealSymbol`;
      const ti = await adapter.getTypeInfo(fakeId);
      expect(ti.extends).toEqual([]);
      expect(ti.implements).toEqual([]);
      expect(ti.usedByTypes).toEqual([]);
    });
  });
}

