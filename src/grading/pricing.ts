/**
 * Cost model for v0.5 LLM-judge grading API spend.
 *
 * Verified against https://claude.com/pricing as of 2026-04-30.
 * Pricing subject to change; re-verify pre-Step-6 calibration if
 * cycle extends beyond ~30 days.
 *
 * Pricing is deliberately not configurable — v0.5 scope is cost
 * visibility, not cost modeling. If Anthropic changes rates or the
 * v0.5 model selection shifts (per ADR-19 §2), update the constants
 * here; pricing co-locates with the ModelId definition in types.ts.
 *
 * Cache-write / cache-read constants are exported for forward-compat
 * even though v0.5 does not use prompt caching at first; UsageInfo
 * does not currently include cache token counts so computeCostUsd
 * does not consult them.
 *
 * Per ADR-02 (amended 2026-04-30), this module is one of two
 * permitted callers of Anthropic API pricing logic; deliberately
 * does NOT import from src/extraction/pricing.ts to keep research-
 * time modules independent.
 */

import type { ModelId, UsageInfo } from "./types.js";

// Sonnet 4.6 — default judge per ADR-19 §2.
export const SONNET_46_INPUT_USD_PER_MTOKEN = 3.0;
export const SONNET_46_OUTPUT_USD_PER_MTOKEN = 15.0;
export const SONNET_46_CACHE_WRITE_USD_PER_MTOKEN = 3.75;
export const SONNET_46_CACHE_READ_USD_PER_MTOKEN = 0.3;

// Opus 4.7 — escalation backup per ADR-19 §2.
export const OPUS_47_INPUT_USD_PER_MTOKEN = 5.0;
export const OPUS_47_OUTPUT_USD_PER_MTOKEN = 25.0;
export const OPUS_47_CACHE_WRITE_USD_PER_MTOKEN = 6.25;
export const OPUS_47_CACHE_READ_USD_PER_MTOKEN = 0.5;

/** Identity element for accumulating usage across multiple API calls. */
export const ZERO_USAGE: UsageInfo = {
  inputTokens: 0,
  outputTokens: 0,
};

export function addUsage(a: UsageInfo, b: UsageInfo): UsageInfo {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/**
 * USD cost for the given token counts under the specified model's
 * pricing. Exhaustive switch over ModelId — adding a new model
 * surfaces a compile-time "missing return" error here under strict
 * mode (no default branch needed; return-type enforcement is the
 * compile-time guarantee).
 */
export function computeCostUsd(usage: UsageInfo, model: ModelId): number {
  switch (model) {
    case "claude-sonnet-4-6":
      return (
        (usage.inputTokens / 1_000_000) * SONNET_46_INPUT_USD_PER_MTOKEN +
        (usage.outputTokens / 1_000_000) * SONNET_46_OUTPUT_USD_PER_MTOKEN
      );
    case "claude-opus-4-7":
      return (
        (usage.inputTokens / 1_000_000) * OPUS_47_INPUT_USD_PER_MTOKEN +
        (usage.outputTokens / 1_000_000) * OPUS_47_OUTPUT_USD_PER_MTOKEN
      );
  }
}
