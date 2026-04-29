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
    out.push({
      id: "atlas.exists",
      category: "atlas",
      status: "fail",
      message: `atlas.json not found at ${config.atlas.path}`,
      detail:
        "Run extraction (`contextatlas index` for ADR-only, or scripts/dogfood-extract.mjs for full v0.4 substrate) to produce the atlas.",
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

  return out;
}
