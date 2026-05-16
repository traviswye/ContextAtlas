/**
 * Minimal LSP client for ContextAtlas adapters.
 *
 * Implements the LSP wire protocol directly over a subprocess's stdio:
 * Content-Length-framed JSON-RPC, request/response correlation by id,
 * notification handlers, server-initiated request stubbing, and a
 * shutdown/exit lifecycle.
 *
 * Per CLAUDE.md, we deliberately do NOT depend on vscode-jsonrpc or
 * vscode-languageclient — the subset we need is compact and easier to
 * reason about when we own the framing code.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Buffer } from "node:buffer";

import { log } from "../mcp/logger.js";

type JsonValue = unknown;

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string | null;
  method?: string;
  params?: JsonValue;
  result?: JsonValue;
  error?: { code: number; message: string; data?: unknown };
}

interface PendingRequest {
  resolve: (value: JsonValue) => void;
  reject: (err: Error) => void;
  timeoutHandle: NodeJS.Timeout;
  method: string;
}

export class LspClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private notificationHandlers = new Map<string, (params: JsonValue) => void>();
  private requestHandlers = new Map<
    string,
    (params: JsonValue) => JsonValue | Promise<JsonValue>
  >();
  private buffer: Buffer = Buffer.alloc(0);
  private readonly name: string;
  /**
   * Tracks whether {@link stop} was invoked. Distinguishes intentional
   * shutdown from unexpected subprocess exit per v0.7 Step 2.2.c FO-5
   * fix: when subprocess exits with `shuttingDown === false`, the
   * exit listener emits substantive remediation guidance to stderr
   * (Travis Lock 1 γ hybrid scope).
   */
  private shuttingDown = false;
  /**
   * Test seam — stderr writer used for unexpected-exit remediation
   * guidance. Default emits to `process.stderr`. Tests inject a fake
   * writer to capture output without polluting Vitest stderr.
   */
  private readonly writeStderr: (chunk: string) => void;
  /**
   * When true, emit substantive LSP message logging at info level
   * (method name + direction + payload truncated to 200 chars). Per
   * v0.7 Step 2.2.d FO-6 (β) diagnostic substrate — extends existing
   * `--verbose` CLI flag to adapter init paths for substantive
   * cohort self-diagnosis.
   */
  private readonly verbose: boolean;
  /**
   * Wall-clock timestamp (ms; Date.now()) at `start()` invocation;
   * null before start. Used by `getInitializeDuration()` for adapter
   * health diagnostic exposure to doctor checks.
   */
  private startedAtMs: number | null = null;
  /**
   * Wall-clock timestamp (ms) of first message received from server;
   * null if no message received yet. Used by `getFirstResponseLatency()`
   * for adapter health diagnostic.
   */
  private firstResponseAtMs: number | null = null;

  constructor(
    name: string,
    options: {
      writeStderr?: (chunk: string) => void;
      verbose?: boolean;
    } = {},
  ) {
    this.name = name;
    this.writeStderr =
      options.writeStderr ?? ((chunk) => process.stderr.write(chunk));
    this.verbose = options.verbose === true;
  }

  /**
   * Wall-clock duration (ms) from `start()` to first message received
   * from server. Null when subprocess hasn't started or no message
   * received yet. Per v0.7 Step 2.2.d FO-6 (β) diagnostic substrate.
   */
  getFirstResponseLatencyMs(): number | null {
    if (this.startedAtMs === null || this.firstResponseAtMs === null) {
      return null;
    }
    return this.firstResponseAtMs - this.startedAtMs;
  }

  /**
   * Wall-clock duration (ms) since `start()`. Null when subprocess
   * hasn't started. Per v0.7 Step 2.2.d FO-6 (β) diagnostic substrate.
   */
  getUptimeMs(): number | null {
    if (this.startedAtMs === null) return null;
    return Date.now() - this.startedAtMs;
  }

  start(command: string, args: string[], cwd: string): void {
    if (this.child) {
      throw new Error(`LSP client '${this.name}' is already started.`);
    }
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.startedAtMs = Date.now();
    if (this.verbose) {
      log.info(`[lsp:${this.name}] subprocess spawned (verbose mode)`, {
        command,
        args,
        cwd,
      });
    }
    child.stdout.on("data", (chunk: Buffer) => this.handleData(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      const msg = chunk.toString("utf8").trimEnd();
      if (msg.length > 0) {
        log.warn(`[lsp:${this.name}] ${msg}`);
      }
    });
    child.on("error", (err) => {
      log.error(`[lsp:${this.name}] subprocess error`, { err: String(err) });
    });
    // FO-5 fix (v0.7 Step 2.2.c): attach 'error' listener on stdin so
    // a closed-pipe write doesn't surface as an unhandled 'error'
    // event on the Socket (which previously crashed the Node process
    // with ERR_STREAM_WRITE_AFTER_END against substantial Python
    // codebases like Rich).
    child.stdin.on("error", (err) => {
      log.warn(`[lsp:${this.name}] stdin write error`, { err: String(err) });
    });
    child.on("exit", (code, signal) => {
      log.info(`[lsp:${this.name}] subprocess exited`, { code, signal });
      // FO-5 fix: when subprocess exits without `stop()` being called,
      // surface substantive remediation guidance to stderr per Travis
      // Lock 1 γ hybrid scope. Helps users distinguish "adapter exited
      // cleanly during normal shutdown" from "adapter crashed; expect
      // downstream friction".
      if (!this.shuttingDown) {
        this.writeStderr(
          `[warn] ${this.name} LSP subprocess exited unexpectedly ` +
            `(code ${code ?? "null"}, signal ${signal ?? "null"}). ` +
            `Adapter is in a degraded state; downstream operations ` +
            `(generate-adrs, index, doctor deep-health-check) may ` +
            `surface friction. If the subprocess is pyright, ` +
            `substantial codebases with unresolved imports or type ` +
            `errors may stress pyright's initial analysis pass — try ` +
            `narrowing the workspace via --config-root pointing at a ` +
            `smaller subdirectory, or install runtime dependencies ` +
            `(pip install -r requirements.txt) to resolve missing ` +
            `imports. Open an issue at ` +
            `https://github.com/traviswye/ContextAtlas if behavior is ` +
            `unexpected.\n`,
        );
      }
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeoutHandle);
        pending.reject(
          new Error(
            `LSP subprocess exited before '${pending.method}' returned.`,
          ),
        );
      }
      this.pending.clear();
      this.child = null;
    });
  }

  request<T = JsonValue>(
    method: string,
    params?: JsonValue,
    timeoutMs = 30_000,
  ): Promise<T> {
    // FO-5 fix (v0.7 Step 2.2.c): preserve clear-error UX for
    // request callers by checking subprocess state up-front. sendRaw
    // itself is now defensive (no-op on closed state) — without this
    // upfront check, request() callers would block until the 30s
    // timeout fires rather than getting an immediate rejection.
    if (!this.child) {
      return Promise.reject(
        new Error(`LSP client '${this.name}' is not started.`),
      );
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `LSP request '${method}' timed out after ${timeoutMs}ms on '${this.name}'.`,
          ),
        );
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timeoutHandle,
        method,
      });
      this.sendRaw({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params?: JsonValue): void {
    this.sendRaw({ jsonrpc: "2.0", method, params });
  }

  onNotification(method: string, handler: (params: JsonValue) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  onRequest(
    method: string,
    handler: (params: JsonValue) => JsonValue | Promise<JsonValue>,
  ): void {
    this.requestHandlers.set(method, handler);
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    this.shuttingDown = true;
    const child = this.child;
    try {
      await this.request("shutdown", null, 5_000);
    } catch {
      // Server may have already closed or misbehaved; we still try to exit cleanly.
    }
    try {
      this.notify("exit");
    } catch {
      // stdin may already be closed.
    }
    const exited = new Promise<void>((resolve) => {
      child.on("exit", () => resolve());
    });
    try {
      child.stdin.end();
    } catch {
      // Already ended.
    }
    const timed = new Promise<void>((resolve) => setTimeout(resolve, 2_000));
    await Promise.race([exited, timed]);
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
    this.child = null;
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const headerText = this.buffer.subarray(0, headerEnd).toString("utf8");
      const match = /Content-Length:\s*(\d+)/i.exec(headerText);
      if (!match) {
        log.error(
          `[lsp:${this.name}] message missing Content-Length header; dropping buffer`,
        );
        this.buffer = Buffer.alloc(0);
        return;
      }
      const length = parseInt(match[1]!, 10);
      const total = headerEnd + 4 + length;
      if (this.buffer.length < total) break;
      const payload = this.buffer
        .subarray(headerEnd + 4, total)
        .toString("utf8");
      this.buffer = this.buffer.subarray(total);
      this.dispatch(payload);
    }
  }

  private dispatch(payload: string): void {
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(payload) as JsonRpcMessage;
    } catch (err) {
      log.error(`[lsp:${this.name}] failed to parse message`, {
        err: String(err),
      });
      return;
    }
    // Track first-response timestamp for adapter health diagnostic
    // per v0.7 Step 2.2.d FO-6 (β) diagnostic substrate.
    if (this.firstResponseAtMs === null) {
      this.firstResponseAtMs = Date.now();
    }
    if (this.verbose) {
      log.info(`[lsp:${this.name}] ← received`, {
        method: msg.method,
        id: msg.id,
        hasResult: msg.result !== undefined,
        hasError: msg.error !== undefined,
        preview: payload.slice(0, 200),
      });
    }
    // Response to one of our requests
    if (
      typeof msg.id === "number" &&
      msg.method === undefined &&
      (msg.result !== undefined || msg.error !== undefined)
    ) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timeoutHandle);
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(
          new Error(
            `LSP '${pending.method}' error ${msg.error.code}: ${msg.error.message}`,
          ),
        );
      } else {
        pending.resolve(msg.result ?? null);
      }
      return;
    }
    // Server-initiated request
    if (msg.method !== undefined && msg.id !== undefined && msg.id !== null) {
      const handler = this.requestHandlers.get(msg.method);
      const reqId = msg.id;
      const respond = (result: JsonValue): void => {
        this.sendRaw({ jsonrpc: "2.0", id: reqId, result });
      };
      if (handler) {
        Promise.resolve(handler(msg.params ?? null))
          .then(respond)
          .catch((err: unknown) => {
            this.sendRaw({
              jsonrpc: "2.0",
              id: reqId,
              error: { code: -32603, message: String(err) },
            });
          });
      } else {
        respond(null);
      }
      return;
    }
    // Notification
    if (msg.method !== undefined) {
      const handler = this.notificationHandlers.get(msg.method);
      if (handler) {
        try {
          handler(msg.params ?? null);
        } catch (err) {
          log.error(`[lsp:${this.name}] notification handler threw`, {
            method: msg.method,
            err: String(err),
          });
        }
      }
    }
  }

  private sendRaw(msg: JsonRpcMessage): void {
    // FO-5 fix (v0.7 Step 2.2.c): defensive write guards prevent the
    // pre-fix crash path where async server-response handlers fire
    // AFTER the subprocess has exited or closed stdin. Pre-fix
    // sendRaw threw on `!this.child` (uncaught when called from the
    // `.then(respond)` chain in dispatch()) and an unguarded write
    // on a closed stdin surfaced as ERR_STREAM_WRITE_AFTER_END /
    // unhandled 'error' event on Socket = crash.
    if (!this.child) {
      log.warn(
        `[lsp:${this.name}] sendRaw called after subprocess exited; dropping message`,
        { method: msg.method ?? "<response>" },
      );
      return;
    }
    const stdin = this.child.stdin;
    if (!stdin.writable || stdin.writableEnded) {
      log.warn(
        `[lsp:${this.name}] sendRaw called but stdin is not writable; dropping message`,
        { method: msg.method ?? "<response>" },
      );
      return;
    }
    const json = JSON.stringify(msg);
    const payload = Buffer.from(json, "utf8");
    const header = `Content-Length: ${payload.length}\r\n\r\n`;
    if (this.verbose) {
      log.info(`[lsp:${this.name}] → sent`, {
        method: msg.method,
        id: msg.id,
        preview: json.slice(0, 200),
      });
    }
    try {
      stdin.write(header);
      stdin.write(payload);
    } catch (err) {
      log.warn(
        `[lsp:${this.name}] sendRaw write failed; dropping message`,
        { method: msg.method ?? "<response>", err: String(err) },
      );
    }
  }
}
