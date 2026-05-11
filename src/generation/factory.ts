/**
 * Factory: resolve generation `Generator` instance from config per
 * Path-3 entry-point-determined model inheritance (ADR-02 v0.7
 * Step 1.4b amendment).
 *
 * Under Path-3 entry-point-determined architecture:
 *   - CLI invocation (`contextatlas generate-adrs`) → always
 *     `AnthropicAPIDirectGenerator` (canonical CLI behavior;
 *     pay-per-use cost model)
 *   - Claude Code Skills invocation (`/generate-adrs` slash command)
 *     → Skills mechanism handles generation (no TypeScript class
 *     dispatch; not factory's concern)
 *
 * This factory ONLY routes CLI-invoked generation. The `architecture`
 * config field is deprecated post-Step-1.4b but the legacy
 * `claude-code-only` value still routes to the informational-stub
 * `ClaudeCodeOnlyGenerator` for forward-compatibility if a user has
 * not yet removed the field from their `.contextatlas.yml`.
 *
 * Lock chain inheritance: factory mirrors `src/extraction/factory.ts`
 * shape so future maintainers see one consistent Strategy-pattern
 * dispatch pattern across extraction + generation.
 */

import type { ContextAtlasConfig } from "../types.js";

import { AnthropicAPIDirectGenerator } from "./generators/anthropic-api-direct.js";
import { ClaudeCodeOnlyGenerator } from "./generators/claude-code-only.js";
import type { Generator } from "./generator.js";

export function getGenerator(config: ContextAtlasConfig): Generator {
  const architecture = config.architecture;

  // Absent OR redundant API-direct setting OR legacy alias all map
  // to the canonical CLI generator. Matches src/extraction/factory.ts
  // routing semantics for behavioral consistency across surfaces.
  if (
    architecture === undefined ||
    architecture === "anthropic-api-direct" ||
    architecture === "anthropic-api-claude-code"
  ) {
    return new AnthropicAPIDirectGenerator();
  }

  // architecture === "claude-code-only" → informational-stub
  // (redirect message + zero-counts result)
  return new ClaudeCodeOnlyGenerator();
}
