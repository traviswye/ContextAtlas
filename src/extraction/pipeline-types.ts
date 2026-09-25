/**
 * Public types of `runExtractionPipeline` (moved out of `pipeline.ts`
 * at v1.2 Phase 2 so the stream modules can share them without an
 * import cycle). `pipeline.ts` re-exports every name, so existing
 * imports from `pipeline.js` keep working.
 */

import type { DatabaseInstance } from "../storage/db.js";
import type {
  ContextAtlasConfig,
  ExtractionStream,
  LanguageAdapter,
  LanguageCode,
} from "../types.js";

import type { ExtractionClient } from "./anthropic-client.js";
import type { CostPreview } from "./cost-preview.js";
import type { OrphanedClaimSource } from "./symbol-prune.js";

export interface ExtractionPipelineDeps {
  /**
   * Source code root. Passed to the language adapter's `initialize`.
   * `walkSourceFiles` indexes from here. Source files must stay under
   * this root — ADR-01's security/ID-stability invariant.
   */
  repoRoot: string;
  /**
   * Directory containing `.contextatlas.yml`. Resolution base for
   * `adrs.path` and `docs.include` glob patterns. Defaults to
   * `repoRoot`, preserving current behavior when config lives
   * alongside source (the common case).
   *
   * Diverges from `repoRoot` in setups where config + ADRs live
   * separately from source — e.g., a benchmarks project whose ADRs
   * describe a cloned external source tree. See ADR-08.
   */
  configRoot?: string;
  config: ContextAtlasConfig;
  db: DatabaseInstance;
  anthropicClient: ExtractionClient;
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>;
  /** Batch size for concurrent prose extraction calls. Default: 3. */
  batchSize?: number;
  /** Provided by caller when a real run should bump generated_at. */
  contextatlasVersion?: string;
  /**
   * Git HEAD SHA of the contextatlas binary that produced the atlas
   * (atlas schema v1.3+, v0.3 Theme 1.3). Resolved by the CLI runner
   * at startup; passed through to atlas_meta + the exported atlas.
   * Pass `null` to explicitly omit (e.g., binary not in a git
   * checkout). Pass `undefined` to fall back to the stored meta
   * value (lossless round-trip path for imported atlases).
   */
  contextatlasCommitSha?: string | null;
  /**
   * Override the git `log` window. Defaults to the ADR-11 constant.
   * Primarily a test knob — production runs take the default.
   */
  gitCommitLimit?: number;
  /**
   * Override the git binary path. Defaults to `"git"` on PATH. Used by
   * both the git signal (Stage 4b) and the commit stream's `git log`
   * (Stage 6d). Test harnesses that want to avoid spawning the real
   * binary pass a script path or a non-existent path (triggering the
   * "no git" branch, which also skips the commit stream).
   */
  gitBinary?: string;
  /**
   * The claim streams to extract (v1.2 Phase 2, `extraction.streams`).
   * Omitted: prose only (`adr`) — the library behaviour before v1.2
   * Phase 2, which the benchmarks driver relies on (it runs its own
   * docstring and commit passes). The CLI passes
   * `resolveExtractionStreams(config)`, whose default is all three.
   *
   * Streams always run in the fixed order prose, docstring, commit,
   * whatever order the set lists them in. A disabled stream is not
   * extracted, but its existing claims and keys are kept (frozen).
   * The prose walk, prose deletions and the F-5 commit-key migration
   * run whatever the set says.
   */
  streams?: ReadonlySet<ExtractionStream>;
  /**
   * When true, bypass SHA-diff gating and re-extract every prose file
   * and (when the docstring stream runs) every docstring file,
   * regardless of whether its content matches the committed baseline.
   * Commits stay key-gated (lead decision L-7). Used by `contextatlas
   * index --full` (ADR-12) for rebuild cases — prompt changes, model
   * changes, suspected extraction quality issues. Default: false.
   */
  skipShaDiff?: boolean;
  /**
   * Optional USD ceiling. When set and cumulative extraction cost
   * across all streams exceeds this value during a run, a single
   * warning is logged to stderr and no further warnings fire for the
   * rest of the run. Not a hard cap — the run continues regardless.
   * v0.2 Stream A #2.
   */
  budgetWarnUsd?: number;
  /**
   * Called once, after planning and before the first model call, with
   * the run's estimated cost — only when at least one model call is
   * planned (v1.2 Phase 2, lead decision L-8). The CLI formats it to
   * stderr; library callers that omit it see no preview.
   */
  onCostPreview?: (preview: CostPreview) => void;
  /**
   * Claim-attribution narrowing rule (v0.3 Theme 1.2 Fix 2), prose
   * stream only. Targets the muddy-bundle mechanism documented in
   * Phase 6 §5.1 (atlas-claim-attribution-ranking.md): frontmatter
   * symbols inherited as a per-claim baseline dominate per-symbol
   * ranking when many claims share the same baseline.
   *
   * Three states:
   *   - `undefined` (default): drop-with-fallback semantics (v0.3
   *     Step 7 A1 ship default) — claim-specific candidates only, with
   *     frontmatter as the fallback for a claim that resolves to none.
   *   - `"drop"`: drop frontmatter inheritance entirely. Claims
   *     attach only to model-extracted candidates. Regression risk:
   *     claims where the model didn't surface specific candidates may
   *     attach to ZERO symbols, becoming invisible to
   *     get_symbol_context lookups.
   *   - `"drop-with-fallback"`: drop, but recover when a claim
   *     would otherwise resolve to zero symbols by falling back to
   *     frontmatter inheritance for that claim only.
   */
  narrowAttribution?: "drop" | "drop-with-fallback";
}

/**
 * Per-file breakdown of unresolved symbol candidates and frontmatter
 * hints, accumulated during the prose stream (Stage 6). Surfaces via
 * the `--verbose` flag on `contextatlas index` (v0.2 Stream A #3).
 * Empty cases are *not* pushed onto
 * `ExtractionPipelineResult.unresolvedDetails`; the array contains only
 * files that had ≥1 unresolved token.
 */
export interface UnresolvedClaimDetail {
  /** Full claim text. Truncation for display is the caller's concern. */
  claim: string;
  severity: "hard" | "soft" | "context";
  /** Candidate names that did not resolve to any symbol. */
  unresolved: string[];
}

export interface FileUnresolvedDetail {
  sourcePath: string;
  /** Frontmatter `symbols:` hints that did not resolve. */
  frontmatterUnresolved: string[];
  /** Per-claim unresolved candidates, in claim order. */
  claimUnresolved: UnresolvedClaimDetail[];
}

/**
 * A docstring or commit stream in which every attempted model call
 * failed (lead decision L-10 ii) — usually an API key, quota or network
 * problem rather than per-source noise. A call the API answered with no
 * parseable result (null result, malformed JSON) does not count as
 * failed. The run still finishes and exports; `contextatlas index` then
 * exits 1.
 */
export interface StreamFailure {
  stream: ExtractionStream;
  /** Model calls attempted in the stream (all of them failed). */
  attemptedCalls: number;
  /**
   * The first failed call's message, for the exit message (never a
   * docstring read error or an unparseable result).
   */
  firstError: string;
}

export interface ExtractionPipelineResult {
  /**
   * Prose files attempted minus prose files whose call threw. Prose
   * only (docstring files: `docstringFilesExtracted`).
   */
  filesExtracted: number;
  /** Prose files skipped by the SHA gate. */
  filesUnchanged: number;
  /**
   * Prose sources (ADRs / docs) whose baseline key had no match in the
   * prose walk and were dropped at Stage 5. Prose only: docstring
   * deletions are `docstringSourcesDeleted`; commit keys are never
   * deleted.
   */
  filesDeleted: number;
  /** Claims written by every stream this run (v1.2 Phase 2: all streams). */
  claimsWritten: number;
  symbolsIndexed: number;
  /** Unresolved `symbol_candidates` across every stream's written claims. */
  unresolvedCandidates: number;
  /**
   * Frontmatter `symbols:` hints that didn't resolve to any symbol in
   * the codebase. Aspirational misses — logged at debug, surfaced here
   * as a summary stat for visibility. A non-zero value is not an error;
   * it may indicate an ADR references code that was renamed or hasn't
   * been written yet.
   */
  unresolvedFrontmatterHints: number;
  /**
   * Per-source extraction errors from every stream: prose files
   * (`sourcePath` = relPath), docstring files (relPath; the symbol id
   * is in `error`) and commits (`commit:<sha>`). A failed docstring file
   * or commit keeps its previous claims and key and is retried next run.
   */
  extractionErrors: Array<{ sourcePath: string; error: string }>;
  atlasExported: boolean;
  wallClockMs: number;
  /** Model calls attempted by every stream, including ones that threw. */
  apiCalls: number;
  /**
   * Cumulative `input_tokens` across successful Anthropic API calls of
   * every stream (v0.2 Stream A #2). Failed-retry tokens are invisible
   * to us and not included. Null-result calls (max_tokens, malformed
   * JSON) still count — those API calls consumed tokens even if we
   * couldn't use the response body.
   */
  inputTokens: number;
  /** Cumulative `output_tokens`. Same inclusion rules as `inputTokens`. */
  outputTokens: number;
  /**
   * USD cost computed from `inputTokens` and `outputTokens` under
   * Opus 4.7 pricing (see `pricing.ts`). Full precision; formatting
   * is the caller's concern.
   */
  costUsd: number;
  /**
   * Number of git commits captured during the run (ADR-11). Zero when
   * the repo is not a git working tree.
   */
  gitCommitsIndexed: number;
  /**
   * HEAD SHA at extraction time, or null when the repo is not a git
   * tree. Echoes what lands in `atlas.extracted_at_sha`.
   */
  extractedAtSha: string | null;
  /**
   * Per-file detail of unresolved tokens — frontmatter `symbols:` hints
   * plus per-claim unresolved candidates, prose stream only. Only files
   * with ≥1 unresolved appear. Surfaces via `--verbose` on
   * `contextatlas index` (v0.2 Stream A #3).
   */
  unresolvedDetails: FileUnresolvedDetail[];
  /**
   * Stored symbols removed by the Stage 4a prune (v1.2 Phase 1):
   * symbols of deleted or newly-excluded source files, and symbols no
   * longer listed for a file that still exists.
   */
  symbolsPruned: number;
  /**
   * Claims that lost their last symbol link to this run's prune and
   * still exist after Stage 6. Kept in the atlas (never deleted by
   * pruning); v1.2 Phase 3 queues their sources for re-extraction.
   */
  claimsOrphaned: number;
  /** `claimsOrphaned` broken down by claim source; sorted. */
  orphanedClaimsBySource: OrphanedClaimSource[];
  /**
   * Docstring source keys dropped at Stage 5, with their claims: the
   * source file no longer exists, or (when the docstring stream runs)
   * it exists but is no longer walked although a configured adapter
   * owns its extension — an exclude pattern now drops it (L-11).
   */
  docstringSourcesDeleted: number;
  /**
   * Source files whose stored symbols were kept without verification:
   * `listSymbols` failed for the file, or its language is not
   * configured for this run.
   */
  unverifiedSymbolFiles: number;

  // --- v1.2 Phase 2 (appended) -------------------------------------------

  /**
   * Streams enabled for this run (`deps.streams`; the CLI passes
   * `extraction.streams`), canonical order, config names. An enabled
   * stream can still be skipped: the commit stream without a git tree
   * or a working git (`commits_extracted` is then 0).
   */
  streamsEnabled: ExtractionStream[];
  /**
   * Docstring files whose claims were replaced and key pinned this run,
   * including files with no docstring to extract (keyed, zero claims).
   */
  docstringFilesExtracted: number;
  /** Walked source files the docstring SHA gate skipped. */
  docstringFilesUnchanged: number;
  /** Model calls behind `docstringFilesExtracted` (one per documented symbol). */
  docstringSymbolsExtracted: number;
  docstringClaimsWritten: number;
  /**
   * Commits keyed this run: claims stored, or a null result pinned with
   * zero claims (L-10 iii).
   */
  commitsExtracted: number;
  /** Filter-passing commits skipped because they were already keyed. */
  commitsSkipped: number;
  commitClaimsWritten: number;
  /** Commits migrated from the legacy bare-sha key form (F-5, Stage 0.5). */
  commitKeysMigrated: number;
  /**
   * Docstring / commit streams in which every attempted call failed
   * (L-10 ii). Not a summary key: `contextatlas index` exits 1 on it.
   */
  failedStreams: StreamFailure[];
}
