/**
 * Factory: resolve extraction Extractor instance from config per
 * ADR-02 v0.7 Step 1.4b Path-3 entry-point-determined model.
 *
 * Under Path-3 entry-point-determined architecture:
 *   - CLI invocation (`contextatlas index`) → always
 *     AnthropicAPIDirectExtractor (canonical CLI behavior;
 *     pay-per-use cost model)
 *   - Claude Code Skills invocation (`/index-atlas` slash command)
 *     → Skills mechanism handles extraction (no TypeScript class
 *     dispatch; not factory's concern)
 *
 * This factory ONLY routes CLI-invoked extraction. Three config
 * field value scenarios:
 *   - Absent: → AnthropicAPIDirectExtractor (CLI default)
 *   - "anthropic-api-direct": → AnthropicAPIDirectExtractor
 *     (redundant; matches CLI default; parser emits deprecation
 *     warning)
 *   - "anthropic-api-claude-code" (legacy alias): →
 *     AnthropicAPIDirectExtractor (legacy semantically maps to
 *     CLI default; parser emits deprecation warning)
 *   - "claude-code-only": → ClaudeCodeOnlyExtractor informational-
 *     stub (emits redirect to /index-atlas Skills; parser emits
 *     deprecation warning)
 *
 * Architecture field deprecation warning emitted at parser layer
 * (validateArchitecture in src/config/parser.ts) for all three
 * field values; factory does not emit warnings itself.
 *
 * Lock chain: Q1.0.4 dropped (no default-on-config-field needed;
 * CLI is always API direct); Q1.0.8 simplified (--cc-only no-op +
 * warning; --api-direct dropped); Q1.0.10 simplified (single CLI-
 * invoked extractor + ClaudeCodeOnlyExtractor stub for legacy
 * paths); Q1.0.5 preserved (cost_model metadata in atlas.json).
 */

import type { ContextAtlasConfig } from "../types.js";

import { AnthropicAPIDirectExtractor } from "./extractors/anthropic-api-direct.js";
import { ClaudeCodeOnlyExtractor } from "./extractors/claude-code-only.js";
import type { Extractor } from "./extractor.js";

export function getExtractor(config: ContextAtlasConfig): Extractor {
  const architecture = config.architecture;

  // Absent OR redundant API-direct setting OR legacy alias all map
  // to the canonical CLI extractor.
  if (
    architecture === undefined ||
    architecture === "anthropic-api-direct" ||
    architecture === "anthropic-api-claude-code"
  ) {
    return new AnthropicAPIDirectExtractor();
  }

  // architecture === "claude-code-only" → informational-stub
  // (redirect message + zero-counts result per Q1.0.10 (b))
  return new ClaudeCodeOnlyExtractor();
}
