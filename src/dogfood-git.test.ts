/**
 * Dogfood integration: the git extractor against ContextAtlas's own
 * working tree. Not a unit test — verifies the subprocess wrapper
 * actually runs `git` in a real repo. Skips when not running in this
 * repo (the test file path is the only signal we have).
 *
 * Deliberately lightweight: we just want to catch subprocess-level
 * breakage (argv, cwd, parsing) without committing a fixture repo.
 */

import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_COMMIT_LIMIT,
  extractGitSignal,
} from "./extraction/git-extractor.js";

const REPO_ROOT = pathResolve(process.cwd());
const IS_GIT = existsSync(pathResolve(REPO_ROOT, ".git"));

describe.skipIf(!IS_GIT)("git extractor — live against ContextAtlas repo", () => {
  it("captures a non-empty HEAD SHA and at least one commit", () => {
    const result = extractGitSignal({ repoRoot: REPO_ROOT, commitLimit: 5 });
    expect(result.headSha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.commits.length).toBeGreaterThan(0);
    const first = result.commits[0]!;
    expect(first.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(first.authorEmail).toMatch(/@/);
    expect(first.message.length).toBeGreaterThan(0);
  });

  it("honors the DEFAULT_COMMIT_LIMIT contract (≤ 500 by default)", () => {
    const result = extractGitSignal({ repoRoot: REPO_ROOT });
    expect(result.commits.length).toBeLessThanOrEqual(DEFAULT_COMMIT_LIMIT);
  });
});
