/**
 * Freshness-category doctor checks (v1.2 Phase 8): how far the atlas
 * trails the tree, and what the automatic refresh tiers last did.
 *
 *   - `freshness.local_cache_vs_head` — commits between the last
 *     `contextatlas index` run (any mode; `runs.jsonl`) and HEAD. The
 *     committed atlas's own drift is `sha.atlas_vs_head`.
 *   - `freshness.pending_sources` — the pending queue by stream.
 *   - `freshness.orphaned_claims` — claims that name symbols but link to
 *     none (see `freshness-state.ts`). An interrupted run's orphans are
 *     not reported again by the next run, so this is where they show.
 *   - `freshness.stale_source_keys` — a non-commit key whose file is
 *     gone. `index` drops these; the Skill path can leave one, and
 *     `validate-extraction` no longer checks for it (F1).
 *   - `freshness.unreachable_commit_keys` — `commit:<sha>` keys HEAD
 *     cannot reach (a cache built on another branch).
 *   - `freshness.hooks` — which managed git hooks are installed.
 *   - `freshness.tier1_ledger` — `refresh-claims` totals and last run.
 *
 * All read local files and git only; no model call, no write.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { readPendingQueue, readRunLog } from "../../extraction/local-state.js";
import { hooksStatus, resolveHooksDir } from "../../hooks/hooks.js";
import { readLedger } from "../../refresh/ledger.js";
import type { ExtractionStream } from "../../types.js";
import type { CheckContext, DoctorCheck } from "../types.js";

import { loadAtlasState } from "./freshness-state.js";

const SAMPLE = 3;

export function freshnessChecks(ctx: CheckContext, now: Date = new Date()): DoctorCheck[] {
  const config = ctx.config;
  if (config === null) return []; // Limited mode; runner gates entry.
  const head = gitLine(ctx.repoRoot, ["rev-parse", "HEAD"]);
  const out: DoctorCheck[] = [
    localCacheCheck(ctx, head, now),
    pendingCheck(ctx, now),
  ];

  const loaded = loadAtlasState(ctx.repoRoot, config);
  if (loaded.kind === "unreadable") {
    out.push({
      id: "freshness.atlas_state",
      category: "freshness",
      status: "warn",
      message: `could not read ${loaded.store}`,
      detail: `${loaded.error}. Orphan and source-key checks skipped.`,
    });
  } else if (loaded.kind === "ok") {
    const { state } = loaded;
    out.push(orphanCheck(state.store, state.orphanSourcePaths));
    const sourceRoot = config.source?.root
      ? pathResolve(ctx.repoRoot, config.source.root)
      : ctx.repoRoot;
    out.push(staleKeyCheck(state.store, state.sourceKeys, [ctx.repoRoot, sourceRoot]));
    out.push(commitKeyCheck(ctx.repoRoot, state.store, state.sourceKeys, head));
  }

  out.push(hooksCheck(ctx.repoRoot));
  out.push(ledgerCheck(ctx, now));
  return out;
}

function localCacheCheck(ctx: CheckContext, head: string | null, now: Date): DoctorCheck {
  const id = "freshness.local_cache_vs_head";
  const runs = readRunLog(ctx.repoRoot);
  const last = runs.at(-1);
  if (last === undefined) {
    return {
      id,
      category: "freshness",
      status: "warn",
      message: "no `contextatlas index` run recorded",
      detail:
        "No .contextatlas/local/runs.jsonl. Run `contextatlas index --structural` (no API calls) " +
        "to bring the local cache up to HEAD, and `contextatlas hooks install` to keep it there.",
    };
  }
  const lastStructural = [...runs].reverse().find((r) => r.mode === "structural");
  const lastModel = [...runs].reverse().find((r) => r.mode !== "structural");
  const runSummary =
    `last structural run ${lastStructural ? ago(lastStructural.at, now) : "never"}, ` +
    `last extracting run ${lastModel ? ago(lastModel.at, now) : "never"}`;
  if (last.exit_code !== 0) {
    return {
      id,
      category: "freshness",
      status: "warn",
      message: `last run (${last.mode}, ${ago(last.at, now)}) exited ${last.exit_code}`,
      detail: `${runSummary}. See .contextatlas/local/hook-last.log for a hook-started run.`,
    };
  }
  const at = last.extracted_at_sha;
  if (head === null || at === null) {
    return { id, category: "freshness", status: "pass", message: runSummary };
  }
  if (at === head) {
    return {
      id,
      category: "freshness",
      status: "pass",
      message: `local cache at HEAD ${at.slice(0, 12)}`,
      detail: runSummary,
    };
  }
  const behind = gitLine(ctx.repoRoot, ["rev-list", "--count", `${at}..${head}`]);
  return {
    id,
    category: "freshness",
    status: "warn",
    message:
      behind !== null
        ? `local cache ${behind} commit${behind === "1" ? "" : "s"} behind HEAD`
        : `local cache at ${at.slice(0, 12)}, not an ancestor of HEAD ${head.slice(0, 12)}`,
    detail: `${runSummary}. Run \`contextatlas index --structural\` (no API calls) to catch up.`,
  };
}

function pendingCheck(ctx: CheckContext, now: Date): DoctorCheck {
  const entries = readPendingQueue(ctx.repoRoot);
  if (entries.length === 0) {
    return {
      id: "freshness.pending_sources",
      category: "freshness",
      status: "pass",
      message: "no sources pending re-extraction",
    };
  }
  const by = new Map<ExtractionStream, number>();
  for (const e of entries) by.set(e.stream, (by.get(e.stream) ?? 0) + 1);
  const oldest = entries.reduce((a, b) => (a.first_seen <= b.first_seen ? a : b));
  return {
    id: "freshness.pending_sources",
    category: "freshness",
    status: "warn",
    message:
      `${entries.length} source${entries.length === 1 ? "" : "s"} pending (` +
      [...by].map(([s, n]) => `${s} ${n}`).join(", ") +
      `); oldest queued ${ago(oldest.first_seen, now)}`,
    detail:
      "Their claims describe an older version. Run `contextatlas refresh-claims` (subscription, " +
      "no API key) or `contextatlas index` (API) to re-extract them.",
  };
}

function orphanCheck(store: string, paths: readonly string[]): DoctorCheck {
  if (paths.length === 0) {
    return {
      id: "freshness.orphaned_claims",
      category: "freshness",
      status: "pass",
      message: `no orphaned claims in ${store}`,
    };
  }
  const by = new Map<string, number>();
  for (const p of paths) by.set(p, (by.get(p) ?? 0) + 1);
  const top = [...by].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, SAMPLE);
  return {
    id: "freshness.orphaned_claims",
    category: "freshness",
    status: "pass",
    message:
      `${paths.length} claim${paths.length === 1 ? "" : "s"} in ${store} name${paths.length === 1 ? "s" : ""} symbols that do not ` +
      `resolve (${by.size} source${by.size === 1 ? "" : "s"})`,
    detail:
      `Most: ${top.map(([p, n]) => `${p} (${n})`).join(", ")}. They stay searchable by ` +
      "find_by_intent but reach no symbol bundle. Every run re-links those whose names resolve; " +
      "update a source to name current symbols to re-attach the rest.",
  };
}

function staleKeyCheck(
  store: string,
  keys: readonly string[],
  roots: readonly string[],
): DoctorCheck {
  const stale = keys.filter(
    (k) => !k.startsWith("commit:") && !roots.some((r) => existsSync(pathResolve(r, k))),
  );
  if (stale.length === 0) {
    return {
      id: "freshness.stale_source_keys",
      category: "freshness",
      status: "pass",
      message: `every file source key in ${store} names an existing file`,
    };
  }
  return {
    id: "freshness.stale_source_keys",
    category: "freshness",
    status: "warn",
    message: `${stale.length} source key${stale.length === 1 ? "" : "s"} in ${store} name${stale.length === 1 ? "s" : ""} deleted files`,
    detail:
      `${stale.slice(0, SAMPLE).join(", ")}${stale.length > SAMPLE ? ", ..." : ""}. Their claims ` +
      "still serve. `contextatlas index` drops them (with --structural, from the local cache; " +
      "a run that exports also rewrites atlas.json).",
  };
}

function commitKeyCheck(
  repoRoot: string,
  store: string,
  keys: readonly string[],
  head: string | null,
): DoctorCheck {
  const id = "freshness.unreachable_commit_keys";
  const commits = keys.filter((k) => k.startsWith("commit:")).map((k) => k.slice("commit:".length));
  if (commits.length === 0 || head === null) {
    return {
      id,
      category: "freshness",
      status: "pass",
      message: commits.length === 0 ? `no commit keys in ${store}` : "git HEAD unreadable; skipped",
    };
  }
  const r = spawnSync("git", ["rev-list", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (r.status !== 0) {
    return { id, category: "freshness", status: "pass", message: "git rev-list failed; skipped" };
  }
  const reachable = new Set((r.stdout ?? "").split("\n").map((l) => l.trim()));
  const unreachable = commits.filter((c) => !reachable.has(c));
  if (unreachable.length === 0) {
    return {
      id,
      category: "freshness",
      status: "pass",
      message: `${commits.length} commit key${commits.length === 1 ? "" : "s"}, all reachable from HEAD`,
    };
  }
  return {
    id,
    category: "freshness",
    status: "warn",
    message:
      `${unreachable.length} of ${commits.length} commit keys in ${store} are not reachable ` +
      "from HEAD",
    detail:
      `${unreachable.slice(0, SAMPLE).map((c) => c.slice(0, 12)).join(", ")}` +
      `${unreachable.length > SAMPLE ? ", ..." : ""}. Usually the cache was built on another ` +
      "branch, or history was rewritten. Their claims describe commits this branch does not have.",
  };
}

function hooksCheck(repoRoot: string): DoctorCheck {
  let statuses;
  try {
    statuses = hooksStatus(resolveHooksDir(repoRoot));
  } catch {
    return {
      id: "freshness.hooks",
      category: "freshness",
      status: "pass",
      message: "not a git repository; hooks not applicable",
    };
  }
  const installed = statuses.filter((s) => s.installed);
  const broken = installed.filter((s) => !s.entryExists);
  if (broken.length > 0) {
    return {
      id: "freshness.hooks",
      category: "freshness",
      status: "warn",
      message: `hook${broken.length === 1 ? "" : "s"} ${broken.map((s) => s.hook).join(", ")} run a missing entry script`,
      detail: "contextatlas moved or was uninstalled. Run `contextatlas hooks install` to update them.",
    };
  }
  if (installed.length === 0) {
    return {
      id: "freshness.hooks",
      category: "freshness",
      status: "pass",
      message: "no contextatlas git hooks installed",
      detail:
        "The atlas refreshes only when you run `contextatlas index`. `contextatlas hooks install` " +
        "keeps the local cache current on commit, merge and checkout (no API calls).",
    };
  }
  const missing = statuses.filter((s) => !s.installed).map((s) => s.hook);
  return {
    id: "freshness.hooks",
    category: "freshness",
    status: "pass",
    message:
      `installed: ${installed.map((s) => s.hook).join(", ")}` +
      (missing.length > 0 ? `; not installed: ${missing.join(", ")}` : ""),
  };
}

function ledgerCheck(ctx: CheckContext, now: Date): DoctorCheck {
  const ledger = readLedger(ctx.repoRoot);
  if (ledger.length === 0) {
    return {
      id: "freshness.tier1_ledger",
      category: "freshness",
      status: "pass",
      message: "no `contextatlas refresh-claims` run recorded",
    };
  }
  const count = (o: string): number => ledger.filter((e) => e.outcome === o).length;
  const turns = ledger.reduce((n, e) => n + e.turns, 0);
  const cost = ledger.reduce((n, e) => n + e.cost_usd_estimate, 0);
  const last = ledger.at(-1)!;
  const lastText =
    `last ${last.trigger} run ${ago(last.at, now)}: ${last.outcome}` +
    (last.reason ? ` (${last.reason})` : "");
  return {
    id: "freshness.tier1_ledger",
    category: "freshness",
    status: last.outcome === "failed" ? "warn" : "pass",
    message:
      `${ledger.length} run${ledger.length === 1 ? "" : "s"} (${count("refreshed")} refreshed, ` +
      `${count("nothing-pending")} nothing pending, ${count("skipped")} skipped, ` +
      `${count("failed")} failed); ${turns} turns; $${cost.toFixed(2)} list-price estimate`,
    detail:
      `${lastText}. The estimate is Claude Code's list price; the subscription is not billed per ` +
      "call. Ledger: .contextatlas/local/refresh-log.jsonl.",
  };
}

function gitLine(cwd: string, args: string[]): string | null {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (r.status !== 0) return null;
  const line = (r.stdout ?? "").trim();
  return line.length > 0 ? line : null;
}

/** "5 min ago", "3 h ago", "2 d ago". */
export function ago(iso: string, now: Date): string {
  const min = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(min)) return "at an unknown time";
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h ago`;
  return `${Math.floor(min / (24 * 60))} d ago`;
}
