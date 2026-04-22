import { describe, expect, it } from "vitest";

import { parseGitLog } from "./git-extractor.js";

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
