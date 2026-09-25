import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setSourceSha } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import type {
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
  SymbolId,
} from "../types.js";

import {
  planCommitWork,
  planDocstringWork,
  plannedCallCount,
  staleDocstringKeys,
  type ExtractionPlan,
} from "./extraction-plan.js";
import type { SourceFile } from "./file-walker.js";
import type { SymbolInventoryWithCoverage } from "./resolver.js";

function sym(path: string, name: string): AtlasSymbol {
  return { id: `sym:ts:${path}:${name}`, name, kind: "function", path, line: 1, language: "typescript" };
}

function adapter(docs: Record<SymbolId, string | Error>): LanguageAdapter & { reads: SymbolId[] } {
  const reads: SymbolId[] = [];
  return {
    reads,
    language: "typescript",
    extensions: [".ts"],
    async initialize() {},
    async shutdown() {},
    async listSymbols() {
      return [];
    },
    async getSymbolDetails() {
      return null;
    },
    async findReferences() {
      return [];
    },
    async getDiagnostics() {
      return [];
    },
    async getTypeInfo() {
      return { extends: [], implements: [], usedByTypes: [] };
    },
    async getDocstring(id: SymbolId) {
      reads.push(id);
      const d = docs[id];
      if (d instanceof Error) throw d;
      return d ?? null;
    },
  };
}

function inventory(symbols: AtlasSymbol[], failed: string[] = []): SymbolInventoryWithCoverage {
  const byName = new Map<string, AtlasSymbol[]>();
  for (const s of symbols) byName.set(s.name, [...(byName.get(s.name) ?? []), s]);
  return {
    byName,
    allSymbols: symbols,
    listedPaths: new Set(symbols.map((s) => s.path)),
    failedPaths: new Set(failed),
  };
}

const file = (relPath: string, sha: string): SourceFile => ({
  relPath,
  absPath: `/repo/${relPath}`,
  sha,
});

describe("planDocstringWork", () => {
  const A = sym("src/a.ts", "A");
  const B = sym("src/b.ts", "B");
  const C = sym("src/c.ts", "C");

  it("plans changed and added files, counts unchanged ones, skips files whose listing failed, and reads docstrings only for planned files", async () => {
    const ad = adapter({ [A.id]: "doc A", [B.id]: "doc B", [C.id]: "doc C" });
    const plan = await planDocstringWork({
      sourceFiles: [file("src/a.ts", "a2"), file("src/b.ts", "b1"), file("src/c.ts", "c1"), file("src/d.ts", "d1")],
      inventory: inventory([A, B, C], ["src/d.ts"]),
      adapters: new Map<LanguageCode, LanguageAdapter>([["typescript", ad]]),
      baseline: { "src/a.ts": "a1", "src/b.ts": "b1", "src/d.ts": "d0" },
      full: false,
    });
    expect(plan.files.map((f) => f.relPath)).toEqual(["src/a.ts", "src/c.ts"]);
    expect(plan.filesUnchanged).toBe(1);
    expect(plan.calls).toBe(2);
    expect(ad.reads.sort()).toEqual([A.id, C.id]);
    expect(plan.files[0]!.docstrings.entries).toEqual([{ symbolId: A.id, docstring: "doc A" }]);
    expect(plan.files[0]!.sha).toBe("a2");
  });

  it("--full plans every listed file regardless of the baseline", async () => {
    const plan = await planDocstringWork({
      sourceFiles: [file("src/a.ts", "a1"), file("src/b.ts", "b1")],
      inventory: inventory([A, B]),
      adapters: new Map<LanguageCode, LanguageAdapter>([["typescript", adapter({ [A.id]: "doc A" })]]),
      baseline: { "src/a.ts": "a1", "src/b.ts": "b1" },
      full: true,
    });
    expect(plan.files.map((f) => f.relPath)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(plan.filesUnchanged).toBe(0);
    expect(plan.calls).toBe(1); // B has no docstring
  });

  it("does not count calls for a file whose docstring read failed (it will make none)", async () => {
    const plan = await planDocstringWork({
      sourceFiles: [file("src/a.ts", "a1")],
      inventory: inventory([A, sym("src/a.ts", "A2")]),
      adapters: new Map<LanguageCode, LanguageAdapter>([
        ["typescript", adapter({ [A.id]: "doc A", "sym:ts:src/a.ts:A2": new Error("hover timeout") })],
      ]),
      baseline: {},
      full: false,
    });
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]!.docstrings.errors).toHaveLength(1);
    expect(plan.calls).toBe(0);
  });

  it("skips a source file that is also a prose file (shared source_shas key)", async () => {
    const plan = await planDocstringWork({
      sourceFiles: [file("src/a.ts", "a1")],
      inventory: inventory([A]),
      adapters: new Map<LanguageCode, LanguageAdapter>([["typescript", adapter({ [A.id]: "doc A" })]]),
      baseline: {},
      full: false,
      prosePaths: new Set(["src/a.ts"]),
    });
    expect(plan.files).toEqual([]);
    expect(plan.calls).toBe(0);
  });
});

describe("staleDocstringKeys (Stage 5, L-11)", () => {
  const exists = new Set(["src/kept.ts", "src/excluded.ts", "pkg/mod.py"]);
  const input = {
    fileExists: (rel: string) => exists.has(rel),
    walkedPaths: new Set(["src/kept.ts"]),
    configuredExtensions: new Set([".ts"]),
  };
  const baseline = {
    "src/kept.ts": "1",
    "src/gone.ts": "2",
    "src/excluded.ts": "3",
    "pkg/mod.py": "4",
  };

  it("drops gone files always, and unwalked files a configured adapter owns only when the stream runs", () => {
    expect(staleDocstringKeys(baseline, { ...input, includeUnwalked: true })).toEqual([
      "src/excluded.ts",
      "src/gone.ts",
    ]);
    expect(staleDocstringKeys(baseline, { ...input, includeUnwalked: false })).toEqual(["src/gone.ts"]);
  });
});

describe("planCommitWork", () => {
  let tmp: string;
  let db: DatabaseInstance;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-plan-commit-"));
    db = openDatabase(":memory:");
  });
  afterEach(async () => {
    db.close();
    await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const git = (args: string[]): string => {
    const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
      cwd: tmp,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "T",
        GIT_AUTHOR_EMAIL: "t@example.com",
        GIT_COMMITTER_NAME: "T",
        GIT_COMMITTER_EMAIL: "t@example.com",
      },
    });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };

  it("is skipped without running git when the git signal found no HEAD", () => {
    const plan = planCommitWork({ db, repoRoot: tmp, headSha: null });
    expect(plan.status).toBe("skipped");
  });

  it("plans filter-passing commits minus the ones already keyed in either form; honours user filter patterns", () => {
    git(["init", "-q"]);
    const subjects = ["design: one", "chore: two", "refactor: three", "note: ARCH-42 decision"];
    const shas: string[] = [];
    for (const s of subjects) {
      git(["commit", "-q", "--allow-empty", "-m", s]);
      shas.push(git(["rev-parse", "HEAD"]));
    }
    setSourceSha(db, `commit:${shas[0]}`, shas[0]!);
    setSourceSha(db, shas[2]!, shas[2]!); // legacy bare form
    const plan = planCommitWork({
      db,
      repoRoot: tmp,
      headSha: shas[3]!,
      commitMessageFilter: ["ARCH-\\d+"],
    });
    expect(plan.status).toBe("planned");
    if (plan.status !== "planned") return;
    expect(plan.filtered).toBe(3);
    expect(plan.skippedIdempotent).toBe(2);
    expect(plan.pending.map((c) => c.sha)).toEqual([shas[3]]);
  });

  it("is skipped (never throws) when git log fails", () => {
    const plan = planCommitWork({
      db,
      repoRoot: tmp,
      headSha: "f".repeat(40),
      gitBinary: pathJoin(tmp, "no-such-git"),
    });
    expect(plan.status).toBe("skipped");
    if (plan.status === "skipped") expect(plan.reason).toMatch(/git/);
  });
});

describe("plannedCallCount", () => {
  it("sums prose files, docstring calls and pending commits", () => {
    const plan: ExtractionPlan = {
      streams: new Set(["adr", "docstring", "commit"]),
      prose: [
        { absPath: "/r/a.md", relPath: "a.md", sha: "1", bucket: "adr", format: "md" },
      ],
      docstring: { files: [], filesUnchanged: 0, calls: 4 },
      commit: { status: "planned", pending: [{ sha: "s", date: "d", author: "a", subject: "x", body: "" }], filtered: 1, skippedIdempotent: 0 },
    };
    expect(plannedCallCount(plan)).toBe(6);
    expect(plannedCallCount({ ...plan, docstring: null, commit: { status: "skipped", reason: "no git" } })).toBe(1);
  });
});
