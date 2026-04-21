import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import { handleFindByIntent } from "./handlers/find-by-intent.js";
import { handleGetSymbolContext } from "./handlers/get-symbol-context.js";
import { handleImpactOfChange } from "./handlers/impact-of-change.js";
import { TOOL_NAMES, TOOLS, type ToolName } from "./schemas.js";

export interface CreateServerOptions {
  name?: string;
  version: string;
}

type ToolHandler = (request: CallToolRequest) => Promise<CallToolResult>;

const HANDLERS: Record<ToolName, ToolHandler> = {
  [TOOL_NAMES.getSymbolContext]: handleGetSymbolContext,
  [TOOL_NAMES.findByIntent]: handleFindByIntent,
  [TOOL_NAMES.impactOfChange]: handleImpactOfChange,
};

export function createServer(options: CreateServerOptions): Server {
  const server = new Server(
    { name: options.name ?? "ContextAtlas", version: options.version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...TOOLS],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const handler = HANDLERS[name as ToolName];
    if (!handler) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: '${name}'. Registered tools: ${Object.keys(HANDLERS).join(", ")}.`,
      );
    }
    return handler(request);
  });

  return server;
}
