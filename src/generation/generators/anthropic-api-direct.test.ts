import { describe, expect, it } from "vitest";

import type { ContextAtlasConfig } from "../../types.js";

import {
  GenerationSetupError,
  type GeneratorContext,
} from "../generator.js";
import { AnthropicAPIDirectGenerator } from "./anthropic-api-direct.js";

function buildContext(
  overrides: Partial<GeneratorContext> = {},
): GeneratorContext {
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
    ...overrides,
  };
}

describe("AnthropicAPIDirectGenerator (Step 2.2.a.1 skeleton)", () => {
  it("declares costModel 'api'", () => {
    const generator = new AnthropicAPIDirectGenerator();
    expect(generator.costModel).toBe("api");
  });

  it("throws GenerationSetupError when ANTHROPIC_API_KEY is absent", async () => {
    const generator = new AnthropicAPIDirectGenerator();
    const context = buildContext({ readEnv: () => undefined });
    await expect(generator.generate(context)).rejects.toBeInstanceOf(
      GenerationSetupError,
    );
  });

  it("throws GenerationSetupError when ANTHROPIC_API_KEY is empty string", async () => {
    const generator = new AnthropicAPIDirectGenerator();
    const context = buildContext({ readEnv: () => "" });
    await expect(generator.generate(context)).rejects.toBeInstanceOf(
      GenerationSetupError,
    );
  });

  it("throws Step-2.2.a.2-pending error when API key is present", async () => {
    // Skeleton state: even with API key set, generate() throws because
    // substantive implementation lands at Step 2.2.a.2. The error
    // explicitly references Step 2.2.a.2 so users see why.
    const generator = new AnthropicAPIDirectGenerator();
    const context = buildContext({ readEnv: () => "sk-ant-test-key" });
    await expect(generator.generate(context)).rejects.toThrow(
      /Step 2.2.a.2/,
    );
  });
});
