/**
 * CLI glue for the `contextatlas resolve-symbols` subcommand (v0.7
 * Step 2.3.a.1 — Approach D Skill→LSP symbol-resolution bridge per
 * Travis Decision-3-α lock at Step 2.3 Checkpoint 2 disposition).
 *
 * Reads an atlas.json that was written by `/index-atlas` Skill in
 * claims-only stub state (`symbols: []`, `claims[].symbol_ids: []`,
 * `claims[].symbol_candidates: [...]` raw extraction strings).
 * Spawns LSP adapters for each configured language; walks source
 * files; builds a symbol inventory; resolves each claim's raw
 * candidates into canonical SymbolIds via R8 name-form normalization;
 * writes the enriched atlas back atomically (temp + rename).
 *
 * Cost: zero API calls. Local LSP subprocess interaction only.
 *
 * Substrate equivalence: post-resolve-symbols atlas substantively
 * matches CLI-path-produced atlas at the substrate-consistency layer
 * (symbols[] + claims[].symbol_ids populated; per-language LSP
 * coverage equivalent to `contextatlas index` LSP walk).
 *
 * Exit-code contract (ADR-12-style):
 *   0 — success (atlas read, resolved, written back)
 *   1 — pipeline failure (LSP walk threw; atlas not writable)
 *   2 — setup error (atlas not found; atlas malformed; config invalid;
 *       adapter init failed)
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";

import { createAdapter } from "../adapters/registry.js";
import { loadConfig } from "../config/parser.js";
import { log } from "../mcp/logger.js";
import type {
  AtlasFileV1,
  AtlasSymbolEntry,
} from "../storage/types.js";
import { ATLAS_VERSION } from "../storage/types.js";
import type { LanguageAdapter, LanguageCode } from "../types.js";

import { walkSourceFiles } from "./file-walker.js";
import {
  buildSymbolInventory,
  resolveCandidatesWithNormalization,
  type SymbolInventoryWithCoverage,
} from "./resolver.js";
import {
  coverageFromInventory,
  planSymbolPrune,
  warnUnverified,
  type SymbolCoverage,
  type SymbolPrunePlan,
} from "./symbol-prune.js";

export type ResolveSymbolsExitCode = 0 | 1 | 2;

export interface ResolveSymbolsCliOptions {
  configRoot: string;
  configFile: string | null;
  /** Test seam: where progress + summary output goes. Defaults to process.stdout.write. */
  writeStdout?: (chunk: string) => void;
  /** Test seam: where error output goes. Defaults to process.stderr.write. */
  writeStderr?: (chunk: string) => void;
}

export interface ResolveSymbolsCliResult {
  exitCode: ResolveSymbolsExitCode;
  /** Number of claims that gained at least one symbol_id after resolution. */
  claimsResolved?: number;
  /** Number of raw candidates that did not resolve to any symbol. */
  candidatesUnresolved?: number;
  /** Total symbols enumerated by the LSP walk. */
  symbolsEnumerated?: number;
  /** Prior atlas symbols dropped by the v1.2 Phase 1 prune rules. */
  symbolsPruned?: number;
  /** Claims that had ≥1 symbol_id on input and have none after this run. */
  claimsOrphaned?: number;
  /** claims[].symbol_ids entries dropped because no symbol has that id. */
  danglingLinksDropped?: number;
  /** Files whose prior symbols were kept without verification. */
  unverifiedSymbolFiles?: number;
}

/**
 * Rebuild `symbols[]` for an atlas (v1.2 Phase 1 D6 parity with the
 * CLI pipeline's Stage 4a prune). Fresh LSP symbols replace prior
 * ones; prior symbols are kept only where the run could not verify
 * them (listing failed, or the language is not configured) — the same
 * `planSymbolPrune` rules the CLI applies. Before v1.2 the rebuild was
 * wholesale: stale symbols never survived, but neither did the symbols
 * of a file tsserver failed to list.
 */
export function reconcileAtlasSymbols(
  prior: readonly AtlasSymbolEntry[],
  fresh: readonly AtlasSymbolEntry[],
  coverage: SymbolCoverage,
): { symbols: AtlasSymbolEntry[]; plan: SymbolPrunePlan } {
  const plan = planSymbolPrune(
    prior.map((s) => ({ id: s.id, path: s.path })),
    coverage,
  );
  const pruned = new Set(plan.pruneIds);
  const freshIds = new Set(fresh.map((s) => s.id));
  const keptPrior = prior.filter(
    (s) => !pruned.has(s.id) && !freshIds.has(s.id),
  );
  return { symbols: [...fresh, ...keptPrior], plan };
}

async function shutdownAll(
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>,
): Promise<void> {
  for (const [lang, adapter] of adapters) {
    try {
      await adapter.shutdown();
    } catch (err) {
      log.warn("resolve-symbols: adapter shutdown error", {
        lang,
        err: String(err),
      });
    }
  }
}

/**
 * Run the `resolve-symbols` subcommand end-to-end. Never throws — all
 * error paths map to exit codes and error messages logged.
 */
export async function runResolveSymbolsSubcommand(
  options: ResolveSymbolsCliOptions,
): Promise<ResolveSymbolsCliResult> {
  const writeStdout =
    options.writeStdout ?? ((chunk) => process.stdout.write(chunk));
  const writeStderr =
    options.writeStderr ?? ((chunk) => process.stderr.write(chunk));

  // Setup phase — config + atlas presence + adapters. Exit code 2.
  let config;
  try {
    config = options.configFile
      ? loadConfig(options.configRoot, options.configFile)
      : loadConfig(options.configRoot);
  } catch (err) {
    writeStderr(`resolve-symbols: failed to load config: ${String(err)}\n`);
    return { exitCode: 2 };
  }

  const sourceRoot = config.source?.root
    ? pathResolve(options.configRoot, config.source.root)
    : options.configRoot;

  const atlasPath = pathResolve(options.configRoot, config.atlas.path);
  if (!existsSync(atlasPath)) {
    writeStderr(
      `resolve-symbols: atlas not found at ${config.atlas.path}. ` +
        `Run \`/index-atlas\` (Skill) or \`contextatlas index\` (CLI) ` +
        `to produce the atlas before resolving symbols.\n`,
    );
    return { exitCode: 2 };
  }

  let atlas: AtlasFileV1;
  try {
    atlas = JSON.parse(readFileSync(atlasPath, "utf8")) as AtlasFileV1;
  } catch (err) {
    writeStderr(
      `resolve-symbols: atlas.json at ${config.atlas.path} did not parse as JSON: ${String(err)}\n`,
    );
    return { exitCode: 2 };
  }
  if (!Array.isArray(atlas.claims)) {
    writeStderr(
      `resolve-symbols: atlas.json at ${config.atlas.path} is missing a claims array; cannot resolve.\n`,
    );
    return { exitCode: 2 };
  }

  // R10 UX progress message — surface before the (sometimes-slow)
  // LSP cold-spawn so cohort users see substantive work happening.
  writeStdout(
    `Resolving symbols via LSP for ${config.languages.join(", ")} (${atlas.claims.length} claims)...\n`,
  );

  // Spawn adapters per configured language.
  const adapters = new Map<LanguageCode, LanguageAdapter>();
  const adapterOptions =
    config.lsp?.initializeTimeoutMs !== undefined
      ? { initializeTimeoutMs: config.lsp.initializeTimeoutMs }
      : undefined;
  try {
    for (const lang of config.languages) {
      const adapter = createAdapter(lang, adapterOptions);
      try {
        await adapter.initialize(sourceRoot);
      } catch (err) {
        writeStderr(
          `resolve-symbols: adapter initialization failed for ${lang}: ${String(err)}\n`,
        );
        await shutdownAll(adapters);
        return { exitCode: 2 };
      }
      adapters.set(lang, adapter);
    }
  } catch (err) {
    writeStderr(
      `resolve-symbols: adapter setup failed: ${String(err)}\n`,
    );
    await shutdownAll(adapters);
    return { exitCode: 2 };
  }

  // Pipeline phase — LSP walk + resolution + atomic write. Exit code 1.
  let result: ResolveSymbolsCliResult;
  try {
    const allExtensions = new Set<string>();
    for (const adapter of adapters.values()) {
      for (const ext of adapter.extensions) allExtensions.add(ext);
    }
    const sourceFiles = walkSourceFiles(sourceRoot, [...allExtensions]);

    const inventory: SymbolInventoryWithCoverage = await buildSymbolInventory(
      adapters,
      sourceFiles,
    );

    const freshSymbols: AtlasSymbolEntry[] = inventory.allSymbols.map(
      (s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        path: s.path,
        line: s.line,
        ...(s.signature !== undefined ? { signature: s.signature } : {}),
        ...(s.parentId !== undefined ? { parent_id: s.parentId } : {}),
        file_sha: s.fileSha ?? "",
      }),
    );
    const reconciled = reconcileAtlasSymbols(
      Array.isArray(atlas.symbols) ? atlas.symbols : [],
      freshSymbols,
      coverageFromInventory({
        repoRoot: sourceRoot,
        sourceFiles,
        inventory,
        adapters,
      }),
    );
    warnUnverified(reconciled.plan.unverified);
    const enrichedSymbols = reconciled.symbols;
    const finalIds = new Set(enrichedSymbols.map((s) => s.id));

    let claimsResolved = 0;
    let candidatesUnresolved = 0;
    let claimsOrphaned = 0;
    let danglingLinksDropped = 0;
    for (const claim of atlas.claims) {
      const before = Array.isArray(claim.symbol_ids) ? claim.symbol_ids : [];
      let linked = before;
      const rawCandidates =
        Array.isArray(claim.symbol_candidates) && claim.symbol_candidates.length > 0
          ? claim.symbol_candidates
          : [];
      if (rawCandidates.length > 0) {
        const { symbolIds, unresolved } = resolveCandidatesWithNormalization(
          inventory,
          rawCandidates,
        );
        if (symbolIds.length > 0) {
          // Merge with any existing symbol_ids (covers re-run idempotence).
          const merged = new Set<string>(before);
          for (const id of symbolIds) merged.add(id);
          linked = [...merged];
          claimsResolved += 1;
        }
        candidatesUnresolved += unresolved.length;
      }
      // v1.2 Phase 1 (D6): drop links to symbols that no longer exist.
      // A preserved or previously-resolved claim can carry the id of a
      // symbol whose file was deleted or renamed; left in place, that
      // dangling id makes the atlas fail to import (claim_symbols has a
      // foreign key on symbols). Mirrors the CLI prune's claim_symbols
      // cascade; the claim itself is kept.
      const kept = linked.filter((id) => finalIds.has(id));
      danglingLinksDropped += linked.length - kept.length;
      if (before.length > 0 && kept.length === 0) claimsOrphaned += 1;
      if (kept.length !== before.length || linked !== before) {
        claim.symbol_ids = kept;
      }
    }

    // Build enriched atlas envelope. Bump version to current
    // ATLAS_VERSION (1.4) since we've populated symbols[] +
    // claims[].symbol_ids (and the v1.4 envelope is the canonical
    // post-Step-2.3.a.1 substrate).
    const enrichedAtlas: AtlasFileV1 = {
      ...atlas,
      version: ATLAS_VERSION,
      symbols: enrichedSymbols,
    };

    // Atomic write: write to temp file in the same directory, then rename
    // (rename is atomic on the same filesystem; survives crashes mid-write).
    const tempPath = atlasPath + ".tmp";
    mkdirSync(dirname(atlasPath), { recursive: true });
    writeFileSync(tempPath, JSON.stringify(enrichedAtlas, null, 2), "utf8");
    renameSync(tempPath, atlasPath);

    writeStdout(
      `resolve-symbols: enumerated ${freshSymbols.length} symbols across ${sourceFiles.length} source files; ` +
        `resolved ${claimsResolved} of ${atlas.claims.length} claims; ` +
        `${candidatesUnresolved} candidate${candidatesUnresolved === 1 ? "" : "s"} unresolved (retained in symbol_candidates for diagnostic visibility).\n`,
    );

    const symbolsPruned = reconciled.plan.pruneIds.length;
    const unverifiedSymbolFiles = reconciled.plan.unverified.length;
    if (
      symbolsPruned > 0 ||
      danglingLinksDropped > 0 ||
      claimsOrphaned > 0 ||
      unverifiedSymbolFiles > 0
    ) {
      // v1.2 Phase 1 (D6). Printed only when something changed, so the
      // common cold-start output is unchanged.
      writeStdout(
        `resolve-symbols: pruned ${symbolsPruned} stale symbol${symbolsPruned === 1 ? "" : "s"}; ` +
          `dropped ${danglingLinksDropped} dangling symbol link${danglingLinksDropped === 1 ? "" : "s"}; ` +
          `${claimsOrphaned} claim${claimsOrphaned === 1 ? "" : "s"} orphaned (kept; re-extract their sources to re-attach); ` +
          `${unverifiedSymbolFiles} file${unverifiedSymbolFiles === 1 ? "" : "s"} unverified (prior symbols kept).\n`,
      );
    }

    result = {
      exitCode: 0,
      claimsResolved,
      candidatesUnresolved,
      symbolsEnumerated: freshSymbols.length,
      symbolsPruned,
      claimsOrphaned,
      danglingLinksDropped,
      unverifiedSymbolFiles,
    };
  } catch (err) {
    writeStderr(
      `resolve-symbols: pipeline failed: ${String(err)}\n`,
    );
    result = { exitCode: 1 };
  } finally {
    await shutdownAll(adapters);
  }

  return result;
}
