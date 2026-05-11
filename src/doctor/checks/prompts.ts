/**
 * Prompt-artifact doctor checks (v0.7 Step 2.3.a.0 — Path-γ Read-tool
 * refactor substrate).
 *
 * Verifies that `.contextatlas/prompts/extraction.md` and
 * `.contextatlas/prompts/generate-adrs.md` exist in the user repo
 * and match the canonical prompt artifacts shipped in the currently-
 * installed contextatlas package (`<package>/dist/extraction/
 * prompt.md` + `<package>/dist/generation/prompt.md`).
 *
 * Failure modes surface as WARN (not FAIL): the CLI path doesn't
 * require these artifacts; only Claude Code skills (`/index-atlas`,
 * `/generate-adrs`) consume them via Read tool per the FO-12/FO-13
 * Path-γ Read-tool refactor.
 *
 *   - PASS: both artifacts exist and match package source byte-for-
 *     byte
 *   - WARN (missing): artifacts not yet created — run
 *     `contextatlas init` to regenerate
 *   - WARN (stale): artifacts exist but content drifted from package
 *     source (likely after `npm install -g contextatlas@latest`
 *     without re-running init); run `contextatlas init` to refresh
 *   - WARN (package-source-missing): the running contextatlas package
 *     does not ship the artifact (rare developer-source edge case
 *     without `npm run build`)
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CheckContext, DoctorCheck } from "../types.js";

/** Resolve `<package>/dist/` from this compiled module's location. */
function resolvePackageDistRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // here is `<package>/dist/doctor/checks/`; three levels up = dist/
  return pathResolve(here, "..", "..");
}

export function promptArtifactChecks(
  ctx: CheckContext,
  packageDistRootOverride?: string,
): DoctorCheck[] {
  const out: DoctorCheck[] = [];

  const promptsDir = pathResolve(
    ctx.repoRoot,
    ".contextatlas",
    "prompts",
  );
  const userExtractionPath = pathResolve(promptsDir, "extraction.md");
  const userGenerateAdrsPath = pathResolve(promptsDir, "generate-adrs.md");

  const userExtractionExists = existsSync(userExtractionPath);
  const userGenerateAdrsExists = existsSync(userGenerateAdrsPath);

  // 1. extraction.prompts_artifact_exists
  if (!userExtractionExists || !userGenerateAdrsExists) {
    const missing: string[] = [];
    if (!userExtractionExists) missing.push(".contextatlas/prompts/extraction.md");
    if (!userGenerateAdrsExists) missing.push(".contextatlas/prompts/generate-adrs.md");
    out.push({
      id: "extraction.prompts_artifact_exists",
      category: "extraction",
      status: "warn",
      message: `prompt artifact${missing.length === 1 ? "" : "s"} not found: ${missing.join(", ")}`,
      detail:
        "Claude Code skills (`/index-atlas`, `/generate-adrs`) load these artifacts via Read tool. Run `contextatlas init` to regenerate them from the installed contextatlas package.",
    });
    return out;
  }

  out.push({
    id: "extraction.prompts_artifact_exists",
    category: "extraction",
    status: "pass",
    message: ".contextatlas/prompts/{extraction,generate-adrs}.md present",
  });

  // 2. extraction.prompts_artifact_fresh — compare against package source
  const distRoot = packageDistRootOverride ?? resolvePackageDistRoot();
  const pkgExtractionPath = pathResolve(distRoot, "extraction", "prompt.md");
  const pkgGenerateAdrsPath = pathResolve(distRoot, "generation", "prompt.md");

  if (!existsSync(pkgExtractionPath) || !existsSync(pkgGenerateAdrsPath)) {
    out.push({
      id: "extraction.prompts_artifact_fresh",
      category: "extraction",
      status: "warn",
      message: "cannot verify freshness — package prompt artifact not found",
      detail:
        "The running contextatlas package does not ship the canonical prompt .md artifacts at the expected dist/ paths. Likely a developer-source install without `npm run build`. Run `npm run build` in the contextatlas package directory, OR reinstall via `npm install -g contextatlas`.",
    });
    return out;
  }

  const userExtraction = readFileSync(userExtractionPath, "utf8");
  const userGenerateAdrs = readFileSync(userGenerateAdrsPath, "utf8");
  const pkgExtraction = readFileSync(pkgExtractionPath, "utf8");
  const pkgGenerateAdrs = readFileSync(pkgGenerateAdrsPath, "utf8");

  const extractionStale = userExtraction !== pkgExtraction;
  const generateAdrsStale = userGenerateAdrs !== pkgGenerateAdrs;

  if (extractionStale || generateAdrsStale) {
    const drifted: string[] = [];
    if (extractionStale) drifted.push("extraction.md");
    if (generateAdrsStale) drifted.push("generate-adrs.md");
    out.push({
      id: "extraction.prompts_artifact_fresh",
      category: "extraction",
      status: "warn",
      message: `prompt artifact${drifted.length === 1 ? "" : "s"} drifted from installed package: ${drifted.join(", ")}`,
      detail:
        "Local prompt artifacts differ from the installed contextatlas package's canonical EXTRACTION_PROMPT/GENERATE_ADRS_PROMPT. Likely after a package upgrade without re-running init. Run `contextatlas init` to refresh.",
    });
    return out;
  }

  out.push({
    id: "extraction.prompts_artifact_fresh",
    category: "extraction",
    status: "pass",
    message: "prompt artifacts match installed package source",
  });

  return out;
}
