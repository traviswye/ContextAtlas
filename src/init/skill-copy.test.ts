/**
 * Tests for skill-copy.ts (v1.1.2 cohort-UX hotfix).
 *
 * Uses tmp-dir fixtures to stand in for both:
 *   - the contextatlas package root (source; parent of .claude/skills/)
 *   - the user's repo root (destination)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";

import {
  CANONICAL_SKILL_NAMES,
  copySkillArtifacts,
} from "./skill-copy.js";

function makeSkillContent(name: string): string {
  return `---\nname: ${name}\n---\n\nFIXTURE ${name} SKILL.md\n`;
}

describe("copySkillArtifacts (v1.1.2 cohort-UX hotfix)", () => {
  let tmpRoot: string;
  let fakePackageRoot: string;
  let userRepoRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "skill-copy-"));
    fakePackageRoot = join(tmpRoot, "package");
    userRepoRoot = join(tmpRoot, "user-repo");
    mkdirSync(userRepoRoot, { recursive: true });

    for (const name of CANONICAL_SKILL_NAMES) {
      const skillDir = pathResolve(
        fakePackageRoot,
        ".claude",
        "skills",
        name,
      );
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        pathResolve(skillDir, "SKILL.md"),
        makeSkillContent(name),
        "utf8",
      );
    }
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("copies all three canonical skills into .claude/skills/", () => {
    const result = copySkillArtifacts({
      configRoot: userRepoRoot,
      packageRootOverride: fakePackageRoot,
    });

    expect(result.copied.length).toBe(CANONICAL_SKILL_NAMES.length);
    expect(result.preserved.length).toBe(0);

    for (const name of CANONICAL_SKILL_NAMES) {
      const destSkill = pathResolve(
        userRepoRoot,
        ".claude",
        "skills",
        name,
        "SKILL.md",
      );
      expect(existsSync(destSkill)).toBe(true);
      expect(readFileSync(destSkill, "utf8")).toBe(makeSkillContent(name));
    }
  });

  it("creates .claude/skills/ directory if it doesn't exist", () => {
    expect(existsSync(pathResolve(userRepoRoot, ".claude"))).toBe(false);

    copySkillArtifacts({
      configRoot: userRepoRoot,
      packageRootOverride: fakePackageRoot,
    });

    expect(
      existsSync(pathResolve(userRepoRoot, ".claude", "skills")),
    ).toBe(true);
  });

  it("preserves existing user-customized SKILL.md (does not overwrite)", () => {
    const customSkillDir = pathResolve(
      userRepoRoot,
      ".claude",
      "skills",
      "generate-adrs",
    );
    mkdirSync(customSkillDir, { recursive: true });
    const customContent = "USER-CUSTOMIZED CONTENT - DO NOT OVERWRITE\n";
    writeFileSync(
      pathResolve(customSkillDir, "SKILL.md"),
      customContent,
      "utf8",
    );

    const result = copySkillArtifacts({
      configRoot: userRepoRoot,
      packageRootOverride: fakePackageRoot,
    });

    expect(result.copied.length).toBe(CANONICAL_SKILL_NAMES.length - 1);
    expect(result.preserved.length).toBe(1);
    expect(
      readFileSync(
        pathResolve(customSkillDir, "SKILL.md"),
        "utf8",
      ),
    ).toBe(customContent);
  });

  it("throws actionable error when package skills directory is missing", () => {
    rmSync(pathResolve(fakePackageRoot, ".claude"), {
      recursive: true,
      force: true,
    });

    expect(() =>
      copySkillArtifacts({
        configRoot: userRepoRoot,
        packageRootOverride: fakePackageRoot,
      }),
    ).toThrow(/Claude Code skills missing.*Reinstall contextatlas/);
  });

  it("throws actionable error when an individual skill source is missing", () => {
    rmSync(
      pathResolve(fakePackageRoot, ".claude", "skills", "generate-adrs"),
      { recursive: true, force: true },
    );

    expect(() =>
      copySkillArtifacts({
        configRoot: userRepoRoot,
        packageRootOverride: fakePackageRoot,
      }),
    ).toThrow(/Skill source missing.*Reinstall contextatlas/);
  });

  it("CANONICAL_SKILL_NAMES contains the three v1.1 skills", () => {
    expect(CANONICAL_SKILL_NAMES).toEqual([
      "generate-adrs",
      "index-atlas",
      "prime-atlas",
    ]);
  });
});
