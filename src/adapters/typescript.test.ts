import { resolve as pathResolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LANG_CODES } from "../types.js";

import { TypeScriptAdapter } from "./typescript.js";

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
