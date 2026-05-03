#!/usr/bin/env node
/**
 * v0.5 Step 6.3 gate evaluation — pure-math computation over already-
 * collected substrate (Step 6.1 within-judge JSONs + Step 6.2 Travis-
 * intuition Phase A grades). No API spend.
 *
 * Per Step 6 design proposal Q5 + Q7 + ADR-19 §5 thresholds. Consumes
 * Step 5.1 stats.ts primitives (transitively via agreement-stats.ts
 * evaluateStep6Gates from Step 2.3).
 *
 * Three-signal disambiguation per Q5 refinement:
 *   1. Within-judge consistency (Sonnet pass-1 vs pass-2):
 *      rubric-application stability. PASS at Step 6.1.
 *   2. Phase A correlation (Travis priors vs Sonnet pass-1):
 *      canonical-rubric-vs-Travis-priors alignment. THIS substep.
 *   3. Phase B correlation (if triggered): rubric-application
 *      consistency between humans and judge.
 *
 * Phase B trigger condition (Q5 explicit lock): aggregate Spearman
 * <0.6 OR per-axis direction agreement <75% on any axis.
 *
 * Usage (no API spend):
 *   npm run build
 *   node scripts/v0.5-step6-gate-eval.mjs
 *
 * Outputs:
 *   - stdout: gate evaluation summary + Findings 2-3 adjudication
 *   - scripts/v0.5-step6-outputs/gate-evaluation/gate-eval-report.md:
 *     full audit-trail report
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateStep6Gates } from "../dist/grading/agreement-stats.js";

// ============================================================================
// Constants + paths
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const WITHIN_JUDGE_DIR = resolve(
  REPO_ROOT,
  "scripts/v0.5-step6-outputs/within-judge",
);
const REPORT_DIR = resolve(
  REPO_ROOT,
  "scripts/v0.5-step6-outputs/gate-evaluation",
);

const AXES = [
  "factual_correctness",
  "completeness",
  "actionability",
  "hallucination",
];

// ============================================================================
// Substrate: 10 within-judge trials + 5 Travis-graded trials (subset)
// ============================================================================

// Step 6.1 within-judge trials in order (idx 1-10)
const WITHIN_JUDGE_TRIALS = [
  { idx: 1, slug: "httpx-p4-ca", run: 1 },
  { idx: 2, slug: "httpx-p4-ca", run: 2 },
  { idx: 3, slug: "cobra-c3-betaca", run: 1 },
  { idx: 4, slug: "cobra-c3-betaca", run: 2 },
  { idx: 5, slug: "httpx-p2-betaca", run: 1 },
  { idx: 6, slug: "httpx-p2-betaca", run: 2 },
  { idx: 7, slug: "hono-h1-betaca", run: 1 },
  { idx: 8, slug: "hono-h1-betaca", run: 2 },
  { idx: 9, slug: "cobra-c4-betaca", run: 1 },
  { idx: 10, slug: "cobra-c4-betaca", run: 2 },
];

// Travis Phase A trials map to within-judge trials 1, 3, 5, 7, 9 (trial 1 of
// each unique cell per Step 6 design Q2 lock).
const TRAVIS_SUBSET_INDICES = [1, 3, 5, 7, 9];

// Travis Phase A grades sourced from
// scripts/v0.5-step6-outputs/travis-intuition/travis-intuition-filled.md.
// Order matches TRAVIS_SUBSET_INDICES → within-judge trial indices 1, 3, 5, 7, 9.
const TRAVIS_SCORES = [
  // Trial 1 (httpx/p4-stream-lifecycle/ca) → within-judge idx=1
  { factual_correctness: 2, completeness: 3, actionability: 3, hallucination: 1 },
  // Trial 2 (cobra/c3-hook-lifecycle/beta-ca) → within-judge idx=3
  { factual_correctness: 3, completeness: 3, actionability: 3, hallucination: 0 },
  // Trial 3 (httpx/p2-http3-transport/beta-ca) → within-judge idx=5
  { factual_correctness: 3, completeness: 3, actionability: 3, hallucination: 0 },
  // Trial 4 (hono/h1-context-runtime/beta-ca) → within-judge idx=7
  { factual_correctness: 2, completeness: 3, actionability: 3, hallucination: 1 },
  // Trial 5 (cobra/c4-subcommand-resolution/beta-ca) → within-judge idx=9
  { factual_correctness: 2, completeness: 3, actionability: 3, hallucination: 1 },
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function readPerCallScores(trialIdx, slug, run, pass) {
  const filename = `trial-${pad2(trialIdx)}-${slug}-r${run}-pass-${pass}.json`;
  const path = `${WITHIN_JUDGE_DIR}/${filename}`;
  const data = JSON.parse(readFileSync(path, "utf8"));
  return data.scores;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  // Load all 10 within-judge trial scores (pass-1 + pass-2)
  const judgePass1 = WITHIN_JUDGE_TRIALS.map((t) =>
    readPerCallScores(t.idx, t.slug, t.run, 1),
  );
  const judgePass2 = WITHIN_JUDGE_TRIALS.map((t) =>
    readPerCallScores(t.idx, t.slug, t.run, 2),
  );

  // Sonnet's pass-1 scores on the 5 Travis-graded trials (subset).
  const judgeOnTravisSubset = TRAVIS_SUBSET_INDICES.map((idx) => {
    const trial = WITHIN_JUDGE_TRIALS.find((t) => t.idx === idx);
    return readPerCallScores(trial.idx, trial.slug, trial.run, 1);
  });

  const result = evaluateStep6Gates({
    judgeScoresPass1: judgePass1,
    judgeScoresPass2: judgePass2,
    judgeScoresOnTravisSubset: judgeOnTravisSubset,
    travisScores: TRAVIS_SCORES,
  });

  // Findings 2-3 adjudication
  const findings23 = adjudicateFindings(judgeOnTravisSubset, TRAVIS_SCORES);

  // Per-trial side-by-side for the 5 Travis trials
  const sideBySide = TRAVIS_SUBSET_INDICES.map((wjIdx, i) => {
    const trial = WITHIN_JUDGE_TRIALS.find((t) => t.idx === wjIdx);
    return {
      travisTrial: i + 1,
      withinJudgeIdx: wjIdx,
      slug: trial.slug,
      sonnet: judgeOnTravisSubset[i],
      travis: TRAVIS_SCORES[i],
    };
  });

  printConsole(result, findings23, sideBySide);
  writeReport(result, findings23, sideBySide);
}

function adjudicateFindings(judgeOnTravisSubset, travisScores) {
  // Finding 2: hallucination=1 pattern
  const sonnetHalluc = judgeOnTravisSubset.map((s) => s.hallucination);
  const travisHalluc = travisScores.map((s) => s.hallucination);
  const sonnetAllOnes = sonnetHalluc.every((v) => v === 1);
  const travisDirAgreement = (() => {
    let pairs = 0;
    let agree = 0;
    for (let i = 0; i < sonnetHalluc.length; i++) {
      for (let j = i + 1; j < sonnetHalluc.length; j++) {
        const ds = Math.sign(sonnetHalluc[i] - sonnetHalluc[j]);
        const dt = Math.sign(travisHalluc[i] - travisHalluc[j]);
        pairs++;
        if (ds === dt) agree++;
      }
    }
    return pairs === 0 ? NaN : agree / pairs;
  })();

  // Finding 2 interpretation
  let finding2Status;
  let finding2Note;
  const travisDisagree = travisHalluc.filter((v) => v !== 1).length;
  if (sonnetAllOnes && travisDisagree === 0) {
    finding2Status = "RESOLVED — Sonnet hallucination=1 confirmed by Travis priors on all 5 trials";
    finding2Note = "Pattern (b) Sonnet-driven RULED OUT; pattern (a) substrate-driven CONFIRMED";
  } else if (sonnetAllOnes && travisDisagree > 0) {
    finding2Status = `PARTIALLY-REPRODUCES — Sonnet 1-on-everything; Travis disagrees on ${travisDisagree}/5 trials (graded 0)`;
    finding2Note = `Pattern (b) Sonnet-driven possibility supported on ${travisDisagree} trials; rubric anchor may apply too strictly OR Travis priors over-charitable. Phase B (rubric-mediated) could disambiguate if triggered.`;
  } else {
    finding2Status = "RESOLVED — Sonnet 1-on-everything pattern broken at canonical rubric scale";
    finding2Note = "Pattern shifted; canonical rubric admits non-1 scoring on hallucination axis";
  }

  // Finding 3: bitwise determinism (already computed at Step 6.1; reference)
  const finding3Status = "PARTIAL bitwise determinism (7/10 trials at Step 6.1)";
  const finding3Note =
    "Step 2.4 placeholder-rubric n=2 'full bitwise' framing does NOT generalize cleanly to canonical rubric on n=10 substrate. ADR-19 §2 'approximately-deterministic' framing preserved as accurate; 'fully deterministic' framing ruled out for canonical rubric.";

  // Step 1.3 Option A→B pivot trigger check
  // Trigger: factual-axis correlation < 0.6 AND other axes pass
  // Note: the original "factual-axis" wording in ADR-19 §3 likely refers to
  // factual_correctness, NOT hallucination. Hallucination divergence is a
  // separate signal. Adjudicate carefully.

  return {
    finding2Status,
    finding2Note,
    finding3Status,
    finding3Note,
    travisHallucinationDirAgreement: travisDirAgreement,
    sonnetHallucination: sonnetHalluc,
    travisHallucination: travisHalluc,
  };
}

function printConsole(result, findings23, sideBySide) {
  console.log("=".repeat(72));
  console.log("v0.5 Step 6.3 gate evaluation — three-signal report");
  console.log("=".repeat(72));
  console.log("");

  console.log("Signal 1: Within-judge consistency (Step 6.1 recap)");
  for (const axis of AXES) {
    const v = result.diagnostics.withinJudgeWithinOnePointPerAxis[axis];
    const marker = v >= 0.8 ? "✓" : "✗";
    console.log(`  ${marker} ${axis}: within-1-point ${(v * 100).toFixed(1)}%`);
  }
  console.log(
    `  Exact-match rate (diagnostic): ${(result.diagnostics.withinJudgeExactMatchRate * 100).toFixed(1)}%`,
  );
  console.log("");

  console.log("Signal 2: Phase A — Travis priors vs Sonnet canonical-rubric pass-1");
  console.log(
    `  Aggregate Spearman: ${result.diagnostics.travisAggregateSpearman.toFixed(4)} (threshold ≥0.6)`,
  );
  console.log("  Per-axis direction agreement (n=5; 10 pair-comparisons each):");
  for (const axis of AXES) {
    const v = result.diagnostics.travisDirectionAgreementPerAxis[axis];
    const marker = v >= 0.75 ? "✓" : "✗";
    const display = Number.isNaN(v) ? "NaN" : `${(v * 100).toFixed(1)}%`;
    console.log(`    ${marker} ${axis}: ${display}`);
  }
  console.log("  Per-axis MAD (Travis - Sonnet; positive = Travis higher):");
  for (const axis of AXES) {
    const v = result.diagnostics.madPerAxis[axis];
    console.log(`    ${axis}: ${v.toFixed(2)}`);
  }
  console.log("");

  console.log("Per-trial side-by-side (5 Travis-graded trials):");
  console.log(
    "  | T# | WJ | slug | factual S/T | complete S/T | action S/T | halluc S/T |",
  );
  console.log(
    "  |----|----|------|-------------|--------------|------------|------------|",
  );
  for (const r of sideBySide) {
    console.log(
      `  | ${r.travisTrial}  | ${pad2(r.withinJudgeIdx)} | ${r.slug.padEnd(16)} | ${r.sonnet.factual_correctness}/${r.travis.factual_correctness}        | ${r.sonnet.completeness}/${r.travis.completeness}         | ${r.sonnet.actionability}/${r.travis.actionability}       | ${r.sonnet.hallucination}/${r.travis.hallucination}       |`,
    );
  }
  console.log("");

  console.log("Findings 2-3 adjudication:");
  console.log(`  Finding 2 (halluc=1 pattern): ${findings23.finding2Status}`);
  console.log(`    ${findings23.finding2Note}`);
  console.log(`  Finding 3 (bitwise determinism): ${findings23.finding3Status}`);
  console.log(`    ${findings23.finding3Note}`);
  console.log("");

  console.log("Gate evaluation:");
  if (result.pass) {
    console.log("  ✓ STEP 6 GATE PASS — all three signals clear ADR-19 §5 thresholds");
    console.log("    Step 6.4 close commit unblocks; Step 7 production replication unblocks");
  } else {
    console.log("  ✗ STEP 6 GATE FAIL — failures:");
    for (const f of result.failures) {
      const obs = Number.isFinite(f.observed) ? f.observed.toFixed(4) : "NaN";
      if (f.kind === "within-judge-axis") {
        console.log(
          `    - within-judge axis ${f.axis}: ${obs} < ${f.threshold}`,
        );
      } else if (f.kind === "travis-aggregate-spearman") {
        console.log(`    - aggregate Spearman: ${obs} < ${f.threshold}`);
      } else if (f.kind === "travis-direction-agreement-axis") {
        console.log(
          `    - direction agreement axis ${f.axis}: ${obs} < ${f.threshold}`,
        );
      }
    }
    console.log("    Travis adjudication required: Branch A (Opus escalation) | B (rubric refinement) | C (descope)");
  }
}

function writeReport(result, findings23, sideBySide) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const lines = [];
  lines.push("# v0.5 Step 6.3 Gate Evaluation Report");
  lines.push("");
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Gate determination:** ${result.pass ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("## Three-signal disambiguation per Q5 refinement");
  lines.push("");
  lines.push("### Signal 1: Within-judge consistency (Step 6.1 recap)");
  lines.push("");
  lines.push("| Axis | Within-1-point % | Threshold | Gate |");
  lines.push("|---|---:|---:|---|");
  for (const axis of AXES) {
    const v = result.diagnostics.withinJudgeWithinOnePointPerAxis[axis];
    const marker = v >= 0.8 ? "✓ PASS" : "✗ FAIL";
    lines.push(`| ${axis} | ${(v * 100).toFixed(1)}% | ≥80% | ${marker} |`);
  }
  lines.push("");
  lines.push(
    `**Exact-match rate (diagnostic):** ${(result.diagnostics.withinJudgeExactMatchRate * 100).toFixed(1)}%`,
  );
  lines.push("");
  lines.push(
    "Interpretation: rubric-application stability — Sonnet scores the same trial twice with what variance? Step 6.1 PASS at +20pt margin per axis.",
  );
  lines.push("");
  lines.push(
    "### Signal 2: Phase A correlation — Travis priors vs Sonnet canonical-rubric pass-1",
  );
  lines.push("");
  lines.push(
    `**Aggregate Spearman:** ${result.diagnostics.travisAggregateSpearman.toFixed(4)} (threshold ≥0.6 per ADR-19 §5)`,
  );
  lines.push("");
  lines.push("**Per-axis direction agreement (n=5; 10 pair-comparisons each):**");
  lines.push("");
  lines.push("| Axis | Direction agreement % | Threshold | Gate |");
  lines.push("|---|---:|---:|---|");
  for (const axis of AXES) {
    const v = result.diagnostics.travisDirectionAgreementPerAxis[axis];
    const marker = v >= 0.75 ? "✓ PASS" : "✗ FAIL";
    const display = Number.isNaN(v) ? "NaN" : `${(v * 100).toFixed(1)}%`;
    lines.push(`| ${axis} | ${display} | ≥75% | ${marker} |`);
  }
  lines.push("");
  lines.push("**Per-axis MAD (Travis - Sonnet; positive = Travis grades higher):**");
  lines.push("");
  lines.push("| Axis | MAD | Disclosure band per ADR-19 §2 |");
  lines.push("|---|---:|---|");
  for (const axis of AXES) {
    const v = result.diagnostics.madPerAxis[axis];
    let band;
    if (Math.abs(v) <= 0.5) band = "Tight (≤0.5; cite directly)";
    else if (Math.abs(v) <= 1.5) band = "Modest offset (0.5-1.5; cite with disclosure)";
    else band = "Large offset (>1.5; rubric anchor refinement trigger)";
    lines.push(`| ${axis} | ${v.toFixed(2)} | ${band} |`);
  }
  lines.push("");
  lines.push(
    "Interpretation: canonical-rubric-vs-Travis-priors alignment — does Sonnet apply the rubric in a way that matches Travis's intuitive judgment?",
  );
  lines.push("");
  lines.push("## Per-trial side-by-side (5 Travis-graded trials)");
  lines.push("");
  lines.push(
    "Format: Sonnet score / Travis score per axis. Δ shown when nonzero.",
  );
  lines.push("");
  lines.push("| Travis # | WJ idx | Cell | factual S/T (Δ) | complete S/T (Δ) | action S/T (Δ) | halluc S/T (Δ) |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of sideBySide) {
    const fmt = (s, t) => {
      const d = t - s;
      return `${s}/${t}${d === 0 ? "" : ` (${d > 0 ? "+" : ""}${d})`}`;
    };
    lines.push(
      `| ${r.travisTrial} | ${r.withinJudgeIdx} | ${r.slug} | ${fmt(r.sonnet.factual_correctness, r.travis.factual_correctness)} | ${fmt(r.sonnet.completeness, r.travis.completeness)} | ${fmt(r.sonnet.actionability, r.travis.actionability)} | ${fmt(r.sonnet.hallucination, r.travis.hallucination)} |`,
    );
  }
  lines.push("");
  lines.push("## Findings 2-3 adjudication");
  lines.push("");
  lines.push(`### Finding 2 (hallucination=1 pattern from Step 6.1)`);
  lines.push("");
  lines.push(`**Status:** ${findings23.finding2Status}`);
  lines.push("");
  lines.push(findings23.finding2Note);
  lines.push("");
  lines.push(
    `**Hallucination scores:** Sonnet ${JSON.stringify(findings23.sonnetHallucination)} vs Travis ${JSON.stringify(findings23.travisHallucination)}`,
  );
  lines.push("");
  lines.push(`### Finding 3 (bitwise determinism from Step 6.1)`);
  lines.push("");
  lines.push(`**Status:** ${findings23.finding3Status}`);
  lines.push("");
  lines.push(findings23.finding3Note);
  lines.push("");
  lines.push("## Gate determination");
  lines.push("");
  if (result.pass) {
    lines.push(
      "**STEP 6 GATE PASS** — all three signals clear ADR-19 §5 thresholds.",
    );
    lines.push("");
    lines.push(
      "Step 6.4 close commit unblocks per established cadence. Step 7 (production replication) unblocks per scope-doc Stream B sequencing.",
    );
  } else {
    lines.push("**STEP 6 GATE FAIL** — failures:");
    lines.push("");
    for (const f of result.failures) {
      const obs = Number.isFinite(f.observed) ? f.observed.toFixed(4) : "NaN";
      if (f.kind === "within-judge-axis") {
        lines.push(
          `- within-judge axis ${f.axis}: ${obs} < ${f.threshold}`,
        );
      } else if (f.kind === "travis-aggregate-spearman") {
        lines.push(`- aggregate Spearman: ${obs} < ${f.threshold}`);
      } else if (f.kind === "travis-direction-agreement-axis") {
        lines.push(
          `- direction agreement axis ${f.axis}: ${obs} < ${f.threshold}`,
        );
      }
    }
    lines.push("");
    lines.push(
      "**Travis adjudication required** per Step 6 design proposal §8 decision tree:",
    );
    lines.push(
      "- Branch A: Opus escalation per ADR-19 §2 trigger (cost +$0.20-0.40)",
    );
    lines.push(
      "- Branch B: rubric refinement (back to Step 3 prompt revision; +$0.10-0.24 re-run)",
    );
    lines.push(
      "- Branch C: descope to statistical-only-rigor framing per scope-doc §Rescope conditions",
    );
  }
  lines.push("");
  writeFileSync(`${REPORT_DIR}/gate-eval-report.md`, lines.join("\n"), "utf8");
}

main();
