/**
 * The extraction pipeline — composes config, adapters, storage, and
 * anthropic-client into an end-to-end indexer. This module is the
 * orchestration; each stage's logic lives in its own module.
 *
 * Stages (per DESIGN.md's extraction pipeline section):
 *   0. Atlas-aware startup (`atlas-baseline.ts`): import committed
 *      atlas.json if present, establishing the committed SHA baseline.
 *      When the previous run did not finish and atlas.json is unchanged
 *      since, the units that run stored are carried over the import
 *      (`unsaved-work.ts`). With atlas.committed false the cache is
 *      authoritative and atlas.json only seeds an empty cache.
 *   0.5 F-5 commit-key migration (v1.2 Phase 2, `source-keys.ts`): bare-
 *      sha commit keys and claim paths (the pre-v1.2 Skill form) become
 *      `commit:<sha>`. Every run, whatever streams are enabled.
 *   1. Walk prose files (ADRs + docs.include globs), compute SHAs.
 *      Classify the baseline's source_shas keys by stream (prose /
 *      docstring / commit; `source-keys.ts`, v1.2 Phase 1).
 *   2. Diff current prose SHAs against the prose part of the baseline.
 *   3. Walk source code files, build the symbol inventory via adapters.
 *   4. Upsert symbols (with file SHAs) into storage.
 *   4a. Prune stale symbols (`symbol-prune.ts`, v1.2 Phase 1): symbols
 *      of deleted / excluded files and symbols no longer listed.
 *   4b. Git signal (ADR-11).
 *   5. Handle deletions, stream-aware: prose keys missing from the
 *      prose walk and docstring keys whose file is gone (or, when the
 *      docstring stream runs, excluded) lose their claims + source_shas
 *      row; commit keys are never deleted.
 *   Plan (v1.2 Phase 2, `extraction-plan.ts`): the work of every enabled
 *      stream, including the zero-API docstring read and the pending
 *      commits; then the cost preview (`cost-preview.ts`) when any
 *      model call is planned.
 *   6. Prose stream (`adr`, `prose-stream.ts`): extract changed/added
 *      prose files in batches, resolve candidates, write claims. Throws
 *      when every attempted prose call failed with an API or network
 *      error (a malformed-JSON response is not a failed call).
 *   6c. Docstring stream (`stream-stages.ts` → `docstring-stream.ts`).
 *   6d. Commit stream (`stream-stages.ts` → `commit-message-extractor.ts`).
 *   6b. Report claims orphaned by the prune (kept, never deleted); after
 *      6c/6d so re-extracted claims are not reported.
 *   7. If atlas.committed, regenerate atlas.json iff any modification
 *      happened, the run resumed an unfinished one, or there is no
 *      atlas.json yet (`atlas-export-stage.ts`). Bump
 *      atlas_meta.generated_at on real changes only. Then clear the
 *      unfinished-run mark.
 *
 * Streams run in the fixed order prose → docstring → commit (lead
 * decision L-6), sharing one cost tracker and budget check. Which
 * streams run is `deps.streams` (library default: prose only; the CLI
 * passes `extraction.streams`, default all three).
 *
 * Result is summary stats, NOT the extracted claims themselves — the
 * caller inspects storage for those.
 */

import { resolve as pathResolve } from "node:path";

import { computeExcludePatterns } from "../config/exclude-patterns.js";
import { DEFAULT_EXTRACTION_STREAMS } from "../config/defaults.js";
import { log } from "../mcp/logger.js";
import { exportAtlas, serializeAtlas } from "../storage/atlas-exporter.js";
import {
  deleteClaimsBySourcePath,
  deleteSourceSha,
  listSourceShas,
} from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";
import { upsertSymbols } from "../storage/symbols.js";
import { replaceGitCommits } from "../storage/git.js";
import { ATLAS_META_KEYS } from "../storage/atlas-importer.js";
import type { ExtractionStream } from "../types.js";

import { loadAtlasBaseline, markRunFinished } from "./atlas-baseline.js";
import { finalizeAtlas } from "./atlas-export-stage.js";
import { buildCostPreview } from "./cost-preview.js";
import {
  planCommitWork,
  planDocstringWork,
  plannedCallCount,
  staleDocstringKeys,
  type ExtractionPlan,
} from "./extraction-plan.js";
import { diffShas, walkProseFiles, walkSourceFiles } from "./file-walker.js";
import {
  DEFAULT_COMMIT_LIMIT,
  extractGitSignal,
  isAncestorOfHead,
} from "./git-extractor.js";
import type {
  ExtractionPipelineDeps,
  ExtractionPipelineResult,
  StreamFailure,
} from "./pipeline-types.js";
import { runProseStage, warnUnresolvedFrontmatter } from "./prose-stream.js";
import { buildSymbolInventory } from "./resolver.js";
import { RunCostTracker } from "./run-cost.js";
import {
  normalizeCommitKeys,
  partitionSourceShas,
  recordedKeyStreams,
} from "./source-keys.js";
import {
  runCommitStage,
  runDocstringStage,
  streamFailure,
  type CommitStageResult,
  type DocstringStageResult,
} from "./stream-stages.js";
import {
  coverageFromInventory,
  pruneStaleSymbols,
  summarizeOrphanedClaims,
  warnOrphanedClaims,
} from "./symbol-prune.js";

export type {
  ExtractionPipelineDeps,
  ExtractionPipelineResult,
  FileUnresolvedDetail,
  StreamFailure,
  UnresolvedClaimDetail,
} from "./pipeline-types.js";

/**
 * Streams when `deps.streams` is omitted: prose only, the library
 * behaviour before v1.2 Phase 2 (lead decision L-1 (b)).
 */
const LIBRARY_DEFAULT_STREAMS: ReadonlySet<ExtractionStream> = new Set([
  "adr",
]);

export async function runExtractionPipeline(
  deps: ExtractionPipelineDeps,
): Promise<ExtractionPipelineResult> {
  const start = Date.now();
  const { repoRoot, config, db, anthropicClient, adapters } = deps;
  const configRoot = deps.configRoot ?? repoRoot;
  const batchSize = deps.batchSize ?? 3;
  const streams = deps.streams ?? LIBRARY_DEFAULT_STREAMS;
  const full = deps.skipShaDiff === true;

  // --- Stage 0: atlas-aware startup ------------------------------------
  // atlas.path is a config-file-relative path (it names where the
  // committed team artifact lives alongside other config-owned
  // files), so it resolves against configRoot, not repoRoot. In the
  // common case these are identical; in the external-ADRs setup
  // (ADR-08) the committed atlas belongs with the config.
  //
  // atlas.json replaces the cache. When the previous run did not finish
  // and atlas.json is unchanged since it started, the units that run
  // stored (and that the current HEAD reaches, for commits) are carried
  // over the import. With `atlas.committed` false the cache is
  // authoritative and atlas.json only seeds an empty cache. See
  // `atlas-baseline.ts`.
  const atlasAbsPath = pathResolve(configRoot, config.atlas.path);
  const atlasBaseline = loadAtlasBaseline(db, {
    atlasAbsPath,
    committed: config.atlas.committed,
    isCommitReachable: (sha) => isAncestorOfHead(repoRoot, sha, deps.gitBinary),
  });

  // --- Stage 0.5: F-5 commit-key migration (v1.2 Phase 2, L-2) ---------
  // Before the baseline is read, so Stage 1b and the commit plan see
  // only canonical `commit:<sha>` keys. Idempotent; a migration counts
  // as a modification (Stage 7) so the canonical form reaches atlas.json.
  const commitKeys = normalizeCommitKeys(db);

  const committedShas = listSourceShas(db);

  // --- Stage 1: walk prose files ---------------------------------------
  // Pass both roots so prose files outside repoRoot (external ADRs per
  // ADR-08) resolve correctly. Runs even when `adr` is disabled: without
  // the walk, Stage 5 would treat every prose key as deleted.
  const proseFiles = walkProseFiles(repoRoot, config, configRoot);
  log.info("pipeline: discovered prose files", { count: proseFiles.length });
  const prosePaths = new Set(proseFiles.map((f) => f.relPath));

  // --- Stage 1b: split the baseline by stream (v1.2 Phase 1, F-4) -----
  // source_shas also holds docstring keys (source-file relPaths) and
  // commit keys (`commit:<sha>`; Stage 0.5 migrated any bare-sha ones).
  // Diffing all of them against the prose walk marked every non-prose
  // key "deleted", and Stage 5 then wiped docstring claims, commit
  // claims and the symbols of every docstring-bearing file.
  // A zero-claim key is classified by the stream this cache recorded
  // writing it, when it still holds that SHA (review fix: prose and
  // docstring keys share relPaths and SHAs).
  const baseline = partitionSourceShas(db, committedShas, {
    recordedStreams: recordedKeyStreams(db, committedShas),
    knownProsePaths: prosePaths,
  });
  log.info("pipeline: baseline source keys by stream", {
    prose: Object.keys(baseline.prose).length,
    docstring: Object.keys(baseline.docstring).length,
    commit: Object.keys(baseline.commit).length,
  });

  // --- Stage 2: SHA diff (prose stream only) ---------------------------
  // `skipShaDiff` (from `contextatlas index --full`, ADR-12) rewrites
  // every prose file into `changed` so the extraction phase treats
  // them all as dirty — the ShaDiff record is retained for the
  // `files_unchanged=0` summary line rather than being faked. Deleted
  // prose keys are the same under --full: a key the prose walk no
  // longer produces is gone either way.
  const proseDiff = diffShas(proseFiles, baseline.prose);
  const diff = full
    ? {
        unchanged: [],
        changed: proseFiles.filter((f) => baseline.prose[f.relPath] !== undefined),
        added: proseFiles.filter((f) => baseline.prose[f.relPath] === undefined),
        deleted: proseDiff.deleted,
      }
    : proseDiff;
  const proseToExtract = streams.has("adr") ? [...diff.changed, ...diff.added] : [];
  log.info("pipeline: prose extraction plan", {
    unchanged: diff.unchanged.length,
    changed: diff.changed.length,
    added: diff.added.length,
    deleted: diff.deleted.length,
    fullRebuild: full,
    enabled: streams.has("adr"),
  });

  // --- Stage 3: walk source + build symbol inventory -------------------
  const extensions = Array.from(adapters.values()).flatMap((a) => [
    ...a.extensions,
  ]);
  const excludePatterns = computeExcludePatterns(deps.config);
  const sourceFiles = walkSourceFiles(repoRoot, extensions, excludePatterns);
  const inventory = await buildSymbolInventory(adapters, sourceFiles);
  log.info("pipeline: symbol inventory built", {
    sourceFiles: sourceFiles.length,
    symbols: inventory.allSymbols.length,
    excludePatterns: excludePatterns.length,
  });

  // --- Stage 4: upsert symbols ----------------------------------------
  upsertSymbols(db, inventory.allSymbols);

  // --- Stage 4a: prune stale symbols (v1.2 Phase 1, F-1) ---------------
  // Runs right after the upsert, before Stages 5-6. Every stream
  // resolves candidates against the fresh in-memory `inventory`, which
  // never contains a pruned symbol, so no claim written this run can
  // link to one. Files whose listing failed or whose language is not
  // configured keep their stored symbols.
  const coverage = coverageFromInventory({ repoRoot, sourceFiles, inventory, adapters });
  const prune = pruneStaleSymbols(db, coverage);

  // --- Stage 4b: git signal (ADR-11) -----------------------------------
  // Full re-extract every run. `git log` is subprocess-fast, so the
  // cost differential vs incremental merge is negligible while the
  // correctness benefit (no rewritten-history edge cases) is real.
  // Capture the previously-stored SHA BEFORE the replace so stage 7
  // can decide whether git state changed (which triggers atlas re-export
  // even when prose didn't move).
  const priorHeadShaRow = db
    .prepare("SELECT value FROM atlas_meta WHERE key = ?")
    .get(ATLAS_META_KEYS.extractedAtSha) as { value: string } | undefined;
  const priorHeadSha = priorHeadShaRow?.value ?? null;

  const gitResult = extractGitSignal({
    repoRoot,
    commitLimit: deps.gitCommitLimit ?? DEFAULT_COMMIT_LIMIT,
    ...(deps.gitBinary !== undefined ? { gitBinary: deps.gitBinary } : {}),
  });
  replaceGitCommits(db, gitResult.commits);
  log.info("pipeline: git phase complete", {
    headSha: gitResult.headSha,
    commits: gitResult.commits.length,
  });

  const gitChanged = gitResult.headSha !== priorHeadSha;

  // --- Stage 5: handle deletions (stream-aware, v1.2 Phase 1 + 2) -----
  // Each stream has its own rule (v1.2 Phase 1, F-4; the sweep used to
  // run over every baseline key the prose walk missed, deleting all
  // docstring and commit claims):
  //   - prose: deleted iff absent from the prose walk (also under --full);
  //   - docstring: deleted iff the source file is gone, or — when the
  //     docstring stream runs — it exists but is no longer walked while a
  //     configured adapter owns its extension (L-11, prune rule 4). A
  //     changed file keeps its claims and key here; Stage 6c replaces
  //     them once its re-extraction fully succeeds;
  //   - commit: never deleted (LOCK 2.b retain: commit claims survive as
  //     orphan shells when their symbols go; git-history context persists
  //     beyond symbol lifecycle).
  // Symbol cleanup (and the claim_symbols cascade A3 added here) lives
  // in the Stage 4a prune, which covers every stored symbol path.
  for (const deletedPath of diff.deleted) {
    deleteClaimsBySourcePath(db, deletedPath);
    deleteSourceSha(db, deletedPath);
  }
  const staleDocstring = staleDocstringKeys(baseline.docstring, {
    fileExists: coverage.fileExists,
    walkedPaths: coverage.walkedPaths,
    configuredExtensions: coverage.configuredExtensions,
    includeUnwalked: streams.has("docstring"),
  });
  for (const key of staleDocstring) {
    deleteClaimsBySourcePath(db, key);
    deleteSourceSha(db, key);
  }

  // --- Plan + cost preview (v1.2 Phase 2) ------------------------------
  const plan: ExtractionPlan = {
    streams,
    prose: proseToExtract,
    docstring: streams.has("docstring")
      ? await planDocstringWork({
          sourceFiles,
          inventory,
          adapters,
          baseline: baseline.docstring,
          full,
          prosePaths,
        })
      : null,
    commit: streams.has("commit")
      ? planCommitWork({
          db,
          repoRoot,
          headSha: gitResult.headSha,
          commitMessageFilter: config.extraction?.commitMessageFilter ?? [],
          ...(deps.gitBinary !== undefined ? { gitBinary: deps.gitBinary } : {}),
        })
      : null,
  };
  log.info("pipeline: extraction plan", {
    streams: [...streams],
    proseFiles: plan.prose.length,
    docstringFiles: plan.docstring?.files.length ?? 0,
    docstringCalls: plan.docstring?.calls ?? 0,
    pendingCommits: plan.commit?.status === "planned" ? plan.commit.pending.length : 0,
  });
  if (deps.onCostPreview && plannedCallCount(plan) > 0) {
    deps.onCostPreview(buildCostPreview(plan));
  }

  const cost = new RunCostTracker(deps.budgetWarnUsd);

  // --- Stage 6: prose stream (`adr`) -----------------------------------
  const prose = await runProseStage({
    db,
    files: plan.prose,
    inventory,
    client: anthropicClient,
    batchSize,
    narrowAttribution: deps.narrowAttribution,
    cost,
  });

  // Fail loud if every attempted prose document failed — usually a
  // config/key issue rather than per-document noise. Prose runs first,
  // so this can never discard another stream's paid work. A malformed-
  // JSON response is not a failed call here (review round 2): the file
  // is reported in extraction_errors and retried, but when it was the
  // only prose work it used to stop the docstring and commit streams on
  // every run.
  if (plan.prose.length > 0 && prose.failedCalls === plan.prose.length) {
    throw new Error(
      `Extraction failed for all ${plan.prose.length} document(s). ` +
        "This usually indicates an auth/config problem, not per-document noise. " +
        `First error: ${prose.firstFailedCallError ?? prose.errors[0]?.error}`,
    );
  }
  warnUnresolvedFrontmatter(prose);

  // --- Stage 6c: docstring stream --------------------------------------
  const docstring: DocstringStageResult | null =
    plan.docstring !== null
      ? await runDocstringStage(db, plan.docstring, inventory, anthropicClient, cost)
      : null;

  // --- Stage 6d: commit stream -----------------------------------------
  const commit: CommitStageResult | null =
    plan.commit?.status === "planned"
      ? await runCommitStage(db, plan.commit.pending, inventory, anthropicClient, cost, {
          // Where a pinned commit key lives, for the warning's retry hint.
          pinnedKeyStore: config.atlas.committed
            ? { kind: "atlas" }
            : { kind: "cache", cachePath: pathResolve(configRoot, config.atlas.localCache) },
        })
      : null;

  // A docstring or commit stream whose every call failed does not stop
  // the run (L-10 ii): the other streams' paid work is exported below,
  // and `contextatlas index` exits 1 afterwards.
  const failedStreams: StreamFailure[] = [];
  for (const failure of [
    docstring ? streamFailure("docstring", docstring) : null,
    commit ? streamFailure("commit", commit) : null,
  ]) {
    if (failure === null) continue;
    failedStreams.push(failure);
    log.error(
      `pipeline: every ${failure.stream} extraction call failed ` +
        `(${failure.attemptedCalls}); finishing the run so completed work is saved`,
      { firstError: failure.firstError },
    );
  }

  // --- Stage 6b: orphaned-claim report (v1.2 Phase 1) ------------------
  // Counted after Stages 5-6d so claims those stages deleted or
  // re-extracted are not reported.
  const orphans = summarizeOrphanedClaims(db, prune.affectedClaimIds);
  warnOrphanedClaims(orphans);

  // --- Stage 7: update atlas_meta + export ----------------------------
  // Git state advancing counts as a modification: the committed atlas
  // carries `extracted_at_sha` + `git_commits`, so a new HEAD SHA means
  // the atlas is out of date even if no prose/source changed. A prune,
  // a docstring-source deletion, a commit-key migration, a stored
  // docstring file and a keyed commit all change the exported symbols,
  // claims or keys, so each counts too; a run that changed nothing
  // leaves atlas.json byte-identical. A resumed run always exports (the
  // cache holds the unfinished run's work, which atlas.json lacks), and
  // so does a committed atlas with no atlas.json yet.
  const didModify =
    atlasBaseline.mustExport ||
    plan.prose.length > 0 ||
    diff.deleted.length > 0 ||
    gitChanged ||
    prune.symbolsPruned > 0 ||
    staleDocstring.length > 0 ||
    commitKeys.shasNormalized > 0 ||
    (docstring?.filesStored ?? 0) > 0 ||
    (commit?.commitsKeyed ?? 0) > 0;
  let atlasExported = false;
  if (didModify) {
    atlasExported = finalizeAtlas(db, {
      atlasAbsPath,
      committed: config.atlas.committed,
      contextatlasVersion: deps.contextatlasVersion,
      contextatlasCommitSha: deps.contextatlasCommitSha,
      headSha: gitResult.headSha,
    });
  } else {
    log.info("pipeline: no changes detected; atlas.json untouched");
  }
  // Only a run that reaches this point clears the mark; an interrupted
  // or throwing run leaves it, so the next run keeps the stored work.
  markRunFinished(db);

  return {
    filesExtracted: plan.prose.length - prose.errors.length,
    filesUnchanged: diff.unchanged.length,
    filesDeleted: diff.deleted.length,
    claimsWritten:
      prose.claimsWritten +
      (docstring?.claimsWritten ?? 0) +
      (commit?.claimsWritten ?? 0),
    symbolsIndexed: inventory.allSymbols.length,
    unresolvedCandidates:
      prose.unresolvedCandidates +
      (docstring?.unresolvedCandidates ?? 0) +
      (commit?.unresolvedCandidates ?? 0),
    unresolvedFrontmatterHints: prose.unresolvedFrontmatterHints,
    extractionErrors: [
      ...prose.errors,
      ...(docstring?.errors ?? []),
      ...(commit?.errors ?? []),
    ],
    atlasExported,
    wallClockMs: Date.now() - start,
    apiCalls: cost.apiCalls,
    inputTokens: cost.usage.inputTokens,
    outputTokens: cost.usage.outputTokens,
    costUsd: cost.costUsd,
    gitCommitsIndexed: gitResult.commits.length,
    extractedAtSha: gitResult.headSha,
    unresolvedDetails: prose.unresolvedDetails,
    symbolsPruned: prune.symbolsPruned,
    claimsOrphaned: orphans.claimsOrphaned,
    orphanedClaimsBySource: orphans.bySource,
    docstringSourcesDeleted: staleDocstring.length,
    unverifiedSymbolFiles: prune.unverifiedSymbolFiles,
    streamsEnabled: DEFAULT_EXTRACTION_STREAMS.filter((s) => streams.has(s)),
    docstringFilesExtracted: docstring?.filesStored ?? 0,
    docstringFilesUnchanged: plan.docstring?.filesUnchanged ?? 0,
    docstringSymbolsExtracted: docstring?.symbolsExtracted ?? 0,
    docstringClaimsWritten: docstring?.claimsWritten ?? 0,
    commitsExtracted: commit?.commitsKeyed ?? 0,
    commitsSkipped:
      plan.commit?.status === "planned" ? plan.commit.skippedIdempotent : 0,
    commitClaimsWritten: commit?.claimsWritten ?? 0,
    commitKeysMigrated: commitKeys.shasNormalized,
    failedStreams,
  };
}

/**
 * Exposed so callers (or the final cross-check) can verify the pipeline's
 * output round-trips correctly through the storage layer.
 */
export function roundTripAtlas(db: DatabaseInstance): string {
  return serializeAtlas(exportAtlas(db));
}

/**
 * Re-export for caller convenience when constructing a mock client.
 */
export type { ExtractionClient } from "./anthropic-client.js";

// Prose-stream helper, re-exported for existing importers.
export { deriveSourceName } from "./prose-stream.js";

// Docstring stream (v0.3 Stream B): lives in docstring-stream.ts and
// docstring-read.ts since v1.2 Phase 2. Re-exported because the
// benchmarks repo, scripts/ and older call sites import these names
// from pipeline.js.
export {
  extractDocstringsForFile,
  type DocstringExtractionResult,
} from "./docstring-stream.js";
export { isExportedSymbol } from "./docstring-read.js";
