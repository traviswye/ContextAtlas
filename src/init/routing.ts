/**
 * H5 state-driven routing decision module per v0.6 Step 4.3 (Q4.0.3 +
 * Q4.0.9 + Q4.3.2 locks). Pure function consuming
 * stateDetectionChecks output (DoctorCheck[]); produces Route enum.
 *
 * Routing taxonomy (4 routes per Q4.0.9 lock at v0.6 Step 4.0
 * design adjudications):
 *   - automated: existing-repo-with-ADRs path (no interactive prompts)
 *   - automated-with-warning: substantive-content-warning advisory
 *     surfaced inline within automated path
 *   - missing-adrs: existing-repo-missing-ADRs (interactive guidance;
 *     non-blocking exit per Q4.0.9 + Q4.3.5 locks → exit code 0)
 *   - new-project: empty/sparse repo (interactive guidance;
 *     non-blocking exit per Q4.0.9 + Q4.3.5 → exit code 0)
 *
 * Decision testable in isolation with mocked DoctorCheck inputs.
 * Decision-table priority order per Q4.3.2 lock:
 *   1. new-project (no code AND no ADRs)
 *   2. missing-adrs (code present but no ADRs)
 *   3. automated-with-warning (substantive content warnings)
 *   4. automated (clean state)
 */

import type { DoctorCheck } from "../doctor/types.js";

export type Route =
  | { readonly kind: "automated" }
  | {
      readonly kind: "automated-with-warning";
      readonly warnings: readonly string[];
    }
  | { readonly kind: "missing-adrs" }
  | { readonly kind: "new-project" };

const SUBSTANTIVE_CHECK_IDS = [
  "state-detection.code.substantive",
  "state-detection.readme.substantive",
  "state-detection.design_md.substantive",
] as const;

/**
 * Pure function producing Route from doctor check output. Consumes
 * `state-detection.*` check IDs only; ignores other categories
 * (config / atlas / sha / lsp / extraction).
 */
export function decideRoute(checks: readonly DoctorCheck[]): Route {
  const checkById = new Map<string, DoctorCheck>();
  for (const c of checks) checkById.set(c.id, c);

  const adrCheck = checkById.get("state-detection.adrs.count");
  const codeCheck = checkById.get("state-detection.code.present");

  // Priority 1: new-project (no code AND no ADRs)
  if (codeCheck?.status === "warn" && adrCheck?.status === "warn") {
    return { kind: "new-project" };
  }

  // Priority 2: missing-adrs (no ADRs but code present OR no code-check
  // result; defensive default treats missing code-check as code-present
  // to avoid false-positive new-project route)
  if (adrCheck?.status === "warn") {
    return { kind: "missing-adrs" };
  }

  // Priority 3: substantive-content-warning advisory inline
  const warnings: string[] = [];
  for (const id of SUBSTANTIVE_CHECK_IDS) {
    const c = checkById.get(id);
    if (c?.status === "warn") {
      warnings.push(c.message);
    }
  }
  if (warnings.length > 0) {
    return { kind: "automated-with-warning", warnings };
  }

  // Priority 4: clean automated
  return { kind: "automated" };
}
