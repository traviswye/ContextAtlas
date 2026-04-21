/**
 * Parse the `symbols:` field from a prose document's YAML frontmatter.
 *
 * ADRs (and some docs) declare the symbols they govern via frontmatter
 * like:
 *
 *   ---
 *   id: ADR-01
 *   symbols:
 *     - SymbolId
 *     - Symbol
 *     - LANG_CODES
 *   ---
 *
 * This declaration is author-intent that the extraction pipeline uses
 * as a resolver hint: every claim extracted from the document is
 * auto-linked to these symbols (if they exist in the codebase), which
 * closes the "ADR-01 prose says 'Symbol IDs' but the type is named
 * 'SymbolId'" recall gap observed in Phase B dogfooding.
 *
 * Malformed frontmatter YAML is a genuine misconfiguration and logs at
 * warn level. Missing fields or unresolvable entries are aspirational
 * and produce no user-visible noise — the pipeline just proceeds
 * without the hint.
 */

import yaml from "js-yaml";

import { log } from "../mcp/logger.js";

/**
 * Extract the frontmatter `symbols:` list. Returns an empty array when:
 *   - The content has no frontmatter block
 *   - The frontmatter has no `symbols:` field
 *   - The `symbols:` field isn't a list of strings
 *
 * Returns an empty array (and logs at warn level) when the frontmatter
 * block is present but its YAML fails to parse — that's a real
 * misconfiguration worth surfacing.
 */
export function parseFrontmatterSymbols(
  rawContents: string,
  sourcePath?: string,
): string[] {
  if (!rawContents.startsWith("---\n")) return [];
  const endIdx = rawContents.indexOf("\n---\n", 4);
  if (endIdx === -1) return [];

  const block = rawContents.slice(4, endIdx);
  let parsed: unknown;
  try {
    parsed = yaml.load(block);
  } catch (err) {
    log.warn(
      "pipeline: frontmatter YAML failed to parse; ignoring frontmatter symbols",
      { sourcePath, err: String(err) },
    );
    return [];
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }
  const symbols = (parsed as { symbols?: unknown }).symbols;
  if (!Array.isArray(symbols)) return [];
  return symbols.filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
}
