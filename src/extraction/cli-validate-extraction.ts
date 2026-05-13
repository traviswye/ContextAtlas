/**
 * CLI glue for the `contextatlas validate-extraction` subcommand
 * (v0.7.1 Step 1.1.b.0 + Q1.1.G.α — substrate-equivalence closure
 * mechanical floor at /index-atlas Skill surface per Path D
 * architecture).
 *
 * Parallel pattern to cli-validate-adrs.ts (v0.7 Step 2.3.c.0 closure
 * for generate-adrs Skill surface). Closes v0.8 Step 1.1.b empirical
 * falsification of v0.7 Step 2.3.b.0 substrate-equivalence claim by
 * adding a mechanical depth-floor + coverage gate at the CLI
 * boundary.
 *
 * Reads atlas.json (per config.atlas.path) and validates against
 * extraction-quality invariants distinct from shape (validate-atlas
 * canonical schema; runs upstream) and distinct from depth-of-ADR-
 * authoring (validate-adrs; ADR shape):
 *
 *   1. adr_claims_present — atlas has ≥ 1 claim with
 *      `source.startsWith("adr:")`. An atlas with zero ADR claims
 *      is structurally empty (failed extraction at the canonical
 *      load-bearing source).
 *
 *   2. adr_depth_floor — per ADR source, claim count ≥ 8.
 *      Calibration substrate (v0.8 Stage 2.a CLI empirical at three
 *      reference repos): hono 154/12=12.83, httpx 130/10=13.00,
 *      cobra 132/11=12.00 → mean 12.6 → conservative floor at ~64%
 *      = 8. Per-ADR floor (not aggregate) catches shallow extraction
 *      at any single ADR, mirroring the per-cell pattern Phase-9
 *      methodology surfaced.
 *
 *   3. source_coverage — for each entry in source_shas, ≥ 1 claim
 *      has matching source_path. A source in source_shas with 0
 *      claims indicates silent extraction failure at that source
 *      (the Skill walked the source registry but produced no
 *      claims). Catches the v0.8 Step 1.1.b Stream B + Stream C
 *      regression pattern under Phase A iteration discipline (if
 *      SKILL.md Phase A correctly populates source_shas via
 *      list-extraction-sources, Phase B is mechanically obligated
 *      to produce claims per source).
 *
 * Per-stream coverage at Phase B iteration is the SKILL.md substrate
 * concern (not validator domain) — if Phase A skips a stream
 * entirely, source_shas reflects the skip and source_coverage check
 * cannot detect it from atlas alone. Phase A iteration discipline
 * is enforced at SKILL.md scaffolding level (mandatory before
 * Phase B). Per-stream-coverage validator extension is a v0.8+
 * candidate if empirical evidence surfaces Phase A bypass under
 * Path D substrate.
 *
 * Used as MANDATORY GATE (Phase C extended) in /index-atlas Skill
 * workflow after validate-atlas + before resolve-symbols. Mechanical
 * floor for substrate-equivalence claim per v0.7.1 ADR-02 amendment
 * §index-atlas substrate-equivalence closure.
 *
 * Exit codes:
 *   0 — atlas passes all extraction-quality invariants
 *   2 — one or more invariants fail; structured remediation to
 *       stderr with per-invariant guidance
 */

import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { loadConfig } from "../config/parser.js";

export type ValidateExtractionExitCode = 0 | 2;

export interface ValidateExtractionCliOptions {
  configRoot: string;
  configFile: string | null;
  /** Test seam: stdout writer. */
  writeStdout?: (chunk: string) => void;
  /** Test seam: stderr writer. */
  writeStderr?: (chunk: string) => void;
}

export interface ValidateExtractionCliResult {
  exitCode: ValidateExtractionExitCode;
  errors: readonly string[];
}

/**
 * Per-ADR claims-count floor. Calibration substrate from v0.8 Stage
 * 2.a CLI empirical at three reference repos:
 *   - hono   154 ADR claims / 12 ADRs = 12.83 claims/ADR
 *   - httpx  130 ADR claims / 10 ADRs = 13.00 claims/ADR
 *   - cobra  132 ADR claims / 11 ADRs = 12.00 claims/ADR
 *   - mean   ~12.6 claims/ADR
 * Conservative threshold at ~64% of mean = 8 claims/ADR. Catches
 * the ~3x depth gap empirically observed at v0.8 Step 1.1.b Skill
 * extraction (52 ADR claims / 12 ADRs = 4.3 claims/ADR at hono)
 * while leaving headroom for genuinely sparse ADRs.
 */
export const PER_ADR_CLAIMS_FLOOR = 8;

/**
 * Atlas shape we read for extraction-quality validation. Intentionally
 * minimal — full canonical AtlasFileV1 shape validation is the
 * concern of `validate-atlas` (run upstream as workflow Phase C step
 * 1). This validator presumes the atlas has already validated shape.
 */
export interface AtlasForValidation {
  readonly version?: unknown;
  readonly source_shas?: Record<string, string>;
  readonly claims?: ReadonlyArray<{
    readonly source?: string;
    readonly source_path?: string;
  }>;
}

/**
 * Run the validate-extraction subcommand. Never throws — all error
 * paths map to exit codes + structured remediation.
 */
export async function runValidateExtractionSubcommand(
  options: ValidateExtractionCliOptions,
): Promise<ValidateExtractionCliResult> {
  const writeStdout =
    options.writeStdout ?? ((chunk) => process.stdout.write(chunk));
  const writeStderr =
    options.writeStderr ?? ((chunk) => process.stderr.write(chunk));

  let config;
  try {
    config = options.configFile
      ? loadConfig(options.configRoot, options.configFile)
      : loadConfig(options.configRoot);
  } catch (err) {
    writeStderr(
      `validate-extraction: failed to load config: ${String(err)}\n`,
    );
    return { exitCode: 2, errors: [] };
  }

  const atlasPath = pathResolve(options.configRoot, config.atlas.path);
  let atlas: AtlasForValidation;
  try {
    const raw = readFileSync(atlasPath, "utf8");
    atlas = JSON.parse(raw) as AtlasForValidation;
  } catch (err) {
    writeStderr(
      `validate-extraction: failed to read atlas at ${config.atlas.path}: ${String(err)}\n` +
        `\n` +
        `Run \`/index-atlas\` (Skill) or \`contextatlas index\` (CLI) first to ` +
        `produce the atlas. validate-extraction runs after extraction, not before.\n`,
    );
    return { exitCode: 2, errors: [] };
  }

  const errors = validateExtractionShape(atlas);
  if (errors.length === 0) {
    const claimsCount = atlas.claims?.length ?? 0;
    const sourcesCount = atlas.source_shas
      ? Object.keys(atlas.source_shas).length
      : 0;
    writeStdout(
      `validate-extraction: atlas at ${config.atlas.path} conforms to canonical ` +
        `extraction-quality invariants (${claimsCount} claims across ${sourcesCount} sources).\n`,
    );
    return { exitCode: 0, errors: [] };
  }

  writeStderr(
    `validate-extraction: atlas at ${config.atlas.path} fails ${errors.length} extraction-quality invariant${errors.length === 1 ? "" : "s"}.\n` +
      `\n` +
      `Specific remediation:\n\n`,
  );
  for (const err of errors) {
    writeStderr(`  - ${err}\n`);
  }
  writeStderr(
    `\n` +
      `Re-run \`/index-atlas\` (Skill) or \`contextatlas index\` (CLI) per the\n` +
      `canonical workflow. Skills users: confirm Phase A iteration walked all\n` +
      `expected streams via \`contextatlas list-extraction-sources\` (ADRs +\n` +
      `source-file docstrings + filtered commits) and that Phase B iterated the\n` +
      `manifest exhaustively (one extraction call per source).\n`,
  );

  return { exitCode: 2, errors };
}

/**
 * Validate an atlas against extraction-quality invariants. Returns
 * array of error strings (empty when atlas passes all invariants).
 *
 * Pure function — exported for unit-test seam parallel to
 * `validateAdrShape` in cli-validate-adrs.ts.
 */
export function validateExtractionShape(
  atlas: AtlasForValidation,
): string[] {
  const errors: string[] = [];
  const claims = atlas.claims ?? [];
  const sourceShas = atlas.source_shas ?? {};

  // Invariant 1: adr_claims_present
  const adrClaims = claims.filter(
    (c) => typeof c.source === "string" && c.source.startsWith("adr:"),
  );
  if (adrClaims.length === 0) {
    errors.push(
      `adr_claims_present: atlas has zero claims with source starting "adr:". ` +
        `ADR extraction is the load-bearing canonical stream (Stream A); an atlas ` +
        `without ADR claims indicates extraction did not run against ADR sources, ` +
        `or all ADR extraction calls produced empty claims arrays. Verify ADRs ` +
        `exist at config.adrs.path and re-run extraction.`,
    );
    // Skip invariant 2 — meaningless without ADR claims to count.
  } else {
    // Invariant 2: adr_depth_floor (per-ADR claim count ≥ 8)
    const claimsPerAdr = new Map<string, number>();
    for (const claim of adrClaims) {
      const path = claim.source_path ?? claim.source ?? "<unknown>";
      claimsPerAdr.set(path, (claimsPerAdr.get(path) ?? 0) + 1);
    }
    const shallowAdrs: Array<{ path: string; count: number }> = [];
    for (const [path, count] of claimsPerAdr) {
      if (count < PER_ADR_CLAIMS_FLOOR) {
        shallowAdrs.push({ path, count });
      }
    }
    if (shallowAdrs.length > 0) {
      // Group into single error with per-ADR detail for actionable feedback.
      const details = shallowAdrs
        .map((s) => `      ${s.path}: ${s.count} claim${s.count === 1 ? "" : "s"}`)
        .join("\n");
      errors.push(
        `adr_depth_floor: ${shallowAdrs.length} ADR${shallowAdrs.length === 1 ? "" : "s"} below per-ADR claims floor (${PER_ADR_CLAIMS_FLOOR} claims/ADR; calibrated against v0.8 Stage 2.a CLI three-repo empirical mean of ~12.6).\n` +
          `    Shallow ADRs:\n${details}\n` +
          `    Re-run extraction; the canonical EXTRACTION_PROMPT consistently produces ≥8 claims per substantive ADR. Per-ADR shallow output substantively indicates Phase B extraction call skipped Phase A investigative discipline.`,
      );
    }
  }

  // Invariant 3: source_coverage (every source_shas entry has ≥ 1 claim)
  const sourcePathsInClaims = new Set<string>();
  for (const claim of claims) {
    if (typeof claim.source_path === "string") {
      sourcePathsInClaims.add(claim.source_path);
    }
  }
  const sourcesWithoutClaims: string[] = [];
  for (const sourcePath of Object.keys(sourceShas)) {
    if (!sourcePathsInClaims.has(sourcePath)) {
      sourcesWithoutClaims.push(sourcePath);
    }
  }
  if (sourcesWithoutClaims.length > 0) {
    const preview = sourcesWithoutClaims
      .slice(0, 5)
      .map((p) => `      ${p}`)
      .join("\n");
    const overflow =
      sourcesWithoutClaims.length > 5
        ? `\n      ... and ${sourcesWithoutClaims.length - 5} more`
        : "";
    errors.push(
      `source_coverage: ${sourcesWithoutClaims.length} source${sourcesWithoutClaims.length === 1 ? "" : "s"} in source_shas have zero claims with matching source_path.\n` +
        `    Sources without claims:\n${preview}${overflow}\n` +
        `    Each source in source_shas should produce ≥ 1 claim via the canonical extraction call. Zero-claim sources indicate silent extraction failure (extraction call skipped or returned empty claims array). Re-run extraction; confirm Phase B iterated all manifest sources from list-extraction-sources.`,
    );
  }

  return errors;
}
