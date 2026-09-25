/**
 * Wrapper around the Anthropic SDK for extraction calls.
 *
 * Per ADR-02, this module is the ONLY place in the codebase permitted
 * to call the Anthropic API. Query-time code paths must not import
 * from `@anthropic-ai/sdk`.
 *
 * Responsibilities:
 *   - Call Opus 4.7 with the pre-drafted extraction prompt from
 *     `src/extraction/prompt.ts` (no extended thinking, per ADR-02
 *     and prompt.ts documentation)
 *   - Classify errors into retry / fail-loud per the matrix in
 *     CLAUDE.md's step 5 failure handling section
 *   - Retry with exponential backoff on retryable errors
 *   - Parse and validate the model's JSON response against
 *     ExtractionResult
 *
 * Retry ownership: this wrapper is the single retry layer. Every
 * request goes out with the SDK per-request option `{ maxRetries: 0 }`
 * so the SDK's built-in retries (default 2) never stack underneath the
 * wrapper's `maxRetries` — including for a client constructed
 * elsewhere with SDK defaults (the benchmarks repo passes its own).
 * Classification + backoff live in `./retry-policy.ts`.
 */

import type Anthropic from "@anthropic-ai/sdk";

import { log } from "../mcp/logger.js";

import {
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_MODEL,
  EXTRACTION_PROMPT,
  type ExtractedClaim,
  type ExtractionResult,
} from "./prompt.js";
import { ZERO_USAGE, type UsageInfo } from "./pricing.js";
import {
  classifyApiError,
  computeBackoffMs,
  type RetryClassification,
} from "./retry-policy.js";

export type { RetryClassification };

/**
 * Canonical reasons a ParseError can surface. Each reason is
 * deterministic per (LLM output, validation logic) — same input is
 * expected to produce the same failure on retry, so the classifier
 * routes ParseError to "fail" without retry per A1 v0.8 absorption.
 */
export type ParseErrorReason =
  | "json-parse"
  | "shape-invalid"
  | "claims-not-array";

/**
 * Typed exception for LLM-output-shape failures distinct from
 * Anthropic-API failures. Per A1 v0.8 absorption + research/v0.5-
 * candidates.md #1: prior catch-all logging conflated parse-vs-API
 * failures during v0.4 Step 5 httpx 24-error investigation; cohort
 * users at v1.0 launch get substantively distinguishable error
 * messages enabling self-diagnosis (parse failure → recheck LLM
 * output shape; API failure → retry with backoff).
 */
export class ParseError extends Error {
  readonly reason: ParseErrorReason;
  readonly preview: string;
  /**
   * Token usage of the response that failed to parse (v1.2 Phase 2
   * review fix). The call was billed even though its output was
   * unusable, so callers add this to their cost accounting. Zero when
   * the error was constructed without a response.
   */
  readonly usage: UsageInfo;

  constructor(
    reason: ParseErrorReason,
    preview: string,
    message: string,
    usage: UsageInfo = ZERO_USAGE,
  ) {
    super(message);
    this.name = "ParseError";
    this.reason = reason;
    this.preview = preview;
    this.usage = usage;
  }
}

/**
 * Usage of a call that threw: a {@link ParseError}'s response usage, or
 * zero for any other error (a thrown API error has no response to read).
 */
export function usageOfFailedCall(err: unknown): UsageInfo {
  return err instanceof ParseError ? err.usage : ZERO_USAGE;
}

/**
 * Classify an error as retryable or not. Exported for direct unit
 * testing — the retry-loop tests exercise the wrapper end-to-end with
 * stub clients, but this pure predicate carries the core logic.
 *
 * Retry: 429, 408, 409, 5xx (incl. 529), connection errors/timeouts.
 * Fail: ParseError, 400/401/403/404/422 and other statuses, and
 * anything that is not an Anthropic API error. An explicit
 * `x-should-retry` response header overrides the status rules (as in
 * the SDK). Errors from another copy of the SDK are classified by
 * shape (see `./retry-policy.ts`).
 */
export function classifyError(err: unknown): RetryClassification {
  // ParseError → fail (deterministic; same input → same parse failure
  // per A1 v0.8 absorption; no retry would substantively help).
  if (err instanceof ParseError) return "fail";
  return classifyApiError(err);
}

/**
 * Outcome of a single `extract()` call.
 *
 * - `result` — parsed claims, or `null` if the document was skippable
 *   (max-tokens stop, or a response with no text block). Malformed
 *   JSON is not returned here: it throws a {@link ParseError} (v0.8
 *   A1), which carries the response's usage.
 * - `usage` — token counts from the final successful API response.
 *   Always present when `extract` resolves (even with `result: null`,
 *   the call consumed tokens). Retries that threw before we saw a
 *   response are NOT reflected here — those are invisible to us.
 *   Throwing paths (retry-exhausted, non-retryable errors) never
 *   reach this return shape.
 */
export interface ExtractionCallResult {
  result: ExtractionResult | null;
  usage: UsageInfo;
}

export interface ExtractionClient {
  /**
   * Run the extraction prompt against a single document body. Returns
   * parsed and validated claims plus token usage. Throws on
   * irrecoverable failure.
   *
   * A `null` `result` signals the document was skippable (max-tokens
   * stop or no text block) — the caller decides whether to log and
   * move on. `usage` is still populated in that case because the API
   * call did consume tokens. Output that is not the expected JSON
   * throws a {@link ParseError} whose `usage` holds the call's tokens;
   * callers treat it as an unparseable result, not an API failure.
   */
  extract(documentBody: string): Promise<ExtractionCallResult>;
}

export interface CreateExtractionClientOptions {
  /**
   * SDK client (or a structurally compatible one). Its own retry
   * setting is overridden per request with `maxRetries: 0`; retries
   * are governed solely by `maxRetries` below.
   */
  anthropic: Anthropic;
  /** Max retry attempts for retryable errors. Default: 3. */
  maxRetries?: number;
  /** Base backoff in ms. Doubles per attempt, capped at maxBackoffMs. Default: 1000. */
  baseBackoffMs?: number;
  /** Upper bound per backoff step. Default: 30_000. */
  maxBackoffMs?: number;
  /** For tests — inject a fake sleep. Default: real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

export function createExtractionClient(
  options: CreateExtractionClientOptions,
): ExtractionClient {
  const {
    anthropic,
    maxRetries = 3,
    baseBackoffMs = 1_000,
    maxBackoffMs = 30_000,
    sleep = defaultSleep,
  } = options;

  return {
    async extract(documentBody: string): Promise<ExtractionCallResult> {
      const prompt = EXTRACTION_PROMPT + documentBody + "\n---\n";
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          // NOTE per ADR-02 / prompt.ts: no `thinking` parameter.
          // Request body is frozen substrate; the second argument is
          // a client-side SDK option (not sent on the wire) that
          // disables SDK-internal retries — see module JSDoc.
          const response = await anthropic.messages.create(
            {
              model: EXTRACTION_MODEL,
              max_tokens: EXTRACTION_MAX_TOKENS,
              messages: [{ role: "user", content: prompt }],
            },
            { maxRetries: 0 },
          );

          const usage = readUsage(response);

          if (response.stop_reason === "max_tokens") {
            log.warn("extraction: max_tokens hit; skipping document", {
              modelStopReason: response.stop_reason,
            });
            return { result: null, usage };
          }

          const text = extractText(response);
          if (text === null) return { result: null, usage };

          const parsed = parseAndValidate(text, usage);
          return { result: parsed, usage };
        } catch (err) {
          const classification = classifyError(err);
          if (classification === "fail") throw err;
          attempt++;
          if (attempt > maxRetries) {
            log.error("extraction: retry budget exhausted", {
              attempts: attempt,
              err: String(err),
            });
            throw err;
          }
          const backoff = computeBackoffMs(
            attempt,
            baseBackoffMs,
            maxBackoffMs,
            err,
          );
          log.warn("extraction: retryable error; backing off", {
            attempt,
            backoffMs: backoff,
            err: String(err),
          });
          await sleep(backoff);
        }
      }
    },
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read `input_tokens` and `output_tokens` from an Anthropic SDK
 * response. The SDK's typed shape guarantees usage on successful
 * responses; this helper normalizes to the internal `UsageInfo`
 * shape and defends against mock/test shapes that might omit it.
 */
function readUsage(response: {
  usage?: { input_tokens?: number; output_tokens?: number };
}): UsageInfo {
  const u = response.usage;
  if (!u) return ZERO_USAGE;
  return {
    inputTokens: typeof u.input_tokens === "number" ? u.input_tokens : 0,
    outputTokens: typeof u.output_tokens === "number" ? u.output_tokens : 0,
  };
}

/**
 * Pull the text content from a messages.create response. Returns null
 * if the response has no usable text block.
 */
function extractText(response: {
  content: Array<{ type: string; text?: string }>;
}): string | null {
  for (const block of response.content) {
    if (block.type === "text" && typeof block.text === "string") {
      return block.text.trim();
    }
  }
  return null;
}

function parseAndValidate(text: string, usage: UsageInfo): ExtractionResult {
  const preview = text.slice(0, 200);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    log.warn("extraction: model returned malformed JSON", { preview });
    throw new ParseError(
      "json-parse",
      preview,
      "Model returned malformed JSON; same input is expected to produce the same parse failure deterministically (no retry).",
      usage,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    log.warn("extraction: JSON root is not an object", { preview });
    throw new ParseError(
      "shape-invalid",
      preview,
      "JSON root is not an object (expected { claims: [...] }).",
      usage,
    );
  }

  const claims = (parsed as { claims?: unknown }).claims;
  if (!Array.isArray(claims)) {
    log.warn("extraction: 'claims' field missing or not an array", {
      preview,
    });
    throw new ParseError(
      "claims-not-array",
      preview,
      "'claims' field missing or not an array (expected an array of claim objects).",
      usage,
    );
  }

  const out: ExtractedClaim[] = [];
  for (const raw of claims) {
    if (!isValidClaim(raw)) {
      log.warn("extraction: dropping malformed claim entry");
      continue;
    }
    out.push(raw);
  }
  return { claims: out };
}

function isValidClaim(v: unknown): v is ExtractedClaim {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  if (
    !Array.isArray(c.symbol_candidates) ||
    !c.symbol_candidates.every((s) => typeof s === "string")
  )
    return false;
  if (typeof c.claim !== "string") return false;
  if (c.severity !== "hard" && c.severity !== "soft" && c.severity !== "context")
    return false;
  if (typeof c.rationale !== "string") return false;
  if (typeof c.excerpt !== "string") return false;
  return true;
}
