/**
 * Git hooks that keep the local cache structurally fresh (v1.2 Phase 5,
 * Tier 0; ADR-12 2026-10-14 amendment, Phase 5 section).
 *
 * `contextatlas hooks install` adds a marked block to post-commit,
 * post-merge and post-checkout (branch switches only). The block starts
 * `contextatlas index --structural --no-export` in the background and
 * returns at once, so git never waits: the run makes no model call and
 * leaves atlas.json untouched (lead decision L-21), and the run lock
 * coalesces runs that pile up during a rebase. Output of the latest run
 * goes to `.contextatlas/local/hook-last.log`.
 *
 * pre-push (v1.2 Phase 6, L-22) starts `contextatlas refresh-claims
 * --if-due --trigger pre-push` the same way: Tier 1, gated by
 * `refresh.auto_claims`, the interval and the usage ceiling; the push is
 * never delayed. Its output goes to `.contextatlas/local/prepush-last.log`.
 *
 *   - Location: `git rev-parse --git-path hooks`, which honours
 *     `core.hooksPath` and linked worktrees.
 *   - Chaining: existing hook content is kept. The block goes right
 *     after the shebang, so a hook that ends in `exit` still runs it;
 *     reinstalling replaces the block in place (idempotent).
 *   - Uninstall removes the block, and deletes a hook file left with
 *     nothing but a shebang.
 *   - The block names node and the contextatlas entry script by absolute
 *     path (no PATH lookup inside git's environment). `hooks status`
 *     flags a block whose entry script no longer exists (after an
 *     uninstall or move of contextatlas); reinstall to update it.
 *
 * Hook files are plain `sh` with LF line endings: git runs them through
 * `sh` on every platform, including Git for Windows.
 */

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve as pathResolve } from "node:path";

export const MANAGED_HOOKS = ["post-commit", "post-merge", "post-checkout", "pre-push"] as const;
export type ManagedHook = (typeof MANAGED_HOOKS)[number];

const BEGIN = "# >>> contextatlas >>>";
const END = "# <<< contextatlas <<<";
const ENTRY_TAG = "# contextatlas-entry: ";

/** What the block runs. */
export interface HookCommand {
  /** Absolute path of the node binary. */
  node: string;
  /** Absolute path of the contextatlas entry script (dist/index.js). */
  entry: string;
  /** Absolute config root the run uses. */
  configRoot: string;
  /** `--config <file>`, when the repository uses a non-default name. */
  configFile?: string | null;
}

/** The hooks directory git uses for the repository at `cwd`. */
export function resolveHooksDir(cwd: string, gitBinary = "git"): string {
  const r = spawnSync(gitBinary, ["rev-parse", "--git-path", "hooks"], {
    cwd,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(
      `contextatlas hooks: ${cwd} is not inside a git repository (or git is ` +
        `unavailable): ${(r.stderr ?? "").trim() || String(r.error)}. Run it ` +
        "from the repository whose atlas the hooks should refresh.",
    );
  }
  const rel = r.stdout.trim();
  return isAbsolute(rel) ? rel : pathResolve(cwd, rel);
}

/** sh-quote a path for the block; rejects characters double quotes cannot hold. */
function quote(path: string): string {
  const posix = path.replace(/\\/g, "/");
  if (/["$`\\]/.test(posix) || /[\r\n]/.test(posix)) {
    throw new Error(
      `contextatlas hooks: the path ${JSON.stringify(path)} contains a quote, ` +
        "$, backtick or backslash, which the hook script cannot quote safely. " +
        "Install contextatlas or the repository at a path without them.",
    );
  }
  return `"${posix}"`;
}

/** The managed block for one hook. */
export function buildHookBlock(hook: ManagedHook, cmd: HookCommand): string {
  const root = quote(cmd.configRoot);
  const entry = quote(cmd.entry);
  const localDir = quote(`${cmd.configRoot}/.contextatlas/local`);
  const log = quote(
    `${cmd.configRoot}/.contextatlas/local/${hook === "pre-push" ? "prepush-last.log" : "hook-last.log"}`,
  );
  const config = cmd.configFile ? ` --config ${quote(cmd.configFile)}` : "";
  const run =
    hook === "pre-push"
      ? "refresh-claims --if-due --trigger pre-push"
      : "index --structural --no-export";
  // post-checkout: $3 is 1 for a branch checkout, 0 for a file checkout.
  const condition = hook === "post-checkout" ? ` && [ "$3" = "1" ]` : "";
  return [
    BEGIN,
    "# Managed by `contextatlas hooks install`; remove with `contextatlas hooks uninstall`.",
    hook === "pre-push"
      ? "# Starts a Tier 1 claim refresh in the background when due (subscription; never delays the push)."
      : "# Refreshes the ContextAtlas local cache in the background (no model calls).",
    `${ENTRY_TAG}${cmd.entry.replace(/\\/g, "/")}`,
    `if [ -f ${entry} ]${condition}; then`,
    `  mkdir -p ${localDir}`,
    `  ( cd ${root} && nohup ${quote(cmd.node)} ${entry} ${run} --config-root ${root}${config} > ${log} 2>&1 < /dev/null & )`,
    "fi",
    END,
  ].join("\n");
}

/** Remove the managed block (and the newline after it) from a hook's text. */
export function stripHookBlock(text: string): string {
  const start = text.indexOf(BEGIN);
  if (start < 0) return text;
  const endMarker = text.indexOf(END, start);
  if (endMarker < 0) return text;
  let end = endMarker + END.length;
  if (text[end] === "\n") end++;
  return text.slice(0, start) + text.slice(end);
}

/** Insert `block` after the shebang (or at the top), replacing any existing block. */
export function insertHookBlock(text: string, block: string): string {
  const base = stripHookBlock(text.replace(/\r\n/g, "\n"));
  if (base.trim().length === 0) return `#!/bin/sh\n${block}\n`;
  if (base.startsWith("#!")) {
    const nl = base.indexOf("\n");
    const shebang = nl < 0 ? base : base.slice(0, nl);
    const rest = nl < 0 ? "" : base.slice(nl + 1);
    return `${shebang}\n${block}\n${rest}`;
  }
  return `#!/bin/sh\n${block}\n${base}`;
}

export type InstallAction = "created" | "updated" | "unchanged";
export type UninstallAction = "removed" | "deleted" | "absent";

export interface HookReport<A> {
  hook: ManagedHook;
  path: string;
  action: A;
}

export function installHooks(hooksDir: string, cmd: HookCommand): HookReport<InstallAction>[] {
  mkdirSync(hooksDir, { recursive: true });
  return MANAGED_HOOKS.map((hook) => {
    const path = pathResolve(hooksDir, hook);
    const existed = existsSync(path);
    const before = existed ? readFileSync(path, "utf8") : "";
    const after = insertHookBlock(before, buildHookBlock(hook, cmd));
    if (after !== before) writeFileSync(path, after, "utf8");
    chmodSync(path, 0o755);
    const action: InstallAction = !existed ? "created" : after === before ? "unchanged" : "updated";
    return { hook, path, action };
  });
}

export function uninstallHooks(hooksDir: string): HookReport<UninstallAction>[] {
  return MANAGED_HOOKS.map((hook) => {
    const path = pathResolve(hooksDir, hook);
    if (!existsSync(path)) return { hook, path, action: "absent" as const };
    const before = readFileSync(path, "utf8");
    const after = stripHookBlock(before.replace(/\r\n/g, "\n"));
    if (after === before.replace(/\r\n/g, "\n")) return { hook, path, action: "absent" as const };
    const remainder = after.replace(/^#!.*\n?/, "").trim();
    if (remainder.length === 0) {
      rmSync(path, { force: true });
      return { hook, path, action: "deleted" as const };
    }
    writeFileSync(path, after, "utf8");
    return { hook, path, action: "removed" as const };
  });
}

export interface HookStatus {
  hook: ManagedHook;
  path: string;
  installed: boolean;
  /** Entry script the block runs (null when not installed). */
  entry: string | null;
  /** Whether that entry script exists. */
  entryExists: boolean;
}

export function hooksStatus(hooksDir: string): HookStatus[] {
  return MANAGED_HOOKS.map((hook) => {
    const path = pathResolve(hooksDir, hook);
    const text = existsSync(path) ? readFileSync(path, "utf8") : "";
    const start = text.indexOf(BEGIN);
    if (start < 0) return { hook, path, installed: false, entry: null, entryExists: false };
    const tagLine = text
      .slice(start)
      .split(/\r?\n/)
      .find((l) => l.startsWith(ENTRY_TAG));
    const entry = tagLine ? tagLine.slice(ENTRY_TAG.length).trim() : null;
    return { hook, path, installed: true, entry, entryExists: entry !== null && existsSync(entry) };
  });
}
