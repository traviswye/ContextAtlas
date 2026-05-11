import { describe, expect, it, vi } from "vitest";

import type { ContextAtlasConfig } from "../../types.js";

import type { GeneratorContext } from "../generator.js";
import { ClaudeCodeOnlyGenerator } from "./claude-code-only.js";

function buildContext(): GeneratorContext {
  const config: ContextAtlasConfig = {
    version: 1,
    languages: ["typescript"],
    adrs: { path: "docs/adr/", format: "markdown-frontmatter" },
    docs: { include: ["README.md"] },
    atlas: { committed: true, path: ".contextatlas/atlas.json", localCache: ".contextatlas/index.db" },
  };
  return {
    config,
    configRoot: "/tmp/fake",
    sourceRoot: "/tmp/fake",
    db: undefined as never,
    adapters: new Map(),
    contextatlasVersion: "0.0.1-test",
    contextatlasCommitSha: null,
    outputAdrPath: "/tmp/fake/docs/adr",
    readEnv: () => undefined,
  };
}

describe("ClaudeCodeOnlyGenerator (informational-stub per Path-3 inheritance)", () => {
  it("declares costModel 'subscription-bounded'", () => {
    const generator = new ClaudeCodeOnlyGenerator();
    expect(generator.costModel).toBe("subscription-bounded");
  });

  it("returns zero-counts GenerationResult without API call", async () => {
    const generator = new ClaudeCodeOnlyGenerator();
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    try {
      const result = await generator.generate(buildContext());
      expect(result.filesGenerated).toBe(0);
      expect(result.costUsd).toBe(0);
      expect(result.apiCalls).toBe(0);
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
      expect(result.costModel).toBe("subscription-bounded");
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("emits redirect message to /generate-adrs Skills surface on stderr", async () => {
    const generator = new ClaudeCodeOnlyGenerator();
    let stderrOutput = "";
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: unknown) => {
        stderrOutput += String(chunk);
        return true;
      });
    try {
      await generator.generate(buildContext());
      expect(stderrOutput).toContain("/generate-adrs");
      expect(stderrOutput).toContain("Claude Code skill");
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
