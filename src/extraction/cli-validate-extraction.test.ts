import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  it("fails source_coverage when ADR source_shas entry has zero matching claims (v0.7.2 ADR-shaped scoping)", () => {
    const adrWithClaims = "docs/adr/ADR-01-foo.md";
    const orphanedAdr = "docs/adr/ADR-02-bar.md";
    const claims = Array.from({ length: 10 }, () => makeAdrClaim(adrWithClaims));
    const atlas = makeAtlas({
      source_shas: { [adrWithClaims]: "a", [orphanedAdr]: "b" },
      claims,
    });
    const errors = validateExtractionShape(atlas);
    expect(errors.some((e) => /source_coverage/.test(e))).toBe(true);
    expect(errors.find((e) => /source_coverage/.test(e))).toMatch(
      /ADR-02-bar/,
    );
  });

  it("passes source_coverage when ADR source_shas entries have matching claims (Stream B + Stream C coverage requirements relaxed per v0.7.2; legacy bare-sha commit key)", () => {
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

  it("passes source_coverage with canonical commit:<sha> keys and source_path (v1.2 Phase 2, F-5)", () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    const commitSha = "abc123def456abc123def456abc123def456abcd";
    const commitKey = `commit:${commitSha}`;
    const claims = [
      ...Array.from({ length: 10 }, () => makeAdrClaim(adrPath)),
      { source: commitKey, source_path: commitKey },
    ];
    const atlas = makeAtlas({
      source_shas: { [adrPath]: "a", [commitKey]: commitSha },
      claims,
    });
    expect(validateExtractionShape(atlas)).toEqual([]);
  });

  it("ignores canonical commit:<sha> keys without claims, like bare-sha keys", () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    const claims = Array.from({ length: 10 }, () => makeAdrClaim(adrPath));
    const sourceShas: Record<string, string> = { [adrPath]: "a" };
    for (let i = 0; i < 5; i++) {
      const sha = String(i).padStart(40, "0");
      sourceShas[`commit:${sha}`] = sha;
    }
    const atlas = makeAtlas({ source_shas: sourceShas, claims });
    expect(validateExtractionShape(atlas)).toEqual([]);
  });

  it("ignores Stream B source_shas entries without claims (v0.7.2 calibration — most source files have 0 docstrings)", () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    const claims = Array.from({ length: 10 }, () => makeAdrClaim(adrPath));
    // 100 Stream B source files with zero docstring claims — empirical
    // pattern from v0.7.1 first-run hono extraction (most files lack
    // exported-with-docstring symbols). source_coverage MUST NOT flag
    // these per Issue 2 invariant scoping calibration.
    const sourceShas: Record<string, string> = { [adrPath]: "a" };
    for (let i = 0; i < 100; i++) {
      sourceShas[`src/file${i}.ts`] = `sha${i}`;
    }
    const atlas = makeAtlas({ source_shas: sourceShas, claims });
    expect(validateExtractionShape(atlas)).toEqual([]);
  });

  it("ignores Stream C commit-SHA source_shas entries without claims (v0.7.2 calibration — most commits lack architectural intent body; legacy bare-sha keys)", () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    const claims = Array.from({ length: 10 }, () => makeAdrClaim(adrPath));
    const sourceShas: Record<string, string> = { [adrPath]: "a" };
    for (let i = 0; i < 50; i++) {
      const sha = String(i).padStart(40, "0");
      sourceShas[sha] = sha;
    }
    const atlas = makeAtlas({ source_shas: sourceShas, claims });
    expect(validateExtractionShape(atlas)).toEqual([]);
  });
});

describe("validateExtractionShape — non-ADR prose exemption (review fix)", () => {
  it("skips the depth floor and coverage for paths the caller says are not ADRs", () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    const atlas = makeAtlas({
      source_shas: {
        [adrPath]: "a",
        "README.md": "r",
        "docs/notes.md": "n",
      },
      claims: [
        ...Array.from({ length: 8 }, () => makeAdrClaim(adrPath)),
        makeAdrClaim("README.md"),
        makeAdrClaim("README.md"),
      ],
    });
    const notAdr = new Set(["README.md", "docs/notes.md"]);
    expect(validateExtractionShape(atlas, { isNotAdr: (p) => notAdr.has(p) })).toEqual([]);
    // Without the exemption both invariants fire (the old behaviour).
    const errors = validateExtractionShape(atlas);
    expect(errors.some((e) => /adr_depth_floor/.test(e) && e.includes("README.md"))).toBe(true);
    expect(errors.some((e) => /source_coverage/.test(e) && e.includes("docs/notes.md"))).toBe(true);
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

  it("docs-bucket prose (existing non-ADR files) is exempt; a deleted ADR's zero-claim key still fails (review fix)", async () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    await writeFile(path.join(fixture.root, adrPath), "# ADR-01\n");
    await writeFile(path.join(fixture.root, "README.md"), "# readme\n");
    await writeFile(path.join(fixture.root, "docs", "adr", "probe-findings.md"), "notes\n");
    await writeFile(path.join(fixture.root, "docs", "notes.md"), "notes\n");
    const base = {
      version: "1.4",
      source_shas: {
        [adrPath]: "a",
        "README.md": "r",
        "docs/adr/probe-findings.md": "p",
        "docs/notes.md": "n",
      } as Record<string, string>,
      claims: [
        ...Array.from({ length: 8 }, () => makeAdrClaim(adrPath)),
        makeAdrClaim("README.md"),
        ...Array.from({ length: 3 }, () => makeAdrClaim("docs/adr/probe-findings.md")),
      ],
    };
    await writeAtlas(fixture, base);
    const ok = await runValidateExtractionSubcommand({
      configRoot: fixture.root,
      configFile: null,
      writeStdout: (c) => (stdout += c),
      writeStderr: (c) => (stderr += c),
    });
    expect(stderr).toBe("");
    expect(ok.exitCode).toBe(0);

    // A deleted ADR still left in source_shas is still reported.
    await writeAtlas(fixture, {
      ...base,
      source_shas: { ...base.source_shas, "docs/adr/ADR-02-gone.md": "g" },
    });
    const bad = await runValidateExtractionSubcommand({
      configRoot: fixture.root,
      configFile: null,
      writeStdout: (c) => (stdout += c),
      writeStderr: (c) => (stderr += c),
    });
    expect(bad.exitCode).toBe(2);
    expect(stderr).toContain("docs/adr/ADR-02-gone.md");
    expect(stderr).not.toContain("README.md");
    expect(stderr).not.toContain("probe-findings.md");
    expect(stderr).not.toContain("docs/notes.md");
  });

  it("a deleted docs page left in source_shas is exempt, with zero or a few claims (review round 2)", async () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    await writeFile(path.join(fixture.root, adrPath), "# ADR-01\n");
    // docs/gone.md and docs/small-gone.md were extracted by `index` from
    // docs.include and later deleted; the Skill keeps their keys.
    await writeAtlas(fixture, {
      version: "1.4",
      source_shas: { [adrPath]: "a", "docs/gone.md": "g", "docs/small-gone.md": "s" },
      claims: [
        ...Array.from({ length: 8 }, () => makeAdrClaim(adrPath)),
        ...Array.from({ length: 3 }, () => makeAdrClaim("docs/small-gone.md")),
      ],
    });
    const result = await runValidateExtractionSubcommand({
      configRoot: fixture.root,
      configFile: null,
      writeStdout: (c) => (stdout += c),
      writeStderr: (c) => (stderr += c),
    });
    expect(stderr).toBe("");
    expect(result.exitCode).toBe(0);
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

describe("runValidateExtractionSubcommand — docs outside source.root (ADR-08; review round 2)", () => {
  let root: string;
  let stderr: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "ca-validate-extraction-ext-"));
    stderr = "";
    await mkdir(path.join(root, "app"), { recursive: true });
    await mkdir(path.join(root, "adrs"), { recursive: true });
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "adrs", "ADR-01-foo.md"), "# ADR-01\n");
    await writeFile(path.join(root, "README.md"), "# readme\n");
    await writeFile(path.join(root, "docs", "guide.md"), "# guide\n");
    await writeFile(
      path.join(root, ".contextatlas.yml"),
      [
        "version: 1",
        "languages: [typescript]",
        "source:",
        "  root: app/",
        "adrs:",
        "  path: adrs/",
        "docs:",
        "  include: [README.md, docs/**/*.md]",
        "atlas:",
        "  committed: true",
        "  path: .contextatlas/atlas.json",
        "  local_cache: .contextatlas/index.db",
        "",
      ].join("\n"),
    );
    await mkdir(path.join(root, ".contextatlas"), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const validate = async (atlas: AtlasForValidation) => {
    await writeFile(path.join(root, ".contextatlas", "atlas.json"), JSON.stringify(atlas, null, 2));
    return runValidateExtractionSubcommand({
      configRoot: root,
      configFile: null,
      writeStdout: () => {},
      writeStderr: (c) => (stderr += c),
    });
  };

  // The walk stores the ADR relative to the ADR directory and the docs
  // pages relative to the config root (file-walker.ts proseRelPath).
  const base: AtlasForValidation = {
    version: "1.4",
    source_shas: { "ADR-01-foo.md": "a", "README.md": "r", "docs/guide.md": "g" },
    claims: [
      ...Array.from({ length: 9 }, () => makeAdrClaim("ADR-01-foo.md")),
      ...Array.from({ length: 3 }, () => makeAdrClaim("README.md")),
      ...Array.from({ length: 2 }, () => makeAdrClaim("docs/guide.md")),
    ],
  };

  it("docs pages stored relative to the config root are exempt", async () => {
    const result = await validate(base);
    expect(stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("a deleted ADR stored relative to the ADR directory is still checked", async () => {
    const result = await validate({
      ...base,
      source_shas: { ...base.source_shas, "ADR-02-gone.md": "g" },
    });
    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("ADR-02-gone.md");
    expect(stderr).not.toContain("README.md");
    expect(stderr).not.toContain("docs/guide.md");
  });

  it("a deleted docs page whose file name looks like an ADR's is exempt, not checked as an ADR (review round 2.2)", async () => {
    // docs/rfcs/0001-first-rfc.md (Nygard-style name) and a dated page
    // were extracted by `index` from docs.include and deleted since.
    // Read against the ADR directory they would be adrs/docs/..., an
    // ADR-named path there; read against the config root they are the
    // docs.include pages they were.
    const result = await validate({
      ...base,
      source_shas: {
        ...base.source_shas,
        "docs/rfcs/0001-first-rfc.md": "r1",
        "docs/blog/2024-05-01-post.md": "b1",
      },
      claims: [
        ...base.claims!,
        ...Array.from({ length: 3 }, () => makeAdrClaim("docs/rfcs/0001-first-rfc.md")),
      ],
    });
    expect(stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });
});

describe("runValidateExtractionSubcommand — default layout keeps checking deleted ADRs (review round 2.2)", () => {
  let fixture: Fixture;
  let stderr: string;
  beforeEach(async () => {
    fixture = await makeFixture();
    stderr = "";
    // A broad docs glob that also matches the ADR directory.
    const cfg = path.join(fixture.root, ".contextatlas.yml");
    await writeFile(cfg, (await readFile(cfg, "utf8")).replace("include: []", "include: [docs/**/*.md]"));
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("a deleted ADR whose path a docs.include glob also matches is still checked", async () => {
    const adrPath = "docs/adr/ADR-01-foo.md";
    await writeFile(path.join(fixture.root, adrPath), "# ADR-01\n");
    await writeAtlas(fixture, {
      version: "1.4",
      source_shas: { [adrPath]: "a", "docs/adr/ADR-02-gone.md": "g" },
      claims: [
        ...Array.from({ length: 8 }, () => makeAdrClaim(adrPath)),
        ...Array.from({ length: 3 }, () => makeAdrClaim("docs/adr/ADR-02-gone.md")),
      ],
    });
    const result = await runValidateExtractionSubcommand({
      configRoot: fixture.root,
      configFile: null,
      writeStdout: () => {},
      writeStderr: (c) => (stderr += c),
    });
    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("docs/adr/ADR-02-gone.md: 3 claims");
  });
});
