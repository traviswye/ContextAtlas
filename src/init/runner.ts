/**
 * Init subcommand — orchestrates the v0.6 onboarding pipeline per
 * v0.6 Step 4 (Stream A pipeline assembly). Per Q4.0.1-Q4.0.13 locks
 * at Step 4.0 design adjudications.
 *
 * Step 4.2 ships config setup orchestration (per Q4.2.1-Q4.2.6 sub-
 * adjudications). Doctor + atlas + smoke + success message land
 * across:
 *   - Step 4.3: doctor invocation orchestration + H5 state-driven
 *     routing (src/init/routing.ts) (per Q4.0.3 + Q4.0.4 + Q4.0.9
 *     locks); also wires H5 detection to replace languages
 *     placeholder per Q4.2.4 Q11-style refinement
 *   - Step 4.4: atlas creation (runIndexSubcommand reuse) + smoke
 *     test (first-symbol-from-atlas) + MCP registration (.mcp.json
 *     upsert) (per Q4.0.6 + Q4.0.7 + Q4.0.10 locks)
 *   - Step 4.5: success message + first-query suggestion UX
 *     (structured sectioned with [OK] ASCII marker per Q4.0.8 lock);
 *     final exit code semantics flip at Step 4.5 (fail-loudly
 *     exit code 2 preserved through Step 4.4 per Q4.2.6 lock)
 *
 * Per ADR-12 subcommand contract: exit code 0 success / 1 pipeline
 * failure / 2 setup error.
 */

import { log } from "../mcp/logger.js";
import type { LanguageCode } from "../types.js";

import { writeConfigScaffold } from "./config-scaffold.js";

export interface InitRunOptions {
  /** Repo root the init command operates on. */
  readonly configRoot: string;
  /** Optional explicit config file path (per ADR-08 inheritance). */
  readonly configFile?: string | null;
  /**
   * `--cc-only` boolean opt-in (B13-flags per Q5 lock + Q4.0.5 +
   * Q4.0.11 locks). True → architecture = "claude-code-only";
   * false → "anthropic-api-claude-code" (default dual-dependency).
   */
  readonly ccOnly?: boolean;
  /** Emit JSON-formatted output to stdout instead of text. */
  readonly json?: boolean;
  /** Test seam: override stdout writer (default `process.stdout.write`). */
  readonly writeStdout?: (chunk: string) => void;
  /** Test seam: override stderr writer (default `process.stderr.write`). */
  readonly writeStderr?: (chunk: string) => void;
}

export interface InitRunResult {
  /** 0 success / 1 pipeline failure / 2 setup error per ADR-12. */
  readonly exitCode: number;
}

/**
 * Step 4.2 placeholder languages list per Q4.2.4 lock. Step 4.3
 * Q11-style refinement wires H5 multi-dimension state-detection to
 * provide the actual detected languages at runtime.
 */
const STEP_4_2_LANGUAGES_PLACEHOLDER: readonly LanguageCode[] = ["typescript"];

/**
 * Run the init subcommand. Step 4.2 ships config setup orchestration
 * (writes/preserves `.contextatlas.yml` with architecture field per
 * --cc-only flag plumbing); doctor/atlas/smoke/success-message
 * substeps remain incomplete and surface via fail-loudly stderr per
 * Q4.2.6 lock until full pipeline lands at Step 4.5.
 */
export async function runInitSubcommand(
  options: InitRunOptions,
): Promise<InitRunResult> {
  // Architecture choice from --cc-only flag plumbing per Q4.0.5 +
  // Q4.0.11 + Q5 locks.
  const architecture: "anthropic-api-claude-code" | "claude-code-only" =
    options.ccOnly === true
      ? "claude-code-only"
      : "anthropic-api-claude-code";

  // Config setup orchestration per Q4.2.1-Q4.2.5 locks. Idempotent
  // skip-when-present per Q4.0.12 lock + Q4.2.5 single-function-with-
  // result-enum lock.
  const scaffoldResult = writeConfigScaffold({
    configRoot: options.configRoot,
    architecture,
    languages: STEP_4_2_LANGUAGES_PLACEHOLDER,
  });

  log.info(
    scaffoldResult.status === "created"
      ? `init: config scaffold created at ${scaffoldResult.path}`
      : `init: existing config preserved at ${scaffoldResult.path}`,
    { architecture },
  );

  // Step 4.2 still fail-loudly per Q4.2.6 lock — doctor/atlas/smoke/
  // success message at Steps 4.3-4.5. Final exit code semantics flip
  // at Step 4.5 once full pipeline lands; preserves CLAUDE.md fail-
  // loudly guidance through dev window.
  log.error(
    "init: pipeline orchestration partially implemented (v0.6 Step 4.2 " +
      "ships config setup; doctor/atlas/smoke/success message at Steps " +
      "4.3-4.5).",
  );
  return { exitCode: 2 };
}
