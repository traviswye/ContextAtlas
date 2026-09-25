/**
 * `contextatlas resolve-symbols` on a refresh atlas that wrote
 * `symbols: []` next to preserved `symbol_ids` (the `/index-atlas`
 * refresh contract, v1.2 Phase 2 lead decision F2). It rebuilds
 * `symbols` from the files it can list and keeps every link to a symbol
 * it lists. The documented loss: a link into a file it cannot list in
 * that run (a listing failure, a language not configured) is dropped,
 * and only the claim's `symbol_candidates` can restore it later.
 *
 * The language adapter is a stub (`vi.mock` of the registry): it lists
 * `src/a.ts` and throws for `src/big.ts`, the stand-in for a
 * documentSymbol timeout. No language server is spawned.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AtlasFileV1, AtlasSymbolEntry } from "../storage/types.js";
import type { LanguageAdapter, Symbol as AtlasSymbol } from "../types.js";

vi.mock("../adapters/registry.js", () => ({
  createAdapter: (): LanguageAdapter => ({
    language: "typescript",
    extensions: [".ts"],
    async initialize() {},
    async shutdown() {},
    async listSymbols(absPath: string): Promise<AtlasSymbol[]> {
      if (basename(absPath) === "big.ts") throw new Error("documentSymbol timed out after 30000ms");
      if (basename(absPath) === "a.ts") {
        return [{ id: "sym:ts:src/a.ts:Alpha", name: "Alpha", kind: "function", path: "src/a.ts", line: 1, language: "typescript" }];
      }
      return [];
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
    async getDocstring() {
      return null;
    },
  }),
}));

const { runResolveSymbolsSubcommand } = await import("./cli-resolve-symbols.js");

const CONFIG = [
  "version: 1",
  "languages:",
  "  - typescript",
  "adrs:",
  "  path: docs/adr/",
  "docs:",
  "  include: []",
  "atlas:",
  "  committed: true",
  "  path: .contextatlas/atlas.json",
  "  local_cache: .contextatlas/index.db",
  "",
].join("\n");

const ALPHA: AtlasSymbolEntry = { id: "sym:ts:src/a.ts:Alpha", name: "Alpha", kind: "function", path: "src/a.ts", line: 1, file_sha: "x" };
const ROUTER: AtlasSymbolEntry = { id: "sym:ts:src/big.ts:Router", name: "Router", kind: "class", path: "src/big.ts", line: 3, file_sha: "y" };
const HELPER: AtlasSymbolEntry = { id: "sym:py:src/tool.py:helper", name: "helper", kind: "function", path: "src/tool.py", line: 1, file_sha: "z" };

/** A CLI-built baseline: every claim links a symbol and has no candidates. */
function baseline(): AtlasFileV1 {
  const claim = (text: string, id: string) => ({
    source: "adr:ADR-01.md",
    source_path: "docs/adr/ADR-01.md",
    source_sha: "adr",
    severity: "hard" as const,
    claim: text,
    symbol_ids: [id],
  });
  return {
    version: "1.4",
    generated_at: "2026-09-25T00:00:00.000Z",
    generator: { contextatlas_version: "1.2.0", extraction_model: "claude-opus-4-7" },
    source_shas: { "docs/adr/ADR-01.md": "adr" },
    symbols: [ALPHA, ROUTER, HELPER],
    claims: [
      claim("Alpha stays pure", ALPHA.id),
      claim("Router owns dispatch", ROUTER.id),
      claim("helper is python-only", HELPER.id),
    ],
  };
}

describe("resolve-symbols on a `symbols: []` refresh atlas (lead decision F2)", () => {
  let tmp: string;
  let out: string;
  let err: string;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-rs-links-"));
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    writeFileSync(pathJoin(tmp, ".contextatlas.yml"), CONFIG);
    writeFileSync(pathJoin(tmp, "src", "a.ts"), "export function Alpha() {}\n");
    writeFileSync(pathJoin(tmp, "src", "big.ts"), "export class Router {}\n");
    writeFileSync(pathJoin(tmp, "src", "tool.py"), "def helper():\n    pass\n");
    out = "";
    err = "";
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const atlasPath = () => pathJoin(tmp, ".contextatlas", "atlas.json");
  const writeAtlas = (atlas: AtlasFileV1) => writeFileSync(atlasPath(), JSON.stringify(atlas, null, 2));
  const refresh = (): AtlasFileV1 => ({ ...baseline(), symbols: [] });
  const resolve = () =>
    runResolveSymbolsSubcommand({
      configRoot: tmp,
      configFile: null,
      writeStdout: (c) => (out += c),
      writeStderr: (c) => (err += c),
    });

  it("the baseline symbols carried forward: links into unverified files are kept (control)", async () => {
    writeAtlas(baseline());
    const r = await resolve();
    expect(r.exitCode).toBe(0);
    expect(r.unverifiedSymbolFiles).toBe(2);
    const final = JSON.parse(readFileSync(atlasPath(), "utf8")) as AtlasFileV1;
    expect(final.claims.map((c) => c.symbol_ids)).toEqual([[ALPHA.id], [ROUTER.id], [HELPER.id]]);
  });

  it("`symbols: []`: links to symbols it lists are kept; links into files it cannot list are dropped and reported (the documented loss)", async () => {
    writeAtlas(refresh());
    const r = await resolve();
    expect(r.exitCode).toBe(0);
    expect(r.danglingLinksDropped).toBe(2);
    expect(r.claimsOrphaned).toBe(2);
    expect(out).toMatch(/dropped 2 dangling symbol links; 2 claims orphaned/);
    const final = JSON.parse(readFileSync(atlasPath(), "utf8")) as AtlasFileV1;
    expect(final.claims.map((c) => c.symbol_ids)).toEqual([[ALPHA.id], [], []]);
    expect(final.symbols.map((s) => s.id)).toEqual([ALPHA.id]);
  });

  it("a link whose file is gone is still dropped (its symbol is known to be gone)", async () => {
    const atlas = refresh();
    atlas.claims.push({
      source: "adr:ADR-01.md",
      source_path: "docs/adr/ADR-01.md",
      source_sha: "adr",
      severity: "soft",
      claim: "Gone was removed",
      symbol_ids: ["sym:ts:src/gone.ts:Gone"],
    });
    // Only the verifiable files: carry the unverified ones' symbols.
    atlas.symbols = [ROUTER, HELPER];
    writeAtlas(atlas);
    const r = await resolve();
    expect(r.exitCode).toBe(0);
    expect(r.danglingLinksDropped).toBe(1);
    const final = JSON.parse(readFileSync(atlasPath(), "utf8")) as AtlasFileV1;
    expect(final.claims.find((c) => c.claim === "Gone was removed")?.symbol_ids).toEqual([]);
    expect(final.claims.find((c) => c.claim === "Router owns dispatch")?.symbol_ids).toEqual([ROUTER.id]);
  });
});
