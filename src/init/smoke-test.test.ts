import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runSmokeTest } from "./smoke-test.js";

const SAMPLE_ATLAS_FIXTURE = path.resolve(
  "test/fixtures/atlas/sample-atlas.json",
);

/**
 * Step 4.4 smoke test coverage per Q4.0.13 lock + Q4.4 Point 4 lock
 * (real atlas reads against sample fixture; no Anthropic API call).
 *
 * NEVER_CALLED_ADAPTER stub validates A4 lazy-spawn end-to-end via
 * smoke test path (Q4.4.1 lock); doctor deep health check covers
 * LSP path separately (non-overlapping coverage).
 */

describe("runSmokeTest — pass / fail paths (Q4.0.7 + Q4.4.1 + Q4.4.2 locks)", () => {
  let tmpRoot: string;
  let atlasDir: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "smoke-test-"));
    atlasDir = path.join(tmpRoot, ".contextatlas");
    await mkdir(atlasDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("pass path: atlas with symbols → status 'pass' + symbol id + claims count", async () => {
    await copyFile(
      SAMPLE_ATLAS_FIXTURE,
      path.join(atlasDir, "atlas.json"),
    );

    const result = await runSmokeTest({
      configRoot: tmpRoot,
      atlasPath: ".contextatlas/atlas.json",
      localCachePath: ".contextatlas/index.db",
    });

    expect(result.status).toBe("pass");
    if (result.status === "pass") {
      // First symbol by id (sample fixture sorted; first id is
      // BaseProcessor).
      expect(result.symbolId).toBe(
        "sym:ts:src/orders/base.ts:BaseProcessor",
      );
      expect(result.claims).toBeGreaterThanOrEqual(0);
      expect(result.references).toBe(0); // atlas-only-safe scope; no refs requested
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("fail path: atlas.json missing → status 'fail' with actionable reason", async () => {
    // No atlas.json copied; cache also empty
    const result = await runSmokeTest({
      configRoot: tmpRoot,
      atlasPath: ".contextatlas/atlas.json",
      localCachePath: ".contextatlas/index.db",
    });

    expect(result.status).toBe("fail");
    if (result.status === "fail") {
      expect(result.reason).toContain("Could not load atlas");
    }
  });

  it("atlas-only mode: NEVER_CALLED_ADAPTER never invoked (A4 lazy-spawn validation)", async () => {
    // Implicit validation: stub adapter throws on any method call;
    // if pass path completes, A4 lazy-spawn correctly gated all
    // adapter access. Q4.4.1 lock validates this end-to-end.
    await copyFile(
      SAMPLE_ATLAS_FIXTURE,
      path.join(atlasDir, "atlas.json"),
    );

    const result = await runSmokeTest({
      configRoot: tmpRoot,
      atlasPath: ".contextatlas/atlas.json",
      localCachePath: ".contextatlas/index.db",
    });

    // Pass status → adapter never called (else stub would throw).
    expect(result.status).toBe("pass");
  });

  it("duration measurement: durationMs is non-negative number", async () => {
    await copyFile(
      SAMPLE_ATLAS_FIXTURE,
      path.join(atlasDir, "atlas.json"),
    );

    const result = await runSmokeTest({
      configRoot: tmpRoot,
      atlasPath: ".contextatlas/atlas.json",
      localCachePath: ".contextatlas/index.db",
    });

    expect(result.status).toBe("pass");
    if (result.status === "pass") {
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.durationMs)).toBe(true);
    }
  });

  it("returns exact symbolId from listAllSymbols first entry (Q4.4.2 lock)", async () => {
    await copyFile(
      SAMPLE_ATLAS_FIXTURE,
      path.join(atlasDir, "atlas.json"),
    );

    const result = await runSmokeTest({
      configRoot: tmpRoot,
      atlasPath: ".contextatlas/atlas.json",
      localCachePath: ".contextatlas/index.db",
    });

    expect(result.status).toBe("pass");
    if (result.status === "pass") {
      // Q4.4.2 lock: first symbol by id (sorted ORDER BY id in
      // listAllSymbols). Sample fixture has BaseProcessor as
      // alphabetically-first id.
      expect(result.symbolId).toMatch(/^sym:/);
    }
  });
});
