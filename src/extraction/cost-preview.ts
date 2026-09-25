/**
 * Pre-run cost preview for `contextatlas index` (v1.2 Phase 2, lead
 * decision L-8 (a)): an informational estimate of the model calls the
 * run is about to make, printed to stderr before the first call. No
 * prompt, no confirmation; the run continues. `--budget-warn` remains
 * the in-run spend guard, and `cost_usd` in the summary is the actual.
 *
 * Estimate per call:
 *   - input: `EXTRACTION_PROMPT + body + "\n---\n"` (the exact request
 *     text `anthropic-client.ts` sends) at a conservative characters-
 *     per-token ratio (`pricing.ts`);
 *   - output: a fixed low/high range per stream ({@link OUTPUT_TOKEN_PRIORS}).
 * Bodies are what each stream sends: the prose file without
 * frontmatter, the raw docstring, the commit subject + body.
 */

import { readFileSync } from "node:fs";

import { disabledExtractionStreams } from "../config/streams.js";
import type { ExtractionStream } from "../types.js";

import { buildCommitExtractionBody } from "./commit-log.js";
import type { ExtractionPlan } from "./extraction-plan.js";
import {
  computeCostUsd,
  estimateTokensFromChars,
  OPUS_47_INPUT_USD_PER_MTOKEN,
  OPUS_47_OUTPUT_USD_PER_MTOKEN,
} from "./pricing.js";
import {
  EXTRACTION_MODEL,
  EXTRACTION_PROMPT,
  stripFrontmatter,
} from "./prompt.js";

/**
 * Output tokens per call, low and high, per stream. Fixed conservative
 * priors (L-8), to be recalibrated from the Phase 2 parity run:
 *   - adr: dense ADRs produced ~3,000 output tokens per call in
 *     validation (prompt.ts, EXTRACTION_MAX_TOKENS note; hono v0.2
 *     averaged ~2,900); large docs files can produce several times more.
 *   - docstring / commit: the v0.4 hono run averaged well under 100
 *     output tokens per call (most return zero or one claim); the high
 *     end allows a few claims per call.
 */
export const OUTPUT_TOKEN_PRIORS: Readonly<
  Record<ExtractionStream, { readonly low: number; readonly high: number }>
> = {
  adr: { low: 1_000, high: 6_000 },
  docstring: { low: 30, high: 400 },
  commit: { low: 30, high: 400 },
};

/** Separator `anthropic-client.ts` appends after the document body. */
const BODY_TERMINATOR = "\n---\n";

export interface StreamCostEstimate {
  readonly stream: ExtractionStream;
  /** Prose files, docstring files with ≥1 call, or commits. */
  readonly units: number;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokensLow: number;
  readonly outputTokensHigh: number;
  readonly costLowUsd: number;
  readonly costHighUsd: number;
}

export interface CostPreview {
  readonly model: string;
  /** Enabled, planned streams in canonical order (zero-call ones included). */
  readonly streams: readonly StreamCostEstimate[];
  /** Streams `extraction.streams` turned off. */
  readonly disabled: readonly ExtractionStream[];
  /** Enabled streams that cannot run this time, with the reason. */
  readonly skipped: ReadonlyArray<{
    readonly stream: ExtractionStream;
    readonly reason: string;
  }>;
  readonly calls: number;
  readonly inputTokens: number;
  readonly costLowUsd: number;
  readonly costHighUsd: number;
}

/** Estimate one stream: one call per body. */
export function estimateStreamCost(
  stream: ExtractionStream,
  units: number,
  bodies: readonly string[],
): StreamCostEstimate {
  let inputTokens = 0;
  for (const body of bodies) {
    inputTokens += estimateTokensFromChars(
      EXTRACTION_PROMPT.length + body.length + BODY_TERMINATOR.length,
    );
  }
  const prior = OUTPUT_TOKEN_PRIORS[stream];
  const outputTokensLow = bodies.length * prior.low;
  const outputTokensHigh = bodies.length * prior.high;
  return {
    stream,
    units,
    calls: bodies.length,
    inputTokens,
    outputTokensLow,
    outputTokensHigh,
    costLowUsd: computeCostUsd({ inputTokens, outputTokens: outputTokensLow }),
    costHighUsd: computeCostUsd({ inputTokens, outputTokens: outputTokensHigh }),
  };
}

/** Build the preview for a plan (reads the planned prose files). */
export function buildCostPreview(plan: ExtractionPlan): CostPreview {
  const streams: StreamCostEstimate[] = [];
  const skipped: Array<{ stream: ExtractionStream; reason: string }> = [];

  if (plan.streams.has("adr")) {
    const bodies = plan.prose.map((f) => {
      try {
        return stripFrontmatter(readFileSync(f.absPath, "utf8"));
      } catch {
        return ""; // unreadable now; the extraction reports it
      }
    });
    streams.push(estimateStreamCost("adr", plan.prose.length, bodies));
  }
  if (plan.docstring !== null) {
    const bodies: string[] = [];
    let units = 0;
    for (const file of plan.docstring.files) {
      if (file.docstrings.errors.length > 0) continue; // makes no call
      if (file.docstrings.entries.length > 0) units++;
      for (const entry of file.docstrings.entries) bodies.push(entry.docstring);
    }
    streams.push(estimateStreamCost("docstring", units, bodies));
  }
  if (plan.commit !== null) {
    if (plan.commit.status === "planned") {
      const bodies = plan.commit.pending.map(buildCommitExtractionBody);
      streams.push(estimateStreamCost("commit", bodies.length, bodies));
    } else {
      skipped.push({ stream: "commit", reason: plan.commit.reason });
    }
  }

  const sum = (pick: (s: StreamCostEstimate) => number) =>
    streams.reduce((n, s) => n + pick(s), 0);
  return {
    model: EXTRACTION_MODEL,
    streams,
    disabled: disabledExtractionStreams(plan.streams),
    skipped,
    calls: sum((s) => s.calls),
    inputTokens: sum((s) => s.inputTokens),
    costLowUsd: sum((s) => s.costLowUsd),
    costHighUsd: sum((s) => s.costHighUsd),
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Human-readable block for stderr. Ends with a newline. */
export function formatCostPreview(preview: CostPreview): string {
  const unitWord = (s: ExtractionStream) => (s === "commit" ? "commit" : "file");
  const lines = [
    "contextatlas index: extraction plan (estimate, before any model call)",
  ];
  for (const s of preview.streams) {
    lines.push(
      `  ${s.stream.padEnd(10)}${plural(s.units, unitWord(s.stream)).padEnd(12)}` +
        `${plural(s.calls, "call").padEnd(11)}~${s.inputTokens.toLocaleString("en-US")} input tokens`,
    );
  }
  lines.push(
    `  ${"total".padEnd(22)}${plural(preview.calls, "call").padEnd(11)}` +
      `estimated $${preview.costLowUsd.toFixed(2)} to $${preview.costHighUsd.toFixed(2)}`,
  );
  lines.push(
    `  pricing: ${preview.model} at $${OPUS_47_INPUT_USD_PER_MTOKEN} input / ` +
      `$${OPUS_47_OUTPUT_USD_PER_MTOKEN} output per million tokens; the ` +
      "output range is a per-call prior, and cost_usd in the summary is the actual",
  );
  if (preview.disabled.length > 0) {
    lines.push(
      `  disabled: ${preview.disabled.join(", ")} (extraction.streams in .contextatlas.yml)`,
    );
  }
  for (const s of preview.skipped) {
    lines.push(`  skipped: ${s.stream} (${s.reason})`);
  }
  return lines.join("\n") + "\n";
}
