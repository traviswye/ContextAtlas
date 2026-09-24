/**
 * Retry policy for the judge wrapper (`judge-client.ts`): Anthropic
 * SDK error recognition, retry/fail classification, and backoff
 * computation.
 *
 * LOCAL COPY of `src/extraction/retry-policy.ts` per the ADR-02
 * amendment intent (research-time grading modules do not import from
 * src/extraction/). Keep the two copies behaviorally identical.
 *
 * Retry ownership (v1.2): the judge wrapper is the ONLY retry layer.
 * It sends every request with the SDK per-request option
 * `{ maxRetries: 0 }` (honored by SDK 0.128.0 and 0.32.x), so a
 * caller-constructed client with SDK-default retries (e.g. the
 * scripts/ grading harnesses' `new Anthropic()`) never retries
 * underneath this policy.
 *
 * The retry DECISION follows SDK 0.128.0's `shouldRetry`: an explicit
 * `x-should-retry: true|false` response header wins; otherwise 408 /
 * 409 / 429 / 5xx (incl. 529) and connection errors / timeouts retry.
 * The DELAY does not fully match the SDK: a server `retry-after-ms` /
 * `Retry-After` (seconds) delay is honored but capped at the wrapper's
 * `maxBackoffMs` (default 30 s; the SDK does not cap it), the HTTP-date
 * form of Retry-After is not parsed, a zero or negative delay falls
 * back to exponential backoff (as in the SDK), and the exponential
 * fallback has no jitter.
 *
 * Error recognition has two paths:
 *
 *   1. Class identity against SDK classes imported from the package
 *      ROOT ("@anthropic-ai/sdk"). The root ESM entry re-exports the
 *      classes the SDK actually throws. Do NOT import from
 *      "@anthropic-ai/sdk/error.js": that subpath maps to the CommonJS
 *      build (exports["./error.js"] = { default: "./error.js" }), whose
 *      classes are different objects, so `instanceof` never matches a
 *      runtime error (dual-package hazard; on SDK 0.32.x it silently
 *      disabled every wrapper retry, v1.1.x and earlier).
 *   2. Shape fallback for errors thrown by ANOTHER copy of the SDK
 *      (a client from a different SDK install passed into
 *      `createJudgeClient`): numeric `status`, or a connection-error
 *      constructor name.
 */

import {
  APIConnectionError,
  APIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "@anthropic-ai/sdk";

export type RetryClassification = "retry" | "fail";

/**
 * How an error was recognized: `sdk-class` = instance of this
 * package's SDK copy; `foreign-shape` = SDK-error-shaped object from
 * another copy; `none` = not an Anthropic API error.
 */
export type ApiErrorOrigin = "sdk-class" | "foreign-shape" | "none";

const CONNECTION_ERROR_NAMES: ReadonlySet<string> = new Set([
  "APIConnectionError",
  "APIConnectionTimeoutError",
]);

/** 408 / 409 / 429 / 5xx (incl. 529 overloaded) retry; everything else fails. */
function classifyStatus(status: unknown): RetryClassification {
  if (typeof status !== "number") return "fail";
  return status === 408 || status === 409 || status === 429 || status >= 500
    ? "retry"
    : "fail";
}

function readStatus(err: unknown): number | undefined {
  if (err === null || typeof err !== "object") return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isForeignConnectionError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const name = (err as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof name === "string" && CONNECTION_ERROR_NAMES.has(name);
}

export function apiErrorOrigin(err: unknown): ApiErrorOrigin {
  if (err instanceof APIError) return "sdk-class";
  if (isForeignConnectionError(err) || readStatus(err) !== undefined) {
    return "foreign-shape";
  }
  return "none";
}

/**
 * Retry-or-fail for an Anthropic API error. Non-API errors fail. An
 * explicit `x-should-retry` header overrides the status rules.
 */
export function classifyApiError(err: unknown): RetryClassification {
  const directive = serverRetryDirective(err);
  if (directive !== null) return directive;
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
  // Includes APIConnectionTimeoutError (subclass).
  if (err instanceof APIConnectionError) return "retry";
  if (err instanceof APIError) return classifyStatus(err.status);
  // Foreign-copy fallback (see module JSDoc).
  if (isForeignConnectionError(err)) return "retry";
  return classifyStatus(readStatus(err));
}

/**
 * The server's explicit `x-should-retry: true|false` header, which the
 * SDK obeys before any status rule. Read only from errors recognized
 * as Anthropic API errors; null when absent or unrecognized.
 */
function serverRetryDirective(err: unknown): RetryClassification | null {
  if (apiErrorOrigin(err) === "none") return null;
  const headers = (err as { headers?: unknown }).headers;
  if (headers === null || typeof headers !== "object") return null;
  const value = readHeader(headers, "x-should-retry");
  if (value === "true") return "retry";
  if (value === "false") return "fail";
  return null;
}

/**
 * Next backoff delay in ms. Honors `retry-after-ms` / `Retry-After`
 * on the error's headers when present; otherwise exponential
 * (base * 2^(attempt-1)). Always capped at `maxMs`.
 */
export function computeBackoffMs(
  attempt: number,
  baseMs: number,
  maxMs: number,
  err: unknown,
): number {
  const headers =
    err !== null && typeof err === "object"
      ? (err as { headers?: unknown }).headers
      : undefined;
  const retryAfterMs = readRetryAfterMs(headers);
  if (retryAfterMs !== null) return Math.min(retryAfterMs, maxMs);
  return Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
}

/**
 * Server-requested retry delay in ms, or null. SDK 0.128.0 puts a web
 * `Headers` instance on `APIError.headers`; SDK 0.32.x (foreign
 * copies) used a plain lower-cased record. Both are supported.
 * `retry-after-ms` (non-standard, Anthropic-sent) wins over
 * `retry-after` (seconds), matching the SDK's own precedence. Only a
 * positive delay counts (the SDK likewise ignores zero / negative);
 * the HTTP-date form of Retry-After is not parsed. Either way the
 * caller falls back to exponential backoff.
 */
export function readRetryAfterMs(headers: unknown): number | null {
  if (headers === null || typeof headers !== "object") return null;
  const ms = parsePositive(readHeader(headers, "retry-after-ms"));
  if (ms !== null) return ms;
  const seconds = parsePositive(readHeader(headers, "retry-after"));
  return seconds === null ? null : seconds * 1000;
}

function readHeader(headers: object, name: string): string | null {
  const withGet = headers as { get?: (key: string) => unknown };
  if (typeof withGet.get === "function") {
    const value = withGet.get(name);
    return typeof value === "string" ? value : null;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name && typeof value === "string") return value;
  }
  return null;
}

function parsePositive(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
