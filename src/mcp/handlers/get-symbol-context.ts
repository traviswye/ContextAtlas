/**
 * Real handler for `get_symbol_context` — the primitive MCP tool.
 *
 * Input is parsed strictly, the symbol is resolved (accepts either a
 * full ID or a plain name with optional file_hint), the bundle is
 * assembled via src/queries/symbol-context.ts, and the result is
 * rendered compact-by-default (ADR-04) or JSON if requested.
 *
 * Disambiguation is returned as a CallToolResult with isError=true and
 * a compact-format "ERR disambiguation_required" body. Not-found is
 * similarly returned as a compact ERR result. Protocol-level errors
 * (invalid arguments) throw McpError.
 */

import {
  ErrorCode,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import { renderCompact } from "../../formatters/compact.js";
import { buildBundle, DEFAULT_SIGNALS } from "../../queries/symbol-context.js";
import { resolveSymbol } from "../../queries/symbol-resolver.js";
import type { DatabaseInstance } from "../../storage/db.js";
import type {
  BundleDepth,
  BundleSignal,
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
} from "../../types.js";

export interface HandlerDeps {
  db: DatabaseInstance;
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>;
}

export function createGetSymbolContextHandler(
  deps: HandlerDeps,
): (request: CallToolRequest) => Promise<CallToolResult> {
  return async (request) => {
    const args = parseArgs(request.params.arguments);

    const result = resolveSymbol(deps.db, args.symbol, {
      fileHint: args.fileHint,
    });

    if (result.kind === "not_found") {
      return notFoundResult(args.symbol);
    }
    if (result.kind === "disambiguation") {
      return disambiguationResult(args.symbol, result.candidates, args.format);
    }

    const symbol = result.symbol;
    const adapter = deps.adapters.get(symbol.language);
    if (!adapter) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              `ERR no_adapter\n  MESSAGE Symbol '${symbol.id}' uses language '${symbol.language}' ` +
              "but no adapter is registered for that language in the current config.\n",
          },
        ],
      };
    }

    const bundle = await buildBundle(
      { db: deps.db, adapter },
      {
        symbol,
        depth: args.depth,
        include: args.include,
        maxRefs: args.maxRefs,
      },
    );

    if (args.format === "json") {
      return {
        content: [
          { type: "text", text: JSON.stringify(bundle, null, 2) },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: renderCompact(bundle, {
            depth: args.depth,
            maxRefs: args.maxRefs,
          }),
        },
      ],
    };
  };
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  symbol: string;
  fileHint?: string;
  depth: BundleDepth;
  include: readonly BundleSignal[];
  maxRefs: number;
  format: "compact" | "json";
}

const ALL_SIGNAL_VALUES: readonly BundleSignal[] = [
  "refs",
  "intent",
  "git",
  "types",
  "tests",
];

function parseArgs(rawArgs: unknown): ParsedArgs {
  if (!rawArgs || typeof rawArgs !== "object") {
    throw new McpError(
      ErrorCode.InvalidParams,
      "get_symbol_context: missing arguments. Required: 'symbol'.",
    );
  }
  const args = rawArgs as Record<string, unknown>;

  if (typeof args.symbol !== "string" || args.symbol.trim().length === 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "get_symbol_context: 'symbol' must be a non-empty string (full ID or plain name).",
    );
  }

  const depth = parseDepth(args.depth);
  const include = parseInclude(args.include);
  const maxRefs = parseMaxRefs(args.max_refs);
  const format = parseFormat(args.format);
  const fileHint =
    typeof args.file_hint === "string" && args.file_hint.trim().length > 0
      ? args.file_hint
      : undefined;

  const parsed: ParsedArgs = {
    symbol: args.symbol,
    depth,
    include,
    maxRefs,
    format,
  };
  if (fileHint !== undefined) parsed.fileHint = fileHint;
  return parsed;
}

function parseDepth(v: unknown): BundleDepth {
  if (v === undefined) return "standard";
  if (v === "summary" || v === "standard" || v === "deep") return v;
  throw new McpError(
    ErrorCode.InvalidParams,
    `get_symbol_context: 'depth' must be one of summary, standard, deep; got ${String(v)}.`,
  );
}

function parseInclude(v: unknown): readonly BundleSignal[] {
  if (v === undefined) return DEFAULT_SIGNALS;
  if (!Array.isArray(v)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "get_symbol_context: 'include' must be an array of signal names.",
    );
  }
  const out: BundleSignal[] = [];
  for (const entry of v) {
    if (!ALL_SIGNAL_VALUES.includes(entry as BundleSignal)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `get_symbol_context: unknown signal '${String(entry)}'. ` +
          `Valid: ${ALL_SIGNAL_VALUES.join(", ")}.`,
      );
    }
    out.push(entry as BundleSignal);
  }
  return out;
}

function parseMaxRefs(v: unknown): number {
  if (v === undefined) return 20;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `get_symbol_context: 'max_refs' must be a non-negative integer; got ${String(v)}.`,
    );
  }
  return v;
}

function parseFormat(v: unknown): "compact" | "json" {
  if (v === undefined) return "compact";
  if (v === "compact" || v === "json") return v;
  throw new McpError(
    ErrorCode.InvalidParams,
    `get_symbol_context: 'format' must be 'compact' or 'json'; got ${String(v)}.`,
  );
}

// ---------------------------------------------------------------------------
// Error-shaped results (isError: true, returned to caller — not thrown)
// ---------------------------------------------------------------------------

function notFoundResult(input: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          `ERR not_found\n  MESSAGE Symbol '${input}' not found. ` +
          "Try find_by_intent if you're searching by concept rather than name.\n",
      },
    ],
  };
}

function disambiguationResult(
  input: string,
  candidates: readonly AtlasSymbol[],
  format: "compact" | "json",
): CallToolResult {
  if (format === "json") {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: "disambiguation_required",
              message: `Symbol '${input}' matches ${candidates.length} candidates. Pass file_hint to disambiguate.`,
              candidates: candidates.map((c) => ({
                symbol_id: c.id,
                path: c.path,
                line: c.line,
                kind: c.kind,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  const lines = [
    "ERR disambiguation_required",
    `  MESSAGE Symbol '${input}' matches ${candidates.length} candidates. Pass file_hint to disambiguate.`,
  ];
  for (const c of candidates) {
    lines.push(`  CAND ${c.id} ${c.path}:${c.line} ${c.kind}`);
  }
  return {
    isError: true,
    content: [{ type: "text", text: lines.join("\n") + "\n" }],
  };
}
