/**
 * Output anonymization pipeline for v0.5 LLM-judge paired-mode grading.
 *
 * Per ADR-19 §3 (anonymization protocol — strip-list; A/B randomization;
 * manifest persistence) + Step 1.3 5-step protocol lock. Pre-Step-8
 * grading, paired ca + beta-ca trials are run through this pipeline to
 * produce the anonymous GradingInput shape the judge sees + a
 * RunManifestEntry persisted for post-hoc decoding.
 *
 * Three responsibilities:
 *   1. Field-level strip surfaces. Only the answer text reaches the
 *      judge; all metadata fields per ADR-19 §3 strip-list (condition,
 *      bucket, target_symbol, repo, prompt_id, metrics, cost_usd,
 *      wall_clock_ms, capped, errored, diagnostics, trace, written_at)
 *      are omitted by virtue of not being copied into GradingInput.
 *      Functional design over field-by-field stripping.
 *   2. Filename-marker stripping in answer text. Harness artifact
 *      filenames (compact_format.txt; summary.md; run-manifest.json;
 *      phase-N-*.md; step9-*.json) become "[artifact]" tokens.
 *      Source-code refs and ADR-NN references pass through unchanged
 *      (legitimate Axis 3 quality signal per ADR-19 §3 — default-
 *      preserve; only denylist matches are stripped).
 *   3. A/B randomization via seed-derived parity. Deterministic given
 *      (cell_id, trial_index, run_uuid). Manifest persists the
 *      assignment so post-hoc verification can decode A↔condition.
 *      Cross-order regrade (k=5-10 of 25 pairs per ADR-19 §3) realized
 *      via forceSwapAB flag rather than re-derived seed; same effect,
 *      cleaner API.
 *
 * This module deliberately exposes pure functions; manifest I/O is
 * provided as separate exports. No global state; no Anthropic API
 * calls (research-time data transformation; ADR-02 amendment permits
 * src/grading/ as second module but this file doesn't actually call
 * the API).
 *
 * See:
 *   - docs/adr/ADR-19-llm-judge-methodology.md §3 (anonymization
 *     protocol; empirical strip-list derivation; 5-step protocol;
 *     constructed grading-input shape; A/B randomization formula)
 *   - docs/adr/ADR-02-extraction-sole-api-caller.md (amended 2026-04-30
 *     to permit src/grading/ as second permitted module)
 *   - STEP-PLAN-V0.5.md Step 4 (double-blind harness implementation)
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const SEED_INPUT_SEPARATOR = ":";

const HARNESS_ARTIFACT_PATTERNS: readonly RegExp[] = [
  /\bcompact_format\.txt\b/g,
  /\bsummary\.md\b/g,
  /\brun-manifest\.json\b/g,
  /\bphase-\d+(?:-[\w-]+)?\.md\b/g,
  /\bstep9-[\w-]*\.json\b/g,
];

const ARTIFACT_REPLACEMENT_TOKEN = "[artifact]";

/** Trial output as produced by v0.4 Step 9 / v0.5 Step 7 run-manifest.json. */
export interface TrialOutput {
  /** The model's textual answer. Only field consumed; rest discarded. */
  answer: string;
  /** Other fields permitted but not read; explicit type-level discard. */
  [otherFields: string]: unknown;
}

export type Condition = "ca" | "beta-ca";

/** What the judge sees per ADR-19 §3 constructed grading-input shape. */
export interface GradingInput {
  prompt: string;
  answer_A: string;
  answer_B: string;
  presentation_id: string;
}

/** One pair's persisted record per ADR-19 §3 manifest schema. */
export interface RunManifestEntry {
  pair_uuid: string;
  cell_id: string;
  trial_index: number;
  run_uuid: string;
  seed: string;
  assignment_parity: "even" | "odd";
  assignment: { A: Condition; B: Condition };
  ca_source_path: string;
  beta_ca_source_path: string;
  presentation_id: string;
  cross_order_regrade: boolean;
  created_at: string;
  anonymization_version: 1;
}

/** Full manifest persisted to disk. */
export interface RunManifest {
  run_uuid: string;
  step8_cycle_started_at: string;
  anonymization_version: 1;
  entries: RunManifestEntry[];
}

export interface AnonymizeOptions {
  prompt: string;
  caTrial: TrialOutput;
  betaCaTrial: TrialOutput;
  caSourcePath: string;
  betaCaSourcePath: string;
  cellId: string;
  trialIndex: number;
  runUuid: string;
  pairUuid: string;
  /**
   * When true, flips the natural seed-derived A/B assignment. Used by
   * Step 8 cross-presentation-order regrade subset (k=5-10 of 25 pairs
   * per ADR-19 §3) to realize "regrade with A/B swapped" intent.
   * Sets cross_order_regrade=true in the manifest entry.
   */
  forceSwapAB?: boolean;
}

export interface AnonymizeResult {
  gradingInput: GradingInput;
  manifestEntry: RunManifestEntry;
}

/**
 * Apply filename-marker stripping per ADR-19 §3 denylist. Harness
 * artifacts become "[artifact]"; source-code refs and ADR references
 * pass through (default-preserve; allowlist exists conceptually but
 * is not enforced as a filter — denylist application is sufficient).
 *
 * Exported for direct testing; also called internally by anonymize().
 */
export function stripFilenameMarkers(text: string): string {
  let result = text;
  for (const pattern of HARNESS_ARTIFACT_PATTERNS) {
    result = result.replace(pattern, ARTIFACT_REPLACEMENT_TOKEN);
  }
  return result;
}

/**
 * Derive a 16-hex-char seed from (cell_id, trial_index, run_uuid) per
 * ADR-19 §3. Throws if cell_id or run_uuid contains the separator
 * character (would create ambiguity in the concatenation; fail loudly
 * per CLAUDE.md). trial_index must be a non-negative integer.
 */
export function deriveSeed(
  cellId: string,
  trialIndex: number,
  runUuid: string,
): string {
  if (cellId.includes(SEED_INPUT_SEPARATOR)) {
    throw new Error(
      `cell_id must not contain '${SEED_INPUT_SEPARATOR}' (seed-input separator collision); got: ${cellId}`,
    );
  }
  if (runUuid.includes(SEED_INPUT_SEPARATOR)) {
    throw new Error(
      `run_uuid must not contain '${SEED_INPUT_SEPARATOR}' (seed-input separator collision); got: ${runUuid}`,
    );
  }
  if (!Number.isInteger(trialIndex) || trialIndex < 0) {
    throw new Error(
      `trial_index must be a non-negative integer; got: ${String(trialIndex)}`,
    );
  }
  const input = [cellId, trialIndex.toString(), runUuid].join(
    SEED_INPUT_SEPARATOR,
  );
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Compute even/odd parity from the first 32 bits (first 8 hex chars)
 * of seed per ADR-19 §3 hash_int derivation.
 */
export function abParity(seed: string): "even" | "odd" {
  const first8 = parseInt(seed.slice(0, 8), 16);
  if (Number.isNaN(first8)) {
    throw new Error(
      `seed must start with 8 valid hex characters; got: ${seed}`,
    );
  }
  return first8 % 2 === 0 ? "even" : "odd";
}

/**
 * Derive a UUID-formatted opaque presentation identifier from the seed
 * per ADR-19 §3 "presentation_id: seed-derived UUID". Format follows
 * standard 8-4-4-4-12 hex layout but does NOT set UUID v4 version bits
 * — callers treat as opaque identifier, not a parseable UUID v4.
 */
export function derivePresentationId(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

/**
 * Main anonymization entry point. Pure function; deterministic given
 * input opts. Returns both the judge-facing GradingInput and the
 * manifest entry the caller batches into a RunManifest.
 */
export function anonymize(opts: AnonymizeOptions): AnonymizeResult {
  const seed = deriveSeed(opts.cellId, opts.trialIndex, opts.runUuid);
  const naturalParity = abParity(seed);
  const effectiveParity =
    opts.forceSwapAB === true
      ? naturalParity === "even"
        ? "odd"
        : "even"
      : naturalParity;

  const caAnswer = stripFilenameMarkers(opts.caTrial.answer);
  const betaCaAnswer = stripFilenameMarkers(opts.betaCaTrial.answer);

  const presentationId = derivePresentationId(seed);

  let answerA: string;
  let answerB: string;
  let assignment: { A: Condition; B: Condition };
  if (effectiveParity === "even") {
    answerA = caAnswer;
    answerB = betaCaAnswer;
    assignment = { A: "ca", B: "beta-ca" };
  } else {
    answerA = betaCaAnswer;
    answerB = caAnswer;
    assignment = { A: "beta-ca", B: "ca" };
  }

  const gradingInput: GradingInput = {
    prompt: opts.prompt,
    answer_A: answerA,
    answer_B: answerB,
    presentation_id: presentationId,
  };

  const manifestEntry: RunManifestEntry = {
    pair_uuid: opts.pairUuid,
    cell_id: opts.cellId,
    trial_index: opts.trialIndex,
    run_uuid: opts.runUuid,
    seed,
    assignment_parity: effectiveParity,
    assignment,
    ca_source_path: opts.caSourcePath,
    beta_ca_source_path: opts.betaCaSourcePath,
    presentation_id: presentationId,
    cross_order_regrade: opts.forceSwapAB === true,
    created_at: new Date().toISOString(),
    anonymization_version: 1,
  };

  return { gradingInput, manifestEntry };
}

/**
 * Decode A↔condition for a manifest entry. Inverse of anonymize() at
 * the assignment-mapping level. Used by Step 8 post-hoc verification.
 */
export function decodeAssignment(entry: RunManifestEntry): {
  A: Condition;
  B: Condition;
} {
  return entry.assignment;
}

// ============================================================================
// I/O — manifest read/write
// ============================================================================

/**
 * Persist a run manifest to disk. Single JSON object with entries[]
 * array per ADR-19 §3 manifest schema; UTF-8 with trailing newline.
 */
export function writeManifest(path: string, manifest: RunManifest): void {
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

/**
 * Read a run manifest from disk. Validates anonymization_version
 * minimally; throws if absent or unsupported.
 */
export function readManifest(path: string): RunManifest {
  const raw = readFileSync(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`manifest at ${path} is not an object`);
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.anonymization_version !== 1) {
    throw new Error(
      `unsupported anonymization_version: ${String(obj.anonymization_version)} (expected 1)`,
    );
  }
  return parsed as RunManifest;
}
