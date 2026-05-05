/**
 * Smoke test for `contextatlas init` per v0.6 Step 4.4 (Q4.0.7 +
 * Q4.4.1 + Q4.4.2 locks at Step 4.0 + Step 4.4 design adjudications).
 * Verifies atlas extraction wired correctly by reading first symbol
 * from extracted atlas + invoking in-process buildBundle (atlas-only
 * mode per A4 lazy-spawn from Step 3.1).
 *
 * Per Q4.4.1 lock: stub adapter (NEVER_CALLED_ADAPTER) + atlasOnlyAvailable=
 * true + atlas-only-safe scope (intent + git only) — A4 lazy-spawn
 * gates adapter calls so smoke test never invokes the stub. Doctor's
 * deep health check (Step 3.2.a A6 sample symbol traversal) covers
 * LSP path separately.
 *
 * Per Q4.4.2 lock: first symbol by id from listAllSymbols
 * (deterministic; sorted by id; works across all language adapters).
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";

import { buildBundle } from "../queries/symbol-context.js";
import { importAtlasFile } from "../storage/atlas-importer.js";
import { openDatabase } from "../storage/db.js";
import { listAllSymbols } from "../storage/symbols.js";
import type {
  LanguageAdapter,
  Symbol as AtlasSymbol,
  SymbolKind,
} from "../types.js";

export type SmokeTestResult =
  | {
      readonly status: "pass";
      readonly symbolId: string;
      /**
       * Last segment of symbolId (after final ":") — used by Step 4.5
       * success message for language-aware first-query suggestions
       * per Q4.5.4 lock at Step 4.5 surface review.
       */
      readonly symbolName: string;
      /** Symbol kind (class / function / method / etc) per AtlasSymbol. */
      readonly symbolKind: SymbolKind;
      readonly claims: number;
      readonly references: number;
      readonly durationMs: number;
      /**
       * Total atlas symbol count (from listAllSymbols result). Used
       * by Step 4.5 success message Setup section per Q4.5.3 lock.
       */
      readonly atlasSymbolCount: number;
    }
  | {
      readonly status: "fail";
      readonly reason: string;
    };

/**
 * Extract symbol name (last segment) from canonical SymbolId format
 * `sym:<lang>:<path>:<name>` per ADR-01. Returns the name segment
 * (e.g., "BaseProcessor" from "sym:ts:src/orders/base.ts:BaseProcessor").
 *
 * Exported for testability.
 */
export function extractSymbolName(symbolId: string): string {
  const lastColon = symbolId.lastIndexOf(":");
  if (lastColon === -1) return symbolId;
  return symbolId.slice(lastColon + 1);
}

/**
 * Stub adapter — throws on any method call. Used with
 * atlasOnlyAvailable=true + atlas-only-safe scope (intent + git);
 * A4 lazy-spawn (Step 3.1) gates adapter access so smoke test never
 * invokes the stub. Per Q4.4.1 lock at Step 4.4 surface review.
 */
const NEVER_CALLED_ADAPTER: LanguageAdapter = {
  language: "typescript",
  extensions: [],
  async initialize() {
    throw new Error("smoke test stub adapter: initialize unexpectedly called");
  },
  async shutdown() {
    throw new Error("smoke test stub adapter: shutdown unexpectedly called");
  },
  async listSymbols() {
    throw new Error("smoke test stub adapter: listSymbols unexpectedly called");
  },
  async getSymbolDetails() {
    throw new Error(
      "smoke test stub adapter: getSymbolDetails unexpectedly called",
    );
  },
  async findReferences() {
    throw new Error(
      "smoke test stub adapter: findReferences unexpectedly called",
    );
  },
  async getDiagnostics() {
    throw new Error(
      "smoke test stub adapter: getDiagnostics unexpectedly called",
    );
  },
  async getTypeInfo() {
    throw new Error(
      "smoke test stub adapter: getTypeInfo unexpectedly called",
    );
  },
  async getDocstring() {
    throw new Error(
      "smoke test stub adapter: getDocstring unexpectedly called",
    );
  },
};

export interface SmokeTestOptions {
  readonly configRoot: string;
  /** Path to atlas.json relative to configRoot. */
  readonly atlasPath: string;
  /** Path to local cache db relative to configRoot. */
  readonly localCachePath: string;
}

/**
 * Run smoke test: load atlas → pick first symbol → invoke buildBundle
 * with atlas-only-safe scope (intent + git) → verify return.
 *
 * Helper-managed db lifecycle per Q4.4 Point 6 lock (caller doesn't
 * manage db open/close).
 */
export async function runSmokeTest(
  opts: SmokeTestOptions,
): Promise<SmokeTestResult> {
  const startTime = Date.now();
  let firstSymbol: AtlasSymbol | null = null;

  const cachePath = pathResolve(opts.configRoot, opts.localCachePath);
  const atlasJsonPath = pathResolve(opts.configRoot, opts.atlasPath);

  // Pre-flight: surface missing atlas as actionable smoke failure
  // before opening db (avoids leaking SQLite "directory does not
  // exist" error to user when atlas is absent).
  if (!existsSync(atlasJsonPath) && !existsSync(cachePath)) {
    return {
      status: "fail",
      reason:
        `Could not load atlas at ${opts.atlasPath}: file does not exist. ` +
        `Verify atlas extraction completed successfully before running smoke test.`,
    };
  }

  // Ensure cache directory exists before openDatabase (openDatabase
  // creates the file but not the parent directory).
  mkdirSync(dirname(cachePath), { recursive: true });

  const db = openDatabase(cachePath);
  try {
    let symbols = listAllSymbols(db);
    if (symbols.length === 0) {
      // Cache empty — import from atlas.json if present.
      try {
        importAtlasFile(db, atlasJsonPath);
      } catch (err) {
        return {
          status: "fail",
          reason:
            `Could not load atlas at ${opts.atlasPath}: ` +
            (err instanceof Error ? err.message : String(err)),
        };
      }
      symbols = listAllSymbols(db);
      if (symbols.length === 0) {
        return {
          status: "fail",
          reason:
            "atlas extraction produced zero symbols. Verify ADRs reference valid source symbols + extraction completed without errors.",
        };
      }
    }
    firstSymbol = symbols[0]!;

    // In-process buildBundle with atlas-only mode per Q4.0.7 + Q4.4.1
    // locks. atlas-only-safe scope (intent + git) ensures A4 lazy-
    // spawn skips adapter calls; NEVER_CALLED_ADAPTER never invoked.
    const bundle = await buildBundle(
      {
        db,
        adapter: NEVER_CALLED_ADAPTER,
        atlasOnlyAvailable: true,
      },
      {
        symbol: firstSymbol,
        depth: "summary",
        include: ["intent", "git"],
        maxRefs: 0,
      },
    );

    const claimsCount = bundle.intent?.length ?? 0;
    const referencesCount = 0; // not requested in atlas-only-safe scope

    const durationMs = Date.now() - startTime;
    return {
      status: "pass",
      symbolId: firstSymbol.id,
      symbolName: extractSymbolName(firstSymbol.id),
      symbolKind: firstSymbol.kind,
      claims: claimsCount,
      references: referencesCount,
      durationMs,
      atlasSymbolCount: symbols.length,
    };
  } finally {
    db.close();
  }
}
