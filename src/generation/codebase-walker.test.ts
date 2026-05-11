import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { LanguageAdapter, LanguageCode, Symbol } from "../types.js";

import { buildCodebaseInventory } from "./codebase-walker.js";

function stubAdapter(
  language: LanguageCode,
  extensions: readonly string[],
  symbolsByFile: Record<string, string[]>,
): LanguageAdapter {
  return {
    language,
    extensions,
    listSymbols: async (filePath: string): Promise<Symbol[]> => {
      const names = symbolsByFile[path.resolve(filePath)] ?? [];
      return names.map((name) => ({
        id: `sym:${language}:${filePath}:${name}`,
        name,
        kind: "function",
        path: filePath,
        line: 1,
      }));
    },
    getSymbolDetails: async () => null,
    findReferences: async () => [],
    getDiagnostics: async () => [],
    initialize: async () => {},
    shutdown: async () => {},
  };
}

describe("buildCodebaseInventory (v0.7 Step 2.2.a.2 codebase walker)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "codebase-walker-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("returns empty string when no source files exist + no narrative docs", async () => {
    const adapter = stubAdapter("typescript", [".ts"], {});
    const result = await buildCodebaseInventory({
      sourceRoot: tmpRoot,
      adapters: new Map([["typescript", adapter]]),
      languages: ["typescript"],
    });
    expect(result).toBe("");
  });

  it("lists source files with indented symbol names", async () => {
    const filePath = path.join(tmpRoot, "src", "foo.ts");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "export function foo() {}\n", "utf8");
    const adapter = stubAdapter("typescript", [".ts"], {
      [path.resolve(filePath)]: ["foo", "helper"],
    });
    const result = await buildCodebaseInventory({
      sourceRoot: tmpRoot,
      adapters: new Map([["typescript", adapter]]),
      languages: ["typescript"],
    });
    expect(result).toContain("Source files");
    expect(result).toContain("src/foo.ts");
    expect(result).toContain("  - foo");
    expect(result).toContain("  - helper");
  });

  it("includes README.md verbatim when present at sourceRoot", async () => {
    await writeFile(
      path.join(tmpRoot, "README.md"),
      "# Project README\n\nSubstantive narrative.\n",
      "utf8",
    );
    const adapter = stubAdapter("typescript", [".ts"], {});
    const result = await buildCodebaseInventory({
      sourceRoot: tmpRoot,
      adapters: new Map([["typescript", adapter]]),
      languages: ["typescript"],
    });
    expect(result).toContain("## README.md");
    expect(result).toContain("Substantive narrative");
  });

  it("includes DESIGN.md + CLAUDE.md narrative docs verbatim", async () => {
    await writeFile(
      path.join(tmpRoot, "DESIGN.md"),
      "Design narrative",
      "utf8",
    );
    await writeFile(
      path.join(tmpRoot, "CLAUDE.md"),
      "Claude instructions",
      "utf8",
    );
    const adapter = stubAdapter("typescript", [".ts"], {});
    const result = await buildCodebaseInventory({
      sourceRoot: tmpRoot,
      adapters: new Map([["typescript", adapter]]),
      languages: ["typescript"],
    });
    expect(result).toContain("## DESIGN.md");
    expect(result).toContain("Design narrative");
    expect(result).toContain("## CLAUDE.md");
    expect(result).toContain("Claude instructions");
  });

  it("tolerates per-file listSymbols failures (preserves structural inventory)", async () => {
    const filePath = path.join(tmpRoot, "broken.ts");
    await writeFile(filePath, "x", "utf8");
    const adapter: LanguageAdapter = {
      language: "typescript",
      extensions: [".ts"],
      listSymbols: async () => {
        throw new Error("simulated adapter failure");
      },
      getSymbolDetails: async () => null,
      findReferences: async () => [],
      getDiagnostics: async () => [],
      initialize: async () => {},
      shutdown: async () => {},
    };
    const result = await buildCodebaseInventory({
      sourceRoot: tmpRoot,
      adapters: new Map([["typescript", adapter]]),
      languages: ["typescript"],
    });
    // File path still surfaces even when listSymbols throws.
    expect(result).toContain("broken.ts");
  });
});
