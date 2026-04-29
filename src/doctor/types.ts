/**
 * Doctor subcommand types — shapes shared by check modules + output
 * formatters + the runner orchestrator.
 *
 * Per v0.4 Step 8 design: per-category check functions emit one or
 * more `DoctorCheck` records; the runner aggregates them into a
 * `DoctorResult` with summary + exit code; output formatters render
 * to text or JSON per the `--json` flag.
 */

import type { ContextAtlasConfig } from "../types.js";

export type CheckStatus = "pass" | "warn" | "fail";

export type CheckCategory =
  | "config"
  | "atlas"
  | "sha"
  | "lsp"
  | "extraction";

export interface DoctorCheck {
  /**
   * Stable identifier — `category.subcategory_name`. Three-segment
   * IDs for variable-cardinality checks (e.g.,
   * `lsp.typescript.spawn_test`). Two-segment otherwise.
   */
  readonly id: string;
  readonly category: CheckCategory;
  readonly status: CheckStatus;
  readonly message: string;
  /**
   * Optional secondary detail surfaced as supplementary text in
   * text output and as a separate field in JSON output. Used for
   * actionable next-steps on FAIL/WARN.
   */
  readonly detail?: string;
}

export interface DoctorResult {
  readonly doctorVersion: string;
  readonly repoRoot: string;
  readonly checks: readonly DoctorCheck[];
  readonly summary: {
    readonly pass: number;
    readonly warn: number;
    readonly fail: number;
  };
  /** 0 if all PASS-or-WARN; 1 if any FAIL. */
  readonly exitCode: number;
}

/**
 * Context passed to each check function. `config` is null when the
 * repo is in limited mode (no `.contextatlas.yml`); `configError`
 * is set if config exists but failed to parse.
 */
export interface CheckContext {
  readonly repoRoot: string;
  readonly config: ContextAtlasConfig | null;
  readonly configPath: string | null;
  readonly configError: string | null;
}
