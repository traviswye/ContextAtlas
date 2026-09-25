/**
 * Integration tests for `contextatlas resolve-symbols` CLI subcommand
 * (v0.7 Step 2.3.a.1 — Approach D Skill→LSP bridge).
 *
 * Spawns real typescript-language-server against a minimal tmp-dir
 * source tree to verify end-to-end LSP walk + symbol resolution +
 * atomic atlas write. Tests are slower than unit-only paths (LSP
 * cold-spawn ~1-2s); kept to a small set covering the substantive
 * happy path + setup-error cases.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { importAtlas } from "../storage/atlas-importer.js";
import { openDatabase } from "../storage/db.js";
import type { AtlasFileV1 } from "../storage/types.js";

import {
  reconcileAtlasSymbols,
  runResolveSymbolsSubcommand,
} from "./cli-resolve-symbols.js";

function captureStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdoutChunks: stdout,
    stderrChunks: stderr,
    writeStdout: (c: string) => {
      stdout.push(c);
    },
    writeStderr: (c: string) => {
      stderr.push(c);
    },
    joinedStdout: () => stdout.join(""),
    joinedStderr: () => stderr.join(""),
  };
}

const MINIMAL_CONFIG = [
  "version: 1",
  "languages:",
  "  - typescript",
  "adrs:",
  "  path: docs/adr/",
  "  format: markdown-frontmatter",
  "docs:",
  "  include: []",
  "atlas:",
  "  committed: true",
  "  path: .contextatlas/atlas.json",
  "  local_cache: .contextatlas/index.db",
  "",
].join("\n");

const SAMPLE_TS = `export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}

export function greet(name: string): string {
  return \`Hello, \${name}\`;
}
`;

function buildStubAtlas(opts: {
  withCalculatorCandidate?: boolean;
  withUnresolvedCandidate?: boolean;
  withFilePathPrefixedCandidate?: boolean;
}): AtlasFileV1 {
  const claims = [];
  if (opts.withCalculatorCandidate === true) {
    claims.push({
      source: "docstring:sample.ts:Calculator",
      source_path: "sample.ts",
      source_sha: "stub-sha",
      severity: "context" as const,
      claim: "Calculator class adds two numbers",
      symbol_ids: [],
      symbol_candidates: ["Calculator"],
    });
  }
  if (opts.withFilePathPrefixedCandidate === true) {
    claims.push({
      source: "docstring:sample.ts:greet",
      source_path: "sample.ts",
      source_sha: "stub-sha",
      severity: "context" as const,
      claim: "greet returns greeting string",
      symbol_ids: [],
      symbol_candidates: ["sample.ts:greet"],
    });
  }
  if (opts.withUnresolvedCandidate === true) {
    claims.push({
      source: "docstring:sample.ts:Imaginary",
      source_path: "sample.ts",
      source_sha: "stub-sha",
      severity: "context" as const,
      claim: "Imaginary references a non-existent symbol",
      symbol_ids: [],
      symbol_candidates: ["NotARealSymbol"],
    });
  }
  return {
    version: "1.4",
    generated_at: "2026-05-11T00:00:00.000Z",
    generator: {
      contextatlas_version: "0.7-test",
      extraction_model: "claude-opus-4-7",
    },
    source_shas: { "sample.ts": "stub-sha" },
    symbols: [],
    claims,
  };
}

describe("runResolveSymbolsSubcommand (v0.7 Step 2.3.a.1)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-resolve-symbols-"));
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    writeFileSync(pathJoin(tmp, ".contextatlas.yml"), MINIMAL_CONFIG);
    writeFileSync(pathJoin(tmp, "sample.ts"), SAMPLE_TS);
  });

  afterEach(async () => {
    // Retrying async rm: on Windows the tsserver subprocess can keep a
    // handle on the tmp dir for a moment after shutdown (EBUSY). The
    // promise form waits between retries on timers, so the event loop
    // keeps running (child pipes drain, exit events fire); rmSync's
    // retries block the thread instead.
    await rm(tmp, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });

  it("returns exit code 2 when atlas.json does not exist", async () => {
    const cap = captureStreams();
    const result = await runResolveSymbolsSubcommand({
      configRoot: tmp,
      configFile: null,
      writeStdout: cap.writeStdout,
      writeStderr: cap.writeStderr,
    });
    expect(result.exitCode).toBe(2);
    expect(cap.joinedStderr()).toContain("atlas not found");
  });

  it("returns exit code 2 when atlas.json is malformed JSON", async () => {
    writeFileSync(
      pathJoin(tmp, ".contextatlas", "atlas.json"),
      "{ not valid json",
    );
    const cap = captureStreams();
    const result = await runResolveSymbolsSubcommand({
      configRoot: tmp,
      configFile: null,
      writeStdout: cap.writeStdout,
      writeStderr: cap.writeStderr,
    });
    expect(result.exitCode).toBe(2);
    expect(cap.joinedStderr()).toContain("did not parse as JSON");
  });

  it("returns exit code 2 when atlas is missing claims array", async () => {
    writeFileSync(
      pathJoin(tmp, ".contextatlas", "atlas.json"),
      JSON.stringify({ version: "1.4", generated_at: "x", symbols: [] }),
    );
    const cap = captureStreams();
    const result = await runResolveSymbolsSubcommand({
      configRoot: tmp,
      configFile: null,
      writeStdout: cap.writeStdout,
      writeStderr: cap.writeStderr,
    });
    expect(result.exitCode).toBe(2);
    expect(cap.joinedStderr()).toContain("missing a claims array");
  });

  it(
    "resolves a Calculator claim's symbol_candidates into symbol_ids and populates symbols[]",
    async () => {
      const atlas = buildStubAtlas({ withCalculatorCandidate: true });
      writeFileSync(
        pathJoin(tmp, ".contextatlas", "atlas.json"),
        JSON.stringify(atlas, null, 2),
      );
      const cap = captureStreams();
      const result = await runResolveSymbolsSubcommand({
        configRoot: tmp,
        configFile: null,
        writeStdout: cap.writeStdout,
        writeStderr: cap.writeStderr,
      });

      expect(result.exitCode).toBe(0);
      expect(result.claimsResolved).toBe(1);
      expect(result.candidatesUnresolved).toBe(0);
      expect(result.symbolsEnumerated).toBeGreaterThan(0);

      const enriched = JSON.parse(
        readFileSync(pathJoin(tmp, ".contextatlas", "atlas.json"), "utf8"),
      ) as AtlasFileV1;
      expect(enriched.symbols.length).toBeGreaterThan(0);
      const calculatorSym = enriched.symbols.find(
        (s) => s.name === "Calculator",
      );
      expect(calculatorSym).toBeDefined();
      expect(enriched.claims[0]?.symbol_ids.length).toBeGreaterThan(0);
      // Symbol_candidates retained for R11 diagnostic visibility.
      expect(enriched.claims[0]?.symbol_candidates).toEqual(["Calculator"]);
    },
    30_000,
  );

  it(
    "resolves file-path-prefixed candidate via R8 name-form normalization",
    async () => {
      const atlas = buildStubAtlas({ withFilePathPrefixedCandidate: true });
      writeFileSync(
        pathJoin(tmp, ".contextatlas", "atlas.json"),
        JSON.stringify(atlas, null, 2),
      );
      const cap = captureStreams();
      const result = await runResolveSymbolsSubcommand({
        configRoot: tmp,
        configFile: null,
        writeStdout: cap.writeStdout,
        writeStderr: cap.writeStderr,
      });

      expect(result.exitCode).toBe(0);
      expect(result.claimsResolved).toBe(1);

      const enriched = JSON.parse(
        readFileSync(pathJoin(tmp, ".contextatlas", "atlas.json"), "utf8"),
      ) as AtlasFileV1;
      const greetMatch = enriched.claims[0]?.symbol_ids ?? [];
      expect(greetMatch.length).toBeGreaterThan(0);
    },
    30_000,
  );

  it(
    "retains unresolved candidates in symbol_candidates and reports the count",
    async () => {
      const atlas = buildStubAtlas({ withUnresolvedCandidate: true });
      writeFileSync(
        pathJoin(tmp, ".contextatlas", "atlas.json"),
        JSON.stringify(atlas, null, 2),
      );
      const cap = captureStreams();
      const result = await runResolveSymbolsSubcommand({
        configRoot: tmp,
        configFile: null,
        writeStdout: cap.writeStdout,
        writeStderr: cap.writeStderr,
      });

      expect(result.exitCode).toBe(0);
      expect(result.claimsResolved).toBe(0);
      expect(result.candidatesUnresolved).toBe(1);
      expect(cap.joinedStdout()).toContain("1 candidate unresolved");

      const enriched = JSON.parse(
        readFileSync(pathJoin(tmp, ".contextatlas", "atlas.json"), "utf8"),
      ) as AtlasFileV1;
      expect(enriched.claims[0]?.symbol_ids).toEqual([]);
      expect(enriched.claims[0]?.symbol_candidates).toEqual(["NotARealSymbol"]);
    },
    30_000,
  );

  it(
    "atomic write: leaves no .tmp file on success",
    async () => {
      const atlas = buildStubAtlas({ withCalculatorCandidate: true });
      writeFileSync(
        pathJoin(tmp, ".contextatlas", "atlas.json"),
        JSON.stringify(atlas, null, 2),
      );
      const cap = captureStreams();
      const result = await runResolveSymbolsSubcommand({
        configRoot: tmp,
        configFile: null,
        writeStdout: cap.writeStdout,
        writeStderr: cap.writeStderr,
      });

      expect(result.exitCode).toBe(0);
      expect(
        existsSync(pathJoin(tmp, ".contextatlas", "atlas.json.tmp")),
      ).toBe(false);
    },
    30_000,
  );

  it(
    "bumps atlas version field to current ATLAS_VERSION on write",
    async () => {
      // Start with a 1.3-version atlas (legacy Skill output)
      const atlas = buildStubAtlas({ withCalculatorCandidate: true });
      const legacyAtlas = { ...atlas, version: "1.3" as const };
      writeFileSync(
        pathJoin(tmp, ".contextatlas", "atlas.json"),
        JSON.stringify(legacyAtlas, null, 2),
      );
      const cap = captureStreams();
      const result = await runResolveSymbolsSubcommand({
        configRoot: tmp,
        configFile: null,
        writeStdout: cap.writeStdout,
        writeStderr: cap.writeStderr,
      });

      expect(result.exitCode).toBe(0);
      const enriched = JSON.parse(
        readFileSync(pathJoin(tmp, ".contextatlas", "atlas.json"), "utf8"),
      ) as AtlasFileV1;
      expect(enriched.version).toBe("1.4");
    },
    30_000,
  );

  it(
    "re-run after a source file is deleted: no dangling symbol_ids, orphaned claims reported, atlas stays importable (v1.2 Phase 1 D6)",
    async () => {
      writeFileSync(pathJoin(tmp, "extra.ts"), "export class Extra {}\n");
      const atlas: AtlasFileV1 = {
        ...buildStubAtlas({ withCalculatorCandidate: true }),
      };
      atlas.claims.push({
        source: "adr:ADR-01.md",
        source_path: "docs/adr/ADR-01.md",
        source_sha: "adr-sha",
        severity: "hard",
        claim: "Extra stays small",
        symbol_ids: [],
        symbol_candidates: ["Extra"],
      });
      writeFileSync(
        pathJoin(tmp, ".contextatlas", "atlas.json"),
        JSON.stringify(atlas, null, 2),
      );
      const first = await runResolveSymbolsSubcommand({
        configRoot: tmp,
        configFile: null,
        writeStdout: () => {},
        writeStderr: () => {},
      });
      expect(first.exitCode).toBe(0);
      const afterFirst = JSON.parse(
        readFileSync(pathJoin(tmp, ".contextatlas", "atlas.json"), "utf8"),
      ) as AtlasFileV1;
      const extraId = afterFirst.symbols.find((s) => s.name === "Extra")?.id;
      expect(extraId).toBeDefined();
      // A preserved claim that carries the old link but no candidates
      // (Skill refresh "carry forward unchanged").
      afterFirst.claims.push({
        source: "adr:ADR-02.md",
        source_path: "docs/adr/ADR-02.md",
        source_sha: "adr2-sha",
        severity: "soft",
        claim: "carried forward",
        symbol_ids: [extraId!],
      });
      writeFileSync(
        pathJoin(tmp, ".contextatlas", "atlas.json"),
        JSON.stringify(afterFirst, null, 2),
      );

      rmSync(pathJoin(tmp, "extra.ts"));
      const cap = captureStreams();
      const second = await runResolveSymbolsSubcommand({
        configRoot: tmp,
        configFile: null,
        writeStdout: cap.writeStdout,
        writeStderr: cap.writeStderr,
      });
      expect(second.exitCode).toBe(0);
      const final = JSON.parse(
        readFileSync(pathJoin(tmp, ".contextatlas", "atlas.json"), "utf8"),
      ) as AtlasFileV1;
      const ids = new Set(final.symbols.map((s) => s.id));
      expect(ids.has(extraId!)).toBe(false);
      for (const c of final.claims) {
        for (const id of c.symbol_ids) expect(ids.has(id)).toBe(true);
      }
      expect(second.symbolsPruned).toBeGreaterThanOrEqual(1);
      expect(second.claimsOrphaned).toBe(2);
      expect(cap.joinedStdout()).toContain("2 claims orphaned");
      const db = openDatabase(":memory:");
      try {
        expect(() => importAtlas(db, final)).not.toThrow();
      } finally {
        db.close();
      }
    },
    60_000,
  );
});

describe("reconcileAtlasSymbols (v1.2 Phase 1 D6 — same prune rules as the CLI)", () => {
  const entry = (path: string, name: string, line = 1) => ({
    id: `sym:ts:${path}:${name}`,
    name,
    kind: "function" as const,
    path,
    line,
    file_sha: "sha",
  });

  it("fresh symbols replace prior ones; prior symbols survive only where the run could not verify them", () => {
    const prior = [
      entry("src/listed.ts", "Kept", 1),
      entry("src/listed.ts", "Removed"),
      entry("src/flaky.ts", "Flaky"),
      entry("src/gone.ts", "Gone"),
      { ...entry("pkg/mod.py", "Thing"), id: "sym:py:pkg/mod.py:Thing" },
    ];
    const fresh = [entry("src/listed.ts", "Kept", 7)];
    const { symbols, plan } = reconcileAtlasSymbols(prior, fresh, {
      walkedPaths: new Set(["src/listed.ts", "src/flaky.ts"]),
      listedPaths: new Set(["src/listed.ts"]),
      failedPaths: new Set(["src/flaky.ts"]),
      inventoryIds: new Set(["sym:ts:src/listed.ts:Kept"]),
      configuredExtensions: new Set([".ts"]),
      fileExists: (p) => p !== "src/gone.ts",
    });
    expect(symbols.map((s) => `${s.id}@${s.line}`).sort()).toEqual([
      "sym:py:pkg/mod.py:Thing@1",
      "sym:ts:src/flaky.ts:Flaky@1",
      "sym:ts:src/listed.ts:Kept@7",
    ]);
    expect(plan.pruneIds).toEqual([
      "sym:ts:src/gone.ts:Gone",
      "sym:ts:src/listed.ts:Removed",
    ]);
    expect(plan.unverified.map((u) => u.reason)).toEqual([
      "language-not-configured",
      "listing-failed",
    ]);
  });
});
