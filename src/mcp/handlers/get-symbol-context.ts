/**
 * Real handler for `get_symbol_context` — the primitive MCP tool.
 *
 * Single-symbol mode (legacy): caller passes `symbol: string`. Input is
 * parsed, the symbol is resolved (full ID or plain name with optional
 * file_hint), the bundle is assembled via src/queries/symbol-context.ts,
 * and the result is rendered compact-by-default (ADR-04) or JSON.
 * Disambiguation / not_found / no_adapter map to whole-call
 * `isError: true`. Output is byte-identical to the pre-ADR-15
 * implementation — guarded by the byte-equivalence test in
 * src/mcp/server.test.ts.
 *
 * Multi-symbol mode (ADR-15): caller passes `symbol: string[]` (up to
 * MAX_SYMBOLS_PER_CALL items). Input strings are .trim()-normalized
 * and exact-match-deduped before resolution; resolution fans out per
 * input; per-symbol failures inline as ERR sub-bundles; whole-call
 * `isError: true` only when EVERY input failed. Compact output uses
 * named delimiters (`--- get_symbol_context: <symbol> (N of M) ---`);
 * JSON output uses a `{ results: [{ symbol, bundle, error }, ...] }`
 * envelope. Order matches request order.
 *
 * Implementation note on JSON shape symmetry: in JSON mode the all-failed
 * case uses the same `{ results: [...] }` envelope as the partial-failure
 * case — the only signal distinguishing them is the JSON-RPC response's
 * `isError: true` flag plus the consumer walking `results` for non-null
 * `error` entries. The compact-format `ERR all_symbols_failed COUNT <N>`
 * summary header has no JSON analogue; that is a compact-only affordance.
 */

import {
  ErrorCode,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import { renderCompact } from "../../formatters/compact.js";
import {
  buildBundle,
  DEFAULT_SIGNALS,
} from "../../queries/symbol-context.js";
import { resolveSymbol } from "../../queries/symbol-resolver.js";
import type { DatabaseInstance } from "../../storage/db.js";
import type {
  BundleDepth,
  BundleSignal,
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
  SymbolContextBundle,
} from "../../types.js";

import { MAX_SYMBOLS_PER_CALL } from "../schemas.js";

export interface HandlerDeps {
  db: DatabaseInstance;
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>;
  /**
   * Hotness threshold + recent-commits cap (ADR-11). Mirrors
   * `config.git.recentCommits`. Passed through to `buildBundle`.
   */
  gitRecentCommits: number;
  /**
   * BM25 ranking opt-in (v0.3 Theme 1.2 Fix 3, ADR-16). When true,
   * `get_symbol_context` ranks the intent block via FTS5 BM25 if
   * the caller passes a `query` parameter. Mirrors
   * `config.mcp.symbolContextBM25`. Defaults to false; flag-off
   * is byte-equivalent to v0.2 ranking (severity → source →
   * claim_id), guarded by the v0.2-equivalence canary tests.
   */
  symbolContextBM25?: boolean;
}

export function createGetSymbolContextHandler(
  deps: HandlerDeps,
): (request: CallToolRequest) => Promise<CallToolResult> {
  return async (request) => {
    const args = parseArgs(request.params.arguments);

    // Single-symbol legacy path: byte-identical to the pre-ADR-15 code.
    // Detection on input shape (string vs. array), per ADR-15 §4
    // "Single-symbol input compatibility" — `["Foo"]` and `"Foo"` produce
    // different output shapes by design.
    if (!args.inputWasArray) {
      const input = args.symbols[0]!;
      const outcome = await resolveSingle(deps, input, args);
      return renderSingle(outcome, args);
    }

    // Multi-symbol path: fan out, fold, render.
    const outcomes = await Promise.all(
      args.symbols.map((input) => resolveSingle(deps, input, args)),
    );
    const allFailed = outcomes.every((o) => o.kind !== "bundle");
    return renderMulti(outcomes, args, allFailed);
  };
}

// ---------------------------------------------------------------------------
// Per-symbol resolution
// ---------------------------------------------------------------------------

type SubBundleOutcome =
  | { kind: "bundle"; input: string; bundle: SymbolContextBundle }
  | { kind: "not_found"; input: string }
  | {
      kind: "disambiguation";
      input: string;
      candidates: readonly AtlasSymbol[];
    }
  | {
      kind: "no_adapter";
      input: string;
      symbolId: string;
      language: string;
    };

async function resolveSingle(
  deps: HandlerDeps,
  input: string,
  args: ParsedArgs,
): Promise<SubBundleOutcome> {
  const result = resolveSymbol(deps.db, input, {
    fileHint: args.fileHint,
  });
  if (result.kind === "not_found") {
    return { kind: "not_found", input };
  }
  if (result.kind === "disambiguation") {
    return { kind: "disambiguation", input, candidates: result.candidates };
  }
  const symbol = result.symbol;
  const adapter = deps.adapters.get(symbol.language);
  if (!adapter) {
    return {
      kind: "no_adapter",
      input,
      symbolId: symbol.id,
      language: symbol.language,
    };
  }
  const bundle = await buildBundle(
    { db: deps.db, adapter },
    {
      symbol,
      depth: args.depth,
      include: args.include,
      maxRefs: args.maxRefs,
      gitRecentCommits: deps.gitRecentCommits,
      // ADR-16: BM25 path activates only when both the server flag is
      // on AND the caller provided a query. Either condition absent
      // falls through to v0.2 deterministic ranking (severity → source
      // → claim_id), preserving byte-equivalence with pre-Step-6
      // bundles. Both fallback rules guarded by canary tests.
      ...(deps.symbolContextBM25 === true && args.query !== undefined
        ? { bm25Query: args.query }
        : {}),
    },
  );
  return { kind: "bundle", input, bundle };
}

// ---------------------------------------------------------------------------
// Single-symbol rendering (legacy path; byte-identical to pre-ADR-15)
// ---------------------------------------------------------------------------

function renderSingle(
  outcome: SubBundleOutcome,
  args: ParsedArgs,
): CallToolResult {
  if (outcome.kind === "not_found") {
    return notFoundResult(outcome.input);
  }
  if (outcome.kind === "disambiguation") {
    return disambiguationResult(outcome.input, outcome.candidates, args.format);
  }
  if (outcome.kind === "no_adapter") {
    return noAdapterResult(outcome.symbolId, outcome.language);
  }
  if (args.format === "json") {
    return {
      content: [
        { type: "text", text: JSON.stringify(outcome.bundle, null, 2) },
      ],
    };
  }
  return {
    content: [
      {
        type: "text",
        text: renderCompact(outcome.bundle, {
          depth: args.depth,
          maxRefs: args.maxRefs,
        }),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Multi-symbol rendering (ADR-15)
// ---------------------------------------------------------------------------

function renderMulti(
  outcomes: readonly SubBundleOutcome[],
  args: ParsedArgs,
  allFailed: boolean,
): CallToolResult {
  if (args.format === "json") {
    return renderMultiJson(outcomes, allFailed);
  }
  return renderMultiCompact(outcomes, args, allFailed);
}

function renderMultiCompact(
  outcomes: readonly SubBundleOutcome[],
  args: ParsedArgs,
  allFailed: boolean,
): CallToolResult {
  const total = outcomes.length;
  const parts: string[] = [];

  if (allFailed) {
    parts.push(
      `ERR all_symbols_failed\n  COUNT ${total}\n\n`,
    );
  }

  outcomes.forEach((outcome, idx) => {
    const n = idx + 1;
    parts.push(`--- get_symbol_context: ${outcome.input} (${n} of ${total}) ---\n`);
    parts.push(renderSubBundleCompact(outcome, args));
    if (idx < outcomes.length - 1) {
      parts.push("\n");
    }
  });

  const text = parts.join("");
  const result: CallToolResult = {
    content: [{ type: "text", text }],
  };
  if (allFailed) result.isError = true;
  return result;
}

function renderSubBundleCompact(
  outcome: SubBundleOutcome,
  args: ParsedArgs,
): string {
  if (outcome.kind === "not_found") {
    return (
      `ERR not_found\n  MESSAGE Symbol '${outcome.input}' not found. ` +
      "Try find_by_intent if you're searching by concept rather than name.\n"
    );
  }
  if (outcome.kind === "disambiguation") {
    const lines = [
      "ERR disambiguation_required",
      `  MESSAGE Symbol '${outcome.input}' matches ${outcome.candidates.length} candidates. Pass file_hint to disambiguate.`,
    ];
    for (const c of outcome.candidates) {
      lines.push(`  CAND ${c.id} ${c.path}:${c.line} ${c.kind}`);
    }
    return lines.join("\n") + "\n";
  }
  if (outcome.kind === "no_adapter") {
    return (
      `ERR no_adapter\n  MESSAGE Symbol '${outcome.symbolId}' uses language '${outcome.language}' ` +
      "but no adapter is registered for that language in the current config.\n"
    );
  }
  return renderCompact(outcome.bundle, {
    depth: args.depth,
    maxRefs: args.maxRefs,
  });
}

interface JsonResultEntry {
  symbol: string;
  bundle: SymbolContextBundle | null;
  error: { code: string; message: string; candidates?: unknown[] } | null;
}

function renderMultiJson(
  outcomes: readonly SubBundleOutcome[],
  allFailed: boolean,
): CallToolResult {
  const results: JsonResultEntry[] = outcomes.map((outcome) => {
    if (outcome.kind === "bundle") {
      return { symbol: outcome.input, bundle: outcome.bundle, error: null };
    }
    if (outcome.kind === "not_found") {
      return {
        symbol: outcome.input,
        bundle: null,
        error: {
          code: "not_found",
          message: `Symbol '${outcome.input}' not found.`,
        },
      };
    }
    if (outcome.kind === "disambiguation") {
      return {
        symbol: outcome.input,
        bundle: null,
        error: {
          code: "disambiguation_required",
          message: `Symbol '${outcome.input}' matches ${outcome.candidates.length} candidates. Pass file_hint to disambiguate.`,
          candidates: outcome.candidates.map((c) => ({
            symbol_id: c.id,
            path: c.path,
            line: c.line,
            kind: c.kind,
          })),
        },
      };
    }
    return {
      symbol: outcome.input,
      bundle: null,
      error: {
        code: "no_adapter",
        message: `Symbol '${outcome.symbolId}' uses language '${outcome.language}' but no adapter is registered for that language in the current config.`,
      },
    };
  });
  const text = JSON.stringify({ results }, null, 2);
  const result: CallToolResult = {
    content: [{ type: "text", text }],
  };
  if (allFailed) result.isError = true;
  return result;
}

// ---------------------------------------------------------------------------
// Input parsing — extended for ADR-15 array shape
// ---------------------------------------------------------------------------

interface ParsedArgs {
  /**
   * Always a string array internally (single-string input becomes a
   * length-1 array). `.trim()`-normalized + exact-match-deduped before
   * landing here. The `inputWasArray` flag drives output shape detection
   * per ADR-15 §4.
   */
  symbols: string[];
  /**
   * True when the caller passed `string[]`; false when they passed a
   * single `string`. Drives whether to render the legacy single-bundle
   * shape or the multi-symbol envelope. Per ADR-15 §4: `["Foo"]` and
   * `"Foo"` produce different output shapes by design.
   */
  inputWasArray: boolean;
  fileHint?: string;
  depth: BundleDepth;
  include: readonly BundleSignal[];
  maxRefs: number;
  format: "compact" | "json";
  /**
   * Optional BM25 query string (ADR-16). When present and the
   * server-side flag is on, the intent block is BM25-ranked against
   * this query. When absent, falls back to deterministic v0.2
   * ordering. Per ADR-15 §3, applies uniformly across the
   * multi-symbol batch (no per-symbol query overrides).
   */
  query?: string;
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

  const { symbols, inputWasArray } = parseSymbolInput(args.symbol);

  const depth = parseDepth(args.depth);
  const include = parseInclude(args.include);
  const maxRefs = parseMaxRefs(args.max_refs);
  const format = parseFormat(args.format);
  const fileHint =
    typeof args.file_hint === "string" && args.file_hint.trim().length > 0
      ? args.file_hint
      : undefined;

  // ADR-16: optional `query` parameter for BM25 ranking. Empty/whitespace
  // strings normalize to undefined so callers get the v0.2 fallback path
  // rather than a degenerate empty-query BM25 call.
  let query: string | undefined;
  if (args.query !== undefined) {
    if (typeof args.query !== "string") {
      throw new McpError(
        ErrorCode.InvalidParams,
        `get_symbol_context: 'query' must be a string when provided; got ${typeof args.query}.`,
      );
    }
    const trimmed = args.query.trim();
    if (trimmed.length > 0) query = trimmed;
  }

  const parsed: ParsedArgs = {
    symbols,
    inputWasArray,
    depth,
    include,
    maxRefs,
    format,
  };
  if (fileHint !== undefined) parsed.fileHint = fileHint;
  if (query !== undefined) parsed.query = query;
  return parsed;
}

/**
 * Parse + normalize the `symbol` input. Accepts a non-empty string or a
 * non-empty array of strings (ADR-15 §1 oneOf schema). Array inputs are
 * `.trim()`-normalized, exact-match-deduped (ADR-15 §8), and cap-checked
 * against MAX_SYMBOLS_PER_CALL.
 *
 * Cap enforcement is defense-in-depth — the schema's `maxItems` blocks
 * 11+ at the protocol layer when callers respect the schema, but a
 * non-conforming caller could ship 11+ items past the schema, so the
 * handler re-checks. ADR-15 §2: "11+ items → McpError InvalidParams".
 */
function parseSymbolInput(raw: unknown): {
  symbols: string[];
  inputWasArray: boolean;
} {
  if (typeof raw === "string") {
    if (raw.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "get_symbol_context: 'symbol' must be a non-empty string (full ID or plain name).",
      );
    }
    return { symbols: [raw], inputWasArray: false };
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "get_symbol_context: 'symbol' array must contain at least one entry.",
      );
    }
    if (raw.length > MAX_SYMBOLS_PER_CALL) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `get_symbol_context: 'symbol' array exceeds ${MAX_SYMBOLS_PER_CALL}-item cap (got ${raw.length}). Split into multiple calls.`,
      );
    }
    const trimmed: string[] = [];
    for (const entry of raw) {
      if (typeof entry !== "string") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "get_symbol_context: every 'symbol' array entry must be a string.",
        );
      }
      const t = entry.trim();
      if (t.length === 0) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "get_symbol_context: 'symbol' array entries must be non-empty after trimming whitespace.",
        );
      }
      trimmed.push(t);
    }
    // Exact-string-match dedup (ADR-15 §8). Case-sensitive — matches
    // ADR-01's case-sensitive symbol resolution. Preserves first-occurrence
    // order so request-order semantics hold.
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const s of trimmed) {
      if (!seen.has(s)) {
        seen.add(s);
        deduped.push(s);
      }
    }
    return { symbols: deduped, inputWasArray: true };
  }

  throw new McpError(
    ErrorCode.InvalidParams,
    "get_symbol_context: 'symbol' must be a non-empty string or array of strings.",
  );
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
// Single-symbol error-shaped results (isError: true, returned to caller —
// not thrown). Byte-identical to pre-ADR-15 implementation, since
// renderSingle delegates here for the legacy path.
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

function noAdapterResult(symbolId: string, language: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          `ERR no_adapter\n  MESSAGE Symbol '${symbolId}' uses language '${language}' ` +
          "but no adapter is registered for that language in the current config.\n",
      },
    ],
  };
}
