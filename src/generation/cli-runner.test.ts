import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runGenerateAdrsSubcommand } from "./cli-runner.js";

/**
 * Step 2.2.a.1 generate-adrs CLI runner skeleton tests. Verify:
 *   - Exit-code-2 mapping for missing config (setup error)
 *   - Exit-code-2 mapping when AnthropicAPIDirectGenerator surfaces
 *     GenerationSetupError for absent API key
 *   - Reference-context flag plumbing reaches GeneratorContext
 *     (verified indirectly: runner accepts the option without error)
 *
 * Substantive end-to-end generation tests land at Step 2.2.a.2 once
 * AnthropicAPIDirectGenerator.generate() has real content.
 */
describe("runGenerateAdrsSubcommand (Step 2.2.a.1 skeleton)", () => {
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

  it("returns exit code 1 when generator throws non-setup error (Step-2.2.a.2-pending)", async () => {
    // Skeleton state: with API key present, AnthropicAPIDirectGenerator
    // throws a Step-2.2.a.2-pending plain Error (not GenerationSetupError).
    // Runner maps to exit code 1 per ADR-12 discipline.
    await writeMinimalConfig();
    let stderrOutput = "";
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => "sk-ant-test-key",
      writeStderr: (c) => {
        stderrOutput += c;
      },
    });
    expect(result.exitCode).toBe(1);
    expect(stderrOutput).toContain("Step 2.2.a.2");
  });

  it("accepts referenceContextPath option without parse error (Step 2.2.a.2 wires substantive consumption)", async () => {
    await writeMinimalConfig();
    const refDir = path.join(tmpRoot, "fake-ref-context");
    await mkdir(refDir);
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      referenceContextPath: refDir,
      readEnv: () => "sk-ant-test-key",
      writeStderr: () => {},
    });
    // Still exit 1 because skeleton throws; option just needs to be
    // accepted without runner-level parse error.
    expect(result.exitCode).toBe(1);
  });
});
