/**
 * Prompt-artifact copy for `contextatlas init` (v0.7 Step 2.3.a.0 —
 * Path-γ Read-tool refactor substrate).
 *
 * At init time, copies the canonical prompt artifacts shipped in the
 * contextatlas package (`dist/extraction/prompt.md` +
 * `dist/generation/prompt.md`, generated at build time from the .ts
 * source-of-truth) into the user repo's `.contextatlas/prompts/`
 * directory. Claude Code skills (`/index-atlas`, `/generate-adrs`)
 * load these via Read tool against a predictable cwd-relative path.
 *
 * Source artifacts (in the contextatlas package):
 *   - `<package>/dist/extraction/prompt.md` ← EXTRACTION_PROMPT
 *   - `<package>/dist/generation/prompt.md` ← GENERATE_ADRS_PROMPT
 *
 * Destination artifacts (in the user repo):
 *   - `<configRoot>/.contextatlas/prompts/extraction.md`
 *   - `<configRoot>/.contextatlas/prompts/generate-adrs.md`
 *
 * The copy is idempotent (overwrites existing files). Package version
 * upgrades should re-run `contextatlas init` to refresh artifacts;
 * doctor warns on artifact staleness (separate check).
 *
 * Per CLAUDE.md frozen-prompt invariant (v0.7 amendment): the prompt
 * substrate value is canonical (.ts source); the load mechanism
 * evolves (build-time .md → init-time copy → Read-tool consumption).
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface PromptArtifactCopyResult {
  /** Absolute path to user-repo `.contextatlas/prompts/extraction.md`. */
  readonly extractionMdPath: string;
  /** Absolute path to user-repo `.contextatlas/prompts/generate-adrs.md`. */
  readonly generateAdrsMdPath: string;
  /** True when `.contextatlas/prompts/` line was appended to .gitignore. */
  readonly gitignoreUpdated: boolean;
  /**
   * True when no `.gitignore` was found at configRoot — init does NOT
   * create one to avoid surprising users; informational only.
   */
  readonly gitignoreMissing: boolean;
}

/**
 * Resolve the contextatlas package's `dist/` directory relative to
 * this compiled module's location (`<package>/dist/init/
 * prompt-artifact-copy.js`). Walks up one level from `dist/init/` to
 * reach `dist/`.
 */
function resolvePackageDistRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // here is `<package>/dist/init/` after build; one level up = dist/
  return pathResolve(here, "..");
}

/**
 * Copy prompt artifacts from the contextatlas package's `dist/` into
 * the user repo's `.contextatlas/prompts/` directory and stamp the
 * user repo's `.gitignore` with the `.contextatlas/prompts/` entry
 * if a `.gitignore` exists.
 *
 * Test seam: `packageDistRootOverride` lets unit tests point at a
 * fixture directory instead of resolving from import.meta.url.
 */
export function copyPromptArtifacts(opts: {
  readonly configRoot: string;
  readonly packageDistRootOverride?: string;
}): PromptArtifactCopyResult {
  const distRoot = opts.packageDistRootOverride ?? resolvePackageDistRoot();
  const srcExtraction = pathResolve(distRoot, "extraction", "prompt.md");
  const srcGeneration = pathResolve(distRoot, "generation", "prompt.md");

  if (!existsSync(srcExtraction)) {
    throw new Error(
      `Prompt artifact missing at ${srcExtraction}. Reinstall contextatlas (artifact should ship with the package; run \`npm install -g contextatlas\` or rebuild from source via \`npm run build\`).`,
    );
  }
  if (!existsSync(srcGeneration)) {
    throw new Error(
      `Prompt artifact missing at ${srcGeneration}. Reinstall contextatlas (artifact should ship with the package; run \`npm install -g contextatlas\` or rebuild from source via \`npm run build\`).`,
    );
  }

  const promptsDir = pathResolve(opts.configRoot, ".contextatlas", "prompts");
  mkdirSync(promptsDir, { recursive: true });

  const destExtraction = pathResolve(promptsDir, "extraction.md");
  const destGeneration = pathResolve(promptsDir, "generate-adrs.md");

  copyFileSync(srcExtraction, destExtraction);
  copyFileSync(srcGeneration, destGeneration);

  const { updated, missing } = stampGitignore(opts.configRoot);

  return {
    extractionMdPath: destExtraction,
    generateAdrsMdPath: destGeneration,
    gitignoreUpdated: updated,
    gitignoreMissing: missing,
  };
}

/**
 * Append `.contextatlas/prompts/` to the user repo's `.gitignore` if
 * a `.gitignore` file exists at configRoot and the entry isn't
 * already present. Returns `{ updated, missing }` for caller logging.
 *
 * Does NOT create a `.gitignore` when absent — that would be a
 * surprising side-effect; users manage their own ignore policy.
 *
 * Match heuristic: substring scan for `.contextatlas/prompts` to
 * tolerate trailing slash / leading slash / wildcard variants the
 * user may already have written.
 */
function stampGitignore(configRoot: string): {
  readonly updated: boolean;
  readonly missing: boolean;
} {
  const gitignorePath = pathResolve(configRoot, ".gitignore");
  if (!existsSync(gitignorePath)) {
    return { updated: false, missing: true };
  }
  const existing = readFileSync(gitignorePath, "utf8");
  if (existing.includes(".contextatlas/prompts")) {
    return { updated: false, missing: false };
  }
  const suffix =
    (existing.endsWith("\n") ? "" : "\n") +
    "\n# ContextAtlas: regenerable prompt artifacts (per `contextatlas init`)\n" +
    ".contextatlas/prompts/\n";
  writeFileSync(gitignorePath, existing + suffix, "utf8");
  return { updated: true, missing: false };
}
