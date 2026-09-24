/**
 * Source-key classification (v1.2 Phase 1; F-4 fix).
 *
 * `source_shas` is one flat key space shared by three claim streams:
 *
 *   - **prose** — ADRs + docs globs, keyed by relPath
 *     (`docs/adr/ADR-06.md`). Written by the CLI pipeline (Stage 6)
 *     and the Skill Stream A.
 *   - **docstring** — one key per source file, keyed by the source
 *     relPath (`src/router.ts`). Written by `extractDocstringsForFile`
 *     (even when the file yields zero claims) and the Skill Stream B.
 *   - **commit** — one key per extracted commit. Two formats exist
 *     (F-5): the CLI commit-message extractor uses `commit:<sha>`;
 *     the `/index-atlas` Skill uses the bare 40-hex sha. Both carry
 *     claim `source` = `commit:<sha>`.
 *
 * Stage 5 of the extraction pipeline must treat each stream by its
 * own deletion rule, so it needs to know which stream a key belongs
 * to. The primary signal is the `source` prefix of the claims stored
 * under that key; zero-claim keys fall back to the key's shape.
 *
 * Kept small and free of pipeline state so the Phase 3 pending-source
 * queue can reuse it.
 */

import { posix } from "node:path";

import { listClaimSourcesByPath } from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";
import type { LanguageCode } from "../types.js";

export type SourceStream = "prose" | "docstring" | "commit";

/**
 * File extensions of every registered language adapter, all languages
 * (not only the ones a given config enables). A docstring key stays
 * recognizable even when its language is not configured for a run.
 *
 * A copy, not an import: core modules must not import concrete
 * adapters (CLAUDE.md dependency direction). The `Record<LanguageCode,
 * …>` type fails compilation when a language is added without an
 * entry, and `src/adapters/registry.test.ts` pins each entry to the
 * adapter's own `extensions`.
 */
export const REGISTERED_LANGUAGE_EXTENSIONS: Readonly<
  Record<LanguageCode, readonly string[]>
> = {
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  python: [".py"],
  go: [".go"],
  ruby: [".rb"],
  csharp: [".cs"],
};

export const REGISTERED_SOURCE_EXTENSIONS: ReadonlySet<string> = new Set(
  Object.values(REGISTERED_LANGUAGE_EXTENSIONS).flat(),
);

/** CLI commit-message extractor key prefix (`commit:<sha>`). */
export const COMMIT_KEY_PREFIX = "commit:";
const DOCSTRING_SOURCE_PREFIX = "docstring:";
/** Skill Stream C key format: the bare full-length commit sha. */
const BARE_COMMIT_SHA = /^[0-9a-f]{40}$/i;

/**
 * Most-conservative-first ordering for keys whose claims disagree.
 * Commit keys are never deleted by Stage 5, docstring keys only when
 * their file is gone, prose keys whenever the prose walk misses them —
 * so a mixed key takes the rule that deletes least.
 */
const CONSERVATISM: Record<SourceStream, number> = {
  commit: 2,
  docstring: 1,
  prose: 0,
};

/** Stream implied by a claim's `source` field. */
export function streamFromClaimSource(source: string): SourceStream {
  if (source.startsWith(DOCSTRING_SOURCE_PREFIX)) return "docstring";
  if (source.startsWith(COMMIT_KEY_PREFIX)) return "commit";
  // `adr:<basename>` plus legacy pre-v0.7.2 names (`ADR-06`, `DESIGN`).
  return "prose";
}

export interface ClassifyShapeOptions {
  /** Extensions that mark a docstring key. Default: all registered adapters. */
  sourceExtensions?: ReadonlySet<string>;
}

/**
 * Fallback classification from the key alone (for keys with no claims).
 *   - `commit:<sha>` or a bare 40-hex sha → commit
 *   - a path whose extension belongs to a registered adapter → docstring
 *   - anything else → prose
 */
export function classifySourceKeyShape(
  key: string,
  options: ClassifyShapeOptions = {},
): SourceStream {
  if (key.startsWith(COMMIT_KEY_PREFIX) || BARE_COMMIT_SHA.test(key)) {
    return "commit";
  }
  const extensions = options.sourceExtensions ?? REGISTERED_SOURCE_EXTENSIONS;
  if (extensions.has(posix.extname(key))) return "docstring";
  return "prose";
}

export interface ClassifySourceKeysOptions extends ClassifyShapeOptions {
  /**
   * relPaths the current prose walk produced. A zero-claim key found
   * here is prose even if its extension looks like source code (a
   * `docs.include` glob can match a `.ts` file). Claims still win.
   */
  knownProsePaths?: ReadonlySet<string>;
}

/**
 * Classify each key into a stream. Keys with claims use the claims'
 * `source` prefix (the most conservative stream wins if they differ);
 * zero-claim keys use `knownProsePaths`, then the key shape.
 */
export function classifySourceKeys(
  db: DatabaseInstance,
  keys: readonly string[],
  options: ClassifySourceKeysOptions = {},
): Map<string, SourceStream> {
  const fromClaims = new Map<string, SourceStream>();
  for (const { sourcePath, source } of listClaimSourcesByPath(db)) {
    const stream = streamFromClaimSource(source);
    const prior = fromClaims.get(sourcePath);
    if (prior === undefined || CONSERVATISM[stream] > CONSERVATISM[prior]) {
      fromClaims.set(sourcePath, stream);
    }
  }

  const out = new Map<string, SourceStream>();
  for (const key of keys) {
    const claimed = fromClaims.get(key);
    if (claimed !== undefined) {
      out.set(key, claimed);
    } else if (options.knownProsePaths?.has(key)) {
      out.set(key, "prose");
    } else {
      out.set(key, classifySourceKeyShape(key, options));
    }
  }
  return out;
}

export interface SourceShaPartition {
  prose: Record<string, string>;
  docstring: Record<string, string>;
  commit: Record<string, string>;
}

/**
 * Split a source_shas map into per-stream maps (classification per
 * {@link classifySourceKeys}). Stage 2 diffs only the prose part
 * against the prose walk; Stage 5 applies each stream's own deletion
 * rule to the others.
 */
export function partitionSourceShas(
  db: DatabaseInstance,
  shas: Readonly<Record<string, string>>,
  options: ClassifySourceKeysOptions = {},
): SourceShaPartition {
  const out: SourceShaPartition = { prose: {}, docstring: {}, commit: {} };
  const streams = classifySourceKeys(db, Object.keys(shas), options);
  for (const [key, stream] of streams) out[stream][key] = shas[key]!;
  return out;
}
