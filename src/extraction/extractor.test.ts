import { describe, expect, it } from "vitest";

import {
  ExtractionSetupError,
  type CostModel,
  type Extractor,
  type ExtractorContext,
  type ExtractionResult,
} from "./extractor.js";

describe("Extractor interface (Strategy pattern wrapper)", () => {
  it("CostModel type accepts 'api' and 'subscription-bounded' string literals", () => {
    const api: CostModel = "api";
    const sub: CostModel = "subscription-bounded";
    expect(api).toBe("api");
    expect(sub).toBe("subscription-bounded");
  });

  it("ExtractionResult shape wraps pipelineResult + costModel", () => {
    const result: ExtractionResult = {
      pipelineResult: {
        filesExtracted: 0,
        filesUnchanged: 0,
        filesDeleted: 0,
        claimsWritten: 0,
        symbolsIndexed: 0,
        unresolvedCandidates: 0,
        unresolvedFrontmatterHints: 0,
        extractionErrors: [],
        atlasExported: false,
        wallClockMs: 0,
        apiCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        unresolvedDetails: [],
      },
      costModel: "api",
    };
    expect(result.costModel).toBe("api");
    expect(result.pipelineResult.filesExtracted).toBe(0);
  });

  it("Extractor interface exposes costModel readonly property + extract() method", () => {
    const stubExtractor: Extractor = {
      costModel: "api",
      extract: async (_context: ExtractorContext): Promise<ExtractionResult> => ({
        pipelineResult: {
          filesExtracted: 0,
          filesUnchanged: 0,
          filesDeleted: 0,
          claimsWritten: 0,
          symbolsIndexed: 0,
          unresolvedCandidates: 0,
          unresolvedFrontmatterHints: 0,
          extractionErrors: [],
          atlasExported: false,
          wallClockMs: 0,
          apiCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          unresolvedDetails: [],
        },
        costModel: "api",
      }),
    };
    expect(stubExtractor.costModel).toBe("api");
    expect(typeof stubExtractor.extract).toBe("function");
  });
});

describe("ExtractionSetupError (ADR-12 exit-code mapping discipline)", () => {
  it("ExtractionSetupError extends Error with kind: 'setup' marker", () => {
    const err = new ExtractionSetupError("test setup error");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ExtractionSetupError);
    expect(err.kind).toBe("setup");
    expect(err.name).toBe("ExtractionSetupError");
    expect(err.message).toBe("test setup error");
  });

  it("ExtractionSetupError instanceof check distinguishes from generic Error", () => {
    const setupErr = new ExtractionSetupError("setup");
    const genericErr = new Error("generic");
    expect(setupErr instanceof ExtractionSetupError).toBe(true);
    expect(genericErr instanceof ExtractionSetupError).toBe(false);
  });
});
