/**
 * AnthropicAPIDirectGenerator — Mode B per Path-3 entry-point-
 * determined architecture inheritance (ADR-02 v0.7 Step 1.4b).
 *
 * STEP 2.2.a.1 SKELETON STATE: this implementation is wired into the
 * factory + CLI dispatcher but `generate()` throws a clearly-marked
 * pending error per Q1.0.10 (b)-inherited fail-loud discipline. Step
 * 2.2.a.2 substantive interpretive surface lands:
 *   - `GENERATE_ADRS_PROMPT` real content
 *   - Codebase walk for architectural-decision identification
 *   - Reference-context walking (per Step 2.1.a Travis SECOND reframe)
 *   - Anthropic API call orchestration
 *   - ADR file writing to `outputAdrPath`
 *
 * Cost model: "api" (pay-per-use; Anthropic API direct billing).
 * Mirrors `AnthropicAPIDirectExtractor` cost semantics.
 */

import {
  GenerationSetupError,
  type Generator,
  type GenerationResult,
  type GeneratorContext,
} from "../generator.js";

export class AnthropicAPIDirectGenerator implements Generator {
  readonly costModel = "api" as const;

  async generate(context: GeneratorContext): Promise<GenerationResult> {
    // Step 2.2.a.1 skeleton: setup-error early-return preserves
    // ADR-12 exit-code-2 mapping discipline. Step 2.2.a.2 replaces
    // this body with substantive generation work.
    //
    // Verifies API key presence here (setup-phase error) so the
    // skeleton fails cleanly for users who attempt `contextatlas
    // generate-adrs` at Step 2.2.a.1 build with no API key — they
    // get a clear setup-error message rather than a generic
    // pending-implementation throw.
    const apiKey = context.readEnv("ANTHROPIC_API_KEY");
    if (apiKey === undefined || apiKey.length === 0) {
      throw new GenerationSetupError(
        "ANTHROPIC_API_KEY is not set. Export it in your environment " +
          "before running `contextatlas generate-adrs`. Subscription-" +
          "bounded generation runs via `/generate-adrs` Claude Code " +
          "skill, not via CLI (per ADR-02 v0.7 Path-3 entry-point-" +
          "determined architecture). Skills implementation lands in a " +
          "future cycle; v0.7 ships CLI Mode B as primary surface.",
      );
    }

    // Skeleton fail-loud throw — replaced at Step 2.2.a.2. Voiding
    // unused context fields silences TS6133 without weakening types.
    void context;
    throw new Error(
      "AnthropicAPIDirectGenerator.generate is not yet implemented. " +
        "Step 2.2.a.1 ships skeleton infrastructure (Generator " +
        "interface + factory + CLI dispatcher + Path-γ " +
        "show-generate-prompt subcommand). Step 2.2.a.2 ships " +
        "substantive interpretive content (GENERATE_ADRS_PROMPT " +
        "drafting + codebase walk + reference-context handling + " +
        "Anthropic API orchestration + ADR file writing). See " +
        "STEP-PLAN-V0.7.md Step 2.2.a.2 substep for status.",
    );
  }
}
