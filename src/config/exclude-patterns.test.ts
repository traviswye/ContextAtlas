import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXCLUDE_PATTERNS,
  computeExcludePatterns,
} from "./exclude-patterns.js";

import type { ContextAtlasConfig } from "../types.js";

/**
 * Stub `ContextAtlasConfig` shape with only the fields
 * `computeExcludePatterns` reads. Avoids constructing a full
 * config record per test.
 */
function makeConfig(
  languages: ContextAtlasConfig["languages"],
  excludePattern?: readonly string[],
): Pick<ContextAtlasConfig, "languages" | "extraction"> {
  if (excludePattern === undefined) return { languages };
  return {
    languages,
    extraction: { excludePattern: [...excludePattern] },
  };
}

describe("DEFAULT_EXCLUDE_PATTERNS", () => {
  it("covers all three v0.1 languages", () => {
    expect(Object.keys(DEFAULT_EXCLUDE_PATTERNS).sort()).toEqual([
      "go",
      "python",
      "typescript",
    ]);
  });

  it("TypeScript defaults match scope-doc Step 2.3 spec", () => {
    expect(DEFAULT_EXCLUDE_PATTERNS.typescript).toEqual([
      "**/tests/**",
      "**/test/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
    ]);
  });

  it("Python defaults match scope-doc Step 2.3 spec", () => {
    expect(DEFAULT_EXCLUDE_PATTERNS.python).toEqual([
      "**/tests/**",
      "**/test/**",
      "**/test_*.py",
      "**/*_test.py",
    ]);
  });

  it("Go defaults match scope-doc Step 2.3 spec", () => {
    expect(DEFAULT_EXCLUDE_PATTERNS.go).toEqual([
      "**/tests/**",
      "**/*_test.go",
    ]);
  });
});

describe("computeExcludePatterns", () => {
  it("single language emits that language's defaults", () => {
    const out = computeExcludePatterns(makeConfig(["go"]));
    expect(out).toEqual(["**/tests/**", "**/*_test.go"]);
  });

  it("multi-language unions all configured languages' defaults", () => {
    const out = computeExcludePatterns(makeConfig(["typescript", "python"]));
    // Order is insertion order from the Set; TS first, Python second,
    // with shared patterns deduplicated to first appearance.
    expect(out).toContain("**/*.test.ts");
    expect(out).toContain("**/test_*.py");
    // Shared patterns appear once (deduplicated).
    expect(out.filter((p) => p === "**/tests/**").length).toBe(1);
    expect(out.filter((p) => p === "**/test/**").length).toBe(1);
  });

  it("user augmentations append to defaults", () => {
    const out = computeExcludePatterns(
      makeConfig(["typescript"], ["vendor/**", "scripts/**"]),
    );
    expect(out).toContain("**/*.test.ts"); // default still present
    expect(out).toContain("vendor/**"); // user pattern appended
    expect(out).toContain("scripts/**");
  });

  it("empty user array means no augmentation; defaults still apply", () => {
    const out = computeExcludePatterns(makeConfig(["typescript"], []));
    // Defaults present; nothing added.
    expect(out).toEqual([...DEFAULT_EXCLUDE_PATTERNS.typescript]);
  });

  it("user pattern duplicating a default is deduplicated", () => {
    const out = computeExcludePatterns(
      makeConfig(["typescript"], ["**/*.test.ts"]),
    );
    expect(out.filter((p) => p === "**/*.test.ts").length).toBe(1);
  });

  it("missing extraction block treats user augmentation as empty", () => {
    const out = computeExcludePatterns(makeConfig(["typescript"]));
    expect(out).toEqual([...DEFAULT_EXCLUDE_PATTERNS.typescript]);
  });
});
