/**
 * Phase-9 reporting infrastructure for v0.5 LLM-judge harness.
 *
 * Per ADR-19 §4 (Distinguishable column caption framing) +
 * STEP-PLAN-V0.5 Step 5 (statistical tooling) + Step 5 design Q6
 * lock: stub-only at Step 5 with distinguishableColumnCaption as the
 * one full-implementation exception (caption is a static string per
 * ciLevel; no Step 7 dependency). Full implementations of
 * generateVarianceTable + shipNarrativeCredibilityLine land at Step 7
 * synthesis when Step 8 grading outputs are available.
 *
 * Caption text extends ADR-19 §4 framing intent with reviewer-
 * defensibility additions appropriate for reader-facing Phase-9 ref
 * doc tables: explicit "no NHST p-value interpretation"; "AT THIS
 * SUBSTRATE SIZE" qualifier; "absence of evidence ≠ evidence of
 * absence" framing. Caption WORDING is implementation detail; ADR-19
 * §4 specifies framing intent (descriptive CI only; non-NHST), not
 * exact text. No ADR-19 amendment needed for the wording extension.
 *
 * See:
 *   - docs/adr/ADR-19-llm-judge-methodology.md §4 (Distinguishable
 *     column caption framing intent)
 *   - src/grading/stats.ts (CrossCellRollup + PerCellDifference types
 *     consumed by Step 7 reporting; defined here for forward-compat)
 *   - STEP-PLAN-V0.5.md Step 5 (statistical tooling implementation;
 *     stubs at Step 5; full at Step 7)
 *   - Phase-9 reference doc target (placeholder; lands at Step 9)
 */

import type {
  CILevel,
  CrossCellRollup,
  PerCellDifference,
} from "./stats.js";

/**
 * One row in the auto-generated Phase-9 reference doc variance table.
 * Per ADR-19 §4 4-level aggregation table — per-cell-difference is
 * the "Comparison table; primary cell-level finding" row substrate.
 */
export interface VarianceTableRow {
  cellId: string;
  metric: string;
  meanCa: number;
  meanBetaCa: number;
  meanDifference: number;
  ciLowerDifference: number;
  ciUpperDifference: number;
  distinguishable: boolean;
}

/**
 * Generate a variance table from per-cell differences for Phase-9
 * reference doc auto-generation.
 *
 * STUB at Step 5 per Q6 lock — returns empty array. Full
 * implementation lands at Step 7 (consumes Step 5 stats primitives +
 * Step 8 grading outputs). Step 5 ships the function signature so
 * Step 7 callers can wire against it; runtime returns empty until
 * Step 7 swaps in the real implementation.
 */
export function generateVarianceTable(
  _perCellDifferences: readonly PerCellDifference[],
): VarianceTableRow[] {
  // STUB at Step 5; full at Step 7. Caller-side wiring is safe to
  // build against this signature; runtime behavior is empty-array
  // until Step 7 lands.
  return [];
}

/**
 * Distinguishable column caption for Phase-9 reference doc tables.
 * FULL implementation at Step 5 per Q6 lock — ADR-19 §4 framing intent
 * (descriptive CI only; non-NHST) preserved, with reviewer-
 * defensibility extensions appropriate for reader-facing tables.
 */
export function distinguishableColumnCaption(ciLevel: CILevel): string {
  const pct = ciLevel === 0.95 ? "95%" : "90%";
  return (
    `Distinguishable = difference-of-means ${pct} CI excludes zero. ` +
    `Effect-size + uncertainty framing only; no NHST p-value interpretation. ` +
    `CI not excluding zero indicates difference indistinguishable from zero ` +
    `AT THIS SUBSTRATE SIZE; absence of evidence ≠ evidence of absence.`
  );
}

/**
 * Generate the launch-narrative credibility line for v0.5 ship-
 * narrative consumption from a cross-cell rollup.
 *
 * STUB at Step 5 per Q6 lock — returns placeholder string. Full
 * implementation lands at Step 7 synthesis when cross-cell rollup
 * outputs are available; will compose the credibility-line escalation
 * from v0.4 §8.7 floor ("v0.3 findings replicate within trial
 * variance") to v0.5 ceiling ("CI-bounded efficiency wins + blind-
 * graded quality measurements + judge-agreement statistics;
 * methodology defensible under peer review").
 */
export function shipNarrativeCredibilityLine(
  _rollup: CrossCellRollup,
): string {
  // STUB at Step 5; full at Step 7 synthesis. Returns placeholder
  // string with explicit '[stub' prefix for caller-side detection.
  return "[stub at Step 5; full at Step 7 synthesis]";
}
