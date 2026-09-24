import { describe, expect, it } from "vitest";

import { REGISTERED_LANGUAGE_EXTENSIONS } from "../extraction/source-keys.js";
import { LANG_CODES, type LanguageCode } from "../types.js";

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

describe("REGISTERED_LANGUAGE_EXTENSIONS drift guard (v1.2 Phase 1)", () => {
  // src/extraction/source-keys.ts keeps its own copy of every adapter's
  // extensions (core must not import concrete adapters). This test pins
  // the copy to the registry so a new or changed adapter extension
  // cannot silently drift from the source-key classifier.
  for (const lang of Object.keys(LANG_CODES) as LanguageCode[]) {
    it(`${lang}: classifier extensions match the registered adapter`, () => {
      expect([...REGISTERED_LANGUAGE_EXTENSIONS[lang]]).toEqual([
        ...createAdapter(lang).extensions,
      ]);
    });
  }
});
