/**
 * Real handler for `impact_of_change` — the blast-radius composite
 * (step 11 / ADR-11).
 *
 * Composes over the primitive (`buildBundle`) plus the git co-change
 * query. Argument parsing mirrors `get_symbol_context` for the shared
 * fields (symbol, file_hint, include, format). Resolution uses the
 * same resolver as the primitive — name → ID with optional
 * `file_hint`, returning disambiguation / not-found as compact-format
 * error results rather than protocol errors.
 */

import {
  ErrorCode,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import { renderImpactCompact } from "../../formatters/compact.js";
import { buildImpactBundle } from "../../queries/impact-of-change.js";
import { resolveSymbol } from "../../queries/symbol-resolver.js";
import type { DatabaseInstance } from "../../storage/db.js";
import type {
  BundleSignal,
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
} from "../../types.js";

export interface ImpactOfChangeDeps {
  db: DatabaseInstance;
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>;
  gitRecentCommits: number;
}

export function createImpactOfChangeHandler(
  deps: ImpactOfChangeDeps,
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
              `ERR no_adapter\n  MESSAGE Symbol '${symbol.id}' uses language ` +
              `'${symbol.language}' but no adapter is registered for that ` +
              "language in the current config.\n",
          },
        ],
      };
    }

    const impactOptions: Parameters<typeof buildImpactBundle>[1] = {
      symbol,
      gitRecentCommits: deps.gitRecentCommits,
    };
    if (args.include !== undefined) impactOptions.include = args.include;

    const impact = await buildImpactBundle(
      { db: deps.db, adapter },
      impactOptions,
    );

    if (args.format === "json") {
      return {
        content: [
          { type: "text", text: JSON.stringify(impact, null, 2) },
        ],
      };
    }
    return {
      content: [{ type: "text", text: renderImpactCompact(impact) }],
    };
  };
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  symbol: string;
  fileHint?: string;
  include?: readonly BundleSignal[];
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
      "impact_of_change: missing arguments. Required: 'symbol'.",
    );
  }
  const args = rawArgs as Record<string, unknown>;

  if (typeof args.symbol !== "string" || args.symbol.trim().length === 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "impact_of_change: 'symbol' must be a non-empty string (full ID or plain name).",
    );
  }

  const parsed: ParsedArgs = {
    symbol: args.symbol,
    format: parseFormat(args.format),
  };
  if (
    typeof args.file_hint === "string" &&
    args.file_hint.trim().length > 0
  ) {
    parsed.fileHint = args.file_hint;
  }
  if (args.include !== undefined) {
    parsed.include = parseInclude(args.include);
  }
  return parsed;
}

function parseInclude(v: unknown): readonly BundleSignal[] {
  if (!Array.isArray(v)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "impact_of_change: 'include' must be an array of signal names.",
    );
  }
  const out: BundleSignal[] = [];
  for (const entry of v) {
    if (!ALL_SIGNAL_VALUES.includes(entry as BundleSignal)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `impact_of_change: unknown signal '${String(entry)}'. ` +
          `Valid: ${ALL_SIGNAL_VALUES.join(", ")}.`,
      );
    }
    out.push(entry as BundleSignal);
  }
  return out;
}

function parseFormat(v: unknown): "compact" | "json" {
  if (v === undefined) return "compact";
  if (v === "compact" || v === "json") return v;
  throw new McpError(
    ErrorCode.InvalidParams,
    `impact_of_change: 'format' must be 'compact' or 'json'; got ${String(v)}.`,
  );
}

// ---------------------------------------------------------------------------
// Error-shaped results (isError: true, returned — not thrown)
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
