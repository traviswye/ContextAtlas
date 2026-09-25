/**
 * Extraction planning (v1.2 Phase 2): what each claim stream will
 * extract this run, decided before the first model call so the cost
 * preview can count the calls exactly and Phase 3 can enqueue from the
 * same plan.
 *
 * No model calls and no database writes happen here. The docstring
 * plan reads docstrings through the language adapters (LSP only) and
 * hands the result to Stage 6c, so no file is read twice; the commit
 * plan runs `git log` once.
 *
 *   - prose (`adr`): Stage 2's changed + added files (planned in
 *     `pipeline.ts`, unchanged since v0.1).
 *   - docstring: walked source files whose SHA differs from the
 *     baseline key (or every listed file under `--full`, L-7). A file
 *     whose `listSymbols` failed this run is skipped: its stored
 *     symbols and claims are unverified, and its key is kept.
 *   - commit: filter-passing commits from `git log --no-merges` minus
 *     those already keyed in either form, only when the git signal
 *     found a HEAD (L-10 iv). `--full` does not re-extract commits.
 */

import { posix } from "node:path";

import { log } from "../mcp/logger.js";
import type { DatabaseInstance } from "../storage/db.js";
import type {
  ExtractionStream,
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
} from "../types.js";

import {
  makeDefaultCommitFilter,
  parseCommitLog,
  type CommitMetadata,
} from "./commit-log.js";
import {
  groupSymbolsByPath,
  readFileDocstrings,
  type FileDocstrings,
} from "./docstring-read.js";
import type { ProseFile, SourceFile } from "./file-walker.js";
import type { SymbolInventoryWithCoverage } from "./resolver.js";
import { hasCommitKey } from "./source-keys.js";

/** One docstring file Stage 6c will (re-)extract. */
export interface PlannedDocstringFile {
  readonly relPath: string;
  /** Current file SHA, pinned as the key when the file is stored. */
  readonly sha: string;
  readonly adapter: LanguageAdapter;
  /** The file's Stage 3 listing. */
  readonly symbols: readonly AtlasSymbol[];
  /** The zero-API docstring read, reused by Stage 6c. */
  readonly docstrings: FileDocstrings;
}

export interface DocstringWorkPlan {
  /** Files to (re-)extract, in walk order. Includes zero-docstring files. */
  readonly files: readonly PlannedDocstringFile[];
  /** Walked, listed files skipped because their SHA matches the key. */
  readonly filesUnchanged: number;
  /**
   * Model calls the files need: one per documented exported symbol, in
   * files whose docstrings were all read (a file with a failed read
   * makes no call).
   */
  readonly calls: number;
}

export type CommitWorkPlan =
  | {
      readonly status: "planned";
      /** Filter-passing commits not yet keyed, `git log` order. */
      readonly pending: readonly CommitMetadata[];
      /** Commits that passed the filter. */
      readonly filtered: number;
      /** Of those, already keyed in either form. */
      readonly skippedIdempotent: number;
    }
  | { readonly status: "skipped"; readonly reason: string };

/** Everything the extraction stages will do this run. */
export interface ExtractionPlan {
  readonly streams: ReadonlySet<ExtractionStream>;
  /** Prose files to extract; empty when `adr` is disabled. */
  readonly prose: readonly ProseFile[];
  /** Null when the docstring stream is disabled. */
  readonly docstring: DocstringWorkPlan | null;
  /** Null when the commit stream is disabled. */
  readonly commit: CommitWorkPlan | null;
}

/** Model calls the plan will make (prose files + docstrings + commits). */
export function plannedCallCount(plan: ExtractionPlan): number {
  return (
    plan.prose.length +
    (plan.docstring?.calls ?? 0) +
    (plan.commit?.status === "planned" ? plan.commit.pending.length : 0)
  );
}

export interface PlanDocstringInput {
  sourceFiles: readonly SourceFile[];
  inventory: SymbolInventoryWithCoverage;
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>;
  /** The docstring part of the source_shas baseline (relPath → SHA). */
  baseline: Readonly<Record<string, string>>;
  /** `--full`: plan every listed file whatever its key says. */
  full: boolean;
  /**
   * relPaths the prose walk produced. A source file that is also a
   * prose file (a `docs.include` glob matching code) is not a docstring
   * source: both streams key by relPath, and extracting it here would
   * replace its prose claims.
   */
  prosePaths?: ReadonlySet<string>;
}

/**
 * Plan the docstring stream and read the planned files' docstrings
 * (LSP only). Files are taken in walk order; each file's symbols come
 * from the Stage 3 inventory, so nothing is listed twice.
 */
export async function planDocstringWork(
  input: PlanDocstringInput,
): Promise<DocstringWorkPlan> {
  const symbolsByPath = groupSymbolsByPath(input.inventory.allSymbols);
  const files: PlannedDocstringFile[] = [];
  let filesUnchanged = 0;
  let calls = 0;
  let proseCollisions = 0;

  for (const file of input.sourceFiles) {
    if (input.inventory.failedPaths.has(file.relPath)) continue;
    const adapter = adapterFor(input.adapters, file.relPath);
    if (!adapter) continue;
    if (input.prosePaths?.has(file.relPath)) {
      proseCollisions++;
      continue;
    }
    if (!input.full && input.baseline[file.relPath] === file.sha) {
      filesUnchanged++;
      continue;
    }
    const symbols = symbolsByPath.get(file.relPath) ?? [];
    const docstrings = await readFileDocstrings(adapter, symbols);
    if (docstrings.errors.length === 0) calls += docstrings.entries.length;
    files.push({ relPath: file.relPath, sha: file.sha, adapter, symbols, docstrings });
  }

  if (proseCollisions > 0) {
    log.warn(
      `pipeline: skipped docstring extraction for ${proseCollisions} source ` +
        "file(s) that docs.include also matches; they are extracted as prose " +
        "only. Narrow the docs.include globs to documentation files to " +
        "extract their docstrings. When a docs.include change moves a file " +
        "between the prose and docstring streams, a file one stream keyed " +
        "with no claims looks unchanged to the other: remove that path's " +
        "entry from source_shas (in atlas.json with atlas.committed: true, " +
        "in the local cache with false), or run `contextatlas index --full` " +
        "once (it re-extracts every ADR, docs page and docstring file).",
      { proseCollisions },
    );
  }
  return { files, filesUnchanged, calls };
}

function adapterFor(
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>,
  relPath: string,
): LanguageAdapter | null {
  for (const adapter of adapters.values()) {
    for (const ext of adapter.extensions) {
      if (relPath.endsWith(ext)) return adapter;
    }
  }
  return null;
}

export interface StaleDocstringKeyInput {
  fileExists: (relPath: string) => boolean;
  /** relPaths the Stage 3 source walk produced. */
  walkedPaths: ReadonlySet<string>;
  /** Extensions owned by the adapters configured for this run. */
  configuredExtensions: ReadonlySet<string>;
  /**
   * Whether to drop keys of files that exist but are no longer walked
   * (true only when the docstring stream runs; a disabled stream's
   * claims stay frozen).
   */
  includeUnwalked: boolean;
}

/**
 * Stage 5 docstring rule (v1.2 Phase 1 + L-11): the baseline docstring
 * keys whose claims and key should be dropped, sorted.
 *   - the file no longer exists → drop;
 *   - it exists, is not walked, and a configured adapter owns its
 *     extension (an exclude pattern now drops it; prune rule 4) → drop
 *     when `includeUnwalked`;
 *   - otherwise keep: walked files are re-extracted by 6c when changed,
 *     and a file whose language is not configured this run is
 *     unverified (prune rule 5).
 */
export function staleDocstringKeys(
  baseline: Readonly<Record<string, string>>,
  input: StaleDocstringKeyInput,
): string[] {
  const out: string[] = [];
  for (const key of Object.keys(baseline)) {
    if (!input.fileExists(key)) {
      out.push(key);
    } else if (
      input.includeUnwalked &&
      !input.walkedPaths.has(key) &&
      input.configuredExtensions.has(posix.extname(key))
    ) {
      out.push(key);
    }
  }
  return out.sort();
}

export interface PlanCommitInput {
  db: DatabaseInstance;
  repoRoot: string;
  /** The git signal's HEAD (Stage 4b); null = no usable git tree. */
  headSha: string | null;
  /** `extraction.commit_message_filter` (augments the defaults). */
  commitMessageFilter?: readonly string[];
  gitBinary?: string;
}

/**
 * Plan the commit stream. Never throws: without a git tree (or a
 * working git) the stream is skipped with an info log; any other git
 * failure is skipped with a warning, and the run goes on.
 */
export function planCommitWork(input: PlanCommitInput): CommitWorkPlan {
  if (input.headSha === null) {
    const reason = "not a git repository, or git is unavailable";
    log.info(`pipeline: commit stream skipped — ${reason}`, {
      repoRoot: input.repoRoot,
    });
    return { status: "skipped", reason };
  }
  let filtered: CommitMetadata[];
  try {
    const filter = makeDefaultCommitFilter(input.commitMessageFilter ?? []);
    filtered = parseCommitLog(input.repoRoot, filter, {
      ...(input.gitBinary !== undefined ? { gitBinary: input.gitBinary } : {}),
    });
  } catch (err) {
    log.warn(
      "pipeline: commit stream skipped — `git log` failed; the other " +
        "streams ran normally. Check that git works in the source root, " +
        "then re-run `contextatlas index` to extract commit messages.",
      { repoRoot: input.repoRoot, err: String(err) },
    );
    return { status: "skipped", reason: `git log failed: ${String(err)}` };
  }
  const pending = filtered.filter((c) => !hasCommitKey(input.db, c.sha));
  return {
    status: "planned",
    pending,
    filtered: filtered.length,
    skippedIdempotent: filtered.length - pending.length,
  };
}
