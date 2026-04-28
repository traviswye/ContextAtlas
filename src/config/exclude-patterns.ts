/**
 * Per-language default exclusion glob patterns + utilities for
 * combining them with user-provided augmentations.
 *
 * v0.4 Step 2 (A4) ships extraction-time test-file exclusion via
 * config-driven glob patterns, replacing v0.3's no-op default
 * (extraction included test files; only query-time isTestFile
 * ranking treated them specially).
 *
 * User-override semantics: AUGMENT-ONLY in v0.4. User patterns
 * ADD to language defaults; defaults always apply. Empty
 * `exclude_pattern: []` means no augmentation (defaults still
 * apply). For zero exclusions including defaults, a future
 * replace-mode flag is a v0.5+ candidate; not implemented here.
 *
 * Patterns are minimatch globs evaluated against repo-relative
 * forward-slash paths. Per-language defaults align with the
 * filename-pattern conventions in `src/utils/test-files.ts`
 * (query-time ranking) plus broader directory matchers
 * (`tests/`, `test/`) addressing the v0.4-SCOPE.md A4 motivation
 * (`runtime-tests/`, `benchmarks/test/` directories that
 * filename-match alone would miss).
 */

import type { ContextAtlasConfig, LanguageCode } from "../types.js";

/**
 * Default exclusion patterns per language. Combined into the
 * effective pattern set by `computeExcludePatterns` based on the
 * `languages` array in the user's config.
 *
 * Patterns use forward-slash glob syntax (minimatch). Repo-relative
 * matching — `**` covers any depth.
 */
export const DEFAULT_EXCLUDE_PATTERNS: Record<
  LanguageCode,
  readonly string[]
> = {
  typescript: [
    "**/tests/**",
    "**/test/**",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
  ],
  python: [
    "**/tests/**",
    "**/test/**",
    "**/test_*.py",
    "**/*_test.py",
  ],
  go: [
    "**/tests/**",
    "**/*_test.go",
  ],
};

/**
 * Compute the effective exclusion-pattern set for an extraction
 * run. Combines per-language defaults (driven by
 * `config.languages`) with user augmentations
 * (`config.extraction.excludePattern`).
 *
 * Augment-only semantics — user patterns ADD to defaults; never
 * replace. Duplicate patterns are deduplicated.
 */
export function computeExcludePatterns(
  config: Pick<ContextAtlasConfig, "languages" | "extraction">,
): string[] {
  const out = new Set<string>();
  for (const lang of config.languages) {
    for (const pattern of DEFAULT_EXCLUDE_PATTERNS[lang]) {
      out.add(pattern);
    }
  }
  const userPatterns = config.extraction?.excludePattern ?? [];
  for (const pattern of userPatterns) {
    out.add(pattern);
  }
  return Array.from(out);
}
