import { describe, expect, it } from "vitest";

import { normalizePath, toFileUri, toRelativePath } from "./paths.js";

describe("normalizePath", () => {
  it.each([
    ["src\\foo\\bar.ts", "src/foo/bar.ts"],
    ["src/foo.ts", "src/foo.ts"],
    ["./src/foo.ts", "src/foo.ts"],
    ["src//foo.ts", "src/foo.ts"],
    ["src\\foo/bar\\baz.ts", "src/foo/bar/baz.ts"],
    ["C:\\Users\\x\\foo.ts", "c:/Users/x/foo.ts"],
    ["c:\\Users\\x\\foo.ts", "c:/Users/x/foo.ts"],
    ["D:/projects/repo/src/a.ts", "d:/projects/repo/src/a.ts"],
    ["\\\\server\\share\\foo.ts", "//server/share/foo.ts"],
    ["//server/share/foo.ts", "//server/share/foo.ts"],
    ["file:///C:/Users/foo.ts", "c:/Users/foo.ts"],
    ["file:///home/user/foo.ts", "/home/user/foo.ts"],
    ["file:///C:/with%20space.ts", "c:/with space.ts"],
    ["file:///c%3A/Users/foo.ts", "c:/Users/foo.ts"],
    ["src/foo/", "src/foo"],
    ["/", "/"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });

  it("drive-letter case is normalized (fixes cross-machine ID divergence)", () => {
    // Regression test for ADR-01 / ADR-06: Alice on C:\ and Bob on c:\
    // must produce byte-identical symbol IDs. Without drive-letter
    // case normalization, atlas.json churns on every reindex across
    // team machines.
    const alice = normalizePath("C:\\team\\repo\\src\\a.ts");
    const bob = normalizePath("c:\\team\\repo\\src\\a.ts");
    expect(alice).toBe(bob);
  });

  it("throws on empty input with an actionable message", () => {
    expect(() => normalizePath("")).toThrow(/non-empty/);
  });
});

describe("toFileUri", () => {
  it("builds a Windows drive URI with three slashes", () => {
    expect(toFileUri("C:\\Users\\foo.ts")).toBe("file:///c:/Users/foo.ts");
  });

  it("builds a POSIX URI with two slashes", () => {
    expect(toFileUri("/home/user/foo.ts")).toBe("file:///home/user/foo.ts");
  });

  it("encodes spaces", () => {
    expect(toFileUri("/home/with space.ts")).toBe(
      "file:///home/with%20space.ts",
    );
  });

  it("builds a UNC URI", () => {
    expect(toFileUri("\\\\server\\share\\foo.ts")).toBe(
      "file://server/share/foo.ts",
    );
  });
});

describe("toRelativePath", () => {
  it("strips the root prefix", () => {
    expect(
      toRelativePath(
        "/home/user/repo/src/a.ts",
        "/home/user/repo",
      ),
    ).toBe("src/a.ts");
  });

  it("handles mixed separators consistently", () => {
    expect(
      toRelativePath(
        "C:\\team\\repo\\src/a.ts",
        "C:/team/repo",
      ),
    ).toBe("src/a.ts");
  });

  it("returns empty string when path equals root", () => {
    expect(toRelativePath("/repo", "/repo")).toBe("");
  });

  it("throws when path is outside the root", () => {
    expect(() =>
      toRelativePath("/other/path/a.ts", "/home/user/repo"),
    ).toThrow(/not under root/);
  });
});
