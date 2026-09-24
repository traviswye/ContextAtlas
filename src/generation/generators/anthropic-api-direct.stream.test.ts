/**
 * v1.2 SDK 0.128.0 migration tests for the generate-adrs CLI call.
 * They drive the real SDK streaming path (messages.stream(...)
 * .finalMessage()) through a stubbed global `fetch` that serves SSE —
 * the generator constructs its own client with the default fetch, so
 * no production test seam is needed.
 */

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContextAtlasConfig } from "../../types.js";
import { GenerationSetupError, type GeneratorContext } from "../generator.js";
import {
  GENERATION_MAX_TOKENS,
  GENERATION_MODEL,
  OPUS_INPUT_PRICE_PER_MILLION_USD,
  OPUS_OUTPUT_PRICE_PER_MILLION_USD,
} from "../prompt.js";
import { AnthropicAPIDirectGenerator } from "./anthropic-api-direct.js";

const CONFIG: ContextAtlasConfig = {
  version: 1,
  languages: ["typescript"],
  adrs: { path: "docs/adr/", format: "markdown-frontmatter" },
  docs: { include: [] },
  git: { recentCommits: 0 },
  index: { model: GENERATION_MODEL },
  atlas: {
    committed: true,
    path: ".contextatlas/atlas.json",
    localCache: ".contextatlas/index.db",
  },
};

interface RecordedRequest {
  url: string;
  init: RequestInit | undefined;
}

function sseEvents(events: Array<[string, Record<string, unknown>]>): string {
  return events
    .map(
      ([type, data]) =>
        `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`,
    )
    .join("");
}

function messageStart(inputTokens: number): [string, Record<string, unknown>] {
  return [
    "message_start",
    {
      message: {
        id: "msg_gen",
        type: "message",
        role: "assistant",
        model: GENERATION_MODEL,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: inputTokens, output_tokens: 1 },
      },
    },
  ];
}

/** A full stream: omitted-display thinking block, then one text block. */
function messageStream(opts: {
  text: string;
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
}): string {
  return sseEvents([
    messageStart(opts.inputTokens),
    [
      "content_block_start",
      { index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
    ],
    ["content_block_delta", { index: 0, delta: { type: "signature_delta", signature: "sig" } }],
    ["content_block_stop", { index: 0 }],
    ["content_block_start", { index: 1, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { index: 1, delta: { type: "text_delta", text: opts.text } }],
    ["content_block_stop", { index: 1 }],
    [
      "message_delta",
      {
        delta: { stop_reason: opts.stopReason, stop_sequence: null },
        usage: { output_tokens: opts.outputTokens },
      },
    ],
    ["message_stop", {}],
  ]);
}

function stubFetch(respond: () => Response): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return respond();
  });
  return requests;
}

function sseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/** Serves `prefix` as SSE bytes, then errors the body like a dropped socket. */
function droppingSseResponse(prefix: string, error: Error): Response {
  const bytes = new TextEncoder().encode(prefix);
  let sent = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(bytes);
        return;
      }
      controller.error(error);
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function errorResponse(status: number, type: string, message: string): Response {
  return new Response(
    JSON.stringify({ type: "error", error: { type, message } }),
    { status, headers: { "content-type": "application/json" } },
  );
}

/** message_start + the start of a text block, with no message_stop. */
function partialStream(): string {
  return sseEvents([
    messageStart(10),
    ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { index: 0, delta: { type: "text_delta", text: '{"adrs":[' } }],
  ]);
}

const ONE_ADR = {
  adrs: [
    {
      number: 1,
      title: "Stream long generations",
      symbols: ["AnthropicAPIDirectGenerator"],
      severity_summary: "hard",
      markdown_body: "# ADR-01: Stream long generations\n\nBody.",
    },
  ],
};

describe("AnthropicAPIDirectGenerator — streaming call (SDK 0.128.0)", () => {
  let tmpRoot: string;
  let outDir: string;
  let stderr: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), "ca-gen-stream-"));
    outDir = path.join(tmpRoot, "docs", "adr");
    stderr = "";
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await rm(tmpRoot, { recursive: true, force: true });
  });

  function context(): GeneratorContext {
    return {
      config: CONFIG,
      configRoot: tmpRoot,
      sourceRoot: tmpRoot,
      db: undefined as never,
      adapters: new Map(),
      contextatlasVersion: "0.0.1-test",
      contextatlasCommitSha: null,
      outputAdrPath: outDir,
      readEnv: (name) => (name === "ANTHROPIC_API_KEY" ? "sk-ant-test" : undefined),
      skipConfirmation: true,
      writeStderr: (chunk) => {
        stderr += chunk;
      },
    };
  }

  /** Runs the generator and returns what it rejects with (null on success). */
  function failureOf(ctx: GeneratorContext): Promise<unknown> {
    return new AnthropicAPIDirectGenerator().generate(ctx).then(
      () => null,
      (err: unknown) => err,
    );
  }

  it("sends adaptive thinking + effort xhigh on a stream and writes ADRs from finalMessage()", async () => {
    // authToken: null must keep an env Bearer token off the request.
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "env-bearer-token");
    const requests = stubFetch(() =>
      sseResponse(
        messageStream({
          text: JSON.stringify(ONE_ADR),
          stopReason: "end_turn",
          inputTokens: 1234,
          outputTokens: 777,
        }),
      ),
    );

    const result = await new AnthropicAPIDirectGenerator().generate(context());

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toMatch(/\/v1\/messages$/);
    const body = JSON.parse(String(request.init?.body)) as Record<string, unknown>;
    expect(body.model).toBe(GENERATION_MODEL);
    expect(body.max_tokens).toBe(GENERATION_MAX_TOKENS);
    expect(body.stream).toBe(true);
    expect(body.thinking).toStrictEqual({ type: "adaptive" });
    expect(body.output_config).toStrictEqual({ effort: "xhigh" });
    expect(JSON.stringify(body)).not.toContain("budget_tokens");
    expect(body).not.toHaveProperty("temperature");
    const headers = new Headers(request.init?.headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
    expect(headers.get("authorization")).toBeNull();

    expect(result.filesGenerated).toBe(1);
    expect(result.apiCalls).toBe(1);
    expect(result.inputTokens).toBe(1234);
    expect(result.outputTokens).toBe(777);
    expect(result.costUsd).toBeCloseTo(
      (1234 / 1_000_000) * OPUS_INPUT_PRICE_PER_MILLION_USD +
        (777 / 1_000_000) * OPUS_OUTPUT_PRICE_PER_MILLION_USD,
      10,
    );
    const written = await readFile(
      path.join(outDir, "ADR-01-stream-long-generations.md"),
      "utf8",
    );
    expect(written).toContain("id: ADR-01");
    expect(written).toContain("# ADR-01: Stream long generations");
    expect(stderr).toContain("generate-adrs complete.");
  });

  it("fails with an actionable truncation error when the stream stops at max_tokens", async () => {
    stubFetch(() =>
      sseResponse(
        messageStream({
          text: '{"adrs":[{"number":1,"title":"Trunc',
          stopReason: "max_tokens",
          inputTokens: 900,
          outputTokens: GENERATION_MAX_TOKENS,
        }),
      ),
    );

    const failure = await new AnthropicAPIDirectGenerator()
      .generate(context())
      .then(
        () => null,
        (err: unknown) => err,
      );

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(GenerationSetupError);
    const message = (failure as Error).message;
    expect(message).toContain('stop_reason "max_tokens"');
    expect(message).toContain(`${GENERATION_MAX_TOKENS}-token max_tokens budget`);
    expect(message).toContain("no ADRs were written");
    expect(message).toContain("--reference-context");
    // The user-facing YAML key (config parser rejects `excludePattern`).
    expect(message).toContain("extraction.exclude_pattern");
    expect(message).not.toContain("excludePattern");
    expect(await readdir(outDir).catch(() => [])).toEqual([]);
  });

  it("explains a model_context_window_exceeded stop as a full context window, not the max_tokens budget", async () => {
    stubFetch(() =>
      sseResponse(
        messageStream({
          text: '{"adrs":[{"number":1,"title":"Trunc',
          stopReason: "model_context_window_exceeded",
          inputTokens: 990_000,
          outputTokens: 10_000,
        }),
      ),
    );

    const failure = await failureOf(context());

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(GenerationSetupError);
    const message = (failure as Error).message;
    expect(message).toContain('stop_reason "model_context_window_exceeded"');
    expect(message).toContain("context window");
    expect(message).not.toContain("max_tokens budget");
    expect(message).toContain("no ADRs were written");
    expect(message).toContain("--reference-context");
    expect(message).toContain("extraction.exclude_pattern");
    expect(await readdir(outDir).catch(() => [])).toEqual([]);
  });

  it("maps a transport drop mid-stream to an actionable interrupted-stream error", async () => {
    const requests = stubFetch(() =>
      droppingSseResponse(partialStream(), new TypeError("terminated")),
    );

    const failure = await failureOf(context());

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(GenerationSetupError);
    const message = (failure as Error).message;
    expect(message).toContain("generate-adrs:");
    expect(message).toContain("interrupted");
    expect(message).toContain("terminated");
    expect(message).toContain("No ADRs were written");
    expect(message).toContain("re-run the command");
    expect(requests).toHaveLength(1);
    expect(await readdir(outDir).catch(() => [])).toEqual([]);
  });

  it("maps a stream that ends before message_stop to the interrupted-stream error", async () => {
    stubFetch(() => sseResponse(partialStream()));

    const failure = await failureOf(context());

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain("interrupted");
    expect(message).toContain("stream ended without producing a Message");
    expect(message).toContain("re-run the command");
    expect(await readdir(outDir).catch(() => [])).toEqual([]);
  });

  it("maps an HTTP 400 to a plain Error naming both common causes and the API message", async () => {
    const requests = stubFetch(() =>
      errorResponse(
        400,
        "invalid_request_error",
        "prompt is too long: 1200000 tokens > 1000000 maximum",
      ),
    );

    const failure = await failureOf(context());

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(GenerationSetupError);
    const message = (failure as Error).message;
    expect(message).toContain("(400)");
    expect(message).toContain("context window");
    expect(message).toContain("prompt is too long: 1200000 tokens > 1000000 maximum");
    expect(requests).toHaveLength(1);
  });

  it.each([
    [404, "not_found_error", GENERATION_MODEL],
    [413, "request_too_large", "extraction.exclude_pattern"],
    [422, "invalid_request_error", "not a transient error"],
  ])(
    "reports HTTP %i as non-transient (no re-run advice)",
    async (status, type, hint) => {
      const requests = stubFetch(() => errorResponse(status, type, "nope"));

      const failure = await failureOf(context());

      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(GenerationSetupError);
      const message = (failure as Error).message;
      expect(message).toContain(`status ${status}, type ${type}`);
      expect(message).toContain(hint);
      expect(message).not.toContain("Re-run the command");
      expect(requests).toHaveLength(1);
    },
  );

  it("maps an HTTP 401 to GenerationSetupError (ADR-12 exit code 2)", async () => {
    const requests = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            type: "error",
            error: { type: "authentication_error", message: "invalid x-api-key" },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
    );

    const failure = await new AnthropicAPIDirectGenerator()
      .generate(context())
      .then(
        () => null,
        (err: unknown) => err,
      );

    expect(failure).toBeInstanceOf(GenerationSetupError);
    expect((failure as Error).message).toContain("ANTHROPIC_API_KEY");
    expect(requests).toHaveLength(1);
  });

  it("names the error type when the stream fails mid-flight (SSE error event)", async () => {
    stubFetch(() =>
      sseResponse(
        sseEvents([messageStart(10)]) +
          `event: error\ndata: ${JSON.stringify({
            type: "error",
            error: { type: "overloaded_error", message: "Overloaded" },
          })}\n\n`,
      ),
    );

    const failure = await new AnthropicAPIDirectGenerator()
      .generate(context())
      .then(
        () => null,
        (err: unknown) => err,
      );

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain("type overloaded_error");
    expect(message).toContain("mid-stream");
    expect(message).toContain("Re-run the command");
  });
});
