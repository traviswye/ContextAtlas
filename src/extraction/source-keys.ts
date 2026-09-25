/**
 * Source-key classification (v1.2 Phase 1; F-4 fix).
 *
 * `source_shas` is one flat key space shared by three claim streams:
 *
 *   - **prose** — ADRs + docs globs, keyed by relPath
 *     (`docs/adr/ADR-06.md`). Written by the CLI pipeline (Stage 6)
 *     and the Skill Stream A.
 *   - **docstring** — one key per source file, keyed by the source
 *     relPath (`src/router.ts`). Written by the CLI pipeline (Stage 6c,
 *     `extractDocstringFile`; also the legacy `extractDocstringsForFile`)
 *     even when the file yields zero claims, and by the Skill Stream B.
 *   - **commit** — one key per extracted commit. The canonical key is
 *     `commit:<sha>` (v1.2 Phase 2, F-5 / lead decision L-2), used for
 *     both the `source_shas` key and `claims.source_path`, so
 *     `source_path == source`. Before v1.2 the `/index-atlas` Skill
 *     wrote the bare 40-hex sha as key and `source_path`; readers
 *     accept both forms permanently (installed SKILL.md copies are
 *     never overwritten), and {@link normalizeCommitKeys} rewrites the
 *     bare form to the canonical one.
 *
 * Stage 5 of the extraction pipeline must treat each stream by its
 * own deletion rule, so it needs to know which stream a key belongs
 * to. The primary signal is the `source` prefix of the claims stored
 * under that key; zero-claim keys use the stream this cache recorded
 * writing them (`source_key_streams`, v1.2 Phase 2 review fix), then
 * fall back to the prose walk and the key's shape.
 *
 * Kept small and free of pipeline state so the Phase 3 pending-source
 * queue can reuse it.
 */

import { posix } from "node:path";

import { log } from "../mcp/logger.js";
import {
  countClaimsBySourcePath,
  deleteClaimsBySourcePath,
  deleteSourceSha,
  getSourceSha,
  listClaimSourcesByPath,
  listSourceShas,
  reassignClaimsSourcePath,
  setSourceSha,
} from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";
import { listSourceKeyStreams } from "../storage/source-key-streams.js";
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

/** Prefix of the canonical commit key and of commit claims' `source`. */
export const COMMIT_KEY_PREFIX = "commit:";
const DOCSTRING_SOURCE_PREFIX = "docstring:";
/**
 * Legacy commit key format: the bare full-length sha the `/index-atlas`
 * Skill wrote before v1.2. Recognized permanently (F-5).
 */
const BARE_COMMIT_SHA = /^[0-9a-f]{40}$/i;

/**
 * Whether `key` has the legacy bare-sha shape (a full 40-hex sha). Shape
 * only: a bare key belongs to the commit stream when its claims are
 * commit claims or it has none (see {@link classifySourceKeys}).
 */
export function isBareCommitSha(key: string): boolean {
  return BARE_COMMIT_SHA.test(key);
}

/** Canonical `source_shas` key and `claims.source_path` for a commit. */
export function commitSourceKey(sha: string): string {
  return `${COMMIT_KEY_PREFIX}${sha}`;
}

/**
 * Whether a commit is already keyed as extracted, in either form: the
 * canonical `commit:<sha>` or the legacy bare sha, each mapping to the
 * sha itself. Commits are immutable, so a keyed commit's claims are
 * current and it is skipped.
 */
export function hasCommitKey(db: DatabaseInstance, sha: string): boolean {
  return (
    getSourceSha(db, commitSourceKey(sha)) === sha ||
    getSourceSha(db, sha) === sha
  );
}

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
   * The stream that wrote each zero-claim key, from this cache's
   * `source_key_streams` records ({@link recordedKeyStreams}). Checked
   * before `knownProsePaths`: the prose and docstring streams key a
   * file by the same relPath at the same SHA, so without it a zero-claim
   * key written by one stream looks unchanged to the other when
   * `docs.include` changes. Claims still win.
   */
  recordedStreams?: ReadonlyMap<string, SourceStream>;
  /**
   * relPaths the current prose walk produced. A zero-claim key found
   * here is prose even if its extension looks like source code (a
   * `docs.include` glob can match a `.ts` file). Claims and recorded
   * streams win.
   */
  knownProsePaths?: ReadonlySet<string>;
}

/**
 * Classify each key into a stream. Keys with claims use the claims'
 * `source` prefix (the most conservative stream wins if they differ);
 * zero-claim keys use `recordedStreams`, then `knownProsePaths`, then
 * the key shape.
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
    const recorded = options.recordedStreams?.get(key);
    if (claimed !== undefined) {
      out.set(key, claimed);
    } else if (recorded !== undefined) {
      out.set(key, recorded);
    } else if (options.knownProsePaths?.has(key)) {
      out.set(key, "prose");
    } else {
      out.set(key, classifySourceKeyShape(key, options));
    }
  }
  return out;
}

/**
 * The recorded writer stream of each key that still holds the SHA it
 * was recorded at (`source_key_streams`, cache-only). A key whose value
 * changed since has no entry. A rewrite that keeps the SHA (the other
 * stream keying the same file) is invisible here, so Stage 0 drops every
 * record when it imports an atlas.json this cache did not write or
 * import last (`atlas-baseline.ts`).
 */
export function recordedKeyStreams(
  db: DatabaseInstance,
  shas: Readonly<Record<string, string>>,
): Map<string, SourceStream> {
  const out = new Map<string, SourceStream>();
  for (const [key, rec] of listSourceKeyStreams(db)) {
    if (shas[key] === rec.sha) out.set(key, rec.stream);
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

/** What {@link normalizeCommitKeys} changed. All zero on a no-op. */
export interface CommitKeyNormalization {
  /** Commits found in the legacy bare-sha form (each now canonical). */
  readonly shasNormalized: number;
  /**
   * `source_shas` rows renamed from `<sha>` to `commit:<sha>`. A bare
   * key whose canonical key already exists is deleted, not counted.
   */
  readonly keysRewritten: number;
  /** Claims whose `source_path` moved from `<sha>` to `commit:<sha>`. */
  readonly claimsRewritten: number;
  /** Commits present in both forms; the `commit:<sha>` form was kept. */
  readonly duplicateShas: number;
  /** Bare-form claims deleted because the `commit:<sha>` form existed. */
  readonly duplicateClaimsDropped: number;
}

/**
 * F-5 migration (v1.2 Phase 2, lead decision L-2): bring every commit
 * stored under the legacy bare-sha form to the canonical
 * `commit:<sha>` form, rewriting both the `source_shas` key and
 * `claims.source_path` (classification, `deleteClaimsBySourcePath`,
 * orphan reports and the Skill's preserved-claim match all join on
 * `source_path`, so moving only the key would strand the claims).
 *
 * A bare key or claim path is migrated only when it is a 40-hex string
 * that {@link classifySourceKeys} places in the commit stream, so a
 * prose file that happens to have a 40-hex name is left alone.
 *
 * Both forms present for one sha: the `commit:<sha>` form wins. It
 * counts as present when its key or any claim under it exists. The
 * bare-form claims are deleted; the bare key is deleted, or renamed
 * when no canonical key exists yet so the commit stays keyed. The
 * count is logged as a warning.
 *
 * Idempotent and cheap on an already canonical atlas; the CLI runs it
 * on every `index`, because installed SKILL.md copies from before v1.2
 * keep writing the bare form. One transaction.
 */
export function normalizeCommitKeys(
  db: DatabaseInstance,
): CommitKeyNormalization {
  const run = db.transaction((): CommitKeyNormalization => {
    const shas = listSourceShas(db);
    const bare = new Set<string>();
    for (const key of Object.keys(shas)) {
      if (BARE_COMMIT_SHA.test(key)) bare.add(key);
    }
    for (const { sourcePath } of listClaimSourcesByPath(db)) {
      if (BARE_COMMIT_SHA.test(sourcePath)) bare.add(sourcePath);
    }

    let shasNormalized = 0;
    let keysRewritten = 0;
    let claimsRewritten = 0;
    let duplicateShas = 0;
    let duplicateClaimsDropped = 0;
    if (bare.size === 0) {
      return {
        shasNormalized,
        keysRewritten,
        claimsRewritten,
        duplicateShas,
        duplicateClaimsDropped,
      };
    }

    const streams = classifySourceKeys(db, [...bare].sort());
    for (const [sha, stream] of streams) {
      if (stream !== "commit") continue;
      shasNormalized++;
      const canonical = commitSourceKey(sha);
      const bareValue = shas[sha];
      const canonicalKeyed = shas[canonical] !== undefined;
      const canonicalPresent =
        canonicalKeyed || countClaimsBySourcePath(db, canonical) > 0;

      if (canonicalPresent) {
        duplicateShas++;
        duplicateClaimsDropped += deleteClaimsBySourcePath(db, sha);
      } else {
        claimsRewritten += reassignClaimsSourcePath(db, sha, canonical);
      }

      if (bareValue !== undefined) {
        deleteSourceSha(db, sha);
        if (!canonicalKeyed) {
          setSourceSha(db, canonical, bareValue);
          keysRewritten++;
        }
      }
    }
    return {
      shasNormalized,
      keysRewritten,
      claimsRewritten,
      duplicateShas,
      duplicateClaimsDropped,
    };
  });

  const out = run();
  if (out.duplicateShas > 0) {
    log.warn(
      "source-keys: commit(s) were stored in both the `commit:<sha>` and the " +
        "bare-sha form; kept the `commit:<sha>` claims and dropped the " +
        "bare-form duplicates. The bare form comes from an `/index-atlas` " +
        "Skill installed before v1.2: refresh it (delete " +
        "`.claude/skills/index-atlas/` and re-run `contextatlas init`) so " +
        "both paths write `commit:<sha>`.",
      {
        duplicateShas: out.duplicateShas,
        duplicateClaimsDropped: out.duplicateClaimsDropped,
      },
    );
  }
  if (out.shasNormalized > 0) {
    log.info("source-keys: normalized bare-sha commit keys to `commit:<sha>`", {
      ...out,
    });
  }
  return out;
}
