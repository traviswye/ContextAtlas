/**
 * ClaudeCodeOnlyExtractor — Mode A per ADR-02 v0.7 amendment +
 * Path (iii) 2-mode collapse lock + Q1.0.2 α Skills architecture
 * verification (Step 1.1 commit dc81f49).
 *
 * Skeleton at Step 1.3 (interface compliance only); full
 * implementation at Step 1.4 wires Skills mechanism at canonical
 * location `.claude/skills/index-atlas/SKILL.md`.
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
      "ClaudeCodeOnlyExtractor implementation lands at Step 1.4 " +
        "(Skills mechanism wiring; .claude/skills/index-atlas/SKILL.md " +
        "content + bundled helper scripts + extraction prompt " +
        "packaging). Step 1.3 ships interface skeleton only.",
    );
  }
}
