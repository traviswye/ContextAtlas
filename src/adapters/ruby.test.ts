import { describe, expect, it } from "vitest";

import {
  RUBY_EXTENSIONS,
  buildDiagnosticsFromResponse,
  buildReferenceId,
  dedupLocationsByNormalizedPath,
  detectRails,
  findSymbolByName,
  mapDiagnosticSeverity,
  mapRubyKind,
  parseRubyClassExtends,
  parseRubyHoverContent,
  parseRubyMixins,
  parseSymbolId,
  resolveSpawnPattern,
} from "./ruby.js";

/**
 * Pure-function unit tests for RubyAdapter helpers per v0.9 Stream A
 * Phase 3 Substep 3.2 ship criteria. Integration tests against the
 * fixture (with ruby-lsp + bundler) are deferred to Phase 4
 * conformance substrate.
 */

describe("mapRubyKind", () => {
  // Probe-empirical: ruby-lsp 0.26.9 emits these LSP SymbolKind
  // values per documentSymbol response (probe #1 baseline file).
  it("maps Module (kind 2) → 'module'", () => {
    expect(mapRubyKind(2)).toBe("module");
  });

  it("maps Class (kind 5) → 'class'", () => {
    expect(mapRubyKind(5)).toBe("class");
  });

  it("maps Method (kind 6) → 'method'", () => {
    expect(mapRubyKind(6)).toBe("method");
  });

  it("maps Function (kind 12 — class methods) → 'method' per Φ-γ-variant lock", () => {
    // Class methods (def self.foo) come as kind 12; remap to 'method'.
    // The 'self.' prefix in name preserves receiver-distinction per
    // gopls precedent — see ADR-21 §Rationale.
    expect(mapRubyKind(12)).toBe("method");
  });

  it("maps Constant (kind 14) → 'variable' (reduced taxonomy)", () => {
    // ContextAtlas SymbolKind has no 'constant'; 'variable' is the
    // closest fit, matching ADR-14 gopls iota-const handling.
    expect(mapRubyKind(14)).toBe("variable");
  });

  it("maps Field (kind 8 — instance vars) → 'other' (filtered downstream)", () => {
    // Instance variables (@name) appear nested in methods; filtered
    // out at listSymbols layer per ADR-13 Python parameter precedent.
    expect(mapRubyKind(8)).toBe("other");
  });

  it("maps unknown kinds to 'other'", () => {
    expect(mapRubyKind(0)).toBe("other");
    expect(mapRubyKind(99)).toBe("other");
  });
});

describe("parseSymbolId", () => {
  // ADR-01 Symbol-ID format: sym:<lang-short>:<path>:<name>
  // Ruby short code is 'rb' (per LANG_CODES in src/types.ts).

  it("parses canonical Ruby Symbol-ID", () => {
    expect(parseSymbolId("sym:rb:app/models/user.rb:User")).toEqual({
      path: "app/models/user.rb",
      name: "User",
    });
  });

  it("preserves DSL macro 'macro :argument' name verbatim (probe-empirical)", () => {
    // ruby-lsp emits names like 'has_many :posts' for DSL macros.
    // ADR-21 §LSP primitive mappings + commit f3faafb fixture
    // probe-empirical: this form is preserved through Symbol-ID.
    expect(
      parseSymbolId("sym:rb:app/models/user.rb:has_many :posts"),
    ).toEqual({
      path: "app/models/user.rb",
      name: "has_many :posts",
    });
  });

  it("preserves 'self.method' class-method prefix verbatim per Φ-γ-variant", () => {
    // Per ADR-21 commit a76c1c4 surgical revision: 'self.' prefix
    // preserved verbatim. Disambiguates from instance method of
    // same name at Symbol-ID level.
    expect(
      parseSymbolId("sym:rb:app/models/user.rb:self.find_by_email"),
    ).toEqual({
      path: "app/models/user.rb",
      name: "self.find_by_email",
    });
  });

  it("preserves predicate-method '?' and bang-method '!' suffixes", () => {
    // Ruby idioms: predicate methods end in ?; bang methods end in !.
    expect(parseSymbolId("sym:rb:lib/x.rb:active?")).toEqual({
      path: "lib/x.rb",
      name: "active?",
    });
    expect(parseSymbolId("sym:rb:app/models/post.rb:find_by_slug!")).toEqual({
      path: "app/models/post.rb",
      name: "find_by_slug!",
    });
  });

  it("preserves Module::Constant scope-resolved names", () => {
    expect(
      parseSymbolId("sym:rb:app/models/user.rb:User::PREMIUM_TIER_LIMIT"),
    ).toEqual({
      path: "app/models/user.rb",
      name: "User::PREMIUM_TIER_LIMIT",
    });
  });

  it("returns null for malformed IDs", () => {
    expect(parseSymbolId("not-a-symbol-id")).toBeNull();
    expect(parseSymbolId("sym:py:foo.py:Bar")).toBeNull(); // wrong language
    expect(parseSymbolId("sym:rb:")).toBeNull(); // missing path+name
    expect(parseSymbolId("sym:rb:foo.rb")).toBeNull(); // missing name
  });
});

describe("dedupLocationsByNormalizedPath", () => {
  // ADR-21 §URL-encoding-result-duplication: ruby-lsp returns each
  // cross-file location TWICE under c%3A + c: forms on Windows.
  // Utility dedupes via normalizePath-driven tuple key.

  it("dedupes URL-encoded vs literal drive-letter duplicates", () => {
    const items = [
      {
        uri: "file:///c%3A/CodeWork/repo/file.rb",
        range: { start: { line: 5, character: 0 } },
      },
      {
        uri: "file:///c:/CodeWork/repo/file.rb",
        range: { start: { line: 5, character: 0 } },
      },
    ];
    const out = dedupLocationsByNormalizedPath(items, (i) => ({
      uri: i.uri,
      line: i.range.start.line,
    }));
    expect(out).toHaveLength(1);
  });

  it("preserves distinct lines in the same file", () => {
    const items = [
      {
        uri: "file:///c:/repo/file.rb",
        range: { start: { line: 5, character: 0 } },
      },
      {
        uri: "file:///c:/repo/file.rb",
        range: { start: { line: 10, character: 0 } },
      },
    ];
    const out = dedupLocationsByNormalizedPath(items, (i) => ({
      uri: i.uri,
      line: i.range.start.line,
    }));
    expect(out).toHaveLength(2);
  });

  it("preserves distinct files", () => {
    const items = [
      {
        uri: "file:///c:/repo/a.rb",
        range: { start: { line: 5, character: 0 } },
      },
      {
        uri: "file:///c:/repo/b.rb",
        range: { start: { line: 5, character: 0 } },
      },
    ];
    const out = dedupLocationsByNormalizedPath(items, (i) => ({
      uri: i.uri,
      line: i.range.start.line,
    }));
    expect(out).toHaveLength(2);
  });

  it("optional col-component disambiguates same-line same-file entries", () => {
    const items = [
      {
        uri: "file:///c:/repo/file.rb",
        range: { start: { line: 5, character: 0 } },
      },
      {
        uri: "file:///c:/repo/file.rb",
        range: { start: { line: 5, character: 12 } },
      },
    ];
    const noCol = dedupLocationsByNormalizedPath(items, (i) => ({
      uri: i.uri,
      line: i.range.start.line,
    }));
    expect(noCol).toHaveLength(1); // dedup on (path, line) only

    const withCol = dedupLocationsByNormalizedPath(items, (i) => ({
      uri: i.uri,
      line: i.range.start.line,
      col: i.range.start.character,
    }));
    expect(withCol).toHaveLength(2); // distinct cols preserved
  });

  it("returns empty array for empty input", () => {
    expect(
      dedupLocationsByNormalizedPath([], (i: { uri: string }) => ({
        uri: i.uri,
        line: 0,
      })),
    ).toEqual([]);
  });

  it("preserves input order (first-seen wins)", () => {
    const items = [
      { uri: "file:///c%3A/repo/a.rb", line: 1 },
      { uri: "file:///c:/repo/b.rb", line: 1 },
      { uri: "file:///c:/repo/a.rb", line: 1 }, // dup of first
    ];
    const out = dedupLocationsByNormalizedPath(items, (i) => ({
      uri: i.uri,
      line: i.line,
    }));
    expect(out).toHaveLength(2);
    // First-seen wins: items[0] (c%3A form) preserved over items[2]
    expect(out[0]?.uri).toBe("file:///c%3A/repo/a.rb");
    expect(out[1]?.uri).toBe("file:///c:/repo/b.rb");
  });
});

describe("RUBY_EXTENSIONS", () => {
  it("includes '.rb' only at v1.0 per ADR-21 Decision", () => {
    expect(RUBY_EXTENSIONS).toEqual([".rb"]);
  });

  it("does NOT include '.erb' (ERB deferred to v1.1)", () => {
    expect(RUBY_EXTENSIONS).not.toContain(".erb");
  });
});

describe("resolveSpawnPattern", () => {
  // Cross-platform behavior depends on process.platform. Tests
  // assume Windows-only paths exercise cmd.exe wrap; non-Windows
  // paths spawn the binary directly. Per ADR-21 §"Install pattern".

  const isWindows = process.platform === "win32";

  it("direct gem-install pattern when cliPathOverride set", () => {
    const out = resolveSpawnPattern({
      cliPathOverride: "/usr/local/bin/ruby-lsp",
      railsDetected: false,
    });
    expect(out.pattern).toBe("direct");
    if (isWindows) {
      expect(out.command).toBe("cmd.exe");
      expect(out.args).toEqual(["/c", "/usr/local/bin/ruby-lsp"]);
    } else {
      expect(out.command).toBe("/usr/local/bin/ruby-lsp");
      expect(out.args).toEqual([]);
    }
  });

  it("bundler pattern when railsDetected=true and no override", () => {
    const out = resolveSpawnPattern({
      bundleBinOverride: "bundle",
      railsDetected: true,
    });
    expect(out.pattern).toBe("bundler");
    if (isWindows) {
      expect(out.command).toBe("cmd.exe");
      expect(out.args).toEqual(["/c", "bundle", "exec", "ruby-lsp"]);
    } else {
      expect(out.command).toBe("bundle");
      expect(out.args).toEqual(["exec", "ruby-lsp"]);
    }
  });

  it("no-Rails fallback uses 'ruby-lsp' direct via PATH", () => {
    const out = resolveSpawnPattern({
      railsDetected: false,
    });
    expect(out.pattern).toBe("direct");
    if (isWindows) {
      expect(out.command).toBe("cmd.exe");
      expect(out.args).toEqual(["/c", "ruby-lsp"]);
    } else {
      expect(out.command).toBe("ruby-lsp");
      expect(out.args).toEqual([]);
    }
  });

  it("Windows defaults bundle to 'bundle.bat' when no override", () => {
    if (!isWindows) {
      return; // skip on non-Windows; bundle remains 'bundle'
    }
    const out = resolveSpawnPattern({
      railsDetected: true,
    });
    expect(out.args).toContain("bundle.bat");
  });

  it("cliPathOverride takes precedence over Rails detection", () => {
    const out = resolveSpawnPattern({
      cliPathOverride: "/custom/ruby-lsp",
      railsDetected: true, // Rails detected but override wins
    });
    expect(out.pattern).toBe("direct"); // direct, not bundler
  });
});

describe("parseRubyHoverContent", () => {
  // Probe #4 baseline empirical substrate covers these cases.
  // ADR-21 §LSP primitive mappings: hover envelope structure is
  //   ```ruby <signature> ``` + **Definitions**: ... + optional RDoc.

  it("parses User class hover (code block + definitions, no RDoc)", () => {
    // Probe #4 captured: hover on User class declaration.
    const value =
      "```ruby\nUser\n```\n\n" +
      "**Definitions**: [user.rb](file:///c%3A/foo/user.rb#L1,1-36,4) | " +
      "[user.rb](file:///c:/foo/user.rb#L1,1-36,4)";
    const out = parseRubyHoverContent(value);
    expect(out.signature).toBe("User");
    expect(out.prose).toBeNull();
  });

  it("parses has_many DSL macro hover (code block + definitions + rich RDoc)", () => {
    // Probe #4 captured: hover on `has_many :posts` returns 200+ line
    // RDoc from activerecord gem. Test verifies RDoc body preserved
    // (no truncation) and definitions section stripped.
    const value =
      "```ruby\nhas_many(name, scope = <default>, **options, &extension)\n```\n\n" +
      "**Definitions**: [associations.rb](file:///C%3A/.../associations.rb#L1302,9-1305,12)\n\n\n\n" +
      "Specifies a one-to-many association.\n\nMore RDoc body content.";
    const out = parseRubyHoverContent(value);
    expect(out.signature).toBe(
      "has_many(name, scope = <default>, **options, &extension)",
    );
    expect(out.prose).toBe(
      "Specifies a one-to-many association.\n\nMore RDoc body content.",
    );
  });

  it("parses module_function hover (rbs signature + HTML comment + RDoc)", () => {
    // Probe #4 captured: hover on `module_function` includes rbs-
    // derived signature with overload count + HTML comment with
    // rdoc-file metadata + RDoc body. HTML comment should be stripped.
    const value =
      "```ruby\nmodule_function()\n(+4 overloads)\n```\n\n" +
      "**Definitions**: [module.rbs](file:///C%3A/.../module.rbs#L1226,3-1230,94)\n\n\n\n" +
      "<!--\n  rdoc-file=vm_method.c\n  - module_function -> nil\n-->\n" +
      "Creates module functions for the named methods.";
    const out = parseRubyHoverContent(value);
    expect(out.signature).toBe("module_function()\n(+4 overloads)");
    expect(out.prose).toBe(
      "Creates module functions for the named methods.",
    );
  });

  it("returns nulls for empty value", () => {
    const out = parseRubyHoverContent("");
    expect(out.signature).toBeNull();
    expect(out.prose).toBeNull();
  });

  it("parses code-block-only value (no definitions, no prose)", () => {
    const value = "```ruby\nMyClass\n```";
    const out = parseRubyHoverContent(value);
    expect(out.signature).toBe("MyClass");
    expect(out.prose).toBeNull();
  });

  it("preserves multi-line code block content (overload signatures)", () => {
    const value =
      "```ruby\nmethod_a(x)\nmethod_a(x, y)\n(+2 more)\n```\n\nDocs.";
    const out = parseRubyHoverContent(value);
    expect(out.signature).toBe("method_a(x)\nmethod_a(x, y)\n(+2 more)");
    expect(out.prose).toBe("Docs.");
  });

  it("handles value with no code block (signature null, prose populated)", () => {
    // Edge case: ruby-lsp could theoretically emit prose-only hover.
    // Probe didn't observe this but parser handles defensively.
    const value =
      "**Definitions**: [foo.rb](file:///foo.rb)\n\nSome prose content.";
    const out = parseRubyHoverContent(value);
    expect(out.signature).toBeNull();
    expect(out.prose).toBe("Some prose content.");
  });
});

describe("findSymbolByName", () => {
  // Recursive walker over LspDocumentSymbol[] tree. Used at
  // getSymbolDetails (3.3) + downstream substeps to locate target
  // by name across nested children (Rails class with method
  // children, Concern with class_methods block flattened to
  // direct children, etc.).

  it("finds top-level symbol by name", () => {
    const symbols = [
      {
        name: "User",
        kind: 5,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 10 },
        },
      },
    ];
    const out = findSymbolByName(symbols, "User");
    expect(out?.name).toBe("User");
    expect(out?.kind).toBe(5);
  });

  it("finds nested child symbol (User.display_name)", () => {
    const symbols = [
      {
        name: "User",
        kind: 5,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 10 },
        },
        children: [
          {
            name: "display_name",
            kind: 6,
            range: {
              start: { line: 5, character: 2 },
              end: { line: 7, character: 5 },
            },
            selectionRange: {
              start: { line: 5, character: 6 },
              end: { line: 5, character: 18 },
            },
          },
        ],
      },
    ];
    const out = findSymbolByName(symbols, "display_name");
    expect(out?.name).toBe("display_name");
    expect(out?.kind).toBe(6);
  });

  it("finds DSL macro by verbatim name (has_many :posts)", () => {
    const symbols = [
      {
        name: "User",
        kind: 5,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 10 },
        },
        children: [
          {
            name: "has_many :posts",
            kind: 6,
            range: {
              start: { line: 3, character: 11 },
              end: { line: 3, character: 17 },
            },
            selectionRange: {
              start: { line: 3, character: 12 },
              end: { line: 3, character: 17 },
            },
          },
        ],
      },
    ];
    const out = findSymbolByName(symbols, "has_many :posts");
    expect(out?.name).toBe("has_many :posts");
  });

  it("finds class method preserving 'self.' prefix per Φ-γ-variant", () => {
    const symbols = [
      {
        name: "User",
        kind: 5,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 10 },
        },
        children: [
          {
            name: "self.find_by_email",
            kind: 12,
            range: {
              start: { line: 22, character: 2 },
              end: { line: 24, character: 5 },
            },
            selectionRange: {
              start: { line: 22, character: 11 },
              end: { line: 22, character: 24 },
            },
          },
        ],
      },
    ];
    const out = findSymbolByName(symbols, "self.find_by_email");
    expect(out?.name).toBe("self.find_by_email");
    expect(out?.kind).toBe(12);
  });

  it("returns null when name not found", () => {
    const symbols = [
      {
        name: "User",
        kind: 5,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 10 },
        },
      },
    ];
    expect(findSymbolByName(symbols, "Nonexistent")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(findSymbolByName([], "anything")).toBeNull();
  });

  it("first match wins on duplicate names (instance vs class method)", () => {
    // Edge case: Ruby allows instance method `foo` and class method
    // `self.foo` in the same class — different names so no collision.
    // But test verifies the walker returns first match deterministically
    // when nothing else differentiates.
    const symbols = [
      {
        name: "wrapper",
        kind: 5,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 100, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 13 },
        },
        children: [
          {
            name: "foo",
            kind: 6,
            range: {
              start: { line: 5, character: 2 },
              end: { line: 7, character: 5 },
            },
            selectionRange: {
              start: { line: 5, character: 6 },
              end: { line: 5, character: 9 },
            },
          },
        ],
      },
    ];
    const out = findSymbolByName(symbols, "foo");
    expect(out?.name).toBe("foo");
    expect(out?.range.start.line).toBe(5);
  });
});

describe("buildReferenceId", () => {
  // ADR-01 Reference-ID format: ref:<lang-short>:<path>:<line>
  // Ruby short code: 'rb'. Line is 1-indexed (human-readable).

  it("builds canonical Reference-ID", () => {
    expect(buildReferenceId("app/models/user.rb", 5)).toBe(
      "ref:rb:app/models/user.rb:5",
    );
  });

  it("preserves forward-slash path separators", () => {
    expect(buildReferenceId("lib/concerns/sluggable.rb", 12)).toBe(
      "ref:rb:lib/concerns/sluggable.rb:12",
    );
  });

  it("uses 1-indexed lines", () => {
    // Line 1 = first line of file (LSP is 0-indexed; adapter
    // converts at the boundary). Line 0 is invalid for human-
    // readable identification.
    expect(buildReferenceId("a.rb", 1)).toBe("ref:rb:a.rb:1");
  });
});

describe("dedupLocationsByNormalizedPath — LspLocation-shape integration (Substep 3.4 first reuse)", () => {
  // First empirical reuse of the utility designed at Substep 3.2
  // against the actual LspLocation shape used by findReferences.
  // Validates extractor-function shape generalizes for cross-file
  // Location[] arrays exhibiting probe-empirical URL-encoding
  // duplication on Windows.

  it("dedupes Windows URL-encoded vs literal drive-letter Location duplicates", () => {
    const locations = [
      {
        uri: "file:///c%3A/repo/file.rb",
        range: {
          start: { line: 5, character: 0 },
          end: { line: 5, character: 10 },
        },
      },
      {
        uri: "file:///c:/repo/file.rb",
        range: {
          start: { line: 5, character: 0 },
          end: { line: 5, character: 10 },
        },
      },
    ];
    const out = dedupLocationsByNormalizedPath(locations, (loc) => ({
      uri: loc.uri,
      line: loc.range.start.line,
      col: loc.range.start.character,
    }));
    expect(out).toHaveLength(1);
  });

  it("preserves multiple references at distinct positions in same file", () => {
    // Probe #2 captured cases like User.recent referenced at multiple
    // lines across multiple files. Dedup MUST NOT collapse legitimate
    // distinct-position references.
    const locations = [
      {
        uri: "file:///c:/repo/post.rb",
        range: {
          start: { line: 8, character: 2 },
          end: { line: 8, character: 7 },
        },
      },
      {
        uri: "file:///c:/repo/post.rb",
        range: {
          start: { line: 9, character: 2 },
          end: { line: 9, character: 7 },
        },
      },
    ];
    const out = dedupLocationsByNormalizedPath(locations, (loc) => ({
      uri: loc.uri,
      line: loc.range.start.line,
      col: loc.range.start.character,
    }));
    expect(out).toHaveLength(2);
  });

  it("dedupes URL-encoding duplicates at same line, preserves distinct lines", () => {
    // Compose case: URL-encoding-duplicated reference at line 5 +
    // distinct-position reference at line 10. Expected: dedup the
    // line-5 pair to one entry; preserve line-10 as separate.
    const locations = [
      {
        uri: "file:///c%3A/repo/file.rb",
        range: {
          start: { line: 5, character: 0 },
          end: { line: 5, character: 10 },
        },
      },
      {
        uri: "file:///c:/repo/file.rb",
        range: {
          start: { line: 5, character: 0 },
          end: { line: 5, character: 10 },
        },
      },
      {
        uri: "file:///c:/repo/file.rb",
        range: {
          start: { line: 10, character: 0 },
          end: { line: 10, character: 5 },
        },
      },
    ];
    const out = dedupLocationsByNormalizedPath(locations, (loc) => ({
      uri: loc.uri,
      line: loc.range.start.line,
      col: loc.range.start.character,
    }));
    expect(out).toHaveLength(2);
    // First-seen wins: dedup keeps the c%3A-encoded variant for line 5.
    expect(out[0]?.uri).toBe("file:///c%3A/repo/file.rb");
    expect(out[1]?.range.start.line).toBe(10);
  });

  it("returns empty for empty input (constant-references gap case)", () => {
    // Probe #2 captured PREMIUM_TIER_LIMIT empty references at
    // declaration site. Adapter handles empty Location[] gracefully.
    const out = dedupLocationsByNormalizedPath(
      [] as { uri: string; range: { start: { line: number; character: number } } }[],
      (loc) => ({
        uri: loc.uri,
        line: loc.range.start.line,
        col: loc.range.start.character,
      }),
    );
    expect(out).toEqual([]);
  });
});

describe("mapDiagnosticSeverity", () => {
  // LSP DiagnosticSeverity codes:
  //   1 = Error, 2 = Warning, 3 = Information, 4 = Hint
  // ContextAtlas Diagnostic severity: "error" | "warning" | "info"

  it("maps LSP severity 1 → 'error'", () => {
    expect(mapDiagnosticSeverity(1)).toBe("error");
  });

  it("maps LSP severity 2 → 'warning'", () => {
    expect(mapDiagnosticSeverity(2)).toBe("warning");
  });

  it("maps LSP severity 3 → 'info'", () => {
    expect(mapDiagnosticSeverity(3)).toBe("info");
  });

  it("maps LSP severity 4 → 'info'", () => {
    expect(mapDiagnosticSeverity(4)).toBe("info");
  });

  it("maps undefined severity → 'info' (defensive default)", () => {
    expect(mapDiagnosticSeverity(undefined)).toBe("info");
  });
});

describe("buildDiagnosticsFromResponse", () => {
  // ADR-21 §LSP primitive mappings: pull-model
  // DocumentDiagnosticReport handling. Two variants (full +
  // unchanged) plus null fallthrough.

  it("handles null response → empty array (per-call timeout fallback)", () => {
    expect(buildDiagnosticsFromResponse(null, "app/models/user.rb")).toEqual(
      [],
    );
  });

  it("handles kind: 'unchanged' → empty array (defensive, no resultId tracking at v1.0)", () => {
    const response = {
      kind: "unchanged" as const,
      resultId: "abc-123",
    };
    expect(
      buildDiagnosticsFromResponse(response, "app/models/user.rb"),
    ).toEqual([]);
  });

  it("handles kind: 'full' with empty items → empty array", () => {
    const response = {
      kind: "full" as const,
      items: [],
    };
    expect(buildDiagnosticsFromResponse(response, "broken.rb")).toEqual([]);
  });

  it("handles kind: 'full' with missing items field → empty array", () => {
    const response = {
      kind: "full" as const,
    };
    expect(buildDiagnosticsFromResponse(response, "broken.rb")).toEqual([]);
  });

  it("maps LspDiagnostic[] to ContextAtlas Diagnostic[] with 1-indexed lines", () => {
    // Probe #3 anticipated shape: prism-emitted parse error from
    // broken.rb (deliberate unclosed-paren in method signature).
    const response = {
      kind: "full" as const,
      items: [
        {
          range: {
            start: { line: 4, character: 18 },
            end: { line: 4, character: 19 },
          },
          severity: 1,
          message: "unexpected token ')'",
        },
      ],
    };
    const out = buildDiagnosticsFromResponse(response, "broken.rb");
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      severity: "error",
      message: "unexpected token ')'",
      path: "broken.rb",
      line: 5, // 0-indexed LSP line 4 → 1-indexed line 5
      column: 18,
    });
  });

  it("preserves ordering of multiple diagnostics", () => {
    const response = {
      kind: "full" as const,
      items: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
          severity: 1,
          message: "First error",
        },
        {
          range: {
            start: { line: 10, character: 2 },
            end: { line: 10, character: 8 },
          },
          severity: 2,
          message: "Second warning",
        },
      ],
    };
    const out = buildDiagnosticsFromResponse(response, "user.rb");
    expect(out).toHaveLength(2);
    expect(out[0]?.message).toBe("First error");
    expect(out[0]?.severity).toBe("error");
    expect(out[1]?.message).toBe("Second warning");
    expect(out[1]?.severity).toBe("warning");
  });

  it("maps each severity correctly via mapDiagnosticSeverity", () => {
    const response = {
      kind: "full" as const,
      items: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          severity: 1,
          message: "err",
        },
        {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 1 },
          },
          severity: 2,
          message: "warn",
        },
        {
          range: {
            start: { line: 2, character: 0 },
            end: { line: 2, character: 1 },
          },
          severity: 3,
          message: "info-msg",
        },
      ],
    };
    const out = buildDiagnosticsFromResponse(response, "x.rb");
    expect(out.map((d) => d.severity)).toEqual([
      "error",
      "warning",
      "info",
    ]);
  });
});

describe("parseRubyClassExtends", () => {
  // ADR-21 §getTypeInfo: extends via class header parsing.
  // Ruby syntax: `class Name < Super` (with optional namespacing).

  it("parses standard class with superclass", () => {
    const source = "class User < ApplicationRecord\n  # body\nend\n";
    expect(parseRubyClassExtends(source, 0)).toEqual(["ApplicationRecord"]);
  });

  it("returns empty for class with no superclass", () => {
    const source = "class Foo\n  # body\nend\n";
    expect(parseRubyClassExtends(source, 0)).toEqual([]);
  });

  it("returns empty for module declaration (no superclass syntax in Ruby)", () => {
    const source = "module Sluggable\n  # body\nend\n";
    expect(parseRubyClassExtends(source, 0)).toEqual([]);
  });

  it("returns empty for singleton class syntax (`class << self`)", () => {
    const source = "class << self\n  # body\nend\n";
    expect(parseRubyClassExtends(source, 0)).toEqual([]);
  });

  it("preserves namespaced superclass (Module::SubModule)", () => {
    const source = "class Post < ActiveRecord::Base\n  # body\nend\n";
    expect(parseRubyClassExtends(source, 0)).toEqual(["ActiveRecord::Base"]);
  });

  it("preserves deeply namespaced superclass", () => {
    const source = "class Foo < Acme::Foo::Bar::Base\n  # body\nend\n";
    expect(parseRubyClassExtends(source, 0)).toEqual([
      "Acme::Foo::Bar::Base",
    ]);
  });

  it("handles namespaced class definition", () => {
    const source = "class Foo::Bar < Baz\n  # body\nend\n";
    expect(parseRubyClassExtends(source, 0)).toEqual(["Baz"]);
  });

  it("handles whitespace variations around `<` operator", () => {
    expect(parseRubyClassExtends("class A<B\nend\n", 0)).toEqual(["B"]);
    expect(parseRubyClassExtends("class A   <   B\nend\n", 0)).toEqual([
      "B",
    ]);
  });

  it("handles class declaration with leading indentation", () => {
    const source = "  class Inner < Outer\n    # body\n  end\n";
    expect(parseRubyClassExtends(source, 0)).toEqual(["Outer"]);
  });

  it("returns empty for out-of-bounds line index", () => {
    const source = "class Foo < Bar\nend\n";
    expect(parseRubyClassExtends(source, 99)).toEqual([]);
    expect(parseRubyClassExtends(source, -1)).toEqual([]);
  });

  it("returns empty for empty source", () => {
    expect(parseRubyClassExtends("", 0)).toEqual([]);
  });
});

describe("parseRubyMixins", () => {
  // ADR-21 §getTypeInfo: implements via include/extend/prepend
  // scanning. All three keywords treated uniformly per §Decision.

  it("scans single include statement", () => {
    const source =
      "class Post\n  include Sluggable\n  # body\nend\n";
    // Class body is lines 0-3; scan range is line 1 to line 2.
    expect(parseRubyMixins(source, 0, 3)).toEqual(["Sluggable"]);
  });

  it("scans extend statement", () => {
    const source =
      "module Sluggable\n  extend ActiveSupport::Concern\nend\n";
    expect(parseRubyMixins(source, 0, 2)).toEqual([
      "ActiveSupport::Concern",
    ]);
  });

  it("scans prepend statement", () => {
    const source = "class Foo\n  prepend Wrapper\nend\n";
    expect(parseRubyMixins(source, 0, 2)).toEqual(["Wrapper"]);
  });

  it("scans multiple mixins (include + extend + prepend uniform)", () => {
    // ADR-21 §getTypeInfo §Decision: all three uniformly collected.
    const source =
      "class Post\n  include Sluggable\n  extend Helpers\n  prepend LoggingMixin\n  # body\nend\n";
    expect(parseRubyMixins(source, 0, 5)).toEqual([
      "Sluggable",
      "Helpers",
      "LoggingMixin",
    ]);
  });

  it("preserves namespaced mixin names", () => {
    const source =
      "class Post\n  include Acme::SluggableConcerns::V2\nend\n";
    expect(parseRubyMixins(source, 0, 2)).toEqual([
      "Acme::SluggableConcerns::V2",
    ]);
  });

  it("preserves order of multiple includes (source position)", () => {
    const source =
      "class Foo\n  include First\n  include Second\n  include Third\nend\n";
    expect(parseRubyMixins(source, 0, 4)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("returns empty for class with no mixins", () => {
    const source = "class Standalone\n  attr_reader :name\nend\n";
    expect(parseRubyMixins(source, 0, 2)).toEqual([]);
  });

  it("returns empty for empty class body", () => {
    const source = "class Empty\nend\n";
    expect(parseRubyMixins(source, 0, 1)).toEqual([]);
  });

  it("scans only the line range provided (bounded scan)", () => {
    // Even if mixins exist outside the range, they shouldn't be
    // included. Simulates a reopened class scenario where the
    // adapter has documentSymbol range for ONE class definition
    // but the file has multiple class openings.
    const source =
      "class Foo\n  include Out1\nend\n\nclass Bar\n  include InScope\nend\n\nclass Baz\n  include Out2\nend\n";
    // Bar's class body is lines 4-6; range is (4, 6).
    expect(parseRubyMixins(source, 4, 6)).toEqual(["InScope"]);
  });

  it("handles deeply indented mixin declarations", () => {
    // Nested module scenario — Ruby allows namespacing via nested
    // modules. The mixin is still scanned (regex is whitespace-
    // tolerant at the start).
    const source =
      "module Outer\n  module Inner\n    class Foo\n      include Mixin\n    end\n  end\nend\n";
    // Foo's body is lines 2-4; scan finds Mixin at line 3.
    expect(parseRubyMixins(source, 2, 4)).toEqual(["Mixin"]);
  });

  it("matches mixin declarations even with bracket-method-call args", () => {
    // Some include forms have additional args: `include Mixin if cond`
    // or `include Foo, Bar`. v1.0 captures the first identifier
    // after the keyword (Mixin in both cases). Multi-mixin-per-line
    // (`include Foo, Bar`) would only capture Foo at v1.0; ADR-21
    // Limitations note v1.0 single-identifier-per-line scope.
    const source =
      "class Foo\n  include Mixin if Rails.env.development?\nend\n";
    expect(parseRubyMixins(source, 0, 2)).toEqual(["Mixin"]);
  });
});

describe("detectRails", () => {
  // Mirrors ruby-lsp's heuristic: Gemfile + bin/rails presence.
  // Implementation uses fs.existsSync; this test is structure-only
  // — full empirical verification would require a fixture filesystem
  // setup (deferred to Phase 4 conformance).

  it("returns false for non-existent path", () => {
    expect(detectRails("/nonexistent/path/no-rails-here")).toBe(false);
  });

  it("returns false for repo without Gemfile", () => {
    // ContextAtlas's own repo root: has no Gemfile.
    // Note: this assumes test runs from the repo root; vitest default.
    expect(detectRails(process.cwd())).toBe(false);
  });

  // Full positive-case test requires a Rails-shaped fixture filesystem
  // (test/fixtures/ruby-probe/ qualifies but bin/rails is created by
  // probe-fixture authoring). Conformance test substrate (Phase 4)
  // covers the positive case.
});
