/**
 * Strategy pattern wrapper for v0.7+ user-choice extraction
 * configuration per ADR-02 graduation reframe + Q1.0.10 γ lock.
 *
 * Two substantive runtime modes coexist (Path (iii) collapse lock at
 * v0.7 Step 1.2):
 *   - Mode A `claude-code-only` — Skills path; subscription-bounded
 *   - Mode B `anthropic-api-direct` — Anthropic API direct; pay-per-use
 *
 * Plus 1 legacy deprecated alias `anthropic-api-claude-code` →
 * AnthropicAPIDirectExtractor + stderr deprecation warning at
 * factory-time per Q1.0.8 lock; alias removed at v0.8+.
 *
 * Strategy abstraction operates at per-cycle level (per-repo
 * extraction-as-a-whole). Existing ExtractionClient (anthropic-
 * client.ts) operates at per-document level; becomes implementation
 * detail of AnthropicAPIDirectExtractor at Step 1.4a. ClaudeCodeOnly-
 * Extractor (Mode A) does NOT use ExtractionClient internally
 * (executes via Claude Code session tools, not @anthropic-ai/sdk);
 * Skills functional implementation lands at Step 1.4b.
 *
 * Path A pre-state amendment at Step 1.4a per Q-pre-4 substrate-
 * evolution drift framework: ExtractorContext + ExtractionResult
 * shapes refined from Step 1.3 skeleton to match runtime resource
 * needs identified during Step 1.4a implementation. Adjustment
 * BEFORE substantive Step 1.4a work shipped against superseded
 * Step 1.3 interface scope.
 */

import type { Database as DatabaseInstance } from "better-sqlite3";

import type {
  ContextAtlasConfig,
  LanguageAdapter,
  LanguageCode,
} from "../types.js";

import type { ExtractionClient } from "./anthropic-client.js";
import type { ExtractionPipelineResult } from "./pipeline.js";

/**
 * Cost model semantics per Q1.0.5 δ separate cost_model field lock.
 * `cost_usd` reports numeric Anthropic API cost ($0 for Skills path);
 * `cost_model` captures path semantics for downstream reporting.
 */
export type CostModel = "api" | "subscription-bounded";

/**
 * Per-cycle extraction result wrapping pipeline result + cost model
 * semantics. Shape-preservation: existing ExtractionPipelineResult
 * fields exposed verbatim via `pipelineResult` field; new `costModel`
 * field captures path semantics per Q1.0.5 δ lock.
 *
 * cli-runner.ts summary printing consumes `pipelineResult` fields
 * unchanged; new cost_model field surfaces in summary output per
 * v0.7 launch-bearing reframe extraction-path-visibility.
 */
export interface ExtractionResult {
  pipelineResult: ExtractionPipelineResult;
  costModel: CostModel;
}

/**
 * Dependency injection bag for Extractor implementations. Contains
 * runtime resources cli-runner.ts manages (db, adapters, env access)
 * + extraction-pipeline parameters (paths, version, overrides).
 *
 * Test seams: clientOverride (Q1.0.6 α + γ stub-client pattern) +
 * readEnv (env-var injection for ANTHROPIC_API_KEY discovery at
 * Mode B).
 */
export interface ExtractorContext {
  /** Resolved config from .contextatlas.yml + CLI flag overrides. */
  config: ContextAtlasConfig;
  /** Absolute path to repo root containing .contextatlas.yml. */
  configRoot: string;
  /** Absolute path to source root (configRoot OR config.source.root). */
  sourceRoot: string;
  /** Already-opened SQLite database instance (lifecycle managed by cli-runner). */
  db: DatabaseInstance;
  /** Initialized language adapters (lifecycle managed by cli-runner). */
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>;
  /** Whether this is a `--full` re-index vs incremental. */
  full: boolean;
  /** ContextAtlas package version (semver string). */
  contextatlasVersion: string;
  /** ContextAtlas binary git HEAD SHA (atlas schema v1.3+; nullable on non-git). */
  contextatlasCommitSha: string | null;
  /** Resolved budget warn override (CLI flag OR config). Optional. */
  budgetWarnUsd?: number;
  /** Resolved narrow-attribution mode (CLI flag OR config). Optional. */
  narrowAttribution?: "drop" | "drop-with-fallback";
  /** Test seam: client override per Q1.0.6 stub-client pattern (Mode B). */
  clientOverride?: ExtractionClient;
  /** Env-var reader (defaults to process.env access; test seam). */
  readEnv: (name: string) => string | undefined;
}

/**
 * Strategy interface: per-cycle extraction abstraction.
 *
 * Concrete implementations:
 *   - ClaudeCodeOnlyExtractor (Skills path; Mode A; subscription-bounded;
 *     functional impl lands at Step 1.4b)
 *   - AnthropicAPIDirectExtractor (API direct; Mode B; pay-per-use;
 *     functional impl shipped at Step 1.4a)
 *
 * Factory: getExtractor(config) → Extractor concrete instance.
 */
export interface Extractor {
  /** Cost model semantics this implementation reports. */
  readonly costModel: CostModel;
  /**
   * Run extraction against the configured repo. Returns aggregated
   * result + cost accounting. Throws on irrecoverable failure
   * (caller maps to ADR-12 exit codes per ExtractionSetupError vs
   * generic Error distinction below).
   */
  extract(context: ExtractorContext): Promise<ExtractionResult>;
}

/**
 * Setup-phase error class for ADR-12 exit-code mapping discipline.
 * Throw from Extractor.extract() when failure is setup-related
 * (missing API key; misconfigured architecture; etc.) — caller maps
 * to ADR-12 exit code 2. Generic Error throws map to exit code 1
 * (pipeline failure).
 *
 * Example: AnthropicAPIDirectExtractor throws ExtractionSetupError
 * when ANTHROPIC_API_KEY is absent (Mode B requires API key).
 */
export class ExtractionSetupError extends Error {
  readonly kind = "setup" as const;
  constructor(message: string) {
    super(message);
    this.name = "ExtractionSetupError";
  }
}
