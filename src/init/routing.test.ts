import { describe, expect, it } from "vitest";

import type { DoctorCheck } from "../doctor/types.js";
import { decideRoute } from "./routing.js";

/**
 * Helper for building DoctorCheck inputs in tests.
 */
function check(
  id: string,
  status: "pass" | "warn" | "fail",
  message = "",
): DoctorCheck {
  return {
    id,
    category: "state-detection",
    status,
    message: message || `${id} ${status}`,
  };
}

describe("decideRoute — 4-route taxonomy per Q4.0.9 + Q4.3.2 locks", () => {
  it("returns 'automated' when ADRs pass + code pass + substantive checks pass", () => {
    const checks: DoctorCheck[] = [
      check("state-detection.adrs.count", "pass"),
      check("state-detection.code.present", "pass"),
      check("state-detection.code.substantive", "pass"),
      check("state-detection.readme.present", "pass"),
      check("state-detection.readme.substantive", "pass"),
      check("state-detection.design_md.present", "pass"),
      check("state-detection.design_md.substantive", "pass"),
    ];
    expect(decideRoute(checks)).toEqual({ kind: "automated" });
  });

  it("returns 'new-project' when both code.present and adrs.count are warn", () => {
    const checks: DoctorCheck[] = [
      check("state-detection.adrs.count", "warn", "ADR directory not found"),
      check("state-detection.code.present", "warn", "no source files detected"),
    ];
    expect(decideRoute(checks)).toEqual({ kind: "new-project" });
  });

  it("returns 'missing-adrs' when adrs.count warn but code.present pass", () => {
    const checks: DoctorCheck[] = [
      check("state-detection.adrs.count", "warn"),
      check("state-detection.code.present", "pass"),
    ];
    expect(decideRoute(checks)).toEqual({ kind: "missing-adrs" });
  });

  it("returns 'automated-with-warning' when ADRs pass + code pass but README sparse", () => {
    const checks: DoctorCheck[] = [
      check("state-detection.adrs.count", "pass"),
      check("state-detection.code.present", "pass"),
      check("state-detection.readme.substantive", "warn", "README.md sparse"),
    ];
    const route = decideRoute(checks);
    expect(route.kind).toBe("automated-with-warning");
    if (route.kind === "automated-with-warning") {
      expect(route.warnings).toEqual(["README.md sparse"]);
    }
  });

  it("collects multiple warnings into automated-with-warning route", () => {
    const checks: DoctorCheck[] = [
      check("state-detection.adrs.count", "pass"),
      check("state-detection.code.present", "pass"),
      check("state-detection.code.substantive", "warn", "code sparse"),
      check("state-detection.readme.substantive", "warn", "README sparse"),
      check("state-detection.design_md.substantive", "warn", "DESIGN.md sparse"),
    ];
    const route = decideRoute(checks);
    expect(route.kind).toBe("automated-with-warning");
    if (route.kind === "automated-with-warning") {
      expect(route.warnings).toEqual([
        "code sparse",
        "README sparse",
        "DESIGN.md sparse",
      ]);
    }
  });

  it("priority: new-project beats missing-adrs (both code+ADRs warn)", () => {
    // Even if substantive warnings present, new-project wins when both
    // code.present and adrs.count are warn.
    const checks: DoctorCheck[] = [
      check("state-detection.adrs.count", "warn"),
      check("state-detection.code.present", "warn"),
      check("state-detection.readme.substantive", "warn", "README sparse"),
    ];
    expect(decideRoute(checks)).toEqual({ kind: "new-project" });
  });

  it("priority: missing-adrs beats automated-with-warning", () => {
    // No ADRs but DESIGN.md sparse → missing-adrs (priority 2), not warning (priority 3).
    const checks: DoctorCheck[] = [
      check("state-detection.adrs.count", "warn"),
      check("state-detection.code.present", "pass"),
      check("state-detection.design_md.substantive", "warn", "DESIGN sparse"),
    ];
    expect(decideRoute(checks)).toEqual({ kind: "missing-adrs" });
  });

  it("handles missing checks gracefully (no state-detection.adrs.count)", () => {
    // Defensive: if doctor didn't run state-detection (limited mode
    // edge case), decideRoute should default to automated rather than
    // false-positive interactive route.
    const checks: DoctorCheck[] = [];
    expect(decideRoute(checks)).toEqual({ kind: "automated" });
  });

  it("returns automated when no state-detection checks present (defensive)", () => {
    // Only non-state-detection checks present.
    const checks: DoctorCheck[] = [
      { id: "config.parses", category: "config", status: "pass", message: "" },
      { id: "atlas.present", category: "atlas", status: "pass", message: "" },
    ];
    expect(decideRoute(checks)).toEqual({ kind: "automated" });
  });

  it("ignores non-state-detection checks", () => {
    // Routing decision is state-detection-only; other categories don't
    // influence route (their FAILs surface as doctor first-run abort
    // upstream in runner.ts; not routing-module concern).
    const checks: DoctorCheck[] = [
      check("state-detection.adrs.count", "pass"),
      check("state-detection.code.present", "pass"),
      { id: "lsp.spawn_test", category: "lsp", status: "fail", message: "irrelevant to routing" },
    ];
    expect(decideRoute(checks)).toEqual({ kind: "automated" });
  });
});
