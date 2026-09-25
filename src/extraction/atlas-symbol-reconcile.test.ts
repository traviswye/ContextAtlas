/**
 * Claim-link helpers for `resolve-symbols` (v1.2 Phase 2 review round
 * 2.2): which dangling links point into files the run could not verify,
 * and which ids `symbols` does not list.
 */

import { describe, expect, it } from "vitest";

import type { AtlasSymbolEntry } from "../storage/types.js";

import { unlistedLinkedIds, unverifiableLinks } from "./atlas-symbol-reconcile.js";
import type { SymbolCoverage } from "./symbol-prune.js";

const coverage: SymbolCoverage = {
  walkedPaths: new Set(["src/listed.ts", "src/flaky.ts"]),
  listedPaths: new Set(["src/listed.ts"]),
  failedPaths: new Set(["src/flaky.ts"]),
  inventoryIds: new Set(["sym:ts:src/listed.ts:Kept"]),
  configuredExtensions: new Set([".ts"]),
  fileExists: (p) =>
    ["src/listed.ts", "src/flaky.ts", "src/excluded.ts", "lib/mod.rb", "pkg/mod.py"].includes(p),
};

describe("unverifiableLinks", () => {
  it("returns links into files whose listing failed or whose language is not configured", () => {
    expect(
      unverifiableLinks(
        [
          "sym:ts:src/flaky.ts:Flaky",
          "sym:rb:lib/mod.rb:Outer::Inner", // a name with colons
          "sym:py:pkg/mod.py:Thing",
          "sym:ts:src/listed.ts:Removed", // listed: known gone
          "sym:ts:src/gone.ts:Gone", // file deleted: known gone
          "sym:ts:src/excluded.ts:Ex", // exists, not walked, .ts configured: excluded
          "not-a-symbol-id",
        ],
        coverage,
      ),
    ).toEqual([
      { id: "sym:py:pkg/mod.py:Thing", path: "pkg/mod.py", reason: "language-not-configured" },
      { id: "sym:rb:lib/mod.rb:Outer::Inner", path: "lib/mod.rb", reason: "language-not-configured" },
      { id: "sym:ts:src/flaky.ts:Flaky", path: "src/flaky.ts", reason: "listing-failed" },
    ]);
  });
});

describe("unlistedLinkedIds", () => {
  it("collects the ids claims link that `symbols` does not list", () => {
    const symbols: AtlasSymbolEntry[] = [
      { id: "sym:ts:a.ts:A", name: "A", kind: "function", path: "a.ts", line: 1, file_sha: "s" },
    ];
    expect([
      ...unlistedLinkedIds(
        [{ symbol_ids: ["sym:ts:a.ts:A", "sym:ts:b.ts:B"] }, { symbol_ids: ["sym:ts:b.ts:B"] }, {}],
        symbols,
      ),
    ]).toEqual(["sym:ts:b.ts:B"]);
  });
});
