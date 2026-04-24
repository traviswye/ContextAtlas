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

  it("throws a 'not yet implemented' error for 'go' (Commit 2 placeholder)", () => {
    // Replaced with `new GoAdapter()` in Commit 3 of Step 9. The test
    // here pins the contract for extraction runs that target Go before
    // the adapter class is wired in: fail fast with an actionable error
    // rather than silently returning nothing.
    expect(() => createAdapter("go")).toThrow(/Go adapter not yet implemented/);
  });
});
