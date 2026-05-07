/**
 * Observability log writer for cohort observability per v0.6 Step
 * 6.2 / Q6.2.1 (JSONL format) + Q6.2.2 (observation shape lock at
 * Step 6.2 surface review).
 *
 * Writes newline-delimited JSON observations to local log file.
 * Append-only semantics; atomic single-line writes via
 * fs.appendFileSync. Log rotation deferred to v0.7+ pending size
 * empirical surface (cohort logs typically <10MB total per session).
 *
 * Per ADR-20 cohort observability contract: data collected =
 * MCP tool invocations + sanitized request args + response
 * shape; storage = local-only file at config.observability.logPath
 * (default .contextatlas/observe-log.jsonl); retention = cohort
 * exposure window + cycle-close synthesis.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

import type { SymbolKind } from "../types.js";

/**
 * Observation shape per Q6.2.2 lock + Refinement 1
 * (contextatlas_version field). Recorded per MCP tool invocation;
 * one JSONL line per observation.
 */
export interface Observation {
  readonly timestamp: string; // ISO 8601
  readonly contextatlas_version: string; // e.g., "0.6.0" from package.json
  readonly session_id: string; // anonymized hash; stable per process
  readonly tool: string; // tool name (get_symbol_context | find_by_intent | impact_of_change)
  readonly request_args: unknown; // sanitized request params
  readonly response: {
    readonly status: "success" | "error";
    readonly latency_ms: number;
    readonly result_summary?: {
      readonly symbol_id?: string;
      readonly symbol_kind?: SymbolKind;
      readonly result_count?: number;
    };
    readonly error_message?: string; // sanitized
  };
}

/**
 * Stable session id derived from process.pid + start timestamp.
 * Anonymized via SHA256; not user-correlatable across sessions.
 * Lazy-computed once per module load.
 */
let cachedSessionId: string | null = null;

export function getSessionId(): string {
  if (cachedSessionId !== null) return cachedSessionId;
  const seed = `${process.pid}:${Date.now()}`;
  cachedSessionId = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return cachedSessionId;
}

/**
 * Reset cached session id — TEST-ONLY seam. Production code should
 * never call this; the session-id-stability invariant requires the
 * cache to persist across the process lifetime.
 */
export function resetSessionIdForTesting(): void {
  cachedSessionId = null;
}

export interface ObservabilityWriterOptions {
  readonly logPath: string;
  readonly contextatlasVersion: string;
}

/**
 * Create an observability writer bound to a specific log path +
 * contextatlas version. Returned function appends one JSONL line
 * per call; ensures parent dir exists; surfaces actionable error
 * on write failure.
 */
export function createObservabilityWriter(
  options: ObservabilityWriterOptions,
): (observation: Omit<Observation, "contextatlas_version">) => void {
  // Ensure parent directory exists before any write.
  mkdirSync(dirname(options.logPath), { recursive: true });

  return (observation) => {
    const fullObservation: Observation = {
      ...observation,
      contextatlas_version: options.contextatlasVersion,
    };
    const line = JSON.stringify(fullObservation) + "\n";
    appendFileSync(options.logPath, line, "utf8");
  };
}
