import { describe, expect, it } from "vitest";

import {
  buildCostEstimate,
  estimateTokens,
  formatCostEstimateMessage,
} from "./cost-estimator.js";

describe("estimateTokens (rough char/4 approximation)", () => {
  it("approximates token count from character length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("rounds up partial tokens", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("buildCostEstimate (Lock 3 pre-flight estimation)", () => {
  it("computes input tokens as sum of components", () => {
    const estimate = buildCostEstimate({
      promptTokens: 1000,
      codebaseInventoryTokens: 5000,
      referenceContextTokens: 0,
    });
    expect(estimate.inputTokens).toBe(6000);
  });

  it("computes cost range from output token bounds", () => {
    const estimate = buildCostEstimate({
      promptTokens: 1000,
      codebaseInventoryTokens: 50_000,
      referenceContextTokens: 0,
    });
    // Input: 51,000 tokens × $5/M = $0.255
    // Output low: 10k × $25/M = $0.25; high: 75k × $25/M = $1.875
    // Total range: $0.505 - $2.13
    expect(estimate.costUsdLow).toBeCloseTo(0.505, 2);
    expect(estimate.costUsdHigh).toBeCloseTo(2.13, 2);
  });

  it("includes reference-context tokens in input total", () => {
    const estimate = buildCostEstimate({
      promptTokens: 1000,
      codebaseInventoryTokens: 5000,
      referenceContextTokens: 100_000,
    });
    expect(estimate.inputTokens).toBe(106_000);
  });
});

describe("formatCostEstimateMessage (Lock 3 pre-flight message)", () => {
  it("renders multi-line human-readable summary", () => {
    const estimate = buildCostEstimate({
      promptTokens: 3000,
      codebaseInventoryTokens: 80_000,
      referenceContextTokens: 0,
    });
    const msg = formatCostEstimateMessage(estimate, {
      promptTokens: 3000,
      codebaseInventoryTokens: 80_000,
      referenceContextTokens: 0,
    });
    expect(msg).toContain("Estimating generate-adrs cost");
    expect(msg).toContain("Codebase inventory");
    expect(msg).toContain("Prompt");
    expect(msg).toContain("Estimated input");
    expect(msg).toContain("Estimated output");
    expect(msg).toContain("Estimated cost");
    expect(msg).toContain("one-time-per-repo");
  });

  it("omits reference-context line when reference tokens are zero", () => {
    const estimate = buildCostEstimate({
      promptTokens: 3000,
      codebaseInventoryTokens: 80_000,
      referenceContextTokens: 0,
    });
    const msg = formatCostEstimateMessage(estimate, {
      promptTokens: 3000,
      codebaseInventoryTokens: 80_000,
      referenceContextTokens: 0,
    });
    expect(msg).not.toContain("Reference context");
  });

  it("includes reference-context path when provided", () => {
    const estimate = buildCostEstimate({
      promptTokens: 3000,
      codebaseInventoryTokens: 80_000,
      referenceContextTokens: 50_000,
    });
    const msg = formatCostEstimateMessage(
      estimate,
      {
        promptTokens: 3000,
        codebaseInventoryTokens: 80_000,
        referenceContextTokens: 50_000,
      },
      "/home/user/django/deps",
    );
    expect(msg).toContain("Reference context");
    expect(msg).toContain("/home/user/django/deps");
  });

  it("includes Opus 4.7 pricing breakdown text", () => {
    const estimate = buildCostEstimate({
      promptTokens: 3000,
      codebaseInventoryTokens: 80_000,
      referenceContextTokens: 0,
    });
    const msg = formatCostEstimateMessage(estimate, {
      promptTokens: 3000,
      codebaseInventoryTokens: 80_000,
      referenceContextTokens: 0,
    });
    expect(msg).toContain("Opus 4.7");
    expect(msg).toContain("$5/M input");
    expect(msg).toContain("$25/M output");
  });
});
