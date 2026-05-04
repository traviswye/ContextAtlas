#!/usr/bin/env node
/**
 * v0.5 Step 8.1 production grading harness — 28 paired comparisons +
 * 7 cross-order regrades.
 *
 * Per ADR-19 §3 (paired-mode + anonymization 5-step protocol) + §4
 * (paired-t amendment commit 05c9fc7) + STEP-PLAN-V0.5 Step 8.
 *
 * Reads 56 Step 7 trial JSONs (canonical run-uuid:
 * e46dfd64-cd19-41e5-b6bc-34d1bc65b0b0); constructs 28 within-trial-
 * index paired comparisons (5 cells × n=5 base + hono +3 stretch);
 * anonymizes via Step 4 anonymize.ts (commit b582f76); grades via
 * Step 2.2 judge-client gradePair (commit 0b7bdc7) + Step 3
 * RUBRIC_PROMPT_PAIRED (commit 6ed89ce; Sonnet 4.6 default).
 *
 * Phase 1 (base grading): 28 pairs through anonymize → gradePair →
 * persist per-pair JSON; running cost tracked; $5 cost-cap mid-run
 * pause.
 *
 * Phase 2 (cross-order regrade): 7-pair deterministic subset
 * (SHA256(STEP8_RUN_UUID:pair_uuid)[:8] ordering) re-anonymized with
 * forceSwapAB: true; re-graded; manifest tracks
 * cross_order_regrade: true. Yields cross-presentation-order
 * agreement signal per ADR-19 §3.
 *
 * Cost projection per Step 7 cache-discount calibration: ~$1.05
 * script-projected; ~$0.50 platform-billed (cache discount); well
 * under $5 cost-cap; well under scope-doc $15-25 envelope.
 *
 * Per Step 2.4 Option A workflow: Travis runs script locally with
 * funded ANTHROPIC_API_KEY:
 *
 *   npm run build
 *   ANTHROPIC_API_KEY=... node scripts/v0.5-step8-grading-harness.mjs
 *
 * Resume from cost-cap pause or failure:
 *   STEP8_RESUME_UUID=<uuid> node scripts/v0.5-step8-grading-harness.mjs
 *
 * Dry-run (pre-flight + plan only; no API spend):
 *   node scripts/v0.5-step8-grading-harness.mjs --dry-run
 *
 * Wall-clock projection: ~2-5 minutes (35 gradePair calls × ~3-8s each).
 *
 * Refs: ADR-19 §1 + §3 + §4 + §5; Step 1.3 + 1.4 + 1.5 locks;
 * Step 4 anonymize/position-bias/style-normalize; Step 5.1 stats.ts;
 * Step 6 calibration Branch D; Step 7 substrate.
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
// Constants — design lock per Q1-Q10
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const BENCHMARKS_RUNS = resolve(REPO_ROOT, "../ContextAtlas-benchmarks/runs");
const BENCHMARKS_PROMPTS = resolve(
  REPO_ROOT,
  "../ContextAtlas-benchmarks/prompts",
);

// Step 7 canonical run UUID per Q10 lock (hardcoded; v0.5 cycle has
// one canonical Step 7 run).
const STEP7_RUN_UUID = "e46dfd64-cd19-41e5-b6bc-34d1bc65b0b0";
const STEP7_RUN_DIR = resolve(BENCHMARKS_RUNS, `v0.5-step7-${STEP7_RUN_UUID}`);

const OUTPUTS_DIR = resolve(REPO_ROOT, "scripts/v0.5-step8-outputs");
const GRADES_DIR = resolve(OUTPUTS_DIR, "grades");
const CROSS_ORDER_DIR = resolve(OUTPUTS_DIR, "cross-order-regrades");
const MANIFEST_PATH = resolve(OUTPUTS_DIR, "manifest.json");
const SUMMARY_PATH = resolve(OUTPUTS_DIR, "grading-summary.md");

const ANCHOR_CELLS = [
  { repo: "httpx", promptId: "p4-stream-lifecycle" },
  { repo: "cobra", promptId: "c3-hook-lifecycle" },
  { repo: "httpx", promptId: "p2-http3-transport" },
  { repo: "hono", promptId: "h1-context-runtime" },
  { repo: "cobra", promptId: "c4-subcommand-resolution" },
];
const HONO_STRETCH_KEY = "hono/h1-context-runtime";
const N_BASE = 5;
const N_HONO_STRETCH = 8;
const N_CROSS_ORDER_SUBSET = 7;
const COST_CAP_USD = 5.0;

// ============================================================================
// Args + run identification
// ============================================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RESUME_UUID = process.env.STEP8_RESUME_UUID || null;
const STEP8_RUN_UUID = RESUME_UUID || randomUUID();

// ============================================================================
// Pre-flight
// ============================================================================

function preflight() {
  if (!DRY_RUN && !process.env.ANTHROPIC_API_KEY) {
    console.error("FATAL: ANTHROPIC_API_KEY env var not set");
    process.exit(1);
  }
  if (!existsSync(STEP7_RUN_DIR)) {
    console.error(`FATAL: Step 7 substrate missing: ${STEP7_RUN_DIR}`);
    process.exit(1);
  }
  for (const cell of ANCHOR_CELLS) {
    const promptYaml = `${BENCHMARKS_PROMPTS}/${cell.repo}.yml`;
    if (!existsSync(promptYaml)) {
      console.error(`FATAL: prompt yaml missing: ${promptYaml}`);
      process.exit(1);
    }
  }
  mkdirSync(OUTPUTS_DIR, { recursive: true });
  mkdirSync(GRADES_DIR, { recursive: true });
  mkdirSync(CROSS_ORDER_DIR, { recursive: true });
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

function step7TrialPath(repo, promptId, condition, trialIndex) {
  return `${STEP7_RUN_DIR}/${repo}/${promptId}/${condition}-trial-${trialIndex}.json`;
}

function derivePairUuid(cellId, trialIndex) {
  const input = `${STEP8_RUN_UUID}:${cellId}:${trialIndex}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function buildPairs(promptLookup) {
  const pairs = [];
  for (const cell of ANCHOR_CELLS) {
    const cellId = `${cell.repo}/${cell.promptId}`;
    const isHono = cellId === HONO_STRETCH_KEY;
    const n = isHono ? N_HONO_STRETCH : N_BASE;
    for (let i = 0; i < n; i++) {
      const caPath = step7TrialPath(cell.repo, cell.promptId, "ca", i);
      const betaCaPath = step7TrialPath(
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
// Cross-order subset (7 pairs; deterministic from STEP8_RUN_UUID)
// ============================================================================

function selectCrossOrderSubset(pairs) {
  // Sort by SHA256(STEP8_RUN_UUID:pair_uuid)[:8] interpreted as int;
  // take first N_CROSS_ORDER_SUBSET.
  const withSortKey = pairs.map((p) => ({
    pair: p,
    sortKey: createHash("sha256")
      .update(`${STEP8_RUN_UUID}:${p.pairUuid}`)
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
    runUuid: STEP8_RUN_UUID,
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
      step8_run_uuid: STEP8_RUN_UUID,
      rubric_version: "Step-3-canonical (commit 6ed89ce)",
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
  lines.push("# v0.5 Step 8.1 Production Grading — Execution Summary");
  lines.push("");
  lines.push(`**Run UUID:** \`${STEP8_RUN_UUID}\``);
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Step 7 substrate:** \`${STEP7_RUN_UUID}\``);
  lines.push(`**Rubric:** RUBRIC_PROMPT_PAIRED canonical (Step 3 commit 6ed89ce)`);
  lines.push(`**Model:** Claude Sonnet 4.6 (default per ADR-19 §2)`);
  lines.push("");
  lines.push("## Cost summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Total grade calls | ${state.totalGrades} |`);
  lines.push(`| Base pairs | ${state.baseGrades} / 28 |`);
  lines.push(`| Cross-order regrades | ${state.crossOrderGrades} / 7 |`);
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
  lines.push("## Cross-presentation-order agreement (n=7 regrade subset)");
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
  lines.push("## Step 8.1 closure");
  lines.push("");
  if (state.failures.length === 0 && state.totalGrades === 35) {
    lines.push("✓ All 35 grade calls (28 base + 7 cross-order) completed successfully.");
    lines.push("");
    lines.push("Step 8.2 (position-bias verification) unblocks: pure-math post-hoc analysis via Step 4 position-bias.ts; conditional style-normalize stretch only if trigger fires.");
  } else {
    lines.push(`✗ ${state.failures.length} failures or incomplete grading (${state.totalGrades}/35).`);
    lines.push("Step 8.2 blocked until grading complete; investigate failures; re-run via STEP8_RESUME_UUID.");
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

  console.log(`v0.5 Step 8.1 production grading harness`);
  console.log(`Run UUID: ${STEP8_RUN_UUID}${RESUME_UUID ? " (resumed)" : ""}`);
  console.log(`Step 7 substrate: ${STEP7_RUN_UUID}`);
  console.log(`Rubric: RUBRIC_PROMPT_PAIRED canonical (Step 3 commit 6ed89ce)`);
  console.log(`Model: Claude Sonnet 4.6`);
  console.log(`Cost cap (mid-run pause): $${COST_CAP_USD.toFixed(2)}\n`);

  console.log(`Pair plan: ${allPairs.length} base + ${crossOrderSubset.length} cross-order = ${allPairs.length + crossOrderSubset.length} grade calls\n`);

  console.log(`Cross-order regrade subset (${N_CROSS_ORDER_SUBSET} pairs; deterministic from STEP8_RUN_UUID):`);
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

  // Resume bug fix: read existing manifest if it matches our run_uuid;
  // preserve manifestEntries so resume runs don't clobber the manifest
  // when no new successful grades are added (e.g., retry-only runs that
  // hit reproducible failures).
  let initialEntries = [];
  if (existsSync(MANIFEST_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
      if (
        existing.run_uuid === STEP8_RUN_UUID &&
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
  if (resumedCount > 0) {
    console.log(`Resumed: ${resumedCount} grades already complete (cost so far: $${state.totalCost.toFixed(4)})\n`);
  }

  // Phase 1: 28 base grades
  console.log("=== Phase 1: base grading (28 pairs) ===\n");
  for (const [i, pair] of allPairs.entries()) {
    const trialId = `${pair.cellId}/trial-${pair.trialIndex}`;
    if (gradeIsComplete(pair, false)) continue;
    process.stdout.write(`[${i + 1}/28] ${trialId}: `);
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
      console.error(`Resume: STEP8_RESUME_UUID=${STEP8_RUN_UUID} node scripts/v0.5-step8-grading-harness.mjs`);
      process.exit(1);
    }
  }

  // Phase 2: 7 cross-order regrades
  console.log("\n=== Phase 2: cross-order regrade (7 pairs) ===\n");
  for (const [i, pair] of crossOrderSubset.entries()) {
    const trialId = `${pair.cellId}/trial-${pair.trialIndex}`;
    if (gradeIsComplete(pair, true)) continue;
    process.stdout.write(`[${i + 1}/7] ${trialId} (regrade): `);
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

  // Persist manifest
  writeManifest(MANIFEST_PATH, {
    run_uuid: STEP8_RUN_UUID,
    step8_cycle_started_at: new Date().toISOString(),
    anonymization_version: 1,
    entries: state.manifestEntries,
  });

  // Compute aggregates from persisted grade JSONs (read all back from disk for
  // canonical state; handles both fresh runs and resumed runs uniformly).
  const allBaseGrades = allPairs
    .filter((p) => gradeIsComplete(p, false))
    .map((p) =>
      JSON.parse(readFileSync(gradeOutputPath(p, false), "utf8")),
    );
  const allCrossOrderGrades = crossOrderSubset
    .filter((p) => gradeIsComplete(p, true))
    .map((p) => JSON.parse(readFileSync(gradeOutputPath(p, true), "utf8")));

  const aggregates = computeAggregates(allBaseGrades, allCrossOrderGrades);
  writeSummary(state, aggregates);

  console.log(`\n=== Step 8.1 complete ===`);
  console.log(`  Total grades: ${state.totalGrades}/35`);
  console.log(`  Base: ${state.baseGrades}/28; cross-order: ${state.crossOrderGrades}/7`);
  console.log(`  Total cost: $${state.totalCost.toFixed(4)}`);
  console.log(`  Failures: ${state.failures.length}`);
  console.log(`  Output dir: ${OUTPUTS_DIR}`);
  console.log(`  Summary: ${SUMMARY_PATH}`);
  console.log(`\nStep 8.2 unblocks: position-bias verification (pure-math post-hoc); conditional style-normalize stretch.`);

  if (state.failures.length > 0) {
    console.warn(`\n⚠ ${state.failures.length} failures — investigate before Step 8.2.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL: top-level error");
  console.error(err);
  process.exit(1);
});
