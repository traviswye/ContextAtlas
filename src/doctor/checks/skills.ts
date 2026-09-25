/**
 * Claude Code skill freshness doctor check (v1.2 Phase 2, lead decision
 * L-12 iv). Parallel to `extraction.prompts_artifact_fresh`
 * (`prompts.ts`).
 *
 * `contextatlas init` copies the package's canonical skills
 * (`<package>/.claude/skills/<name>/SKILL.md`) into the user repo, but
 * never overwrites a copy that already exists (`init/skill-copy.ts`:
 * the user may have edited it). After a package upgrade the repo keeps
 * running the old skill. v1.2 is the first release that changes what
 * `/index-atlas` must write (canonical `commit:<sha>` keys; a refresh
 * rule that no longer drops docs-bucket and commit claims), so a stale
 * copy is now worth surfacing.
 *
 * One check, `extraction.skills_fresh`:
 *   - PASS: every canonical skill is installed and matches the package
 *   - WARN: some skills are missing and/or differ from the package
 *   - WARN: the running package ships no skills to compare against
 *
 * Line endings are normalized before comparing, so a copy committed to
 * the user repo and checked out with CRLF does not count as drifted.
 * Filesystem-only; runs in limited mode too.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join as pathJoin, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CANONICAL_SKILL_NAMES } from "../../init/skill-copy.js";
import type { CheckContext, DoctorCheck } from "../types.js";

const CHECK_ID = "extraction.skills_fresh";

/** Resolve `<package>/` from this module (`<package>/dist/doctor/checks/`). */
function resolvePackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return pathResolve(here, "..", "..", "..");
}

function skillPath(root: string, name: string): string {
  return pathResolve(root, ".claude", "skills", name, "SKILL.md");
}

/**
 * File text with CRLF normalized to LF, or null when it cannot be read
 * (missing, unreadable, a directory). A doctor check must not throw.
 */
function readNormalized(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  } catch {
    return null;
  }
}

/**
 * Compare the user repo's installed skills with the running package's
 * canonical copies. `packageRootOverride` is a test seam.
 */
export function skillFreshnessChecks(
  ctx: CheckContext,
  packageRootOverride?: string,
): DoctorCheck[] {
  const packageRoot = packageRootOverride ?? resolvePackageRoot();
  const packageSkillsDir = pathResolve(packageRoot, ".claude", "skills");

  const canonical = new Map<string, string>();
  const packageMissing: string[] = [];
  for (const name of CANONICAL_SKILL_NAMES) {
    const text = readNormalized(skillPath(packageRoot, name));
    if (text === null) packageMissing.push(name);
    else canonical.set(name, text);
  }
  if (packageMissing.length > 0) {
    return [
      {
        id: CHECK_ID,
        category: "extraction",
        status: "warn",
        message: `cannot verify Claude Code skills — package copy not found: ${packageMissing.join(", ")}`,
        detail: `The running contextatlas package has no ${packageMissing.join(", ")} skill under ${packageSkillsDir}. Reinstall contextatlas (\`npm install -g contextatlas\`); skills ship in the package's .claude/skills/.`,
      },
    ];
  }

  const missing: string[] = [];
  const drifted: string[] = [];
  for (const name of CANONICAL_SKILL_NAMES) {
    const installed = skillPath(ctx.repoRoot, name);
    if (!existsSync(installed)) {
      missing.push(name);
      continue;
    }
    // An unreadable installed copy counts as drifted: refreshing it is
    // the remedy either way.
    if (readNormalized(installed) !== canonical.get(name)) drifted.push(name);
  }

  if (missing.length === 0 && drifted.length === 0) {
    return [
      {
        id: CHECK_ID,
        category: "extraction",
        status: "pass",
        message: `Claude Code skills match installed package (${CANONICAL_SKILL_NAMES.join(", ")})`,
      },
    ];
  }

  const parts: string[] = [];
  if (drifted.length > 0) {
    parts.push(`drifted from installed package: ${drifted.join(", ")}`);
  }
  if (missing.length > 0) {
    parts.push(`not installed: ${missing.join(", ")}`);
  }
  const details: string[] = [];
  if (drifted.length > 0) {
    details.push(
      "`contextatlas init` never overwrites an installed skill (it may hold your edits), so after a package upgrade the old copy keeps running. " +
        "Stale copies run older workflows: an /index-atlas copy from before v1.2 writes legacy bare-sha commit keys, and its refresh step can drop docs-bucket and commit claims. " +
        `To refresh, copy the package's ${pathJoin(packageSkillsDir, "<name>", "SKILL.md")} over .claude/skills/<name>/SKILL.md (re-apply any edits you made), ` +
        "or delete `.claude/skills/<name>/` and re-run `contextatlas init` (init also runs `contextatlas index` when the atlas is behind HEAD).",
    );
  }
  if (missing.length > 0) {
    details.push(
      "Run `contextatlas init` to install the missing skills (the /index-atlas, /generate-adrs and /prime-atlas slash commands). The CLI does not need them.",
    );
  }
  return [
    {
      id: CHECK_ID,
      category: "extraction",
      status: "warn",
      message: `Claude Code skills ${parts.join("; ")}`,
      detail: details.join(" "),
    },
  ];
}
