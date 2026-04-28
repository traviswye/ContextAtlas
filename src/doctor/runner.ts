/**
 * Doctor subcommand — diagnostic-only self-check for ContextAtlas
 * configuration + state.
 *
 * v0.4 STUB — full implementation per STEP-PLAN-V0.4.md Step 8:
 *   - Step 8.1 — Doctor script CLI surface (this file is the
 *     subcommand-on-existing-CLI per OQ1 default lean)
 *   - Step 8.2 — Diagnostic checks (config + atlas + SHA + schema +
 *     LSP + extraction-prerequisites)
 *   - Step 8.3 — Output format (text + --json flag per OQ2 default)
 *   - Step 8.4-8.5 — Acceptance tests (contextatlas + cobra HEAD)
 *   - Step 8.6 — Test coverage
 *
 * Per [`v0.4-SCOPE.md`](../../v0.4-SCOPE.md) Stream B doctor script
 * subsection.
 *
 * Per ADR-12 subcommand-vs-flag partition: doctor is its own
 * subcommand path, not a flag on the default mcp invocation.
 */

export interface DoctorRunResult {
  readonly exitCode: number;
}

/**
 * Run the doctor subcommand. STUB — emits a not-yet-implemented
 * notice on stderr and exits cleanly. Substantive implementation
 * lands at STEP-PLAN-V0.4.md Step 8.
 */
export async function runDoctorSubcommand(): Promise<DoctorRunResult> {
  process.stderr.write(
    "doctor: not yet implemented (v0.4 Stream B; Step 8 per STEP-PLAN-V0.4)\n",
  );
  return { exitCode: 0 };
}
