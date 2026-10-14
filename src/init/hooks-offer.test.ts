import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin, resolve as pathResolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { offerGitHooks } from "./hooks-offer.js";

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

describe("init: git hooks offer (v1.2 Phase 5)", () => {
  let repo: string;
  const hook = () => pathJoin(repo, ".git", "hooks", "post-commit");
  const entry = pathResolve("dist/index.js");

  beforeEach(() => {
    repo = mkdtempSync(pathJoin(tmpdir(), "ca-init-hooks-"));
    spawnSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(pathJoin(repo, ".contextatlas.yml"), CONFIG);
  });
  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("--yes installs without asking", async () => {
    const outcome = await offerGitHooks({
      configRoot: repo,
      yes: true,
      writeStderr: () => {},
      ask: async () => {
        throw new Error("must not ask");
      },
      entryOverride: entry,
    });
    expect(outcome).toBe("installed");
    expect(existsSync(hook())).toBe(true);
  });

  it("asks: yes installs, no (the default answer) declines", async () => {
    expect(await offerGitHooks({ configRoot: repo, writeStderr: () => {}, ask: async () => false })).toBe("declined");
    expect(existsSync(hook())).toBe(false);
    expect(
      await offerGitHooks({ configRoot: repo, writeStderr: () => {}, ask: async () => true, entryOverride: entry }),
    ).toBe("installed");
    expect(existsSync(hook())).toBe(true);
  });

  it("without a terminal, or with --json, installs nothing and says how", async () => {
    for (const opts of [{ ask: async () => null }, { json: true, ask: async () => true }]) {
      const err: string[] = [];
      const outcome = await offerGitHooks({ configRoot: repo, writeStderr: (c) => err.push(c), ...opts });
      expect(outcome).toBe("skipped");
      expect(err.join("")).toMatch(/run `contextatlas hooks install`/);
    }
    expect(existsSync(hook())).toBe(false);
  });
});
