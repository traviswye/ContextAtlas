import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import {
  apiErrorOrigin,
  classifyApiError,
  computeBackoffMs,
  readRetryAfterMs,
} from "./retry-policy.js";

describe("classifyApiError — SDK classes (this package's copy)", () => {
  it("408 / 409 / 529 statuses → retry (matches the SDK's own retryable set)", () => {
    expect(classifyApiError(new APIError(408, undefined, "timeout", new Headers()))).toBe("retry");
    expect(classifyApiError(new ConflictError(409, undefined, "conflict", new Headers()))).toBe("retry");
    expect(classifyApiError(new InternalServerError(529, undefined, "overloaded", new Headers()))).toBe("retry");
  });
  it("APIError with no status (e.g. mid-stream SSE error) → fail", () => {
    expect(classifyApiError(new APIError(undefined, undefined, "sse error", undefined))).toBe("fail");
  });
});

describe("classifyApiError — x-should-retry header (SDK shouldRetry parity)", () => {
  it("'false' overrides a retryable status (SDK class and foreign shape)", () => {
    const noRetry = new Headers({ "x-should-retry": "false" });
    expect(classifyApiError(new RateLimitError(429, undefined, "rl", noRetry))).toBe("fail");
    expect(classifyApiError(new InternalServerError(529, undefined, "overloaded", noRetry))).toBe("fail");
    expect(classifyApiError({ status: 503, headers: { "x-should-retry": "false" } })).toBe("fail");
  });
  it("'true' overrides a non-retryable status (SDK class and foreign shape)", () => {
    const retry = new Headers({ "x-should-retry": "true" });
    expect(classifyApiError(new BadRequestError(400, undefined, "bad", retry))).toBe("retry");
    expect(classifyApiError({ status: 404, headers: retry })).toBe("retry");
  });
  it("absent or unrecognized values fall through to the status rules", () => {
    const maybe = new Headers({ "x-should-retry": "maybe" });
    expect(classifyApiError(new RateLimitError(429, undefined, "rl", maybe))).toBe("retry");
    expect(classifyApiError(new BadRequestError(400, undefined, "bad", new Headers()))).toBe("fail");
  });
  it("is ignored on errors that are not Anthropic API errors", () => {
    const plain = Object.assign(new Error("x"), { headers: { "x-should-retry": "true" } });
    expect(classifyApiError(plain)).toBe("fail");
  });
});

describe("classifyApiError — foreign SDK copy (shape fallback)", () => {
  it.each([429, 408, 409, 500, 503, 529])("status %i → retry", (status) => {
    expect(classifyApiError({ status, headers: new Headers() })).toBe("retry");
  });
  it.each([400, 401, 403, 404, 422, 418])("status %i → fail", (status) => {
    expect(classifyApiError({ status })).toBe("fail");
  });
  it("connection-error constructor names → retry", () => {
    const ForeignConnection = class APIConnectionError extends Error {};
    const ForeignTimeout = class APIConnectionTimeoutError extends Error {};
    expect(classifyApiError(new ForeignConnection("conn"))).toBe("retry");
    expect(classifyApiError(new ForeignTimeout("timeout"))).toBe("retry");
  });
  it("non-numeric status, plain errors, and non-objects → fail", () => {
    expect(classifyApiError({ status: "429" })).toBe("fail");
    expect(classifyApiError(new Error("boom"))).toBe("fail");
    expect(classifyApiError("429")).toBe("fail");
    expect(classifyApiError(null)).toBe("fail");
    expect(classifyApiError(undefined)).toBe("fail");
  });
});

describe("apiErrorOrigin", () => {
  it("SDK classes (incl. connection errors) → sdk-class", () => {
    expect(apiErrorOrigin(new RateLimitError(429, undefined, "rl", new Headers()))).toBe("sdk-class");
    expect(apiErrorOrigin(new APIConnectionError({ message: "c" }))).toBe("sdk-class");
    expect(apiErrorOrigin(new APIConnectionTimeoutError({ message: "t" }))).toBe("sdk-class");
  });
  it("status-shaped or connection-named foreign errors → foreign-shape", () => {
    expect(apiErrorOrigin({ status: 500 })).toBe("foreign-shape");
    const ForeignConnection = class APIConnectionError extends Error {};
    expect(apiErrorOrigin(new ForeignConnection("c"))).toBe("foreign-shape");
  });
  it("anything else → none", () => {
    expect(apiErrorOrigin(new Error("x"))).toBe("none");
    expect(apiErrorOrigin(undefined)).toBe("none");
  });
});

describe("readRetryAfterMs", () => {
  it("reads web Headers (SDK 0.128.0 shape)", () => {
    expect(readRetryAfterMs(new Headers({ "retry-after": "3" }))).toBe(3000);
  });
  it("reads plain records (SDK 0.32.x shape), case-insensitively", () => {
    expect(readRetryAfterMs({ "retry-after": "2" })).toBe(2000);
    expect(readRetryAfterMs({ "Retry-After": "4" })).toBe(4000);
  });
  it("prefers retry-after-ms over retry-after", () => {
    expect(
      readRetryAfterMs(new Headers({ "retry-after-ms": "250", "retry-after": "3" })),
    ).toBe(250);
    expect(readRetryAfterMs({ "retry-after-ms": "5", "retry-after": "9" })).toBe(5);
  });
  it("returns null for absent, empty, negative, or non-numeric values", () => {
    expect(readRetryAfterMs(new Headers())).toBeNull();
    expect(readRetryAfterMs({ "retry-after": "" })).toBeNull();
    expect(readRetryAfterMs({ "retry-after": "-1" })).toBeNull();
    expect(readRetryAfterMs(new Headers({ "retry-after": "Wed, 21 Oct 2015 07:28:00 GMT" }))).toBeNull();
    expect(readRetryAfterMs(undefined)).toBeNull();
    expect(readRetryAfterMs("retry-after: 3")).toBeNull();
  });
  it("treats a zero delay as absent (the SDK only honors a positive delay)", () => {
    expect(readRetryAfterMs({ "retry-after": "0" })).toBeNull();
    expect(readRetryAfterMs(new Headers({ "retry-after-ms": "0" }))).toBeNull();
    expect(
      readRetryAfterMs(new Headers({ "retry-after-ms": "0", "retry-after": "3" })),
    ).toBe(3000);
  });
});

describe("computeBackoffMs", () => {
  it("uses the error's Retry-After, capped at maxMs", () => {
    const err = { status: 429, headers: new Headers({ "retry-after": "3" }) };
    expect(computeBackoffMs(1, 100, 30_000, err)).toBe(3000);
    expect(computeBackoffMs(1, 100, 1_000, err)).toBe(1000);
  });
  it("falls back to capped exponential backoff", () => {
    expect(computeBackoffMs(1, 100, 10_000, new Error("x"))).toBe(100);
    expect(computeBackoffMs(3, 100, 10_000, { status: 500 })).toBe(400);
    expect(computeBackoffMs(10, 100, 10_000, undefined)).toBe(10_000);
  });
  it("a Retry-After of 0 falls back to exponential backoff (no 0 ms retry)", () => {
    const err = { status: 429, headers: new Headers({ "retry-after": "0" }) };
    expect(computeBackoffMs(2, 100, 10_000, err)).toBe(200);
  });
});
