#!/usr/bin/env node
/**
 * v0.6 Step 5.3.a production grading harness — 43 paired comparisons +
 * 9 cross-order regrades.
 *
 * Per ADR-19 §3 (paired-mode + anonymization 5-step protocol) + §4
 * (paired-t amendment commit 05c9fc7) + STEP-PLAN-V0.6 Step 5.3 +
 * Q5.3.1-Q5.3.6 sub-adjudications locked at Step 5.3 surface review.
 *
 * Reads 86 Step 5.2 trial JSONs (canonical run-uuid:
 * e9509ea1-d657-4e56-9fc9-98bf8ccf65ea); constructs 43 within-trial-
 * index paired comparisons (8 cells × n=5 base + hono +3 stretch);
 * anonymizes via anonymize.ts (5-step protocol per ADR-19 §3); grades
 * via judge-client gradePair + RUBRIC_PROMPT_PAIRED (Sonnet 4.6
 * default per ADR-19 §2).
 *
 * Cell list per Q5.0.2 + Q5.1.1 + Step 5.2 trial-67 substitution
 * (h10 → h5 per Q11-style refinement at Step 5.2 mid-run-pause):
 *   5 v0.5 anchors:
 *     - httpx/p4-stream-lifecycle (Theme 1.2 fix anchor)
 *     - cobra/c3-hook-lifecycle (win-bucket)
 *     - httpx/p2-http3-transport (win-bucket)
 *     - hono/h1-context-runtime (win + n=8 stretch pre-flagged)
 *     - cobra/c4-subcommand-resolution (Theme 1.1 closure)
 *   3 new v0.6 cells:
 *     - httpx/p3-custom-auth (ca-favorable Python win-bucket)
 *     - hono/h5-hono-generics (tie-bucket TS active step7;
 *       substituted from h10-env-type-on-context per Step 5.2
 *       trial-67 pause due to filterStep7 stripping bucket=held_out)
 *     - cobra/c6-execute-signature (trick-bucket Go localize)
 *
 * Phase 1 (base grading): 43 pairs through anonymize → gradePair →
 * persist per-pair JSON; running cost tracked; $5 cost-cap mid-run
 * pause.
 *
 * Phase 2 (cross-order regrade): 9-pair deterministic subset
 * (SHA256(STEP5_RUN_UUID:pair_uuid)[:8] ordering; v0.5 ratio scaled
 * per Q5.3.3 lock; within ADR-19 §3 5-10 range) re-anonymized with
 * forceSwapAB: true; re-graded; manifest tracks
 * cross_order_regrade: true. Yields cross-presentation-order
 * agreement signal per ADR-19 §3.
 *
 * Cost projection per v0.5 grading empirical anchor (35 grades for
 * $0.4394 script-tracked = $0.0125/grade): 52 grades × $0.0125 =
 * ~$0.65 script-reported / ~$0.65 platform-billed (judge prompts
 * short; minimal cache discount). Cost-cap $5.00 = ~7x headroom.
 *
 * Per Step 5.3.a cost-approval gate (Travis lock at Step 5.3
 * adjudication): up to $2 budget approved with $5 cost-cap safety
 * backstop. Wall-clock projection ~2-3 minutes (52 calls × 3-5s
 * each).
 *
 * Per Step 2.4 Option A workflow (v0.5 inheritance): Travis runs
 * script locally with funded ANTHROPIC_API_KEY:
 *
 *   npm run build  # ensure dist/ fresh
 *   ANTHROPIC_API_KEY=... node scripts/v0.6-step5.3-grading-harness.mjs
 *
 * Resume from cost-cap pause or failure:
 *   STEP5_3_RESUME_UUID=<uuid> node scripts/v0.6-step5.3-grading-harness.mjs
 *
 * Dry-run (pre-flight + plan only; no API spend):
 *   node scripts/v0.6-step5.3-grading-harness.mjs --dry-run
 *
 * Refs: ADR-19 §1 + §3 + §4 + §5; v0.6-SCOPE.md §7.1 Q2; STEP-PLAN-
 * V0.6 Step 5.3; v0.5-step8-grading-harness.mjs (template inheritance).
 */

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";
import { load as yamlLoad } from "js-yaml";

import {
  anonymize,
  writeManifest,
} from "../dist/grading/anonymize.js";
import { createJudgeClient, JudgeParseError } from "../dist/grading/judge-client.js";
import { RUBRIC_PROMPT_PAIRED } from "../dist/grading/rubric-prompt.js";

// ============================================================================
// Constants — design lock per Q5.0 + Q5.1 + Q5.3
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const BENCHMARKS_RUNS = resolve(REPO_ROOT, "../ContextAtlas-benchmarks/runs");
const BENCHMARKS_PROMPTS = resolve(
  REPO_ROOT,
  "../ContextAtlas-benchmarks/prompts",
);

// Step 5.2 canonical run UUID (from completed 86-trial production run
// per orchestrator final state at v0.6 Step 5.2 close).
const STEP5_RUN_UUID = "e9509ea1-d657-4e56-9fc9-98bf8ccf65ea";
const STEP5_RUN_DIR = resolve(BENCHMARKS_RUNS, `v0.6-step5-${STEP5_RUN_UUID}`);

const OUTPUTS_DIR = resolve(REPO_ROOT, "scripts/v0.6-step5.3-outputs");
const GRADES_DIR = resolve(OUTPUTS_DIR, "grades");
const CROSS_ORDER_DIR = resolve(OUTPUTS_DIR, "cross-order-regrades");
// Phase 3 swap-retry recovery dir (Q11-style harness extension at
// Step 5.3.a per Path A lock; addresses v0.5 F6 reproduction pattern
// where Sonnet judge fails JSON parse under specific assignment-
// parity for cobra/c3-hook-lifecycle cell). retry-with-swap grades
// substitute for failed base grades per v0.5 F6 recovery precedent.
const RETRY_DIR = resolve(OUTPUTS_DIR, "retry-with-swap");
const MANIFEST_PATH = resolve(OUTPUTS_DIR, "manifest.json");
const SUMMARY_PATH = resolve(OUTPUTS_DIR, "grading-summary.md");

const CELLS = [
  // 5 anchor cells (carried from v0.5 step7)
  { repo: "httpx", promptId: "p4-stream-lifecycle" },
  { repo: "cobra", promptId: "c3-hook-lifecycle" },
  { repo: "httpx", promptId: "p2-http3-transport" },
  { repo: "hono", promptId: "h1-context-runtime" },
  { repo: "cobra", promptId: "c4-subcommand-resolution" },
  // 3 new v0.6 cells (Q5.0.2 + Q5.1.1 + Step 5.2 trial-67 substitution)
  { repo: "httpx", promptId: "p3-custom-auth" },
  { repo: "hono", promptId: "h5-hono-generics" },
  { repo: "cobra", promptId: "c6-execute-signature" },
];
const HONO_STRETCH_KEY = "hono/h1-context-runtime";
const N_BASE = 5;
const N_HONO_STRETCH = 8;
const N_CROSS_ORDER_SUBSET = 9; // Q5.3.3 lock: v0.5 ratio scaled (28→43 base)
const COST_CAP_USD = 5.0; // 7x headroom over ~$0.65 projection

// ============================================================================
// Args + run identification
// ============================================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RESUME_UUID = process.env.STEP5_3_RESUME_UUID || null;
const STEP5_3_RUN_UUID = RESUME_UUID || randomUUID();

// ============================================================================
// Pre-flight
// ============================================================================

function preflight() {
  if (!DRY_RUN && !process.env.ANTHROPIC_API_KEY) {
    console.error("FATAL: ANTHROPIC_API_KEY env var not set");
    process.exit(1);
  }
  if (!existsSync(STEP5_RUN_DIR)) {
    console.error(`FATAL: Step 5.2 substrate missing: ${STEP5_RUN_DIR}`);
    process.exit(1);
  }
  for (const cell of CELLS) {
    const promptYaml = `${BENCHMARKS_PROMPTS}/${cell.repo}.yml`;
    if (!existsSync(promptYaml)) {
      console.error(`FATAL: prompt yaml missing: ${promptYaml}`);
      process.exit(1);
    }
  }
  mkdirSync(OUTPUTS_DIR, { recursive: true });
  mkdirSync(GRADES_DIR, { recursive: true });
  mkdirSync(CROSS_ORDER_DIR, { recursive: true });
  mkdirSync(RETRY_DIR, { recursive: true });
}

function loadPromptLookup() {
  const lookup = new Map();
  for (const repo of ["httpx", "cobra", "hono"]) {
    const data = yamlLoad(
      readFileSync(`${BENCHMARKS_PROMPTS}/${repo}.yml`, "utf8"),
    );
    for (const p of data.prompts ?? []) {
      lookup.set(`${repo}:${p.prompt_id}`, p.prompt);
    }
  }
  return lookup;
}

// ============================================================================
// Pair construction
// ============================================================================

function step5TrialPath(repo, promptId, condition, trialIndex) {
  return `${STEP5_RUN_DIR}/${repo}/${promptId}/${condition}-trial-${trialIndex}.json`;
}

function derivePairUuid(cellId, trialIndex) {
  const input = `${STEP5_3_RUN_UUID}:${cellId}:${trialIndex}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function buildPairs(promptLookup) {
  const pairs = [];
  for (const cell of CELLS) {
    const cellId = `${cell.repo}/${cell.promptId}`;
    const isHono = cellId === HONO_STRETCH_KEY;
    const n = isHono ? N_HONO_STRETCH : N_BASE;
    for (let i = 0; i < n; i++) {
      const caPath = step5TrialPath(cell.repo, cell.promptId, "ca", i);
      const betaCaPath = step5TrialPath(
        cell.repo,
        cell.promptId,
        "beta-ca",
        i,
      );
      if (!existsSync(caPath)) {
        console.error(`FATAL: missing trial JSON: ${caPath}`);
        process.exit(1);
      }
      if (!existsSync(betaCaPath)) {
        console.error(`FATAL: missing trial JSON: ${betaCaPath}`);
        process.exit(1);
      }
      pairs.push({
        pairUuid: derivePairUuid(cellId, i),
        cellId,
        repo: cell.repo,
        promptId: cell.promptId,
        trialIndex: i,
        prompt: promptLookup.get(`${cell.repo}:${cell.promptId}`),
        caTrialPath: caPath,
        betaCaTrialPath: betaCaPath,
        stretchTrial: i >= N_BASE,
      });
    }
  }
  return pairs;
}

// ============================================================================
// Cross-order subset (9 pairs; deterministic from STEP5_3_RUN_UUID)
// ============================================================================

function selectCrossOrderSubset(pairs) {
  // Sort by SHA256(STEP5_3_RUN_UUID:pair_uuid)[:8] interpreted as
  // hex string; take first N_CROSS_ORDER_SUBSET.
  const withSortKey = pairs.map((p) => ({
    pair: p,
    sortKey: createHash("sha256")
      .update(`${STEP5_3_RUN_UUID}:${p.pairUuid}`)
      .digest("hex")
      .slice(0, 8),
  }));
  withSortKey.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
  return withSortKey.slice(0, N_CROSS_ORDER_SUBSET).map((w) => w.pair);
}

// ============================================================================
// Per-pair grading
// ============================================================================

function recoverByCondition(scoresA, scoresB, assignment) {
  return {
    ca: assignment.A === "ca" ? scoresA : scoresB,
    "beta-ca": assignment.A === "beta-ca" ? scoresA : scoresB,
  };
}

async function gradePair(judge, pair, forceSwapAB) {
  const caJson = JSON.parse(readFileSync(pair.caTrialPath, "utf8"));
  const betaCaJson = JSON.parse(readFileSync(pair.betaCaTrialPath, "utf8"));
  const anonResult = anonymize({
    prompt: pair.prompt,
    caTrial: { answer: caJson.answer },
    betaCaTrial: { answer: betaCaJson.answer },
    caSourcePath: pair.caTrialPath.replace(BENCHMARKS_RUNS, "<benchmarks-runs>"),
    betaCaSourcePath: pair.betaCaTrialPath.replace(
      BENCHMARKS_RUNS,
      "<benchmarks-runs>",
    ),
    cellId: pair.cellId,
    trialIndex: pair.trialIndex,
    runUuid: STEP5_3_RUN_UUID,
    pairUuid: pair.pairUuid,
    forceSwapAB,
  });
  let result;
  try {
    result = await judge.gradePair({
      rubricPrompt: RUBRIC_PROMPT_PAIRED,
      prompt: anonResult.gradingInput.prompt,
      answerA: anonResult.gradingInput.answer_A,
      answerB: anonResult.gradingInput.answer_B,
    });
  } catch (err) {
    if (err instanceof JudgeParseError) {
      return {
        ok: false,
        error: `JudgeParseError: ${err.message}`,
        responseTextHead: err.responseText.slice(0, 500),
      };
    }
    throw err;
  }
  const recoveredScores = recoverByCondition(
    result.scoresA,
    result.scoresB,
    anonResult.manifestEntry.assignment,
  );
  return {
    ok: true,
    grading: {
      pair_uuid: pair.pairUuid,
      cell_id: pair.cellId,
      trial_index: pair.trialIndex,
      step5_3_run_uuid: STEP5_3_RUN_UUID,
      rubric_version: "Step-3-canonical (commit 6ed89ce; ADR-19 §3)",
      anonymize_assignment_parity: anonResult.manifestEntry.assignment_parity,
      anonymize_assignment: anonResult.manifestEntry.assignment,
      scores: { scoresA: result.scoresA, scoresB: result.scoresB },
      scores_recovered_by_condition: recoveredScores,
      usage: result.usage,
      costUsd: result.costUsd,
      model: result.model,
      createdAt: new Date().toISOString(),
      cross_order_regrade: forceSwapAB,
    },
    manifestEntry: anonResult.manifestEntry,
  };
}

// ============================================================================
// Resume + persistence
// ============================================================================

function gradeOutputPath(pair, crossOrder) {
  const dir = crossOrder ? CROSS_ORDER_DIR : GRADES_DIR;
  return `${dir}/${pair.pairUuid}.json`;
}

function gradeIsComplete(pair, crossOrder) {
  const path = gradeOutputPath(pair, crossOrder);
  if (!existsSync(path)) return false;
  try {
    const j = JSON.parse(readFileSync(path, "utf8"));
    return typeof j.costUsd === "number" && j.scores_recovered_by_condition;
  } catch {
    return false;
  }
}

function retryOutputPath(pair) {
  return `${RETRY_DIR}/${pair.pairUuid}.json`;
}

function retryIsComplete(pair) {
  const path = retryOutputPath(pair);
  if (!existsSync(path)) return false;
  try {
    const j = JSON.parse(readFileSync(path, "utf8"));
    return typeof j.costUsd === "number" && j.scores_recovered_by_condition;
  } catch {
    return false;
  }
}

// ============================================================================
// Aggregate metrics + summary
// ============================================================================

function computeAggregates(allBaseGrades, allCrossOrderGrades) {
  const AXES = [
    "factual_correctness",
    "completeness",
    "actionability",
    "hallucination",
  ];
  const perCell = {};
  for (const g of allBaseGrades) {
    if (!perCell[g.cell_id]) perCell[g.cell_id] = [];
    perCell[g.cell_id].push(g);
  }
  const cellAggregates = {};
  for (const [cellId, grades] of Object.entries(perCell)) {
    const aggregate = {
      n: grades.length,
      meanCa: {},
      meanBetaCa: {},
      meanDiff: {},
    };
    for (const axis of AXES) {
      const caScores = grades.map(
        (g) => g.scores_recovered_by_condition.ca[axis],
      );
      const betaCaScores = grades.map(
        (g) => g.scores_recovered_by_condition["beta-ca"][axis],
      );
      const diffs = caScores.map((c, i) => c - betaCaScores[i]);
      aggregate.meanCa[axis] =
        caScores.reduce((a, b) => a + b, 0) / caScores.length;
      aggregate.meanBetaCa[axis] =
        betaCaScores.reduce((a, b) => a + b, 0) / betaCaScores.length;
      aggregate.meanDiff[axis] =
        diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }
    cellAggregates[cellId] = aggregate;
  }

  // Cross-order agreement: per-axis exact-match between condition-recovered
  // scores across base grade + cross-order regrade for same pair.
  const crossOrderByPair = new Map();
  for (const g of allCrossOrderGrades) crossOrderByPair.set(g.pair_uuid, g);
  const crossOrderAgreement = {};
  for (const axis of AXES) {
    crossOrderAgreement[axis] = { exactMatchCa: 0, exactMatchBetaCa: 0, n: 0 };
  }
  for (const baseGrade of allBaseGrades) {
    const regrade = crossOrderByPair.get(baseGrade.pair_uuid);
    if (!regrade) continue;
    for (const axis of AXES) {
      const baseCa = baseGrade.scores_recovered_by_condition.ca[axis];
      const baseBetaCa = baseGrade.scores_recovered_by_condition["beta-ca"][axis];
      const regradeCa = regrade.scores_recovered_by_condition.ca[axis];
      const regradeBetaCa =
        regrade.scores_recovered_by_condition["beta-ca"][axis];
      if (baseCa === regradeCa) crossOrderAgreement[axis].exactMatchCa++;
      if (baseBetaCa === regradeBetaCa)
        crossOrderAgreement[axis].exactMatchBetaCa++;
      crossOrderAgreement[axis].n++;
    }
  }

  return { cellAggregates, crossOrderAgreement };
}

function writeSummary(state, aggregates) {
  const lines = [];
  lines.push("# v0.6 Step 5.3.a Production Grading — Execution Summary");
  lines.push("");
  lines.push(`**Run UUID:** \`${STEP5_3_RUN_UUID}\``);
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Step 5.2 substrate:** \`${STEP5_RUN_UUID}\``);
  lines.push(`**Rubric:** RUBRIC_PROMPT_PAIRED canonical (ADR-19 §3)`);
  lines.push(`**Model:** Claude Sonnet 4.6 (default per ADR-19 §2)`);
  lines.push("");
  lines.push("## Cost summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Total grade calls | ${state.totalGrades} |`);
  lines.push(`| Base pairs (Phase 1) | ${state.baseGrades} / 43 |`);
  lines.push(`| Cross-order regrades (Phase 2) | ${state.crossOrderGrades} / 9 |`);
  lines.push(`| Swap-retry recoveries (Phase 3) | ${state.retryWithSwapGrades} (v0.5 F6 pattern recovery) |`);
  lines.push(`| Effective base set | ${state.baseGrades + state.retryWithSwapGrades} / 43 (Phase 1 + Phase 3 merged per ADR-19 §3 anonymization-symmetry) |`);
  lines.push(`| Script-projected cost | $${state.totalCost.toFixed(4)} |`);
  lines.push(`| Cost-cap $${COST_CAP_USD.toFixed(2)} hit? | ${state.totalCost > COST_CAP_USD ? "YES" : "no"} |`);
  lines.push(`| Failures | ${state.failures.length} |`);
  lines.push("");
  lines.push("## Per-cell aggregate scores (base grades; n=5 per cell; hono n=8)");
  lines.push("");
  lines.push("| Cell | n | factual mean Δ | completeness mean Δ | actionability mean Δ | hallucination mean Δ |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const [cellId, agg] of Object.entries(aggregates.cellAggregates)) {
    lines.push(
      `| ${cellId} | ${agg.n} | ${agg.meanDiff.factual_correctness.toFixed(2)} | ${agg.meanDiff.completeness.toFixed(2)} | ${agg.meanDiff.actionability.toFixed(2)} | ${agg.meanDiff.hallucination.toFixed(2)} |`,
    );
  }
  lines.push("");
  lines.push("Δ = mean(ca) - mean(beta-ca) per axis; positive = ca scored higher than beta-ca.");
  lines.push("");
  lines.push(`## Cross-presentation-order agreement (n=${N_CROSS_ORDER_SUBSET} regrade subset)`);
  lines.push("");
  lines.push("| Axis | ca exact-match (base vs regrade) | beta-ca exact-match | Pairs |");
  lines.push("|---|---:|---:|---:|");
  for (const [axis, a] of Object.entries(aggregates.crossOrderAgreement)) {
    const pct = (n) => (a.n === 0 ? "n/a" : `${((n / a.n) * 100).toFixed(0)}%`);
    lines.push(`| ${axis} | ${pct(a.exactMatchCa)} | ${pct(a.exactMatchBetaCa)} | ${a.n} |`);
  }
  lines.push("");
  lines.push("Position-blind judge: ca/beta-ca scores match across base + regrade regardless of position assignment. Per ADR-19 §3 cross-presentation-order agreement signal.");
  lines.push("");
  lines.push("## Step 5.3.a closure");
  lines.push("");
  const effectiveBase = state.baseGrades + state.retryWithSwapGrades;
  const expectedBase = 43;
  const expectedCrossOrder = N_CROSS_ORDER_SUBSET;
  const baseComplete = effectiveBase === expectedBase;
  const crossOrderComplete = state.crossOrderGrades === expectedCrossOrder;
  if (baseComplete && crossOrderComplete) {
    lines.push(`✓ Effective base set complete: ${effectiveBase}/${expectedBase} (Phase 1 + Phase 3 merged per ADR-19 §3 anonymization-symmetry) + ${state.crossOrderGrades}/${expectedCrossOrder} cross-order regrades.`);
    if (state.retryWithSwapGrades > 0) {
      lines.push("");
      lines.push(`Phase 3 swap-retry recovered ${state.retryWithSwapGrades} cobra/c3-hook-lifecycle base failure(s) per v0.5 F6 pattern recovery. Substrate complete for paired-t analysis.`);
    }
    lines.push("");
    lines.push("Step 5.3.b unblocks: paired-t per axis × cell + cross-cell rollup at concatenated N=43 differences + v0.5-vs-v0.6 tier-gradation comparison + cost-priors-v0.6.json snapshot + Phase-10 ref-doc drafting.");
  } else {
    lines.push(`✗ Incomplete grading (effective base ${effectiveBase}/${expectedBase}; cross-order ${state.crossOrderGrades}/${expectedCrossOrder}).`);
    lines.push("Step 5.3.b blocked until grading complete; investigate failures; re-run via STEP5_3_RESUME_UUID.");
  }
  lines.push("");
  writeFileSync(SUMMARY_PATH, lines.join("\n"), "utf8");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  preflight();
  const promptLookup = loadPromptLookup();
  const allPairs = buildPairs(promptLookup);
  const crossOrderSubset = selectCrossOrderSubset(allPairs);

  console.log(`v0.6 Step 5.3.a production grading harness`);
  console.log(`Run UUID: ${STEP5_3_RUN_UUID}${RESUME_UUID ? " (resumed)" : ""}`);
  console.log(`Step 5.2 substrate: ${STEP5_RUN_UUID}`);
  console.log(`Rubric: RUBRIC_PROMPT_PAIRED canonical (ADR-19 §3)`);
  console.log(`Model: Claude Sonnet 4.6`);
  console.log(`Cost cap (mid-run pause): $${COST_CAP_USD.toFixed(2)}\n`);

  console.log(`Pair plan: ${allPairs.length} base + ${crossOrderSubset.length} cross-order = ${allPairs.length + crossOrderSubset.length} grade calls\n`);

  console.log(`Cross-order regrade subset (${N_CROSS_ORDER_SUBSET} pairs; deterministic from STEP5_3_RUN_UUID):`);
  for (const p of crossOrderSubset) {
    console.log(
      `  ${p.pairUuid} (cell ${p.cellId} trial ${p.trialIndex}${p.stretchTrial ? " stretch" : ""})`,
    );
  }
  console.log("");

  if (DRY_RUN) {
    console.log("DRY-RUN: pre-flight + plan validated; no API spend.");
    process.exit(0);
  }

  const anthropic = new Anthropic();
  const judge = createJudgeClient({ anthropic });

  // Resume bug fix (v0.5-step8 inheritance): read existing manifest
  // if it matches our run_uuid; preserve manifestEntries so resume
  // runs don't clobber the manifest when no new successful grades
  // are added (e.g., retry-only runs that hit reproducible failures).
  let initialEntries = [];
  if (existsSync(MANIFEST_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
      if (
        existing.run_uuid === STEP5_3_RUN_UUID &&
        Array.isArray(existing.entries)
      ) {
        initialEntries = existing.entries;
      }
    } catch {
      // ignore; start fresh if existing manifest unparseable
    }
  }

  const state = {
    totalCost: 0,
    totalGrades: 0,
    baseGrades: 0,
    crossOrderGrades: 0,
    retryWithSwapGrades: 0,
    failures: [],
    manifestEntries: initialEntries,
  };

  // Resume scan
  let resumedCount = 0;
  for (const pair of allPairs) {
    if (gradeIsComplete(pair, false)) {
      const j = JSON.parse(readFileSync(gradeOutputPath(pair, false), "utf8"));
      state.totalCost += j.costUsd ?? 0;
      state.totalGrades++;
      state.baseGrades++;
      resumedCount++;
    }
  }
  for (const pair of crossOrderSubset) {
    if (gradeIsComplete(pair, true)) {
      const j = JSON.parse(readFileSync(gradeOutputPath(pair, true), "utf8"));
      state.totalCost += j.costUsd ?? 0;
      state.totalGrades++;
      state.crossOrderGrades++;
      resumedCount++;
    }
  }
  // Phase 3 swap-retry resume scan: pairs that failed Phase 1 base
  // grading + were recovered via swap-retry phase per Path A v0.5 F6
  // recovery pattern.
  for (const pair of allPairs) {
    if (retryIsComplete(pair)) {
      const j = JSON.parse(readFileSync(retryOutputPath(pair), "utf8"));
      state.totalCost += j.costUsd ?? 0;
      state.totalGrades++;
      state.retryWithSwapGrades++;
      resumedCount++;
    }
  }
  if (resumedCount > 0) {
    console.log(`Resumed: ${resumedCount} grades already complete (cost so far: $${state.totalCost.toFixed(4)})\n`);
  }

  // Phase 1: 43 base grades
  console.log(`=== Phase 1: base grading (${allPairs.length} pairs) ===\n`);
  for (const [i, pair] of allPairs.entries()) {
    const trialId = `${pair.cellId}/trial-${pair.trialIndex}`;
    // Skip pairs already complete via Phase 1 base grading OR Phase 3
    // swap-retry recovery. Phase 3 recoveries substitute for failed
    // base grades per Path A v0.5 F6 recovery precedent; Phase 1 must
    // not re-attempt them (idempotent resume invariant).
    if (gradeIsComplete(pair, false) || retryIsComplete(pair)) continue;
    process.stdout.write(`[${i + 1}/${allPairs.length}] ${trialId}: `);
    const t0 = Date.now();
    const r = await gradePair(judge, pair, false);
    const wall = Date.now() - t0;
    if (!r.ok) {
      console.error(`✗ ${r.error}`);
      state.failures.push({ pairUuid: pair.pairUuid, phase: "base", error: r.error });
      continue;
    }
    state.totalCost += r.grading.costUsd;
    state.totalGrades++;
    state.baseGrades++;
    state.manifestEntries.push(r.manifestEntry);
    writeFileSync(
      gradeOutputPath(pair, false),
      JSON.stringify(r.grading, null, 2) + "\n",
      "utf8",
    );
    console.log(
      `✓ cost=$${r.grading.costUsd.toFixed(4)} wall=${(wall / 1000).toFixed(1)}s assignment=${r.grading.anonymize_assignment_parity} (running: $${state.totalCost.toFixed(4)})`,
    );
    if (state.totalCost > COST_CAP_USD) {
      console.error(
        `\nPAUSED: cost-cap $${COST_CAP_USD.toFixed(2)} exceeded ($${state.totalCost.toFixed(4)})`,
      );
      console.error(`Resume: STEP5_3_RESUME_UUID=${STEP5_3_RUN_UUID} node scripts/v0.6-step5.3-grading-harness.mjs`);
      process.exit(1);
    }
  }

  // Phase 2: 9 cross-order regrades
  console.log(`\n=== Phase 2: cross-order regrade (${N_CROSS_ORDER_SUBSET} pairs) ===\n`);
  for (const [i, pair] of crossOrderSubset.entries()) {
    const trialId = `${pair.cellId}/trial-${pair.trialIndex}`;
    if (gradeIsComplete(pair, true)) continue;
    process.stdout.write(`[${i + 1}/${N_CROSS_ORDER_SUBSET}] ${trialId} (regrade): `);
    const t0 = Date.now();
    const r = await gradePair(judge, pair, true);
    const wall = Date.now() - t0;
    if (!r.ok) {
      console.error(`✗ ${r.error}`);
      state.failures.push({
        pairUuid: pair.pairUuid,
        phase: "cross-order",
        error: r.error,
      });
      continue;
    }
    state.totalCost += r.grading.costUsd;
    state.totalGrades++;
    state.crossOrderGrades++;
    state.manifestEntries.push(r.manifestEntry);
    writeFileSync(
      gradeOutputPath(pair, true),
      JSON.stringify(r.grading, null, 2) + "\n",
      "utf8",
    );
    console.log(
      `✓ cost=$${r.grading.costUsd.toFixed(4)} wall=${(wall / 1000).toFixed(1)}s assignment=${r.grading.anonymize_assignment_parity} (running: $${state.totalCost.toFixed(4)})`,
    );
  }

  // Phase 3: swap-retry recovery for failed Phase 1 base grades.
  //
  // Per Path A lock at v0.6 Step 5.3.a JudgeParseError adjudication:
  // identifies pairs with no successful Phase 1 base grade; re-
  // anonymizes with forceSwapAB=true (forces opposite assignment-
  // parity); re-grades. Addresses v0.5 F6 reproduction pattern
  // (position-dependent JSON output formatting on Sonnet judge for
  // specific cell × assignment-parity combinations). Substitutes
  // for failed base grades for paired-t analysis purposes per
  // ADR-19 §3 anonymization-symmetry.
  const failedBasePairs = allPairs.filter(
    (p) => !gradeIsComplete(p, false) && !retryIsComplete(p),
  );
  if (failedBasePairs.length > 0) {
    console.log(
      `\n=== Phase 3: swap-retry recovery (${failedBasePairs.length} pairs; v0.5 F6 pattern recovery) ===\n`,
    );
    for (const [i, pair] of failedBasePairs.entries()) {
      const trialId = `${pair.cellId}/trial-${pair.trialIndex}`;
      process.stdout.write(
        `[${i + 1}/${failedBasePairs.length}] ${trialId} (swap-retry): `,
      );
      const t0 = Date.now();
      const r = await gradePair(judge, pair, true); // forceSwapAB
      const wall = Date.now() - t0;
      if (!r.ok) {
        console.error(`✗ ${r.error}`);
        state.failures.push({
          pairUuid: pair.pairUuid,
          phase: "swap-retry",
          error: r.error,
        });
        continue;
      }
      state.totalCost += r.grading.costUsd;
      state.totalGrades++;
      state.retryWithSwapGrades++;
      // Mark grading record explicitly as swap-retry recovery for
      // downstream aggregation.
      r.grading.swap_retry_recovery = true;
      state.manifestEntries.push(r.manifestEntry);
      writeFileSync(
        retryOutputPath(pair),
        JSON.stringify(r.grading, null, 2) + "\n",
        "utf8",
      );
      console.log(
        `✓ cost=$${r.grading.costUsd.toFixed(4)} wall=${(wall / 1000).toFixed(1)}s assignment=${r.grading.anonymize_assignment_parity} (running: $${state.totalCost.toFixed(4)})`,
      );
    }
  } else {
    console.log(`\n=== Phase 3: swap-retry recovery (0 pairs; no Phase 1 base failures) ===\n`);
  }

  // Persist manifest
  writeManifest(MANIFEST_PATH, {
    run_uuid: STEP5_3_RUN_UUID,
    step5_3_cycle_started_at: new Date().toISOString(),
    anonymization_version: 1,
    entries: state.manifestEntries,
  });

  // Compute aggregates from persisted grade JSONs (read all back from
  // disk for canonical state; handles both fresh runs and resumed
  // runs uniformly). Merges Phase 1 base grades + Phase 3 swap-retry
  // recoveries into effective base set per Path A lock (swap-retry
  // substitutes for failed base grade per v0.5 F6 recovery
  // precedent).
  const allBaseGrades = allPairs
    .filter((p) => gradeIsComplete(p, false) || retryIsComplete(p))
    .map((p) => {
      const path = gradeIsComplete(p, false)
        ? gradeOutputPath(p, false)
        : retryOutputPath(p);
      return JSON.parse(readFileSync(path, "utf8"));
    });
  const allCrossOrderGrades = crossOrderSubset
    .filter((p) => gradeIsComplete(p, true))
    .map((p) => JSON.parse(readFileSync(gradeOutputPath(p, true), "utf8")));

  const aggregates = computeAggregates(allBaseGrades, allCrossOrderGrades);
  writeSummary(state, aggregates);

  const effectiveBase = state.baseGrades + state.retryWithSwapGrades;
  // Distinguish unrecovered failures from base failures recovered via
  // Phase 3 swap-retry. Per Path A lock at Step 5.3.a JudgeParseError
  // adjudication: swap-retry recoveries substitute for failed base
  // grades per ADR-19 §3 anonymization-symmetry; fail-loudly triggers
  // only if effective substrate incomplete OR Phase 3 itself failed.
  const unrecoveredFailures = state.failures.filter((f) => {
    if (f.phase === "base") {
      // Recovered if a retry-with-swap grade exists for this pair
      const pair = allPairs.find((p) => p.pairUuid === f.pairUuid);
      return !(pair && retryIsComplete(pair));
    }
    return true; // cross-order or swap-retry phase failures count as unrecovered
  });

  console.log(`\n=== Step 5.3.a complete ===`);
  console.log(`  Effective base set: ${effectiveBase}/${allPairs.length} (Phase 1 base ${state.baseGrades} + Phase 3 swap-retry ${state.retryWithSwapGrades})`);
  console.log(`  Cross-order regrades: ${state.crossOrderGrades}/${N_CROSS_ORDER_SUBSET}`);
  console.log(`  Total grades: ${state.totalGrades}`);
  console.log(`  Total cost: $${state.totalCost.toFixed(4)}`);
  console.log(`  Phase 1 failures (recovered via Phase 3): ${state.failures.length - unrecoveredFailures.length}`);
  console.log(`  Unrecovered failures: ${unrecoveredFailures.length}`);
  console.log(`  Output dir: ${OUTPUTS_DIR}`);
  console.log(`  Summary: ${SUMMARY_PATH}`);
  console.log(`\nStep 5.3.b unblocks: paired-t + cross-cell rollup + v0.5-vs-v0.6 tier-gradation comparison + cost-priors-v0.6.json snapshot + Phase-10 ref-doc drafting.`);

  if (unrecoveredFailures.length > 0) {
    console.warn(`\n⚠ ${unrecoveredFailures.length} unrecovered failures — investigate before Step 5.3.b.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL: top-level error");
  console.error(err);
  process.exit(1);
});
