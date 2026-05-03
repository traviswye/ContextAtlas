#!/usr/bin/env node
/**
 * v0.5 Step 6.1 within-judge calibration harness — validates canonical
 * rubric within-judge consistency per ADR-19 §5 + Step 1.5 threshold
 * lock + STEP-PLAN-V0.5 Step 6.
 *
 * Reads 10 Step 9 trial JSONs from ContextAtlas-benchmarks; loads
 * canonical RUBRIC_PROMPT_SINGLE from dist/grading/rubric-prompt.js
 * (Step 3 commit `6ed89ce`); calls gradeSingle 2× per trial via
 * judge-client (Step 2.2 commit `0b7bdc7`); persists per-call outputs
 * + summary markdown to scripts/v0.5-step6-outputs/within-judge/.
 *
 * Per Step 6 design Q1 lock: 10 trials = full Step 9 substrate (5
 * unique (cell, condition) pairs × n=2 each). Heterogeneous anchor
 * cells preserved (httpx p2 + p4; cobra c3 + c4; hono h1).
 *
 * Per Step 2.4 Option A workflow: Travis runs locally with funded
 * ANTHROPIC_API_KEY:
 *   npm run build
 *   ANTHROPIC_API_KEY=... node scripts/v0.5-step6-within-judge.mjs
 *
 * Cost projection per Step 2.4 calibration data: ~$0.005-0.012 per
 * call × 20 calls = $0.10-0.24 total. Below v0.5 cost-discipline $1
 * pre-approval threshold per Step 2.4 Option A.
 *
 * Pre-flight: substrate JSONs verified accessible at design phase
 * (Step 6.0 surface). Build artifacts (dist/grading/*) must exist
 * before invocation.
 *
 * Substrate-limitation acknowledged: trick-bucket override (Axis 3)
 * not exercised at Step 6 (h6-fetch-signature not in Step 9 substrate);
 * documented at Step 6.4 close per Q3 lock.
 *
 * Gate evaluation per ADR-19 §5:
 *   - Within-1-point per axis ≥ 80% (≥ 8 of 10) — gate primary
 *   - Exact-match rate ≥ 50% — diagnostic, reported not gating
 *   - Per-axis MAD reported for diagnostic visibility
 *
 * Finding 3 verification (Step 2 Finding carried forward): does
 * bitwise determinism observed at Step 2.4 (placeholder rubric)
 * generalize to canonical rubric? Compare pass-1 vs pass-2 score
 * equality per trial (score-level proxy for byte-equality; same
 * substantive question).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";
import { load as yamlLoad } from "js-yaml";

import {
  createJudgeClient,
  JudgeParseError,
} from "../dist/grading/judge-client.js";
import { RUBRIC_PROMPT_SINGLE } from "../dist/grading/rubric-prompt.js";

// ============================================================================
// Constants + paths
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const BENCHMARKS_RUNS = resolve(REPO_ROOT, "../ContextAtlas-benchmarks/runs");
const BENCHMARKS_PROMPTS = resolve(
  REPO_ROOT,
  "../ContextAtlas-benchmarks/prompts",
);
const OUTPUTS_DIR = resolve(
  REPO_ROOT,
  "scripts/v0.5-step6-outputs/within-judge",
);

const AXES = [
  "factual_correctness",
  "completeness",
  "actionability",
  "hallucination",
];

// Per ADR-19 §5: within-1-point per axis ≥ 80% gates Step 7.
const WITHIN_1_POINT_THRESHOLD = 0.8;
// Diagnostic only.
const EXACT_MATCH_DIAGNOSTIC_FLOOR = 0.5;

// 10 trials = full Step 9 substrate per Q1 lock.
const TRIALS = [
  { idx: 1, slug: "httpx-p4-ca", repo: "httpx", promptId: "p4-stream-lifecycle", condition: "ca", run: 1, dir: "2026-04-29T05-36-15-709Z" },
  { idx: 2, slug: "httpx-p4-ca", repo: "httpx", promptId: "p4-stream-lifecycle", condition: "ca", run: 2, dir: "2026-04-29T05-44-02-412Z" },
  { idx: 3, slug: "cobra-c3-betaca", repo: "cobra", promptId: "c3-hook-lifecycle", condition: "beta-ca", run: 1, dir: "2026-04-29T05-36-52-571Z" },
  { idx: 4, slug: "cobra-c3-betaca", repo: "cobra", promptId: "c3-hook-lifecycle", condition: "beta-ca", run: 2, dir: "2026-04-29T05-44-31-752Z" },
  { idx: 5, slug: "httpx-p2-betaca", repo: "httpx", promptId: "p2-http3-transport", condition: "beta-ca", run: 1, dir: "2026-04-29T05-37-49-695Z" },
  { idx: 6, slug: "httpx-p2-betaca", repo: "httpx", promptId: "p2-http3-transport", condition: "beta-ca", run: 2, dir: "2026-04-29T05-45-21-717Z" },
  { idx: 7, slug: "hono-h1-betaca", repo: "hono", promptId: "h1-context-runtime", condition: "beta-ca", run: 1, dir: "2026-04-29T05-38-26-001Z" },
  { idx: 8, slug: "hono-h1-betaca", repo: "hono", promptId: "h1-context-runtime", condition: "beta-ca", run: 2, dir: "2026-04-29T05-45-54-737Z" },
  { idx: 9, slug: "cobra-c4-betaca", repo: "cobra", promptId: "c4-subcommand-resolution", condition: "beta-ca", run: 1, dir: "2026-04-29T05-39-45-525Z" },
  { idx: 10, slug: "cobra-c4-betaca", repo: "cobra", promptId: "c4-subcommand-resolution", condition: "beta-ca", run: 2, dir: "2026-04-29T05-46-54-272Z" },
];

// ============================================================================
// Pre-flight checks
// ============================================================================

function preflight() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("FATAL: ANTHROPIC_API_KEY env var not set");
    process.exit(1);
  }
  for (const trial of TRIALS) {
    const path = trialPath(trial);
    if (!existsSync(path)) {
      console.error(`FATAL: trial JSON missing: ${path}`);
      process.exit(1);
    }
  }
  for (const repo of ["httpx", "cobra", "hono"]) {
    const path = `${BENCHMARKS_PROMPTS}/${repo}.yml`;
    if (!existsSync(path)) {
      console.error(`FATAL: prompt yaml missing: ${path}`);
      process.exit(1);
    }
  }
  if (!existsSync(OUTPUTS_DIR)) {
    mkdirSync(OUTPUTS_DIR, { recursive: true });
  }
}

function trialPath(trial) {
  return `${BENCHMARKS_RUNS}/${trial.dir}/${trial.repo}/${trial.promptId}/${trial.condition}.json`;
}

// ============================================================================
// Prompt-text lookup (cell prompt_id → benchmark prompt text)
// ============================================================================

function loadPromptLookup() {
  const lookup = new Map();
  for (const repo of ["httpx", "cobra", "hono"]) {
    const path = `${BENCHMARKS_PROMPTS}/${repo}.yml`;
    const data = yamlLoad(readFileSync(path, "utf8"));
    for (const p of data.prompts ?? []) {
      lookup.set(`${repo}:${p.prompt_id}`, p.prompt);
    }
  }
  return lookup;
}

function lookupPromptText(promptLookup, trial) {
  const key = `${trial.repo}:${trial.promptId}`;
  const text = promptLookup.get(key);
  if (!text) {
    throw new Error(`prompt lookup miss for key: ${key}`);
  }
  return text;
}

// ============================================================================
// Per-call execution + persistence
// ============================================================================

async function runOnePass(judge, trial, pass, promptText, answerText) {
  let result;
  try {
    result = await judge.gradeSingle({
      rubricPrompt: RUBRIC_PROMPT_SINGLE,
      prompt: promptText,
      answer: answerText,
    });
  } catch (err) {
    if (err instanceof JudgeParseError) {
      console.error(
        `FATAL: JudgeParseError on ${trial.slug} r${trial.run} pass-${pass}: ${err.message}`,
      );
      console.error("Response (first 500 chars):");
      console.error(err.responseText.slice(0, 500));
    } else {
      console.error(
        `FATAL: unexpected error on ${trial.slug} r${trial.run} pass-${pass}`,
      );
      console.error(err);
    }
    process.exit(1);
  }
  const output = {
    trialId: `trial-${pad2(trial.idx)}-${trial.slug}-r${trial.run}`,
    trialPath: trialPath(trial),
    pass,
    rubricPromptVersion: "Step-3-canonical (commit 6ed89ce)",
    scores: result.scores,
    usage: result.usage,
    costUsd: result.costUsd,
    model: result.model,
    createdAt: new Date().toISOString(),
  };
  const filename = `trial-${pad2(trial.idx)}-${trial.slug}-r${trial.run}-pass-${pass}.json`;
  writeFileSync(
    `${OUTPUTS_DIR}/${filename}`,
    JSON.stringify(output, null, 2) + "\n",
    "utf8",
  );
  return output;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// ============================================================================
// Aggregate stats — per ADR-19 §5
// ============================================================================

function computeStats(passOutputs) {
  // passOutputs is keyed by trial.idx; each entry has [pass1, pass2]
  const perAxis = {};
  for (const axis of AXES) {
    let within1 = 0;
    let exactMatch = 0;
    let madSum = 0;
    for (const idx of Object.keys(passOutputs)) {
      const [p1, p2] = passOutputs[idx];
      const diff = Math.abs(p1.scores[axis] - p2.scores[axis]);
      if (diff <= 1) within1++;
      if (diff === 0) exactMatch++;
      madSum += diff;
    }
    const n = Object.keys(passOutputs).length;
    perAxis[axis] = {
      within1PointCount: within1,
      within1PointPct: within1 / n,
      exactMatchCount: exactMatch,
      exactMatchPct: exactMatch / n,
      mad: madSum / n,
    };
  }
  let trialsBitwiseIdentical = 0;
  for (const idx of Object.keys(passOutputs)) {
    const [p1, p2] = passOutputs[idx];
    const allMatch = AXES.every((axis) => p1.scores[axis] === p2.scores[axis]);
    if (allMatch) trialsBitwiseIdentical++;
  }
  return {
    perAxis,
    trialsBitwiseIdentical,
    trialsTotal: Object.keys(passOutputs).length,
    finding3: {
      pattern: "score-level pass-1 vs pass-2 equality per trial",
      bitwiseIdenticalCount: trialsBitwiseIdentical,
      bitwiseIdenticalPct:
        trialsBitwiseIdentical / Object.keys(passOutputs).length,
      interpretation:
        trialsBitwiseIdentical === Object.keys(passOutputs).length
          ? "FULL bitwise determinism on canonical rubric (Finding 3 generalizes)"
          : trialsBitwiseIdentical === 0
            ? "ZERO bitwise determinism on canonical rubric (Finding 3 specific to placeholder)"
            : `PARTIAL bitwise determinism (${trialsBitwiseIdentical}/${Object.keys(passOutputs).length} trials)`,
    },
  };
}

function evaluateGate(stats) {
  const failures = [];
  for (const axis of AXES) {
    if (stats.perAxis[axis].within1PointPct < WITHIN_1_POINT_THRESHOLD) {
      failures.push(
        `axis ${axis}: within-1-point ${(stats.perAxis[axis].within1PointPct * 100).toFixed(1)}% < threshold ${WITHIN_1_POINT_THRESHOLD * 100}%`,
      );
    }
  }
  return { passed: failures.length === 0, failures };
}

// ============================================================================
// Summary markdown writer
// ============================================================================

function writeSummary(stats, gate, totalCost, perCallOutputs) {
  const lines = [];
  lines.push("# v0.5 Step 6.1 within-judge calibration record");
  lines.push("");
  lines.push(
    `**Status:** ${gate.passed ? "PROBE PASS — within-judge thresholds satisfied" : "PROBE FAIL — within-judge below threshold"}`,
  );
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Substrate:** 10 Step 9 trials × 2 passes = 20 gradeSingle calls`);
  lines.push(`**Rubric:** RUBRIC_PROMPT_SINGLE canonical (Step 3 commit 6ed89ce)`);
  lines.push(`**Model:** Claude Sonnet 4.6 (default per ADR-19 §2)`);
  lines.push(`**Total cost:** $${totalCost.toFixed(6)}`);
  lines.push("");
  lines.push("## Per-trial scores (pass-1 vs pass-2)");
  lines.push("");
  lines.push(
    "| Trial | Cell | Cond | Run | Axis | Pass 1 | Pass 2 | Δ |",
  );
  lines.push(
    "|---|---|---|---|---|---:|---:|---:|",
  );
  // Group by trial idx
  const byTrial = new Map();
  for (const o of perCallOutputs) {
    const key = o.trialId;
    if (!byTrial.has(key)) byTrial.set(key, []);
    byTrial.get(key).push(o);
  }
  for (const [trialId, entries] of byTrial) {
    const [p1, p2] = entries.sort((a, b) => a.pass - b.pass);
    const trial = TRIALS.find(
      (t) => `trial-${pad2(t.idx)}-${t.slug}-r${t.run}` === trialId,
    );
    for (const axis of AXES) {
      const diff = Math.abs(p1.scores[axis] - p2.scores[axis]);
      lines.push(
        `| ${trialId} | ${trial.slug} | ${trial.condition} | r${trial.run} | ${axis} | ${p1.scores[axis]} | ${p2.scores[axis]} | ${diff} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Aggregate within-judge stats per ADR-19 §5");
  lines.push("");
  lines.push(
    "| Axis | Within-1-point % | Exact-match % | MAD | Gate (≥80%) |",
  );
  lines.push("|---|---:|---:|---:|---|");
  for (const axis of AXES) {
    const a = stats.perAxis[axis];
    const gateStr =
      a.within1PointPct >= WITHIN_1_POINT_THRESHOLD ? "✓ PASS" : "✗ FAIL";
    lines.push(
      `| ${axis} | ${(a.within1PointPct * 100).toFixed(1)}% (${a.within1PointCount}/10) | ${(a.exactMatchPct * 100).toFixed(1)}% (${a.exactMatchCount}/10) | ${a.mad.toFixed(2)} | ${gateStr} |`,
    );
  }
  lines.push("");
  lines.push("## Finding 3 verification (Step 2 carry-forward)");
  lines.push("");
  lines.push(
    `**Pattern check:** ${stats.finding3.pattern}`,
  );
  lines.push(
    `**Bitwise-identical trials:** ${stats.finding3.bitwiseIdenticalCount}/${stats.trialsTotal} (${(stats.finding3.bitwiseIdenticalPct * 100).toFixed(1)}%)`,
  );
  lines.push(`**Interpretation:** ${stats.finding3.interpretation}`);
  lines.push("");
  lines.push("## Gate evaluation");
  lines.push("");
  if (gate.passed) {
    lines.push(
      "All 4 axes cleared within-1-point ≥ 80% threshold per ADR-19 §5.",
    );
    lines.push("Within-judge consistency component of Step 6 gate: **PASS**.");
    lines.push("");
    lines.push(
      "Step 6.2 (Travis-intuition Phase A) unblocks; Step 6.3 (gate evaluation) follows after Travis grading complete.",
    );
  } else {
    lines.push("**Failures:**");
    for (const f of gate.failures) lines.push(`- ${f}`);
    lines.push("");
    lines.push(
      "Within-judge consistency component of Step 6 gate: **FAIL**. Travis adjudication required at Step 6.3 per scope-doc §Rescope conditions (Branch B rubric refinement OR Branch A Opus escalation OR Branch C statistical-only-rigor descope).",
    );
  }
  lines.push("");
  writeFileSync(
    `${OUTPUTS_DIR}/within-judge-summary.md`,
    lines.join("\n"),
    "utf8",
  );
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  preflight();
  const promptLookup = loadPromptLookup();

  const anthropic = new Anthropic();
  const judge = createJudgeClient({ anthropic });

  console.log(
    `Step 6.1 within-judge calibration: 10 trials × 2 passes = 20 gradeSingle calls`,
  );
  console.log(
    `Rubric: RUBRIC_PROMPT_SINGLE canonical (Step 3 commit 6ed89ce)`,
  );
  console.log(`Model: Claude Sonnet 4.6\n`);

  const passOutputs = {};
  const perCallOutputs = [];
  let totalCost = 0;

  for (const trial of TRIALS) {
    const trialJson = JSON.parse(readFileSync(trialPath(trial), "utf8"));
    const promptText = lookupPromptText(promptLookup, trial);
    const answerText = trialJson.answer;
    if (!answerText) {
      console.error(`FATAL: trial ${trial.idx} has no answer field`);
      process.exit(1);
    }

    process.stdout.write(
      `Trial ${pad2(trial.idx)}/${TRIALS.length} (${trial.slug} r${trial.run}): pass-1...`,
    );
    const startMs1 = Date.now();
    const o1 = await runOnePass(judge, trial, 1, promptText, answerText);
    perCallOutputs.push(o1);
    totalCost += o1.costUsd;
    process.stdout.write(
      ` ${Date.now() - startMs1}ms ($${o1.costUsd.toFixed(6)}) → pass-2...`,
    );

    const startMs2 = Date.now();
    const o2 = await runOnePass(judge, trial, 2, promptText, answerText);
    perCallOutputs.push(o2);
    totalCost += o2.costUsd;
    process.stdout.write(
      ` ${Date.now() - startMs2}ms ($${o2.costUsd.toFixed(6)})\n`,
    );

    passOutputs[trial.idx] = [o1, o2];
  }

  console.log(`\nAll 20 calls complete. Total cost: $${totalCost.toFixed(6)}\n`);

  const stats = computeStats(passOutputs);
  const gate = evaluateGate(stats);
  writeSummary(stats, gate, totalCost, perCallOutputs);

  console.log("Per-axis within-1-point %:");
  for (const axis of AXES) {
    const a = stats.perAxis[axis];
    const marker =
      a.within1PointPct >= WITHIN_1_POINT_THRESHOLD ? "✓" : "✗";
    console.log(
      `  ${marker} ${axis}: ${(a.within1PointPct * 100).toFixed(1)}% (${a.within1PointCount}/10); MAD=${a.mad.toFixed(2)}`,
    );
  }

  console.log(
    `\nFinding 3 (bitwise determinism on canonical rubric): ${stats.finding3.interpretation}`,
  );

  console.log(
    `\nSummary written: ${OUTPUTS_DIR}/within-judge-summary.md`,
  );

  if (gate.passed) {
    console.log("\nPROBE PASS — within-judge calibration thresholds satisfied");
    process.exit(0);
  } else {
    console.error("\nPROBE FAIL — within-judge calibration below threshold:");
    for (const f of gate.failures) console.error(`  - ${f}`);
    console.error(
      "\nTravis adjudication required at Step 6.3 per scope-doc §Rescope conditions.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL: top-level error");
  console.error(err);
  process.exit(1);
});
