/**
 * `sourceKeyMatcher` (v1.2 Phase 2 review round 2.2): a resumed run
 * carries a prose or docstring unit only while the file its key names,
 * from any base the walkers store keys against, still has the unit's SHA.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { computeFileSha } from "./file-walker.js";
import { sourceKeyMatcher } from "./source-key-files.js";

describe("sourceKeyMatcher", () => {
  let root: string;
  beforeEach(() => {
    // ADR-08 layout: config at the root, source under repo/, ADRs under adrs/.
    root = mkdtempSync(pathJoin(tmpdir(), "ca-key-files-"));
    for (const dir of ["repo/src", "adrs", "docs"]) mkdirSync(pathJoin(root, dir), { recursive: true });
    writeFileSync(pathJoin(root, "repo", "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(pathJoin(root, "adrs", "ADR-01-x.md"), "# ADR-01\n");
    writeFileSync(pathJoin(root, "docs", "guide.md"), "# guide\n");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const matcher = () =>
    sourceKeyMatcher({ sourceRoot: pathJoin(root, "repo"), configRoot: root, adrsPath: "adrs/" });
  const sha = (...parts: string[]) => computeFileSha(pathJoin(root, ...parts));

  it("resolves a key against the source root, the ADR directory and the config root", () => {
    const current = matcher();
    expect(current("src/a.ts", sha("repo", "src", "a.ts"))).toBe(true);
    expect(current("ADR-01-x.md", sha("adrs", "ADR-01-x.md"))).toBe(true);
    expect(current("docs/guide.md", sha("docs", "guide.md"))).toBe(true);
  });

  it("is false once the file changed or is gone", () => {
    const current = matcher();
    expect(current("src/a.ts", "0".repeat(64))).toBe(false);
    expect(current("src/gone.ts", sha("repo", "src", "a.ts"))).toBe(false);
    expect(current("src", sha("repo", "src", "a.ts"))).toBe(false); // a directory
  });
});
