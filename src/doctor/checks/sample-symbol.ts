/**
 * Sample symbol discovery helper for A6 deep LSP health check (v0.6
 * Step 3.2 per Q3.0.2 lock at v0.6 Step 3.0).
 *
 * Walks repo for first source file matching adapter extensions,
 * lists its symbols via adapter, returns first symbol for
 * findReferences traversal in deep health check. Per Q3.0.2 lock:
 * 1 symbol per language adapter detected; runtime discovery from
 * actual repo state (Adjudication 1 lock at v0.6 Step 3.2 surface
 * review; matches v0.5+ candidate #6 motivating example — gopls
 * workspace-load failure surfaces only when running against actual
 * user-repo state).
 */

import { readdirSync } from "node:fs";
import path from "node:path";

import type { LanguageAdapter, Symbol as AtlasSymbol } from "../../types.js";

/**
 * Directories to skip during walk. Follows project conventions
 * (node_modules per CLAUDE.md dependencies-minimize principle;
 * .git per source-control convention; common build/output dirs).
 */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".contextatlas",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  "target", // Rust / sometimes Java
]);

/**
 * Maximum directory walk depth. Doctor runs on user repos which can
 * be large; one sample symbol is sufficient per Q3.0.2 lock; deep
 * walk wastes time. Most repos have source files within 4 levels of
 * root (e.g., src/foo/bar/baz.ts).
 */
const MAX_WALK_DEPTH = 4;

/**
 * Returns first source file + first symbol matching adapter.extensions
 * found via repo walk; null if no eligible file/symbol found.
 *
 * Returning null is normal operating state (warns in doctor verbose
 * output rather than fails) — empty repo / new project / pre-extraction
 * state where adapter.listSymbols hasn't anything to return.
 */
export async function findSampleSymbol(
  adapter: LanguageAdapter,
  repoRoot: string,
): Promise<{ file: string; symbol: AtlasSymbol } | null> {
  const candidates = walkForSourceFiles(
    repoRoot,
    new Set(adapter.extensions),
    MAX_WALK_DEPTH,
  );

  for (const file of candidates) {
    let symbols: AtlasSymbol[];
    try {
      symbols = await adapter.listSymbols(file);
    } catch {
      continue; // skip file if adapter throws on listSymbols
    }
    if (symbols.length > 0) {
      return { file, symbol: symbols[0]! };
    }
  }

  return null;
}

/**
 * Walks repoRoot for source files matching extensions, up to maxDepth
 * deep. Returns paths relative to repoRoot per LSP adapter convention.
 * Synchronous walk for simplicity; deep health check is doctor-time
 * (interactive) not server-runtime so wall-clock cost negligible.
 */
function walkForSourceFiles(
  repoRoot: string,
  extensions: Set<string>,
  maxDepth: number,
): string[] {
  const out: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.has(ext)) {
          // Path relative to repoRoot per LSP adapter convention
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(repoRoot, fullPath);
          // Normalize to forward slashes per project convention
          out.push(relPath.split(path.sep).join("/"));
        }
      }
    }
  }

  walk(repoRoot, 0);
  return out;
}
