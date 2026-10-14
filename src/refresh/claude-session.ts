/**
 * One headless Claude Code session for Tier 1 (v1.2 Phase 6): spawns
 * `claude -p "/refresh-atlas ..."` with `--output-format stream-json`
 * and reads its events (D-2 spike, v1.2-SCOPE §5).
 *
 *   - `system:init` — `apiKeySource` must be "none" (the subscription
 *     login). Anything else would bill an API key: the child is killed
 *     before its first model call.
 *   - `rate_limit_event` — five-hour / seven-day utilization, kept for
 *     the ledger's `--if-due` guard.
 *   - `result` — subtype, error flag, turns, Claude Code's list-price
 *     estimate, permission denials, final text.
 *
 * The child gets the parent's environment without ANTHROPIC_API_KEY /
 * ANTHROPIC_AUTH_TOKEN, and is spawned without a shell. `--bare` is never
 * passed: it forces API-key auth.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import type { UsageWindow } from "./ledger.js";

export interface ClaudeSessionOptions {
  /** Executable (default `claude`) and leading arguments, e.g. a test fake. */
  command: string;
  commandArgs?: readonly string[];
  prompt: string;
  maxTurns: number;
  cwd: string;
  /** Extra environment entries (PATH with the shim directory first). */
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export interface ClaudeSessionResult {
  /** Process exit code; null when it was killed or failed to start. */
  exitCode: number | null;
  /** Set when the session was stopped or never ran. */
  failure?: string;
  apiKeySource?: string;
  usage?: { five_hour?: UsageWindow; seven_day?: UsageWindow };
  subtype?: string;
  isError?: boolean;
  turns: number;
  costUsdEstimate: number;
  permissionDenials: number;
  text: string;
}

export function claudeArgs(prompt: string, maxTurns: number): string[] {
  return [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--max-turns",
    String(maxTurns),
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    "Skill(refresh-atlas)",
    "--no-session-persistence",
  ];
}

/** The child environment: no API-key variables, so the subscription login is used. */
export function subscriptionEnv(base: NodeJS.ProcessEnv, extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, ...extra };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

export function runClaudeSession(options: ClaudeSessionOptions): Promise<ClaudeSessionResult> {
  const out: ClaudeSessionResult = {
    exitCode: null,
    turns: 0,
    costUsdEstimate: 0,
    permissionDenials: 0,
    text: "",
  };
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(out);
    };
    const child = spawn(
      options.command,
      [...(options.commandArgs ?? []), ...claudeArgs(options.prompt, options.maxTurns)],
      { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    const stop = (reason: string): void => {
      if (out.failure === undefined) out.failure = reason;
      child.kill();
    };
    const timer = setTimeout(
      () => stop(`the session ran longer than ${Math.round(options.timeoutMs / 60_000)} min and was stopped`),
      options.timeoutMs,
    );
    let stderr = "";
    child.stderr?.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString("utf8")).slice(-4000);
    });
    child.on("error", (err) => {
      out.failure =
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? `could not start '${options.command}': Claude Code is not on PATH. Install it, or set CONTEXTATLAS_CLAUDE_BIN to its path.`
          : `could not start '${options.command}': ${String(err)}`;
      finish();
    });
    const lines = createInterface({ input: child.stdout! });
    lines.on("line", (line) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }
      readEvent(event, out, stop);
    });
    child.on("close", (code) => {
      out.exitCode = out.failure !== undefined && code !== 0 ? null : code;
      if (out.subtype === undefined && out.failure === undefined) {
        out.failure = `the session ended without a result (exit ${code}): ${stderr.trim().slice(-500)}`;
      }
      finish();
    });
  });
}

function readEvent(
  event: Record<string, unknown>,
  out: ClaudeSessionResult,
  stop: (reason: string) => void,
): void {
  if (event.type === "system" && event.subtype === "init") {
    out.apiKeySource = String(event.apiKeySource ?? "unknown");
    if (out.apiKeySource !== "none") {
      stop(
        `the session would authenticate with ${out.apiKeySource}, which bills API usage; Tier 1 ` +
          "runs only on the Claude subscription. Remove the API key from Claude Code's settings " +
          "(or log in with `claude /login`) and retry.",
      );
    }
    return;
  }
  if (event.type === "rate_limit_event") {
    const info = event.rate_limit_info as
      | { unifiedWindows?: Record<string, { utilization?: number; resetsAt?: number }> }
      | undefined;
    const windows = info?.unifiedWindows ?? {};
    const pick = (k: string): UsageWindow | undefined => {
      const w = windows[k];
      return typeof w?.utilization === "number" && typeof w.resetsAt === "number"
        ? { utilization: w.utilization, resetsAt: w.resetsAt }
        : undefined;
    };
    const five = pick("five_hour");
    const seven = pick("seven_day");
    out.usage = { ...(five ? { five_hour: five } : {}), ...(seven ? { seven_day: seven } : {}) };
    return;
  }
  if (event.type === "result") {
    out.subtype = String(event.subtype ?? "");
    out.isError = event.is_error === true;
    out.turns = typeof event.num_turns === "number" ? event.num_turns : 0;
    out.costUsdEstimate = typeof event.total_cost_usd === "number" ? event.total_cost_usd : 0;
    out.permissionDenials = Array.isArray(event.permission_denials) ? event.permission_denials.length : 0;
    out.text = typeof event.result === "string" ? event.result : "";
  }
}
