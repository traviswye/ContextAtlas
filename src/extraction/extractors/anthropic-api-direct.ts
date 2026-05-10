/**
 * AnthropicAPIDirectExtractor — Mode B per ADR-02 v0.7 amendment +
 * Path (iii) 2-mode collapse lock.
 *
 * Wraps existing runExtractionPipeline + createExtractionClient flow
 * (previously in cli-runner.ts; refactored at Step 1.4a). Reads
 * ExtractorContext.clientOverride for test-seam injection per Q1.0.6
 * α + γ + Q1.3.6 lock.
 *
 * Cost model: "api" (pay-per-use; Anthropic API direct billing).
 * Preserves v0.1-v0.6 actual extraction behavior.
 */

import Anthropic from "@anthropic-ai/sdk";

import { createExtractionClient } from "../anthropic-client.js";
import type { ExtractionClient } from "../anthropic-client.js";
import {
  ExtractionSetupError,
  type Extractor,
  type ExtractorContext,
  type ExtractionResult,
} from "../extractor.js";
import { runExtractionPipeline } from "../pipeline.js";

export class AnthropicAPIDirectExtractor implements Extractor {
  readonly costModel = "api" as const;

  async extract(context: ExtractorContext): Promise<ExtractionResult> {
    let client: ExtractionClient;
    if (context.clientOverride) {
      client = context.clientOverride;
    } else {
      const apiKey = context.readEnv("ANTHROPIC_API_KEY");
      if (!apiKey || apiKey.length === 0) {
        throw new ExtractionSetupError(
          "ANTHROPIC_API_KEY is not set. Export it in your environment " +
            "before running `contextatlas index` with " +
            "architecture: anthropic-api-direct (or legacy " +
            "anthropic-api-claude-code alias). Alternatively, set " +
            "architecture: claude-code-only to use the Claude Code " +
            "Skills path (subscription-bounded; no API key required) " +
            "per ADR-02 v0.7 amendment.",
        );
      }
      const anthropic = new Anthropic({ apiKey });
      client = createExtractionClient({ anthropic });
    }

    const pipelineResult = await runExtractionPipeline({
      repoRoot: context.sourceRoot,
      configRoot: context.configRoot,
      config: context.config,
      db: context.db,
      anthropicClient: client,
      adapters: context.adapters,
      contextatlasVersion: context.contextatlasVersion,
      contextatlasCommitSha: context.contextatlasCommitSha,
      ...(context.full ? { skipShaDiff: true } : {}),
      ...(context.budgetWarnUsd !== undefined
        ? { budgetWarnUsd: context.budgetWarnUsd }
        : {}),
      ...(context.narrowAttribution !== undefined
        ? { narrowAttribution: context.narrowAttribution }
        : {}),
    });

    return {
      pipelineResult,
      costModel: this.costModel,
    };
  }
}
