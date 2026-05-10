import { describe, expect, it, vi } from "vitest";

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

describe("ClaudeCodeOnlyExtractor (informational-stub per Path-3 reframe + Q1.0.10 (b))", () => {
  it("costModel is 'subscription-bounded'", () => {
    const extractor = new ClaudeCodeOnlyExtractor();
    expect(extractor.costModel).toBe("subscription-bounded");
  });

  it("extract() returns zero-counts result without throwing (informational-stub)", async () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const extractor = new ClaudeCodeOnlyExtractor();
    const context = buildStubContext();
    const result = await extractor.extract(context);
    writeSpy.mockRestore();
    expect(result.costModel).toBe("subscription-bounded");
    expect(result.pipelineResult.filesExtracted).toBe(0);
    expect(result.pipelineResult.claimsWritten).toBe(0);
    expect(result.pipelineResult.costUsd).toBe(0);
  });

  it("extract() emits stderr redirect message to /index-atlas Claude Code skill", async () => {
    const stderrChunks: string[] = [];
    const writeSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: unknown) => {
        stderrChunks.push(typeof chunk === "string" ? chunk : String(chunk));
        return true;
      });
    const extractor = new ClaudeCodeOnlyExtractor();
    const context = buildStubContext();
    await extractor.extract(context);
    writeSpy.mockRestore();
    const fullStderr = stderrChunks.join("");
    expect(fullStderr).toContain("/index-atlas");
    expect(fullStderr).toContain("Claude Code skill");
    expect(fullStderr).toContain("subscription-bounded");
    expect(fullStderr).toContain("ADR-02 v0.7 amendment");
  });
});
