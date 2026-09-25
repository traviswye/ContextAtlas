/**
 * Stages 6c (docstring) and 6d (commit) of `runExtractionPipeline`
 * (v1.2 Phase 2, F-2): the loops that run each stream's per-unit core
 * over the plan, share the run-wide cost tracker and budget check, and
 * collect per-stream counts and errors.
 *
 *   - 6c runs `extractDocstringFile` (`docstring-stream.ts`) per planned
 *     file with the planning pass's cached docstring read. A file's
 *     claims are replaced and its SHA pinned only when every call for it
 *     succeeded (L-10 i); otherwise it keeps its previous claims and key
 *     and is retried next run.
 *   - 6d runs `extractCommitClaims` (`commit-message-extractor.ts`) per
 *     pending commit: canonical `commit:<sha>` key, one transaction per
 *     commit, a null result pinned with zero claims (L-10 iii), a thrown
 *     call left unkeyed for a retry.
 *
 * Errors keep the `extraction_errors` shape `{sourcePath, error}`:
 * docstring entries use the file's relPath (the symbol id is in the
 * message), commit entries use `commit:<sha>`.
 */

import type { DatabaseInstance } from "../storage/db.js";
import type { ExtractionStream } from "../types.js";

import type { ExtractionClient } from "./anthropic-client.js";
import type { CommitMetadata } from "./commit-log.js";
import { extractCommitClaims } from "./commit-message-extractor.js";
import { extractDocstringFile } from "./docstring-stream.js";
import type { DocstringWorkPlan } from "./extraction-plan.js";
import type { StreamFailure } from "./pipeline-types.js";
import type { SymbolInventory } from "./resolver.js";
import type { RunCostTracker } from "./run-cost.js";
import { commitSourceKey } from "./source-keys.js";

type SourceError = { sourcePath: string; error: string };

/** Counts shared by both streams, for the all-failed check. */
interface StreamCallCounts {
  /** Model calls attempted (including ones that threw). */
  attemptedCalls: number;
  /** Calls that failed: threw, or (docstring) returned no parseable result. */
  failedCalls: number;
  errors: SourceError[];
}

export interface DocstringStageResult extends StreamCallCounts {
  /** Files whose claims were replaced and key pinned (zero-call files included). */
  filesStored: number;
  /** Calls behind the stored files (one per documented symbol). */
  symbolsExtracted: number;
  claimsWritten: number;
  unresolvedCandidates: number;
}

/** Stage 6c: extract every planned docstring file. */
export async function runDocstringStage(
  db: DatabaseInstance,
  plan: DocstringWorkPlan,
  inventory: SymbolInventory,
  client: ExtractionClient,
  cost: RunCostTracker,
): Promise<DocstringStageResult> {
  const out: DocstringStageResult = {
    attemptedCalls: 0,
    failedCalls: 0,
    errors: [],
    filesStored: 0,
    symbolsExtracted: 0,
    claimsWritten: 0,
    unresolvedCandidates: 0,
  };
  for (const file of plan.files) {
    const outcome = await extractDocstringFile(
      db,
      file.adapter,
      { relPath: file.relPath, sha: file.sha, symbols: file.symbols },
      inventory,
      client,
      file.docstrings,
    );
    cost.addCalls(outcome.apiCalls);
    cost.addUsage(outcome.usage);
    out.attemptedCalls += outcome.apiCalls;
    if (outcome.status === "stored") {
      out.filesStored++;
      out.symbolsExtracted += outcome.apiCalls;
      out.claimsWritten += outcome.claimsWritten;
      out.unresolvedCandidates += outcome.unresolvedCandidates;
    } else {
      out.failedCalls += outcome.failedCalls;
      for (const e of outcome.errors) {
        out.errors.push({ sourcePath: file.relPath, error: e.error });
      }
    }
    cost.checkBudget();
  }
  return out;
}

export interface CommitStageResult extends StreamCallCounts {
  /** Commits keyed this run: stored, or null result pinned. */
  commitsKeyed: number;
  /** Of those, null results pinned with zero claims. */
  commitsNullResult: number;
  claimsWritten: number;
  unresolvedCandidates: number;
}

/** Stage 6d: extract every pending commit, in plan order. */
export async function runCommitStage(
  db: DatabaseInstance,
  pending: readonly CommitMetadata[],
  inventory: SymbolInventory,
  client: ExtractionClient,
  cost: RunCostTracker,
): Promise<CommitStageResult> {
  const out: CommitStageResult = {
    attemptedCalls: 0,
    failedCalls: 0,
    errors: [],
    commitsKeyed: 0,
    commitsNullResult: 0,
    claimsWritten: 0,
    unresolvedCandidates: 0,
  };
  for (const commit of pending) {
    cost.addCalls(1);
    out.attemptedCalls++;
    const outcome = await extractCommitClaims(db, commit, inventory, client);
    cost.addUsage(outcome.usage);
    if (outcome.status === "failed") {
      out.failedCalls++;
      out.errors.push({ sourcePath: commitSourceKey(commit.sha), error: outcome.error });
    } else {
      out.commitsKeyed++;
      if (outcome.status === "null-result") {
        out.commitsNullResult++;
      } else {
        out.claimsWritten += outcome.claimsWritten;
        out.unresolvedCandidates += outcome.unresolvedCandidates;
      }
    }
    cost.checkBudget();
  }
  return out;
}

/**
 * The L-10 (ii) check: a stream that attempted at least one call and
 * had every attempted call fail. Returns null otherwise.
 */
export function streamFailure(
  stream: ExtractionStream,
  counts: StreamCallCounts,
): StreamFailure | null {
  if (counts.attemptedCalls === 0) return null;
  if (counts.failedCalls < counts.attemptedCalls) return null;
  return {
    stream,
    attemptedCalls: counts.attemptedCalls,
    firstError: counts.errors[0]?.error ?? "unknown error",
  };
}
