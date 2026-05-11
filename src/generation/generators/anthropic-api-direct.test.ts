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
    skipConfirmation: true,
    writeStderr: () => {},
    ...overrides,
  };
}

describe("AnthropicAPIDirectGenerator (Step 2.2.a.2 full implementation)", () => {
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

  it("aborts gracefully when confirmation prompt returns false", async () => {
    const generator = new AnthropicAPIDirectGenerator();
    let stderrOutput = "";
    const context = buildContext({
      readEnv: () => "sk-ant-test-key",
      skipConfirmation: false,
      confirmProceed: async () => false,
      writeStderr: (chunk) => {
        stderrOutput += chunk;
      },
    });
    const result = await generator.generate(context);
    expect(result.filesGenerated).toBe(0);
    expect(result.apiCalls).toBe(0);
    expect(result.costUsd).toBe(0);
    expect(stderrOutput).toContain("aborted by user");
  });

  it("prints pre-flight cost estimate to stderr before confirmation", async () => {
    const generator = new AnthropicAPIDirectGenerator();
    let stderrOutput = "";
    const context = buildContext({
      readEnv: () => "sk-ant-test-key",
      skipConfirmation: false,
      confirmProceed: async () => false,
      writeStderr: (chunk) => {
        stderrOutput += chunk;
      },
    });
    await generator.generate(context);
    expect(stderrOutput).toContain("Estimating generate-adrs cost");
    expect(stderrOutput).toContain("Estimated input");
    expect(stderrOutput).toContain("Estimated cost");
  });
});
