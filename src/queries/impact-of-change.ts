/**
 * Query layer for `impact_of_change` — the blast-radius composite.
 *
 * Step 11 per DESIGN.md / CLAUDE.md. Composes over:
 *   - `get_symbol_context`'s primitive (refs/intent/tests/types/diagnostics)
 *   - `findCoChangeFiles` from the git signal (ADR-11)
 *
 * The tool answers "I'm about to change this; what breaks?" — the
 * response carries the primitive's signals plus a file-level co-change
 * block and a RISK_SIGNALS summary. See ADR-11's "Response shape"
 * section for the compact-format specification.
 */

import {
  findCoChangeFiles,
  type CoChangeResult,
} from "../storage/git.js";
import type { DatabaseInstance } from "../storage/db.js";
import type {
  BundleSignal,
  LanguageAdapter,
  Symbol as AtlasSymbol,
  SymbolContextBundle,
} from "../types.js";

import { buildBundle, DEFAULT_GIT_BUNDLE_RECENT } from "./symbol-context.js";

/**
 * Blast-radius bundle. Layers the primitive's signals with git co-change
 * data and derived risk summaries.
 */
export interface ImpactBundle {
  /** Full primitive bundle — symbol, refs, intent, tests, types, diagnostics, git. */
  bundle: SymbolContextBundle;
  /**
   * Files that historically change alongside the symbol's file, ranked
   * by shared-commit count descending. Capped at `coChangeLimit`.
   */
  coChange: CoChangeResult[];
  /**
   * Derived summary stats — computed from the primitive bundle so the
   * compact renderer doesn't re-walk the structure. Always present, even
   * when all values are zero / absent.
   */
  riskSignals: {
    hot: boolean;
    commitCount: number;
    hotThreshold: number;
    testFiles: number;
    diagnostics: number;
    hardClaims: number;
    softClaims: number;
    contextClaims: number;
  };
}

export interface BuildImpactOptions {
  symbol: AtlasSymbol;
  /**
   * Mirrors `config.git.recentCommits`. Doubles as the bundle's
   * recent-commits cap and the hot/cold threshold (ADR-11).
   */
  gitRecentCommits?: number;
  /**
   * Max co-change rows returned. Defaults to 5 — the canonical
   * IMPACT block example in ADR-11 shows top-5 and the LLM-facing
   * intent is "see the top files that move together," not "see all."
   */
  coChangeLimit?: number;
  /**
   * Signal filter passed through to the primitive. When omitted,
   * every signal is included — impact queries are blast-radius
   * questions and benefit from the full substrate.
   */
  include?: readonly BundleSignal[];
  /** Max refs in the primitive bundle. Default 20. */
  maxRefs?: number;
}

export interface BuildImpactDeps {
  db: DatabaseInstance;
  adapter: LanguageAdapter;
}

export const DEFAULT_COCHANGE_LIMIT = 5;

const ALL_SIGNALS: readonly BundleSignal[] = [
  "refs",
  "intent",
  "git",
  "types",
  "tests",
];

/**
 * Assemble the impact bundle for a resolved symbol. Delegates the
 * primitive assembly to `buildBundle`, then layers co-change + risk
 * summaries on top. Depth is fixed to "deep" — impact queries benefit
 * from the fullest possible view of refs/intent/tests.
 */
export async function buildImpactBundle(
  deps: BuildImpactDeps,
  options: BuildImpactOptions,
): Promise<ImpactBundle> {
  const gitRecentCommits =
    options.gitRecentCommits ?? DEFAULT_GIT_BUNDLE_RECENT;
  const coChangeLimit = options.coChangeLimit ?? DEFAULT_COCHANGE_LIMIT;
  const include = options.include ?? ALL_SIGNALS;
  const maxRefs = options.maxRefs ?? 20;

  const bundle = await buildBundle(deps, {
    symbol: options.symbol,
    depth: "deep",
    include,
    maxRefs,
    gitRecentCommits,
  });

  const coChange = findCoChangeFiles(
    deps.db,
    options.symbol.path,
    coChangeLimit,
  );

  const riskSignals = deriveRiskSignals(bundle, gitRecentCommits);

  return { bundle, coChange, riskSignals };
}

function deriveRiskSignals(
  bundle: SymbolContextBundle,
  gitRecentCommits: number,
): ImpactBundle["riskSignals"] {
  const hot = bundle.git?.hot ?? false;
  const commitCount = bundle.git?.commitCount ?? 0;
  const hotThreshold = bundle.git?.hotThreshold ?? gitRecentCommits;
  const testFiles = bundle.tests?.files.length ?? 0;
  const diagnostics = bundle.diagnostics?.length ?? 0;
  let hardClaims = 0;
  let softClaims = 0;
  let contextClaims = 0;
  for (const c of bundle.intent ?? []) {
    if (c.severity === "hard") hardClaims++;
    else if (c.severity === "soft") softClaims++;
    else contextClaims++;
  }
  return {
    hot,
    commitCount,
    hotThreshold,
    testFiles,
    diagnostics,
    hardClaims,
    softClaims,
    contextClaims,
  };
}
