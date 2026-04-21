import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  computeFileSha,
  diffShas,
  walkProseFiles,
  walkSourceFiles,
  type ProseFile,
} from "./file-walker.js";

describe("computeFileSha", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-fw-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("produces stable sha256 hex for same content", () => {
    const p = pathJoin(tmp, "a.md");
    writeFileSync(p, "hello world");
    const first = computeFileSha(p);
    const second = computeFileSha(p);
    expect(first).toBe(second);
    // sha256("hello world") is well-known
    expect(first).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );
  });

  it("different content → different sha", () => {
    const p = pathJoin(tmp, "a.md");
    writeFileSync(p, "a");
    const sa = computeFileSha(p);
    writeFileSync(p, "b");
    const sb = computeFileSha(p);
    expect(sa).not.toBe(sb);
  });
});

describe("diffShas", () => {
  const f = (relPath: string, sha: string): ProseFile => ({
    absPath: `/irrelevant/${relPath}`,
    relPath,
    sha,
    bucket: "adr",
  });

  it("classifies unchanged / changed / added / deleted", () => {
    const current = [f("a.md", "sha-a"), f("b.md", "sha-b-new"), f("c.md", "sha-c")];
    const committed = { "a.md": "sha-a", "b.md": "sha-b-old", "d.md": "sha-d" };
    const diff = diffShas(current, committed);
    expect(diff.unchanged.map((x) => x.relPath)).toEqual(["a.md"]);
    expect(diff.changed.map((x) => x.relPath)).toEqual(["b.md"]);
    expect(diff.added.map((x) => x.relPath)).toEqual(["c.md"]);
    expect(diff.deleted).toEqual(["d.md"]);
  });

  it("empty committed baseline → everything is added", () => {
    const current = [f("a.md", "sa"), f("b.md", "sb")];
    const diff = diffShas(current, {});
    expect(diff.added).toHaveLength(2);
    expect(diff.changed).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(0);
    expect(diff.deleted).toEqual([]);
  });
});

describe("walkProseFiles", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-fw-"));
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(tmp, "docs", "design"), { recursive: true });
    writeFileSync(pathJoin(tmp, "README.md"), "# readme");
    writeFileSync(pathJoin(tmp, "CONTRIBUTING.md"), "# contrib");
    writeFileSync(pathJoin(tmp, "docs", "adr", "ADR-01.md"), "adr body 1");
    writeFileSync(pathJoin(tmp, "docs", "adr", "ADR-02.md"), "adr body 2");
    writeFileSync(pathJoin(tmp, "docs", "design", "overview.md"), "design");
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("picks up ADRs, README, and glob-matched docs", () => {
    const files = walkProseFiles(tmp, {
      adrs: { path: "docs/adr", format: "markdown-frontmatter" },
      docs: { include: ["README.md", "CONTRIBUTING.md", "docs/**/*.md"] },
    });
    const paths = files.map((f) => f.relPath).sort();
    expect(paths).toEqual([
      "CONTRIBUTING.md",
      "README.md",
      "docs/adr/ADR-01.md",
      "docs/adr/ADR-02.md",
      "docs/design/overview.md",
    ]);
  });

  it("ADR bucket wins when a path matches both adrs.path and docs.include", () => {
    // docs/**/*.md matches the ADRs too. Expect them in the "adr" bucket.
    const files = walkProseFiles(tmp, {
      adrs: { path: "docs/adr", format: "markdown-frontmatter" },
      docs: { include: ["docs/**/*.md"] },
    });
    const adr1 = files.find((f) => f.relPath === "docs/adr/ADR-01.md");
    expect(adr1?.bucket).toBe("adr");
    const design = files.find((f) => f.relPath === "docs/design/overview.md");
    expect(design?.bucket).toBe("doc");
  });

  it("missing adrs.path directory is tolerated (empty corpus supported)", () => {
    const files = walkProseFiles(tmp, {
      adrs: { path: "nope/does/not/exist", format: "markdown-frontmatter" },
      docs: { include: ["README.md"] },
    });
    expect(files.map((f) => f.relPath)).toEqual(["README.md"]);
  });

  it("computes SHA for each file and returns paths in deterministic order", () => {
    const files = walkProseFiles(tmp, {
      adrs: { path: "docs/adr", format: "markdown-frontmatter" },
      docs: { include: [] },
    });
    for (const f of files) {
      expect(f.sha).toMatch(/^[a-f0-9]{64}$/);
    }
    const relPaths = files.map((f) => f.relPath);
    expect(relPaths).toEqual([...relPaths].sort());
  });
});

describe("walkSourceFiles", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-fw-"));
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    mkdirSync(pathJoin(tmp, "node_modules", "x"), { recursive: true });
    mkdirSync(pathJoin(tmp, "dist"), { recursive: true });
    writeFileSync(pathJoin(tmp, "src", "a.ts"), "export const a = 1;");
    writeFileSync(pathJoin(tmp, "src", "b.tsx"), "export const b = 2;");
    writeFileSync(pathJoin(tmp, "src", "c.js"), "// not ts");
    writeFileSync(pathJoin(tmp, "node_modules", "x", "y.ts"), "skip me");
    writeFileSync(pathJoin(tmp, "dist", "z.ts"), "skip me too");
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("filters by extension and excludes node_modules / dist", () => {
    const files = walkSourceFiles(tmp, [".ts", ".tsx"]);
    expect(files.map((f) => f.relPath).sort()).toEqual(["src/a.ts", "src/b.tsx"]);
  });
});
