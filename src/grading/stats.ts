/**
 * Statistical primitives for v0.5 LLM-judge harness — paired-t CI
 * computation + 4-level aggregation pipeline per ADR-19 §4.
 *
 * Per ADR-19 §4 (descriptive CI only; paired-t for difference-of-means
 * per 2026-05-03 amendment commit `05c9fc7`) + Step 1.4 statistical
 * methodology lock + STEP-PLAN-V0.5 Step 5. Roll-our-own t-distribution
 * lookup honors CLAUDE.md "Dependencies: Minimize" principle (~30 LOC
 * lookup table; no simple-statistics or scipy dependency).
 *
 * Variance / standardDeviation use SAMPLE standard deviation
 * (Bessel's correction; n-1 denominator) per textbook convention.
 * Matches scipy.stats.tstd default. Required for t-distribution
 * assumptions to hold; also matches reference values used in test
 * substrate.
 *
 * Difference-of-means CI uses paired-t per ADR-19 §4 amendment:
 *   df = n − 1
 *   mean_diff = mean(differences) where differences[i] = groupA[i] − groupB[i]
 *   SE_diff = sd(differences) / sqrt(n)
 *   CI_diff = mean_diff ± t_critical(df, α/2) × SE_diff
 *
 * Cross-cell rollup applies the same paired-t primitive at the
 * concatenated-differences scale (Option B-2 lock per Step 5 design):
 * concat all per-cell raw differences across cells; apply paired-t at
 * N=25 base substrate; df=24. Single primitive at two scales keeps
 * the formula uniform.
 *
 * t-table provenance: scipy.stats.t.ppf(1 - α/2, df) for df=1..30 + ∞,
 * α ∈ {0.025, 0.05}. Generated against scipy v1.x; values frozen as
 * TypeScript object literal at 6-decimal precision. To regenerate
 * (e.g., precision sweep or coverage extension): scipy.stats.t.ppf in
 * a Python repl with the same df/α inputs; values are stable to
 * machine precision; 6-decimal rounding has no impact on CI bounds at
 * v0.5 substrate scale.
 *
 * See:
 *   - docs/adr/ADR-19-llm-judge-methodology.md §4 (paired-t amendment;
 *     CI computation paragraph; 4-level aggregation table) + §Revision
 *     history (2026-05-03 amendment entry)
 *   - docs/adr/ADR-02-extraction-sole-api-caller.md (amended 2026-04-30;
 *     src/grading/ permitted module; this file does not call API)
 *   - STEP-PLAN-V0.5.md Step 5 (statistical tooling implementation)
 */

// ============================================================================
// t-distribution lookup table — scipy.stats.t.ppf reference values
// ============================================================================

/**
 * Two-sided CI levels supported. 0.95 → α/2 = 0.025; 0.90 → α/2 = 0.05.
 */
export type CILevel = 0.95 | 0.9;

const T_CRITICAL_ALPHA_025: Readonly<Record<number, number>> = Object.freeze({
  1: 12.706205,
  2: 4.302653,
  3: 3.182446,
  4: 2.776445,
  5: 2.570582,
  6: 2.446912,
  7: 2.364624,
  8: 2.306004,
  9: 2.262157,
  10: 2.228139,
  11: 2.200985,
  12: 2.178813,
  13: 2.160369,
  14: 2.144787,
  15: 2.13145,
  16: 2.119905,
  17: 2.109816,
  18: 2.100922,
  19: 2.093024,
  20: 2.085963,
  21: 2.079614,
  22: 2.073873,
  23: 2.068658,
  24: 2.063899,
  25: 2.059539,
  26: 2.055529,
  27: 2.051831,
  28: 2.048407,
  29: 2.04523,
  30: 2.042272,
});

const T_CRITICAL_ALPHA_05: Readonly<Record<number, number>> = Object.freeze({
  1: 6.313752,
  2: 2.919986,
  3: 2.353363,
  4: 2.131847,
  5: 2.015048,
  6: 1.94318,
  7: 1.894579,
  8: 1.859548,
  9: 1.833113,
  10: 1.812461,
  11: 1.795885,
  12: 1.782288,
  13: 1.770933,
  14: 1.76131,
  15: 1.75305,
  16: 1.745884,
  17: 1.739607,
  18: 1.734064,
  19: 1.729133,
  20: 1.724718,
  21: 1.720743,
  22: 1.717144,
  23: 1.713872,
  24: 1.710882,
  25: 1.708141,
  26: 1.705618,
  27: 1.703288,
  28: 1.701131,
  29: 1.699127,
  30: 1.697261,
});

const Z_CRITICAL_ALPHA_025 = 1.959964;
const Z_CRITICAL_ALPHA_05 = 1.644854;

/**
 * Look up t_critical for given (df, ciLevel). df > 30 falls back to the
 * z-distribution asymptote (1.959964 for 95% CI; 1.644854 for 90% CI)
 * with implicit narrow-CI bias of <2% per textbook convention. df < 1
 * throws (no CI computable).
 */
export function tCritical(df: number, ciLevel: CILevel): number {
  if (!Number.isInteger(df) || df < 1) {
    throw new Error(`df must be a positive integer; got: ${String(df)}`);
  }
  const table = ciLevel === 0.95 ? T_CRITICAL_ALPHA_025 : T_CRITICAL_ALPHA_05;
  if (df > 30) {
    return ciLevel === 0.95 ? Z_CRITICAL_ALPHA_025 : Z_CRITICAL_ALPHA_05;
  }
  const value = table[df];
  if (value === undefined) {
    throw new Error(`unexpected: t-table lookup miss at df=${df}`);
  }
  return value;
}

// ============================================================================
// Variance / standard deviation — sample-sd (Bessel's correction)
// ============================================================================

/**
 * Sample variance: sum((x_i − mean)^2) / (n − 1). Bessel's correction
 * applied. Matches scipy.stats.tstd default (and t-distribution
 * theoretical assumption). Throws if n < 2 (no variance computable).
 */
export function variance(values: readonly number[]): number {
  if (values.length < 2) {
    throw new Error(
      `variance requires n >= 2; got n=${values.length}`,
    );
  }
  const m = mean(values);
  let sumSqDev = 0;
  for (const v of values) {
    const d = v - m;
    sumSqDev += d * d;
  }
  return sumSqDev / (values.length - 1);
}

/** sqrt(variance). Same n>=2 requirement. */
export function standardDeviation(values: readonly number[]): number {
  return Math.sqrt(variance(values));
}

/** Arithmetic mean. Throws if empty. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("mean requires at least one value");
  }
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * (max − min) / mean. ADR-19 §5 variance trigger metric for low-N
 * cells where range/mean is preferred over CV for cross-cycle
 * comparability with Phase 8 §8 framing. Throws on empty or
 * mean=0 (division by zero would yield Inf/NaN; loud-fail).
 */
export function rangeOverMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("rangeOverMean requires at least one value");
  }
  const m = mean(values);
  if (m === 0) {
    throw new Error("rangeOverMean undefined for mean=0");
  }
  let mn = values[0];
  let mx = values[0];
  for (const v of values) {
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return (mx - mn) / Math.abs(m);
}

// ============================================================================
// Single-sample CI primitive
// ============================================================================

export interface MeanCI {
  mean: number;
  ciLower: number;
  ciUpper: number;
  n: number;
  df: number;
  tCritical: number;
  ciLevel: CILevel;
  /** sd / sqrt(n); useful for downstream pooled-SE checks. */
  standardError: number;
}

/**
 * 95% (or 90%) CI on a single sample via single-sample t formula.
 * df = n − 1; SE = sample-sd / sqrt(n). Throws if n < 2 (variance
 * not computable; per-axis rubric scores at n=1 cannot bound a CI).
 */
export function meanWithCI(
  values: readonly number[],
  ciLevel: CILevel = 0.95,
): MeanCI {
  if (values.length < 2) {
    throw new Error(`meanWithCI requires n >= 2; got n=${values.length}`);
  }
  const n = values.length;
  const m = mean(values);
  const sd = standardDeviation(values);
  const se = sd / Math.sqrt(n);
  const df = n - 1;
  const tc = tCritical(df, ciLevel);
  const margin = tc * se;
  return {
    mean: m,
    ciLower: m - margin,
    ciUpper: m + margin,
    n,
    df,
    tCritical: tc,
    ciLevel,
    standardError: se,
  };
}

// ============================================================================
// Paired difference CI primitive — paired-t per ADR-19 §4 amendment
// ============================================================================

export interface DifferenceCI {
  meanA: number;
  meanB: number;
  meanDifference: number;
  ciLowerDifference: number;
  ciUpperDifference: number;
  /** True iff difference CI excludes zero per ADR-19 §4. */
  distinguishable: boolean;
  n: number;
  df: number;
  tCritical: number;
  ciLevel: CILevel;
  standardErrorDifference: number;
  /**
   * Raw paired differences (groupA[i] − groupB[i]). Carried through the
   * pipeline so cross-cell rollup can concat across cells per Option
   * B-2 lock without forcing the caller to thread raw values
   * separately.
   */
  rawDifferences: number[];
}

/**
 * Paired-t difference-of-means CI per ADR-19 §4 amendment. Computes
 * differences[i] = groupA[i] − groupB[i] then a single-sample CI on
 * the differences (df = n − 1; SE = sd(differences) / sqrt(n)).
 *
 * Throws if groupA.length !== groupB.length (paired-t requires
 * one-to-one correspondence) or if either is empty/n<2.
 */
export function differenceOfMeansCI(
  groupA: readonly number[],
  groupB: readonly number[],
  ciLevel: CILevel = 0.95,
): DifferenceCI {
  if (groupA.length !== groupB.length) {
    throw new Error(
      `paired-t requires equal-length groups; got groupA.length=${groupA.length}, groupB.length=${groupB.length}`,
    );
  }
  if (groupA.length < 2) {
    throw new Error(
      `differenceOfMeansCI requires n >= 2 paired observations; got n=${groupA.length}`,
    );
  }
  const n = groupA.length;
  const differences: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    differences[i] = groupA[i] - groupB[i];
  }
  const meanDiff = mean(differences);
  const sdDiff = standardDeviation(differences);
  const seDiff = sdDiff / Math.sqrt(n);
  const df = n - 1;
  const tc = tCritical(df, ciLevel);
  const margin = tc * seDiff;
  const ciLower = meanDiff - margin;
  const ciUpper = meanDiff + margin;
  return {
    meanA: mean(groupA),
    meanB: mean(groupB),
    meanDifference: meanDiff,
    ciLowerDifference: ciLower,
    ciUpperDifference: ciUpper,
    distinguishable: ciLower > 0 || ciUpper < 0,
    n,
    df,
    tCritical: tc,
    ciLevel,
    standardErrorDifference: seDiff,
    rawDifferences: differences,
  };
}

// ============================================================================
// 4-level aggregation pipeline per ADR-19 §4
// ============================================================================

export type Condition = "ca" | "beta-ca";

export interface PerCellInput {
  cellId: string;
  condition: Condition;
  metric: string;
  values: number[];
}

export interface PerCellAggregate extends MeanCI {
  cellId: string;
  condition: Condition;
  metric: string;
}

export interface PerCellDifference extends DifferenceCI {
  cellId: string;
  metric: string;
}

export interface CrossCellRollup extends DifferenceCI {
  metric: string;
  /** Cells that contributed to the concatenated paired-t. */
  cellIds: string[];
}

/**
 * Per-cell aggregate per (cell, condition, metric). Slim summary view
 * over MeanCI; raw values are NOT carried forward (PerCellAggregate is
 * a derived view per Step 5 design Q5 lock). Caller threads raw values
 * separately to aggregatePerCellDifference for paired-t computation.
 */
export function aggregatePerCell(
  input: PerCellInput,
  ciLevel: CILevel = 0.95,
): PerCellAggregate {
  const ci = meanWithCI(input.values, ciLevel);
  return {
    ...ci,
    cellId: input.cellId,
    condition: input.condition,
    metric: input.metric,
  };
}

/**
 * Per-cell paired-t difference CI per ADR-19 §4 amendment. Takes raw
 * caValues + betaCaValues arrays (paired by trial-index); computes
 * paired-t difference internally. PerCellDifference carries
 * rawDifferences for downstream cross-cell rollup per Option B-2 lock.
 */
export function aggregatePerCellDifference(
  cellId: string,
  metric: string,
  caValues: readonly number[],
  betaCaValues: readonly number[],
  ciLevel: CILevel = 0.95,
): PerCellDifference {
  const diff = differenceOfMeansCI(caValues, betaCaValues, ciLevel);
  return {
    ...diff,
    cellId,
    metric,
  };
}

/**
 * Cross-cell rollup per ADR-19 §4 Option B-2 lock: concat all paired
 * differences across cells; apply paired-t at the concatenated scale
 * (e.g., 5 cells × n=5 → N=25 paired obs; df=24). All input cells
 * must agree on metric (caller's responsibility — function asserts).
 */
export function aggregateCrossCellRollup(
  perCellDifferences: readonly PerCellDifference[],
  ciLevel: CILevel = 0.95,
): CrossCellRollup {
  if (perCellDifferences.length === 0) {
    throw new Error(
      "aggregateCrossCellRollup requires at least one per-cell difference",
    );
  }
  const metric = perCellDifferences[0].metric;
  for (const d of perCellDifferences) {
    if (d.metric !== metric) {
      throw new Error(
        `aggregateCrossCellRollup requires all cells to share the same metric; got '${metric}' and '${d.metric}'`,
      );
    }
  }
  const concatenated: number[] = [];
  // Reconstruct paired groupA / groupB from each cell's perspective by
  // splitting the rawDifferences back into pseudo-groups for the
  // differenceOfMeansCI call — but since we already have the
  // differences, we can't reconstruct the originals losslessly.
  // Instead, treat the differences themselves as a single sample and
  // compute the CI on them directly via single-sample t.
  for (const d of perCellDifferences) {
    for (const v of d.rawDifferences) concatenated.push(v);
  }
  if (concatenated.length < 2) {
    throw new Error(
      `aggregateCrossCellRollup requires N >= 2 paired observations after concat; got N=${concatenated.length}`,
    );
  }
  const meanDiff = mean(concatenated);
  const sdDiff = standardDeviation(concatenated);
  const n = concatenated.length;
  const seDiff = sdDiff / Math.sqrt(n);
  const df = n - 1;
  const tc = tCritical(df, ciLevel);
  const margin = tc * seDiff;
  const ciLower = meanDiff - margin;
  const ciUpper = meanDiff + margin;
  // Reconstruct meanA / meanB at the cross-cell scale by weighting
  // per-cell meanA / meanB by the per-cell N. Simple weighted mean
  // since all cells contribute equal-weight observations.
  let weightedSumA = 0;
  let weightedSumB = 0;
  let totalN = 0;
  for (const d of perCellDifferences) {
    weightedSumA += d.meanA * d.n;
    weightedSumB += d.meanB * d.n;
    totalN += d.n;
  }
  return {
    meanA: weightedSumA / totalN,
    meanB: weightedSumB / totalN,
    meanDifference: meanDiff,
    ciLowerDifference: ciLower,
    ciUpperDifference: ciUpper,
    distinguishable: ciLower > 0 || ciUpper < 0,
    n,
    df,
    tCritical: tc,
    ciLevel,
    standardErrorDifference: seDiff,
    rawDifferences: concatenated,
    metric,
    cellIds: perCellDifferences.map((d) => d.cellId),
  };
}
