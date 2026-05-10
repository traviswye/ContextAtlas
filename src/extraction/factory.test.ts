import { describe, expect, it } from "vitest";

import type { ContextAtlasConfig } from "../types.js";

import { AnthropicAPIDirectExtractor } from "./extractors/anthropic-api-direct.js";
import { ClaudeCodeOnlyExtractor } from "./extractors/claude-code-only.js";
import { getExtractor } from "./factory.js";

const baseConfig: ContextAtlasConfig = {
  version: 1,
  languages: [],
  adrs: { path: "docs/adr/", format: "markdown-frontmatter" },
} as never;

describe("getExtractor factory (Path-3 entry-point-determined; ADR-02 v0.7 Step 1.4b)", () => {
  it("architecture absent → AnthropicAPIDirectExtractor (CLI default)", () => {
    const extractor = getExtractor(baseConfig);
    expect(extractor).toBeInstanceOf(AnthropicAPIDirectExtractor);
  });

  it("architecture 'anthropic-api-direct' → AnthropicAPIDirectExtractor (redundant; same as default)", () => {
    const extractor = getExtractor({
      ...baseConfig,
      architecture: "anthropic-api-direct",
    });
    expect(extractor).toBeInstanceOf(AnthropicAPIDirectExtractor);
  });

  it("architecture 'anthropic-api-claude-code' (legacy alias) → AnthropicAPIDirectExtractor (legacy maps to CLI default)", () => {
    const extractor = getExtractor({
      ...baseConfig,
      architecture: "anthropic-api-claude-code",
    });
    expect(extractor).toBeInstanceOf(AnthropicAPIDirectExtractor);
  });

  it("architecture 'claude-code-only' → ClaudeCodeOnlyExtractor informational-stub", () => {
    const extractor = getExtractor({
      ...baseConfig,
      architecture: "claude-code-only",
    });
    expect(extractor).toBeInstanceOf(ClaudeCodeOnlyExtractor);
  });
});
