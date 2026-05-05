/**
 * Sectioned success message rendering for `contextatlas init` per
 * v0.6 Step 4.5 (Q4.0.8 lock + [OK] ASCII marker refinement at Step
 * 4.0; Q4.5.1-Q4.5.5 sub-adjudications at Step 4.5 surface review).
 *
 * Renders 4-section message (Setup / Smoke / Try-in-next-Claude-
 * Code-session / Re-run) with [OK] ASCII markers throughout for
 * terminal output reliability across cohort participant terminal
 * configurations. Language-aware first-query suggestions tailored
 * via symbol kind + name per Q4.5.4 lock (symbol-name-based with
 * kind-tag; works across all 3 supported languages without per-
 * language template proliferation).
 */

import type { LanguageCode, SymbolKind } from "../types.js";

import type { ConfigScaffoldResult } from "./config-scaffold.js";
import type { McpRegistrationResult } from "./mcp-registration.js";

export interface InitSuccessState {
  readonly scaffoldResult: ConfigScaffoldResult;
  readonly atlasState:
    | { readonly kind: "current"; readonly symbolCount: number }
    | { readonly kind: "extracted"; readonly symbolCount: number };
  readonly smokeResult: {
    readonly symbolId: string;
    readonly symbolName: string;
    readonly symbolKind: SymbolKind;
    readonly claims: number;
    readonly references: number;
    readonly durationMs: number;
  };
  readonly mcpResult: McpRegistrationResult;
  readonly detectedLanguages: readonly LanguageCode[];
  /** Empty array when no advisory warnings (clean automated path). */
  readonly warnings: readonly string[];
}

/**
 * Render success message string for stdout. Pure function — caller
 * writes returned string via writeStdout. Q4.5.2 struct-at-end pattern
 * ensures rendering is decoupled from orchestration; testable in
 * isolation per Q4.5.1 separate-module placement.
 */
export function renderSuccessMessage(state: InitSuccessState): string {
  const lines: string[] = [];

  lines.push("[OK] ContextAtlas init complete");
  lines.push("");

  // Setup section
  lines.push("Setup:");
  lines.push(...renderSetupLines(state));
  lines.push("");

  // Advisory warnings (when present; automated-with-warning route)
  if (state.warnings.length > 0) {
    lines.push("Advisory:");
    for (const w of state.warnings) {
      lines.push(`  - ${w}`);
    }
    lines.push("");
    lines.push(
      "(For best atlas quality, address advisory items per H5 detection output.)",
    );
    lines.push("");
  }

  // Smoke test section
  lines.push("Smoke test:");
  lines.push(...renderSmokeLines(state));
  lines.push("");

  // Try-in-next-Claude-Code-session section
  lines.push("Try in your next Claude Code session:");
  for (const suggestion of buildFirstQuerySuggestions(state.smokeResult)) {
    lines.push(`  ${suggestion}`);
  }
  lines.push("");

  // Re-run section
  lines.push("Re-run:");
  lines.push("  contextatlas doctor   # verify atlas + LSP health");
  lines.push(
    "  contextatlas index    # refresh atlas (after ADR/code changes)",
  );

  return lines.join("\n");
}

function renderSetupLines(state: InitSuccessState): string[] {
  const lines: string[] = [];

  // Config
  const configVerb =
    state.scaffoldResult.status === "created" ? "created" : "preserved";
  lines.push(`  - Config: .contextatlas.yml ${configVerb}`);

  // Atlas
  const atlasVerb =
    state.atlasState.kind === "extracted" ? "extracted" : "current";
  lines.push(
    `  - Atlas: .contextatlas/atlas.json (${atlasVerb}; ${state.atlasState.symbolCount} symbols)`,
  );

  // MCP
  const mcpVerb = mcpResultVerb(state.mcpResult.status);
  lines.push(`  - MCP: .mcp.json ${mcpVerb} (contextatlas server)`);

  return lines;
}

function mcpResultVerb(status: McpRegistrationResult["status"]): string {
  switch (status) {
    case "registered":
      return "registered";
    case "preserved":
      // Verbose form per Q4.5 Point 5 lock — cohort users may not
      // know what "preserved" alone means in MCP context.
      return "preserved (existing entry)";
    case "merged":
      return "merged (added contextatlas to existing servers)";
  }
}

function renderSmokeLines(state: InitSuccessState): string[] {
  const { symbolId, claims, references, durationMs } = state.smokeResult;
  return [
    `  [OK] get_symbol_context returned bundle for ${symbolId}`,
    `       (${claims} claims, ${references} references, ${durationMs}ms)`,
  ];
}

/**
 * Build language-aware first-query suggestions per Q4.5.4 lock.
 * Symbol-name-based with kind-tag; works across all 3 supported
 * languages (typescript / python / go) without per-language template
 * map. Q11-style refinement at v0.7+ if cohort feedback warrants
 * per-language nuance.
 *
 * `<intent>` placeholder per Q4.5 Point 4 lock — target context is
 * Claude Code session chat input (not shell), so angle brackets are
 * fine. Q11-style refinement at v0.7+ only if cohort feedback
 * surfaces shell-paste use case.
 */
function buildFirstQuerySuggestions(smokeResult: {
  readonly symbolName: string;
  readonly symbolKind: SymbolKind;
}): string[] {
  const { symbolName, symbolKind } = smokeResult;
  const kindNoun = describeKind(symbolKind);
  return [
    `"What does the ${symbolName} ${kindNoun} do?" — invokes get_symbol_context`,
    `"Find symbols related to <intent>" — invokes find_by_intent`,
  ];
}

/**
 * Map SymbolKind to user-facing noun for first-query suggestions.
 * Forward-compat fallback "symbol" for unrecognized kinds per Q4.5
 * Point 3 lock at Step 4.5 surface review.
 */
function describeKind(kind: SymbolKind): string {
  switch (kind) {
    case "class":
      return "class";
    case "interface":
      return "interface";
    case "function":
    case "method":
      return "function";
    case "type":
      return "type";
    case "enum":
      return "enum";
    case "variable":
      return "value";
    case "module":
      return "module";
    case "other":
      return "symbol";
    default:
      return "symbol"; // forward-compat fallback per Q4.5 Point 3 lock
  }
}
