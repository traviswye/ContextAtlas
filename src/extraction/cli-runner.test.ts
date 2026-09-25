import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtractionClient } from "./anthropic-client.js";
import {
  resolveContextatlasCommitSha,
  runIndexSubcommand,
} from "./cli-runner.js";
import { computeFileSha } from "./file-walker.js";

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
        // No architecture field per v0.7 Step 1.4b Path-3 reframe
        // (architecture field deprecated; CLI always uses Anthropic
        // API direct extraction). Tests verify CLI default behavior
        // without explicit architecture setting.
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
    // per file). One file → cost = (100/1M * 5) + (50/1M * 25)
    // = 0.0005 + 0.00125 = 0.00175 USD.
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
    expect(text).toMatch(/cost_usd=0\.0018/);
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
    expect(parsed.cost_usd).toBeCloseTo(0.00175, 4);
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
      pathJoin(tmp, "docs", "adr", "ADR-50.md"),
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
    expect(err).toMatch(/ADR-50\.md:.*Ghost.*AlsoGhost/);
    // Default summary still reports the count.
    expect(stdout.joined()).toMatch(/unresolved_frontmatter_hints=2/);
  });

  it("default mode: silent when no frontmatter symbols are unresolved", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-51.md"),
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
      pathJoin(tmp, "docs", "adr", "ADR-50.md"),
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
      pathJoin(tmp, "docs", "adr", "ADR-401.md"),
      "---\nid: ADR-json-A\nsymbols:\n  - Ghost1\n  - Ghost2\n---\nbody\n",
    );
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-402.md"),
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
      x.source_path.endsWith("ADR-401.md"),
    );
    const b = payload.frontmatter_unresolved_by_file.find((x) =>
      x.source_path.endsWith("ADR-402.md"),
    );
    expect(a?.symbols).toEqual(["Ghost1", "Ghost2"]);
    expect(b?.symbols).toEqual(["Ghost3"]);
  });

  // ---------------------------------------------------------------
  // contextatlas_commit_sha plumbing (v0.3 Theme 1.3, atlas v1.3)
  // ---------------------------------------------------------------

  it("contextatlasCommitSha option flows through into atlas.json", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      "---\nid: ADR-01\n---\nbody\n",
    );
    const stdout = captureStdout();
    const sha = "f".repeat(40);
    await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.3.0-test",
      contextatlasCommitSha: sha,
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    const atlasOnDisk = JSON.parse(
      readFileSync(pathJoin(tmp, ".contextatlas", "atlas.json"), "utf8"),
    ) as {
      version: string;
      generator: { contextatlas_commit_sha?: string };
    };
    expect(atlasOnDisk.version).toBe("1.4");
    expect(atlasOnDisk.generator.contextatlas_commit_sha).toBe(sha);
  });

  it("contextatlasCommitSha=null suppresses the field in atlas.json", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      "---\nid: ADR-01\n---\nbody\n",
    );
    const stdout = captureStdout();
    await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.3.0-test",
      contextatlasCommitSha: null,
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    const atlasText = readFileSync(
      pathJoin(tmp, ".contextatlas", "atlas.json"),
      "utf8",
    );
    expect(atlasText).not.toContain("contextatlas_commit_sha");
  });

  it("resolveContextatlasCommitSha returns 40-hex sha or null (best-effort, never throws)", () => {
    // The contextatlas project itself is a git checkout in CI and dev,
    // so the helper resolves a real SHA. We don't pin the value (it
    // changes every commit) — we assert shape contract: 40 lowercase
    // hex, OR null on environments where git isn't available.
    const result = resolveContextatlasCommitSha();
    if (result !== null) {
      expect(result).toMatch(/^[0-9a-f]{40}$/);
    }
    // Critically: the call does not throw under any condition.
    expect(() => resolveContextatlasCommitSha()).not.toThrow();
  });

  it("--json mode: frontmatter_unresolved_by_file is empty array when none unresolved", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-51.md"),
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

  // ---------------------------------------------------------------
  // narrow_attribution precedence (v0.3 Fix 2)
  // CLI override > config value > undefined (baseline)
  // Mirrors budgetWarn precedence pattern.
  // ---------------------------------------------------------------

  it("narrow_attribution: CLI override 'drop' wins over config 'drop-with-fallback'", async () => {
    writeFileSync(
      pathJoin(tmp, ".contextatlas.yml"),
      [
        "version: 1",
        "languages: [typescript]",
        "adrs: { path: docs/adr/, format: markdown-frontmatter }",
        "docs: { include: [] }",
        "atlas: { committed: true, path: .contextatlas/atlas.json, " +
          "local_cache: .contextatlas/index.db }",
        "extraction: { narrow_attribution: drop-with-fallback }",
        "",
      ].join("\n"),
    );
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-1.md"),
      "---\nid: ADR-1\nsymbols:\n  - Real\n---\nbody\n",
    );
    writeFileSync(pathJoin(tmp, "src", "x.ts"), "export class Real {}");
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      narrowAttributionOverride: "drop",
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({
        claims: [
          {
            symbol_candidates: [],
            claim: "vague",
            severity: "hard",
            rationale: "r",
            excerpt: "e",
          },
        ],
      })),
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(0);
    // CLI override is "drop" (no fallback). Claim has no model
    // candidates, so it attaches to zero symbols. unresolved_candidates
    // stays 0 (empty list isn't unresolved; just empty).
    // The unresolved_frontmatter_hints stays 0 (Real does resolve).
    expect(stdout.joined()).toMatch(/unresolved_frontmatter_hints=0/);
  });

  it("narrow_attribution: null override falls through to config value", async () => {
    writeFileSync(
      pathJoin(tmp, ".contextatlas.yml"),
      [
        "version: 1",
        "languages: [typescript]",
        "adrs: { path: docs/adr/, format: markdown-frontmatter }",
        "docs: { include: [] }",
        "atlas: { committed: true, path: .contextatlas/atlas.json, " +
          "local_cache: .contextatlas/index.db }",
        "extraction: { narrow_attribution: drop }",
        "",
      ].join("\n"),
    );
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-1.md"),
      "---\nid: ADR-1\n---\nbody\n",
    );
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      // narrowAttributionOverride: undefined or null falls through.
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(0);
  });

  it("narrow_attribution: both absent → baseline behavior (no flag set)", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-1.md"),
      "---\nid: ADR-1\n---\nbody\n",
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
  });

  // ---------------------------------------------------------------
  // v1.2 Phase 1 — prune/orphan/stream-aware-deletion summary fields.
  // ADR-12 contract: new keys are appended; existing keys keep their
  // names and their relative order.
  // ---------------------------------------------------------------

  const V01_V03_KEYS = [
    "files_extracted",
    "files_unchanged",
    "files_deleted",
    "claims_written",
    "symbols_indexed",
    "unresolved_candidates",
    "unresolved_frontmatter_hints",
    "git_commits_indexed",
    "extracted_at_sha",
    "atlas_exported",
    "wall_clock_ms",
    "api_calls",
    "input_tokens",
    "output_tokens",
    "cost_usd",
    "extraction_errors",
  ];
  const PHASE1_KEYS = [
    "symbols_pruned",
    "claims_orphaned",
    "docstring_sources_deleted",
    "unverified_symbol_files",
  ];
  // v1.2 Phase 2 (L-9) — appended after the Phase 1 keys.
  const PHASE2_KEYS = [
    "streams_enabled",
    "docstring_files_extracted",
    "docstring_files_unchanged",
    "docstring_symbols_extracted",
    "docstring_claims_written",
    "commits_extracted",
    "commits_skipped",
    "commit_claims_written",
    "commit_keys_migrated",
  ];

  it("key=value summary appends the v1.2 Phase 1 then Phase 2 keys after the existing keys (order unchanged)", async () => {
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
    const keys = stdout
      .joined()
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("=")[0]);
    expect(keys).toEqual([...V01_V03_KEYS, ...PHASE1_KEYS, ...PHASE2_KEYS]);
    expect(stdout.joined()).toMatch(/symbols_pruned=0/);
    expect(stdout.joined()).toMatch(/claims_orphaned=0/);
    // Default config: all three streams, canonical order.
    expect(stdout.joined()).toMatch(/^streams_enabled=adr,docstring,commit$/m);
    expect(stdout.joined()).toMatch(/^commit_keys_migrated=0$/m);
  });

  it("--json summary appends the v1.2 Phase 1 then Phase 2 fields; existing field order unchanged", async () => {
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
    const parsed = JSON.parse(stdout.joined()) as Record<string, unknown>;
    const existing = [
      ...V01_V03_KEYS.slice(0, 7),
      "frontmatter_unresolved_by_file",
      ...V01_V03_KEYS.slice(7),
    ];
    expect(Object.keys(parsed)).toEqual([
      ...existing,
      "symbols_pruned",
      "claims_orphaned",
      "orphaned_claims_by_source",
      "docstring_sources_deleted",
      "unverified_symbol_files",
      ...PHASE2_KEYS,
    ]);
    expect(parsed.orphaned_claims_by_source).toEqual([]);
    expect(parsed.streams_enabled).toEqual(["adr", "docstring", "commit"]);
    expect(parsed.commits_extracted).toBe(0);
  });

  it("streams_enabled reflects extraction.streams (canonical order)", async () => {
    writeFileSync(
      pathJoin(tmp, ".contextatlas.yml"),
      readFileSync(pathJoin(tmp, ".contextatlas.yml"), "utf8") +
        "extraction:\n  streams: [commit, adr]\n",
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
    expect(parsed.streams_enabled).toEqual(["adr", "commit"]);
  });

  // ---------------------------------------------------------------
  // v1.2 Phase 2 — cost preview (L-8) and per-stream failure (L-10 ii)
  // ---------------------------------------------------------------

  it("cost preview goes to stderr only, before the summary; --json stdout stays exactly one JSON object", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01.md"),
      "---\nid: ADR-01\n---\nbody\n",
    );
    const stdout = captureStdout();
    const stderr = captureStderr();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: true,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => ({ claims: [] })),
      writeStdout: stdout.writer,
      writeStderr: stderr.writer,
    });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(stdout.joined()) as Record<string, unknown>;
    expect(parsed.api_calls).toBe(1);
    expect(stdout.joined()).not.toMatch(/estimate/i);
    const err = stderr.joined();
    expect(err).toMatch(/extraction plan/i);
    expect(err).toMatch(/adr\s+1 file\s+1 call/);
    expect(err).toMatch(/\$\d+\.\d{2} to \$\d+\.\d{2}/);
  });

  it("no cost preview when nothing needs a model call", async () => {
    const stderr = captureStderr();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: false,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => {
        throw new Error("no model call expected");
      }),
      writeStdout: captureStdout().writer,
      writeStderr: stderr.writer,
    });
    expect(result.exitCode).toBe(0);
    expect(stderr.joined()).not.toMatch(/extraction plan/i);
  });

  it("a stream whose every call failed: summary + export still happen, then exit 1 with an actionable message (L-10 ii)", async () => {
    const git = (args: string[]) => {
      const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
        cwd: tmp,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Tester",
          GIT_AUTHOR_EMAIL: "tester@example.com",
          GIT_COMMITTER_NAME: "Tester",
          GIT_COMMITTER_EMAIL: "tester@example.com",
        },
      });
      if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    };
    git(["init", "-q"]);
    git(["commit", "-q", "--allow-empty", "-m", "design: split the router"]);
    const sha = git(["rev-parse", "HEAD"]);

    const stdout = captureStdout();
    const stderr = captureStderr();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: true,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => {
        throw new Error("401 invalid x-api-key");
      }),
      writeStdout: stdout.writer,
      writeStderr: stderr.writer,
    });
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(stdout.joined()) as Record<string, unknown>;
    expect(parsed.api_calls).toBe(1);
    expect(parsed.atlas_exported).toBe(true);
    expect(parsed.extraction_errors).toEqual([
      { sourcePath: `commit:${sha}`, error: expect.stringContaining("401") },
    ]);
    const err = stderr.joined();
    expect(err).toMatch(/every commit extraction call failed \(1 of 1\)/);
    expect(err).toContain("401 invalid x-api-key");
    expect(err).toMatch(/re-run `contextatlas index`/);
    const atlas = JSON.parse(
      readFileSync(pathJoin(tmp, ".contextatlas", "atlas.json"), "utf8"),
    ) as { extracted_at_sha?: string; source_shas: Record<string, string> };
    expect(atlas.extracted_at_sha).toBe(sha);
    expect(atlas.source_shas[`commit:${sha}`]).toBeUndefined();
  }, 30_000);

  // ---------------------------------------------------------------
  // ADR-12 --json contract: stdout carries exactly one JSON object,
  // including when the auto-invoked validate-extraction runs (it only
  // runs without clientOverride, so these tests use the real client
  // path with a fake key and a fetch stub that must never be hit).
  // ---------------------------------------------------------------

  /**
   * Seeds an atlas whose ADR-01 claims pass validate-extraction, plus a
   * source_shas key for a deleted ADR-02 so Stage 5 deletes it: the run
   * exports (and the validator runs) without any model call.
   */
  function seedExportingAtlasWithoutModelCalls(): void {
    const adrPath = pathJoin(tmp, "docs", "adr", "ADR-01.md");
    writeFileSync(adrPath, "---\nid: ADR-01\n---\nbody\n");
    const adrSha = computeFileSha(adrPath);
    const claim = (source: string, sourcePath: string, n: number) => ({
      source,
      source_path: sourcePath,
      source_sha: sourcePath === "docs/adr/ADR-01.md" ? adrSha : "gone-sha",
      severity: "hard",
      claim: `claim ${n}`,
      symbol_ids: [],
    });
    writeFileSync(
      pathJoin(tmp, ".contextatlas", "atlas.json"),
      JSON.stringify({
        version: "1.4",
        generated_at: "2026-09-01T00:00:00.000Z",
        generator: {
          contextatlas_version: "1.1.3",
          extraction_model: "claude-opus-4-7",
        },
        source_shas: {
          "docs/adr/ADR-01.md": adrSha,
          "docs/adr/ADR-02.md": "gone-sha",
        },
        symbols: [],
        claims: [
          ...Array.from({ length: 8 }, (_, i) =>
            claim("adr:ADR-01.md", "docs/adr/ADR-01.md", i),
          ),
          claim("adr:ADR-02.md", "docs/adr/ADR-02.md", 99),
        ],
      }),
    );
  }

  function stubFetchNeverCalled(): string[] {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: unknown) => {
      requests.push(String(input));
      throw new Error("no model call expected");
    });
    return requests;
  }

  it("--json: validate-extraction output goes to stderr; stdout is exactly one JSON object", async () => {
    seedExportingAtlasWithoutModelCalls();
    const requests = stubFetchNeverCalled();
    const stdout = captureStdout();
    const stderr = captureStderr();
    try {
      const result = await runIndexSubcommand({
        configRoot: tmp,
        configFile: null,
        full: false,
        json: true,
        contextatlasVersion: "0.0.1-test",
        contextatlasCommitSha: null,
        readEnv: (name) =>
          name === "ANTHROPIC_API_KEY" ? "sk-ant-test-never-used" : undefined,
        writeStdout: stdout.writer,
        writeStderr: stderr.writer,
      });
      expect(result.exitCode).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(requests).toEqual([]);
    const out = stdout.joined();
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.atlas_exported).toBe(true);
    expect(parsed.files_deleted).toBe(1);
    expect(parsed.api_calls).toBe(0);
    expect(out).not.toContain("validate-extraction");
    expect(stderr.joined()).toMatch(
      /validate-extraction: atlas at .* conforms to canonical extraction-quality invariants/,
    );
  }, 30_000);

  it("key=value mode: validate-extraction output stays on stdout after the summary", async () => {
    seedExportingAtlasWithoutModelCalls();
    const requests = stubFetchNeverCalled();
    const stdout = captureStdout();
    const stderr = captureStderr();
    try {
      const result = await runIndexSubcommand({
        configRoot: tmp,
        configFile: null,
        full: false,
        json: false,
        contextatlasVersion: "0.0.1-test",
        contextatlasCommitSha: null,
        readEnv: (name) =>
          name === "ANTHROPIC_API_KEY" ? "sk-ant-test-never-used" : undefined,
        writeStdout: stdout.writer,
        writeStderr: stderr.writer,
      });
      expect(result.exitCode).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(requests).toEqual([]);
    const lines = stdout.joined().trim().split(/\r?\n/);
    expect(lines[0]).toBe("files_extracted=0");
    expect(lines).toContain("atlas_exported=true");
    expect(lines[lines.length - 1]).toMatch(
      /^validate-extraction: atlas at .* conforms/,
    );
  }, 30_000);

  it("validate-extraction failure: the remediation says --full also re-bills docstrings and offers an ADR-only rebuild (review fix)", async () => {
    seedExportingAtlasWithoutModelCalls();
    // Make ADR-01 shallow (3 claims): the auto-invoked validator fails.
    const atlasFile = pathJoin(tmp, ".contextatlas", "atlas.json");
    const atlas = JSON.parse(readFileSync(atlasFile, "utf8")) as {
      claims: Array<{ source_path: string }>;
    };
    let kept = 0;
    atlas.claims = atlas.claims.filter(
      (c) => c.source_path !== "docs/adr/ADR-01.md" || kept++ < 3,
    );
    writeFileSync(atlasFile, JSON.stringify(atlas));
    const requests = stubFetchNeverCalled();
    const stdout = captureStdout();
    const stderr = captureStderr();
    try {
      const result = await runIndexSubcommand({
        configRoot: tmp,
        configFile: null,
        full: false,
        json: false,
        contextatlasVersion: "0.0.1-test",
        contextatlasCommitSha: null,
        readEnv: (name) =>
          name === "ANTHROPIC_API_KEY" ? "sk-ant-test-never-used" : undefined,
        writeStdout: stdout.writer,
        writeStderr: stderr.writer,
      });
      expect(result.exitCode).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(requests).toEqual([]);
    const err = stderr.joined();
    expect(err).toContain("adr_depth_floor");
    expect(err).toMatch(/--full` also re-extracts every docstring file/);
    expect(err).toMatch(/extraction\.streams: \[adr\]/);
  }, 30_000);

  it("reports a pruned stale symbol and the claim it orphans (real tsserver, zero model calls)", async () => {
    const adrPath = pathJoin(tmp, "docs", "adr", "ADR-01.md");
    writeFileSync(adrPath, ["---", "id: ADR-01", "---", "Gone must stay pure.", ""].join("\n"));
    const adrSha = computeFileSha(adrPath);
    writeFileSync(
      pathJoin(tmp, ".contextatlas", "atlas.json"),
      JSON.stringify({
        version: "1.4",
        generated_at: "2026-09-01T00:00:00.000Z",
        generator: {
          contextatlas_version: "1.1.3",
          extraction_model: "claude-opus-4-7",
        },
        source_shas: { "docs/adr/ADR-01.md": adrSha },
        symbols: [
          {
            id: "sym:ts:src/gone.ts:Gone",
            name: "Gone",
            kind: "function",
            path: "src/gone.ts",
            line: 1,
            file_sha: "old",
          },
        ],
        claims: [
          {
            source: "adr:ADR-01.md",
            source_path: "docs/adr/ADR-01.md",
            source_sha: adrSha,
            severity: "hard",
            claim: "Gone must stay pure",
            symbol_ids: ["sym:ts:src/gone.ts:Gone"],
          },
        ],
      }),
    );
    const stdout = captureStdout();
    const result = await runIndexSubcommand({
      configRoot: tmp,
      configFile: null,
      full: false,
      json: true,
      contextatlasVersion: "0.0.1-test",
      clientOverride: stubClient(async () => {
        throw new Error("no model call expected");
      }),
      writeStdout: stdout.writer,
    });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(stdout.joined()) as Record<string, unknown>;
    expect(parsed.api_calls).toBe(0);
    expect(parsed.files_deleted).toBe(0);
    expect(parsed.symbols_pruned).toBe(1);
    expect(parsed.claims_orphaned).toBe(1);
    expect(parsed.orphaned_claims_by_source).toEqual([
      { source: "adr:ADR-01.md", source_path: "docs/adr/ADR-01.md", count: 1 },
    ]);
    expect(parsed.atlas_exported).toBe(true);
    const onDisk = JSON.parse(
      readFileSync(pathJoin(tmp, ".contextatlas", "atlas.json"), "utf8"),
    ) as { symbols: unknown[]; claims: Array<{ symbol_ids: string[] }> };
    expect(onDisk.symbols).toEqual([]);
    expect(onDisk.claims[0]?.symbol_ids).toEqual([]);
  }, 30_000);
});
