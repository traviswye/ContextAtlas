/**
 * Custom subset reStructuredText parser for ContextAtlas ADR ingestion.
 *
 * Approach (b) per v0.7 Step 2.1.a Q3 lock: target the ADR-relevant
 * rST surface rather than full spec compliance. Scope:
 *
 *   - Document title (first underlined line; optional overline)
 *   - Field list metadata at top of document (`:Field: value`)
 *   - Section headers via adornment-hierarchy (first-occurrence
 *     character determines level, bounded to top-level + one level
 *     of nesting; deeper nesting collapses to nearest-known level)
 *   - Plain text content within sections (paragraphs)
 *   - Inline hyperlink references (`text <url>`__ → `text (url)`)
 *
 * NOT supported (deliberately, per Scope γ' v0.7 envelope):
 *   - rST directives (`.. note::`, `.. code-block::`)
 *   - Substitution references
 *   - Footnotes, citations
 *   - Tables (simple + grid)
 *   - Transition lines
 *   - Roles, inline markup beyond literal/emphasis pass-through
 *
 * If a real-world ADR exercises features beyond the supported subset,
 * the parser falls back to plain-text passthrough rather than failing —
 * unsupported constructs end up as literal characters in section body
 * text, which the downstream LLM extractor can still reason about.
 *
 * Primary v0.7 consumer: `parseRstSymbols` mirrors
 * `parseFrontmatterSymbols` so that the extraction pipeline can pull
 * a `:symbols:` field list out of an rST ADR exactly the way it pulls
 * `symbols:` out of YAML frontmatter from a Markdown ADR.
 *
 * Secondary v0.7+ consumer: `parseRst` produces structured output
 * (`ParsedRst`) used by the generate-adrs reference-context feature
 * at Step 2.2.a per Path 1 scope expansion.
 */

export type RstFieldList = Readonly<Record<string, readonly string[]>>;

export interface RstSection {
  /** Section title text. */
  readonly title: string;
  /**
   * Adornment-hierarchy level. Level 1 = first adornment character
   * encountered; level 2 = second; deeper nesting collapses to the
   * nearest-known level per ADR-relevant-subset simplification.
   */
  readonly level: number;
  /** Raw paragraph text within the section, hyperlinks normalised. */
  readonly body: string;
}

export interface ParsedRst {
  /** Document title if a top-level adornment surfaces one. */
  readonly title?: string;
  /** Field list metadata captured from the document header block. */
  readonly fieldList: RstFieldList;
  /** Sections in document order. */
  readonly sections: readonly RstSection[];
}

/**
 * Mirror of `parseFrontmatterSymbols` for rST documents. Returns
 * `:symbols:` field-list values as an array of strings; empty array
 * when no `:symbols:` field is present or its values are not strings.
 *
 * Field-list `:symbols:` accepts either a single-line comma-separated
 * value or an indented multi-line list (one symbol per indented
 * `- name` entry) — both shapes are seen in the wild.
 */
export function parseRstSymbols(content: string): string[] {
  const { fieldList } = parseRst(content);
  const raw = fieldList["symbols"];
  if (raw === undefined) return [];
  return [...raw];
}

const ADORNMENT_CHARS = new Set([
  "=", "-", "~", "^", "+", "*", "#", '"', "'", "`",
]);

/**
 * Parse a reStructuredText document into a structured representation.
 * The parser is best-effort against the ADR-relevant subset declared
 * at the top of this module; unsupported constructs fall through as
 * plain text in section bodies.
 */
export function parseRst(content: string): ParsedRst {
  const lines = content.split(/\r?\n/);

  // --- Title detection -----------------------------------------------------
  // A title is either:
  //   - overline + text + underline of same character (rare in ADRs)
  //   - text + underline of single repeated character of equal-or-greater
  //     length on the next line
  let title: string | undefined;
  let cursor = 0;
  // Skip leading blank lines.
  while (cursor < lines.length && lines[cursor].trim() === "") cursor += 1;
  if (
    cursor + 1 < lines.length &&
    isAdornmentLine(lines[cursor]) &&
    cursor + 2 < lines.length &&
    lines[cursor + 1].trim() !== "" &&
    isAdornmentLine(lines[cursor + 2]) &&
    lines[cursor].trim()[0] === lines[cursor + 2].trim()[0]
  ) {
    // Overline form.
    title = lines[cursor + 1].trim();
    cursor += 3;
  } else if (
    cursor + 1 < lines.length &&
    lines[cursor].trim() !== "" &&
    isAdornmentLine(lines[cursor + 1]) &&
    lines[cursor + 1].trim().length >= lines[cursor].trim().length
  ) {
    title = lines[cursor].trim();
    cursor += 2;
  }

  // --- Field list (header block) -------------------------------------------
  // After the title (or from the top when no title), collect contiguous
  // `:field: value` lines, plus indented continuation values, until we
  // hit a blank line that's followed by non-field content.
  const fieldList = parseFieldListBlock(lines, cursor);
  cursor = fieldList.endIndex;

  // --- Sections ------------------------------------------------------------
  const sections: RstSection[] = [];
  const adornmentLevels = new Map<string, number>();

  let pending: { title: string; level: number; bodyLines: string[] } | undefined;

  while (cursor < lines.length) {
    const line = lines[cursor];
    // Heading detection: non-empty line followed by an adornment line of
    // equal-or-greater length.
    if (
      line.trim() !== "" &&
      cursor + 1 < lines.length &&
      isAdornmentLine(lines[cursor + 1]) &&
      lines[cursor + 1].trim().length >= line.trim().length
    ) {
      // Close previous section.
      if (pending !== undefined) {
        sections.push({
          title: pending.title,
          level: pending.level,
          body: normaliseBody(pending.bodyLines),
        });
      }
      const char = lines[cursor + 1].trim()[0];
      let level = adornmentLevels.get(char);
      if (level === undefined) {
        level = adornmentLevels.size + 1;
        adornmentLevels.set(char, level);
      }
      pending = { title: line.trim(), level, bodyLines: [] };
      cursor += 2;
      continue;
    }
    if (pending !== undefined) {
      pending.bodyLines.push(line);
    }
    cursor += 1;
  }
  if (pending !== undefined) {
    sections.push({
      title: pending.title,
      level: pending.level,
      body: normaliseBody(pending.bodyLines),
    });
  }

  return {
    ...(title !== undefined ? { title } : {}),
    fieldList: fieldList.values,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAdornmentLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2) return false;
  const first = trimmed[0];
  if (!ADORNMENT_CHARS.has(first)) return false;
  for (let i = 1; i < trimmed.length; i += 1) {
    if (trimmed[i] !== first) return false;
  }
  return true;
}

interface FieldListBlock {
  values: Record<string, string[]>;
  endIndex: number;
}

function parseFieldListBlock(lines: string[], start: number): FieldListBlock {
  const values: Record<string, string[]> = {};
  let i = start;
  // Skip blank lines before the field list.
  while (i < lines.length && lines[i].trim() === "") i += 1;

  let currentField: string | undefined;
  let currentValues: string[] = [];
  const flush = (): void => {
    if (currentField !== undefined && currentValues.length > 0) {
      values[currentField] = currentValues;
    }
    currentField = undefined;
    currentValues = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const match = /^:([^:]+):\s*(.*)$/.exec(line);
    if (match !== null && !line.startsWith(" ") && !line.startsWith("\t")) {
      flush();
      currentField = match[1].toLowerCase();
      const inlineValue = match[2].trim();
      if (inlineValue.length > 0) {
        // Comma-separated single-line list, e.g.
        //   :symbols: A, B, C
        currentValues = inlineValue
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
      } else {
        currentValues = [];
      }
      i += 1;
      continue;
    }
    if (currentField !== undefined && (line.startsWith(" ") || line.startsWith("\t"))) {
      // Indented continuation; treat each `- value` line as one entry,
      // otherwise append as raw value.
      const dashMatch = /^\s*-\s+(.*)$/.exec(line);
      if (dashMatch !== null) {
        const value = dashMatch[1].trim();
        if (value.length > 0) currentValues.push(value);
      } else if (trimmed.length > 0) {
        currentValues.push(trimmed);
      }
      i += 1;
      continue;
    }
    if (trimmed === "") {
      // Blank line — peek ahead: if next non-blank line is another field
      // entry, treat blank as a separator within the block; otherwise the
      // header block ends here.
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j += 1;
      if (j >= lines.length || !/^:[^:]+:/.test(lines[j])) {
        flush();
        return { values, endIndex: i };
      }
      i = j;
      continue;
    }
    // Non-field, non-blank line → end of header block.
    flush();
    return { values, endIndex: i };
  }
  flush();
  return { values, endIndex: i };
}

const INLINE_LINK_RE = /`([^`<]+?)\s*<([^>]+)>`__?/g;

function normaliseBody(bodyLines: readonly string[]): string {
  return bodyLines
    .join("\n")
    .replace(INLINE_LINK_RE, (_match, text, url) => `${String(text).trim()} (${String(url).trim()})`)
    .trim();
}
