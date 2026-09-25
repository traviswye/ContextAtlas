import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  LanguageAdapter,
  LanguageCode,
  Symbol as AtlasSymbol,
} from "../types.js";

import {
  runListExtractionSourcesSubcommand,
  toCommitSource,
  type ExtractionSourcesManifest,
} from "./cli-list-extraction-sources.js";

// ---------------------------------------------------------------------------
// Test fixture — minimal typescript repo with one ADR + one source file
// ---------------------------------------------------------------------------

interface Fixture {
  readonly root: string;
  readonly cleanup: () => Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), "ca-list-sources-"));
  await mkdir(path.join(root, "docs", "adr"), { recursive: true });
  await mkdir(path.join(root, "atlases", "test"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });

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
    "  path: atlases/test/atlas.json",
    "  local_cache: atlases/test/index.db",
    "",
  ].join("\n");
  await writeFile(path.join(root, ".contextatlas.yml"), config);

  const adrContent = [
    "---",
    "id: ADR-01",
    "title: Test ADR",
    "status: accepted",
    "severity: hard",
    "symbols: [Foo]",
    "---",
    "",
    "# ADR-01: Test ADR",
    "",
    "## Context",
    "",
    "Substantive context paragraph.",
    "",
    "## Decision",
    "",
    "Substantive decision.",
    "",
  ].join("\n");
  await writeFile(
    path.join(root, "docs", "adr", "ADR-01-test.md"),
    adrContent,
  );

  // Minimal source file (no docstrings; expect empty docstring stream
  // in manifest since adapter init may fail on synthetic fixture).
  await writeFile(
    path.join(root, "src", "foo.ts"),
    "export const foo = 1;\n",
  );

  return {
    root,
    // Retrying rm: on Windows the tsserver subprocess can keep a
    // handle on the tmp dir for a moment after shutdown (EBUSY).
    cleanup: () =>
      rm(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runListExtractionSourcesSubcommand", () => {
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

  it("emits valid JSON manifest with canonical shape on success", async () => {
    const result = await runListExtractionSourcesSubcommand({
      configRoot: fixture.root,
      configFile: null,
      writeStdout: (c) => (stdout += c),
      writeStderr: (c) => (stderr += c),
    });

    // Adapter init may fail on synthetic fixture without LSP server; exit 2
    // is acceptable in that case. The contract under test: when the
    // subcommand DOES succeed, manifest shape conforms to schema.
    if (result.exitCode === 2) {
      // Verify failure path emitted actionable stderr
      expect(stderr).toMatch(/list-extraction-sources/);
      return;
    }

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(stdout) as ExtractionSourcesManifest;
    expect(manifest.manifest_version).toBe("1");
    expect(manifest.generated_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    expect(manifest.sources.adrs).toBeInstanceOf(Array);
    expect(manifest.sources.docstrings).toBeInstanceOf(Array);
    expect(manifest.sources.commits).toBeInstanceOf(Array);
    expect(manifest.summary.adr_count).toBe(manifest.sources.adrs.length);
    expect(manifest.summary.symbols_with_docstrings).toBe(
      manifest.sources.docstrings.length,
    );
    expect(manifest.summary.filtered_commits).toBe(
      manifest.sources.commits.length,
    );
  });

  it("includes ADR content + sha + path in per-ADR manifest entries", async () => {
    const result = await runListExtractionSourcesSubcommand({
      configRoot: fixture.root,
      configFile: null,
      writeStdout: (c) => (stdout += c),
      writeStderr: (c) => (stderr += c),
    });
    if (result.exitCode === 2) return; // skip when adapter init fails on fixture

    const manifest = JSON.parse(stdout) as ExtractionSourcesManifest;
    expect(manifest.sources.adrs.length).toBeGreaterThan(0);
    const adr = manifest.sources.adrs[0]!;
    expect(adr.source_type).toBe("adr");
    expect(adr.path).toMatch(/ADR-01-test\.md$/);
    expect(adr.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(adr.content).toContain("# ADR-01");
    expect(adr.content).toContain("## Context");
  });

  it("exits 2 with actionable stderr when config missing", async () => {
    // Use a path that exists but has no .contextatlas.yml
    const emptyRoot = await mkdtemp(path.join(tmpdir(), "ca-list-empty-"));
    try {
      const result = await runListExtractionSourcesSubcommand({
        configRoot: emptyRoot,
        configFile: null,
        writeStdout: (c) => (stdout += c),
        writeStderr: (c) => (stderr += c),
      });
      expect(result.exitCode).toBe(2);
      expect(stderr).toContain("list-extraction-sources");
      expect(stderr).toContain("failed to load config");
    } finally {
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });

  it("writes manifest to file when --output path provided", async () => {
    const outPath = "manifest.json";
    const result = await runListExtractionSourcesSubcommand({
      configRoot: fixture.root,
      configFile: null,
      outputPath: outPath,
      writeStdout: (c) => (stdout += c),
      writeStderr: (c) => (stderr += c),
    });
    if (result.exitCode === 2) return; // skip when adapter init fails on fixture

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("wrote manifest to");
    const manifestJson = await readFile(
      path.join(fixture.root, outPath),
      "utf8",
    );
    const manifest = JSON.parse(manifestJson) as ExtractionSourcesManifest;
    expect(manifest.manifest_version).toBe("1");
  });

  it("commit entries carry the canonical `commit:<sha>` source_key (F-5)", async () => {
    const git = (args: string[]): string => {
      const r = spawnSync(
        "git",
        ["-c", "commit.gpgsign=false", ...args],
        {
          cwd: fixture.root,
          encoding: "utf8",
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: "Tester",
            GIT_AUTHOR_EMAIL: "tester@example.com",
            GIT_COMMITTER_NAME: "Tester",
            GIT_COMMITTER_EMAIL: "tester@example.com",
          },
        },
      );
      if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    };
    git(["init", "-q"]);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "design: introduce Foo"]);
    const sha = git(["rev-parse", "HEAD"]);

    const result = await runListExtractionSourcesSubcommand({
      configRoot: fixture.root,
      configFile: null,
      writeStdout: (c) => (stdout += c),
      writeStderr: (c) => (stderr += c),
    });
    if (result.exitCode === 2) return; // skip when adapter init fails on fixture

    const manifest = JSON.parse(stdout) as ExtractionSourcesManifest;
    expect(manifest.manifest_version).toBe("1");
    expect(manifest.sources.commits).toHaveLength(1);
    expect(manifest.sources.commits[0]!.sha).toBe(sha);
    expect(manifest.sources.commits[0]!.source_key).toBe(`commit:${sha}`);
  });
});

describe("toCommitSource", () => {
  it("builds a manifest entry with the pre-built body and the canonical source_key", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    expect(
      toCommitSource({
        sha,
        date: "2026-09-25T00:00:00Z",
        author: "Tester",
        subject: "design: split the router",
        body: "Why it matters.",
      }),
    ).toEqual({
      source_type: "commit",
      sha,
      subject: "design: split the router",
      body: "Why it matters.",
      author: "Tester",
      date: "2026-09-25T00:00:00Z",
      extraction_body: "design: split the router\n\nWhy it matters.",
      source_key: `commit:${sha}`,
    });
  });
});

// ---------------------------------------------------------------------------
// extraction.streams (v1.2 Phase 2, lead decision L-12 iii)
// ---------------------------------------------------------------------------

/**
 * Fake TS adapter: one exported symbol `Foo` in src/foo.ts with a
 * docstring. Records whether it was initialized, so a test can prove the
 * LSP walk is skipped when the docstring stream is off.
 */
function fakeAdapter(root: string): {
  adapter: LanguageAdapter;
  calls: { initialize: number; listSymbols: number };
} {
  const calls = { initialize: 0, listSymbols: 0 };
  const foo: AtlasSymbol = {
    id: "sym:ts:src/foo.ts:Foo",
    name: "Foo",
    kind: "class",
    path: "src/foo.ts",
    line: 1,
    language: "typescript",
  };
  const adapter: LanguageAdapter = {
    language: "typescript",
    extensions: [".ts"],
    async initialize() {
      calls.initialize += 1;
    },
    async shutdown() {},
    async listSymbols(p: string) {
      calls.listSymbols += 1;
      const rel = path.relative(root, p).split(path.sep).join("/");
      return rel === "src/foo.ts" ? [foo] : [];
    },
    async getSymbolDetails() {
      return null;
    },
    async findReferences() {
      return [];
    },
    async getDiagnostics() {
      return [];
    },
    async getTypeInfo() {
      return { extends: [], implements: [], usedByTypes: [] };
    },
    async getDocstring(id: string) {
      return id === foo.id ? "Foo routes every request." : null;
    },
  };
  return { adapter, calls };
}

function gitCommitAll(root: string, subject: string): void {
  const run = (args: string[]): void => {
    const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Tester",
        GIT_AUTHOR_EMAIL: "tester@example.com",
        GIT_COMMITTER_NAME: "Tester",
        GIT_COMMITTER_EMAIL: "tester@example.com",
      },
    });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  };
  run(["init", "-q"]);
  run(["add", "-A"]);
  run(["commit", "-q", "-m", subject]);
}

async function writeStreamsConfig(
  root: string,
  streams: readonly string[] | null,
): Promise<void> {
  const lines = [
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
    "  path: atlases/test/atlas.json",
    "  local_cache: atlases/test/index.db",
  ];
  if (streams !== null) {
    lines.push("extraction:", `  streams: [${streams.join(", ")}]`);
  }
  await writeFile(path.join(root, ".contextatlas.yml"), lines.join("\n") + "\n");
}

describe("runListExtractionSourcesSubcommand — extraction.streams", () => {
  let fixture: Fixture;
  let stdout: string;
  let stderr: string;

  beforeEach(async () => {
    fixture = await makeFixture();
    stdout = "";
    stderr = "";
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  async function run(
    fake: ReturnType<typeof fakeAdapter>,
    outputPath: string | null = null,
  ) {
    return runListExtractionSourcesSubcommand({
      configRoot: fixture.root,
      configFile: null,
      outputPath,
      writeStdout: (c) => (stdout += c),
      writeStderr: (c) => (stderr += c),
      createAdapterOverride: (lang: LanguageCode) => {
        expect(lang).toBe("typescript");
        return fake.adapter;
      },
    });
  }

  it("walks all three streams when the key is absent (disabled_streams: [])", async () => {
    gitCommitAll(fixture.root, "design: introduce Foo");
    const fake = fakeAdapter(fixture.root);

    const result = await run(fake);

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(stdout) as ExtractionSourcesManifest;
    expect(manifest.sources.adrs).toHaveLength(1);
    expect(manifest.sources.docstrings.map((d) => d.symbol_id)).toEqual([
      "sym:ts:src/foo.ts:Foo",
    ]);
    expect(manifest.sources.commits).toHaveLength(1);
    expect(manifest.summary.disabled_streams).toEqual([]);
    expect(manifest.manifest_version).toBe("1");
    expect(stderr).not.toMatch(/manifest_version/);
    expect(fake.calls.initialize).toBe(1);
  });

  it("a getDocstring failure omits the whole file, so the Skill keeps its baseline claims and key (review fix)", async () => {
    await mkdir(path.join(fixture.root, "src"), { recursive: true });
    await writeFile(path.join(fixture.root, "src", "two.ts"), "export class A {}\nexport class B {}\n");
    const A: AtlasSymbol = {
      id: "sym:ts:src/two.ts:A",
      name: "A",
      kind: "class",
      path: "src/two.ts",
      line: 1,
      language: "typescript",
    };
    const B: AtlasSymbol = { ...A, id: "sym:ts:src/two.ts:B", name: "B", line: 2 };
    const fake = fakeAdapter(fixture.root);
    const base = fake.adapter;
    const adapter: LanguageAdapter = {
      ...base,
      async listSymbols(p: string) {
        const rel = path.relative(fixture.root, p).split(path.sep).join("/");
        return rel === "src/two.ts" ? [A, B] : base.listSymbols(p);
      },
      async getDocstring(id: string) {
        if (id === A.id) return "A doc.";
        if (id === B.id) throw new Error("LSP request 'textDocument/hover' timed out");
        return base.getDocstring(id);
      },
    };

    const result = await runListExtractionSourcesSubcommand({
      configRoot: fixture.root,
      configFile: null,
      writeStdout: (c) => (stdout += c),
      writeStderr: (c) => (stderr += c),
      createAdapterOverride: () => adapter,
    });

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(stdout) as ExtractionSourcesManifest;
    // A's entry is withheld too: listing A alone would make the Skill
    // replace the file's claims without B's and pin the new SHA.
    expect(manifest.sources.docstrings.map((d) => d.source_path)).not.toContain("src/two.ts");
    expect(manifest.sources.docstrings.map((d) => d.symbol_id)).toEqual([
      "sym:ts:src/foo.ts:Foo",
    ]);
    expect(manifest.summary.symbols_with_docstrings).toBe(1);
  });

  it("emits empty docstring and commit arrays when only adr is enabled, without starting the LSP walk", async () => {
    await writeStreamsConfig(fixture.root, ["adr"]);
    gitCommitAll(fixture.root, "design: introduce Foo");
    const fake = fakeAdapter(fixture.root);

    const result = await run(fake);

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(stdout) as ExtractionSourcesManifest;
    // "2" whenever a stream is disabled (review fix): an /index-atlas
    // copy from before v1.2 reads empty arrays as deleted sources, and
    // stops on any version but "1" instead.
    expect(manifest.manifest_version).toBe("2");
    expect(stderr).toMatch(/manifest_version "2"/);
    expect(stderr).toMatch(/extraction\.skills_fresh/);
    expect(manifest.sources.adrs).toHaveLength(1);
    expect(manifest.sources.docstrings).toEqual([]);
    expect(manifest.sources.commits).toEqual([]);
    expect(manifest.summary).toEqual({
      adr_count: 1,
      symbols_with_docstrings: 0,
      filtered_commits: 0,
      disabled_streams: ["docstring", "commit"],
    });
    expect(fake.calls.initialize).toBe(0);
    expect(fake.calls.listSymbols).toBe(0);
  });

  it("keeps the commit stream when only docstring is disabled", async () => {
    await writeStreamsConfig(fixture.root, ["commit", "adr"]);
    gitCommitAll(fixture.root, "design: introduce Foo");
    const fake = fakeAdapter(fixture.root);

    const result = await run(fake);

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(stdout) as ExtractionSourcesManifest;
    expect(manifest.sources.docstrings).toEqual([]);
    expect(manifest.sources.commits).toHaveLength(1);
    expect(manifest.summary.disabled_streams).toEqual(["docstring"]);
  });

  it("keeps the docstring stream when only commit is disabled", async () => {
    await writeStreamsConfig(fixture.root, ["adr", "docstring"]);
    gitCommitAll(fixture.root, "design: introduce Foo");
    const fake = fakeAdapter(fixture.root);

    const result = await run(fake);

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(stdout) as ExtractionSourcesManifest;
    expect(manifest.sources.docstrings).toHaveLength(1);
    expect(manifest.sources.commits).toEqual([]);
    expect(manifest.summary.disabled_streams).toEqual(["commit"]);
  });

  it("names the disabled streams in the --output summary line", async () => {
    await writeStreamsConfig(fixture.root, ["adr"]);
    const fake = fakeAdapter(fixture.root);

    const result = await run(fake, "manifest.json");

    expect(result.exitCode).toBe(0);
    expect(stdout).toMatch(
      /\(1 ADRs, 0 symbols-with-docstrings, 0 filtered commits; disabled by extraction\.streams: docstring, commit\)\n$/,
    );
  });

  it("leaves the --output summary line unchanged when every stream is enabled", async () => {
    const fake = fakeAdapter(fixture.root);

    const result = await run(fake, "manifest.json");

    expect(result.exitCode).toBe(0);
    expect(stdout).toMatch(
      /\(1 ADRs, 1 symbols-with-docstrings, 0 filtered commits\)\n$/,
    );
    expect(stdout).not.toContain("disabled");
  });
});
