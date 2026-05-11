/**
 * Tests for prompt-artifact-copy.ts (v0.7 Step 2.3.a.0 — Path-γ
 * Read-tool refactor substrate).
 *
 * Uses tmp-dir fixtures to stand in for both:
 *   - the contextatlas package's dist/ directory (source)
 *   - the user's repo root (destination)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";

import { copyPromptArtifacts } from "./prompt-artifact-copy.js";

const FIXTURE_EXTRACTION_PROMPT = "FIXTURE EXTRACTION_PROMPT contents\n---\n";
const FIXTURE_GENERATE_ADRS_PROMPT = "FIXTURE GENERATE_ADRS_PROMPT contents\n---\n";

describe("copyPromptArtifacts (v0.7 Step 2.3.a.0)", () => {
  let tmpRoot: string;
  let fakeDistRoot: string;
  let userRepoRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "prompt-artifact-copy-"));
    fakeDistRoot = join(tmpRoot, "dist");
    userRepoRoot = join(tmpRoot, "user-repo");
    mkdirSync(pathResolve(fakeDistRoot, "extraction"), { recursive: true });
    mkdirSync(pathResolve(fakeDistRoot, "generation"), { recursive: true });
    mkdirSync(userRepoRoot, { recursive: true });
    writeFileSync(
      pathResolve(fakeDistRoot, "extraction", "prompt.md"),
      FIXTURE_EXTRACTION_PROMPT,
      "utf8",
    );
    writeFileSync(
      pathResolve(fakeDistRoot, "generation", "prompt.md"),
      FIXTURE_GENERATE_ADRS_PROMPT,
      "utf8",
    );
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("copies both prompt artifacts into .contextatlas/prompts/", () => {
    const result = copyPromptArtifacts({
      configRoot: userRepoRoot,
      packageDistRootOverride: fakeDistRoot,
    });

    expect(result.extractionMdPath).toBe(
      pathResolve(userRepoRoot, ".contextatlas", "prompts", "extraction.md"),
    );
    expect(result.generateAdrsMdPath).toBe(
      pathResolve(
        userRepoRoot,
        ".contextatlas",
        "prompts",
        "generate-adrs.md",
      ),
    );
    expect(readFileSync(result.extractionMdPath, "utf8")).toBe(
      FIXTURE_EXTRACTION_PROMPT,
    );
    expect(readFileSync(result.generateAdrsMdPath, "utf8")).toBe(
      FIXTURE_GENERATE_ADRS_PROMPT,
    );
  });

  it("creates .contextatlas/prompts/ if it doesn't exist", () => {
    const promptsDir = pathResolve(userRepoRoot, ".contextatlas", "prompts");
    expect(existsSync(promptsDir)).toBe(false);

    copyPromptArtifacts({
      configRoot: userRepoRoot,
      packageDistRootOverride: fakeDistRoot,
    });

    expect(existsSync(promptsDir)).toBe(true);
  });

  it("is idempotent — re-running overwrites with current artifacts", () => {
    copyPromptArtifacts({
      configRoot: userRepoRoot,
      packageDistRootOverride: fakeDistRoot,
    });

    // Mutate the user's copy
    const userExtractionPath = pathResolve(
      userRepoRoot,
      ".contextatlas",
      "prompts",
      "extraction.md",
    );
    writeFileSync(userExtractionPath, "USER-MUTATED", "utf8");
    expect(readFileSync(userExtractionPath, "utf8")).toBe("USER-MUTATED");

    // Re-run init
    copyPromptArtifacts({
      configRoot: userRepoRoot,
      packageDistRootOverride: fakeDistRoot,
    });

    // Mutation is overwritten
    expect(readFileSync(userExtractionPath, "utf8")).toBe(
      FIXTURE_EXTRACTION_PROMPT,
    );
  });

  it("throws when package source extraction prompt.md is missing", () => {
    rmSync(pathResolve(fakeDistRoot, "extraction", "prompt.md"));
    expect(() =>
      copyPromptArtifacts({
        configRoot: userRepoRoot,
        packageDistRootOverride: fakeDistRoot,
      }),
    ).toThrow(/Prompt artifact missing/);
  });

  it("throws when package source generate-adrs prompt.md is missing", () => {
    rmSync(pathResolve(fakeDistRoot, "generation", "prompt.md"));
    expect(() =>
      copyPromptArtifacts({
        configRoot: userRepoRoot,
        packageDistRootOverride: fakeDistRoot,
      }),
    ).toThrow(/Prompt artifact missing/);
  });
});

describe("copyPromptArtifacts gitignore stamping (v0.7 Step 2.3.a.0)", () => {
  let tmpRoot: string;
  let fakeDistRoot: string;
  let userRepoRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "prompt-artifact-gitignore-"));
    fakeDistRoot = join(tmpRoot, "dist");
    userRepoRoot = join(tmpRoot, "user-repo");
    mkdirSync(pathResolve(fakeDistRoot, "extraction"), { recursive: true });
    mkdirSync(pathResolve(fakeDistRoot, "generation"), { recursive: true });
    mkdirSync(userRepoRoot, { recursive: true });
    writeFileSync(
      pathResolve(fakeDistRoot, "extraction", "prompt.md"),
      FIXTURE_EXTRACTION_PROMPT,
      "utf8",
    );
    writeFileSync(
      pathResolve(fakeDistRoot, "generation", "prompt.md"),
      FIXTURE_GENERATE_ADRS_PROMPT,
      "utf8",
    );
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("appends .contextatlas/prompts/ to existing .gitignore", () => {
    const gitignorePath = pathResolve(userRepoRoot, ".gitignore");
    writeFileSync(gitignorePath, "node_modules/\n*.log\n", "utf8");

    const result = copyPromptArtifacts({
      configRoot: userRepoRoot,
      packageDistRootOverride: fakeDistRoot,
    });

    expect(result.gitignoreUpdated).toBe(true);
    expect(result.gitignoreMissing).toBe(false);
    const updated = readFileSync(gitignorePath, "utf8");
    expect(updated).toContain("node_modules/");
    expect(updated).toContain(".contextatlas/prompts/");
  });

  it("does not duplicate entry if .contextatlas/prompts/ already in .gitignore", () => {
    const gitignorePath = pathResolve(userRepoRoot, ".gitignore");
    writeFileSync(
      gitignorePath,
      "node_modules/\n.contextatlas/prompts/\n",
      "utf8",
    );
    const before = readFileSync(gitignorePath, "utf8");

    const result = copyPromptArtifacts({
      configRoot: userRepoRoot,
      packageDistRootOverride: fakeDistRoot,
    });

    expect(result.gitignoreUpdated).toBe(false);
    expect(result.gitignoreMissing).toBe(false);
    expect(readFileSync(gitignorePath, "utf8")).toBe(before);
  });

  it("does NOT create .gitignore when it doesn't exist (reports missing)", () => {
    const gitignorePath = pathResolve(userRepoRoot, ".gitignore");
    expect(existsSync(gitignorePath)).toBe(false);

    const result = copyPromptArtifacts({
      configRoot: userRepoRoot,
      packageDistRootOverride: fakeDistRoot,
    });

    expect(result.gitignoreUpdated).toBe(false);
    expect(result.gitignoreMissing).toBe(true);
    expect(existsSync(gitignorePath)).toBe(false);
  });

  it("tolerates trailing-slash and substring variants when checking presence", () => {
    const gitignorePath = pathResolve(userRepoRoot, ".gitignore");
    // No trailing slash; substring scan should still match.
    writeFileSync(gitignorePath, ".contextatlas/prompts\n", "utf8");

    const result = copyPromptArtifacts({
      configRoot: userRepoRoot,
      packageDistRootOverride: fakeDistRoot,
    });

    expect(result.gitignoreUpdated).toBe(false);
    expect(result.gitignoreMissing).toBe(false);
  });
});
