/**
 * CLI glue for the `contextatlas validate-atlas` subcommand (v0.7
 * Step 2.3.b.0 — β-bounded mechanical schema validation at CLI
 * boundary per Travis Lock 1).
 *
 * Parses `.contextatlas/atlas.json`; validates against canonical
 * AtlasFileV1 schema (currently v1.4); on failure prints structured
 * remediation guidance to stderr + exits 2; on success exits 0.
 *
 * Driver: empirical evidence at Step 2.3 Checkpoint 2/3 surfaced
 * D4' atlas schema fidelity divergence — Skill agents invent atlas
 * shape rather than reading canonical schema substrate (`"version":
 * "1"`, `sources` nesting, custom top-level `cost_usd` / `cost_model`
 * fields, etc.). Mechanical validation at CLI boundary substantively
 * forces canonical shape: invalid atlas fails loudly with specific
 * remediation; Skill workflow blocks until atlas conforms.
 *
 * Exit codes:
 *   0 — atlas valid (or atlas absent — informational, not an error
 *       in validate-only context)
 *   2 — atlas exists but fails schema validation (specific errors
 *       printed to stderr)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { loadConfig } from "../config/parser.js";
import {
  ATLAS_VERSION,
  SUPPORTED_ATLAS_VERSIONS,
} from "../storage/types.js";

export type ValidateAtlasExitCode = 0 | 2;

export interface ValidateAtlasCliOptions {
  configRoot: string;
  configFile: string | null;
  /** Test seam: where validation report goes. Defaults to process.stdout.write. */
  writeStdout?: (chunk: string) => void;
  /** Test seam: where validation errors go. Defaults to process.stderr.write. */
  writeStderr?: (chunk: string) => void;
}

export interface ValidateAtlasCliResult {
  exitCode: ValidateAtlasExitCode;
  /** Validation findings (empty when atlas valid). */
  errors: readonly string[];
}

const VALID_SEVERITIES = new Set(["hard", "soft", "context"]);

/**
 * Run the `validate-atlas` subcommand. Never throws — all error
 * paths map to exit codes and structured remediation output.
 */
export async function runValidateAtlasSubcommand(
  options: ValidateAtlasCliOptions,
): Promise<ValidateAtlasCliResult> {
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
    writeStderr(`validate-atlas: failed to load config: ${String(err)}\n`);
    return { exitCode: 2, errors: [String(err)] };
  }

  const atlasPath = pathResolve(options.configRoot, config.atlas.path);
  if (!existsSync(atlasPath)) {
    writeStderr(
      `validate-atlas: atlas.json not found at ${config.atlas.path}. ` +
        `Run \`/index-atlas\` (Skill) or \`contextatlas index\` (CLI) ` +
        `to produce the atlas first.\n`,
    );
    return { exitCode: 2, errors: ["atlas not found"] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(atlasPath, "utf8"));
  } catch (err) {
    writeStderr(
      `validate-atlas: atlas.json at ${config.atlas.path} did not parse as JSON.\n` +
        `Parse error: ${String(err)}\n` +
        `Remediation: ensure the file contains a single valid JSON object.\n`,
    );
    return { exitCode: 2, errors: ["json parse error"] };
  }

  const errors = validateAtlasShape(raw);
  if (errors.length === 0) {
    writeStdout(
      `validate-atlas: ${config.atlas.path} conforms to canonical AtlasFileV1 schema v${ATLAS_VERSION}.\n`,
    );
    return { exitCode: 0, errors: [] };
  }

  writeStderr(
    `validate-atlas: atlas.json at ${config.atlas.path} does NOT conform to ` +
      `canonical AtlasFileV1 schema v${ATLAS_VERSION}.\n` +
      `\n` +
      `Specific remediation:\n`,
  );
  for (const err of errors) {
    writeStderr(`  - ${err}\n`);
  }
  writeStderr(
    `\n` +
      `Refer to the canonical atlas example embedded in ` +
      `.contextatlas/prompts/extraction.md (Skill path) OR ` +
      `src/storage/types.ts:AtlasFileV1 (CLI path). DO NOT invent ` +
      `top-level fields; DO NOT nest claims inside a \`sources\` ` +
      `object; \`claims\` is a flat top-level array.\n`,
  );
  return { exitCode: 2, errors };
}

/**
 * Validate that the parsed atlas conforms to canonical AtlasFileV1
 * shape. Returns an array of human-readable error strings; empty
 * array means valid.
 *
 * Checks the load-bearing structural invariants that the Skill agent
 * is empirically prone to violating (per Step 2.3 Checkpoint 3
 * findings); leaves deeper field-level correctness (e.g.,
 * SymbolId format, file_sha format) for downstream consumers.
 */
function validateAtlasShape(raw: unknown): string[] {
  const errors: string[] = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [
      `Atlas root must be a JSON object (got ${describe(raw)}). The atlas envelope is a single object with top-level fields: version, generated_at, generator, source_shas, symbols, claims.`,
    ];
  }
  const atlas = raw as Record<string, unknown>;

  // 1. version field
  if (typeof atlas.version !== "string") {
    errors.push(
      `Top-level \`version\` field missing or not a string. Expected one of ${SUPPORTED_ATLAS_VERSIONS.join(", ")} (current: ${ATLAS_VERSION}).`,
    );
  } else if (!(SUPPORTED_ATLAS_VERSIONS as readonly string[]).includes(atlas.version)) {
    errors.push(
      `Top-level \`version\` is "${atlas.version}" — not in supported list ${SUPPORTED_ATLAS_VERSIONS.join(", ")}. Expected "${ATLAS_VERSION}" for Skill-path atlas writes.`,
    );
  }

  // 2. generated_at field
  if (typeof atlas.generated_at !== "string" || atlas.generated_at.length === 0) {
    errors.push(
      `Top-level \`generated_at\` field missing or empty. Expected ISO 8601 timestamp string (e.g., "2026-05-11T20:00:00.000Z").`,
    );
  }

  // 3. generator object
  if (atlas.generator === undefined || atlas.generator === null) {
    errors.push(
      `Top-level \`generator\` field missing. Expected object with required fields: contextatlas_version (string), extraction_model (string); optional: contextatlas_commit_sha (string).`,
    );
  } else if (typeof atlas.generator !== "object" || Array.isArray(atlas.generator)) {
    errors.push(
      `Top-level \`generator\` must be an object, not ${describe(atlas.generator)}. (Observed pattern at Step 2.3 Checkpoint 3: agent wrote \`generator\` as a free-form string. The canonical shape is a structured object.)`,
    );
  } else {
    const gen = atlas.generator as Record<string, unknown>;
    if (typeof gen.contextatlas_version !== "string") {
      errors.push(
        `\`generator.contextatlas_version\` missing or not a string. Expected the contextatlas package version (e.g., "0.7.0").`,
      );
    }
    if (typeof gen.extraction_model !== "string") {
      errors.push(
        `\`generator.extraction_model\` missing or not a string. Expected "claude-opus-4-7" for Skill-path atlases.`,
      );
    }
  }

  // 4. source_shas object
  if (atlas.source_shas === undefined || atlas.source_shas === null) {
    errors.push(
      `Top-level \`source_shas\` field missing. Expected object mapping source-path strings to SHA-256 hex strings.`,
    );
  } else if (
    typeof atlas.source_shas !== "object" ||
    Array.isArray(atlas.source_shas)
  ) {
    errors.push(
      `Top-level \`source_shas\` must be an object (got ${describe(atlas.source_shas)}).`,
    );
  }

  // 5. symbols array
  if (!Array.isArray(atlas.symbols)) {
    errors.push(
      `Top-level \`symbols\` field missing or not an array. Expected array (may be empty before resolve-symbols runs; populated by \`contextatlas resolve-symbols\` at end of Skill workflow).`,
    );
  }

  // 6. claims array — this is the most empirically-divergent field
  if (!Array.isArray(atlas.claims)) {
    // The Step 2.3 Checkpoint 3 divergence: agent nested claims inside
    // a `sources` array. Surface this specific failure mode loudly.
    if (Array.isArray((atlas as { sources?: unknown }).sources)) {
      errors.push(
        `Top-level \`claims\` field missing — but a non-canonical \`sources\` array was found instead. The canonical schema has a single flat top-level \`claims: [...]\` array; do NOT nest claims inside a per-source \`sources: [{ claims: [...] }]\` structure. Flatten the claims into a single top-level array; each claim records its source via the \`source\` + \`source_path\` + \`source_sha\` fields.`,
      );
    } else {
      errors.push(
        `Top-level \`claims\` field missing or not an array. Expected flat top-level array of claim objects.`,
      );
    }
  } else {
    // Per-claim shape check (sampled; bounded cost).
    for (let i = 0; i < atlas.claims.length; i += 1) {
      const claim = atlas.claims[i];
      if (claim === null || typeof claim !== "object" || Array.isArray(claim)) {
        errors.push(
          `claims[${i}] must be an object (got ${describe(claim)}).`,
        );
        continue;
      }
      const c = claim as Record<string, unknown>;
      for (const field of ["source", "source_path", "source_sha", "claim"]) {
        if (typeof c[field] !== "string" || (c[field] as string).length === 0) {
          errors.push(
            `claims[${i}].${field} missing or not a non-empty string.`,
          );
        }
      }
      if (
        typeof c.severity !== "string" ||
        !VALID_SEVERITIES.has(c.severity as string)
      ) {
        errors.push(
          `claims[${i}].severity must be one of "hard" | "soft" | "context" (got ${describe(c.severity)}).`,
        );
      }
      if (!Array.isArray(c.symbol_ids)) {
        errors.push(
          `claims[${i}].symbol_ids must be an array (may be empty before resolve-symbols runs).`,
        );
      }
      // symbol_candidates is optional (atlas v1.4+); when present, must be array of strings.
      if (
        c.symbol_candidates !== undefined &&
        !Array.isArray(c.symbol_candidates)
      ) {
        errors.push(
          `claims[${i}].symbol_candidates, when present, must be an array of strings.`,
        );
      }
    }
  }

  // 7. Surface non-canonical top-level fields the Skill agent invented
  //    at Step 2.3 Checkpoint 3 (cost_usd, cost_model, repo, sources).
  //    These don't break parsing but signal substantive deviation from
  //    canonical shape; warn loudly so the agent recognizes the
  //    pattern next iteration.
  const NON_CANONICAL_TOP_LEVEL_FIELDS = ["cost_usd", "cost_model", "repo", "sources"];
  for (const field of NON_CANONICAL_TOP_LEVEL_FIELDS) {
    if (field in atlas) {
      errors.push(
        `Top-level \`${field}\` field is non-canonical (not in AtlasFileV1 schema). Remove it. Canonical top-level fields: version, generated_at, generator, source_shas, symbols, claims (+ optional extracted_at_sha, git_commits).`,
      );
    }
  }

  return errors;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
