#!/usr/bin/env node
/**
 * Build-time generation of prompt .md artifacts from compiled .js
 * sources (v0.7 Step 2.3.a.0 — Path-γ Read-tool refactor substrate).
 *
 * Runs after `tsc` as part of the npm `build` script. Imports the
 * compiled EXTRACTION_PROMPT + GENERATE_ADRS_PROMPT constants from
 * dist/ and writes them as raw .md text files alongside the .js
 * modules. The shipped npm package includes these .md artifacts via
 * package.json `files` glob.
 *
 * Path-γ rationale: `contextatlas init` copies these artifacts into
 * the user's `.contextatlas/prompts/` directory; Claude Code skills
 * (`/index-atlas`, `/generate-adrs`) load them via the Read tool
 * against a predictable cwd-relative path. Avoids the bash-injection
 * permission gate that surfaced as FO-12/FO-13 substrate during Step
 * 2.3 Checkpoint 2 empirical verification.
 *
 * Source-of-truth invariant (CLAUDE.md frozen-prompt clarification):
 *   - `src/extraction/prompt.ts:EXTRACTION_PROMPT` is canonical
 *   - `src/generation/prompt.ts:GENERATE_ADRS_PROMPT` is canonical
 *   - The .md artifacts are DERIVED at build time; never edit them
 *     manually
 *   - Test substrate verifies artifact-vs-source parity
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = pathResolve(here, "..");

const extractionPromptModulePath = pathResolve(
  repoRoot,
  "dist/extraction/prompt.js",
);
const generationPromptModulePath = pathResolve(
  repoRoot,
  "dist/generation/prompt.js",
);

const extractionPromptOutputPath = pathResolve(
  repoRoot,
  "dist/extraction/prompt.md",
);
const generationPromptOutputPath = pathResolve(
  repoRoot,
  "dist/generation/prompt.md",
);

const extractionModule = await import(
  pathToFileURL(extractionPromptModulePath).href
);
const generationModule = await import(
  pathToFileURL(generationPromptModulePath).href
);

if (typeof extractionModule.EXTRACTION_PROMPT !== "string") {
  console.error(
    `generate-prompt-artifacts: EXTRACTION_PROMPT not a string in ${extractionPromptModulePath}`,
  );
  process.exit(1);
}
if (typeof generationModule.GENERATE_ADRS_PROMPT !== "string") {
  console.error(
    `generate-prompt-artifacts: GENERATE_ADRS_PROMPT not a string in ${generationPromptModulePath}`,
  );
  process.exit(1);
}

writeFileSync(
  extractionPromptOutputPath,
  extractionModule.EXTRACTION_PROMPT,
  "utf8",
);
writeFileSync(
  generationPromptOutputPath,
  generationModule.GENERATE_ADRS_PROMPT,
  "utf8",
);

console.log(
  `generate-prompt-artifacts: wrote ${extractionPromptOutputPath} (${extractionModule.EXTRACTION_PROMPT.length} chars)`,
);
console.log(
  `generate-prompt-artifacts: wrote ${generationPromptOutputPath} (${generationModule.GENERATE_ADRS_PROMPT.length} chars)`,
);
