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
        "source_shas",
        "symbols",
      ]),
    );
    db.close();
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
