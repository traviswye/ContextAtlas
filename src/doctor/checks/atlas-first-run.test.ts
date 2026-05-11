import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { atlasChecks } from "./atlas.js";
import type { CheckContext } from "../types.js";

/**
 * FO-7 part 2 (v0.7 Step 2.2.d): atlas.exists check downgrades
 * FAIL → WARN when `ctx.firstRun === true`. Substantively serves the
 * cold-start workflow (init → generate-adrs → index) where atlas is
 * substantively NOT YET created at init's first-run gate.
 */
describe("atlasChecks firstRun semantics (v0.7 Step 2.2.d FO-7 part 2)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "atlas-first-run-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  function buildCtx(firstRun: boolean): CheckContext {
    return {
      repoRoot: tmpRoot,
      config: {
        version: 1,
        languages: ["python"],
        adrs: { path: "docs/adr/", format: "markdown-frontmatter" },
        docs: { include: [] },
        atlas: {
          committed: true,
          path: ".contextatlas/atlas.json",
          localCache: ".contextatlas/index.db",
        },
      },
      configPath: path.join(tmpRoot, ".contextatlas.yml"),
      configError: null,
      firstRun,
    };
  }

  it("atlas.exists status=FAIL when atlas.json missing AND firstRun=false (standalone doctor)", () => {
    const checks = atlasChecks(buildCtx(false));
    const atlasExists = checks.find((c) => c.id === "atlas.exists");
    expect(atlasExists?.status).toBe("fail");
    expect(atlasExists?.message).toContain("not found");
  });

  it("atlas.exists status=WARN when atlas.json missing AND firstRun=true (init gate)", () => {
    const checks = atlasChecks(buildCtx(true));
    const atlasExists = checks.find((c) => c.id === "atlas.exists");
    expect(atlasExists?.status).toBe("warn");
    expect(atlasExists?.message).toContain("not yet created");
  });

  it("atlas.exists detail message differs between firstRun true/false (substantive UX framing)", () => {
    const firstRunCheck = atlasChecks(buildCtx(true)).find(
      (c) => c.id === "atlas.exists",
    );
    const standaloneCheck = atlasChecks(buildCtx(false)).find(
      (c) => c.id === "atlas.exists",
    );
    expect(firstRunCheck?.detail).toContain("Cold-start state");
    expect(standaloneCheck?.detail).toContain("Run extraction");
  });

  it("atlas.exists firstRun=undefined (default) preserves FAIL semantics", () => {
    const ctx: CheckContext = {
      ...buildCtx(false),
      firstRun: undefined,
    };
    const checks = atlasChecks(ctx);
    const atlasExists = checks.find((c) => c.id === "atlas.exists");
    expect(atlasExists?.status).toBe("fail");
  });

  it("atlas.exists status=PASS when atlas.json exists regardless of firstRun flag", async () => {
    const atlasDir = path.join(tmpRoot, ".contextatlas");
    await mkdir(atlasDir, { recursive: true });
    await writeFile(
      path.join(atlasDir, "atlas.json"),
      JSON.stringify({ version: "1.3", symbols: [], claims: [] }),
      "utf8",
    );
    const firstRunCheck = atlasChecks(buildCtx(true)).find(
      (c) => c.id === "atlas.exists",
    );
    const standaloneCheck = atlasChecks(buildCtx(false)).find(
      (c) => c.id === "atlas.exists",
    );
    expect(firstRunCheck?.status).toBe("pass");
    expect(standaloneCheck?.status).toBe("pass");
  });
});
