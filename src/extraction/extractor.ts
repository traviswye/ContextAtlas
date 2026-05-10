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
 * detail of AnthropicAPIDirectExtractor at Step 1.4. ClaudeCodeOnly-
 * Extractor (Mode A) does NOT use ExtractionClient internally
 * (executes via Claude Code session tools, not @anthropic-ai/sdk).
 */

import type { ExtractedClaim } from "./prompt.js";
import type { ContextAtlasConfig } from "../types.js";
import type { ExtractionClient } from "./anthropic-client.js";

/**
 * Cost model semantics per Q1.0.5 δ separate cost_model field lock.
 * `cost_usd` reports numeric Anthropic API cost ($0 for Skills path);
 * `cost_model` captures path semantics for downstream reporting.
 */
export type CostModel = "api" | "subscription-bounded";

/**
 * Per-cycle extraction result aggregating claims + cost accounting.
 */
export interface ExtractionResult {
  claims: ExtractedClaim[];
  files_extracted: number;
  files_unchanged: number;
  files_deleted: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  cost_model: CostModel;
}

/**
 * Dependency injection bag for Extractor implementations. Concrete
 * extractors receive context via the extract() method param; test
 * seams inject stubs for client-override patterns per Q1.0.6 α + γ
 * lock.
 */
export interface ExtractorContext {
  /** Resolved config from .contextatlas.yml + CLI flag overrides. */
  config: ContextAtlasConfig;
  /** Absolute path to repo root being indexed. */
  configRoot: string;
  /** Atlas database path (from config; default `.contextatlas/index.db`). */
  databasePath: string;
  /** Atlas JSON output path (committed atlas artifact per ADR-06). */
  atlasJsonPath: string;
  /** Whether this is a `--full` re-index vs incremental. */
  full: boolean;
  /** Test seam: client override per Q1.0.6 stub-client pattern. */
  clientOverride?: ExtractionClient;
}

/**
 * Strategy interface: per-cycle extraction abstraction.
 *
 * Concrete implementations:
 *   - ClaudeCodeOnlyExtractor (Skills path; Mode A; subscription-bounded)
 *   - AnthropicAPIDirectExtractor (API direct; Mode B; pay-per-use)
 *
 * Factory: getExtractor(config) → Extractor concrete instance.
 */
export interface Extractor {
  /** Cost model semantics this implementation reports. */
  readonly costModel: CostModel;
  /**
   * Run extraction against the configured repo. Returns aggregated
   * result + cost accounting. Throws on irrecoverable failure.
   */
  extract(context: ExtractorContext): Promise<ExtractionResult>;
}
