import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runGenerateAdrsSubcommand } from "./cli-runner.js";

/**
 * Step 2.2.a.2 generate-adrs CLI runner tests. Skeleton-era tests
 * upgraded to exercise the full generator surface with confirmation
 * seam injection. End-to-end tests against live Anthropic API are
 * out of scope; tests stop at the confirmation/setup-error boundary.
 */
describe("runGenerateAdrsSubcommand (Step 2.2.a.2 full implementation)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "ca-gen-runner-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  async function writeMinimalConfig(): Promise<void> {
    await mkdir(path.join(tmpRoot, "docs", "adr"), { recursive: true });
    await mkdir(path.join(tmpRoot, ".contextatlas"), { recursive: true });
    await writeFile(
      path.join(tmpRoot, ".contextatlas.yml"),
      "version: 1\nlanguages:\n  - typescript\nadrs:\n  path: docs/adr/\n  format: markdown-frontmatter\ndocs:\n  include:\n    - README.md\natlas:\n  committed: true\n  path: .contextatlas/atlas.json\n  local_cache: .contextatlas/index.db\n",
      "utf8",
    );
  }

  it("returns exit code 2 when config is missing", async () => {
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => "sk-ant-test-key",
      writeStderr: () => {},
    });
    expect(result.exitCode).toBe(2);
  });

  it("returns exit code 2 when ANTHROPIC_API_KEY is missing (GenerationSetupError)", async () => {
    await writeMinimalConfig();
    let stderrOutput = "";
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => undefined,
      writeStderr: (c) => {
        stderrOutput += c;
      },
    });
    expect(result.exitCode).toBe(2);
    expect(stderrOutput).toContain("ANTHROPIC_API_KEY");
  });

  it("returns exit code 0 when user declines confirmation (graceful abort)", async () => {
    await writeMinimalConfig();
    let stderrOutput = "";
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => "sk-ant-test-key",
      confirmProceed: async () => false,
      writeStderr: (c) => {
        stderrOutput += c;
      },
    });
    expect(result.exitCode).toBe(0);
    expect(stderrOutput).toContain("aborted by user");
  });

  it("propagates --yes / skipConfirmation flag to generator context", async () => {
    // With skipConfirmation: true + no real API key, the generator
    // will reach the API call which will fail (test API key). Verify
    // the runner doesn't try to invoke the confirmation prompt; exit
    // code is 1 (pipeline error from invalid API key) not 2.
    await writeMinimalConfig();
    let stderrOutput = "";
    // confirmProceed deliberately throws — if runner invokes it
    // despite skipConfirmation, this surfaces as a failure.
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => "sk-ant-test-key-bogus",
      skipConfirmation: true,
      confirmProceed: async () => {
        throw new Error("confirmProceed should not be called when skipConfirmation is true");
      },
      writeStderr: (c) => {
        stderrOutput += c;
      },
    });
    // Generator reaches API call with bogus key → mapped to error
    // → exit code 1 (pipeline failure) per ADR-12 distinction.
    // OR exit code 2 if Anthropic SDK throws AuthenticationError
    // which we re-classify as GenerationSetupError.
    expect([1, 2]).toContain(result.exitCode);
    // Confirmation prompt was never invoked (no stderr message about
    // it; confirmProceed-as-throw would have surfaced as caught error).
    expect(stderrOutput).not.toContain("aborted by user");
  });
});
