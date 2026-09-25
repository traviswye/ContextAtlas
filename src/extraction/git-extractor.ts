/**
 * Git signal extractor (ADR-11).
 *
 * Runs `git log` as a subprocess against the source repo root, parses
 * the output into commit records with per-commit file lists, and
 * returns them newest-first. Also captures the current HEAD SHA for
 * atlas staleness detection.
 *
 * Full re-extract every call — see ADR-11's "Git signal is
 * re-extracted in full each run" discussion. Subprocess is seconds,
 * not minutes, even on large histories, so SHA-incremental logic
 * would be complexity for no latency win.
 *
 * Non-git repos (no `.git/` ancestor) yield an empty commit list and
 * a null HEAD SHA. Extraction completes; the bundle silently omits
 * the git block for every symbol. This is the documented
 * "git absence is legitimate state" branch.
 */

import { spawnSync } from "node:child_process";

import { log } from "../mcp/logger.js";

export interface GitCommit {
  /** Full SHA (40 chars). */
  sha: string;
  /** ISO-8601 author date, e.g. "2026-04-12T14:02:11+00:00". */
  date: string;
  /** Commit subject (first line of the message only). */
  message: string;
  /** Author email. */
  authorEmail: string;
  /**
   * Paths touched in this commit, relative to the source root.
   * Sorted ascending for deterministic storage / export.
   */
  files: string[];
}

export interface GitExtractionResult {
  /** HEAD SHA at the time of extraction, or null when repo is not a git tree. */
  headSha: string | null;
  /** Commits newest-first. Empty when repo is not a git tree. */
  commits: GitCommit[];
}

export interface GitExtractorOptions {
  /** Absolute path to the source repo root. */
  repoRoot: string;
  /** Max commits to retrieve. Default 500 per ADR-11. */
  commitLimit?: number;
  /** Override the `git` binary. Default `"git"`. */
  gitBinary?: string;
}

export const DEFAULT_COMMIT_LIMIT = 500;

// Unit-separator (U+001F). Virtually never appears in commit subjects,
// paths, or author fields — makes the log header trivially parseable.
const FIELD_SEP = "\x1f";

/**
 * Run `git log` and return parsed commits plus HEAD SHA.
 * Never throws on missing git or non-git directory — returns the
 * "no git" shape instead.
 */
export function extractGitSignal(
  options: GitExtractorOptions,
): GitExtractionResult {
  const repoRoot = options.repoRoot;
  const commitLimit = options.commitLimit ?? DEFAULT_COMMIT_LIMIT;
  const gitBinary = options.gitBinary ?? "git";

  if (!isGitTree(repoRoot, gitBinary)) {
    log.info("git-extractor: not a git tree, skipping git signal", {
      repoRoot,
    });
    return { headSha: null, commits: [] };
  }

  const headSha = readHeadSha(repoRoot, gitBinary);
  const format = ["%H", "%aI", "%ae", "%s"].join(FIELD_SEP);
  const result = spawnSync(
    gitBinary,
    [
      "log",
      `-${commitLimit}`,
      "--no-merges",
      `--pretty=format:${format}`,
      "--name-only",
    ],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );

  if (result.status !== 0 || result.error) {
    log.warn("git-extractor: git log failed, treating as no-git", {
      repoRoot,
      status: result.status,
      stderr: result.stderr?.slice(0, 500) ?? "",
      error: result.error ? String(result.error) : undefined,
    });
    return { headSha: null, commits: [] };
  }

  const commits = parseGitLog(result.stdout);
  log.info("git-extractor: collected commits", {
    repoRoot,
    headSha,
    commits: commits.length,
  });
  return { headSha, commits };
}

/**
 * Parse the output of `git log --pretty=format:%H\x1f%aI\x1f%ae\x1f%s --name-only`.
 *
 * Output shape (commits separated by blank lines; last commit has no
 * trailing blank line):
 *
 *   <sha>\x1f<iso-date>\x1f<email>\x1f<subject>
 *   path/one.ts
 *   path/two.ts
 *
 *   <sha>\x1f...
 *   path/three.ts
 *
 * Exported for unit testing.
 */
export function parseGitLog(stdout: string): GitCommit[] {
  if (!stdout || stdout.length === 0) return [];
  // Normalize line endings — Windows git can emit CRLF depending on
  // core.autocrlf, and our parser assumes LF.
  const normalized = stdout.replace(/\r\n/g, "\n");
  // Commits are delimited by "\n\n". Trim trailing whitespace to avoid
  // an empty final block.
  const blocks = normalized.replace(/\n+$/, "").split("\n\n");
  const commits: GitCommit[] = [];
  for (const block of blocks) {
    if (block.length === 0) continue;
    const lines = block.split("\n");
    const header = lines[0];
    if (header === undefined) continue;
    const parts = header.split(FIELD_SEP);
    if (parts.length < 4) {
      // Malformed header — skip rather than throw so one weird commit
      // doesn't poison the whole run.
      log.debug("git-extractor: skipping malformed header", { header });
      continue;
    }
    const [sha, date, authorEmail, ...subjectParts] = parts;
    // Subject can legally contain our separator (extremely rare) —
    // rejoin any overflow.
    const message = subjectParts.join(FIELD_SEP);
    const files = lines
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .sort();
    commits.push({
      sha: sha!,
      date: date!,
      authorEmail: authorEmail!,
      message,
      files,
    });
  }
  return commits;
}

function isGitTree(repoRoot: string, gitBinary: string): boolean {
  const result = spawnSync(
    gitBinary,
    ["rev-parse", "--is-inside-work-tree"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return result.status === 0 && result.stdout.trim() === "true";
}

function readHeadSha(repoRoot: string, gitBinary: string): string | null {
  const result = spawnSync(gitBinary, ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const sha = result.stdout.trim();
  return sha.length === 40 ? sha : null;
}
