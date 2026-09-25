/**
 * Docstring stream, read side (v1.2 Phase 2): which symbols of a file
 * need a docstring extraction call, found with LSP requests only.
 *
 * The planning pass runs {@link readFileDocstrings} ahead of any model
 * call, so the cost preview can count docstring calls exactly, and
 * hands the result to `extractDocstringFile` (`docstring-stream.ts`)
 * so the file is not read twice. The legacy per-file entry point reads
 * through the same function, so both paths apply one filter chain:
 * {@link isExportedSymbol}, then a non-empty `getDocstring`.
 */

import type {
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
  SymbolId,
} from "../types.js";

/**
 * Per-language exported-symbol check.
 *
 * Go: first character uppercase (godoc convention). For
 * interface-method-flattened names like "Shape.Area", check the
 * trailing component (matches listSymbols' shape per ADR-14
 * §Decision 4).
 *
 * Python: `<module>` and dunder names count as exported; any other
 * leading-underscore name is private (PEP 8).
 *
 * TypeScript and every other language: permissive (always true). The
 * TS and Python adapters' `getDocstring` have returned real docstrings
 * since v0.3 Step 11; no TypeScript-specific export filter has been
 * added.
 */
export function isExportedSymbol(name: string, language: LanguageCode): boolean {
  if (language === "go") {
    const trailing = name.includes(".") ? name.split(".").pop() ?? name : name;
    return /^[A-Z]/.test(trailing);
  }
  if (language === "python") {
    // Module-level synthetic SymbolId per v0.3-SCOPE Stream B item 2 +
    // Step 11 Decision B (locked at scoping): always treated as exported.
    if (name === "<module>") return true;
    const trailing = name.includes(".") ? name.split(".").pop() ?? name : name;
    // Dunder methods (start AND end with __) are public API per Python
    // convention (e.g., __init__, __str__, __enter__).
    if (trailing.startsWith("__") && trailing.endsWith("__")) return true;
    // PEP 8: leading underscore = "private" convention. Filters single-
    // underscore prefixed names (`_helper`) and double-underscore name-
    // mangled names (`__name_mangled`, single-trailing).
    return !trailing.startsWith("_");
  }
  return true;
}

/**
 * Group symbols by `path`, keeping first-seen path order and each
 * file's listing order: the per-file unit this stream works in.
 */
export function groupSymbolsByPath(
  symbols: readonly AtlasSymbol[],
): Map<string, AtlasSymbol[]> {
  const byPath = new Map<string, AtlasSymbol[]>();
  for (const s of symbols) {
    const list = byPath.get(s.path);
    if (list) list.push(s);
    else byPath.set(s.path, [s]);
  }
  return byPath;
}

/**
 * One problem with one symbol's docstring. `symbolId` is null only for
 * a failure that belongs to the file as a whole (a write that failed
 * outside any one symbol's claims).
 */
export interface DocstringSymbolError {
  readonly symbolId: SymbolId | null;
  readonly error: string;
}

/** One exported symbol's non-empty docstring: one model call. */
export interface DocstringEntry {
  readonly symbolId: SymbolId;
  readonly docstring: string;
}

/** What {@link readFileDocstrings} found for one file's symbols. */
export interface FileDocstrings {
  /** Symbols considered (the file's listing). */
  readonly symbolsProcessed: number;
  /** Of those, exported per {@link isExportedSymbol}. */
  readonly symbolsExported: number;
  /** Exported symbols with a non-empty docstring, in listing order. */
  readonly entries: readonly DocstringEntry[];
  /** `getDocstring` failures. Any entry keeps the file from being replaced. */
  readonly errors: readonly DocstringSymbolError[];
}

/**
 * Read the docstrings of a file's exported symbols (LSP only, no model
 * call). A `getDocstring` failure is recorded and the read continues,
 * so the counts stay complete for the cost preview.
 */
export async function readFileDocstrings(
  adapter: LanguageAdapter,
  symbols: readonly AtlasSymbol[],
): Promise<FileDocstrings> {
  let symbolsExported = 0;
  const entries: DocstringEntry[] = [];
  const errors: DocstringSymbolError[] = [];
  for (const s of symbols) {
    // Scope filter per v0.3-SCOPE Stream B item 3: only doc comments on
    // exported declarations. The adapter exposes raw documentation; the
    // filter is applied here, before any LSP request.
    if (!isExportedSymbol(s.name, s.language)) continue;
    symbolsExported++;
    let docstring: string | null;
    try {
      docstring = await adapter.getDocstring(s.id);
    } catch (err) {
      errors.push({
        symbolId: s.id,
        error: `getDocstring failed for ${s.id}: ${String(err)}`,
      });
      continue;
    }
    if (!docstring || docstring.trim().length === 0) continue;
    entries.push({ symbolId: s.id, docstring });
  }
  return { symbolsProcessed: symbols.length, symbolsExported, entries, errors };
}
