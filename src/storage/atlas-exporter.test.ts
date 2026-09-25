import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  type PathLike,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin, resolve as pathResolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { importAtlas, importAtlasFile } from "./atlas-importer.js";
import {
  exportAtlas,
  exportAtlasToFile,
  removeStaleAtlasTemp,
  serializeAtlas,
  writeAtlasFileAtomic,
} from "./atlas-exporter.js";

/**
 * `renameSync` fails with the queued error codes, then behaves normally
 * (the Windows lock cases of `writeAtlasFileAtomic`). Empty by default,
 * so every other test sees the real function.
 */
const renameFailures = vi.hoisted(() => [] as string[]);
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync: (from: PathLike, to: PathLike): void => {
      const code = renameFailures.shift();
      if (code !== undefined) {
        const err = new Error(`simulated ${code}`) as NodeJS.ErrnoException;
        err.code = code;
        throw err;
      }
      actual.renameSync(from, to);
    },
  };
});
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
        source: "adr:ADR-02.md",
        sourcePath: "docs/adr/ADR-02.md",
        sourceSha: "s2",
        severity: "hard",
        claim: "second",
        symbolIds: ["sym:ts:src/z.ts:Z"],
      },
      {
        source: "adr:ADR-01.md",
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
    expect(atlas.claims.map((c) => c.source)).toEqual([
      "adr:ADR-01.md",
      "adr:ADR-02.md",
    ]);
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
        source: "adr:ADR-01.md",
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

  it("emits parent_id in canonical position between signature and file_sha (ADR-14 v1.2)", () => {
    upsertSymbols(db, [
      {
        id: "sym:ts:src/a.ts:Shape.Area",
        name: "Shape.Area",
        kind: "method",
        path: "src/a.ts",
        line: 10,
        language: "typescript",
        fileSha: "sha",
        signature: "Area(): number",
        parentId: "sym:ts:src/a.ts:Shape",
      },
    ]);
    const atlas = exportAtlas(db, {
      generatedAt: "t",
      contextatlasVersion: "v",
      extractionModel: "m",
    });
    const entry = atlas.symbols[0]!;
    expect(Object.keys(entry)).toEqual([
      "id",
      "name",
      "kind",
      "path",
      "line",
      "signature",
      "parent_id",
      "file_sha",
    ]);
    expect(entry.parent_id).toBe("sym:ts:src/a.ts:Shape");
  });

  it("omits parent_id when absent; canonical order still holds without it", () => {
    upsertSymbols(db, [
      {
        id: "sym:ts:src/a.ts:Foo",
        name: "Foo",
        kind: "class",
        path: "src/a.ts",
        line: 1,
        language: "typescript",
        fileSha: "sha",
        signature: "class Foo",
        // no parentId
      },
      {
        id: "sym:ts:src/a.ts:Bare",
        name: "Bare",
        kind: "class",
        path: "src/a.ts",
        line: 2,
        language: "typescript",
        fileSha: "sha",
        // no signature, no parentId
      },
    ]);
    const atlas = exportAtlas(db, {
      generatedAt: "t",
      contextatlasVersion: "v",
      extractionModel: "m",
    });
    const withSig = atlas.symbols.find((s) => s.id.endsWith(":Foo"))!;
    const bare = atlas.symbols.find((s) => s.id.endsWith(":Bare"))!;
    expect("parent_id" in withSig).toBe(false);
    expect("parent_id" in bare).toBe(false);
    expect(Object.keys(withSig)).toEqual([
      "id",
      "name",
      "kind",
      "path",
      "line",
      "signature",
      "file_sha",
    ]);
    expect(Object.keys(bare)).toEqual([
      "id",
      "name",
      "kind",
      "path",
      "line",
      "file_sha",
    ]);
  });

  it("emits contextatlas_commit_sha between contextatlas_version and extraction_model (v1.3 canonical order)", () => {
    const atlas = exportAtlas(db, {
      generatedAt: "2026-04-24T00:00:00Z",
      contextatlasVersion: "0.3.0",
      contextatlasCommitSha: "a".repeat(40),
      extractionModel: "claude-opus-4-7",
    });
    expect(Object.keys(atlas.generator)).toEqual([
      "contextatlas_version",
      "contextatlas_commit_sha",
      "extraction_model",
    ]);
    expect(atlas.generator.contextatlas_commit_sha).toBe("a".repeat(40));
  });

  it("omits contextatlas_commit_sha when null override is passed (explicit absence)", () => {
    const atlas = exportAtlas(db, {
      generatedAt: "t",
      contextatlasVersion: "0.3.0",
      contextatlasCommitSha: null,
      extractionModel: "m",
    });
    expect("contextatlas_commit_sha" in atlas.generator).toBe(false);
    expect(Object.keys(atlas.generator)).toEqual([
      "contextatlas_version",
      "extraction_model",
    ]);
  });

  it("omits contextatlas_commit_sha when option absent and meta has no value", () => {
    const atlas = exportAtlas(db, {
      generatedAt: "t",
      contextatlasVersion: "0.3.0",
      extractionModel: "m",
    });
    expect("contextatlas_commit_sha" in atlas.generator).toBe(false);
  });

  it("falls back to atlas_meta.generator.contextatlas_commit_sha when no override", () => {
    db.prepare("INSERT INTO atlas_meta (key, value) VALUES (?, ?)").run(
      "generator.contextatlas_commit_sha",
      "b".repeat(40),
    );
    const atlas = exportAtlas(db, {
      generatedAt: "t",
      contextatlasVersion: "0.3.0",
      extractionModel: "m",
    });
    expect(atlas.generator.contextatlas_commit_sha).toBe("b".repeat(40));
  });

  it("emits parent_id without signature when only parent_id is present", () => {
    // Possible edge case: a method symbol that gopls reports without a
    // signature (rare but possible). Canonical order: id, name, kind,
    // path, line, parent_id, file_sha — signature slot skipped.
    upsertSymbols(db, [
      {
        id: "sym:ts:src/a.ts:Shape.Sig",
        name: "Shape.Sig",
        kind: "method",
        path: "src/a.ts",
        line: 10,
        language: "typescript",
        fileSha: "sha",
        parentId: "sym:ts:src/a.ts:Shape",
        // no signature
      },
    ]);
    const atlas = exportAtlas(db, {
      generatedAt: "t",
      contextatlasVersion: "v",
      extractionModel: "m",
    });
    const entry = atlas.symbols[0]!;
    expect(Object.keys(entry)).toEqual([
      "id",
      "name",
      "kind",
      "path",
      "line",
      "parent_id",
      "file_sha",
    ]);
    expect("signature" in entry).toBe(false);
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

  it("parent_id survives export → import → re-export (v1.2 round-trip)", () => {
    const db1 = openDatabase(":memory:");
    const db2 = openDatabase(":memory:");
    try {
      upsertSymbols(db1, [
        {
          id: "sym:ts:src/a.ts:Shape",
          name: "Shape",
          kind: "interface",
          path: "src/a.ts",
          line: 1,
          language: "typescript",
          fileSha: "sha",
        },
        {
          id: "sym:ts:src/a.ts:Shape.Area",
          name: "Shape.Area",
          kind: "method",
          path: "src/a.ts",
          line: 2,
          language: "typescript",
          fileSha: "sha",
          parentId: "sym:ts:src/a.ts:Shape",
          signature: "Area(): number",
        },
      ]);
      db1
        .prepare("INSERT INTO atlas_meta (key, value) VALUES (?, ?)")
        .run("version", "1.2");

      const firstExport = exportAtlas(db1, {
        generatedAt: "2026-04-24T00:00:00Z",
        contextatlasVersion: "0.0.1",
        extractionModel: "claude-opus-4-7",
      });
      const firstSerialized = serializeAtlas(firstExport);
      expect(firstExport.version).toBe("1.2");
      const methodEntry = firstExport.symbols.find(
        (s) => s.name === "Shape.Area",
      );
      expect(methodEntry?.parent_id).toBe("sym:ts:src/a.ts:Shape");

      importAtlas(db2, firstExport);
      const secondSerialized = serializeAtlas(exportAtlas(db2));
      expect(secondSerialized).toBe(firstSerialized);
    } finally {
      db1.close();
      db2.close();
    }
  });

  it("contextatlas_commit_sha survives export → import → re-export (v1.3 round-trip)", () => {
    const db1 = openDatabase(":memory:");
    const db2 = openDatabase(":memory:");
    try {
      db1
        .prepare("INSERT INTO atlas_meta (key, value) VALUES (?, ?)")
        .run("version", "1.3");
      const firstExport = exportAtlas(db1, {
        generatedAt: "2026-04-24T00:00:00Z",
        contextatlasVersion: "0.3.0",
        contextatlasCommitSha: "c".repeat(40),
        extractionModel: "claude-opus-4-7",
      });
      const firstSerialized = serializeAtlas(firstExport);
      expect(firstExport.version).toBe("1.3");
      expect(firstExport.generator.contextatlas_commit_sha).toBe(
        "c".repeat(40),
      );

      importAtlas(db2, firstExport);
      const secondSerialized = serializeAtlas(exportAtlas(db2));
      expect(secondSerialized).toBe(firstSerialized);
    } finally {
      db1.close();
      db2.close();
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
          source: "adr:ADR-01.md",
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

describe("claims[].symbol_candidates export (F-7)", () => {
  const SHA = "0123456789abcdef0123456789abcdef01234567";

  /**
   * A Skill-built atlas after `resolve-symbols`, already in the
   * exporter's canonical order: claim keys end `symbol_ids,
   * symbol_candidates` (the order every v0.8 Skill benchmark atlas
   * uses), the docstring claim lists its documented symbol first
   * (SKILL.md Phase B step 2), and candidate arrays are NOT sorted.
   */
  function skillShapedAtlas(): AtlasFileV1 {
    return {
      version: "1.4",
      generated_at: "2026-09-25T00:00:00.000Z",
      generator: {
        contextatlas_version: "1.2.0",
        extraction_model: "claude-opus-4-7",
      },
      source_shas: {
        [`commit:${SHA}`]: SHA,
        "docs/adr/ADR-01-routing.md": "adr-sha",
        "src/router.ts": "router-sha",
      },
      symbols: [
        {
          id: "sym:ts:src/router.ts:RegExpRouter",
          name: "RegExpRouter",
          kind: "class",
          path: "src/router.ts",
          line: 12,
          file_sha: "router-sha",
        },
        {
          id: "sym:ts:src/router.ts:Router",
          name: "Router",
          kind: "interface",
          path: "src/router.ts",
          line: 3,
          file_sha: "router-sha",
        },
      ],
      claims: [
        {
          source: "adr:ADR-01-routing.md",
          source_path: "docs/adr/ADR-01-routing.md",
          source_sha: "adr-sha",
          severity: "context",
          claim: "Routing is pluggable",
          rationale: "Apps pick a router",
          excerpt: "Routers are interchangeable",
          symbol_ids: [],
        },
        {
          source: "adr:ADR-01-routing.md",
          source_path: "docs/adr/ADR-01-routing.md",
          source_sha: "adr-sha",
          severity: "hard",
          claim: "RegExpRouter must stay allocation-free on match",
          rationale: "Hot path",
          excerpt: "The matcher never allocates",
          symbol_ids: ["sym:ts:src/router.ts:RegExpRouter"],
          symbol_candidates: ["RegExpRouter", "hono.router.Matcher", "Ghost"],
        },
        {
          source: `commit:${SHA}`,
          source_path: `commit:${SHA}`,
          source_sha: SHA,
          severity: "soft",
          claim: "Routers share one interface",
          rationale: "Swap without code changes",
          excerpt: "refactor: extract Router interface",
          symbol_ids: ["sym:ts:src/router.ts:Router"],
          symbol_candidates: ["Router"],
        },
        {
          source: "docstring:src/router.ts",
          source_path: "src/router.ts",
          source_sha: "router-sha",
          severity: "soft",
          claim: "Router implementations are stateless",
          rationale: "Shared across requests",
          excerpt: "Implementations must not keep per-request state",
          symbol_ids: [
            "sym:ts:src/router.ts:RegExpRouter",
            "sym:ts:src/router.ts:Router",
          ],
          symbol_candidates: ["Router", "RegExpRouter"],
        },
      ],
    };
  }

  it("round-trips a Skill-shaped atlas byte-identically (import → export)", () => {
    const original = serializeAtlas(skillShapedAtlas());
    const db = openDatabase(":memory:");
    try {
      importAtlas(db, JSON.parse(original) as AtlasFileV1);
      expect(serializeAtlas(exportAtlas(db))).toBe(original);
    } finally {
      db.close();
    }
  });

  it("emits symbol_candidates last, only when non-empty, in stored order", () => {
    const db = openDatabase(":memory:");
    try {
      insertClaims(db, [
        {
          source: "adr:ADR-01.md",
          sourcePath: "docs/adr/ADR-01.md",
          sourceSha: "s",
          severity: "hard",
          claim: "with candidates",
          symbolIds: [],
          symbolCandidates: ["Zeta", "Alpha"],
        },
        {
          source: "adr:ADR-01.md",
          sourcePath: "docs/adr/ADR-01.md",
          sourceSha: "s",
          severity: "hard",
          claim: "with rationale and candidates",
          rationale: "r",
          symbolIds: [],
          symbolCandidates: ["Beta"],
        },
        {
          source: "adr:ADR-01.md",
          sourcePath: "docs/adr/ADR-01.md",
          sourceSha: "s",
          severity: "hard",
          claim: "empty candidates",
          symbolIds: [],
          symbolCandidates: [],
        },
        {
          source: "adr:ADR-01.md",
          sourcePath: "docs/adr/ADR-01.md",
          sourceSha: "s",
          severity: "hard",
          claim: "no candidates",
          symbolIds: [],
        },
      ]);
      const byClaim = new Map(
        exportAtlas(db).claims.map((c) => [c.claim, c] as const),
      );
      const withC = byClaim.get("with candidates")!;
      expect(Object.keys(withC)).toEqual([
        "source",
        "source_path",
        "source_sha",
        "severity",
        "claim",
        "symbol_ids",
        "symbol_candidates",
      ]);
      expect(withC.symbol_candidates).toEqual(["Zeta", "Alpha"]);
      expect(Object.keys(byClaim.get("with rationale and candidates")!)).toEqual([
        "source",
        "source_path",
        "source_sha",
        "severity",
        "claim",
        "rationale",
        "symbol_ids",
        "symbol_candidates",
      ]);
      expect(byClaim.get("empty candidates")).not.toHaveProperty(
        "symbol_candidates",
      );
      expect(byClaim.get("no candidates")).not.toHaveProperty(
        "symbol_candidates",
      );
    } finally {
      db.close();
    }
  });

  it("drops empty symbol_candidates arrays (absent and [] mean the same)", () => {
    const atlas = skillShapedAtlas();
    atlas.claims[0] = { ...atlas.claims[0]!, symbol_candidates: [] };
    const db = openDatabase(":memory:");
    try {
      importAtlas(db, atlas);
      const exported = exportAtlas(db);
      expect(exported.claims[0]).not.toHaveProperty("symbol_candidates");
      expect(serializeAtlas(exported)).toBe(serializeAtlas(skillShapedAtlas()));
    } finally {
      db.close();
    }
  });

  it("export → import → re-export is stable with candidates present", () => {
    const db1 = openDatabase(":memory:");
    const db2 = openDatabase(":memory:");
    try {
      importAtlas(db1, skillShapedAtlas());
      const first = serializeAtlas(exportAtlas(db1));
      importAtlas(db2, JSON.parse(first) as AtlasFileV1);
      expect(serializeAtlas(exportAtlas(db2))).toBe(first);
    } finally {
      db1.close();
      db2.close();
    }
  });
});

describe("atlas file writes are atomic (v1.2 Phase 2 checkpoints)", () => {
  let tmp: string;
  let db: DatabaseInstance;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-atomic-"));
    db = openDatabase(":memory:");
    renameFailures.length = 0;
  });
  afterEach(() => {
    renameFailures.length = 0;
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  const target = () => pathJoin(tmp, "atlas.json");
  const opts = {
    generatedAt: "2026-09-25T00:00:00.000Z",
    contextatlasVersion: "1.2.0",
    extractionModel: "claude-opus-4-7",
  };

  it("exportAtlasToFile writes serializeAtlas's text and leaves no temporary file", () => {
    importAtlasFile(db, FIXTURE_PATH);
    writeFileSync(target(), "old content");
    exportAtlasToFile(db, target(), opts);
    expect(readFileSync(target(), "utf8")).toBe(serializeAtlas(exportAtlas(db, opts)));
    expect(readdirSync(tmp)).toEqual(["atlas.json"]);
  });

  it("a rename that fails briefly with EPERM or EACCES (a lock on Windows) is retried", () => {
    renameFailures.push("EPERM", "EACCES");
    writeAtlasFileAtomic(target(), "new\n");
    expect(renameFailures).toEqual([]);
    expect(readFileSync(target(), "utf8")).toBe("new\n");
    expect(readdirSync(tmp)).toEqual(["atlas.json"]);
  });

  it("a rename that keeps failing with EBUSY falls back to writing the file directly and removes the temporary file", () => {
    writeFileSync(target(), "old\n");
    renameFailures.push("EBUSY", "EBUSY", "EBUSY", "EBUSY");
    writeAtlasFileAtomic(target(), "new\n");
    expect(renameFailures).toEqual([]);
    expect(readFileSync(target(), "utf8")).toBe("new\n");
    expect(readdirSync(tmp)).toEqual(["atlas.json"]);
  });

  it("any other rename error is rethrown, the target is untouched and the temporary file removed", () => {
    writeFileSync(target(), "old\n");
    renameFailures.push("EXDEV");
    expect(() => writeAtlasFileAtomic(target(), "new\n")).toThrow(/simulated EXDEV/);
    expect(readFileSync(target(), "utf8")).toBe("old\n");
    expect(readdirSync(tmp)).toEqual(["atlas.json"]);
  });

  it("removeStaleAtlasTemp removes a leftover <path>.tmp and reports whether there was one", () => {
    writeFileSync(`${target()}.tmp`, "half a write");
    expect(removeStaleAtlasTemp(target())).toBe(true);
    expect(existsSync(`${target()}.tmp`)).toBe(false);
    expect(removeStaleAtlasTemp(target())).toBe(false);
  });
});
