import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { DoctorCheck, DoctorResult } from "../doctor/types.js";
import type { LanguageCode } from "../types.js";
import { runInitSubcommand } from "./runner.js";

/**
 * Step 4.3 behavior tests. Updates Step 4.2 tests to use test seams
 * (collectChecksOverride + detectLanguagesOverride) avoiding real
 * LSP adapter spawn during unit tests per Q4.3 Point 4 lock.
 *
 * Substantive coverage of atlas/smoke/MCP/success-message builds at
 * Steps 4.4-4.5 per Q4.0.13 lock + Q4.2.6 lock (fail-loudly exit
 * code 2 preserved through Step 4.4 for automated paths; final exit
 * code semantics flip at Step 4.5).
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

function makeDoctorResult(checks: DoctorCheck[]): DoctorResult {
  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) summary[c.status]++;
  return {
    doctorVersion: "test",
    repoRoot: "/synthetic",
    checks,
    summary,
    exitCode: summary.fail > 0 ? 1 : 0,
  };
}

const PASSING_AUTOMATED_CHECKS: DoctorCheck[] = [
  check("state-detection.adrs.count", "pass"),
  check("state-detection.code.present", "pass"),
  check("state-detection.code.substantive", "pass"),
  check("state-detection.readme.present", "pass"),
  check("state-detection.readme.substantive", "pass"),
  check("state-detection.design_md.present", "pass"),
  check("state-detection.design_md.substantive", "pass"),
];

describe("runInitSubcommand — Step 4.3 doctor + routing orchestration", () => {
  let tmpRoot: string;
  let stdoutCapture: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "init-runner-"));
    stdoutCapture = "";
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  function captureStdout(chunk: string): void {
    stdoutCapture += chunk;
  }

  it("automated path: doctor passes + clean state → exit code 2 (fail-loudly preserved per Q4.2.6)", async () => {
    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
    });
    expect(result.exitCode).toBe(2);
    expect(stdoutCapture).toContain("proceeding with automated path");
  });

  it("missing-adrs path: ADR warn + code pass → exit code 0 + guidance message", async () => {
    const checks: DoctorCheck[] = [
      check("state-detection.adrs.count", "warn"),
      check("state-detection.code.present", "pass"),
    ];
    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(checks),
    });
    expect(result.exitCode).toBe(0);
    expect(stdoutCapture).toContain("code present but no ADRs found");
    expect(stdoutCapture).toContain("Re-run: contextatlas init");
  });

  it("new-project path: code warn + ADR warn → exit code 0 + guidance message", async () => {
    const checks: DoctorCheck[] = [
      check("state-detection.adrs.count", "warn"),
      check("state-detection.code.present", "warn"),
    ];
    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => [],
      collectChecksOverride: async () => makeDoctorResult(checks),
    });
    expect(result.exitCode).toBe(0);
    expect(stdoutCapture).toContain("empty/sparse project state detected");
    expect(stdoutCapture).toContain("Create README + DESIGN.md");
  });

  it("automated-with-warning path: substantive warn surfaced as advisory inline", async () => {
    const checks: DoctorCheck[] = [
      check("state-detection.adrs.count", "pass"),
      check("state-detection.code.present", "pass"),
      check("state-detection.readme.substantive", "warn", "README.md sparse"),
    ];
    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(checks),
    });
    expect(result.exitCode).toBe(2); // automated-with-warning preserves fail-loudly
    expect(stdoutCapture).toContain("Advisory:");
    expect(stdoutCapture).toContain("README.md sparse");
  });

  it("doctor first-run FAIL aborts: exit code 1 (ADR-12 pipeline-failure)", async () => {
    const checks: DoctorCheck[] = [
      {
        id: "lsp.spawn_test",
        category: "lsp",
        status: "fail",
        message: "typescript-language-server not found",
      },
    ];
    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(checks),
    });
    expect(result.exitCode).toBe(1);
  });

  it("--cc-only true → architecture: claude-code-only in scaffold", async () => {
    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: true,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
    });
    const cfg = await readFile(
      path.join(tmpRoot, ".contextatlas.yml"),
      "utf8",
    );
    expect(cfg).toContain("architecture: claude-code-only");
  });

  it("--cc-only absent → architecture: anthropic-api-claude-code (default)", async () => {
    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
    });
    const cfg = await readFile(
      path.join(tmpRoot, ".contextatlas.yml"),
      "utf8",
    );
    expect(cfg).toContain("architecture: anthropic-api-claude-code");
  });

  it("preserves existing .contextatlas.yml (idempotent skip-when-present per Q4.0.12)", async () => {
    const cfgPath = path.join(tmpRoot, ".contextatlas.yml");
    const existingContent = "version: 1\narchitecture: claude-code-only\nlanguages: [go]\n";
    await writeFile(cfgPath, existingContent, "utf8");

    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false, // would write anthropic-api-... if scaffold ran
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
    });
    const onDisk = await readFile(cfgPath, "utf8");
    expect(onDisk).toBe(existingContent);
  });

  it("H5 detection wiring: scaffold uses detectLanguagesOverride result", async () => {
    const detected: readonly LanguageCode[] = ["typescript", "go"];
    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => detected,
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
    });
    const cfg = await readFile(
      path.join(tmpRoot, ".contextatlas.yml"),
      "utf8",
    );
    expect(cfg).toContain("- typescript");
    expect(cfg).toContain("- go");
  });

  it("falls back to ['typescript'] when detection returns empty (greenfield)", async () => {
    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => [],
      collectChecksOverride: async () => makeDoctorResult([
        check("state-detection.adrs.count", "warn"),
        check("state-detection.code.present", "warn"),
      ]),
    });
    const cfg = await readFile(
      path.join(tmpRoot, ".contextatlas.yml"),
      "utf8",
    );
    expect(cfg).toContain("- typescript");
  });
});
