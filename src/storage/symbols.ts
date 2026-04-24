/**
 * CRUD for the `symbols` table.
 *
 * All inserts require a non-empty `fileSha`. The adapter boundary returns
 * symbols without a SHA; the indexer stamps the SHA before handing off
 * to storage.
 */

import {
  LANG_CODES_INVERSE,
  type LanguageCode,
  type Symbol as AtlasSymbol,
  type SymbolId,
  type SymbolKind,
} from "../types.js";

import type { DatabaseInstance } from "./db.js";

interface SymbolRow {
  id: string;
  name: string;
  kind: string;
  path: string;
  line: number;
  signature: string | null;
  parent_id: string | null;
  file_sha: string;
}

function rowToSymbol(row: SymbolRow): AtlasSymbol {
  const sym: AtlasSymbol = {
    id: row.id,
    name: row.name,
    kind: row.kind as SymbolKind,
    path: row.path,
    line: row.line,
    signature: row.signature ?? undefined,
    language: languageFromId(row.id),
    fileSha: row.file_sha,
  };
  if (row.parent_id !== null) sym.parentId = row.parent_id;
  return sym;
}

/**
 * Infer language from a symbol ID's short-code segment. Every symbol ID
 * has the shape `sym:<short>:<path>:<name>` — see ADR-01.
 */
function languageFromId(id: SymbolId): LanguageCode {
  const parts = id.split(":");
  if (parts.length < 4 || parts[0] !== "sym") {
    throw new Error(`Malformed symbol ID '${id}': expected 'sym:<lang>:...'`);
  }
  const short = parts[1]!;
  const lang = LANG_CODES_INVERSE[short];
  if (!lang) {
    throw new Error(
      `Unknown language short-code '${short}' in symbol ID '${id}'.`,
    );
  }
  return lang;
}

export function upsertSymbol(
  db: DatabaseInstance,
  symbol: AtlasSymbol,
): void {
  if (!symbol.fileSha) {
    throw new Error(
      `upsertSymbol: symbol '${symbol.id}' has no fileSha. Stamp the SHA ` +
        "at the indexer boundary before inserting.",
    );
  }
  db.prepare(
    `INSERT INTO symbols (id, name, kind, path, line, signature, parent_id, file_sha)
     VALUES (@id, @name, @kind, @path, @line, @signature, @parent_id, @file_sha)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       kind = excluded.kind,
       path = excluded.path,
       line = excluded.line,
       signature = excluded.signature,
       parent_id = excluded.parent_id,
       file_sha = excluded.file_sha`,
  ).run({
    id: symbol.id,
    name: symbol.name,
    kind: symbol.kind,
    path: symbol.path,
    line: symbol.line,
    signature: symbol.signature ?? null,
    parent_id: symbol.parentId ?? null,
    file_sha: symbol.fileSha,
  });
}

export function upsertSymbols(
  db: DatabaseInstance,
  symbols: readonly AtlasSymbol[],
): void {
  const tx = db.transaction((rows: readonly AtlasSymbol[]) => {
    for (const sym of rows) upsertSymbol(db, sym);
  });
  tx(symbols);
}

export function getSymbol(
  db: DatabaseInstance,
  id: SymbolId,
): AtlasSymbol | null {
  const row = db
    .prepare("SELECT * FROM symbols WHERE id = ?")
    .get(id) as SymbolRow | undefined;
  return row ? rowToSymbol(row) : null;
}

export function getSymbolsByName(
  db: DatabaseInstance,
  name: string,
): AtlasSymbol[] {
  const rows = db
    .prepare("SELECT * FROM symbols WHERE name = ? ORDER BY id")
    .all(name) as SymbolRow[];
  return rows.map(rowToSymbol);
}

export function getSymbolsByPath(
  db: DatabaseInstance,
  path: string,
): AtlasSymbol[] {
  const rows = db
    .prepare("SELECT * FROM symbols WHERE path = ? ORDER BY id")
    .all(path) as SymbolRow[];
  return rows.map(rowToSymbol);
}

/**
 * Delete every symbol row for a given source file path. Used by incremental
 * reindex when a file changes — drop all its symbols and re-insert the
 * current set. Cascades to `claim_symbols` entries referencing those IDs.
 */
export function deleteSymbolsByPath(
  db: DatabaseInstance,
  path: string,
): number {
  const ids = db
    .prepare("SELECT id FROM symbols WHERE path = ?")
    .all(path) as { id: string }[];
  if (ids.length === 0) return 0;
  const tx = db.transaction(() => {
    const delLinks = db.prepare(
      "DELETE FROM claim_symbols WHERE symbol_id = ?",
    );
    for (const { id } of ids) delLinks.run(id);
    const res = db.prepare("DELETE FROM symbols WHERE path = ?").run(path);
    return res.changes;
  });
  return tx();
}

export function listAllSymbols(db: DatabaseInstance): AtlasSymbol[] {
  const rows = db
    .prepare("SELECT * FROM symbols ORDER BY id")
    .all() as SymbolRow[];
  return rows.map(rowToSymbol);
}

export function clearSymbols(db: DatabaseInstance): void {
  db.exec("DELETE FROM claim_symbols; DELETE FROM symbols;");
}
