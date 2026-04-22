/**
 * Binary smoke test for the ContextAtlas MCP server.
 *
 * Spawns the real built `dist/index.js` as a subprocess, drives it
 * via raw stdio JSON-RPC, and validates that an actual tools/call
 * for `get_symbol_context` returns a bundle — not a "server not
 * initialized" error.
 *
 * Closes a testing gap caught during benchmarks integration: every
 * existing test exercised handlers programmatically via InMemoryTransport,
 * but none of them exercised the binary entry point in `src/index.ts`
 * end-to-end via stdio. A bug where `index.ts` failed to pass
 * runtime context to `createServer` slipped through all unit tests
 * but broke every actual invocation of the shipped binary.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin, resolve as pathResolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  type JSONRPCMessage,
} from "@modelcontextprotocol/sdk/types.js";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const FIXTURE_SRC = pathResolve("test/fixtures/server-binary");
const DIST_ENTRY = pathResolve("dist/index.js");

/**
 * Minimal Transport impl mirroring MCP's newline-delimited JSON
 * wire format. Written inline because the SDK's StdioClientTransport
 * doesn't accept `cwd`, and the test needs to spawn the server in a
 * tmp fixture dir (where its .contextatlas.yml lives) rather than
 * the test-runner's cwd.
 */
class TestSubprocessTransport implements Transport {
  private child: ChildProcess | null = null;
  private buffer = "";
  onmessage?: (m: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (err: Error) => void;

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly cwd: string,
  ) {}

  async start(): Promise<void> {
    const child = spawn(this.command, this.args, {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout?.on("data", (chunk: Buffer) => this.handleData(chunk));
    child.stderr?.on("data", () => {
      // Discard server logs during tests. Uncomment for debugging:
      // process.stderr.write(chunk);
    });
    child.on("exit", () => this.onclose?.());
    child.on("error", (err) => this.onerror?.(err));
    await new Promise<void>((resolve, reject) => {
      const onSpawn = (): void => {
        child.off("error", onError);
        resolve();
      };
      const onError = (err: Error): void => {
        child.off("spawn", onSpawn);
        reject(err);
      };
      child.once("spawn", onSpawn);
      child.once("error", onError);
    });
  }

  private handleData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JSONRPCMessage;
        this.onmessage?.(msg);
      } catch {
        // Non-protocol line (shouldn't occur with our server, but
        // if it does we swallow it rather than crashing the test).
      }
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.child?.stdin) throw new Error("Transport not started");
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }

  /**
   * Wait for the subprocess to fully exit before resolving. Matters
   * on Windows, where rmSync on the subprocess's cwd throws EBUSY
   * until the process releases its handles.
   */
  async close(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const onExit = (): void => resolve();
      child.once("exit", onExit);
      child.kill();
      setTimeout(() => {
        child.off("exit", onExit);
        resolve();
      }, 2000).unref();
    });
  }
}

function rmWithRetry(path: string, retries = 5): void {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EBUSY" || code === "ENOTEMPTY" || code === "EPERM") {
        // Windows can hold handles briefly after subprocess exit.
        // Short sync wait between retries.
        const end = Date.now() + 100;
        while (Date.now() < end) {
          // busy-wait — Atomics.wait would be cleaner but needs SAB.
        }
        continue;
      }
      throw err;
    }
  }
}

describe("MCP server binary smoke test", () => {
  let fixtureRoot: string;
  let client: Client;
  let transport: TestSubprocessTransport;

  beforeAll(() => {
    // Build dist/ if it's missing (dev loop where someone forgot to
    // build). CI typically runs npm run build before tests, but this
    // makes local dev friendlier.
    if (!existsSync(DIST_ENTRY)) {
      const result = spawnSync("npm", ["run", "build"], {
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      if (result.status !== 0) {
        throw new Error("Failed to build dist/ before smoke test");
      }
    }
  }, 60_000);

  beforeEach(async () => {
    // Copy the committed fixture into a tmp dir so test runs don't
    // pollute the committed atlas/cache state between iterations.
    fixtureRoot = mkdtempSync(pathJoin(tmpdir(), "ca-smoke-"));
    cpSync(FIXTURE_SRC, fixtureRoot, { recursive: true });

    transport = new TestSubprocessTransport(
      process.execPath,
      [DIST_ENTRY],
      fixtureRoot,
    );
    client = new Client(
      { name: "smoke-test-client", version: "0.0.1" },
      { capabilities: {} },
    );
    await client.connect(transport);
  }, 30_000);

  afterEach(async () => {
    await client.close().catch(() => {});
    rmWithRetry(fixtureRoot);
  });

  afterAll(() => {
    // Nothing — each test handles its own cleanup.
  });

  it("initialize succeeds and tools/list returns the three registered tools", async () => {
    const result = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema,
    );
    const names = result.tools.map((t) => t.name);
    // get_symbol_context is implemented; find_by_intent and
    // impact_of_change intentionally throw McpError until their
    // handlers are implemented (main-repo steps 8 and 10). They
    // still appear in tools/list because registering them lets the
    // client discover the full surface.
    expect(names.sort()).toEqual([
      "find_by_intent",
      "get_symbol_context",
      "impact_of_change",
    ]);
  });

  it("get_symbol_context returns a bundle for a known symbol", async () => {
    // SmokeTestSymbol is defined in the fixture atlas.json. This is
    // the canary for the "server not initialized" regression: if
    // the binary didn't wire runtime context, the handler would
    // throw McpError and this call would reject.
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "get_symbol_context",
          arguments: { symbol: "SmokeTestSymbol" },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^SYM SmokeTestSymbol@/);
    expect(text).toMatch(/class SmokeTestSymbol/);
    expect(text).toMatch(/INTENT ADR-SMOKE hard/);
  });

  it("get_symbol_context returns ERR not_found for an unknown symbol", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "get_symbol_context",
          arguments: { symbol: "DoesNotExistAnywhere" },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/ERR not_found/);
  });
});
