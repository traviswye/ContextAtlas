import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { DoctorCheck, DoctorResult } from "../doctor/types.js";
import type { IndexCliResult } from "../extraction/cli-runner.js";
import type { LanguageCode } from "../types.js";
import { runInitSubcommand } from "./runner.js";

/**
 * Step 4.4 behavior tests. Updates Step 4.3 tests to use full test
 * seams (collectChecksOverride + detectLanguagesOverride +
 * runIndexSubcommandOverride + resolveBinaryPathOverride) avoiding
 * real LSP adapter spawn / Anthropic API call / dist binary path
 * resolution during unit tests per Q4.0.13 + Q4.4 Point 4 locks.
 *
 * Substantive coverage of success-message UX builds at Step 4.5
 * per Q4.0.8 lock + Q4.2.6 lock (fail-loudly exit code 2 preserved
 * through Step 4.4 for automated paths; final exit code semantics
 * flip at Step 4.5).
 */

const SAMPLE_ATLAS_FIXTURE = path.resolve(
  "test/fixtures/atlas/sample-atlas.json",
);

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

/**
 * Helper that copies the sample atlas fixture into tmp dir so smoke
 * test can succeed during automated-route unit tests. Without this,
 * smoke test fails with "Could not load atlas" (still exit code 2,
 * but for a different reason than the pipeline-fail-loudly Q4.2.6
 * lock the test asserts against).
 */
async function setupAutomatedRouteFixture(tmpRoot: string): Promise<void> {
  await mkdir(path.join(tmpRoot, ".contextatlas"), { recursive: true });
  await copyFile(
    SAMPLE_ATLAS_FIXTURE,
    path.join(tmpRoot, ".contextatlas", "atlas.json"),
  );
}

const SUCCESS_INDEX_OVERRIDE = async (): Promise<IndexCliResult> => ({
  exitCode: 0,
});

describe("runInitSubcommand — doctor + routing + atlas + smoke + MCP orchestration", () => {
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

  it("automated path: full pipeline → exit code 0 (success per Q4.5.5 flip)", async () => {
    await setupAutomatedRouteFixture(tmpRoot);
    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: SUCCESS_INDEX_OVERRIDE,
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });
    expect(result.exitCode).toBe(0);
    expect(stdoutCapture).toContain("proceeding with automated path");
  });

  it("missing-adrs path: ADR warn + code pass → exit code 0 + guidance message (no atlas pipeline)", async () => {
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

  it("new-project path: code warn + ADR warn → exit code 0 + guidance message (no atlas pipeline)", async () => {
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
    await setupAutomatedRouteFixture(tmpRoot);
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
      runIndexSubcommandOverride: SUCCESS_INDEX_OVERRIDE,
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });
    expect(result.exitCode).toBe(0); // Q4.5.5 flip: automated-with-warning success → 0
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
    await setupAutomatedRouteFixture(tmpRoot);
    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: true,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: SUCCESS_INDEX_OVERRIDE,
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });
    const cfg = await readFile(
      path.join(tmpRoot, ".contextatlas.yml"),
      "utf8",
    );
    expect(cfg).toContain("architecture: claude-code-only");
  });

  it("--cc-only absent → architecture: anthropic-api-claude-code (default)", async () => {
    await setupAutomatedRouteFixture(tmpRoot);
    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: SUCCESS_INDEX_OVERRIDE,
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });
    const cfg = await readFile(
      path.join(tmpRoot, ".contextatlas.yml"),
      "utf8",
    );
    expect(cfg).toContain("architecture: anthropic-api-claude-code");
  });

  it("preserves existing .contextatlas.yml (idempotent skip-when-present per Q4.0.12)", async () => {
    await setupAutomatedRouteFixture(tmpRoot);
    const cfgPath = path.join(tmpRoot, ".contextatlas.yml");
    const existingContent = "version: 1\narchitecture: claude-code-only\nlanguages: [go]\n";
    await writeFile(cfgPath, existingContent, "utf8");

    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: SUCCESS_INDEX_OVERRIDE,
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });
    const onDisk = await readFile(cfgPath, "utf8");
    expect(onDisk).toBe(existingContent);
  });

  it("H5 detection wiring: scaffold uses detectLanguagesOverride result", async () => {
    await setupAutomatedRouteFixture(tmpRoot);
    const detected: readonly LanguageCode[] = ["typescript", "go"];
    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => detected,
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: SUCCESS_INDEX_OVERRIDE,
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });
    const cfg = await readFile(
      path.join(tmpRoot, ".contextatlas.yml"),
      "utf8",
    );
    expect(cfg).toContain("- typescript");
    expect(cfg).toContain("- go");
  });

  it("falls back to ['typescript'] when detection returns empty (greenfield)", async () => {
    // Greenfield → new-project route → no atlas pipeline; no fixture needed
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

describe("runInitSubcommand — Step 4.4 atlas + smoke + MCP behavior", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "init-runner-step44-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("invokes runIndexSubcommandOverride when atlas not current (no .git → atlasCurrent=false)", async () => {
    await setupAutomatedRouteFixture(tmpRoot);
    let invoked = false;
    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: async () => {
        invoked = true;
        return { exitCode: 0 };
      },
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });
    expect(invoked).toBe(true);
  });

  it("atlas extraction FAIL (exit code 1) → init exit code 1 (Q4.4.4 pass-through)", async () => {
    await setupAutomatedRouteFixture(tmpRoot);
    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: async () => ({ exitCode: 1 }),
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });
    expect(result.exitCode).toBe(1);
  });

  it("atlas extraction setup-error (exit code 2) → init exit code 1 (Q4.4.4 pass-through)", async () => {
    await setupAutomatedRouteFixture(tmpRoot);
    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: async () => ({ exitCode: 2 }),
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });
    // Q4.4.4 lock: any non-zero from runIndexSubcommand → init exit code 1
    expect(result.exitCode).toBe(1);
  });

  it("smoke test FAIL (atlas missing) → init exit code 2 (Q4.0.7 spec)", async () => {
    // No atlas fixture pre-copied; runIndexSubcommandOverride returns
    // success (claims it extracted) but tmp dir has no atlas.json → smoke FAIL.
    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: SUCCESS_INDEX_OVERRIDE,
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });
    expect(result.exitCode).toBe(2); // smoke-fail per Q4.0.7
  });

  it("MCP registration writes .mcp.json (status: registered) when absent", async () => {
    await setupAutomatedRouteFixture(tmpRoot);
    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: SUCCESS_INDEX_OVERRIDE,
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });
    const mcpJson = JSON.parse(
      await readFile(path.join(tmpRoot, ".mcp.json"), "utf8"),
    ) as { mcpServers: { contextatlas: { command: string; args: string[] } } };
    expect(mcpJson.mcpServers.contextatlas).toEqual({
      command: "node",
      args: ["/synthetic/dist/index.js"],
    });
  });

  it("MCP registration preserves existing contextatlas entry (idempotent)", async () => {
    await setupAutomatedRouteFixture(tmpRoot);
    const userPath = path.join(tmpRoot, ".mcp.json");
    const userContent = JSON.stringify({
      mcpServers: {
        contextatlas: {
          command: "node",
          args: ["/user/customized/path/index.js"],
        },
      },
    }, null, 2);
    await writeFile(userPath, userContent, "utf8");

    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: SUCCESS_INDEX_OVERRIDE,
      resolveBinaryPathOverride: "/different/path/dist/index.js",
    });
    const onDisk = await readFile(userPath, "utf8");
    expect(onDisk).toBe(userContent); // unchanged
  });
});

describe("runInitSubcommand — Step 4.5 success message + exit code flip", () => {
  let tmpRoot: string;
  let stdoutCapture: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "init-runner-step45-"));
    stdoutCapture = "";
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  function captureStdout(chunk: string): void {
    stdoutCapture += chunk;
  }

  it("automated path success: renders sectioned success message with [OK] markers", async () => {
    await setupAutomatedRouteFixture(tmpRoot);
    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: SUCCESS_INDEX_OVERRIDE,
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });

    expect(result.exitCode).toBe(0);
    expect(stdoutCapture).toContain("[OK] ContextAtlas init complete");
    expect(stdoutCapture).toContain("Setup:");
    expect(stdoutCapture).toContain("Smoke test:");
    expect(stdoutCapture).toContain("Try in your next Claude Code session:");
    expect(stdoutCapture).toContain("Re-run:");
    // [OK] marker on smoke test line per Q4.0.8 + [OK] refinement
    expect(stdoutCapture).toContain("[OK] get_symbol_context returned bundle");
  });

  it("success message includes language-aware first-query suggestion (sample fixture symbol kind=class → 'class' noun)", async () => {
    await setupAutomatedRouteFixture(tmpRoot);
    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
      writeStdout: captureStdout,
      detectLanguagesOverride: () => ["typescript"],
      collectChecksOverride: async () => makeDoctorResult(PASSING_AUTOMATED_CHECKS),
      runIndexSubcommandOverride: SUCCESS_INDEX_OVERRIDE,
      resolveBinaryPathOverride: "/synthetic/dist/index.js",
    });

    // Sample fixture first symbol: BaseProcessor (kind=class).
    // Q4.5.4 kind-tag suggestion → "BaseProcessor class".
    expect(stdoutCapture).toContain('"What does the BaseProcessor class do?"');
    expect(stdoutCapture).toContain(
      '"Find symbols related to <intent>" — invokes find_by_intent',
    );
  });
});

// Dogfood integration test (Q4.4.7 lock framing) deferred at Step 4.4
// per Travis design-time analysis: process.cwd() against contextatlas
// repo introduces flakiness (extracted_at_sha drift relative to HEAD
// during active dev; .mcp.json write side-effect on test repo). Real-
// atlas-substrate coverage already provided via:
//   1. smoke-test.test.ts (5 tests against sample-atlas.json fixture
//      — real importAtlasFile + listAllSymbols + buildBundle reads)
//   2. Step 4.4 atlas+smoke+MCP behavior tests above (orchestration
//      paths covered against tmp dir + sample-atlas fixture)
// Cohort exposure at Step 7 covers full extraction path per Q4.0.13
// + Q4.4.7 framing.
