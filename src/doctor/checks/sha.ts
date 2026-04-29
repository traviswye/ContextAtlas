/**
 * SHA / Schema doctor checks.
 *
 * Compares atlas's contextatlas_commit_sha vs `git rev-parse HEAD`
 * (WARN on drift). Atlas schema version vs current ATLAS_VERSION
 * constant.
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

  const generator = (atlas.generator ?? {}) as Record<string, unknown>;
  const atlasSha =
    typeof generator.contextatlas_commit_sha === "string"
      ? (generator.contextatlas_commit_sha as string)
      : null;

  // 1. sha.atlas_vs_head — WARN on drift.
  if (atlasSha === null) {
    // Atlas-provenance check already noted missing field; skip
    // here to avoid double-reporting.
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
