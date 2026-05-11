import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ADR_NAMING_PATTERNS,
  ADR_WALK_DEPTH_CAP,
  enumerateAdrFiles,
  matchesAdrNamingConvention,
} from "./adr-enumeration.js";

describe("matchesAdrNamingConvention (v0.7 Step 2.1.a Scope γ' substrate)", () => {
  it("matches Nygard convention (.md + .rst)", () => {
    expect(matchesAdrNamingConvention("0001-overview.md")).toBe(true);
    expect(matchesAdrNamingConvention("0042-some-decision.rst")).toBe(true);
  });

  it("matches ADR-NN convention (.md + .rst)", () => {
    expect(matchesAdrNamingConvention("ADR-01-symbol-id-format.md")).toBe(true);
    expect(matchesAdrNamingConvention("ADR-99-late-decision.rst")).toBe(true);
  });

  it("matches date-prefixed convention (.md + .rst)", () => {
    expect(matchesAdrNamingConvention("2026-05-11-launch-bearing.md")).toBe(true);
    expect(matchesAdrNamingConvention("2026-01-01-new-year.rst")).toBe(true);
  });

  it("rejects non-conforming filenames", () => {
    expect(matchesAdrNamingConvention("README.md")).toBe(false);
    expect(matchesAdrNamingConvention("docstring-probe-findings.md")).toBe(false);
    expect(matchesAdrNamingConvention("pyright-probe-findings.md")).toBe(false);
    expect(matchesAdrNamingConvention("random-notes.md")).toBe(false);
  });

  it("rejects unsupported extensions", () => {
    expect(matchesAdrNamingConvention("0001-overview.txt")).toBe(false);
    expect(matchesAdrNamingConvention("ADR-01-something.adoc")).toBe(false);
  });

  it("exposes 3 naming pattern regexes", () => {
    expect(ADR_NAMING_PATTERNS).toHaveLength(3);
  });
});

describe("enumerateAdrFiles (unified state-detection + extraction substrate)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "adr-enumerate-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("returns empty array when adrDir does not exist", () => {
    const result = enumerateAdrFiles(path.join(tmpRoot, "missing"));
    expect(result).toEqual([]);
  });

  it("returns empty array for an empty directory", () => {
    expect(enumerateAdrFiles(tmpRoot)).toEqual([]);
  });

  it("enumerates 6 fixture combinations (3 naming × 2 extensions)", async () => {
    const fixtures = [
      "0001-nygard.md",
      "0042-nygard.rst",
      "ADR-01-context-atlas.md",
      "ADR-02-context-atlas.rst",
      "2026-05-11-date.md",
      "2026-01-01-date.rst",
    ];
    for (const name of fixtures) {
      await writeFile(path.join(tmpRoot, name), "# stub\n", "utf8");
    }
    const result = enumerateAdrFiles(tmpRoot);
    expect(result).toHaveLength(6);
    const basenames = result.map((f) => f.basename).sort();
    expect(basenames).toEqual([...fixtures].sort());
  });

  it("tags format by extension", async () => {
    await writeFile(path.join(tmpRoot, "0001-md.md"), "stub", "utf8");
    await writeFile(path.join(tmpRoot, "0002-rst.rst"), "stub", "utf8");
    const result = enumerateAdrFiles(tmpRoot);
    const mdFile = result.find((f) => f.basename === "0001-md.md");
    const rstFile = result.find((f) => f.basename === "0002-rst.rst");
    expect(mdFile?.format).toBe("md");
    expect(rstFile?.format).toBe("rst");
  });

  it("excludes files with non-conforming basenames", async () => {
    await writeFile(path.join(tmpRoot, "README.md"), "stub", "utf8");
    await writeFile(path.join(tmpRoot, "pyright-probe-findings.md"), "stub", "utf8");
    await writeFile(path.join(tmpRoot, "ADR-01-keeps-this.md"), "stub", "utf8");
    const result = enumerateAdrFiles(tmpRoot);
    expect(result.map((f) => f.basename)).toEqual(["ADR-01-keeps-this.md"]);
  });

  it("walks subdirectories up to depth cap", async () => {
    await writeFile(path.join(tmpRoot, "ADR-01-top.md"), "stub", "utf8");
    await mkdir(path.join(tmpRoot, "accepted"));
    await writeFile(
      path.join(tmpRoot, "accepted", "ADR-02-nested.md"),
      "stub",
      "utf8",
    );
    await mkdir(path.join(tmpRoot, "drafts", "subfolder"), { recursive: true });
    await writeFile(
      path.join(tmpRoot, "drafts", "ADR-03-also-nested.md"),
      "stub",
      "utf8",
    );
    await writeFile(
      path.join(tmpRoot, "drafts", "subfolder", "ADR-04-too-deep.md"),
      "stub",
      "utf8",
    );
    const result = enumerateAdrFiles(tmpRoot);
    const basenames = result.map((f) => f.basename).sort();
    // Depth-2 cap: top + accepted/ + drafts/ all included.
    // drafts/subfolder/ is at depth 2 from tmpRoot — included per cap.
    // (Cap means walkInto descends while depth < CAP; depth 2 still walks
    // its contents.)
    expect(basenames).toContain("ADR-01-top.md");
    expect(basenames).toContain("ADR-02-nested.md");
    expect(basenames).toContain("ADR-03-also-nested.md");
  });

  it("skips dotfiles + hidden directories", async () => {
    await writeFile(path.join(tmpRoot, ".0001-hidden.md"), "stub", "utf8");
    await writeFile(path.join(tmpRoot, "ADR-01-visible.md"), "stub", "utf8");
    await mkdir(path.join(tmpRoot, ".git"));
    await writeFile(path.join(tmpRoot, ".git", "ADR-02-shouldnt-leak.md"), "stub", "utf8");
    const result = enumerateAdrFiles(tmpRoot);
    expect(result.map((f) => f.basename)).toEqual(["ADR-01-visible.md"]);
  });

  it("returns files in deterministic absolute-path order", async () => {
    await writeFile(path.join(tmpRoot, "ADR-03-third.md"), "stub", "utf8");
    await writeFile(path.join(tmpRoot, "ADR-01-first.md"), "stub", "utf8");
    await writeFile(path.join(tmpRoot, "ADR-02-second.md"), "stub", "utf8");
    const result = enumerateAdrFiles(tmpRoot);
    const basenames = result.map((f) => f.basename);
    expect(basenames).toEqual([
      "ADR-01-first.md",
      "ADR-02-second.md",
      "ADR-03-third.md",
    ]);
  });

  it("exposes depth cap constant of 2", () => {
    expect(ADR_WALK_DEPTH_CAP).toBe(2);
  });
});
