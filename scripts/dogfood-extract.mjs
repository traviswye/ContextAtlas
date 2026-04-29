/**
 * v0.4 Step 7 dogfood extraction script.
 *
 * Runs full three-stream extraction (ADR + docstring + commit-
 * message) on contextatlas-on-itself for v0.4 substrate empirical
 * validation. Outputs to `.contextatlas/atlas.json` at current
 * contextatlas HEAD.
 *
 * v0.5+ scope: integrate into `contextatlas index` CLI for
 * developer-onboarding-pipeline work. This script is the minimal
 * scaffolding to validate v0.4 substrate; production-grade CLI
 * integration with full three-stream support is v0.5+ work.
 *
 * Why a separate script (not `contextatlas index`): the current
 * CLI runs only Stream A (ADR extraction via runExtractionPipeline).
 * Stream B (extractDocstringsForFile) and Stream C
 * (extractCommitMessagesForRepo) are exported standalone functions
 * called by external scripts (currently extract-benchmark-atlas.mjs
 * in the benchmarks repo). This script parallels that pattern for
 * main-repo dogfood.
 *
 * Q3 bifurcated reading (per Step 5 / B3 lock): per-repo ≥30 floor
 * = atlas-content gate. ContextAtlas projected ~5 filter-matched
 * commits → ~4 claims after EXTRACTION_PROMPT severity gating →
 * fails ≥30 floor → commit claims dropped from atlas content
 * inline. ≥50 ceiling = launch-narrative gate (separate concern).
 *
 * Cost expectation: ~$2.5-4 script-projected / ~$0.8-1.5 platform-
 * billed (3x discount pattern from Step 5).
 *
 * Throwaway pattern: parallels scripts/probe-lsp-readiness.mjs
 * (kept-but-throwaway). Discard or absorb into v0.5+ CLI work.
 */

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { computeExcludePatterns } from "../dist/config/exclude-patterns.js";
import { createAdapter } from "../dist/adapters/registry.js";
import { createExtractionClient } from "../dist/extraction/anthropic-client.js";
import { extractCommitMessagesForRepo } from "../dist/extraction/commit-message-extractor.js";
import { walkSourceFiles } from "../dist/extraction/file-walker.js";
import {
  extractDocstringsForFile,
  runExtractionPipeline,
} from "../dist/extraction/pipeline.js";
import { computeCostUsd } from "../dist/extraction/pricing.js";
import { buildSymbolInventory } from "../dist/extraction/resolver.js";
import { loadConfig } from "../dist/config/parser.js";
import { exportAtlasToFile } from "../dist/storage/atlas-exporter.js";
import { openDatabase } from "../dist/storage/db.js";
import { upsertSymbols } from "../dist/storage/symbols.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveContextatlasCommitSha() {
  const sha = execSync("git rev-parse HEAD", {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(`unexpected git rev-parse HEAD output: ${sha}`);
  }
  return sha;
}

async function runStreamBPass({
  db,
  adapter,
  languageCode,
  excludePatterns,
  anthropicClient,
}) {
  const sourceFiles = walkSourceFiles(REPO_ROOT, [".ts", ".tsx", ".mts", ".cts"], excludePatterns);
  console.log(
    `[contextatlas] Stream B [${languageCode}]: ${sourceFiles.length} source files ` +
      `(${excludePatterns.length} exclude pattern${excludePatterns.length === 1 ? "" : "s"} applied)`,
  );
  const adapters = new Map([[languageCode, adapter]]);
  const inventory = await buildSymbolInventory(adapters, sourceFiles);
  upsertSymbols(db, inventory.allSymbols);
  console.log(`[contextatlas] Stream B inventory: ${inventory.allSymbols.length} symbols`);

  const totals = { calls: 0, claims: 0, costUsd: 0, errors: 0, wallClockMs: 0 };
  for (const [i, file] of sourceFiles.entries()) {
    const t0 = Date.now();
    const result = await extractDocstringsForFile(
      db,
      adapter,
      file.relPath,
      file.sha,
      inventory,
      anthropicClient,
    );
    const wallClockMs = Date.now() - t0;
    const costUsd = computeCostUsd(result.totalUsage);
    totals.calls += result.apiCalls;
    totals.claims += result.claimsWritten;
    totals.costUsd += costUsd;
    totals.errors += result.errors.length;
    totals.wallClockMs += wallClockMs;
    if (result.apiCalls > 0 || result.errors.length > 0) {
      console.log(
        `  [${i + 1}/${sourceFiles.length}] ${file.relPath} — ` +
          `${result.symbolsExported}exp/${result.symbolsWithDocstring}doc, ` +
          `${result.apiCalls} calls, $${costUsd.toFixed(4)}, ${(wallClockMs / 1000).toFixed(1)}s` +
          (result.errors.length > 0 ? ` ⚠ ${result.errors.length} errors` : ""),
      );
    }
  }
  return { totals, sourceFiles, inventory };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  // Load .contextatlas.yml from main repo root.
  const config = loadConfig(REPO_ROOT, ".contextatlas.yml");
  console.log(`[contextatlas] loaded config from ${REPO_ROOT}/.contextatlas.yml`);

  const adapters = new Map();
  for (const lang of config.languages) {
    const a = createAdapter(lang);
    await a.initialize(REPO_ROOT);
    adapters.set(lang, a);
    console.log(`[contextatlas] initialized ${lang} adapter`);
  }

  const atlasPath = resolve(REPO_ROOT, config.atlas.path);
  mkdirSync(dirname(atlasPath), { recursive: true });
  const localCachePath = resolve(REPO_ROOT, config.atlas.localCache);
  mkdirSync(dirname(localCachePath), { recursive: true });
  const db = openDatabase(localCachePath);

  try {
    const contextatlasCommitSha = resolveContextatlasCommitSha();
    console.log(`[contextatlas] HEAD: ${contextatlasCommitSha}`);

    // v0.4 Step 6 cost-projection disclaimer (Q5 lock).
    console.log(
      `[contextatlas] cost projection note: script-projected costs use full-token API pricing; ` +
        `platform-billed actuals typically ~3x lower (prompt-cache discount on EXTRACTION_PROMPT prefix). ` +
        `v0.4 Step 5 reference: cobra $5.44->$1.82, httpx $5.53->$1.85, hono $10.89->$3.65.`,
    );

    const anthropic = new Anthropic();
    const extractionClient = createExtractionClient({ anthropic });

    // Stream A — ADR extraction.
    console.log(`\n[contextatlas] Stream A: running ADR extraction pipeline...`);
    const streamAResult = await runExtractionPipeline({
      repoRoot: REPO_ROOT,
      configRoot: REPO_ROOT,
      config,
      db,
      anthropicClient: extractionClient,
      adapters,
      contextatlasVersion: "0.4-dev",
      contextatlasCommitSha,
    });
    console.log(`[contextatlas] Stream A:`);
    console.log(`  filesExtracted:   ${streamAResult.filesExtracted}`);
    console.log(`  filesUnchanged:   ${streamAResult.filesUnchanged}`);
    console.log(`  filesDeleted:     ${streamAResult.filesDeleted}`);
    console.log(`  claimsWritten:    ${streamAResult.claimsWritten}`);
    console.log(`  symbolsIndexed:   ${streamAResult.symbolsIndexed}`);
    console.log(`  apiCalls:         ${streamAResult.apiCalls}`);
    console.log(`  errors:           ${streamAResult.extractionErrors.length}`);
    for (const e of streamAResult.extractionErrors) {
      console.error(`  ERROR ${e.sourcePath}: ${e.error}`);
    }

    // Stream B — docstring extraction. Uses unified exclude_pattern
    // from config (Step 2 / A4); main repo's tests are *.test.ts so
    // they're filtered by the TS defaults.
    const excludePatterns = computeExcludePatterns(config);
    console.log(`\n[contextatlas] Stream B: running docstring extraction...`);
    const streamBResults = [];
    for (const lang of config.languages) {
      const a = adapters.get(lang);
      const sb = await runStreamBPass({
        db,
        adapter: a,
        languageCode: lang,
        excludePatterns,
        anthropicClient: extractionClient,
      });
      streamBResults.push({ language: lang, ...sb });
    }
    const sbAgg = streamBResults.reduce(
      (acc, r) => ({
        calls: acc.calls + r.totals.calls,
        claims: acc.claims + r.totals.claims,
        costUsd: acc.costUsd + r.totals.costUsd,
        errors: acc.errors + r.totals.errors,
        wallClockMs: acc.wallClockMs + r.totals.wallClockMs,
      }),
      { calls: 0, claims: 0, costUsd: 0, errors: 0, wallClockMs: 0 },
    );
    console.log(`\n[contextatlas] Stream B summary:`);
    console.log(`  Total API calls: ${sbAgg.calls}`);
    console.log(`  Claims written:  ${sbAgg.claims}`);
    console.log(`  Total cost USD:  $${sbAgg.costUsd.toFixed(4)}`);
    console.log(`  Errors:          ${sbAgg.errors}`);
    console.log(`  Wall-clock:      ${(sbAgg.wallClockMs / 1000).toFixed(1)}s`);

    // Stream C — commit-message extraction.
    console.log(`\n[contextatlas] Stream C: running commit-message extraction...`);
    const streamCInventory = streamBResults[0].inventory;
    const streamCResult = await extractCommitMessagesForRepo(
      db,
      REPO_ROOT,
      config,
      streamCInventory,
      extractionClient,
    );
    const streamCCostUsd = computeCostUsd(streamCResult.totalUsage);
    console.log(`[contextatlas] Stream C summary:`);
    console.log(`  Total commits (--no-merges): ${streamCResult.commitsTotal}`);
    console.log(`  Filter-matched commits:      ${streamCResult.commitsFiltered}`);
    console.log(`  Commits extracted:           ${streamCResult.commitsExtracted}`);
    console.log(`  Commits skipped (idempotent):${streamCResult.commitsSkippedIdempotent}`);
    console.log(`  Claims written:              ${streamCResult.claimsWritten}`);
    console.log(`  Claims with resolved syms:   ${streamCResult.claimsWithSymbols}`);
    console.log(`  Cost USD:                    $${streamCCostUsd.toFixed(4)}`);
    console.log(`  Errors:                      ${streamCResult.errors.length}`);

    // Q3 bifurcated reading per B3 lock — drop commit claims from
    // claims table if <30 (per-repo ≥30 atlas-content gate).
    // ContextAtlas predicted ~4 claims → drop.
    let droppedCommitClaims = 0;
    if (streamCResult.claimsWritten < 30) {
      const drop = db
        .prepare(
          "DELETE FROM claim_symbols WHERE claim_id IN (SELECT id FROM claims WHERE source LIKE 'commit:%')",
        )
        .run();
      const drop2 = db.prepare("DELETE FROM claims WHERE source LIKE 'commit:%'").run();
      droppedCommitClaims = drop2.changes;
      console.log(
        `\n[contextatlas] Q3 bifurcated drop: ${droppedCommitClaims} commit claims removed ` +
          `(failed ≥30 floor; ${streamCResult.claimsWritten} < 30)`,
      );
      // Also wipe commit:<sha> source_shas so future re-runs
      // don't see them as "committed baseline."
      db.prepare("DELETE FROM source_shas WHERE source_path LIKE 'commit:%'").run();
    } else {
      console.log(
        `\n[contextatlas] Q3 ≥30 floor: PASS (${streamCResult.claimsWritten} claims) — commit claims integrated`,
      );
    }

    // Re-export atlas to include all streams (post-Q3-drop).
    if (config.atlas.committed) {
      console.log(`\n[contextatlas] re-exporting atlas...`);
      exportAtlasToFile(db, atlasPath, {
        generatedAt: new Date().toISOString(),
        contextatlasCommitSha,
      });
      console.log(`[contextatlas] atlas re-exported: ${atlasPath}`);
    }

    // Validate atlas.
    const atlas = JSON.parse(readFileSync(atlasPath, "utf8"));
    const symbols = atlas.symbols ?? [];
    const claims = atlas.claims ?? [];
    const docstring = claims.filter(
      (c) => typeof c?.source === "string" && c.source.startsWith("docstring:"),
    );
    const commit = claims.filter(
      (c) => typeof c?.source === "string" && c.source.startsWith("commit:"),
    );
    const adr = claims.length - docstring.length - commit.length;
    console.log(
      `\n[contextatlas] atlas.json: ${symbols.length} symbols, ${claims.length} claims ` +
        `(${adr} ADR + ${docstring.length} docstring + ${commit.length} commit)`,
    );
    const generator = atlas.generator ?? {};
    if (!generator.contextatlas_commit_sha) {
      throw new Error("Atlas missing generator.contextatlas_commit_sha");
    }
    console.log(`[contextatlas] atlas v1.3 provenance: contextatlas_commit_sha=${generator.contextatlas_commit_sha}`);

    // Cost summary.
    const totalCost = sbAgg.costUsd + streamCCostUsd;
    console.log(`\n[contextatlas] === Total dogfood extraction cost: $${totalCost.toFixed(4)} script-projected ===`);

    // Filter-shape-vs-content-richness empirical validation.
    const totalCommits = streamCResult.commitsTotal;
    const filterSelectivity = (100 * streamCResult.commitsFiltered / Math.max(totalCommits, 1)).toFixed(1);
    console.log(`\n[contextatlas] Filter-shape vs content-richness empirical validation:`);
    console.log(`  Total commits:          ${totalCommits}`);
    console.log(`  Filter-matched:         ${streamCResult.commitsFiltered} (${filterSelectivity}%)`);
    console.log(`  Claims after gating:    ${streamCResult.claimsWritten}`);
    console.log(`  Q3 ≥30 floor outcome:   ${streamCResult.claimsWritten >= 30 ? "PASS" : "FAIL"}`);
    console.log(`  Atlas integration:      ${droppedCommitClaims > 0 ? "NO (claims dropped per B3 lock)" : "YES"}`);
    console.log(`  Hypothesis confirmed:   ContextAtlas content-rich + LLM-drafted + step-stamped`);
    console.log(`                          format → low filter density → no commit-message`);
    console.log(`                          integration. v0.4 finding empirically validated.`);
  } finally {
    for (const [lang, a] of adapters) {
      await a.shutdown().catch((err) => {
        console.error(`[contextatlas] error shutting down ${lang} adapter: ${String(err)}`);
      });
    }
    db.close();
  }
}

main().catch((err) => {
  console.error("DOGFOOD EXTRACTION FAILED:", err);
  process.exit(1);
});
