/**
 * `contextatlas refresh-claims` — Tier 1 incremental claim refresh (v1.2
 * Phase 6; ADR-12 2026-10-14 amendment, Phase 6 section).
 *
 * One invocation:
 *   1. `--if-due` gates (automatic triggers: the pre-push hook, a
 *      scheduler): `refresh.auto_claims`, `refresh.min_interval_minutes`
 *      and `refresh.max_utilization` against the ledger. Free.
 *   2. A cache-only structural run refreshes the pending queue. Nothing
 *      pending: done, no session.
 *   3. Under the run lock: snapshot atlas.json, write the `contextatlas`
 *      shim, start `claude -p "/refresh-atlas --max-sources N"` on the
 *      subscription (claude-session.ts), and restore the snapshot when
 *      the session failed or left an atlas that does not validate.
 *   4. A second cache-only structural run recomputes the queue: the
 *      sources the session keyed leave it, the overflow beyond
 *      `refresh.max_sources_per_run` stays.
 *   5. One ledger line (`refresh-log.jsonl`).
 *
 * Exit codes: 0 refreshed, nothing pending or skipped; 1 the session
 * failed (atlas.json restored); 2 setup error.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { delimiter, resolve as pathResolve } from "node:path";

import { loadConfig } from "../config/parser.js";
import { resolveRefresh } from "../config/refresh.js";
import { runIndexSubcommand } from "../extraction/cli-runner.js";
import { runValidateAtlasSubcommand } from "../extraction/cli-validate-atlas.js";
import { localStateDir, readPendingQueue } from "../extraction/local-state.js";
import { acquireRunLock } from "../extraction/run-lock.js";
import { writeAtlasFileAtomic } from "../storage/atlas-exporter.js";

import { runClaudeSession, subscriptionEnv, type ClaudeSessionResult } from "./claude-session.js";
import { appendLedger, checkDue, readLedger, type LedgerEntry, type RefreshTrigger } from "./ledger.js";

export interface RefreshClaimsOptions {
  configRoot: string;
  configFile: string | null;
  /** Automatic invocation: apply the `--if-due` gates. */
  ifDue: boolean;
  trigger: RefreshTrigger;
  /** Overrides `refresh.max_sources_per_run`. */
  maxSources?: number;
  contextatlasVersion: string;
  /** Test seam: the claude executable and leading args (default `claude`, or CONTEXTATLAS_CLAUDE_BIN). */
  claudeCommand?: { command: string; args?: string[] };
  /** Test seam: the entry script the shim runs (default this process's). */
  entryOverride?: string;
  /** Test seam: session timeout. Default 60 min. */
  timeoutMs?: number;
  /** Test seam: run the structural refreshes in-process (default true). */
  structuralRefresh?: (configRoot: string, configFile: string | null) => Promise<void>;
  writeStdout?: (chunk: string) => void;
  writeStderr?: (chunk: string) => void;
}

export interface RefreshClaimsResult {
  exitCode: 0 | 1 | 2;
  entry?: LedgerEntry;
}

export async function runRefreshClaims(options: RefreshClaimsOptions): Promise<RefreshClaimsResult> {
  const out = options.writeStdout ?? ((c: string) => void process.stdout.write(c));
  const err = options.writeStderr ?? ((c: string) => void process.stderr.write(c));
  const startedAt = new Date();
  const configRoot = pathResolve(options.configRoot);

  let config;
  try {
    config = options.configFile ? loadConfig(configRoot, options.configFile) : loadConfig(configRoot);
  } catch (e) {
    err(`contextatlas refresh-claims: failed to load config: ${String(e)}\n`);
    return { exitCode: 2 };
  }
  const refresh = resolveRefresh(config);
  const maxSources = options.maxSources ?? refresh.maxSourcesPerRun;
  const base = {
    trigger: options.trigger,
    pending_before: 0,
    selected: 0,
    pending_after: 0,
    turns: 0,
    cost_usd_estimate: 0,
    permission_denials: 0,
    atlas_restored: false,
  };
  const record = (entry: Omit<LedgerEntry, "at" | "duration_ms">, exitCode: 0 | 1 | 2): RefreshClaimsResult => {
    const full: LedgerEntry = {
      at: startedAt.toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      ...entry,
    };
    try {
      appendLedger(configRoot, full);
    } catch (e) {
      err(`contextatlas refresh-claims: could not write the ledger: ${String(e)}\n`);
    }
    out(
      `refresh-claims: ${full.outcome}${full.reason ? ` (${full.reason})` : ""}; ` +
        `pending ${full.pending_before} -> ${full.pending_after}, ${full.turns} turn(s), ` +
        `estimated $${full.cost_usd_estimate.toFixed(2)} at list price (subscription)\n`,
    );
    return { exitCode, entry: full };
  };

  if (options.ifDue) {
    if (!refresh.autoClaims) {
      return record({ ...base, outcome: "skipped", reason: "refresh.auto_claims is false" }, 0);
    }
    const due = checkDue(readLedger(configRoot), refresh);
    if (!due.due) return record({ ...base, outcome: "skipped", reason: due.reason ?? "not due" }, 0);
  }

  const structural = options.structuralRefresh ?? defaultStructuralRefresh(options.contextatlasVersion);
  await structural(configRoot, options.configFile);
  const pendingBefore = readPendingQueue(configRoot).length;
  if (pendingBefore === 0) {
    return record({ ...base, outcome: "nothing-pending" }, 0);
  }

  const lock = acquireRunLock(configRoot, "refresh-claims");
  if (!lock.acquired) {
    const reason = `an index run is in progress (pid ${lock.holder.pid}, ${lock.holder.mode})`;
    if (options.ifDue) return record({ ...base, pending_before: pendingBefore, outcome: "skipped", reason }, 0);
    err(`contextatlas refresh-claims: ${reason}; retry when it finishes.\n`);
    return { exitCode: 2 };
  }

  const atlasPath = pathResolve(configRoot, config.atlas.path);
  const snapshot = existsSync(atlasPath) ? readFileSync(atlasPath, "utf8") : null;
  let session: ClaudeSessionResult;
  let restored = false;
  try {
    if (snapshot === null) {
      err(
        "contextatlas refresh-claims: no atlas.json; Tier 1 refreshes an existing atlas. " +
          "Build it first with /index-atlas or `contextatlas index`.\n",
      );
      return { exitCode: 2 };
    }
    const shimDir = writeShim(configRoot, options.entryOverride ?? resolveEntryScript());
    const claude = options.claudeCommand ?? {
      command: process.env.CONTEXTATLAS_CLAUDE_BIN ?? "claude",
    };
    session = await runClaudeSession({
      command: claude.command,
      ...(claude.args !== undefined ? { commandArgs: claude.args } : {}),
      prompt: `/refresh-atlas --max-sources ${maxSources}`,
      maxTurns: refresh.maxTurns,
      cwd: configRoot,
      env: subscriptionEnv(process.env, {
        PATH: `${shimDir}${delimiter}${process.env.PATH ?? process.env.Path ?? ""}`,
      }),
      timeoutMs: options.timeoutMs ?? 60 * 60_000,
    });
    const failure = sessionFailure(session);
    const atlasNow = existsSync(atlasPath) ? readFileSync(atlasPath, "utf8") : null;
    const invalid =
      failure === null && atlasNow !== snapshot && !(await atlasValidates(configRoot, options.configFile));
    if ((failure !== null || invalid) && atlasNow !== snapshot) {
      writeAtlasFileAtomic(atlasPath, snapshot);
      restored = true;
    }
    if (failure !== null || invalid) {
      lock.release();
      await structural(configRoot, options.configFile);
      return record(
        {
          ...base,
          ...sessionFields(session),
          pending_before: pendingBefore,
          selected: Math.min(maxSources, pendingBefore),
          pending_after: readPendingQueue(configRoot).length,
          atlas_restored: restored,
          outcome: "failed",
          reason: failure ?? "the refreshed atlas.json does not validate (validate-atlas)",
        },
        1,
      );
    }
  } finally {
    lock.release();
  }

  await structural(configRoot, options.configFile);
  return record(
    {
      ...base,
      ...sessionFields(session),
      pending_before: pendingBefore,
      selected: Math.min(maxSources, pendingBefore),
      pending_after: readPendingQueue(configRoot).length,
      outcome: "refreshed",
    },
    0,
  );
}

function sessionFields(s: ClaudeSessionResult): Pick<LedgerEntry, "turns" | "cost_usd_estimate" | "permission_denials"> & { usage?: LedgerEntry["usage"] } {
  return {
    turns: s.turns,
    cost_usd_estimate: s.costUsdEstimate,
    permission_denials: s.permissionDenials,
    ...(s.usage !== undefined ? { usage: s.usage } : {}),
  };
}

/** Why the session counts as failed, or null. */
function sessionFailure(s: ClaudeSessionResult): string | null {
  if (s.failure !== undefined) return s.failure;
  if (s.isError) {
    return s.subtype === "error_max_turns"
      ? "the session hit refresh.max_turns before finishing; raise it or lower refresh.max_sources_per_run"
      : `the session ended with an error (${s.subtype ?? "unknown"})`;
  }
  const failed = s.text.split("\n").find((l) => l.startsWith("REFRESH-FAILED:"));
  return failed !== undefined ? failed.slice("REFRESH-FAILED:".length).trim() : null;
}

async function atlasValidates(configRoot: string, configFile: string | null): Promise<boolean> {
  const result = await runValidateAtlasSubcommand({
    configRoot,
    configFile,
    writeStdout: () => {},
    writeStderr: () => {},
  });
  return result.exitCode === 0;
}

function defaultStructuralRefresh(version: string) {
  return async (configRoot: string, configFile: string | null): Promise<void> => {
    await runIndexSubcommand({
      configRoot,
      configFile,
      full: false,
      structural: true,
      noExport: true,
      json: false,
      contextatlasVersion: version,
      writeStdout: () => {},
      writeStderr: () => {},
    });
  };
}

/**
 * `.contextatlas/local/bin/contextatlas` (sh) and `contextatlas.cmd`,
 * running this contextatlas build, put first on the session's PATH: the
 * skill's gates must run the same version as this runner, not an older
 * global install.
 */
function writeShim(configRoot: string, entry: string): string {
  const dir = pathResolve(localStateDir(configRoot), "bin");
  mkdirSync(dir, { recursive: true });
  const node = process.execPath.replace(/\\/g, "/");
  const script = entry.replace(/\\/g, "/");
  writeFileSync(pathResolve(dir, "contextatlas"), `#!/bin/sh\nexec "${node}" "${script}" "$@"\n`, "utf8");
  chmodSync(pathResolve(dir, "contextatlas"), 0o755);
  writeFileSync(
    pathResolve(dir, "contextatlas.cmd"),
    `@echo off\r\n"${process.execPath}" "${entry}" %*\r\n`,
    "utf8",
  );
  return dir;
}

function resolveEntryScript(): string {
  const argv1 = process.argv[1] ?? "";
  try {
    return realpathSync(argv1);
  } catch {
    return pathResolve(argv1);
  }
}
