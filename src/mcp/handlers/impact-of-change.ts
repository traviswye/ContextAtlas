import {
  ErrorCode,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

export async function handleImpactOfChange(
  _request: CallToolRequest,
): Promise<CallToolResult> {
  throw new McpError(
    ErrorCode.InternalError,
    "impact_of_change is not yet implemented. Scaffolded in step 1; " +
      "composition over the primitive + git co-change lands in step 11.",
  );
}
