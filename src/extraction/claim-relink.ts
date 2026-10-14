/**
 * Re-link claims that have no symbol link (v1.2 Phase 3), from their
 * stored `symbol_candidates` (F-7) and the run's fresh inventory. No
 * model call.
 *
 * Covers claims the Stage 4a prune just orphaned whose names now
 * resolve elsewhere (a symbol moved files keeps its name but changes
 * id), claims an interrupted run left orphaned in a checkpoint, and
 * claims extracted before the symbol they name existed. Resolution is
 * the CLI streams' exact-name rule (`resolveCandidates`), not the
 * Skill's name-form normalization, so a re-link never adds a link a
 * fresh CLI extraction of the same candidates would not.
 *
 * Unresolvable orphans are not queued for re-extraction: re-extracting
 * an unchanged source yields the same candidates, so it would bill for
 * nothing, and a changed source is already pending. Updating the
 * source to name current symbols re-attaches them on its next
 * extraction.
 */

import {
  linkClaimToSymbols,
  listUnlinkedClaimCandidates,
} from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";

import { resolveCandidates, type SymbolInventory } from "./resolver.js";

/** Link every unlinked claim whose candidates resolve; returns how many. */
export function relinkUnlinkedClaims(
  db: DatabaseInstance,
  inventory: SymbolInventory,
): number {
  let relinked = 0;
  const run = db.transaction(() => {
    for (const { id, candidates } of listUnlinkedClaimCandidates(db)) {
      const { symbolIds } = resolveCandidates(inventory, candidates);
      if (symbolIds.length === 0) continue;
      linkClaimToSymbols(db, id, symbolIds);
      relinked++;
    }
  });
  run();
  return relinked;
}
