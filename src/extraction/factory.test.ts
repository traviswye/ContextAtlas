import { describe, expect, it, vi } from "vitest";

import type { ContextAtlasConfig } from "../types.js";

import { AnthropicAPIDirectExtractor } from "./extractors/anthropic-api-direct.js";
import { ClaudeCodeOnlyExtractor } from "./extractors/claude-code-only.js";
import {
  LEGACY_ALIAS_DEPRECATION_WARNING,
  getExtractor,
} from "./factory.js";

const baseConfig: ContextAtlasConfig = {
  version: 1,
  languages: [],
  adrs: { path: "docs/adr/", format: "markdown-frontmatter" },
} as never;

describe("getExtractor factory (Path (iii) 2-mode + 1 legacy alias)", () => {
  it("'claude-code-only' config → ClaudeCodeOnlyExtractor", () => {
    const writeStderr = vi.fn();
    const extractor = getExtractor(
      { ...baseConfig, architecture: "claude-code-only" },
      { writeStderr },
    );
    expect(extractor).toBeInstanceOf(ClaudeCodeOnlyExtractor);
    expect(writeStderr).not.toHaveBeenCalled();
  });

  it("'anthropic-api-direct' config → AnthropicAPIDirectExtractor (no warning)", () => {
    const writeStderr = vi.fn();
    const extractor = getExtractor(
      { ...baseConfig, architecture: "anthropic-api-direct" },
      { writeStderr },
    );
    expect(extractor).toBeInstanceOf(AnthropicAPIDirectExtractor);
    expect(writeStderr).not.toHaveBeenCalled();
  });

  it("'anthropic-api-claude-code' (legacy) → AnthropicAPIDirectExtractor + stderr deprecation warning per Q1.0.8 lock", () => {
    const writeStderr = vi.fn();
    const extractor = getExtractor(
      { ...baseConfig, architecture: "anthropic-api-claude-code" },
      { writeStderr },
    );
    expect(extractor).toBeInstanceOf(AnthropicAPIDirectExtractor);
    expect(writeStderr).toHaveBeenCalledWith(LEGACY_ALIAS_DEPRECATION_WARNING);
  });

  it("absent architecture field → default 'claude-code-only' per Q1.0.4 β-3 lock", () => {
    const writeStderr = vi.fn();
    const extractor = getExtractor(baseConfig, { writeStderr });
    expect(extractor).toBeInstanceOf(ClaudeCodeOnlyExtractor);
    expect(writeStderr).not.toHaveBeenCalled();
  });

  it("LEGACY_ALIAS_DEPRECATION_WARNING text matches lock string verbatim", () => {
    expect(LEGACY_ALIAS_DEPRECATION_WARNING).toContain("anthropic-api-claude-code");
    expect(LEGACY_ALIAS_DEPRECATION_WARNING).toContain("deprecated alias");
    expect(LEGACY_ALIAS_DEPRECATION_WARNING).toContain("anthropic-api-direct");
    expect(LEGACY_ALIAS_DEPRECATION_WARNING).toContain("v0.8+");
    expect(LEGACY_ALIAS_DEPRECATION_WARNING).toContain(".contextatlas.yml");
  });
});
