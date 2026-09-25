import { describe, expect, it } from "vitest";

import type { ContextAtlasConfig } from "../types.js";

import { DEFAULT_EXTRACTION_STREAMS } from "./defaults.js";
import {
  disabledExtractionStreams,
  extractionStreamOf,
  resolveExtractionStreams,
  sourceStreamOf,
  usesDefaultExtractionStreams,
} from "./streams.js";

function withExtraction(
  extraction: ContextAtlasConfig["extraction"],
): Pick<ContextAtlasConfig, "extraction"> {
  return extraction === undefined ? {} : { extraction };
}

describe("DEFAULT_EXTRACTION_STREAMS", () => {
  it("lists every stream in execution order: adr, docstring, commit", () => {
    expect([...DEFAULT_EXTRACTION_STREAMS]).toEqual([
      "adr",
      "docstring",
      "commit",
    ]);
  });

  it("is frozen (callers cannot reorder the shared allowlist)", () => {
    expect(Object.isFrozen(DEFAULT_EXTRACTION_STREAMS)).toBe(true);
  });
});

describe("resolveExtractionStreams", () => {
  it("extraction section absent → all three streams", () => {
    expect([...resolveExtractionStreams(withExtraction(undefined))]).toEqual([
      "adr",
      "docstring",
      "commit",
    ]);
  });

  it("extraction present without streams → all three streams", () => {
    const streams = resolveExtractionStreams(
      withExtraction({ budgetWarnUsd: 1 }),
    );
    expect([...streams]).toEqual(["adr", "docstring", "commit"]);
  });

  it("configured subset → exactly that subset", () => {
    const streams = resolveExtractionStreams(
      withExtraction({ streams: ["adr", "commit"] }),
    );
    expect([...streams]).toEqual(["adr", "commit"]);
    expect(streams.has("docstring")).toBe(false);
  });

  it("iterates in canonical order even when a programmatic config lists streams out of order", () => {
    const streams = resolveExtractionStreams(
      withExtraction({ streams: ["commit", "docstring", "adr"] }),
    );
    expect([...streams]).toEqual(["adr", "docstring", "commit"]);
  });
});

describe("usesDefaultExtractionStreams", () => {
  it("true when the key is absent", () => {
    expect(usesDefaultExtractionStreams(withExtraction(undefined))).toBe(true);
    expect(
      usesDefaultExtractionStreams(withExtraction({ budgetWarnUsd: 1 })),
    ).toBe(true);
  });

  it("false when the key is set, even to all three", () => {
    expect(
      usesDefaultExtractionStreams(
        withExtraction({ streams: ["adr", "docstring", "commit"] }),
      ),
    ).toBe(false);
  });
});

describe("disabledExtractionStreams", () => {
  it("empty when every stream is enabled", () => {
    expect(
      disabledExtractionStreams(resolveExtractionStreams(withExtraction(undefined))),
    ).toEqual([]);
  });

  it("returns the streams not enabled, in canonical order", () => {
    expect(disabledExtractionStreams(new Set(["adr"] as const))).toEqual([
      "docstring",
      "commit",
    ]);
  });
});

describe("config stream ↔ pipeline stream mapping", () => {
  it("maps the config name adr to the internal prose stream", () => {
    expect(sourceStreamOf("adr")).toBe("prose");
    expect(sourceStreamOf("docstring")).toBe("docstring");
    expect(sourceStreamOf("commit")).toBe("commit");
  });

  it("maps internal prose back to adr", () => {
    expect(extractionStreamOf("prose")).toBe("adr");
    expect(extractionStreamOf("docstring")).toBe("docstring");
    expect(extractionStreamOf("commit")).toBe("commit");
  });

  it("round-trips every configurable stream", () => {
    for (const stream of DEFAULT_EXTRACTION_STREAMS) {
      expect(extractionStreamOf(sourceStreamOf(stream))).toBe(stream);
    }
  });
});
