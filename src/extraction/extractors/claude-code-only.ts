/**
 * ClaudeCodeOnlyExtractor — Mode A per ADR-02 v0.7 amendment +
 * Path (iii) 2-mode collapse lock + Q1.0.2 α Skills architecture
 * verification (Step 1.1 commit dc81f49).
 *
 * Skeleton at Step 1.4a (interface compliance only); full Skills
 * functional implementation lands at Step 1.4b at canonical location
 * `.claude/skills/index-atlas/SKILL.md` per Q1.0.2 sub-shape lock +
 * Path-γ CLI subcommand for extraction prompt loading
 * (`contextatlas show-prompt`).
 *
 * Cost model: "subscription-bounded" (Claude Code session tokens;
 * $0 per-call). Extraction 100% contained to Claude Code session;
 * does NOT import @anthropic-ai/sdk; permitted-modules invariant
 * preserved per ADR-02 §Decision.
 */

import type {
  Extractor,
  ExtractorContext,
  ExtractionResult,
} from "../extractor.js";

export class ClaudeCodeOnlyExtractor implements Extractor {
  readonly costModel = "subscription-bounded" as const;

  async extract(_context: ExtractorContext): Promise<ExtractionResult> {
    throw new Error(
      "ClaudeCodeOnlyExtractor implementation lands at Step 1.4b " +
        "(Skills mechanism wiring; .claude/skills/index-atlas/SKILL.md " +
        "content + bundled helper scripts + Path-γ CLI subcommand " +
        "`contextatlas show-prompt` for canonical extraction prompt " +
        "loading). Step 1.4a ships interface skeleton + Mode B full " +
        "implementation only. To use claude-code-only path at v0.7+ " +
        "ship, wait for Step 1.4b commit; in the interim, set " +
        "architecture: anthropic-api-direct in .contextatlas.yml.",
    );
  }
}
