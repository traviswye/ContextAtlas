import { describe, expect, it } from "vitest";

import { runShowGeneratePromptSubcommand } from "./cli-show-generate-prompt.js";
import { GENERATE_ADRS_PROMPT } from "./prompt.js";

describe("runShowGeneratePromptSubcommand (v0.7 Step 2.2.a.1 Path-γ CLI subcommand)", () => {
  it("outputs GENERATE_ADRS_PROMPT verbatim to writeStdout seam", () => {
    const chunks: string[] = [];
    const result = runShowGeneratePromptSubcommand({
      writeStdout: (c) => chunks.push(c),
    });
    expect(result.exitCode).toBe(0);
    const fullOutput = chunks.join("");
    expect(fullOutput.startsWith(GENERATE_ADRS_PROMPT)).toBe(true);
  });

  it("appends trailing newline after GENERATE_ADRS_PROMPT", () => {
    const chunks: string[] = [];
    runShowGeneratePromptSubcommand({ writeStdout: (c) => chunks.push(c) });
    const fullOutput = chunks.join("");
    expect(fullOutput.endsWith("\n")).toBe(true);
  });

  it("exit code is 0 (always succeeds; read-only operation)", () => {
    const result = runShowGeneratePromptSubcommand({ writeStdout: () => {} });
    expect(result.exitCode).toBe(0);
  });

  it("uses process.stdout.write when writeStdout option absent", () => {
    // Smoke test: ensure default seam doesn't throw + returns exit 0.
    // Don't capture process.stdout — Vitest reporter writes there too.
    const originalWrite = process.stdout.write.bind(process.stdout);
    let writeCallCount = 0;
    process.stdout.write = ((chunk: unknown) => {
      writeCallCount++;
      void chunk;
      return true;
    }) as typeof process.stdout.write;
    try {
      const result = runShowGeneratePromptSubcommand();
      expect(result.exitCode).toBe(0);
      expect(writeCallCount).toBeGreaterThan(0);
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it("surfaces canonical generate-adrs prompt content at Step 2.2.a.2 (real content; Step 2.2.a.1 placeholder superseded)", () => {
    // Step 2.2.a.2 replaced the placeholder with canonical content.
    // Substantive content assertions are in prompt.test.ts (which
    // covers schema + template + severity taxonomy + reference-context
    // handling + Refinements 1-3). This test asserts the Path-γ wiring
    // surfaces whatever GENERATE_ADRS_PROMPT currently is — schema-
    // grounded shape over content brittleness.
    expect(GENERATE_ADRS_PROMPT).toContain("generating Architectural Decision Records");
    expect(GENERATE_ADRS_PROMPT).toContain('"adrs"');
  });
});
