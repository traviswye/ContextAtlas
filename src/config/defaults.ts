/**
 * Default values for optional ContextAtlas config fields.
 *
 * Applied at parse time when a field is omitted from `.contextatlas.yml`.
 * Kept as a separate module so they're easy to reference from docs,
 * tests, and any `contextatlas init` scaffold command we add later.
 */

export const DEFAULT_DOCS_INCLUDE = [
  "README.md",
  "docs/**/*.md",
  "CONTRIBUTING.md",
] as const;

export const DEFAULT_GIT_RECENT_COMMITS = 5;

export const DEFAULT_INDEX_MODEL = "claude-opus-4-7";

export const DEFAULT_ADRS_FORMAT = "markdown-frontmatter" as const;

export const DEFAULT_ATLAS = {
  committed: true,
  path: ".contextatlas/atlas.json",
  localCache: ".contextatlas/index.db",
} as const;

export const DEFAULT_CONFIG_FILENAME = ".contextatlas.yml";
