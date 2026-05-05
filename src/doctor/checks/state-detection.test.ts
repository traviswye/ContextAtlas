/**
 * Unit + integration tests for H5 multi-dimension state-detection
 * (v0.6 Step 3.3 per Q3.3.1-Q3.3.8 locks).
 *
 * Per-dimension unit tests cover binary + substantive paths +
 * graceful null-config handling. Integration tests cover happy-
 * path on contextatlas dogfood + synthetic missing-substrate
 * fixture per Q3.3.8 fixture-pair refinement.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ContextAtlasConfig } from "../../types.js";
import type { CheckContext } from "../types.js";
import {
  detectLanguagesFromFilesystem,
  stateDetectionChecks,
} from "./state-detection.js";

function makeCtx(opts: {
  repoRoot: string;
  config?: ContextAtlasConfig | null;
}): CheckContext {
  return {
    repoRoot: opts.repoRoot,
    config: opts.config ?? null,
    configPath: opts.config !== undefined ? "/synthetic.contextatlas.yml" : null,
    configError: null,
  };
}

function findCheck(checks: readonly { id: string; status: string }[], id: string) {
  const found = checks.find((c) => c.id === id);
  if (found === undefined) {
    throw new Error(`expected check with id ${id} not found in: ${checks.map((c) => c.id).join(", ")}`);
  }
  return found;
}

describe("stateDetectionChecks — ADRs dimension", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "state-detection-adrs-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("warns when ADR directory does not exist (canonical fallback)", async () => {
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const adrCheck = findCheck(checks, "state-detection.adrs.count");
    expect(adrCheck.status).toBe("warn");
    expect(adrCheck.message).toContain("not found");
  });

  it("warns when ADR directory exists but is empty", async () => {
    await mkdir(path.join(tmpRoot, "docs", "adr"), { recursive: true });
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const adrCheck = findCheck(checks, "state-detection.adrs.count");
    expect(adrCheck.status).toBe("warn");
    expect(adrCheck.message).toContain("0 ADRs");
  });

  it("passes when ADR directory contains numbered ADRs", async () => {
    const adrDir = path.join(tmpRoot, "docs", "adr");
    await mkdir(adrDir, { recursive: true });
    await writeFile(path.join(adrDir, "0001-overview.md"), "# Overview", "utf8");
    await writeFile(path.join(adrDir, "0002-symbol-id.md"), "# Symbol ID", "utf8");
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const adrCheck = findCheck(checks, "state-detection.adrs.count");
    expect(adrCheck.status).toBe("pass");
    expect(adrCheck.message).toContain("2 ADR");
  });

  it("ignores files not matching ADR pattern", async () => {
    const adrDir = path.join(tmpRoot, "docs", "adr");
    await mkdir(adrDir, { recursive: true });
    await writeFile(path.join(adrDir, "README.md"), "not an ADR", "utf8");
    await writeFile(path.join(adrDir, "0001-real.md"), "# Real", "utf8");
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const adrCheck = findCheck(checks, "state-detection.adrs.count");
    expect(adrCheck.status).toBe("pass");
    expect(adrCheck.message).toContain("1 ADR");
  });

  it("uses configured adrs.path when provided", async () => {
    const customAdrDir = path.join(tmpRoot, "custom", "adrs");
    await mkdir(customAdrDir, { recursive: true });
    await writeFile(path.join(customAdrDir, "0001-x.md"), "# X", "utf8");

    const config = {
      version: 1 as const,
      languages: [],
      adrs: { path: "custom/adrs", format: "markdown-frontmatter" as const },
      docs: { include: [] },
      git: { recentCommits: 0 },
      index: { model: "claude-opus-4-7" },
      atlas: { committed: false, path: "", localCache: "" },
    };
    const checks = await stateDetectionChecks(
      makeCtx({ repoRoot: tmpRoot, config: config as ContextAtlasConfig }),
    );
    const adrCheck = findCheck(checks, "state-detection.adrs.count");
    expect(adrCheck.status).toBe("pass");
    expect(adrCheck.message).toContain("1 ADR");
  });
});

describe("stateDetectionChecks — code dimension", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "state-detection-code-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("warns when no source files present", async () => {
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const presentCheck = findCheck(checks, "state-detection.code.present");
    expect(presentCheck.status).toBe("warn");
    expect(presentCheck.message).toContain("no source");
  });

  it("warns substantive when below threshold", async () => {
    // Add 3 source files (below CODE_SUBSTANTIVE_FILE_THRESHOLD=5)
    await writeFile(path.join(tmpRoot, "a.ts"), "//", "utf8");
    await writeFile(path.join(tmpRoot, "b.ts"), "//", "utf8");
    await writeFile(path.join(tmpRoot, "c.ts"), "//", "utf8");
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const presentCheck = findCheck(checks, "state-detection.code.present");
    expect(presentCheck.status).toBe("pass");
    const substantiveCheck = findCheck(checks, "state-detection.code.substantive");
    expect(substantiveCheck.status).toBe("warn");
    expect(substantiveCheck.message).toContain("sparse");
  });

  it("passes substantive when at or above threshold", async () => {
    for (const name of ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]) {
      await writeFile(path.join(tmpRoot, name), "//", "utf8");
    }
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const substantiveCheck = findCheck(checks, "state-detection.code.substantive");
    expect(substantiveCheck.status).toBe("pass");
    expect(substantiveCheck.message).toContain("substantive");
  });
});

describe("stateDetectionChecks — README dimension", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "state-detection-readme-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("warns when README.md absent", async () => {
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const presentCheck = findCheck(checks, "state-detection.readme.present");
    expect(presentCheck.status).toBe("warn");
    expect(presentCheck.message).toContain("not found");
  });

  it("warns substantive when README sparse (below 300 words)", async () => {
    await writeFile(path.join(tmpRoot, "README.md"), "tiny readme", "utf8");
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const presentCheck = findCheck(checks, "state-detection.readme.present");
    expect(presentCheck.status).toBe("pass");
    const substantiveCheck = findCheck(checks, "state-detection.readme.substantive");
    expect(substantiveCheck.status).toBe("warn");
    expect(substantiveCheck.message).toContain("sparse");
  });

  it("passes substantive when README has 300+ words", async () => {
    const words = Array.from({ length: 350 }, (_, i) => `word${i}`).join(" ");
    await writeFile(path.join(tmpRoot, "README.md"), words, "utf8");
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const substantiveCheck = findCheck(checks, "state-detection.readme.substantive");
    expect(substantiveCheck.status).toBe("pass");
  });
});

describe("stateDetectionChecks — DESIGN.md dimension", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "state-detection-design-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("warns when DESIGN.md absent", async () => {
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const presentCheck = findCheck(checks, "state-detection.design_md.present");
    expect(presentCheck.status).toBe("warn");
  });

  it("warns substantive when DESIGN.md sparse (below 500 words)", async () => {
    await writeFile(path.join(tmpRoot, "DESIGN.md"), "tiny design", "utf8");
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const substantiveCheck = findCheck(checks, "state-detection.design_md.substantive");
    expect(substantiveCheck.status).toBe("warn");
  });

  it("passes substantive when DESIGN.md has 500+ words", async () => {
    const words = Array.from({ length: 550 }, (_, i) => `word${i}`).join(" ");
    await writeFile(path.join(tmpRoot, "DESIGN.md"), words, "utf8");
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const substantiveCheck = findCheck(checks, "state-detection.design_md.substantive");
    expect(substantiveCheck.status).toBe("pass");
  });
});

describe("stateDetectionChecks — languages dimension", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "state-detection-lang-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("warns when no recognized languages auto-detected", async () => {
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const langCheck = findCheck(checks, "state-detection.languages.detected");
    expect(langCheck.status).toBe("warn");
    expect(langCheck.message).toContain("no recognized");
  });

  it("passes with auto-detected languages from extensions", async () => {
    await writeFile(path.join(tmpRoot, "a.ts"), "//", "utf8");
    await writeFile(path.join(tmpRoot, "b.py"), "#", "utf8");
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const langCheck = findCheck(checks, "state-detection.languages.detected");
    expect(langCheck.status).toBe("pass");
    expect(langCheck.message).toContain("auto-detected");
    expect(langCheck.detail).toContain("typescript");
    expect(langCheck.detail).toContain("python");
  });

  it("uses configured languages when provided", async () => {
    const config = {
      version: 1 as const,
      languages: ["typescript", "go"],
      adrs: { path: "docs/adr", format: "markdown-frontmatter" as const },
      docs: { include: [] },
      git: { recentCommits: 0 },
      index: { model: "claude-opus-4-7" },
      atlas: { committed: false, path: "", localCache: "" },
    };
    const checks = await stateDetectionChecks(
      makeCtx({ repoRoot: tmpRoot, config: config as unknown as ContextAtlasConfig }),
    );
    const langCheck = findCheck(checks, "state-detection.languages.detected");
    expect(langCheck.status).toBe("pass");
    expect(langCheck.message).toContain("configured");
    expect(langCheck.detail).toContain("typescript");
    expect(langCheck.detail).toContain("go");
  });
});

describe("stateDetectionChecks — git dimension", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "state-detection-git-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("warns when not a git repository", async () => {
    const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));
    const gitCheck = findCheck(checks, "state-detection.git.atlas_consistent");
    expect(gitCheck.status).toBe("warn");
    // Either "not a git repository" or "atlas.json not present" — both warn
    expect(["warn"]).toContain(gitCheck.status);
  });
});

describe("detectLanguagesFromFilesystem (v0.6 Step 4.3 / Q4.3.3 lock)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "detect-langs-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("returns empty array on empty repo", () => {
    expect(detectLanguagesFromFilesystem(tmpRoot)).toEqual([]);
  });

  it("returns detected langs filtered to LanguageCode subset (typescript / python / go)", async () => {
    await writeFile(path.join(tmpRoot, "a.ts"), "//", "utf8");
    await writeFile(path.join(tmpRoot, "b.py"), "#", "utf8");
    await writeFile(path.join(tmpRoot, "c.go"), "package x", "utf8");
    const detected = detectLanguagesFromFilesystem(tmpRoot);
    expect(detected).toEqual(
      expect.arrayContaining(["typescript", "python", "go"]),
    );
  });

  it("excludes javascript / rust / java / csharp from output (LanguageCode subset filter)", async () => {
    await writeFile(path.join(tmpRoot, "a.ts"), "//", "utf8");
    await writeFile(path.join(tmpRoot, "b.js"), "//", "utf8"); // javascript — excluded
    await writeFile(path.join(tmpRoot, "c.rs"), "//", "utf8"); // rust — excluded
    await writeFile(path.join(tmpRoot, "d.java"), "//", "utf8"); // java — excluded
    await writeFile(path.join(tmpRoot, "e.cs"), "//", "utf8"); // csharp — excluded
    const detected = detectLanguagesFromFilesystem(tmpRoot);
    expect(detected).toEqual(["typescript"]);
  });
});

describe("stateDetectionChecks — aggregator integration", () => {
  it("happy-path on contextatlas dogfood emits pass-or-warn for all 6 dimensions", async () => {
    // Run against contextatlas repo itself (the test runs from cwd =
    // contextatlas root). Per Q3.3.8 fixture-pair refinement: dogfood
    // exercises real-substrate path; emits at least one check per
    // dimension; no FAILs expected on a well-maintained dogfood repo.
    const repoRoot = process.cwd();
    const checks = await stateDetectionChecks(makeCtx({ repoRoot }));

    // Expect at least one check per dimension (6 total minimum)
    const ids = new Set(checks.map((c) => c.id));
    expect(ids.has("state-detection.adrs.count")).toBe(true);
    expect(ids.has("state-detection.code.present")).toBe(true);
    expect(ids.has("state-detection.readme.present")).toBe(true);
    expect(ids.has("state-detection.design_md.present")).toBe(true);
    expect(ids.has("state-detection.languages.detected")).toBe(true);
    expect(ids.has("state-detection.git.atlas_consistent")).toBe(true);

    // No FAILs on dogfood
    const failures = checks.filter((c) => c.status === "fail");
    expect(failures).toEqual([]);
  });

  it("missing-substrate fixture emits warns for absent dimensions", async () => {
    // Per Q3.3.8 fixture-pair refinement: empty repo exercises
    // missing-substrate path; expect WARN (not FAIL) for absent
    // optional substrate (graceful state-detection per Q3.0.3).
    const tmpRoot = await mkdtemp(path.join(tmpdir(), "state-detection-empty-"));
    try {
      const checks = await stateDetectionChecks(makeCtx({ repoRoot: tmpRoot }));

      // All categorical dimensions should emit at least one check
      const ids = new Set(checks.map((c) => c.id));
      expect(ids.has("state-detection.adrs.count")).toBe(true);
      expect(ids.has("state-detection.code.present")).toBe(true);
      expect(ids.has("state-detection.readme.present")).toBe(true);
      expect(ids.has("state-detection.design_md.present")).toBe(true);
      expect(ids.has("state-detection.languages.detected")).toBe(true);
      expect(ids.has("state-detection.git.atlas_consistent")).toBe(true);

      // Empty repo: ADR/README/DESIGN/code/languages all WARN; git WARN (no .git)
      // No FAILs in missing-substrate case
      const failures = checks.filter((c) => c.status === "fail");
      expect(failures).toEqual([]);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
