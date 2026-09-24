/**
 * v1.2 SDK 0.128.0 migration tests for the extraction wrapper, driven
 * through a REAL SDK client with a fake fetch so errors are thrown by
 * the SDK itself. The stub-based tests in anthropic-client.test.ts
 * construct errors from the same module the wrapper imports, which is
 * why the error-class identity bug (wrapper importing the CommonJS
 * "@anthropic-ai/sdk/error.js" classes) never showed up there.
 */

import Anthropic, {
  APIConnectionError,
  APIError,
  AuthenticationError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import { classifyError, createExtractionClient } from "./anthropic-client.js";
import {
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_MODEL,
  EXTRACTION_PROMPT,
} from "./prompt.js";
import { apiErrorOrigin } from "./retry-policy.js";

interface RecordedRequest {
  url: string;
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
    fetch: async (input: unknown, init?: RequestInit) => {
      requests.push({ url: String(input), init });
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

const OK_MESSAGE = {
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-opus-4-7",
  content: [{ type: "text", text: '{"claims":[]}' }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 11, output_tokens: 7 },
};

function realClient(
  fetch: (input: unknown, init?: RequestInit) => Promise<Response>,
): Anthropic {
  return new Anthropic({ apiKey: "test", authToken: null, maxRetries: 0, fetch });
}

/** Issue one SDK call against `respond` and return what it rejects with. */
async function sdkThrown(respond: () => Response): Promise<unknown> {
  const anthropic = realClient(async () => respond());
  return anthropic.messages
    .create({
      model: EXTRACTION_MODEL,
      max_tokens: 16,
      messages: [{ role: "user", content: "x" }],
    })
    .then(
      () => {
        throw new Error("expected the SDK call to reject");
      },
      (err: unknown) => err,
    );
}

function recordingSleep(): { sleeps: number[]; sleep: (ms: number) => Promise<void> } {
  const sleeps: number[] = [];
  return {
    sleeps,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };
}

describe("extraction request shape (ADR-02 frozen substrate)", () => {
  it("create() gets exactly {model, max_tokens, messages} + client-side { maxRetries: 0 }", async () => {
    const create = vi.fn(async (..._args: unknown[]) => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"claims":[]}' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const client = createExtractionClient({ anthropic, sleep: async () => {} });
    await client.extract("DOC BODY");
    expect(create.mock.calls).toHaveLength(1);
    expect(create.mock.calls[0]).toStrictEqual([
      {
        model: EXTRACTION_MODEL,
        max_tokens: EXTRACTION_MAX_TOKENS,
        messages: [
          { role: "user", content: EXTRACTION_PROMPT + "DOC BODY" + "\n---\n" },
        ],
      },
      { maxRetries: 0 },
    ]);
  });

  it("wire body is exactly {model, max_tokens, messages}: no thinking / temperature", async () => {
    const { fetch, requests } = sequencedFetch([
      () => jsonResponse(200, OK_MESSAGE),
    ]);
    const client = createExtractionClient({
      anthropic: realClient(fetch),
      sleep: async () => {},
    });
    await client.extract("DOC BODY");
    expect(requests).toHaveLength(1);
    const wireBody = String(requests[0]!.init?.body);
    expect(JSON.parse(wireBody)).toStrictEqual({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      messages: [
        { role: "user", content: EXTRACTION_PROMPT + "DOC BODY" + "\n---\n" },
      ],
    });
  });
});

describe("extraction wrapper with a real SDK client (error-identity regression)", () => {
  it("retries an SDK-thrown 429, honoring Retry-After, then succeeds", async () => {
    const { fetch, requests } = sequencedFetch([
      () => jsonResponse(429, RATE_LIMIT_BODY, { "retry-after": "3" }),
      () => jsonResponse(200, OK_MESSAGE),
    ]);
    const { sleeps, sleep } = recordingSleep();
    const client = createExtractionClient({ anthropic: realClient(fetch), sleep });
    const { result, usage } = await client.extract("doc body");
    expect(result).toEqual({ claims: [] });
    expect(usage).toEqual({ inputTokens: 11, outputTokens: 7 });
    expect(requests).toHaveLength(2);
    expect(sleeps).toEqual([3000]);
  });

  it("recognizes SDK-thrown errors by class identity, not the foreign-copy fallback", async () => {
    const rateLimited = await sdkThrown(() =>
      jsonResponse(429, RATE_LIMIT_BODY, { "retry-after": "3" }),
    );
    expect(rateLimited).toBeInstanceOf(RateLimitError);
    expect(apiErrorOrigin(rateLimited)).toBe("sdk-class");
    expect(classifyError(rateLimited)).toBe("retry");

    const unauthorized = await sdkThrown(() =>
      jsonResponse(401, {
        type: "error",
        error: { type: "authentication_error", message: "bad key" },
      }),
    );
    expect(unauthorized).toBeInstanceOf(AuthenticationError);
    expect(apiErrorOrigin(unauthorized)).toBe("sdk-class");
    expect(classifyError(unauthorized)).toBe("fail");

    const connection = await sdkThrown(() => {
      throw new TypeError("fetch failed");
    });
    expect(connection).toBeInstanceOf(APIConnectionError);
    expect(apiErrorOrigin(connection)).toBe("sdk-class");
    expect(classifyError(connection)).toBe("retry");
  });

  it("disables SDK-internal retries per request even when the client keeps SDK defaults", async () => {
    const { fetch, requests } = sequencedFetch([
      () => jsonResponse(429, RATE_LIMIT_BODY, { "retry-after-ms": "1" }),
      () => jsonResponse(200, OK_MESSAGE),
    ]);
    // No maxRetries option: the SDK default (2) would retry the 429
    // itself, and the wrapper would never see it.
    const anthropic = new Anthropic({ apiKey: "test", authToken: null, fetch });
    const { sleeps, sleep } = recordingSleep();
    const client = createExtractionClient({ anthropic, sleep });
    await client.extract("doc");
    expect(requests).toHaveLength(2);
    // The wrapper saw the 429, slept per retry-after-ms, and re-issued.
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
    const { sleeps, sleep } = recordingSleep();
    const client = createExtractionClient({ anthropic, sleep });
    await expect(client.extract("doc")).rejects.toBeInstanceOf(RateLimitError);
    expect(requests).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });
});

describe("extraction wrapper with errors from another SDK copy (shape fallback)", () => {
  it("classifies a plain { status: 429, headers: Headers } object as retryable", () => {
    const foreign = {
      status: 429,
      headers: new Headers({ "retry-after": "3" }),
    };
    expect(foreign).not.toBeInstanceOf(APIError);
    expect(apiErrorOrigin(foreign)).toBe("foreign-shape");
    expect(classifyError(foreign)).toBe("retry");
  });

  it("retries a 0.32.x-shaped error (plain-record headers) and honors its Retry-After", async () => {
    let calls = 0;
    const create = vi.fn(async () => {
      calls++;
      if (calls < 2) {
        throw Object.assign(new Error("429 rate limited"), {
          status: 429,
          headers: { "retry-after": "2" },
        });
      }
      return {
        stop_reason: "end_turn",
        content: [{ type: "text", text: '{"claims":[]}' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    });
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const { sleeps, sleep } = recordingSleep();
    const client = createExtractionClient({ anthropic, sleep, baseBackoffMs: 100 });
    const { result } = await client.extract("doc");
    expect(result).toEqual({ claims: [] });
    expect(calls).toBe(2);
    expect(sleeps).toEqual([2000]);
  });

  it("does not retry a foreign 401", async () => {
    const foreign = Object.assign(new Error("401 bad key"), { status: 401 });
    const create = vi.fn(async () => {
      throw foreign;
    });
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const client = createExtractionClient({ anthropic, sleep: async () => {} });
    await expect(client.extract("doc")).rejects.toBe(foreign);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
