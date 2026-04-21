import type Anthropic from "@anthropic-ai/sdk";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "@anthropic-ai/sdk/error.js";
import { describe, expect, it, vi } from "vitest";

import {
  classifyError,
  createExtractionClient,
} from "./anthropic-client.js";

// ---------------------------------------------------------------------------
// classifyError — one canary test per real SDK class, then structural
// tests for the branches that don't belong to a single class.
// ---------------------------------------------------------------------------

describe("classifyError — SDK class canaries", () => {
  it("RateLimitError → retry", () => {
    expect(classifyError(new RateLimitError(429, undefined, "rate limited", undefined))).toBe("retry");
  });
  it("InternalServerError → retry", () => {
    expect(classifyError(new InternalServerError(500, undefined, "oops", undefined))).toBe("retry");
  });
  it("APIConnectionError → retry", () => {
    expect(classifyError(new APIConnectionError({ message: "conn dropped" }))).toBe("retry");
  });
  it("APIConnectionTimeoutError → retry", () => {
    expect(classifyError(new APIConnectionTimeoutError({ message: "timeout" }))).toBe("retry");
  });
  it("AuthenticationError → fail", () => {
    expect(classifyError(new AuthenticationError(401, undefined, "bad key", undefined))).toBe("fail");
  });
  it("PermissionDeniedError → fail", () => {
    expect(classifyError(new PermissionDeniedError(403, undefined, "no access", undefined))).toBe("fail");
  });
  it("BadRequestError → fail", () => {
    expect(classifyError(new BadRequestError(400, undefined, "bad", undefined))).toBe("fail");
  });
  it("NotFoundError → fail", () => {
    expect(classifyError(new NotFoundError(404, undefined, "nope", undefined))).toBe("fail");
  });
  it("UnprocessableEntityError → fail", () => {
    expect(classifyError(new UnprocessableEntityError(422, undefined, "bad", undefined))).toBe("fail");
  });
});

describe("classifyError — structural (no SDK construction)", () => {
  it("generic APIError with 5xx status → retry (covers future 5xx subclasses)", () => {
    const err = new APIError(503, undefined, "service unavailable", undefined);
    expect(classifyError(err)).toBe("retry");
  });
  it("generic APIError with 4xx status → fail", () => {
    const err = new APIError(418, undefined, "teapot", undefined);
    expect(classifyError(err)).toBe("fail");
  });
  it("plain Error → fail", () => {
    expect(classifyError(new Error("wut"))).toBe("fail");
  });
  it("non-error value → fail", () => {
    expect(classifyError("string")).toBe("fail");
    expect(classifyError(null)).toBe("fail");
    expect(classifyError(undefined)).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// Retry loop — single SDK error instances, rest with stubs.
// ---------------------------------------------------------------------------

function makeStubAnthropic(
  implementation: (...args: unknown[]) => Promise<unknown>,
): Anthropic {
  return {
    messages: { create: vi.fn(implementation) },
  } as unknown as Anthropic;
}

function validResponse(claims: unknown[] = []) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ claims }) }],
  };
}

describe("createExtractionClient — retry loop", () => {
  it("success on first try — single messages.create call", async () => {
    const anthropic = makeStubAnthropic(async () => validResponse([]));
    const client = createExtractionClient({
      anthropic,
      sleep: async () => {},
    });
    const result = await client.extract("doc body");
    expect(result).toEqual({ claims: [] });
    expect((anthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("retries after RateLimitError and succeeds", async () => {
    let calls = 0;
    const anthropic = makeStubAnthropic(async () => {
      calls++;
      if (calls < 2) throw new RateLimitError(429, undefined, "slow down", undefined);
      return validResponse([]);
    });
    const sleeps: number[] = [];
    const client = createExtractionClient({
      anthropic,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      baseBackoffMs: 100,
      maxBackoffMs: 30_000,
    });
    const result = await client.extract("doc body");
    expect(result).toEqual({ claims: [] });
    expect(calls).toBe(2);
    expect(sleeps).toEqual([100]);
  });

  it("exponential backoff over multiple retries", async () => {
    let calls = 0;
    const anthropic = makeStubAnthropic(async () => {
      calls++;
      if (calls < 4) throw new InternalServerError(500, undefined, "oops", undefined);
      return validResponse([]);
    });
    const sleeps: number[] = [];
    const client = createExtractionClient({
      anthropic,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      baseBackoffMs: 100,
      maxBackoffMs: 10_000,
    });
    await client.extract("doc body");
    expect(calls).toBe(4);
    expect(sleeps).toEqual([100, 200, 400]);
  });

  it("gives up after maxRetries and rethrows", async () => {
    const err = new RateLimitError(429, undefined, "rate", undefined);
    const anthropic = makeStubAnthropic(async () => {
      throw err;
    });
    const client = createExtractionClient({
      anthropic,
      maxRetries: 2,
      sleep: async () => {},
    });
    await expect(client.extract("doc")).rejects.toBe(err);
    expect((anthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
  });

  it("does not retry on AuthenticationError", async () => {
    const err = new AuthenticationError(401, undefined, "bad key", undefined);
    const anthropic = makeStubAnthropic(async () => {
      throw err;
    });
    const client = createExtractionClient({
      anthropic,
      sleep: async () => {},
    });
    await expect(client.extract("doc")).rejects.toBe(err);
    expect((anthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("honors Retry-After header when present", async () => {
    let calls = 0;
    const anthropic = makeStubAnthropic(async () => {
      calls++;
      if (calls < 2) {
        throw new RateLimitError(
          429,
          undefined,
          "rate",
          { "retry-after": "3" } as unknown as never,
        );
      }
      return validResponse([]);
    });
    const sleeps: number[] = [];
    const client = createExtractionClient({
      anthropic,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      baseBackoffMs: 100,
    });
    await client.extract("doc");
    expect(sleeps).toEqual([3000]);
  });
});

// ---------------------------------------------------------------------------
// Response parsing / validation
// ---------------------------------------------------------------------------

describe("createExtractionClient — response handling", () => {
  it("returns null on malformed JSON (skippable, not fatal)", async () => {
    const anthropic = makeStubAnthropic(async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "this is not json" }],
    }));
    const client = createExtractionClient({ anthropic, sleep: async () => {} });
    expect(await client.extract("doc")).toBeNull();
  });

  it("returns null when stop_reason is max_tokens", async () => {
    const anthropic = makeStubAnthropic(async () => ({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"claims":[]}' }],
    }));
    const client = createExtractionClient({ anthropic, sleep: async () => {} });
    expect(await client.extract("doc")).toBeNull();
  });

  it("drops individual malformed claim entries, keeps valid ones", async () => {
    const anthropic = makeStubAnthropic(async () =>
      validResponse([
        {
          symbol_candidates: ["Foo"],
          claim: "must be X",
          severity: "hard",
          rationale: "r",
          excerpt: "e",
        },
        {
          // malformed: missing rationale and excerpt
          symbol_candidates: ["Bar"],
          claim: "should be Y",
          severity: "soft",
        },
        {
          symbol_candidates: ["Baz"],
          claim: "background",
          severity: "context",
          rationale: "r",
          excerpt: "e",
        },
      ]),
    );
    const client = createExtractionClient({ anthropic, sleep: async () => {} });
    const result = await client.extract("doc");
    expect(result?.claims.map((c) => c.claim)).toEqual([
      "must be X",
      "background",
    ]);
  });

  it("rejects invalid severity value", async () => {
    const anthropic = makeStubAnthropic(async () =>
      validResponse([
        {
          symbol_candidates: [],
          claim: "x",
          severity: "critical", // invalid
          rationale: "r",
          excerpt: "e",
        },
      ]),
    );
    const client = createExtractionClient({ anthropic, sleep: async () => {} });
    const result = await client.extract("doc");
    expect(result?.claims).toEqual([]);
  });
});
