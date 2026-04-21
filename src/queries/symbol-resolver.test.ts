import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import { upsertSymbols } from "../storage/symbols.js";
import type { Symbol as AtlasSymbol } from "../types.js";

import { resolveSymbol } from "./symbol-resolver.js";

function sym(
  over: Partial<AtlasSymbol> & Pick<AtlasSymbol, "id" | "name" | "path">,
): AtlasSymbol {
  return {
    kind: "class",
    line: 1,
    language: "typescript",
    fileSha: "sha",
    ...over,
  };
}

describe("resolveSymbol", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
    upsertSymbols(db, [
      sym({ id: "sym:ts:src/billing/charges.ts:Foo", name: "Foo", path: "src/billing/charges.ts" }),
      sym({ id: "sym:ts:src/admin/pre-billing.ts:Foo", name: "Foo", path: "src/admin/pre-billing.ts" }),
      sym({ id: "sym:ts:src/orders/processor.ts:OrderProcessor", name: "OrderProcessor", path: "src/orders/processor.ts" }),
    ]);
  });
  afterEach(() => db.close());

  it("full ID match resolves directly", () => {
    const r = resolveSymbol(db, "sym:ts:src/orders/processor.ts:OrderProcessor");
    expect(r.kind).toBe("resolved");
    if (r.kind === "resolved") expect(r.symbol.name).toBe("OrderProcessor");
  });

  it("full ID with no hit returns not_found", () => {
    const r = resolveSymbol(db, "sym:ts:nope/nope.ts:Nope");
    expect(r.kind).toBe("not_found");
  });

  it("name with single match resolves", () => {
    const r = resolveSymbol(db, "OrderProcessor");
    expect(r.kind).toBe("resolved");
  });

  it("name with multiple matches returns disambiguation", () => {
    const r = resolveSymbol(db, "Foo");
    expect(r.kind).toBe("disambiguation");
    if (r.kind === "disambiguation") expect(r.candidates).toHaveLength(2);
  });

  it("unknown name returns not_found", () => {
    const r = resolveSymbol(db, "Missing");
    expect(r.kind).toBe("not_found");
  });

  it("file_hint prefix-match is preferred over substring", () => {
    // Both candidates contain 'billing' as a substring; only one has
    // a path starting with 'src/billing'. Prefix match wins.
    const r = resolveSymbol(db, "Foo", { fileHint: "src/billing" });
    expect(r.kind).toBe("resolved");
    if (r.kind === "resolved")
      expect(r.symbol.path).toBe("src/billing/charges.ts");
  });

  it("file_hint falls back to substring when no prefix match", () => {
    // 'billing' alone matches 'src/billing/charges.ts' as prefix? No —
    // path starts with 'src/', not 'billing'. Both paths contain
    // 'billing' as a substring though. So prefix finds zero, fallback
    // picks up both → disambiguation.
    const r = resolveSymbol(db, "Foo", { fileHint: "billing" });
    expect(r.kind).toBe("disambiguation");
    if (r.kind === "disambiguation") expect(r.candidates).toHaveLength(2);
  });

  it("file_hint prefix reduces to one match when specific enough", () => {
    const r = resolveSymbol(db, "Foo", { fileHint: "src/admin" });
    expect(r.kind).toBe("resolved");
    if (r.kind === "resolved")
      expect(r.symbol.path).toBe("src/admin/pre-billing.ts");
  });

  it("file_hint with zero matches returns full candidate list", () => {
    const r = resolveSymbol(db, "Foo", { fileHint: "nowhere/" });
    expect(r.kind).toBe("disambiguation");
    if (r.kind === "disambiguation") expect(r.candidates).toHaveLength(2);
  });

  it("hint is normalized (backslashes, trailing slash)", () => {
    const r = resolveSymbol(db, "Foo", { fileHint: "src\\billing\\" });
    expect(r.kind).toBe("resolved");
  });

  it("empty input returns not_found", () => {
    expect(resolveSymbol(db, "").kind).toBe("not_found");
    expect(resolveSymbol(db, "   ").kind).toBe("not_found");
  });
});
