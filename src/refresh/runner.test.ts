import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runIndexSubcommand } from "../extraction/cli-runner.js";
import { readPendingQueue } from "../extraction/local-state.js";

import { checkDue, readLedger, type LedgerEntry } from "./ledger.js";
import { runRefreshClaims } from "./runner.js";

/**
 * A stand-in for `claude -p`: prints stream-json events like the real
 * CLI. FAKE_MODE: success (keys every queued source in atlas.json, as
 * /refresh-atlas would), fail (REFRESH-FAILED after corrupting
 * atlas.json), apikey (init reports an API key), maxturns.
 */
const FAKE_CLAUDE = `
const fs = require("fs");
const mode = process.env.FAKE_MODE || "success";
const emit = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
fs.writeFileSync(".contextatlas/local/fake-argv.json", JSON.stringify({ argv: process.argv.slice(2), hasKey: "ANTHROPIC_API_KEY" in process.env, path: process.env.PATH }));
emit({ type: "system", subtype: "init", apiKeySource: mode === "apikey" ? "ANTHROPIC_API_KEY" : "none" });
if (mode === "apikey") { setTimeout(() => {}, 60000); return; }
emit({ type: "rate_limit_event", rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.42, resetsAt: 4102444800 }, seven_day: { utilization: 0.3, resetsAt: 4102444800 } } } });
if (mode === "maxturns") { emit({ type: "result", subtype: "error_max_turns", is_error: true, num_turns: 3, total_cost_usd: 0.5, permission_denials: [] }); process.exit(1); }
const atlasPath = ".contextatlas/atlas.json";
const atlas = JSON.parse(fs.readFileSync(atlasPath, "utf8"));
if (mode === "fail") {
  fs.writeFileSync(atlasPath, "{ broken");
  emit({ type: "result", subtype: "success", is_error: false, num_turns: 4, total_cost_usd: 0.2, permission_denials: [], result: "REFRESH-FAILED: validate-extraction kept failing" });
  return;
}
const queue = JSON.parse(fs.readFileSync(".contextatlas/local/pending.json", "utf8"));
for (const e of queue.entries) atlas.source_shas[e.key] = e.sha;
atlas.generated_at = new Date().toISOString();
fs.writeFileSync(atlasPath, JSON.stringify(atlas, null, 2) + "\\n");
emit({ type: "result", subtype: "success", is_error: false, num_turns: 7, total_cost_usd: 1.25, permission_denials: [], result: "REFRESHED adrs=1 docstring_files=0 commits=0 keyed_without_claims=0 remaining=0" });
`;

/** validate-atlas checks the atlas generator version against the package. */
const PKG_VERSION = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;

const CONFIG = [
  "version: 1",
  "languages:",
  "  - typescript",
  "adrs:",
  "  path: docs/adr/",
  "docs:",
  "  include: []",
  "atlas:",
  "  committed: true",
  "  path: .contextatlas/atlas.json",
  "  local_cache: .contextatlas/index.db",
  "",
].join("\n");

describe("contextatlas refresh-claims (v1.2 Phase 6)", () => {
  let root: string;
  let fake: string;
  const atlasPath = () => pathJoin(root, ".contextatlas", "atlas.json");

  beforeEach(async () => {
    root = mkdtempSync(pathJoin(tmpdir(), "ca-refresh-"));
    mkdirSync(pathJoin(root, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(root, ".contextatlas", "local"), { recursive: true });
    mkdirSync(pathJoin(root, ".contextatlas", "prompts"), { recursive: true });
    writeFileSync(pathJoin(root, ".contextatlas", "prompts", "extraction.md"), "prompt\n");
    writeFileSync(pathJoin(root, ".contextatlas.yml"), CONFIG);
    fake = pathJoin(root, "fake-claude.cjs");
    writeFileSync(fake, FAKE_CLAUDE);
    // An existing atlas (structural export), then a new ADR to refresh.
    await runIndexSubcommand({
      configRoot: root,
      configFile: null,
      full: false,
      structural: true,
      json: false,
      contextatlasVersion: PKG_VERSION,
      contextatlasCommitSha: null,
      writeStdout: () => {},
    });
    writeFileSync(pathJoin(root, "docs", "adr", "ADR-01-a.md"), "# ADR\n");
  }, 60_000);
  afterEach(async () => {
    delete process.env.FAKE_MODE;
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const run = (extra: Partial<Parameters<typeof runRefreshClaims>[0]> = {}) =>
    runRefreshClaims({
      configRoot: root,
      configFile: null,
      ifDue: false,
      trigger: "manual",
      contextatlasVersion: PKG_VERSION,
      claudeCommand: { command: process.execPath, args: [fake] },
      entryOverride: "/opt/contextatlas/dist/index.js",
      writeStdout: () => {},
      writeStderr: () => {},
      ...extra,
    });

  it("runs one subscription session with the cap and the shim, drains what it keyed, and logs usage", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-must-not-reach-claude";
    try {
      const result = await run({ maxSources: 7 });
      expect(result.entry?.reason).toBeUndefined();
      expect(result.exitCode).toBe(0);
      expect(result.entry).toMatchObject({
        outcome: "refreshed",
        pending_before: 1,
        selected: 1,
        pending_after: 0,
        turns: 7,
        cost_usd_estimate: 1.25,
        atlas_restored: false,
        usage: { five_hour: { utilization: 0.42 } },
      });
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
    const seen = JSON.parse(readFileSync(pathJoin(root, ".contextatlas", "local", "fake-argv.json"), "utf8"));
    expect(seen.argv.slice(0, 2)).toEqual(["-p", "/refresh-atlas --max-sources 7"]);
    expect(seen.argv).toEqual(expect.arrayContaining(["--permission-mode", "dontAsk", "--allowedTools", "Skill(refresh-atlas)", "--max-turns", "80"]));
    expect(seen.argv).not.toContain("--bare");
    expect(seen.hasKey).toBe(false);
    expect(seen.path.startsWith(pathJoin(root, ".contextatlas", "local", "bin"))).toBe(true);
    expect(readFileSync(pathJoin(root, ".contextatlas", "local", "bin", "contextatlas"), "utf8")).toContain(
      "/opt/contextatlas/dist/index.js",
    );
    expect(readPendingQueue(root)).toEqual([]);
    expect(readLedger(root).at(-1)?.outcome).toBe("refreshed");
  }, 120_000);

  it("restores atlas.json and keeps the queue when the session reports a failure", async () => {
    process.env.FAKE_MODE = "fail";
    const before = readFileSync(atlasPath(), "utf8");
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.entry).toMatchObject({ outcome: "failed", atlas_restored: true, pending_after: 1 });
    expect(result.entry?.reason).toMatch(/validate-extraction kept failing/);
    expect(readFileSync(atlasPath(), "utf8")).toBe(before);
  }, 120_000);

  it("stops a session that would bill an API key, and reports max-turns exhaustion", async () => {
    process.env.FAKE_MODE = "apikey";
    const apikey = await run();
    expect(apikey.exitCode).toBe(1);
    expect(apikey.entry?.reason).toMatch(/bills API usage/);

    process.env.FAKE_MODE = "maxturns";
    const maxturns = await run();
    expect(maxturns.exitCode).toBe(1);
    expect(maxturns.entry?.reason).toMatch(/refresh.max_turns/);
  }, 120_000);

  it("checks the prompt artifact before starting a session (no turns spent)", async () => {
    await rm(pathJoin(root, ".contextatlas", "prompts"), { recursive: true, force: true });
    const manual = await run();
    expect(manual.exitCode).toBe(2);
    expect(existsSync(pathJoin(root, ".contextatlas", "local", "fake-argv.json"))).toBe(false);

    writeFileSync(pathJoin(root, ".contextatlas.yml"), CONFIG + "refresh:\n  min_interval_minutes: 0\n");
    const due = await run({ ifDue: true, trigger: "pre-push" });
    expect(due.exitCode).toBe(0);
    expect(due.entry).toMatchObject({ outcome: "skipped", turns: 0 });
    expect(due.entry?.reason).toMatch(/prompts\/extraction\.md is missing/);
    expect(existsSync(pathJoin(root, ".contextatlas", "local", "fake-argv.json"))).toBe(false);
  }, 120_000);

  it("--if-due: skips when auto_claims is off, and does nothing (no session) when the queue is empty", async () => {
    writeFileSync(pathJoin(root, ".contextatlas.yml"), CONFIG + "refresh:\n  auto_claims: false\n");
    const off = await run({ ifDue: true, trigger: "pre-push" });
    expect(off.entry).toMatchObject({ outcome: "skipped", reason: "refresh.auto_claims is false", trigger: "pre-push" });

    // A run drains the queue; an automatic run right after is inside the
    // interval, and with no interval finds nothing pending (no session).
    writeFileSync(pathJoin(root, ".contextatlas.yml"), CONFIG);
    await run();
    const tooSoon = await run({ ifDue: true });
    expect(tooSoon.entry?.outcome).toBe("skipped");
    expect(tooSoon.entry?.reason).toMatch(/min_interval_minutes/);
    writeFileSync(pathJoin(root, ".contextatlas.yml"), CONFIG + "refresh:\n  min_interval_minutes: 0\n");
    const empty = await run({ ifDue: true });
    expect(empty.entry).toMatchObject({ outcome: "nothing-pending", turns: 0 });
    expect(existsSync(atlasPath())).toBe(true);
  }, 120_000);
});

describe("checkDue", () => {
  const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
    at: "2026-10-14T12:00:00.000Z",
    trigger: "manual",
    outcome: "refreshed",
    pending_before: 1,
    selected: 1,
    pending_after: 0,
    turns: 1,
    cost_usd_estimate: 0,
    duration_ms: 1,
    permission_denials: 0,
    atlas_restored: false,
    ...over,
  });
  const limits = { minIntervalMinutes: 60, maxUtilization: 0.8 };
  const now = new Date("2026-10-14T12:30:00.000Z");
  const reset = Date.parse("2026-10-14T15:00:00.000Z") / 1000;

  it("enforces the interval since the last session, ignoring skips", () => {
    expect(checkDue([entry({})], limits, now).due).toBe(false);
    expect(checkDue([entry({ outcome: "skipped" })], limits, now).due).toBe(true);
    expect(checkDue([entry({ at: "2026-10-14T11:00:00.000Z" })], limits, now).due).toBe(true);
  });

  it("waits while recorded usage is at the ceiling, until that window resets", () => {
    const old = "2026-10-14T10:00:00.000Z";
    const high = entry({ at: old, usage: { five_hour: { utilization: 0.85, resetsAt: reset } } });
    const check = checkDue([high], limits, now);
    expect(check.due).toBe(false);
    expect(check.reason).toMatch(/five-hour usage was 85%/);
    expect(checkDue([high], limits, new Date("2026-10-14T15:01:00.000Z")).due).toBe(true);
    expect(checkDue([entry({ at: old, usage: { seven_day: { utilization: 0.5, resetsAt: reset } } })], limits, now).due).toBe(true);
  });
});
