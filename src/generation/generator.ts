/**
 * Strategy pattern wrapper for the generate-adrs feature.
 *
 * Parallel to `src/extraction/extractor.ts` per Q2.2.a.3 β lock at
 * v0.7 Step 2.2.a pre-implementation surface: NEW Generator interface
 * + concrete implementations rather than mode-fielded reuse of
 * Extractor. Substantive rationale: extraction = read prose substrate
 * → produce structured claim list; generation = read code substrate →
 * produce ADR documents. Substantively distinct contracts; forcing
 * single interface adds awkward mode-field dispatch.
 *
 * Two runtime modes coexist under Path-3 entry-point-determined
 * architecture (ADR-02 v0.7 Step 1.4b inheritance):
 *   - Mode A `claude-code-only` — `/generate-adrs` Skills path;
 *     subscription-bounded; functional implementation deferred to a
 *     future cycle (v0.7 ships informational-stub for legacy alias
 *     paths)
 *   - Mode B `anthropic-api-direct` — `contextatlas generate-adrs`
 *     CLI path; pay-per-use; functional implementation lands at
 *     Step 2.2.a.2 substantive interpretive content surface
 *
 * Step 2.2.a.1 ships skeleton infrastructure (this file + factory +
 * concrete skeletons + Path-γ CLI subcommand + CLI dispatcher); Step
 * 2.2.a.2 ships substantive content (`GENERATE_ADRS_PROMPT` drafting
 * + Skills SKILL.md + reference-context feature + functional
 * `AnthropicAPIDirectGenerator.generate`).
 */

import type { Database as DatabaseInstance } from "better-sqlite3";

import type { ExtractionClient } from "../extraction/anthropic-client.js";
import type { CostModel } from "../extraction/extractor.js";
import type {
  ContextAtlasConfig,
  LanguageAdapter,
  LanguageCode,
} from "../types.js";

/**
 * Per-cycle generation result. Mirrors `ExtractionResult` shape so
 * Step 2.2.a.2 + future substep evolution can wire CLI summary
 * printing parallel to extraction. `cost_model` field captures path
 * semantics per Q1.0.5 δ lock inheritance.
 */
export interface GenerationResult {
  /** Number of ADR files written to `outputAdrPath`. */
  filesGenerated: number;
  /** Anthropic API cost ($0 for Skills path). */
  costUsd: number;
  /** Anthropic API call count (0 for Skills path). */
  apiCalls: number;
  /** Anthropic API input tokens (0 for Skills path). */
  inputTokens: number;
  /** Anthropic API output tokens (0 for Skills path). */
  outputTokens: number;
  /** Wall-clock generation duration. */
  wallClockMs: number;
  /** Cost model semantics per Q1.0.5 δ. */
  costModel: CostModel;
}

/**
 * Dependency injection bag for Generator implementations. Parallels
 * `ExtractorContext` shape with generation-specific fields layered in.
 *
 * Reference-context handling (per Travis Step 2.2.a.1 Observation 2):
 * `referenceContextPath` lives at Generator interface level rather
 * than concrete implementation level so the feature is part of the
 * Generator contract semantics. Concrete implementations decide how
 * to use reference context (or ignore it for stub).
 */
export interface GeneratorContext {
  /** Resolved config from `.contextatlas.yml` + CLI flag overrides. */
  config: ContextAtlasConfig;
  /** Absolute path to repo root containing `.contextatlas.yml`. */
  configRoot: string;
  /** Absolute path to source root (configRoot OR config.source.root). */
  sourceRoot: string;
  /** Already-opened SQLite database instance (lifecycle managed by caller). */
  db: DatabaseInstance;
  /** Initialized language adapters (lifecycle managed by caller). */
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>;
  /** ContextAtlas package version (semver string). */
  contextatlasVersion: string;
  /** ContextAtlas binary git HEAD SHA (atlas schema v1.3+; nullable on non-git). */
  contextatlasCommitSha: string | null;
  /**
   * Absolute output path for generated ADRs. Defaults to
   * `config.adrs.path` resolved against `configRoot`.
   */
  outputAdrPath: string;
  /**
   * Optional reference context path per Step 2.1.a Travis SECOND
   * substantive reframe. When set, Generator implementations walk
   * the reference path (multi-format per Scope γ' substrate from
   * Step 2.1.a) and include the contents as PROMPT INPUT for
   * generation. Reference context is NOT direct extraction
   * substrate — generated ADRs are canonical ContextAtlas format.
   *
   * Step 2.2.a.2 substantive surface populates the CLI
   * `--reference-context <path>` flag into this field.
   */
  referenceContextPath?: string;
  /** Resolved budget warn override (CLI flag OR config). Optional. */
  budgetWarnUsd?: number;
  /** Test seam: client override per Q1.0.6 stub-client pattern (Mode B). */
  clientOverride?: ExtractionClient;
  /** Env-var reader (defaults to process.env access; test seam). */
  readEnv: (name: string) => string | undefined;
  /**
   * True when the caller has bypassed the pre-flight cost-estimate
   * confirmation prompt (CLI `--yes` / `--no-confirm` flag per Lock 3,
   * or Skills surface where confirmation is mediated by the user's
   * Claude Code session, not by ContextAtlas).
   *
   * When false (default), `confirmProceed` is invoked after the
   * pre-flight cost estimate is printed; when true, generation
   * proceeds without invoking `confirmProceed`.
   */
  skipConfirmation?: boolean;
  /**
   * Confirmation seam. Invoked after pre-flight cost estimate is
   * printed to give the user an interactive y/N decision point before
   * the Anthropic API call lands. Returns `true` to proceed, `false`
   * to abort gracefully (Generator returns a zero-counts result with
   * a stderr "aborted by user" notice).
   *
   * Default (when omitted): reads a single y/N line from stdin via
   * `node:readline`. Tests inject a fixed callback to avoid blocking
   * on real stdin.
   */
  confirmProceed?: () => Promise<boolean>;
  /**
   * Stderr writer used for the pre-flight cost estimate + post-flight
   * actual-cost summary + any informational warnings. Mirrors
   * cli-runner.ts writeStderr seam pattern.
   */
  writeStderr?: (chunk: string) => void;
}

/**
 * Strategy interface: per-cycle generation abstraction.
 *
 * Concrete implementations:
 *   - `ClaudeCodeOnlyGenerator` (Skills path; Mode A; subscription-
 *     bounded; informational-stub at v0.7 per Path-3 inheritance)
 *   - `AnthropicAPIDirectGenerator` (API direct; Mode B; pay-per-use;
 *     functional implementation lands at Step 2.2.a.2)
 *
 * Factory: `getGenerator(config)` → Generator concrete instance.
 */
export interface Generator {
  /** Cost model semantics this implementation reports. */
  readonly costModel: CostModel;
  /**
   * Run generation against the configured repo. Returns aggregated
   * result + cost accounting. Throws on irrecoverable failure
   * (caller maps to ADR-12 exit codes per `GenerationSetupError` vs
   * generic Error distinction below).
   */
  generate(context: GeneratorContext): Promise<GenerationResult>;
}

/**
 * Setup-phase error class for ADR-12 exit-code mapping discipline.
 * Throw from `Generator.generate()` when failure is setup-related
 * (missing API key; invalid `--reference-context` path; etc.) — caller
 * maps to ADR-12 exit code 2. Generic Error throws map to exit code 1
 * (pipeline failure).
 *
 * Parallel to `ExtractionSetupError`; kept separate so generation
 * + extraction can evolve setup-error taxonomies independently.
 */
export class GenerationSetupError extends Error {
  readonly kind = "setup" as const;
  constructor(message: string) {
    super(message);
    this.name = "GenerationSetupError";
  }
}
