/**
 * Tests for src/grading/reporting.ts.
 *
 * Coverage targets per Step 5 design Q6 lock:
 *   - distinguishableColumnCaption returns ADR-19 §4-extended caption
 *     (regression sentinel for caption text + ciLevel substitution).
 *   - generateVarianceTable returns empty array (stub-shape compliance
 *     at Step 5; full implementation at Step 7).
 *   - shipNarrativeCredibilityLine returns placeholder with '[stub'
 *     prefix (stub-shape compliance).
 *   - VarianceTableRow shape exists (compilation-time assertion via
 *     fixture construction).
 */

import { describe, expect, it } from "vitest";

import {
  aggregateCrossCellRollup,
  aggregatePerCellDifference,
} from "./stats.js";
import {
  distinguishableColumnCaption,
  generateVarianceTable,
  shipNarrativeCredibilityLine,
  type VarianceTableRow,
} from "./reporting.js";

// ============================================================================
// distinguishableColumnCaption — full implementation; regression sentinel
// ============================================================================

describe("distinguishableColumnCaption — caption text regression sentinels", () => {
  it("0.95 ciLevel returns caption with '95%' substitution", () => {
    const caption = distinguishableColumnCaption(0.95);
    expect(caption).toContain("95% CI excludes zero");
    expect(caption).not.toContain("90%");
  });

  it("0.90 ciLevel returns caption with '90%' substitution", () => {
    const caption = distinguishableColumnCaption(0.9);
    expect(caption).toContain("90% CI excludes zero");
    expect(caption).not.toContain("95%");
  });

  it("contains 'Distinguishable' key term", () => {
    expect(distinguishableColumnCaption(0.95)).toMatch(/^Distinguishable =/);
  });

  it("contains 'no NHST p-value interpretation' anti-NHST framing (ADR-19 §4 intent)", () => {
    expect(distinguishableColumnCaption(0.95)).toContain(
      "no NHST p-value interpretation",
    );
  });

  it("contains 'absence of evidence ≠ evidence of absence' reviewer-defensibility line", () => {
    expect(distinguishableColumnCaption(0.95)).toContain(
      "absence of evidence ≠ evidence of absence",
    );
  });

  it("contains 'AT THIS SUBSTRATE SIZE' qualifier (substrate-size framing)", () => {
    expect(distinguishableColumnCaption(0.95)).toContain(
      "AT THIS SUBSTRATE SIZE",
    );
  });

  it("contains 'Effect-size + uncertainty framing only' descriptive-CI intent", () => {
    expect(distinguishableColumnCaption(0.95)).toContain(
      "Effect-size + uncertainty framing only",
    );
  });

  it("0.95 vs 0.90 captions differ only in percentage substitution", () => {
    const c95 = distinguishableColumnCaption(0.95);
    const c90 = distinguishableColumnCaption(0.9);
    expect(c95.replace("95%", "X%")).toBe(c90.replace("90%", "X%"));
  });
});

// ============================================================================
// generateVarianceTable — stub at Step 5; returns empty array
// ============================================================================

describe("generateVarianceTable — Step 5 stub-shape compliance", () => {
  it("returns empty array regardless of input (stub at Step 5)", () => {
    const diff = aggregatePerCellDifference(
      "cell-0",
      "factual_correctness",
      [3, 3, 2, 3, 3],
      [2, 2, 2, 3, 2],
    );
    expect(generateVarianceTable([diff])).toEqual([]);
    expect(generateVarianceTable([])).toEqual([]);
  });

  it("returns empty array for multi-cell input (full impl at Step 7)", () => {
    const diffs = [
      aggregatePerCellDifference("c0", "m", [1, 2, 3], [4, 5, 6]),
      aggregatePerCellDifference("c1", "m", [7, 8, 9], [10, 11, 12]),
    ];
    expect(generateVarianceTable(diffs)).toEqual([]);
  });
});

// ============================================================================
// shipNarrativeCredibilityLine — stub at Step 5; placeholder string
// ============================================================================

describe("shipNarrativeCredibilityLine — Step 5 stub-shape compliance", () => {
  it("returns placeholder string with '[stub' prefix (stub at Step 5)", () => {
    const diff = aggregatePerCellDifference("c0", "m", [1, 2], [3, 4]);
    const rollup = aggregateCrossCellRollup([diff]);
    const line = shipNarrativeCredibilityLine(rollup);
    expect(line).toMatch(/^\[stub/);
    expect(line).toContain("Step 7");
  });
});

// ============================================================================
// VarianceTableRow shape — compilation-time fixture assertion
// ============================================================================

describe("VarianceTableRow shape", () => {
  it("can be constructed with the documented field set", () => {
    const row: VarianceTableRow = {
      cellId: "hono/h4-validator-typeflow",
      metric: "factual_correctness",
      meanCa: 2.8,
      meanBetaCa: 2.2,
      meanDifference: 0.6,
      ciLowerDifference: 0.1,
      ciUpperDifference: 1.1,
      distinguishable: true,
    };
    expect(row.cellId).toBe("hono/h4-validator-typeflow");
    expect(row.distinguishable).toBe(true);
  });
});
