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

  it.each([
    {
      toolName: TOOL_NAMES.getSymbolContext,
      args: { symbol: "Dummy" },
    },
    {
      toolName: TOOL_NAMES.findByIntent,
      args: { query: "dummy" },
    },
  ])(
    "$toolName without runtime context reports 'not initialized'",
    async ({ toolName, args }) => {
      await expect(
        client.request(
          {
            method: "tools/call",
            params: { name: toolName, arguments: args },
          },
          CallToolResultSchema,
        ),
      ).rejects.toThrow(/initialized with storage/);
    },
  );

  it("impact_of_change returns 'not yet implemented' (step 11)", async () => {
    // Remaining placeholder until step 11 lands. find_by_intent
    // graduated from placeholder to real handler with ADR-09 / step 8;
    // get_symbol_context earlier at step 6.
    await expect(
      client.request(
        {
          method: "tools/call",
          params: {
            name: TOOL_NAMES.impactOfChange,
            arguments: { symbol: "Dummy" },
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

describe("MCP server with runtime context — find_by_intent", () => {
  let client: Client;
  let server: ReturnType<typeof createServer>;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    const symbols: AtlasSymbol[] = [
      {
        id: "sym:ts:src/orders/processor.ts:OrderProcessor",
        name: "OrderProcessor",
        kind: "class",
        path: "src/orders/processor.ts",
        line: 42,
        signature: "class OrderProcessor extends BaseProcessor<Order>",
        language: "typescript",
        fileSha: "abc",
      },
      {
        id: "sym:ts:src/billing/retry.ts:RetryBudget",
        name: "RetryBudget",
        kind: "class",
        path: "src/billing/retry.ts",
        line: 1,
        language: "typescript",
        fileSha: "def",
      },
    ];
    upsertSymbols(db, symbols);
    insertClaims(db, [
      {
        source: "ADR-07",
        sourcePath: "docs/adr/ADR-07.md",
        sourceSha: "s",
        severity: "hard",
        // Contains the exact phrase "payment idempotency".
        claim: "must handle payment idempotency correctly",
        symbolIds: [symbols[0]!.id],
      },
      {
        source: "ADR-12",
        sourcePath: "docs/adr/ADR-12.md",
        sourceSha: "s",
        severity: "soft",
        // Contains both tokens but not adjacent — exercises the
        // scattered-token (OR) branch of the MATCH query. FTS5's
        // default tokenizer doesn't stem, so we use "payment" here
        // (not "payments") to ensure the token actually matches.
        claim: "retry budget logic: when payment flows fail, idempotency of the retry matters",
        symbolIds: [symbols[1]!.id],
      },
    ]);

    server = createServer({
      name: "ContextAtlas",
      version: "0.0.1-test",
      context: {
        db,
        // find_by_intent doesn't use the adapter, but context still
        // requires one; any stub satisfies the type.
        adapters: new Map([["typescript", stubAdapter({})]]),
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

  it("ranks the exact-phrase match ahead of scattered-token matches", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.findByIntent,
          arguments: { query: "payment idempotency" },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^MATCHES \d+ \[query="payment idempotency"\]/);
    // OrderProcessor contains the phrase "payment idempotency"; it
    // must appear before RetryBudget whose claim only hits "payments".
    const orderIdx = text.indexOf("OrderProcessor");
    const retryIdx = text.indexOf("RetryBudget");
    expect(orderIdx).toBeGreaterThan(-1);
    expect(retryIdx).toBeGreaterThan(orderIdx);
  });

  it("returns JSON format when requested", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.findByIntent,
          arguments: { query: "payment", format: "json" },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as {
      matches: Array<{ name: string; matchedIntent: { source: string } }>;
    };
    expect(parsed.matches.length).toBeGreaterThan(0);
    expect(parsed.matches[0]?.matchedIntent.source).toBeDefined();
  });

  it("returns MATCHES 0 for a query with no hits (not an error)", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.findByIntent,
          arguments: { query: "completely unrelated phrase" },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^MATCHES 0 /);
  });

  it("respects the limit parameter", async () => {
    // Add additional claims so we have enough hits to truncate.
    upsertSymbols(db, [
      {
        id: "sym:ts:src/extra.ts:Extra",
        name: "Extra",
        kind: "class",
        path: "src/extra.ts",
        line: 1,
        language: "typescript",
        fileSha: "x",
      },
    ]);
    insertClaims(db, [
      {
        source: "ADR-99",
        sourcePath: "docs/adr/ADR-99.md",
        sourceSha: "s",
        severity: "context",
        claim: "payment processing notes",
        symbolIds: ["sym:ts:src/extra.ts:Extra"],
      },
    ]);
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.findByIntent,
          arguments: { query: "payment", limit: 1 },
        },
      },
      CallToolResultSchema,
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^MATCHES 1 /);
  });

  it("rejects empty query with InvalidParams", async () => {
    await expect(
      client.request(
        {
          method: "tools/call",
          params: {
            name: TOOL_NAMES.findByIntent,
            arguments: { query: "   " },
          },
        },
        CallToolResultSchema,
      ),
    ).rejects.toThrow(/non-empty string/);
  });

  it("rejects non-integer limit", async () => {
    await expect(
      client.request(
        {
          method: "tools/call",
          params: {
            name: TOOL_NAMES.findByIntent,
            arguments: { query: "payment", limit: 0 },
          },
        },
        CallToolResultSchema,
      ),
    ).rejects.toThrow(/positive integer/);
  });
});
