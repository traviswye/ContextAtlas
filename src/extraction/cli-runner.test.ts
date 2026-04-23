import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
});
