/**
 * Pre-flight cost estimation helpers for the generate-adrs feature.
 *
 * Per v0.7 Step 2.2.a.2 Lock 3 (two-phase cost reporting): the CLI
 * prints a pre-flight estimate (input + output tokens + USD cost
 * range) and prompts the user for [y/N] confirmation before the
 * Anthropic API call. Post-flight actual costs (from the API
 * response's usage data) print after the call completes.
 *
 * Token counting uses a rough `Math.ceil(chars / 4)` approximation
 * per public guidance for Claude / GPT tokenization on English-and-
 * code prose. Accurate enough for cost-estimate framing; the
 * post-flight actual numbers come straight from the API.
 */

import {
  OPUS_INPUT_PRICE_PER_MILLION_USD,
  OPUS_OUTPUT_PRICE_PER_MILLION_USD,
} from "./prompt.js";

/** Lower bound on output token estimate (5 ADRs at ~2k tokens each). */
const OUTPUT_TOKEN_ESTIMATE_LOW = 10_000;

/** Upper bound on output token estimate (15 ADRs at ~5k tokens each). */
const OUTPUT_TOKEN_ESTIMATE_HIGH = 75_000;

/**
 * Approximate token count for arbitrary text. Public guidance for
 * Claude / GPT tokenizers puts English-and-code prose at roughly
 * 4 characters per token; this rounds up.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface CostEstimateInputs {
  promptTokens: number;
  codebaseInventoryTokens: number;
  referenceContextTokens: number;
}

export interface CostEstimate {
  inputTokens: number;
  outputTokensLow: number;
  outputTokensHigh: number;
  costUsdLow: number;
  costUsdHigh: number;
}

/**
 * Build a pre-flight cost estimate from the assembled prompt-input
 * token counts. Returns a range — output cost depends on how many
 * ADRs the LLM ends up generating, which is a function of codebase
 * scale (the prompt's calibration section sets expectations).
 */
export function buildCostEstimate(
  inputs: CostEstimateInputs,
): CostEstimate {
  const inputTokens =
    inputs.promptTokens +
    inputs.codebaseInventoryTokens +
    inputs.referenceContextTokens;
  const inputCost =
    (inputTokens / 1_000_000) * OPUS_INPUT_PRICE_PER_MILLION_USD;
  const costUsdLow =
    inputCost +
    (OUTPUT_TOKEN_ESTIMATE_LOW / 1_000_000) *
      OPUS_OUTPUT_PRICE_PER_MILLION_USD;
  const costUsdHigh =
    inputCost +
    (OUTPUT_TOKEN_ESTIMATE_HIGH / 1_000_000) *
      OPUS_OUTPUT_PRICE_PER_MILLION_USD;
  return {
    inputTokens,
    outputTokensLow: OUTPUT_TOKEN_ESTIMATE_LOW,
    outputTokensHigh: OUTPUT_TOKEN_ESTIMATE_HIGH,
    costUsdLow,
    costUsdHigh,
  };
}

/**
 * Format the pre-flight estimate as a human-readable multi-line
 * string for stderr printing before the confirmation prompt.
 */
export function formatCostEstimateMessage(
  estimate: CostEstimate,
  inputs: CostEstimateInputs,
  referenceContextPath?: string,
): string {
  const lines: string[] = ["Estimating generate-adrs cost..."];
  lines.push(
    `- Codebase inventory: ~${Math.round(inputs.codebaseInventoryTokens / 1000)}k tokens`,
  );
  if (inputs.referenceContextTokens > 0) {
    const refLabel = referenceContextPath !== undefined ? ` (${referenceContextPath})` : "";
    lines.push(
      `- Reference context${refLabel}: ~${Math.round(inputs.referenceContextTokens / 1000)}k tokens`,
    );
  }
  lines.push(`- Prompt: ~${Math.round(inputs.promptTokens / 1000)}k tokens`);
  lines.push(
    `- Estimated input: ~${Math.round(estimate.inputTokens / 1000)}k tokens`,
  );
  lines.push(
    `- Estimated output: ~${Math.round(estimate.outputTokensLow / 1000)}k-${Math.round(estimate.outputTokensHigh / 1000)}k tokens (5-15 ADRs at typical size)`,
  );
  lines.push(
    `- Estimated cost: $${estimate.costUsdLow.toFixed(2)}-$${estimate.costUsdHigh.toFixed(2)} (Opus 4.7 at $${OPUS_INPUT_PRICE_PER_MILLION_USD}/M input + $${OPUS_OUTPUT_PRICE_PER_MILLION_USD}/M output)`,
  );
  lines.push("");
  lines.push("This is a one-time-per-repo operation.");
  return lines.join("\n");
}
