import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  resolveContextAtlasBinary,
  upsertMcpRegistration,
} from "./mcp-registration.js";

describe("upsertMcpRegistration — idempotent .mcp.json upsert (Q4.0.10 lock)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "mcp-registration-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("creates fresh .mcp.json when absent (status: 'registered')", async () => {
    const result = upsertMcpRegistration({
      configRoot: tmpRoot,
      binaryPathOverride: "/abs/path/dist/index.js",
    });
    expect(result.status).toBe("registered");
    expect(result.path).toBe(path.resolve(tmpRoot, ".mcp.json"));

    const written = JSON.parse(await readFile(result.path, "utf8")) as {
      mcpServers: { contextatlas: { command: string; args: string[] } };
    };
    expect(written.mcpServers.contextatlas).toEqual({
      command: "node",
      args: ["/abs/path/dist/index.js"],
    });
  });

  it("preserves contextatlas entry when present (status: 'preserved')", async () => {
    const existingContent = JSON.stringify(
      {
        mcpServers: {
          contextatlas: {
            command: "node",
            args: ["/custom/user/path/index.js"],
          },
        },
      },
      null,
      2,
    );
    const cfgPath = path.join(tmpRoot, ".mcp.json");
    await writeFile(cfgPath, existingContent, "utf8");

    const result = upsertMcpRegistration({
      configRoot: tmpRoot,
      binaryPathOverride: "/different/dist/index.js",
    });
    expect(result.status).toBe("preserved");

    // Existing user-customized path preserved (NOT overwritten).
    const onDisk = await readFile(cfgPath, "utf8");
    expect(onDisk).toBe(existingContent);
  });

  it("merges into existing mcpServers preserving other entries (status: 'merged')", async () => {
    const existing = {
      mcpServers: {
        otherServer: {
          command: "python",
          args: ["/other/server.py"],
        },
      },
    };
    const cfgPath = path.join(tmpRoot, ".mcp.json");
    await writeFile(cfgPath, JSON.stringify(existing, null, 2), "utf8");

    const result = upsertMcpRegistration({
      configRoot: tmpRoot,
      binaryPathOverride: "/abs/path/dist/index.js",
    });
    expect(result.status).toBe("merged");

    const merged = JSON.parse(await readFile(cfgPath, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(merged.mcpServers.otherServer).toEqual({
      command: "python",
      args: ["/other/server.py"],
    });
    expect(merged.mcpServers.contextatlas).toEqual({
      command: "node",
      args: ["/abs/path/dist/index.js"],
    });
  });

  it("throws actionable error on malformed JSON", async () => {
    const cfgPath = path.join(tmpRoot, ".mcp.json");
    await writeFile(cfgPath, "{ this is not json", "utf8");

    expect(() =>
      upsertMcpRegistration({
        configRoot: tmpRoot,
        binaryPathOverride: "/abs/path/dist/index.js",
      }),
    ).toThrow(/not valid JSON.*Fix or remove the file/);
  });

  it("throws actionable error on non-object existing shape (e.g., array)", async () => {
    const cfgPath = path.join(tmpRoot, ".mcp.json");
    await writeFile(cfgPath, JSON.stringify(["not", "an", "object"]), "utf8");

    expect(() =>
      upsertMcpRegistration({
        configRoot: tmpRoot,
        binaryPathOverride: "/abs/path/dist/index.js",
      }),
    ).toThrow(/unexpected shape/);
  });

  it("handles missing mcpServers field (treats as empty; merges in)", async () => {
    const cfgPath = path.join(tmpRoot, ".mcp.json");
    await writeFile(cfgPath, JSON.stringify({ otherTopLevel: "value" }), "utf8");

    const result = upsertMcpRegistration({
      configRoot: tmpRoot,
      binaryPathOverride: "/abs/path/dist/index.js",
    });
    expect(result.status).toBe("merged");

    const merged = JSON.parse(await readFile(cfgPath, "utf8")) as {
      otherTopLevel: string;
      mcpServers: { contextatlas: unknown };
    };
    expect(merged.otherTopLevel).toBe("value");
    expect(merged.mcpServers.contextatlas).toBeDefined();
  });

  it("writes pretty-printed JSON (2-space indent + trailing newline)", async () => {
    upsertMcpRegistration({
      configRoot: tmpRoot,
      binaryPathOverride: "/abs/path/dist/index.js",
    });
    const written = await readFile(path.join(tmpRoot, ".mcp.json"), "utf8");
    expect(written).toContain('  "mcpServers"'); // 2-space indent
    expect(written.endsWith("\n")).toBe(true); // trailing newline
  });
});

describe("resolveContextAtlasBinary — package walk-up (Q4.4.6 lock)", () => {
  it("returns string ending in dist/index.js when package walk succeeds", () => {
    const resolved = resolveContextAtlasBinary();
    // Walk-up should find the contextatlas package.json at repo root;
    // result is <repo>/dist/index.js (whether or not the file exists
    // per Q4.4 Point 7 lock).
    expect(resolved).toMatch(/dist[/\\]index\.js$/);
  });
});
