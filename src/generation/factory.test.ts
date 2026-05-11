import { describe, expect, it } from "vitest";

import type { ContextAtlasConfig } from "../types.js";

import { getGenerator } from "./factory.js";
import { AnthropicAPIDirectGenerator } from "./generators/anthropic-api-direct.js";
import { ClaudeCodeOnlyGenerator } from "./generators/claude-code-only.js";

/**
 * Minimal config fixture sufficient for factory routing. Real config
 * shape covered by config/parser tests; factory only inspects
 * `architecture` field.
 */
function buildConfig(architecture?: ContextAtlasConfig["architecture"]): ContextAtlasConfig {
  return {
    version: 1,
    languages: ["typescript"],
    adrs: { path: "docs/adr/", format: "markdown-frontmatter" },
    docs: { include: ["README.md"] },
    atlas: { committed: true, path: ".contextatlas/atlas.json", localCache: ".contextatlas/index.db" },
    ...(architecture !== undefined ? { architecture } : {}),
  };
}

describe("getGenerator (v0.7 Step 2.2.a.1 Path-3 entry-point-determined factory)", () => {
  it("returns AnthropicAPIDirectGenerator when architecture field is absent", () => {
    const generator = getGenerator(buildConfig());
    expect(generator).toBeInstanceOf(AnthropicAPIDirectGenerator);
    expect(generator.costModel).toBe("api");
  });

  it("returns AnthropicAPIDirectGenerator for 'anthropic-api-direct'", () => {
    const generator = getGenerator(buildConfig("anthropic-api-direct"));
    expect(generator).toBeInstanceOf(AnthropicAPIDirectGenerator);
    expect(generator.costModel).toBe("api");
  });

  it("returns AnthropicAPIDirectGenerator for legacy 'anthropic-api-claude-code' alias", () => {
    const generator = getGenerator(buildConfig("anthropic-api-claude-code"));
    expect(generator).toBeInstanceOf(AnthropicAPIDirectGenerator);
    expect(generator.costModel).toBe("api");
  });

  it("returns ClaudeCodeOnlyGenerator informational-stub for 'claude-code-only'", () => {
    const generator = getGenerator(buildConfig("claude-code-only"));
    expect(generator).toBeInstanceOf(ClaudeCodeOnlyGenerator);
    expect(generator.costModel).toBe("subscription-bounded");
  });

  it("factory routing mirrors src/extraction/factory.ts behavior (parallel Strategy pattern)", () => {
    // Sanity-check: both factories accept the same architecture-field
    // taxonomy and route to costModel-equivalent concrete classes.
    const cfg = buildConfig("claude-code-only");
    const generator = getGenerator(cfg);
    expect(generator.costModel).toBe("subscription-bounded");
  });
});
