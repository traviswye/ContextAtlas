/**
 * The extraction pipeline — composes config, adapters, storage, and
 * anthropic-client into an end-to-end indexer.
 *
 * Stages (per DESIGN.md's extraction pipeline section):
 *   0. Atlas-aware startup: import committed atlas.json if present,
 *      establishing the committed SHA baseline.
 *   1. Walk prose files (ADRs + docs.include globs), compute SHAs.
 *   2. Diff current SHAs against the committed baseline.
 *   3. Walk source code files, build the symbol inventory via adapters.
 *   4. Upsert symbols (with file SHAs) into storage.
 *   5. Handle deletions: drop claims + source_shas for files gone from disk.
 *   6. Extract changed/added prose files in batches, resolve candidates,
 *      and write claims.
 *   7. If atlas.committed, regenerate atlas.json iff any modification
 *      happened. Bump atlas_meta.generated_at on real changes only.
 *
 * Result is summary stats, NOT the extracted claims themselves — the
 * caller inspects storage for those.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { resolve as pathResolve } from "node:path";

import { log } from "../mcp/logger.js";
import { importAtlasFile } from "../storage/atlas-importer.js";
import {
  exportAtlasToFile,
  serializeAtlas,
  exportAtlas,
} from "../storage/atlas-exporter.js";
import {
  deleteClaimsBySourcePath,
  insertClaim,
  listSourceShas,
  setSourceSha,
  type NewClaim,
} from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";
import { upsertSymbols } from "../storage/symbols.js";
import type {
  ContextAtlasConfig,
  LanguageAdapter,
  LanguageCode,
} from "../types.js";

import { type ExtractionClient } from "./anthropic-client.js";
import {
  addUsage,
  computeCostUsd,
  ZERO_USAGE,
  type UsageInfo,
} from "./pricing.js";
import {
  diffShas,
  walkProseFiles,
  walkSourceFiles,
  type ProseFile,
} from "./file-walker.js";
import { parseFrontmatterSymbols } from "./frontmatter.js";
import {
  DEFAULT_COMMIT_LIMIT,
  extractGitSignal,
} from "./git-extractor.js";
import { EXTRACTION_MODEL, stripFrontmatter } from "./prompt.js";
import {
  buildSymbolInventory,
  resolveCandidates,
  type SymbolInventory,
} from "./resolver.js";
import { replaceGitCommits } from "../storage/git.js";
import { ATLAS_META_KEYS } from "../storage/atlas-importer.js";
import { ATLAS_VERSION } from "../storage/types.js";

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
  /** Batch size for concurrent extraction calls. Default: 3. */
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
   * Override the git binary path. Defaults to `"git"` on PATH. Test
   * harnesses that want to avoid spawning the real binary pass a
   * script path or a non-existent path (triggering the "no git"
   * branch).
   */
  gitBinary?: string;
  /**
   * When true, bypass SHA-diff gating and re-extract every prose
   * file regardless of whether its content matches the committed
   * baseline. Used by `contextatlas index --full` (ADR-12) for
   * rebuild cases — prompt changes, model changes, suspected
   * extraction quality issues. Default: false.
   */
  skipShaDiff?: boolean;
  /**
   * Optional USD ceiling. When set and cumulative extraction cost
   * exceeds this value during a run, a single warning is logged to
   * stderr and no further warnings fire for the rest of the run.
   * Not a hard cap — the run continues regardless. v0.2 Stream A #2.
   */
  budgetWarnUsd?: number;
}

/**
 * Per-file breakdown of unresolved symbol candidates and frontmatter
 * hints, accumulated during Stage 6 of the pipeline. Surfaces via the
 * `--verbose` flag on `contextatlas index` (v0.2 Stream A #3). Empty
 * cases are *not* pushed onto `ExtractionPipelineResult.unresolvedDetails`;
 * the array contains only files that had ≥1 unresolved token.
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

export interface ExtractionPipelineResult {
  filesExtracted: number;
  filesUnchanged: number;
  filesDeleted: number;
  claimsWritten: number;
  symbolsIndexed: number;
  unresolvedCandidates: number;
  /**
   * Frontmatter `symbols:` hints that didn't resolve to any symbol in
   * the codebase. Aspirational misses — logged at debug, surfaced here
   * as a summary stat for visibility. A non-zero value is not an error;
   * it may indicate an ADR references code that was renamed or hasn't
   * been written yet.
   */
  unresolvedFrontmatterHints: number;
  extractionErrors: Array<{ sourcePath: string; error: string }>;
  atlasExported: boolean;
  wallClockMs: number;
  apiCalls: number;
  /**
   * Cumulative `input_tokens` across successful Anthropic API calls
   * (v0.2 Stream A #2). Failed-retry tokens are invisible to us and
   * not included. Null-result calls (max_tokens, malformed JSON)
   * still count — those API calls consumed tokens even if we
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
   * plus per-claim unresolved candidates. Only files with ≥1 unresolved
   * appear. Surfaces via `--verbose` on `contextatlas index` (v0.2
   * Stream A #3). Default summary output does not use this; callers
   * that want per-token detail format it themselves.
   */
  unresolvedDetails: FileUnresolvedDetail[];
}

export async function runExtractionPipeline(
  deps: ExtractionPipelineDeps,
): Promise<ExtractionPipelineResult> {
  const start = Date.now();
  const { repoRoot, config, db, anthropicClient, adapters } = deps;
  const configRoot = deps.configRoot ?? repoRoot;
  const batchSize = deps.batchSize ?? 3;

  // --- Stage 0: atlas-aware startup ------------------------------------
  // atlas.path is a config-file-relative path (it names where the
  // committed team artifact lives alongside other config-owned
  // files), so it resolves against configRoot, not repoRoot. In the
  // common case these are identical; in the external-ADRs setup
  // (ADR-08) the committed atlas belongs with the config.
  const atlasAbsPath = pathResolve(configRoot, config.atlas.path);
  if (existsSync(atlasAbsPath)) {
    log.info("pipeline: importing committed atlas.json", { path: atlasAbsPath });
    importAtlasFile(db, atlasAbsPath);
  }

  const committedShas = listSourceShas(db);

  // --- Stage 1: walk prose files ---------------------------------------
  // Pass both roots so prose files outside repoRoot (external ADRs per
  // ADR-08) resolve correctly. When configRoot === repoRoot, behavior
  // is identical to the single-root case.
  const proseFiles = walkProseFiles(repoRoot, config, configRoot);
  log.info("pipeline: discovered prose files", { count: proseFiles.length });

  // --- Stage 2: SHA diff -----------------------------------------------
  // `skipShaDiff` (from `contextatlas index --full`, ADR-12) rewrites
  // every prose file into `changed` so the extraction phase treats
  // them all as dirty — the ShaDiff record is retained for the
  // `files_unchanged=0` summary line rather than being faked.
  const diff = deps.skipShaDiff
    ? {
        unchanged: [],
        changed: proseFiles.filter((f) => committedShas[f.relPath] !== undefined),
        added: proseFiles.filter((f) => committedShas[f.relPath] === undefined),
        deleted: [] as string[],
      }
    : diffShas(proseFiles, committedShas);
  const filesToExtract = [...diff.changed, ...diff.added];
  log.info("pipeline: extraction plan", {
    unchanged: diff.unchanged.length,
    changed: diff.changed.length,
    added: diff.added.length,
    deleted: diff.deleted.length,
    fullRebuild: deps.skipShaDiff === true,
  });

  // --- Stage 3: walk source + build symbol inventory -------------------
  const extensions = Array.from(adapters.values()).flatMap((a) => [
    ...a.extensions,
  ]);
  const sourceFiles = walkSourceFiles(repoRoot, extensions);
  const inventory = await buildSymbolInventory(adapters, sourceFiles);
  log.info("pipeline: symbol inventory built", {
    sourceFiles: sourceFiles.length,
    symbols: inventory.allSymbols.length,
  });

  // --- Stage 4: upsert symbols ----------------------------------------
  upsertSymbols(db, inventory.allSymbols);

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

  // --- Stage 5: handle deletions --------------------------------------
  for (const deletedPath of diff.deleted) {
    deleteClaimsBySourcePath(db, deletedPath);
    db.prepare("DELETE FROM source_shas WHERE source_path = ?").run(deletedPath);
  }

  // --- Stage 6: extract changed/added ---------------------------------
  let claimsWritten = 0;
  let unresolvedCandidates = 0;
  let unresolvedFrontmatterHints = 0;
  let apiCalls = 0;
  let totalUsage: UsageInfo = ZERO_USAGE;
  let budgetWarningFired = false;
  const unresolvedDetails: FileUnresolvedDetail[] = [];
  const extractionErrors: Array<{ sourcePath: string; error: string }> = [];

  for (let i = 0; i < filesToExtract.length; i += batchSize) {
    const batch = filesToExtract.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (file) => {
        apiCalls++;
        try {
          const body = stripFrontmatter(
            readFileSync(file.absPath, "utf8"),
          );
          const extracted = await anthropicClient.extract(body);
          return { file, extracted };
        } catch (err) {
          extractionErrors.push({
            sourcePath: file.relPath,
            error: String(err),
          });
          return { file, extracted: null };
        }
      }),
    );

    for (const { file, extracted } of results) {
      if (!extracted) continue;
      // Accumulate usage regardless of whether result is null — a
      // max_tokens or malformed-JSON response still consumed tokens.
      totalUsage = addUsage(totalUsage, extracted.usage);
      if (!extracted.result) continue;
      const outcome = writeClaimsForFile(
        db,
        file,
        extracted.result.claims,
        inventory,
      );
      claimsWritten += outcome.claimsWritten;
      unresolvedCandidates += outcome.unresolved;
      unresolvedFrontmatterHints += outcome.frontmatterHintsUnresolved;
      if (outcome.detail) unresolvedDetails.push(outcome.detail);
      setSourceSha(db, file.relPath, file.sha);
    }

    // Fire the budget warning at most once per run, after each batch.
    // Threshold comparison uses raw USD (full precision), independent
    // of the summary's display formatting.
    if (
      deps.budgetWarnUsd !== undefined &&
      !budgetWarningFired
    ) {
      const cumulativeCostUsd = computeCostUsd(totalUsage);
      if (cumulativeCostUsd > deps.budgetWarnUsd) {
        log.warn(
          "extraction: budget warning — cumulative cost exceeds configured budget. Run continues.",
          {
            cumulativeCostUsd: Number(cumulativeCostUsd.toFixed(4)),
            budgetUsd: deps.budgetWarnUsd,
          },
        );
        budgetWarningFired = true;
      }
    }
  }

  // Fail loud if every attempted document failed — usually a config/key
  // issue rather than per-document noise.
  if (
    filesToExtract.length > 0 &&
    extractionErrors.length === filesToExtract.length
  ) {
    throw new Error(
      `Extraction failed for all ${filesToExtract.length} document(s). ` +
        "This usually indicates an auth/config problem, not per-document noise. " +
        `First error: ${extractionErrors[0]?.error}`,
    );
  }

  // ADR authoring validation (v0.3 Theme 1.2 Fix 1). Surface a single
  // warning summarizing files with unresolved frontmatter symbols.
  // Per-symbol detail stays at debug level; per-file breakdown lands at
  // the cli-runner display layer (see cli-runner.ts
  // printFrontmatterWarnings) so callers see the concrete list without
  // needing --verbose. The warn-not-error stance is deliberate: ADRs
  // can legitimately reference forward-declared symbols (ADR-13's
  // PyrightAdapter / ADR-14's GoAdapter placeholders during their
  // ADR-drafting commits are precedent).
  if (unresolvedFrontmatterHints > 0) {
    const fileCount = unresolvedDetails.filter(
      (d) => d.frontmatterUnresolved.length > 0,
    ).length;
    log.warn(
      "extraction: ADR authoring validation — " +
        `${unresolvedFrontmatterHints} unresolved frontmatter symbol(s) ` +
        `detected across ${fileCount} file(s). Authors: confirm each ` +
        "unresolved symbol is intentional (e.g., placeholder for " +
        "unimplemented future work) or update the ADR to match current " +
        "source. See per-file detail in extraction summary or run with " +
        "--verbose.",
      { unresolvedFrontmatterHints, fileCount },
    );
  }

  // --- Stage 7: update atlas_meta + export ----------------------------
  // Git state advancing counts as a modification: the committed atlas
  // carries `extracted_at_sha` + `git_commits`, so a new HEAD SHA means
  // the atlas is out of date even if no prose/source changed.
  const didModify =
    filesToExtract.length > 0 || diff.deleted.length > 0 || gitChanged;
  let atlasExported = false;

  if (didModify) {
    const newGeneratedAt = new Date().toISOString();
    // Use EXTRACTION_MODEL (the model the extraction client actually
    // called) rather than config.index.model (which is forward-compat
    // config that today isn't consulted by the client). Atlas metadata
    // should reflect what code did, not what config declared.
    const extractionModel = EXTRACTION_MODEL;
    const contextatlasVer = deps.contextatlasVersion ?? "0.0.0";

    // Persist ALL generator + staleness fields to atlas_meta. Without
    // this, exportAtlas would fall back to "unknown"/"0.0.0"/missing —
    // which is exactly the bug dogfooding caught for v1.0.
    const setMeta = db.prepare(
      "INSERT INTO atlas_meta (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    setMeta.run(ATLAS_META_KEYS.version, ATLAS_VERSION);
    setMeta.run(ATLAS_META_KEYS.generatedAt, newGeneratedAt);
    setMeta.run(ATLAS_META_KEYS.generatorExtractionModel, extractionModel);
    setMeta.run(
      ATLAS_META_KEYS.generatorContextatlasVersion,
      contextatlasVer,
    );
    // contextatlas_commit_sha (atlas v1.3+) — null sentinel from the
    // caller means "explicitly absent" (e.g., binary not in a git
    // checkout); undefined means "fall back to stored value", matching
    // the exporter's null/undefined convention.
    if (
      deps.contextatlasCommitSha !== undefined &&
      deps.contextatlasCommitSha !== null
    ) {
      setMeta.run(
        ATLAS_META_KEYS.generatorContextatlasCommitSha,
        deps.contextatlasCommitSha,
      );
    } else if (deps.contextatlasCommitSha === null) {
      db.prepare("DELETE FROM atlas_meta WHERE key = ?").run(
        ATLAS_META_KEYS.generatorContextatlasCommitSha,
      );
    }
    if (gitResult.headSha !== null) {
      setMeta.run(ATLAS_META_KEYS.extractedAtSha, gitResult.headSha);
    } else {
      db.prepare("DELETE FROM atlas_meta WHERE key = ?").run(
        ATLAS_META_KEYS.extractedAtSha,
      );
    }

    if (config.atlas.committed) {
      exportAtlasToFile(db, atlasAbsPath, {
        generatedAt: newGeneratedAt,
        contextatlasVersion: contextatlasVer,
        contextatlasCommitSha: deps.contextatlasCommitSha ?? null,
        extractionModel,
        extractedAtSha: gitResult.headSha ?? null,
      });
      atlasExported = true;
      log.info("pipeline: atlas.json written", { path: atlasAbsPath });
    }
  } else {
    log.info("pipeline: no changes detected; atlas.json untouched");
  }

  return {
    filesExtracted: filesToExtract.length - extractionErrors.length,
    filesUnchanged: diff.unchanged.length,
    filesDeleted: diff.deleted.length,
    claimsWritten,
    symbolsIndexed: inventory.allSymbols.length,
    unresolvedCandidates,
    unresolvedFrontmatterHints,
    extractionErrors,
    atlasExported,
    wallClockMs: Date.now() - start,
    apiCalls,
    inputTokens: totalUsage.inputTokens,
    outputTokens: totalUsage.outputTokens,
    costUsd: computeCostUsd(totalUsage),
    gitCommitsIndexed: gitResult.commits.length,
    extractedAtSha: gitResult.headSha,
    unresolvedDetails,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive the `source` field value for a prose file. Preference order:
 *   1. YAML frontmatter `id:` field (our ADRs use this — `id: ADR-03`).
 *   2. Filename regex `ADR-\d+` (case-insensitive, to catch `adr-01.md`).
 *   3. Basename without extension.
 */
export function deriveSourceName(
  absPath: string,
  rawContents: string,
): string {
  const frontmatter = parseFrontmatterId(rawContents);
  if (frontmatter) return frontmatter;

  const base = basename(absPath);
  const adrMatch = /\bADR-\d+\b/i.exec(base);
  if (adrMatch) return adrMatch[0].toUpperCase().replace(/adr/i, "ADR");

  const dotIdx = base.lastIndexOf(".");
  return dotIdx > 0 ? base.slice(0, dotIdx) : base;
}

function parseFrontmatterId(raw: string): string | null {
  if (!raw.startsWith("---\n")) return null;
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const block = raw.slice(4, end);
  const match = /^id:\s*(\S.*?)\s*$/m.exec(block);
  return match ? match[1] ?? null : null;
}

function writeClaimsForFile(
  db: DatabaseInstance,
  file: ProseFile,
  extracted: readonly {
    symbol_candidates: string[];
    claim: string;
    severity: "hard" | "soft" | "context";
    rationale: string;
    excerpt: string;
  }[],
  inventory: SymbolInventory,
): {
  claimsWritten: number;
  unresolved: number;
  frontmatterHintsUnresolved: number;
  /**
   * Per-file unresolved-token detail. Null when this file had zero
   * unresolved tokens of either kind — keeps the pipeline's
   * `unresolvedDetails` array tight (only files that matter).
   */
  detail: FileUnresolvedDetail | null;
} {
  // Drop any claims already associated with this source path so
  // re-extraction is idempotent at file granularity.
  deleteClaimsBySourcePath(db, file.relPath);

  const rawContents = readFileSync(file.absPath, "utf8");
  const source = deriveSourceName(file.absPath, rawContents);

  // Author-declared frontmatter symbols are merged into every claim's
  // candidates as the authoritative leading entries (author intent ranks
  // ahead of model inference). Unresolved ones are excluded from the
  // merge so they don't inflate the claim-level unresolved count; they
  // are tracked separately as a per-file summary stat.
  const frontmatterSymbols = parseFrontmatterSymbols(rawContents, file.relPath);
  const frontmatterResolvable: string[] = [];
  const frontmatterUnresolvedNames: string[] = [];
  for (const fmSym of frontmatterSymbols) {
    const matches = inventory.byName.get(fmSym);
    if (matches && matches.length > 0) {
      frontmatterResolvable.push(fmSym);
    } else {
      frontmatterUnresolvedNames.push(fmSym);
      log.debug("pipeline: frontmatter symbol did not resolve", {
        sourcePath: file.relPath,
        symbol: fmSym,
      });
    }
  }

  let claimsWritten = 0;
  let unresolved = 0;
  const claimUnresolved: UnresolvedClaimDetail[] = [];
  for (const ec of extracted) {
    // Frontmatter first (author-declared authoritative intent), then
    // model candidates (inferred). resolveCandidates dedupes within its
    // result, so shared names don't double-resolve.
    const merged = [...frontmatterResolvable, ...ec.symbol_candidates];
    const { symbolIds, unresolved: unres } = resolveCandidates(
      inventory,
      merged,
    );
    unresolved += unres.length;
    if (unres.length > 0) {
      claimUnresolved.push({
        claim: ec.claim,
        severity: ec.severity,
        unresolved: unres,
      });
    }
    const claim: NewClaim = {
      source,
      sourcePath: file.relPath,
      sourceSha: file.sha,
      severity: ec.severity,
      claim: ec.claim,
      rationale: ec.rationale,
      excerpt: ec.excerpt,
      symbolIds,
    };
    insertClaim(db, claim);
    claimsWritten++;
  }

  const detail: FileUnresolvedDetail | null =
    frontmatterUnresolvedNames.length > 0 || claimUnresolved.length > 0
      ? {
          sourcePath: file.relPath,
          frontmatterUnresolved: frontmatterUnresolvedNames,
          claimUnresolved,
        }
      : null;

  return {
    claimsWritten,
    unresolved,
    frontmatterHintsUnresolved: frontmatterUnresolvedNames.length,
    detail,
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
