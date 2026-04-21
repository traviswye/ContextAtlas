import { describe, expect, it } from "vitest";

import { parseFrontmatterSymbols } from "./frontmatter.js";

describe("parseFrontmatterSymbols", () => {
  it("extracts a standard list of symbols", () => {
    const raw =
      "---\nid: ADR-01\nsymbols:\n  - SymbolId\n  - Symbol\n  - LANG_CODES\n---\nbody";
    expect(parseFrontmatterSymbols(raw)).toEqual([
      "SymbolId",
      "Symbol",
      "LANG_CODES",
    ]);
  });

  it("returns [] when there is no frontmatter block", () => {
    expect(parseFrontmatterSymbols("# just a body\nsome text")).toEqual([]);
  });

  it("returns [] when frontmatter has no 'symbols' field", () => {
    const raw = "---\nid: ADR-02\ntitle: Some title\n---\nbody";
    expect(parseFrontmatterSymbols(raw)).toEqual([]);
  });

  it("returns [] when 'symbols' is an empty list", () => {
    expect(parseFrontmatterSymbols("---\nsymbols: []\n---\nbody")).toEqual([]);
  });

  it("returns [] when 'symbols' is not an array", () => {
    expect(
      parseFrontmatterSymbols("---\nsymbols: just-a-string\n---\nbody"),
    ).toEqual([]);
  });

  it("filters out non-string entries", () => {
    const raw = "---\nsymbols:\n  - Valid\n  - 42\n  - null\n---\nbody";
    expect(parseFrontmatterSymbols(raw)).toEqual(["Valid"]);
  });

  it("returns [] on unterminated frontmatter", () => {
    expect(parseFrontmatterSymbols("---\nid: foo\nno end marker")).toEqual(
      [],
    );
  });

  it("returns [] and logs warn on malformed YAML inside the frontmatter", () => {
    // Unbalanced structure that js-yaml will reject.
    const raw = "---\nsymbols:\n  - [unclosed\n---\nbody";
    expect(parseFrontmatterSymbols(raw, "docs/adr/bad.md")).toEqual([]);
  });

  it("handles frontmatter with interleaved fields in any order", () => {
    const raw =
      "---\nstatus: accepted\nsymbols:\n  - Foo\nid: ADR-99\n---\nbody";
    expect(parseFrontmatterSymbols(raw)).toEqual(["Foo"]);
  });
});
