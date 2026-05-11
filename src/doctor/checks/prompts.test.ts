/**
 * Tests for the prompt-artifact doctor check (v0.7 Step 2.3.a.0).
 *
 * Covers four states:
 *   - PASS: user artifacts present + match package source
 *   - WARN (missing): user artifacts absent
 *   - WARN (stale): user artifacts present but content drifted
 *   - WARN (package-source-missing): package shipped without .md
 *     artifacts (developer-source edge case)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";

import type { CheckContext } from "../types.js";

import { promptArtifactChecks } from "./prompts.js";

const FIXTURE_EXTRACTION = "FIXTURE EXTRACTION_PROMPT contents\n---\n";
const FIXTURE_GENERATE_ADRS = "FIXTURE GENERATE_ADRS_PROMPT contents\n---\n";

function makeCtx(repoRoot: string): CheckContext {
  return {
    repoRoot,
    config: null,
    configPath: null,
    configError: null,
  };
}

function writePackageSource(distRoot: string): void {
  mkdirSync(pathResolve(distRoot, "extraction"), { recursive: true });
  mkdirSync(pathResolve(distRoot, "generation"), { recursive: true });
  writeFileSync(
    pathResolve(distRoot, "extraction", "prompt.md"),
    FIXTURE_EXTRACTION,
    "utf8",
  );
  writeFileSync(
    pathResolve(distRoot, "generation", "prompt.md"),
    FIXTURE_GENERATE_ADRS,
    "utf8",
  );
}

function writeUserPrompts(
  userRepoRoot: string,
  extraction: string,
  generateAdrs: string,
): void {
  const promptsDir = pathResolve(userRepoRoot, ".contextatlas", "prompts");
  mkdirSync(promptsDir, { recursive: true });
  writeFileSync(pathResolve(promptsDir, "extraction.md"), extraction, "utf8");
  writeFileSync(
    pathResolve(promptsDir, "generate-adrs.md"),
    generateAdrs,
    "utf8",
  );
}

describe("promptArtifactChecks (v0.7 Step 2.3.a.0)", () => {
  let tmpRoot: string;
  let fakeDistRoot: string;
  let userRepoRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "doctor-prompts-"));
    fakeDistRoot = join(tmpRoot, "dist");
    userRepoRoot = join(tmpRoot, "user-repo");
    mkdirSync(userRepoRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("PASS when both artifacts exist + match package source", () => {
    writePackageSource(fakeDistRoot);
    writeUserPrompts(userRepoRoot, FIXTURE_EXTRACTION, FIXTURE_GENERATE_ADRS);

    const checks = promptArtifactChecks(makeCtx(userRepoRoot), fakeDistRoot);

    expect(checks).toHaveLength(2);
    expect(checks[0]?.id).toBe("extraction.prompts_artifact_exists");
    expect(checks[0]?.status).toBe("pass");
    expect(checks[1]?.id).toBe("extraction.prompts_artifact_fresh");
    expect(checks[1]?.status).toBe("pass");
  });

  it("WARN (missing) when neither user artifact exists; freshness skipped", () => {
    writePackageSource(fakeDistRoot);
    // No user prompts written.

    const checks = promptArtifactChecks(makeCtx(userRepoRoot), fakeDistRoot);

    expect(checks).toHaveLength(1);
    expect(checks[0]?.id).toBe("extraction.prompts_artifact_exists");
    expect(checks[0]?.status).toBe("warn");
    expect(checks[0]?.message).toContain("extraction.md");
    expect(checks[0]?.message).toContain("generate-adrs.md");
    expect(checks[0]?.detail).toContain("contextatlas init");
  });

  it("WARN (missing) when only one user artifact exists; freshness skipped", () => {
    writePackageSource(fakeDistRoot);
    // Only extraction.md present in user repo.
    const promptsDir = pathResolve(userRepoRoot, ".contextatlas", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(
      pathResolve(promptsDir, "extraction.md"),
      FIXTURE_EXTRACTION,
      "utf8",
    );

    const checks = promptArtifactChecks(makeCtx(userRepoRoot), fakeDistRoot);

    expect(checks).toHaveLength(1);
    expect(checks[0]?.status).toBe("warn");
    expect(checks[0]?.message).toContain("generate-adrs.md");
    expect(checks[0]?.message).not.toContain("extraction.md");
  });

  it("WARN (stale) when extraction.md drifted from package source", () => {
    writePackageSource(fakeDistRoot);
    writeUserPrompts(userRepoRoot, "STALE EXTRACTION", FIXTURE_GENERATE_ADRS);

    const checks = promptArtifactChecks(makeCtx(userRepoRoot), fakeDistRoot);

    expect(checks).toHaveLength(2);
    expect(checks[0]?.status).toBe("pass");
    expect(checks[1]?.id).toBe("extraction.prompts_artifact_fresh");
    expect(checks[1]?.status).toBe("warn");
    expect(checks[1]?.message).toContain("extraction.md");
    expect(checks[1]?.message).not.toContain("generate-adrs.md");
  });

  it("WARN (stale) when both artifacts drifted from package source", () => {
    writePackageSource(fakeDistRoot);
    writeUserPrompts(userRepoRoot, "STALE EXTRACTION", "STALE GENERATE-ADRS");

    const checks = promptArtifactChecks(makeCtx(userRepoRoot), fakeDistRoot);

    expect(checks).toHaveLength(2);
    expect(checks[1]?.status).toBe("warn");
    expect(checks[1]?.message).toContain("extraction.md");
    expect(checks[1]?.message).toContain("generate-adrs.md");
    expect(checks[1]?.detail).toContain("contextatlas init");
  });

  it("WARN (package-source-missing) when dist artifacts absent (developer-source edge case)", () => {
    // No package source written.
    writeUserPrompts(userRepoRoot, FIXTURE_EXTRACTION, FIXTURE_GENERATE_ADRS);

    const checks = promptArtifactChecks(makeCtx(userRepoRoot), fakeDistRoot);

    expect(checks).toHaveLength(2);
    expect(checks[0]?.status).toBe("pass"); // existence PASS
    expect(checks[1]?.id).toBe("extraction.prompts_artifact_fresh");
    expect(checks[1]?.status).toBe("warn");
    expect(checks[1]?.message).toContain("cannot verify freshness");
    expect(checks[1]?.detail).toContain("npm run build");
  });
});
