/**
 * Anthropic SDK wrapper for v0.5 LLM-judge grading calls.
 *
 * Per ADR-02 (amended 2026-04-30), src/grading/ is one of two
 * permitted callers of the Anthropic API. Per ADR-19 §2, Sonnet 4.6
 * is the default judge; Opus 4.7 is the escalation backup.
 *
 * Two grading modes are exposed:
 *   - gradeSingle: one trial, one answer → RubricResult.
 *     Used by Step 6 calibration (within-judge consistency
 *     regrade; Travis-intuition correlation grading).
 *   - gradePair: one trial, two anonymized answers (A and B) →
 *     paired RubricResult. Used by Step 8 production grading.
 *
 * Both modes share the underlying messages.create call, retry-with-
 * backoff loop, error classification, and cost tracking. They differ
 * only in prompt shape (single answer vs A/B pair) and output parser
 * (one score set vs two).
 *
 * Temperature is set to 0 by default (ADR-19 §2 deterministic-where-
 * possible config) for models that accept sampling parameters (the
 * Sonnet 4.6 default judge). Models in
 * MODELS_REJECTING_SAMPLING_PARAMS (Opus 4.7: non-default
 * `temperature` / `top_p` / `top_k` return a 400) are called WITHOUT
 * `temperature`, so the Opus 4.7 escalation path runs with the
 * model's default sampling.
 * Note: temperature 0 is approximately-deterministic, not strictly
 * so — LLM stochasticity persists in tie-breaks. The within-judge
 * consistency check (ADR-19 §5 (a)) is the empirical reliability
 * measurement. If Anthropic adds a seed parameter before Step 6
 * calibration, switch to seeded mode and reduce within-judge regrade
 * substrate (10 → 5) since determinism becomes guaranteed.
 *
 * Retry ownership: this wrapper is the single retry layer. Every
 * request goes out with the SDK per-request option `{ maxRetries: 0 }`
 * so SDK-internal retries (default 2) never stack underneath the
 * wrapper's `maxRetries`, whatever the caller's client was built with.
 *
 * This module deliberately does NOT import from src/extraction/
 * (per ADR-02 amendment intent — research-time modules independent).
 * The retry loop, classifyError, and backoff helpers are duplicated
 * locally rather than shared (`./retry-policy.ts` is the local copy
 * of the extraction retry policy).
 */

import type Anthropic from "@anthropic-ai/sdk";

import { computeCostUsd } from "./pricing.js";
import {
  classifyApiError,
  computeBackoffMs,
  type RetryClassification,
} from "./retry-policy.js";
import type {
  AxisName,
  AxisScore,
  JudgeCallResult,
  ModelId,
  PairedJudgeCallResult,
  RubricResult,
  UsageInfo,
} from "./types.js";

// ============================================================================
// Constants per ADR-19 §2 (Step 2 lock; consumers import these)
// ============================================================================

export const SONNET_46_MODEL: ModelId = "claude-sonnet-4-6";
export const OPUS_47_MODEL: ModelId = "claude-opus-4-7";
export const DEFAULT_JUDGE_TEMPERATURE = 0;
export const DEFAULT_MAX_TOKENS = 2_000;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_BASE_BACKOFF_MS = 1_000;
export const DEFAULT_MAX_BACKOFF_MS = 30_000;

/**
 * Judge models that reject sampling parameters: the API returns a 400
 * when `temperature`, `top_p` or `top_k` is sent (claude-api model-
 * migration guide, Opus 4.7 breaking changes). The SDK 0.128.0
 * typings note that `temperature` 1.0 and `top_p` >= 0.99 are still
 * accepted for backwards compatibility; the judge's default of 0 is
 * not. `temperature` is omitted from requests to these models.
 */
export const MODELS_REJECTING_SAMPLING_PARAMS: ReadonlySet<ModelId> =
  new Set<ModelId>([OPUS_47_MODEL]);

// ============================================================================
// Error classification — local copy per ADR-02 amendment intent
// ============================================================================

export type { RetryClassification };

/**
 * Retry: 429, 408, 409, 5xx (incl. 529), connection errors/timeouts.
 * Fail: 400/401/403/404/422 and other statuses, and anything that is
 * not an Anthropic API error. An explicit `x-should-retry` response
 * header overrides the status rules (as in the SDK). Errors from
 * another copy of the SDK are classified by shape (see
 * `./retry-policy.ts`).
 */
export function classifyError(err: unknown): RetryClassification {
  return classifyApiError(err);
}

// ============================================================================
// Schema validation — rubric output parsers
// ============================================================================

const AXIS_NAMES: readonly AxisName[] = [
  "factual_correctness",
  "completeness",
  "actionability",
  "hallucination",
];

export class JudgeParseError extends Error {
  public readonly responseText: string;
  constructor(message: string, responseText: string) {
    super(message);
    this.name = "JudgeParseError";
    this.responseText = responseText;
  }
}

function isValidScore(v: unknown): v is AxisScore {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

function parseRubricResult(obj: unknown): RubricResult {
  if (!obj || typeof obj !== "object") {
    throw new Error("rubric result must be an object");
  }
  const o = obj as Record<string, unknown>;
  const out = {} as RubricResult;
  for (const axis of AXIS_NAMES) {
    if (!(axis in o)) throw new Error(`missing axis: ${axis}`);
    if (!isValidScore(o[axis])) {
      throw new Error(`axis ${axis} must be 0|1|2|3, got ${String(o[axis])}`);
    }
    out[axis] = o[axis] as AxisScore;
  }
  return out;
}

function parseSingleResponse(text: string): RubricResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JudgeParseError("rubric response is not valid JSON", text);
  }
  try {
    return parseRubricResult(parsed);
  } catch (err) {
    throw new JudgeParseError(
      `single-mode rubric schema invalid: ${(err as Error).message}`,
      text,
    );
  }
}

function parsePairedResponse(text: string): {
  scoresA: RubricResult;
  scoresB: RubricResult;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JudgeParseError("rubric response is not valid JSON", text);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new JudgeParseError("paired result must have A and B keys", text);
  }
  const o = parsed as Record<string, unknown>;
  try {
    return {
      scoresA: parseRubricResult(o.A),
      scoresB: parseRubricResult(o.B),
    };
  } catch (err) {
    throw new JudgeParseError(
      `paired-mode rubric schema invalid: ${(err as Error).message}`,
      text,
    );
  }
}

// ============================================================================
// Client factory + grade methods
// ============================================================================

export interface SingleGradeRequest {
  rubricPrompt: string;
  prompt: string;
  answer: string;
  model?: ModelId;
}

export interface PairGradeRequest {
  rubricPrompt: string;
  prompt: string;
  answerA: string;
  answerB: string;
  model?: ModelId;
}

export interface JudgeClient {
  gradeSingle(req: SingleGradeRequest): Promise<JudgeCallResult>;
  gradePair(req: PairGradeRequest): Promise<PairedJudgeCallResult>;
}

export interface CreateJudgeClientOptions {
  /**
   * SDK client (or a structurally compatible one). Its own retry
   * setting is overridden per request with `maxRetries: 0`; retries
   * are governed solely by `maxRetries` below.
   */
  anthropic: Anthropic;
  defaultModel?: ModelId;
  /** Max retry attempts for retryable errors. Default: 3. */
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  /**
   * Sampling temperature. Default: 0 (ADR-19 §2). Sent only to models
   * that accept sampling parameters; ignored (not sent) for models in
   * MODELS_REJECTING_SAMPLING_PARAMS, e.g. Opus 4.7.
   */
  temperature?: number;
  maxTokens?: number;
  /** For tests — inject a fake sleep. Default: real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

export function createJudgeClient(
  options: CreateJudgeClientOptions,
): JudgeClient {
  const {
    anthropic,
    defaultModel = SONNET_46_MODEL,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseBackoffMs = DEFAULT_BASE_BACKOFF_MS,
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
    temperature = DEFAULT_JUDGE_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    sleep = defaultSleep,
  } = options;

  async function callApi(
    userMessage: string,
    model: ModelId,
  ): Promise<{ text: string; usage: UsageInfo }> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const response = await anthropic.messages.create(
          {
            model,
            max_tokens: maxTokens,
            ...(MODELS_REJECTING_SAMPLING_PARAMS.has(model)
              ? {}
              : { temperature }),
            messages: [{ role: "user", content: userMessage }],
          },
          // Client-side SDK option (not sent on the wire): the wrapper
          // owns retries — see module JSDoc.
          { maxRetries: 0 },
        );
        if (response.stop_reason === "max_tokens") {
          throw new JudgeParseError(
            "judge response hit max_tokens; output likely truncated",
            extractText(response) ?? "",
          );
        }
        const text = extractText(response);
        if (text === null) {
          throw new JudgeParseError(
            "judge response had no text content block",
            "",
          );
        }
        return { text, usage: readUsage(response) };
      } catch (err) {
        if (err instanceof JudgeParseError) throw err;
        const classification = classifyError(err);
        if (classification === "fail") throw err;
        attempt++;
        if (attempt > maxRetries) throw err;
        const backoff = computeBackoffMs(
          attempt,
          baseBackoffMs,
          maxBackoffMs,
          err,
        );
        await sleep(backoff);
      }
    }
  }

  return {
    async gradeSingle(req: SingleGradeRequest): Promise<JudgeCallResult> {
      const model = req.model ?? defaultModel;
      const userMessage = formatSingleMessage(req);
      const { text, usage } = await callApi(userMessage, model);
      const scores = parseSingleResponse(text);
      return { scores, usage, costUsd: computeCostUsd(usage, model), model };
    },
    async gradePair(req: PairGradeRequest): Promise<PairedJudgeCallResult> {
      const model = req.model ?? defaultModel;
      const userMessage = formatPairMessage(req);
      const { text, usage } = await callApi(userMessage, model);
      const { scoresA, scoresB } = parsePairedResponse(text);
      return {
        scoresA,
        scoresB,
        usage,
        costUsd: computeCostUsd(usage, model),
        model,
      };
    },
  };
}

// ============================================================================
// Message formatting + helpers
// ============================================================================

function formatSingleMessage(req: SingleGradeRequest): string {
  return `${req.rubricPrompt}\n\nPrompt:\n${req.prompt}\n\nAnswer:\n${req.answer}\n`;
}

function formatPairMessage(req: PairGradeRequest): string {
  return `${req.rubricPrompt}\n\nPrompt:\n${req.prompt}\n\nAnswer A:\n${req.answerA}\n\nAnswer B:\n${req.answerB}\n`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readUsage(response: {
  usage?: { input_tokens?: number; output_tokens?: number };
}): UsageInfo {
  const u = response.usage;
  if (!u) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: typeof u.input_tokens === "number" ? u.input_tokens : 0,
    outputTokens: typeof u.output_tokens === "number" ? u.output_tokens : 0,
  };
}

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
