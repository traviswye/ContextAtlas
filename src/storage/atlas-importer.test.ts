import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { importAtlas, importAtlasFile } from "./atlas-importer.js";
import { listAllClaims, listSourceShas } from "./claims.js";
import { type DatabaseInstance, openDatabase } from "./db.js";
import { listAllSymbols } from "./symbols.js";
import type { AtlasFileV1 } from "./types.js";

const FIXTURE_PATH = pathResolve("test/fixtures/atlas/sample-atlas.json");

function loadFixture(): AtlasFileV1 {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as AtlasFileV1;
}

describe("importAtlas", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  it("loads symbols, claims, and source_shas from the fixture", () => {
    importAtlasFile(db, FIXTURE_PATH);
    const symbols = listAllSymbols(db);
    expect(symbols).toHaveLength(3);
    expect(symbols.map((s) => s.name)).toEqual([
      "BaseProcessor",
      "OrderProcessor",
      "OrderQueue",
    ]);
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(2);
    expect(listSourceShas(db)).toEqual({
      "docs/adr/ADR-01.md": "abc123",
      "docs/adr/ADR-07.md": "def456",
    });
  });

  it("is idempotent — importing twice yields the same state", () => {
    importAtlasFile(db, FIXTURE_PATH);
    const snapshot1 = {
      symbols: listAllSymbols(db),
      claims: listAllClaims(db),
      shas: listSourceShas(db),
    };
    importAtlasFile(db, FIXTURE_PATH);
    expect(listAllSymbols(db)).toEqual(snapshot1.symbols);
    expect(listSourceShas(db)).toEqual(snapshot1.shas);
    // Claims have autoincrement ids; the IDs themselves may differ after
    // a re-import, but the visible content (source, claim, symbolIds)
    // must be identical.
    const stripIds = (cs: typeof snapshot1.claims) =>
      cs.map(({ id: _id, ...rest }) => rest);
    expect(stripIds(listAllClaims(db))).toEqual(stripIds(snapshot1.claims));
  });

  it("replaces existing data on re-import (not merges)", () => {
    importAtlasFile(db, FIXTURE_PATH);
    // Mutate the fixture in-memory to drop one symbol and re-import.
    const mutated = loadFixture();
    mutated.symbols = mutated.symbols.filter(
      (s) => s.name !== "OrderQueue",
    );
    // Any claim referencing the dropped symbol must also be pruned from
    // the input; otherwise foreign keys would rightly reject it.
    mutated.claims = mutated.claims.filter((c) =>
      c.symbol_ids.every((id) => id !== "sym:ts:src/orders/queue.ts:OrderQueue"),
    );
    importAtlas(db, mutated);
    expect(listAllSymbols(db).map((s) => s.name)).toEqual([
      "BaseProcessor",
      "OrderProcessor",
    ]);
  });

  it("rejects unsupported version", () => {
    const bogus = { ...loadFixture(), version: "2.0" } as unknown as AtlasFileV1;
    expect(() => importAtlas(db, bogus)).toThrow(/unsupported atlas version/);
  });

  it("accepts v1.2 atlas with parent_id entries (ADR-14)", () => {
    const v12Atlas: AtlasFileV1 = {
      version: "1.2",
      generated_at: "2026-04-24T00:00:00Z",
      generator: {
        contextatlas_version: "0.0.1",
        extraction_model: "claude-opus-4-7",
      },
      source_shas: {},
      symbols: [
        {
          id: "sym:ts:src/a.ts:Shape",
          name: "Shape",
          kind: "interface",
          path: "src/a.ts",
          line: 1,
          file_sha: "sha",
        },
        {
          id: "sym:ts:src/a.ts:Shape.Area",
          name: "Shape.Area",
          kind: "method",
          path: "src/a.ts",
          line: 2,
          parent_id: "sym:ts:src/a.ts:Shape",
          file_sha: "sha",
        },
      ],
      claims: [],
    };
    importAtlas(db, v12Atlas);
    const symbols = listAllSymbols(db);
    const method = symbols.find((s) => s.name === "Shape.Area");
    expect(method?.parentId).toBe("sym:ts:src/a.ts:Shape");
    const iface = symbols.find((s) => s.name === "Shape");
    expect(iface?.parentId).toBeUndefined();
  });

  it("accepts v1.3 atlas with generator.contextatlas_commit_sha (v0.3 Theme 1.3)", () => {
    const v13Atlas: AtlasFileV1 = {
      version: "1.3",
      generated_at: "2026-04-24T00:00:00Z",
      generator: {
        contextatlas_version: "0.3.0",
        contextatlas_commit_sha: "d".repeat(40),
        extraction_model: "claude-opus-4-7",
      },
      source_shas: {},
      symbols: [],
      claims: [],
    };
    importAtlas(db, v13Atlas);
    const row = db
      .prepare("SELECT value FROM atlas_meta WHERE key = ?")
      .get("generator.contextatlas_commit_sha") as
      | { value: string }
      | undefined;
    expect(row?.value).toBe("d".repeat(40));
  });

  it("accepts v1.3 atlas without contextatlas_commit_sha (omitted optional field)", () => {
    const v13Atlas: AtlasFileV1 = {
      version: "1.3",
      generated_at: "2026-04-24T00:00:00Z",
      generator: {
        contextatlas_version: "0.3.0",
        extraction_model: "claude-opus-4-7",
      },
      source_shas: {},
      symbols: [],
      claims: [],
    };
    importAtlas(db, v13Atlas);
    const row = db
      .prepare("SELECT value FROM atlas_meta WHERE key = ?")
      .get("generator.contextatlas_commit_sha") as
      | { value: string }
      | undefined;
    expect(row).toBeUndefined();
  });

  it("accepts v1.1 atlas without parent_id (back-compat; every symbol reads parentId undefined)", () => {
    const v11Atlas: AtlasFileV1 = {
      version: "1.1",
      generated_at: "2026-04-24T00:00:00Z",
      generator: {
        contextatlas_version: "0.0.1",
        extraction_model: "claude-opus-4-7",
      },
      source_shas: {},
      symbols: [
        {
          id: "sym:ts:src/a.ts:Foo",
          name: "Foo",
          kind: "class",
          path: "src/a.ts",
          line: 1,
          file_sha: "sha",
        },
      ],
      claims: [],
    };
    importAtlas(db, v11Atlas);
    const symbols = listAllSymbols(db);
    expect(symbols[0]?.parentId).toBeUndefined();
  });

  it("rolls back the entire transaction on failure — no partial state", () => {
    // Pre-seed the DB with some data that should survive a failed import.
    importAtlasFile(db, FIXTURE_PATH);
    const beforeSymbols = listAllSymbols(db);

    // Construct an atlas whose claim references a symbol that is NOT in
    // the atlas's own symbols array — foreign key violation mid-transaction.
    const bad = loadFixture();
    bad.claims.push({
      source: "BAD",
      source_path: "docs/bad.md",
      source_sha: "x",
      severity: "hard",
      claim: "points to nowhere",
      symbol_ids: ["sym:ts:src/nonexistent.ts:Ghost"],
    });
    expect(() => importAtlas(db, bad)).toThrow();

    // Because the transaction rolled back, the DB must still reflect the
    // last successful import — NOT a half-cleared, half-populated state.
    expect(listAllSymbols(db)).toEqual(beforeSymbols);
  });
});
