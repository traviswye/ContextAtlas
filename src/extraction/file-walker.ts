/**
 * File discovery + SHA computation for the extraction pipeline.
 *
 * Two kinds of walks:
 *   - `walkProseFiles` — ADRs + additional docs, for intent extraction.
 *     ADR files win over doc-glob files when both match.
 *   - `walkSourceFiles` — code files by adapter extension, used to build
 *     the symbol inventory.
 *
 * All paths in returned records are repo-relative forward-slash
 * (via normalizePath) so they match the shapes stored in atlas.json
 * and SQLite.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join as pathJoin, resolve as pathResolve } from "node:path";

import { globSync } from "glob";
import { Minimatch } from "minimatch";

import type { ContextAtlasConfig } from "../types.js";
import {
  enumerateAdrFiles,
  type AdrFormat,
} from "../utils/adr-enumeration.js";
import { normalizePath, toRelativePath } from "../utils/paths.js";

export type ProseBucket = "adr" | "doc";

export interface ProseFile {
  absPath: string;
  relPath: string;
  sha: string;
  bucket: ProseBucket;
  /**
   * File format inferred from extension. Present on ADR-bucket files
   * (where Scope γ' walking accepts .md + .rst); doc-bucket files are
   * treated as Markdown via the existing glob path.
   */
  format?: AdrFormat;
}

export interface SourceFile {
  absPath: string;
  relPath: string;
  sha: string;
}

export interface ShaDiff {
  /** Files on disk with a different SHA from the committed baseline. */
  changed: ProseFile[];
  /** Files on disk matching the committed baseline; extraction can skip. */
  unchanged: ProseFile[];
  /** Files present on disk but absent from the committed baseline. */
  added: ProseFile[];
  /**
   * Source paths that were in the committed baseline but no longer on disk.
   * Their claims should be deleted and their source_shas entry removed.
   */
  deleted: string[];
}

const SOURCE_EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".contextatlas",
  "coverage",
  ".vscode",
  ".idea",
]);

// ---------------------------------------------------------------------------
// SHA helpers
// ---------------------------------------------------------------------------

export function computeFileSha(absPath: string): string {
  const content = readFileSync(absPath);
  return createHash("sha256").update(content).digest("hex");
}

export function diffShas(
  current: readonly ProseFile[],
  committed: Readonly<Record<string, string>>,
): ShaDiff {
  const currentByPath = new Map<string, ProseFile>();
  for (const f of current) currentByPath.set(f.relPath, f);

  const changed: ProseFile[] = [];
  const unchanged: ProseFile[] = [];
  const added: ProseFile[] = [];

  for (const file of current) {
    const baseline = committed[file.relPath];
    if (baseline === undefined) {
      added.push(file);
    } else if (baseline === file.sha) {
      unchanged.push(file);
    } else {
      changed.push(file);
    }
  }

  const deleted: string[] = [];
  for (const path of Object.keys(committed)) {
    if (!currentByPath.has(path)) deleted.push(path);
  }

  return { changed, unchanged, added, deleted };
}

// ---------------------------------------------------------------------------
// Prose walk (ADRs + doc globs)
// ---------------------------------------------------------------------------

/**
 * Walk prose files (ADRs + doc globs). Paths in returned records are
 * stored relative to the most useful base:
 *   - If the prose file resolves UNDER `sourceRoot`: relative to
 *     `sourceRoot` (backward compat with all existing atlases).
 *   - If it resolves OUTSIDE `sourceRoot`: relative to the bucket's
 *     natural base — the ADR directory for ADR-bucket files,
 *     `configRoot` for docs-bucket files.
 *
 * `configRoot` is the resolution base for `adrs.path` and
 * `docs.include` glob patterns — i.e. where `.contextatlas.yml`
 * lives. Defaults to `sourceRoot`, preserving the common case where
 * config sits in the source root. See ADR-08 for the external-ADRs
 * architecture that motivated the separation.
 */
export function walkProseFiles(
  sourceRoot: string,
  config: Pick<ContextAtlasConfig, "adrs" | "docs">,
  configRoot?: string,
): ProseFile[] {
  const absSourceRoot = pathResolve(sourceRoot);
  const absConfigRoot =
    configRoot !== undefined ? pathResolve(configRoot) : absSourceRoot;
  const out: ProseFile[] = [];
  const seen = new Set<string>();

  // ADR bucket first — wins on overlap with docs. Resolved against
  // configRoot so external-ADR setups (adrs.path starting with /, or
  // traversing ../) work per ADR-08.
  //
  // Enumeration via unified adr-enumeration module (v0.7 Step 2.1.a
  // Scope γ' lock): 3 naming conventions × .md + .rst; recursive walk
  // capped at depth 2. Non-conforming `.md` files (e.g., probe-
  // findings notes whose basename doesn't match an ADR convention)
  // fall through to the docs-bucket glob below if `docs.include`
  // covers them.
  const adrAbsDir = pathResolve(absConfigRoot, config.adrs.path);
  for (const adrFile of enumerateAdrFiles(adrAbsDir)) {
    if (seen.has(adrFile.absPath)) continue;
    seen.add(adrFile.absPath);
    out.push({
      absPath: adrFile.absPath,
      relPath: proseRelPath(adrFile.absPath, absSourceRoot, adrAbsDir),
      sha: computeFileSha(adrFile.absPath),
      bucket: "adr",
      format: adrFile.format,
    });
  }

  // Docs globs — evaluated relative to configRoot (not sourceRoot) so
  // that a config living outside the source root still resolves
  // README.md and similar to files next to itself rather than files
  // inside the cloned source. Common case (configRoot === sourceRoot)
  // is unchanged.
  for (const pattern of config.docs.include) {
    const matches = globSync(pattern, {
      cwd: absConfigRoot,
      absolute: true,
      nodir: true,
      dot: true,
    });
    for (const absPath of matches) {
      if (seen.has(absPath)) continue;
      seen.add(absPath);
      out.push({
        absPath,
        relPath: proseRelPath(absPath, absSourceRoot, absConfigRoot),
        sha: computeFileSha(absPath),
        bucket: "doc",
      });
    }
  }

  // Deterministic order by relPath so downstream logs and atlas diffs
  // don't churn purely because the filesystem returned a different walk.
  out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return out;
}

/**
 * Compute the stored relPath for a prose file (ADR or doc).
 *
 * Scoped-relaxation helper: keeps `toRelativePath`'s strict
 * under-root enforcement for source files (ADR-01 security
 * invariant) while letting prose files live outside the source
 * root when explicitly configured to (ADR-08).
 *
 * - File path resolves UNDER `sourceRoot` → return relative to
 *   `sourceRoot`. Backward-compat with existing atlases.
 * - File path resolves OUTSIDE `sourceRoot` → return relative to
 *   `fallbackBase`. The bucket-appropriate base (ADR dir for
 *   ADR-bucket files, configRoot for docs-bucket files).
 *
 * Not exported from `src/utils/paths.ts` — this is file-walker-local
 * so the weakening doesn't accidentally apply to any future
 * source-file code path.
 */
function proseRelPath(
  absProsePath: string,
  absSourceRoot: string,
  absFallbackBase: string,
): string {
  const normalizedProse = normalizePath(absProsePath);
  const normalizedSourceRoot = normalizePath(absSourceRoot);
  const sourceRootWithSep = normalizedSourceRoot.endsWith("/")
    ? normalizedSourceRoot
    : normalizedSourceRoot + "/";
  if (
    normalizedProse === normalizedSourceRoot ||
    normalizedProse.startsWith(sourceRootWithSep)
  ) {
    return toRelativePath(normalizedProse, normalizedSourceRoot);
  }
  return toRelativePath(normalizedProse, normalizePath(absFallbackBase));
}

// ---------------------------------------------------------------------------
// Source code walk (for symbol inventory)
// ---------------------------------------------------------------------------

/**
 * Walk source files for symbol-inventory construction.
 *
 * `excludePatterns` (v0.4 Step 2 / A4) is an array of minimatch
 * globs evaluated against repo-relative forward-slash paths. Files
 * matching ANY pattern are dropped from the result. Patterns are
 * pre-compiled once before walk for O(n_patterns) per-file check.
 *
 * Empty / omitted `excludePatterns` preserves v0.3 behavior (no
 * extraction-time filtering beyond `SOURCE_EXCLUDE_DIRS`).
 */
export function walkSourceFiles(
  repoRoot: string,
  extensions: readonly string[],
  excludePatterns: readonly string[] = [],
): SourceFile[] {
  const absRoot = pathResolve(repoRoot);
  const extSet = new Set(extensions);
  const matchers = excludePatterns.map(
    (p) => new Minimatch(p, { dot: true }),
  );
  const isExcluded = (relPath: string): boolean =>
    matchers.some((m) => m.match(relPath));
  const out: SourceFile[] = [];

  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith(".")) continue;
      const full = pathJoin(dir, name);
      if (entry.isDirectory()) {
        if (SOURCE_EXCLUDE_DIRS.has(name)) continue;
        walk(full);
      } else if (entry.isFile() && extSet.has(extname(name))) {
        try {
          const stat = statSync(full);
          if (!stat.isFile()) continue;
          const relPath = toRelativePath(
            normalizePath(full),
            normalizePath(absRoot),
          );
          if (isExcluded(relPath)) continue;
          out.push({
            absPath: full,
            relPath,
            sha: computeFileSha(full),
          });
        } catch {
          // Skip unreadable files.
        }
      }
    }
  };
  walk(absRoot);

  out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return out;
}
