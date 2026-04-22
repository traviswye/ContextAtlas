import { describe, expect, it } from "vitest";

import { parseArgs } from "./cli-args.js";

describe("parseArgs — baseline and --config-root", () => {
  it("no args → both knobs null (caller resolves to defaults)", () => {
    expect(parseArgs([])).toEqual({
      configRoot: null,
      configFile: null,
      check: false,
    });
  });

  it("--config-root space form → extracts value verbatim", () => {
    expect(parseArgs(["--config-root", "/abs/path"])).toEqual({
      configRoot: "/abs/path",
      configFile: null,
      check: false,
    });
  });

  it("--config-root equal form → extracts value verbatim", () => {
    expect(parseArgs(["--config-root=/abs/path"])).toEqual({
      configRoot: "/abs/path",
      configFile: null,
      check: false,
    });
  });

  it("relative path value is passed through (caller resolves against cwd)", () => {
    expect(parseArgs(["--config-root", "./subdir"])).toEqual({
      configRoot: "./subdir",
      configFile: null,
      check: false,
    });
  });

  it("Windows-style path value is passed through verbatim", () => {
    expect(parseArgs(["--config-root", "C:\\foo\\bar"])).toEqual({
      configRoot: "C:\\foo\\bar",
      configFile: null,
      check: false,
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

  it("positional argument rejects as unknown", () => {
    expect(() => parseArgs(["positional"])).toThrow(
      /Unknown argument 'positional'/,
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
      configRoot: null,
      configFile: "foo.yml",
      check: false,
    });
  });

  it("--config equal form → extracts file value verbatim", () => {
    expect(parseArgs(["--config=foo.yml"])).toEqual({
      configRoot: null,
      configFile: "foo.yml",
      check: false,
    });
  });

  it("absolute --config value is passed through verbatim", () => {
    // Absolute paths bypass configRoot via pathResolve's native
    // semantics — the caller passes the value to loadConfig which
    // handles the split correctly.
    expect(parseArgs(["--config", "/abs/path/config.yml"])).toEqual({
      configRoot: null,
      configFile: "/abs/path/config.yml",
      check: false,
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
    ).toEqual({ configRoot: "/r", configFile: "cfg.yml", check: false });
    expect(
      parseArgs(["--config", "cfg.yml", "--config-root", "/r"]),
    ).toEqual({ configRoot: "/r", configFile: "cfg.yml", check: false });
    expect(
      parseArgs(["--config-root=/r", "--config=cfg.yml"]),
    ).toEqual({ configRoot: "/r", configFile: "cfg.yml", check: false });
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
      configRoot: null,
      configFile: null,
      check: true,
    });
  });

  it("--check composes with --config-root and --config", () => {
    expect(
      parseArgs(["--config-root", "/r", "--config", "c.yml", "--check"]),
    ).toEqual({ configRoot: "/r", configFile: "c.yml", check: true });
    expect(
      parseArgs(["--check", "--config-root=/r"]),
    ).toEqual({ configRoot: "/r", configFile: null, check: true });
  });

  it("duplicate --check rejects", () => {
    expect(() => parseArgs(["--check", "--check"])).toThrow(
      /--check specified more than once/,
    );
  });
});
