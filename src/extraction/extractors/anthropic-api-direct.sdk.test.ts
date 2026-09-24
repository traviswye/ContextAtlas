/**
 * Production client construction for `contextatlas index` (no
 * clientOverride): drives AnthropicAPIDirectExtractor end-to-end on a
 * one-ADR fixture with a stubbed global `fetch`, so the SDK client the
 * extractor builds itself is the one that sends the requests.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type DatabaseInstance, openDatabase } from "../../storage/db.js";
import type { ContextAtlasConfig } from "../../types.js";
import type { ExtractorContext } from "../extractor.js";
import { EXTRACTION_MODEL } from "../prompt.js";

import { AnthropicAPIDirectExtractor } from "./anthropic-api-direct.js";

// Records the SDK client handed to the wrapper; the real wrapper runs.
const captured = vi.hoisted(() => ({ clients: [] as unknown[] }));
vi.mock("../anthropic-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../anthropic-client.js")>();
  return {
    ...actual,
    createExtractionClient: (
      options: Parameters<typeof actual.createExtractionClient>[0],
    ) => {
      captured.clients.push(options.anthropic);
      return actual.createExtractionClient(options);
    },
  };
});

const API_KEY = "sk-ant-test";

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

const RATE_LIMITED = () =>
  jsonResponse(
    429,
    { type: "error", error: { type: "rate_limit_error", message: "slow down" } },
    { "retry-after-ms": "1" },
  );

const OK_MESSAGE = () =>
  jsonResponse(200, {
    id: "msg_extract",
    type: "message",
    role: "assistant",
    model: EXTRACTION_MODEL,
    content: [{ type: "text", text: '{"claims":[]}' }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 11, output_tokens: 7 },
  });

function config(): ContextAtlasConfig {
  return {
    version: 1,
    languages: [],
    adrs: { path: "docs/adr", format: "markdown-frontmatter" },
    docs: { include: [] },
    git: { recentCommits: 0 },
    index: { model: EXTRACTION_MODEL },
    atlas: {
      committed: false,
      path: ".contextatlas/atlas.json",
      localCache: ".contextatlas/index.db",
    },
  };
}

describe("AnthropicAPIDirectExtractor — production SDK client (no clientOverride)", () => {
  let tmp: string;
  let db: DatabaseInstance;

  beforeEach(() => {
    captured.clients.length = 0;
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-extract-sdk-"));
    mkdirSync(pathJoin(tmp, "docs", "adr"), { recursive: true });
    mkdirSync(pathJoin(tmp, ".contextatlas"), { recursive: true });
    writeFileSync(
      pathJoin(tmp, "docs", "adr", "ADR-01-auth.md"),
      "---\nid: ADR-01\n---\nRequests authenticate with the API key only.\n",
    );
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    rmSync(tmp, { recursive: true, force: true });
  });

  function context(): ExtractorContext {
    return {
      config: config(),
      configRoot: tmp,
      sourceRoot: tmp,
      db,
      adapters: new Map(),
      full: false,
      contextatlasVersion: "0.0.1-test",
      contextatlasCommitSha: null,
      readEnv: (name) => (name === "ANTHROPIC_API_KEY" ? API_KEY : undefined),
    };
  }

  it("sends x-api-key only (an ANTHROPIC_AUTH_TOKEN env var adds no Bearer header) and leaves retries to the wrapper", async () => {
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "env-bearer-token");
    const responders = [RATE_LIMITED, OK_MESSAGE];
    const requests: Array<RequestInit | undefined> = [];
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      requests.push(init);
      const respond = responders[requests.length - 1];
      if (!respond) throw new Error("fake fetch: unexpected extra request");
      return respond();
    });

    const { pipelineResult } = await new AnthropicAPIDirectExtractor().extract(
      context(),
    );

    expect(pipelineResult.filesExtracted).toBe(1);
    // 429 then 200: the wrapper retried once.
    expect(requests).toHaveLength(2);
    for (const init of requests) {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe(API_KEY);
      expect(headers.get("authorization")).toBeNull();
    }

    // Construction options: API key only, SDK retries off.
    expect(captured.clients).toHaveLength(1);
    const anthropic = captured.clients[0] as Anthropic;
    expect(anthropic.apiKey).toBe(API_KEY);
    expect(anthropic.authToken).toBeNull();
    expect(anthropic.maxRetries).toBe(0);
  });
});
