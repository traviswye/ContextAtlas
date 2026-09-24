import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { insertClaim } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import { LANG_CODES } from "../types.js";

import {
  classifySourceKeyShape,
  classifySourceKeys,
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
