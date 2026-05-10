import { describe, expect, it } from "vitest";

import type { ExtractorContext } from "../extractor.js";

import { AnthropicAPIDirectExtractor } from "./anthropic-api-direct.js";

describe("AnthropicAPIDirectExtractor (Mode B skeleton at Step 1.3)", () => {
  it("costModel is 'api'", () => {
    const extractor = new AnthropicAPIDirectExtractor();
    expect(extractor.costModel).toBe("api");
  });

  it("extract() throws Step-1.4-pending error per Q1.3.3 fail-loud lock", async () => {
    const extractor = new AnthropicAPIDirectExtractor();
    const context: ExtractorContext = {
      config: { version: 1, languages: [], adrs: { path: "", format: "markdown-frontmatter" } } as never,
      configRoot: "/tmp",
      databasePath: "/tmp/.contextatlas/index.db",
      atlasJsonPath: "/tmp/atlas.json",
      full: false,
    };
    await expect(extractor.extract(context)).rejects.toThrow(
      /AnthropicAPIDirectExtractor implementation lands at Step 1\.4/,
    );
  });
});
