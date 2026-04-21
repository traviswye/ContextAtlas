/**
 * CRUD for the `claims`, `claim_symbols`, and `source_shas` tables.
 *
 * A Claim has a many-to-many relationship with Symbols: a single claim
 * ("must be idempotent") may govern multiple symbols (OrderProcessor and
 * BaseProcessor). Linkage rows live in `claim_symbols`.
 */

import type { Claim, Severity, SymbolId } from "../types.js";

import type { DatabaseInstance } from "./db.js";

interface ClaimRow {
  id: number;
  source: string;
  source_path: string;
  source_sha: string;
  severity: string;
  claim: string;
  rationale: string | null;
  excerpt: string | null;
}

export interface NewClaim {
  source: string;
  sourcePath: string;
  sourceSha: string;
  severity: Severity;
  claim: string;
  rationale?: string;
  excerpt?: string;
  symbolIds: readonly SymbolId[];
}

function rowToClaim(row: ClaimRow, symbolIds: SymbolId[]): Claim {
  return {
    id: row.id,
    source: row.source,
    sourcePath: row.source_path,
    sourceSha: row.source_sha,
    severity: row.severity as Severity,
    claim: row.claim,
    rationale: row.rationale ?? undefined,
    excerpt: row.excerpt ?? undefined,
    symbolIds,
  };
}

export function insertClaim(db: DatabaseInstance, claim: NewClaim): number {
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO claims (source, source_path, source_sha, severity, claim, rationale, excerpt)
         VALUES (@source, @source_path, @source_sha, @severity, @claim, @rationale, @excerpt)`,
      )
      .run({
        source: claim.source,
        source_path: claim.sourcePath,
        source_sha: claim.sourceSha,
        severity: claim.severity,
        claim: claim.claim,
        rationale: claim.rationale ?? null,
        excerpt: claim.excerpt ?? null,
      });
    const claimId = Number(info.lastInsertRowid);
    const linkStmt = db.prepare(
      "INSERT OR IGNORE INTO claim_symbols (claim_id, symbol_id) VALUES (?, ?)",
    );
    for (const symId of claim.symbolIds) {
      linkStmt.run(claimId, symId);
    }
    return claimId;
  });
  return tx();
}

export function insertClaims(
  db: DatabaseInstance,
  claims: readonly NewClaim[],
): number[] {
  const ids: number[] = [];
  const tx = db.transaction(() => {
    for (const c of claims) ids.push(insertClaim(db, c));
  });
  tx();
  return ids;
}

export function listAllClaims(db: DatabaseInstance): Claim[] {
  const rows = db
    .prepare("SELECT * FROM claims ORDER BY id")
    .all() as ClaimRow[];
  const linkStmt = db.prepare(
    "SELECT symbol_id FROM claim_symbols WHERE claim_id = ? ORDER BY symbol_id",
  );
  return rows.map((row) => {
    const links = linkStmt.all(row.id) as { symbol_id: string }[];
    return rowToClaim(
      row,
      links.map((l) => l.symbol_id),
    );
  });
}

export function listClaimsForSymbol(
  db: DatabaseInstance,
  symbolId: SymbolId,
): Claim[] {
  const rows = db
    .prepare(
      `SELECT c.* FROM claims c
       INNER JOIN claim_symbols cs ON cs.claim_id = c.id
       WHERE cs.symbol_id = ?
       ORDER BY c.id`,
    )
    .all(symbolId) as ClaimRow[];
  const linkStmt = db.prepare(
    "SELECT symbol_id FROM claim_symbols WHERE claim_id = ? ORDER BY symbol_id",
  );
  return rows.map((row) => {
    const links = linkStmt.all(row.id) as { symbol_id: string }[];
    return rowToClaim(
      row,
      links.map((l) => l.symbol_id),
    );
  });
}

/**
 * Delete every claim whose source file path matches. Used by incremental
 * reindex: when a doc changes, drop its claims and re-extract.
 */
export function deleteClaimsBySourcePath(
  db: DatabaseInstance,
  sourcePath: string,
): number {
  const tx = db.transaction(() => {
    const ids = db
      .prepare("SELECT id FROM claims WHERE source_path = ?")
      .all(sourcePath) as { id: number }[];
    if (ids.length === 0) return 0;
    const delLinks = db.prepare(
      "DELETE FROM claim_symbols WHERE claim_id = ?",
    );
    for (const { id } of ids) delLinks.run(id);
    const res = db
      .prepare("DELETE FROM claims WHERE source_path = ?")
      .run(sourcePath);
    return res.changes;
  });
  return tx();
}

export function clearClaims(db: DatabaseInstance): void {
  db.exec("DELETE FROM claim_symbols; DELETE FROM claims;");
}

// ---------------------------------------------------------------------------
// source_shas — path → sha map of prose docs that fed extraction.
// Distinct from symbols.file_sha, which tracks code files.
// ---------------------------------------------------------------------------

export function setSourceSha(
  db: DatabaseInstance,
  sourcePath: string,
  sourceSha: string,
): void {
  db.prepare(
    `INSERT INTO source_shas (source_path, source_sha) VALUES (?, ?)
     ON CONFLICT(source_path) DO UPDATE SET source_sha = excluded.source_sha`,
  ).run(sourcePath, sourceSha);
}

export function getSourceSha(
  db: DatabaseInstance,
  sourcePath: string,
): string | null {
  const row = db
    .prepare("SELECT source_sha FROM source_shas WHERE source_path = ?")
    .get(sourcePath) as { source_sha: string } | undefined;
  return row?.source_sha ?? null;
}

export function listSourceShas(
  db: DatabaseInstance,
): Record<string, string> {
  const rows = db
    .prepare("SELECT source_path, source_sha FROM source_shas ORDER BY source_path")
    .all() as { source_path: string; source_sha: string }[];
  const out: Record<string, string> = {};
  for (const row of rows) out[row.source_path] = row.source_sha;
  return out;
}

export function clearSourceShas(db: DatabaseInstance): void {
  db.exec("DELETE FROM source_shas;");
}
