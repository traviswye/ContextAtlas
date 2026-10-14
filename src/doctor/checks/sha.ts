/**
 * SHA / Schema doctor checks.
 *
 * Compares atlas's extracted_at_sha vs `git rev-parse HEAD` (WARN on
 * drift). Atlas schema version vs current ATLAS_VERSION constant.
 *
 * Before v1.2 Phase 8 the drift check read
 * `generator.contextatlas_commit_sha`, the commit of the contextatlas
 * build that wrote the atlas, not the repository commit it describes. The
 * two match only when contextatlas indexes itself; on any other
 * repository the check always reported drift.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { ATLAS_VERSION } from "../../storage/types.js";
import type { CheckContext, DoctorCheck } from "../types.js";

export function shaChecks(ctx: CheckContext): DoctorCheck[] {
  const out: DoctorCheck[] = [];
  const config = ctx.config;
  if (config === null) return out; // Limited mode.

  const atlasPath = pathResolve(ctx.repoRoot, config.atlas.path);
  if (!existsSync(atlasPath)) return out; // Atlas check already handled missing.

  let atlas: Record<string, unknown>;
  try {
    atlas = JSON.parse(readFileSync(atlasPath, "utf8")) as Record<string, unknown>;
  } catch {
    return out; // Atlas check already handled malformed.
  }

  const atlasSha =
    typeof atlas.extracted_at_sha === "string" && atlas.extracted_at_sha.length > 0
      ? (atlas.extracted_at_sha as string)
      : null;

  // 1. sha.atlas_vs_head — WARN on drift.
  if (atlasSha === null) {
    out.push({
      id: "sha.atlas_vs_head",
      category: "sha",
      status: "warn",
      message: "atlas has no extracted_at_sha",
      detail:
        "The atlas was written outside a git tree or by a pre-1.1 extractor. Re-run extraction to record the commit it describes.",
    });
  } else {
    const headSha = readGitHead(ctx.repoRoot);
    if (headSha === null) {
      out.push({
        id: "sha.atlas_vs_head",
        category: "sha",
        status: "warn",
        message: "could not resolve git HEAD",
        detail:
          "Repo may not be a git tree, or git is missing from PATH. Atlas SHA: " +
          atlasSha.slice(0, 12),
      });
    } else if (headSha === atlasSha) {
      out.push({
        id: "sha.atlas_vs_head",
        category: "sha",
        status: "pass",
        message: `atlas at ${atlasSha.slice(0, 12)} (matches HEAD)`,
      });
    } else {
      // Try to compute commit-count delta. Fall back gracefully.
      const delta = countCommitsBetween(ctx.repoRoot, atlasSha, headSha);
      const driftDetail =
        delta !== null
          ? `${delta} commit${delta === 1 ? "" : "s"} ahead of atlas`
          : "atlas SHA may be on a different branch or rebased away";
      out.push({
        id: "sha.atlas_vs_head",
        category: "sha",
        status: "warn",
        message: `atlas at ${atlasSha.slice(0, 12)}; HEAD at ${headSha.slice(0, 12)}`,
        detail: `${driftDetail}. Re-run extraction to refresh atlas.`,
      });
    }
  }

  // 2. schema.version_match — atlas's top-level `version` field.
  const atlasSchemaVersion =
    typeof atlas.version === "string" ? (atlas.version as string) : null;
  if (atlasSchemaVersion === null) {
    // atlas.schema_version_compatible already covered the missing case.
  } else if (atlasSchemaVersion === ATLAS_VERSION) {
    out.push({
      id: "schema.version_match",
      category: "sha",
      status: "pass",
      message: `${atlasSchemaVersion} (current)`,
    });
  } else {
    out.push({
      id: "schema.version_match",
      category: "sha",
      status: "warn",
      message: `atlas at ${atlasSchemaVersion}; tool at ${ATLAS_VERSION}`,
      detail:
        "Schema version differs but is supported. Atlas reads cleanly; re-extract to migrate to current schema.",
    });
  }

  return out;
}

function readGitHead(cwd: string): string | null {
  const r = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) return null;
  const sha = (r.stdout ?? "").trim();
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
}

function countCommitsBetween(
  cwd: string,
  fromSha: string,
  toSha: string,
): number | null {
  // Use rev-list which counts commits reachable from `to` but not
  // from `from`. Fails gracefully (returns null) when `from` isn't
  // in the current branch's history (e.g., rebased away).
  const r = spawnSync(
    "git",
    ["rev-list", "--count", `${fromSha}..${toSha}`],
    { cwd, encoding: "utf8", windowsHide: true },
  );
  if (r.status !== 0) return null;
  const n = parseInt((r.stdout ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
