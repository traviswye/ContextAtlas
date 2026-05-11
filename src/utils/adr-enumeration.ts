/**
 * Unified ADR file enumeration consumed by both state-detection
 * (src/doctor/checks/state-detection.ts) and the extraction pipeline
 * (src/extraction/file-walker.ts).
 *
 * Substrate-consistency fix per v0.7 Step 2.1.a FO-2: before this
 * module, state-detection used a strict Nygard-only regex while
 * extraction accepted any `.md`. The two code paths could disagree on
 * what counted as an ADR, producing the doctor false-WARN observed
 * against ContextAtlas-on-itself at Step 2.1 verification surface.
 *
 * Scope γ' (Travis substantive reframe at Step 2.1.a):
 *   - 3 naming conventions: Nygard, ADR-NN, Date
 *   - 2 file extensions: .md, .rst
 *   - Recursive walk capped at depth 2 (covers status-subdirectory
 *     patterns: drafts/, accepted/, rejected/, withdrawn/)
 *   - Format detection by extension for downstream parser dispatch
 */

import { readdirSync } from "node:fs";
import { extname, join as pathJoin } from "node:path";

export type AdrFormat = "md" | "rst";

export interface AdrFile {
  /** Absolute path to the file. */
  absPath: string;
  /** Base filename (no directory). */
  basename: string;
  /** Format inferred from extension. */
  format: AdrFormat;
}

/**
 * Maximum directory depth walked from the ADR root. Depth 0 = ADR root
 * itself; depth 1 = subdirectories (e.g., `drafts/`, `accepted/`);
 * depth 2 = nested below status subdirectory. Two is the empirical
 * cap that covers common status-subdirectory patterns without walking
 * arbitrarily deep.
 */
export const ADR_WALK_DEPTH_CAP = 2;

/**
 * Naming conventions accepted as ADRs. Each pattern matches one well-
 * established ADR filename convention seen in real-world repositories:
 *   - Nygard: `0001-name.md|rst` or shorter `0001.md` (Nygard's original)
 *   - ADR-NN: `ADR-01-name.md|rst` or shorter `ADR-01.md` (ContextAtlas + some others)
 *   - Date:   `2026-05-11-name.md|rst` or `2026-05-11.md` (date-prefixed log style)
 *
 * The trailing `-name` part is optional — Travis Step 2.1.a refinement
 * during fixture-rename surface review. Short forms (`ADR-01.md`) are
 * common enough in real ADR repos that requiring the descriptive
 * suffix would silently exclude legitimate ADRs.
 */
export const ADR_NAMING_PATTERNS: readonly RegExp[] = [
  /^\d{4}(-.+)?\.(md|rst)$/,
  /^ADR-\d+(-.+)?\.(md|rst)$/,
  /^\d{4}-\d{2}-\d{2}(-.+)?\.(md|rst)$/,
];

/**
 * True when a basename matches any of the supported ADR naming
 * conventions. Used by both enumeration and as a public predicate
 * for callers that need to classify a known path.
 */
export function matchesAdrNamingConvention(basename: string): boolean {
  return ADR_NAMING_PATTERNS.some((p) => p.test(basename));
}

/**
 * Walk `adrDir` recursively (up to ADR_WALK_DEPTH_CAP) and return all
 * files whose basename matches any of ADR_NAMING_PATTERNS. Hidden
 * files (dotfiles) are skipped. Non-existent `adrDir` returns an empty
 * array — empty-corpus is supported.
 *
 * Returned files are sorted by absolute path for deterministic
 * downstream ordering (atlas-json + state-detection messages don't
 * churn purely from filesystem ordering).
 */
export function enumerateAdrFiles(adrDir: string): AdrFile[] {
  const out: AdrFile[] = [];
  walkInto(adrDir, 0, out);
  out.sort((a, b) => (a.absPath < b.absPath ? -1 : a.absPath > b.absPath ? 1 : 0));
  return out;
}

function walkInto(dir: string, depth: number, out: AdrFile[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = pathJoin(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth < ADR_WALK_DEPTH_CAP) {
        walkInto(full, depth + 1, out);
      }
      continue;
    }
    if (!entry.isFile()) continue;
    if (!matchesAdrNamingConvention(entry.name)) continue;
    const ext = extname(entry.name).toLowerCase();
    const format: AdrFormat = ext === ".rst" ? "rst" : "md";
    out.push({ absPath: full, basename: entry.name, format });
  }
}
