/**
 * Tests for the config-category doctor checks. Focused on
 * `config.extraction_streams` (v1.2 Phase 2; SCOPE D-1, lead
 * decision L-11): it reports the enabled streams, marks the default,
 * and warns when a disabled stream still has claims in atlas.json
 * (kept frozen: extraction neither refreshes nor deletes them).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ContextAtlasConfig, ExtractionStream } from "../../types.js";
import type { CheckContext, DoctorCheck } from "../types.js";

import { configChecks } from "./config.js";

describe("configChecks — config.extraction_streams", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "doctor-config-streams-"));
    await mkdir(path.join(tmpRoot, "docs", "adr"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpRoot, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });

  function buildCtx(streams?: readonly ExtractionStream[]): CheckContext {
    const config: ContextAtlasConfig = {
      version: 1,
      languages: ["typescript"],
      adrs: { path: "docs/adr", format: "markdown-frontmatter" },
      docs: { include: ["README.md"] },
      git: { recentCommits: 5 },
      index: { model: "claude-opus-4-7" },
      atlas: {
        committed: true,
        path: ".contextatlas/atlas.json",
        localCache: ".contextatlas/index.db",
      },
    };
    if (streams !== undefined) config.extraction = { streams };
    return {
      repoRoot: tmpRoot,
      config,
      configPath: path.join(tmpRoot, ".contextatlas.yml"),
      configError: null,
    };
  }

  async function writeAtlas(sources: readonly string[]): Promise<void> {
    await mkdir(path.join(tmpRoot, ".contextatlas"), { recursive: true });
    const claims = sources.map((source, i) => ({
      source,
      source_path: source.startsWith("adr:") ? `docs/adr/${i}.md` : source,
      source_sha: "a".repeat(40),
      severity: "context",
      claim: `claim ${i}`,
      symbol_ids: [],
    }));
    await writeFile(
      path.join(tmpRoot, ".contextatlas", "atlas.json"),
      JSON.stringify({ version: "1.4", symbols: [], claims }),
      "utf8",
    );
  }

  function streamsCheck(checks: readonly DoctorCheck[]): DoctorCheck {
    const check = checks.find((c) => c.id === "config.extraction_streams");
    if (check === undefined) {
      throw new Error("config.extraction_streams check was not emitted");
    }
    return check;
  }

  it("key absent → pass, lists all three streams and marks the default", () => {
    const check = streamsCheck(configChecks(buildCtx()));
    expect(check.category).toBe("config");
    expect(check.status).toBe("pass");
    expect(check.message).toBe("adr, docstring, commit (default)");
  });

  it("key absent with every stream's claims in the atlas → pass (nothing disabled)", async () => {
    await writeAtlas([
      "adr:ADR-01",
      "docstring:src/a.ts",
      "commit:" + "b".repeat(40),
    ]);
    const check = streamsCheck(configChecks(buildCtx()));
    expect(check.status).toBe("pass");
    expect(check.message).toBe("adr, docstring, commit (default)");
  });

  it("all three set explicitly → pass without the (default) marker", () => {
    const check = streamsCheck(
      configChecks(buildCtx(["adr", "docstring", "commit"])),
    );
    expect(check.status).toBe("pass");
    expect(check.message).toBe("adr, docstring, commit");
  });

  it("subset, no atlas yet → pass, names the disabled streams", () => {
    const check = streamsCheck(configChecks(buildCtx(["adr"])));
    expect(check.status).toBe("pass");
    expect(check.message).toBe("adr (disabled: docstring, commit)");
  });

  it("subset, atlas holds only enabled-stream claims → pass", async () => {
    await writeAtlas(["adr:ADR-01", "adr:ADR-02", "docstring:src/a.ts"]);
    const check = streamsCheck(configChecks(buildCtx(["adr", "docstring"])));
    expect(check.status).toBe("pass");
    expect(check.message).toBe("adr, docstring (disabled: commit)");
  });

  it("disabled stream still has claims → warn with per-stream counts and a frozen-claims detail", async () => {
    await writeAtlas([
      "adr:ADR-01",
      "docstring:src/a.ts",
      "docstring:src/b.ts",
      "commit:" + "c".repeat(40),
    ]);
    const check = streamsCheck(configChecks(buildCtx(["adr"])));
    expect(check.status).toBe("warn");
    expect(check.message).toBe(
      "adr (disabled: docstring, commit); atlas still holds 2 docstring + 1 commit claims from disabled streams",
    );
    expect(check.detail).toMatch(/frozen/);
    expect(check.detail).toMatch(/extraction\.streams/);
  });

  it("only the disabled stream with claims is counted", async () => {
    await writeAtlas(["adr:ADR-01", "commit:" + "d".repeat(40)]);
    const check = streamsCheck(configChecks(buildCtx(["adr", "docstring"])));
    expect(check.status).toBe("warn");
    expect(check.message).toBe(
      "adr, docstring (disabled: commit); atlas still holds 1 commit claim from disabled streams",
    );
  });

  it("legacy prose sources (pre-v0.7.2 names) count as adr, never as a disabled stream", async () => {
    await writeAtlas(["DESIGN", "ADR-06"]);
    const check = streamsCheck(configChecks(buildCtx(["adr"])));
    expect(check.status).toBe("pass");
  });

  it("unparseable atlas → pass (atlas.parses reports the problem)", async () => {
    await mkdir(path.join(tmpRoot, ".contextatlas"), { recursive: true });
    await writeFile(
      path.join(tmpRoot, ".contextatlas", "atlas.json"),
      "{ not json",
      "utf8",
    );
    const check = streamsCheck(configChecks(buildCtx(["adr"])));
    expect(check.status).toBe("pass");
    expect(check.message).toBe("adr (disabled: docstring, commit)");
  });

  it("emitted after the existing config checks", () => {
    const ids = configChecks(buildCtx()).map((c) => c.id);
    expect(ids.indexOf("config.extraction_streams")).toBeGreaterThan(
      ids.indexOf("config.commit_message_filter_valid"),
    );
  });

  it("not emitted when config failed to parse", () => {
    const ctx: CheckContext = {
      repoRoot: tmpRoot,
      config: null,
      configPath: path.join(tmpRoot, ".contextatlas.yml"),
      configError: "Invalid ContextAtlas config: bad",
    };
    const ids = configChecks(ctx).map((c) => c.id);
    expect(ids).not.toContain("config.extraction_streams");
  });
});
