/**
 * Atlas-only-mode detection per A4 (v0.5-candidates #4) + Q3.0.6 lock.
 *
 * Detects whether atlas substrate is consistent with current git HEAD;
 * caller (handler) uses result to set BuildBundleDeps.atlasOnlyAvailable.
 *
 * Per ADR-06 committed-atlas-artifact: when atlas.json is consistent
 * with HEAD, queries can be answered from atlas alone without adapter
 * calls (~500ms per query saved). Detection is per-request (cheap;
 * HEAD can change between requests; cached pattern would require
 * invalidation complexity not worth the cost per Q3.0 architectural
 * confirmation at v0.6 Step 3.0).
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

/**
 * Returns extracted_at_sha if atlas.json present + SHA matches headSha.
 * Returns null on any failure mode (atlas absent / unreadable /
 * mismatch).
 *
 * Caller handles null as "atlas-only mode unavailable; fall through to
 * adapter as usual." No logging on null result — stale-atlas state is a
 * normal operating mode (per discipline #4 honest-scope-acknowledgment;
 * doctor surfaces stale-atlas via separate diagnostic-only path).
 */
export async function detectAtlasOnlyAvailable(
  atlasPath: string,
  headSha: string,
): Promise<string | null> {
  let atlasContent: string;
  try {
    atlasContent = await readFile(atlasPath, "utf8");
  } catch {
    return null; // atlas absent or unreadable
  }

  let atlas: { extracted_at_sha?: unknown };
  try {
    atlas = JSON.parse(atlasContent) as { extracted_at_sha?: unknown };
  } catch {
    return null; // atlas not valid JSON
  }

  const extractedAtSha = atlas.extracted_at_sha;
  if (
    typeof extractedAtSha !== "string" ||
    extractedAtSha.length === 0
  ) {
    return null;
  }

  if (extractedAtSha !== headSha) {
    return null; // stale atlas; mismatch with HEAD
  }

  return extractedAtSha;
}

/**
 * Reads current git HEAD SHA via `git rev-parse HEAD`. Returns null if
 * not a git repo or git command fails. Mirrors private readGitHead
 * pattern in src/doctor/checks/sha.ts.
 */
export function readHeadSha(cwd: string): string | null {
  const r = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) return null;
  const sha = (r.stdout ?? "").trim();
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
}
