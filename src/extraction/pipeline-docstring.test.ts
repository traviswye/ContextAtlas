/**
 * v0.3 Step 10 — docstring extraction skeleton tests.
 *
 * Commit 1 placeholder per Step 10 scoping (Substep 10.4 commit boundary):
 * keeps `npm test` non-regressive while real behavioral tests land in
 * Commit 2. Currently exercises the parser helper and surfaces the
 * `extractDocstringsForFile` export so test infrastructure recognizes
 * the module — actual end-to-end coverage (per Step 10 ship criterion 5
 * a/b/c: docstring present + parsed correctly, docstring absent, malformed
 * docstring) lands in Commit 2.
 */

import { describe, it, expect } from "vitest";

import { parseDocstringFromGoplsHover } from "../adapters/go.js";
import { extractDocstringsForFile } from "./pipeline.js";

describe("v0.3 Step 10 — docstring extraction (Commit 1 skeleton)", () => {
  describe("parseDocstringFromGoplsHover (gopls hover output parser)", () => {
    it("extracts doc-comment prose section between --- separators", () => {
      const hoverValue = [
        "```go",
        "func NoArgs(cmd *Command, args []string) error",
        "```",
        "",
        "---",
        "",
        "NoArgs returns an error if any args are included.",
        "",
        "",
        "---",
        "",
        "[`cobra.NoArgs` on pkg.go.dev](https://pkg.go.dev/...)",
      ].join("\n");
      const result = parseDocstringFromGoplsHover(hoverValue);
      expect(result).toBe("NoArgs returns an error if any args are included.");
    });

    it("returns null when fewer than 2 sections (no separator)", () => {
      const hoverValue = "```go\nfunc Foo()\n```";
      expect(parseDocstringFromGoplsHover(hoverValue)).toBeNull();
    });

    it("returns null when section 2 is empty/whitespace-only", () => {
      const hoverValue = ["```go", "func Foo()", "```", "", "---", "", "", "---", ""].join("\n");
      expect(parseDocstringFromGoplsHover(hoverValue)).toBeNull();
    });

    it("preserves multi-paragraph structure (Sample #5 ExactValidArgs case)", () => {
      const hoverValue = [
        "```go",
        "func ExactValidArgs(n int) PositionalArgs",
        "```",
        "",
        "---",
        "",
        "ExactValidArgs returns an error if there are not exactly N positional args OR there are any positional args that are not in the `ValidArgs` field of `Command`",
        "",
        "Deprecated: use MatchAll(ExactArgs(n), OnlyValidArgs) instead",
        "",
        "",
        "---",
      ].join("\n");
      const result = parseDocstringFromGoplsHover(hoverValue);
      expect(result).toContain("ExactValidArgs returns an error");
      expect(result).toContain("Deprecated: use MatchAll");
      // Paragraph break preserved between behavioral spec and Deprecated marker.
      expect(result).toMatch(/Command`\n\nDeprecated:/);
    });
  });

  describe("extractDocstringsForFile (export surface)", () => {
    it("is exported and callable as a function", () => {
      // Skeleton: just verify the export exists and is a function.
      // Full behavioral tests (per Step 10 ship criterion 5) land in
      // Commit 2 — they require fixture setup with a real adapter +
      // mock anthropic client.
      expect(typeof extractDocstringsForFile).toBe("function");
    });
  });
});
