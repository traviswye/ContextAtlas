import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { log } from "../mcp/logger.js";
import {
  insertClaim,
  listAllClaims,
  listSourceShas,
  setSourceSha,
} from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import { upsertSymbols } from "../storage/symbols.js";
import { LANG_CODES } from "../types.js";

import {
  classifySourceKeyShape,
  classifySourceKeys,
  commitSourceKey,
  hasCommitKey,
  normalizeCommitKeys,
  partitionSourceShas,
  REGISTERED_LANGUAGE_EXTENSIONS,
  streamFromClaimSource,
} from "./source-keys.js";

const HEX = "0123456789abcdef0123456789abcdef01234567";

describe("streamFromClaimSource", () => {
  it("maps claim `source` prefixes to streams", () => {
    expect(streamFromClaimSource("docstring:src/router.ts")).toBe("docstring");
    expect(streamFromClaimSource(`commit:${HEX}`)).toBe("commit");
    expect(streamFromClaimSource("adr:ADR-01.md")).toBe("prose");
    // Legacy pre-v0.7.2 prose source names.
    expect(streamFromClaimSource("ADR-06")).toBe("prose");
    expect(streamFromClaimSource("DESIGN")).toBe("prose");
  });
});

describe("classifySourceKeyShape (fallback for zero-claim keys)", () => {
  it("recognizes both commit key formats (CLI 'commit:<sha>' and Skill bare sha)", () => {
    expect(classifySourceKeyShape(`commit:${HEX}`)).toBe("commit");
    expect(classifySourceKeyShape(HEX)).toBe("commit");
    expect(classifySourceKeyShape(HEX.toUpperCase())).toBe("commit");
  });

  it("does not treat a near-sha as a commit", () => {
    expect(classifySourceKeyShape(HEX.slice(0, 39))).toBe("prose");
    expect(classifySourceKeyShape(`${HEX}0`)).toBe("prose");
  });

  it("treats a path with any registered adapter extension as a docstring source", () => {
    for (const p of [
      "src/a.ts",
      "src/b.tsx",
      "src/c.mts",
      "src/d.cts",
      "src/types.d.ts",
      "pkg/mod.py",
      "cmd/root.go",
      "lib/x.rb",
      "Api/Controller.cs",
    ]) {
      expect(classifySourceKeyShape(p)).toBe("docstring");
    }
  });

  it("treats every other key as prose", () => {
    expect(classifySourceKeyShape("docs/adr/ADR-01.md")).toBe("prose");
    expect(classifySourceKeyShape("docs/adr/ADR-02.rst")).toBe("prose");
    expect(classifySourceKeyShape("README")).toBe("prose");
    expect(classifySourceKeyShape("notes/data.json")).toBe("prose");
  });

  it("honors an explicit extension set", () => {
    expect(
      classifySourceKeyShape("src/a.ts", { sourceExtensions: new Set([".go"]) }),
    ).toBe("prose");
  });
});

describe("classifySourceKeys (claims first, shape fallback)", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  const add = (source: string, sourcePath: string) =>
    insertClaim(db, {
      source,
      sourcePath,
      sourceSha: "s",
      severity: "hard",
      claim: `${source}@${sourcePath}`,
      symbolIds: [],
    });

  it("uses the claim `source` prefix when the key has claims", () => {
    add("adr:ADR-01.md", "docs/adr/ADR-01.md");
    add("ADR-02", "docs/adr/ADR-02.md");
    add("docstring:src/router.ts", "src/router.ts");
    add(`commit:${HEX}`, `commit:${HEX}`);
    add(`commit:${"b".repeat(40)}`, "b".repeat(40));
    // Claims beat shape: a docstring claim at a .md key is a docstring
    // key; an adr claim at a .ts key is a prose key.
    add("docstring:weird.md", "weird.md");
    add("adr:included.ts", "docs/included.ts");

    const out = classifySourceKeys(db, [
      "docs/adr/ADR-01.md",
      "docs/adr/ADR-02.md",
      "src/router.ts",
      `commit:${HEX}`,
      "b".repeat(40),
      "weird.md",
      "docs/included.ts",
    ]);
    expect(Object.fromEntries(out)).toEqual({
      "docs/adr/ADR-01.md": "prose",
      "docs/adr/ADR-02.md": "prose",
      "src/router.ts": "docstring",
      [`commit:${HEX}`]: "commit",
      ["b".repeat(40)]: "commit",
      "weird.md": "docstring",
      "docs/included.ts": "prose",
    });
  });

  it("falls back to key shape for zero-claim keys", () => {
    const out = classifySourceKeys(db, [
      "src/empty.ts",
      `commit:${HEX}`,
      HEX,
      "docs/adr/ADR-09.md",
    ]);
    expect(Object.fromEntries(out)).toEqual({
      "src/empty.ts": "docstring",
      [`commit:${HEX}`]: "commit",
      [HEX]: "commit",
      "docs/adr/ADR-09.md": "prose",
    });
  });

  it("knownProsePaths wins over the shape fallback but not over claims", () => {
    add("docstring:src/a.ts", "src/a.ts");
    const out = classifySourceKeys(db, ["src/a.ts", "src/b.ts"], {
      knownProsePaths: new Set(["src/a.ts", "src/b.ts"]),
    });
    expect(out.get("src/a.ts")).toBe("docstring");
    expect(out.get("src/b.ts")).toBe("prose");
  });

  it("mixed claim streams at one key resolve to the most conservative stream", () => {
    add("adr:x.md", "mixed-1");
    add("docstring:mixed-1", "mixed-1");
    add("docstring:mixed-2", "mixed-2");
    add(`commit:${HEX}`, "mixed-2");
    const out = classifySourceKeys(db, ["mixed-1", "mixed-2"]);
    expect(out.get("mixed-1")).toBe("docstring");
    expect(out.get("mixed-2")).toBe("commit");
  });
});

describe("partitionSourceShas", () => {
  it("splits a source_shas map into prose / docstring / commit maps", () => {
    const db = openDatabase(":memory:");
    try {
      insertClaim(db, {
        source: "docstring:src/router.ts",
        sourcePath: "src/router.ts",
        sourceSha: "s",
        severity: "soft",
        claim: "doc",
        symbolIds: [],
      });
      const part = partitionSourceShas(db, {
        "docs/adr/ADR-01.md": "p1",
        "src/router.ts": "d1",
        "src/empty.py": "d2",
        [`commit:${HEX}`]: HEX,
        ["c".repeat(40)]: "c".repeat(40),
      });
      expect(part).toEqual({
        prose: { "docs/adr/ADR-01.md": "p1" },
        docstring: { "src/router.ts": "d1", "src/empty.py": "d2" },
        commit: {
          [`commit:${HEX}`]: HEX,
          ["c".repeat(40)]: "c".repeat(40),
        },
      });
    } finally {
      db.close();
    }
  });
});

describe("REGISTERED_LANGUAGE_EXTENSIONS", () => {
  it("covers every LanguageCode", () => {
    expect(Object.keys(REGISTERED_LANGUAGE_EXTENSIONS).sort()).toEqual(
      Object.keys(LANG_CODES).sort(),
    );
  });
});

describe("commitSourceKey", () => {
  it("builds the canonical `commit:<sha>` key", () => {
    expect(commitSourceKey(HEX)).toBe(`commit:${HEX}`);
  });
});

// ---------------------------------------------------------------------------
// F-5: canonical commit keys (v1.2 Phase 2, lead decision L-2)
// ---------------------------------------------------------------------------

describe("hasCommitKey (reads both key forms)", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  it("recognizes the canonical `commit:<sha>` key", () => {
    setSourceSha(db, `commit:${HEX}`, HEX);
    expect(hasCommitKey(db, HEX)).toBe(true);
  });

  it("recognizes the legacy bare-sha key the Skill wrote before v1.2", () => {
    setSourceSha(db, HEX, HEX);
    expect(hasCommitKey(db, HEX)).toBe(true);
  });

  it("is false when neither form is keyed, or the value is a different sha", () => {
    expect(hasCommitKey(db, HEX)).toBe(false);
    setSourceSha(db, `commit:${HEX}`, "c".repeat(40));
    expect(hasCommitKey(db, HEX)).toBe(false);
  });
});

describe("normalizeCommitKeys", () => {
  const SHA_B = "b".repeat(40);
  const SYM = "sym:ts:src/widget.ts:WidgetService";
  let db: DatabaseInstance;

  beforeEach(() => {
    db = openDatabase(":memory:");
    upsertSymbols(db, [
      {
        id: SYM,
        name: "WidgetService",
        kind: "class",
        path: "src/widget.ts",
        line: 1,
        language: "typescript",
        fileSha: "sha-w",
      },
    ]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  const add = (
    source: string,
    sourcePath: string,
    claim: string,
    symbolIds: string[] = [],
  ) =>
    insertClaim(db, {
      source,
      sourcePath,
      sourceSha: HEX,
      severity: "soft",
      claim,
      symbolIds,
    });

  const claimsAt = (sourcePath: string) =>
    listAllClaims(db)
      .filter((c) => c.sourcePath === sourcePath)
      .map((c) => c.claim)
      .sort();

  it("rewrites a Skill-form commit (bare key + bare source_path) to `commit:<sha>`", () => {
    setSourceSha(db, HEX, HEX);
    add(`commit:${HEX}`, HEX, "one", [SYM]);
    add(`commit:${HEX}`, HEX, "two");

    const out = normalizeCommitKeys(db);

    expect(out).toEqual({
      shasNormalized: 1,
      keysRewritten: 1,
      claimsRewritten: 2,
      duplicateShas: 0,
      duplicateClaimsDropped: 0,
    });
    expect(listSourceShas(db)).toEqual({ [`commit:${HEX}`]: HEX });
    const claims = listAllClaims(db);
    expect(claims.map((c) => c.sourcePath)).toEqual([
      `commit:${HEX}`,
      `commit:${HEX}`,
    ]);
    // `source` was already canonical; links survive the move.
    expect(claims.map((c) => c.source)).toEqual([
      `commit:${HEX}`,
      `commit:${HEX}`,
    ]);
    expect(claims.find((c) => c.claim === "one")!.symbolIds).toEqual([SYM]);
  });

  it("renames a zero-claim bare key (a commit that yielded no claims)", () => {
    setSourceSha(db, HEX, HEX);
    const out = normalizeCommitKeys(db);
    expect(out.shasNormalized).toBe(1);
    expect(out.keysRewritten).toBe(1);
    expect(out.claimsRewritten).toBe(0);
    expect(listSourceShas(db)).toEqual({ [`commit:${HEX}`]: HEX });
  });

  it("moves bare-form claims that have no key, without inventing a key", () => {
    add(`commit:${HEX}`, HEX, "orphan-form");
    const out = normalizeCommitKeys(db);
    expect(out.claimsRewritten).toBe(1);
    expect(out.keysRewritten).toBe(0);
    expect(claimsAt(`commit:${HEX}`)).toEqual(["orphan-form"]);
    expect(listSourceShas(db)).toEqual({});
  });

  it("sha in both forms: keeps the prefixed claims and key, drops the bare duplicates, logs the count", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    setSourceSha(db, `commit:${HEX}`, HEX);
    add(`commit:${HEX}`, `commit:${HEX}`, "cli");
    setSourceSha(db, HEX, HEX);
    add(`commit:${HEX}`, HEX, "skill-1");
    add(`commit:${HEX}`, HEX, "skill-2");

    const out = normalizeCommitKeys(db);

    expect(out).toEqual({
      shasNormalized: 1,
      keysRewritten: 0,
      claimsRewritten: 0,
      duplicateShas: 1,
      duplicateClaimsDropped: 2,
    });
    expect(listSourceShas(db)).toEqual({ [`commit:${HEX}`]: HEX });
    expect(listAllClaims(db).map((c) => c.claim)).toEqual(["cli"]);
    expect(warn).toHaveBeenCalledTimes(1);
    const [message, meta] = warn.mock.calls[0]!;
    expect(message).toMatch(/both/);
    expect(meta).toMatchObject({ duplicateShas: 1, duplicateClaimsDropped: 2 });
  });

  it("a prefixed zero-claim key still wins over bare-form claims", () => {
    vi.spyOn(log, "warn").mockImplementation(() => {});
    setSourceSha(db, `commit:${HEX}`, HEX);
    setSourceSha(db, HEX, HEX);
    add(`commit:${HEX}`, HEX, "skill");
    const out = normalizeCommitKeys(db);
    expect(out.duplicateShas).toBe(1);
    expect(out.duplicateClaimsDropped).toBe(1);
    expect(listAllClaims(db)).toEqual([]);
    expect(listSourceShas(db)).toEqual({ [`commit:${HEX}`]: HEX });
  });

  it("prefixed claims without a prefixed key take over the bare key", () => {
    vi.spyOn(log, "warn").mockImplementation(() => {});
    add(`commit:${HEX}`, `commit:${HEX}`, "cli");
    setSourceSha(db, HEX, HEX);
    add(`commit:${HEX}`, HEX, "skill");
    const out = normalizeCommitKeys(db);
    expect(out.duplicateShas).toBe(1);
    expect(out.duplicateClaimsDropped).toBe(1);
    expect(out.keysRewritten).toBe(1);
    expect(listAllClaims(db).map((c) => c.claim)).toEqual(["cli"]);
    // The commit stays keyed, so the next run does not re-bill it.
    expect(listSourceShas(db)).toEqual({ [`commit:${HEX}`]: HEX });
  });

  it("leaves canonical commit keys, prose keys, docstring keys and non-commit hex keys alone", () => {
    const warn = vi.spyOn(log, "warn");
    setSourceSha(db, `commit:${SHA_B}`, SHA_B);
    add(`commit:${SHA_B}`, `commit:${SHA_B}`, "canonical");
    setSourceSha(db, "docs/adr/ADR-01.md", "p1");
    add("adr:ADR-01.md", "docs/adr/ADR-01.md", "prose");
    setSourceSha(db, "src/widget.ts", "d1");
    add("docstring:src/widget.ts", "src/widget.ts", "doc");
    // A 40-hex key whose claims are prose is a (strangely named) prose
    // file, not a commit: classification by claims wins over shape.
    setSourceSha(db, HEX, "p2");
    add("adr:odd.md", HEX, "hex-named prose");
    const before = { shas: listSourceShas(db), claims: listAllClaims(db) };

    const out = normalizeCommitKeys(db);

    expect(out).toEqual({
      shasNormalized: 0,
      keysRewritten: 0,
      claimsRewritten: 0,
      duplicateShas: 0,
      duplicateClaimsDropped: 0,
    });
    expect(listSourceShas(db)).toEqual(before.shas);
    expect(listAllClaims(db)).toEqual(before.claims);
    expect(warn).not.toHaveBeenCalled();
  });

  it("normalizes several shas and is idempotent (a second call changes nothing)", () => {
    setSourceSha(db, HEX, HEX);
    add(`commit:${HEX}`, HEX, "a");
    setSourceSha(db, SHA_B, SHA_B);

    const first = normalizeCommitKeys(db);
    expect(first.shasNormalized).toBe(2);
    expect(first.keysRewritten).toBe(2);
    expect(first.claimsRewritten).toBe(1);
    const after = { shas: listSourceShas(db), claims: listAllClaims(db) };
    expect(after.shas).toEqual({
      [`commit:${HEX}`]: HEX,
      [`commit:${SHA_B}`]: SHA_B,
    });

    const second = normalizeCommitKeys(db);
    expect(second.shasNormalized).toBe(0);
    expect(listSourceShas(db)).toEqual(after.shas);
    expect(listAllClaims(db)).toEqual(after.claims);
  });
});
