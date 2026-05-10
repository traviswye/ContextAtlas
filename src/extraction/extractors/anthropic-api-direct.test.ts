import { describe, expect, it } from "vitest";

import {
  ExtractionSetupError,
  type ExtractorContext,
} from "../extractor.js";

import { AnthropicAPIDirectExtractor } from "./anthropic-api-direct.js";

function buildStubContext(overrides: Partial<ExtractorContext> = {}): ExtractorContext {
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
    ...overrides,
  };
}

describe("AnthropicAPIDirectExtractor (Mode B per ADR-02 v0.7 amendment)", () => {
  it("costModel is 'api'", () => {
    const extractor = new AnthropicAPIDirectExtractor();
    expect(extractor.costModel).toBe("api");
  });

  it("extract() throws ExtractionSetupError when ANTHROPIC_API_KEY missing (no clientOverride)", async () => {
    const extractor = new AnthropicAPIDirectExtractor();
    const context = buildStubContext({
      readEnv: () => undefined,
    });
    await expect(extractor.extract(context)).rejects.toBeInstanceOf(
      ExtractionSetupError,
    );
  });

  it("extract() ExtractionSetupError message references API key + suggests claude-code-only alternative", async () => {
    const extractor = new AnthropicAPIDirectExtractor();
    const context = buildStubContext({
      readEnv: () => undefined,
    });
    await expect(extractor.extract(context)).rejects.toThrow(
      /ANTHROPIC_API_KEY is not set/,
    );
    await expect(extractor.extract(context)).rejects.toThrow(
      /architecture: claude-code-only/,
    );
  });
});
