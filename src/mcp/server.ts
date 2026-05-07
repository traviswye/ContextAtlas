import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import { getSessionId, type Observation } from "../observability/observe.js";
import { sanitize } from "../observability/sanitize.js";
import type { DatabaseInstance } from "../storage/db.js";
import type { LanguageAdapter, LanguageCode, SymbolKind } from "../types.js";

import { createFindByIntentHandler } from "./handlers/find-by-intent.js";
import { createGetSymbolContextHandler } from "./handlers/get-symbol-context.js";
import { createImpactOfChangeHandler } from "./handlers/impact-of-change.js";
import { TOOL_NAMES, TOOLS, type ToolName } from "./schemas.js";

export interface ServerRuntimeContext {
  db: DatabaseInstance;
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>;
  /**
   * Mirrors `config.git.recentCommits`. Used as both the cap on
   * commits surfaced in `get_symbol_context`'s git block and the
   * hotness threshold (ADR-11). One knob, one meaning.
   */
  gitRecentCommits: number;
  /**
   * Mirrors `config.mcp.symbolContextBM25` (ADR-16, v0.3 Theme 1.2
   * Fix 3). When true, `get_symbol_context` BM25-ranks the intent
   * block IF the caller passes a `query` parameter. Falls back to
   * v0.2 deterministic ordering otherwise. Defaults to false.
   */
  symbolContextBM25?: boolean;
}

export interface CreateServerOptions {
  name?: string;
  version: string;
  /**
   * When provided, tools that need storage + adapters are wired to the
   * real implementations. When omitted, those tools return "server not
   * initialized" errors — useful for unit tests that only verify the
   * MCP plumbing (tools/list, protocol correctness).
   */
  context?: ServerRuntimeContext;
  /**
   * Cohort observability writer per v0.6 Step 6.2 / Q6.0.4 hybrid +
   * ADR-20 cohort observability contract. When provided, every
   * tool-call dispatch records one observation (sanitized request +
   * response shape + latency). Server-level interception captures
   * all three tools without per-handler instrumentation drift.
   * Omitted → no observation recorded (default cohort behavior).
   */
  observabilityWriter?: (
    observation: Omit<Observation, "contextatlas_version">,
  ) => void;
  /**
   * Filesystem cwd used by the observability sanitize step to strip
   * absolute paths to relative form. Required when
   * `observabilityWriter` is provided; ignored otherwise.
   */
  observabilityCwd?: string;
}

type ToolHandler = (request: CallToolRequest) => Promise<CallToolResult>;

export function createServer(options: CreateServerOptions): Server {
  const server = new Server(
    { name: options.name ?? "ContextAtlas", version: options.version },
    { capabilities: { tools: {} } },
  );

  const handlers: Record<ToolName, ToolHandler> = {
    [TOOL_NAMES.getSymbolContext]: options.context
      ? createGetSymbolContextHandler(options.context)
      : serverNotInitializedHandler(TOOL_NAMES.getSymbolContext),
    [TOOL_NAMES.findByIntent]: options.context
      ? createFindByIntentHandler({ db: options.context.db })
      : serverNotInitializedHandler(TOOL_NAMES.findByIntent),
    [TOOL_NAMES.impactOfChange]: options.context
      ? createImpactOfChangeHandler(options.context)
      : serverNotInitializedHandler(TOOL_NAMES.impactOfChange),
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...TOOLS],
  }));

  const observe = options.observabilityWriter;
  const observeCwd = options.observabilityCwd ?? process.cwd();

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const handler = handlers[name as ToolName];
    if (!handler) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: '${name}'. Registered tools: ${Object.keys(handlers).join(", ")}.`,
      );
    }
    if (!observe) {
      return handler(request);
    }
    // ADR-20 cohort observability path: capture timing + sanitized
    // args + response shape per Q6.2.2 observation lock. Errors in
    // observation are swallowed defensively — observability must
    // never break the MCP tool surface.
    const startedAt = Date.now();
    const sessionId = getSessionId();
    const sanitizedArgs = sanitize(request.params.arguments ?? {}, {
      cwd: observeCwd,
    });
    try {
      const result = await handler(request);
      const latency = Date.now() - startedAt;
      tryObserve(observe, {
        timestamp: new Date(startedAt).toISOString(),
        session_id: sessionId,
        tool: name,
        request_args: sanitizedArgs,
        response: {
          status: "success",
          latency_ms: latency,
          result_summary: extractResultSummary(result),
        },
      });
      return result;
    } catch (err) {
      const latency = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      const sanitizedMessage = sanitize(message, { cwd: observeCwd }) as string;
      tryObserve(observe, {
        timestamp: new Date(startedAt).toISOString(),
        session_id: sessionId,
        tool: name,
        request_args: sanitizedArgs,
        response: {
          status: "error",
          latency_ms: latency,
          error_message: sanitizedMessage,
        },
      });
      throw err;
    }
  });

  return server;
}

function tryObserve(
  writer: (o: Omit<Observation, "contextatlas_version">) => void,
  observation: Omit<Observation, "contextatlas_version">,
): void {
  try {
    writer(observation);
  } catch {
    // Swallow — observability must never break the tool surface.
  }
}

/**
 * Extract a small allowlist-shape summary from a tool result for
 * the `response.result_summary` field per Q6.2.2 observation lock.
 * Best-effort: defensive against shape variation across the three
 * tool handlers; returns undefined when no useful summary is
 * extractable.
 */
function extractResultSummary(
  result: CallToolResult,
): { symbol_id?: string; symbol_kind?: SymbolKind; result_count?: number } | undefined {
  const summary: {
    symbol_id?: string;
    symbol_kind?: SymbolKind;
    result_count?: number;
  } = {};
  const structured = result.structuredContent as
    | Record<string, unknown>
    | undefined;
  if (structured && typeof structured === "object") {
    const symbolId = structured.symbolId ?? structured.symbol_id;
    if (typeof symbolId === "string") summary.symbol_id = symbolId;
    const symbolKind = structured.symbolKind ?? structured.symbol_kind;
    if (typeof symbolKind === "string") {
      summary.symbol_kind = symbolKind as SymbolKind;
    }
    const results = structured.results ?? structured.matches;
    if (Array.isArray(results)) summary.result_count = results.length;
  }
  return Object.keys(summary).length > 0 ? summary : undefined;
}

function serverNotInitializedHandler(toolName: string): ToolHandler {
  return async () => {
    throw new McpError(
      ErrorCode.InternalError,
      `${toolName} requires the server to be initialized with storage + ` +
        "adapter context. This call path is typically only reached in " +
        "protocol-only unit tests.",
    );
  };
}
