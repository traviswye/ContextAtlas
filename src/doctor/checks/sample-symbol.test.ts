import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  LanguageAdapter,
  Symbol as AtlasSymbol,
  SymbolId,
} from "../../types.js";
import { findSampleSymbol } from "./sample-symbol.js";

/**
 * Stub adapter that returns canned symbols per file path. Used for
 * unit testing findSampleSymbol without spawning real LSP adapter.
 */
function stubAdapter(opts: {
  extensions: readonly string[];
  symbolsByFile?: Record<string, AtlasSymbol[]>;
  throwOnFiles?: readonly string[];
}): LanguageAdapter {
  return {
    language: "typescript",
    extensions: opts.extensions,
    async initialize() {},
    async shutdown() {},
    async listSymbols(filePath: string) {
      if (opts.throwOnFiles?.includes(filePath)) {
        throw new Error(`stub: throw on ${filePath}`);
      }
      return opts.symbolsByFile?.[filePath] ?? [];
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
  };
}

function symbol(id: SymbolId, name: string, filePath: string): AtlasSymbol {
  return {
    id,
    name,
    kind: "function",
    path: filePath,
    line: 1,
    language: "typescript",
    fileSha: "sha-stub",
  };
}

describe("findSampleSymbol", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "sample-symbol-test-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("returns null when repo has no source files matching extensions", async () => {
    const adapter = stubAdapter({ extensions: [".ts"] });
    const result = await findSampleSymbol(adapter, tmpRoot);
    expect(result).toBeNull();
  });

  it("returns null when source file exists but listSymbols returns empty", async () => {
    await writeFile(path.join(tmpRoot, "empty.ts"), "// no symbols", "utf8");
    const adapter = stubAdapter({
      extensions: [".ts"],
      symbolsByFile: { "empty.ts": [] },
    });
    const result = await findSampleSymbol(adapter, tmpRoot);
    expect(result).toBeNull();
  });

  it("returns first symbol when source file has symbols", async () => {
    await writeFile(path.join(tmpRoot, "a.ts"), "export function foo() {}", "utf8");
    const sym = symbol("sym:ts:a.ts:foo", "foo", "a.ts");
    const adapter = stubAdapter({
      extensions: [".ts"],
      symbolsByFile: { "a.ts": [sym] },
    });
    const result = await findSampleSymbol(adapter, tmpRoot);
    expect(result).not.toBeNull();
    expect(result!.file).toBe("a.ts");
    expect(result!.symbol.id).toBe("sym:ts:a.ts:foo");
  });

  it("skips node_modules and other excluded directories", async () => {
    await mkdir(path.join(tmpRoot, "node_modules"), { recursive: true });
    await writeFile(
      path.join(tmpRoot, "node_modules", "skipped.ts"),
      "export function skip() {}",
      "utf8",
    );
    await writeFile(
      path.join(tmpRoot, "real.ts"),
      "export function real() {}",
      "utf8",
    );
    const realSym = symbol("sym:ts:real.ts:real", "real", "real.ts");
    const adapter = stubAdapter({
      extensions: [".ts"],
      symbolsByFile: {
        "real.ts": [realSym],
        // node_modules path — adapter should never be called on this
      },
    });
    const result = await findSampleSymbol(adapter, tmpRoot);
    expect(result).not.toBeNull();
    expect(result!.file).toBe("real.ts");
  });

  it("walks subdirectories within depth limit", async () => {
    const subDir = path.join(tmpRoot, "src", "nested");
    await mkdir(subDir, { recursive: true });
    await writeFile(
      path.join(subDir, "deep.ts"),
      "export function deep() {}",
      "utf8",
    );
    const sym = symbol(
      "sym:ts:src/nested/deep.ts:deep",
      "deep",
      "src/nested/deep.ts",
    );
    const adapter = stubAdapter({
      extensions: [".ts"],
      symbolsByFile: { "src/nested/deep.ts": [sym] },
    });
    const result = await findSampleSymbol(adapter, tmpRoot);
    expect(result).not.toBeNull();
    expect(result!.file).toBe("src/nested/deep.ts");
  });

  it("skips files where listSymbols throws", async () => {
    await writeFile(
      path.join(tmpRoot, "broken.ts"),
      "export function broken() {}",
      "utf8",
    );
    await writeFile(
      path.join(tmpRoot, "ok.ts"),
      "export function ok() {}",
      "utf8",
    );
    const okSym = symbol("sym:ts:ok.ts:ok", "ok", "ok.ts");
    const adapter = stubAdapter({
      extensions: [".ts"],
      throwOnFiles: ["broken.ts"],
      symbolsByFile: { "ok.ts": [okSym] },
    });
    const result = await findSampleSymbol(adapter, tmpRoot);
    expect(result).not.toBeNull();
    // First file by readdir order may be broken.ts; should skip + try ok.ts
    expect(result!.file).toBe("ok.ts");
  });

  it("filters by adapter extensions (only .ts not .py)", async () => {
    await writeFile(path.join(tmpRoot, "a.py"), "def foo():\n    pass", "utf8");
    await writeFile(
      path.join(tmpRoot, "b.ts"),
      "export function foo() {}",
      "utf8",
    );
    const tsSym = symbol("sym:ts:b.ts:foo", "foo", "b.ts");
    const adapter = stubAdapter({
      extensions: [".ts"], // only TS
      symbolsByFile: { "b.ts": [tsSym] },
    });
    const result = await findSampleSymbol(adapter, tmpRoot);
    expect(result).not.toBeNull();
    expect(result!.file).toBe("b.ts");
  });
});
