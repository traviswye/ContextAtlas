import { describe, expect, it } from "vitest";

import { parseArgs } from "./cli-args.js";

describe("parseArgs", () => {
  it("no args → configRoot is null (caller resolves to cwd)", () => {
    expect(parseArgs([])).toEqual({ configRoot: null });
  });

  it("--config-root space form → extracts value verbatim", () => {
    expect(parseArgs(["--config-root", "/abs/path"])).toEqual({
      configRoot: "/abs/path",
    });
  });

  it("--config-root equal form → extracts value verbatim", () => {
    expect(parseArgs(["--config-root=/abs/path"])).toEqual({
      configRoot: "/abs/path",
    });
  });

  it("relative path value is passed through (caller resolves against cwd)", () => {
    expect(parseArgs(["--config-root", "./subdir"])).toEqual({
      configRoot: "./subdir",
    });
  });

  it("Windows-style path value is passed through verbatim", () => {
    expect(parseArgs(["--config-root", "C:\\foo\\bar"])).toEqual({
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

  it("value that starts with -- is rejected as another flag", () => {
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
    ).toThrow(/specified more than once/);
    expect(() =>
      parseArgs(["--config-root=/a", "--config-root=/b"]),
    ).toThrow(/specified more than once/);
    expect(() =>
      parseArgs(["--config-root", "/a", "--config-root=/b"]),
    ).toThrow(/specified more than once/);
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
