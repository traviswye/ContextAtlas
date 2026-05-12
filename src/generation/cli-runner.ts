/**
 * CLI glue for the `contextatlas generate-adrs` subcommand.
 *
 * Wraps the Strategy-pattern Generator dispatch with CLI-specific
 * concerns:
 *   - Config load + adapter lifecycle + db open (mirrors
 *     `src/extraction/cli-runner.ts` setup phase)
 *   - `--reference-context <path>` CLI flag wiring into
 *     `GeneratorContext.referenceContextPath` (per Travis Step
 *     2.2.a.1 Observation 2 interface-level lock)
 *   - Exit-code mapping per ADR-12 (0 success, 1 pipeline failure,
 *     2 setup error)
 *
 * Step 2.2.a.1 ships dispatcher infrastructure against skeleton
 * generators. `AnthropicAPIDirectGenerator.generate()` throws a
 * Step-2.2.a.2-pending error after API-key setup-error check.
 * Step 2.2.a.2 lands substantive generation work; this runner does
 * not change.
 */

import { dirname, resolve as pathResolve } from "node:path";

import { createAdapter } from "../adapters/registry.js";
import { loadConfig } from "../config/parser.js";
import { mkdirSync } from "node:fs";
import { log } from "../mcp/logger.js";
import { openDatabase } from "../storage/db.js";
import type { LanguageAdapter, LanguageCode } from "../types.js";

import type { ExtractionClient } from "../extraction/anthropic-client.js";
import { runValidateAdrsSubcommand } from "./cli-validate-adrs.js";
import { getGenerator } from "./factory.js";
import {
  GenerationSetupError,
  type Generator,
  type GeneratorContext,
} from "./generator.js";

export interface GenerateAdrsCliOptions {
  configRoot: string;
  configFile: string | null;
  contextatlasVersion: string;
  /**
   * Git HEAD SHA of the contextatlas binary itself (atlas schema
   * v1.3+ inheritance). When omitted the runner leaves it null;
   * Step 2.2.a.2 may wire up `resolveContextatlasCommitSha` if
   * generated ADRs persist provenance.
   */
  contextatlasCommitSha?: string | null;
  /**
   * `--reference-context <path>` CLI flag value (per Travis
   * Observation 2 + Step 2.1.a Travis SECOND substantive reframe).
   * When set, populates `GeneratorContext.referenceContextPath`
   * for downstream prompt-input handling at Step 2.2.a.2.
   */
  referenceContextPath?: string;
  /**
   * `--budget-warn <usd>` CLI flag value, mirrors `index`
   * subcommand semantics. Optional.
   */
  budgetWarnOverride?: number | null;
  /**
   * True when `--yes` / `--no-confirm` CLI flag was passed. Bypasses
   * the pre-flight cost-estimate confirmation prompt; required for
   * CI/CD / non-interactive usage per v0.7 Step 2.2.a.2 Lock 3.
   */
  skipConfirmation?: boolean;
  /**
   * Test seam — confirmation callback override. When provided, the
   * runner forwards it via `GeneratorContext.confirmProceed`. Default
   * (when omitted): generator uses its built-in readline-based stdin
   * prompt.
   */
  confirmProceed?: () => Promise<boolean>;
  /**
   * Test seam — inject a fake ExtractionClient (Generator
   * implementations may reuse the same client shape if backed by
   * @anthropic-ai/sdk; mirrored from extraction cli-runner).
   */
  clientOverride?: ExtractionClient;
  /** Test seam — replace `process.env` access. */
  readEnv?: (name: string) => string | undefined;
  /** Test seam — replace stdout write. */
  writeStdout?: (chunk: string) => void;
  /** Test seam — replace stderr write. */
  writeStderr?: (chunk: string) => void;
  /**
   * Test seam — inject a fake Generator instead of resolving via
   * `getGenerator(config)`. Lets tests exercise the post-generation
   * validate-adrs gate path (v0.7 Step 2.4.a β-2) without making
   * real Anthropic API calls. Production callers omit; only tests
   * supply.
   */
  generatorOverride?: Generator;
}

export type GenerateAdrsExitCode = 0 | 1 | 2;

export interface GenerateAdrsCliResult {
  exitCode: GenerateAdrsExitCode;
}

/**
 * Run the `generate-adrs` subcommand end-to-end. Never throws — all
 * error paths map to exit codes + error messages logged to stderr.
 *
 * Step 2.2.a.1 skeleton: the runner reaches `generator.generate()`
 * which throws (after API-key setup check). The runner catches +
 * maps to exit code per ADR-12 discipline.
 */
export async function runGenerateAdrsSubcommand(
  options: GenerateAdrsCliOptions,
): Promise<GenerateAdrsCliResult> {
  const readEnv = options.readEnv ?? ((name) => process.env[name]);
  const writeStderr =
    options.writeStderr ?? ((chunk) => process.stderr.write(chunk));
  void options.writeStdout; // Reserved for Step 2.2.a.2 summary printing.

  // ---------------------------------------------------------------
  // Setup phase (mirrors src/extraction/cli-runner.ts shape).
  // Errors here map to exit code 2.
  // ---------------------------------------------------------------
  let config;
  try {
    config = options.configFile
      ? loadConfig(options.configRoot, options.configFile)
      : loadConfig(options.configRoot);
  } catch (err) {
    log.error("generate-adrs: failed to load config", { err: String(err) });
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
    const adapterOptions =
      config.lsp?.initializeTimeoutMs !== undefined
        ? { initializeTimeoutMs: config.lsp.initializeTimeoutMs }
        : undefined;
    for (const lang of config.languages) {
      const adapter = createAdapter(lang, adapterOptions);
      try {
        await adapter.initialize(sourceRoot);
      } catch (err) {
        log.error("generate-adrs: adapter initialization failed", {
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

    const outputAdrPath = pathResolve(options.configRoot, config.adrs.path);

    const generator = options.generatorOverride ?? getGenerator(config);
    const generatorContext: GeneratorContext = {
      config,
      configRoot: options.configRoot,
      sourceRoot,
      db,
      adapters,
      contextatlasVersion: options.contextatlasVersion,
      contextatlasCommitSha: options.contextatlasCommitSha ?? null,
      outputAdrPath,
      readEnv,
      writeStderr,
      ...(options.referenceContextPath !== undefined
        ? { referenceContextPath: options.referenceContextPath }
        : {}),
      ...(options.budgetWarnOverride !== null &&
      options.budgetWarnOverride !== undefined
        ? { budgetWarnUsd: options.budgetWarnOverride }
        : {}),
      ...(options.skipConfirmation === true ? { skipConfirmation: true } : {}),
      ...(options.confirmProceed !== undefined
        ? { confirmProceed: options.confirmProceed }
        : {}),
      ...(options.clientOverride !== undefined
        ? { clientOverride: options.clientOverride }
        : {}),
    };

    let generationResult;
    try {
      generationResult = await generator.generate(generatorContext);
    } catch (err) {
      if (err instanceof GenerationSetupError) {
        writeStderr(`generate-adrs: ${err.message}\n`);
        return { exitCode: 2 };
      }
      log.error("generate-adrs: generation failed", { err: String(err) });
      writeStderr(
        `generate-adrs: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return { exitCode: 1 };
    }

    // Graceful-abort path: when the user declines confirmation, the
    // generator returns zeroResult (filesGenerated === 0). No ADRs
    // produced → validate-adrs has nothing to verify → skip the
    // Step 2.4.a β-2 mandatory gate. Exit code 0 preserved.
    if (generationResult.filesGenerated === 0) {
      return { exitCode: 0 };
    }

    // v0.7 Step 2.4.a β-2: auto-invoke validate-adrs post-generation
    // per Travis Lock 1. Closes CLI-vs-Skill mechanical-floor-
    // enforcement substrate equivalence — Skill /generate-adrs has
    // MANDATORY Phase C validate-adrs gate; CLI now auto-invokes
    // the same canonical depth-floor verification. Non-zero exit
    // surfaces structured remediation + maps to exit code 1 (per
    // ADR-12 pipeline-failure — generation succeeded but downstream
    // depth-floor verification failed). Per Travis FO-11 status
    // (no --overwrite flag at v0.7), remediation path 2 includes
    // explicit manual-rm guidance for fresh attempt.
    const validateResult = await runValidateAdrsSubcommand({
      configRoot: options.configRoot,
      configFile: options.configFile,
      ...(options.writeStdout !== undefined
        ? { writeStdout: options.writeStdout }
        : {}),
      writeStderr,
    });

    if (validateResult.exitCode !== 0) {
      writeStderr(
        [
          "",
          "contextatlas generate-adrs: ADRs generated but `validate-adrs` canonical depth-floor verification failed.",
          "",
          "Per-ADR remediation written to stderr above.",
          "",
          "Canonical CLI cohort paths forward:",
          "  1. Manually edit failing ADRs at docs/adr/ to address each",
          "     remediation, then re-run:",
          "       contextatlas validate-adrs",
          "  2. OR remove docs/adr/ and re-run for fresh attempt:",
          "       (PowerShell)  Remove-Item -Recurse -Force docs/adr/",
          "       (bash)        rm -rf docs/adr/",
          "       contextatlas generate-adrs",
          "     (Note: `contextatlas generate-adrs` does not currently",
          "     overwrite existing ADRs — explicit removal required for",
          "     fresh attempts. --overwrite flag is a v0.8+ candidate.)",
          "",
        ].join("\n"),
      );
      return { exitCode: 1 };
    }

    return { exitCode: 0 };
  } finally {
    await shutdownAll(adapters);
    db.close();
  }
}

async function shutdownAll(
  adapters: Map<LanguageCode, LanguageAdapter>,
): Promise<void> {
  for (const adapter of adapters.values()) {
    try {
      await adapter.shutdown();
    } catch {
      // Best effort on cleanup paths; primary error already surfaced.
    }
  }
}
