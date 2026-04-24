import { describe, expect, it } from "vitest";

import { createAdapter } from "./registry.js";

describe("createAdapter", () => {
  it("returns a TypeScriptAdapter for 'typescript'", () => {
    const adapter = createAdapter("typescript");
    expect(adapter.language).toBe("typescript");
    expect(adapter.extensions).toContain(".ts");
  });

  it("returns a PyrightAdapter for 'python'", () => {
    const adapter = createAdapter("python");
    expect(adapter.language).toBe("python");
    expect(adapter.extensions).toContain(".py");
  });

  it("returns a GoAdapter for 'go' (Step 9 Commit 3)", () => {
    const adapter = createAdapter("go");
    expect(adapter.language).toBe("go");
    expect(adapter.extensions).toContain(".go");
  });
});
