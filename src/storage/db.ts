/**
 * SQLite connection management and schema migrations for ContextAtlas.
 *
 * The storage schema is an extension of DESIGN.md's documented tables.
 * In addition to the three query tables (symbols, claims, claim_symbols),
 * we persist three artifact-metadata tables so that atlas.json round-trip
 * is lossless per ADR-06:
 *
 *   - `_meta`        — internal schema version bookkeeping (not user-visible)
 *   - `atlas_meta`   — top-level atlas.json fields (version, generated_at,
 *                      generator info) stored as key/value rows
 *   - `source_shas`  — the path→sha map of prose docs that fed extraction
 *
 * Migrations are expressed as code. Adding a v2 appends one entry to
 * `MIGRATIONS`; the runner applies everything above the current version
 * inside a single transaction per migration.
 */

import Database, { type Database as DatabaseInstance } from "better-sqlite3";

interface Migration {
  version: number;
  apply(db: DatabaseInstance): void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    apply(db) {
      db.exec(`
        CREATE TABLE symbols (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          kind        TEXT NOT NULL,
          path        TEXT NOT NULL,
          line        INTEGER NOT NULL,
          signature   TEXT,
          file_sha    TEXT NOT NULL
        );

        CREATE TABLE claims (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          source      TEXT NOT NULL,
          source_path TEXT NOT NULL,
          source_sha  TEXT NOT NULL,
          severity    TEXT NOT NULL,
          claim       TEXT NOT NULL,
          rationale   TEXT,
          excerpt     TEXT
        );

        CREATE TABLE claim_symbols (
          claim_id    INTEGER NOT NULL,
          symbol_id   TEXT NOT NULL,
          PRIMARY KEY (claim_id, symbol_id),
          FOREIGN KEY (claim_id) REFERENCES claims(id),
          FOREIGN KEY (symbol_id) REFERENCES symbols(id)
        );

        CREATE INDEX idx_claim_symbols_symbol ON claim_symbols(symbol_id);
        CREATE INDEX idx_symbols_name ON symbols(name);

        CREATE TABLE atlas_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE source_shas (
          source_path TEXT PRIMARY KEY,
          source_sha  TEXT NOT NULL
        );
      `);
    },
  },
  {
    // ADR-09: FTS5 index over the claims table for find_by_intent.
    // External-content virtual table (content='claims', content_rowid='id')
    // keeps atlas.json round-trip lossless — the FTS index is derived
    // from the base claims table, not stored independently.
    version: 2,
    apply(db) {
      db.exec(`
        CREATE VIRTUAL TABLE claims_fts USING fts5(
          claim,
          rationale,
          excerpt,
          content='claims',
          content_rowid='id'
        );

        -- Triggers keep the FTS index in sync with the claims table.
        -- insertClaim, deleteClaimsBySourcePath, and importAtlas all
        -- operate on claims; FTS follows automatically.
        CREATE TRIGGER claims_fts_ai AFTER INSERT ON claims BEGIN
          INSERT INTO claims_fts(rowid, claim, rationale, excerpt)
          VALUES (new.id, new.claim, new.rationale, new.excerpt);
        END;
        CREATE TRIGGER claims_fts_ad AFTER DELETE ON claims BEGIN
          INSERT INTO claims_fts(claims_fts, rowid, claim, rationale, excerpt)
          VALUES('delete', old.id, old.claim, old.rationale, old.excerpt);
        END;
        CREATE TRIGGER claims_fts_au AFTER UPDATE ON claims BEGIN
          INSERT INTO claims_fts(claims_fts, rowid, claim, rationale, excerpt)
          VALUES('delete', old.id, old.claim, old.rationale, old.excerpt);
          INSERT INTO claims_fts(rowid, claim, rationale, excerpt)
          VALUES (new.id, new.claim, new.rationale, new.excerpt);
        END;

        -- Backfill FTS from any existing claims (migrating an existing
        -- v1 DB with data). No-op on a fresh DB.
        INSERT INTO claims_fts(rowid, claim, rationale, excerpt)
        SELECT id, claim, rationale, excerpt FROM claims;
      `);
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, m) => (m.version > max ? m.version : max),
  0,
);

export interface OpenDatabaseOptions {
  /** If true, enable SQLite foreign key enforcement. Default: true. */
  foreignKeys?: boolean;
  /** If true, open read-only. Default: false. */
  readonly?: boolean;
}

/**
 * Open a SQLite connection and bring the schema up to the latest version.
 * Path may be `:memory:` for ephemeral test databases.
 */
export function openDatabase(
  path: string,
  options: OpenDatabaseOptions = {},
): DatabaseInstance {
  const db = new Database(path, { readonly: options.readonly ?? false });
  if (!options.readonly) {
    db.pragma("journal_mode = WAL");
  }
  db.pragma(`foreign_keys = ${options.foreignKeys === false ? "OFF" : "ON"}`);
  ensureMetaTable(db);
  runMigrations(db);
  return db;
}

function ensureMetaTable(db: DatabaseInstance): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function getSchemaVersion(db: DatabaseInstance): number {
  const row = db
    .prepare("SELECT value FROM _meta WHERE key = ?")
    .get("schema_version") as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

function setSchemaVersion(db: DatabaseInstance, version: number): void {
  db.prepare(
    "INSERT INTO _meta (key, value) VALUES (?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run("schema_version", String(version));
}

function runMigrations(db: DatabaseInstance): void {
  const current = getSchemaVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    const tx = db.transaction(() => {
      migration.apply(db);
      setSchemaVersion(db, migration.version);
    });
    tx();
  }
}

/**
 * Helper for callers that want a promise-style "use DB then close" pattern.
 * The callback receives the open DB; the connection is closed afterwards
 * even on throw. Useful in tests and one-shot scripts.
 */
export function withDatabase<T>(
  path: string,
  fn: (db: DatabaseInstance) => T,
  options?: OpenDatabaseOptions,
): T {
  const db = openDatabase(path, options);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export type { DatabaseInstance };
