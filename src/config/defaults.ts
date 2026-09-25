/**
 * Default values for optional ContextAtlas config fields.
 *
 * Applied at parse time when a field is omitted from `.contextatlas.yml`.
 * Kept as a separate module so they're easy to reference from docs,
 * tests, and any `contextatlas init` scaffold command we add later.
 *
 * Exception: `DEFAULT_EXTRACTION_STREAMS` is applied where the value
 * is used (`resolveExtractionStreams` in `./streams.ts`), not at parse
 * time, like the other `extraction` knobs.
 */

import type { ExtractionStream } from "../types.js";

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

/**
 * Execution position of each `extraction.streams` value (v1.2 Phase
 * 2; lead decision L-6): prose (`adr`) first, so its all-files-failed
 * error can never discard paid work of a later stream, then
 * docstring, then commit. The order in a user's config list is
 * ignored.
 *
 * A `Record<ExtractionStream, …>`, like `REGISTERED_LANGUAGE_EXTENSIONS`
 * (`src/extraction/source-keys.ts`): adding a member to
 * `ExtractionStream` fails compilation until it has a slot here, so
 * the parser allowlist below cannot drift from the type (the v1.1.1
 * `VALID_LANGUAGES` hotfix, 73b69df, is the lesson).
 */
const EXTRACTION_STREAM_POSITION: Readonly<Record<ExtractionStream, number>> =
  {
    adr: 0,
    docstring: 1,
    commit: 2,
  };

/**
 * Every value `extraction.streams` accepts, in execution order. It is
 * the parser's allowlist, the canonical order the parser stores a
 * user's list in, and the default when the key is absent (all three
 * streams).
 */
export const DEFAULT_EXTRACTION_STREAMS: readonly ExtractionStream[] =
  Object.freeze(
    (Object.keys(EXTRACTION_STREAM_POSITION) as ExtractionStream[]).sort(
      (a, b) => EXTRACTION_STREAM_POSITION[a] - EXTRACTION_STREAM_POSITION[b],
    ),
  );
