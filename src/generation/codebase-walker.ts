/**
 * Codebase walker for the generate-adrs feature.
 *
 * Produces a structured text representation of the codebase that gets
 * concatenated into the GENERATE_ADRS_PROMPT as INPUT. The shape is
 * intentionally token-efficient — file paths + top-level symbols +
 * architectural-narrative-rich documents (README.md + DESIGN.md +
 * CLAUDE.md) verbatim. Source file content is NOT included verbatim
 * (would explode token budget on large codebases); the LLM reasons
 * about decisions from the structural inventory + narrative docs.
 *
 * v0.7 Step 2.2.a.2 scope. v0.8+ candidate refinements:
 *   - Optionally include source-file content for small codebases
 *     where the structural inventory under-specifies decisions
 *   - Per-symbol JSDoc / docstring extraction for richer signal
 *   - Atlas-based augmentation (use existing claims from prior
 *     extraction to inform generation)
 */

import { readFileSync } from "node:fs";
import { join as pathJoin, resolve as pathResolve } from "node:path";

import { walkSourceFiles } from "../extraction/file-walker.js";
import type { LanguageAdapter, LanguageCode } from "../types.js";

/** Files at the repo root that almost always contain architectural narrative. */
const ARCHITECTURAL_NARRATIVE_ROOT_FILES = [
  "README.md",
  "DESIGN.md",
  "CLAUDE.md",
] as const;

export interface CodebaseInventoryOptions {
  /** Absolute path to the source root being analysed. */
  sourceRoot: string;
  /** Language adapters keyed by language code. */
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>;
  /** Configured language list (drives which extensions to walk). */
  languages: readonly LanguageCode[];
  /** Optional file-walk exclude patterns from config. */
  excludePatterns?: readonly string[];
}

/**
 * Build a token-efficient text representation of the codebase for the
 * GENERATE_ADRS_PROMPT input. Output shape:
 *
 *   ## Source files (TypeScript / Python / Go inventory)
 *
 *   src/index.ts
 *     - main
 *     - resolveContextatlasCommitSha
 *   src/cli-args.ts
 *     - parseArgs
 *     - USAGE
 *   ...
 *
 *   ## README.md
 *
 *   <verbatim content>
 *
 *   ## DESIGN.md
 *
 *   <verbatim content if present>
 *
 *   ## CLAUDE.md
 *
 *   <verbatim content if present>
 */
export async function buildCodebaseInventory(
  options: CodebaseInventoryOptions,
): Promise<string> {
  const sections: string[] = [];

  // Source-file + symbol inventory. Per-language; one line per file
  // with indented symbol names.
  for (const lang of options.languages) {
    const adapter = options.adapters.get(lang);
    if (adapter === undefined) continue;
    const files = walkSourceFiles(
      options.sourceRoot,
      adapter.extensions,
      options.excludePatterns ?? [],
    );
    if (files.length === 0) continue;
    const langLabel = lang.charAt(0).toUpperCase() + lang.slice(1);
    const lines: string[] = [`## Source files (${langLabel} inventory)`, ""];
    for (const file of files) {
      lines.push(file.relPath);
      try {
        const symbols = await adapter.listSymbols(file.absPath);
        for (const sym of symbols) {
          lines.push(`  - ${sym.name}`);
        }
      } catch {
        // Tolerate per-file listSymbols failure; the inventory still
        // surfaces the file path which is useful structural signal.
      }
    }
    sections.push(lines.join("\n"));
  }

  // Architectural-narrative root documents (verbatim).
  for (const filename of ARCHITECTURAL_NARRATIVE_ROOT_FILES) {
    const filePath = pathResolve(options.sourceRoot, filename);
    try {
      const content = readFileSync(filePath, "utf8");
      sections.push(`## ${filename}\n\n${content.trim()}`);
    } catch {
      // File not present; skip without surfacing — these are
      // common-but-not-required architectural-narrative locations.
    }
  }

  return sections.join("\n\n");
}

/** Exposed for tests + alternative-base composition. */
export function resolveNarrativeDocPath(
  sourceRoot: string,
  filename: string,
): string {
  return pathJoin(sourceRoot, filename);
}

/** Exported for test seam parity with other v0.7 modules. */
export { ARCHITECTURAL_NARRATIVE_ROOT_FILES };
