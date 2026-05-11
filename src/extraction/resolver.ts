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

/**
 * Expand a raw Skill-produced symbol candidate string into the ordered
 * list of name variants to try against the LSP-derived symbol
 * inventory (R8 name-form normalization per v0.7 Step 2.3.a.1).
 *
 * Skill-side reasoning produces candidates in heterogeneous forms:
 *   - `Console` — bare identifier (resolver MVP target form)
 *   - `rich/console.py:Console` — canonical file-path-symbol form
 *     (produced when reference-context substrate guides LLM toward
 *     ContextAtlas's canonical reference style per Step 2.2.b.ii
 *     observation)
 *   - `rich.console.Console` — Python dotted notation (Python
 *     standard import path style; produced under cold-start without
 *     reference context per Step 2.2.b.i observation; surfaced FO-10)
 *   - `Console.print` — method-on-class dotted form (catches the
 *     method; class lookup deferred to LSP follow-on if warranted)
 *
 * Returns variants in priority order; the resolver tries each variant
 * against the LSP inventory; first match wins. If no variant matches,
 * the raw candidate goes to the unresolved bucket per existing
 * resolveCandidates() contract.
 *
 * Empty strings + whitespace-only candidates return an empty array
 * (caller treats as unresolved). Variants are deduplicated.
 */
export function expandCandidateForms(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  const variants: string[] = [];
  const add = (v: string): void => {
    const t = v.trim();
    if (t.length > 0 && !variants.includes(t)) variants.push(t);
  };

  // 1. Raw form first — matches when Skill produced a bare identifier
  //    that's already in the resolver MVP target form.
  add(trimmed);

  // 2. Strip file-path prefix: `path/file.ext:Symbol` → `Symbol`.
  //    Canonical file-path-symbol form observed at Step 2.2.b.ii
  //    reference-context-aided generation. Split on rightmost `:`
  //    so symbols containing `::` (C++/Rust-style; not in MVP target
  //    languages but tolerated) still produce a sensible last segment.
  //    Use the colon-stripped result as basis for further dot
  //    stripping so file-path segments like `console.py` don't leak
  //    spurious variants like `py:Console`.
  let afterColon = trimmed;
  const colonIdx = trimmed.lastIndexOf(":");
  if (colonIdx > 0 && colonIdx < trimmed.length - 1) {
    afterColon = trimmed.substring(colonIdx + 1);
    add(afterColon);
  }

  // 3. Strip dotted prefix: `module.path.Symbol` → `Symbol`. Python
  //    standard import notation observed at Step 2.2.b.i cold-start
  //    generation surfaced FO-10. Also catches `Class.method` →
  //    `method` (caller's responsibility to interpret; resolver MVP
  //    matches by bare name only). Applied to the colon-stripped
  //    intermediate so `rich/console.py:Console.print` correctly
  //    yields `["rich/console.py:Console.print", "Console.print",
  //    "print"]`.
  const dotIdx = afterColon.lastIndexOf(".");
  if (dotIdx > 0 && dotIdx < afterColon.length - 1) {
    add(afterColon.substring(dotIdx + 1));
  }

  return variants;
}

/**
 * Resolve every candidate in a list using R8 name-form normalization
 * variants (v0.7 Step 2.3.a.1 — Skill→LSP symbol-resolution bridge).
 *
 * For each raw candidate, expands into the ordered list of name
 * variants via expandCandidateForms(); tries each variant against the
 * LSP-derived inventory; the first variant that resolves to one or
 * more SymbolIds wins. If no variant resolves, the raw candidate goes
 * to the unresolved bucket (preserved in atlas.json's
 * claims[].symbol_candidates field per R11 honest-scope-
 * acknowledgment discipline).
 *
 * Cross-language matches surface via the existing resolveCandidate()
 * debug log; this wrapper does not change cross-language behavior.
 */
export function resolveCandidatesWithNormalization(
  inventory: SymbolInventory,
  candidates: readonly string[],
): { symbolIds: SymbolId[]; unresolved: string[] } {
  const seen = new Set<SymbolId>();
  const unresolved: string[] = [];
  for (const raw of candidates) {
    const variants = expandCandidateForms(raw);
    if (variants.length === 0) {
      // Empty / whitespace-only candidate — preserve for diagnostic
      // visibility.
      unresolved.push(raw);
      continue;
    }
    let matched = false;
    for (const variant of variants) {
      const ids = resolveCandidate(inventory, variant);
      if (ids.length > 0) {
        for (const id of ids) seen.add(id);
        matched = true;
        break;
      }
    }
    if (!matched) unresolved.push(raw);
  }
  return { symbolIds: Array.from(seen), unresolved };
}
