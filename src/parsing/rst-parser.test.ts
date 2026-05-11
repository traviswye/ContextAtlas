import { describe, expect, it } from "vitest";

import { parseRst, parseRstSymbols } from "./rst-parser.js";

describe("parseRstSymbols (v0.7 Step 2.1.a Scope γ' rST analog to parseFrontmatterSymbols)", () => {
  it("extracts inline comma-separated :symbols: field", () => {
    const rst = `Title
=====

:symbols: SymbolA, SymbolB, SymbolC

Body text.
`;
    expect(parseRstSymbols(rst)).toEqual(["SymbolA", "SymbolB", "SymbolC"]);
  });

  it("extracts indented multi-line :symbols: field with dashes", () => {
    const rst = `Title
=====

:symbols:
   - SymbolA
   - SymbolB
   - SymbolC

Body text.
`;
    expect(parseRstSymbols(rst)).toEqual(["SymbolA", "SymbolB", "SymbolC"]);
  });

  it("returns empty array when :symbols: field absent", () => {
    const rst = `Title
=====

:date: 2026-05-11

Body text.
`;
    expect(parseRstSymbols(rst)).toEqual([]);
  });

  it("returns empty array for content with no field list", () => {
    const rst = `Title
=====

Body text without any field list.
`;
    expect(parseRstSymbols(rst)).toEqual([]);
  });

  it("is case-insensitive on field name", () => {
    const rst = `Title
=====

:Symbols: A, B, C
`;
    expect(parseRstSymbols(rst)).toEqual(["A", "B", "C"]);
  });
});

describe("parseRst (custom subset structured output)", () => {
  it("detects title via underline-only adornment", () => {
    const rst = `Document Title
==============

Body.
`;
    const parsed = parseRst(rst);
    expect(parsed.title).toBe("Document Title");
  });

  it("detects title via overline + underline adornment", () => {
    const rst = `==============
Document Title
==============

Body.
`;
    const parsed = parseRst(rst);
    expect(parsed.title).toBe("Document Title");
  });

  it("captures field list metadata", () => {
    const rst = `Title
=====

:Date: 2026-05-11
:Status: Accepted
:Author: Travis

Body.
`;
    const parsed = parseRst(rst);
    expect(parsed.fieldList["date"]).toEqual(["2026-05-11"]);
    expect(parsed.fieldList["status"]).toEqual(["Accepted"]);
    expect(parsed.fieldList["author"]).toEqual(["Travis"]);
  });

  it("captures sections with adornment-hierarchy levels", () => {
    const rst = `Title
=====

Section A
---------

Body A.

Section B
---------

Body B.
`;
    const parsed = parseRst(rst);
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0].title).toBe("Section A");
    expect(parsed.sections[1].title).toBe("Section B");
    expect(parsed.sections[0].level).toBe(parsed.sections[1].level);
  });

  it("assigns distinct levels by first-occurrence adornment character", () => {
    const rst = `Top
===

Section
-------

Sub-section
~~~~~~~~~~~

Body.
`;
    const parsed = parseRst(rst);
    const sectionLevels = parsed.sections.map((s) => s.level);
    expect(sectionLevels[0]).toBeLessThan(sectionLevels[1]);
  });

  it("normalises inline hyperlinks to plain text with bracketed URL", () => {
    const rst = `Title
=====

Section
-------

See \`Example <https://example.com>\`__ for details.
`;
    const parsed = parseRst(rst);
    expect(parsed.sections[0].body).toContain("Example (https://example.com)");
  });

  it("handles empty input gracefully", () => {
    const parsed = parseRst("");
    expect(parsed.title).toBeUndefined();
    expect(parsed.fieldList).toEqual({});
    expect(parsed.sections).toEqual([]);
  });

  it("handles unsupported constructs (directives) as plain text in body", () => {
    const rst = `Title
=====

Section
-------

.. code-block:: python

   def example():
       pass

Plain paragraph.
`;
    const parsed = parseRst(rst);
    // Directives fall through to plain text — extractor LLM handles them.
    expect(parsed.sections[0].title).toBe("Section");
    expect(parsed.sections[0].body).toContain("code-block");
  });
});
