import { describe, expect, it } from "vitest";

import type { ExtractorContext } from "../extractor.js";

import { ClaudeCodeOnlyExtractor } from "./claude-code-only.js";

function buildStubContext(): ExtractorContext {
  return {
    config: {
      version: 1,
      languages: [],
      adrs: { path: "docs/adr/", format: "markdown-frontmatter" },
    } as never,
    configRoot: "/tmp/repo",
    sourceRoot: "/tmp/repo",
    db: {} as never,
    adapters: new Map() as never,
    full: false,
    contextatlasVersion: "0.0.1-test",
    contextatlasCommitSha: null,
    readEnv: () => undefined,
  };
}

describe("ClaudeCodeOnlyExtractor (Mode A skeleton at Step 1.4a)", () => {
  it("costModel is 'subscription-bounded'", () => {
    const extractor = new ClaudeCodeOnlyExtractor();
    expect(extractor.costModel).toBe("subscription-bounded");
  });

  it("extract() throws Step-1.4b-pending error per skeleton scope", async () => {
    const extractor = new ClaudeCodeOnlyExtractor();
    const context = buildStubContext();
    await expect(extractor.extract(context)).rejects.toThrow(
      /ClaudeCodeOnlyExtractor implementation lands at Step 1\.4b/,
    );
  });

  it("extract() error message suggests anthropic-api-direct interim alternative", async () => {
    const extractor = new ClaudeCodeOnlyExtractor();
    const context = buildStubContext();
    await expect(extractor.extract(context)).rejects.toThrow(
      /architecture: anthropic-api-direct/,
    );
  });
});
