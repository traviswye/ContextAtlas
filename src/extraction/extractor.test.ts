import { describe, expect, it } from "vitest";

import type {
  CostModel,
  Extractor,
  ExtractorContext,
  ExtractionResult,
} from "./extractor.js";

describe("Extractor interface (Strategy pattern wrapper)", () => {
  it("CostModel type accepts 'api' and 'subscription-bounded' string literals", () => {
    const api: CostModel = "api";
    const sub: CostModel = "subscription-bounded";
    expect(api).toBe("api");
    expect(sub).toBe("subscription-bounded");
  });

  it("ExtractionResult shape includes claims + file counts + token counts + cost accounting", () => {
    const result: ExtractionResult = {
      claims: [],
      files_extracted: 0,
      files_unchanged: 0,
      files_deleted: 0,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      cost_model: "api",
    };
    expect(result.claims).toEqual([]);
    expect(result.cost_model).toBe("api");
  });

  it("Extractor interface exposes costModel readonly property + extract() method", () => {
    const stubExtractor: Extractor = {
      costModel: "api",
      extract: async (_context: ExtractorContext): Promise<ExtractionResult> => ({
        claims: [],
        files_extracted: 0,
        files_unchanged: 0,
        files_deleted: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        cost_model: "api",
      }),
    };
    expect(stubExtractor.costModel).toBe("api");
    expect(typeof stubExtractor.extract).toBe("function");
  });
});
