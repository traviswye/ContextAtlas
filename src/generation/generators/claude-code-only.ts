/**
 * ClaudeCodeOnlyGenerator — informational-stub per Path-3 entry-point-
 * determined architecture inheritance (ADR-02 v0.7 Step 1.4b).
 *
 * Mirrors `ClaudeCodeOnlyExtractor` (`src/extraction/extractors/
 * claude-code-only.ts`) shape: Skills mechanism IS the Mode A entry
 * point; no separate TypeScript class needed to wrap it. CLI cannot
 * bridge to Skills running in Claude Code session. This stub covers
 * the legacy alias path: if a user reaches the factory through some
 * future legacy-architecture-field route, the stub emits a redirect
 * message + zero-counts result.
 *
 * Step 2.2.a.1: stub is reachable through factory (future-compat);
 * not actually wired to a config-field-driven path at v0.7 because
 * `architecture` is deprecated post-Step-1.4b.
 *
 * Cost model: "subscription-bounded" preserved per Q1.0.5 δ lock.
 */

import type {
  Generator,
  GenerationResult,
  GeneratorContext,
} from "../generator.js";

export class ClaudeCodeOnlyGenerator implements Generator {
  readonly costModel = "subscription-bounded" as const;

  async generate(_context: GeneratorContext): Promise<GenerationResult> {
    process.stderr.write(
      "ClaudeCodeOnlyGenerator (Mode A) generation runs via " +
        "/generate-adrs Claude Code skill, not via CLI.\n" +
        "Invoke /generate-adrs from your Claude Code session to " +
        "generate ADRs (subscription-bounded; consumes session " +
        "tokens; no Anthropic API key required).\n" +
        "Skills implementation lands in a future cycle per ADR-02 " +
        "v0.7 amendment §Decision (Path-3 entry-point-determined " +
        "architecture). v0.7 ships CLI Mode B as primary generate-" +
        "adrs surface.\n",
    );
    return {
      filesGenerated: 0,
      costUsd: 0,
      apiCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      wallClockMs: 0,
      costModel: this.costModel,
    };
  }
}
