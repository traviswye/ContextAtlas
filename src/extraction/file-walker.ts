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

import type { ContextAtlasConfig } from "../types.js";
import { normalizePath, toRelativePath } from "../utils/paths.js";

export type ProseBucket = "adr" | "doc";

export interface ProseFile {
  absPath: string;
  relPath: string;
  sha: string;
  bucket: ProseBucket;
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

export function walkProseFiles(
  repoRoot: string,
  config: Pick<ContextAtlasConfig, "adrs" | "docs">,
): ProseFile[] {
  const absRoot = pathResolve(repoRoot);
  const out: ProseFile[] = [];
  const seen = new Set<string>();

  // ADR bucket first — wins on overlap with docs.
  const adrAbsDir = pathResolve(absRoot, config.adrs.path);
  for (const absPath of listMarkdownRecursive(adrAbsDir)) {
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    out.push(makeProseFile(absPath, absRoot, "adr"));
  }

  // Then docs globs. `glob` supports `.github/...` via dot: true, but we
  // keep the default hidden-file behavior — users opt in by listing
  // them in `include` explicitly (glob matches them via literal path).
  for (const pattern of config.docs.include) {
    const matches = globSync(pattern, {
      cwd: absRoot,
      absolute: true,
      nodir: true,
      dot: true,
    });
    for (const absPath of matches) {
      if (seen.has(absPath)) continue;
      seen.add(absPath);
      out.push(makeProseFile(absPath, absRoot, "doc"));
    }
  }

  // Deterministic order by relPath so downstream logs and atlas diffs
  // don't churn purely because the filesystem returned a different walk.
  out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return out;
}

function listMarkdownRecursive(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // A configured adrs.path that doesn't exist is a user error we
    // should flag — but empty-corpus is a supported case, and walking
    // a non-existent dir when the user just hasn't created ADRs yet
    // shouldn't crash. Return empty and let the pipeline continue.
    if (code === "ENOENT") return out;
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = pathJoin(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listMarkdownRecursive(full));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      out.push(full);
    }
  }
  return out;
}

function makeProseFile(
  absPath: string,
  absRoot: string,
  bucket: ProseBucket,
): ProseFile {
  return {
    absPath,
    relPath: toRelativePath(normalizePath(absPath), normalizePath(absRoot)),
    sha: computeFileSha(absPath),
    bucket,
  };
}

// ---------------------------------------------------------------------------
// Source code walk (for symbol inventory)
// ---------------------------------------------------------------------------

export function walkSourceFiles(
  repoRoot: string,
  extensions: readonly string[],
): SourceFile[] {
  const absRoot = pathResolve(repoRoot);
  const extSet = new Set(extensions);
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
          out.push({
            absPath: full,
            relPath: toRelativePath(
              normalizePath(full),
              normalizePath(absRoot),
            ),
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
