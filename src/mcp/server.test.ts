import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TOOL_NAMES } from "./schemas.js";
import { createServer } from "./server.js";

describe("MCP server skeleton", () => {
  let client: Client;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    server = createServer({ name: "ContextAtlas", version: "0.0.1-test" });
    client = new Client(
      { name: "test-client", version: "0.0.1" },
      { capabilities: {} },
    );
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("registers all three tools via tools/list", async () => {
    const result = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema,
    );
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        TOOL_NAMES.findByIntent,
        TOOL_NAMES.getSymbolContext,
        TOOL_NAMES.impactOfChange,
      ].sort(),
    );
  });

  it("each tool advertises a JSON Schema inputSchema with required fields", async () => {
    const result = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema,
    );
    const byName = new Map(result.tools.map((t) => [t.name, t]));

    const symCtx = byName.get(TOOL_NAMES.getSymbolContext);
    expect(symCtx?.inputSchema.required).toContain("symbol");
    const symCtxProps = (symCtx?.inputSchema.properties ?? {}) as Record<
      string,
      unknown
    >;
    expect(symCtxProps).toHaveProperty("symbol");
    expect(symCtxProps).toHaveProperty("file_hint");
    expect(symCtxProps).toHaveProperty("depth");
    expect(symCtxProps).toHaveProperty("include");
    expect(symCtxProps).toHaveProperty("max_refs");

    const find = byName.get(TOOL_NAMES.findByIntent);
    expect(find?.inputSchema.required).toContain("query");

    const impact = byName.get(TOOL_NAMES.impactOfChange);
    expect(impact?.inputSchema.required).toContain("symbol");
  });

  it.each([
    TOOL_NAMES.getSymbolContext,
    TOOL_NAMES.findByIntent,
    TOOL_NAMES.impactOfChange,
  ])("placeholder handler for %s returns a 'not yet implemented' error", async (toolName) => {
    await expect(
      client.request(
        {
          method: "tools/call",
          params: {
            name: toolName,
            arguments:
              toolName === TOOL_NAMES.findByIntent
                ? { query: "dummy" }
                : { symbol: "Dummy" },
          },
        },
        CallToolResultSchema,
      ),
    ).rejects.toThrow(/not yet implemented/);
  });

  it("unknown tool name returns MethodNotFound-shaped error", async () => {
    await expect(
      client.request(
        {
          method: "tools/call",
          params: { name: "no_such_tool", arguments: {} },
        },
        CallToolResultSchema,
      ),
    ).rejects.toThrow(/Unknown tool/);
  });
});
