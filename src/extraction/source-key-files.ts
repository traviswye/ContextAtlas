/**
 * Whether a prose or docstring `source_shas` key still names a file with
 * a given SHA in the working tree (v1.2 Phase 2 review round 2.2). The
 * resume in `unsaved-work.ts` carries an interrupted run's unit over
 * only while the tree still has the content it was extracted from.
 *
 * Keys are stored relative to different bases (`file-walker.ts`): a
 * source file, and any prose file inside the source root, relative to
 * the source root; an ADR outside it relative to the ADR directory
 * (ADR-08); a docs page outside it relative to the config root. A key
 * matches when the file it names from any of these bases has the SHA.
 */

import { statSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { computeFileSha } from "./file-walker.js";

export interface SourceKeyBases {
  /** The source root (`repoRoot` in the pipeline). */
  readonly sourceRoot: string;
  /** Where `.contextatlas.yml` lives. */
  readonly configRoot: string;
  /** `config.adrs.path`, relative to the config root. */
  readonly adrsPath: string;
}

/** Build the `(key, sha) => boolean` check for {@link SourceKeyBases}. */
export function sourceKeyMatcher(
  bases: SourceKeyBases,
): (key: string, sha: string) => boolean {
  const roots = [
    ...new Set([
      pathResolve(bases.sourceRoot),
      pathResolve(bases.configRoot, bases.adrsPath),
      pathResolve(bases.configRoot),
    ]),
  ];
  return (key, sha) => roots.some((root) => fileHasSha(pathResolve(root, key), sha));
}

function fileHasSha(absPath: string, sha: string): boolean {
  try {
    if (!statSync(absPath).isFile()) return false;
    return computeFileSha(absPath) === sha;
  } catch {
    return false;
  }
}
