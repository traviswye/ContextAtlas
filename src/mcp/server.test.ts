import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { insertClaims } from "../storage/claims.js";
import { openDatabase } from "../storage/db.js";
import { replaceGitCommits } from "../storage/git.js";
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

// BYTE_EQUIVALENCE_EXPECTED — Captured 2026-04-25 from single-symbol
// happy-path full-ID call against the fixture in the single-symbol
// `get_symbol_context` describe block. ADR-15 §Consequences ship-blocker:
// any divergence in single-string output blocks Step 4 ship.
//
// The constant is the literal text the pre-ADR-15 handler returned. The
// post-refactor handler must produce byte-identical output for the
// `oneOf` schema's first alternative (string input). Existing
// `.toMatch(/pattern/)` assertions catch most regressions; this `.toBe()`
// catches the subtle ones (whitespace, ordering, trailing newline).
const BYTE_EQUIVALENCE_EXPECTED = `SYM OrderProcessor@src/orders/processor.ts:42 class
  SIG class OrderProcessor extends BaseProcessor<Order>
  INTENT ADR-07 hard "must be idempotent"
    RATIONALE "enables safe retry"
  REFS 1 [billing:1]
    TOP ref:ts:billing/charges.ts:88
`;

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
    {
      toolName: TOOL_NAMES.impactOfChange,
      args: { symbol: "Dummy" },
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
        gitRecentCommits: 5,
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

  it("ADR-15 byte-equivalence canary: single-string input matches pre-refactor output exactly", async () => {
    // Ship-blocker per ADR-15 §Consequences. If this fails, the
    // `oneOf` schema's first alternative (string input) is no longer
    // byte-identical to the pre-ADR-15 handler. See
    // BYTE_EQUIVALENCE_EXPECTED comment at top of file.
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
    expect(text).toBe(BYTE_EQUIVALENCE_EXPECTED);
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

// ---------------------------------------------------------------------------
// Multi-symbol get_symbol_context (ADR-15)
//
// Eight categories per ADR-15 §Consequences:
//   (a) byte-equivalence — covered above in single-symbol describe
//   (b) multi-symbol happy path (compact + JSON envelope)
//   (c) partial failure with isError: false, ERR sub-bundles inlined
//   (d) all-failed with isError: true, `ERR all_symbols_failed COUNT N` header
//   (e) cap enforcement (11 items → McpError InvalidParams)
//   (f) dedup edge cases (whitespace trim, case sensitivity, full-ID vs name)
//   (g) order preservation across mixed success/failure inputs
//   (h) file_hint applied uniformly to every batch entry
// ---------------------------------------------------------------------------

describe("MCP server with runtime context — get_symbol_context multi-symbol (ADR-15)", () => {
  let client: Client;
  let server: ReturnType<typeof createServer>;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    // Multi-symbol fixture — covers happy-path resolution, ambiguous
    // names (Foo in both a.ts and b.ts), unique names with shared
    // file_hint applicability (Bar only in a.ts), and a non-resolving
    // baseline. OrderProcessor + RetryBudget are unique uppercase
    // names; Foo intentionally collides for disambiguation tests.
    upsertSymbols(db, [
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
      {
        id: "sym:ts:src/a.ts:Foo",
        name: "Foo",
        kind: "class",
        path: "src/a.ts",
        line: 1,
        language: "typescript",
        fileSha: "fa",
      },
      {
        id: "sym:ts:src/b.ts:Foo",
        name: "Foo",
        kind: "class",
        path: "src/b.ts",
        line: 2,
        language: "typescript",
        fileSha: "fb",
      },
      {
        id: "sym:ts:src/a.ts:Bar",
        name: "Bar",
        kind: "class",
        path: "src/a.ts",
        line: 5,
        language: "typescript",
        fileSha: "fa",
      },
    ]);
    insertClaims(db, [
      {
        source: "ADR-07",
        sourcePath: "docs/adr/ADR-07.md",
        sourceSha: "s",
        severity: "hard",
        claim: "must be idempotent",
        symbolIds: ["sym:ts:src/orders/processor.ts:OrderProcessor"],
      },
    ]);

    server = createServer({
      name: "ContextAtlas",
      version: "0.0.1-test",
      context: {
        db,
        adapters: new Map([["typescript", stubAdapter({})]]),
        gitRecentCommits: 5,
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

  // -------------------------------------------------------------------------
  // (b) Multi-symbol happy path
  // -------------------------------------------------------------------------

  it("(b) compact: 2-symbol happy path renders both with named delimiters", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["OrderProcessor", "RetryBudget"],
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(
      /^--- get_symbol_context: OrderProcessor \(1 of 2\) ---/,
    );
    expect(text).toMatch(
      /--- get_symbol_context: RetryBudget \(2 of 2\) ---/,
    );
    // Both bundles render their SYM headers.
    expect(text).toMatch(/SYM OrderProcessor@/);
    expect(text).toMatch(/SYM RetryBudget@/);
  });

  it("(b) JSON: 2-symbol happy path produces results envelope with bundle entries", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["OrderProcessor", "RetryBudget"],
            format: "json",
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as {
      results: Array<{
        symbol: string;
        bundle: { symbol: { name: string } } | null;
        error: { code: string } | null;
      }>;
    };
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]?.symbol).toBe("OrderProcessor");
    expect(parsed.results[0]?.bundle?.symbol.name).toBe("OrderProcessor");
    expect(parsed.results[0]?.error).toBeNull();
    expect(parsed.results[1]?.symbol).toBe("RetryBudget");
    expect(parsed.results[1]?.bundle?.symbol.name).toBe("RetryBudget");
    expect(parsed.results[1]?.error).toBeNull();
  });

  it("(b) length-1 array input gets multi-symbol envelope, not legacy single-bundle shape", async () => {
    // Per ADR-15 §4: ["Foo"] gets multi-symbol envelope with one entry;
    // "Foo" gets legacy shape. Detection on input shape, not response.
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: { symbol: ["OrderProcessor"] },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^--- get_symbol_context: OrderProcessor \(1 of 1\) ---/);
  });

  // -------------------------------------------------------------------------
  // (c) Partial failure — isError: false, per-symbol ERR inlined
  // -------------------------------------------------------------------------

  it("(c) partial failure: not_found inlined; isError stays false; siblings render bundles", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["OrderProcessor", "GhostSymbol", "RetryBudget"],
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    // OrderProcessor at slot 1, GhostSymbol ERR at slot 2, RetryBudget at slot 3.
    expect(text).toMatch(
      /--- get_symbol_context: OrderProcessor \(1 of 3\) ---\nSYM OrderProcessor@/,
    );
    expect(text).toMatch(
      /--- get_symbol_context: GhostSymbol \(2 of 3\) ---\nERR not_found/,
    );
    expect(text).toMatch(
      /--- get_symbol_context: RetryBudget \(3 of 3\) ---\nSYM RetryBudget@/,
    );
  });

  it("(c) partial failure with disambiguation inlined as ERR sub-bundle", async () => {
    // Foo collides between src/a.ts and src/b.ts → disambiguation in slot 2.
    // No file_hint passed, so the disambiguation surfaces.
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["OrderProcessor", "Foo", "RetryBudget"],
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/SYM OrderProcessor@/);
    expect(text).toMatch(
      /--- get_symbol_context: Foo \(2 of 3\) ---\nERR disambiguation_required/,
    );
    expect(text).toMatch(/CAND sym:ts:src\/a\.ts:Foo/);
    expect(text).toMatch(/CAND sym:ts:src\/b\.ts:Foo/);
    expect(text).toMatch(/SYM RetryBudget@/);
  });

  // -------------------------------------------------------------------------
  // (d) All-failed — isError: true, ERR all_symbols_failed header
  // -------------------------------------------------------------------------

  it("(d) all-failed: isError true, header emitted, all sub-bundles render ERR", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["GhostA", "GhostB", "GhostC"],
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    // Header per ADR-15 §5: `ERR all_symbols_failed\n  COUNT 3\n` followed
    // by blank line then the per-symbol delimiter+sub-bundle shape.
    expect(text).toMatch(/^ERR all_symbols_failed\n  COUNT 3\n\n/);
    expect(text).toMatch(/--- get_symbol_context: GhostA \(1 of 3\) ---/);
    expect(text).toMatch(/--- get_symbol_context: GhostB \(2 of 3\) ---/);
    expect(text).toMatch(/--- get_symbol_context: GhostC \(3 of 3\) ---/);
    // Three not_found ERRs (one per slot).
    expect((text.match(/ERR not_found/g) ?? []).length).toBe(3);
  });

  it("(d) all-failed JSON: isError true, no all_symbols_failed header in JSON (compact-only affordance)", async () => {
    // JSON-asymmetry note from handler: the compact `ERR all_symbols_failed
    // COUNT N` header has no JSON analogue. Consumers detect all-failed
    // via isError + walking results for non-null `error` entries.
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["GhostA", "GhostB"],
            format: "json",
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).not.toMatch(/all_symbols_failed/);
    const parsed = JSON.parse(text) as {
      results: Array<{ symbol: string; bundle: unknown; error: { code: string } | null }>;
    };
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]?.error?.code).toBe("not_found");
    expect(parsed.results[0]?.bundle).toBeNull();
    expect(parsed.results[1]?.error?.code).toBe("not_found");
  });

  // -------------------------------------------------------------------------
  // (e) Cap enforcement
  // -------------------------------------------------------------------------

  it("(e) cap enforcement: 11-item array → McpError InvalidParams (no partial response)", async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `Sym${i}`);
    await expect(
      client.request(
        {
          method: "tools/call",
          params: {
            name: TOOL_NAMES.getSymbolContext,
            arguments: { symbol: eleven },
          },
        },
        CallToolResultSchema,
      ),
    ).rejects.toThrow(/exceeds 10-item cap/);
  });

  it("(e) cap accepts exactly 10 items (boundary check)", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => `GhostSym${i}`);
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: { symbol: ten },
        },
      },
      CallToolResultSchema,
    );
    // All 10 are not_found names; isError true, header reports COUNT 10.
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^ERR all_symbols_failed\n  COUNT 10\n/);
  });

  it("(e) empty array → McpError InvalidParams", async () => {
    await expect(
      client.request(
        {
          method: "tools/call",
          params: {
            name: TOOL_NAMES.getSymbolContext,
            arguments: { symbol: [] },
          },
        },
        CallToolResultSchema,
      ),
    ).rejects.toThrow(/at least one entry/);
  });

  // -------------------------------------------------------------------------
  // (f) Dedup edge cases — per ADR-15 §8
  // -------------------------------------------------------------------------

  it("(f) dedup: ['foo','foo'] → 1 sub-bundle (M reflects post-dedup count)", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["GhostX", "GhostX"],
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBe(true); // single not_found, all failed
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/COUNT 1\n/);
    expect(text).toMatch(/--- get_symbol_context: GhostX \(1 of 1\) ---/);
    // No "(2 of 2)" or "(2 of 1)" — duplicate dropped.
    expect(text).not.toMatch(/\(2 of/);
  });

  it("(f) dedup: ['foo','  foo  '] → 1 sub-bundle (whitespace trim normalizes)", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["GhostY", "  GhostY  "],
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/COUNT 1\n/);
    expect(text).toMatch(/--- get_symbol_context: GhostY \(1 of 1\) ---/);
  });

  it("(f) dedup: ['foo','Foo'] → 2 sub-bundles (case-sensitive, matches ADR-01)", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["ghostz", "GhostZ"],
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/COUNT 2\n/);
    expect(text).toMatch(/--- get_symbol_context: ghostz \(1 of 2\) ---/);
    expect(text).toMatch(/--- get_symbol_context: GhostZ \(2 of 2\) ---/);
  });

  it("(f) dedup: full SymbolId + plain name → 2 sub-bundles (input-layer dedup, not resolution-layer)", async () => {
    // Both input strings resolve to the same OrderProcessor symbol.
    // Per ADR-15 §8: dedup is on input strings; resolution collisions
    // intentionally produce two response slots with identical bundles.
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: [
              "sym:ts:src/orders/processor.ts:OrderProcessor",
              "OrderProcessor",
            ],
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(
      /--- get_symbol_context: sym:ts:src\/orders\/processor\.ts:OrderProcessor \(1 of 2\) ---/,
    );
    expect(text).toMatch(
      /--- get_symbol_context: OrderProcessor \(2 of 2\) ---/,
    );
    // Both slots carry SYM headers (both resolved to the same symbol).
    expect((text.match(/SYM OrderProcessor@/g) ?? []).length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // (g) Order preservation across mixed success/failure
  // -------------------------------------------------------------------------

  it("(g) order preservation: 4-symbol mixed input renders in request order", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["RetryBudget", "GhostA", "OrderProcessor", "GhostB"],
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;

    const slot1 = text.indexOf("(1 of 4)");
    const slot2 = text.indexOf("(2 of 4)");
    const slot3 = text.indexOf("(3 of 4)");
    const slot4 = text.indexOf("(4 of 4)");
    expect(slot1).toBeGreaterThan(-1);
    expect(slot2).toBeGreaterThan(slot1);
    expect(slot3).toBeGreaterThan(slot2);
    expect(slot4).toBeGreaterThan(slot3);

    // Each slot's delimiter carries the input string from that position.
    expect(text).toMatch(/--- get_symbol_context: RetryBudget \(1 of 4\) ---/);
    expect(text).toMatch(/--- get_symbol_context: GhostA \(2 of 4\) ---/);
    expect(text).toMatch(/--- get_symbol_context: OrderProcessor \(3 of 4\) ---/);
    expect(text).toMatch(/--- get_symbol_context: GhostB \(4 of 4\) ---/);
  });

  it("(g) JSON results array preserves request order", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["RetryBudget", "GhostA", "OrderProcessor"],
            format: "json",
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content[0] as { text: string }).text,
    ) as { results: Array<{ symbol: string }> };
    expect(parsed.results.map((r) => r.symbol)).toEqual([
      "RetryBudget",
      "GhostA",
      "OrderProcessor",
    ]);
  });

  // -------------------------------------------------------------------------
  // (h) file_hint applied uniformly
  // -------------------------------------------------------------------------

  it("(h) file_hint applies uniformly: disambiguates Foo to a.ts AND resolves Bar (only in a.ts)", async () => {
    // Without file_hint, Foo would disambiguate (collides between
    // a.ts and b.ts). With file_hint "src/a.ts", Foo resolves to
    // sym:ts:src/a.ts:Foo. Bar only has one match (in a.ts), so the
    // shared file_hint doesn't conflict — it resolves cleanly.
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["Foo", "Bar"],
            file_hint: "src/a.ts",
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/--- get_symbol_context: Foo \(1 of 2\) ---/);
    expect(text).toMatch(/--- get_symbol_context: Bar \(2 of 2\) ---/);
    // Both resolved (no ERR sub-bundles).
    expect(text).not.toMatch(/ERR /);
    // Both bundles render their SYM headers from src/a.ts.
    expect(text).toMatch(/SYM Foo@src\/a\.ts:1/);
    expect(text).toMatch(/SYM Bar@src\/a\.ts:5/);
  });

  it("(h) without file_hint, Foo disambiguates as expected (control)", async () => {
    // Same input minus file_hint — confirms the file_hint test above
    // is actually exercising disambiguation, not just trivially passing.
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: { symbol: ["Foo", "Bar"] },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy(); // Bar still resolves; partial failure
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/ERR disambiguation_required/);
    expect(text).toMatch(/SYM Bar@src\/a\.ts:5/);
  });
});

// ---------------------------------------------------------------------------
// v0.3 Theme 1.2 Fix 3 — BM25 ranking on get_symbol_context (ADR-16)
//
// Handler-level integration tests. Unit-level BM25 behavior is in
// src/queries/symbol-context.test.ts (the load-bearing canaries live
// there). These tests verify the handler correctly threads the
// `query` input parameter and the `symbolContextBM25` server flag
// through to buildBundle.
// ---------------------------------------------------------------------------

describe("MCP server — get_symbol_context BM25 query parameter (ADR-16)", () => {
  let client: Client;
  let server: ReturnType<typeof createServer>;
  let db: ReturnType<typeof openDatabase>;

  async function setupServer(symbolContextBM25: boolean) {
    db = openDatabase(":memory:");
    const sym: AtlasSymbol = {
      id: "sym:ts:src/orders/processor.ts:OrderProcessor",
      name: "OrderProcessor",
      kind: "class",
      path: "src/orders/processor.ts",
      line: 42,
      signature: "class OrderProcessor",
      language: "typescript",
      fileSha: "abc",
    };
    upsertSymbols(db, [sym]);
    insertClaims(db, [
      {
        source: "ADR-07",
        sourcePath: "docs/adr/ADR-07.md",
        sourceSha: "s",
        severity: "hard",
        claim: "off-target streaming claim",
        symbolIds: [sym.id],
      },
      {
        source: "ADR-07",
        sourcePath: "docs/adr/ADR-07.md",
        sourceSha: "s",
        severity: "hard",
        claim: "payment idempotency must be enforced",
        symbolIds: [sym.id],
      },
    ]);
    server = createServer({
      name: "ContextAtlas",
      version: "0.0.1-test",
      context: {
        db,
        adapters: new Map([["typescript", stubAdapter({})]]),
        gitRecentCommits: 5,
        symbolContextBM25,
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
  }

  afterEach(async () => {
    await client.close();
    await server.close();
    db.close();
  });

  it("flag-on + query: BM25 ranking activates; on-target claim ranks first", async () => {
    await setupServer(true);
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: "OrderProcessor",
            query: "payment idempotency",
          },
        },
      },
      CallToolResultSchema,
    );
    const text = (result.content[0] as { text: string }).text;
    // BM25 ranks "payment idempotency must be enforced" first (matches
    // both query tokens). The off-target streaming claim sorts last.
    const idempotencyIdx = text.indexOf("payment idempotency must be enforced");
    const streamingIdx = text.indexOf("off-target streaming claim");
    expect(idempotencyIdx).toBeGreaterThan(-1);
    expect(streamingIdx).toBeGreaterThan(-1);
    expect(idempotencyIdx).toBeLessThan(streamingIdx);
  });

  it("flag-on but no query: falls back to v0.2 ordering (insertion order)", async () => {
    // Two-layer gating: server flag on but caller didn't pass query →
    // fallback. This is the load-bearing fallback rule that prevents
    // existing v0.2 callers from seeing different output when an
    // admin flips the flag on.
    await setupServer(true);
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
    const text = (result.content[0] as { text: string }).text;
    // v0.2 insertion order: streaming claim first (claim id = 1).
    const streamingIdx = text.indexOf("off-target streaming claim");
    const idempotencyIdx = text.indexOf("payment idempotency must be enforced");
    expect(streamingIdx).toBeGreaterThan(-1);
    expect(idempotencyIdx).toBeGreaterThan(-1);
    expect(streamingIdx).toBeLessThan(idempotencyIdx);
  });

  it("flag-off + query: query is silently ignored (no BM25 path)", async () => {
    // Two-layer gating: caller passed query but server flag off →
    // query has no effect. v0.2 ordering wins.
    await setupServer(false);
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: "OrderProcessor",
            query: "payment idempotency",
          },
        },
      },
      CallToolResultSchema,
    );
    const text = (result.content[0] as { text: string }).text;
    // Same as flag-on-no-query: insertion order wins.
    const streamingIdx = text.indexOf("off-target streaming claim");
    const idempotencyIdx = text.indexOf("payment idempotency must be enforced");
    expect(streamingIdx).toBeLessThan(idempotencyIdx);
  });

  it("flag-on + empty query string: empty trimmed query treated as absent", async () => {
    await setupServer(true);
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: { symbol: "OrderProcessor", query: "   " },
        },
      },
      CallToolResultSchema,
    );
    const text = (result.content[0] as { text: string }).text;
    // Whitespace-only query → trimmed to "" → handler treats as
    // absent → BM25 path doesn't activate → v0.2 ordering.
    const streamingIdx = text.indexOf("off-target streaming claim");
    const idempotencyIdx = text.indexOf("payment idempotency must be enforced");
    expect(streamingIdx).toBeLessThan(idempotencyIdx);
  });

  it("non-string query rejected with InvalidParams", async () => {
    await setupServer(true);
    await expect(
      client.request(
        {
          method: "tools/call",
          params: {
            name: TOOL_NAMES.getSymbolContext,
            arguments: { symbol: "OrderProcessor", query: 42 },
          },
        },
        CallToolResultSchema,
      ),
    ).rejects.toThrow(/'query' must be a string/);
  });

  it("multi-symbol input with query: query applies uniformly across batch (ADR-15 §3 + ADR-16)", async () => {
    // Per ADR-15 §3 (uniform per-symbol options), the query parameter
    // applies to every symbol in the batch. ADR-16 inherits this rule.
    await setupServer(true);
    upsertSymbols(db, [
      {
        id: "sym:ts:src/billing/retry.ts:RetryBudget",
        name: "RetryBudget",
        kind: "class",
        path: "src/billing/retry.ts",
        line: 1,
        language: "typescript",
        fileSha: "def",
      },
    ]);
    insertClaims(db, [
      {
        source: "ADR-08",
        sourcePath: "docs/adr/ADR-08.md",
        sourceSha: "s",
        severity: "hard",
        claim: "off-topic claim",
        symbolIds: ["sym:ts:src/billing/retry.ts:RetryBudget"],
      },
      {
        source: "ADR-08",
        sourcePath: "docs/adr/ADR-08.md",
        sourceSha: "s",
        severity: "hard",
        claim: "payment idempotency on retry",
        symbolIds: ["sym:ts:src/billing/retry.ts:RetryBudget"],
      },
    ]);
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.getSymbolContext,
          arguments: {
            symbol: ["OrderProcessor", "RetryBudget"],
            query: "payment idempotency",
          },
        },
      },
      CallToolResultSchema,
    );
    const text = (result.content[0] as { text: string }).text;
    // Both sub-bundles render with BM25 applied. RetryBudget's
    // "payment idempotency on retry" should rank ahead of its
    // "off-topic claim" sibling.
    expect(text).toMatch(/--- get_symbol_context: OrderProcessor \(1 of 2\) ---/);
    expect(text).toMatch(/--- get_symbol_context: RetryBudget \(2 of 2\) ---/);
    // Within RetryBudget's slot, idempotency claim ranks above off-topic.
    const retryStart = text.indexOf("RetryBudget (2 of 2)");
    const offTopic = text.indexOf("off-topic claim", retryStart);
    const onTopic = text.indexOf("payment idempotency on retry", retryStart);
    expect(onTopic).toBeGreaterThan(-1);
    expect(offTopic).toBeGreaterThan(-1);
    expect(onTopic).toBeLessThan(offTopic);
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

describe("MCP server with runtime context — impact_of_change (ADR-11)", () => {
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
      signature: "class OrderProcessor",
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
        symbolIds: [symbol.id],
      },
    ]);
    replaceGitCommits(db, [
      {
        sha: "a".repeat(40),
        date: "2026-04-20T10:00:00Z",
        message: "fix: retry",
        authorEmail: "alice@example.com",
        files: ["src/orders/processor.ts", "src/orders/queue.ts"],
      },
      {
        sha: "b".repeat(40),
        date: "2026-04-19T10:00:00Z",
        message: "refactor",
        authorEmail: "bob@example.com",
        files: ["src/orders/processor.ts", "src/orders/queue.ts"],
      },
    ]);
    server = createServer({
      name: "ContextAtlas",
      version: "0.0.1-test",
      context: {
        db,
        adapters: new Map([["typescript", stubAdapter({})]]),
        gitRecentCommits: 2,
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

  it("returns an IMPACT bundle with GIT_COCHANGE and RISK_SIGNALS", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.impactOfChange,
          arguments: {
            symbol: "sym:ts:src/orders/processor.ts:OrderProcessor",
          },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(
      /^IMPACT sym:ts:src\/orders\/processor\.ts:OrderProcessor/,
    );
    expect(text).toMatch(/GIT_COCHANGE \(top 1\)/);
    expect(text).toMatch(/src\/orders\/queue\.ts\s+2 commits/);
    expect(text).toMatch(/RISK_SIGNALS/);
    expect(text).toMatch(/hot: yes \(2≥2 commits\)/);
    expect(text).toMatch(/intent_density: 1 hard/);
  });

  it("returns JSON format when requested", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.impactOfChange,
          arguments: {
            symbol: "OrderProcessor",
            format: "json",
          },
        },
      },
      CallToolResultSchema,
    );
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as {
      bundle: { symbol: { name: string } };
      coChange: Array<{ filePath: string }>;
      riskSignals: { hot: boolean };
    };
    expect(parsed.bundle.symbol.name).toBe("OrderProcessor");
    expect(parsed.coChange[0]?.filePath).toBe("src/orders/queue.ts");
    expect(parsed.riskSignals.hot).toBe(true);
  });

  it("returns ERR not_found for an unknown symbol", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: TOOL_NAMES.impactOfChange,
          arguments: { symbol: "NoSuchThing" },
        },
      },
      CallToolResultSchema,
    );
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /ERR not_found/,
    );
  });
});
