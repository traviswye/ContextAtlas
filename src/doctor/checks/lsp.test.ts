import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { LanguageAdapter, Symbol as AtlasSymbol } from "../../types.js";
import type { CheckContext } from "../types.js";
import { lspChecks } from "./lsp.js";

/**
 * Stub adapter for deep health check tests. Configurable per-call
 * behavior on initialize / listSymbols / findReferences / shutdown.
 */
function configurableStubAdapter(opts: {
  initialize?: () => Promise<void>;
  listSymbols?: (filePath: string) => Promise<AtlasSymbol[]>;
  findReferences?: () => Promise<unknown[]>;
  shutdown?: () => Promise<void>;
}): LanguageAdapter {
  return {
    language: "typescript",
    extensions: [".ts"],
    async initialize(_root: string) {
      if (opts.initialize) await opts.initialize();
    },
    async shutdown() {
      if (opts.shutdown) await opts.shutdown();
    },
    async listSymbols(filePath: string) {
      if (opts.listSymbols) return opts.listSymbols(filePath);
      return [];
    },
    async getSymbolDetails() {
      return null;
    },
    async findReferences() {
      if (opts.findReferences) return opts.findReferences() as never;
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

function syml(name: string, filePath: string): AtlasSymbol {
  return {
    id: `sym:ts:${filePath}:${name}` as never,
    name,
    kind: "function",
    path: filePath,
    line: 1,
    language: "typescript",
    fileSha: "stub",
  };
}

/**
 * Mock createAdapter to inject our test stubs. Doctor's lspChecks
 * imports createAdapter from registry; we replace per-test for
 * isolation.
 */
vi.mock("../../adapters/registry.js", () => ({
  createAdapter: vi.fn(),
}));

import { createAdapter } from "../../adapters/registry.js";

function ctxWithLanguages(repoRoot: string, languages: string[]): CheckContext {
  return {
    repoRoot,
    config: {
      languages: languages as never,
      atlas: { path: ".contextatlas/atlas.json" } as never,
    } as never,
    configPath: ".contextatlas.yml",
    configError: null,
  };
}

describe("lspChecks deep_health_check", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "doctor-lsp-test-"));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("returns pass when adapter sequence completes successfully", async () => {
    await writeFile(path.join(tmpRoot, "a.ts"), "export function foo() {}", "utf8");
    const sym = syml("foo", "a.ts");
    const adapter = configurableStubAdapter({
      listSymbols: async () => [sym],
      findReferences: async () => [],
    });
    vi.mocked(createAdapter).mockReturnValue(adapter);

    const checks = await lspChecks(ctxWithLanguages(tmpRoot, ["typescript"]));
    const deepCheck = checks.find((c) => c.id === "lsp.typescript.deep_health_check");

    expect(deepCheck).toBeDefined();
    expect(deepCheck!.status).toBe("pass");
    expect(deepCheck!.message).toMatch(/deep health completed in \d+ms/);
    expect(deepCheck!.detail).toContain("foo at a.ts");
  });

  it("returns warn when no source files found", async () => {
    // tmpRoot is empty — no source files
    const adapter = configurableStubAdapter({});
    vi.mocked(createAdapter).mockReturnValue(adapter);

    const checks = await lspChecks(ctxWithLanguages(tmpRoot, ["typescript"]));
    const deepCheck = checks.find((c) => c.id === "lsp.typescript.deep_health_check");

    expect(deepCheck).toBeDefined();
    expect(deepCheck!.status).toBe("warn");
    expect(deepCheck!.message).toMatch(/no source files \/ symbols found/);
  });

  it("returns warn when source file exists but listSymbols returns empty", async () => {
    await writeFile(path.join(tmpRoot, "empty.ts"), "// no symbols", "utf8");
    const adapter = configurableStubAdapter({
      listSymbols: async () => [], // empty regardless of file
    });
    vi.mocked(createAdapter).mockReturnValue(adapter);

    const checks = await lspChecks(ctxWithLanguages(tmpRoot, ["typescript"]));
    const deepCheck = checks.find((c) => c.id === "lsp.typescript.deep_health_check");

    expect(deepCheck).toBeDefined();
    expect(deepCheck!.status).toBe("warn");
  });

  it("returns fail when initialize throws", async () => {
    await writeFile(path.join(tmpRoot, "a.ts"), "export function foo() {}", "utf8");
    const adapter = configurableStubAdapter({
      initialize: async () => {
        throw new Error("init-boom");
      },
    });
    vi.mocked(createAdapter).mockReturnValue(adapter);

    const checks = await lspChecks(ctxWithLanguages(tmpRoot, ["typescript"]));
    const deepCheck = checks.find((c) => c.id === "lsp.typescript.deep_health_check");

    expect(deepCheck).toBeDefined();
    expect(deepCheck!.status).toBe("fail");
    expect(deepCheck!.message).toMatch(/initialize failed/);
    expect(deepCheck!.detail).toContain("init-boom");
  });

  it("returns fail when findReferences throws (gopls regression target)", async () => {
    await writeFile(path.join(tmpRoot, "a.ts"), "export function foo() {}", "utf8");
    const sym = syml("foo", "a.ts");
    const adapter = configurableStubAdapter({
      listSymbols: async () => [sym],
      findReferences: async () => {
        // Simulates v0.5+ candidate #6 motivating example: gopls
        // workspace-load failure causes findReferences to throw
        throw new Error("workspace not loaded");
      },
    });
    vi.mocked(createAdapter).mockReturnValue(adapter);

    const checks = await lspChecks(ctxWithLanguages(tmpRoot, ["typescript"]));
    const deepCheck = checks.find((c) => c.id === "lsp.typescript.deep_health_check");

    expect(deepCheck).toBeDefined();
    expect(deepCheck!.status).toBe("fail");
    expect(deepCheck!.message).toMatch(/findReferences traversal failed/);
    expect(deepCheck!.detail).toContain("workspace not loaded");
    expect(deepCheck!.detail).toContain("foo at a.ts");
  });

  it("returns fail when adapter construction throws", async () => {
    vi.mocked(createAdapter).mockImplementation(() => {
      throw new Error("registry boom");
    });

    const checks = await lspChecks(ctxWithLanguages(tmpRoot, ["typescript"]));
    const deepCheck = checks.find((c) => c.id === "lsp.typescript.deep_health_check");

    expect(deepCheck).toBeDefined();
    expect(deepCheck!.status).toBe("fail");
    expect(deepCheck!.message).toMatch(/adapter construction failed/);
  });

  it("returns fail when shutdown throws after successful traversal", async () => {
    await writeFile(path.join(tmpRoot, "a.ts"), "export function foo() {}", "utf8");
    const sym = syml("foo", "a.ts");
    const adapter = configurableStubAdapter({
      listSymbols: async () => [sym],
      findReferences: async () => [],
      shutdown: async () => {
        throw new Error("shutdown-boom");
      },
    });
    vi.mocked(createAdapter).mockReturnValue(adapter);

    const checks = await lspChecks(ctxWithLanguages(tmpRoot, ["typescript"]));
    const deepCheck = checks.find((c) => c.id === "lsp.typescript.deep_health_check");

    expect(deepCheck).toBeDefined();
    expect(deepCheck!.status).toBe("fail");
    expect(deepCheck!.message).toMatch(/shutdown failed after deep traversal/);
  });

  it("skips entirely in limited mode (config null)", async () => {
    const ctx: CheckContext = {
      repoRoot: tmpRoot,
      config: null,
      configPath: null,
      configError: null,
    };
    const checks = await lspChecks(ctx);
    expect(checks).toHaveLength(0);
  });

  it("emits all three checks per language (executable + spawn + deep)", async () => {
    await writeFile(path.join(tmpRoot, "a.ts"), "export function foo() {}", "utf8");
    const sym = syml("foo", "a.ts");
    const adapter = configurableStubAdapter({
      listSymbols: async () => [sym],
      findReferences: async () => [],
    });
    vi.mocked(createAdapter).mockReturnValue(adapter);

    const checks = await lspChecks(ctxWithLanguages(tmpRoot, ["typescript"]));
    const ids = checks.map((c) => c.id);

    expect(ids).toContain("lsp.typescript.executable_in_path");
    expect(ids).toContain("lsp.typescript.spawn_test");
    expect(ids).toContain("lsp.typescript.deep_health_check");
  });
});
