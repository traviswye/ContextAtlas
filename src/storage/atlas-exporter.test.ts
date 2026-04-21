import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { importAtlas, importAtlasFile } from "./atlas-importer.js";
import {
  exportAtlas,
  serializeAtlas,
} from "./atlas-exporter.js";
import { insertClaims } from "./claims.js";
import { type DatabaseInstance, openDatabase } from "./db.js";
import { upsertSymbols } from "./symbols.js";
import type { AtlasFileV1 } from "./types.js";

const FIXTURE_PATH = pathResolve("test/fixtures/atlas/sample-atlas.json");

describe("exportAtlas", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  it("produces canonical key order and sorted arrays on empty db", () => {
    const atlas = exportAtlas(db, {
      generatedAt: "2026-04-21T00:00:00Z",
      contextatlasVersion: "0.0.1",
      extractionModel: "claude-opus-4-7",
    });
    expect(Object.keys(atlas)).toEqual([
      "version",
      "generated_at",
      "generator",
      "source_shas",
      "symbols",
      "claims",
    ]);
    expect(atlas.symbols).toEqual([]);
    expect(atlas.claims).toEqual([]);
  });

  it("sorts symbols by id and claims by (source, first-symbol, claim)", () => {
    upsertSymbols(db, [
      {
        id: "sym:ts:src/z.ts:Z",
        name: "Z",
        kind: "class",
        path: "src/z.ts",
        line: 1,
        language: "typescript",
        fileSha: "z",
      },
      {
        id: "sym:ts:src/a.ts:A",
        name: "A",
        kind: "class",
        path: "src/a.ts",
        line: 1,
        language: "typescript",
        fileSha: "a",
      },
    ]);
    insertClaims(db, [
      {
        source: "ADR-02",
        sourcePath: "docs/adr/ADR-02.md",
        sourceSha: "s2",
        severity: "hard",
        claim: "second",
        symbolIds: ["sym:ts:src/z.ts:Z"],
      },
      {
        source: "ADR-01",
        sourcePath: "docs/adr/ADR-01.md",
        sourceSha: "s1",
        severity: "hard",
        claim: "first",
        symbolIds: ["sym:ts:src/z.ts:Z", "sym:ts:src/a.ts:A"],
      },
    ]);

    const atlas = exportAtlas(db, {
      generatedAt: "2026-04-21T00:00:00Z",
      contextatlasVersion: "0.0.1",
      extractionModel: "claude-opus-4-7",
    });
    expect(atlas.symbols.map((s) => s.id)).toEqual([
      "sym:ts:src/a.ts:A",
      "sym:ts:src/z.ts:Z",
    ]);
    expect(atlas.claims.map((c) => c.source)).toEqual(["ADR-01", "ADR-02"]);
    // symbol_ids within each claim must be sorted alphabetically.
    expect(atlas.claims[0]?.symbol_ids).toEqual([
      "sym:ts:src/a.ts:A",
      "sym:ts:src/z.ts:Z",
    ]);
  });

  it("omits nullish optional fields (signature, rationale, excerpt)", () => {
    upsertSymbols(db, [
      {
        id: "sym:ts:src/a.ts:A",
        name: "A",
        kind: "class",
        path: "src/a.ts",
        line: 1,
        language: "typescript",
        fileSha: "a",
        // no signature
      },
    ]);
    insertClaims(db, [
      {
        source: "ADR-01",
        sourcePath: "docs/adr/ADR-01.md",
        sourceSha: "s",
        severity: "hard",
        claim: "c",
        // no rationale, no excerpt
        symbolIds: ["sym:ts:src/a.ts:A"],
      },
    ]);
    const atlas = exportAtlas(db, {
      generatedAt: "t",
      contextatlasVersion: "v",
      extractionModel: "m",
    });
    expect("signature" in atlas.symbols[0]!).toBe(false);
    expect("rationale" in atlas.claims[0]!).toBe(false);
    expect("excerpt" in atlas.claims[0]!).toBe(false);
  });

  it("source_shas keys are sorted alphabetically", () => {
    db.prepare("INSERT INTO source_shas VALUES (?, ?)").run(
      "z-last.md",
      "z",
    );
    db.prepare("INSERT INTO source_shas VALUES (?, ?)").run(
      "a-first.md",
      "a",
    );
    const atlas = exportAtlas(db, {
      generatedAt: "t",
      contextatlasVersion: "v",
      extractionModel: "m",
    });
    expect(Object.keys(atlas.source_shas)).toEqual(["a-first.md", "z-last.md"]);
  });

  it("falls back to atlas_meta.generated_at when no override given", () => {
    importAtlasFile(db, FIXTURE_PATH);
    const atlas = exportAtlas(db);
    expect(atlas.generated_at).toBe("2026-04-21T14:32:00Z");
    expect(atlas.generator.contextatlas_version).toBe("0.0.1");
    expect(atlas.generator.extraction_model).toBe("claude-opus-4-7");
  });

  it("produces byte-identical output across two independent runs", () => {
    importAtlasFile(db, FIXTURE_PATH);
    const a = serializeAtlas(exportAtlas(db));
    const b = serializeAtlas(exportAtlas(db));
    expect(a).toBe(b);
  });
});

describe("atlas.json round-trip", () => {
  it("fixture → import → export is byte-identical", () => {
    const original = readFileSync(FIXTURE_PATH, "utf8");
    const db = openDatabase(":memory:");
    try {
      importAtlasFile(db, FIXTURE_PATH);
      const rebuilt = serializeAtlas(exportAtlas(db));
      expect(rebuilt).toBe(original);
    } finally {
      db.close();
    }
  });

  it("programmatic data → export → import → re-export is stable", () => {
    const db1 = openDatabase(":memory:");
    const db2 = openDatabase(":memory:");
    try {
      upsertSymbols(db1, [
        {
          id: "sym:ts:src/a.ts:A",
          name: "A",
          kind: "class",
          path: "src/a.ts",
          line: 1,
          language: "typescript",
          fileSha: "a-sha",
          signature: "class A",
        },
        {
          id: "sym:ts:src/b.ts:B",
          name: "B",
          kind: "function",
          path: "src/b.ts",
          line: 10,
          language: "typescript",
          fileSha: "b-sha",
        },
      ]);
      insertClaims(db1, [
        {
          source: "ADR-01",
          sourcePath: "docs/adr/ADR-01.md",
          sourceSha: "sha1",
          severity: "hard",
          claim: "A must be immutable",
          rationale: "state consistency",
          symbolIds: ["sym:ts:src/a.ts:A"],
        },
      ]);
      db1.prepare("INSERT INTO source_shas VALUES (?, ?)").run(
        "docs/adr/ADR-01.md",
        "sha1",
      );
      db1
        .prepare("INSERT INTO atlas_meta (key, value) VALUES (?, ?)")
        .run("generated_at", "2026-04-21T00:00:00Z");

      const firstExport: AtlasFileV1 = exportAtlas(db1, {
        generatedAt: "2026-04-21T00:00:00Z",
        contextatlasVersion: "0.0.1",
        extractionModel: "claude-opus-4-7",
      });
      const firstSerialized = serializeAtlas(firstExport);

      importAtlas(db2, firstExport);
      const secondSerialized = serializeAtlas(exportAtlas(db2));
      expect(secondSerialized).toBe(firstSerialized);
    } finally {
      db1.close();
      db2.close();
    }
  });
});
