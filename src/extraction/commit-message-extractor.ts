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
 * Filter discipline (per OQ5 lock; default conservative): prefix-
 * match anchoring requires architectural-intent keyword AT START of
 * subject. `design: ...` matches; `Implement design for ...` does
 * not. False-positives are worse than false-negatives — a non-
 * architectural commit yielding a non-architectural claim pollutes
 * the atlas.
 *
 * Idempotency (per Q5 lock): keyed on commit SHA via `source_shas`
 * table. Re-running extraction skips commits already in
 * `source_shas`. EXTRACTION_PROMPT changes during development will
 * NOT retroactively update old commits' claims; explicit force-re-
 * extract flag is v0.5+ scope.
 *
 * NOT in v0.4: `extraction.commit_message_max` config field for
 * huge-repo budget gating; force-re-extract flag. Both v0.5+
 * candidates.
 *
 * Per [`v0.4-SCOPE.md`](../../v0.4-SCOPE.md) Stream A commit-message
 * extraction subsection. Bimodal-aware Q3 threshold (≥30/repo on at
 * least 2 of 3 repos AND any single repo above 50) determines atlas
 * integration vs deferral per Step 5 re-extraction outcomes.
 */

import { spawnSync } from "node:child_process";

import { log } from "../mcp/logger.js";
import {
  getSourceSha,
  insertClaim,
  setSourceSha,
  type NewClaim,
} from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";
import type { ContextAtlasConfig } from "../types.js";

import { type ExtractionClient } from "./anthropic-client.js";
import { addUsage, ZERO_USAGE, type UsageInfo } from "./pricing.js";
import { resolveCandidates, type SymbolInventory } from "./resolver.js";

/**
 * Predicate filtering commits to those carrying architectural-intent
 * signal. `subject` is the first line; `body` is everything after
 * (which may be empty).
 */
export type CommitFilter = (subject: string, body: string) => boolean;

/**
 * Raw commit metadata as parsed from `git log` invocation.
 */
export interface CommitMetadata {
  readonly sha: string;
  readonly date: string; // ISO 8601 (author date)
  readonly author: string;
  readonly subject: string;
  readonly body: string;
}

// ---------------------------------------------------------------------------
// Default architectural-intent regex patterns (Step 4.1).
// ---------------------------------------------------------------------------

/**
 * Subject-prefix-anchored patterns. Match if any fires against the
 * commit subject's leading text. Optional `(scope)` accommodates
 * conventional-commits style: `arch(api): extract user service`.
 *
 * Scope-doc OQ5 default-conservative discipline: short list,
 * prefix-anchored, no greedy keywords. Keywords like `feat` and
 * `fix` deliberately excluded — too noisy; conventional-commits
 * `feat:` rarely carries architectural intent.
 */
export const DEFAULT_SUBJECT_PREFIX_PATTERNS: readonly RegExp[] = [
  /^design[:(]/i,
  /^arch(?:itecture)?[:(]/i,
  /^adr[\s-]?\d+/i,
  /^breaking[:(]/i,
  /^deprecate[sd]?[:(\s]/i,
  /^refactor[:(]/i,
];

/**
 * Body-anywhere patterns. The conventional-commits `BREAKING
 * CHANGE:` footer typically appears at body END (after a blank
 * line), per spec — first-200-char prefix scan would miss it. This
 * pattern scans the full body.
 *
 * Two-tier matching (per Q3 lock): subject prefix-match for the 6
 * default patterns + whole-body scan for `BREAKING CHANGE:`
 * footer.
 */
export const DEFAULT_BODY_ANYWHERE_PATTERNS: readonly RegExp[] = [
  /\bBREAKING CHANGE:/,
];

/**
 * Build a CommitFilter from default patterns + user-augmented
 * patterns (per scope-doc Q5: augment-only semantics; user
 * patterns ADD to defaults rather than replacing).
 *
 * User patterns are tested against the subject + the first 200
 * characters of the body — same surface as ADR-style intent
 * detection. Future replace-mode flag is a v0.5+ candidate.
 */
export function makeDefaultCommitFilter(
  userPatterns: readonly string[] = [],
): CommitFilter {
  const userRegexes = userPatterns.map((p) => new RegExp(p, "i"));
  return (subject, body) => {
    for (const r of DEFAULT_SUBJECT_PREFIX_PATTERNS) {
      if (r.test(subject)) return true;
    }
    for (const r of DEFAULT_BODY_ANYWHERE_PATTERNS) {
      if (r.test(body)) return true;
    }
    if (userRegexes.length > 0) {
      const surface = subject + "\n" + body.slice(0, 200);
      for (const r of userRegexes) {
        if (r.test(surface)) return true;
      }
    }
    return false;
  };
}

// ---------------------------------------------------------------------------
// Git log parsing (Step 4.2).
// ---------------------------------------------------------------------------

// Format: SHA \t author-date-iso \t author-name \t subject \0 body \x1e
// - %H  = commit SHA
// - %aI = author date in strict ISO 8601 format
// - %an = author name
// - %s  = subject (first line)
// - %b  = body
// NUL between subject/body, RS between commits — chosen because
// commit messages can contain newlines and tabs in their body;
// standard separators would be unsafe.
const GIT_LOG_FORMAT = "%H%x09%aI%x09%an%x09%s%x00%b%x1e";
const RECORD_SEPARATOR = "\x1e";

/**
 * Invoke `git log` and parse the output. Filter is applied to each
 * commit; non-matching commits are dropped before return.
 *
 * Edge cases:
 *   - Empty repo (no commits): returns `[]`.
 *   - Non-git directory: throws an actionable error.
 *   - Shallow clone: returns whatever git log surfaces (the visible
 *     subset). Documented limitation — atlas will see only the
 *     shallow window's commits.
 *
 * `--no-merges` skips merge commits, which usually inherit body
 * text from a PR rather than carrying architectural-intent prose
 * directly.
 */
export function parseCommitLog(
  repoRoot: string,
  filter: CommitFilter,
): CommitMetadata[] {
  const result = spawnSync(
    "git",
    [
      "log",
      "--no-merges",
      `--pretty=format:${GIT_LOG_FORMAT}`,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      // Big-repo histories can be lengthy; default 1MB buffer is
      // insufficient for any meaningful project. 64MB covers
      // contextatlas-sized repos comfortably and is still bounded.
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw new Error(
      `commit-message-extractor: git log invocation failed at '${repoRoot}': ` +
        `${result.error.message}. Ensure git is installed and on PATH.`,
    );
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    // git log returns non-zero when the directory isn't a git tree
    // OR when there are no commits at all in a fresh repo. We
    // distinguish: "not a git repository" → error; everything else
    // gets stderr surfaced.
    if (/not a git repository/i.test(stderr)) {
      throw new Error(
        `commit-message-extractor: '${repoRoot}' is not a git repository. ` +
          `Commit-message extraction requires a git tree.`,
      );
    }
    // Empty-repo fast path: no output and benign exit code patterns
    // (git versions vary). If output is empty and stderr doesn't
    // signal a real error, treat as no-commits.
    if ((result.stdout ?? "").trim().length === 0) return [];
    throw new Error(
      `commit-message-extractor: git log exited ${result.status} at '${repoRoot}': ${stderr}`,
    );
  }

  const stdout = result.stdout ?? "";
  if (stdout.length === 0) return [];

  const out: CommitMetadata[] = [];
  // Split on RS; trailing RS yields a final empty string we drop.
  const records = stdout.split(RECORD_SEPARATOR);
  for (const raw of records) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    // Header up to NUL is `SHA \t date \t author \t subject`.
    const nulIdx = trimmed.indexOf("\x00");
    if (nulIdx < 0) continue; // malformed; skip defensively
    const header = trimmed.slice(0, nulIdx);
    const body = trimmed.slice(nulIdx + 1);
    const parts = header.split("\t");
    if (parts.length < 4) continue; // malformed; skip
    const sha = parts[0]!;
    const date = parts[1]!;
    const author = parts[2]!;
    const subject = parts.slice(3).join("\t"); // subject may contain tabs
    if (!filter(subject, body)) continue;
    out.push({ sha, date, author, subject, body });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Claim extraction body builder (Step 4.3 helper).
// ---------------------------------------------------------------------------

/**
 * Build the prose body fed to `EXTRACTION_PROMPT` for a commit.
 * Concatenates subject + body with a blank line separator. The
 * extraction-prompt path already prepends its own header; this
 * helper just produces the raw commit text.
 *
 * Empty body is fine (single-line commits are common); the prompt
 * then sees just the subject.
 */
export function buildCommitExtractionBody(commit: CommitMetadata): string {
  if (commit.body.trim().length === 0) return commit.subject;
  return `${commit.subject}\n\n${commit.body}`;
}

// ---------------------------------------------------------------------------
// Orchestration (Step 4.3 + Step 4.4) — extract claims for all filtered
// commits, resolve candidates against the symbol inventory, persist via the
// existing claims pipeline.
//
// Mirrors `extractDocstringsForFile` (in `pipeline.ts`) as a standalone
// exported function rather than being invoked inside `runExtractionPipeline`.
// Benchmark scripts (Step 5 re-extraction) wire this alongside
// `runExtractionPipeline` and `extractDocstringsForFile`. Production-tool
// integration into `contextatlas index` is a v0.5+ scope item (developer
// onboarding pipeline).
// ---------------------------------------------------------------------------

/**
 * Per-run summary stats from `extractCommitMessagesForRepo`.
 */
export interface CommitExtractionResult {
  /** Total commits returned by `git log --no-merges`. */
  readonly commitsTotal: number;
  /** Commits that passed the architectural-intent filter. */
  readonly commitsFiltered: number;
  /** Commits actually fed to the extraction client (skips idempotent). */
  readonly commitsExtracted: number;
  /** Commits skipped because their SHA was already in source_shas. */
  readonly commitsSkippedIdempotent: number;
  /** Total claims written (sum across all extracted commits). */
  readonly claimsWritten: number;
  /** Claims with at least one resolved symbol candidate. */
  readonly claimsWithSymbols: number;
  /** Cumulative API usage across all extraction calls. */
  readonly totalUsage: UsageInfo;
  /** Per-commit errors (extraction client throws or malformed responses). */
  readonly errors: ReadonlyArray<{ readonly sha: string; readonly error: string }>;
}

/**
 * Extract architectural-intent claims from filtered git commit
 * messages and persist as `source: "commit:<sha>"` claims.
 *
 * Idempotency: each commit's SHA is keyed in `source_shas` after
 * successful extraction. Re-running this function skips commits
 * already recorded — re-extraction with a changed `EXTRACTION_PROMPT`
 * will NOT update old commits' claims; explicit force-re-extract
 * is v0.5+ scope (Q5 lock).
 *
 * Symbol attribution (per Q1 lock) follows the ADR-style pattern:
 * `symbol_candidates` come from the LLM's parse of the commit text;
 * `resolveCandidates` against the inventory yields concrete
 * `symbolIds`. Claims with zero resolved candidates are still
 * written with `symbolIds: []` — same fallback as ADR claims with
 * no resolved candidates.
 */
export async function extractCommitMessagesForRepo(
  db: DatabaseInstance,
  repoRoot: string,
  config: Pick<ContextAtlasConfig, "extraction">,
  inventory: SymbolInventory,
  anthropicClient: ExtractionClient,
): Promise<CommitExtractionResult> {
  const filter = makeDefaultCommitFilter(
    config.extraction?.commitMessageFilter ?? [],
  );
  const allCommits = parseCommitLog(repoRoot, () => true);
  const filtered = allCommits.filter((c) => filter(c.subject, c.body));
  log.info("commit-message-extractor: filtered commits", {
    total: allCommits.length,
    matched: filtered.length,
  });

  const result: {
    commitsTotal: number;
    commitsFiltered: number;
    commitsExtracted: number;
    commitsSkippedIdempotent: number;
    claimsWritten: number;
    claimsWithSymbols: number;
    totalUsage: UsageInfo;
    errors: Array<{ sha: string; error: string }>;
  } = {
    commitsTotal: allCommits.length,
    commitsFiltered: filtered.length,
    commitsExtracted: 0,
    commitsSkippedIdempotent: 0,
    claimsWritten: 0,
    claimsWithSymbols: 0,
    totalUsage: ZERO_USAGE,
    errors: [],
  };

  for (const commit of filtered) {
    const sourcePath = `commit:${commit.sha}`;
    // Idempotency: skip if this commit's SHA is already recorded.
    // Commits are immutable, so a previously-extracted SHA's claims
    // are still current.
    const priorSha = getSourceSha(db, sourcePath);
    if (priorSha === commit.sha) {
      result.commitsSkippedIdempotent++;
      continue;
    }

    let extracted;
    try {
      extracted = await anthropicClient.extract(
        buildCommitExtractionBody(commit),
      );
    } catch (err) {
      result.errors.push({ sha: commit.sha, error: String(err) });
      continue;
    }
    result.totalUsage = addUsage(result.totalUsage, extracted.usage);
    result.commitsExtracted++;
    if (!extracted.result) continue;

    for (const ec of extracted.result.claims) {
      const resolved = resolveCandidates(inventory, ec.symbol_candidates);
      const claim: NewClaim = {
        source: sourcePath,
        sourcePath,
        sourceSha: commit.sha,
        severity: ec.severity,
        claim: ec.claim,
        ...(ec.rationale ? { rationale: ec.rationale } : {}),
        ...(ec.excerpt ? { excerpt: ec.excerpt } : {}),
        symbolIds: resolved.symbolIds,
      };
      insertClaim(db, claim);
      result.claimsWritten++;
      if (resolved.symbolIds.length > 0) result.claimsWithSymbols++;
    }
    setSourceSha(db, sourcePath, commit.sha);
  }

  return result;
}
