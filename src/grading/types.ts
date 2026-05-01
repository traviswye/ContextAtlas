/**
 * Shared type definitions for the v0.5 LLM-judge grading harness.
 *
 * Per ADR-19 §1, the rubric scores 4 axes on a 0-3 scale; AxisName +
 * AxisScore enforce that shape at the type level. Snake_case axis
 * names mirror the model's JSON output convention (see ExtractedClaim
 * in src/extraction/prompt.ts for the same boundary pattern).
 *
 * Per ADR-02 (amended 2026-04-30), this module avoids importing from
 * src/extraction/; the UsageInfo shape is duplicated rather than
 * shared to keep research-time modules independent.
 */

/** The 4 rubric axes per ADR-19 §1. Snake_case matches rubric prompt JSON output keys. */
export type AxisName =
  | "factual_correctness"
  | "completeness"
  | "actionability"
  | "hallucination";

/** The 0-3 ordinal scale per ADR-19 §1. Numeric literal union enforces the scale. */
export type AxisScore = 0 | 1 | 2 | 3;

/** One full set of rubric scores — all 4 axes present. */
export type RubricResult = {
  [axis in AxisName]: AxisScore;
};

/** Sonnet 4.6 default judge; Opus 4.7 escalation backup per ADR-19 §2. */
export type ModelId = "claude-sonnet-4-6" | "claude-opus-4-7";

/**
 * Token accounting from a single Anthropic SDK response. Cache fields
 * intentionally excluded — v0.5 doesn't use prompt caching; cache
 * pricing constants exist in pricing.ts for forward-compat only.
 */
export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
}

/** Shared metadata across all judge call results. */
export interface BaseCallResult {
  usage: UsageInfo;
  costUsd: number;
  model: ModelId;
}

/** Single-trial grading result — used in Step 6 calibration. */
export interface JudgeCallResult extends BaseCallResult {
  scores: RubricResult;
}

/** Paired-comparison grading result — used in Step 8 production. */
export interface PairedJudgeCallResult extends BaseCallResult {
  scoresA: RubricResult;
  scoresB: RubricResult;
}
