import { describe, expect, it } from "vitest";

import type { DoctorCheck, DoctorResult } from "../types.js";
import { formatText } from "./text.js";

/**
 * Bug-prevention tests for doctor text formatter per hotfix at v0.6
 * Step 5.1 surface (CATEGORY_LABEL + order array missing
 * "state-detection" key since Step 3.3 ship; vitest didn't catch
 * because tests asserted exit codes not formatted output content;
 * matches v0.3 Commit 0.5 prose-string case pattern from CLAUDE.md).
 *
 * Defensive coverage: every CheckCategory union member must produce
 * a section header in the formatted output when checks of that
 * category are present. Type-level exhaustiveness on
 * Record<CheckCategory, string> is what surfaced the bug at compile
 * time; runtime tests below lock the formatter behavior so any
 * future CheckCategory addition without formatter update fails fast.
 */

function makeCheck(
  id: string,
  category: DoctorCheck["category"],
  status: DoctorCheck["status"] = "pass",
  message = "test message",
): DoctorCheck {
  return { id, category, status, message };
}

function makeResult(checks: DoctorCheck[]): DoctorResult {
  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) summary[c.status]++;
  return {
    doctorVersion: "test",
    repoRoot: "/test/repo",
    checks,
    summary,
    exitCode: summary.fail > 0 ? 1 : 0,
  };
}

describe("formatText — section headers per CheckCategory", () => {
  it("renders 'Config' header when config checks present", () => {
    const out = formatText(makeResult([makeCheck("config.parses", "config")]));
    expect(out).toContain("Config");
  });

  it("renders 'Atlas' header when atlas checks present", () => {
    const out = formatText(makeResult([makeCheck("atlas.present", "atlas")]));
    expect(out).toContain("Atlas");
  });

  it("renders 'SHA / Schema' header when sha checks present", () => {
    const out = formatText(makeResult([makeCheck("sha.match", "sha")]));
    expect(out).toContain("SHA / Schema");
  });

  it("renders 'LSP' header when lsp checks present", () => {
    const out = formatText(makeResult([makeCheck("lsp.spawn_test", "lsp")]));
    expect(out).toContain("LSP");
  });

  it("renders 'Extraction prerequisites' header when extraction checks present", () => {
    const out = formatText(
      makeResult([makeCheck("extraction.api_key", "extraction")]),
    );
    expect(out).toContain("Extraction prerequisites");
  });

  it("renders 'State detection' header when state-detection checks present (Step 3.3 + hotfix lock)", () => {
    const out = formatText(
      makeResult([
        makeCheck("state-detection.adrs.count", "state-detection"),
      ]),
    );
    expect(out).toContain("State detection");
  });

  it("includes check id + message in output for state-detection category", () => {
    const out = formatText(
      makeResult([
        makeCheck(
          "state-detection.adrs.count",
          "state-detection",
          "pass",
          "3 ADR(s) detected",
        ),
      ]),
    );
    expect(out).toContain("state-detection.adrs.count");
    expect(out).toContain("3 ADR(s) detected");
  });

  it("renders summary line + exit code", () => {
    const out = formatText(
      makeResult([
        makeCheck("config.parses", "config", "pass"),
        makeCheck("atlas.present", "atlas", "warn"),
      ]),
    );
    expect(out).toContain("Summary: 1 PASS, 1 WARN, 0 FAIL");
    expect(out).toContain("Exit code:");
  });
});
