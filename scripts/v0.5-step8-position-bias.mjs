#!/usr/bin/env node
/**
 * v0.5 Step 8.2 position-bias verification — pure-math post-hoc analysis.
 *
 * Per ADR-19 §3 (score-based position bias concept) + Step 4
 * position-bias.ts (commit 0faba72) + STEP-PLAN-V0.5 Step 8.
 *
 * Consumes Step 8.1 base grading substrate (27/28 base pairs after Path
 * A; cobra/c3 trial-2 base missing per reproducible failure); computes
 * per-axis + aggregate position-bias imbalance via Step 4
 * computePositionBias(); reports trigger condition (strict >0.60 per
 * Step 4 lock).
 *
 * Cross-order regrades EXCLUDED from position-bias computation per
 * Step 4 design — they're a control mechanism, not main-grading
 * substrate.
 *
 * NOTE: Distinct from Step 8 Finding 6 (position-dependent JSON output
 * formatting). This script computes SCORE-based position bias (does
 * scoring systematically favor position A or B?). Finding 6 is
 * OUTPUT-FORMATTING asymmetry (does Sonnet's JSON validity vary by
 * A/B assignment?). Different mechanisms; different metrics.
 *
 * Usage:
 *   node scripts/v0.5-step8-position-bias.mjs            (default; pure-math; no API spend)
 *   node scripts/v0.5-step8-position-bias.mjs --stretch  (conditional API-spend; only if trigger fires)
 *
 * Outputs:
 *   - scripts/v0.5-step8-outputs/position-bias-report.md
 *   - (if --stretch + trigger): scripts/v0.5-step8-outputs/style-normalize-stretch/
 *
 * Refs: ADR-19 §3, Step 4 position-bias.ts + style-normalize.ts,
 * STEP-PLAN-V0.5 Step 8.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computePositionBias,
  POSITION_BIAS_THRESHOLD,
} from "../dist/grading/position-bias.js";

// ============================================================================
// Paths
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const OUTPUTS_DIR = resolve(REPO_ROOT, "scripts/v0.5-step8-outputs");
const GRADES_DIR = resolve(OUTPUTS_DIR, "grades");
const REPORT_PATH = resolve(OUTPUTS_DIR, "position-bias-report.md");

// ============================================================================
// Args
// ============================================================================

const args = process.argv.slice(2);
const STRETCH = args.includes("--stretch");

// ============================================================================
// Substrate loading
// ============================================================================

function loadAllBaseGrades() {
  if (!existsSync(GRADES_DIR)) {
    console.error(`FATAL: grades dir missing: ${GRADES_DIR}`);
    process.exit(1);
  }
  const files = readdirSync(GRADES_DIR).filter((f) => f.endsWith(".json"));
  const grades = [];
  for (const f of files) {
    const j = JSON.parse(readFileSync(`${GRADES_DIR}/${f}`, "utf8"));
    grades.push(j);
  }
  return grades;
}

// ============================================================================
// Pair construction for position-bias input shape
// ============================================================================

function buildPairedScores(baseGrades) {
  // computePositionBias expects PairedScores[] with shape {scoresA, scoresB}.
  // baseGrades have scores: {scoresA, scoresB} already; pass through.
  return baseGrades.map((g) => ({
    scoresA: g.scores.scoresA,
    scoresB: g.scores.scoresB,
  }));
}

// ============================================================================
// Report writer
// ============================================================================

function writeReport(report, baseGradesCount) {
  const lines = [];
  lines.push(`# v0.5 Step 8.2 Position-Bias Verification Report`);
  lines.push("");
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Substrate:** ${baseGradesCount} base grades from Step 8.1 (Path A; cobra/c3 trial-2 base missing per reproducible JSON parse failure; documented in Step 8.1 retry evidence commit a3388a1)`);
  lines.push(`**Threshold:** strict > ${POSITION_BIAS_THRESHOLD} imbalance per Step 4 position-bias.ts lock`);
  lines.push(`**Trigger condition:** aggregate.imbalance > ${POSITION_BIAS_THRESHOLD}`);
  lines.push("");
  lines.push("## Per-axis position-bias imbalance");
  lines.push("");
  lines.push("Counts where A scored strictly higher than B vs B strictly higher than A on each axis (ties excluded). Imbalance = max(a_higher, b_higher) / (a_higher + b_higher); 0 if both zero.");
  lines.push("");
  lines.push("| Axis | a_higher | b_higher | ties | imbalance |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const [axis, a] of Object.entries(report.per_axis)) {
    lines.push(
      `| ${axis} | ${a.a_higher} | ${a.b_higher} | ${a.ties} | ${a.imbalance.toFixed(3)} |`,
    );
  }
  lines.push("");
  lines.push("## Aggregate (pooled across 4 axes)");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Total a_higher | ${report.aggregate.a_higher} |`);
  lines.push(`| Total b_higher | ${report.aggregate.b_higher} |`);
  lines.push(`| Total ties | ${report.aggregate.ties} |`);
  lines.push(`| **Aggregate imbalance** | **${report.aggregate.imbalance.toFixed(3)}** |`);
  lines.push(`| Threshold | ${POSITION_BIAS_THRESHOLD.toFixed(2)} |`);
  lines.push(`| **Trigger fires?** | **${report.trigger ? "YES" : "no"}** |`);
  lines.push(`| n_pairs | ${report.n_pairs} |`);
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  if (report.trigger) {
    lines.push(
      `Aggregate imbalance ${report.aggregate.imbalance.toFixed(3)} EXCEEDS threshold ${POSITION_BIAS_THRESHOLD.toFixed(2)}. Score-based position bias detected per ADR-19 §3.`,
    );
    lines.push("");
    lines.push(
      "Per ADR-19 §3 conditional response: style-normalize stretch should activate. Re-render imbalanced pairs through Step 4 styleNormalize() (re-format input answers to remove style-based discriminators); re-grade; check if trigger clears.",
    );
    lines.push("");
    lines.push(
      "**Travis runs locally for stretch (API spend event):**",
    );
    lines.push("");
    lines.push("```");
    lines.push("cd C:/CodeWork/contextatlas");
    lines.push("node scripts/v0.5-step8-position-bias.mjs --stretch");
    lines.push("```");
  } else {
    lines.push(
      `Aggregate imbalance ${report.aggregate.imbalance.toFixed(3)} CLEARS threshold ${POSITION_BIAS_THRESHOLD.toFixed(2)}. Score-based position bias NOT detected.`,
    );
    lines.push("");
    lines.push(
      "Sonnet judge is largely position-blind on score axis (consistent with Step 8.1 cross-order agreement signal of 83-100% per axis). ADR-19 §3 expected behavior validated empirically. Style-normalize stretch NOT triggered; Step 8.3 conditional substep skipped.",
    );
  }
  lines.push("");
  lines.push("## Distinction from Step 8 Finding 6");
  lines.push("");
  lines.push("This metric measures SCORE-based position bias (does scoring systematically favor position A or B across pairs?).");
  lines.push("");
  lines.push("Finding 6 (Step 8.1 retry evidence commit a3388a1) describes OUTPUT-FORMATTING asymmetry: Sonnet's JSON output validity varied by A/B assignment on cobra/c3 trial-2 specifically (forceSwapAB=false fails; forceSwapAB=true succeeds). Different mechanism; different metric; different remediation path.");
  lines.push("");
  lines.push("Both findings preserved as separate empirical observations for v0.5 final reporting. Score-based position bias = Step 8.2 substantive; output-formatting asymmetry = Finding 6 substantive.");
  lines.push("");
  if (STRETCH) {
    lines.push("## Stretch invocation outcome");
    lines.push("");
    if (report.trigger) {
      lines.push("Stretch invoked per --stretch flag. (Implementation deferred to subsequent commit if trigger fires; this scaffolding ready.)");
    } else {
      lines.push("Stretch invocation requested via --stretch flag but trigger did NOT fire; stretch skipped (no imbalanced pairs to re-grade).");
    }
    lines.push("");
  }
  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log(`v0.5 Step 8.2 position-bias verification`);
  console.log(`Mode: ${STRETCH ? "with --stretch (conditional API spend)" : "default (pure-math; no API spend)"}\n`);

  const baseGrades = loadAllBaseGrades();
  console.log(`Loaded ${baseGrades.length} base grades from ${GRADES_DIR}`);

  const pairedScores = buildPairedScores(baseGrades);
  const report = computePositionBias(pairedScores);

  writeReport(report, baseGrades.length);

  console.log(`\nPer-axis imbalance (a_higher / b_higher / ties → imbalance):`);
  for (const [axis, a] of Object.entries(report.per_axis)) {
    console.log(
      `  ${axis}: ${a.a_higher} / ${a.b_higher} / ${a.ties} → ${a.imbalance.toFixed(3)}`,
    );
  }

  console.log(`\nAggregate: ${report.aggregate.a_higher} a_higher / ${report.aggregate.b_higher} b_higher / ${report.aggregate.ties} ties`);
  console.log(`Aggregate imbalance: ${report.aggregate.imbalance.toFixed(3)} (threshold ${POSITION_BIAS_THRESHOLD.toFixed(2)})`);
  console.log(`Trigger fires: ${report.trigger ? "YES" : "no"}`);

  console.log(`\nReport: ${REPORT_PATH}`);

  if (report.trigger && !STRETCH) {
    console.log(`\nStyle-normalize stretch RECOMMENDED. Travis runs locally:`);
    console.log(`  node scripts/v0.5-step8-position-bias.mjs --stretch`);
    process.exit(0);
  }

  if (STRETCH && report.trigger) {
    console.log(`\nStretch invocation: trigger fires; stretch implementation deferred to subsequent commit if needed.`);
  } else if (STRETCH) {
    console.log(`\nStretch invoked but trigger did NOT fire; no re-grading needed.`);
  } else {
    console.log(`\nNo trigger; Step 8.2 closes; Step 8.3 (conditional stretch) skipped per Q4 lock.`);
  }
}

main();
