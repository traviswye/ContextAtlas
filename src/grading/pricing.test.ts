import { describe, expect, it } from "vitest";

import {
  addUsage,
  computeCostUsd,
  OPUS_47_INPUT_USD_PER_MTOKEN,
  OPUS_47_OUTPUT_USD_PER_MTOKEN,
  SONNET_46_INPUT_USD_PER_MTOKEN,
  SONNET_46_OUTPUT_USD_PER_MTOKEN,
  ZERO_USAGE,
} from "./pricing.js";

describe("computeCostUsd — Sonnet 4.6", () => {
  it("zero tokens → zero cost", () => {
    expect(computeCostUsd(ZERO_USAGE, "claude-sonnet-4-6")).toBe(0);
  });

  it("1M input tokens → Sonnet 4.6 input rate", () => {
    expect(
      computeCostUsd(
        { inputTokens: 1_000_000, outputTokens: 0 },
        "claude-sonnet-4-6",
      ),
    ).toBeCloseTo(SONNET_46_INPUT_USD_PER_MTOKEN, 6);
  });

  it("1M output tokens → Sonnet 4.6 output rate", () => {
    expect(
      computeCostUsd(
        { inputTokens: 0, outputTokens: 1_000_000 },
        "claude-sonnet-4-6",
      ),
    ).toBeCloseTo(SONNET_46_OUTPUT_USD_PER_MTOKEN, 6);
  });

  it("typical judge call: 2k input + 500 output → $0.0135", () => {
    // 2k input @ $3/M = $0.006; 500 output @ $15/M = $0.0075; total $0.0135
    expect(
      computeCostUsd(
        { inputTokens: 2_000, outputTokens: 500 },
        "claude-sonnet-4-6",
      ),
    ).toBeCloseTo(0.0135, 6);
  });
});

describe("computeCostUsd — Opus 4.7", () => {
  it("zero tokens → zero cost", () => {
    expect(computeCostUsd(ZERO_USAGE, "claude-opus-4-7")).toBe(0);
  });

  it("1M input tokens → Opus 4.7 input rate", () => {
    expect(
      computeCostUsd(
        { inputTokens: 1_000_000, outputTokens: 0 },
        "claude-opus-4-7",
      ),
    ).toBeCloseTo(OPUS_47_INPUT_USD_PER_MTOKEN, 6);
  });

  it("1M output tokens → Opus 4.7 output rate", () => {
    expect(
      computeCostUsd(
        { inputTokens: 0, outputTokens: 1_000_000 },
        "claude-opus-4-7",
      ),
    ).toBeCloseTo(OPUS_47_OUTPUT_USD_PER_MTOKEN, 6);
  });

  it("typical escalation grading: 2k input + 500 output → $0.0225", () => {
    // 2k input @ $5/M = $0.010; 500 output @ $25/M = $0.0125; total $0.0225
    expect(
      computeCostUsd(
        { inputTokens: 2_000, outputTokens: 500 },
        "claude-opus-4-7",
      ),
    ).toBeCloseTo(0.0225, 6);
  });

  it("Opus is exactly 5/3x Sonnet at same token counts", () => {
    // Both rates are 5/3x Sonnet's; ratio invariant captures the
    // 1.67x observation Travis flagged for Step 6 recalculation.
    const usage = { inputTokens: 10_000, outputTokens: 5_000 };
    const sonnetCost = computeCostUsd(usage, "claude-sonnet-4-6");
    const opusCost = computeCostUsd(usage, "claude-opus-4-7");
    expect(opusCost / sonnetCost).toBeCloseTo(5 / 3, 6);
  });
});

describe("computeCostUsd — type safety", () => {
  it("invalid model surfaces compile-time error, not runtime error", () => {
    // @ts-expect-error — "claude-haiku-4-5" is not a valid ModelId.
    // The directive expects a type error on the next line; if TypeScript
    // ever permits this call without error (e.g., ModelId widens), this
    // test fails to compile, surfacing the regression.
    computeCostUsd(ZERO_USAGE, "claude-haiku-4-5");
    expect(true).toBe(true);
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

  it("accumulates across 3+ items via reduce", () => {
    const items = [
      { inputTokens: 10, outputTokens: 1 },
      { inputTokens: 20, outputTokens: 2 },
      { inputTokens: 30, outputTokens: 3 },
    ];
    const sum = items.reduce(addUsage, ZERO_USAGE);
    expect(sum).toEqual({ inputTokens: 60, outputTokens: 6 });
  });
});
