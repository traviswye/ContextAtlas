/**
 * Tier 0 structural refresh (`contextatlas index --structural`, v1.2
 * Phase 3; ADR-12 2026-10-14 amendment).
 *
 * Runs the extraction pipeline with `structural: true` and a client
 * that refuses every call, so a bug that reached a model call fails
 * loudly instead of billing. It needs no API key and runs whatever
 * `architecture` says: the refresh extracts nothing, so the extractor
 * strategy (ADR-02 v0.7) does not apply.
 */

import { resolveExtractionStreams } from "../config/streams.js";

import type { ExtractionClient } from "./anthropic-client.js";
import type { ExtractorContext } from "./extractor.js";
import { runExtractionPipeline, type ExtractionPipelineResult } from "./pipeline.js";

/** An extraction client that throws on any call. */
export const refusingClient: ExtractionClient = {
  async extract(): Promise<never> {
    throw new Error(
      "A structural run (`contextatlas index --structural`) attempted a " +
        "model call. This is a contextatlas bug; please report it. Run " +
        "`contextatlas index` without --structural to extract.",
    );
  },
};

export function runStructuralRefresh(
  context: ExtractorContext,
  options: { noExport?: boolean } = {},
): Promise<ExtractionPipelineResult> {
  return runExtractionPipeline({
    repoRoot: context.sourceRoot,
    configRoot: context.configRoot,
    config: context.config,
    db: context.db,
    anthropicClient: refusingClient,
    adapters: context.adapters,
    contextatlasVersion: context.contextatlasVersion,
    contextatlasCommitSha: context.contextatlasCommitSha,
    streams: resolveExtractionStreams(context.config),
    structural: true,
    ...(options.noExport === true ? { noExport: true } : {}),
    ...(context.docstringDigests !== undefined
      ? { docstringDigests: context.docstringDigests }
      : {}),
    ...(context.gitBinary !== undefined ? { gitBinary: context.gitBinary } : {}),
  });
}
