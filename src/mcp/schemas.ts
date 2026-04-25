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

/**
 * Maximum number of symbols accepted in a single multi-symbol
 * `get_symbol_context` call (ADR-15 §2). Wire-level enforcement lives
 * in this file's `inputSchema` (`maxItems: MAX_SYMBOLS_PER_CALL`);
 * the handler imports this constant for its own defense-in-depth
 * cap check before fan-out. Adjustable sub-decision per ADR-15;
 * raise on benchmark evidence.
 *
 * Slight deviation from ADR-15 §Consequences which suggested
 * `src/mcp/handlers/`: definition lives at the schema boundary
 * because `maxItems` is the binding wire-level enforcement; handler
 * imports for secondary defense.
 */
export const MAX_SYMBOLS_PER_CALL = 10;

const getSymbolContextTool: Tool = {
  name: TOOL_NAMES.getSymbolContext,
  description:
    "Return a fused context bundle for a symbol: signature, architectural " +
    "intent (ADR/doc claims), references, git activity, related tests, and " +
    "type relationships. The primitive tool — single call replaces 8-15 " +
    "grep/read/blame round-trips. Accepts a single symbol name (legacy " +
    "shape) or an array of up to " +
    MAX_SYMBOLS_PER_CALL +
    " names for batched retrieval (multi-symbol mode, ADR-15) — useful " +
    "when retrieving a behavior cluster (e.g., a struct + its methods) " +
    "in one call rather than fragmenting across many.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: {
        oneOf: [
          {
            type: "string",
            description: "Single symbol name (e.g. 'OrderProcessor').",
          },
          {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: MAX_SYMBOLS_PER_CALL,
            uniqueItems: false,
            description:
              "Array of symbol names for multi-symbol retrieval (ADR-15). " +
              "Up to " +
              MAX_SYMBOLS_PER_CALL +
              " entries; duplicates are deduplicated " +
              "input-side (.trim()-normalized exact-string-match). Per-symbol " +
              "failures inline as ERR sub-bundles; the call returns " +
              "isError: true only when every symbol fails.",
          },
        ],
        description:
          "Symbol name to look up (e.g. 'OrderProcessor'), or an array of " +
          "names for multi-symbol mode.",
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
