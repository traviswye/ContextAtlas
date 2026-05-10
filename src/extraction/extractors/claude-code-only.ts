/**
 * ClaudeCodeOnlyExtractor — informational-stub per Q1.0.10 (b)
 * sub-lock at v0.7 Step 1.4b Path-3 reframe.
 *
 * Under Path-3 entry-point-determined architecture (ADR-02 v0.7
 * Step 1.4b amendment), Skills mechanism IS the Mode A entry
 * point; no separate TypeScript class needed to wrap it. CLI
 * cannot bridge to Skills running in Claude Code session.
 *
 * This stub covers the legacy alias deprecation path: if user
 * sets `architecture: "anthropic-api-claude-code"` (legacy alias)
 * OR `architecture: "claude-code-only"` in config, OR invokes
 * `--cc-only` flag at CLI, factory routes here and we emit a
 * redirect message + zero-counts result.
 *
 * Cost model: "subscription-bounded" preserved per Q1.0.5 δ lock
 * (cost_model metadata field useful for atlas.json provenance).
 */

import type {
  Extractor,
  ExtractorContext,
  ExtractionResult,
} from "../extractor.js";

export class ClaudeCodeOnlyExtractor implements Extractor {
  readonly costModel = "subscription-bounded" as const;

  async extract(_context: ExtractorContext): Promise<ExtractionResult> {
    process.stderr.write(
      "ClaudeCodeOnlyExtractor (Mode A) extraction runs via " +
        "/index-atlas Claude Code skill, not via CLI.\n" +
        "Invoke /index-atlas from your Claude Code session to extract " +
        "atlas.json (subscription-bounded; consumes session tokens; no " +
        "Anthropic API key required).\n" +
        "See ADR-02 v0.7 amendment §Decision for entry-point-determined " +
        "extraction architecture.\n",
    );
    return {
      pipelineResult: {
        filesExtracted: 0,
        filesUnchanged: 0,
        filesDeleted: 0,
        claimsWritten: 0,
        symbolsIndexed: 0,
        unresolvedCandidates: 0,
        unresolvedFrontmatterHints: 0,
        extractionErrors: [],
        atlasExported: false,
        wallClockMs: 0,
        apiCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        gitCommitsIndexed: 0,
        extractedAtSha: null,
        unresolvedDetails: [],
      },
      costModel: this.costModel,
    };
  }
}
