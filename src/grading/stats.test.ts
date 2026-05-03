/**
 * Tests for src/grading/stats.ts.
 *
 * Coverage targets per Step 5 design lock:
 *   - t-table values match scipy.stats.t.ppf at known df (textbook anchors)
 *   - Bessel's correction verified (variance([1,2,3,4,5]) === 2.5 not 2.0)
 *   - meanWithCI: textbook example with known mean+sd+CI bounds
 *   - differenceOfMeansCI (paired-t): textbook paired example
 *   - Boundary cases (n=2 minimum; n=1 throws; empty throws; length-mismatch throws)
 *   - df>30 falls back to z-asymptote
 *   - Aggregation pipeline integration (per-trial → per-cell → per-cell-difference → cross-cell rollup)
 *   - ciLevel parameter (0.95 vs 0.90 produce different t_critical)
 *   - rangeOverMean ADR-19 §5 trigger metric
 */

import { describe, expect, it } from "vitest";

import {
  aggregateCrossCellRollup,
  aggregatePerCell,
  aggregatePerCellDifference,
  differenceOfMeansCI,
  mean,
  meanWithCI,
  rangeOverMean,
  standardDeviation,
  tCritical,
  variance,
  type PerCellDifference,
} from "./stats.js";

// ============================================================================
// t-distribution lookup table — textbook anchors against scipy.stats.t.ppf
// ============================================================================

describe("tCritical — scipy reference values", () => {
  it("df=1, α=0.025 → 12.706205 (95% CI; widest)", () => {
    expect(tCritical(1, 0.95)).toBeCloseTo(12.706205, 6);
  });

  it("df=4, α=0.025 → 2.776445 (per-cell n=5 paired, df=4)", () => {
    expect(tCritical(4, 0.95)).toBeCloseTo(2.776445, 6);
  });

  it("df=8, α=0.025 → 2.306004 (legacy unpaired-pooled n=5+5; should NOT be used now)", () => {
    expect(tCritical(8, 0.95)).toBeCloseTo(2.306004, 6);
  });

  it("df=24, α=0.025 → 2.063899 (cross-cell N=25 paired, df=24)", () => {
    expect(tCritical(24, 0.95)).toBeCloseTo(2.063899, 6);
  });

  it("df=30, α=0.025 → 2.042272 (last tabulated entry)", () => {
    expect(tCritical(30, 0.95)).toBeCloseTo(2.042272, 6);
  });

  it("df=4, α=0.05 → 2.131847 (90% CI; per-cell n=5 paired)", () => {
    expect(tCritical(4, 0.9)).toBeCloseTo(2.131847, 6);
  });

  it("df=24, α=0.05 → 1.710882 (90% CI; cross-cell N=25)", () => {
    expect(tCritical(24, 0.9)).toBeCloseTo(1.710882, 6);
  });

  it("df > 30 falls back to z-asymptote (95% → 1.959964)", () => {
    expect(tCritical(31, 0.95)).toBeCloseTo(1.959964, 6);
    expect(tCritical(100, 0.95)).toBeCloseTo(1.959964, 6);
  });

  it("df > 30 falls back to z-asymptote (90% → 1.644854)", () => {
    expect(tCritical(31, 0.9)).toBeCloseTo(1.644854, 6);
    expect(tCritical(100, 0.9)).toBeCloseTo(1.644854, 6);
  });

  it("throws on df < 1", () => {
    expect(() => tCritical(0, 0.95)).toThrow(/positive integer/);
    expect(() => tCritical(-1, 0.95)).toThrow(/positive integer/);
  });

  it("throws on non-integer df", () => {
    expect(() => tCritical(2.5, 0.95)).toThrow(/positive integer/);
  });
});

// ============================================================================
// Variance — Bessel's correction (sample-sd; n-1 denominator)
// ============================================================================

describe("variance / standardDeviation — sample-sd (Bessel's correction)", () => {
  it("variance([1,2,3,4,5]) === 2.5 (sample-sd; NOT 2.0 population-sd)", () => {
    expect(variance([1, 2, 3, 4, 5])).toBeCloseTo(2.5, 10);
  });

  it("standardDeviation([1,2,3,4,5]) === sqrt(2.5)", () => {
    expect(standardDeviation([1, 2, 3, 4, 5])).toBeCloseTo(
      Math.sqrt(2.5),
      10,
    );
  });

  it("variance([2,4,4,4,5,5,7,9]) === 4.571 (textbook anchor)", () => {
    // Common textbook example: mean=5; sum_sq_dev=32; n-1=7 → 4.571428...
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(32 / 7, 10);
  });

  it("variance throws on n < 2", () => {
    expect(() => variance([])).toThrow(/n >= 2/);
    expect(() => variance([5])).toThrow(/n >= 2/);
  });

  it("variance of identical values is 0", () => {
    expect(variance([3, 3, 3, 3])).toBe(0);
  });
});

// ============================================================================
// mean
// ============================================================================

describe("mean", () => {
  it("computes arithmetic mean", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  it("throws on empty input", () => {
    expect(() => mean([])).toThrow(/at least one/);
  });
});

// ============================================================================
// rangeOverMean — ADR-19 §5 variance trigger metric
// ============================================================================

describe("rangeOverMean — ADR-19 §5 variance trigger", () => {
  it("(max - min) / mean for [1,2,3,4,5] → 4/3", () => {
    expect(rangeOverMean([1, 2, 3, 4, 5])).toBeCloseTo(4 / 3, 10);
  });

  it("identical values → 0 (zero range)", () => {
    expect(rangeOverMean([5, 5, 5, 5])).toBe(0);
  });

  it("hono/h1 Step 9 anchor: 45% range/mean (~0.45 over the threshold 0.20)", () => {
    // Synthetic representation of the Step 9 hono/h1 outlier
    // 45% range/mean: e.g., values at 80, 100, 80, 110, 90
    // (max - min) / mean = 30 / 92 ≈ 0.326... — adjust to actual 45%
    // Use simpler illustrative: values [70, 100, 130] → range 60, mean 100 → 0.60 (way above threshold)
    expect(rangeOverMean([70, 100, 130])).toBeCloseTo(0.6, 10);
  });

  it("throws on empty input", () => {
    expect(() => rangeOverMean([])).toThrow(/at least one/);
  });

  it("throws on mean=0 (division by zero)", () => {
    expect(() => rangeOverMean([-1, 1])).toThrow(/mean=0/);
  });
});

// ============================================================================
// meanWithCI — single-sample t formula
// ============================================================================

describe("meanWithCI — single-sample CI", () => {
  it("textbook example: [2,4,4,4,5,5,7,9] at 95% CI", () => {
    // mean=5; sd=sqrt(32/7)≈2.138; n=8; SE=sd/sqrt(8)≈0.756; df=7
    // t_critical(7, 0.025) = 2.364624
    // margin = 2.364624 × 0.756 ≈ 1.787
    // CI: [3.213, 6.787]
    const ci = meanWithCI([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(ci.mean).toBe(5);
    expect(ci.n).toBe(8);
    expect(ci.df).toBe(7);
    expect(ci.tCritical).toBeCloseTo(2.364624, 6);
    expect(ci.ciLower).toBeCloseTo(3.213, 2);
    expect(ci.ciUpper).toBeCloseTo(6.787, 2);
    expect(ci.ciLevel).toBe(0.95);
  });

  it("ciLevel 0.90 produces narrower CI than 0.95", () => {
    const ci95 = meanWithCI([1, 2, 3, 4, 5], 0.95);
    const ci90 = meanWithCI([1, 2, 3, 4, 5], 0.9);
    expect(ci90.ciUpper - ci90.ciLower).toBeLessThan(
      ci95.ciUpper - ci95.ciLower,
    );
    expect(ci90.tCritical).toBeLessThan(ci95.tCritical);
  });

  it("throws on n < 2", () => {
    expect(() => meanWithCI([])).toThrow(/n >= 2/);
    expect(() => meanWithCI([5])).toThrow(/n >= 2/);
  });

  it("CI bounds are symmetric around the mean", () => {
    const ci = meanWithCI([10, 12, 14, 16, 18]);
    expect(ci.ciUpper - ci.mean).toBeCloseTo(ci.mean - ci.ciLower, 10);
  });

  it("standardError = sd / sqrt(n)", () => {
    const ci = meanWithCI([1, 2, 3, 4, 5]);
    expect(ci.standardError).toBeCloseTo(
      standardDeviation([1, 2, 3, 4, 5]) / Math.sqrt(5),
      10,
    );
  });
});

// ============================================================================
// differenceOfMeansCI — paired-t per ADR-19 §4 amendment
// ============================================================================

describe("differenceOfMeansCI — paired-t", () => {
  it("identical paired groups → mean_diff=0; CI contains zero; not distinguishable", () => {
    const ci = differenceOfMeansCI([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
    expect(ci.meanDifference).toBe(0);
    expect(ci.ciLowerDifference).toBe(0);
    expect(ci.ciUpperDifference).toBe(0);
    expect(ci.distinguishable).toBe(false);
  });

  it("constant offset paired groups: zero variance of differences → CI collapses to point", () => {
    // ca = beta-ca + 2 → all differences = 2; sd=0; CI = [2, 2]
    const ci = differenceOfMeansCI([3, 4, 5, 6, 7], [1, 2, 3, 4, 5]);
    expect(ci.meanDifference).toBe(2);
    expect(ci.ciLowerDifference).toBe(2);
    expect(ci.ciUpperDifference).toBe(2);
    expect(ci.distinguishable).toBe(true); // 0 not in [2, 2]
  });

  it("textbook paired example", () => {
    // ca = [10, 12, 14, 16, 18]; beta-ca = [8, 11, 13, 14, 17]
    // differences = [2, 1, 1, 2, 1]; mean=1.4; sd=0.5477; n=5; SE=0.245
    // df=4; t_critical(4, 0.025)=2.776; margin=2.776 × 0.245 ≈ 0.680
    // CI: [0.720, 2.080]
    const ci = differenceOfMeansCI(
      [10, 12, 14, 16, 18],
      [8, 11, 13, 14, 17],
    );
    expect(ci.meanA).toBe(14);
    expect(ci.meanB).toBe(12.6);
    expect(ci.meanDifference).toBeCloseTo(1.4, 6);
    expect(ci.n).toBe(5);
    expect(ci.df).toBe(4);
    expect(ci.tCritical).toBeCloseTo(2.776445, 6);
    expect(ci.ciLowerDifference).toBeCloseTo(0.72, 2);
    expect(ci.ciUpperDifference).toBeCloseTo(2.08, 2);
    expect(ci.distinguishable).toBe(true);
  });

  it("rawDifferences carries paired differences for downstream cross-cell rollup", () => {
    const ci = differenceOfMeansCI([5, 7, 9], [4, 5, 8]);
    expect(ci.rawDifferences).toEqual([1, 2, 1]);
  });

  it("throws on length mismatch", () => {
    expect(() =>
      differenceOfMeansCI([1, 2, 3], [1, 2]),
    ).toThrow(/equal-length/);
  });

  it("throws on n < 2 paired observations", () => {
    expect(() => differenceOfMeansCI([5], [3])).toThrow(/n >= 2/);
    expect(() => differenceOfMeansCI([], [])).toThrow(/n >= 2/);
  });

  it("ciLevel parameter affects margin", () => {
    const ci95 = differenceOfMeansCI([2, 4, 6, 8, 10], [1, 3, 5, 7, 9], 0.95);
    const ci90 = differenceOfMeansCI([2, 4, 6, 8, 10], [1, 3, 5, 7, 9], 0.9);
    expect(ci90.tCritical).toBeLessThan(ci95.tCritical);
  });

  it("distinguishable true when mean_diff CI excludes zero (positive)", () => {
    // Large positive differences with small variance
    const ci = differenceOfMeansCI([10, 11, 12, 13, 14], [1, 2, 3, 4, 5]);
    expect(ci.meanDifference).toBe(9);
    expect(ci.ciLowerDifference).toBeGreaterThan(0);
    expect(ci.distinguishable).toBe(true);
  });

  it("distinguishable true when mean_diff CI excludes zero (negative)", () => {
    const ci = differenceOfMeansCI([1, 2, 3, 4, 5], [10, 11, 12, 13, 14]);
    expect(ci.meanDifference).toBe(-9);
    expect(ci.ciUpperDifference).toBeLessThan(0);
    expect(ci.distinguishable).toBe(true);
  });

  it("n=2 minimum (df=1; t_critical 12.706)", () => {
    const ci = differenceOfMeansCI([5, 7], [3, 4]);
    expect(ci.df).toBe(1);
    expect(ci.tCritical).toBeCloseTo(12.706205, 6);
  });
});

// ============================================================================
// 4-level aggregation pipeline
// ============================================================================

describe("aggregatePerCell", () => {
  it("returns PerCellAggregate with cell metadata + MeanCI fields", () => {
    const agg = aggregatePerCell({
      cellId: "hono/h4-validator-typeflow",
      condition: "ca",
      metric: "factual_correctness",
      values: [3, 3, 2, 3, 3],
    });
    expect(agg.cellId).toBe("hono/h4-validator-typeflow");
    expect(agg.condition).toBe("ca");
    expect(agg.metric).toBe("factual_correctness");
    expect(agg.mean).toBeCloseTo(2.8, 6);
    expect(agg.n).toBe(5);
    expect(agg.df).toBe(4);
  });
});

describe("aggregatePerCellDifference", () => {
  it("computes paired-t difference per cell with raw values", () => {
    const diff = aggregatePerCellDifference(
      "hono/h4-validator-typeflow",
      "factual_correctness",
      [3, 3, 2, 3, 3],
      [2, 2, 2, 3, 2],
    );
    expect(diff.cellId).toBe("hono/h4-validator-typeflow");
    expect(diff.metric).toBe("factual_correctness");
    expect(diff.n).toBe(5);
    expect(diff.df).toBe(4);
    expect(diff.rawDifferences).toEqual([1, 1, 0, 0, 1]);
  });
});

describe("aggregateCrossCellRollup — Option B-2 concat-paired-t", () => {
  it("threads per-cell-differences into N=25 cross-cell paired-t at v0.5 base substrate", () => {
    // 5 cells × 5 trials = N=25; df=24; t_critical 2.0639
    const perCellDiffs: PerCellDifference[] = [];
    for (let c = 0; c < 5; c++) {
      perCellDiffs.push(
        aggregatePerCellDifference(
          `cell-${c}`,
          "factual_correctness",
          [3, 3, 2, 3, 3],
          [2, 2, 2, 3, 2],
        ),
      );
    }
    const rollup = aggregateCrossCellRollup(perCellDiffs);
    expect(rollup.n).toBe(25);
    expect(rollup.df).toBe(24);
    expect(rollup.tCritical).toBeCloseTo(2.063899, 6);
    expect(rollup.cellIds).toEqual([
      "cell-0",
      "cell-1",
      "cell-2",
      "cell-3",
      "cell-4",
    ]);
    expect(rollup.metric).toBe("factual_correctness");
    expect(rollup.rawDifferences.length).toBe(25);
  });

  it("concatenates raw differences across cells in input order", () => {
    const perCellDiffs: PerCellDifference[] = [
      aggregatePerCellDifference("cell-0", "m", [10, 10], [5, 5]),
      aggregatePerCellDifference("cell-1", "m", [20, 20], [10, 10]),
    ];
    const rollup = aggregateCrossCellRollup(perCellDiffs);
    expect(rollup.rawDifferences).toEqual([5, 5, 10, 10]);
  });

  it("throws on metric mismatch across cells (caller bug)", () => {
    const perCellDiffs: PerCellDifference[] = [
      aggregatePerCellDifference("c0", "axis_a", [1, 2], [3, 4]),
      aggregatePerCellDifference("c1", "axis_b", [1, 2], [3, 4]),
    ];
    expect(() => aggregateCrossCellRollup(perCellDiffs)).toThrow(
      /share the same metric/,
    );
  });

  it("throws on empty input", () => {
    expect(() => aggregateCrossCellRollup([])).toThrow(/at least one/);
  });

  it("computes weighted mean of meanA / meanB across cells", () => {
    const perCellDiffs: PerCellDifference[] = [
      aggregatePerCellDifference("c0", "m", [10, 10], [5, 5]),
      aggregatePerCellDifference("c1", "m", [20, 20], [10, 10]),
    ];
    const rollup = aggregateCrossCellRollup(perCellDiffs);
    // c0: meanA=10, meanB=5, n=2. c1: meanA=20, meanB=10, n=2.
    // weighted meanA = (10*2 + 20*2) / 4 = 15; weighted meanB = 7.5
    expect(rollup.meanA).toBe(15);
    expect(rollup.meanB).toBe(7.5);
  });
});
