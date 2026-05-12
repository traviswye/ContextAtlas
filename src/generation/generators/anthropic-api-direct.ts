/**
 * AnthropicAPIDirectGenerator — Mode B full implementation per v0.7
 * Step 2.2.a.2 substantive interpretive content surface.
 *
 * Locks applied:
 *   - Lock 1: γ user-configurable reference-context scope + soft-
 *     warning at 500k tokens + attempt-anyway (per
 *     `REFERENCE_CONTEXT_TOKEN_WARNING_THRESHOLD` from prompt.ts).
 *   - Lock 2: atomic single-API-call generation; user re-runs from
 *     scratch on failure (no checkpointed resume at v0.7).
 *   - Lock 3: two-phase cost reporting — pre-flight estimate
 *     (printed to stderr; confirmation via `confirmProceed` seam
 *     unless `skipConfirmation` is true) + post-flight actual cost
 *     (from API response usage data).
 *   - Lock 4: Claude API context-window-exceeded behavior is
 *     surfaced as actionable error via the Anthropic SDK error
 *     classification path (BadRequestError → user-facing message
 *     with remediation guidance).
 *
 * Refinements 1-3 are baked into GENERATE_ADRS_PROMPT (prompt.ts);
 * this generator just assembles the prompt input + calls the API +
 * writes the output. Refinement 7 is in SKILL.md (Skills surface;
 * unrelated to this CLI path).
 *
 * Architectural rationale (orchestration-here vs orchestration-in-
 * runner): the CLI runner manages config + adapter lifecycle + db
 * setup + result printing; the Generator owns build-input +
 * estimate + confirm + API call + write-output as a cohesive
 * substantive unit. Mirrors AnthropicAPIDirectExtractor — Strategy
 * boundary is per-cycle, not per-substep.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  APIConnectionError,
  APIError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk/error.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { log } from "../../mcp/logger.js";

import { buildCodebaseInventory } from "../codebase-walker.js";
import {
  buildCostEstimate,
  estimateTokens,
  formatCostEstimateMessage,
} from "../cost-estimator.js";
import {
  GenerationSetupError,
  type Generator,
  type GenerationResult,
  type GeneratorContext,
} from "../generator.js";
import {
  GENERATE_ADRS_PROMPT,
  GENERATION_MAX_TOKENS,
  GENERATION_MODEL,
  OPUS_INPUT_PRICE_PER_MILLION_USD,
  OPUS_OUTPUT_PRICE_PER_MILLION_USD,
  REFERENCE_CONTEXT_TOKEN_WARNING_THRESHOLD,
} from "../prompt.js";
import { buildReferenceContext } from "../reference-context-walker.js";

interface RawAdrEntry {
  number: number;
  title: string;
  symbols: string[];
  severity_summary: "hard" | "soft" | "context";
  markdown_body: string;
}

interface RawAdrResponse {
  adrs: RawAdrEntry[];
}

export class AnthropicAPIDirectGenerator implements Generator {
  readonly costModel = "api" as const;

  async generate(context: GeneratorContext): Promise<GenerationResult> {
    const writeStderr =
      context.writeStderr ?? ((chunk: string) => process.stderr.write(chunk));

    // ---------------------------------------------------------------
    // Setup phase — API key check maps to GenerationSetupError (exit
    // code 2 per ADR-12).
    // ---------------------------------------------------------------
    const apiKey = context.readEnv("ANTHROPIC_API_KEY");
    if (apiKey === undefined || apiKey.length === 0) {
      throw new GenerationSetupError(
        "ANTHROPIC_API_KEY is not set. Export it in your environment " +
          "before running `contextatlas generate-adrs`. Subscription-" +
          "bounded generation runs via `/generate-adrs` Claude Code " +
          "skill, not via CLI (per ADR-02 v0.7 Path-3 entry-point-" +
          "determined architecture). Skills implementation lands in a " +
          "future cycle; v0.7 ships CLI Mode B as primary surface.",
      );
    }

    // ---------------------------------------------------------------
    // Build prompt input (codebase inventory + optional reference
    // context). Token-count each section for pre-flight estimate +
    // soft-warning check.
    // ---------------------------------------------------------------
    const codebaseInventory = await buildCodebaseInventory({
      sourceRoot: context.sourceRoot,
      adapters: context.adapters,
      languages: context.config.languages,
      excludePatterns: context.config.extraction?.excludePattern,
    });
    const codebaseTokens = estimateTokens(codebaseInventory);

    let referenceContext = "";
    let referenceTokens = 0;
    if (context.referenceContextPath !== undefined) {
      referenceContext = buildReferenceContext({
        referenceContextPath: context.referenceContextPath,
      });
      referenceTokens = estimateTokens(referenceContext);
      if (referenceTokens > REFERENCE_CONTEXT_TOKEN_WARNING_THRESHOLD) {
        writeStderr(
          `[warn] Reference context at ${context.referenceContextPath} ` +
            `measured ~${Math.round(referenceTokens / 1000)}k tokens. This ` +
            `is substantial reference documentation; generation will use ` +
            `significant Claude context window ` +
            `(~${Math.round(referenceTokens / 1000)}k of 1M available). ` +
            `Proceeding...\n`,
        );
      }
    }

    const promptTokens = estimateTokens(GENERATE_ADRS_PROMPT);

    const estimate = buildCostEstimate({
      promptTokens,
      codebaseInventoryTokens: codebaseTokens,
      referenceContextTokens: referenceTokens,
    });

    writeStderr(
      `${formatCostEstimateMessage(
        estimate,
        {
          promptTokens,
          codebaseInventoryTokens: codebaseTokens,
          referenceContextTokens: referenceTokens,
        },
        context.referenceContextPath,
      )}\n`,
    );

    // ---------------------------------------------------------------
    // Confirmation phase (Lock 3). Bypassed when skipConfirmation is
    // true (CLI `--yes` flag OR Skills-surface invocation pattern).
    // ---------------------------------------------------------------
    if (context.skipConfirmation !== true) {
      const confirm = context.confirmProceed ?? defaultConfirmProceed;
      const proceed = await confirm();
      if (!proceed) {
        writeStderr("generate-adrs aborted by user.\n");
        return zeroResult(this.costModel);
      }
    }

    // ---------------------------------------------------------------
    // Anthropic API call (Lock 2 atomic — single call; user re-runs
    // on failure).
    // ---------------------------------------------------------------
    const fullPrompt = `${GENERATE_ADRS_PROMPT}${codebaseInventory}\n${
      referenceContext.length > 0 ? `\n${referenceContext}\n` : ""
    }`;

    const t0 = Date.now();
    const anthropic = new Anthropic({ apiKey });
    let response;
    try {
      // v0.7 Step 2.4.a β-1: extended thinking enabled per Travis
      // Lock 3 (32k budget; substantively similar to Skill
      // `effort: xhigh` adaptive reasoning per claude-code-guide
      // investigation). Closes API-parameter-equivalence with
      // Skill substrate at the thinking layer.
      //
      // v0.8 Step 4.1 empirical finding: SDK ^0.32.0 (LOCK E
      // target) does NOT type the `thinking` parameter — `grep
      // thinking node_modules/@anthropic-ai/sdk/**/*.d.ts`
      // returns zero matches at 0.32.x. The v0.7 assumption that
      // "thinking added in ~0.32+" did not match empirical
      // substrate state. Cast workaround retained at LOCK E
      // ^0.32.0 version target; thinking-native-typing migration
      // requires higher SDK version (TBD; v0.8+ candidate at
      // separate adjudication). Runtime API forwards the
      // parameter; thinking blocks in response are naturally
      // skipped by extractTextFromResponse (consumes only
      // type === "text" blocks).
      response = await anthropic.messages.create({
        model: GENERATION_MODEL,
        max_tokens: GENERATION_MAX_TOKENS,
        messages: [{ role: "user", content: fullPrompt }],
        thinking: { type: "enabled", budget_tokens: 32_000 },
      } as Anthropic.Messages.MessageCreateParamsNonStreaming);
    } catch (err) {
      throw mapAnthropicError(err);
    }
    const wallClockMs = Date.now() - t0;

    // ---------------------------------------------------------------
    // Parse + validate JSON output. Per Lock 2 atomic discipline,
    // malformed output fails the whole run; user re-runs.
    // ---------------------------------------------------------------
    const rawText = extractTextFromResponse(response);
    let parsed: RawAdrResponse;
    try {
      parsed = JSON.parse(rawText) as RawAdrResponse;
    } catch (err) {
      throw new Error(
        `generate-adrs: failed to parse JSON response from Anthropic API. ` +
          `Re-run the command (LLM output non-determinism may resolve on retry). ` +
          `First 200 chars of response: ${rawText.slice(0, 200)}. ` +
          `Parse error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!Array.isArray(parsed.adrs)) {
      throw new Error(
        `generate-adrs: response did not contain an 'adrs' array. ` +
          `Re-run the command. First 200 chars: ${rawText.slice(0, 200)}`,
      );
    }

    // ---------------------------------------------------------------
    // Write each ADR to docs/adr/ADR-NN-<slug>.md.
    // ---------------------------------------------------------------
    mkdirSync(context.outputAdrPath, { recursive: true });
    let filesGenerated = 0;
    for (const entry of parsed.adrs) {
      if (!isValidAdrEntry(entry)) {
        log.warn("generate-adrs: skipping malformed ADR entry", { entry });
        continue;
      }
      const slug = slugify(entry.title);
      const filename = `ADR-${String(entry.number).padStart(2, "0")}-${slug}.md`;
      const outputPath = pathResolve(context.outputAdrPath, filename);
      const frontmatter = renderFrontmatter(entry);
      const fileContent = `${frontmatter}${entry.markdown_body.trim()}\n`;
      writeFileSync(outputPath, fileContent, "utf8");
      filesGenerated += 1;
    }

    // ---------------------------------------------------------------
    // Post-flight cost reporting (Lock 3). Actual numbers from API
    // response usage. Cost computed at Opus 4.7 pricing constants.
    // ---------------------------------------------------------------
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd =
      (inputTokens / 1_000_000) * OPUS_INPUT_PRICE_PER_MILLION_USD +
      (outputTokens / 1_000_000) * OPUS_OUTPUT_PRICE_PER_MILLION_USD;

    writeStderr(
      [
        "generate-adrs complete.",
        `- Actual input tokens: ${inputTokens}`,
        `- Actual output tokens: ${outputTokens}`,
        `- Actual cost: $${costUsd.toFixed(2)}`,
        `- ADRs generated: ${filesGenerated}`,
        `- Written to: ${context.outputAdrPath}`,
        "",
      ].join("\n"),
    );

    return {
      filesGenerated,
      costUsd,
      apiCalls: 1,
      inputTokens,
      outputTokens,
      wallClockMs,
      costModel: this.costModel,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function zeroResult(
  costModel: "api" | "subscription-bounded",
): GenerationResult {
  return {
    filesGenerated: 0,
    costUsd: 0,
    apiCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    wallClockMs: 0,
    costModel,
  };
}

async function defaultConfirmProceed(): Promise<boolean> {
  // Read a single y/N line from stdin via readline. Imported lazily
  // so tests that inject `confirmProceed` never reach this path and
  // don't pull readline into the test runtime.
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  return new Promise<boolean>((resolve) => {
    rl.question("Proceed? [y/N]: ", (answer: string) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith("y"));
    });
  });
}

function extractTextFromResponse(
  response: Anthropic.Messages.Message,
): string {
  const parts: string[] = [];
  for (const block of response.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("").trim();
}

function isValidAdrEntry(entry: unknown): entry is RawAdrEntry {
  if (entry === null || typeof entry !== "object") return false;
  const e = entry as Partial<RawAdrEntry>;
  if (typeof e.number !== "number" || !Number.isInteger(e.number)) return false;
  if (typeof e.title !== "string" || e.title.length === 0) return false;
  if (
    typeof e.markdown_body !== "string" ||
    e.markdown_body.length === 0
  ) {
    return false;
  }
  if (!Array.isArray(e.symbols)) return false;
  for (const s of e.symbols) {
    if (typeof s !== "string") return false;
  }
  if (
    e.severity_summary !== "hard" &&
    e.severity_summary !== "soft" &&
    e.severity_summary !== "context"
  ) {
    return false;
  }
  return true;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function renderFrontmatter(entry: RawAdrEntry): string {
  const lines: string[] = ["---"];
  lines.push(`id: ADR-${String(entry.number).padStart(2, "0")}`);
  if (entry.symbols.length > 0) {
    lines.push("symbols:");
    for (const sym of entry.symbols) lines.push(`  - ${sym}`);
  }
  lines.push("---");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function mapAnthropicError(err: unknown): Error {
  if (
    err instanceof AuthenticationError ||
    err instanceof PermissionDeniedError
  ) {
    return new GenerationSetupError(
      `generate-adrs: Anthropic API authentication failed. ` +
        `Check your ANTHROPIC_API_KEY environment variable. ` +
        `Underlying error: ${err.message}`,
    );
  }
  if (err instanceof BadRequestError) {
    // Per Lock 4 empirical verification: context-window-exceeded
    // surfaces as a BadRequestError from the SDK with a message
    // mentioning the model limit. Surface with remediation guidance.
    return new Error(
      `generate-adrs: Anthropic API rejected the request as invalid. ` +
        `This typically means the assembled prompt + codebase + reference ` +
        `context exceeded the model's context window (1M tokens for ` +
        `Opus 4.7). Try narrowing --reference-context scope OR running ` +
        `against a smaller codebase. Underlying error: ${err.message}`,
    );
  }
  if (err instanceof RateLimitError) {
    return new Error(
      `generate-adrs: Anthropic API rate limit exceeded. Wait a moment ` +
        `and re-run the command. Underlying error: ${err.message}`,
    );
  }
  if (err instanceof APIConnectionError) {
    return new Error(
      `generate-adrs: Anthropic API connection failed. Check your ` +
        `network and re-run the command. Underlying error: ${err.message}`,
    );
  }
  if (err instanceof APIError) {
    return new Error(
      `generate-adrs: Anthropic API returned an error ` +
        `(status ${err.status}). ${err.message}`,
    );
  }
  return err instanceof Error
    ? err
    : new Error(`generate-adrs: unexpected error: ${String(err)}`);
}
