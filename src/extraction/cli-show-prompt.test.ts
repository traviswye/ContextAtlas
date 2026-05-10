import { describe, expect, it } from "vitest";

import { runShowPromptSubcommand } from "./cli-show-prompt.js";
import { EXTRACTION_PROMPT } from "./prompt.js";

describe("runShowPromptSubcommand (v0.7 Step 1.4b Path-γ CLI subcommand)", () => {
  it("outputs EXTRACTION_PROMPT verbatim to writeStdout seam", () => {
    const chunks: string[] = [];
    const result = runShowPromptSubcommand({
      writeStdout: (c) => chunks.push(c),
    });
    expect(result.exitCode).toBe(0);
    const fullOutput = chunks.join("");
    expect(fullOutput.startsWith(EXTRACTION_PROMPT)).toBe(true);
  });

  it("appends trailing newline after EXTRACTION_PROMPT", () => {
    const chunks: string[] = [];
    runShowPromptSubcommand({ writeStdout: (c) => chunks.push(c) });
    const fullOutput = chunks.join("");
    expect(fullOutput.endsWith("\n")).toBe(true);
  });

  it("exit code is 0 (always succeeds; read-only operation)", () => {
    const result = runShowPromptSubcommand({ writeStdout: () => {} });
    expect(result.exitCode).toBe(0);
  });

  it("uses process.stdout.write when writeStdout option absent", () => {
    // Smoke test: ensure default seam doesn't throw + returns exit 0.
    // Don't capture process.stdout — Vitest reporter writes there too.
    // Just verify it returns the right result shape.
    const originalWrite = process.stdout.write.bind(process.stdout);
    let writeCallCount = 0;
    process.stdout.write = ((chunk: unknown) => {
      writeCallCount++;
      void chunk;
      return true;
    }) as typeof process.stdout.write;
    try {
      const result = runShowPromptSubcommand();
      expect(result.exitCode).toBe(0);
      expect(writeCallCount).toBeGreaterThan(0);
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
