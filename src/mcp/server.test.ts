import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { insertClaims } from "../storage/claims.js";
import { openDatabase } from "../storage/db.js";
import { upsertSymbols } from "../storage/symbols.js";
import type {
  Diagnostic,
  LanguageAdapter,
  Reference,
  Symbol as AtlasSymbol,
  TypeInfo,
} from "../types.js";

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

  it("get_symbol_context without runtime context reports 'not initialized'", async () => {
    await expect(
      client.request(
        {
          method: "tools/call",
          params: {
            name: TOOL_NAMES.getSymbolContext,
            arguments: { symbol: "Dummy" },
          },
        },
        CallToolResultSchema,
      ),
    ).rejects.toThrow(/initialized with storage/);
  });

  it.each([TOOL_NAMES.findByIntent, TOOL_NAMES.impactOfChange])(
    "placeholder handler for %s returns 'not yet implemented'",
    async (toolName) => {
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
    },
  );

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

// ---------------------------------------------------------------------------
// End-to-end: get_symbol_context wired with real storage + stub adapter.
// ---------------------------------------------------------------------------

function stubAdapter(over: Partial<{
  refs: Reference[];
  types: TypeInfo;
  diagnostics: Diagnostic[];
}> = {}): LanguageAdapter {
  return {
    language: "typescript",
    extensions: [".ts"],
    async initialize() {},
    async shutdown() {},
    async listSymbols() {
      return [];
    },
    async getSymbolDetails() {
      return null;
    },
    async findReferences() {
      return over.refs ?? [];
    },
    async getDiagnostics() {
      return over.diagnostics ?? [];
    },
    async getTypeInfo() {
      return (
        over.types ?? { extends: [], implements: [], usedByTypes: [] }
      );
    },
  };
}

describe("MCP server with runtime context — get_symbol_context", () => {
  let client: Client;
  let server: ReturnType<typeof createServer>;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    const symbol: AtlasSymbol = {
      id: "sym:ts:src/orders/processor.ts:OrderProcessor",
      name: "OrderProcessor",
      kind: "class",
      path: "src/orders/processor.ts",
      line: 42,
      signature: "class OrderProcessor extends BaseProcessor<Order>",
      language: "typescript",
      fileSha: "abc",
    };
    upsertSymbols(db, [symbol]);
    insertClaims(db, [
      {
        source: "ADR-07",
        sourcePath: "docs/adr/ADR-07.md",
        sourceSha: "s",
        severity: "hard",
        claim: "must be idempotent",
        rationale: "enables safe retry",
        excerpt: "All order processing must be safely retryable.",
        symbolIds: [symbol.id],
      },
    ]);

    const adapter = stubAdapter({
      refs: [
        {
          id: "ref:ts:billing/charges.ts:88",
          symbolId: symbol.id,
          path: "billing/charges.ts",
          line: 88,
        },
      ],
    });
    server = createServer({
      name: "ContextAtlas",
      version: "0.0.1-test",
      context: {
        db,
        adapters: new Map([["typescript", adapter]]),
      },
    });
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
    db.close();
  });

  it("returns a compact bundle on happy-path lookup by full ID", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: "sym:ts:src/orders/processor.ts:OrderProcessor",
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^SYM OrderProcessor@/);
    expect(text).toMatch(/INTENT ADR-07 hard "must be idempotent"/);
    expect(text).toMatch(/REFS 1 \[billing:1\]/);
  });

  it("returns JSON format when requested", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: "OrderProcessor",
            format: "json",
          },
        },
      },
      CallToolResultSchema,
    );
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as { symbol: { name: string } };
    expect(parsed.symbol.name).toBe("OrderProcessor");
  });

  it("resolves plain name to single match", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: { symbol: "OrderProcessor" },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^SYM OrderProcessor/);
  });

  it("returns ERR not_found for an unknown symbol", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: { symbol: "NoSuchSymbol" },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/ERR not_found/);
  });

  it("returns ERR disambiguation_required when name matches multiple", async () => {
    upsertSymbols(db, [
      {
        id: "sym:ts:src/a.ts:Foo",
        name: "Foo",
        kind: "class",
        path: "src/a.ts",
        line: 1,
        language: "typescript",
        fileSha: "a",
      },
      {
        id: "sym:ts:src/b.ts:Foo",
        name: "Foo",
        kind: "class",
        path: "src/b.ts",
        line: 2,
        language: "typescript",
        fileSha: "b",
      },
    ]);
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: { symbol: "Foo" },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/ERR disambiguation_required/);
    expect(text).toMatch(/CAND sym:ts:src\/a\.ts:Foo/);
    expect(text).toMatch(/CAND sym:ts:src\/b\.ts:Foo/);
  });
});
