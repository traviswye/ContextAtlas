/**
 * v0.4 Step 7.4 concrete query — exercises the contextatlas-on-itself
 * atlas with the LSP-adapter-readiness query proposed at Step 7
 * design lock. NO API spend (atlas queries are local-only).
 *
 * Discard after Step 7 ships.
 */
import { findByIntent } from "../dist/queries/find-by-intent.js";
import { buildBundle } from "../dist/queries/symbol-context.js";
import { openDatabase } from "../dist/storage/db.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = resolve(REPO_ROOT, ".contextatlas/index.db");

function header(t) {
  console.log(`\n${"=".repeat(70)}\n${t}\n${"=".repeat(70)}`);
}

async function main() {
  const db = openDatabase(DB_PATH);

  header("find_by_intent — 'LSP adapter readiness diagnostics'");
  const fbiResults = findByIntent(db, {
    query: "LSP adapter readiness diagnostics",
    limit: 8,
  });
  console.log(`Returned ${fbiResults.length} symbol matches\n`);
  for (const r of fbiResults) {
    const m = r.matchedIntent ?? {};
    console.log(`${r.name} (${r.kind}) @ ${r.path}:${r.line}`);
    console.log(`  matched intent source=${m.source ?? "?"} severity=${m.severity ?? "?"}`);
    console.log(`  claim: ${(m.claim ?? "").slice(0, 140)}`);
    console.log("");
  }

  header("get_symbol_context — waitForServerReady");
  // v0.5+ candidate #7 (tracked at Step 7 commit): buildBundle calls
  // adapter.getDiagnostics regardless of `signals` set. Intent-only
  // mode against the atlas should bypass adapter; today the call
  // throws when adapter is null. Step 7.4 query goal is validated via
  // the find_by_intent path above — that route demonstrates high
  // retrieval quality on the atlas without needing the substrate gap
  // resolved here.
  const bundle = await buildBundle(
    {
      db,
      adapter: null,
    },
    {
      symbol: "waitForServerReady",
      signals: ["intent"],
      limit: 8,
    },
  );
  if (!bundle) {
    console.log("(no bundle returned — symbol not resolved)");
  } else {
    console.log(`Symbol: ${bundle.symbol.name} (${bundle.symbol.kind})`);
    console.log(`Path:   ${bundle.symbol.path}:${bundle.symbol.line}`);
    console.log(`Intent claims attached: ${bundle.intent?.claims?.length ?? 0}`);
    if (bundle.intent?.claims) {
      for (const c of bundle.intent.claims.slice(0, 6)) {
        console.log(`  [${c.severity.padEnd(7)}] ${c.source.padEnd(40)}`);
        console.log(`    ${c.claim.slice(0, 140)}`);
      }
    }
  }

  db.close();
}

main().catch((err) => {
  console.error("QUERY FAILED:", err);
  process.exit(1);
});
