/**
 * Atlas staleness detection (ADR-11).
 *
 * The committed atlas pins git state at extraction time via the
 * `extracted_at_sha` field. A team member running against yesterday's
 * atlas can't tell whether they're seeing current history. `--check`
 * reads the atlas, compares its recorded SHA against the current git
 * HEAD, and returns one of four states.
 *
 * Extracted to its own module so it's testable without spawning the
 * MCP binary end-to-end and so it can compose into other tooling
 * (pre-commit hooks, CI scripts) in the future.
 */

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import type { AtlasFileV1 } from "./storage/types.js";

export type StalenessStatus =
  /** Atlas SHA matches current HEAD — atlas is current. Exit 0. */
  | "current"
  /** Atlas was recorded at a different SHA than HEAD — atlas is stale. Exit 1. */
  | "stale"
  /**
   * Atlas has no `extracted_at_sha` (pre-1.1) OR the repo is not a git
   * tree. Can't compute staleness; callers typically treat as warning.
   * Exit 2.
   */
  | "unknown";

export interface StalenessReport {
  status: StalenessStatus;
  atlasSha: string | null;
  currentSha: string | null;
  message: string;
}

export interface CheckStalenessOptions {
  atlasPath: string;
  repoRoot: string;
  /** Test seam — lets tests inject a fake git binary path. */
  gitBinary?: string;
}

/**
 * Read the committed atlas at `atlasPath`, compare its
 * `extracted_at_sha` against current HEAD in `repoRoot`, and return
 * a structured report. Never throws — missing atlas / missing git /
 * malformed JSON all fold into the "unknown" bucket with an
 * explanatory message.
 */
export function checkStaleness(
  options: CheckStalenessOptions,
): StalenessReport {
  const { atlasPath, repoRoot } = options;
  const gitBinary = options.gitBinary ?? "git";

  if (!existsSync(atlasPath)) {
    return {
      status: "unknown",
      atlasSha: null,
      currentSha: null,
      message:
        `No committed atlas at ${atlasPath}. ` +
        "Run extraction first, then commit atlas.json.",
    };
  }

  let atlas: AtlasFileV1;
  try {
    atlas = JSON.parse(readFileSync(atlasPath, "utf8")) as AtlasFileV1;
  } catch (err) {
    return {
      status: "unknown",
      atlasSha: null,
      currentSha: null,
      message: `Failed to parse atlas at ${atlasPath}: ${String(err)}`,
    };
  }

  const atlasSha = atlas.extracted_at_sha ?? null;
  if (!atlasSha) {
    return {
      status: "unknown",
      atlasSha: null,
      currentSha: null,
      message:
        `Atlas at ${atlasPath} has no extracted_at_sha. ` +
        "This is a pre-1.1 atlas or was generated against a non-git tree. " +
        "Re-run extraction to write the current SHA.",
    };
  }

  const currentSha = readHeadSha(repoRoot, gitBinary);
  if (!currentSha) {
    return {
      status: "unknown",
      atlasSha,
      currentSha: null,
      message:
        `Source root ${repoRoot} is not a git working tree. ` +
        "Can't determine staleness.",
    };
  }

  if (atlasSha === currentSha) {
    return {
      status: "current",
      atlasSha,
      currentSha,
      message: `Atlas is current (at ${shorten(atlasSha)}).`,
    };
  }

  return {
    status: "stale",
    atlasSha,
    currentSha,
    message:
      `Atlas is stale. Recorded at ${shorten(atlasSha)}, ` +
      `HEAD is at ${shorten(currentSha)}. Re-run extraction to update.`,
  };
}

/** Map staleness status → POSIX exit code. Contract: see ADR-11. */
export function exitCodeFor(status: StalenessStatus): number {
  switch (status) {
    case "current":
      return 0;
    case "stale":
      return 1;
    case "unknown":
      return 2;
  }
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

function shorten(sha: string): string {
  return sha.slice(0, 7);
}
