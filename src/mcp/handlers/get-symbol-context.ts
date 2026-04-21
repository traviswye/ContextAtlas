import {
  ErrorCode,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

export async function handleGetSymbolContext(
  _request: CallToolRequest,
): Promise<CallToolResult> {
  throw new McpError(
    ErrorCode.InternalError,
    "get_symbol_context is not yet implemented. Scaffolded in step 1; wiring " +
      "LSP + intent + git signals lands in step 6.",
  );
}
