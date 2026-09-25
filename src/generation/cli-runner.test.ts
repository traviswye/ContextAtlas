import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runGenerateAdrsSubcommand } from "./cli-runner.js";
import type { Generator, GeneratorContext, GenerationResult } from "./generator.js";

/**
 * Retrying rm: the runner spawns tsserver, and on Windows it can keep
 * a handle on the tmp dir for a moment after shutdown (EBUSY).
 */
const RM_RETRY = {
  recursive: true,
  force: true,
  maxRetries: 10,
  retryDelay: 100,
} as const;

/**
 * Step 2.2.a.2 generate-adrs CLI runner tests. Skeleton-era tests
 * upgraded to exercise the full generator surface with confirmation
 * seam injection. End-to-end tests against live Anthropic API are
 * out of scope; tests stop at the confirmation/setup-error boundary.
 */
describe("runGenerateAdrsSubcommand (Step 2.2.a.2 full implementation)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "ca-gen-runner-"));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(tmpRoot, RM_RETRY);
  });

  async function writeMinimalConfig(): Promise<void> {
    await mkdir(path.join(tmpRoot, "docs", "adr"), { recursive: true });
    await mkdir(path.join(tmpRoot, ".contextatlas"), { recursive: true });
    await writeFile(
      path.join(tmpRoot, ".contextatlas.yml"),
      "version: 1\nlanguages:\n  - typescript\nadrs:\n  path: docs/adr/\n  format: markdown-frontmatter\ndocs:\n  include:\n    - README.md\natlas:\n  committed: true\n  path: .contextatlas/atlas.json\n  local_cache: .contextatlas/index.db\n",
      "utf8",
    );
  }

  it("returns exit code 2 when config is missing", async () => {
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => "sk-ant-test-key",
      writeStderr: () => {},
    });
    expect(result.exitCode).toBe(2);
  });

  it("returns exit code 2 when ANTHROPIC_API_KEY is missing (GenerationSetupError)", async () => {
    await writeMinimalConfig();
    let stderrOutput = "";
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => undefined,
      writeStderr: (c) => {
        stderrOutput += c;
      },
    });
    expect(result.exitCode).toBe(2);
    expect(stderrOutput).toContain("ANTHROPIC_API_KEY");
  });

  it("returns exit code 0 when user declines confirmation (graceful abort)", async () => {
    await writeMinimalConfig();
    let stderrOutput = "";
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => "sk-ant-test-key",
      confirmProceed: async () => false,
      writeStderr: (c) => {
        stderrOutput += c;
      },
    });
    expect(result.exitCode).toBe(0);
    expect(stderrOutput).toContain("aborted by user");
  });

  it("propagates --yes / skipConfirmation flag to generator context", async () => {
    // With skipConfirmation: true the generator goes straight to the
    // API call without invoking the confirmation prompt. Global fetch
    // is stubbed with a 401 so the test is hermetic (no network, no
    // spend) and the exit code is deterministic.
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: unknown) => {
      requests.push(String(input));
      return new Response(
        JSON.stringify({
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    });
    await writeMinimalConfig();
    let stderrOutput = "";
    // confirmProceed deliberately throws — if runner invokes it
    // despite skipConfirmation, this surfaces as a failure.
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => "sk-ant-test-key-bogus",
      skipConfirmation: true,
      confirmProceed: async () => {
        throw new Error("confirmProceed should not be called when skipConfirmation is true");
      },
      writeStderr: (c) => {
        stderrOutput += c;
      },
    });
    // The stubbed 401 → SDK AuthenticationError → mapped to
    // GenerationSetupError → exit code 2 (ADR-12 setup failure).
    // Reaching the API at all proves the prompt was skipped: a
    // throwing confirmProceed would have ended the run before it.
    expect(result.exitCode).toBe(2);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatch(/\/v1\/messages$/);
    expect(stderrOutput).not.toContain("aborted by user");
  });
});

/**
 * v0.7 Step 2.4.a β-1 + β-2 tests — CLI substrate-equivalence with
 * Skill substrate at API-parameter + mechanical-floor-enforcement
 * layers per Travis Lock 1.
 */

const CANONICAL_ADR_BODY = `---
id: ADR-01
title: Canonical depth-floor example
status: accepted
severity: hard
symbols:
  - foo
  - bar
---

# ADR-01: Canonical depth-floor example

## Context

This is a substantive Context paragraph establishing the problem
space, naming the constraints, and citing \`src/foo.ts:bar\` at line
42 as a load-bearing implementation reference. The decision must
preserve invariants visible at \`src/baz.ts:Quux\` per existing
patterns. The problem space has three forces shaping the chosen
mechanism.

The second paragraph extends the context with stakes-establishing
prose covering downstream consequences. If this decision is wrong,
\`src/consumer.ts:run\` breaks silently, which is why we surface the
rationale in detail below. The stakes are substantively load-bearing
for the entire downstream call path.

## Decision

The canonical approach: use the substrate at \`src/foo.ts:bar\` and
honor the invariant.

\`\`\`ts
function bar(x: string): void {
  // canonical pattern
}
\`\`\`

## Rationale

Alternatives considered:

- **First alternative approach**: explains what it would have required and why it was rejected for substantive engineering reasons documented above.
- **Second alternative approach**: explains what it would have required and why it was rejected for substantive engineering reasons documented above.

Supporting rationale:

- Reason one about the decision.
- Reason two about preserving invariants.
- Reason three about downstream value.

## Consequences

- Named failure mode one: code at \`src/foo.ts:bar\` that bypasses the
  invariant produces silent bugs.
- Named failure mode two: any consumer that assumes the legacy form
  is broken; review-time red flag for PR diffs touching this path.
- Review invariant: do not allow direct write to the slot outside
  the canonical constructor.
`;

/**
 * β-1 (CLI thinking-layer equivalence with the Skill's `effort: xhigh`)
 * re-expressed at v1.2 for SDK 0.128.0 + claude-opus-4-7: adaptive
 * thinking + output_config.effort "xhigh" on a streaming call.
 * `thinking.type: "enabled"` + budget_tokens returns a 400 on Opus 4.7.
 */
describe("Step 2.4.a β-1 source content assertions (adaptive thinking, effort xhigh, streaming)", () => {
  // Body of the `anthropic.messages.stream({...}).finalMessage()` call,
  // whitespace-tolerant around the `.stream(` / `.finalMessage()` chain.
  const STREAM_CALL =
    /anthropic\.messages\s*\.stream\(([\s\S]*?)\)\s*\.finalMessage\(\)/m;

  async function readGeneratorSource(): Promise<string> {
    return readFile(
      path.join(__dirname, "generators", "anthropic-api-direct.ts"),
      "utf8",
    );
  }

  it("anthropic-api-direct.ts calls messages.stream(...).finalMessage()", async () => {
    const source = await readGeneratorSource();
    expect(source).toMatch(/anthropic\.messages\s*\.stream\(/);
    expect(STREAM_CALL.exec(source)).not.toBeNull();
    // Non-streaming create() with 64k max_tokens is refused client-side
    // by SDK 0.128.0 (>10 min expected duration).
    expect(source).not.toMatch(/anthropic\.messages\s*\.create\(/);
  });

  it("the stream call carries adaptive thinking + effort xhigh and no budget_tokens", async () => {
    const source = await readGeneratorSource();
    const match = STREAM_CALL.exec(source);
    expect(match).not.toBeNull();
    const callBody = match![1]!;
    expect(callBody).toContain('thinking: { type: "adaptive" }');
    expect(callBody).toContain('output_config: { effort: "xhigh" }');
    expect(callBody).toContain("model: GENERATION_MODEL");
    expect(callBody).toContain("max_tokens: GENERATION_MAX_TOKENS");
    expect(callBody).not.toContain("budget_tokens");
    expect(callBody).not.toContain('type: "enabled"');
    expect(callBody).not.toContain("temperature");
    // No type cast on the params (SDK 0.128.0 types them natively).
    expect(callBody).not.toMatch(/\bas\s+Anthropic\./);
  });
});

describe("Step 2.4.a β-2 auto-invoke validate-adrs post-generation", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "ca-gen-runner-b2-"));
    await mkdir(path.join(tmpRoot, "docs", "adr"), { recursive: true });
    await mkdir(path.join(tmpRoot, ".contextatlas"), { recursive: true });
    await writeFile(
      path.join(tmpRoot, ".contextatlas.yml"),
      "version: 1\nlanguages:\n  - typescript\nadrs:\n  path: docs/adr/\n  format: markdown-frontmatter\ndocs:\n  include:\n    - README.md\natlas:\n  committed: true\n  path: .contextatlas/atlas.json\n  local_cache: .contextatlas/index.db\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(tmpRoot, RM_RETRY);
  });

  function noopGenerator(): Generator {
    return {
      costModel: "api" as const,
      async generate(_ctx: GeneratorContext): Promise<GenerationResult> {
        return {
          filesGenerated: 1,
          costUsd: 0.01,
          apiCalls: 1,
          inputTokens: 100,
          outputTokens: 50,
          wallClockMs: 1,
          costModel: "api",
        };
      },
    };
  }

  it("PASS path: generator succeeds + validate-adrs passes → exit 0", async () => {
    // Pre-write a canonical-depth-floor-passing ADR; noop generator
    // skips actual write but ADR is in place for validate-adrs read.
    await writeFile(
      path.join(tmpRoot, "docs", "adr", "ADR-01-canonical.md"),
      CANONICAL_ADR_BODY,
      "utf8",
    );
    let stdoutOutput = "";
    let stderrOutput = "";
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => "sk-ant-test-key",
      skipConfirmation: true,
      generatorOverride: noopGenerator(),
      writeStdout: (c) => {
        stdoutOutput += c;
      },
      writeStderr: (c) => {
        stderrOutput += c;
      },
    });
    expect(result.exitCode).toBe(0);
    // validate-adrs PASS message appears on stdout
    expect(stdoutOutput).toMatch(
      /validate-adrs:.*conform to canonical depth-floor/i,
    );
    // No remediation template surfaced on stderr
    expect(stderrOutput).not.toContain("Canonical CLI cohort paths forward");
  });

  it("FAIL path: generator succeeds + validate-adrs fails → exit 1 + remediation template", async () => {
    // Pre-write a shallow ADR that fails validate-adrs (missing
    // alternatives, single Context paragraph, no code block, etc.)
    await writeFile(
      path.join(tmpRoot, "docs", "adr", "ADR-99-shallow.md"),
      `---
title: Shallow
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
`,
      "utf8",
    );
    let stderrOutput = "";
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => "sk-ant-test-key",
      skipConfirmation: true,
      generatorOverride: noopGenerator(),
      writeStderr: (c) => {
        stderrOutput += c;
      },
    });
    expect(result.exitCode).toBe(1);
    // Per-ADR remediation surfaces from validate-adrs orchestrator
    expect(stderrOutput).toContain("ADR-99-shallow.md");
    // Refined remediation template surfaces from cli-runner
    expect(stderrOutput).toContain("Canonical CLI cohort paths forward");
    expect(stderrOutput).toContain("Manually edit failing ADRs");
    expect(stderrOutput).toContain("remove docs/adr/ and re-run");
    // Manual-rm guidance reflects FO-11 status (no --overwrite flag)
    expect(stderrOutput).toContain("v0.8+ candidate");
  });

  it("setup-error path: generator throws GenerationSetupError → exit 2 → validate-adrs NOT invoked", async () => {
    // Generator throws before validate-adrs would run; verify no
    // validate-adrs PASS/FAIL message surfaces in stderr.
    let stderrOutput = "";
    const result = await runGenerateAdrsSubcommand({
      configRoot: tmpRoot,
      configFile: null,
      contextatlasVersion: "0.0.1-test",
      readEnv: () => undefined, // missing API key
      skipConfirmation: true,
      writeStderr: (c) => {
        stderrOutput += c;
      },
    });
    expect(result.exitCode).toBe(2);
    // validate-adrs PASS/FAIL message should NOT appear
    expect(stderrOutput).not.toContain("conform to canonical depth-floor");
    expect(stderrOutput).not.toContain("Canonical CLI cohort paths forward");
  });
});

describe("Step 2.4.a β-2 source content assertions (validate-adrs auto-invoke)", () => {
  it("cli-runner.ts imports runValidateAdrsSubcommand", async () => {
    const source = await readFile(
      path.join(__dirname, "cli-runner.ts"),
      "utf8",
    );
    expect(source).toContain(
      'import { runValidateAdrsSubcommand } from "./cli-validate-adrs.js"',
    );
  });

  it("cli-runner.ts invokes runValidateAdrsSubcommand after generator.generate", async () => {
    const source = await readFile(
      path.join(__dirname, "cli-runner.ts"),
      "utf8",
    );
    expect(source).toContain("runValidateAdrsSubcommand({");
    expect(source).toContain("Canonical CLI cohort paths forward");
  });
});
