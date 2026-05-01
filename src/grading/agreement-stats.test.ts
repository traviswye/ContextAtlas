import { describe, expect, it } from "vitest";

import {
  aggregateSpearman,
  directionAgreementPerAxis,
  evaluateStep6Gates,
  exactMatchRate,
  meanAbsoluteDifferencePerAxis,
  spearmanCorrelation,
  withinOnePointAgreementPerAxis,
} from "./agreement-stats.js";
import type { RubricResult } from "./types.js";

// Compact builder: each tuple is [factual, completeness, actionability, hallucination]
function rr(...tuples: number[][]): RubricResult[] {
  return tuples.map((t) => {
    if (t.length !== 4) throw new Error("each tuple must be length 4");
    return {
      factual_correctness: t[0] as 0 | 1 | 2 | 3,
      completeness: t[1] as 0 | 1 | 2 | 3,
      actionability: t[2] as 0 | 1 | 2 | 3,
      hallucination: t[3] as 0 | 1 | 2 | 3,
    };
  });
}

// ===========================================================================
// withinOnePointAgreementPerAxis
// ===========================================================================

describe("withinOnePointAgreementPerAxis", () => {
  it("all exact matches → 1.0 per axis", () => {
    const pass1 = rr([3, 2, 1, 0], [2, 2, 2, 2]);
    const result = withinOnePointAgreementPerAxis(pass1, pass1);
    expect(result).toEqual({
      factual_correctness: 1,
      completeness: 1,
      actionability: 1,
      hallucination: 1,
    });
  });

  it("all within 1 point (mix exact + 1-point gaps) → 1.0 per axis", () => {
    const pass1 = rr([3, 2, 1, 0], [2, 2, 2, 2]);
    const pass2 = rr([2, 2, 2, 1], [3, 1, 1, 3]); // each gap ≤ 1
    const result = withinOnePointAgreementPerAxis(pass1, pass2);
    expect(result.factual_correctness).toBe(1);
    expect(result.completeness).toBe(1);
    expect(result.actionability).toBe(1);
    expect(result.hallucination).toBe(1);
  });

  it("8/10 within 1 / 2 with 2-point gap → 0.8 per axis (gate boundary)", () => {
    // 10 trials; pass2 differs by 2 on factual_correctness in last 2 trials only
    const pass1 = rr(
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
    );
    const pass2 = rr(
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [3, 2, 1, 0],
      [1, 2, 1, 0],
      [1, 2, 1, 0],
    );
    const result = withinOnePointAgreementPerAxis(pass1, pass2);
    expect(result.factual_correctness).toBe(0.8);
    expect(result.completeness).toBe(1);
    expect(result.actionability).toBe(1);
    expect(result.hallucination).toBe(1);
  });

  it("empty input → NaN per axis", () => {
    const result = withinOnePointAgreementPerAxis([], []);
    expect(result.factual_correctness).toBeNaN();
  });

  it("length mismatch throws", () => {
    expect(() =>
      withinOnePointAgreementPerAxis(rr([1, 1, 1, 1]), rr([1, 1, 1, 1], [2, 2, 2, 2])),
    ).toThrow();
  });
});

// ===========================================================================
// exactMatchRate
// ===========================================================================

describe("exactMatchRate", () => {
  it("all exact → 1.0", () => {
    const pass1 = rr([3, 2, 1, 0], [2, 2, 2, 2]);
    expect(exactMatchRate(pass1, pass1)).toBe(1);
  });

  it("zero exact matches → 0.0", () => {
    const pass1 = rr([3, 3, 3, 3]);
    const pass2 = rr([0, 0, 0, 0]);
    expect(exactMatchRate(pass1, pass2)).toBe(0);
  });

  it("50/50 mix → 0.5", () => {
    // 4 axes; 2 match, 2 differ
    const pass1 = rr([3, 2, 1, 0]);
    const pass2 = rr([3, 2, 0, 1]);
    expect(exactMatchRate(pass1, pass2)).toBe(0.5);
  });

  it("empty input → NaN", () => {
    expect(exactMatchRate([], [])).toBeNaN();
  });
});

// ===========================================================================
// spearmanCorrelation
// ===========================================================================

describe("spearmanCorrelation", () => {
  it("perfect monotonic agreement → 1.0", () => {
    expect(spearmanCorrelation([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 6);
  });

  it("perfect reverse → -1.0", () => {
    expect(spearmanCorrelation([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 6);
  });

  it("uncorrelated case → 0", () => {
    // x_ranks = [1,2,3,4]; y_ranks = [3,1,4,2]; sum-product around mean = 0
    expect(spearmanCorrelation([1, 2, 3, 4], [3, 1, 4, 2])).toBeCloseTo(0, 6);
  });

  it("zero variance on one variable → NaN", () => {
    expect(spearmanCorrelation([3, 3, 3, 3], [1, 2, 3, 4])).toBeNaN();
  });

  it("tied data with average ranks (matches scipy.stats.spearmanr)", () => {
    // x = [1, 2, 2, 3]; ranks = [1, 2.5, 2.5, 4]
    // y = [1, 2, 3, 4]; ranks = [1, 2, 3, 4]
    // Pearson on ranks: cov=4.5, varX=4.5, varY=5.0; rho = 4.5/sqrt(22.5) ≈ 0.94868
    expect(spearmanCorrelation([1, 2, 2, 3], [1, 2, 3, 4])).toBeCloseTo(
      0.9486832981,
      6,
    );
  });

  it("n < 2 → NaN", () => {
    expect(spearmanCorrelation([1], [2])).toBeNaN();
    expect(spearmanCorrelation([], [])).toBeNaN();
  });

  it("length mismatch throws", () => {
    expect(() => spearmanCorrelation([1, 2, 3], [1, 2])).toThrow();
  });
});

// ===========================================================================
// aggregateSpearman
// ===========================================================================

describe("aggregateSpearman", () => {
  it("perfect agreement across all axes → 1.0", () => {
    const trials = rr([3, 2, 1, 0], [2, 3, 1, 0], [1, 0, 3, 2]);
    expect(aggregateSpearman(trials, trials)).toBeCloseTo(1, 6);
  });

  it("inverted across all axes → -1.0", () => {
    const judge = rr([3, 2, 1, 0], [2, 3, 1, 0], [1, 0, 3, 2]);
    const travis = rr([0, 1, 2, 3], [1, 0, 2, 3], [2, 3, 0, 1]);
    expect(aggregateSpearman(judge, travis)).toBeCloseTo(-1, 6);
  });
});

// ===========================================================================
// directionAgreementPerAxis
// ===========================================================================

describe("directionAgreementPerAxis", () => {
  it("all directions match → 1.0 per axis", () => {
    const judge = rr([1, 1, 1, 1], [2, 1, 1, 1], [3, 1, 1, 1]);
    const travis = rr([0, 2, 2, 2], [1, 2, 2, 2], [2, 2, 2, 2]);
    const result = directionAgreementPerAxis(judge, travis);
    // factual: judge increasing 1→2→3; travis increasing 0→1→2; same direction; all 3 pairs agree
    expect(result.factual_correctness).toBe(1);
    // others: judge ties; travis ties; tie agrees with tie
    expect(result.completeness).toBe(1);
    expect(result.actionability).toBe(1);
    expect(result.hallucination).toBe(1);
  });

  it("all directions inverted → 0.0 per axis", () => {
    const judge = rr([1, 1, 1, 1], [2, 1, 1, 1], [3, 1, 1, 1]);
    const travis = rr([3, 1, 1, 1], [2, 1, 1, 1], [1, 1, 1, 1]);
    const result = directionAgreementPerAxis(judge, travis);
    expect(result.factual_correctness).toBe(0);
    // other axes both tie; agree
    expect(result.completeness).toBe(1);
  });

  it("ties on both sides count as agreement (option (a) semantics)", () => {
    // All judge axes = 2; all travis axes = 2; every pair ties on both sides
    const judge = rr([2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 2]);
    const travis = rr([2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 2]);
    const result = directionAgreementPerAxis(judge, travis);
    expect(result.factual_correctness).toBe(1);
  });

  it("judge ties but travis differs → disagreement", () => {
    // 2 trials, 1 pair. judge ties on factual (2,2); travis differs (1,2)
    const judge = rr([2, 1, 1, 1], [2, 1, 1, 1]);
    const travis = rr([1, 1, 1, 1], [2, 1, 1, 1]);
    const result = directionAgreementPerAxis(judge, travis);
    // factual: sign(0) vs sign(-1); 0 !== -1; disagree
    expect(result.factual_correctness).toBe(0);
  });

  it("n=1 (zero pairs) → NaN per axis", () => {
    const result = directionAgreementPerAxis(rr([2, 2, 2, 2]), rr([2, 2, 2, 2]));
    expect(result.factual_correctness).toBeNaN();
  });
});

// ===========================================================================
// meanAbsoluteDifferencePerAxis
// ===========================================================================

describe("meanAbsoluteDifferencePerAxis", () => {
  it("zero MAD when judge equals travis → 0 per axis", () => {
    const trials = rr([3, 2, 1, 0], [2, 3, 1, 0]);
    const result = meanAbsoluteDifferencePerAxis(trials, trials);
    expect(result.factual_correctness).toBe(0);
    expect(result.completeness).toBe(0);
    expect(result.actionability).toBe(0);
    expect(result.hallucination).toBe(0);
  });

  it("constant +1 offset on factual_correctness → 1.0 on that axis, 0 elsewhere", () => {
    const judge = rr([3, 1, 1, 1], [2, 1, 1, 1], [1, 1, 1, 1]);
    const travis = rr([2, 1, 1, 1], [1, 1, 1, 1], [0, 1, 1, 1]);
    const result = meanAbsoluteDifferencePerAxis(judge, travis);
    expect(result.factual_correctness).toBe(1);
    expect(result.completeness).toBe(0);
    expect(result.actionability).toBe(0);
    expect(result.hallucination).toBe(0);
  });

  it("mixed differences → per-axis means", () => {
    // 2 trials. factual diffs [|3-1|, |0-2|] = [2, 2] → MAD=2
    // completeness diffs [|2-2|, |1-1|] = [0, 0] → MAD=0
    // actionability diffs [|1-0|, |3-3|] = [1, 0] → MAD=0.5
    const judge = rr([3, 2, 1, 0], [0, 1, 3, 0]);
    const travis = rr([1, 2, 0, 0], [2, 1, 3, 0]);
    const result = meanAbsoluteDifferencePerAxis(judge, travis);
    expect(result.factual_correctness).toBe(2);
    expect(result.completeness).toBe(0);
    expect(result.actionability).toBe(0.5);
    expect(result.hallucination).toBe(0);
  });

  it("empty input → NaN per axis", () => {
    const result = meanAbsoluteDifferencePerAxis([], []);
    expect(result.factual_correctness).toBeNaN();
  });
});

// ===========================================================================
// evaluateStep6Gates
// ===========================================================================

describe("evaluateStep6Gates", () => {
  // 10 trials of varied scores; pass1 == pass2 (perfect within-judge);
  // perfect agreement with travis on subset.
  const cleanTrials = rr(
    [3, 2, 1, 0],
    [2, 3, 1, 0],
    [1, 2, 3, 0],
    [0, 1, 2, 3],
    [3, 3, 3, 3],
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [2, 2, 2, 2],
    [3, 1, 2, 0],
    [0, 3, 1, 2],
  );

  it("all-pass case → pass: true; failures: []", () => {
    const subset = cleanTrials.slice(0, 5);
    const result = evaluateStep6Gates({
      judgeScoresPass1: cleanTrials,
      judgeScoresPass2: cleanTrials,
      judgeScoresOnTravisSubset: subset,
      travisScores: subset,
    });
    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("within-judge fail on factual_correctness", () => {
    // pass1 baseline; pass2 differs by 2 on factual in last 3 trials → 7/10 = 0.7 < 0.8
    const pass2 = rr(
      [3, 2, 1, 0],
      [2, 3, 1, 0],
      [1, 2, 3, 0],
      [0, 1, 2, 3],
      [3, 3, 3, 3],
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      // last 3 trials: factual_correctness shifted by 2
      [0, 2, 2, 2], // was 2; now 0; gap=2
      [1, 1, 2, 0], // was 3; now 1; gap=2
      [2, 3, 1, 2], // was 0; now 2; gap=2
    );
    const subset = cleanTrials.slice(0, 5);
    const result = evaluateStep6Gates({
      judgeScoresPass1: cleanTrials,
      judgeScoresPass2: pass2,
      judgeScoresOnTravisSubset: subset,
      travisScores: subset,
    });
    expect(result.pass).toBe(false);
    expect(
      result.failures.find((f) => f.kind === "within-judge-axis"),
    ).toMatchObject({
      kind: "within-judge-axis",
      axis: "factual_correctness",
      observed: 0.7,
      threshold: 0.8,
    });
  });

  it("aggregate Spearman fail (judge inverted from travis)", () => {
    const subset = cleanTrials.slice(0, 5);
    const invertedTravis = subset.map((r) => ({
      factual_correctness: (3 - r.factual_correctness) as 0 | 1 | 2 | 3,
      completeness: (3 - r.completeness) as 0 | 1 | 2 | 3,
      actionability: (3 - r.actionability) as 0 | 1 | 2 | 3,
      hallucination: (3 - r.hallucination) as 0 | 1 | 2 | 3,
    }));
    const result = evaluateStep6Gates({
      judgeScoresPass1: cleanTrials,
      judgeScoresPass2: cleanTrials,
      judgeScoresOnTravisSubset: subset,
      travisScores: invertedTravis,
    });
    expect(result.pass).toBe(false);
    expect(
      result.failures.find((f) => f.kind === "travis-aggregate-spearman"),
    ).toBeDefined();
  });

  it("direction-agreement fail on at least one axis (full reverse)", () => {
    const subset = cleanTrials.slice(0, 5);
    const reverseTravis = [...subset].reverse(); // pure ordering reverse
    const result = evaluateStep6Gates({
      judgeScoresPass1: cleanTrials,
      judgeScoresPass2: cleanTrials,
      judgeScoresOnTravisSubset: subset,
      travisScores: reverseTravis,
    });
    expect(result.pass).toBe(false);
    // at least one direction-agreement-axis failure expected
    expect(
      result.failures.some(
        (f) => f.kind === "travis-direction-agreement-axis",
      ),
    ).toBe(true);
  });

  it("custom thresholds via options force all-axis within-judge failures", () => {
    const subset = cleanTrials.slice(0, 5);
    const result = evaluateStep6Gates(
      {
        judgeScoresPass1: cleanTrials,
        judgeScoresPass2: cleanTrials,
        judgeScoresOnTravisSubset: subset,
        travisScores: subset,
      },
      { withinJudgeFloor: 1.5 }, // impossible threshold; all 4 axes fail
    );
    expect(result.pass).toBe(false);
    const wjFailures = result.failures.filter(
      (f) => f.kind === "within-judge-axis",
    );
    expect(wjFailures).toHaveLength(4);
  });

  it("diagnostics block returns raw stats regardless of pass/fail", () => {
    const subset = cleanTrials.slice(0, 5);
    const result = evaluateStep6Gates({
      judgeScoresPass1: cleanTrials,
      judgeScoresPass2: cleanTrials,
      judgeScoresOnTravisSubset: subset,
      travisScores: subset,
    });
    expect(
      result.diagnostics.withinJudgeWithinOnePointPerAxis.factual_correctness,
    ).toBe(1);
    expect(result.diagnostics.withinJudgeExactMatchRate).toBe(1);
    expect(result.diagnostics.travisAggregateSpearman).toBeCloseTo(1, 6);
    expect(
      result.diagnostics.travisDirectionAgreementPerAxis.factual_correctness,
    ).toBe(1);
    expect(result.diagnostics.madPerAxis.factual_correctness).toBe(0);
  });

  it("MAD does not appear in failures (diagnostic-only per ADR-19 §2)", () => {
    // Travis grades constantly differ from judge by 1 → MAD = 1 across axes
    // But correlation perfect (offset is constant); should pass aggregate Spearman + direction
    const subset = cleanTrials.slice(0, 5);
    const offsetTravis = subset.map((r) => ({
      factual_correctness: Math.max(0, r.factual_correctness - 1) as 0 | 1 | 2 | 3,
      completeness: Math.max(0, r.completeness - 1) as 0 | 1 | 2 | 3,
      actionability: Math.max(0, r.actionability - 1) as 0 | 1 | 2 | 3,
      hallucination: Math.max(0, r.hallucination - 1) as 0 | 1 | 2 | 3,
    }));
    const result = evaluateStep6Gates({
      judgeScoresPass1: cleanTrials,
      judgeScoresPass2: cleanTrials,
      judgeScoresOnTravisSubset: subset,
      travisScores: offsetTravis,
    });
    // No MAD-related failure kinds defined; failures don't include MAD
    expect(
      result.failures.every(
        (f) => f.kind !== ("mad" as unknown as never),
      ),
    ).toBe(true);
    // MAD reported in diagnostics
    expect(result.diagnostics.madPerAxis.factual_correctness).toBeGreaterThan(0);
  });
});
