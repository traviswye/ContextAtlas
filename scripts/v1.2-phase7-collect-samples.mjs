#!/usr/bin/env node
/**
 * v1.2 Phase 7 calibration — sample collection (no model calls).
 *
 * Builds the fixed, Tier-1-sized sample the calibration harness runs
 * through the frozen EXTRACTION_PROMPT (v1.2-SCOPE Phase 7):
 *   - docstrings: per language, the first 3 non-test source files (sorted
 *     path order) with 1-4 documented exported symbols, read through the
 *     same adapters + readFileDocstrings as the CLI docstring stream;
 *   - ADRs: one per benchmark target plus one of ContextAtlas's own;
 *   - commits: the most recent filter-passing commit with a body, per repo.
 *
 * Usage: node scripts/v1.2-phase7-collect-samples.mjs <out.json>
 * Run `npm run build` first (imports dist/).
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

import { createAdapter } from "../dist/adapters/registry.js";
import { buildCommitExtractionBody, makeDefaultCommitFilter, parseCommitLog } from "../dist/extraction/commit-log.js";
import { readFileDocstrings } from "../dist/extraction/docstring-read.js";

const CODE = resolve("..");
const BENCH = join(CODE, "ContextAtlas-benchmarks");

const LANGS = [
  { lang: "typescript", repo: join(CODE, "hono"), dir: "src", ext: [".ts"], skip: /(\.test\.|\.spec\.|[\\/]test[\\/]|\.d\.ts$)/ },
  { lang: "python", repo: join(CODE, "httpx"), dir: "httpx", ext: [".py"], skip: /(test_|_test\.py|[\\/]tests?[\\/])/ },
  { lang: "go", repo: join(CODE, "cobra"), dir: ".", ext: [".go"], skip: /(_test\.go|[\\/]vendor[\\/]|[\\/]site[\\/])/ },
  { lang: "csharp", repo: join(CODE, "apis"), dir: ".", ext: [".cs"], skip: /([\\/](bin|obj|tests?|Tests?)[\\/]|\.Tests?[\\/]|Test\.cs$|Tests\.cs$|\.g\.cs$|Designer\.cs$|Migrations)/ },
];

const ADRS = [
  join(BENCH, "adrs", "hono", "ADR-03-onion-middleware-compose.md"),
  join(BENCH, "adrs", "httpx", "ADR-04-generator-based-auth-flow.md"),
  join(BENCH, "adrs", "cobra", "ADR-03-hook-lifecycle.md"),
  resolve("docs", "adr", "ADR-04-compact-output-default.md"),
];

const COMMIT_REPOS = [join(CODE, "hono"), join(CODE, "httpx"), join(CODE, "cobra"), resolve(".")];

function walk(dir, exts, skip, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, exts, skip, out);
    else if (exts.includes(extname(e.name)) && !skip.test(full)) out.push(full);
  }
  return out;
}

async function collectDocstrings({ lang, repo, dir, ext, skip }) {
  const adapter = createAdapter(lang, { initializeTimeoutMs: 180_000 });
  await adapter.initialize(repo);
  const files = walk(join(repo, dir), ext, skip).sort();
  const picked = [];
  try {
    for (const abs of files) {
      if (picked.length === 3) break;
      if (statSync(abs).size > 40_000) continue;
      let symbols;
      try {
        symbols = await adapter.listSymbols(abs);
      } catch {
        continue;
      }
      const read = await readFileDocstrings(adapter, symbols);
      if (read.errors.length > 0) continue;
      if (read.entries.length < 1 || read.entries.length > 4) continue;
      const rel = relative(repo, abs).split(sep).join("/");
      picked.push({
        lang,
        repo: repo.split(sep).pop(),
        path: rel,
        entries: read.entries.map((e) => ({
          symbol_id: e.symbolId,
          docstring: e.docstring,
          deprecated: /deprecated/i.test(e.docstring),
        })),
      });
      process.stderr.write(`  ${lang}: ${rel} (${read.entries.length})\n`);
    }
  } finally {
    await adapter.shutdown();
  }
  return picked;
}

function collectCommit(repo) {
  const commits = parseCommitLog(repo, makeDefaultCommitFilter([]));
  const c = commits.find((x) => x.body.trim().length > 40) ?? commits[0];
  return c ? { repo: repo.split(sep).pop(), sha: c.sha, subject: c.subject, body: buildCommitExtractionBody(c) } : null;
}

const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/v1.2-phase7-collect-samples.mjs <out.json>");
  process.exit(2);
}
const docstringFiles = [];
for (const l of LANGS) {
  process.stderr.write(`docstrings: ${l.lang} (${l.repo})\n`);
  docstringFiles.push(...(await collectDocstrings(l)));
}
const adrs = ADRS.map((p) => ({ path: relative(CODE, p).split(sep).join("/"), body: readFileSync(p, "utf8") }));
const commits = COMMIT_REPOS.map(collectCommit).filter(Boolean);
const sample = { generated_at: new Date().toISOString(), docstringFiles, adrs, commits };
writeFileSync(out, JSON.stringify(sample, null, 2) + "\n");
const calls = docstringFiles.reduce((n, f) => n + f.entries.length, 0) + adrs.length + commits.length;
console.log(`sample: ${docstringFiles.length} docstring files, ${adrs.length} ADRs, ${commits.length} commits; ${calls} calls per cell-trial`);
