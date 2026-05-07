/**
 * Init subcommand — orchestrates the v0.6 onboarding pipeline per
 * v0.6 Step 4 (Stream A pipeline assembly). Per Q4.0.1-Q4.0.13 locks
 * at Step 4.0 design adjudications.
 *
 * Step 4.4 ships atlas creation (runIndexSubcommand reuse) + smoke
 * test (first-symbol-from-atlas in-process buildBundle) + MCP
 * registration (.mcp.json idempotent upsert) per Q4.0.6 + Q4.0.7 +
 * Q4.0.10 + Q4.4.1-Q4.4.7 locks.
 *
 * Success message UX lands at Step 4.5 (structured sectioned with
 * [OK] ASCII marker per Q4.0.8 lock); final exit code semantics flip
 * at Step 4.5 (fail-loudly exit code 2 preserved through Step 4.4
 * for automated paths per Q4.2.6 lock).
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
 *   - atlas extraction FAIL → exit code 1 (Q4.4.4 pass-through)
 *   - smoke test FAIL → exit code 2 (Q4.0.7 spec)
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { detectLanguagesFromFilesystem } from "../doctor/checks/state-detection.js";
import { collectChecks } from "../doctor/runner.js";
import type { DoctorResult } from "../doctor/types.js";
import {
  runIndexSubcommand,
  type IndexCliResult,
} from "../extraction/cli-runner.js";
import { log } from "../mcp/logger.js";
import {
  detectAtlasOnlyAvailable,
  readHeadSha,
} from "../queries/atlas-only-mode.js";
import type { LanguageCode } from "../types.js";

import { writeConfigScaffold } from "./config-scaffold.js";
import { upsertMcpRegistration } from "./mcp-registration.js";
import { decideRoute, type Route } from "./routing.js";
import { runSmokeTest } from "./smoke-test.js";
import {
  renderSuccessMessage,
  type InitSuccessState,
} from "./success-message.js";

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
  /**
   * `--observe` boolean opt-in (v0.6 Step 6.2 / Q6.0.4 hybrid wiring +
   * ADR-20 cohort observability contract). True → scaffold writes
   * `observability: { enabled: true }`. The flag IS the consent
   * signal; default false (no observability section).
   */
  readonly observe?: boolean;
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
  /**
   * Test seam: inject runIndexSubcommand. Avoids real Anthropic API
   * calls during unit tests per Q4.4 Point 4 lock.
   */
  readonly runIndexSubcommandOverride?: (
    opts: import("../extraction/cli-runner.js").IndexCliOptions,
  ) => Promise<IndexCliResult>;
  /**
   * Test seam: override .mcp.json contextatlas binary path per Q4.4.6
   * + Q4.4.7 locks.
   */
  readonly resolveBinaryPathOverride?: string;
}

export interface InitRunResult {
  /** 0 success / 1 pipeline failure / 2 setup error per ADR-12. */
  readonly exitCode: number;
}

/**
 * Read package.json version field via walk-up from this module's
 * __dirname (mirrors src/index.ts:50-55 readPackageVersion pattern;
 * analogous to resolveContextatlasCommitSha pattern from
 * cli-runner.ts:286-308).
 *
 * Inline helper at Step 4.4: src/index.ts readPackageVersion is
 * private + location-bound (signature relies on its own
 * import.meta.url). Q11-style refinement at Step 4.5 OR v0.7+ if
 * shared utility module warrants (per Travis verification at Step
 * 4.4 surface review).
 */
function readContextAtlasVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 10; i++) {
    const pkgPath = pathResolve(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
          version?: string;
        };
        if (typeof pkg.version === "string") {
          return pkg.version;
        }
      } catch {
        // fall through to walk continuation
      }
    }
    const parent = pathResolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: dev placeholder when package.json walk fails (atypical
  // install layout; v0.6 cohort scope acceptable).
  return "0.6-dev";
}

/**
 * Run the init subcommand. Step 4.4 ships:
 *   - Atlas creation (runIndexSubcommand reuse) per Q4.0.6 +
 *     Q4.4.3 + Q4.4.4 locks; idempotent skip-when-current via
 *     detectAtlasOnlyAvailable pre-check
 *   - Smoke test (first-symbol-from-atlas in-process buildBundle)
 *     per Q4.0.7 + Q4.4.1 + Q4.4.2 locks; A4 lazy-spawn validation
 *   - MCP registration (.mcp.json idempotent upsert) per Q4.0.10 +
 *     Q4.4.5 + Q4.4.6 locks
 *
 * Success message + exit-code-flip at Step 4.5 per Q4.2.6 framing.
 */
export async function runInitSubcommand(
  options: InitRunOptions,
): Promise<InitRunResult> {
  const writeStdout =
    options.writeStdout ?? ((c: string) => process.stdout.write(c));
  const detectLangs =
    options.detectLanguagesOverride ?? detectLanguagesFromFilesystem;
  const runChecks = options.collectChecksOverride ?? collectChecks;
  const runIndex =
    options.runIndexSubcommandOverride ?? runIndexSubcommand;

  // Architecture choice from --cc-only flag plumbing per Q4.0.5 +
  // Q4.0.11 + Q5 locks.
  const architecture: "anthropic-api-claude-code" | "claude-code-only" =
    options.ccOnly === true
      ? "claude-code-only"
      : "anthropic-api-claude-code";

  // Step 4.3 detect-then-scaffold reorder per Q4.3.4 lock.
  const detectedLanguages = detectLangs(options.configRoot);
  const languages: readonly LanguageCode[] =
    detectedLanguages.length > 0 ? detectedLanguages : ["typescript"];

  const scaffoldResult = writeConfigScaffold({
    configRoot: options.configRoot,
    architecture,
    languages,
    observe: options.observe === true,
  });
  log.info(
    scaffoldResult.status === "created"
      ? `init: config scaffold created at ${scaffoldResult.path}`
      : `init: existing config preserved at ${scaffoldResult.path}`,
    {
      architecture,
      languages: [...languages],
      observability: options.observe === true,
    },
  );

  // First doctor run (gateway check) per Q4.0.4 lock.
  const doctorResult = await runChecks(options.configRoot);

  // FAIL aborts init per Q4.0.4 + Q4.3.5 locks.
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

  // Routing decision per Q4.0.3 + Q4.3.2 locks.
  const route = decideRoute(doctorResult.checks);
  writeStdout(renderRouteMessage(route) + "\n");

  // Interactive paths exit cleanly per Q4.0.9 + Q4.3.5 locks.
  if (route.kind === "missing-adrs" || route.kind === "new-project") {
    return { exitCode: 0 };
  }

  // Automated paths: Step 4.4 atlas + smoke + MCP orchestration.
  const atlasPath = pathResolve(
    options.configRoot,
    ".contextatlas",
    "atlas.json",
  );

  // Q4.4.3 lock pre-check: skip extraction if atlas current with HEAD.
  const headSha = readHeadSha(options.configRoot);
  const atlasCurrent =
    headSha !== null &&
    (await detectAtlasOnlyAvailable(atlasPath, headSha)) !== null;

  if (atlasCurrent) {
    log.info("init: atlas already current with HEAD; skipping extraction.");
  } else {
    log.info("init: invoking atlas extraction (runIndexSubcommand).");
    const indexResult = await runIndex({
      configRoot: options.configRoot,
      configFile: options.configFile ?? null,
      full: false,
      json: false,
      contextatlasVersion: readContextAtlasVersion(),
    });
    // Q4.4.4 lock: any non-zero from runIndexSubcommand → init exit
    // code 1 (pass-through with init pipeline-failure semantics).
    if (indexResult.exitCode !== 0) {
      log.error(
        `init: atlas extraction failed (runIndexSubcommand exit code ` +
          `${indexResult.exitCode}); see error messages above; resolve ` +
          `and re-run \`contextatlas init\`.`,
      );
      return { exitCode: 1 };
    }
  }

  // Smoke test per Q4.0.7 + Q4.4.1 + Q4.4.2 locks.
  const smokeResult = await runSmokeTest({
    configRoot: options.configRoot,
    atlasPath: ".contextatlas/atlas.json",
    localCachePath: ".contextatlas/index.db",
  });
  if (smokeResult.status === "fail") {
    log.error(`init: smoke test failed — ${smokeResult.reason}`);
    // Q4.0.7 spec: exit code 2 for smoke-fail (post-atlas-but-smoke-
    // test-fail; distinct from setup-fail exit code 1).
    return { exitCode: 2 };
  }

  // MCP registration per Q4.0.10 + Q4.4.5 + Q4.4.6 locks.
  const mcpResult = upsertMcpRegistration({
    configRoot: options.configRoot,
    binaryPathOverride: options.resolveBinaryPathOverride,
  });

  // Step 4.5 success message + exit code flip per Q4.0.8 lock + [OK]
  // ASCII marker refinement + Q4.5.5 route-to-exit-code mapping.
  // Q4.2.6 fail-loudly framing finally lifted at Step 4.5 close.
  const successState: InitSuccessState = {
    scaffoldResult,
    atlasState: atlasCurrent
      ? {
          kind: "current",
          symbolCount: smokeResult.atlasSymbolCount,
        }
      : {
          kind: "extracted",
          symbolCount: smokeResult.atlasSymbolCount,
        },
    smokeResult: {
      symbolId: smokeResult.symbolId,
      symbolName: smokeResult.symbolName,
      symbolKind: smokeResult.symbolKind,
      claims: smokeResult.claims,
      references: smokeResult.references,
      durationMs: smokeResult.durationMs,
    },
    mcpResult,
    detectedLanguages: languages,
    warnings: route.kind === "automated-with-warning" ? route.warnings : [],
  };
  writeStdout(renderSuccessMessage(successState) + "\n");

  // Q4.5.5 lock: automated + automated-with-warning paths return
  // exit code 0 on success. Fail-loudly preserved-through-Step-4.4
  // per Q4.2.6 framing finally lifted at Step 4.5.
  return { exitCode: 0 };
}

/**
 * Render route-specific message for stdout. UX shape locked per
 * Q4.0.9 (sectioned routing decision + actionable guidance + re-run
 * instructions); wording substantive at Step 4.3 per Q4.3 Point 5
 * lock (refinement at Step 4.5 if cohort feedback warrants per
 * Q11-style pattern).
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
