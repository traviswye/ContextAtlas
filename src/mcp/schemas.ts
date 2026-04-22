/**
 * MCP tool schemas for ContextAtlas.
 *
 * Each tool's `inputSchema` is JSON Schema (draft-07 compatible) — this is
 * what ships over the wire in `tools/list` responses. Shapes match
 * DESIGN.md's "Tool Interface" section. Changes here are a public API
 * change; update DESIGN.md in lockstep.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const TOOL_NAMES = {
  getSymbolContext: "get_symbol_context",
  findByIntent: "find_by_intent",
  impactOfChange: "impact_of_change",
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

const SIGNAL_VALUES = ["refs", "intent", "git", "types", "tests"] as const;

const getSymbolContextTool: Tool = {
  name: TOOL_NAMES.getSymbolContext,
  description:
    "Return a fused context bundle for a symbol: signature, architectural " +
    "intent (ADR/doc claims), references, git activity, related tests, and " +
    "type relationships. The primitive tool — single call replaces 8-15 " +
    "grep/read/blame round-trips.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Symbol name to look up (e.g. 'OrderProcessor').",
      },
      file_hint: {
        type: "string",
        description:
          "Optional file path to disambiguate when multiple symbols share a name.",
      },
      depth: {
        type: "string",
        enum: ["summary", "standard", "deep"],
        default: "standard",
        description:
          "How much detail to return. 'summary' = signature + top intent; " +
          "'standard' = default bundle; 'deep' = full references and diagnostics.",
      },
      include: {
        type: "array",
        items: { type: "string", enum: SIGNAL_VALUES },
        description:
          "Filter which signal sources to include. Omit to include all applicable.",
      },
      max_refs: {
        type: "integer",
        minimum: 0,
        default: 50,
        description: "Upper bound on reference count included in the bundle.",
      },
      format: {
        type: "string",
        enum: ["compact", "json"],
        default: "compact",
        description:
          "Output format. 'compact' is a dense text representation " +
          "(~40-60% token savings vs JSON); 'json' is structured.",
      },
    },
    required: ["symbol"],
    additionalProperties: false,
  },
};

const findByIntentTool: Tool = {
  name: TOOL_NAMES.findByIntent,
  description:
    "Search the intent registry for symbols matching a natural-language " +
    "query about architectural constraints or design rationale. 'Where is " +
    "payment idempotency enforced?' returns symbols whose claims match.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural-language query about constraints or intent.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 5,
        description:
          "Maximum number of matching symbols to return (hard cap 50).",
      },
      format: {
        type: "string",
        enum: ["compact", "json"],
        default: "compact",
        description:
          "Output format. 'compact' uses the same SYM/SIG/INTENT " +
          "vocabulary as get_symbol_context; 'json' is structured.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const impactOfChangeTool: Tool = {
  name: TOOL_NAMES.impactOfChange,
  description:
    "Return a blast-radius bundle for a symbol: intent constraints that " +
    "apply, direct references, related tests, git co-change history, and " +
    "risk signals (hot files, recent fixes). Use before modifying a symbol.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Symbol name being changed.",
      },
      file_hint: {
        type: "string",
        description:
          "Optional file path to disambiguate when multiple symbols share a name.",
      },
      include: {
        type: "array",
        items: { type: "string", enum: SIGNAL_VALUES },
        description:
          "Filter which impact signals to include. Omit to include all.",
      },
    },
    required: ["symbol"],
    additionalProperties: false,
  },
};

export const TOOLS: readonly Tool[] = [
  getSymbolContextTool,
  findByIntentTool,
  impactOfChangeTool,
];
