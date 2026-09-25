import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { importAtlas } from "./atlas-importer.js";
import {
  deleteCacheMeta,
  getCacheMeta,
  isCacheEmpty,
  setCacheMeta,
} from "./cache-meta.js";
import { insertClaim, setSourceSha } from "./claims.js";
import { type DatabaseInstance, openDatabase } from "./db.js";
import { upsertSymbols } from "./symbols.js";
import type { AtlasFileV1 } from "./types.js";

describe("cache-meta (`_meta` bookkeeping)", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  it("gets, sets, replaces and deletes a value", () => {
    expect(getCacheMeta(db, "k")).toBeUndefined();
    setCacheMeta(db, "k", "v1");
    setCacheMeta(db, "k", "v2");
    expect(getCacheMeta(db, "k")).toBe("v2");
    deleteCacheMeta(db, "k");
    expect(getCacheMeta(db, "k")).toBeUndefined();
  });

  it("leaves the schema version alone and survives an atlas import", () => {
    setCacheMeta(db, "k", "v");
    const atlas: AtlasFileV1 = {
      version: "1.4",
      generated_at: "2026-09-25T00:00:00.000Z",
      generator: { contextatlas_version: "1.2.0", extraction_model: "claude-opus-4-7" },
      source_shas: {},
      symbols: [],
      claims: [],
    };
    importAtlas(db, atlas);
    expect(getCacheMeta(db, "k")).toBe("v");
    expect(getCacheMeta(db, "schema_version")).toBeDefined();
  });

  it("isCacheEmpty: true until a symbol, claim or source key exists", () => {
    expect(isCacheEmpty(db)).toBe(true);
    setSourceSha(db, "docs/adr/ADR-01.md", "s");
    expect(isCacheEmpty(db)).toBe(false);

    const db2 = openDatabase(":memory:");
    insertClaim(db2, {
      source: "adr:x.md",
      sourcePath: "x.md",
      sourceSha: "s",
      severity: "hard",
      claim: "c",
      symbolIds: [],
    });
    expect(isCacheEmpty(db2)).toBe(false);
    db2.close();

    const db3 = openDatabase(":memory:");
    upsertSymbols(db3, [
      {
        id: "sym:ts:src/a.ts:A",
        name: "A",
        kind: "function",
        path: "src/a.ts",
        line: 1,
        language: "typescript",
        fileSha: "s",
      },
    ]);
    expect(isCacheEmpty(db3)).toBe(false);
    db3.close();
  });
});
