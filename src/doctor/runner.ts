/**
 * Doctor subcommand — diagnostic-only self-check for ContextAtlas
 * configuration + state.
 *
 * Per v0.4 Step 8 design (STEP-PLAN-V0.4.md). Five check categories
 * (config + atlas + sha + lsp + extraction); per-language LSP
 * gating via `config.languages`; limited mode (no `.contextatlas.yml`)
 * runs filesystem checks only.
 *
 * Per ADR-12 subcommand-vs-flag partition: doctor is its own
 * subcommand path, not a flag on the default mcp invocation.
 *
 * Full developer-onboarding pipeline (auto-fix; guided extraction)
 * is v0.5+ scope.
 */

import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { loadConfig } from "../config/parser.js";
import type { ContextAtlasConfig } from "../types.js";

import { atlasChecks } from "./checks/atlas.js";
import { configChecks } from "./checks/config.js";
import { extractionChecks } from "./checks/extraction.js";
import { lspChecks } from "./checks/lsp.js";
import { shaChecks } from "./checks/sha.js";
import { formatJson } from "./output/json.js";
import { formatText } from "./output/text.js";
import type {
  CheckContext,
  CheckStatus,
  DoctorCheck,
  DoctorResult,
} from "./types.js";

const DOCTOR_VERSION = "0.4-dev";

export interface DoctorRunOptions {
  /** Repo root the doctor inspects. Defaults to `process.cwd()`. */
  readonly repoRoot?: string;
  /** When true, emit JSON-formatted output to stdout instead of text. */
  readonly json?: boolean;
  /** Test seam: override stdout writer (default `process.stdout.write`). */
  readonly writeStdout?: (chunk: string) => void;
}

export interface DoctorRunResult {
  readonly exitCode: number;
}

/**
 * Run the doctor subcommand. Reads optional `.contextatlas.yml`,
 * dispatches to per-category checks, formats output per `--json`
 * flag, returns the appropriate exit code.
 *
 * Limited mode (no config) emits a top-level WARN and runs only
 * filesystem-level extraction-prerequisite checks.
 */
export async function runDoctorSubcommand(
  options: DoctorRunOptions = {},
): Promise<DoctorRunResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const writeStdout = options.writeStdout ?? ((c: string) => {
    process.stdout.write(c);
  });

  const result = await collectChecks(repoRoot);
  const formatted = options.json ? formatJson(result) : formatText(result);
  writeStdout(formatted);
  return { exitCode: result.exitCode };
}

/**
 * Run the full check set, gated by config presence. Exposed for
 * direct unit testing (the orchestrator can be invoked without the
 * stdout-writing wrapper).
 */
export async function collectChecks(repoRoot: string): Promise<DoctorResult> {
  const configPath = pathResolve(repoRoot, ".contextatlas.yml");
  const configExists = existsSync(configPath);

  let config: ContextAtlasConfig | null = null;
  let configError: string | null = null;
  if (configExists) {
    try {
      config = loadConfig(repoRoot);
    } catch (err) {
      configError = err instanceof Error ? err.message : String(err);
    }
  }

  const ctx: CheckContext = {
    repoRoot,
    config,
    configPath: configExists ? configPath : null,
    configError,
  };

  const checks: DoctorCheck[] = [];

  // Limited mode: no config and no parse error (i.e., config truly
  // absent, not just malformed). Emit top-level WARN + run only
  // filesystem-level checks. Malformed config falls into the
  // normal path so `config.parses` reports the FAIL.
  const limitedMode = !configExists;
  if (limitedMode) {
    checks.push({
      id: "doctor.limited_mode",
      category: "config",
      status: "warn",
      message: "doctor running in limited mode (no .contextatlas.yml)",
      detail:
        "Filesystem-level checks executed; config / atlas / SHA / LSP checks skipped. Create `.contextatlas.yml` at the repo root for full diagnostic coverage.",
    });
    checks.push(...extractionChecks(ctx));
  } else {
    // Normal mode: run all categories.
    checks.push(...configChecks(ctx));
    if (config !== null) {
      checks.push(...atlasChecks(ctx));
      checks.push(...shaChecks(ctx));
      checks.push(...(await lspChecks(ctx)));
    }
    checks.push(...extractionChecks(ctx));
  }

  // Compute summary.
  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) summary[c.status as CheckStatus]++;
  const exitCode = summary.fail > 0 ? 1 : 0;

  return {
    doctorVersion: DOCTOR_VERSION,
    repoRoot,
    checks,
    summary,
    exitCode,
  };
}
