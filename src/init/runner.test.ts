import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runInitSubcommand } from "./runner.js";

/**
 * Step 4.2 behavior tests. Replaces Step 4.1 scaffold-signature tests
 * cleanly per Point 5 lock at Step 4.2 surface review (existing 3
 * scaffold-signature tests asserted exit code 2 with no scaffold
 * write; new tests assert config scaffold orchestration + flag
 * plumbing).
 *
 * Substantive coverage of doctor/atlas/smoke/success-message builds
 * at Steps 4.3-4.5 per Q4.0.13 lock + Q4.2.6 lock (fail-loudly exit
 * code 2 preserved through Step 4.4; final exit code semantics flip
 * at Step 4.5).
 */

describe("runInitSubcommand — Step 4.2 config setup orchestration", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "init-runner-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("returns exit code 2 (fail-loudly preserved per Q4.2.6 until Step 4.5)", async () => {
    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
    });
    expect(result.exitCode).toBe(2);
  });

  it("writes scaffold with architecture: anthropic-api-claude-code when ccOnly absent", async () => {
    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false,
    });
    const cfgPath = path.join(tmpRoot, ".contextatlas.yml");
    const written = await readFile(cfgPath, "utf8");
    expect(written).toContain("architecture: anthropic-api-claude-code");
  });

  it("writes scaffold with architecture: claude-code-only when ccOnly true (Q5 + Q4.0.5 flag plumbing)", async () => {
    await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: true,
    });
    const cfgPath = path.join(tmpRoot, ".contextatlas.yml");
    const written = await readFile(cfgPath, "utf8");
    expect(written).toContain("architecture: claude-code-only");
  });

  it("preserves existing .contextatlas.yml (idempotent skip-when-present per Q4.0.12)", async () => {
    const cfgPath = path.join(tmpRoot, ".contextatlas.yml");
    const existingContent = "version: 1\narchitecture: claude-code-only\nlanguages: [go]\n";
    await writeFile(cfgPath, existingContent, "utf8");

    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      ccOnly: false, // Would write anthropic-api-... if scaffold ran; but should preserve existing
    });
    expect(result.exitCode).toBe(2);

    const onDisk = await readFile(cfgPath, "utf8");
    expect(onDisk).toBe(existingContent);
  });

  it("accepts json true without throwing (signature shape preserved)", async () => {
    const result = await runInitSubcommand({
      configRoot: tmpRoot,
      json: true,
    });
    expect(result.exitCode).toBe(2);
  });
});
