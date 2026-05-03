/**
 * Tests for src/grading/position-bias.ts.
 *
 * Coverage targets per Step 4 design lock:
 *   - Imbalance computation at boundary values (50/50; 60/40; 61/39;
 *     40/60 symmetric; 100/0 extreme; all-ties degenerate case).
 *   - Per-axis disaggregation correctness.
 *   - Aggregate pooling across axes.
 *   - Trigger condition (strictly > 0.60).
 *   - Empty input behavior.
 */

import { describe, expect, it } from "vitest";

import {
  computePositionBias,
  POSITION_BIAS_THRESHOLD,
  type PairedScores,
} from "./position-bias.js";
import type { AxisScore, RubricResult } from "./types.js";

// ============================================================================
// Helpers
// ============================================================================

function scores(
  factual: AxisScore,
  completeness: AxisScore,
  actionability: AxisScore,
  hallucination: AxisScore,
): RubricResult {
  return {
    factual_correctness: factual,
    completeness,
    actionability,
    hallucination,
  };
}

/** Make a pair where scoresA dominates scoresB on every axis. */
function aDominantPair(): PairedScores {
  return { scoresA: scores(3, 3, 3, 3), scoresB: scores(0, 0, 0, 0) };
}

/** Make a pair where scoresB dominates scoresA on every axis. */
function bDominantPair(): PairedScores {
  return { scoresA: scores(0, 0, 0, 0), scoresB: scores(3, 3, 3, 3) };
}

/** Make a pair where A == B on every axis. */
function tiePair(): PairedScores {
  return { scoresA: scores(2, 2, 2, 2), scoresB: scores(2, 2, 2, 2) };
}

// ============================================================================
// Boundary-value imbalance
// ============================================================================

describe("computePositionBias — imbalance computation", () => {
  it("50/50 split → aggregate imbalance 0.5 (no trigger)", () => {
    const pairs = [
      ...Array.from({ length: 5 }, () => aDominantPair()),
      ...Array.from({ length: 5 }, () => bDominantPair()),
    ];
    const report = computePositionBias(pairs);
    expect(report.aggregate.imbalance).toBe(0.5);
    expect(report.trigger).toBe(false);
  });

  it("exactly 60/40 → imbalance 0.6 → NO trigger (threshold is strict >)", () => {
    // 6 a-dominant + 4 b-dominant pairs = 24 a_higher + 16 b_higher across 4 axes
    const pairs = [
      ...Array.from({ length: 6 }, () => aDominantPair()),
      ...Array.from({ length: 4 }, () => bDominantPair()),
    ];
    const report = computePositionBias(pairs);
    expect(report.aggregate.a_higher).toBe(24);
    expect(report.aggregate.b_higher).toBe(16);
    expect(report.aggregate.imbalance).toBeCloseTo(0.6, 6);
    expect(report.trigger).toBe(false);
  });

  it("61/39 split → imbalance > 0.60 → trigger", () => {
    // 61 a-favoring + 39 b-favoring across 100 axis-pair comparisons
    // Use 25 pairs with mixed per-axis: 16 fully-a + 9 fully-b + per-axis adjustments to land exactly 61/39
    // Simpler: build directly via per-axis-controlled pairs.
    // 100 comparisons total; need 61 a_higher, 39 b_higher.
    // Build 25 pairs where each pair contributes 4 axis comparisons.
    // 15 a-dominant pairs (60 a_higher) + 10 b-dominant pairs (40 b_higher) + adjust 1: swap 1 axis from b-dominant to a-dominant.
    const pairs: PairedScores[] = [
      ...Array.from({ length: 15 }, () => aDominantPair()),
      ...Array.from({ length: 9 }, () => bDominantPair()),
      // 25th pair: 1 a-axis + 3 b-axes (61 a_higher / 39 b_higher target)
      { scoresA: scores(3, 0, 0, 0), scoresB: scores(0, 3, 3, 3) },
    ];
    const report = computePositionBias(pairs);
    expect(report.aggregate.a_higher).toBe(61);
    expect(report.aggregate.b_higher).toBe(39);
    expect(report.aggregate.imbalance).toBeCloseTo(0.61, 6);
    expect(report.trigger).toBe(true);
  });

  it("40/60 (B-leaning) → imbalance 0.6 (symmetric via max)", () => {
    const pairs = [
      ...Array.from({ length: 4 }, () => aDominantPair()),
      ...Array.from({ length: 6 }, () => bDominantPair()),
    ];
    const report = computePositionBias(pairs);
    expect(report.aggregate.a_higher).toBe(16);
    expect(report.aggregate.b_higher).toBe(24);
    expect(report.aggregate.imbalance).toBeCloseTo(0.6, 6);
    expect(report.trigger).toBe(false);
  });

  it("100/0 extreme → imbalance 1.0 → trigger", () => {
    const pairs = Array.from({ length: 5 }, () => aDominantPair());
    const report = computePositionBias(pairs);
    expect(report.aggregate.imbalance).toBe(1);
    expect(report.trigger).toBe(true);
  });

  it("all ties → aggregate imbalance 0 (degenerate; no trigger)", () => {
    const pairs = Array.from({ length: 10 }, () => tiePair());
    const report = computePositionBias(pairs);
    expect(report.aggregate.a_higher).toBe(0);
    expect(report.aggregate.b_higher).toBe(0);
    expect(report.aggregate.ties).toBe(40);
    expect(report.aggregate.imbalance).toBe(0);
    expect(report.trigger).toBe(false);
  });

  it("empty input → n_pairs=0; degenerate report; no trigger", () => {
    const report = computePositionBias([]);
    expect(report.n_pairs).toBe(0);
    expect(report.aggregate.a_higher).toBe(0);
    expect(report.aggregate.b_higher).toBe(0);
    expect(report.aggregate.imbalance).toBe(0);
    expect(report.trigger).toBe(false);
  });
});

// ============================================================================
// Per-axis disaggregation
// ============================================================================

describe("computePositionBias — per-axis disaggregation", () => {
  it("per-axis counts only that axis's comparisons", () => {
    // Pair where A wins on factual_correctness only; B wins on the other 3
    const pair: PairedScores = {
      scoresA: scores(3, 0, 0, 0),
      scoresB: scores(0, 3, 3, 3),
    };
    const report = computePositionBias([pair]);
    expect(report.per_axis.factual_correctness.a_higher).toBe(1);
    expect(report.per_axis.factual_correctness.b_higher).toBe(0);
    expect(report.per_axis.completeness.a_higher).toBe(0);
    expect(report.per_axis.completeness.b_higher).toBe(1);
    expect(report.per_axis.actionability.a_higher).toBe(0);
    expect(report.per_axis.actionability.b_higher).toBe(1);
    expect(report.per_axis.hallucination.a_higher).toBe(0);
    expect(report.per_axis.hallucination.b_higher).toBe(1);
  });

  it("per-axis tracks ties independently from a_higher/b_higher", () => {
    const pair: PairedScores = {
      scoresA: scores(3, 2, 2, 0),
      scoresB: scores(0, 2, 2, 3),
    };
    const report = computePositionBias([pair]);
    expect(report.per_axis.factual_correctness.a_higher).toBe(1);
    expect(report.per_axis.factual_correctness.ties).toBe(0);
    expect(report.per_axis.completeness.ties).toBe(1);
    expect(report.per_axis.actionability.ties).toBe(1);
    expect(report.per_axis.hallucination.b_higher).toBe(1);
  });

  it("aggregate sums across all 4 axes", () => {
    // 1 pair: 1 a_higher + 3 b_higher; aggregate same since only one pair
    const pair: PairedScores = {
      scoresA: scores(3, 0, 0, 0),
      scoresB: scores(0, 3, 3, 3),
    };
    const report = computePositionBias([pair]);
    expect(report.aggregate.a_higher).toBe(1);
    expect(report.aggregate.b_higher).toBe(3);
    expect(report.aggregate.imbalance).toBeCloseTo(0.75, 6);
  });
});

// ============================================================================
// Constants + report shape
// ============================================================================

describe("computePositionBias — report shape", () => {
  it("threshold equals POSITION_BIAS_THRESHOLD constant (0.60)", () => {
    expect(POSITION_BIAS_THRESHOLD).toBe(0.6);
    const report = computePositionBias([aDominantPair()]);
    expect(report.threshold).toBe(POSITION_BIAS_THRESHOLD);
  });

  it("n_pairs equals input pair count", () => {
    const pairs = Array.from({ length: 7 }, () => aDominantPair());
    const report = computePositionBias(pairs);
    expect(report.n_pairs).toBe(7);
  });

  it("includes all 4 axis names in per_axis report", () => {
    const report = computePositionBias([tiePair()]);
    expect(Object.keys(report.per_axis).sort()).toEqual([
      "actionability",
      "completeness",
      "factual_correctness",
      "hallucination",
    ]);
  });
});

// ============================================================================
// Trigger boundary (strict > 0.60)
// ============================================================================

describe("computePositionBias — trigger boundary", () => {
  it("trigger is strict > 0.60 (60/40 exactly does NOT trigger)", () => {
    // Exact 60/40 from above
    const pairs = [
      ...Array.from({ length: 6 }, () => aDominantPair()),
      ...Array.from({ length: 4 }, () => bDominantPair()),
    ];
    const report = computePositionBias(pairs);
    expect(report.aggregate.imbalance).toBeCloseTo(0.6, 6);
    expect(report.trigger).toBe(false);
  });

  it("trigger fires at 60.5/39.5 (just above threshold)", () => {
    // Build pairs producing 121 a_higher / 79 b_higher across 200 comparisons → 0.605
    const pairs: PairedScores[] = [
      ...Array.from({ length: 30 }, () => aDominantPair()), // 120 a_higher
      ...Array.from({ length: 19 }, () => bDominantPair()), // 76 b_higher
      // 50th pair: 1 a + 3 b → +1 a, +3 b
      { scoresA: scores(3, 0, 0, 0), scoresB: scores(0, 3, 3, 3) },
    ];
    // Total: 121 a_higher, 79 b_higher → 121/200 = 0.605
    const report = computePositionBias(pairs);
    expect(report.aggregate.a_higher).toBe(121);
    expect(report.aggregate.b_higher).toBe(79);
    expect(report.aggregate.imbalance).toBeCloseTo(0.605, 6);
    expect(report.trigger).toBe(true);
  });
});
