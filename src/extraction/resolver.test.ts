import { describe, expect, it } from "vitest";

import type {
  Diagnostic,
  LanguageAdapter,
  LanguageCode,
  Reference,
  Symbol as AtlasSymbol,
  SymbolId,
} from "../types.js";

import type { SourceFile } from "./file-walker.js";
import {
  buildSymbolInventory,
  resolveCandidate,
  resolveCandidates,
} from "./resolver.js";

class StubAdapter implements LanguageAdapter {
  constructor(
    public readonly language: LanguageCode,
    public readonly extensions: readonly string[],
    private readonly symbolsByFile: Record<string, AtlasSymbol[]>,
  ) {}
  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async listSymbols(filePath: string): Promise<AtlasSymbol[]> {
    const hit = Object.entries(this.symbolsByFile).find(([k]) =>
      filePath.endsWith(k),
    );
    return hit ? hit[1] : [];
  }
  async getSymbolDetails(_id: SymbolId): Promise<AtlasSymbol | null> {
    return null;
  }
  async findReferences(_id: SymbolId): Promise<Reference[]> {
    return [];
  }
  async getDiagnostics(_path: string): Promise<Diagnostic[]> {
    return [];
  }
}

function sym(
  overrides: Partial<AtlasSymbol> & Pick<AtlasSymbol, "id" | "name" | "language">,
): AtlasSymbol {
  return {
    kind: "class",
    path: overrides.path ?? "src/a.ts",
    line: overrides.line ?? 1,
    ...overrides,
  };
}

function srcFile(relPath: string, sha = "sha-" + relPath): SourceFile {
  return { absPath: "/tmp/" + relPath, relPath, sha };
}

describe("buildSymbolInventory", () => {
  it("enumerates symbols from every file via the matching adapter", async () => {
    const tsAdapter = new StubAdapter("typescript", [".ts"], {
      "a.ts": [
        sym({ id: "sym:ts:a.ts:Foo", name: "Foo", language: "typescript" }),
      ],
      "b.ts": [
        sym({ id: "sym:ts:b.ts:Bar", name: "Bar", language: "typescript" }),
        sym({ id: "sym:ts:b.ts:Foo", name: "Foo", language: "typescript", path: "b.ts" }),
      ],
    });
    const adapters = new Map<LanguageCode, LanguageAdapter>([["typescript", tsAdapter]]);
    const files = [srcFile("a.ts"), srcFile("b.ts")];
    const inv = await buildSymbolInventory(adapters, files);

    expect(inv.allSymbols.map((s) => s.id).sort()).toEqual([
      "sym:ts:a.ts:Bar",
      "sym:ts:a.ts:Foo",
      "sym:ts:b.ts:Bar",
      "sym:ts:b.ts:Foo",
    ].filter((id) => id !== "sym:ts:a.ts:Bar")); // Bar only in b.ts
    // Simpler assertion:
    expect(inv.byName.get("Foo")?.map((s) => s.id)).toEqual([
      "sym:ts:a.ts:Foo",
      "sym:ts:b.ts:Foo",
    ]);
    expect(inv.byName.get("Bar")?.map((s) => s.id)).toEqual([
      "sym:ts:b.ts:Bar",
    ]);
  });

  it("stamps the file's SHA onto every symbol", async () => {
    const adapter = new StubAdapter("typescript", [".ts"], {
      "a.ts": [sym({ id: "sym:ts:a.ts:Foo", name: "Foo", language: "typescript" })],
    });
    const adapters = new Map<LanguageCode, LanguageAdapter>([["typescript", adapter]]);
    const inv = await buildSymbolInventory(adapters, [srcFile("a.ts", "the-sha")]);
    expect(inv.allSymbols[0]?.fileSha).toBe("the-sha");
  });

  it("routes each file to the adapter whose extension matches", async () => {
    const ts = new StubAdapter("typescript", [".ts"], {
      "a.ts": [sym({ id: "sym:ts:a.ts:Foo", name: "Foo", language: "typescript" })],
    });
    const py = new StubAdapter("python", [".py"], {
      "b.py": [sym({ id: "sym:py:b.py:Bar", name: "Bar", language: "python" })],
    });
    const adapters = new Map<LanguageCode, LanguageAdapter>([
      ["typescript", ts],
      ["python", py],
    ]);
    const inv = await buildSymbolInventory(adapters, [
      srcFile("a.ts"),
      srcFile("b.py"),
    ]);
    expect(inv.byName.get("Foo")?.[0]?.language).toBe("typescript");
    expect(inv.byName.get("Bar")?.[0]?.language).toBe("python");
  });

  it("tolerates a listSymbols failure on one file and continues", async () => {
    const adapter: LanguageAdapter = {
      language: "typescript",
      extensions: [".ts"],
      async initialize() {},
      async shutdown() {},
      async listSymbols(filePath: string) {
        if (filePath.endsWith("bad.ts")) throw new Error("boom");
        return [sym({ id: "sym:ts:a.ts:Foo", name: "Foo", language: "typescript" })];
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
    };
    const adapters = new Map<LanguageCode, LanguageAdapter>([["typescript", adapter]]);
    const inv = await buildSymbolInventory(adapters, [
      srcFile("bad.ts"),
      srcFile("a.ts"),
    ]);
    expect(inv.byName.get("Foo")?.length).toBe(1);
  });
});

describe("resolveCandidate / resolveCandidates", () => {
  const inventory = {
    allSymbols: [],
    byName: new Map<string, AtlasSymbol[]>([
      [
        "User",
        [
          sym({ id: "sym:ts:src/user.ts:User", name: "User", language: "typescript" }),
          sym({ id: "sym:py:users/model.py:User", name: "User", language: "python" }),
        ],
      ],
      [
        "OrderProcessor",
        [
          sym({
            id: "sym:ts:src/orders/processor.ts:OrderProcessor",
            name: "OrderProcessor",
            language: "typescript",
          }),
        ],
      ],
    ]),
  };

  it("exact match returns the symbol id", () => {
    expect(resolveCandidate(inventory, "OrderProcessor")).toEqual([
      "sym:ts:src/orders/processor.ts:OrderProcessor",
    ]);
  });

  it("cross-language match returns all matching ids", () => {
    expect(resolveCandidate(inventory, "User").sort()).toEqual([
      "sym:py:users/model.py:User",
      "sym:ts:src/user.ts:User",
    ]);
  });

  it("unresolved candidate returns empty array", () => {
    expect(resolveCandidate(inventory, "Nowhere")).toEqual([]);
  });

  it("resolveCandidates deduplicates and reports unresolved", () => {
    const res = resolveCandidates(inventory, [
      "OrderProcessor",
      "OrderProcessor", // duplicate
      "Ghost",
    ]);
    expect(res.symbolIds).toEqual([
      "sym:ts:src/orders/processor.ts:OrderProcessor",
    ]);
    expect(res.unresolved).toEqual(["Ghost"]);
  });
});
