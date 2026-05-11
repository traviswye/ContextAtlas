import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildReferenceContext } from "./reference-context-walker.js";

describe("buildReferenceContext (v0.7 Step 2.2.a.2 Scope γ' multi-format walker)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "ref-ctx-walker-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("returns empty string when reference path has no conforming files", async () => {
    await writeFile(path.join(tmpRoot, "random-doc.md"), "stub", "utf8");
    expect(buildReferenceContext({ referenceContextPath: tmpRoot })).toBe("");
  });

  it("returns empty string when reference path doesn't exist", () => {
    expect(
      buildReferenceContext({
        referenceContextPath: path.join(tmpRoot, "missing"),
      }),
    ).toBe("");
  });

  it("includes header with reference path + file count", async () => {
    await writeFile(path.join(tmpRoot, "ADR-01-decision.md"), "body", "utf8");
    const result = buildReferenceContext({ referenceContextPath: tmpRoot });
    expect(result).toContain(`Reference context: ${path.resolve(tmpRoot)}`);
    expect(result).toContain("1 reference document(s)");
  });

  it("walks .md and .rst files via Scope γ' multi-format substrate", async () => {
    await writeFile(path.join(tmpRoot, "0001-nygard.md"), "md body", "utf8");
    await writeFile(
      path.join(tmpRoot, "ADR-02-something.rst"),
      "Title\n=====\n\nrst body",
      "utf8",
    );
    const result = buildReferenceContext({ referenceContextPath: tmpRoot });
    expect(result).toContain("0001-nygard.md");
    expect(result).toContain("ADR-02-something.rst");
    expect(result).toContain("md body");
    expect(result).toContain("rst body");
  });

  it("tags each file with its format", async () => {
    await writeFile(path.join(tmpRoot, "ADR-01-a.md"), "x", "utf8");
    await writeFile(path.join(tmpRoot, "ADR-02-b.rst"), "y", "utf8");
    const result = buildReferenceContext({ referenceContextPath: tmpRoot });
    expect(result).toContain("(format: md)");
    expect(result).toContain("(format: rst)");
  });

  it("walks recursively up to depth 2 (status-subdirectory pattern)", async () => {
    await writeFile(path.join(tmpRoot, "ADR-01-top.md"), "top", "utf8");
    await mkdir(path.join(tmpRoot, "accepted"));
    await writeFile(
      path.join(tmpRoot, "accepted", "ADR-02-nested.md"),
      "nested",
      "utf8",
    );
    const result = buildReferenceContext({ referenceContextPath: tmpRoot });
    expect(result).toContain("ADR-01-top.md");
    expect(result).toContain("ADR-02-nested.md");
  });
});
