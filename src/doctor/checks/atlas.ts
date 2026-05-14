/**
 * Atlas-category doctor checks.
 *
 * Investigates atlas.json existence, parsing, schema version,
 * symbol/claim presence, and v1.3 provenance fields. Requires
 * `ctx.config` to be non-null (atlas.path lives in config); the
 * runner gates this category in limited mode.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { SUPPORTED_ATLAS_VERSIONS } from "../../storage/types.js";
import type { CheckContext, DoctorCheck } from "../types.js";

export function atlasChecks(ctx: CheckContext): DoctorCheck[] {
  const out: DoctorCheck[] = [];
  const config = ctx.config;
  if (config === null) return out; // Limited mode; runner gates entry.

  const atlasPath = pathResolve(ctx.repoRoot, config.atlas.path);

  // 1. atlas.exists
  if (!existsSync(atlasPath)) {
    // FO-7 fix part 2 (v0.7 Step 2.2.d Option iii hybrid): when
    // doctor runs as init's first-run gate-check, missing atlas.json
    // is the expected pre-extraction state for cold-start users, NOT
    // a broken-post-extraction state. Downgrade FAIL → WARN with a
    // first-run-aware message. Standalone doctor invocations
    // preserve FAIL semantics (atlas absent after extraction has
    // happened IS worth surfacing).
    out.push({
      id: "atlas.exists",
      category: "atlas",
      status: ctx.firstRun === true ? "warn" : "fail",
      message:
        ctx.firstRun === true
          ? `atlas.json not yet created at ${config.atlas.path} (expected at first-run; run \`contextatlas index\` or \`contextatlas generate-adrs\` to produce it)`
          : `atlas.json not found at ${config.atlas.path}`,
      detail:
        ctx.firstRun === true
          ? "Cold-start state — atlas substrate is produced by `contextatlas index` (or by `contextatlas generate-adrs` followed by `contextatlas index`). Init completes without it; downstream commands create the atlas as part of their substantive work."
          : "Run extraction (`contextatlas index` for ADR-only, or scripts/dogfood-extract.mjs for full v0.4 substrate) to produce the atlas.",
    });
    return out;
  }
  out.push({
    id: "atlas.exists",
    category: "atlas",
    status: "pass",
    message: config.atlas.path,
  });

  // 2. atlas.parses
  let atlas: Record<string, unknown> | null = null;
  try {
    atlas = JSON.parse(readFileSync(atlasPath, "utf8")) as Record<string, unknown>;
  } catch (err) {
    out.push({
      id: "atlas.parses",
      category: "atlas",
      status: "fail",
      message: "atlas.json is not valid JSON",
      detail: err instanceof Error ? err.message : String(err),
    });
    return out;
  }
  out.push({
    id: "atlas.parses",
    category: "atlas",
    status: "pass",
    message: "JSON valid",
  });

  // 3. atlas.schema_version_compatible
  // Atlas envelope shape (per atlas-exporter): top-level `version`
  // is the schema version string ("1.3" etc.); top-level
  // `generated_at` carries timestamp; `generator` block carries
  // tool provenance (contextatlas_commit_sha, contextatlas_version,
  // extraction_model).
  const generator = (atlas.generator ?? {}) as Record<string, unknown>;
  const schemaVersion =
    typeof atlas.version === "string" ? (atlas.version as string) : null;
  const supported = (SUPPORTED_ATLAS_VERSIONS as readonly string[]).includes(
    schemaVersion ?? "",
  );
  out.push({
    id: "atlas.schema_version_compatible",
    category: "atlas",
    status: supported ? "pass" : "fail",
    message: schemaVersion
      ? supported
        ? `${schemaVersion} (supported: ${SUPPORTED_ATLAS_VERSIONS.join(", ")})`
        : `${schemaVersion} (not in supported list: ${SUPPORTED_ATLAS_VERSIONS.join(", ")})`
      : "atlas missing schema version field",
    ...(supported ? {} : {
      detail:
        "Re-run extraction with the current contextatlas binary to regenerate at the supported schema version.",
    }),
  });

  // 4. atlas.has_symbols
  const symbols = Array.isArray(atlas.symbols) ? atlas.symbols : [];
  out.push({
    id: "atlas.has_symbols",
    category: "atlas",
    status: symbols.length > 0 ? "pass" : "fail",
    message: `${symbols.length} symbols`,
    ...(symbols.length === 0
      ? {
          detail:
            "Atlas has zero symbols; extraction may have failed silently. Re-run with --verbose to investigate.",
        }
      : {}),
  });

  // 5. atlas.has_claims
  const claims = Array.isArray(atlas.claims) ? atlas.claims : [];
  const docstringClaims = claims.filter(
    (c) =>
      c &&
      typeof c === "object" &&
      "source" in c &&
      typeof (c as { source: unknown }).source === "string" &&
      ((c as { source: string }).source as string).startsWith("docstring:"),
  ).length;
  const commitClaims = claims.filter(
    (c) =>
      c &&
      typeof c === "object" &&
      "source" in c &&
      typeof (c as { source: unknown }).source === "string" &&
      ((c as { source: string }).source as string).startsWith("commit:"),
  ).length;
  const adrClaims = claims.length - docstringClaims - commitClaims;
  out.push({
    id: "atlas.has_claims",
    category: "atlas",
    status: claims.length > 0 ? "pass" : "fail",
    message:
      claims.length > 0
        ? `${claims.length} claims (${adrClaims} ADR + ${docstringClaims} docstring + ${commitClaims} commit)`
        : "atlas has zero claims",
    ...(claims.length === 0
      ? { detail: "Re-run extraction; ADR files + docstrings + commit messages should produce claims." }
      : {}),
  });

  // 6. atlas.provenance_complete (v1.3+)
  // Provenance lives partly on top-level (generated_at,
  // extracted_at_sha) and partly under `generator`
  // (contextatlas_commit_sha). Both surfaces required for
  // complete v1.3 provenance.
  const sha = generator.contextatlas_commit_sha;
  const generatedAt = atlas.generated_at;
  const missingFields: string[] = [];
  if (typeof sha !== "string" || sha.length === 0) {
    missingFields.push("generator.contextatlas_commit_sha");
  }
  if (typeof generatedAt !== "string" || generatedAt.length === 0) {
    missingFields.push("generated_at");
  }
  const provenanceOk = missingFields.length === 0;
  out.push({
    id: "atlas.provenance_complete",
    category: "atlas",
    status: provenanceOk ? "pass" : "warn",
    message: provenanceOk
      ? `contextatlas_commit_sha=${(sha as string).slice(0, 12)}`
      : `missing provenance field${missingFields.length === 1 ? "" : "s"}: ${missingFields.join(", ")}`,
    ...(provenanceOk
      ? {}
      : {
          detail:
            "Atlas may be from an older extractor; re-run extraction with current contextatlas to populate v1.3 provenance.",
        }),
  });

  // 7. atlas.bm25_recommendation (v0.8 Ship 4b; per ADR-16 v0.7.3
  // activation amendment). Advises whether to enable
  // `mcp.symbol_context_bm25` based on atlas claim density. BM25
  // ranking on get_symbol_context materially diverges from the v0.2
  // severity-then-source ordering only when symbols carry enough
  // attached claims that top-5 must SELECT from a longer pool —
  // empirically validated at v0.8 Ship 4a dogfood (hono v0.8-cli
  // atlas: 4/4 densely-attached symbols showed top-5 reorder under
  // BM25=on; ≤5 claims attached → reorder is invisible because all
  // claims surface anyway). Threshold ≥6 claims per any single
  // symbol per ADDENDUM AJ Option A lock.
  out.push(bm25RecommendationCheck(claims, ctx));

  return out;
}

// ---------------------------------------------------------------------------
// BM25 recommendation helper (v0.8 Ship 4b)
// ---------------------------------------------------------------------------

const BM25_RECOMMENDATION_THRESHOLD = 6;

interface MinimalClaimShape {
  readonly symbol_ids?: unknown;
}

/**
 * Compute per-symbol attached-claims counts from the atlas claim
 * array. Each claim's `symbol_ids` is an array of symbol-ID strings;
 * a claim contributes +1 to each of its referenced symbols. Returns
 * (totalClaims, qualifyingSymbols, maxCount, maxSymbol) where
 * `qualifyingSymbols` is the count of symbols meeting
 * BM25_RECOMMENDATION_THRESHOLD.
 *
 * Exported for direct unit testing — keeps the recommendation
 * logic and the counting logic separately verifiable.
 */
export function computeBM25DensitySignal(claims: readonly unknown[]): {
  totalClaims: number;
  perSymbolCount: ReadonlyMap<string, number>;
  qualifyingSymbols: number;
  maxCount: number;
  maxSymbol: string | null;
} {
  const perSymbol = new Map<string, number>();
  for (const c of claims) {
    if (!c || typeof c !== "object") continue;
    const ids = (c as MinimalClaimShape).symbol_ids;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id !== "string") continue;
      perSymbol.set(id, (perSymbol.get(id) ?? 0) + 1);
    }
  }
  let maxCount = 0;
  let maxSymbol: string | null = null;
  let qualifyingSymbols = 0;
  for (const [sym, n] of perSymbol) {
    if (n > maxCount) {
      maxCount = n;
      maxSymbol = sym;
    }
    if (n >= BM25_RECOMMENDATION_THRESHOLD) qualifyingSymbols++;
  }
  return {
    totalClaims: claims.length,
    perSymbolCount: perSymbol,
    qualifyingSymbols,
    maxCount,
    maxSymbol,
  };
}

/**
 * Build the doctor check that advises on `mcp.symbol_context_bm25`
 * enablement. Four outcome shapes per ADDENDUM AJ:
 *
 *   - flag-on  + dense → PASS (already enabled at density that benefits)
 *   - flag-on  + sparse → PASS with note (enabled but density below threshold)
 *   - flag-off + dense → WARN with RECOMMEND ENABLE message
 *   - flag-off + sparse → PASS with SKIP rationale
 *
 * Exported for direct unit testing without going through the full
 * atlasChecks orchestrator.
 */
export function bm25RecommendationCheck(
  claims: readonly unknown[],
  ctx: CheckContext,
): DoctorCheck {
  const signal = computeBM25DensitySignal(claims);
  const bm25Enabled = ctx.config?.mcp?.symbolContextBM25 === true;
  const dense = signal.qualifyingSymbols > 0;
  const totalClaims = signal.totalClaims;

  if (bm25Enabled && dense) {
    return {
      id: "atlas.bm25_recommendation",
      category: "atlas",
      status: "pass",
      message:
        `mcp.symbol_context_bm25 enabled; atlas density supports it ` +
        `(${signal.qualifyingSymbols} symbol(s) with ≥${BM25_RECOMMENDATION_THRESHOLD} claims; ` +
        `max=${signal.maxCount} on ${signal.maxSymbol})`,
    };
  }
  if (bm25Enabled && !dense) {
    return {
      id: "atlas.bm25_recommendation",
      category: "atlas",
      status: "pass",
      message:
        `mcp.symbol_context_bm25 enabled (atlas total: ${totalClaims} claims; ` +
        `no symbol has ≥${BM25_RECOMMENDATION_THRESHOLD} attached)`,
      detail:
        "BM25 is active but reordering is invisible at this substrate density — " +
        "top-5 bundle surfaces every attached claim regardless of ranking choice. " +
        "Effect becomes substantive once any symbol accumulates ≥6 claims.",
    };
  }
  if (!bm25Enabled && dense) {
    return {
      id: "atlas.bm25_recommendation",
      category: "atlas",
      status: "warn",
      message:
        `RECOMMEND enable mcp.symbol_context_bm25 ` +
        `(atlas has ${totalClaims} claims; ${signal.qualifyingSymbols} symbol(s) ` +
        `with ≥${BM25_RECOMMENDATION_THRESHOLD} claims attached; ` +
        `max=${signal.maxCount} on ${signal.maxSymbol})`,
      detail:
        "BM25 ranking is functional at v0.7.3 and substantively improves retrieval " +
        "on densely-attached symbols. Enable by adding to your config:\n" +
        "          mcp:\n" +
        "            symbol_context_bm25: true\n" +
        "        See ADR-16 for behavioral details (synthesis-vs-severity-first tradeoff at flag-on).",
    };
  }
  // !bm25Enabled && !dense → SKIP
  return {
    id: "atlas.bm25_recommendation",
    category: "atlas",
    status: "pass",
    message:
      `mcp.symbol_context_bm25 not recommended at this density ` +
      `(atlas has ${totalClaims} claims; no symbol has ≥${BM25_RECOMMENDATION_THRESHOLD} attached)`,
    detail:
      "BM25 available but unlikely to substantively improve retrieval — severity-then-source " +
      "ordering already surfaces all attached claims per bundle.",
  };
}
