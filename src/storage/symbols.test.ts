import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Symbol as AtlasSymbol } from "../types.js";

import { type DatabaseInstance, openDatabase } from "./db.js";
import {
  deleteSymbolsByPath,
  getSymbol,
  getSymbolsByName,
  getSymbolsByPath,
  listAllSymbols,
  upsertSymbol,
  upsertSymbols,
} from "./symbols.js";

function makeSym(
  overrides: Partial<AtlasSymbol> & Pick<AtlasSymbol, "id" | "name">,
): AtlasSymbol {
  return {
    id: overrides.id,
    name: overrides.name,
    kind: overrides.kind ?? "class",
    path: overrides.path ?? "src/a.ts",
    line: overrides.line ?? 1,
    signature: overrides.signature,
    language: overrides.language ?? "typescript",
    fileSha: overrides.fileSha ?? "sha-default",
  };
}

describe("symbols CRUD", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  it("upsert + getSymbol round-trips a full symbol", () => {
    const sym = makeSym({
      id: "sym:ts:src/a.ts:Foo",
      name: "Foo",
      kind: "class",
      path: "src/a.ts",
      line: 42,
      signature: "class Foo extends Bar",
      fileSha: "abc",
    });
    upsertSymbol(db, sym);
    const fetched = getSymbol(db, sym.id);
    expect(fetched).toEqual(sym);
  });

  it("upsert updates an existing row rather than inserting a duplicate", () => {
    upsertSymbol(db, makeSym({ id: "sym:ts:src/a.ts:Foo", name: "Foo", line: 1 }));
    upsertSymbol(db, makeSym({ id: "sym:ts:src/a.ts:Foo", name: "Foo", line: 99 }));
    const all = listAllSymbols(db);
    expect(all).toHaveLength(1);
    expect(all[0]?.line).toBe(99);
  });

  it("getSymbol returns null for missing id", () => {
    expect(getSymbol(db, "sym:ts:nope:Missing")).toBeNull();
  });

  it("throws when fileSha is absent — stamping is required at insert", () => {
    const sym = makeSym({ id: "sym:ts:src/a.ts:Foo", name: "Foo" });
    delete (sym as { fileSha?: string }).fileSha;
    expect(() => upsertSymbol(db, sym)).toThrow(/fileSha/);
  });

  it("getSymbolsByName and ByPath return multiple sorted by id", () => {
    upsertSymbols(db, [
      makeSym({ id: "sym:ts:src/b.ts:Foo", name: "Foo", path: "src/b.ts" }),
      makeSym({ id: "sym:ts:src/a.ts:Foo", name: "Foo", path: "src/a.ts" }),
      makeSym({ id: "sym:ts:src/a.ts:Bar", name: "Bar", path: "src/a.ts" }),
    ]);
    const byName = getSymbolsByName(db, "Foo");
    expect(byName.map((s) => s.id)).toEqual([
      "sym:ts:src/a.ts:Foo",
      "sym:ts:src/b.ts:Foo",
    ]);
    const byPath = getSymbolsByPath(db, "src/a.ts");
    expect(byPath.map((s) => s.id)).toEqual([
      "sym:ts:src/a.ts:Bar",
      "sym:ts:src/a.ts:Foo",
    ]);
  });

  it("deleteSymbolsByPath removes rows and cascades claim_symbols links", () => {
    upsertSymbols(db, [
      makeSym({ id: "sym:ts:src/a.ts:Foo", name: "Foo", path: "src/a.ts" }),
      makeSym({ id: "sym:ts:src/a.ts:Bar", name: "Bar", path: "src/a.ts" }),
      makeSym({ id: "sym:ts:src/b.ts:Baz", name: "Baz", path: "src/b.ts" }),
    ]);
    // Insert a claim linked to one of the doomed symbols.
    const info = db
      .prepare(
        `INSERT INTO claims (source, source_path, source_sha, severity, claim)
         VALUES ('ADR', 'docs/ADR.md', 'sha1', 'hard', 'test claim')`,
      )
      .run();
    const claimId = Number(info.lastInsertRowid);
    db.prepare(
      "INSERT INTO claim_symbols (claim_id, symbol_id) VALUES (?, ?)",
    ).run(claimId, "sym:ts:src/a.ts:Foo");

    const deleted = deleteSymbolsByPath(db, "src/a.ts");
    expect(deleted).toBe(2);
    expect(listAllSymbols(db).map((s) => s.id)).toEqual([
      "sym:ts:src/b.ts:Baz",
    ]);
    const links = db
      .prepare("SELECT COUNT(*) AS n FROM claim_symbols")
      .get() as { n: number };
    expect(links.n).toBe(0);
  });
});
