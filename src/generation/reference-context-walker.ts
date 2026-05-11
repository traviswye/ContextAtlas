/**
 * Reference-context walker for the generate-adrs feature.
 *
 * Walks a user-configured reference-context path (per Travis Step
 * 2.1.a SECOND substantive reframe: reference context as PROMPT INPUT
 * rather than direct extraction substrate) using Scope γ' multi-
 * format substrate from Step 2.1.a (`src/utils/adr-enumeration.ts` +
 * `src/parsing/rst-parser.ts`).
 *
 * Output is concatenated into the GENERATE_ADRS_PROMPT input after
 * the codebase inventory. The LLM reasons over both inputs and
 * generates canonical ContextAtlas-format ADRs per the prompt
 * template.
 *
 * Per Lock 1 (v0.7 Step 2.2.a.2): γ user-configurable scope is the
 * primary inclusion mechanism. User narrows scope via the path they
 * pass to `--reference-context`. Token-counting + soft-warning at
 * 500k tokens is implemented in `cost-estimator.ts` (caller-side);
 * this walker just builds the text.
 */

import { readFileSync } from "node:fs";
import { relative as pathRelative, resolve as pathResolve } from "node:path";

import { enumerateAdrFiles } from "../utils/adr-enumeration.js";

export interface ReferenceContextOptions {
  /** Absolute path to the user-provided reference-context root. */
  referenceContextPath: string;
}

/**
 * Build the reference-context text representation. Returns an empty
 * string if no matching ADR files exist at the path — caller should
 * treat empty output as "no reference context to include" and skip
 * the reference-context section in the prompt entirely.
 *
 * The walker honors Scope γ' multi-format conventions (.md + .rst;
 * Nygard / ADR-NN / Date naming; recursive depth-2). Non-conforming
 * filenames at the reference root are skipped — same substrate
 * contract as state-detection + extraction (FO-2 fix from Step
 * 2.1.a).
 */
export function buildReferenceContext(
  options: ReferenceContextOptions,
): string {
  const absRoot = pathResolve(options.referenceContextPath);
  const files = enumerateAdrFiles(absRoot);
  if (files.length === 0) return "";

  const sections: string[] = [];
  sections.push(`## Reference context: ${absRoot}`);
  sections.push("");
  sections.push(
    `(${files.length} reference document(s); .md + .rst supported per Scope γ' v0.7 substrate)`,
  );
  sections.push("");

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file.absPath, "utf8");
    } catch {
      // Tolerate per-file read failures; surface the path with an
      // empty-content marker so the LLM at least sees the structural
      // signal that this file was meant to be reference context.
      content = "<file content unreadable>";
    }
    const relPath = pathRelative(absRoot, file.absPath).replace(/\\/g, "/");
    sections.push(`### ${relPath} (format: ${file.format})`);
    sections.push("");
    sections.push(content.trim());
    sections.push("");
  }

  return sections.join("\n");
}
