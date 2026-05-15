import { describe, expect, it } from "vitest";

import {
  RUBY_EXTENSIONS,
  dedupLocationsByNormalizedPath,
  detectRails,
  mapRubyKind,
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
