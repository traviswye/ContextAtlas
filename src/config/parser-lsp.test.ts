import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadConfig } from "./parser.js";

/**
 * FO-6 (β) diagnostic substrate 2b — configurable
 * `lsp.initialize_timeout_ms` config field (v0.7 Step 2.2.d).
 */
describe("loadConfig lsp.initialize_timeout_ms parsing (v0.7 Step 2.2.d FO-6 β 2b)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "config-lsp-"));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  async function writeConfig(yaml: string): Promise<void> {
    await writeFile(path.join(tmpRoot, ".contextatlas.yml"), yaml, "utf8");
  }

  const BASE_YAML = `version: 1
languages:
  - python
adrs:
  path: docs/adr/
  format: markdown-frontmatter
docs:
  include:
    - README.md
atlas:
  committed: true
  path: .contextatlas/atlas.json
  local_cache: .contextatlas/index.db
`;

  it("config.lsp undefined when section absent", async () => {
    await writeConfig(BASE_YAML);
    const config = loadConfig(tmpRoot);
    expect(config.lsp).toBeUndefined();
  });

  it("parses valid lsp.initialize_timeout_ms integer", async () => {
    await writeConfig(`${BASE_YAML}lsp:
  initialize_timeout_ms: 60000
`);
    const config = loadConfig(tmpRoot);
    expect(config.lsp).toEqual({ initializeTimeoutMs: 60000 });
  });

  it("rejects non-integer initialize_timeout_ms", async () => {
    await writeConfig(`${BASE_YAML}lsp:
  initialize_timeout_ms: "thirty seconds"
`);
    expect(() => loadConfig(tmpRoot)).toThrow(
      /Invalid 'lsp.initialize_timeout_ms'/,
    );
  });

  it("rejects negative initialize_timeout_ms", async () => {
    await writeConfig(`${BASE_YAML}lsp:
  initialize_timeout_ms: -5000
`);
    expect(() => loadConfig(tmpRoot)).toThrow(
      /Invalid 'lsp.initialize_timeout_ms'/,
    );
  });

  it("rejects too-small initialize_timeout_ms (< 1000ms)", async () => {
    await writeConfig(`${BASE_YAML}lsp:
  initialize_timeout_ms: 500
`);
    expect(() => loadConfig(tmpRoot)).toThrow(
      /Invalid 'lsp.initialize_timeout_ms'/,
    );
  });

  it("rejects too-large initialize_timeout_ms (> 600000ms)", async () => {
    await writeConfig(`${BASE_YAML}lsp:
  initialize_timeout_ms: 600001
`);
    expect(() => loadConfig(tmpRoot)).toThrow(
      /Invalid 'lsp.initialize_timeout_ms'/,
    );
  });

  it("rejects non-object lsp section", async () => {
    await writeConfig(`${BASE_YAML}lsp: "not an object"
`);
    expect(() => loadConfig(tmpRoot)).toThrow(/Invalid 'lsp' section/);
  });

  it("config.lsp undefined when lsp object is empty (no fields)", async () => {
    await writeConfig(`${BASE_YAML}lsp: {}
`);
    const config = loadConfig(tmpRoot);
    expect(config.lsp).toBeUndefined();
  });
});
