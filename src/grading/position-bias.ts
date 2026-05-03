/**
 * Position-bias verification metric per ADR-19 §3.
 *
 * Step 8-only metric (not Step 6 — substrate too small for valid
 * computation). Computed POST-HOC after grading completes, from the
 * paired judge call results. Pure function; no I/O; no Anthropic
 * calls.
 *
 * Per ADR-19 §3 formula:
 *   imbalance = max(count_A_higher, count_B_higher) / n
 *   trigger if imbalance > 0.60
 *
 * Honest scope per ADR-19 §3 false-positive disclosure:
 *   At n=25 (Step 8 substrate; 5 anchor cells × n=5 trial-pairs),
 *   60% corresponds to ≥ 15 of 25 pairs leaning one way. p(≥15)
 *   under null ≈ 0.21 — false-positive rate is non-negligible by
 *   design. **Triggering the verification is NOT a methodology
 *   failure**; it is a verification mechanism that runs to detect
 *   residual leakage. Phase-9 ref doc framing language: "position-
 *   correlation verification triggered at threshold X; investigation
 *   outcome below" — outcome can be "format-leak → style-norm
 *   re-grade clears" OR "content-leak → honest finding that one
 *   condition produces systematically X-shaped answers."
 *
 * Position-bias is condition-agnostic — it counts A>B vs B>A
 * regardless of which condition (ca / beta-ca) landed in which
 * position. Manifest decoding (decodeAssignment from anonymize.ts)
 * is for downstream condition-aware analyses, not for this metric.
 *
 * Cross-order-regrade pairs (k=5-10 of 25 per ADR-19 §3) should
 * typically be EXCLUDED from this computation by the caller; they
 * are a control mechanism, not main-grading substrate. Caller
 * filters via manifest entry's cross_order_regrade flag before
 * passing scores in.
 *
 * See:
 *   - docs/adr/ADR-19-llm-judge-methodology.md §3 (anonymization
 *     protocol; position-correlation verification; trigger threshold;
 *     false-positive-rate-non-negligible-by-design framing)
 *   - src/grading/anonymize.ts (manifest schema; assignment decoding)
 *   - STEP-PLAN-V0.5.md Step 4 (double-blind harness implementation)
 */

import type { AxisName, RubricResult } from "./types.js";

/** ADR-19 §3 trigger threshold; locked. */
export const POSITION_BIAS_THRESHOLD = 0.6 as const;

const AXIS_NAMES: readonly AxisName[] = [
  "factual_correctness",
  "completeness",
  "actionability",
  "hallucination",
];

/** Imbalance breakdown for a single axis or aggregate pool. */
export interface AxisImbalance {
  /** Count of pairs where A scored strictly higher than B. */
  a_higher: number;
  /** Count of pairs where B scored strictly higher than A. */
  b_higher: number;
  /** Count of pairs where A and B scored equal (excluded from imbalance). */
  ties: number;
  /**
   * max(a_higher, b_higher) / (a_higher + b_higher); 0 if both zero
   * (all-ties case). Range [0.5, 1.0] when at least one pair has a
   * non-tie comparison.
   */
  imbalance: number;
}

export interface PositionBiasReport {
  per_axis: Record<AxisName, AxisImbalance>;
  aggregate: AxisImbalance;
  /** True iff aggregate.imbalance > POSITION_BIAS_THRESHOLD. */
  trigger: boolean;
  threshold: typeof POSITION_BIAS_THRESHOLD;
  /** Number of paired score entries evaluated. */
  n_pairs: number;
}

/** Minimal input shape — just the score sets per pair. */
export interface PairedScores {
  scoresA: RubricResult;
  scoresB: RubricResult;
}

function computeImbalance(
  a_higher: number,
  b_higher: number,
  ties: number,
): AxisImbalance {
  const total = a_higher + b_higher;
  const imbalance = total === 0 ? 0 : Math.max(a_higher, b_higher) / total;
  return { a_higher, b_higher, ties, imbalance };
}

/**
 * Compute per-axis + aggregate position-bias across paired score sets.
 *
 * Per-axis is reported for diagnostic visibility; AGGREGATE is the
 * load-bearing metric per ADR-19 §3 trigger condition. Per-axis at
 * Step 8 substrate (n=25 pairs) is too noisy to gate independently —
 * aggregate pooled across 4 axes (n=100 comparisons) is the
 * statistically meaningful substrate.
 */
export function computePositionBias(
  pairs: readonly PairedScores[],
): PositionBiasReport {
  const per_axis_raw: Record<AxisName, { a: number; b: number; t: number }> = {
    factual_correctness: { a: 0, b: 0, t: 0 },
    completeness: { a: 0, b: 0, t: 0 },
    actionability: { a: 0, b: 0, t: 0 },
    hallucination: { a: 0, b: 0, t: 0 },
  };

  for (const pair of pairs) {
    for (const axis of AXIS_NAMES) {
      const a = pair.scoresA[axis];
      const b = pair.scoresB[axis];
      if (a > b) per_axis_raw[axis].a++;
      else if (b > a) per_axis_raw[axis].b++;
      else per_axis_raw[axis].t++;
    }
  }

  const per_axis: Record<AxisName, AxisImbalance> = {
    factual_correctness: computeImbalance(
      per_axis_raw.factual_correctness.a,
      per_axis_raw.factual_correctness.b,
      per_axis_raw.factual_correctness.t,
    ),
    completeness: computeImbalance(
      per_axis_raw.completeness.a,
      per_axis_raw.completeness.b,
      per_axis_raw.completeness.t,
    ),
    actionability: computeImbalance(
      per_axis_raw.actionability.a,
      per_axis_raw.actionability.b,
      per_axis_raw.actionability.t,
    ),
    hallucination: computeImbalance(
      per_axis_raw.hallucination.a,
      per_axis_raw.hallucination.b,
      per_axis_raw.hallucination.t,
    ),
  };

  let agg_a = 0;
  let agg_b = 0;
  let agg_t = 0;
  for (const axis of AXIS_NAMES) {
    agg_a += per_axis[axis].a_higher;
    agg_b += per_axis[axis].b_higher;
    agg_t += per_axis[axis].ties;
  }
  const aggregate = computeImbalance(agg_a, agg_b, agg_t);

  return {
    per_axis,
    aggregate,
    trigger: aggregate.imbalance > POSITION_BIAS_THRESHOLD,
    threshold: POSITION_BIAS_THRESHOLD,
    n_pairs: pairs.length,
  };
}
