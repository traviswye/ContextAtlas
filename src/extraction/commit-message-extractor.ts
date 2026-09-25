/**
 * Commit-message claim extractor — v0.4 Step 4 (Stream A).
 *
 * Extends the v0.3 docstring extraction pattern to commit messages
 * as a third claim source alongside ADRs (v0.1) + docstrings (v0.3).
 * Architectural-intent claims found in git commit messages augment
 * the atlas's intent registry without requiring curated ADRs.
 *
 * Architectural pattern (per Step 4 design lock): ADR-style
 * attribution, NOT docstring-style. Commit messages are free-form
 * prose claims about architectural decisions. `symbol_candidates`
 * extracted via existing `EXTRACTION_PROMPT` and resolved via
 * `resolveCandidates` against the symbol inventory — same code path
 * as ADR claims. There is no "documented symbol provenance" channel
 * because commits have no a priori symbol anchor.
 *
 * Collection (git log walk, filter, extraction body) lives in
 * `commit-log.ts` since v1.2 Phase 2 and is re-exported below.
 *
 * Idempotency (per Q5 lock): keyed on the commit SHA in the
 * `source_shas` table. The key is `commit:<sha>` (v1.2 Phase 2,
 * F-5 / lead decision L-2), and so is every claim's `source` and
 * `source_path`. The legacy bare-sha key the `/index-atlas` Skill
 * wrote before v1.2 is also accepted (`hasCommitKey`). Re-running
 * extraction skips keyed commits. EXTRACTION_PROMPT changes will NOT
 * retroactively update old commits' claims; there is still no
 * force-re-extract flag (`--full` leaves commits key-gated, L-7).
 *
 * Storage (v1.2 Phase 2): each commit's delete-before-insert, claim
 * inserts and key write run in ONE transaction, so a re-extraction
 * can never duplicate claims and a failed write leaves the prior
 * state intact. A null result or malformed JSON (a `ParseError` from
 * the client) pins the key with zero claims and logs a warning (L-10
 * iii): the commit is immutable and the failure likely deterministic,
 * so it is not re-billed on every run. Any other thrown client error
 * (API, network) leaves the commit unkeyed, so the next run retries it.
 *
 * Still not implemented: an `extraction.commit_message_max` cap for
 * huge histories, and a force-re-extract flag.
 *
 * Per [`v0.4-SCOPE.md`](../../docs/cycles/v0_4/v0.4-SCOPE.md) Stream A
 * commit-message extraction subsection. Historical: the v0.4 Q3
 * threshold (≥30 claims/repo on at least 2 of 3 repos AND any single
 * repo above 50) was a v0.4 evaluation gate for atlas integration. No
 * code in `src/` applies it, and v1.2 Phase 2 dropped it from the CLI
 * commit stream (lead decision L-4); `extraction.streams` is the off
 * switch.
 */

import { log } from "../mcp/logger.js";
import {
  deleteClaimsBySourcePath,
  deleteSourceSha,
  insertClaim,
  setSourceSha,
  type NewClaim,
} from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";
import type { ContextAtlasConfig } from "../types.js";

import {
  ParseError,
  type ExtractionCallResult,
  type ExtractionClient,
} from "./anthropic-client.js";
import {
  buildCommitExtractionBody,
  makeDefaultCommitFilter,
  parseCommitLog,
  type CommitMetadata,
  type ParseCommitLogOptions,
} from "./commit-log.js";
import { addUsage, ZERO_USAGE, type UsageInfo } from "./pricing.js";
import { resolveCandidates, type SymbolInventory } from "./resolver.js";
import { commitSourceKey, hasCommitKey } from "./source-keys.js";

// Collection API, re-exported: external scripts and older call sites
// import it from this module.
export {
  buildCommitExtractionBody,
  DEFAULT_BODY_ANYWHERE_PATTERNS,
  DEFAULT_SUBJECT_PREFIX_PATTERNS,
  makeDefaultCommitFilter,
  parseCommitLog,
  type CommitFilter,
  type CommitMetadata,
  type ParseCommitLogOptions,
} from "./commit-log.js";

// ---------------------------------------------------------------------------
// Orchestration (Step 4.3 + Step 4.4; v1.2 Phase 2) — extract claims for
// filtered commits, resolve candidates against the symbol inventory, and
// persist them.
//
// Two entry points share one per-commit core (`extractCommitClaims`):
//   - `extractCommitMessagesForRepo`: the standalone whole-repo pass. The
//     benchmarks repo scripts (`extract-benchmark-atlas.mjs`,
//     `v0.4-step5-mock-test.mjs`) call it and read its result fields by
//     name, so its signature and field names stay stable; new fields are
//     additive only. (`scripts/dogfood-extract.mjs` also called it until
//     it was retired after the v1.2 Phase 2 parity run.)
//   - `runExtractionPipeline` (`contextatlas index`, Stage 6d since v1.2
//     Phase 2) plans the pending commits itself (`extraction-plan.ts`) and
//     runs the per-commit core through `stream-stages.ts`.
// ---------------------------------------------------------------------------

/**
 * Outcome of extracting and storing one commit's claims.
 *
 *   - `stored` — claims (possibly zero) replaced the commit's previous
 *     claims in either key form, and `commit:<sha>` was keyed.
 *   - `null-result` — the call returned no parseable result: a null
 *     result (max_tokens, no text block) or a `ParseError` (malformed
 *     JSON; its usage is kept). The key is pinned with zero claims
 *     (L-10 iii); existing claims under the key are left as they were.
 *   - `failed` — `extract`: the client threw an API or network error
 *     after its retries, so the usage of that call is unknown (zero
 *     here). `store`: the call returned but the write failed and was
 *     rolled back. Either way the commit is not keyed, so the next run
 *     retries it.
 */
export type CommitClaimsOutcome =
  | {
      readonly status: "stored";
      readonly usage: UsageInfo;
      readonly claimsWritten: number;
      readonly claimsWithSymbols: number;
      readonly unresolvedCandidates: number;
    }
  | { readonly status: "null-result"; readonly usage: UsageInfo }
  | {
      readonly status: "failed";
      readonly phase: "extract" | "store";
      readonly usage: UsageInfo;
      readonly error: string;
    };

/**
 * Extract one commit (one API call) and store its claims under the
 * canonical `commit:<sha>` key. Does not check whether the commit is
 * already keyed; callers skip keyed commits via `hasCommitKey`.
 *
 * Symbol attribution (per Q1 lock) follows the ADR-style pattern:
 * `symbol_candidates` come from the model's parse of the commit text
 * and `resolveCandidates` maps them onto the inventory. Claims with no
 * resolved candidate are still written with `symbolIds: []`, the same
 * fallback as ADR claims.
 *
 * The write is one transaction: delete the commit's claims in both key
 * forms, drop a legacy bare-sha key, insert the new claims and key
 * `commit:<sha>`. Duplicates are therefore impossible, and a failure
 * mid-write leaves the previous state untouched.
 */
export async function extractCommitClaims(
  db: DatabaseInstance,
  commit: CommitMetadata,
  inventory: SymbolInventory,
  anthropicClient: ExtractionClient,
): Promise<CommitClaimsOutcome> {
  const key = commitSourceKey(commit.sha);

  let extracted: ExtractionCallResult;
  let unparseable = "max_tokens or no text block";
  try {
    extracted = await anthropicClient.extract(buildCommitExtractionBody(commit));
  } catch (err) {
    // Malformed JSON throws ParseError from the client (v0.8 A1). The API
    // answered and billed the call, and the failure is expected to repeat
    // for the same input, so it takes the null-result path (L-10 iii) with
    // the response's usage rather than staying unkeyed and re-billed.
    if (err instanceof ParseError) {
      extracted = { result: null, usage: err.usage };
      unparseable = `malformed JSON: ${err.reason}`;
    } else {
      return {
        status: "failed",
        phase: "extract",
        usage: ZERO_USAGE,
        error: String(err),
      };
    }
  }
  const usage = extracted.usage;

  if (!extracted.result) {
    try {
      db.transaction(() => {
        deleteSourceSha(db, commit.sha);
        setSourceSha(db, key, commit.sha);
      })();
    } catch (err) {
      return storeFailure(key, usage, err);
    }
    log.warn(
      `commit-message-extractor: extraction returned no parseable result ` +
        `for ${key} (${unparseable}). Recorded it as ` +
        `extracted with zero claims so it is not re-billed on every run. ` +
        `To retry it, remove the "${key}" entry from source_shas and ` +
        `re-run extraction: in atlas.json with atlas.committed: true, or ` +
        `in the local cache (atlas.local_cache, table source_shas) with ` +
        `atlas.committed: false.`,
      { sha: commit.sha, subject: commit.subject },
    );
    return { status: "null-result", usage };
  }

  const rows: NewClaim[] = [];
  let claimsWithSymbols = 0;
  let unresolvedCandidates = 0;
  for (const ec of extracted.result.claims) {
    const resolved = resolveCandidates(inventory, ec.symbol_candidates);
    unresolvedCandidates += resolved.unresolved.length;
    if (resolved.symbolIds.length > 0) claimsWithSymbols++;
    rows.push({
      source: key,
      sourcePath: key,
      sourceSha: commit.sha,
      severity: ec.severity,
      claim: ec.claim,
      ...(ec.rationale ? { rationale: ec.rationale } : {}),
      ...(ec.excerpt ? { excerpt: ec.excerpt } : {}),
      symbolIds: resolved.symbolIds,
      // F-7: raw candidates, kept for atlas export. Commits are never
      // re-extracted, so this is the only chance to record them.
      symbolCandidates: ec.symbol_candidates,
    });
  }

  try {
    db.transaction(() => {
      deleteClaimsBySourcePath(db, key);
      // Legacy bare-sha form (Skill before v1.2): same commit, same claims.
      deleteClaimsBySourcePath(db, commit.sha);
      deleteSourceSha(db, commit.sha);
      for (const row of rows) insertClaim(db, row);
      setSourceSha(db, key, commit.sha);
    })();
  } catch (err) {
    return storeFailure(key, usage, err);
  }

  return {
    status: "stored",
    usage,
    claimsWritten: rows.length,
    claimsWithSymbols,
    unresolvedCandidates,
  };
}

function storeFailure(
  key: string,
  usage: UsageInfo,
  err: unknown,
): CommitClaimsOutcome {
  return {
    status: "failed",
    phase: "store",
    usage,
    error:
      `failed to store claims for ${key}; the write was rolled back and ` +
      `the commit stays unkeyed, so the next run retries it: ${String(err)}`,
  };
}

/**
 * Per-run summary stats from `extractCommitMessagesForRepo`. Field names
 * are read by external scripts; add fields, never rename.
 */
export interface CommitExtractionResult {
  /** Total commits returned by `git log --no-merges`. */
  readonly commitsTotal: number;
  /** Commits that passed the architectural-intent filter. */
  readonly commitsFiltered: number;
  /**
   * Commits whose extraction call returned a response: stored, null
   * result or malformed JSON (pinned), or a write that then failed.
   * Excludes idempotent skips and calls that threw an API or network
   * error.
   */
  readonly commitsExtracted: number;
  /** Commits skipped because they were already keyed (either key form). */
  readonly commitsSkippedIdempotent: number;
  /** Total claims written (sum across all extracted commits). */
  readonly claimsWritten: number;
  /** Claims with at least one resolved symbol candidate. */
  readonly claimsWithSymbols: number;
  /** Cumulative API usage across all extraction calls. */
  readonly totalUsage: UsageInfo;
  /**
   * Per-commit errors: API or network errors the client threw after
   * its retries, and writes that failed and were rolled back. The
   * commit stays unkeyed.
   */
  readonly errors: ReadonlyArray<{ readonly sha: string; readonly error: string }>;
  /** v1.2: extraction calls attempted, including ones that threw. */
  readonly apiCalls: number;
  /** v1.2: unresolved `symbol_candidates` summed across written claims. */
  readonly unresolvedCandidates: number;
  /**
   * v1.2: commits whose call returned no parseable result (a null
   * result, or malformed JSON thrown as `ParseError`); keyed with zero
   * claims (L-10 iii) and counted in `commitsExtracted` too.
   */
  readonly commitsNullResult: number;
}

/** Options for {@link extractCommitMessagesForRepo}. */
export type CommitExtractionOptions = ParseCommitLogOptions;

/**
 * Extract architectural-intent claims from filtered git commit
 * messages and persist them as `source: "commit:<sha>"` claims, one
 * {@link extractCommitClaims} call per commit not yet keyed.
 *
 * Throws when `repoRoot` is not a git tree or git cannot run (see
 * `parseCommitLog`); per-commit failures are collected in `errors`
 * and never stop the run.
 */
export async function extractCommitMessagesForRepo(
  db: DatabaseInstance,
  repoRoot: string,
  config: Pick<ContextAtlasConfig, "extraction">,
  inventory: SymbolInventory,
  anthropicClient: ExtractionClient,
  options: CommitExtractionOptions = {},
): Promise<CommitExtractionResult> {
  const filter = makeDefaultCommitFilter(
    config.extraction?.commitMessageFilter ?? [],
  );
  const allCommits = parseCommitLog(repoRoot, () => true, options);
  const filtered = allCommits.filter((c) => filter(c.subject, c.body));
  log.info("commit-message-extractor: filtered commits", {
    total: allCommits.length,
    matched: filtered.length,
  });

  let commitsExtracted = 0;
  let commitsSkippedIdempotent = 0;
  let claimsWritten = 0;
  let claimsWithSymbols = 0;
  let totalUsage: UsageInfo = ZERO_USAGE;
  const errors: Array<{ sha: string; error: string }> = [];
  let apiCalls = 0;
  let unresolvedCandidates = 0;
  let commitsNullResult = 0;

  for (const commit of filtered) {
    if (hasCommitKey(db, commit.sha)) {
      commitsSkippedIdempotent++;
      continue;
    }
    apiCalls++;
    const outcome = await extractCommitClaims(
      db,
      commit,
      inventory,
      anthropicClient,
    );
    totalUsage = addUsage(totalUsage, outcome.usage);
    if (outcome.status === "failed") {
      if (outcome.phase === "store") commitsExtracted++;
      errors.push({ sha: commit.sha, error: outcome.error });
      continue;
    }
    commitsExtracted++;
    if (outcome.status === "null-result") {
      commitsNullResult++;
      continue;
    }
    claimsWritten += outcome.claimsWritten;
    claimsWithSymbols += outcome.claimsWithSymbols;
    unresolvedCandidates += outcome.unresolvedCandidates;
  }

  return {
    commitsTotal: allCommits.length,
    commitsFiltered: filtered.length,
    commitsExtracted,
    commitsSkippedIdempotent,
    claimsWritten,
    claimsWithSymbols,
    totalUsage,
    errors,
    apiCalls,
    unresolvedCandidates,
    commitsNullResult,
  };
}
