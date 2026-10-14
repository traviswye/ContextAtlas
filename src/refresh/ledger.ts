/**
 * The Tier 1 usage ledger (v1.2 Phase 6): one JSON line per
 * `contextatlas refresh-claims` invocation in
 * `.contextatlas/local/refresh-log.jsonl`, newest last, trimmed to
 * {@link LEDGER_MAX_LINES}. `--if-due` reads it to enforce
 * `refresh.min_interval_minutes` and `refresh.max_utilization` without
 * spending anything.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { ensureLocalStateDir, localStateDir } from "../extraction/local-state.js";

export type RefreshTrigger = "manual" | "if-due" | "pre-push";

export type RefreshOutcome =
  | "refreshed"
  | "nothing-pending"
  | "skipped"
  | "failed";

export interface UsageWindow {
  readonly utilization: number;
  /** Unix seconds when the window resets. */
  readonly resetsAt: number;
}

export interface LedgerEntry {
  readonly at: string;
  readonly trigger: RefreshTrigger;
  readonly outcome: RefreshOutcome;
  /** Why it was skipped or failed. */
  readonly reason?: string;
  readonly pending_before: number;
  readonly selected: number;
  readonly pending_after: number;
  readonly turns: number;
  /** Claude Code's list-price estimate; the subscription is not billed per call. */
  readonly cost_usd_estimate: number;
  readonly duration_ms: number;
  readonly permission_denials: number;
  readonly atlas_restored: boolean;
  /** Latest rate-limit windows the session reported (subscription usage). */
  readonly usage?: { readonly five_hour?: UsageWindow; readonly seven_day?: UsageWindow };
}

export const LEDGER_MAX_LINES = 1000;

export function ledgerPath(configRoot: string): string {
  return pathResolve(localStateDir(configRoot), "refresh-log.jsonl");
}

export function readLedger(configRoot: string): LedgerEntry[] {
  const path = ledgerPath(configRoot);
  if (!existsSync(path)) return [];
  const out: LedgerEntry[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      out.push(JSON.parse(line) as LedgerEntry);
    } catch {
      // A damaged line is skipped.
    }
  }
  return out;
}

export function appendLedger(configRoot: string, entry: LedgerEntry): void {
  ensureLocalStateDir(configRoot);
  const path = ledgerPath(configRoot);
  const lines = existsSync(path)
    ? readFileSync(path, "utf8").split("\n").filter((l) => l.length > 0)
    : [];
  lines.push(JSON.stringify(entry));
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, lines.slice(-LEDGER_MAX_LINES).join("\n") + "\n", "utf8");
  renameSync(tmp, path);
}

export interface DueCheck {
  readonly due: boolean;
  readonly reason?: string;
}

/**
 * Whether an automatic run may start now: the last run that started a
 * session is older than `minIntervalMinutes`, and the last usage it
 * recorded is below `maxUtilization` in every window that has not reset
 * yet.
 */
export function checkDue(
  ledger: readonly LedgerEntry[],
  limits: { minIntervalMinutes: number; maxUtilization: number },
  now: Date = new Date(),
): DueCheck {
  const sessions = ledger.filter((e) => e.outcome === "refreshed" || e.outcome === "failed");
  const last = sessions.at(-1);
  if (last !== undefined) {
    const ageMin = (now.getTime() - Date.parse(last.at)) / 60_000;
    if (ageMin < limits.minIntervalMinutes) {
      return {
        due: false,
        reason: `last Tier 1 run was ${Math.floor(ageMin)} min ago (refresh.min_interval_minutes: ${limits.minIntervalMinutes})`,
      };
    }
  }
  const withUsage = [...ledger].reverse().find((e) => e.usage !== undefined);
  const nowSec = now.getTime() / 1000;
  for (const [name, window] of Object.entries(withUsage?.usage ?? {})) {
    if (window === undefined || window.resetsAt <= nowSec) continue;
    if (window.utilization >= limits.maxUtilization) {
      return {
        due: false,
        reason:
          `subscription ${name.replace("_", "-")} usage was ${Math.round(window.utilization * 100)}% at the last run ` +
          `(refresh.max_utilization: ${Math.round(limits.maxUtilization * 100)}%); waiting until it resets at ` +
          new Date(window.resetsAt * 1000).toISOString(),
      };
    }
  }
  return { due: true };
}
