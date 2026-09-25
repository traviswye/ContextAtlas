import { afterEach, describe, expect, it, vi } from "vitest";

import { computeCostUsd } from "./pricing.js";
import { RunCostTracker } from "./run-cost.js";

function spyWarnings() {
  const lines: string[] = [];
  const spy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown): boolean => {
      const text = String(chunk);
      if (text.includes("[warn]")) lines.push(text);
      return true;
    });
  return { lines, spy };
}

describe("RunCostTracker", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accumulates calls and usage across streams", () => {
    const t = new RunCostTracker(undefined);
    t.addCalls(2);
    t.addUsage({ inputTokens: 100, outputTokens: 50 });
    t.addCalls(1);
    t.addUsage({ inputTokens: 10, outputTokens: 5 });
    expect(t.apiCalls).toBe(3);
    expect(t.usage).toEqual({ inputTokens: 110, outputTokens: 55 });
    expect(t.costUsd).toBe(computeCostUsd({ inputTokens: 110, outputTokens: 55 }));
  });

  it("warns at most once, only after the budget is exceeded, and never without a budget", () => {
    const { lines } = spyWarnings();
    const none = new RunCostTracker(undefined);
    none.addUsage({ inputTokens: 1_000_000, outputTokens: 0 });
    none.checkBudget();
    expect(lines).toHaveLength(0);

    const t = new RunCostTracker(1);
    t.addUsage({ inputTokens: 100_000, outputTokens: 0 }); // $0.50
    t.checkBudget();
    expect(lines).toHaveLength(0);
    t.addUsage({ inputTokens: 200_000, outputTokens: 0 }); // $1.50
    t.checkBudget();
    t.checkBudget();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("budget warning");
    expect(lines[0]).toContain('"budgetUsd":1');
  });
});
