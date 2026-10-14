import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin, resolve as pathResolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runHooksSubcommand } from "./cli.js";
import {
  buildHookBlock,
  hooksStatus,
  insertHookBlock,
  installHooks,
  stripHookBlock,
  uninstallHooks,
  type HookCommand,
} from "./hooks.js";

const CMD: HookCommand = {
  node: "/usr/bin/node",
  entry: "/opt/contextatlas/dist/index.js",
  configRoot: "/repo",
};

describe("hook block editing (v1.2 Phase 5)", () => {
  it("creates a sh script with the block, and replaces the block in place on reinstall", () => {
    const created = insertHookBlock("", buildHookBlock("post-commit", CMD));
    expect(created.startsWith("#!/bin/sh\n# >>> contextatlas >>>")).toBe(true);
    expect(created).toContain("index --structural --no-export --config-root \"/repo\"");
    expect(created).not.toContain("\r");
    const again = insertHookBlock(created, buildHookBlock("post-commit", { ...CMD, entry: "/new/index.js" }));
    expect(again.match(/>>> contextatlas >>>/g)).toHaveLength(1);
    expect(again).toContain("/new/index.js");
  });

  it("goes right after an existing shebang, before content that may exit, and strips back to the original", () => {
    const existing = "#!/usr/bin/env bash\nnpx lint-staged\nexit 0\n";
    const withBlock = insertHookBlock(existing, buildHookBlock("post-merge", CMD));
    expect(withBlock.split("\n")[0]).toBe("#!/usr/bin/env bash");
    expect(withBlock.indexOf(">>> contextatlas >>>")).toBeLessThan(withBlock.indexOf("exit 0"));
    expect(stripHookBlock(withBlock)).toBe(existing);
  });

  it("pre-push starts refresh-claims --if-due, logging to its own file (v1.2 Phase 6)", () => {
    const block = buildHookBlock("pre-push", CMD);
    expect(block).toContain("refresh-claims --if-due --trigger pre-push --config-root \"/repo\"");
    expect(block).toContain("prepush-last.log");
    expect(block).not.toContain("index --structural");
  });

  it("runs post-checkout only for branch checkouts, and refuses unquotable paths", () => {
    expect(buildHookBlock("post-checkout", CMD)).toContain('[ "$3" = "1" ]');
    expect(buildHookBlock("post-commit", CMD)).not.toContain('"$3"');
    expect(() => buildHookBlock("post-commit", { ...CMD, configRoot: "/re$po" })).toThrow(/cannot quote/);
  });
});

describe("installHooks / uninstallHooks / hooksStatus", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(pathJoin(tmpdir(), "ca-hooks-dir-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("installs idempotently, keeps foreign content on uninstall, deletes files it created", () => {
    writeFileSync(pathJoin(dir, "post-merge"), "#!/bin/sh\necho mine\n");
    expect(installHooks(dir, CMD).map((r) => [r.hook, r.action])).toEqual([
      ["post-commit", "created"],
      ["post-merge", "updated"],
      ["post-checkout", "created"],
      ["pre-push", "created"],
    ]);
    expect(installHooks(dir, CMD).every((r) => r.action === "unchanged")).toBe(true);
    const status = hooksStatus(dir);
    expect(status.every((s) => s.installed && s.entry === CMD.entry && !s.entryExists)).toBe(true);

    expect(uninstallHooks(dir).map((r) => [r.hook, r.action])).toEqual([
      ["post-commit", "deleted"],
      ["post-merge", "removed"],
      ["post-checkout", "deleted"],
      ["pre-push", "deleted"],
    ]);
    expect(existsSync(pathJoin(dir, "post-commit"))).toBe(false);
    expect(readFileSync(pathJoin(dir, "post-merge"), "utf8")).toBe("#!/bin/sh\necho mine\n");
    expect(uninstallHooks(dir).every((r) => r.action === "absent")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// End to end: a real repository, a real commit, the built binary
// ---------------------------------------------------------------------------

function git(cwd: string, args: string[]): string {
  const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "T",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "T",
      GIT_COMMITTER_EMAIL: "t@example.com",
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

const CONFIG = [
  "version: 1",
  "languages:",
  "  - typescript",
  "adrs:",
  "  path: docs/adr/",
  "docs:",
  "  include: []",
  "atlas:",
  "  committed: true",
  "  path: .contextatlas/atlas.json",
  "  local_cache: .contextatlas/index.db",
  "",
].join("\n");

describe("contextatlas hooks (end to end)", () => {
  let repo: string;
  const entry = pathResolve("dist/index.js");
  const local = () => pathJoin(repo, ".contextatlas", "local");

  beforeEach(() => {
    repo = mkdtempSync(pathJoin(tmpdir(), "ca-hooks-e2e-"));
    git(repo, ["init", "-q"]);
    mkdirSync(pathJoin(repo, "docs", "adr"), { recursive: true });
    writeFileSync(pathJoin(repo, ".contextatlas.yml"), CONFIG);
    writeFileSync(pathJoin(repo, ".gitignore"), ".contextatlas/index.db*\n");
    writeFileSync(pathJoin(repo, "docs", "adr", "ADR-01-a.md"), "# ADR\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "init"]);
  });
  afterEach(async () => {
    await rm(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  it("install → a commit starts a background cache-only structural run → status reports it → uninstall", async () => {
    const out: string[] = [];
    const installed = await runHooksSubcommand({
      configRoot: repo,
      configFile: null,
      action: "install",
      entryOverride: entry,
      writeStdout: (c) => out.push(c),
    });
    expect(installed.exitCode).toBe(0);
    expect(out.join("")).toMatch(/post-commit: created/);

    writeFileSync(pathJoin(repo, "docs", "adr", "ADR-02-b.md"), "# Second\n");
    git(repo, ["add", "-A"]);
    const started = Date.now();
    git(repo, ["commit", "-q", "-m", "add ADR-02"]);
    // git returned without waiting for the run.
    expect(Date.now() - started).toBeLessThan(10_000);

    await vi.waitFor(
      () => {
        const runs = readFileSync(pathJoin(local(), "runs.jsonl"), "utf8").trim().split("\n");
        expect(JSON.parse(runs.at(-1)!)).toMatchObject({ mode: "structural", exit_code: 0, api_calls: 0 });
      },
      { timeout: 60_000, interval: 250 },
    );
    const queue = JSON.parse(readFileSync(pathJoin(local(), "pending.json"), "utf8"));
    expect(queue.entries.map((e: { key: string }) => e.key)).toEqual([
      "docs/adr/ADR-01-a.md",
      "docs/adr/ADR-02-b.md",
    ]);
    // Cache only: no atlas.json written, nothing for git to commit.
    expect(existsSync(pathJoin(repo, ".contextatlas", "atlas.json"))).toBe(false);
    expect(git(repo, ["status", "--porcelain"])).toBe("");

    const status: string[] = [];
    await runHooksSubcommand({ configRoot: repo, configFile: null, action: "status", writeStdout: (c) => status.push(c) });
    expect(status.join("")).toMatch(/post-commit: installed/);
    expect(status.join("")).toMatch(/pending sources: 2 \(adr 2;/);
    expect(status.join("")).toMatch(/last index run: .* structural, exit 0, 0 model call\(s\), atlas\.json unchanged/);

    await runHooksSubcommand({ configRoot: repo, configFile: null, action: "uninstall", writeStdout: () => {} });
    const after: string[] = [];
    await runHooksSubcommand({ configRoot: repo, configFile: null, action: "status", writeStdout: (c) => after.push(c) });
    expect(after.join("")).toMatch(/post-commit: not installed/);
  }, 120_000);

  it("honours core.hooksPath and notes that a hooks directory outside .git may be tracked", async () => {
    git(repo, ["config", "core.hooksPath", ".githooks"]);
    const out: string[] = [];
    await runHooksSubcommand({
      configRoot: repo,
      configFile: null,
      action: "install",
      entryOverride: entry,
      writeStdout: (c) => out.push(c),
    });
    expect(existsSync(pathJoin(repo, ".githooks", "post-commit"))).toBe(true);
    expect(out.join("")).toMatch(/outside the \.git directory/);
  });

  it("refuses to install without a config, and outside a git repository", async () => {
    const err: string[] = [];
    const noConfigRepo = mkdtempSync(pathJoin(tmpdir(), "ca-hooks-nocfg-"));
    try {
      git(noConfigRepo, ["init", "-q"]);
      const r = await runHooksSubcommand({ configRoot: noConfigRepo, configFile: null, action: "install", writeStderr: (c) => err.push(c) });
      expect(r.exitCode).toBe(2);
      expect(err.join("")).toMatch(/Run `contextatlas init` first/);
    } finally {
      await rm(noConfigRepo, { recursive: true, force: true });
    }
  });
});
