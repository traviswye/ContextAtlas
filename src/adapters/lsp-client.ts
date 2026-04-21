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

  constructor(name: string) {
    this.name = name;
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
    child.on("exit", (code, signal) => {
      log.info(`[lsp:${this.name}] subprocess exited`, { code, signal });
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
      try {
        this.sendRaw({ jsonrpc: "2.0", id, method, params });
      } catch (err) {
        clearTimeout(timeoutHandle);
        this.pending.delete(id);
        reject(err as Error);
      }
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
    if (!this.child) {
      throw new Error(`LSP client '${this.name}' is not started.`);
    }
    const json = JSON.stringify(msg);
    const payload = Buffer.from(json, "utf8");
    const header = `Content-Length: ${payload.length}\r\n\r\n`;
    this.child.stdin.write(header);
    this.child.stdin.write(payload);
  }
}
