import { describe, expect, it } from "vitest";

import { DEFAULT_REFRESH, resolveRefresh, validateRefresh } from "./refresh.js";

describe("refresh config (v1.2 Phase 6)", () => {
  it("is optional and defaults conservatively", () => {
    expect(validateRefresh(undefined, "c.yml")).toBeUndefined();
    expect(resolveRefresh({})).toEqual(DEFAULT_REFRESH);
    expect(DEFAULT_REFRESH).toEqual({
      autoClaims: true,
      maxSourcesPerRun: 25,
      maxTurns: 80,
      minIntervalMinutes: 60,
      maxUtilization: 0.8,
    });
  });

  it("maps snake_case keys over the defaults", () => {
    const parsed = validateRefresh(
      { auto_claims: false, max_sources_per_run: 5, max_turns: 30, min_interval_minutes: 0, max_utilization: 0.5 },
      "c.yml",
    );
    expect(resolveRefresh({ ...(parsed ? { refresh: parsed } : {}) })).toEqual({
      autoClaims: false,
      maxSourcesPerRun: 5,
      maxTurns: 30,
      minIntervalMinutes: 0,
      maxUtilization: 0.5,
    });
  });

  it("rejects unknown keys and out-of-range values with the key name", () => {
    expect(() => validateRefresh({ auto: true }, "c.yml")).toThrow(/Unknown key 'refresh.auto'/);
    expect(() => validateRefresh({ auto_claims: "off" }, "c.yml")).toThrow(/refresh.auto_claims/);
    expect(() => validateRefresh({ max_sources_per_run: 0 }, "c.yml")).toThrow(/refresh.max_sources_per_run/);
    expect(() => validateRefresh({ max_turns: 2.5 }, "c.yml")).toThrow(/refresh.max_turns/);
    expect(() => validateRefresh({ max_utilization: 80 }, "c.yml")).toThrow(/refresh.max_utilization/);
    expect(() => validateRefresh([], "c.yml")).toThrow(/expected an object/);
  });
});
