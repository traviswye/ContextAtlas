import { describe, expect, it } from "vitest";

import {
  addUsage,
  computeCostUsd,
  OPUS_47_INPUT_USD_PER_MTOKEN,
  OPUS_47_OUTPUT_USD_PER_MTOKEN,
  ZERO_USAGE,
} from "./pricing.js";

describe("computeCostUsd", () => {
  it("zero tokens → zero cost", () => {
    expect(computeCostUsd(ZERO_USAGE)).toBe(0);
  });

  it("1M input tokens → Opus 4.7 input rate", () => {
    expect(
      computeCostUsd({ inputTokens: 1_000_000, outputTokens: 0 }),
    ).toBeCloseTo(OPUS_47_INPUT_USD_PER_MTOKEN, 6);
  });

  it("1M output tokens → Opus 4.7 output rate", () => {
    expect(
      computeCostUsd({ inputTokens: 0, outputTokens: 1_000_000 }),
    ).toBeCloseTo(OPUS_47_OUTPUT_USD_PER_MTOKEN, 6);
  });

  it("mixed tokens compose linearly", () => {
    // 100k input @ $15/M = $1.50; 50k output @ $75/M = $3.75; total $5.25
    expect(
      computeCostUsd({ inputTokens: 100_000, outputTokens: 50_000 }),
    ).toBeCloseTo(5.25, 6);
  });

  it("fractional token counts retain precision", () => {
    // 1234 input + 567 output
    // input: 1234/1e6 * 15 = 0.01851
    // output: 567/1e6 * 75 = 0.042525
    // total: 0.061035
    expect(
      computeCostUsd({ inputTokens: 1234, outputTokens: 567 }),
    ).toBeCloseTo(0.061035, 6);
  });
});

describe("addUsage", () => {
  it("identity: ZERO_USAGE + X = X", () => {
    const x = { inputTokens: 42, outputTokens: 7 };
    expect(addUsage(ZERO_USAGE, x)).toEqual(x);
    expect(addUsage(x, ZERO_USAGE)).toEqual(x);
  });

  it("accumulates componentwise", () => {
    const a = { inputTokens: 100, outputTokens: 50 };
    const b = { inputTokens: 25, outputTokens: 10 };
    expect(addUsage(a, b)).toEqual({ inputTokens: 125, outputTokens: 60 });
  });

  it("is pure — does not mutate inputs", () => {
    const a = { inputTokens: 1, outputTokens: 2 };
    const b = { inputTokens: 3, outputTokens: 4 };
    addUsage(a, b);
    expect(a).toEqual({ inputTokens: 1, outputTokens: 2 });
    expect(b).toEqual({ inputTokens: 3, outputTokens: 4 });
  });
});
