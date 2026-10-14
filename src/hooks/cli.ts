/**
 * `contextatlas hooks install | uninstall | status` (v1.2 Phase 5).
 * See `hooks.ts` for what the hooks run and how they chain.
 *
 * Exit codes: 0 success; 2 setup error (not a git repository, no
 * config, a path the hook script cannot quote).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import type { HooksAction } from "../cli-args.js";
import { loadConfig } from "../config/parser.js";
import { readPendingQueue, runLogPath } from "../extraction/local-state.js";
import { liveRunLock } from "../extraction/run-lock.js";

import {
  hooksStatus,
  installHooks,
  resolveHooksDir,
  uninstallHooks,
  type HookCommand,
} from "./hooks.js";

export interface HooksCliOptions {
  configRoot: string;
  configFile: string | null;
  action: HooksAction;
  /** Test seam: the entry script the hooks run. Default: this process's. */
  entryOverride?: string;
  /** Test seam: the node binary. Default: `process.execPath`. */
  nodeOverride?: string;
  gitBinary?: string;
  writeStdout?: (chunk: string) => void;
  writeStderr?: (chunk: string) => void;
}

export interface HooksCliResult {
  exitCode: 0 | 2;
}

export async function runHooksSubcommand(options: HooksCliOptions): Promise<HooksCliResult> {
  const out = options.writeStdout ?? ((c: string) => void process.stdout.write(c));
  const err = options.writeStderr ?? ((c: string) => void process.stderr.write(c));
  const configRoot = pathResolve(options.configRoot);
  const gitBinary = options.gitBinary ?? "git";

  let hooksDir: string;
  try {
    hooksDir = resolveHooksDir(configRoot, gitBinary);
  } catch (e) {
    err(`${(e as Error).message}\n`);
    return { exitCode: 2 };
  }

  if (options.action === "status") {
    out(formatStatus(configRoot, hooksDir));
    return { exitCode: 0 };
  }

  if (options.action === "uninstall") {
    for (const r of uninstallHooks(hooksDir)) {
      const what =
        r.action === "deleted"
          ? "removed (file deleted: it held only the contextatlas block)"
          : r.action === "removed"
            ? "removed (other hook content kept)"
            : "not installed";
      out(`${r.hook}: ${what}  ${r.path}\n`);
    }
    return { exitCode: 0 };
  }

  try {
    if (options.configFile) loadConfig(configRoot, options.configFile);
    else loadConfig(configRoot);
  } catch (e) {
    err(
      `contextatlas hooks install: no usable config at ${configRoot} (${String(e)}). ` +
        "Run `contextatlas init` first; the hooks refresh that repository's atlas cache.\n",
    );
    return { exitCode: 2 };
  }

  const cmd: HookCommand = {
    node: options.nodeOverride ?? process.execPath,
    entry: options.entryOverride ?? resolveEntryScript(),
    configRoot,
    configFile: options.configFile,
  };
  try {
    for (const r of installHooks(hooksDir, cmd)) out(`${r.hook}: ${r.action}  ${r.path}\n`);
  } catch (e) {
    err(`${(e as Error).message}\n`);
    return { exitCode: 2 };
  }
  if (!isInsideGitDir(configRoot, hooksDir, gitBinary)) {
    out(
      `Note: ${hooksDir} is outside the .git directory (core.hooksPath), so these ` +
        "edits may be tracked by your repository and shared with everyone who uses it.\n",
    );
  }
  out(
    "After each commit, merge and branch checkout, git now starts a background " +
      "`contextatlas index --structural --no-export`: the local cache is refreshed " +
      "with no model calls, and atlas.json is not modified. Before each push, git " +
      "starts `contextatlas refresh-claims --if-due`: when sources are pending and " +
      "it is due (refresh.* in .contextatlas.yml; refresh.auto_claims: false turns " +
      "it off), Claude Code re-extracts them on your subscription. Logs: " +
      ".contextatlas/local/hook-last.log and prepush-last.log. Check with " +
      "`contextatlas hooks status`.\n",
  );
  return { exitCode: 0 };
}

function resolveEntryScript(): string {
  const argv1 = process.argv[1];
  if (!argv1) throw new Error("contextatlas hooks: cannot determine the contextatlas entry script.");
  try {
    return realpathSync(argv1);
  } catch {
    return pathResolve(argv1);
  }
}

function isInsideGitDir(cwd: string, dir: string, gitBinary: string): boolean {
  const r = spawnSync(gitBinary, ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8" });
  if (r.status !== 0) return true;
  const gitDir = pathResolve(cwd, r.stdout.trim());
  const norm = (p: string) => pathResolve(p).replace(/\\/g, "/").toLowerCase();
  return norm(dir).startsWith(`${norm(gitDir)}/`);
}

function formatStatus(configRoot: string, hooksDir: string): string {
  const lines: string[] = [`hooks directory: ${hooksDir}`];
  for (const s of hooksStatus(hooksDir)) {
    const state = !s.installed
      ? "not installed"
      : s.entryExists
        ? "installed"
        : `installed, but its entry script is missing (${s.entry}); run \`contextatlas hooks install\` again`;
    lines.push(`${s.hook}: ${state}`);
  }
  const lock = liveRunLock(configRoot);
  lines.push(
    lock
      ? `index run in progress: pid ${lock.pid} (${lock.mode}, started ${lock.started_at})`
      : "index run in progress: none",
  );
  const pending = readPendingQueue(configRoot);
  if (pending.length === 0) {
    lines.push("pending sources: none");
  } else {
    const byStream = new Map<string, number>();
    for (const e of pending) byStream.set(e.stream, (byStream.get(e.stream) ?? 0) + 1);
    const oldest = pending.map((e) => e.first_seen).sort()[0];
    lines.push(
      `pending sources: ${pending.length} (${[...byStream].map(([s, n]) => `${s} ${n}`).join(", ")}; ` +
        `oldest since ${oldest}). Run \`contextatlas index\` to extract them.`,
    );
  }
  const last = lastRun(configRoot);
  lines.push(last ? `last index run: ${last}` : "last index run: none recorded");
  return lines.join("\n") + "\n";
}

function lastRun(configRoot: string): string | null {
  const path = runLogPath(configRoot);
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").trim().split("\n");
  try {
    const e = JSON.parse(lines.at(-1) ?? "") as {
      at: string;
      mode: string;
      exit_code: number;
      api_calls: number;
      atlas_exported: boolean;
    };
    return `${e.at} ${e.mode}, exit ${e.exit_code}, ${e.api_calls} model call(s), atlas.json ${e.atlas_exported ? "written" : "unchanged"}`;
  } catch {
    return null;
  }
}
