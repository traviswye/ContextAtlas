/**
 * The cache-only retry list (v1.2 Phase 2 review round 2.3).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getCacheMeta } from "../storage/cache-meta.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";

import type { ProseFile, ShaDiff } from "./file-walker.js";
import {
  clearRetry,
  listRetryKeys,
  markForRetry,
  pruneRetryKeys,
  RETRY_SOURCE_KEYS_KEY,
  withRetries,
} from "./retry-keys.js";

function prose(relPath: string): ProseFile {
  return { absPath: `/r/${relPath}`, relPath, sha: `sha-${relPath}`, bucket: "adr" };
}

describe("retry-keys", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  it("marks, clears and lists keys; an empty list leaves no row", () => {
    expect(listRetryKeys(db).size).toBe(0);
    markForRetry(db, "src/b.ts");
    markForRetry(db, "docs/adr/ADR-01.md");
    markForRetry(db, "src/b.ts");
    expect([...listRetryKeys(db)].sort()).toEqual(["docs/adr/ADR-01.md", "src/b.ts"]);
    clearRetry(db, "src/b.ts");
    clearRetry(db, "src/never.ts");
    expect([...listRetryKeys(db)]).toEqual(["docs/adr/ADR-01.md"]);
    clearRetry(db, "docs/adr/ADR-01.md");
    expect(getCacheMeta(db, RETRY_SOURCE_KEYS_KEY)).toBeUndefined();
  });

  it("prunes keys the run no longer walks", () => {
    markForRetry(db, "src/kept.ts");
    markForRetry(db, "src/gone.ts");
    expect([...pruneRetryKeys(db, (k) => k === "src/kept.ts")]).toEqual(["src/kept.ts"]);
    expect([...listRetryKeys(db)]).toEqual(["src/kept.ts"]);
  });

  it("moves unchanged prose files on the list to changed", () => {
    const diff: ShaDiff = {
      changed: [prose("a.md")],
      unchanged: [prose("b.md"), prose("c.md")],
      added: [],
      deleted: ["d.md"],
    };
    const out = withRetries(diff, new Set(["c.md", "z.md"]));
    expect(out.changed.map((f) => f.relPath)).toEqual(["a.md", "c.md"]);
    expect(out.unchanged.map((f) => f.relPath)).toEqual(["b.md"]);
    expect(out.deleted).toEqual(["d.md"]);
    expect(withRetries(diff, new Set())).toBe(diff);
  });
});
