import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkStaleness, exitCodeFor } from "./staleness.js";
import type { AtlasFileV1 } from "./storage/types.js";

function writeAtlas(path: string, atlas: Partial<AtlasFileV1>): void {
  const full: AtlasFileV1 = {
    version: "1.1",
    generated_at: "2026-04-20T00:00:00Z",
    generator: {
      contextatlas_version: "0.0.1-test",
      extraction_model: "claude-opus-4-7",
    },
    source_shas: {},
    symbols: [],
    claims: [],
    ...atlas,
  };
  writeFileSync(path, JSON.stringify(full, null, 2) + "\n");
}

function initGitRepo(root: string): string {
  spawnSync("git", ["init", "--quiet"], { cwd: root });
  spawnSync("git", ["config", "user.email", "test@example.com"], {
    cwd: root,
  });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: root });
  spawnSync("git", ["config", "commit.gpgsign", "false"], { cwd: root });
  writeFileSync(pathJoin(root, "README.md"), "hi\n");
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["commit", "-q", "-m", "initial"], { cwd: root });
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  return result.stdout.trim();
}

describe("checkStaleness", () => {
  let tmp: string;
  let atlasPath: string;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-stale-"));
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    atlasPath = pathJoin(tmp, ".contextatlas", "atlas.json");
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("exit 2 / unknown when atlas is missing", () => {
    const report = checkStaleness({ atlasPath, repoRoot: tmp });
    expect(report.status).toBe("unknown");
    expect(exitCodeFor(report.status)).toBe(2);
    expect(report.message).toMatch(/No committed atlas/);
  });

  it("exit 2 / unknown for a v1.0 atlas (no extracted_at_sha)", () => {
    writeAtlas(atlasPath, { version: "1.0" });
    const report = checkStaleness({ atlasPath, repoRoot: tmp });
    expect(report.status).toBe("unknown");
    expect(exitCodeFor(report.status)).toBe(2);
    expect(report.message).toMatch(/pre-1\.1 atlas/);
  });

  it("exit 2 / unknown when repoRoot isn't a git tree", () => {
    writeAtlas(atlasPath, { extracted_at_sha: "a".repeat(40) });
    const report = checkStaleness({ atlasPath, repoRoot: tmp });
    expect(report.status).toBe("unknown");
    expect(exitCodeFor(report.status)).toBe(2);
    expect(report.message).toMatch(/not a git working tree/);
  });

  it("exit 0 / current when atlas SHA matches HEAD", () => {
    const head = initGitRepo(tmp);
    writeAtlas(atlasPath, { extracted_at_sha: head });
    const report = checkStaleness({ atlasPath, repoRoot: tmp });
    expect(report.status).toBe("current");
    expect(exitCodeFor(report.status)).toBe(0);
    expect(report.atlasSha).toBe(head);
    expect(report.currentSha).toBe(head);
  });

  it("exit 1 / stale when atlas SHA differs from HEAD", () => {
    initGitRepo(tmp);
    // 40-char hex SHA that obviously isn't the real HEAD.
    writeAtlas(atlasPath, { extracted_at_sha: "b".repeat(40) });
    const report = checkStaleness({ atlasPath, repoRoot: tmp });
    expect(report.status).toBe("stale");
    expect(exitCodeFor(report.status)).toBe(1);
    expect(report.message).toMatch(/stale/);
  });

  it("exit 2 / unknown when atlas JSON is malformed", () => {
    writeFileSync(atlasPath, "{ not valid json");
    const report = checkStaleness({ atlasPath, repoRoot: tmp });
    expect(report.status).toBe("unknown");
    expect(exitCodeFor(report.status)).toBe(2);
  });

  // Guardrail: existsSync() on the atlas path must be non-flaky.
  it("sanity check — the tmpdir exists", () => {
    expect(existsSync(tmp)).toBe(true);
  });
});
