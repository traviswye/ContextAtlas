/**
 * Cost model for extraction-pipeline API spend (v0.2 Stream A #2).
 *
 * Opus 4.7 pricing as of 2026-04-23.
 * Verify against current Anthropic pricing before trusting for
 * cost-critical usage. See:
 * https://www.anthropic.com/pricing
 *
 * Pricing is deliberately not configurable — v0.2 scope is cost
 * visibility, not cost modeling. If Anthropic changes rates or the
 * extraction model changes (per ADR-02), update the constants here;
 * pricing co-locates with the EXTRACTION_MODEL decision in
 * `prompt.ts`.
 */

export const OPUS_47_INPUT_USD_PER_MTOKEN = 15.0;
export const OPUS_47_OUTPUT_USD_PER_MTOKEN = 75.0;

/**
 * Token accounting from a single Anthropic SDK response.
 *
 * Cache-related fields (`cache_creation_input_tokens`,
 * `cache_read_input_tokens` in the SDK) are intentionally excluded
 * — the extraction pipeline per ADR-02 does not use prompt caching,
 * so they would always be zero. If v0.3+ enables caching, extend
 * this type.
 */
export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Identity element for accumulating usage across multiple API calls.
 */
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
 * USD cost for the given token counts under current Opus 4.7 pricing.
 * Returns full precision; formatting (e.g., toFixed(2)) is the
 * caller's responsibility.
 */
export function computeCostUsd(usage: UsageInfo): number {
  return (
    (usage.inputTokens / 1_000_000) * OPUS_47_INPUT_USD_PER_MTOKEN +
    (usage.outputTokens / 1_000_000) * OPUS_47_OUTPUT_USD_PER_MTOKEN
  );
}
