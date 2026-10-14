#!/usr/bin/env node
/**
 * v1.2 Phase 7 calibration harness (paid). Criteria, cells and sample:
 * docs/adr/incremental-model-calibration/PREREGISTRATION.md.
 *
 * Every extraction goes through the CLI's createExtractionClient (same
 * request body, max_tokens, parsing, validation, retries). `-low` cells
 * wrap the SDK client to add output_config.effort. Spend is tracked at
 * list price and the run stops before a call would cross the cap.
 *
 * Usage (from the repo root, after `npm run build`):
 *   node --env-file=.env scripts/v1.2-phase7-calibrate.mjs <sample.json> <workdir> [capUsd]
 * Writes <workdir>/raw.json (all claims; may hold private source content,
 * keep it out of the repository) and <workdir>/metrics.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import { ParseError, createExtractionClient, usageOfFailedCall } from "../dist/extraction/anthropic-client.js";

const [samplePath, workdir, capArg] = process.argv.slice(2);
if (!samplePath || !workdir) {
  console.error("usage: node --env-file=.env scripts/v1.2-phase7-calibrate.mjs <sample.json> <workdir> [capUsd]");
  process.exit(2);
}
const CAP = Number(capArg ?? 35);
const TRIALS = Number(process.env.CALIB_TRIALS ?? 3);
const PRICES = {
  "claude-opus-4-7": [5, 25],
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
const CELLS = [
  { id: "baseline", model: "claude-opus-4-7" },
  { id: "opus-5-5", model: "claude-opus-5-5" },
  { id: "sonnet-5-5", model: "claude-sonnet-5-5" },
  { id: "haiku-5-5", model: "claude-haiku-5-5" },
  { id: "opus-5-5-low", model: "claude-opus-5-5", effort: "low" },
  { id: "sonnet-5-5-low", model: "claude-sonnet-5-5", effort: "low" },
];
// Worst case per call before it is made (an ADR with a long thinking run).
const CALL_RESERVE_USD = 0.45;
const JUDGE_MODEL = "claude-opus-4-7";

mkdirSync(workdir, { recursive: true });
const rawPath = join(workdir, "raw.json");
const sample = JSON.parse(readFileSync(samplePath, "utf8"));
const raw = existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, "utf8")) : { calls: {}, judge: {}, spentUsd: 0 };
const save = () => writeFileSync(rawPath, JSON.stringify(raw, null, 2) + "\n");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null, maxRetries: 0 });
const cost = (model, u) => (u.inputTokens / 1e6) * PRICES[model][0] + (u.outputTokens / 1e6) * PRICES[model][1];

/** Units of one cell-trial: [key, sourceKey, body, kind, labels]. */
const units = [];
for (const f of sample.docstringFiles) {
  for (const e of f.entries) {
    units.push({ key: `doc:${f.lang}:${f.path}:${e.symbol_id}`, source: `doc:${f.lang}:${f.path}`, body: e.docstring, kind: "docstring", text: e.docstring });
  }
}
for (const a of sample.adrs) units.push({ key: `adr:${a.path}`, source: `adr:${a.path}`, body: a.body, kind: "adr", text: a.body });
for (const c of sample.commits) {
  units.push({
    key: `commit:${c.repo}`,
    source: `commit:${c.repo}`,
    body: c.body,
    kind: "commit",
    text: c.body,
    expectHard: /^deprecate/i.test(c.subject),
  });
}

/** Model ids the API reported, by cell (proves which model answered). */
const servedBy = {};
function clientFor(cell) {
  const sdk = {
    messages: {
      create: async (body, opts) => {
        const resp = await anthropic.messages.create(
          cell.effort ? { ...body, output_config: { effort: cell.effort } } : body,
          opts,
        );
        (servedBy[cell.id] ??= new Set()).add(resp.model);
        return resp;
      },
    },
  };
  return createExtractionClient({ anthropic: sdk, model: cell.model });
}

let stopped = null;
async function extractOne(cell, trial, unit, client) {
  const id = `${cell.id}|${trial}|${unit.key}`;
  if (raw.calls[id]) return;
  if (raw.spentUsd + CALL_RESERVE_USD > CAP) {
    stopped = `cap reached before ${id}`;
    return;
  }
  raw.spentUsd += CALL_RESERVE_USD; // reserve; corrected below
  const t0 = Date.now();
  let rec;
  try {
    const { result, usage } = await client.extract(unit.body);
    rec = { ok: result !== null, claims: result?.claims ?? null, usage, failure: result === null ? "max_tokens or no text" : null };
  } catch (err) {
    const usage = usageOfFailedCall(err);
    rec = { ok: false, claims: null, usage, failure: err instanceof ParseError ? `parse: ${err.reason}` : `error: ${String(err).slice(0, 200)}` };
  }
  rec.ms = Date.now() - t0;
  rec.costUsd = cost(cell.model, rec.usage);
  raw.spentUsd += rec.costUsd - CALL_RESERVE_USD;
  raw.calls[id] = rec;
  save();
}

async function pool(tasks, n) {
  const queue = [...tasks];
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (queue.length && !stopped) await queue.shift()();
    }),
  );
}

// ---- Phase 1: extraction ------------------------------------------------
for (let trial = 1; trial <= TRIALS && !stopped; trial++) {
  for (const cell of CELLS) {
    const client = clientFor(cell);
    await pool(units.map((u) => () => extractOne(cell, trial, u, client)), 4);
    console.log(`extract trial ${trial} ${cell.id}: spent $${raw.spentUsd.toFixed(2)}`);
    if (stopped) break;
  }
}

// ---- Phase 2: judge -------------------------------------------------------
const sources = [...new Set(units.map((u) => u.source))];
const sourceText = (s) => units.filter((u) => u.source === s).map((u) => u.text).join("\n\n---\n\n");
const claimsOf = (cellId, trial, s) =>
  units
    .filter((u) => u.source === s)
    .flatMap((u) => raw.calls[`${cellId}|${trial}|${u.key}`]?.claims ?? []);

const JUDGE_PROMPT = (src, ref, cand) => `You compare two sets of architectural claims extracted from the same source by the same extraction prompt.

SOURCE:
<<<
${src.slice(0, 24000)}
>>>

REFERENCE CLAIMS (A):
${JSON.stringify(ref.map((c) => ({ claim: c.claim, severity: c.severity })), null, 1)}

CANDIDATE CLAIMS (B):
${JSON.stringify(cand.map((c) => ({ claim: c.claim, severity: c.severity })), null, 1)}

Return only a JSON object, no prose:
{"coverage": <0..1, the fraction of A's distinct assertions that B also states, in any wording; 1 when A is empty and B has no unsupported claims>,
 "contradictions": <count of B claims that the SOURCE contradicts or does not support>}`;

async function judgeOne(key, ref, cand, src) {
  if (raw.judge[key]) return;
  if (raw.spentUsd + 0.08 > CAP) {
    stopped = `cap reached before judge ${key}`;
    return;
  }
  try {
    const resp = await anthropic.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: JUDGE_PROMPT(src, ref, cand) }],
    });
    const usage = { inputTokens: resp.usage.input_tokens, outputTokens: resp.usage.output_tokens };
    raw.spentUsd += cost(JUDGE_MODEL, usage);
    const text = resp.content.find((b) => b.type === "text")?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    raw.judge[key] = { coverage: Number(json.coverage), contradictions: Number(json.contradictions) };
  } catch (err) {
    raw.judge[key] = { error: String(err).slice(0, 200) };
  }
  save();
}

if (!stopped) {
  const tasks = [];
  for (const s of sources) {
    const ref = claimsOf("baseline", 1, s);
    const src = sourceText(s);
    for (const t of [2, 3]) tasks.push(() => judgeOne(`baseline|${t}|${s}`, ref, claimsOf("baseline", t, s), src));
    for (const cell of CELLS.slice(1)) {
      for (let t = 1; t <= TRIALS; t++) tasks.push(() => judgeOne(`${cell.id}|${t}|${s}`, ref, claimsOf(cell.id, t, s), src));
    }
  }
  await pool(tasks, 4);
  console.log(`judge done: spent $${raw.spentUsd.toFixed(2)}`);
}

// ---- Metrics --------------------------------------------------------------
const candidatesOf = (cellId, t, s) => new Set(claimsOf(cellId, t, s).flatMap((c) => c.symbol_candidates ?? []));
const metrics = {};
for (const cell of CELLS) {
  const calls = Object.entries(raw.calls).filter(([k]) => k.startsWith(`${cell.id}|`)).map(([, v]) => v);
  const judged = Object.entries(raw.judge).filter(([k, v]) => k.startsWith(`${cell.id}|`) && v.coverage !== undefined).map(([, v]) => v);
  const labeled = [];
  for (let t = 1; t <= TRIALS; t++) {
    for (const u of units.filter((x) => x.expectHard)) {
      const r = raw.calls[`${cell.id}|${t}|${u.key}`];
      if (r) labeled.push(Boolean(r.claims?.some((c) => c.severity === "hard")));
    }
  }
  // Candidate recall against the union of the OTHER baseline trials.
  const recalls = [];
  for (const s of sources) {
    for (let t = 1; t <= TRIALS; t++) {
      const ref = new Set();
      for (let bt = 1; bt <= TRIALS; bt++) if (!(cell.id === "baseline" && bt === t)) for (const c of candidatesOf("baseline", bt, s)) ref.add(c);
      if (ref.size === 0) continue;
      const got = candidatesOf(cell.id, t, s);
      recalls.push([...ref].filter((c) => got.has(c)).length / ref.size);
    }
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const severities = calls.flatMap((c) => c.claims ?? []).map((c) => c.severity);
  metrics[cell.id] = {
    model: cell.model,
    effort: cell.effort ?? "default",
    calls: calls.length,
    parseRate: calls.length ? calls.filter((c) => c.ok).length / calls.length : null,
    failures: calls.filter((c) => !c.ok).map((c) => c.failure),
    labeledSeverity: labeled.length ? `${labeled.filter(Boolean).length}/${labeled.length}` : null,
    coverage: mean(judged.map((j) => j.coverage)),
    contradictionsPerSource: mean(judged.map((j) => j.contradictions)),
    candidateRecall: mean(recalls),
    claimsPerCall: calls.length ? calls.reduce((n, c) => n + (c.claims?.length ?? 0), 0) / calls.length : null,
    severityMix: Object.fromEntries(["hard", "soft", "context"].map((s) => [s, severities.filter((x) => x === s).length])),
    costPerCallUsd: mean(calls.map((c) => c.costUsd)),
    outputTokensPerCall: mean(calls.map((c) => c.usage.outputTokens)),
    msPerCall: mean(calls.map((c) => c.ms)),
  };
}
const served = Object.fromEntries(Object.entries(servedBy).map(([k, v]) => [k, [...v]]));
writeFileSync(join(workdir, "metrics.json"), JSON.stringify({ spentUsd: raw.spentUsd, stopped, servedBy: served, metrics }, null, 2) + "\n");
console.log("served by:", JSON.stringify(served));
console.log(JSON.stringify({ spentUsd: Number(raw.spentUsd.toFixed(2)), stopped }, null, 0));
console.table(
  Object.fromEntries(
    Object.entries(metrics).map(([k, m]) => [
      k,
      {
        parse: m.parseRate?.toFixed(3),
        sev: m.labeledSeverity,
        cov: m.coverage?.toFixed(3),
        contra: m.contradictionsPerSource?.toFixed(2),
        recall: m.candidateRecall?.toFixed(3),
        "$/call": m.costPerCallUsd?.toFixed(4),
      },
    ]),
  ),
);
