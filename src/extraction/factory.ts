/**
 * Factory: resolve extraction Extractor instance from config per
 * Path (iii) 2-mode collapse + 1 legacy alias deprecation cycle
 * (ADR-02 v0.7 amendment 2026-05-09).
 *
 * Three config values accepted:
 *   - "claude-code-only" → ClaudeCodeOnlyExtractor (Mode A)
 *   - "anthropic-api-direct" → AnthropicAPIDirectExtractor (Mode B)
 *   - "anthropic-api-claude-code" (legacy) →
 *     AnthropicAPIDirectExtractor + stderr deprecation warning
 *     emission per Q1.0.8 lock; alias removed at v0.8+
 *
 * Default: "claude-code-only" per Q1.0.4 β-3 lock (absent-means-
 * default; init writes explicit-default).
 *
 * Verification Item 2 resolution at Step 1.3: parser layer validates
 * architecture field non-empty + valid-set membership
 * (validateArchitecture in src/config/parser.ts); factory trusts
 * parser-validated values (no defensive empty-string handling).
 *
 * Verification Item 1 resolution at Step 1.3: no once-per-process
 * guard at v0.7 — both `contextatlas index` + `contextatlas init`
 * (smoke test path) trigger extraction; per-invocation warning
 * emission appropriate; if production scenarios surface noise, add
 * guard at v0.8+.
 */

import type { ContextAtlasConfig } from "../types.js";

import { AnthropicAPIDirectExtractor } from "./extractors/anthropic-api-direct.js";
import { ClaudeCodeOnlyExtractor } from "./extractors/claude-code-only.js";
import type { Extractor } from "./extractor.js";

/**
 * Stderr write seam for tests. Tests inject a capture function;
 * production uses process.stderr.write.
 */
export interface FactoryDeps {
  writeStderr?: (chunk: string) => void;
}

const DEFAULT_DEPS: Required<FactoryDeps> = {
  writeStderr: (chunk: string): void => {
    process.stderr.write(chunk);
  },
};

export const LEGACY_ALIAS_DEPRECATION_WARNING =
  "Warning: architecture: \"anthropic-api-claude-code\" is deprecated " +
  "alias for \"anthropic-api-direct\"; will be removed at v0.8+; " +
  "please update .contextatlas.yml\n";

export function getExtractor(
  config: ContextAtlasConfig,
  deps: FactoryDeps = {},
): Extractor {
  const writeStderr = deps.writeStderr ?? DEFAULT_DEPS.writeStderr;
  const architecture = config.architecture ?? "claude-code-only";

  if (architecture === "anthropic-api-claude-code") {
    writeStderr(LEGACY_ALIAS_DEPRECATION_WARNING);
    return new AnthropicAPIDirectExtractor();
  }

  if (architecture === "anthropic-api-direct") {
    return new AnthropicAPIDirectExtractor();
  }

  if (architecture === "claude-code-only") {
    return new ClaudeCodeOnlyExtractor();
  }

  // Type-level exhaustiveness — if union expands, TS catches.
  const _exhaustive: never = architecture;
  throw new Error(`Unknown architecture value: ${String(_exhaustive)}`);
}
