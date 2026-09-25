/**
 * Run-wide API accounting for `runExtractionPipeline` (v1.2 Phase 2).
 *
 * One tracker is shared by every stream (prose, docstring, commit), so
 * `api_calls`, the token totals, `cost_usd` and the `--budget-warn`
 * check all mean the run's true spend, not the prose stream's alone.
 * The pipeline checks the budget after each unit of work: a prose
 * batch, a docstring file, a commit.
 */

import { log } from "../mcp/logger.js";

import {
  addUsage,
  computeCostUsd,
  ZERO_USAGE,
  type UsageInfo,
} from "./pricing.js";

export class RunCostTracker {
  private calls = 0;
  private total: UsageInfo = ZERO_USAGE;
  private budgetWarningFired = false;

  /**
   * @param budgetWarnUsd optional USD threshold. When cumulative cost
   *   exceeds it, one warning is logged for the whole run. Not a cap:
   *   the run continues.
   */
  constructor(private readonly budgetWarnUsd: number | undefined) {}

  /** Count attempted model calls, including ones that threw. */
  addCalls(n: number): void {
    this.calls += n;
  }

  /**
   * Add the usage of calls that returned. A null result (max_tokens,
   * malformed JSON) still consumed tokens and belongs here; a call that
   * threw after its retries has no usage we can see.
   */
  addUsage(usage: UsageInfo): void {
    this.total = addUsage(this.total, usage);
  }

  get apiCalls(): number {
    return this.calls;
  }

  get usage(): UsageInfo {
    return this.total;
  }

  get costUsd(): number {
    return computeCostUsd(this.total);
  }

  /**
   * Log the budget warning at most once per run, the first time the
   * cumulative cost exceeds the threshold. Compares full-precision USD,
   * independent of the summary's display rounding.
   */
  checkBudget(): void {
    if (this.budgetWarnUsd === undefined || this.budgetWarningFired) return;
    const cumulativeCostUsd = this.costUsd;
    if (cumulativeCostUsd <= this.budgetWarnUsd) return;
    log.warn(
      "extraction: budget warning — cumulative cost exceeds configured budget. Run continues.",
      {
        cumulativeCostUsd: Number(cumulativeCostUsd.toFixed(4)),
        budgetUsd: this.budgetWarnUsd,
      },
    );
    this.budgetWarningFired = true;
  }
}
