/**
 * Tests for the Claude Code skill freshness doctor check (v1.2 Phase 2,
 * lead decision L-12 iv). Parallel to `prompts.test.ts`.
 *
 * `contextatlas init` never overwrites an installed SKILL.md, so after a
 * package upgrade the user repo keeps running the old skill. The check
 * compares each installed copy with the package's canonical copy.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CANONICAL_SKILL_NAMES } from "../../init/skill-copy.js";
import type { CheckContext } from "../types.js";

import { skillFreshnessChecks } from "./skills.js";

function makeCtx(repoRoot: string): CheckContext {
  return { repoRoot, config: null, configPath: null, configError: null };
}

function skillContent(name: string): string {
  return `---\nname: ${name}\n---\n\nFIXTURE ${name} SKILL.md\nsecond line\n`;
}

function writeSkill(root: string, name: string, content: string): void {
  const dir = pathResolve(root, ".claude", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(pathResolve(dir, "SKILL.md"), content, "utf8");
}

describe("skillFreshnessChecks (v1.2 Phase 2)", () => {
  let tmpRoot: string;
  let packageRoot: string;
  let userRepoRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "doctor-skills-"));
    packageRoot = join(tmpRoot, "package");
    userRepoRoot = join(tmpRoot, "user-repo");
    mkdirSync(userRepoRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writePackage(): void {
    for (const name of CANONICAL_SKILL_NAMES) {
      writeSkill(packageRoot, name, skillContent(name));
    }
  }

  function installAll(): void {
    for (const name of CANONICAL_SKILL_NAMES) {
      writeSkill(userRepoRoot, name, skillContent(name));
    }
  }

  it("emits exactly one extraction.skills_fresh check", () => {
    writePackage();
    installAll();
    const checks = skillFreshnessChecks(makeCtx(userRepoRoot), packageRoot);
    expect(checks).toHaveLength(1);
    expect(checks[0]?.id).toBe("extraction.skills_fresh");
    expect(checks[0]?.category).toBe("extraction");
  });

  it("PASS when every installed skill matches the package", () => {
    writePackage();
    installAll();
    const [check] = skillFreshnessChecks(makeCtx(userRepoRoot), packageRoot);
    expect(check?.status).toBe("pass");
    for (const name of CANONICAL_SKILL_NAMES) {
      expect(check?.message).toContain(name);
    }
  });

  it("PASS when an installed copy differs only in line endings (CRLF checkout)", () => {
    writePackage();
    installAll();
    writeSkill(
      userRepoRoot,
      "index-atlas",
      skillContent("index-atlas").replace(/\n/g, "\r\n"),
    );
    const [check] = skillFreshnessChecks(makeCtx(userRepoRoot), packageRoot);
    expect(check?.status).toBe("pass");
  });

  it("WARN (stale) names each drifted skill and says how to refresh it", () => {
    writePackage();
    installAll();
    writeSkill(userRepoRoot, "index-atlas", "OLD index-atlas SKILL.md\n");
    const [check] = skillFreshnessChecks(makeCtx(userRepoRoot), packageRoot);
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("index-atlas");
    expect(check?.message).not.toContain("prime-atlas");
    expect(check?.message).not.toContain("generate-adrs");
    // Actionable: where the current copy lives, and the init route.
    expect(check?.detail).toContain(
      pathResolve(packageRoot, ".claude", "skills"),
    );
    expect(check?.detail).toContain(".claude/skills/<name>/");
    expect(check?.detail).toContain("contextatlas init");
    expect(check?.detail).toContain("never overwrites");
  });

  it("WARN (missing) when no skill is installed", () => {
    writePackage();
    const [check] = skillFreshnessChecks(makeCtx(userRepoRoot), packageRoot);
    expect(check?.status).toBe("warn");
    for (const name of CANONICAL_SKILL_NAMES) {
      expect(check?.message).toContain(name);
    }
    expect(check?.message).toMatch(/not installed/);
    expect(check?.detail).toContain("contextatlas init");
  });

  it("WARN lists missing and drifted skills together", () => {
    writePackage();
    writeSkill(userRepoRoot, "generate-adrs", skillContent("generate-adrs"));
    writeSkill(userRepoRoot, "index-atlas", "OLD\n");
    const [check] = skillFreshnessChecks(makeCtx(userRepoRoot), packageRoot);
    expect(check?.status).toBe("warn");
    expect(check?.message).toMatch(/drifted[^;]*index-atlas/);
    expect(check?.message).toMatch(/not installed[^;]*prime-atlas/);
    expect(check?.message).not.toContain("generate-adrs");
  });

  it("does not throw on an unreadable installed copy; reports it as drifted", () => {
    writePackage();
    installAll();
    const dir = pathResolve(userRepoRoot, ".claude", "skills", "prime-atlas");
    rmSync(dir, { recursive: true, force: true });
    // SKILL.md is a directory: readFileSync throws EISDIR.
    mkdirSync(pathResolve(dir, "SKILL.md"), { recursive: true });
    const [check] = skillFreshnessChecks(makeCtx(userRepoRoot), packageRoot);
    expect(check?.status).toBe("warn");
    expect(check?.message).toMatch(/drifted[^;]*prime-atlas/);
  });

  it("WARN (package-source-missing) when the package ships no skills", () => {
    installAll();
    const [check] = skillFreshnessChecks(makeCtx(userRepoRoot), packageRoot);
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("cannot verify");
    expect(check?.detail).toMatch(/reinstall/i);
  });

  it("resolves the running package by default (this repo's skills are the package copy)", () => {
    const repoRoot = pathResolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
    );
    const [check] = skillFreshnessChecks(makeCtx(repoRoot));
    expect(check?.id).toBe("extraction.skills_fresh");
    expect(check?.status).toBe("pass");
  });
});
