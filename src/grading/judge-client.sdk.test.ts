/**
 * v1.2 SDK 0.128.0 migration tests for the judge wrapper, driven
 * through a REAL SDK client with a fake fetch so errors are thrown by
 * the SDK itself (see the parallel extraction file
 * src/extraction/anthropic-client.sdk.test.ts for the rationale).
 */

import Anthropic, { APIError, RateLimitError } from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import {
  classifyError,
  createJudgeClient,
  OPUS_47_MODEL,
  SONNET_46_MODEL,
} from "./judge-client.js";
import { apiErrorOrigin } from "./retry-policy.js";

interface RecordedRequest {
  init: RequestInit | undefined;
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function sequencedFetch(responders: Array<() => Response>): {
  fetch: (input: unknown, init?: RequestInit) => Promise<Response>;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  return {
    requests,
    fetch: async (_input: unknown, init?: RequestInit) => {
      requests.push({ init });
      const responder = responders[requests.length - 1];
      if (!responder) throw new Error("fake fetch: unexpected extra request");
      return responder();
    },
  };
}

const RATE_LIMIT_BODY = {
  type: "error",
  error: { type: "rate_limit_error", message: "slow down" },
};

function scoreMessage(model: string): unknown {
  return {
    id: "msg_judge",
    type: "message",
    role: "assistant",
    model,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          factual_correctness: 3,
          completeness: 2,
          actionability: 3,
          hallucination: 3,
        }),
      },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1500, output_tokens: 200 },
  };
}

const SAMPLE_SINGLE_REQ = {
  rubricPrompt: "RUBRIC_STUB",
  prompt: "What's the contract?",
  answer: "Answer text here.",
};

function wireBody(req: RecordedRequest): Record<string, unknown> {
  return JSON.parse(String(req.init?.body)) as Record<string, unknown>;
}

describe("judge wrapper with a real SDK client (error-identity regression)", () => {
  it("retries an SDK-thrown 429, honoring Retry-After, then succeeds", async () => {
    const { fetch, requests } = sequencedFetch([
      () => jsonResponse(429, RATE_LIMIT_BODY, { "retry-after": "3" }),
      () => jsonResponse(200, scoreMessage(SONNET_46_MODEL)),
    ]);
    const anthropic = new Anthropic({
      apiKey: "test",
      authToken: null,
      maxRetries: 0,
      fetch,
    });
    const sleeps: number[] = [];
    const client = createJudgeClient({
      anthropic,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const result = await client.gradeSingle(SAMPLE_SINGLE_REQ);
    expect(result.scores.factual_correctness).toBe(3);
    expect(result.usage).toEqual({ inputTokens: 1500, outputTokens: 200 });
    expect(requests).toHaveLength(2);
    expect(sleeps).toEqual([3000]);
  });

  it("recognizes an SDK-thrown 429 by class identity, not the foreign-copy fallback", async () => {
    const anthropic = new Anthropic({
      apiKey: "test",
      authToken: null,
      maxRetries: 0,
      fetch: async () => jsonResponse(429, RATE_LIMIT_BODY),
    });
    const err: unknown = await anthropic.messages
      .create({
        model: SONNET_46_MODEL,
        max_tokens: 16,
        messages: [{ role: "user", content: "x" }],
      })
      .then(
        () => {
          throw new Error("expected the SDK call to reject");
        },
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(RateLimitError);
    expect(apiErrorOrigin(err)).toBe("sdk-class");
    expect(classifyError(err)).toBe("retry");
  });

  it("disables SDK-internal retries per request even when the client keeps SDK defaults", async () => {
    const { fetch, requests } = sequencedFetch([
      () => jsonResponse(429, RATE_LIMIT_BODY, { "retry-after-ms": "1" }),
      () => jsonResponse(200, scoreMessage(SONNET_46_MODEL)),
    ]);
    // No maxRetries option: the SDK default (2) would retry itself.
    const anthropic = new Anthropic({ apiKey: "test", authToken: null, fetch });
    const sleeps: number[] = [];
    const client = createJudgeClient({
      anthropic,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await client.gradeSingle(SAMPLE_SINGLE_REQ);
    expect(requests).toHaveLength(2);
    expect(sleeps).toEqual([1]);
  });

  it("does not retry a 429 the server marks x-should-retry: false", async () => {
    const { fetch, requests } = sequencedFetch([
      () =>
        jsonResponse(429, RATE_LIMIT_BODY, {
          "retry-after": "3",
          "x-should-retry": "false",
        }),
    ]);
    const anthropic = new Anthropic({ apiKey: "test", authToken: null, fetch });
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    await expect(client.gradeSingle(SAMPLE_SINGLE_REQ)).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(requests).toHaveLength(1);
  });

  it("classifies a plain { status: 429, headers: Headers } object (another SDK copy) as retryable", () => {
    const foreign = { status: 429, headers: new Headers({ "retry-after": "3" }) };
    expect(foreign).not.toBeInstanceOf(APIError);
    expect(apiErrorOrigin(foreign)).toBe("foreign-shape");
    expect(classifyError(foreign)).toBe("retry");
  });
});

describe("judge wire bodies: sampling parameters per model", () => {
  it("Opus 4.7 request carries no temperature; Sonnet 4.6 carries temperature 0", async () => {
    const { fetch, requests } = sequencedFetch([
      () => jsonResponse(200, scoreMessage(OPUS_47_MODEL)),
      () => jsonResponse(200, scoreMessage(SONNET_46_MODEL)),
    ]);
    const anthropic = new Anthropic({
      apiKey: "test",
      authToken: null,
      maxRetries: 0,
      fetch,
    });
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    await client.gradeSingle({ ...SAMPLE_SINGLE_REQ, model: OPUS_47_MODEL });
    await client.gradeSingle(SAMPLE_SINGLE_REQ);
    expect(requests).toHaveLength(2);
    const opus = wireBody(requests[0]!);
    expect(opus.model).toBe(OPUS_47_MODEL);
    expect(opus).not.toHaveProperty("temperature");
    const sonnet = wireBody(requests[1]!);
    expect(sonnet.model).toBe(SONNET_46_MODEL);
    expect(sonnet.temperature).toBe(0);
  });
});
