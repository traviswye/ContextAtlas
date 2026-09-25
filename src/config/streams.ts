/**
 * `extraction.streams` at the point of use (v1.2 Phase 2; SCOPE D-1).
 *
 * The parser validates the key and stores it in canonical order, but
 * applies no default: an absent key stays absent in the parsed config
 * (like `extraction.exclude_pattern`, whose defaults are applied by
 * `computeExcludePatterns`). Callers ask this module which streams are
 * enabled instead of reading `config.extraction?.streams` directly, so
 * the default lives in one place.
 *
 * Config vs pipeline names: the config value `adr` is the stream the
 * extraction pipeline calls `prose` (`SourceStream` in
 * `src/extraction/source-keys.ts`). It covers `adrs.path` AND
 * `docs.include` files, all extracted with claim source
 * `adr:<basename>`. `docstring` and `commit` have the same name on both
 * sides. `sourceStreamOf` / `extractionStreamOf` convert between them.
 *
 * The parser is the validation boundary. These helpers do not
 * re-validate configs built in code; they only fix the order.
 */

// Type-only import: erased at compile time, so config/ gains no
// runtime dependency on extraction/.
import type { SourceStream } from "../extraction/source-keys.js";
import type { ContextAtlasConfig, ExtractionStream } from "../types.js";

import { DEFAULT_EXTRACTION_STREAMS } from "./defaults.js";

const SOURCE_STREAM_OF: Readonly<Record<ExtractionStream, SourceStream>> = {
  adr: "prose",
  docstring: "docstring",
  commit: "commit",
};

const EXTRACTION_STREAM_OF: Readonly<Record<SourceStream, ExtractionStream>> =
  {
    prose: "adr",
    docstring: "docstring",
    commit: "commit",
  };

/**
 * The streams extraction should run: `extraction.streams` when set,
 * otherwise all three. The set iterates in canonical execution order
 * (adr, docstring, commit) whatever order the config lists them in.
 */
export function resolveExtractionStreams(
  config: Pick<ContextAtlasConfig, "extraction">,
): ReadonlySet<ExtractionStream> {
  const configured = config.extraction?.streams;
  if (configured === undefined) return new Set(DEFAULT_EXTRACTION_STREAMS);
  const wanted = new Set(configured);
  return new Set(DEFAULT_EXTRACTION_STREAMS.filter((s) => wanted.has(s)));
}

/** True when `extraction.streams` is absent (the all-streams default). */
export function usesDefaultExtractionStreams(
  config: Pick<ContextAtlasConfig, "extraction">,
): boolean {
  return config.extraction?.streams === undefined;
}

/** Streams not in `enabled`, in canonical order. */
export function disabledExtractionStreams(
  enabled: ReadonlySet<ExtractionStream>,
): ExtractionStream[] {
  return DEFAULT_EXTRACTION_STREAMS.filter((s) => !enabled.has(s));
}

/** Pipeline stream for a config stream (`adr` → `prose`). */
export function sourceStreamOf(stream: ExtractionStream): SourceStream {
  return SOURCE_STREAM_OF[stream];
}

/** Config stream for a pipeline stream (`prose` → `adr`). */
export function extractionStreamOf(stream: SourceStream): ExtractionStream {
  return EXTRACTION_STREAM_OF[stream];
}
