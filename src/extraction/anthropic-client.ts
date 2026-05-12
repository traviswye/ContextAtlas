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
 */

import type Anthropic from "@anthropic-ai/sdk";
import {
  APIConnectionError,
  APIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "@anthropic-ai/sdk/error.js";

import { log } from "../mcp/logger.js";

import {
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_MODEL,
  EXTRACTION_PROMPT,
  type ExtractedClaim,
  type ExtractionResult,
} from "./prompt.js";
import { ZERO_USAGE, type UsageInfo } from "./pricing.js";

export type RetryClassification = "retry" | "fail";

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

  constructor(reason: ParseErrorReason, preview: string, message: string) {
    super(message);
    this.name = "ParseError";
    this.reason = reason;
    this.preview = preview;
  }
}

/**
 * Classify an error as retryable or not. Exported for direct unit
 * testing — the retry-loop tests exercise the wrapper end-to-end with
 * stub clients, but this pure predicate carries the core logic.
 */
export function classifyError(err: unknown): RetryClassification {
  // ParseError → fail (deterministic; same input → same parse failure
  // per A1 v0.8 absorption; no retry would substantively help).
  if (err instanceof ParseError) return "fail";
  if (
    err instanceof AuthenticationError ||
    err instanceof PermissionDeniedError ||
    err instanceof BadRequestError ||
    err instanceof NotFoundError ||
    err instanceof UnprocessableEntityError
  ) {
    return "fail";
  }
  if (err instanceof RateLimitError) return "retry";
  if (err instanceof APIConnectionError) return "retry";
  if (err instanceof APIError) {
    return typeof err.status === "number" && err.status >= 500
      ? "retry"
      : "fail";
  }
  // Anything else (native Error, unknown, etc.) — fail.
  return "fail";
}

/**
 * Outcome of a single `extract()` call.
 *
 * - `result` — parsed claims, or `null` if the document was skippable
 *   (max-tokens stop or malformed JSON).
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
   * A `null` `result` signals the document was skippable (malformed
   * JSON or max-tokens stop) — the caller decides whether to log and
   * move on. `usage` is still populated in that case because the API
   * call did consume tokens.
   */
  extract(documentBody: string): Promise<ExtractionCallResult>;
}

export interface CreateExtractionClientOptions {
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
          const response = await anthropic.messages.create({
            model: EXTRACTION_MODEL,
            max_tokens: EXTRACTION_MAX_TOKENS,
            messages: [{ role: "user", content: prompt }],
          });

          const usage = readUsage(response);

          if (response.stop_reason === "max_tokens") {
            log.warn("extraction: max_tokens hit; skipping document", {
              modelStopReason: response.stop_reason,
            });
            return { result: null, usage };
          }

          const text = extractText(response);
          if (text === null) return { result: null, usage };

          const parsed = parseAndValidate(text);
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
          const backoff = computeBackoff(
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

/**
 * Compute the next backoff delay. Honors a Retry-After header when the
 * error carries one; otherwise exponential (base * 2^(attempt-1)), capped.
 */
function computeBackoff(
  attempt: number,
  baseMs: number,
  maxMs: number,
  err: unknown,
): number {
  if (err instanceof APIError && err.headers) {
    const retryAfter = readRetryAfter(err.headers);
    if (retryAfter !== null) return Math.min(retryAfter * 1000, maxMs);
  }
  const exp = baseMs * Math.pow(2, attempt - 1);
  return Math.min(exp, maxMs);
}

function readRetryAfter(headers: unknown): number | null {
  // SDK's Headers type is a plain record-ish object in practice; be
  // defensive about the shape.
  if (!headers || typeof headers !== "object") return null;
  const h = headers as Record<string, string | undefined>;
  const raw = h["retry-after"] ?? h["Retry-After"];
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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

function parseAndValidate(text: string): ExtractionResult {
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
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    log.warn("extraction: JSON root is not an object", { preview });
    throw new ParseError(
      "shape-invalid",
      preview,
      "JSON root is not an object (expected { claims: [...] }).",
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
