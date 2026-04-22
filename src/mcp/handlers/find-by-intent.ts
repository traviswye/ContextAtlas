/**
 * Real handler for `find_by_intent` — the claims-ranked MCP tool.
 *
 * Input parsing is strict (unknown types reject with McpError;
 * missing `query` rejects). Ranking and result shaping live in
 * `src/queries/find-by-intent.ts` per ADR-09. Compact rendering
 * reuses the formatters family so the output vocabulary matches
 * `get_symbol_context`.
 *
 * Per ADR-02 and reaffirmed in ADR-09: this handler makes no
 * Anthropic API calls and must never start. All ranking is local
 * SQL + FTS5 BM25.
 */

import {
  ErrorCode,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import { renderMatchesCompact } from "../../formatters/compact.js";
import { findByIntent } from "../../queries/find-by-intent.js";
import type { DatabaseInstance } from "../../storage/db.js";

export interface FindByIntentDeps {
  db: DatabaseInstance;
}

export function createFindByIntentHandler(
  deps: FindByIntentDeps,
): (request: CallToolRequest) => Promise<CallToolResult> {
  return async (request) => {
    const args = parseArgs(request.params.arguments);
    const matches = findByIntent(deps.db, {
      query: args.query,
      limit: args.limit,
    });

    if (args.format === "json") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ matches }, null, 2),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: renderMatchesCompact(matches, args.query),
        },
      ],
    };
  };
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  query: string;
  limit: number;
  format: "compact" | "json";
}

function parseArgs(rawArgs: unknown): ParsedArgs {
  if (!rawArgs || typeof rawArgs !== "object") {
    throw new McpError(
      ErrorCode.InvalidParams,
      "find_by_intent: missing arguments. Required: 'query'.",
    );
  }
  const args = rawArgs as Record<string, unknown>;

  if (typeof args.query !== "string" || args.query.trim().length === 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "find_by_intent: 'query' must be a non-empty string.",
    );
  }

  return {
    query: args.query,
    limit: parseLimit(args.limit),
    format: parseFormat(args.format),
  };
}

function parseLimit(v: unknown): number {
  if (v === undefined) return 5;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `find_by_intent: 'limit' must be a positive integer; got ${String(v)}.`,
    );
  }
  return v;
}

function parseFormat(v: unknown): "compact" | "json" {
  if (v === undefined) return "compact";
  if (v === "compact" || v === "json") return v;
  throw new McpError(
    ErrorCode.InvalidParams,
    `find_by_intent: 'format' must be 'compact' or 'json'; got ${String(v)}.`,
  );
}
