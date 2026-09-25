/**
 * Commit keys the current HEAD cannot reach (v1.2 Phase 2 review round
 * 2.2).
 *
 * The local cache is gitignored, so it survives a branch switch. With
 * `atlas.committed: true` and no atlas.json on the checked-out branch
 * (the atlas was first committed on another branch, or `committed` was
 * just switched on), Stage 0 takes the cache as the baseline. Commits the
 * cache extracted on another branch would then be exported into this
 * branch's atlas.json, where LOCK 2.b keeps them for good. They are
 * dropped first, with their claims.
 *
 * Only a commit git knows and HEAD does not reach is dropped. A commit
 * git does not know (beyond a shallow clone's history) or a tree where
 * git cannot run keeps its key.
 */

import {
  deleteClaimsBySourcePath,
  deleteSourceSha,
  listSourceShas,
} from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";

import type { CommitReachability } from "./git-extractor.js";
import { COMMIT_KEY_PREFIX, isBareCommitSha } from "./source-keys.js";

/**
 * A commit key, canonical (`commit:<sha>`) or the legacy bare sha; both
 * map to the sha itself.
 */
export function isCommitUnit(key: string, sha: string): boolean {
  return key.startsWith(COMMIT_KEY_PREFIX) || (isBareCommitSha(key) && key === sha);
}

/**
 * Delete every commit key (and its claims) whose commit `reachability`
 * reports "unreachable". Returns how many were dropped.
 */
export function dropUnreachableCommits(
  db: DatabaseInstance,
  reachability: (sha: string) => CommitReachability,
): number {
  let dropped = 0;
  for (const [key, sha] of Object.entries(listSourceShas(db))) {
    if (!isCommitUnit(key, sha)) continue;
    if (reachability(sha) !== "unreachable") continue;
    db.transaction(() => {
      deleteClaimsBySourcePath(db, key);
      deleteSourceSha(db, key);
    })();
    dropped++;
  }
  return dropped;
}
