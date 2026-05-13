/**
 * Tests for `contextatlas validate-atlas` CLI subcommand (v0.7 Step
 * 2.3.b.0 — β-bounded mechanical schema validation).
 *
 * Covers every empirical failure mode observed at Step 2.3 Checkpoint
 * 3 (D4' atlas schema fidelity divergence): version mismatch +
 * missing/wrong generator + non-canonical sources nesting + missing
 * top-level keys + invalid claim shape + non-canonical top-level
 * fields. Plus canonical-atlas PASS path + v1.3 backward-compat
 * acceptance.
 */

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runValidateAtlasSubcommand } from "./cli-validate-atlas.js";

const MINIMAL_CONFIG = [
  "version: 1",
  "languages:",
  "  - typescript",
  "adrs:",
  "  path: docs/adr/",
  "  format: markdown-frontmatter",
  "docs:",
  "  include: []",
  "atlas:",
  "  committed: true",
  "  path: .contextatlas/atlas.json",
  "  local_cache: .contextatlas/index.db",
  "",
].join("\n");

const CANONICAL_ATLAS = {
  version: "1.4",
  generated_at: "2026-05-11T20:00:00.000Z",
  generator: {
    contextatlas_version: "0.7.1",
    extraction_model: "claude-opus-4-7",
  },
  source_shas: {
    "docs/adr/ADR-01-name.md": "abc123",
  },
  symbols: [],
  claims: [
    {
      source: "adr:ADR-01-name.md",
      source_path: "docs/adr/ADR-01-name.md",
      source_sha: "abc123",
      severity: "hard",
      claim: "Renderable protocol via duck typing",
      rationale: "Allows any object to opt in to terminal rendering",
      excerpt: "Renderables expose __rich_console__",
      symbol_ids: [],
      symbol_candidates: ["ConsoleRenderable"],
    },
  ],
};

function captureStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdoutChunks: stdout,
    stderrChunks: stderr,
    writeStdout: (c: string) => {
      stdout.push(c);
    },
    writeStderr: (c: string) => {
      stderr.push(c);
    },
    joinedStdout: () => stdout.join(""),
    joinedStderr: () => stderr.join(""),
  };
}

describe("runValidateAtlasSubcommand (v0.7 Step 2.3.b.0)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-validate-atlas-"));
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    writeFileSync(pathJoin(tmp, ".contextatlas.yml"), MINIMAL_CONFIG);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeAtlas(atlas: unknown): void {
    writeFileSync(
      pathJoin(tmp, ".contextatlas", "atlas.json"),
      JSON.stringify(atlas, null, 2),
    );
  }

  async function run() {
    const cap = captureStreams();
    const result = await runValidateAtlasSubcommand({
      configRoot: tmp,
      configFile: null,
      writeStdout: cap.writeStdout,
      writeStderr: cap.writeStderr,
    });
    return { ...result, ...cap };
  }

  it("PASS on canonical AtlasFileV1 v1.4 atlas", async () => {
    writeAtlas(CANONICAL_ATLAS);
    const r = await run();
    expect(r.exitCode).toBe(0);
    expect(r.errors).toEqual([]);
    expect(r.joinedStdout()).toContain("conforms to canonical");
  });

  it("PASS on v1.3 atlas (backward compat per SUPPORTED_ATLAS_VERSIONS)", async () => {
    writeAtlas({ ...CANONICAL_ATLAS, version: "1.3" });
    const r = await run();
    expect(r.exitCode).toBe(0);
  });

  it("PASS on atlas with zero claims (empty array is valid)", async () => {
    writeAtlas({ ...CANONICAL_ATLAS, claims: [] });
    const r = await run();
    expect(r.exitCode).toBe(0);
  });

  it("FAIL exit 2 when atlas.json missing", async () => {
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("atlas.json not found");
  });

  it("FAIL exit 2 when atlas.json is invalid JSON", async () => {
    writeFileSync(
      pathJoin(tmp, ".contextatlas", "atlas.json"),
      "{ not valid json",
    );
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("did not parse as JSON");
  });

  it("FAIL when version is non-canonical (e.g., '1' instead of '1.4')", async () => {
    writeAtlas({ ...CANONICAL_ATLAS, version: "1" });
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain('version');
    expect(r.joinedStderr()).toContain('"1"');
  });

  it("FAIL when version is missing", async () => {
    const { version: _, ...rest } = CANONICAL_ATLAS;
    writeAtlas(rest);
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("version");
  });

  it("FAIL when generator is a free-form string instead of object (D4' empirical pattern)", async () => {
    writeAtlas({
      ...CANONICAL_ATLAS,
      generator: "contextatlas/index-atlas skill (Claude Code session)",
    });
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("generator");
    expect(r.joinedStderr()).toContain("object");
  });

  it("FAIL when generator object missing required fields", async () => {
    writeAtlas({
      ...CANONICAL_ATLAS,
      generator: { contextatlas_version: "0.7.1" }, // missing extraction_model
    });
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("extraction_model");
  });

  it("FAIL with specific remediation when claims are nested in `sources` (D4' empirical pattern)", async () => {
    const noClaims = { ...CANONICAL_ATLAS };
    // @ts-expect-error — testing non-canonical shape
    delete noClaims.claims;
    writeAtlas({
      ...noClaims,
      sources: [
        {
          source: "ADR-01",
          claims: [
            {
              severity: "hard",
              claim: "x",
            },
          ],
        },
      ],
    });
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("`sources` array was found");
    expect(r.joinedStderr()).toContain("flat top-level");
  });

  it("FAIL when claims field is missing", async () => {
    const { claims: _, ...rest } = CANONICAL_ATLAS;
    writeAtlas(rest);
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("`claims`");
  });

  it("FAIL when symbols field is missing or non-array", async () => {
    writeAtlas({ ...CANONICAL_ATLAS, symbols: "not-an-array" });
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("`symbols`");
  });

  it("FAIL when source_shas is missing", async () => {
    const { source_shas: _, ...rest } = CANONICAL_ATLAS;
    writeAtlas(rest);
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("source_shas");
  });

  it("FAIL when generated_at is missing", async () => {
    const { generated_at: _, ...rest } = CANONICAL_ATLAS;
    writeAtlas(rest);
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("generated_at");
  });

  it("FAIL on non-canonical top-level fields (cost_usd, cost_model, repo, sources)", async () => {
    writeAtlas({
      ...CANONICAL_ATLAS,
      cost_usd: 0.0,
      cost_model: "subscription-bounded",
      repo: { languages: ["python"] },
    });
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("cost_usd");
    expect(r.joinedStderr()).toContain("cost_model");
    expect(r.joinedStderr()).toContain("repo");
  });

  it("FAIL on per-claim shape errors (missing required fields)", async () => {
    writeAtlas({
      ...CANONICAL_ATLAS,
      claims: [
        {
          // missing source, source_path, source_sha, claim, severity
          symbol_ids: [],
        },
      ],
    });
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("claims[0]");
  });

  it("FAIL on invalid severity value", async () => {
    writeAtlas({
      ...CANONICAL_ATLAS,
      claims: [
        {
          source: "x",
          source_path: "x",
          source_sha: "x",
          claim: "x",
          severity: "invalid-severity-value",
          symbol_ids: [],
        },
      ],
    });
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("severity");
  });

  it("FAIL when claim.symbol_ids is not an array", async () => {
    writeAtlas({
      ...CANONICAL_ATLAS,
      claims: [
        {
          source: "x",
          source_path: "x",
          source_sha: "x",
          claim: "x",
          severity: "hard",
          symbol_ids: "not-an-array",
        },
      ],
    });
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("symbol_ids");
  });

  // ---------------------------------------------------------------------
  // V0.8 Step 4.2 — FO-15 + FO-16 mechanical enforcement tests
  // ---------------------------------------------------------------------

  describe("FO-15 — semver-parse + installed-version-match (Q4.0.2.a Option β)", () => {
    async function runWithVersion(installedVersion: string) {
      const cap = captureStreams();
      const result = await runValidateAtlasSubcommand({
        configRoot: tmp,
        configFile: null,
        writeStdout: cap.writeStdout,
        writeStderr: cap.writeStderr,
        installedPackageVersionOverride: installedVersion,
      });
      return { ...result, ...cap };
    }

    it("PASS when contextatlas_version matches installed (canonical case)", async () => {
      writeAtlas({
        ...CANONICAL_ATLAS,
        generator: {
          ...CANONICAL_ATLAS.generator,
          contextatlas_version: "0.8.0",
        },
      });
      const r = await runWithVersion("0.8.0");
      expect(r.exitCode).toBe(0);
    });

    it("PASS on semver with prerelease suffix (e.g., 1.0.0-rc.1)", async () => {
      writeAtlas({
        ...CANONICAL_ATLAS,
        generator: {
          ...CANONICAL_ATLAS.generator,
          contextatlas_version: "1.0.0-rc.1",
        },
      });
      const r = await runWithVersion("1.0.0-rc.1");
      expect(r.exitCode).toBe(0);
    });

    it("FAIL on non-semver contextatlas_version (e.g., 'invented')", async () => {
      writeAtlas({
        ...CANONICAL_ATLAS,
        generator: {
          ...CANONICAL_ATLAS.generator,
          contextatlas_version: "invented",
        },
      });
      const r = await runWithVersion("0.8.0");
      expect(r.exitCode).toBe(2);
      expect(r.joinedStderr()).toContain("not parseable as semver");
    });

    it("FAIL on contextatlas_version mismatch with installed (FO-15 origin closure)", async () => {
      // Atlas claims 0.7.0; installed is 0.8.0 (Step 2.3 Checkpoint 3
      // empirical pattern: agent invented "0.7.0" despite installed
      // binary at "0.6.0" at v0.7 cycle)
      writeAtlas({
        ...CANONICAL_ATLAS,
        generator: {
          ...CANONICAL_ATLAS.generator,
          contextatlas_version: "0.7.0",
        },
      });
      const r = await runWithVersion("0.8.0");
      expect(r.exitCode).toBe(2);
      expect(r.joinedStderr()).toContain("does not match installed");
      expect(r.joinedStderr()).toContain("0.7.0");
      expect(r.joinedStderr()).toContain("0.8.0");
    });

    it("FAIL on missing contextatlas_version (existing type-presence check preserved)", async () => {
      writeAtlas({
        ...CANONICAL_ATLAS,
        generator: {
          extraction_model: "claude-opus-4-7",
        },
      });
      const r = await run();
      expect(r.exitCode).toBe(2);
      expect(r.joinedStderr()).toContain("contextatlas_version");
    });
  });

  describe("FO-16 — dual-invariant generated_at validation (Q4.0.2.b refined)", () => {
    async function runWithNow(now: Date) {
      const cap = captureStreams();
      const result = await runValidateAtlasSubcommand({
        configRoot: tmp,
        configFile: null,
        writeStdout: cap.writeStdout,
        writeStderr: cap.writeStderr,
        nowOverride: now,
      });
      return { ...result, ...cap };
    }

    it("FAIL on non-parseable ISO 8601 generated_at", async () => {
      writeAtlas({
        ...CANONICAL_ATLAS,
        generated_at: "not-a-timestamp",
      });
      const r = await run();
      expect(r.exitCode).toBe(2);
      expect(r.joinedStderr()).toContain("not parseable as ISO 8601");
    });

    it("FAIL on Invariant 1 (file-mtime anchor): generated_at AFTER mtime", async () => {
      // generated_at far in the future; atlas mtime is now-ish
      writeAtlas({
        ...CANONICAL_ATLAS,
        generated_at: "2099-01-01T00:00:00.000Z",
      });
      const r = await run();
      expect(r.exitCode).toBe(2);
      expect(r.joinedStderr()).toContain("file-mtime-anchor invariant");
    });

    it("PASS Invariant 1 when generated_at is before file mtime (canonical case)", async () => {
      // generated_at = 1 hour ago; mtime = now (just written)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      writeAtlas({
        ...CANONICAL_ATLAS,
        generated_at: oneHourAgo,
      });
      const r = await run();
      expect(r.exitCode).toBe(0);
    });

    it("PASS WITH WARNING on Invariant 2 (6mo-staleness) violation", async () => {
      // generated_at 1 year ago; "now" = today; file mtime preserved
      // (we write the file now, so mtime is ~now; generated_at older
      // → Invariant 1 passes; Invariant 2 fires WARNING)
      const oneYearAgo = new Date(
        Date.now() - 365 * 24 * 60 * 60 * 1000,
      ).toISOString();
      writeAtlas({
        ...CANONICAL_ATLAS,
        generated_at: oneYearAgo,
      });
      const r = await run();
      expect(r.exitCode).toBe(0); // WARNING does not affect exit code
      expect(r.warnings.length).toBeGreaterThan(0);
      expect(r.warnings[0]).toMatch(/days old|6 months|stale/i);
      expect(r.joinedStderr()).toContain("WARNING");
    });

    it("PASS within 6mo-staleness window (canonical case; no WARNING)", async () => {
      const oneMonthAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      writeAtlas({
        ...CANONICAL_ATLAS,
        generated_at: oneMonthAgo,
      });
      const r = await run();
      expect(r.exitCode).toBe(0);
      expect(r.warnings).toEqual([]);
    });

    it("nowOverride seam: simulates future validate-time for staleness test", async () => {
      // generated_at = 2026-05-11; now-override = 2027-05-11 (>1yr later);
      // expect WARNING but PASS exit
      writeAtlas(CANONICAL_ATLAS);
      const r = await runWithNow(new Date("2027-05-11T20:00:00.000Z"));
      expect(r.exitCode).toBe(0);
      expect(r.warnings.length).toBeGreaterThan(0);
    });
  });

  it("FAIL on raw atlas root that is an array (not an object)", async () => {
    writeAtlas([]);
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain("must be a JSON object");
  });

  it("emits remediation guidance pointing to canonical example", async () => {
    writeAtlas({ ...CANONICAL_ATLAS, version: "1" });
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.joinedStderr()).toContain(
      ".contextatlas/prompts/extraction.md",
    );
    expect(r.joinedStderr()).toContain("AtlasFileV1");
  });
});
