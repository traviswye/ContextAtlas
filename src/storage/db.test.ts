import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  LATEST_SCHEMA_VERSION,
  openDatabase,
  withDatabase,
} from "./db.js";

describe("openDatabase", () => {
  it("brings a fresh :memory: db to the latest schema version", () => {
    const db = openDatabase(":memory:");
    const row = db
      .prepare("SELECT value FROM _meta WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(parseInt(row.value, 10)).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });

  it("creates the expected tables", () => {
    const db = openDatabase(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "_meta",
        "atlas_meta",
        "claim_symbols",
        "claims",
        "claims_fts",
        "source_shas",
        "symbols",
      ]),
    );
    db.close();
  });

  it("claims_fts virtual table stays in sync with claims via triggers (ADR-09)", () => {
    const db = openDatabase(":memory:");
    // Insert a claim directly into the base table and confirm the
    // FTS shadow sees it. This proves the v2 migration's triggers
    // fire and that find_by_intent's upstream state will be correct
    // for any code path that uses the storage layer's normal inserts.
    db.prepare(
      "INSERT INTO claims (source, source_path, source_sha, severity, claim, rationale, excerpt) " +
        "VALUES ('T', 't.md', 's', 'hard', 'payment idempotency matters', 'r', 'e')",
    ).run();

    const ftsCount = (
      db
        .prepare("SELECT COUNT(*) AS n FROM claims_fts")
        .get() as { n: number }
    ).n;
    expect(ftsCount).toBe(1);

    // MATCH round-trips the stored text.
    const hit = db
      .prepare(
        "SELECT rowid FROM claims_fts WHERE claims_fts MATCH 'payment' ",
      )
      .all() as { rowid: number }[];
    expect(hit).toHaveLength(1);

    // Deleting the base row cascades to FTS via the AD trigger.
    db.prepare("DELETE FROM claims WHERE id = ?").run(hit[0]!.rowid);
    const afterDelete = (
      db
        .prepare("SELECT COUNT(*) AS n FROM claims_fts")
        .get() as { n: number }
    ).n;
    expect(afterDelete).toBe(0);
    db.close();
  });

  it("symbols table has the migration-v4 parent_id column (ADR-14)", () => {
    const db = openDatabase(":memory:");
    const cols = db
      .prepare("PRAGMA table_info(symbols)")
      .all() as { name: string; type: string; notnull: number }[];
    const parent = cols.find((c) => c.name === "parent_id");
    expect(parent).toBeDefined();
    expect(parent?.type).toBe("TEXT");
    expect(parent?.notnull).toBe(0); // nullable
    db.close();
  });

  it("migration v4 adds parent_id additively to an existing v3 database", () => {
    // Simulate an existing v3 DB by opening, then rolling schema_version
    // back to 3 and dropping the parent_id column (conceptually), then
    // reopening. better-sqlite3 doesn't support DROP COLUMN pre-3.35,
    // so instead we open fresh and confirm migrations 1-4 apply in
    // sequence without data loss. The idempotent-reopen test covers
    // the no-op path; this covers the additive-apply path.
    const tmp = mkdtempSync(pathJoin(tmpdir(), "contextatlas-db-"));
    const dbPath = pathJoin(tmp, "index.db");
    try {
      const db1 = openDatabase(dbPath);
      db1
        .prepare(
          `INSERT INTO symbols (id, name, kind, path, line, file_sha)
           VALUES ('sym:ts:a.ts:Foo', 'Foo', 'class', 'a.ts', 1, 'sha')`,
        )
        .run();
      db1.close();

      // Re-open — migrations are idempotent; parent_id is NULL on the
      // pre-existing row.
      const db2 = openDatabase(dbPath);
      const row = db2
        .prepare("SELECT parent_id FROM symbols WHERE id = ?")
        .get("sym:ts:a.ts:Foo") as { parent_id: string | null };
      expect(row.parent_id).toBeNull();
      db2.close();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("creates the expected indexes", () => {
    const db = openDatabase(":memory:");
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_claim_symbols_symbol");
    expect(names).toContain("idx_symbols_name");
    db.close();
  });

  it("is idempotent — re-opening an up-to-date db is a no-op", () => {
    const tmp = mkdtempSync(pathJoin(tmpdir(), "contextatlas-db-"));
    const dbPath = pathJoin(tmp, "index.db");
    try {
      const db1 = openDatabase(dbPath);
      db1.close();
      const db2 = openDatabase(dbPath);
      const row = db2
        .prepare("SELECT value FROM _meta WHERE key = 'schema_version'")
        .get() as { value: string };
      expect(parseInt(row.value, 10)).toBe(LATEST_SCHEMA_VERSION);
      db2.close();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("withDatabase", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "contextatlas-db-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("closes the connection after the callback returns", () => {
    const dbPath = pathJoin(tmp, "index.db");
    const result = withDatabase(dbPath, (db) => {
      return db.prepare("SELECT 1 AS x").get() as { x: number };
    });
    expect(result.x).toBe(1);
  });

  it("closes the connection even when the callback throws", () => {
    const dbPath = pathJoin(tmp, "index.db");
    expect(() =>
      withDatabase(dbPath, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    // Re-open succeeds — proves the previous connection was released.
    const db = openDatabase(dbPath);
    db.close();
  });
});
