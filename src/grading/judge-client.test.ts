import type Anthropic from "@anthropic-ai/sdk";
import {
  APIConnectionError,
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
  createJudgeClient,
  JudgeParseError,
  OPUS_47_MODEL,
  SONNET_46_MODEL,
} from "./judge-client.js";

// ===========================================================================
// classifyError — SDK class canaries + structural cases
// ===========================================================================

describe("classifyError — SDK class canaries", () => {
  it("RateLimitError → retry", () => {
    expect(
      classifyError(new RateLimitError(429, undefined, "rate limited", undefined)),
    ).toBe("retry");
  });
  it("InternalServerError → retry", () => {
    expect(
      classifyError(new InternalServerError(500, undefined, "oops", undefined)),
    ).toBe("retry");
  });
  it("APIConnectionError → retry", () => {
    expect(
      classifyError(new APIConnectionError({ message: "conn dropped" })),
    ).toBe("retry");
  });
  it("AuthenticationError → fail", () => {
    expect(
      classifyError(new AuthenticationError(401, undefined, "bad key", undefined)),
    ).toBe("fail");
  });
  it("PermissionDeniedError → fail", () => {
    expect(
      classifyError(new PermissionDeniedError(403, undefined, "no access", undefined)),
    ).toBe("fail");
  });
  it("BadRequestError → fail", () => {
    expect(
      classifyError(new BadRequestError(400, undefined, "bad", undefined)),
    ).toBe("fail");
  });
  it("NotFoundError → fail", () => {
    expect(
      classifyError(new NotFoundError(404, undefined, "nope", undefined)),
    ).toBe("fail");
  });
  it("UnprocessableEntityError → fail", () => {
    expect(
      classifyError(new UnprocessableEntityError(422, undefined, "bad", undefined)),
    ).toBe("fail");
  });
});

describe("classifyError — structural", () => {
  it("APIError 5xx → retry (covers future 5xx subclasses)", () => {
    expect(
      classifyError(new APIError(503, undefined, "service unavailable", undefined)),
    ).toBe("retry");
  });
  it("APIError 4xx → fail", () => {
    expect(classifyError(new APIError(418, undefined, "teapot", undefined))).toBe(
      "fail",
    );
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

// ===========================================================================
// Stub helpers
// ===========================================================================

function makeStubAnthropic(
  impl: (...args: unknown[]) => Promise<unknown>,
): Anthropic {
  return { messages: { create: vi.fn(impl) } } as unknown as Anthropic;
}

function singleScoreResponse(
  scores: Record<string, number> = {
    factual_correctness: 3,
    completeness: 2,
    actionability: 3,
    hallucination: 3,
  },
  usage: { input_tokens?: number; output_tokens?: number } = {
    input_tokens: 1500,
    output_tokens: 200,
  },
) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(scores) }],
    usage,
  };
}

function pairedScoreResponse(
  usage: { input_tokens?: number; output_tokens?: number } = {
    input_tokens: 2000,
    output_tokens: 300,
  },
) {
  return {
    stop_reason: "end_turn",
    content: [
      {
        type: "text",
        text: JSON.stringify({
          A: {
            factual_correctness: 3,
            completeness: 2,
            actionability: 3,
            hallucination: 3,
          },
          B: {
            factual_correctness: 2,
            completeness: 2,
            actionability: 2,
            hallucination: 3,
          },
        }),
      },
    ],
    usage,
  };
}

const SAMPLE_SINGLE_REQ = {
  rubricPrompt: "RUBRIC_STUB",
  prompt: "What's the contract?",
  answer: "Answer text here.",
};

const SAMPLE_PAIR_REQ = {
  rubricPrompt: "RUBRIC_STUB",
  prompt: "What's the contract?",
  answerA: "Answer A.",
  answerB: "Answer B.",
};

// ===========================================================================
// gradeSingle — happy paths
// ===========================================================================

describe("gradeSingle — happy paths", () => {
  it("returns parsed scores; default model is Sonnet 4.6", async () => {
    const anthropic = makeStubAnthropic(async () => singleScoreResponse());
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    const result = await client.gradeSingle(SAMPLE_SINGLE_REQ);
    expect(result.scores).toEqual({
      factual_correctness: 3,
      completeness: 2,
      actionability: 3,
      hallucination: 3,
    });
    expect(result.model).toBe(SONNET_46_MODEL);
    expect(result.usage).toEqual({ inputTokens: 1500, outputTokens: 200 });
  });

  it("uses Opus 4.7 when requested", async () => {
    const create = vi.fn(async () => singleScoreResponse());
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    const result = await client.gradeSingle({
      ...SAMPLE_SINGLE_REQ,
      model: OPUS_47_MODEL,
    });
    expect(result.model).toBe(OPUS_47_MODEL);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: OPUS_47_MODEL }),
    );
  });

  it("computes cost from usage at model rate", async () => {
    const anthropic = makeStubAnthropic(async () =>
      singleScoreResponse(undefined, {
        input_tokens: 1_000_000,
        output_tokens: 0,
      }),
    );
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    const result = await client.gradeSingle(SAMPLE_SINGLE_REQ);
    // 1M input @ Sonnet $3/M = $3.0
    expect(result.costUsd).toBeCloseTo(3.0, 6);
  });
});

// ===========================================================================
// gradePair — happy paths
// ===========================================================================

describe("gradePair — happy paths", () => {
  it("returns parsed scoresA + scoresB", async () => {
    const anthropic = makeStubAnthropic(async () => pairedScoreResponse());
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    const result = await client.gradePair(SAMPLE_PAIR_REQ);
    expect(result.scoresA.factual_correctness).toBe(3);
    expect(result.scoresB.factual_correctness).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 2000, outputTokens: 300 });
  });

  it("computes cost at default Sonnet rate", async () => {
    const anthropic = makeStubAnthropic(async () =>
      pairedScoreResponse({ input_tokens: 0, output_tokens: 1_000_000 }),
    );
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    const result = await client.gradePair(SAMPLE_PAIR_REQ);
    // 1M output @ Sonnet $15/M = $15.0
    expect(result.costUsd).toBeCloseTo(15.0, 6);
  });
});

// ===========================================================================
// Retry loop
// ===========================================================================

describe("createJudgeClient — retry loop", () => {
  it("retries after RateLimitError and succeeds", async () => {
    let calls = 0;
    const anthropic = makeStubAnthropic(async () => {
      calls++;
      if (calls < 2)
        throw new RateLimitError(429, undefined, "slow down", undefined);
      return singleScoreResponse();
    });
    const sleeps: number[] = [];
    const client = createJudgeClient({
      anthropic,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      baseBackoffMs: 100,
    });
    await client.gradeSingle(SAMPLE_SINGLE_REQ);
    expect(calls).toBe(2);
    expect(sleeps).toEqual([100]);
  });

  it("retries after InternalServerError", async () => {
    let calls = 0;
    const anthropic = makeStubAnthropic(async () => {
      calls++;
      if (calls < 2)
        throw new InternalServerError(500, undefined, "oops", undefined);
      return singleScoreResponse();
    });
    const client = createJudgeClient({
      anthropic,
      sleep: async () => {},
      baseBackoffMs: 100,
    });
    await client.gradeSingle(SAMPLE_SINGLE_REQ);
    expect(calls).toBe(2);
  });

  it("exponential backoff over multiple retries", async () => {
    let calls = 0;
    const anthropic = makeStubAnthropic(async () => {
      calls++;
      if (calls < 4)
        throw new InternalServerError(500, undefined, "oops", undefined);
      return singleScoreResponse();
    });
    const sleeps: number[] = [];
    const client = createJudgeClient({
      anthropic,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      baseBackoffMs: 100,
      maxBackoffMs: 10_000,
    });
    await client.gradeSingle(SAMPLE_SINGLE_REQ);
    expect(calls).toBe(4);
    expect(sleeps).toEqual([100, 200, 400]);
  });

  it("honors Retry-After header on rate-limit", async () => {
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
      return singleScoreResponse();
    });
    const sleeps: number[] = [];
    const client = createJudgeClient({
      anthropic,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      baseBackoffMs: 100,
    });
    await client.gradeSingle(SAMPLE_SINGLE_REQ);
    expect(sleeps).toEqual([3000]);
  });

  it("retry budget exhausted throws original error", async () => {
    const err = new RateLimitError(429, undefined, "always rate limited", undefined);
    const anthropic = makeStubAnthropic(async () => {
      throw err;
    });
    const client = createJudgeClient({
      anthropic,
      maxRetries: 2,
      sleep: async () => {},
    });
    await expect(client.gradeSingle(SAMPLE_SINGLE_REQ)).rejects.toBe(err);
  });

  it("non-retryable error throws on first attempt", async () => {
    let calls = 0;
    const err = new BadRequestError(400, undefined, "bad", undefined);
    const anthropic = makeStubAnthropic(async () => {
      calls++;
      throw err;
    });
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    await expect(client.gradeSingle(SAMPLE_SINGLE_REQ)).rejects.toBe(err);
    expect(calls).toBe(1);
  });
});

// ===========================================================================
// Schema validation — gradeSingle
// ===========================================================================

describe("gradeSingle — schema validation", () => {
  it("malformed JSON throws JudgeParseError", async () => {
    const anthropic = makeStubAnthropic(async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "not valid json {" }],
      usage: { input_tokens: 100, output_tokens: 10 },
    }));
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    await expect(client.gradeSingle(SAMPLE_SINGLE_REQ)).rejects.toBeInstanceOf(
      JudgeParseError,
    );
  });

  it("missing axis throws JudgeParseError", async () => {
    const anthropic = makeStubAnthropic(async () =>
      singleScoreResponse({
        factual_correctness: 3,
        completeness: 2,
        actionability: 3,
        // hallucination missing
      }),
    );
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    await expect(client.gradeSingle(SAMPLE_SINGLE_REQ)).rejects.toBeInstanceOf(
      JudgeParseError,
    );
  });

  it("out-of-range score (4) throws JudgeParseError", async () => {
    const anthropic = makeStubAnthropic(async () =>
      singleScoreResponse({
        factual_correctness: 4, // out of 0-3 range
        completeness: 2,
        actionability: 3,
        hallucination: 3,
      }),
    );
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    await expect(client.gradeSingle(SAMPLE_SINGLE_REQ)).rejects.toBeInstanceOf(
      JudgeParseError,
    );
  });

  it("max_tokens stop_reason throws JudgeParseError (output truncated)", async () => {
    const anthropic = makeStubAnthropic(async () => ({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"factual_correctness":3' }],
      usage: { input_tokens: 100, output_tokens: 2000 },
    }));
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    await expect(client.gradeSingle(SAMPLE_SINGLE_REQ)).rejects.toBeInstanceOf(
      JudgeParseError,
    );
  });
});

// ===========================================================================
// Schema validation — gradePair
// ===========================================================================

describe("gradePair — schema validation", () => {
  it("malformed JSON throws JudgeParseError", async () => {
    const anthropic = makeStubAnthropic(async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "not valid json {" }],
      usage: { input_tokens: 100, output_tokens: 10 },
    }));
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    await expect(client.gradePair(SAMPLE_PAIR_REQ)).rejects.toBeInstanceOf(
      JudgeParseError,
    );
  });

  it("missing A key throws JudgeParseError", async () => {
    const anthropic = makeStubAnthropic(async () => ({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            B: {
              factual_correctness: 2,
              completeness: 2,
              actionability: 2,
              hallucination: 3,
            },
          }),
        },
      ],
      usage: { input_tokens: 100, output_tokens: 10 },
    }));
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    await expect(client.gradePair(SAMPLE_PAIR_REQ)).rejects.toBeInstanceOf(
      JudgeParseError,
    );
  });

  it("missing B key throws JudgeParseError", async () => {
    const anthropic = makeStubAnthropic(async () => ({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            A: {
              factual_correctness: 3,
              completeness: 2,
              actionability: 3,
              hallucination: 3,
            },
          }),
        },
      ],
      usage: { input_tokens: 100, output_tokens: 10 },
    }));
    const client = createJudgeClient({ anthropic, sleep: async () => {} });
    await expect(client.gradePair(SAMPLE_PAIR_REQ)).rejects.toBeInstanceOf(
      JudgeParseError,
    );
  });
});
