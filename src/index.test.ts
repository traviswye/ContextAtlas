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
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin, resolve as pathResolve } from "node:path";

import {
  Client,
  type JSONRPCMessage,
  type Transport,
} from "@modelcontextprotocol/client";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/core";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { insertClaim, listAllClaims, setSourceSha } from "./storage/claims.js";
import { openDatabase } from "./storage/db.js";

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
   * Half-close the child's stdin (EOF — what an MCP client does first
   * at shutdown) and resolve with the exit code once the process
   * exits, or `null` if it is still running after `timeoutMs`.
   */
  async endStdinAndWaitForExit(timeoutMs: number): Promise<number | null> {
    const child = this.child;
    if (!child) throw new Error("Transport not started");
    if (child.exitCode !== null) return child.exitCode;
    return await new Promise<number | null>((resolve) => {
      const onExit = (code: number | null): void => {
        clearTimeout(timer);
        resolve(code);
      };
      const timer = setTimeout(() => {
        child.off("exit", onExit);
        resolve(null);
      }, timeoutMs);
      child.once("exit", onExit);
      child.stdin?.end();
    });
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

  it("logs the SDK max protocol version at startup and the negotiated version once the client initializes", async () => {
    // The v2 Client used here requests 2025-11-25; SDK v2 echoes it
    // (0.5.0 always answered 2024-11-05). The startup line is the SDK
    // ceiling only — the per-client line is what was negotiated. Both
    // go to stderr; stdout carries only JSON-RPC.
    await vi.waitFor(
      () => {
        expect(transport.stderrBuffer).toMatch(
          /MCP client initialized \(negotiated protocol version: 2025-11-25\)/,
        );
      },
      { timeout: 5_000, interval: 25 },
    );
    const stderr = transport.stderrBuffer;
    expect(stderr).toMatch(
      /MCP SDK max supported protocol version: \d{4}-\d{2}-\d{2}/,
    );
    expect(stderr).toMatch(
      /"clientName":"smoke-test-client","clientVersion":"0\.0\.1"/,
    );
  });

  it("get_symbol_context returns a bundle for a known symbol", async () => {
    // SmokeTestSymbol is defined in the fixture atlas.json. This is
    // the canary for the "server not initialized" regression: if
    // the binary didn't wire runtime context, the handler would
    // throw ProtocolError and this call would reject.
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

// ---------------------------------------------------------------------------
// Stdio lifecycle (MCP SDK v2). The v2 StdioServerTransport closes itself
// when stdin reaches EOF; index.ts wires server.onclose to the same
// run-once teardown as SIGINT/SIGTERM so the process exits instead of
// lingering on the language-server child. (SDK 0.5.0 ignored EOF and
// never exited.) Requests still in flight at EOF are aborted by the SDK
// and not answered — clients keep stdin open until they have read
// their responses.
// ---------------------------------------------------------------------------

describe("MCP server binary stdio lifecycle (SDK v2)", () => {
  let fixtureRoot: string;
  let transport: TestSubprocessTransport;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(pathJoin(tmpdir(), "ca-smoke-life-"));
    cpSync(FIXTURE_SRC, fixtureRoot, { recursive: true });
    transport = new TestSubprocessTransport(
      process.execPath,
      [DIST_ENTRY],
      fixtureRoot,
    );
  });

  afterEach(async () => {
    await transport.close();
    rmWithRetry(fixtureRoot);
  });

  it("exits cleanly (code 0, full teardown) when the client closes stdin after initialize", async () => {
    const client = new Client(
      { name: "eof-client", version: "0.0.1" },
      { capabilities: {} },
    );
    await client.connect(transport);
    // One round-trip so the server is demonstrably serving before EOF.
    const tools = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema,
    );
    expect(tools.tools).toHaveLength(3);

    const exitCode = await transport.endStdinAndWaitForExit(15_000);
    expect(exitCode).toBe(0);
    expect(transport.stderrBuffer).toMatch(
      /Received stdin (EOF|close), shutting down/,
    );
    // Teardown ran exactly once. (The run-once guard itself matters on
    // the SIGINT/SIGTERM path, where shutdown's server.close() fires
    // onclose; child.kill() on Windows is not a catchable signal, so
    // that path is not exercised here.)
    expect(
      transport.stderrBuffer.match(/shutting down/g) ?? [],
    ).toHaveLength(1);
  }, 30_000);

  it("warns instead of logging 'MCP client initialized' when notifications/initialized follows a failed initialize", async () => {
    const received: JSONRPCMessage[] = [];
    transport.onmessage = (m) => received.push(m);
    await transport.start();

    // clientInfo is required — the SDK rejects this initialize.
    await transport.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {} },
    });
    await vi.waitFor(
      () => {
        expect(received.some((m) => "id" in m && m.id === 1)).toBe(true);
      },
      { timeout: 15_000, interval: 25 },
    );
    const reply = received.find((m) => "id" in m && m.id === 1);
    expect(reply !== undefined && "error" in reply).toBe(true);

    await transport.send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    await vi.waitFor(
      () => {
        expect(transport.stderrBuffer).toMatch(
          /notifications\/initialized without a successful initialize handshake/,
        );
      },
      { timeout: 5_000, interval: 25 },
    );
    expect(transport.stderrBuffer).not.toMatch(/MCP client initialized/);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Startup loading and hot reload (v1.2 Phase 4; seed-only before)
// ---------------------------------------------------------------------------

/** Starts the server binary and connects a client; caller closes both. */
async function connectBinary(
  root: string,
  clientOptions: ConstructorParameters<typeof Client>[1] = { capabilities: {} },
): Promise<{ transport: TestSubprocessTransport; client: Client }> {
  const transport = new TestSubprocessTransport(process.execPath, [DIST_ENTRY], root);
  const client = new Client({ name: "reload-client", version: "0.0.1" }, clientOptions);
  await client.connect(transport);
  await vi.waitFor(
    () => expect(transport.stderrBuffer).toMatch(/Server ready/),
    { timeout: 10_000, interval: 25 },
  );
  return { transport, client };
}

async function findByIntent(client: Client, query: string): Promise<string> {
  const result = await client.request(
    { method: "tools/call", params: { name: "find_by_intent", arguments: { query } } },
    CallToolResultSchema,
  );
  return (result.content[0] as { text: string }).text;
}

/** Seeds the fixture cache with a claim atlas.json does not hold. */
function seedCacheOnlyClaim(root: string): void {
  const db = openDatabase(pathJoin(root, ".contextatlas", "index.db"));
  setSourceSha(db, "docs/adr/ADR-01.md", "cache-sha");
  insertClaim(db, {
    source: "adr:ADR-01.md",
    sourcePath: "docs/adr/ADR-01.md",
    sourceSha: "cache-sha",
    severity: "hard",
    claim: "claim only the cache holds",
    symbolIds: [],
  });
  db.close();
}

function cacheClaims(root: string): string[] {
  const db = openDatabase(pathJoin(root, ".contextatlas", "index.db"));
  try {
    return listAllClaims(db).map((c) => c.claim);
  } finally {
    db.close();
  }
}

describe("MCP server binary: atlas loading and hot reload (v1.2 Phase 4)", () => {
  let root: string;
  const atlasPath = () => pathJoin(root, ".contextatlas", "atlas.json");
  const rewriteAtlas = (generatedAt: string, claim: string): void => {
    const atlas = JSON.parse(readFileSync(atlasPath(), "utf8")) as {
      generated_at: string;
      claims: { claim: string }[];
    };
    atlas.generated_at = generatedAt;
    atlas.claims[0]!.claim = claim;
    writeFileSync(atlasPath(), JSON.stringify(atlas, null, 2));
  };

  beforeEach(() => {
    root = mkdtempSync(pathJoin(tmpdir(), "ca-smoke-reload-"));
    cpSync(FIXTURE_SRC, root, { recursive: true });
  });
  afterEach(() => {
    rmWithRetry(root);
  });

  it("committed: true imports atlas.json at startup unless the cache holds it, then reloads on change while serving", async () => {
    seedCacheOnlyClaim(root);
    const { transport, client } = await connectBinary(root);
    try {
      // The cache did not hold atlas.json: imported over it at startup.
      expect(transport.stderrBuffer).toMatch(/atlas reload: atlas\.json changed; re-imported/);
      expect(await findByIntent(client, "query serving")).toMatch(/^MATCHES 1 /);

      // A pull rewrites atlas.json while the server runs.
      rewriteAtlas("2026-10-14T00:00:00.000Z", "Hot reload swaps the served atlas without a restart");
      await vi.waitFor(
        async () => expect(await findByIntent(client, "hot reload swaps")).toMatch(/^MATCHES 1 /),
        { timeout: 10_000, interval: 100 },
      );
      // The replaced claim text is gone (its rationale still says "binary smoke").
      expect(await findByIntent(client, "query serving")).toMatch(/^MATCHES 0 /);

      // A malformed write keeps the previous atlas and warns.
      writeFileSync(atlasPath(), "{ truncated");
      await vi.waitFor(
        () => expect(transport.stderrBuffer).toMatch(/keeps serving the previous atlas/),
        { timeout: 10_000, interval: 100 },
      );
      expect(await findByIntent(client, "hot reload swaps")).toMatch(/^MATCHES 1 /);
    } finally {
      await client.close().catch(() => {});
      await transport.close();
    }

    // Restoring the fixture atlas.json (an older generated_at than the
    // cache's) re-imports at the next start; the start after that finds
    // the cache current.
    rewriteAtlasFromFixture();
    const again = await connectBinary(root);
    try {
      expect(again.transport.stderrBuffer).toMatch(/re-imported/);
    } finally {
      await again.client.close().catch(() => {});
      await again.transport.close();
    }
    const third = await connectBinary(root);
    try {
      expect(third.transport.stderrBuffer).toMatch(/matches atlas\.json/);
      expect(third.transport.stderrBuffer).not.toMatch(/re-imported/);
    } finally {
      await third.client.close().catch(() => {});
      await third.transport.close();
    }
  }, 90_000);

  function rewriteAtlasFromFixture(): void {
    cpSync(pathJoin(FIXTURE_SRC, ".contextatlas", "atlas.json"), atlasPath());
  }

  it("skips an atlas.json whose generated_at the cache already holds (a contextatlas index checkpoint)", async () => {
    const { transport, client } = await connectBinary(root);
    try {
      // Simulate `contextatlas index` sharing the cache: it stores a unit,
      // stamps generated_at, then writes the checkpoint atlas.json.
      const db = openDatabase(pathJoin(root, ".contextatlas", "index.db"));
      insertClaim(db, {
        source: "adr:ADR-02.md",
        sourcePath: "docs/adr/ADR-02.md",
        sourceSha: "unit-sha",
        severity: "hard",
        claim: "unit stored after the checkpoint",
        symbolIds: [],
      });
      db.prepare("UPDATE atlas_meta SET value = ? WHERE key = 'generated_at'").run(
        "2026-10-14T01:00:00.000Z",
      );
      db.close();
      rewriteAtlas("2026-10-14T01:00:00.000Z", "checkpoint claim");
      await new Promise((r) => setTimeout(r, 1_500));
      expect(transport.stderrBuffer.match(/re-imported/g) ?? []).toHaveLength(1);
    } finally {
      await client.close().catch(() => {});
      await transport.close();
    }
    expect(cacheClaims(root)).toContain("unit stored after the checkpoint");
  }, 60_000);

  it("committed: false seeds only an empty cache, never reloads, and says how to load atlas.json", async () => {
    const config = pathJoin(root, ".contextatlas.yml");
    writeFileSync(config, readFileSync(config, "utf8").replace("committed: true", "committed: false"));
    seedCacheOnlyClaim(root);
    const { transport, client } = await connectBinary(root);
    try {
      expect(transport.stderrBuffer).toMatch(/Using existing local cache/);
      expect(transport.stderrBuffer).not.toMatch(/re-imported|Importing atlas\.json/);
      const hint = transport.stderrBuffer
        .split("\n")
        .find((l) => /is not the atlas the local cache holds/.test(l));
      expect(hint).toMatch(/\[warn\]/);
      expect(hint).toMatch(/atlas\.committed: false the local cache is the source of truth/);
      expect(hint).toMatch(/delete the local cache \(.*index\.db\)/);
      expect(hint).toMatch(/set atlas\.committed: true/);

      rewriteAtlas("2026-10-14T00:00:00.000Z", "never loaded");
      await new Promise((r) => setTimeout(r, 1_500));
      expect(transport.stderrBuffer).not.toMatch(/re-imported/);
    } finally {
      await client.close().catch(() => {});
      await transport.close();
    }
    expect(cacheClaims(root)).toEqual(["claim only the cache holds"]);
  }, 60_000);

  it("serves a 2026-07-28 client that opens with server/discover (serveStdio)", async () => {
    const { transport, client } = await connectBinary(root, {
      capabilities: {},
      versionNegotiation: { mode: "auto" },
    });
    try {
      expect(client.getProtocolEra()).toBe("modern");
      expect(await findByIntent(client, "binary smoke")).toMatch(/^MATCHES 1 /);
      expect(transport.stderrBuffer).toMatch(/serving protocol revision 2026-07-28/);
    } finally {
      await client.close().catch(() => {});
      await transport.close();
    }
  }, 30_000);
});
