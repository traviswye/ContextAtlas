/**
 * Symbol candidate resolver.
 *
 * Builds a single name → SymbolId[] inventory across all active language
 * adapters, then resolves each extraction candidate by exact name match.
 * Dotted-candidate resolution (e.g. `Class.method`) is intentionally NOT
 * implemented in MVP — the pre-scaffolding validation showed ~95% of
 * candidates are plain identifiers, and speculative resolution logic
 * adds risk without evidence of return. Revisit if benchmarks warrant.
 *
 * When a candidate matches symbols across multiple languages, we link
 * to all of them but log the crossover at debug level — useful signal
 * for benchmark analysis ("is the model hallucinating or is this a real
 * multi-language symbol?").
 */

import type {
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
  SymbolId,
} from "../types.js";
import { log } from "../mcp/logger.js";

import type { SourceFile } from "./file-walker.js";

export interface SymbolInventory {
  byName: Map<string, AtlasSymbol[]>;
  allSymbols: AtlasSymbol[];
}

export interface ResolverStats {
  resolved: number;
  unresolvedCandidates: string[];
  crossLanguageMatches: number;
}

/**
 * Build an inventory of all symbols across every active adapter.
 * For each source file found by walkSourceFiles, asks the corresponding
 * adapter (by extension) to enumerate its symbols, and stamps each
 * result with the file's SHA.
 */
export async function buildSymbolInventory(
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>,
  files: readonly SourceFile[],
): Promise<SymbolInventory> {
  const byName = new Map<string, AtlasSymbol[]>();
  const allSymbols: AtlasSymbol[] = [];

  for (const file of files) {
    const adapter = pickAdapter(adapters, file.absPath);
    if (!adapter) continue;
    let symbols: AtlasSymbol[];
    try {
      symbols = await adapter.listSymbols(file.absPath);
    } catch (err) {
      log.warn("resolver: listSymbols failed; skipping file", {
        path: file.relPath,
        err: String(err),
      });
      continue;
    }
    for (const sym of symbols) {
      const stamped: AtlasSymbol = { ...sym, fileSha: file.sha };
      allSymbols.push(stamped);
      const existing = byName.get(sym.name);
      if (existing) existing.push(stamped);
      else byName.set(sym.name, [stamped]);
    }
  }

  return { byName, allSymbols };
}

function pickAdapter(
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>,
  absPath: string,
): LanguageAdapter | null {
  for (const adapter of adapters.values()) {
    for (const ext of adapter.extensions) {
      if (absPath.endsWith(ext)) return adapter;
    }
  }
  return null;
}

/**
 * Resolve a single candidate name to zero or more canonical symbol IDs.
 * Returns an empty array if no match. Logs cross-language matches at
 * debug level.
 */
export function resolveCandidate(
  inventory: SymbolInventory,
  candidate: string,
): SymbolId[] {
  const matches = inventory.byName.get(candidate);
  if (!matches || matches.length === 0) return [];

  const ids = matches.map((m) => m.id);
  const languages = new Set(matches.map((m) => m.language));
  if (languages.size > 1) {
    log.debug("resolver: candidate matches across multiple languages", {
      candidate,
      languages: Array.from(languages),
      matchCount: matches.length,
    });
  }
  return ids;
}

/**
 * Resolve every candidate in a list, returning the deduplicated set of
 * symbol IDs plus the unresolved candidates (for diagnostics / logging).
 */
export function resolveCandidates(
  inventory: SymbolInventory,
  candidates: readonly string[],
): { symbolIds: SymbolId[]; unresolved: string[] } {
  const seen = new Set<SymbolId>();
  const unresolved: string[] = [];
  for (const candidate of candidates) {
    const ids = resolveCandidate(inventory, candidate);
    if (ids.length === 0) {
      unresolved.push(candidate);
      continue;
    }
    for (const id of ids) seen.add(id);
  }
  return { symbolIds: Array.from(seen), unresolved };
}
