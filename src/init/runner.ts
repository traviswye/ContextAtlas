/**
 * Init subcommand — orchestrates the v0.6 onboarding pipeline per
 * v0.6 Step 4 (Stream A pipeline assembly). Per Q4.0.1-Q4.0.13 locks
 * at Step 4.0 design adjudications.
 *
 * Step 4.3 ships doctor gateway invocation + H5 state-driven routing
 * (per Q4.0.3 + Q4.0.4 + Q4.0.9 + Q4.3.1-Q4.3.5 sub-adjudications).
 * Atlas + smoke + MCP + success message land across:
 *   - Step 4.4: atlas creation (runIndexSubcommand reuse) + smoke
 *     test (first-symbol-from-atlas) + MCP registration (.mcp.json
 *     upsert) (per Q4.0.6 + Q4.0.7 + Q4.0.10 locks)
 *   - Step 4.5: success message + first-query suggestion UX
 *     (structured sectioned with [OK] ASCII marker per Q4.0.8 lock);
 *     final exit code semantics flip at Step 4.5
 *
 * Per ADR-12 subcommand contract: exit code 0 success / 1 pipeline
 * failure / 2 setup error.
 *
 * Route-to-exit-code mapping per Q4.3.5 lock:
 *   - automated → exit code 2 (fail-loudly per Q4.2.6 until Step 4.5)
 *   - automated-with-warning → exit code 2 (advisory logged)
 *   - missing-adrs → exit code 0 (interactive guidance per Q4.0.9)
 *   - new-project → exit code 0 (interactive guidance per Q4.0.9)
 *   - doctor first-run FAIL → exit code 1 (ADR-12 pipeline-failure)
 */

import { detectLanguagesFromFilesystem } from "../doctor/checks/state-detection.js";
import { collectChecks } from "../doctor/runner.js";
import type { DoctorResult } from "../doctor/types.js";
import { log } from "../mcp/logger.js";
import type { LanguageCode } from "../types.js";

import { writeConfigScaffold } from "./config-scaffold.js";
import { decideRoute, type Route } from "./routing.js";

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
  /**
   * Test seam: inject doctor check collector. Avoids spawning real LSP
   * adapters during unit tests per Q4.3 Point 4 lock.
   */
  readonly collectChecksOverride?: (
    repoRoot: string,
  ) => Promise<DoctorResult>;
  /**
   * Test seam: inject filesystem language detector. Avoids walking
   * tmp dir state during unit tests per Q4.3 Point 4 lock.
   */
  readonly detectLanguagesOverride?: (
    repoRoot: string,
  ) => readonly LanguageCode[];
}

export interface InitRunResult {
  /** 0 success / 1 pipeline failure / 2 setup error per ADR-12. */
  readonly exitCode: number;
}

/**
 * Run the init subcommand. Step 4.3 ships:
 *   - Detect-then-scaffold reorder per Q4.3.4 lock (replaces Step 4.2
 *     STEP_4_2_LANGUAGES_PLACEHOLDER per Q4.2.4 Q11-style refinement)
 *   - First doctor run (gateway check) per Q4.0.4 lock
 *   - H5 state-driven routing decision per Q4.0.3 + Q4.3.2 locks
 *   - Route-to-exit-code mapping per Q4.3.5 lock
 *
 * Atlas/smoke/MCP/success message at Steps 4.4-4.5 per Q4.2.6 lock
 * (fail-loudly exit code 2 preserved for automated paths).
 */
export async function runInitSubcommand(
  options: InitRunOptions,
): Promise<InitRunResult> {
  const writeStdout =
    options.writeStdout ?? ((c: string) => process.stdout.write(c));
  const detectLangs =
    options.detectLanguagesOverride ?? detectLanguagesFromFilesystem;
  const runChecks = options.collectChecksOverride ?? collectChecks;

  // Architecture choice from --cc-only flag plumbing per Q4.0.5 +
  // Q4.0.11 + Q5 locks.
  const architecture: "anthropic-api-claude-code" | "claude-code-only" =
    options.ccOnly === true
      ? "claude-code-only"
      : "anthropic-api-claude-code";

  // Step 4.3 detect-then-scaffold reorder per Q4.3.4 lock: detect
  // languages BEFORE writing scaffold so config has correct languages
  // from start. Q4.2.4 Q11-style refinement realized.
  const detectedLanguages = detectLangs(options.configRoot);
  // Fallback to ["typescript"] only if filesystem detection yields
  // nothing (greenfield repo case; doctor first-run will WARN on
  // no-code; routing will surface new-project guidance).
  const languages: readonly LanguageCode[] =
    detectedLanguages.length > 0 ? detectedLanguages : ["typescript"];

  // Config setup orchestration per Q4.2.1-Q4.2.5 locks; idempotent
  // skip-when-present per Q4.0.12 lock.
  const scaffoldResult = writeConfigScaffold({
    configRoot: options.configRoot,
    architecture,
    languages,
  });
  log.info(
    scaffoldResult.status === "created"
      ? `init: config scaffold created at ${scaffoldResult.path}`
      : `init: existing config preserved at ${scaffoldResult.path}`,
    { architecture, languages: [...languages] },
  );

  // First doctor run (gateway check) per Q4.0.4 lock. Reuses
  // collectChecks(repoRoot) — in-process invocation; no subprocess.
  const doctorResult = await runChecks(options.configRoot);

  // FAIL aborts init with actionable summary per Q4.0.4 + Q4.3.5 locks
  // (doctor FAIL → exit code 1 ADR-12 pipeline-failure semantics).
  if (doctorResult.summary.fail > 0) {
    const failLines = doctorResult.checks
      .filter((c) => c.status === "fail")
      .map((c) => `  - ${c.id}: ${c.message}`)
      .join("\n");
    log.error(
      "init: doctor first-run reported failures; aborting init.\n" +
        "Resolve the issues below then re-run `contextatlas init`:\n" +
        failLines,
    );
    return { exitCode: 1 };
  }

  // Routing decision per Q4.0.3 + Q4.3.2 locks. WARN proceeds with
  // H5-driven conditional guidance per Q4.0.4 lock.
  const route = decideRoute(doctorResult.checks);
  writeStdout(renderRouteMessage(route) + "\n");

  // Route-to-exit-code mapping per Q4.3.5 lock.
  if (route.kind === "missing-adrs" || route.kind === "new-project") {
    // Interactive paths exit cleanly per Q4.0.9 non-blocking lock.
    return { exitCode: 0 };
  }

  // Automated + automated-with-warning paths: fail-loudly preserved
  // per Q4.2.6 lock until full pipeline lands at Step 4.5.
  log.error(
    "init: pipeline orchestration partially implemented (v0.6 Step 4.3 " +
      "ships doctor + routing; atlas/smoke/MCP/success message at Steps " +
      "4.4-4.5).",
  );
  return { exitCode: 2 };
}

/**
 * Render route-specific message for stdout. UX shape locked per
 * Q4.0.9 (sectioned routing decision + actionable guidance + re-run
 * instructions); wording substantive at Step 4.3 per Q4.3 Point 5
 * lock (refinement at Step 4.5 if cohort feedback warrants per
 * Q11-style pattern).
 *
 * No prefix on stdout per existing convention (doctor's formatText
 * outputs structured content without per-line prefix; init follows
 * same pattern). Stderr log lines use `init:` colon-prefix per
 * existing index runner convention.
 */
function renderRouteMessage(route: Route): string {
  switch (route.kind) {
    case "automated":
      return "State detection complete: existing repo with ADRs; proceeding with automated path.";
    case "automated-with-warning": {
      const lines = [
        "State detection complete: existing repo with ADRs; proceeding with automated path.",
        "",
        "Advisory:",
        ...route.warnings.map((w) => `  - ${w}`),
        "",
        "(For best atlas quality, address advisory items per H5 detection output.)",
      ];
      return lines.join("\n");
    }
    case "missing-adrs":
      return [
        "State detection: code present but no ADRs found.",
        "",
        "ContextAtlas requires ADRs for atlas extraction substrate.",
        "v0.6 doesn't auto-generate ADRs (v0.7 H2 ADR generation pipeline scaffolds further).",
        "",
        "Next steps:",
        "  1. Add ADRs to docs/adr/ following ADR-bootstrap pattern (see DESIGN.md)",
        "     - Numbered files matching pattern: ^\\d{4}-.*\\.md$",
        "     - At least one ADR required for extraction",
        "  2. Re-run: contextatlas init",
      ].join("\n");
    case "new-project":
      return [
        "State detection: empty/sparse project state detected.",
        "",
        "ContextAtlas operates best on substantial codebases with architectural intent documented.",
        "",
        "Next steps:",
        "  1. Add code (TypeScript / Python / Go supported in v0.6)",
        "  2. Create README + DESIGN.md (per ADR-bootstrap pattern in DESIGN.md)",
        "  3. Add ADRs to docs/adr/ (numbered files; at least one required)",
        "  4. Re-run: contextatlas init",
        "",
        "(v0.7 H2 ADR generation pipeline will scaffold further.)",
      ].join("\n");
  }
}
