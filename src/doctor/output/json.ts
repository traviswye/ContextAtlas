/**
 * JSON output formatter for doctor results — machine-readable
 * structured output for downstream tooling (CI checks; v0.5+
 * onboarding-pipeline auto-fix dispatching).
 *
 * Stable shape across versions; `doctor_version` field surfaces
 * the producer for forward-compat.
 */

import type { DoctorResult } from "../types.js";

export function formatJson(result: DoctorResult): string {
  // Snake-case the field names per JSON convention. The DoctorCheck
  // shape is camelCase internally; this transform is the boundary.
  const out = {
    doctor_version: result.doctorVersion,
    repo_root: result.repoRoot,
    checks: result.checks.map((c) => ({
      id: c.id,
      category: c.category,
      status: c.status,
      message: c.message,
      ...(c.detail ? { detail: c.detail } : {}),
    })),
    summary: result.summary,
    exit_code: result.exitCode,
  };
  return JSON.stringify(out, null, 2) + "\n";
}
