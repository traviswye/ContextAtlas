import { describe, expect, it } from "vitest";

import type { ExtractorContext } from "../extractor.js";

import { ClaudeCodeOnlyExtractor } from "./claude-code-only.js";

describe("ClaudeCodeOnlyExtractor (Mode A skeleton at Step 1.3)", () => {
  it("costModel is 'subscription-bounded'", () => {
    const extractor = new ClaudeCodeOnlyExtractor();
    expect(extractor.costModel).toBe("subscription-bounded");
  });

  it("extract() throws Step-1.4-pending error per Q1.3.3 fail-loud lock", async () => {
    const extractor = new ClaudeCodeOnlyExtractor();
    const context: ExtractorContext = {
      config: { version: 1, languages: [], adrs: { path: "", format: "markdown-frontmatter" } } as never,
      configRoot: "/tmp",
      databasePath: "/tmp/.contextatlas/index.db",
      atlasJsonPath: "/tmp/atlas.json",
      full: false,
    };
    await expect(extractor.extract(context)).rejects.toThrow(
      /ClaudeCodeOnlyExtractor implementation lands at Step 1\.4/,
    );
  });
});
