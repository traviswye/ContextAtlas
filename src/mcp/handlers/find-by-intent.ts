import {
  ErrorCode,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

export async function handleFindByIntent(
  _request: CallToolRequest,
): Promise<CallToolResult> {
  throw new McpError(
    ErrorCode.InternalError,
    "find_by_intent is not yet implemented. Scaffolded in step 1; text " +
      "matching against the claims table lands in step 8.",
  );
}
