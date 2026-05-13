import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PER_ADR_CLAIMS_FLOOR,
  runValidateExtractionSubcommand,
  validateExtractionShape,
  type AtlasForValidation,
} from "./cli-validate-extraction.js";

// ---------------------------------------------------------------------------
// Pure-function tests (validateExtractionShape)
// ---------------------------------------------------------------------------

function makeAdrClaim(sourcePath: string): {
  source: string;
  source_path: string;
} {
  return {
    source: `adr:${path.basename(sourcePath)}`,
    source_path: sourcePath,
  };
}

function makeAtlas(overrides: Partial<AtlasForValidation> = {}): AtlasForValidation {
  return {
    version: "1.4",
    source_shas: {},
    claims: [],
    ...overrides,
  };
}

describe("validateExtractionShape — pure function", () => {
  it("passes a canonical-shape atlas (8+ claims per ADR; per-source coverage)", () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    const claims = Array.from({ length: 10 }, () => makeAdrClaim(adrPath));
    const atlas = makeAtlas({
      source_shas: { [adrPath]: "deadbeef" },
      claims,
    });
    expect(validateExtractionShape(atlas)).toEqual([]);
  });

  it("fails adr_claims_present when no claim has source starting 'adr:'", () => {
    const atlas = makeAtlas({
      claims: [
        { source: "docstring:src/foo.ts", source_path: "src/foo.ts" },
      ],
    });
    const errors = validateExtractionShape(atlas);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/adr_claims_present/);
  });

  it("fails adr_depth_floor when an ADR has fewer than 8 claims", () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    const claims = Array.from(
      { length: PER_ADR_CLAIMS_FLOOR - 1 },
      () => makeAdrClaim(adrPath),
    );
    const atlas = makeAtlas({
      source_shas: { [adrPath]: "deadbeef" },
      claims,
    });
    const errors = validateExtractionShape(atlas);
    expect(errors.some((e) => /adr_depth_floor/.test(e))).toBe(true);
  });

  it("passes adr_depth_floor at the exact floor threshold (=8)", () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    const claims = Array.from(
      { length: PER_ADR_CLAIMS_FLOOR },
      () => makeAdrClaim(adrPath),
    );
    const atlas = makeAtlas({
      source_shas: { [adrPath]: "deadbeef" },
      claims,
    });
    expect(validateExtractionShape(atlas)).toEqual([]);
  });

  it("fails adr_depth_floor for any ADR below threshold (not just average)", () => {
    // Two ADRs; one above floor, one below. Per-ADR check should still fail.
    const adr1 = "docs/adr/ADR-01-foo.md";
    const adr2 = "docs/adr/ADR-02-bar.md";
    const claims = [
      ...Array.from({ length: 10 }, () => makeAdrClaim(adr1)),
      ...Array.from({ length: 3 }, () => makeAdrClaim(adr2)), // below floor
    ];
    const atlas = makeAtlas({
      source_shas: { [adr1]: "a", [adr2]: "b" },
      claims,
    });
    const errors = validateExtractionShape(atlas);
    expect(errors.some((e) => /adr_depth_floor/.test(e))).toBe(true);
    expect(errors.find((e) => /adr_depth_floor/.test(e))).toMatch(/ADR-02-bar/);
  });

  it("fails source_coverage when source_shas entry has zero matching claims", () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    const orphanedPath = "src/foo.ts";
    const claims = Array.from({ length: 10 }, () => makeAdrClaim(adrPath));
    const atlas = makeAtlas({
      source_shas: { [adrPath]: "a", [orphanedPath]: "b" },
      claims,
    });
    const errors = validateExtractionShape(atlas);
    expect(errors.some((e) => /source_coverage/.test(e))).toBe(true);
    expect(errors.find((e) => /source_coverage/.test(e))).toMatch(/src\/foo\.ts/);
  });

  it("passes source_coverage when all source_shas entries have matching claims (multi-stream)", () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    const docPath = "src/foo.ts";
    const commitSha = "abc123def456abc123def456abc123def456abcd";
    const claims = [
      ...Array.from({ length: 10 }, () => makeAdrClaim(adrPath)),
      { source: `docstring:${docPath}`, source_path: docPath },
      { source: `commit:${commitSha}`, source_path: commitSha },
    ];
    const atlas = makeAtlas({
      source_shas: { [adrPath]: "a", [docPath]: "b", [commitSha]: commitSha },
      claims,
    });
    expect(validateExtractionShape(atlas)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration tests (runValidateExtractionSubcommand)
// ---------------------------------------------------------------------------

interface Fixture {
  readonly root: string;
  readonly cleanup: () => Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), "ca-validate-extraction-"));
  await mkdir(path.join(root, "docs", "adr"), { recursive: true });
  await mkdir(path.join(root, "atlases", "hono"), { recursive: true });
  const config = [
    "version: 1",
    "languages: [typescript]",
    "source:",
    "  root: .",
    "adrs:",
    "  path: docs/adr/",
    "docs:",
    "  include: []",
    "atlas:",
    "  committed: true",
    "  path: atlases/hono/atlas.json",
    "  local_cache: atlases/hono/index.db",
    "",
  ].join("\n");
  await writeFile(path.join(root, ".contextatlas.yml"), config);
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function writeAtlas(
  fixture: Fixture,
  atlas: AtlasForValidation,
): Promise<void> {
  await writeFile(
    path.join(fixture.root, "atlases", "hono", "atlas.json"),
    JSON.stringify(atlas, null, 2),
  );
}

describe("runValidateExtractionSubcommand — integration", () => {
  let fixture: Fixture;
  let stderr: string;
  let stdout: string;

  beforeEach(async () => {
    fixture = await makeFixture();
    stderr = "";
    stdout = "";
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("exits 0 on a passing atlas", async () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    const claims = Array.from({ length: 10 }, () => makeAdrClaim(adrPath));
    await writeAtlas(fixture, {
      version: "1.4",
      source_shas: { [adrPath]: "deadbeef" },
      claims,
    });
    const result = await runValidateExtractionSubcommand({
      configRoot: fixture.root,
      configFile: null,
      writeStdout: (c) => (stdout += c),
      writeStderr: (c) => (stderr += c),
    });
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("conforms to canonical extraction-quality");
    expect(stderr).toBe("");
  });

  it("exits 2 with structured remediation on failing atlas", async () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    const claims = Array.from({ length: 3 }, () => makeAdrClaim(adrPath));
    await writeAtlas(fixture, {
      version: "1.4",
      source_shas: { [adrPath]: "deadbeef" },
      claims,
    });
    const result = await runValidateExtractionSubcommand({
      configRoot: fixture.root,
      configFile: null,
      writeStdout: (c) => (stdout += c),
      writeStderr: (c) => (stderr += c),
    });
    expect(result.exitCode).toBe(2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(stderr).toContain("adr_depth_floor");
    expect(stderr).toContain("Re-run extraction");
  });

  it("exits 2 with actionable message when atlas missing", async () => {
    const result = await runValidateExtractionSubcommand({
      configRoot: fixture.root,
      configFile: null,
      writeStdout: (c) => (stdout += c),
      writeStderr: (c) => (stderr += c),
    });
    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("failed to read atlas");
    expect(stderr).toContain("/index-atlas");
  });
});
