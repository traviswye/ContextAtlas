/**
 * Init subcommand — orchestrates the v0.6 onboarding pipeline per
 * v0.6 Step 4 (Stream A pipeline assembly). Per Q4.0.1-Q4.0.13 locks
 * at Step 4.0 design adjudications.
 *
 * Step 4.1 ships scaffold + signature only; full pipeline orchestration
 * lands across:
 *   - Step 4.2: config setup walkthrough + B13-flags --cc-only
 *     integration + .contextatlas.yml scaffold writer (per Q4.0.5
 *     lock + Q5 lock applicability)
 *   - Step 4.3: doctor invocation orchestration + H5 state-driven
 *     routing (src/init/routing.ts) (per Q4.0.3 + Q4.0.4 + Q4.0.9
 *     locks)
 *   - Step 4.4: atlas creation (runIndexSubcommand reuse) + smoke
 *     test (first-symbol-from-atlas) + MCP registration (.mcp.json
 *     upsert) (per Q4.0.6 + Q4.0.7 + Q4.0.10 locks)
 *   - Step 4.5: success message + first-query suggestion UX
 *     (structured sectioned with [OK] ASCII marker per Q4.0.8 lock)
 *
 * Per ADR-12 subcommand contract: exit code 0 success / 1 pipeline
 * failure / 2 setup error.
 */

import { log } from "../mcp/logger.js";

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
 * Run the init subcommand. Step 4.1 scaffold: signature locked;
 * full pipeline orchestration at Step 4.2-4.5.
 *
 * Scaffold returns exit code 2 ("setup error: not yet implemented")
 * to fail loudly per CLAUDE.md guidance — prevents silent confusion
 * between Step 4.1 scaffold and subsequent orchestration commits.
 */
export async function runInitSubcommand(
  options: InitRunOptions,
): Promise<InitRunResult> {
  // Step 4.1 scaffold — fail loudly until orchestration ships across
  // Steps 4.2-4.5. Per CLAUDE.md "fail loudly" guidance + Q4.0.13
  // test-coverage scope (substantive coverage builds at Step 4.2-4.5).
  log.error(
    "init: pipeline orchestration not yet implemented (v0.6 Step 4.1 " +
      "ships scaffold; orchestration lands across Steps 4.2-4.5). " +
      "Use `contextatlas index` + `contextatlas doctor` directly until " +
      "init pipeline lands.",
    {
      configRoot: options.configRoot,
      ccOnly: options.ccOnly ?? false,
    },
  );
  return { exitCode: 2 };
}
