import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin, resolve as pathResolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "./parser.js";

const FIXTURE_DIR = pathResolve("test/fixtures/config");
const MINIMAL = pathJoin(FIXTURE_DIR, "minimal.yml");
const FULL = pathJoin(FIXTURE_DIR, "full.yml");

describe("loadConfig — happy paths", () => {
  it("accepts a minimal config and fills in defaults", () => {
    const cfg = loadConfig(FIXTURE_DIR, "minimal.yml");
    expect(cfg).toEqual({
      version: 1,
      languages: ["typescript"],
      adrs: { path: "docs/adr", format: "markdown-frontmatter" },
      docs: { include: ["README.md", "docs/**/*.md", "CONTRIBUTING.md"] },
      git: { recentCommits: 5 },
      index: { model: "claude-opus-4-7" },
      atlas: {
        committed: true,
        path: ".contextatlas/atlas.json",
        localCache: ".contextatlas/index.db",
      },
    });
  });

  it("accepts a full config and honors every override", () => {
    const cfg = loadConfig(FIXTURE_DIR, "full.yml");
    expect(cfg).toEqual({
      version: 1,
      languages: ["typescript", "python"],
      adrs: {
        path: "docs/adr",
        format: "markdown-frontmatter",
        symbolField: "symbols",
      },
      docs: { include: ["README.md", "docs/**/*.md", "CONTRIBUTING.md"] },
      git: { recentCommits: 10 },
      index: { model: "claude-opus-4-7" },
      atlas: {
        committed: false,
        path: ".atlas/atlas.json",
        localCache: ".atlas/cache.db",
      },
    });
  });
});

describe("loadConfig — error cases", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "contextatlas-cfg-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeCfg(contents: string, filename = ".contextatlas.yml"): string {
    const p = pathJoin(tmp, filename);
    writeFileSync(p, contents, "utf8");
    return p;
  }

  it("missing config file — clear error with absolute path and remediation", () => {
    const err = captureError(() => loadConfig(tmp));
    expect(err.message).toMatch(/not found/);
    expect(err.message).toContain(pathJoin(tmp, ".contextatlas.yml"));
    expect(err.message).toMatch(/Create a \.contextatlas\.yml/);
  });

  it("every thrown error includes the resolved config path", () => {
    const p = writeCfg("version: 1\nlanguages: bogus\nadrs: { path: x }");
    const err = captureError(() => loadConfig(tmp));
    expect(err.message).toContain(p);
  });

  it("malformed YAML — wraps with path and line/column", () => {
    const p = writeCfg("version: 1\nlanguages: [typescript\nadrs:\n  path: x");
    const err = captureError(() => loadConfig(tmp));
    expect(err.message).toContain(p);
    expect(err.message).toMatch(/Invalid YAML/);
    expect(err.message).toMatch(/line \d+/);
  });

  it("non-mapping root — rejects scalars and arrays", () => {
    writeCfg("just-a-string");
    expect(() => loadConfig(tmp)).toThrow(/must be a YAML mapping/);

    writeCfg("- one\n- two");
    expect(() => loadConfig(tmp)).toThrow(/must be a YAML mapping/);
  });

  it("missing 'version' — names the field and suggests the fix", () => {
    writeCfg("languages: [typescript]\nadrs: { path: docs/adr/ }");
    expect(() => loadConfig(tmp)).toThrow(/version/);
    expect(() => loadConfig(tmp)).toThrow(/Add 'version: 1'/);
  });

  it("unknown future version — actionable upgrade message", () => {
    writeCfg("version: 2\nlanguages: [typescript]\nadrs: { path: x }");
    expect(() => loadConfig(tmp)).toThrow(
      /targets version 2 but this tool reads version 1/,
    );
  });

  it("version as string — typed error, not silently coerced", () => {
    writeCfg(
      'version: "1"\nlanguages: [typescript]\nadrs: { path: docs/adr/ }',
    );
    expect(() => loadConfig(tmp)).toThrow(/expected integer 1/);
  });

  it("unknown top-level key — names it and lists valid keys", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: x }\nbogus: 5",
    );
    const err = captureError(() => loadConfig(tmp));
    expect(err.message).toMatch(/Unknown key 'bogus'/);
    expect(err.message).toMatch(/Valid keys at this level/);
    expect(err.message).toContain("adrs");
  });

  it("unknown nested key — names it with the dotted path", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs:\n  path: x\n  bogus: 1",
    );
    expect(() => loadConfig(tmp)).toThrow(/Unknown key 'adrs\.bogus'/);
  });

  it("missing 'languages' — lists valid values as remediation", () => {
    writeCfg("version: 1\nadrs: { path: x }");
    expect(() => loadConfig(tmp)).toThrow(
      /Missing required field 'languages'.*typescript, python, go/,
    );
  });

  it("empty 'languages' — rejects with remediation", () => {
    writeCfg("version: 1\nlanguages: []\nadrs: { path: x }");
    expect(() => loadConfig(tmp)).toThrow(
      /must not be empty.*typescript, python, go/,
    );
  });

  it("unknown language — rejects with 'lowercase identifiers' hint", () => {
    writeCfg(
      "version: 1\nlanguages: [TypeScript]\nadrs: { path: docs/adr }",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Unknown language 'TypeScript'.*lowercase language identifiers/,
    );
  });

  it("missing 'adrs' — names the section", () => {
    writeCfg("version: 1\nlanguages: [typescript]");
    expect(() => loadConfig(tmp)).toThrow(
      /Missing required section 'adrs'.*adrs\.path/,
    );
  });

  it("adrs present but empty — demands adrs.path", () => {
    writeCfg("version: 1\nlanguages: [typescript]\nadrs: {}");
    expect(() => loadConfig(tmp)).toThrow(
      /Missing required field 'adrs\.path'/,
    );
  });

  it("wrong type for scalar field — clear message", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr }\n" +
        "git: { recent_commits: -2 }",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Invalid 'git\.recent_commits': expected non-negative integer/,
    );
  });

  it("wrong type for boolean — does not silently coerce", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr }\n" +
        "atlas: { committed: 'yes' }",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Invalid 'atlas\.committed': expected boolean/,
    );
  });
});

describe("loadConfig — defaults + path normalization", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "contextatlas-cfg-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("atlas section entirely missing — defaults applied", () => {
    writeFileSync(
      pathJoin(tmp, ".contextatlas.yml"),
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr }",
      "utf8",
    );
    const cfg = loadConfig(tmp);
    expect(cfg.atlas).toEqual({
      committed: true,
      path: ".contextatlas/atlas.json",
      localCache: ".contextatlas/index.db",
    });
  });

  it("relative paths are normalized through normalizePath", () => {
    writeFileSync(
      pathJoin(tmp, ".contextatlas.yml"),
      "version: 1\n" +
        "languages: [typescript]\n" +
        "adrs:\n  path: ./docs\\adr\\\n" +
        "atlas:\n" +
        "  path: .\\.contextatlas\\atlas.json\n" +
        "  local_cache: .\\.contextatlas\\index.db\n",
      "utf8",
    );
    const cfg = loadConfig(tmp);
    expect(cfg.adrs.path).toBe("docs/adr");
    expect(cfg.atlas.path).toBe(".contextatlas/atlas.json");
    expect(cfg.atlas.localCache).toBe(".contextatlas/index.db");
  });

  it("resolves a symlink target transparently", () => {
    const targetDir = pathJoin(tmp, "real");
    const targetPath = pathJoin(targetDir, "config.yml");
    const linkPath = pathJoin(tmp, ".contextatlas.yml");
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(
      targetPath,
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n",
      "utf8",
    );
    try {
      symlinkSync(targetPath, linkPath, "file");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "ENOSYS") {
        // Windows without Developer Mode can't create symlinks as a
        // non-admin user. Skipping is preferable to failing — the
        // symlink path is handled by the OS, not our code, so there
        // is nothing we could verify differently anyway.
        return;
      }
      throw err;
    }
    const cfg = loadConfig(tmp);
    expect(cfg.languages).toEqual(["typescript"]);
    expect(cfg.adrs.path).toBe("docs/adr");
  });
});

describe("loadConfig — source block (ADR-08 runtime)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "contextatlas-cfg-src-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeCfg(contents: string): void {
    writeFileSync(pathJoin(tmp, ".contextatlas.yml"), contents, "utf8");
  }

  it("source block absent → cfg.source is undefined (backward compat)", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }",
    );
    const cfg = loadConfig(tmp);
    expect(cfg.source).toBeUndefined();
  });

  it("source block with root → parsed and normalized", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "source:\n  root: repos/hono/",
    );
    const cfg = loadConfig(tmp);
    expect(cfg.source).toEqual({ root: "repos/hono" });
  });

  it("source.root with backslashes → normalized to forward slashes", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "source:\n  root: repos\\\\hono\\\\",
    );
    const cfg = loadConfig(tmp);
    expect(cfg.source?.root).toBe("repos/hono");
  });

  it("source block with no root → clear error naming the field", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: x }\nsource: {}",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Missing or invalid 'source\.root': expected non-empty string/,
    );
  });

  it("source.root empty string → rejected", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: x }\n" +
        "source:\n  root: ''",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Missing or invalid 'source\.root'/,
    );
  });

  it("source.root wrong type → rejected", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: x }\n" +
        "source:\n  root: 42",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Missing or invalid 'source\.root'/,
    );
  });

  it("source with unknown sub-key → rejected (strict per ADR-05)", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: x }\n" +
        "source:\n  root: repos/hono\n  mode: fast",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Unknown key 'source\.mode'.*Valid keys at this level: root/,
    );
  });

  it("source as non-object → rejected with actionable type error", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: x }\n" +
        "source: just-a-string",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Invalid 'source': expected object with 'root' field/,
    );
  });

  // ---------------------------------------------------------------
  // extraction section (v0.2 Stream A #2)
  // ---------------------------------------------------------------

  it("extraction.budget_warn_usd as number → parses to camelCase field", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "extraction:\n  budget_warn_usd: 5.25\n",
    );
    const cfg = loadConfig(tmp);
    expect(cfg.extraction).toEqual({ budgetWarnUsd: 5.25 });
  });

  it("extraction section absent → cfg.extraction is undefined", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n",
    );
    const cfg = loadConfig(tmp);
    expect(cfg.extraction).toBeUndefined();
  });

  it("extraction section empty → cfg.extraction is undefined (no zombie record)", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "extraction: {}\n",
    );
    const cfg = loadConfig(tmp);
    expect(cfg.extraction).toBeUndefined();
  });

  it("extraction.budget_warn_usd zero → accepted (warn-on-any-cost)", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "extraction:\n  budget_warn_usd: 0\n",
    );
    expect(loadConfig(tmp).extraction).toEqual({ budgetWarnUsd: 0 });
  });

  it("extraction.budget_warn_usd negative → rejected", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "extraction:\n  budget_warn_usd: -1\n",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Invalid 'extraction\.budget_warn_usd': expected non-negative number/,
    );
  });

  it("extraction.budget_warn_usd as string → rejected", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "extraction:\n  budget_warn_usd: five\n",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Invalid 'extraction\.budget_warn_usd'/,
    );
  });

  it("unknown key under extraction → rejected with actionable error", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "extraction:\n  bogus: 1\n",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Unknown key 'extraction\.bogus'.*Valid keys at this level: budget_warn_usd, narrow_attribution/,
    );
  });

  it("extraction as non-object → rejected with type error", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "extraction: just-a-string\n",
    );
    expect(() => loadConfig(tmp)).toThrow(/Invalid 'extraction'/);
  });

  // ---------------------------------------------------------------
  // extraction.narrow_attribution (v0.3 Theme 1.2 Fix 2)
  // ---------------------------------------------------------------

  it("extraction.narrow_attribution = 'drop' → parses to camelCase field", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "extraction:\n  narrow_attribution: drop\n",
    );
    expect(loadConfig(tmp).extraction).toEqual({ narrowAttribution: "drop" });
  });

  it("extraction.narrow_attribution = 'drop-with-fallback' → parses", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "extraction:\n  narrow_attribution: drop-with-fallback\n",
    );
    expect(loadConfig(tmp).extraction).toEqual({
      narrowAttribution: "drop-with-fallback",
    });
  });

  it("extraction.narrow_attribution invalid string → rejected with actionable error", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "extraction:\n  narrow_attribution: full\n",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Invalid 'extraction\.narrow_attribution'.*'drop' or 'drop-with-fallback'/,
    );
  });

  it("extraction.narrow_attribution non-string (e.g. boolean) → rejected", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "extraction:\n  narrow_attribution: true\n",
    );
    expect(() => loadConfig(tmp)).toThrow(
      /Invalid 'extraction\.narrow_attribution'/,
    );
  });

  it("extraction with both budget_warn_usd and narrow_attribution → both parse", () => {
    writeCfg(
      "version: 1\nlanguages: [typescript]\nadrs: { path: docs/adr/ }\n" +
        "extraction:\n  budget_warn_usd: 1.50\n  narrow_attribution: drop\n",
    );
    expect(loadConfig(tmp).extraction).toEqual({
      budgetWarnUsd: 1.5,
      narrowAttribution: "drop",
    });
  });
});

function captureError(fn: () => unknown): Error {
  try {
    fn();
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected function to throw but it returned normally");
}
