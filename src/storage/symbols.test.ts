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
  const sym: AtlasSymbol = {
    id: overrides.id,
    name: overrides.name,
    kind: overrides.kind ?? "class",
    path: overrides.path ?? "src/a.ts",
    line: overrides.line ?? 1,
    signature: overrides.signature,
    language: overrides.language ?? "typescript",
    fileSha: overrides.fileSha ?? "sha-default",
  };
  if (overrides.parentId !== undefined) sym.parentId = overrides.parentId;
  return sym;
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

  it("round-trips parentId when present (ADR-14 flattened-child pattern)", () => {
    const parent = makeSym({
      id: "sym:ts:src/a.ts:Shape",
      name: "Shape",
      kind: "interface",
      path: "src/a.ts",
      fileSha: "p",
    });
    const child = makeSym({
      id: "sym:ts:src/a.ts:Shape.Area",
      name: "Shape.Area",
      kind: "method",
      path: "src/a.ts",
      parentId: parent.id,
      fileSha: "p",
    });
    upsertSymbols(db, [parent, child]);

    const parentRead = getSymbol(db, parent.id);
    const childRead = getSymbol(db, child.id);
    expect(parentRead?.parentId).toBeUndefined();
    expect(childRead?.parentId).toBe(parent.id);
  });

  it("omits parentId on the returned Symbol when column is NULL", () => {
    // Historical rows (atlas schema <= 1.1, or top-level symbols
    // written post-migration without parent_id) read back with
    // parentId undefined — not the string "null", not an empty string.
    upsertSymbol(
      db,
      makeSym({ id: "sym:ts:src/a.ts:Foo", name: "Foo", fileSha: "sha" }),
    );
    const fetched = getSymbol(db, "sym:ts:src/a.ts:Foo");
    expect(fetched).toBeDefined();
    expect("parentId" in fetched!).toBe(false);
  });

  it("upsert updates parentId on an existing row", () => {
    upsertSymbol(
      db,
      makeSym({
        id: "sym:ts:src/a.ts:X.M",
        name: "X.M",
        parentId: "sym:ts:src/a.ts:X",
      }),
    );
    // Re-upsert with no parent_id — mimics a re-path where the
    // symbol loses its parent relationship.
    upsertSymbol(
      db,
      makeSym({ id: "sym:ts:src/a.ts:X.M", name: "X.M" }),
    );
    const fetched = getSymbol(db, "sym:ts:src/a.ts:X.M");
    expect(fetched?.parentId).toBeUndefined();
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
