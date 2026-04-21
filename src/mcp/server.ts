import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import type { DatabaseInstance } from "../storage/db.js";
import type { LanguageAdapter, LanguageCode } from "../types.js";

import { handleFindByIntent } from "./handlers/find-by-intent.js";
import { createGetSymbolContextHandler } from "./handlers/get-symbol-context.js";
import { handleImpactOfChange } from "./handlers/impact-of-change.js";
import { TOOL_NAMES, TOOLS, type ToolName } from "./schemas.js";

export interface ServerRuntimeContext {
  db: DatabaseInstance;
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>;
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
    [TOOL_NAMES.findByIntent]: handleFindByIntent,
    [TOOL_NAMES.impactOfChange]: handleImpactOfChange,
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...TOOLS],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const handler = handlers[name as ToolName];
    if (!handler) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: '${name}'. Registered tools: ${Object.keys(handlers).join(", ")}.`,
      );
    }
    return handler(request);
  });

  return server;
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
