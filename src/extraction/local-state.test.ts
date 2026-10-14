import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RUN_LOG_MAX_LINES,
  appendRunLog,
  ensureCacheIgnored,
  localStateDir,
  pendingQueuePath,
  readPendingQueue,
  runLogPath,
  writePendingQueue,
  type PendingUnit,
  type RunLogEntry,
} from "./local-state.js";

describe("local state (v1.2 Phase 3)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(pathJoin(tmpdir(), "ca-local-state-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const unit = (key: string, stream: PendingUnit["stream"], sha = "s"): PendingUnit => ({
    key,
    stream,
    reason: "changed",
    sha,
  });

  it("writes the queue ordered by stream then key, and creates the self-ignoring directory", () => {
    writePendingQueue(
      root,
      [unit("commit:b", "commit"), unit("src/z.ts", "docstring"), unit("docs/adr/x.md", "adr"), unit("src/a.ts", "docstring")],
      new Date("2026-10-14T00:00:00Z"),
    );
    expect(readPendingQueue(root).map((e) => e.key)).toEqual([
      "docs/adr/x.md",
      "src/a.ts",
      "src/z.ts",
      "commit:b",
    ]);
    expect(readFileSync(pathJoin(localStateDir(root), ".gitignore"), "utf8")).toMatch(/^\*$/m);
    expect(existsSync(`${pendingQueuePath(root)}.tmp`)).toBe(false);
  });

  it("replaces the queue on each write, keeping first_seen for keys still pending", () => {
    writePendingQueue(root, [unit("a", "adr", "1"), unit("b", "adr")], new Date("2026-10-01T00:00:00Z"));
    writePendingQueue(root, [unit("a", "adr", "2"), unit("c", "adr")], new Date("2026-10-02T00:00:00Z"));
    const entries = readPendingQueue(root);
    expect(entries.map((e) => [e.key, e.sha, e.first_seen, e.last_seen])).toEqual([
      ["a", "2", "2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z"],
      ["c", "s", "2026-10-02T00:00:00.000Z", "2026-10-02T00:00:00.000Z"],
    ]);
    writePendingQueue(root, []);
    expect(readPendingQueue(root)).toEqual([]);
  });

  it("treats a missing or damaged queue file as empty", () => {
    expect(readPendingQueue(root)).toEqual([]);
    mkdirSync(localStateDir(root), { recursive: true });
    writeFileSync(pendingQueuePath(root), "{ not json");
    expect(readPendingQueue(root)).toEqual([]);
    writePendingQueue(root, [unit("a", "adr")]);
    expect(readPendingQueue(root)).toHaveLength(1);
  });

  it("appends run-log lines, keeping the newest RUN_LOG_MAX_LINES", () => {
    const entry = (n: number): RunLogEntry => ({
      at: `run-${n}`,
      mode: "structural",
      exit_code: 0,
      wall_clock_ms: 1,
      api_calls: 0,
      cost_usd: 0,
      atlas_exported: false,
      pending_sources: 0,
      symbols_pruned: 0,
      extracted_at_sha: null,
    });
    for (let n = 0; n < RUN_LOG_MAX_LINES + 3; n++) appendRunLog(root, entry(n));
    const lines = readFileSync(runLogPath(root), "utf8").trim().split("\n");
    expect(lines).toHaveLength(RUN_LOG_MAX_LINES);
    expect(JSON.parse(lines[0]!).at).toBe("run-3");
    expect(JSON.parse(lines.at(-1)!).at).toBe(`run-${RUN_LOG_MAX_LINES + 2}`);
  });
});

describe("ensureCacheIgnored (v1.2 Phase 9)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(pathJoin(tmpdir(), "ca-cache-ignore-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const ignorePath = () => pathJoin(root, ".contextatlas", ".gitignore");

  it("creates .contextatlas/.gitignore for the cache and its side files, once", () => {
    expect(ensureCacheIgnored(root, ".contextatlas/index.db")).toBe(true);
    const text = readFileSync(ignorePath(), "utf8");
    expect(text.split("\n").filter((l) => !l.startsWith("#"))).toEqual(["index.db", "index.db-*", ""]);
    expect(text).not.toContain("atlas.json");
    expect(ensureCacheIgnored(root, ".contextatlas/index.db")).toBe(false);
    expect(readFileSync(ignorePath(), "utf8")).toBe(text);
  });

  it("appends to an existing file without a trailing newline, and adds only what is missing", () => {
    mkdirSync(pathJoin(root, ".contextatlas"), { recursive: true });
    writeFileSync(ignorePath(), "custom\r\nindex.db");
    expect(ensureCacheIgnored(root, "./.contextatlas/index.db")).toBe(true);
    expect(readFileSync(ignorePath(), "utf8")).toBe("custom\r\nindex.db\nindex.db-*\n");
  });

  it("leaves a cache outside .contextatlas/ alone", () => {
    expect(ensureCacheIgnored(root, "cache/index.db")).toBe(false);
    expect(ensureCacheIgnored(root, ".contextatlas/sub/index.db")).toBe(false);
    expect(existsSync(ignorePath())).toBe(false);
  });
});
