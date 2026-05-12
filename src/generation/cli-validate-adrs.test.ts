/**
 * Tests for `contextatlas validate-adrs` CLI subcommand + the
 * underlying `validateAdrShape` per-ADR checker (v0.7 Step 2.3.c.0).
 *
 * Covers each canonical depth-floor invariant in isolation + the
 * subcommand orchestrator end-to-end against a tmp ADR directory.
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

import {
  runValidateAdrsSubcommand,
  validateAdrShape,
} from "./cli-validate-adrs.js";

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

/**
 * A canonical depth-floor-passing ADR for fixture / contrast.
 */
const CANONICAL_ADR = `---
id: ADR-01
title: Configuration is a single flat YAML file
status: accepted
severity: hard
symbols:
  - ContextAtlasConfig
  - contextatlas.yml
---

# ADR-01: Configuration is a single flat YAML file

## Context

Configuration surface is where MVP projects either stay focused or get
dragged into scope creep. Every "just one more config option" adds
parsing complexity, documentation burden, and user confusion. Every
inheritance chain doubles the mental model.

ContextAtlas's config needs are limited: language list, ADR path, doc
globs, git settings, extraction model, atlas sync options. Roughly
seven top-level sections. Deliberately compact. The decision must
preserve simplicity without precluding future evolution paths like
\`src/config/parser.ts:loadConfig\` extensions.

## Decision

Configuration lives in a single \`.contextatlas.yml\` file at the
repo root. Schema is documented in \`src/types.ts:ContextAtlasConfig\`
and validated at \`src/config/parser.ts:loadConfig\`.

\`\`\`yaml
version: 1
languages: [typescript, python]
adrs:
  path: docs/adr/
\`\`\`

## Rationale

Alternatives considered:

- **Inheritance chains (extends parent config)**: doubles the mental model when debugging what config is active; introduces parsing complexity for the include-resolution algorithm; rejected for compact-by-default discipline.
- **JSON instead of YAML**: less ergonomic for dev-tool config files; YAML is the standard for dev-tool config (GitHub Actions, Docker, Kubernetes); rejected for ecosystem fit.
- **TOML alternative considered**: less familiar to JS/TS dev audience; rejected for the same ecosystem-fit reason as JSON.

The single-file approach is greppable, copyable, reviewable in a single PR.

## Consequences

- Monorepo users with multiple distinct projects need multiple configs (one per project root). This is accepted; the per-project granularity is correct.
- Adding a new config field is a deliberate decision — bumps the \`version\` field at \`src/types.ts:ContextAtlasConfig\`, documented in DESIGN.md.
- The \`version: 1\` field at the top of the config is the migration handle for future breaking changes. Treat it as sacred — any code that bypasses this version check is broken.
`;

function captureStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
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

describe("validateAdrShape (per-ADR canonical depth-floor checks)", () => {
  it("PASS on canonical ADR with all invariants met", () => {
    const errors = validateAdrShape(CANONICAL_ADR);
    expect(errors).toEqual([]);
  });

  it("FAIL on missing frontmatter", () => {
    const noFrontmatter = CANONICAL_ADR.split("---\n").slice(2).join("---\n");
    const errors = validateAdrShape(noFrontmatter);
    expect(errors.some((e) => e.includes("Frontmatter missing"))).toBe(true);
  });

  it("FAIL on missing canonical sections (e.g., Rationale)", () => {
    const noRationale = CANONICAL_ADR.replace(/## Rationale[\s\S]*?(?=## )/, "");
    const errors = validateAdrShape(noRationale);
    expect(errors.some((e) => e.includes('## Rationale"'))).toBe(true);
  });

  it("FAIL when fewer than 2 symbol-with-line-number citations", () => {
    // Strip both inline citation forms; canonical has rich citations
    const stripped = CANONICAL_ADR.replace(/`[^`]+\.(ts|py|yaml|md):[^`]+`/g, "[stripped]");
    const errors = validateAdrShape(stripped);
    expect(
      errors.some((e) =>
        e.includes("symbol-with-line-number citation"),
      ),
    ).toBe(true);
  });

  it("FAIL on alternatives-considered enumeration with too few alternatives", () => {
    // Replace alternatives block with keyword-only (no substantive items)
    const oneAlt = CANONICAL_ADR.replace(
      /Alternatives considered:[\s\S]*?(?=The single-file)/,
      "Alternatives considered: none worth detailed enumeration.\n\n",
    );
    const errors = validateAdrShape(oneAlt);
    expect(
      errors.some((e) => e.includes("named alternative")),
    ).toBe(true);
  });

  it("FAIL on missing alternatives section entirely", () => {
    const noAlts = CANONICAL_ADR.replace(/Alternatives considered:[\s\S]*?(?=The single-file)/, "");
    const errors = validateAdrShape(noAlts);
    expect(
      errors.some((e) => e.includes("alternatives-considered enumeration")),
    ).toBe(true);
  });

  it("FAIL on no fenced code blocks", () => {
    const noCode = CANONICAL_ADR.replace(/```[\s\S]*?```/g, "[code stripped]");
    const errors = validateAdrShape(noCode);
    expect(errors.some((e) => e.includes("fenced code block"))).toBe(true);
  });

  it("FAIL when Rationale has fewer than 3 distinct items", () => {
    // Replace Rationale section with one-bullet body
    const shallowRat = CANONICAL_ADR.replace(
      /## Rationale\n[\s\S]*?(?=\n## )/,
      "## Rationale\n\nSimple is good.\n",
    );
    const errors = validateAdrShape(shallowRat);
    expect(errors.some((e) => e.includes("Rationale section"))).toBe(true);
  });

  it("FAIL when Consequences has fewer than 3 distinct items", () => {
    const shallowCons = CANONICAL_ADR.replace(
      /## Consequences[\s\S]*$/,
      "## Consequences\n\nUsers should be aware of this.\n",
    );
    const errors = validateAdrShape(shallowCons);
    expect(errors.some((e) => e.includes("Consequences section"))).toBe(true);
  });

  it("FAIL when Context section has fewer than 2 substantive paragraphs", () => {
    const shallowContext = CANONICAL_ADR.replace(
      /## Context\n[\s\S]*?(?=\n## )/,
      "## Context\n\nWe need configuration.\n",
    );
    const errors = validateAdrShape(shallowContext);
    expect(errors.some((e) => e.includes("Context section"))).toBe(true);
  });

  it("FAIL with split-suggestion when line count exceeds ceiling (600)", () => {
    // Build a 700-line ADR by padding the body
    const fluffLines = Array(700).fill("Some padding line here.").join("\n");
    const bloated = `${CANONICAL_ADR}\n\n${fluffLines}\n`;
    const errors = validateAdrShape(bloated);
    expect(
      errors.some(
        (e) =>
          e.includes("exceeds") &&
          e.includes("split") &&
          e.includes("ceiling"),
      ),
    ).toBe(true);
  });

  it("PASS on ADR right at the ceiling (599 lines)", () => {
    // Pad CANONICAL_ADR to just under ceiling; depth invariants intact
    const baseLines = CANONICAL_ADR.split("\n").length;
    const padCount = Math.max(0, 599 - baseLines - 1);
    const padding = Array(padCount).fill("Filler comment line.").join("\n");
    // Tuck padding inside Consequences without breaking structure
    const padded = CANONICAL_ADR.replace(
      /## Consequences\n/,
      `## Consequences\n\n${padding}\n`,
    );
    const errors = validateAdrShape(padded);
    expect(
      errors.some((e) => e.includes("exceeds") && e.includes("ceiling")),
    ).toBe(false);
  });
});

describe("runValidateAdrsSubcommand (orchestrator)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-validate-adrs-"));
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    writeFileSync(pathJoin(tmp, ".contextatlas.yml"), MINIMAL_CONFIG);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("exits 2 when no ADR files in docs/adr/", async () => {
    const cap = captureStreams();
    const result = await runValidateAdrsSubcommand({
      configRoot: tmp,
      configFile: null,
      ...cap,
    });
    expect(result.exitCode).toBe(2);
    expect(cap.joinedStderr()).toContain("no ADR files found");
    expect(result.adrsValidated).toBe(0);
  });

  it("exits 0 when all ADRs conform to canonical depth-floor", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01-canonical.md"),
      CANONICAL_ADR,
    );
    const cap = captureStreams();
    const result = await runValidateAdrsSubcommand({
      configRoot: tmp,
      configFile: null,
      ...cap,
    });
    expect(result.exitCode).toBe(0);
    expect(cap.joinedStdout()).toContain("conform to canonical");
    expect(result.adrsValidated).toBe(1);
    expect(result.errorsByFile).toEqual({});
  });

  it("exits 2 with per-ADR remediation when shallow ADR present", async () => {
    const shallowAdr = `---
title: Shallow ADR
severity: hard
symbols:
  - foo
---

# ADR-99: Shallow

## Context

Brief.

## Decision

Do it.

## Rationale

Good.

## Consequences

Done.
`;
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01-canonical.md"),
      CANONICAL_ADR,
    );
    writeFileSync(pathJoin(tmp, "docs", "adr", "ADR-99-shallow.md"), shallowAdr);
    const cap = captureStreams();
    const result = await runValidateAdrsSubcommand({
      configRoot: tmp,
      configFile: null,
      ...cap,
    });
    expect(result.exitCode).toBe(2);
    expect(result.adrsValidated).toBe(2);
    expect(Object.keys(result.errorsByFile)).toContain(
      "docs/adr/ADR-99-shallow.md",
    );
    expect(Object.keys(result.errorsByFile)).not.toContain(
      "docs/adr/ADR-01-canonical.md",
    );
    expect(cap.joinedStderr()).toContain("ADR-99-shallow.md");
    expect(cap.joinedStderr()).toContain("symbol-with-line-number");
  });

  it("includes remediation pointer to generate-adrs prompt + canonical ADRs", async () => {
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-99-shallow.md"),
      `---
title: x
severity: hard
symbols:
  - x
---

# X

## Context

x

## Decision

x

## Rationale

x

## Consequences

x
`,
    );
    const cap = captureStreams();
    const result = await runValidateAdrsSubcommand({
      configRoot: tmp,
      configFile: null,
      ...cap,
    });
    expect(result.exitCode).toBe(2);
    expect(cap.joinedStderr()).toContain(
      ".contextatlas/prompts/generate-adrs.md",
    );
  });
});
