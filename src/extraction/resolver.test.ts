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
  expandCandidateForms,
  resolveCandidate,
  resolveCandidates,
  resolveCandidatesWithNormalization,
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

describe("expandCandidateForms (R8 name-form normalization v0.7 Step 2.3.a.1)", () => {
  it("returns the raw form first for a bare identifier", () => {
    expect(expandCandidateForms("Console")).toEqual(["Console"]);
  });

  it("strips file-path-symbol prefix and emits both forms", () => {
    expect(expandCandidateForms("rich/console.py:Console")).toEqual([
      "rich/console.py:Console",
      "Console",
    ]);
  });

  it("strips Python dotted notation and emits both forms", () => {
    expect(expandCandidateForms("rich.console.Console")).toEqual([
      "rich.console.Console",
      "Console",
    ]);
  });

  it("handles Class.method dotted form (returns method as last segment)", () => {
    expect(expandCandidateForms("Console.print")).toEqual([
      "Console.print",
      "print",
    ]);
  });

  it("emits both colon-stripped and dot-stripped variants for mixed form", () => {
    // Mixed canonical-file-path-symbol with dotted segment after
    const variants = expandCandidateForms("rich/console.py:Console.print");
    expect(variants).toContain("rich/console.py:Console.print");
    expect(variants).toContain("Console.print");
    expect(variants).toContain("print");
  });

  it("dedupes when stripped forms collapse to the same string", () => {
    // Bare identifier — colon strip + dot strip both no-ops; only raw
    expect(expandCandidateForms("Console")).toEqual(["Console"]);
  });

  it("returns empty array for empty or whitespace-only input", () => {
    expect(expandCandidateForms("")).toEqual([]);
    expect(expandCandidateForms("   ")).toEqual([]);
    expect(expandCandidateForms("\n\t")).toEqual([]);
  });

  it("trims surrounding whitespace before expanding", () => {
    expect(expandCandidateForms("  Console  ")).toEqual(["Console"]);
  });

  it("ignores leading/trailing colons gracefully", () => {
    // `:Symbol` has colon at index 0 → not split (index <= 0)
    expect(expandCandidateForms(":Symbol")).toEqual([":Symbol"]);
    // `Symbol:` has colon at end → not split (index >= len-1)
    expect(expandCandidateForms("Symbol:")).toEqual(["Symbol:"]);
  });
});

describe("resolveCandidatesWithNormalization (R8 v0.7 Step 2.3.a.1)", () => {
  // Build a fresh inventory for this group.
  const adapter = new StubAdapter("python", [".py"], {
    "console.py": [
      sym({ id: "sym:py:rich/console.py:Console", name: "Console", language: "python", path: "rich/console.py" }),
      sym({ id: "sym:py:rich/console.py:print", name: "print", language: "python", path: "rich/console.py" }),
    ],
    "segment.py": [
      sym({ id: "sym:py:rich/segment.py:Segment", name: "Segment", language: "python", path: "rich/segment.py" }),
    ],
  });

  function buildInv() {
    const adapters = new Map<LanguageCode, LanguageAdapter>([["python", adapter]]);
    return buildSymbolInventory(adapters, [
      srcFile("console.py"),
      srcFile("segment.py"),
    ]);
  }

  it("resolves bare identifier directly", async () => {
    const inv = await buildInv();
    const res = resolveCandidatesWithNormalization(inv, ["Console"]);
    expect(res.symbolIds).toEqual(["sym:py:rich/console.py:Console"]);
    expect(res.unresolved).toEqual([]);
  });

  it("resolves canonical file-path-symbol form via stripped variant", async () => {
    const inv = await buildInv();
    const res = resolveCandidatesWithNormalization(inv, [
      "rich/console.py:Console",
    ]);
    expect(res.symbolIds).toEqual(["sym:py:rich/console.py:Console"]);
    expect(res.unresolved).toEqual([]);
  });

  it("resolves Python dotted notation via stripped variant (FO-10 substantively addressed)", async () => {
    const inv = await buildInv();
    const res = resolveCandidatesWithNormalization(inv, [
      "rich.console.Console",
    ]);
    expect(res.symbolIds).toEqual(["sym:py:rich/console.py:Console"]);
    expect(res.unresolved).toEqual([]);
  });

  it("resolves Class.method to method symbol when bare class is also present", async () => {
    const inv = await buildInv();
    const res = resolveCandidatesWithNormalization(inv, ["Console.print"]);
    // First variant ("Console.print") doesn't resolve; second variant ("print") matches.
    expect(res.symbolIds).toEqual(["sym:py:rich/console.py:print"]);
    expect(res.unresolved).toEqual([]);
  });

  it("retains unresolved raw candidate (for R11 diagnostic visibility)", async () => {
    const inv = await buildInv();
    const res = resolveCandidatesWithNormalization(inv, [
      "rich/typo.py:NotARealSymbol",
    ]);
    expect(res.symbolIds).toEqual([]);
    expect(res.unresolved).toEqual(["rich/typo.py:NotARealSymbol"]);
  });

  it("deduplicates across multiple matching candidates", async () => {
    const inv = await buildInv();
    const res = resolveCandidatesWithNormalization(inv, [
      "Console",
      "rich.console.Console",
      "rich/console.py:Console",
    ]);
    expect(res.symbolIds).toEqual(["sym:py:rich/console.py:Console"]);
    expect(res.unresolved).toEqual([]);
  });

  it("treats empty-string candidates as unresolved (preserved as-is)", async () => {
    const inv = await buildInv();
    const res = resolveCandidatesWithNormalization(inv, [""]);
    expect(res.symbolIds).toEqual([]);
    expect(res.unresolved).toEqual([""]);
  });
});
