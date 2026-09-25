import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { describe, expect, it } from "vitest";

import { commitReachability, parseGitLog } from "./git-extractor.js";

describe("parseGitLog", () => {
  it("parses a single commit with one file", () => {
    const stdout =
      "a1b2c3d\x1f2026-04-12T14:02:11+00:00\x1falice@example.com\x1ffix: retry on conflict\nsrc/a.ts";
    const commits = parseGitLog(stdout);
    expect(commits).toHaveLength(1);
    const c = commits[0]!;
    expect(c.sha).toBe("a1b2c3d");
    expect(c.date).toBe("2026-04-12T14:02:11+00:00");
    expect(c.authorEmail).toBe("alice@example.com");
    expect(c.message).toBe("fix: retry on conflict");
    expect(c.files).toEqual(["src/a.ts"]);
  });

  it("parses multiple commits separated by blank lines", () => {
    const stdout = [
      "sha1\x1f2026-04-12T14:00:00+00:00\x1fa@x.com\x1fmsg1",
      "src/a.ts",
      "src/b.ts",
      "",
      "sha2\x1f2026-04-11T10:00:00+00:00\x1fb@y.com\x1fmsg2",
      "src/c.ts",
    ].join("\n");
    const commits = parseGitLog(stdout);
    expect(commits).toHaveLength(2);
    expect(commits[0]?.sha).toBe("sha1");
    expect(commits[0]?.files).toEqual(["src/a.ts", "src/b.ts"]);
    expect(commits[1]?.sha).toBe("sha2");
    expect(commits[1]?.files).toEqual(["src/c.ts"]);
  });

  it("sorts files ascending within a commit", () => {
    const stdout = [
      "sha\x1f2026-04-01T00:00:00+00:00\x1fa@x.com\x1fmsg",
      "z.ts",
      "a.ts",
      "m.ts",
    ].join("\n");
    const commits = parseGitLog(stdout);
    expect(commits[0]?.files).toEqual(["a.ts", "m.ts", "z.ts"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseGitLog("")).toEqual([]);
  });

  it("tolerates CRLF line endings (Windows git)", () => {
    const stdout =
      "sha1\x1f2026-04-12T14:00:00+00:00\x1fa@x.com\x1fmsg1\r\nsrc/a.ts\r\n";
    const commits = parseGitLog(stdout);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.files).toEqual(["src/a.ts"]);
  });

  it("handles commits with no files (rare, but possible)", () => {
    const stdout =
      "sha1\x1f2026-04-12T14:00:00+00:00\x1fa@x.com\x1fempty\n" +
      "\nsha2\x1f2026-04-11T14:00:00+00:00\x1fb@x.com\x1fnormal\nfile.ts";
    const commits = parseGitLog(stdout);
    expect(commits).toHaveLength(2);
    expect(commits[0]?.files).toEqual([]);
    expect(commits[1]?.files).toEqual(["file.ts"]);
  });

  it("tolerates a trailing blank line gracefully", () => {
    const stdout =
      "sha\x1f2026-04-12T14:00:00+00:00\x1fa@x.com\x1fmsg\nfile.ts\n\n";
    const commits = parseGitLog(stdout);
    expect(commits).toHaveLength(1);
  });

  it("skips malformed headers rather than throwing", () => {
    // Missing separators entirely — one weird commit should not poison
    // the rest of the batch.
    const stdout =
      "bad-header-line-no-separators\nfile.ts\n\n" +
      "goodsha\x1f2026-04-12T14:00:00+00:00\x1fa@x.com\x1fok\nfile.ts";
    const commits = parseGitLog(stdout);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.sha).toBe("goodsha");
  });

  it("rejoins subjects that contain our unit-separator byte", () => {
    // Pathological: subject itself contains \x1f. parseGitLog rejoins
    // any overflow into the message so sha/date/email are still valid.
    const stdout =
      "sha\x1f2026-04-12T14:00:00+00:00\x1fa@x.com\x1fsubject\x1fwith\x1fseparators\nfile.ts";
    const commits = parseGitLog(stdout);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.message).toBe("subject\x1fwith\x1fseparators");
  });
});

describe("commitReachability (review round 2.2)", () => {
  it("tells a commit HEAD reaches from one on another branch and from one git does not know", async () => {
    const root = mkdtempSync(pathJoin(tmpdir(), "ca-reach-"));
    const git = (...args: string[]): string => {
      const r = spawnSync(
        "git",
        ["-c", "user.email=t@example.com", "-c", "user.name=T", "-c", "commit.gpgsign=false", ...args],
        { cwd: root, encoding: "utf8" },
      );
      if (r.status !== 0) throw new Error(r.stderr);
      return r.stdout.trim();
    };
    try {
      git("init", "-q");
      git("commit", "-q", "--allow-empty", "-m", "base");
      const base = git("rev-parse", "HEAD");
      const main = git("rev-parse", "--abbrev-ref", "HEAD");
      git("checkout", "-q", "-b", "other");
      git("commit", "-q", "--allow-empty", "-m", "other only");
      const other = git("rev-parse", "HEAD");
      git("checkout", "-q", main);

      expect(commitReachability(root, base)).toBe("reachable");
      expect(commitReachability(root, other)).toBe("unreachable");
      expect(commitReachability(root, "f".repeat(40))).toBe("unknown");
      expect(commitReachability(root, base, pathJoin(root, "no-such-git"))).toBe("unknown");
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});
