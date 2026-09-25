import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildCommitExtractionBody,
  DEFAULT_BODY_ANYWHERE_PATTERNS,
  DEFAULT_SUBJECT_PREFIX_PATTERNS,
  makeDefaultCommitFilter,
  parseCommitLog,
  type CommitMetadata,
} from "./commit-log.js";
import * as extractorModule from "./commit-message-extractor.js";

// ---------------------------------------------------------------------------
// Filter regex (Step 4.1)
// ---------------------------------------------------------------------------

describe("DEFAULT_SUBJECT_PREFIX_PATTERNS", () => {
  it("matches conventional architectural-intent subjects", () => {
    const f = makeDefaultCommitFilter();
    const cases: ReadonlyArray<readonly [string, boolean]> = [
      ["design: switch from REST to gRPC", true],
      ["arch: extract user service", true],
      ["arch(api): scope-stripped variant", true],
      ["architecture: top-level decision record", true],
      ["ADR-12: introduce event-sourcing layer", true],
      ["adr-7: write claim for thing", true],
      ["breaking: drop Node 18 support", true],
      ["breaking(api): rename core types", true],
      ["deprecate FooClass; use BarClass", true],
      ["deprecates: legacy auth flow", true],
      ["refactor: split User into Account+Profile", true],
      ["refactor(core): inline validators", true],
    ];
    for (const [subject, expected] of cases) {
      expect(f(subject, "")).toBe(expected);
    }
  });

  it("rejects false positives where keyword appears mid-subject", () => {
    const f = makeDefaultCommitFilter();
    const negatives = [
      "Fixed design bug in user form",
      "Implement design for new dashboard",
      "Tests refactor module behaviors",
      "feat: new endpoint for foo",
      "fix: correct off-by-one",
      "chore: upgrade vitest",
      "Add deprecation note to README", // body word, not subject prefix
    ];
    for (const subject of negatives) {
      expect(f(subject, "")).toBe(false);
    }
  });

  it("matches BREAKING CHANGE: footer in body (not subject prefix)", () => {
    const f = makeDefaultCommitFilter();
    const subject = "feat: rename top-level config field";
    const body =
      "Renames `config.foo` to `config.bar` across the project.\n\n" +
      "BREAKING CHANGE: existing config files must be migrated.\n";
    expect(f(subject, body)).toBe(true);
  });

  it("body-anywhere regex catches BREAKING CHANGE: anywhere in body", () => {
    // Confirms Q3 lock — first-200-char prefix would miss many real
    // conventional-commits BREAKING CHANGE: footers.
    const padding = "x".repeat(500);
    const body = padding + "\nBREAKING CHANGE: see migration notes.\n";
    expect(DEFAULT_BODY_ANYWHERE_PATTERNS[0]!.test(body)).toBe(true);
  });
});

describe("user-augmented patterns", () => {
  it("user pattern adds to defaults; default patterns still match", () => {
    const f = makeDefaultCommitFilter(["^myteam-design/"]);
    expect(f("myteam-design/foo: ...", "")).toBe(true);
    expect(f("design: ...", "")).toBe(true); // default still works
  });

  it("user pattern is tested against subject + body[:200] surface", () => {
    const f = makeDefaultCommitFilter(["proposal-id-\\d+"]);
    expect(f("feat: foo", "Reference: proposal-id-42 inline.")).toBe(true);
  });

  it("user pattern is case-insensitive (regex 'i' flag)", () => {
    const f = makeDefaultCommitFilter(["TEAMTAG"]);
    expect(f("feat: teamtag in subject", "")).toBe(true);
  });
});

describe("default exports surface", () => {
  it("DEFAULT_SUBJECT_PREFIX_PATTERNS is non-empty", () => {
    expect(DEFAULT_SUBJECT_PREFIX_PATTERNS.length).toBeGreaterThan(0);
  });

  it("DEFAULT_BODY_ANYWHERE_PATTERNS contains BREAKING CHANGE", () => {
    expect(DEFAULT_BODY_ANYWHERE_PATTERNS.length).toBeGreaterThan(0);
  });
});

describe("buildCommitExtractionBody", () => {
  const meta = (subject: string, body: string): CommitMetadata => ({
    sha: "abc",
    date: "2026-04-28T00:00:00Z",
    author: "Tester",
    subject,
    body,
  });

  it("concatenates subject + body with blank-line separator", () => {
    const out = buildCommitExtractionBody(
      meta("design: switch to gRPC", "Replaces REST endpoints with proto."),
    );
    expect(out).toBe("design: switch to gRPC\n\nReplaces REST endpoints with proto.");
  });

  it("returns subject only when body is empty / whitespace", () => {
    expect(buildCommitExtractionBody(meta("subject only", ""))).toBe("subject only");
    expect(buildCommitExtractionBody(meta("subject only", "   \n  "))).toBe(
      "subject only",
    );
  });
});

// ---------------------------------------------------------------------------
// parseCommitLog (Step 4.2) — integration with a real `git log`.
// ---------------------------------------------------------------------------

describe("parseCommitLog", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-cm-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function runGit(args: readonly string[]): void {
    const r = spawnSync("git", args as string[], { cwd: tmp, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  }

  function commit(subject: string, body = ""): void {
    writeFileSync(pathJoin(tmp, "stamp.txt"), `${Date.now()}-${Math.random()}`);
    runGit(["add", "stamp.txt"]);
    const msg = body.length > 0 ? `${subject}\n\n${body}` : subject;
    const r = spawnSync("git", ["commit", "-m", msg], {
      cwd: tmp,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Tester",
        GIT_AUTHOR_EMAIL: "tester@example.com",
        GIT_COMMITTER_NAME: "Tester",
        GIT_COMMITTER_EMAIL: "tester@example.com",
      },
    });
    if (r.status !== 0) throw new Error(`git commit: ${r.stderr}`);
  }

  it("throws an actionable error for a non-git directory", () => {
    // The standalone parser fails loud; `list-extraction-sources`
    // catches it, and the CLI pipeline gates on the git signal first.
    expect(() => parseCommitLog(tmp, () => true)).toThrow(
      /not a git repository/i,
    );
  });

  it("runs the configured gitBinary instead of `git` on PATH", () => {
    runGit(["init", "-q"]);
    commit("design: one");
    expect(parseCommitLog(tmp, () => true)).toHaveLength(1);
    const fake = pathJoin(tmp, "no-such-git-binary");
    expect(() => parseCommitLog(tmp, () => true, { gitBinary: fake })).toThrow(
      /no-such-git-binary/,
    );
  });

  it("parses commits with subject + multi-line body via NUL/RS separators", () => {
    runGit(["init", "-q"]);
    commit("design: introduce widget service");
    commit(
      "arch(api): split user service",
      "Body line 1\nBody line 2 with\ttabs.\n\nBREAKING CHANGE: yes.",
    );
    commit("chore: bump deps"); // should NOT match default filter
    const f = makeDefaultCommitFilter();
    const out = parseCommitLog(tmp, f);
    expect(out.length).toBe(2);
    // Order is `git log` chronological newest-first.
    const subjects = out.map((c) => c.subject).sort();
    expect(subjects).toEqual([
      "arch(api): split user service",
      "design: introduce widget service",
    ]);
    const archCommit = out.find((c) => c.subject.startsWith("arch"))!;
    expect(archCommit.body).toContain("Body line 1");
    expect(archCommit.body).toContain("BREAKING CHANGE: yes.");
    expect(archCommit.author).toBe("Tester");
    expect(archCommit.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(archCommit.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("filter set to () => true returns every commit unmodified", () => {
    runGit(["init", "-q"]);
    commit("subject one");
    commit("subject two");
    const out = parseCommitLog(tmp, () => true);
    expect(out.length).toBe(2);
  });

  it("filter set to () => false returns empty array", () => {
    runGit(["init", "-q"]);
    commit("design: yes");
    expect(parseCommitLog(tmp, () => false)).toEqual([]);
  });
});

describe("commit-message-extractor re-exports (external import surface)", () => {
  it("re-exports the collection API from commit-log.ts unchanged", () => {
    // The benchmarks driver and older scripts import these names from
    // commit-message-extractor.js; the v1.2 split must not break them.
    expect(extractorModule.parseCommitLog).toBe(parseCommitLog);
    expect(extractorModule.makeDefaultCommitFilter).toBe(makeDefaultCommitFilter);
    expect(extractorModule.buildCommitExtractionBody).toBe(
      buildCommitExtractionBody,
    );
    expect(extractorModule.DEFAULT_SUBJECT_PREFIX_PATTERNS).toBe(
      DEFAULT_SUBJECT_PREFIX_PATTERNS,
    );
    expect(extractorModule.DEFAULT_BODY_ANYWHERE_PATTERNS).toBe(
      DEFAULT_BODY_ANYWHERE_PATTERNS,
    );
  });
});
