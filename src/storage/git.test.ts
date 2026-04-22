import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GitCommit } from "../extraction/git-extractor.js";

import { type DatabaseInstance, openDatabase } from "./db.js";
import {
  clearGitCommits,
  countCommitsForFile,
  findCoChangeFiles,
  listAllGitCommits,
  listCommitsForFile,
  replaceGitCommits,
} from "./git.js";

function commit(
  sha: string,
  date: string,
  files: string[],
  message = "msg",
  author = "alice@example.com",
): GitCommit {
  return { sha, date, message, authorEmail: author, files };
}

describe("git storage", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => db.close());

  it("replaceGitCommits is atomic and idempotent", () => {
    replaceGitCommits(db, [
      commit("a", "2026-04-01T00:00:00Z", ["src/x.ts"]),
      commit("b", "2026-04-02T00:00:00Z", ["src/y.ts"]),
    ]);
    replaceGitCommits(db, [
      commit("c", "2026-04-03T00:00:00Z", ["src/z.ts"]),
    ]);
    const all = listAllGitCommits(db);
    expect(all.map((c) => c.sha)).toEqual(["c"]);
  });

  it("listAllGitCommits returns newest-first with files reconstructed", () => {
    replaceGitCommits(db, [
      commit("a", "2026-04-01T00:00:00Z", ["src/x.ts", "src/y.ts"]),
      commit("b", "2026-04-03T00:00:00Z", ["src/z.ts"]),
      commit("c", "2026-04-02T00:00:00Z", ["src/x.ts"]),
    ]);
    const all = listAllGitCommits(db);
    expect(all.map((c) => c.sha)).toEqual(["b", "c", "a"]);
    expect(all[2]?.files).toEqual(["src/x.ts", "src/y.ts"]);
  });

  it("files come back sorted ascending for round-trip determinism", () => {
    // Even if we insert unsorted, list should sort on read — important
    // for byte-identical atlas round-trip.
    replaceGitCommits(db, [
      commit("a", "2026-04-01T00:00:00Z", ["z.ts", "a.ts", "m.ts"]),
    ]);
    expect(listAllGitCommits(db)[0]?.files).toEqual(["a.ts", "m.ts", "z.ts"]);
  });

  it("listCommitsForFile filters by path and respects limit", () => {
    replaceGitCommits(db, [
      commit("a", "2026-04-01T00:00:00Z", ["src/x.ts"]),
      commit("b", "2026-04-02T00:00:00Z", ["src/y.ts"]),
      commit("c", "2026-04-03T00:00:00Z", ["src/x.ts"]),
      commit("d", "2026-04-04T00:00:00Z", ["src/x.ts"]),
    ]);
    const recent = listCommitsForFile(db, "src/x.ts", 2);
    expect(recent.map((c) => c.sha)).toEqual(["d", "c"]);
  });

  it("countCommitsForFile returns the correct distinct count", () => {
    replaceGitCommits(db, [
      commit("a", "2026-04-01T00:00:00Z", ["src/x.ts"]),
      commit("b", "2026-04-02T00:00:00Z", ["src/y.ts"]),
      commit("c", "2026-04-03T00:00:00Z", ["src/x.ts"]),
    ]);
    expect(countCommitsForFile(db, "src/x.ts")).toBe(2);
    expect(countCommitsForFile(db, "src/y.ts")).toBe(1);
    expect(countCommitsForFile(db, "nonexistent.ts")).toBe(0);
  });

  it("findCoChangeFiles ranks co-occurring files descending", () => {
    // x.ts and y.ts co-change 3 times; x.ts and z.ts co-change 1 time.
    replaceGitCommits(db, [
      commit("a", "2026-04-01T00:00:00Z", ["x.ts", "y.ts"]),
      commit("b", "2026-04-02T00:00:00Z", ["x.ts", "y.ts"]),
      commit("c", "2026-04-03T00:00:00Z", ["x.ts", "y.ts", "z.ts"]),
      commit("d", "2026-04-04T00:00:00Z", ["only-y.ts", "y.ts"]),
    ]);
    const cc = findCoChangeFiles(db, "x.ts", 10);
    // y.ts appears in all three of x.ts's commits.
    // z.ts appears in one (the third).
    expect(cc.map((r) => r.filePath)).toEqual(["y.ts", "z.ts"]);
    expect(cc[0]?.coCommitCount).toBe(3);
    expect(cc[1]?.coCommitCount).toBe(1);
  });

  it("findCoChangeFiles excludes the query file from its own result", () => {
    replaceGitCommits(db, [
      commit("a", "2026-04-01T00:00:00Z", ["x.ts", "y.ts"]),
    ]);
    const cc = findCoChangeFiles(db, "x.ts", 10);
    expect(cc.find((r) => r.filePath === "x.ts")).toBeUndefined();
  });

  it("findCoChangeFiles ties broken alphabetically", () => {
    replaceGitCommits(db, [
      commit("a", "2026-04-01T00:00:00Z", ["x.ts", "beta.ts", "alpha.ts"]),
    ]);
    const cc = findCoChangeFiles(db, "x.ts", 10);
    expect(cc.map((r) => r.filePath)).toEqual(["alpha.ts", "beta.ts"]);
  });

  it("clearGitCommits drops every row in both tables", () => {
    replaceGitCommits(db, [
      commit("a", "2026-04-01T00:00:00Z", ["x.ts", "y.ts"]),
    ]);
    clearGitCommits(db);
    expect(listAllGitCommits(db)).toEqual([]);
    expect(countCommitsForFile(db, "x.ts")).toBe(0);
  });
});
