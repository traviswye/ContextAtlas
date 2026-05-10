/**
 * AnthropicAPIDirectExtractor — Mode B per ADR-02 v0.7 amendment +
 * Path (iii) 2-mode collapse lock.
 *
 * Skeleton at Step 1.3 (interface compliance only); full
 * implementation at Step 1.4 delegates to existing
 * runExtractionPipeline + createExtractionClient flow currently in
 * cli-runner.ts.
 *
 * Cost model: "api" (pay-per-use; Anthropic API direct billing).
 * Preserves v0.1-v0.6 actual extraction behavior.
 */

import type {
  Extractor,
  ExtractorContext,
  ExtractionResult,
} from "../extractor.js";

export class AnthropicAPIDirectExtractor implements Extractor {
  readonly costModel = "api" as const;

  async extract(_context: ExtractorContext): Promise<ExtractionResult> {
    throw new Error(
      "AnthropicAPIDirectExtractor implementation lands at Step 1.4 " +
        "(path-routing dispatch + concrete implementations). Step 1.3 " +
        "ships interface skeleton only.",
    );
  }
}
