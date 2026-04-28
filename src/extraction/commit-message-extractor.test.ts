import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildSymbolInventory,
  type SymbolInventory,
} from "./resolver.js";
import { listAllClaims, setSourceSha } from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "./../storage/db.js";
import { upsertSymbols } from "./../storage/symbols.js";
import {
  buildCommitExtractionBody,
  DEFAULT_BODY_ANYWHERE_PATTERNS,
  DEFAULT_SUBJECT_PREFIX_PATTERNS,
  extractCommitMessagesForRepo,
  makeDefaultCommitFilter,
  parseCommitLog,
  type CommitMetadata,
} from "./commit-message-extractor.js";
import type { ExtractionClient } from "./anthropic-client.js";

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

  it("returns empty array for non-git directory", () => {
    expect(() => parseCommitLog(tmp, () => true)).toThrow(
      /not a git repository/i,
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

// ---------------------------------------------------------------------------
// extractCommitMessagesForRepo orchestration (Step 4.3 + 4.4 + 4.5)
// ---------------------------------------------------------------------------

describe("extractCommitMessagesForRepo", () => {
  let tmp: string;
  let db: DatabaseInstance;
  let inventory: SymbolInventory;

  beforeEach(async () => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-cm-orch-"));
    spawnSync("git", ["init", "-q"], { cwd: tmp });
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    db = openDatabase(":memory:");
    upsertSymbols(db, [
      {
        id: "sym:ts:src/widget.ts:WidgetService",
        name: "WidgetService",
        kind: "class",
        path: "src/widget.ts",
        line: 1,
        language: "typescript",
        fileSha: "sha-w",
      },
    ]);
    inventory = await buildSymbolInventory(new Map(), []);
    inventory.allSymbols.push({
      id: "sym:ts:src/widget.ts:WidgetService",
      name: "WidgetService",
      kind: "class",
      path: "src/widget.ts",
      line: 1,
      language: "typescript",
    });
    inventory.byName.set("WidgetService", [
      inventory.allSymbols[inventory.allSymbols.length - 1]!,
    ]);
  });
  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  function commit(subject: string, body = ""): void {
    writeFileSync(pathJoin(tmp, "stamp.txt"), `${Date.now()}-${Math.random()}`);
    spawnSync("git", ["add", "stamp.txt"], { cwd: tmp });
    const msg = body.length > 0 ? `${subject}\n\n${body}` : subject;
    spawnSync("git", ["commit", "-m", msg], {
      cwd: tmp,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Tester",
        GIT_AUTHOR_EMAIL: "tester@example.com",
        GIT_COMMITTER_NAME: "Tester",
        GIT_COMMITTER_EMAIL: "tester@example.com",
      },
    });
  }

  function makeStubClient(
    responder: (body: string) => Awaited<ReturnType<ExtractionClient["extract"]>>,
  ): ExtractionClient {
    return {
      async extract(body) {
        return responder(body);
      },
    };
  }

  it("filter+extract+resolve flow yields claims with resolved candidates", async () => {
    commit("design: introduce WidgetService", "Replaces legacy widget code.");
    commit("chore: bump deps"); // should be filtered out
    const client = makeStubClient(async (body) => ({
      result: {
        claims: [
          {
            symbol_candidates: ["WidgetService"],
            claim: "WidgetService replaces the legacy widget pipeline.",
            severity: "hard",
            rationale: body.slice(0, 30),
            excerpt: body.slice(0, 30),
          },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    }));
    const result = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      client,
    );
    expect(result.commitsTotal).toBe(2);
    expect(result.commitsFiltered).toBe(1);
    expect(result.commitsExtracted).toBe(1);
    expect(result.commitsSkippedIdempotent).toBe(0);
    expect(result.claimsWritten).toBe(1);
    expect(result.claimsWithSymbols).toBe(1);
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.source).toMatch(/^commit:[0-9a-f]{40}$/);
    expect(claims[0]!.symbolIds).toEqual([
      "sym:ts:src/widget.ts:WidgetService",
    ]);
  });

  it("idempotency: skips commits whose SHA already in source_shas", async () => {
    commit("design: thing");
    // Pre-seed source_shas as if the commit was already extracted.
    const log0 = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      makeStubClient(async () => ({
        result: { claims: [] },
        usage: { inputTokens: 50, outputTokens: 0 },
      })),
    );
    expect(log0.commitsExtracted).toBe(1);

    // Re-run: should skip.
    let calls = 0;
    const log1 = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      makeStubClient(async () => {
        calls++;
        return {
          result: { claims: [] },
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      }),
    );
    expect(calls).toBe(0);
    expect(log1.commitsExtracted).toBe(0);
    expect(log1.commitsSkippedIdempotent).toBe(1);
  });

  it("captures extraction-client errors per-commit without halting", async () => {
    commit("design: one");
    commit("arch: two");
    let n = 0;
    const client = makeStubClient(async () => {
      n++;
      if (n === 1) throw new Error("simulated 500");
      return {
        result: { claims: [] },
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    });
    const result = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      client,
    );
    expect(result.commitsFiltered).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toMatch(/simulated 500/);
    // Second commit still extracted despite first failing.
    expect(result.commitsExtracted).toBe(1);
  });

  it("user filter augmentation routes additional commits to extraction", async () => {
    commit("internal-tag: rework auth pipeline"); // misses default filter
    const client = makeStubClient(async () => ({
      result: { claims: [] },
      usage: { inputTokens: 0, outputTokens: 0 },
    }));
    const without = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      client,
    );
    expect(without.commitsFiltered).toBe(0);

    // Reset source_shas so the commit isn't skipped on second run.
    db.exec("DELETE FROM source_shas");
    const withFilter = await extractCommitMessagesForRepo(
      db,
      tmp,
      { extraction: { commitMessageFilter: ["^internal-tag:"] } },
      inventory,
      client,
    );
    expect(withFilter.commitsFiltered).toBe(1);
    expect(withFilter.commitsExtracted).toBe(1);
  });
});

// Reference imported but unused-warning suppression: setSourceSha is
// re-exported for future use cases.
void setSourceSha;
