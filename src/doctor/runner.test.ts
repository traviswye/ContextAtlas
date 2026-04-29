import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collectChecks, runDoctorSubcommand } from "./runner.js";

/**
 * End-to-end orchestration test against fixture repos. The five
 * fixture types declared in the v0.4 Step 8 design (Q6 lock) are
 * built inline per test rather than as on-disk fixtures, since
 * the structural shape is small and the inline construction reads
 * tightly with each test's expectations.
 *
 * Real LSP spawn is exercised by the contextatlas-on-itself
 * acceptance smoke test, not unit tests — the adapter conformance
 * suite already covers spawn behavior.
 */

interface Fixture {
  readonly tmp: string;
}

function makeFixture(): Fixture {
  const tmp = mkdtempSync(pathJoin(tmpdir(), "ca-doctor-"));
  return { tmp };
}

function writeMinimalConfig(tmp: string): void {
  mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
  mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
  writeFileSync(
    pathJoin(tmp, ".contextatlas.yml"),
    [
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
    ].join("\n"),
  );
}

function writeMinimalAtlas(tmp: string, opts: { sha?: string; valid?: boolean } = {}): void {
  const sha = opts.sha ?? "0".repeat(40);
  const valid = opts.valid !== false;
  const atlas = valid
    ? {
        version: "1.3",
        generated_at: new Date().toISOString(),
        symbols: [
          {
            id: "sym:ts:src/x.ts:Foo",
            name: "Foo",
            kind: "class",
            path: "src/x.ts",
            line: 1,
            language: "typescript",
          },
        ],
        claims: [
          {
            id: 1,
            source: "ADR-01",
            source_path: "docs/adr/ADR-01.md",
            source_sha: "deadbeef",
            severity: "context",
            claim: "stub claim",
            symbol_ids: ["sym:ts:src/x.ts:Foo"],
          },
        ],
        generator: {
          contextatlas_version: "0.4-dev",
          contextatlas_commit_sha: sha,
        },
      }
    : { not: "an atlas" };
  writeFileSync(
    pathJoin(tmp, ".contextatlas", "atlas.json"),
    JSON.stringify(atlas, null, 2),
  );
}

describe("collectChecks — limited mode (no .contextatlas.yml)", () => {
  let f: Fixture;
  beforeEach(() => {
    f = makeFixture();
  });
  afterEach(() => rmSync(f.tmp, { recursive: true, force: true }));

  it("emits doctor.limited_mode WARN at top + filesystem-only checks", async () => {
    const result = await collectChecks(f.tmp);
    const ids = result.checks.map((c) => c.id);
    expect(ids[0]).toBe("doctor.limited_mode");
    const limitedCheck = result.checks[0]!;
    expect(limitedCheck.status).toBe("warn");
    expect(limitedCheck.message).toContain("limited mode");

    // Config / atlas / SHA / LSP checks all SKIPPED.
    expect(ids).not.toContain("config.parses");
    expect(ids).not.toContain("atlas.exists");
    expect(ids).not.toContain("sha.atlas_vs_head");
    expect(ids.some((id) => id.startsWith("lsp."))).toBe(false);

    // Extraction prereq checks still run.
    expect(ids).toContain("env.anthropic_api_key");
    expect(ids).toContain("runtime.node_version");
    expect(ids).toContain("deps.installed");

    // Limited mode is WARN-only-or-PASS; FAIL count stays 0.
    expect(result.summary.fail).toBe(0);
    expect(result.exitCode).toBe(0);
  });
});

describe("collectChecks — config FAIL paths", () => {
  let f: Fixture;
  beforeEach(() => {
    f = makeFixture();
  });
  afterEach(() => rmSync(f.tmp, { recursive: true, force: true }));

  it("malformed YAML → config.parses FAIL", async () => {
    writeFileSync(pathJoin(f.tmp, ".contextatlas.yml"), "not: [valid: yaml");
    const result = await collectChecks(f.tmp);
    const parseCheck = result.checks.find((c) => c.id === "config.parses");
    expect(parseCheck?.status).toBe("fail");
    expect(result.summary.fail).toBeGreaterThan(0);
    expect(result.exitCode).toBe(1);
  });

  it("missing adrs.path → config.adrs_path_resolves FAIL", async () => {
    // Config references docs/adr/ but the dir is never created.
    writeFileSync(
      pathJoin(f.tmp, ".contextatlas.yml"),
      [
        "version: 1",
        "languages: [typescript]",
        "adrs: { path: docs/adr/, format: markdown-frontmatter }",
        "docs: { include: [] }",
        "atlas: { committed: true, path: .contextatlas/atlas.json, " +
          "local_cache: .contextatlas/index.db }",
        "",
      ].join("\n"),
    );
    const result = await collectChecks(f.tmp);
    const adrCheck = result.checks.find((c) => c.id === "config.adrs_path_resolves");
    expect(adrCheck?.status).toBe("fail");
  });
});

describe("collectChecks — atlas FAIL paths", () => {
  let f: Fixture;
  beforeEach(() => {
    f = makeFixture();
    writeMinimalConfig(f.tmp);
  });
  afterEach(() => rmSync(f.tmp, { recursive: true, force: true }));

  it("missing atlas.json → atlas.exists FAIL", async () => {
    const result = await collectChecks(f.tmp);
    const atlasCheck = result.checks.find((c) => c.id === "atlas.exists");
    expect(atlasCheck?.status).toBe("fail");
    expect(result.summary.fail).toBeGreaterThan(0);
  });

  it("malformed atlas.json → atlas.parses FAIL", async () => {
    writeMinimalAtlas(f.tmp, { valid: false });
    // Force a JSON parse error by overwriting with bad content.
    writeFileSync(
      pathJoin(f.tmp, ".contextatlas", "atlas.json"),
      "this is not json",
    );
    const result = await collectChecks(f.tmp);
    const parseCheck = result.checks.find((c) => c.id === "atlas.parses");
    expect(parseCheck?.status).toBe("fail");
  });

  it("zero claims → atlas.has_claims FAIL", async () => {
    writeFileSync(
      pathJoin(f.tmp, ".contextatlas", "atlas.json"),
      JSON.stringify({
        version: "1.3",
        generated_at: new Date().toISOString(),
        symbols: [
          {
            id: "sym:ts:src/x.ts:Foo",
            name: "Foo",
            kind: "class",
            path: "src/x.ts",
            line: 1,
            language: "typescript",
          },
        ],
        claims: [],
        generator: {
          contextatlas_version: "0.4-dev",
          contextatlas_commit_sha: "0".repeat(40),
        },
      }),
    );
    const result = await collectChecks(f.tmp);
    const claimsCheck = result.checks.find((c) => c.id === "atlas.has_claims");
    expect(claimsCheck?.status).toBe("fail");
  });
});

describe("collectChecks — valid-minimal PASS path", () => {
  let f: Fixture;
  beforeEach(() => {
    f = makeFixture();
    writeMinimalConfig(f.tmp);
    writeMinimalAtlas(f.tmp);
  });
  afterEach(() => rmSync(f.tmp, { recursive: true, force: true }));

  it("config + atlas content checks all PASS; LSP skipped (test fixture has no node_modules)", async () => {
    const result = await collectChecks(f.tmp);
    // Spot-check that config + atlas content checks are PASS.
    // LSP spawn checks will FAIL in the fixture because no
    // node_modules — that's expected and orthogonal to this test.
    const configChecks = result.checks.filter((c) => c.category === "config");
    expect(configChecks.every((c) => c.status === "pass")).toBe(true);

    const atlasContentChecks = result.checks.filter(
      (c) =>
        c.category === "atlas" &&
        c.id !== "atlas.provenance_complete", // generated_at recently-set; not asserted
    );
    expect(atlasContentChecks.every((c) => c.status === "pass")).toBe(true);

    // Exit code 1 is acceptable here since LSP spawn fails in
    // bare fixture; the orchestration shape is what we assert.
    expect(result.checks.length).toBeGreaterThan(10);
  });
});

describe("runDoctorSubcommand — output dispatch", () => {
  let f: Fixture;
  beforeEach(() => {
    f = makeFixture();
  });
  afterEach(() => rmSync(f.tmp, { recursive: true, force: true }));

  it("text output (default) starts with 'ContextAtlas Doctor'", async () => {
    let captured = "";
    await runDoctorSubcommand({
      repoRoot: f.tmp,
      writeStdout: (c) => {
        captured += c;
      },
    });
    expect(captured.startsWith("ContextAtlas Doctor v")).toBe(true);
    expect(captured).toContain("limited mode");
    expect(captured).toContain("Summary:");
  });

  it("--json output is parseable JSON with expected top-level keys", async () => {
    let captured = "";
    await runDoctorSubcommand({
      repoRoot: f.tmp,
      json: true,
      writeStdout: (c) => {
        captured += c;
      },
    });
    const parsed = JSON.parse(captured);
    expect(parsed.doctor_version).toBeTruthy();
    expect(parsed.repo_root).toBe(f.tmp);
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.summary.pass).toBeGreaterThanOrEqual(0);
    expect(parsed.summary.warn).toBeGreaterThanOrEqual(0);
    expect(parsed.summary.fail).toBeGreaterThanOrEqual(0);
    expect(parsed.exit_code).toBe(0);
  });
});
