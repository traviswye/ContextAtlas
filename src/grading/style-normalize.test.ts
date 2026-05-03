/**
 * Tests for src/grading/style-normalize.ts.
 *
 * Coverage targets per Step 4 design lock:
 *   - Idempotency: norm(norm(x)) === norm(x).
 *   - Determinism: same input → same output.
 *   - Markdown headers stripped.
 *   - Bullets stripped (Decision E deviation: entirely, not converted).
 *   - Code fences stripped (content preserved).
 *   - Inline emphasis stripped.
 *   - Inline code backticks stripped.
 *   - Whitespace normalization.
 *   - Source-code refs preserved (don't mangle file:line).
 *   - ADR refs preserved.
 *   - Snake_case identifiers NOT mangled (underscore-emphasis bounded).
 *   - Empty / whitespace-only inputs.
 */

import { describe, expect, it } from "vitest";

import { styleNormalize } from "./style-normalize.js";

describe("styleNormalize — markdown stripping", () => {
  it("strips H1-H6 markdown headers", () => {
    expect(styleNormalize("# Heading")).toBe("Heading");
    expect(styleNormalize("## Section")).toBe("Section");
    expect(styleNormalize("###### Sub-sub")).toBe("Sub-sub");
  });

  it("strips bullet markers entirely (Decision E deviation)", () => {
    const input = "- first\n- second\n- third";
    expect(styleNormalize(input)).toBe("first\nsecond\nthird");
  });

  it("strips bullets with various markers (-, *, +)", () => {
    expect(styleNormalize("- a\n* b\n+ c")).toBe("a\nb\nc");
  });

  it("strips nested/indented bullets", () => {
    const input = "- top\n  - nested\n    - deep";
    expect(styleNormalize(input)).toBe("top\nnested\ndeep");
  });

  it("strips ordered-list markers", () => {
    expect(styleNormalize("1. first\n2. second\n3. third")).toBe(
      "first\nsecond\nthird",
    );
  });

  it("strips code-fence delimiters; preserves content inside", () => {
    const input = "```python\ndef foo():\n    return 1\n```";
    const output = styleNormalize(input);
    expect(output).toContain("def foo():");
    expect(output).toContain("return 1");
    expect(output).not.toContain("```");
  });

  it("strips bold emphasis (preserves text)", () => {
    expect(styleNormalize("This is **important** text")).toBe(
      "This is important text",
    );
  });

  it("strips italic emphasis with single-asterisk (preserves text)", () => {
    expect(styleNormalize("This is *italic* text")).toBe(
      "This is italic text",
    );
  });

  it("strips italic emphasis with underscore (preserves text)", () => {
    expect(styleNormalize("This is _italic_ text")).toBe(
      "This is italic text",
    );
  });

  it("strips inline-code backticks (preserves text)", () => {
    expect(styleNormalize("Call `fn()` first")).toBe("Call fn() first");
  });
});

describe("styleNormalize — preservation of substantive content", () => {
  it("preserves source-code file:line refs", () => {
    const ref = "src/validator/validator.test.ts:36-61";
    expect(styleNormalize(`See ${ref} for impl`)).toBe(
      `See ${ref} for impl`,
    );
  });

  it("preserves Python file:line refs", () => {
    const ref = "httpx/_models.py:635-639";
    expect(styleNormalize(`Per ${ref}`)).toBe(`Per ${ref}`);
  });

  it("preserves ADR-NN references", () => {
    expect(styleNormalize("Per ADR-04 and ADR-19, the constraint holds")).toBe(
      "Per ADR-04 and ADR-19, the constraint holds",
    );
  });

  it("does NOT mangle snake_case identifiers (underscore-emphasis bounded)", () => {
    expect(styleNormalize("the factual_correctness axis")).toBe(
      "the factual_correctness axis",
    );
    expect(styleNormalize("call get_symbol_context()")).toBe(
      "call get_symbol_context()",
    );
  });

  it("preserves URLs and arrows", () => {
    expect(
      styleNormalize("flow: schema → handler → client at example.com/path"),
    ).toBe("flow: schema → handler → client at example.com/path");
  });
});

describe("styleNormalize — whitespace normalization", () => {
  it("collapses multi-spaces to single space", () => {
    expect(styleNormalize("hello     world")).toBe("hello world");
  });

  it("collapses 3+ newlines to 2", () => {
    expect(styleNormalize("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("preserves single-newline paragraph breaks", () => {
    expect(styleNormalize("a\n\nb")).toBe("a\n\nb");
  });

  it("trims leading and trailing whitespace", () => {
    expect(styleNormalize("   text   ")).toBe("text");
  });

  it("trims each line independently", () => {
    expect(styleNormalize("  a  \n  b  ")).toBe("a\nb");
  });
});

describe("styleNormalize — invariants", () => {
  it("is idempotent: norm(norm(x)) === norm(x)", () => {
    const inputs = [
      "# Header\n- bullet\n**bold** and *italic*\n```\ncode\n```",
      "Plain prose with no markdown.",
      "Mixed: see `func()` per **ADR-04** in src/foo.ts:42",
      "  trailing  spaces  \n  and  newlines  \n\n\n",
      "1. Ordered\n2. List\n3. Items",
      "_emphasized_ vs snake_case_identifier",
    ];
    for (const input of inputs) {
      const once = styleNormalize(input);
      const twice = styleNormalize(once);
      expect(twice).toBe(once);
    }
  });

  it("is deterministic: same input → same output", () => {
    const input =
      "# Title\n\n- bullet **bold**\n- bullet `code`\n\n```\nsnippet\n```";
    expect(styleNormalize(input)).toBe(styleNormalize(input));
    expect(styleNormalize(input)).toBe(styleNormalize(input));
  });

  it("returns empty string for empty input", () => {
    expect(styleNormalize("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(styleNormalize("   \n\n\t   ")).toBe("");
  });
});

describe("styleNormalize — realistic mixed inputs", () => {
  it("normalizes a representative grading-input answer", () => {
    const input =
      "# Validator Type Flow\n\n" +
      "The whole system is governed by **ADR-04**:\n\n" +
      "- route registration → handler Context\n" +
      "- typed client preserved end-to-end\n" +
      "- *no* codegen\n\n" +
      "See `src/validator/validator.test.ts:36-61` for reference.\n\n" +
      "```typescript\n" +
      "const v = zValidator(schema);\n" +
      "```";
    const output = styleNormalize(input);
    expect(output).toContain("Validator Type Flow");
    expect(output).toContain("ADR-04");
    expect(output).toContain("route registration");
    expect(output).toContain("src/validator/validator.test.ts:36-61");
    expect(output).toContain("zValidator(schema)");
    expect(output).not.toContain("```");
    expect(output).not.toContain("**");
    expect(output).not.toContain("- ");
    expect(output).not.toContain("# ");
  });

  it("normalizes the same input idempotently after one pass", () => {
    const input =
      "## Section\n- item with `code`\n- item with **bold**";
    const once = styleNormalize(input);
    expect(styleNormalize(once)).toBe(once);
  });
});
