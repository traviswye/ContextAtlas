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
  diffShas,
  walkProseFiles,
  walkSourceFiles,
  type ProseFile,
} from "./file-walker.js";
import { parseFrontmatterSymbols } from "./frontmatter.js";
import { EXTRACTION_MODEL, stripFrontmatter } from "./prompt.js";
import {
  buildSymbolInventory,
  resolveCandidates,
  type SymbolInventory,
} from "./resolver.js";

export interface ExtractionPipelineDeps {
  repoRoot: string;
  config: ContextAtlasConfig;
  db: DatabaseInstance;
  anthropicClient: ExtractionClient;
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>;
  /** Batch size for concurrent extraction calls. Default: 3. */
  batchSize?: number;
  /** Provided by caller when a real run should bump generated_at. */
  contextatlasVersion?: string;
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
}

export async function runExtractionPipeline(
  deps: ExtractionPipelineDeps,
): Promise<ExtractionPipelineResult> {
  const start = Date.now();
  const { repoRoot, config, db, anthropicClient, adapters } = deps;
  const batchSize = deps.batchSize ?? 3;

  // --- Stage 0: atlas-aware startup ------------------------------------
  const atlasAbsPath = pathResolve(repoRoot, config.atlas.path);
  if (existsSync(atlasAbsPath)) {
    log.info("pipeline: importing committed atlas.json", { path: atlasAbsPath });
    importAtlasFile(db, atlasAbsPath);
  }

  const committedShas = listSourceShas(db);

  // --- Stage 1: walk prose files ---------------------------------------
  const proseFiles = walkProseFiles(repoRoot, config);
  log.info("pipeline: discovered prose files", { count: proseFiles.length });

  // --- Stage 2: SHA diff -----------------------------------------------
  const diff = diffShas(proseFiles, committedShas);
  const filesToExtract = [...diff.changed, ...diff.added];
  log.info("pipeline: extraction plan", {
    unchanged: diff.unchanged.length,
    changed: diff.changed.length,
    added: diff.added.length,
    deleted: diff.deleted.length,
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
      const outcome = writeClaimsForFile(db, file, extracted.claims, inventory);
      claimsWritten += outcome.claimsWritten;
      unresolvedCandidates += outcome.unresolved;
      unresolvedFrontmatterHints += outcome.frontmatterHintsUnresolved;
      setSourceSha(db, file.relPath, file.sha);
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

  // --- Stage 7: update atlas_meta + export ----------------------------
  const didModify =
    filesToExtract.length > 0 || diff.deleted.length > 0;
  let atlasExported = false;

  if (didModify) {
    const newGeneratedAt = new Date().toISOString();
    // Use EXTRACTION_MODEL (the model the extraction client actually
    // called) rather than config.index.model (which is forward-compat
    // config that today isn't consulted by the client). Atlas metadata
    // should reflect what code did, not what config declared.
    const extractionModel = EXTRACTION_MODEL;
    const contextatlasVer = deps.contextatlasVersion ?? "0.0.0";

    // Persist ALL three generator fields to atlas_meta, not just
    // generated_at. Without this, exportAtlas would fall back to
    // "unknown"/"0.0.0" on subsequent reads — which is exactly the
    // bug dogfooding caught.
    const setMeta = db.prepare(
      "INSERT INTO atlas_meta (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    setMeta.run("generated_at", newGeneratedAt);
    setMeta.run("generator.extraction_model", extractionModel);
    setMeta.run("generator.contextatlas_version", contextatlasVer);

    if (config.atlas.committed) {
      exportAtlasToFile(db, atlasAbsPath, {
        generatedAt: newGeneratedAt,
        contextatlasVersion: contextatlasVer,
        extractionModel,
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
  let frontmatterHintsUnresolved = 0;
  for (const fmSym of frontmatterSymbols) {
    const matches = inventory.byName.get(fmSym);
    if (matches && matches.length > 0) {
      frontmatterResolvable.push(fmSym);
    } else {
      frontmatterHintsUnresolved++;
      log.debug("pipeline: frontmatter symbol did not resolve", {
        sourcePath: file.relPath,
        symbol: fmSym,
      });
    }
  }

  let claimsWritten = 0;
  let unresolved = 0;
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
  return { claimsWritten, unresolved, frontmatterHintsUnresolved };
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
