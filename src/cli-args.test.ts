import { describe, expect, it } from "vitest";

import { parseArgs, type ParsedArgs } from "./cli-args.js";

/**
 * Baseline shape: what every "no flags set" result looks like. Tests
 * that exercise one flag / subcommand spread this and override the
 * field under test, which reads cleaner and survives future fields
 * added to ParsedArgs (one spot to update).
 */
const EMPTY: ParsedArgs = {
  subcommand: "mcp",
  configRoot: null,
  configFile: null,
  check: false,
  full: false,
  json: false,
};

describe("parseArgs — baseline and --config-root", () => {
  it("no args → every knob at default", () => {
    expect(parseArgs([])).toEqual(EMPTY);
  });

  it("--config-root space form → extracts value verbatim", () => {
    expect(parseArgs(["--config-root", "/abs/path"])).toEqual({
      ...EMPTY,
      configRoot: "/abs/path",
    });
  });

  it("--config-root equal form → extracts value verbatim", () => {
    expect(parseArgs(["--config-root=/abs/path"])).toEqual({
      ...EMPTY,
      configRoot: "/abs/path",
    });
  });

  it("relative path value is passed through (caller resolves against cwd)", () => {
    expect(parseArgs(["--config-root", "./subdir"])).toEqual({
      ...EMPTY,
      configRoot: "./subdir",
    });
  });

  it("Windows-style path value is passed through verbatim", () => {
    expect(parseArgs(["--config-root", "C:\\foo\\bar"])).toEqual({
      ...EMPTY,
      configRoot: "C:\\foo\\bar",
    });
  });

  it("missing value after --config-root throws", () => {
    expect(() => parseArgs(["--config-root"])).toThrow(
      /requires a path value but none was given/,
    );
  });

  it("empty value after --config-root throws", () => {
    expect(() => parseArgs(["--config-root", ""])).toThrow(
      /requires a non-empty path value/,
    );
  });

  it("empty value in --config-root= form throws", () => {
    expect(() => parseArgs(["--config-root="])).toThrow(
      /requires a non-empty path value/,
    );
  });

  it("--config-root value starting with -- is rejected as another flag", () => {
    // Guards against `--config-root --some-other-flag` which would
    // silently consume the next flag as the config-root value.
    expect(() => parseArgs(["--config-root", "--other"])).toThrow(
      /non-empty path value; got '--other'/,
    );
  });

  it("unknown flag rejects with actionable error", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument '--bogus'/);
  });

  it("unknown positional rejects as unknown subcommand", () => {
    // Pre-ADR-12 this rejected as "Unknown argument". Post-ADR-12,
    // positionals are evaluated against the subcommand table first —
    // so "positional" gets the subcommand-shaped error message.
    expect(() => parseArgs(["positional"])).toThrow(
      /Unknown subcommand 'positional'/,
    );
  });

  it("duplicate --config-root rejects (no silent last-wins)", () => {
    expect(() =>
      parseArgs(["--config-root", "/a", "--config-root", "/b"]),
    ).toThrow(/--config-root specified more than once/);
    expect(() =>
      parseArgs(["--config-root=/a", "--config-root=/b"]),
    ).toThrow(/--config-root specified more than once/);
    expect(() =>
      parseArgs(["--config-root", "/a", "--config-root=/b"]),
    ).toThrow(/--config-root specified more than once/);
  });

  it("usage hint is included in thrown errors", () => {
    // Every error should show the usage string so users don't have
    // to hunt documentation for the correct invocation.
    for (const bad of [
      ["--config-root"],
      ["--config-root="],
      ["--bogus"],
      ["--config-root", "--other"],
    ]) {
      expect(() => parseArgs(bad)).toThrow(/Usage:/);
    }
  });
});

describe("parseArgs — --config flag", () => {
  it("--config space form → extracts file value verbatim", () => {
    expect(parseArgs(["--config", "foo.yml"])).toEqual({
      ...EMPTY,
      configFile: "foo.yml",
    });
  });

  it("--config equal form → extracts file value verbatim", () => {
    expect(parseArgs(["--config=foo.yml"])).toEqual({
      ...EMPTY,
      configFile: "foo.yml",
    });
  });

  it("absolute --config value is passed through verbatim", () => {
    // Absolute paths bypass configRoot via pathResolve's native
    // semantics — the caller passes the value to loadConfig which
    // handles the split correctly.
    expect(parseArgs(["--config", "/abs/path/config.yml"])).toEqual({
      ...EMPTY,
      configFile: "/abs/path/config.yml",
    });
  });

  it("missing value after --config throws", () => {
    expect(() => parseArgs(["--config"])).toThrow(
      /requires a file path value but none was given/,
    );
  });

  it("empty value after --config throws", () => {
    expect(() => parseArgs(["--config", ""])).toThrow(
      /requires a non-empty file path value/,
    );
  });

  it("empty value in --config= form throws", () => {
    expect(() => parseArgs(["--config="])).toThrow(
      /requires a non-empty file path value/,
    );
  });

  it("--config value starting with -- is rejected as another flag", () => {
    expect(() => parseArgs(["--config", "--other"])).toThrow(
      /non-empty file path value; got '--other'/,
    );
  });

  it("duplicate --config rejects (no silent last-wins)", () => {
    expect(() =>
      parseArgs(["--config", "a.yml", "--config", "b.yml"]),
    ).toThrow(/--config specified more than once/);
    expect(() => parseArgs(["--config=a.yml", "--config=b.yml"])).toThrow(
      /--config specified more than once/,
    );
    expect(() =>
      parseArgs(["--config", "a.yml", "--config=b.yml"]),
    ).toThrow(/--config specified more than once/);
  });

  it("combines cleanly with --config-root in either order", () => {
    expect(
      parseArgs(["--config-root", "/r", "--config", "cfg.yml"]),
    ).toEqual({ ...EMPTY, configRoot: "/r", configFile: "cfg.yml" });
    expect(
      parseArgs(["--config", "cfg.yml", "--config-root", "/r"]),
    ).toEqual({ ...EMPTY, configRoot: "/r", configFile: "cfg.yml" });
    expect(
      parseArgs(["--config-root=/r", "--config=cfg.yml"]),
    ).toEqual({ ...EMPTY, configRoot: "/r", configFile: "cfg.yml" });
  });

  it("usage hint is included in --config thrown errors", () => {
    for (const bad of [
      ["--config"],
      ["--config="],
      ["--config", "--bogus"],
      ["--config", "a.yml", "--config", "b.yml"],
    ]) {
      expect(() => parseArgs(bad)).toThrow(/Usage:/);
    }
  });
});

describe("parseArgs — --check flag (ADR-11)", () => {
  it("--check sets the boolean flag", () => {
    expect(parseArgs(["--check"])).toEqual({
      ...EMPTY,
      check: true,
    });
  });

  it("--check composes with --config-root and --config", () => {
    expect(
      parseArgs(["--config-root", "/r", "--config", "c.yml", "--check"]),
    ).toEqual({
      ...EMPTY,
      configRoot: "/r",
      configFile: "c.yml",
      check: true,
    });
    expect(parseArgs(["--check", "--config-root=/r"])).toEqual({
      ...EMPTY,
      configRoot: "/r",
      check: true,
    });
  });

  it("duplicate --check rejects", () => {
    expect(() => parseArgs(["--check", "--check"])).toThrow(
      /--check specified more than once/,
    );
  });
});

describe("parseArgs — `index` subcommand (ADR-12)", () => {
  it("bare `index` dispatches to the index subcommand", () => {
    expect(parseArgs(["index"])).toEqual({
      ...EMPTY,
      subcommand: "index",
    });
  });

  it("`index --full` sets the full flag", () => {
    expect(parseArgs(["index", "--full"])).toEqual({
      ...EMPTY,
      subcommand: "index",
      full: true,
    });
  });

  it("`index --json` sets the json flag", () => {
    expect(parseArgs(["index", "--json"])).toEqual({
      ...EMPTY,
      subcommand: "index",
      json: true,
    });
  });

  it("`index --full --json` combines cleanly", () => {
    expect(parseArgs(["index", "--full", "--json"])).toEqual({
      ...EMPTY,
      subcommand: "index",
      full: true,
      json: true,
    });
  });

  it("subcommand accepts flags on either side (before and after)", () => {
    // Per ADR-12 Implementation invariants: "Subcommand parsing
    // precedes flag parsing. ... flags may appear on either side of
    // the subcommand name."
    const beforeShape = parseArgs(["--config-root", "/r", "index", "--full"]);
    const afterShape = parseArgs(["index", "--full", "--config-root", "/r"]);
    expect(beforeShape).toEqual(afterShape);
    expect(beforeShape).toEqual({
      ...EMPTY,
      subcommand: "index",
      configRoot: "/r",
      full: true,
    });
  });

  it("duplicate subcommand rejects (no silent last-wins)", () => {
    expect(() => parseArgs(["index", "index"])).toThrow(
      /Only one subcommand is allowed/,
    );
  });

  it("duplicate --full rejects", () => {
    expect(() => parseArgs(["index", "--full", "--full"])).toThrow(
      /--full specified more than once/,
    );
  });

  it("duplicate --json rejects", () => {
    expect(() => parseArgs(["index", "--json", "--json"])).toThrow(
      /--json specified more than once/,
    );
  });

  it("--check combined with `index` rejects (ADR-12 flag/subcommand rule)", () => {
    expect(() => parseArgs(["index", "--check"])).toThrow(
      /--check cannot be combined with subcommand 'index'/,
    );
    expect(() => parseArgs(["--check", "index"])).toThrow(
      /--check cannot be combined with subcommand 'index'/,
    );
  });

  it("--full outside `index` rejects", () => {
    expect(() => parseArgs(["--full"])).toThrow(
      /--full is only accepted with the 'index' subcommand/,
    );
  });

  it("--json outside `index` rejects", () => {
    expect(() => parseArgs(["--json"])).toThrow(
      /--json is only accepted with the 'index' subcommand/,
    );
  });
});

describe("parseArgs — unknown subcommand 'did you mean?' suggestions (ADR-12)", () => {
  // Per ADR-12 Implementation invariants + execution note: "reindex"
  // specifically gets the suggestion because ADR-11 shipped with
  // --reindex vernacular and muscle memory reaches for it.
  it.each([
    ["reindex", "index"],
    ["extract", "index"],
    ["refresh", "index"],
    ["build", "index"],
    ["init", "index"],
  ])("'%s' suggests '%s'", (typo, suggestion) => {
    expect(() => parseArgs([typo])).toThrow(
      new RegExp(
        `Unknown subcommand '${typo}'\\. Did you mean '${suggestion}'\\?`,
      ),
    );
  });

  it("unknown subcommand with no close match lists known subcommands", () => {
    expect(() => parseArgs(["xyzzy"])).toThrow(
      /Unknown subcommand 'xyzzy'\. Known subcommands: index/,
    );
  });
});
