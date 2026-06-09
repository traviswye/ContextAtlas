/**
 * CLI glue for the `contextatlas validate-adrs` subcommand (v0.7
 * Step 2.3.c.0 — β-bounded mechanical floor enforcement for ADR
 * depth per Travis Lock 1 + refinement adjudications).
 *
 * Reads `docs/adr/*.md` files (per config.adrs.path + Scope γ' walker
 * substrate). For each ADR, validates against canonical depth-floor
 * invariants:
 *
 *   - Frontmatter present with required fields (title, severity, symbols)
 *   - Canonical section headers (Context, Decision, Rationale, Consequences)
 *   - ≥2 symbol-with-line-number citations (file-path-symbol or
 *     file-path-line form)
 *   - ≥2 substantive Context paragraphs (each ≥3 sentences)
 *   - ≥2 distinct named alternatives with text content beyond label
 *     (alternatives-considered enumeration; harder-to-game than keyword
 *     matching per Travis lock)
 *   - ≥1 fenced code block
 *   - ≥3 distinct Rationale items
 *   - ≥3 distinct Consequences items
 *   - Line count ≤600 (hard fail with split-suggestion remediation per
 *     Travis lock; an ADR exceeding 600 lines is probably bundling
 *     multiple decisions)
 *
 * Used as MANDATORY GATE (Phase C) in /generate-adrs Skill workflow
 * between Phase B writing + Phase C completion reporting. Bounds the
 * cross-session-variance-pattern risk for ADR depth that text-only
 * SKILL.md prompt-tightening cannot mechanically enforce.
 *
 * Exit codes:
 *   0 — all ADRs pass; report summary to stdout
 *   2 — one or more ADRs fail; per-ADR remediation to stderr with
 *       actionable guidance
 */

import { readFileSync } from "node:fs";
import { relative as pathRelative, resolve as pathResolve } from "node:path";

import { loadConfig } from "../config/parser.js";
import { enumerateAdrFiles } from "../utils/adr-enumeration.js";

export type ValidateAdrsExitCode = 0 | 2;

export interface ValidateAdrsCliOptions {
  configRoot: string;
  configFile: string | null;
  /** Test seam: where validation report goes. */
  writeStdout?: (chunk: string) => void;
  /** Test seam: where validation errors go. */
  writeStderr?: (chunk: string) => void;
}

export interface ValidateAdrsCliResult {
  exitCode: ValidateAdrsExitCode;
  /** Per-ADR error map; empty when all pass. */
  errorsByFile: Record<string, readonly string[]>;
  adrsValidated: number;
}

const LINE_COUNT_CEILING = 600;

/** Minimum substantive bullet text length beyond the named-alternative label. */
const MIN_ALTERNATIVE_BODY_CHARS = 30;

/**
 * Run the `validate-adrs` subcommand. Never throws.
 */
export async function runValidateAdrsSubcommand(
  options: ValidateAdrsCliOptions,
): Promise<ValidateAdrsCliResult> {
  const writeStdout =
    options.writeStdout ?? ((chunk) => process.stdout.write(chunk));
  const writeStderr =
    options.writeStderr ?? ((chunk) => process.stderr.write(chunk));

  let config;
  try {
    config = options.configFile
      ? loadConfig(options.configRoot, options.configFile)
      : loadConfig(options.configRoot);
  } catch (err) {
    writeStderr(`validate-adrs: failed to load config: ${String(err)}\n`);
    return { exitCode: 2, errorsByFile: {}, adrsValidated: 0 };
  }

  const adrDir = pathResolve(options.configRoot, config.adrs.path);

  let adrFiles;
  try {
    adrFiles = enumerateAdrFiles(adrDir);
  } catch (err) {
    writeStderr(
      `validate-adrs: failed to enumerate ADR directory at ${config.adrs.path}: ${String(err)}\n`,
    );
    return { exitCode: 2, errorsByFile: {}, adrsValidated: 0 };
  }

  if (adrFiles.length === 0) {
    writeStderr(
      `validate-adrs: no ADR files found at ${config.adrs.path}. ` +
        `Run \`/generate-adrs\` (Skill) or \`contextatlas generate-adrs\` (CLI) ` +
        `to produce ADRs first.\n`,
    );
    return { exitCode: 2, errorsByFile: {}, adrsValidated: 0 };
  }

  const errorsByFile: Record<string, string[]> = {};
  for (const adrFile of adrFiles) {
    const content = readFileSync(adrFile.absPath, "utf8");
    const relPath = pathRelative(options.configRoot, adrFile.absPath).replace(
      /\\/g,
      "/",
    );
    const errors = validateAdrShape(content);
    if (errors.length > 0) {
      errorsByFile[relPath] = errors;
    }
  }

  if (Object.keys(errorsByFile).length === 0) {
    writeStdout(
      `validate-adrs: ${adrFiles.length} ADR${adrFiles.length === 1 ? "" : "s"} at ${config.adrs.path} all conform to canonical depth-floor invariants.\n`,
    );
    return { exitCode: 0, errorsByFile: {}, adrsValidated: adrFiles.length };
  }

  // Failure path — structured remediation to stderr.
  const failedCount = Object.keys(errorsByFile).length;
  writeStderr(
    `validate-adrs: ${failedCount} of ${adrFiles.length} ADR${adrFiles.length === 1 ? "" : "s"} at ${config.adrs.path} fail canonical depth-floor invariants.\n` +
      `\n` +
      `Specific remediation:\n`,
  );
  for (const [relPath, errors] of Object.entries(errorsByFile)) {
    writeStderr(`\n  ${relPath}:\n`);
    for (const err of errors) {
      writeStderr(`    - ${err}\n`);
    }
  }
  writeStderr(
    `\n` +
      `Refer to canonical ADR depth-quality examples in the GENERATE_ADRS_PROMPT\n` +
      `("Calibration examples — depth contrast" section) at\n` +
      `.contextatlas/prompts/generate-adrs.md, OR canonical ContextAtlas ADRs\n` +
      `at docs/adr/ in the contextatlas repo itself. Each failing invariant\n` +
      `corresponds to a depth gap the canonical examples illustrate.\n`,
  );

  return { exitCode: 2, errorsByFile, adrsValidated: adrFiles.length };
}

/**
 * Validate a single ADR's content against canonical depth-floor
 * invariants. Returns array of error strings (empty if all pass).
 */
export function validateAdrShape(content: string): string[] {
  const errors: string[] = [];
  const lines = content.split("\n");

  // 1. Line count ceiling (hard fail with split suggestion)
  if (lines.length > LINE_COUNT_CEILING) {
    errors.push(
      `Line count ${lines.length} exceeds ${LINE_COUNT_CEILING}-line ceiling. An ADR this large is probably bundling multiple architectural decisions — consider splitting into two narrower-scoped ADRs. (Hand-crafted reference ADRs in mature codebases occasionally exceed this; for Skill-generated ADRs the ceiling is a load-bearing scope discipline.)`,
    );
  }

  // 2. Frontmatter present + required fields
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter.present) {
    errors.push(
      `Frontmatter missing. Each ADR must open with a YAML frontmatter block (--- ... ---) containing at minimum: title (string), severity ("hard" | "soft" | "context"), symbols (array of canonical symbol names).`,
    );
  } else {
    if (!frontmatter.fields.title) {
      errors.push(`Frontmatter missing required field: title (string).`);
    }
    if (!frontmatter.fields.severity) {
      errors.push(
        `Frontmatter missing required field: severity. Must be one of "hard", "soft", "context".`,
      );
    }
    if (!frontmatter.fields.symbols) {
      errors.push(
        `Frontmatter missing required field: symbols (array of canonical symbol names this ADR is about).`,
      );
    }
  }

  // 3. Canonical section headers
  const sections = extractSections(content);
  for (const required of ["Context", "Decision", "Rationale", "Consequences"]) {
    if (!sections[required]) {
      errors.push(
        `Missing canonical section header "## ${required}". Each ADR must contain all four sections in order: Context, Decision, Rationale, Consequences.`,
      );
    }
  }

  // 4. Symbol-with-line-number citations (≥2)
  const symbolCitations = countSymbolCitations(content);
  if (symbolCitations < 2) {
    errors.push(
      `Only ${symbolCitations} symbol-with-line-number citation${symbolCitations === 1 ? "" : "s"} found; expected ≥2. ` +
        `Cite specific symbols using canonical form \`path/file.ext:SymbolName\` (e.g., \`src/router.ts:RegExpRouter\`) ` +
        `or \`path/file.ext:lineNumber\` (e.g., \`src/router.ts:98\`). An ADR without line-level grounding is shallow by definition.`,
    );
  }

  // 5. Substantive Context paragraphs (≥2 paragraphs, each ≥3 sentences)
  const contextSection = sections.Context;
  if (contextSection !== undefined) {
    const contextParaCount = countSubstantiveParagraphs(contextSection);
    if (contextParaCount < 2) {
      errors.push(
        `Context section has only ${contextParaCount} substantive paragraph${contextParaCount === 1 ? "" : "s"} (≥3 sentences each); expected ≥2. ` +
          `The Context section must establish stakes — what was the problem space, what constraints shaped the decision, what were the alternatives? Single-line summaries are insufficient.`,
      );
    }
  }

  // 6. Alternatives-considered enumeration (≥2 distinct named alternatives with substantive text)
  const altCheck = checkAlternativesConsidered(content);
  if (!altCheck.ok) {
    errors.push(altCheck.error!);
  }

  // 7. Fenced code blocks (≥1)
  const codeBlockCount = countFencedCodeBlocks(content);
  if (codeBlockCount < 1) {
    errors.push(
      `No fenced code blocks (\`\`\`) found; expected ≥1. ` +
        `Include at least one code snippet that illustrates the decision pattern in practice — a 3-15 line excerpt from the load-bearing implementation is substantively more useful than a verbal description of the same code.`,
    );
  }

  // 8. Rationale items (≥3)
  const rationaleSection = sections.Rationale;
  if (rationaleSection !== undefined) {
    const rationaleItems = countDistinctItems(rationaleSection);
    if (rationaleItems < 3) {
      errors.push(
        `Rationale section has only ${rationaleItems} distinct item${rationaleItems === 1 ? "" : "s"}; expected ≥3. ` +
          `Make multiple distinct cases for the decision (bullets or substantive paragraphs). Each item should name a concrete alternative or counterfactual.`,
      );
    }
  }

  // 9. Consequences items (≥3)
  const consequencesSection = sections.Consequences;
  if (consequencesSection !== undefined) {
    const consequencesItems = countDistinctItems(consequencesSection);
    if (consequencesItems < 3) {
      errors.push(
        `Consequences section has only ${consequencesItems} distinct item${consequencesItems === 1 ? "" : "s"}; expected ≥3. ` +
          `Surface concrete failure modes, review-time invariants, and downstream code-pattern impacts. Generic statements ("this enables flexibility") are not sufficient.`,
      );
    }
  }

  return errors;
}

interface ParsedFrontmatter {
  readonly present: boolean;
  readonly fields: Record<string, boolean>;
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  if (!content.startsWith("---")) {
    return { present: false, fields: {} };
  }
  // Find the closing ---
  const afterOpen = content.substring(4);
  const closeIdx = afterOpen.indexOf("\n---");
  if (closeIdx === -1) {
    return { present: false, fields: {} };
  }
  const block = afterOpen.substring(0, closeIdx);
  const fields: Record<string, boolean> = {};
  for (const line of block.split("\n")) {
    const m = /^(\w+)\s*:/.exec(line);
    if (m) fields[m[1]!] = true;
  }
  return { present: true, fields };
}

function extractSections(content: string): Record<string, string> {
  // Strip frontmatter
  let body = content;
  if (content.startsWith("---")) {
    const closeIdx = content.indexOf("\n---", 4);
    if (closeIdx !== -1) {
      body = content.substring(closeIdx + 4);
    }
  }
  // Match `## SectionName` headers + their content until next `## ` or EOF
  const sections: Record<string, string> = {};
  const lines = body.split("\n");
  let currentSection: string | null = null;
  let currentBody: string[] = [];
  for (const line of lines) {
    const m = /^## ([A-Z][\w\s]*?)\s*$/.exec(line);
    if (m) {
      if (currentSection !== null) {
        sections[currentSection] = currentBody.join("\n");
      }
      currentSection = m[1]!.trim();
      currentBody = [];
    } else if (currentSection !== null) {
      currentBody.push(line);
    }
  }
  if (currentSection !== null) {
    sections[currentSection] = currentBody.join("\n");
  }
  return sections;
}

/**
 * Count symbol-with-line-number citations in the ADR body. Recognizes:
 *   - file-path-symbol form: path/to/file.ext:SymbolName
 *   - file-path-line form: path/to/file.ext:lineNumber
 *   - inline-code-wrapped variants: `src/foo.ts:Bar`
 *
 * Accepts supported-adapter source extensions (.ts, .tsx, .mts, .cts,
 * .js, .jsx, .py, .go, .rb, .cs) + speculative future-adapter
 * extensions (.rs, .java, .cpp, .h, .hpp) + cross-references to
 * markdown (.md). The Symbol-name portion accepts identifier chars +
 * dot for dotted names. Path prefix accepts directory traversal
 * (slash-separated word chars).
 *
 * Maintenance discipline (v1.1.3+ cohort-UX inheritance): when adding
 * a new LanguageCode + adapter, append the adapter's primary file
 * extension(s) to this regex. Grep for `countSymbolCitations` to
 * verify single-source-of-truth. Inheritance from v1.1.1 (config
 * parser VALID_LANGUAGES gap) + v1.1.2 (skill files gap):
 * surface-inventory checklist for language ships should explicitly
 * include this regex.
 */
function countSymbolCitations(content: string): number {
  const pattern =
    /\b[\w.-]+(?:\/[\w.-]+)+\.(?:ts|tsx|mts|cts|js|jsx|py|go|rb|cs|rs|java|cpp|h|hpp|md):(?:[\w_$]+(?:\.[\w_$]+)*|\d+)/g;
  const matches = content.match(pattern);
  return matches ? new Set(matches).size : 0;
}

/**
 * Count substantive paragraphs in a section body. A paragraph is a
 * contiguous block of non-empty non-list-bullet lines, separated by
 * blank lines. Substantive = ≥3 sentence-terminating punctuation
 * marks (., !, ?). Skips lines that are pure bullet/numbered list
 * items (those count as list structure, not prose paragraphs).
 */
function countSubstantiveParagraphs(sectionBody: string): number {
  const lines = sectionBody.split("\n");
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const isBullet = /^[-*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
    if (trimmed === "" || isBullet) {
      if (current.length > 0) {
        paragraphs.push(current.join(" "));
        current = [];
      }
    } else {
      current.push(trimmed);
    }
  }
  if (current.length > 0) paragraphs.push(current.join(" "));

  let substantive = 0;
  for (const p of paragraphs) {
    const sentenceTerminators = (p.match(/[.!?](?:\s|$)/g) ?? []).length;
    if (sentenceTerminators >= 3) substantive += 1;
  }
  return substantive;
}

/**
 * Check the alternatives-considered enumeration discipline. Per
 * Travis tightening lock: ≥2 distinct named alternatives, each with
 * substantive text content beyond the bullet label. Detects bullet
 * blocks containing **bold-named-alternative**, \`code-named-alt\`,
 * or numbered-list-named alternatives with ≥MIN_ALTERNATIVE_BODY_CHARS
 * of body content following the name.
 */
function checkAlternativesConsidered(content: string): {
  ok: boolean;
  error?: string;
} {
  // Find a likely "alternatives" anchor in the body
  const altAnchorPatterns = [
    /alternatives?\s+considered/i,
    /considered\s+and\s+rejected/i,
    /alternatives?\s+rejected/i,
    /rejected\s+alternatives?/i,
    /(?:^|\n)\s*alternatives?\s*:/i,
  ];

  const lines = content.split("\n");
  let anchorIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (altAnchorPatterns.some((p) => p.test(lines[i] ?? ""))) {
      anchorIdx = i;
      break;
    }
  }

  if (anchorIdx === -1) {
    return {
      ok: false,
      error:
        'No alternatives-considered enumeration found. The ADR must name specific alternatives that were considered and rejected, with substantive text for each. Use a section header or bullet block prefaced with "Alternatives considered:" / "Considered and rejected:" — then enumerate ≥2 distinct named alternatives, each with explanation of what the alternative would have required and why it was rejected. Generic statements like "other approaches were considered" are not sufficient.',
    };
  }

  // Scan up to 50 lines after the anchor for bullet items with named alternatives
  let namedAlternativesWithSubstance = 0;
  const scanEnd = Math.min(anchorIdx + 50, lines.length);
  for (let i = anchorIdx + 1; i < scanEnd; i += 1) {
    const line = lines[i] ?? "";
    if (line.startsWith("## ")) break; // hit next section
    // Match bullet with named-alternative prefix: -/* + optional bold/code + label + colon/dash + substantive body
    // Patterns:
    //   - **Code generation**: adds a build step...
    //   - **Code generation** (OpenAPI → client): adds a build step...
    //   - `Code generation`: adds a build step...
    //   - 1. **Alternative name**: substantive content...
    const m =
      /^[\s]*(?:[-*]|\d+\.)\s+(?:\*\*([^*]+)\*\*|`([^`]+)`|_([^_]+)_)\s*(?:\([^)]*\))?\s*[:—-]\s*(.{20,})/.exec(
        line,
      );
    if (m) {
      const body = m[4] ?? "";
      if (body.trim().length >= MIN_ALTERNATIVE_BODY_CHARS) {
        namedAlternativesWithSubstance += 1;
      }
    }
  }

  if (namedAlternativesWithSubstance < 2) {
    return {
      ok: false,
      error:
        `Only ${namedAlternativesWithSubstance} named alternative${namedAlternativesWithSubstance === 1 ? "" : "s"} with substantive text content found; expected ≥2 distinct named alternatives. ` +
        `Use bullet format with bold or code-style label per alternative: "- **Code generation**: adds a build step, drifts from runtime schema, decouples server/client types..." Each alternative must have ≥${MIN_ALTERNATIVE_BODY_CHARS} chars of substantive explanation beyond the label. Keyword-only mentions ("Alternatives considered: none worth detailed enumeration") do NOT count.`,
    };
  }

  return { ok: true };
}

/** Count fenced code blocks (\`\`\` open + close pairs). */
function countFencedCodeBlocks(content: string): number {
  const matches = content.match(/^```/gm) ?? [];
  // Pairs of open + close; integer divide
  return Math.floor(matches.length / 2);
}

/**
 * Count distinct items in a section body. An "item" is either:
 *   - A bullet line (starts with - or *)
 *   - A numbered-list line (starts with N.)
 *   - A substantive paragraph (≥2 sentence-terminating marks)
 */
function countDistinctItems(sectionBody: string): number {
  const lines = sectionBody.split("\n");
  let bulletCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*]\s/.test(trimmed)) bulletCount += 1;
    else if (/^\d+\.\s/.test(trimmed)) bulletCount += 1;
  }
  // If we have bullets, count those; otherwise count substantive paragraphs
  if (bulletCount > 0) return bulletCount;
  return countSubstantiveParagraphs(sectionBody);
}
