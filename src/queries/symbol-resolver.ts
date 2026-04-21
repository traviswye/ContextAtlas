/**
 * Resolve a tool-level `symbol` input (either a full ID or a plain
 * name) to a canonical SymbolId, returning enough context for the
 * caller to disambiguate if necessary.
 *
 * Resolution rules:
 *   - Input starts with `sym:` → treated as an ID. Single lookup in
 *     storage; not-found if absent.
 *   - Otherwise treated as a name. Storage lookup by name, filtered by
 *     `fileHint` if supplied (prefix-match first, substring-fallback
 *     per user decision — substring-only has false-positive risk).
 *   - Zero matches after filtering → `not_found`.
 *   - One match → `resolved`.
 *   - Multiple matches → `disambiguation`, returning all candidates.
 */

import { getSymbol, getSymbolsByName } from "../storage/symbols.js";
import type { DatabaseInstance } from "../storage/db.js";
import type { Symbol as AtlasSymbol } from "../types.js";
import { normalizePath } from "../utils/paths.js";

export type ResolveResult =
  | { kind: "resolved"; symbol: AtlasSymbol }
  | { kind: "disambiguation"; candidates: AtlasSymbol[] }
  | { kind: "not_found"; input: string };

export interface ResolveOptions {
  fileHint?: string;
}

export function resolveSymbol(
  db: DatabaseInstance,
  input: string,
  options: ResolveOptions = {},
): ResolveResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { kind: "not_found", input };
  }

  if (trimmed.startsWith("sym:")) {
    const sym = getSymbol(db, trimmed);
    return sym
      ? { kind: "resolved", symbol: sym }
      : { kind: "not_found", input };
  }

  const candidates = getSymbolsByName(db, trimmed);
  if (candidates.length === 0) {
    return { kind: "not_found", input };
  }

  const hint = options.fileHint?.trim();
  if (!hint) {
    return candidates.length === 1
      ? { kind: "resolved", symbol: candidates[0]! }
      : { kind: "disambiguation", candidates };
  }

  const normalizedHint = normalizePath(hint);
  const prefixMatches = candidates.filter((c) =>
    c.path.startsWith(normalizedHint),
  );
  const matched =
    prefixMatches.length > 0
      ? prefixMatches
      : candidates.filter((c) => c.path.includes(normalizedHint));

  if (matched.length === 0) {
    // Hint narrowed to zero — surface the unfiltered candidates so the
    // caller can see what they were choosing from.
    return { kind: "disambiguation", candidates };
  }
  return matched.length === 1
    ? { kind: "resolved", symbol: matched[0]! }
    : { kind: "disambiguation", candidates: matched };
}
