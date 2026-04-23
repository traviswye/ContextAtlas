/**
 * CLI glue for the `contextatlas index` subcommand (ADR-12).
 *
 * Wraps `runExtractionPipeline` with the CLI-specific concerns that
 * library callers don't need:
 *   - API-key discovery (env var only in v0.1, explicit error if absent)
 *   - Anthropic client construction and retry-wrapper setup
 *   - Adapter lifecycle (spawn, initialize, shutdown on any exit path)
 *   - Summary printing in `key=value` or `--json` shape
 *   - Exit-code mapping per ADR-12 (0 success, 1 extraction failure, 2 setup error)
 *
 * Extracted into its own module so `src/index.ts` stays focused on
 * the dispatcher shape, and so this path is directly testable with a
 * stubbed Anthropic client.
 */

import { mkdirSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import { createAdapter } from "../adapters/registry.js";
import { loadConfig } from "../config/parser.js";
import { log } from "../mcp/logger.js";
import { openDatabase } from "../storage/db.js";
import type { LanguageAdapter, LanguageCode } from "../types.js";

import { createExtractionClient } from "./anthropic-client.js";
import {
  runExtractionPipeline,
  type ExtractionClient,
  type ExtractionPipelineResult,
  type FileUnresolvedDetail,
} from "./pipeline.js";

export interface IndexCliOptions {
  configRoot: string;
  configFile: string | null;
  full: boolean;
  json: boolean;
  /**
   * `--verbose` CLI flag. When true, the run emits per-file
   * unresolved-token detail to stderr at completion (grouped by
   * source file, with claim text + frontmatter-vs-claim origin).
   * Does not affect stdout summary. v0.2 Stream A #3.
   */
  verbose?: boolean;
  contextatlasVersion: string;
  /**
   * `--budget-warn <usd>` CLI flag value. When non-null, overrides
   * `config.extraction.budget_warn_usd`. When null, config value (if
   * present) takes effect. When both absent, no budget check runs.
   * v0.2 Stream A #2.
   */
  budgetWarnOverride?: number | null;
  /**
   * Test seam — inject a fake ExtractionClient instead of constructing
   * a real one backed by the Anthropic SDK. When provided, API-key
   * discovery is skipped.
   */
  clientOverride?: ExtractionClient;
  /**
   * Test seam — inject an env-var reader. Defaults to `process.env`.
   * Lets tests simulate missing keys without mutating the real env.
   */
  readEnv?: (name: string) => string | undefined;
  /**
   * Test seam — where summary output goes. Defaults to
   * `process.stdout.write`.
   */
  writeStdout?: (chunk: string) => void;
  /**
   * Test seam — where verbose diagnostic output goes. Defaults to
   * `process.stderr.write`. Separate from `writeStdout` so tests
   * can assert on the two channels independently.
   */
  writeStderr?: (chunk: string) => void;
}

/**
 * Exit-code contract (ADR-12): per-subcommand semantics.
 *   0 — success (pipeline ran cleanly, atlas written if modifications)
 *   1 — extraction failure (pipeline threw, or every document errored)
 *   2 — setup error (missing API key, config invalid, adapter init failed)
 */
export type IndexExitCode = 0 | 1 | 2;

export interface IndexCliResult {
  exitCode: IndexExitCode;
  /** Populated when the pipeline ran to completion (even with per-file errors). */
  pipelineResult?: ExtractionPipelineResult;
}

/**
 * Run the `index` subcommand end-to-end. Never throws — all error
 * paths map to exit codes and error messages logged to stderr.
 */
export async function runIndexSubcommand(
  options: IndexCliOptions,
): Promise<IndexCliResult> {
  const readEnv = options.readEnv ?? ((name) => process.env[name]);
  const writeStdout =
    options.writeStdout ?? ((chunk) => process.stdout.write(chunk));
  const writeStderr =
    options.writeStderr ?? ((chunk) => process.stderr.write(chunk));

  // ---------------------------------------------------------------
  // Setup phase — all errors here map to exit code 2.
  // ---------------------------------------------------------------
  let client: ExtractionClient;
  if (options.clientOverride) {
    client = options.clientOverride;
  } else {
    const apiKey = readEnv("ANTHROPIC_API_KEY");
    if (!apiKey || apiKey.length === 0) {
      log.error(
        "index: ANTHROPIC_API_KEY is not set. Export it in your " +
          "environment before running `contextatlas index`. " +
          "(See ADR-12 — v0.1 does not load .env files.)",
      );
      return { exitCode: 2 };
    }
    const anthropic = new Anthropic({ apiKey });
    client = createExtractionClient({ anthropic });
  }

  let config;
  try {
    config = options.configFile
      ? loadConfig(options.configRoot, options.configFile)
      : loadConfig(options.configRoot);
  } catch (err) {
    log.error("index: failed to load config", { err: String(err) });
    return { exitCode: 2 };
  }

  const sourceRoot = config.source?.root
    ? pathResolve(options.configRoot, config.source.root)
    : options.configRoot;

  const cachePath = pathResolve(options.configRoot, config.atlas.localCache);
  mkdirSync(dirname(cachePath), { recursive: true });

  const db = openDatabase(cachePath);

  const adapters = new Map<LanguageCode, LanguageAdapter>();
  try {
    for (const lang of config.languages) {
      const adapter = createAdapter(lang);
      try {
        await adapter.initialize(sourceRoot);
      } catch (err) {
        log.error("index: adapter initialization failed", {
          lang,
          sourceRoot,
          err: String(err),
        });
        await shutdownAll(adapters);
        db.close();
        return { exitCode: 2 };
      }
      adapters.set(lang, adapter);
    }

    // ---------------------------------------------------------------
    // Pipeline phase — errors map to exit code 1.
    // ---------------------------------------------------------------
    // Budget-warning precedence: CLI override wins silently when set
    // (conventional CLI > config behavior). Null override falls
    // through to the config value; absent config leaves the pipeline
    // check disabled.
    const budgetWarnUsd =
      options.budgetWarnOverride !== null &&
      options.budgetWarnOverride !== undefined
        ? options.budgetWarnOverride
        : config.extraction?.budgetWarnUsd;

    let pipelineResult: ExtractionPipelineResult;
    try {
      pipelineResult = await runExtractionPipeline({
        repoRoot: sourceRoot,
        configRoot: options.configRoot,
        config,
        db,
        anthropicClient: client,
        adapters,
        contextatlasVersion: options.contextatlasVersion,
        // `--full` forces every prose file through extraction
        // by ignoring the SHA baseline. The pipeline respects the
        // `full` flag via the `skipShaDiff` option added below.
        ...(options.full ? { skipShaDiff: true } : {}),
        ...(budgetWarnUsd !== undefined ? { budgetWarnUsd } : {}),
      });
    } catch (err) {
      log.error("index: extraction pipeline threw", { err: String(err) });
      return { exitCode: 1 };
    }

    if (options.verbose) {
      printVerboseUnresolved(pipelineResult.unresolvedDetails, writeStderr);
    }
    printSummary(pipelineResult, options.json, writeStdout);
    return { exitCode: 0, pipelineResult };
  } finally {
    await shutdownAll(adapters);
    db.close();
  }
}

async function shutdownAll(
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>,
): Promise<void> {
  for (const [lang, adapter] of adapters) {
    try {
      await adapter.shutdown();
    } catch (err) {
      log.warn("index: adapter shutdown error", { lang, err: String(err) });
    }
  }
}

/**
 * Claim-text display limit for verbose mode. Claims longer than this
 * are truncated with "..." so each line stays readable. 60 is a
 * pragmatic compromise: long enough to disambiguate most claims in a
 * single file, short enough that the line doesn't wrap in common
 * terminals.
 */
const VERBOSE_CLAIM_TRUNCATE = 60;

function truncateClaim(text: string): string {
  if (text.length <= VERBOSE_CLAIM_TRUNCATE) return text;
  return text.slice(0, VERBOSE_CLAIM_TRUNCATE - 3) + "...";
}

/**
 * Format per-file unresolved-token detail to stderr. Silent when there
 * are zero unresolved tokens across all files (Unix philosophy —
 * successful operations produce no noise on the diagnostic channel).
 */
function printVerboseUnresolved(
  details: readonly FileUnresolvedDetail[],
  writeStderr: (chunk: string) => void,
): void {
  if (details.length === 0) return;

  let totalTokens = 0;
  for (const d of details) {
    totalTokens += d.frontmatterUnresolved.length;
    for (const c of d.claimUnresolved) totalTokens += c.unresolved.length;
  }

  const lines: string[] = [];
  lines.push(
    `[info] unresolved symbol candidates (--verbose): ${totalTokens} tokens across ${details.length} files`,
  );
  for (const d of details) {
    lines.push(`  ${d.sourcePath}`);
    if (d.frontmatterUnresolved.length > 0) {
      lines.push(
        `    [frontmatter] ${d.frontmatterUnresolved.join(", ")}`,
      );
    }
    for (const c of d.claimUnresolved) {
      lines.push(
        `    [claim: "${truncateClaim(c.claim)}" (${c.severity})] ${c.unresolved.join(", ")}`,
      );
    }
  }
  writeStderr(lines.join("\n") + "\n");
}

function printSummary(
  result: ExtractionPipelineResult,
  asJson: boolean,
  writeStdout: (chunk: string) => void,
): void {
  if (asJson) {
    const payload = {
      files_extracted: result.filesExtracted,
      files_unchanged: result.filesUnchanged,
      files_deleted: result.filesDeleted,
      claims_written: result.claimsWritten,
      symbols_indexed: result.symbolsIndexed,
      unresolved_candidates: result.unresolvedCandidates,
      unresolved_frontmatter_hints: result.unresolvedFrontmatterHints,
      git_commits_indexed: result.gitCommitsIndexed,
      extracted_at_sha: result.extractedAtSha,
      atlas_exported: result.atlasExported,
      wall_clock_ms: result.wallClockMs,
      api_calls: result.apiCalls,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: Number(result.costUsd.toFixed(4)),
      extraction_errors: result.extractionErrors,
    };
    writeStdout(JSON.stringify(payload, null, 2) + "\n");
    return;
  }
  const lines = [
    `files_extracted=${result.filesExtracted}`,
    `files_unchanged=${result.filesUnchanged}`,
    `files_deleted=${result.filesDeleted}`,
    `claims_written=${result.claimsWritten}`,
    `symbols_indexed=${result.symbolsIndexed}`,
    `unresolved_candidates=${result.unresolvedCandidates}`,
    `unresolved_frontmatter_hints=${result.unresolvedFrontmatterHints}`,
    `git_commits_indexed=${result.gitCommitsIndexed}`,
    `extracted_at_sha=${result.extractedAtSha ?? "null"}`,
    `atlas_exported=${result.atlasExported}`,
    `wall_clock_ms=${result.wallClockMs}`,
    `api_calls=${result.apiCalls}`,
    `input_tokens=${result.inputTokens}`,
    `output_tokens=${result.outputTokens}`,
    `cost_usd=${result.costUsd.toFixed(4)}`,
    `extraction_errors=${result.extractionErrors.length}`,
  ];
  writeStdout(lines.join("\n") + "\n");
}
