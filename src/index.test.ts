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
  /**
   * Captured stderr across the subprocess's lifetime. Tests that need
   * to assert on log output (adapter init path, etc.) read this after
   * the subprocess exits or after any log line they care about has
   * definitely flushed.
   */
  stderrBuffer = "";
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
    child.stderr?.on("data", (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString("utf8");
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

  it("find_by_intent returns a ranked MATCHES list from the fixture atlas (ADR-09)", async () => {
    // The fixture's atlas.json contains one claim:
    //   "SmokeTestSymbol exists so the binary smoke test can validate
    //    end-to-end query serving"
    // A query for "binary smoke" hits both tokens in that claim.
    // This is the canary that the v2 FTS5 migration runs correctly
    // when atlas.json imports into a fresh cache, and that the
    // find_by_intent handler is wired end-to-end.
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "find_by_intent",
          arguments: { query: "binary smoke" },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^MATCHES 1 \[query="binary smoke"\]/);
    expect(text).toMatch(/SYM sym:ts:src\/smoke\.ts:SmokeTestSymbol/);
    expect(text).toMatch(/INTENT ADR-SMOKE hard/);
  });

  it("find_by_intent returns MATCHES 0 for a query that has no hits", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "find_by_intent",
          arguments: { query: "totally unrelated phrase xyz" },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^MATCHES 0 /);
  });

  it("find_by_intent JSON format round-trips through the binary end-to-end (ADR-09)", async () => {
    // Binary smoke coverage for format: "json" — ensures the
    // handler's format-dispatch code path is exercised by a real
    // subprocess call, not just InMemoryTransport tests.
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "find_by_intent",
          arguments: { query: "binary smoke", format: "json" },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as {
      matches: Array<{
        symbolId: string;
        name: string;
        matchedIntent: { source: string; severity: string };
      }>;
    };
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0]?.name).toBe("SmokeTestSymbol");
    expect(parsed.matches[0]?.matchedIntent.source).toBe("ADR-SMOKE");
    expect(parsed.matches[0]?.matchedIntent.severity).toBe("hard");
  });
});

// ---------------------------------------------------------------------------
// ADR-08 runtime: --config-root flag + optional source.root config field.
// ---------------------------------------------------------------------------

describe("MCP server binary with --config-root (ADR-08 runtime)", () => {
  let configDir: string;
  let runDir: string;
  let client: Client;
  let transport: TestSubprocessTransport;

  beforeEach(async () => {
    // Two separate tmp dirs: the binary runs in `runDir` as cwd, and
    // reads config from `configDir` via --config-root. Proves the
    // flag actually threads through rather than silently defaulting
    // to cwd (which has no config).
    configDir = mkdtempSync(pathJoin(tmpdir(), "ca-smoke-cfg-"));
    runDir = mkdtempSync(pathJoin(tmpdir(), "ca-smoke-run-"));
    cpSync(FIXTURE_SRC, configDir, { recursive: true });

    transport = new TestSubprocessTransport(
      process.execPath,
      [DIST_ENTRY, "--config-root", configDir],
      runDir,
    );
    client = new Client(
      { name: "smoke-test-client", version: "0.0.1" },
      { capabilities: {} },
    );
    await client.connect(transport);
  }, 30_000);

  afterEach(async () => {
    await client.close().catch(() => {});
    rmWithRetry(configDir);
    rmWithRetry(runDir);
  });

  it("serves get_symbol_context from atlas at --config-root (not cwd)", async () => {
    // runDir (the binary's cwd) has NO .contextatlas.yml. If
    // --config-root is being ignored and the binary falls back to
    // cwd, loadConfig would throw and the connect() in beforeEach
    // would fail. We're here, so the flag took effect.
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
  });

  it("logs configRoot and sourceRoot in startup lines (uses configRoot as source fallback)", async () => {
    // With no `source` block in the fixture, sourceRoot falls back to
    // configRoot. Both should appear in the startup log.
    //
    // Stderr accumulates async; give the server a brief moment beyond
    // connect() to flush its startup log lines.
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    const stderr = transport.stderrBuffer;
    expect(stderr).toMatch(new RegExp(`Config root: .*`));
    expect(stderr).toMatch(new RegExp(`Source root: .*`));
    // And the adapter init log includes the actual path the adapter
    // was initialized against. Matches refinement 3 — proves plumbing
    // reached the adapter, not just parsed config.
    expect(stderr).toMatch(/Initialized typescript adapter at /);
  });
});

describe("MCP server binary with source.root (ADR-08 runtime)", () => {
  let configDir: string;
  let client: Client;
  let transport: TestSubprocessTransport;

  beforeEach(async () => {
    // Fixture layout for this test:
    //   configDir/
    //     .contextatlas.yml       ← config with source: { root: "subsrc" }
    //     subsrc/                 ← empty src dir; adapter inits here
    //     .contextatlas/
    //       atlas.json            ← hand-crafted, reused from main fixture
    configDir = mkdtempSync(pathJoin(tmpdir(), "ca-smoke-src-"));
    cpSync(FIXTURE_SRC, configDir, { recursive: true });

    // Rewrite the fixture config to include the source block.
    const cfgYml = [
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
      "source:",
      "  root: subsrc",
      "",
    ].join("\n");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    writeFileSync(pathJoin(configDir, ".contextatlas.yml"), cfgYml, "utf8");
    mkdirSync(pathJoin(configDir, "subsrc"), { recursive: true });

    transport = new TestSubprocessTransport(
      process.execPath,
      [DIST_ENTRY, "--config-root", configDir],
      configDir,
    );
    client = new Client(
      { name: "smoke-test-client", version: "0.0.1" },
      { capabilities: {} },
    );
    await client.connect(transport);
  }, 30_000);

  afterEach(async () => {
    await client.close().catch(() => {});
    rmWithRetry(configDir);
  });

  it("initializes adapter against source.root (subsrc), not configRoot", async () => {
    // Stderr assertion is the canary: proves source.root threaded
    // through to adapter.initialize, not silently ignored. The path
    // logged is the absolute form; we match on the trailing segment.
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    const stderr = transport.stderrBuffer;
    expect(stderr).toMatch(
      /Initialized typescript adapter at .*[\\/]subsrc\b/,
    );
    // Also assert Source root log line distinguishes from Config
    // root — they should be different paths in this scenario.
    const configMatch = /Config root: (.*)/.exec(stderr);
    const sourceMatch = /Source root: (.*)/.exec(stderr);
    expect(configMatch).not.toBeNull();
    expect(sourceMatch).not.toBeNull();
    expect(sourceMatch?.[1]?.trim()).not.toBe(configMatch?.[1]?.trim());
    expect(sourceMatch?.[1]?.trim()).toMatch(/[\\/]subsrc\s*$/);
  });
});

describe("MCP server binary with --config (ADR-08 runtime)", () => {
  let configDir: string;
  let client: Client;
  let transport: TestSubprocessTransport;

  beforeEach(async () => {
    // Fixture with a non-default config filename. Mimics the
    // benchmarks-repo case where configs/hono.yml and configs/httpx.yml
    // coexist instead of a single .contextatlas.yml.
    configDir = mkdtempSync(pathJoin(tmpdir(), "ca-smoke-cfgfile-"));
    cpSync(FIXTURE_SRC, configDir, { recursive: true });

    // Move the default .contextatlas.yml to a non-default filename.
    // If the binary ignored --config and fell back to the default
    // name, it would fail to find any config and crash.
    const { renameSync } = await import("node:fs");
    renameSync(
      pathJoin(configDir, ".contextatlas.yml"),
      pathJoin(configDir, "my-config.yml"),
    );

    transport = new TestSubprocessTransport(
      process.execPath,
      [DIST_ENTRY, "--config-root", configDir, "--config", "my-config.yml"],
      configDir,
    );
    client = new Client(
      { name: "smoke-test-client", version: "0.0.1" },
      { capabilities: {} },
    );
    await client.connect(transport);
  }, 30_000);

  afterEach(async () => {
    await client.close().catch(() => {});
    rmWithRetry(configDir);
  });

  it("serves get_symbol_context from a config named other than .contextatlas.yml", async () => {
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
  });

  it("logs the resolved absolute config path including the non-default filename", async () => {
    // Diagnostic canary: any run should be able to answer "which
    // file loaded?" from the startup log, regardless of whether
    // --config was passed.
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    const stderr = transport.stderrBuffer;
    expect(stderr).toMatch(/Loaded config at .*[\\/]my-config\.yml\b/);
  });
});
