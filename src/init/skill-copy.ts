/**
 * Claude Code skill installation for `contextatlas init` (v1.1.2
 * cohort-UX hotfix).
 *
 * At init time, copies the canonical Claude Code skill substrate
 * shipped in the contextatlas package (`.claude/skills/<name>/SKILL.md`)
 * into the user repo's `.claude/skills/` directory. Claude Code
 * discovers skills via this per-repo location at session start; without
 * the copy, /generate-adrs + /index-atlas + /prime-atlas slash commands
 * are not available even though `contextatlas init` has otherwise
 * succeeded.
 *
 * Source artifacts (in the contextatlas package, post-npm-install):
 *   - `<package>/.claude/skills/generate-adrs/SKILL.md`
 *   - `<package>/.claude/skills/index-atlas/SKILL.md`
 *   - `<package>/.claude/skills/prime-atlas/SKILL.md`
 *
 * Destination artifacts (in the user repo):
 *   - `<configRoot>/.claude/skills/generate-adrs/SKILL.md`
 *   - `<configRoot>/.claude/skills/index-atlas/SKILL.md`
 *   - `<configRoot>/.claude/skills/prime-atlas/SKILL.md`
 *
 * The copy is non-destructive: if a destination SKILL.md already
 * exists, it is preserved (user may have edited it; we don't overwrite
 * customizations). Mirrors the npm package as a source of truth — to
 * refresh skills after upgrade, delete `.claude/skills/<name>/` and
 * re-run `contextatlas init`.
 *
 * Surfaced post-v1.1.0 npm publish during Travis cohort dogfood at
 * apis repo: `/generate-adrs` slash command unavailable in Claude
 * Code session because `.claude/skills/` was not scaffolded.
 * Documented as a real UX gap per Phase 5 surface-inventory miss.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Canonical skill names shipped by the contextatlas package. */
export const CANONICAL_SKILL_NAMES = [
  "generate-adrs",
  "index-atlas",
  "prime-atlas",
] as const;

export type CanonicalSkillName = (typeof CANONICAL_SKILL_NAMES)[number];

export interface SkillCopyResult {
  /** Absolute paths to user-repo SKILL.md files that landed (copied). */
  readonly copied: readonly string[];
  /**
   * Absolute paths to user-repo SKILL.md files that were preserved
   * (already existed; not overwritten). User-customized skill content
   * is preserved across `contextatlas init` re-runs.
   */
  readonly preserved: readonly string[];
}

/**
 * Resolve the contextatlas package root relative to this compiled
 * module's location (`<package>/dist/init/skill-copy.js`). Walks up
 * two levels from `dist/init/` to reach `<package>/`.
 */
function resolvePackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // here is `<package>/dist/init/` after build; two levels up = package root
  return pathResolve(here, "..", "..");
}

/**
 * Copy canonical Claude Code skill substrate from the contextatlas
 * package's `.claude/skills/` into the user repo's `.claude/skills/`.
 *
 * Non-destructive: existing skill files are preserved (returned in
 * `preserved`). To refresh, delete the user-repo skill directory and
 * re-run `contextatlas init`.
 *
 * Test seam: `packageRootOverride` lets unit tests point at a fixture
 * directory instead of resolving from import.meta.url.
 */
export function copySkillArtifacts(opts: {
  readonly configRoot: string;
  readonly packageRootOverride?: string;
}): SkillCopyResult {
  const packageRoot = opts.packageRootOverride ?? resolvePackageRoot();
  const srcSkillsRoot = pathResolve(packageRoot, ".claude", "skills");

  if (!existsSync(srcSkillsRoot)) {
    throw new Error(
      `Claude Code skills missing at ${srcSkillsRoot}. Reinstall ` +
        "contextatlas (skills should ship with the package; run " +
        "`npm install -g contextatlas` or rebuild from source).",
    );
  }

  const destSkillsRoot = pathResolve(opts.configRoot, ".claude", "skills");
  mkdirSync(destSkillsRoot, { recursive: true });

  const copied: string[] = [];
  const preserved: string[] = [];

  for (const name of CANONICAL_SKILL_NAMES) {
    const srcSkill = pathResolve(srcSkillsRoot, name, "SKILL.md");
    if (!existsSync(srcSkill)) {
      throw new Error(
        `Skill source missing at ${srcSkill}. Reinstall contextatlas ` +
          "(skill substrate should ship with the package).",
      );
    }

    const destSkillDir = pathResolve(destSkillsRoot, name);
    const destSkill = pathResolve(destSkillDir, "SKILL.md");

    if (existsSync(destSkill)) {
      preserved.push(destSkill);
      continue;
    }

    mkdirSync(destSkillDir, { recursive: true });
    copyFileSync(srcSkill, destSkill);
    copied.push(destSkill);
  }

  return { copied, preserved };
}
