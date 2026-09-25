/**
 * Prose stream (config name `adr`): ADRs and `docs.include` files,
 * pipeline Stage 6. Moved out of `pipeline.ts` at v1.2 Phase 2
 * unchanged in behaviour; the only difference is that calls, usage and
 * the budget check go through the run-wide {@link RunCostTracker}.
 *
 * Files are extracted in concurrent batches (default 3). A file whose
 * call returned a parseable result has its claims replaced (delete by
 * path, then insert) and its SHA pinned; a null result (max_tokens)
 * leaves the file unkeyed so the next run retries it; a thrown call is
 * recorded in `errors` and also left unkeyed. Malformed JSON throws a
 * `ParseError` (so it is an error here, as before), and its usage is
 * still counted (v1.2 Phase 2 review fix). It does not count toward the
 * pipeline's all-failed check (`failedCalls`), which would otherwise
 * stop the docstring and commit streams on every run while one
 * unparseable file was the only prose work (review round 2).
 *
 * A file that is not stored (thrown call, null result) is recorded for
 * a retry (`retry-keys.ts`, review round 2.3): under `--full` its key
 * already names its current content, so the SHA diff alone would never
 * retry it. A stored file is removed from that list.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { log } from "../mcp/logger.js";
import { parseRstSymbols } from "../parsing/rst-parser.js";
import {
  deleteClaimsBySourcePath,
  insertClaim,
  setSourceSha,
  type NewClaim,
} from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";
import { recordSourceKeyStream } from "../storage/source-key-streams.js";

import {
  ParseError,
  usageOfFailedCall,
  type ExtractionClient,
} from "./anthropic-client.js";
import type { ProseFile } from "./file-walker.js";
import { parseFrontmatterSymbols } from "./frontmatter.js";
import { clearRetry, markForRetry } from "./retry-keys.js";
import type {
  FileUnresolvedDetail,
  UnresolvedClaimDetail,
} from "./pipeline-types.js";
import type { ExtractedClaim } from "./prompt.js";
import { stripFrontmatter } from "./prompt.js";
import { resolveCandidates, type SymbolInventory } from "./resolver.js";
import type { RunCostTracker } from "./run-cost.js";

/**
 * v0.7.2 substrate-currency migration: emit modern `adr:<basename>`
 * convention matching Skill `/index-atlas` SKILL.md spec +
 * `validate-extraction` canonical source-field format invariant.
 *
 * Pre-v0.7.2 emitted frontmatter `id` field (ADR-NN) which was the
 * substrate-currency outlier — Skill substrate at v0.7 Step 2.3.b.0
 * adopted prefix convention but CLI `deriveSourceName` preserved
 * pre-v0.5 era identifier-only format unchanged through cycle
 * boundaries. Empirically surfaced at v0.7.1 first-run mechanical-
 * floor verification (validate-extraction `adr_claims_present`
 * invariant failure on CLI atlases despite legitimate ADR claims).
 *
 * Post-v0.7.2 substrate-convention alignment: CLI + Skill + validator
 * all emit/expect `adr:<basename>` for ADR-source claims.
 */
export function deriveSourceName(absPath: string): string {
  return `adr:${basename(absPath)}`;
}

export interface ProseStageResult {
  claimsWritten: number;
  unresolvedCandidates: number;
  unresolvedFrontmatterHints: number;
  unresolvedDetails: FileUnresolvedDetail[];
  /** One entry per file whose call threw. */
  errors: Array<{ sourcePath: string; error: string }>;
  /**
   * Files whose call threw an API or network error. A malformed-JSON
   * response (`ParseError`) is in `errors` but not counted here: the API
   * answered, so it is per-file noise, not the key or config problem the
   * all-failed check looks for (review round 2).
   */
  failedCalls: number;
  /** The first such call's error, for the all-failed message. */
  firstFailedCallError?: string;
}

export interface ProseStageInput {
  db: DatabaseInstance;
  files: readonly ProseFile[];
  inventory: SymbolInventory;
  client: ExtractionClient;
  batchSize: number;
  narrowAttribution: "drop" | "drop-with-fallback" | undefined;
  cost: RunCostTracker;
}

/** Extract the planned prose files (Stage 6). Never throws per file. */
export async function runProseStage(
  input: ProseStageInput,
): Promise<ProseStageResult> {
  const { db, files, inventory, client, batchSize, cost } = input;
  const out: ProseStageResult = {
    claimsWritten: 0,
    unresolvedCandidates: 0,
    unresolvedFrontmatterHints: 0,
    unresolvedDetails: [],
    errors: [],
    failedCalls: 0,
  };

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (file) => {
        cost.addCalls(1);
        try {
          const body = stripFrontmatter(readFileSync(file.absPath, "utf8"));
          const extracted = await client.extract(body);
          return { file, extracted };
        } catch (err) {
          // Malformed JSON (ParseError) was still billed: count its usage.
          cost.addUsage(usageOfFailedCall(err));
          out.errors.push({ sourcePath: file.relPath, error: String(err) });
          markForRetry(db, file.relPath);
          if (!(err instanceof ParseError)) {
            out.failedCalls++;
            out.firstFailedCallError ??= String(err);
          }
          return { file, extracted: null };
        }
      }),
    );

    for (const { file, extracted } of results) {
      if (!extracted) continue;
      // Accumulate usage regardless of whether result is null — a
      // max_tokens or malformed-JSON response still consumed tokens.
      cost.addUsage(extracted.usage);
      if (!extracted.result) {
        markForRetry(db, file.relPath);
        continue;
      }
      const outcome = writeClaimsForFile(
        db,
        file,
        extracted.result.claims,
        inventory,
        input.narrowAttribution,
      );
      out.claimsWritten += outcome.claimsWritten;
      out.unresolvedCandidates += outcome.unresolved;
      out.unresolvedFrontmatterHints += outcome.frontmatterHintsUnresolved;
      if (outcome.detail) out.unresolvedDetails.push(outcome.detail);
      setSourceSha(db, file.relPath, file.sha);
      // Cache-only: lets a zero-claim key be told apart from a docstring
      // key at the same path (`source-key-streams.ts`).
      recordSourceKeyStream(db, file.relPath, "prose", file.sha);
      clearRetry(db, file.relPath);
    }

    // Budget warning at most once per run, checked after each batch.
    cost.checkBudget();
  }
  return out;
}

/**
 * ADR authoring validation (v0.3 Theme 1.2 Fix 1). Surface a single
 * warning summarizing files with unresolved frontmatter symbols.
 * Per-symbol detail stays at debug level; per-file breakdown lands at
 * the cli-runner display layer (see cli-runner.ts
 * printFrontmatterWarnings) so callers see the concrete list without
 * needing --verbose. The warn-not-error stance is deliberate: ADRs
 * can legitimately reference forward-declared symbols (ADR-13's
 * PyrightAdapter / ADR-14's GoAdapter placeholders during their
 * ADR-drafting commits are precedent).
 */
export function warnUnresolvedFrontmatter(result: ProseStageResult): void {
  if (result.unresolvedFrontmatterHints === 0) return;
  const fileCount = result.unresolvedDetails.filter(
    (d) => d.frontmatterUnresolved.length > 0,
  ).length;
  log.warn(
    "extraction: ADR authoring validation — " +
      `${result.unresolvedFrontmatterHints} unresolved frontmatter symbol(s) ` +
      `detected across ${fileCount} file(s). Authors: confirm each ` +
      "unresolved symbol is intentional (e.g., placeholder for " +
      "unimplemented future work) or update the ADR to match current " +
      "source. See per-file detail in extraction summary or run with " +
      "--verbose.",
    { unresolvedFrontmatterHints: result.unresolvedFrontmatterHints, fileCount },
  );
}

function writeClaimsForFile(
  db: DatabaseInstance,
  file: ProseFile,
  extracted: readonly ExtractedClaim[],
  inventory: SymbolInventory,
  narrowAttribution: "drop" | "drop-with-fallback" | undefined,
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
  const source = deriveSourceName(file.absPath);

  // Author-declared frontmatter symbols are merged into every claim's
  // candidates as the authoritative leading entries (author intent ranks
  // ahead of model inference). Unresolved ones are excluded from the
  // merge so they don't inflate the claim-level unresolved count; they
  // are tracked separately as a per-file summary stat.
  //
  // Format dispatch (v0.7 Step 2.1.a Scope γ' substrate): ADR-bucket
  // files carry a `format` tag from the unified ADR enumeration
  // module. `.rst` ADRs use rST field-list parsing; `.md` ADRs +
  // doc-bucket files use YAML frontmatter parsing.
  const frontmatterSymbols =
    file.format === "rst"
      ? parseRstSymbols(rawContents)
      : parseFrontmatterSymbols(rawContents, file.relPath);
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
    // Attribution narrowing per v0.3 Step 7 A1 ship default
    // (drop-with-fallback). Two effective modes:
    //   - undefined / "drop-with-fallback" (default): claim-specific
    //     candidates only; if that resolves to zero symbols AND
    //     frontmatter has resolvable entries, fall back to
    //     frontmatter (preserves get_symbol_context visibility for
    //     vague claims).
    //   - "drop": claim-specific candidates only; no fallback. Pure
    //     narrowing; zero-symbol claims stay invisible to
    //     get_symbol_context (Option A regression risk).
    // The legacy v0.2 baseline (frontmatter merged into every claim
    // from the same file) is no longer reachable via this API —
    // Pattern 2 retention applies to the "drop" vs "drop-with-fallback"
    // axis, not to a config-level v0.2 baseline. Rollback to v0.2
    // baseline is at the version-pin / codepath level.
    // resolveCandidates dedupes within its result, so shared names
    // don't double-resolve.
    const merged = ec.symbol_candidates;
    const resolved = resolveCandidates(inventory, merged);
    let symbolIds = resolved.symbolIds;
    const unres = resolved.unresolved;
    // Zero-symbol fallback fires for both undefined (new default)
    // AND explicit "drop-with-fallback". Only "drop" suppresses the
    // fallback — that's the pure-narrowing mode where zero-symbol
    // claims stay invisible. Fallback symbols are already resolved
    // upstream, so unres is unaffected.
    if (
      narrowAttribution !== "drop" &&
      symbolIds.length === 0 &&
      frontmatterResolvable.length > 0
    ) {
      const fallback = resolveCandidates(inventory, frontmatterResolvable);
      symbolIds = fallback.symbolIds;
    }
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
      // F-7: the model's raw candidates, verbatim (frontmatter fallback
      // symbols are not candidates), for atlas export only.
      symbolCandidates: ec.symbol_candidates,
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
