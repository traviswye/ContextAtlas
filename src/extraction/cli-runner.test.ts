import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtractionClient } from "./anthropic-client.js";
import { runIndexSubcommand } from "./cli-runner.js";

/**
 * Integration harness for `contextatlas index` that avoids spawning
 * real adapters / real Anthropic calls. A stub ExtractionClient is
 * injected via the module's `clientOverride` test seam; the real
 * LSP-backed adapter (`typescript` via tsserver) spawns, but
 * `initialize`/`shutdown` complete in ms against an empty src/ dir.
 */

function captureStdout() {
  const chunks: string[] = [];
  return {
    chunks,
    writer: (c: string) => {
      chunks.push(c);
    },
    joined: () => chunks.join(""),
  };
}

function stubClient(
  responder: (body: string) => Promise<unknown>,
): ExtractionClient {
  return {
    async extract(body) {
      const raw = await responder(body);
      // If the test passed the new shape directly, honor it. Otherwise
      // wrap in the ExtractionCallResult envelope with default usage —
      // most existing tests don't care about token accounting, so the
      // default stamp keeps them ergonomic while the pipeline's usage
      // accumulator still exercises.
      if (
        raw !== null &&
        typeof raw === "object" &&
        "result" in raw &&
        "usage" in raw
      ) {
        return raw as Awaited<ReturnType<ExtractionClient["extract"]>>;
      }
      return {
        result: raw as Awaited<ReturnType<ExtractionClient["extract"]>>["result"],
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    },
  };
}

describe("runIndexSubcommand (ADR-12)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-index-cli-"));
    // Minimal repo layout: config at root, empty ADR dir, empty src,
    // committed-atlas dir (.contextatlas/). Gives the pipeline a full
    // filesystem to walk without needing fixtures.
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    writeFileSync(
      pathJoin(tmp, ".contextatlas.yml"),
      [
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
      ].join("\n"),
    );
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns exit code 2 when ANTHROPIC_API_KEY is missing", async () => {
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => undefined,
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(2);
    expect(stdout.joined()).toBe(""); // no summary printed on setup failure
  });

  it("returns exit code 2 when config is malformed", async () => {
    writeFileSync(pathJoin(tmp, ".contextatlas.yml"), "not: [valid: yaml");
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => null),
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(2);
  });

  it("returns exit code 0 and prints key=value summary on success", async () => {
    // No ADRs in docs/adr — pipeline walks zero prose files, extraction
    // client is never called, summary reports zeros. Exercises the
    // full happy path without a real API call.
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(0);
    const text = stdout.joined();
    expect(text).toMatch(/files_extracted=0/);
    expect(text).toMatch(/claims_written=0/);
    expect(text).toMatch(/wall_clock_ms=\d+/);
    expect(text).toMatch(/git_commits_indexed=\d+/);
  });

  it("emits JSON shape under --json with the same field names", async () => {
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: true,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(stdout.joined()) as Record<string, unknown>;
    expect(parsed).toHaveProperty("files_extracted", 0);
    expect(parsed).toHaveProperty("claims_written", 0);
    expect(parsed).toHaveProperty("git_commits_indexed");
    expect(parsed).toHaveProperty("extracted_at_sha");
    expect(parsed).toHaveProperty("atlas_exported");
    expect(parsed).toHaveProperty("extraction_errors");
    expect(Array.isArray(parsed.extraction_errors)).toBe(true);
  });

  it("extracts claims from an ADR when present (end-to-end happy path)", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      [
        "---",
        "id: ADR-01",
        "title: test adr",
        "---",
        "",
        "# ADR-01: test",
        "",
        "Some body text.",
        "",
      ].join("\n"),
    );

    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({
        claims: [
          {
            symbol_candidates: [],
            claim: "must stay declarative",
            severity: "hard",
            rationale: "per spec",
            excerpt: "must stay declarative",
          },
        ],
      })),
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(0);
    const text = stdout.joined();
    expect(text).toMatch(/files_extracted=1/);
    expect(text).toMatch(/claims_written=1/);
    expect(text).toMatch(/atlas_exported=true/);
  });

  it("returns exit code 1 when the pipeline throws", async () => {
    // Stub client that throws unconditionally — the pipeline surfaces
    // this as "every attempted document failed," which fails loudly.
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      "---\nid: ADR-01\n---\nbody\n",
    );
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => {
        throw new Error("stub-boom");
      }),
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(1);
  });

  it("--full option is accepted and passed through (exit 0, no crash)", async () => {
    // The semantic effect of --full (re-extracting unchanged files)
    // is exercised by the pipeline test suite; here we just verify
    // the CLI runner plumbs the flag through without breaking.
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: true,
      json: false,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(0);
  });

  // ---------------------------------------------------------------
  // Cost tracking in summary output (v0.2 Stream A #2)
  // ---------------------------------------------------------------

  it("key=value summary includes input_tokens, output_tokens, cost_usd", async () => {
    // ADR present so the stub client is actually called; usage is
    // stamped by the stub (defaults: inputTokens=100, outputTokens=50
    // per file). One file → cost = (100/1M * 15) + (50/1M * 75)
    // = 0.0015 + 0.00375 = 0.00525 USD.
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      "---\nid: ADR-01\n---\nbody\n",
    );
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(0);
    const text = stdout.joined();
    expect(text).toMatch(/input_tokens=100/);
    expect(text).toMatch(/output_tokens=50/);
    expect(text).toMatch(/cost_usd=0\.0053/);
  });

  it("--json summary includes input_tokens, output_tokens, cost_usd as numbers", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      "---\nid: ADR-01\n---\nbody\n",
    );
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: true,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(stdout.joined()) as Record<string, unknown>;
    expect(parsed.input_tokens).toBe(100);
    expect(parsed.output_tokens).toBe(50);
    expect(typeof parsed.cost_usd).toBe("number");
    expect(parsed.cost_usd).toBeCloseTo(0.00525, 4);
  });

  it("zero-file run reports zero cost", async () => {
    // No ADRs in docs/adr — pipeline never calls the client, usage
    // accumulator stays at zero.
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(0);
    const text = stdout.joined();
    expect(text).toMatch(/input_tokens=0/);
    expect(text).toMatch(/output_tokens=0/);
    expect(text).toMatch(/cost_usd=0\.0000/);
  });

  // ---------------------------------------------------------------
  // Budget-warning precedence (v0.2 Stream A #2)
  // ---------------------------------------------------------------

  function captureWarnings(): {
    lines: string[];
    restore: () => void;
  } {
    const lines: string[] = [];
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: unknown): boolean => {
        const text = typeof chunk === "string" ? chunk : String(chunk);
        if (text.includes("[warn]")) lines.push(text);
        return true;
      });
    return { lines, restore: () => spy.mockRestore() };
  }

  function writeAdrsHelper(count: number): void {
    for (let i = 1; i <= count; i++) {
      writeFileSync(
        pathJoin(tmp, "docs", "adr", `ADR-${i}.md`),
        `---\nid: ADR-${i}\n---\nbody ${i}\n`,
      );
    }
  }

  it("config-only budget: warning fires when config value exceeded", async () => {
    writeFileSync(
      pathJoin(tmp, ".contextatlas.yml"),
      [
        "version: 1",
        "languages: [typescript]",
        "adrs: { path: docs/adr/, format: markdown-frontmatter }",
        "docs: { include: [] }",
        "atlas: { committed: true, path: .contextatlas/atlas.json, " +
          "local_cache: .contextatlas/index.db }",
        "extraction: { budget_warn_usd: 0.001 }",
        "",
      ].join("\n"),
    );
    writeAdrsHelper(1);
    const warnings = captureWarnings();
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    warnings.restore();
    expect(result.exitCode).toBe(0);
    const budgetWarnings = warnings.lines.filter((l) =>
      l.includes("budget warning"),
    );
    expect(budgetWarnings).toHaveLength(1);
  });

  it("flag-only budget: --budget-warn override fires warning without config", async () => {
    writeAdrsHelper(1);
    const warnings = captureWarnings();
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      budgetWarnOverride: 0.001,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    warnings.restore();
    expect(result.exitCode).toBe(0);
    const budgetWarnings = warnings.lines.filter((l) =>
      l.includes("budget warning"),
    );
    expect(budgetWarnings).toHaveLength(1);
  });

  it("CLI override wins over config (CLI lower than config → fires on lower)", async () => {
    // Config: $100 (would not fire). CLI: $0.001 (fires). CLI wins.
    writeFileSync(
      pathJoin(tmp, ".contextatlas.yml"),
      [
        "version: 1",
        "languages: [typescript]",
        "adrs: { path: docs/adr/, format: markdown-frontmatter }",
        "docs: { include: [] }",
        "atlas: { committed: true, path: .contextatlas/atlas.json, " +
          "local_cache: .contextatlas/index.db }",
        "extraction: { budget_warn_usd: 100.0 }",
        "",
      ].join("\n"),
    );
    writeAdrsHelper(1);
    const warnings = captureWarnings();
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      budgetWarnOverride: 0.001,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    warnings.restore();
    expect(result.exitCode).toBe(0);
    const budgetWarnings = warnings.lines.filter((l) =>
      l.includes("budget warning"),
    );
    expect(budgetWarnings).toHaveLength(1);
  });

  it("CLI override wins over config (CLI higher than config → suppresses config warning)", async () => {
    // Config: $0.001 (would fire). CLI: $100 (would not fire). CLI wins
    // → no warning despite config having a low threshold.
    writeFileSync(
      pathJoin(tmp, ".contextatlas.yml"),
      [
        "version: 1",
        "languages: [typescript]",
        "adrs: { path: docs/adr/, format: markdown-frontmatter }",
        "docs: { include: [] }",
        "atlas: { committed: true, path: .contextatlas/atlas.json, " +
          "local_cache: .contextatlas/index.db }",
        "extraction: { budget_warn_usd: 0.001 }",
        "",
      ].join("\n"),
    );
    writeAdrsHelper(1);
    const warnings = captureWarnings();
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      budgetWarnOverride: 100.0,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    warnings.restore();
    expect(result.exitCode).toBe(0);
    const budgetWarnings = warnings.lines.filter((l) =>
      l.includes("budget warning"),
    );
    expect(budgetWarnings).toHaveLength(0);
  });

  it("no config, no flag → no warning regardless of cost", async () => {
    writeAdrsHelper(1);
    const warnings = captureWarnings();
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    warnings.restore();
    expect(result.exitCode).toBe(0);
    const budgetWarnings = warnings.lines.filter((l) =>
      l.includes("budget warning"),
    );
    expect(budgetWarnings).toHaveLength(0);
  });

  // ---------------------------------------------------------------
  // --verbose unresolved-token detail (v0.2 Stream A #3)
  // ---------------------------------------------------------------

  function captureStderr() {
    const chunks: string[] = [];
    return {
      chunks,
      writer: (c: string) => {
        chunks.push(c);
      },
      joined: () => chunks.join(""),
    };
  }

  it("--verbose emits nothing when there are no unresolved tokens", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      "---\nid: ADR-01\n---\nbody\n",
    );
    const stderr = captureStderr();
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      verbose: true,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
      writeStderr: stderr.writer,
    });
    expect(result.exitCode).toBe(0);
    // Summary still on stdout.
    expect(stdout.joined()).toMatch(/files_extracted=1/);
    // Verbose block silent on zero-unresolved.
    expect(stderr.joined()).not.toMatch(/unresolved symbol candidates/);
  });

  it("--verbose emits per-file block when unresolved claim candidates exist", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-07.md"),
      "---\nid: ADR-07\n---\nbody\n",
    );
    const stderr = captureStderr();
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      verbose: true,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({
        claims: [
          {
            // "Ghost" — not a real symbol in the empty src/ dir.
            symbol_candidates: ["Ghost", "AlsoGhost"],
            claim: "must be idempotent",
            severity: "hard",
            rationale: "per spec",
            excerpt: "must be idempotent",
          },
        ],
      })),
      writeStdout: stdout.writer,
      writeStderr: stderr.writer,
    });
    expect(result.exitCode).toBe(0);
    const err = stderr.joined();
    // Header + file grouping + claim line shape.
    expect(err).toMatch(
      /\[info\] unresolved symbol candidates \(--verbose\): 2 tokens across 1 files/,
    );
    expect(err).toMatch(/docs[\\/]adr[\\/]ADR-07\.md/);
    expect(err).toMatch(
      /\[claim: "must be idempotent" \(hard\)\] Ghost, AlsoGhost/,
    );
  });

  it("--verbose truncates claim text at 60 chars with '...' marker", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      "---\nid: ADR-01\n---\nbody\n",
    );
    const longClaim =
      "this is an extremely long claim text that deliberately exceeds sixty characters to exercise truncation";
    const stderr = captureStderr();
    const stdout = captureStdout();
    await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      verbose: true,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({
        claims: [
          {
            symbol_candidates: ["Ghost"],
            claim: longClaim,
            severity: "soft",
            rationale: "r",
            excerpt: "e",
          },
        ],
      })),
      writeStdout: stdout.writer,
      writeStderr: stderr.writer,
    });
    const err = stderr.joined();
    // Truncation marker appears, full text does not.
    expect(err).toMatch(/\.\.\./);
    expect(err).not.toContain(longClaim);
    // Bracketed claim label is ≤ 60 chars between the quotes.
    const m = /\[claim: "([^"]+)" \(soft\)\]/.exec(err);
    expect(m).not.toBeNull();
    expect(m![1]!.length).toBeLessThanOrEqual(60);
  });

  it("no --verbose flag → no verbose block on stderr even with unresolved tokens", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      "---\nid: ADR-01\n---\nbody\n",
    );
    const stderr = captureStderr();
    const stdout = captureStdout();
    await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      // verbose NOT set
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({
        claims: [
          {
            symbol_candidates: ["Ghost"],
            claim: "x",
            severity: "soft",
            rationale: "r",
            excerpt: "e",
          },
        ],
      })),
      writeStdout: stdout.writer,
      writeStderr: stderr.writer,
    });
    expect(stderr.joined()).not.toMatch(/unresolved symbol candidates/);
    // Default summary still reports count.
    expect(stdout.joined()).toMatch(/unresolved_candidates=1/);
  });

  // ---------------------------------------------------------------
  // ADR authoring validation breakdown (v0.3 Step 1 — Theme 1.2 Fix 1)
  // ---------------------------------------------------------------

  it("default mode: frontmatter-warning breakdown printed when unresolved frontmatter symbols exist", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-mixed.md"),
      "---\nid: ADR-mixed\nsymbols:\n  - Ghost\n  - AlsoGhost\n---\nbody\n",
    );
    const stderr = captureStderr();
    const stdout = captureStdout();
    await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      // verbose NOT set
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
      writeStderr: stderr.writer,
    });
    const err = stderr.joined();
    expect(err).toMatch(
      /\[warn\] ADR authoring validation: 2 unresolved frontmatter symbol\(s\) across 1 file\(s\)/,
    );
    expect(err).toMatch(/ADR-mixed\.md:.*Ghost.*AlsoGhost/);
    // Default summary still reports the count.
    expect(stdout.joined()).toMatch(/unresolved_frontmatter_hints=2/);
  });

  it("default mode: silent when no frontmatter symbols are unresolved", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-clean.md"),
      "---\nid: ADR-clean\n---\nbody\n",
    );
    const stderr = captureStderr();
    const stdout = captureStdout();
    await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
      writeStderr: stderr.writer,
    });
    expect(stderr.joined()).not.toMatch(/ADR authoring validation/);
    expect(stdout.joined()).toMatch(/unresolved_frontmatter_hints=0/);
  });

  it("--verbose mode: frontmatter breakdown NOT duplicated (verbose printer supersedes)", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-mixed.md"),
      "---\nid: ADR-mixed\nsymbols:\n  - Ghost\n---\nbody\n",
    );
    const stderr = captureStderr();
    const stdout = captureStdout();
    await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      verbose: true,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
      writeStderr: stderr.writer,
    });
    const err = stderr.joined();
    // Verbose block fires (covers frontmatter + claim-level detail).
    expect(err).toMatch(/unresolved symbol candidates \(--verbose\)/);
    expect(err).toMatch(/\[frontmatter\] Ghost/);
    // Default-mode warning header should NOT also fire — would be duplicate.
    expect(err).not.toMatch(/\[warn\] ADR authoring validation/);
  });

  it("--json mode: frontmatter_unresolved_by_file field present with correct shape", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-json-A.md"),
      "---\nid: ADR-json-A\nsymbols:\n  - Ghost1\n  - Ghost2\n---\nbody\n",
    );
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-json-B.md"),
      "---\nid: ADR-json-B\nsymbols:\n  - Ghost3\n---\nbody\n",
    );
    const stderr = captureStderr();
    const stdout = captureStdout();
    await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: true,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
      writeStderr: stderr.writer,
    });
    const payload = JSON.parse(stdout.joined()) as {
      frontmatter_unresolved_by_file: Array<{
        source_path: string;
        symbols: string[];
      }>;
      unresolved_frontmatter_hints: number;
    };
    expect(payload.unresolved_frontmatter_hints).toBe(3);
    expect(payload.frontmatter_unresolved_by_file).toHaveLength(2);
    const a = payload.frontmatter_unresolved_by_file.find((x) =>
      x.source_path.endsWith("ADR-json-A.md"),
    );
    const b = payload.frontmatter_unresolved_by_file.find((x) =>
      x.source_path.endsWith("ADR-json-B.md"),
    );
    expect(a?.symbols).toEqual(["Ghost1", "Ghost2"]);
    expect(b?.symbols).toEqual(["Ghost3"]);
  });

  it("--json mode: frontmatter_unresolved_by_file is empty array when none unresolved", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-clean.md"),
      "---\nid: ADR-clean\n---\nbody\n",
    );
    const stdout = captureStdout();
    await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: true,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    const payload = JSON.parse(stdout.joined()) as {
      frontmatter_unresolved_by_file: unknown[];
    };
    expect(payload.frontmatter_unresolved_by_file).toEqual([]);
  });
});
