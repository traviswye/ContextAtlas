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

export type RetryClassification = "retry" | "fail";

/**
 * Classify an error as retryable or not. Exported for direct unit
 * testing — the retry-loop tests exercise the wrapper end-to-end with
 * stub clients, but this pure predicate carries the core logic.
 */
export function classifyError(err: unknown): RetryClassification {
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

export interface ExtractionClient {
  /**
   * Run the extraction prompt against a single document body. Returns
   * parsed and validated claims. Throws on irrecoverable failure.
   * A `null` result signals the document was skippable (malformed JSON
   * or max-tokens stop) — the caller decides whether to log and move on.
   */
  extract(documentBody: string): Promise<ExtractionResult | null>;
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
    async extract(documentBody: string): Promise<ExtractionResult | null> {
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

          if (response.stop_reason === "max_tokens") {
            log.warn("extraction: max_tokens hit; skipping document", {
              modelStopReason: response.stop_reason,
            });
            return null;
          }

          const text = extractText(response);
          if (text === null) return null;

          const parsed = parseAndValidate(text);
          return parsed;
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

function parseAndValidate(text: string): ExtractionResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    log.warn("extraction: model returned malformed JSON; skipping document", {
      preview: text.slice(0, 200),
    });
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    log.warn("extraction: JSON root is not an object", {
      preview: text.slice(0, 200),
    });
    return null;
  }

  const claims = (parsed as { claims?: unknown }).claims;
  if (!Array.isArray(claims)) {
    log.warn("extraction: 'claims' field missing or not an array", {
      preview: text.slice(0, 200),
    });
    return null;
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
