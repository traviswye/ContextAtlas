/**
 * Commit-message claim extractor — v0.4 Step 4 stub.
 *
 * Extends the v0.3 docstring extraction pattern (Stream B) to commit
 * messages as a third claim source alongside ADRs (v0.1) + docstrings
 * (v0.3). Architectural-intent claims found in git commit messages
 * augment the atlas's intent registry without requiring curated ADRs.
 *
 * v0.4 STUB — full implementation per STEP-PLAN-V0.4.md Step 4:
 *   - Step 4.1 — Commit-message corpus filter (architectural-intent
 *     regex pattern; configurable per-repo; OQ5 default conservative)
 *   - Step 4.2 — Git log parsing module (this file)
 *   - Step 4.3 — Claim extraction integration (existing
 *     EXTRACTION_PROMPT applied to commit-message corpus)
 *   - Step 4.4 — Atlas integration via `source: "commit:<sha>"` claim
 *     format
 *   - Step 4.5 — DESIGN.md amendment for new claim source format
 *   - Step 4.6 — Test coverage
 *
 * Per [`v0.4-SCOPE.md`](../../v0.4-SCOPE.md) Stream A commit-message
 * extraction subsection. Bimodal-aware Q3 threshold (>=30/repo on at
 * least 2 of 3 repos AND any single repo above 50) determines atlas
 * integration vs deferral per Step 5 re-extraction outcomes.
 *
 * Architectural pattern: parallel to docstring extraction, NOT
 * subordinate. Both are claim sources extracted at index time + keyed
 * to LSP-resolved symbols.
 */

import type { Claim } from "../types.js";

/**
 * Predicate filtering commits to those carrying architectural-intent
 * signal. Default-conservative (false-positives worse than
 * false-negatives — a non-architectural commit yielding a non-
 * architectural claim pollutes the atlas).
 *
 * Resolved during Step 4.1 (OQ5 lock). Default-set candidate
 * keywords: `design:`, `arch:`, `ADR-related`. Strict-set is per-repo
 * override.
 */
export type CommitFilter = (subject: string, body: string) => boolean;

/**
 * Raw commit metadata as parsed from `git log` invocation. Step 4.2
 * deliverable.
 */
export interface CommitMetadata {
  readonly sha: string;
  readonly date: string; // ISO 8601
  readonly author: string;
  readonly subject: string;
  readonly body: string;
}

/**
 * Claim extracted from a commit message. The atlas claim format
 * `source: "commit:<sha>"` distinguishes commit-derived claims from
 * `"ADR-NN"` (markdown intent) and `"docstring:<path>"` (in-code
 * intent) sources. Per Step 4.4.
 */
export interface CommitMessageClaim extends Omit<Claim, "source"> {
  readonly source: `commit:${string}`;
}

/**
 * Parse `git log` output for commits matching the architectural-intent
 * filter. Step 4.2 deliverable.
 *
 * STUB — implementation per STEP-PLAN-V0.4.md Step 4.2.
 */
export async function parseCommitLog(
  _repoRoot: string,
  _filter: CommitFilter,
): Promise<CommitMetadata[]> {
  throw new Error(
    "commit-message-extractor.parseCommitLog: not yet implemented (v0.4 Step 4.2)",
  );
}

/**
 * Extract architectural-intent claims from filtered commit messages
 * via the existing EXTRACTION_PROMPT applied to commit-message
 * corpus. Step 4.3 deliverable.
 *
 * STUB — implementation per STEP-PLAN-V0.4.md Step 4.3.
 */
export async function extractCommitMessageClaims(
  _commits: CommitMetadata[],
): Promise<CommitMessageClaim[]> {
  throw new Error(
    "commit-message-extractor.extractCommitMessageClaims: not yet implemented (v0.4 Step 4.3)",
  );
}
