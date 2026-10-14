import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendRunLog, writePendingQueue } from "../../extraction/local-state.js";
import { appendLedger } from "../../refresh/ledger.js";
import { openDatabase } from "../../storage/db.js";
import type { ContextAtlasConfig } from "../../types.js";
import type { CheckContext, DoctorCheck } from "../types.js";

import { atlasChecks } from "./atlas.js";
import { ago, freshnessChecks } from "./freshness.js";
import { shaChecks } from "./sha.js";

/** v1.2 Phase 8: doctor freshness checks, and `atlas.committed: false`. */

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync(
    "git",
    ["-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function config(committed: boolean): ContextAtlasConfig {
  return {
    version: 1,
    languages: ["typescript"],
    adrs: { path: "docs/adr/", format: "markdown-frontmatter" },
    docs: { include: [] },
    atlas: { committed, path: ".contextatlas/atlas.json", localCache: ".contextatlas/index.db" },
    git: { recentCommits: 0 },
    index: { model: "claude-opus-4-7" },
  };
}

const find = (checks: DoctorCheck[], id: string): DoctorCheck => {
  const c = checks.find((x) => x.id === id);
  if (c === undefined) throw new Error(`no check ${id}: ${checks.map((x) => x.id).join(", ")}`);
  return c;
};

describe("freshnessChecks (v1.2 Phase 8)", () => {
  let root: string;
  let first: string;
  let head: string;
  let otherBranch: string;
  const ctx = (committed: boolean): CheckContext => ({
    repoRoot: root,
    config: config(committed),
    configPath: path.join(root, ".contextatlas.yml"),
    configError: null,
  });

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "ca-freshness-"));
    mkdirSync(path.join(root, "docs", "adr"), { recursive: true });
    mkdirSync(path.join(root, ".contextatlas"), { recursive: true });
    writeFileSync(path.join(root, "docs", "adr", "ADR-01-a.md"), "# A\n");
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "first");
    first = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "-q", "-b", "side");
    git(root, "commit", "-q", "--allow-empty", "-m", "side only");
    otherBranch = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "-q", "main");
    git(root, "commit", "-q", "--allow-empty", "-m", "second");
    git(root, "commit", "-q", "--allow-empty", "-m", "third");
    head = git(root, "rev-parse", "HEAD");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  function writeAtlas(): void {
    const claim = (source_path: string, symbol_ids: string[], symbol_candidates?: string[]) => ({
      source: "adr:x",
      source_path,
      source_sha: "s",
      severity: "hard",
      claim: "c",
      symbol_ids,
      ...(symbol_candidates ? { symbol_candidates } : {}),
    });
    writeFileSync(
      path.join(root, ".contextatlas", "atlas.json"),
      JSON.stringify({
        version: "1.4",
        generated_at: "2026-10-14T00:00:00.000Z",
        extracted_at_sha: first,
        generator: { contextatlas_commit_sha: "f".repeat(40) },
        source_shas: {
          "docs/adr/ADR-01-a.md": "s",
          "docs/adr/ADR-09-gone.md": "s",
          [`commit:${first}`]: first,
          [`commit:${otherBranch}`]: otherBranch,
        },
        symbols: [],
        claims: [
          claim("docs/adr/ADR-01-a.md", ["sym:ts:src/a.ts:A"], ["A"]),
          claim("docs/adr/ADR-01-a.md", [], ["Gone"]),
          claim("docs/adr/ADR-01-a.md", [], ["AlsoGone"]),
          claim("docs/adr/ADR-01-a.md", []), // names nothing: not an orphan
        ],
        git_commits: [],
      }),
    );
  }

  it("returns nothing in limited mode", () => {
    expect(freshnessChecks({ ...ctx(true), config: null })).toEqual([]);
  });

  it("reports cache drift, pending sources, orphans, stale and unreachable keys from atlas.json", () => {
    writeAtlas();
    appendRunLog(root, {
      at: "2026-10-14T10:00:00.000Z",
      mode: "structural",
      exit_code: 0,
      wall_clock_ms: 1,
      api_calls: 0,
      cost_usd: 0,
      atlas_exported: false,
      pending_sources: 2,
      symbols_pruned: 0,
      extracted_at_sha: first,
    });
    writePendingQueue(
      root,
      [
        { key: "docs/adr/ADR-01-a.md", stream: "adr", reason: "changed", sha: "x" },
        { key: "src/a.ts", stream: "docstring", reason: "added", sha: "y" },
      ],
      new Date("2026-10-14T09:00:00.000Z"),
    );
    const now = new Date("2026-10-14T12:00:00.000Z");
    const checks = freshnessChecks(ctx(true), now);

    const cache = find(checks, "freshness.local_cache_vs_head");
    expect(cache.status).toBe("warn");
    expect(cache.message).toBe("local cache 2 commits behind HEAD");
    expect(cache.detail).toContain("last structural run 2 h ago, last extracting run never");

    const pending = find(checks, "freshness.pending_sources");
    expect(pending.status).toBe("warn");
    expect(pending.message).toBe("2 sources pending (adr 1, docstring 1); oldest queued 3 h ago");

    const orphans = find(checks, "freshness.orphaned_claims");
    expect(orphans.message).toBe(
      "2 claims in .contextatlas/atlas.json name symbols that do not resolve (1 source)",
    );

    const stale = find(checks, "freshness.stale_source_keys");
    expect(stale.status).toBe("warn");
    expect(stale.detail).toContain("docs/adr/ADR-09-gone.md");
    expect(stale.detail).not.toContain("ADR-01-a.md");

    const commits = find(checks, "freshness.unreachable_commit_keys");
    expect(commits.status).toBe("warn");
    expect(commits.message).toContain("1 of 2 commit keys");
    expect(commits.detail).toContain(otherBranch.slice(0, 12));

    expect(find(checks, "freshness.hooks").message).toBe("no contextatlas git hooks installed");
    expect(find(checks, "freshness.tier1_ledger").message).toContain("no `contextatlas refresh-claims` run");
  });

  it("passes when the cache is at HEAD and nothing is pending; warns on a failed last run", () => {
    appendRunLog(root, {
      at: "2026-10-14T11:55:00.000Z",
      mode: "incremental",
      exit_code: 0,
      wall_clock_ms: 1,
      api_calls: 3,
      cost_usd: 0.1,
      atlas_exported: true,
      pending_sources: 0,
      symbols_pruned: 0,
      extracted_at_sha: head,
    });
    const now = new Date("2026-10-14T12:00:00.000Z");
    let checks = freshnessChecks(ctx(true), now);
    expect(find(checks, "freshness.local_cache_vs_head")).toMatchObject({
      status: "pass",
      message: `local cache at HEAD ${head.slice(0, 12)}`,
    });
    expect(find(checks, "freshness.pending_sources").status).toBe("pass");
    // No atlas.json: the atlas checks report it; no state checks here.
    expect(checks.some((c) => c.id === "freshness.orphaned_claims")).toBe(false);

    appendRunLog(root, {
      at: "2026-10-14T11:58:00.000Z",
      mode: "structural",
      exit_code: 1,
      wall_clock_ms: 1,
      api_calls: 0,
      cost_usd: 0,
      atlas_exported: false,
      pending_sources: 0,
      symbols_pruned: 0,
      extracted_at_sha: head,
    });
    checks = freshnessChecks(ctx(true), now);
    expect(find(checks, "freshness.local_cache_vs_head")).toMatchObject({
      status: "warn",
      message: "last run (structural, 2 min ago) exited 1",
    });
  });

  it("totals the Tier 1 ledger and warns when the last session failed", () => {
    const entry = {
      trigger: "pre-push" as const,
      pending_before: 3,
      selected: 3,
      pending_after: 0,
      permission_denials: 0,
      atlas_restored: false,
      duration_ms: 1,
    };
    appendLedger(root, { ...entry, at: "2026-10-14T10:00:00.000Z", outcome: "refreshed", turns: 9, cost_usd_estimate: 1.5 });
    appendLedger(root, { ...entry, at: "2026-10-14T11:00:00.000Z", outcome: "skipped", reason: "not due", turns: 0, cost_usd_estimate: 0 });
    appendLedger(root, { ...entry, at: "2026-10-14T11:30:00.000Z", outcome: "failed", reason: "boom", turns: 4, cost_usd_estimate: 0.25 });
    const check = find(freshnessChecks(ctx(true), new Date("2026-10-14T12:00:00.000Z")), "freshness.tier1_ledger");
    expect(check.status).toBe("warn");
    expect(check.message).toBe(
      "3 runs (1 refreshed, 0 nothing pending, 1 skipped, 1 failed); 13 turns; $1.75 list-price estimate",
    );
    expect(check.detail).toContain("last pre-push run 30 min ago: failed (boom)");
  });

  it("reads the local cache when atlas.committed is false", () => {
    const db = openDatabase(path.join(root, ".contextatlas", "index.db"));
    db.prepare("INSERT INTO source_shas (source_path, source_sha) VALUES (?, ?)").run("docs/adr/gone.md", "s");
    db.prepare("INSERT INTO source_shas (source_path, source_sha) VALUES (?, ?)").run(`commit:${otherBranch}`, "s");
    db.prepare(
      "INSERT INTO claims (source, source_path, source_sha, severity, claim, symbol_candidates) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("adr:x", "docs/adr/ADR-01-a.md", "s", "hard", "c", JSON.stringify(["Gone"]));
    db.close();

    const checks = freshnessChecks(ctx(false));
    expect(find(checks, "freshness.orphaned_claims").message).toBe(
      "1 claim in .contextatlas/index.db names symbols that do not resolve (1 source)",
    );
    expect(find(checks, "freshness.stale_source_keys").detail).toContain("docs/adr/gone.md");
    expect(find(checks, "freshness.unreachable_commit_keys").message).toContain("1 of 1 commit keys");
  });

  it("atlas.exists checks the local cache, not atlas.json, when atlas.committed is false", () => {
    expect(find(atlasChecks(ctx(false)), "atlas.exists")).toMatchObject({ status: "fail" });
    expect(find(atlasChecks({ ...ctx(false), firstRun: true }), "atlas.exists").status).toBe("warn");
    openDatabase(path.join(root, ".contextatlas", "index.db")).close();
    expect(find(atlasChecks(ctx(false)), "atlas.exists")).toMatchObject({
      status: "pass",
      message: "atlas.committed: false; local cache at .contextatlas/index.db",
    });
    // committed: true keeps the atlas.json requirement.
    expect(find(atlasChecks(ctx(true)), "atlas.exists").status).toBe("fail");
  });

  it("sha.atlas_vs_head compares extracted_at_sha, not the contextatlas build commit", () => {
    writeAtlas();
    const check = find(shaChecks(ctx(true)), "sha.atlas_vs_head");
    expect(check.status).toBe("warn");
    expect(check.message).toBe(`atlas at ${first.slice(0, 12)}; HEAD at ${head.slice(0, 12)}`);
    expect(check.detail).toContain("2 commits ahead of atlas");
  });
});

describe("ago", () => {
  const now = new Date("2026-10-14T12:00:00.000Z");
  it("formats minutes, hours and days", () => {
    expect(ago("2026-10-14T11:59:00.000Z", now)).toBe("1 min ago");
    expect(ago("2026-10-14T09:00:00.000Z", now)).toBe("3 h ago");
    expect(ago("2026-10-10T12:00:00.000Z", now)).toBe("4 d ago");
    expect(ago("not a date", now)).toBe("at an unknown time");
  });
});
