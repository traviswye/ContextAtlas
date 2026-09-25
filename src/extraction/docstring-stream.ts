/**
 * Docstring stream: claims extracted from source-symbol docstrings
 * (v0.3 Stream B; retry-safe per-file writes since v1.2 Phase 2).
 *
 * One model call per exported symbol with a non-empty docstring, sent
 * as the whole document body to the frozen `EXTRACTION_PROMPT` (H1
 * single-prompt design, v0.3 Step 9). Claims carry `source:
 * "docstring:<relPath>"`, `source_path` relPath, and two-channel
 * attribution:
 *   - provenance: the documented symbol's exact `SymbolId` is always
 *     linked;
 *   - cross-references: the claim's `symbol_candidates` resolved with
 *     `resolveCandidates`, the same path as ADR claims.
 *
 * The unit of work is a file, keyed in `source_shas` as relPath →
 * file SHA. Per lead decision L-10 (i), a file's claims are replaced
 * and its SHA pinned in ONE transaction, and only when every step for
 * that file succeeded: its docstrings were all read, every model call
 * returned a parseable result, and the write committed. Any failure
 * leaves the file's previous claims and key exactly as they were, so
 * the next run retries the whole file; the failing file's remaining
 * calls are not made, because their results would be discarded. A
 * file with no docstring to extract is still keyed (its old claims, if
 * any, are cleared), so it is not re-read on every run.
 *
 * Layers:
 *   - `readFileDocstrings` (`docstring-read.ts`): the zero-API read
 *     (LSP only). The pipeline's planning pass runs it ahead of
 *     extraction to count calls exactly and caches the result.
 *   - {@link extractDocstringFile}: the per-file core. Takes the file's
 *     already-listed symbols (Stage 3 inventory grouped with
 *     `groupSymbolsByPath`) and, optionally, the cached read.
 *   - {@link extractDocstringsForFile}: the legacy entry point, which
 *     lists the file's symbols itself. The benchmarks repo and
 *     `scripts/` import it from `pipeline.js` (re-exported there), so its
 *     positional signature and result field names are stable.
 *
 * `runExtractionPipeline` (`contextatlas index`) runs the core as Stage
 * 6c since v1.2 Phase 2 (`stream-stages.ts`), with the planning pass's
 * cached read (`extraction-plan.ts`).
 */

import {
  deleteClaimsBySourcePath,
  insertClaim,
  setSourceSha,
  type NewClaim,
} from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";
import { getSymbol } from "../storage/symbols.js";
import type {
  LanguageAdapter,
  Symbol as AtlasSymbol,
  SymbolId,
} from "../types.js";

import type {
  ExtractionCallResult,
  ExtractionClient,
} from "./anthropic-client.js";
import {
  readFileDocstrings,
  type DocstringSymbolError,
  type FileDocstrings,
} from "./docstring-read.js";
import { addUsage, ZERO_USAGE, type UsageInfo } from "./pricing.js";
import { resolveCandidates, type SymbolInventory } from "./resolver.js";

/** The file a {@link extractDocstringFile} call works on. */
export interface DocstringFile {
  readonly relPath: string;
  /** Current file SHA, pinned as the file's key on success. */
  readonly sha: string;
  /** The file's listed symbols (its Stage 3 inventory entries). */
  readonly symbols: readonly AtlasSymbol[];
}

interface DocstringFileOutcomeBase {
  /** The docstring read the extraction used (the cached one when given). */
  readonly docstrings: FileDocstrings;
  /** Model calls attempted, including one that threw. */
  readonly apiCalls: number;
  /** Usage of calls that returned; a thrown call's usage is unknown. */
  readonly usage: UsageInfo;
}

/**
 * Outcome of one file.
 *
 *   - `stored` — the file's claims were replaced (possibly by none) and
 *     its SHA pinned, in one transaction.
 *   - `failed` — nothing was written; the file keeps its previous claims
 *     and key. `read`: a docstring could not be read (no model call is
 *     made). `extract`: a call threw or returned no parseable result
 *     (max_tokens or malformed JSON); later calls for the file are not
 *     made. `store`: a documented symbol is missing from the symbols
 *     table (checked before any call), or the write failed and was
 *     rolled back.
 */
export type DocstringFileOutcome =
  | (DocstringFileOutcomeBase & {
      readonly status: "stored";
      readonly claimsWritten: number;
      /** Unresolved `symbol_candidates` summed across the written claims. */
      readonly unresolvedCandidates: number;
    })
  | (DocstringFileOutcomeBase & {
      readonly status: "failed";
      readonly phase: "read" | "extract" | "store";
      /** Calls that threw or returned no parseable result (0 or 1). */
      readonly failedCalls: number;
      readonly errors: readonly DocstringSymbolError[];
    });

/**
 * Extract and store one file's docstring claims (see the module header
 * for the all-or-nothing rule). Never throws for a per-file failure;
 * the outcome says what happened. Pass `docstrings` from the planning
 * pass's {@link readFileDocstrings} to avoid a second LSP read; when
 * omitted they are read now through `adapter`.
 */
export async function extractDocstringFile(
  db: DatabaseInstance,
  adapter: LanguageAdapter,
  file: DocstringFile,
  inventory: SymbolInventory,
  client: ExtractionClient,
  docstrings?: FileDocstrings,
): Promise<DocstringFileOutcome> {
  const read = docstrings ?? (await readFileDocstrings(adapter, file.symbols));
  const keep = keptMessage(file.relPath);
  let apiCalls = 0;
  let usage: UsageInfo = ZERO_USAGE;
  const fail = (
    phase: "read" | "extract" | "store",
    errors: readonly DocstringSymbolError[],
    failedCalls = 0,
  ): DocstringFileOutcome => ({
    status: "failed",
    phase,
    docstrings: read,
    apiCalls,
    usage,
    failedCalls,
    errors: errors.map((e) => ({ ...e, error: `${e.error}. ${keep}` })),
  });

  if (read.errors.length > 0) return fail("read", read.errors);

  // A documented symbol must exist in the symbols table: its claims link
  // it (claim_symbols foreign key). Checked before paying for any call.
  for (const { symbolId } of read.entries) {
    if (getSymbol(db, symbolId) !== null) continue;
    return fail("store", [
      {
        symbolId,
        error:
          `${symbolId} is not in the symbols table, so claims from its ` +
          `docstring cannot link it (claim_symbols foreign key). Upsert ` +
          `the file's symbols (upsertSymbols with the symbol inventory) ` +
          `before extracting its docstrings`,
      },
    ]);
  }

  const rows: Array<{ symbolId: SymbolId; claim: NewClaim }> = [];
  let unresolvedCandidates = 0;
  for (const { symbolId, docstring } of read.entries) {
    apiCalls++;
    let extracted: ExtractionCallResult;
    try {
      extracted = await client.extract(docstring);
    } catch (err) {
      const error = `docstring extraction failed for ${symbolId}: ${String(err)}`;
      return fail("extract", [{ symbolId, error }], 1);
    }
    // A null result (max_tokens or malformed JSON) still consumed tokens.
    usage = addUsage(usage, extracted.usage);
    if (!extracted.result) {
      const error =
        `docstring extraction for ${symbolId} returned no parseable ` +
        "result (max_tokens or malformed JSON)";
      return fail("extract", [{ symbolId, error }], 1);
    }
    for (const ec of extracted.result.claims) {
      const resolved = resolveCandidates(inventory, ec.symbol_candidates);
      unresolvedCandidates += resolved.unresolved.length;
      rows.push({
        symbolId,
        claim: {
          source: `docstring:${file.relPath}`,
          sourcePath: file.relPath,
          sourceSha: file.sha,
          severity: ec.severity,
          claim: ec.claim,
          rationale: ec.rationale,
          excerpt: ec.excerpt,
          // Provenance first, then cross-references; a documented symbol
          // that is also a candidate is linked once.
          symbolIds: Array.from(new Set([symbolId, ...resolved.symbolIds])),
          // F-7: the model's raw candidates only. Unlike the Skill, which
          // lists the documented symbol's name first because it has no
          // other provenance channel, the CLI keeps provenance as the
          // exact id in symbolIds; a bare name here would let a later
          // name-based re-resolve (resolve-symbols) link every
          // same-named symbol.
          symbolCandidates: ec.symbol_candidates,
        },
      });
    }
  }

  // Replace + key in one transaction; a failure rolls all of it back.
  // `progress` names the symbol whose claims were being written, if any.
  const progress: { symbolId: SymbolId | null } = { symbolId: null };
  try {
    db.transaction(() => {
      deleteClaimsBySourcePath(db, file.relPath);
      for (const row of rows) {
        progress.symbolId = row.symbolId;
        insertClaim(db, row.claim);
      }
      progress.symbolId = null;
      setSourceSha(db, file.relPath, file.sha);
    })();
  } catch (err) {
    const from = progress.symbolId;
    const error =
      `failed to store docstring claims for ${file.relPath}` +
      (from ? ` (claims from ${from}'s docstring)` : "") +
      `; the write was rolled back: ${String(err)}`;
    return fail("store", [{ symbolId: from, error }]);
  }

  return {
    status: "stored",
    docstrings: read,
    apiCalls,
    usage,
    claimsWritten: rows.length,
    unresolvedCandidates,
  };
}

function keptMessage(relPath: string): string {
  return (
    `${relPath} was left unchanged (its existing claims and source SHA ` +
    `were kept), so the next run retries the whole file`
  );
}

// ---------------------------------------------------------------------------
// Legacy entry point (v0.3 Step 10): benchmarks repo + scripts
// ---------------------------------------------------------------------------

export interface DocstringExtractionResult {
  /** Number of claims written to the database (0 when the file failed). */
  claimsWritten: number;
  /** Number of symbols listSymbols returned for this file. */
  symbolsProcessed: number;
  /**
   * Number of exported symbols (per language convention) considered
   * for docstring extraction. Subset of symbolsProcessed.
   */
  symbolsExported: number;
  /**
   * Number of symbols that had a non-null/non-empty docstring, i.e.
   * the calls the file needs. Subset of symbolsExported.
   */
  symbolsWithDocstring: number;
  /** Cumulative count of unresolved symbol_candidates across written claims. */
  unresolvedCandidates: number;
  /**
   * Number of API calls made. Fewer than symbolsWithDocstring when the
   * file failed: its remaining calls are not made.
   */
  apiCalls: number;
  /** Token usage across all API calls. */
  totalUsage: UsageInfo;
  /**
   * Why the file was not updated (empty on success): the first failing
   * symbol, or every symbol whose docstring could not be read. A
   * whole-file write failure uses relPath as `symbolId`.
   */
  errors: Array<{ symbolId: SymbolId; error: string }>;
}

/**
 * Extract architectural claims from docstrings in a single source file:
 * lists the file's symbols through `adapter`, then runs
 * {@link extractDocstringFile}. The file's claims are replaced and its
 * SHA pinned only when everything succeeded; otherwise they are left as
 * they were and `errors` says why (since v1.2 Phase 2; it used to
 * delete the file's claims first and pin the SHA regardless).
 *
 * Throws only when `listSymbols` fails, without touching the file's
 * claims or SHA (callers such as the benchmarks driver halt on it).
 * Callers must upsert the symbol inventory before calling.
 */
export async function extractDocstringsForFile(
  db: DatabaseInstance,
  adapter: LanguageAdapter,
  relPath: string,
  fileSha: string,
  inventory: SymbolInventory,
  anthropicClient: ExtractionClient,
): Promise<DocstringExtractionResult> {
  let symbols: AtlasSymbol[];
  try {
    symbols = await adapter.listSymbols(relPath);
  } catch (err) {
    throw new Error(
      `extractDocstringsForFile: listSymbols failed for ${relPath}; its ` +
        `existing claims and source SHA were left unchanged. Check the ` +
        `${adapter.language} language server, then re-run to retry the ` +
        `file: ${String(err)}`,
      { cause: err },
    );
  }

  const outcome = await extractDocstringFile(
    db,
    adapter,
    { relPath, sha: fileSha, symbols },
    inventory,
    anthropicClient,
  );
  const stored = outcome.status === "stored";
  return {
    claimsWritten: stored ? outcome.claimsWritten : 0,
    symbolsProcessed: outcome.docstrings.symbolsProcessed,
    symbolsExported: outcome.docstrings.symbolsExported,
    symbolsWithDocstring: outcome.docstrings.entries.length,
    unresolvedCandidates: stored ? outcome.unresolvedCandidates : 0,
    apiCalls: outcome.apiCalls,
    totalUsage: outcome.usage,
    errors: stored
      ? []
      : outcome.errors.map((e) => ({
          symbolId: e.symbolId ?? relPath,
          error: e.error,
        })),
  };
}
