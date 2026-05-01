/**
 * Pure-math judge-agreement metrics for v0.5 Step 6 calibration.
 *
 * Per ADR-19 §2 + §5, Step 6 calibration produces two metric families:
 *   - Within-judge consistency: Sonnet regrades the same trial; per-axis
 *     within-1-point agreement gates Step 7 (≥80% per axis), with an
 *     aggregate exact-match diagnostic floor (≥50%; reported, not gating).
 *   - Travis-intuition correlation: aggregate Spearman across pooled
 *     grade pairs (≥0.6) AND per-axis direction-agreement (≥75% per
 *     axis on trial-pair comparisons). Per ADR-19 §2, breaching either
 *     trigger fires Opus escalation.
 *
 * MAD (mean absolute difference) is reported as diagnostic-only per
 * ADR-19 §2 + 1.2 lock — MAD never alone fails the gate; lenience/
 * strictness recovery is rubric anchor refinement, not Opus escalation.
 *
 * Spearman correlation here is computed as Pearson correlation of
 * average-tied ranks (matches scipy.stats.spearmanr default). The
 * simplified formula `1 - 6Σd²/(n(n²-1))` is exact only when no ties
 * exist; for our 0-3 ordinal scale with small n=10-20, ties are
 * guaranteed, so we use the proper tied-rank-Pearson computation.
 *
 * All functions are pure: no IO; no API calls; deterministic.
 * Length mismatches between parallel-array inputs throw (programming
 * error; loud-fail discipline). Undefined statistics (e.g., zero-
 * variance Spearman input) return NaN; evaluateStep6Gates treats
 * non-finite observed values as gate failures with NaN preserved in
 * the failure record's observed field for diagnostic clarity.
 *
 * Per ADR-02 (amended 2026-04-30), this module is part of src/grading/
 * — research-time module independence preserved; deliberately does
 * NOT import from src/extraction/.
 */

import type { AxisName, RubricResult } from "./types.js";

// ============================================================================
// Threshold constants per ADR-19 §1 + §2 + §5
// ============================================================================

export const WITHIN_ONE_POINT_GATE = 0.8;
export const EXACT_MATCH_DIAGNOSTIC_FLOOR = 0.5;
export const ESCALATION_AGGREGATE_SPEARMAN_FLOOR = 0.6;
export const ESCALATION_DIRECTION_AGREEMENT_FLOOR = 0.75;
export const MAD_DISCLOSURE_THRESHOLD = 0.5;
export const MAD_REFINEMENT_THRESHOLD = 1.5;
export const COMPRESSION_SPEARMAN_THRESHOLD = 0.85;

const AXIS_NAMES: readonly AxisName[] = [
  "factual_correctness",
  "completeness",
  "actionability",
  "hallucination",
];

// ============================================================================
// Pure-math primitives
// ============================================================================

export function withinOnePointAgreementPerAxis(
  pass1: RubricResult[],
  pass2: RubricResult[],
): Record<AxisName, number> {
  if (pass1.length !== pass2.length) {
    throw new Error(
      `length mismatch: pass1=${pass1.length}, pass2=${pass2.length}`,
    );
  }
  const result = {} as Record<AxisName, number>;
  const n = pass1.length;
  for (const axis of AXIS_NAMES) {
    if (n === 0) {
      result[axis] = NaN;
      continue;
    }
    let within = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs(pass1[i][axis] - pass2[i][axis]) <= 1) within++;
    }
    result[axis] = within / n;
  }
  return result;
}

export function exactMatchRate(
  pass1: RubricResult[],
  pass2: RubricResult[],
): number {
  if (pass1.length !== pass2.length) {
    throw new Error(
      `length mismatch: pass1=${pass1.length}, pass2=${pass2.length}`,
    );
  }
  if (pass1.length === 0) return NaN;
  let matches = 0;
  let total = 0;
  for (let i = 0; i < pass1.length; i++) {
    for (const axis of AXIS_NAMES) {
      if (pass1[i][axis] === pass2[i][axis]) matches++;
      total++;
    }
  }
  return matches / total;
}

export function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length) {
    throw new Error(`length mismatch: x=${x.length}, y=${y.length}`);
  }
  if (x.length < 2) return NaN;
  return pearsonCorrelation(averageRanks(x), averageRanks(y));
}

export function aggregateSpearman(
  judgeScores: RubricResult[],
  travisScores: RubricResult[],
): number {
  if (judgeScores.length !== travisScores.length) {
    throw new Error(
      `length mismatch: judge=${judgeScores.length}, travis=${travisScores.length}`,
    );
  }
  const judgeFlat: number[] = [];
  const travisFlat: number[] = [];
  for (let i = 0; i < judgeScores.length; i++) {
    for (const axis of AXIS_NAMES) {
      judgeFlat.push(judgeScores[i][axis]);
      travisFlat.push(travisScores[i][axis]);
    }
  }
  return spearmanCorrelation(judgeFlat, travisFlat);
}

export function directionAgreementPerAxis(
  judgeScores: RubricResult[],
  travisScores: RubricResult[],
): Record<AxisName, number> {
  if (judgeScores.length !== travisScores.length) {
    throw new Error(
      `length mismatch: judge=${judgeScores.length}, travis=${travisScores.length}`,
    );
  }
  const result = {} as Record<AxisName, number>;
  const n = judgeScores.length;
  for (const axis of AXIS_NAMES) {
    let pairs = 0;
    let agreements = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const judgeDir = Math.sign(
          judgeScores[i][axis] - judgeScores[j][axis],
        );
        const travisDir = Math.sign(
          travisScores[i][axis] - travisScores[j][axis],
        );
        pairs++;
        if (judgeDir === travisDir) agreements++;
      }
    }
    result[axis] = pairs === 0 ? NaN : agreements / pairs;
  }
  return result;
}

export function meanAbsoluteDifferencePerAxis(
  judgeScores: RubricResult[],
  travisScores: RubricResult[],
): Record<AxisName, number> {
  if (judgeScores.length !== travisScores.length) {
    throw new Error(
      `length mismatch: judge=${judgeScores.length}, travis=${travisScores.length}`,
    );
  }
  const result = {} as Record<AxisName, number>;
  const n = judgeScores.length;
  for (const axis of AXIS_NAMES) {
    if (n === 0) {
      result[axis] = NaN;
      continue;
    }
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += Math.abs(judgeScores[i][axis] - travisScores[i][axis]);
    }
    result[axis] = sum / n;
  }
  return result;
}

// ============================================================================
// Step 6 gate evaluation
// ============================================================================

export type GateFailure =
  | {
      kind: "within-judge-axis";
      axis: AxisName;
      observed: number;
      threshold: number;
    }
  | { kind: "travis-aggregate-spearman"; observed: number; threshold: number }
  | {
      kind: "travis-direction-agreement-axis";
      axis: AxisName;
      observed: number;
      threshold: number;
    };

export interface Step6Diagnostics {
  withinJudgeWithinOnePointPerAxis: Record<AxisName, number>;
  withinJudgeExactMatchRate: number;
  travisAggregateSpearman: number;
  travisDirectionAgreementPerAxis: Record<AxisName, number>;
  madPerAxis: Record<AxisName, number>;
}

export interface Step6Result {
  pass: boolean;
  failures: GateFailure[];
  diagnostics: Step6Diagnostics;
}

export interface Step6GateInput {
  judgeScoresPass1: RubricResult[];
  judgeScoresPass2: RubricResult[];
  judgeScoresOnTravisSubset: RubricResult[];
  travisScores: RubricResult[];
}

export interface Step6GateOptions {
  withinJudgeFloor?: number;
  travisAggregateSpearmanFloor?: number;
  travisDirectionAgreementFloor?: number;
}

export function evaluateStep6Gates(
  input: Step6GateInput,
  options?: Step6GateOptions,
): Step6Result {
  const wjFloor = options?.withinJudgeFloor ?? WITHIN_ONE_POINT_GATE;
  const spearmanFloor =
    options?.travisAggregateSpearmanFloor ??
    ESCALATION_AGGREGATE_SPEARMAN_FLOOR;
  const directionFloor =
    options?.travisDirectionAgreementFloor ??
    ESCALATION_DIRECTION_AGREEMENT_FLOOR;

  const wjPerAxis = withinOnePointAgreementPerAxis(
    input.judgeScoresPass1,
    input.judgeScoresPass2,
  );
  const wjExactMatch = exactMatchRate(
    input.judgeScoresPass1,
    input.judgeScoresPass2,
  );
  const aggSpearman = aggregateSpearman(
    input.judgeScoresOnTravisSubset,
    input.travisScores,
  );
  const directionPerAxis = directionAgreementPerAxis(
    input.judgeScoresOnTravisSubset,
    input.travisScores,
  );
  const madPer = meanAbsoluteDifferencePerAxis(
    input.judgeScoresOnTravisSubset,
    input.travisScores,
  );

  const failures: GateFailure[] = [];
  for (const axis of AXIS_NAMES) {
    const observed = wjPerAxis[axis];
    if (!Number.isFinite(observed) || observed < wjFloor) {
      failures.push({
        kind: "within-judge-axis",
        axis,
        observed,
        threshold: wjFloor,
      });
    }
  }
  if (!Number.isFinite(aggSpearman) || aggSpearman < spearmanFloor) {
    failures.push({
      kind: "travis-aggregate-spearman",
      observed: aggSpearman,
      threshold: spearmanFloor,
    });
  }
  for (const axis of AXIS_NAMES) {
    const observed = directionPerAxis[axis];
    if (!Number.isFinite(observed) || observed < directionFloor) {
      failures.push({
        kind: "travis-direction-agreement-axis",
        axis,
        observed,
        threshold: directionFloor,
      });
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    diagnostics: {
      withinJudgeWithinOnePointPerAxis: wjPerAxis,
      withinJudgeExactMatchRate: wjExactMatch,
      travisAggregateSpearman: aggSpearman,
      travisDirectionAgreementPerAxis: directionPerAxis,
      madPerAxis: madPer,
    },
  };
}

// ============================================================================
// Internal helpers — average ranks + Pearson correlation
// ============================================================================

function averageRanks(values: number[]): number[] {
  const n = values.length;
  const sorted = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1].v === sorted[i].v) j++;
    // sorted[i..j] are tied; 1-based ranks (i+1..j+1) average to (i+j)/2 + 1
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[sorted[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  const denom = Math.sqrt(varX * varY);
  return denom === 0 ? NaN : cov / denom;
}
