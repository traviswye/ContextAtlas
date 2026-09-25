/**
 * Commit-message collection — the commit stream's Stage 1 (v0.4 Step 4;
 * split out of `commit-message-extractor.ts` at v1.2 Phase 2).
 *
 * Walks `git log --no-merges`, applies the architectural-intent filter
 * and builds the body fed to `EXTRACTION_PROMPT`. No model calls and no
 * database access: `list-extraction-sources` (the Skill manifest) and
 * the extractor share it. `commit-message-extractor.ts` re-exports
 * everything here, so existing imports from that module keep working.
 *
 * Filter discipline (per OQ5 lock; default conservative): prefix-
 * match anchoring requires architectural-intent keyword AT START of
 * subject. `design: ...` matches; `Implement design for ...` does
 * not. False-positives are worse than false-negatives — a non-
 * architectural commit yielding a non-architectural claim pollutes
 * the atlas.
 */

import { spawnSync } from "node:child_process";

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

export interface ParseCommitLogOptions {
  /**
   * Override the `git` binary (default `"git"` on PATH). Same seam as
   * `extractGitSignal`'s `gitBinary`; the CLI pipeline passes one value
   * to both.
   */
  gitBinary?: string;
}

/**
 * Invoke `git log` and parse the output. Filter is applied to each
 * commit; non-matching commits are dropped before return.
 *
 * Edge cases:
 *   - Empty repo (no commits): returns `[]`.
 *   - Non-git directory: throws an actionable error. Callers that
 *     must not fail (`list-extraction-sources`, the CLI pipeline)
 *     catch it or gate on the git signal first.
 *   - Missing or broken git binary: throws an actionable error.
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
  options: ParseCommitLogOptions = {},
): CommitMetadata[] {
  const gitBinary = options.gitBinary ?? "git";
  const result = spawnSync(
    gitBinary,
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
      `commit-message-extractor: git log invocation failed at '${repoRoot}' ` +
        `(git binary '${gitBinary}'): ${result.error.message}. Ensure git is ` +
        `installed and on PATH, or point the git binary override at a ` +
        `working git executable.`,
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
