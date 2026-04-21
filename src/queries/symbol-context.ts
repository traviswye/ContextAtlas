/**
 * Bundle builder for get_symbol_context.
 *
 * Accepts a resolved SymbolId plus options and assembles the fused
 * bundle by pulling from: storage (intent), the adapter (refs, types,
 * diagnostics), and a test-file classifier (tests bucket). Git is
 * deliberately out of scope until step 10.
 *
 * Returns the `SymbolContextBundle` shape from src/types.ts; compact
 * rendering happens downstream in src/formatters/compact.ts.
 */

import { log } from "../mcp/logger.js";
import { listClaimsForSymbol } from "../storage/claims.js";
import type { DatabaseInstance } from "../storage/db.js";
import type {
  BundleDepth,
  BundleSignal,
  Claim,
  Diagnostic,
  LanguageAdapter,
  Reference,
  Symbol as AtlasSymbol,
  SymbolContextBundle,
  SymbolId,
  TypeInfo,
} from "../types.js";
import { isTestFile } from "../utils/test-files.js";

export const ALL_SIGNALS: readonly BundleSignal[] = [
  "refs",
  "intent",
  "git",
  "types",
  "tests",
];

/**
 * Default set applied when the caller does not pass `include`.
 * Every signal except git, which is wired in step 10. Matches the
 * primitive's "return everything in one call" philosophy.
 */
export const DEFAULT_SIGNALS: readonly BundleSignal[] = [
  "refs",
  "intent",
  "types",
  "tests",
];

export interface BuildBundleDeps {
  db: DatabaseInstance;
  adapter: LanguageAdapter;
}

export interface BuildBundleOptions {
  symbol: AtlasSymbol;
  depth: BundleDepth;
  include: readonly BundleSignal[];
  maxRefs: number;
}

export async function buildBundle(
  deps: BuildBundleDeps,
  options: BuildBundleOptions,
): Promise<SymbolContextBundle> {
  const { db, adapter } = deps;
  const { symbol, depth, include, maxRefs } = options;
  const signalSet = new Set<BundleSignal>(include);

  const bundle: SymbolContextBundle = {
    version: "1.0",
    symbol,
  };

  // Intent
  if (signalSet.has("intent")) {
    bundle.intent = sortClaimsBySeverityThenSource(
      listClaimsForSymbol(db, symbol.id),
    );
  }

  // References + derived tests
  let refs: Reference[] | null = null;
  const needsRefs = signalSet.has("refs");
  const needsTests = signalSet.has("tests");
  if (needsRefs || needsTests) {
    refs = await safeFindReferences(adapter, symbol.id);
  }

  if (needsRefs && refs) {
    bundle.refs = summarizeReferences(refs, maxRefs, depth);
  }

  if (needsTests && refs) {
    const testFiles = uniqueTestFiles(refs);
    if (testFiles.length > 0) {
      bundle.tests = { files: testFiles, relatedCount: testFiles.length };
    }
  }

  // Types
  if (signalSet.has("types")) {
    const ti = await safeGetTypeInfo(adapter, symbol.id);
    if (ti && hasAnyTypeInfo(ti)) {
      bundle.types = {};
      if (ti.extends.length > 0) bundle.types.extends = ti.extends;
      if (ti.implements.length > 0) bundle.types.implements = ti.implements;
      if (ti.usedByTypes.length > 0)
        bundle.types.usedByTypes = ti.usedByTypes;
    }
  }

  // Diagnostics — always included when present, per user decision.
  const diagnostics = await safeGetDiagnostics(adapter, symbol.path);
  if (diagnostics.length > 0) {
    bundle.diagnostics = diagnostics;
  }

  // Git is skipped for step 6; lands in step 10. Signal key silently
  // passes through without populating.

  return bundle;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER = { hard: 0, soft: 1, context: 2 } as const;

function sortClaimsBySeverityThenSource(claims: Claim[]): Claim[] {
  return [...claims].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return a.source < b.source ? -1 : a.source > b.source ? 1 : 0;
  });
}

function summarizeReferences(
  refs: readonly Reference[],
  maxRefs: number,
  _depth: BundleDepth,
): NonNullable<SymbolContextBundle["refs"]> {
  // Bucket by first-path-segment "module" — simple and stable across
  // project shapes. `src/billing/x.ts` → `billing`; standalone files
  // like `index.ts` end up in `.` which is acceptable for MVP.
  const buckets = new Map<string, Reference[]>();
  for (const r of refs) {
    const seg = r.path.split("/")[0] ?? ".";
    const arr = buckets.get(seg);
    if (arr) arr.push(r);
    else buckets.set(seg, [r]);
  }

  const clusters = Array.from(buckets.entries())
    .map(([module, rs]) => ({
      module,
      count: rs.length,
      topIds: rs.slice(0, maxRefs).map((r) => r.id),
    }))
    .sort((a, b) => b.count - a.count);

  return { count: refs.length, clusters };
}

function uniqueTestFiles(refs: readonly Reference[]): string[] {
  const seen = new Set<string>();
  for (const r of refs) {
    if (isTestFile(r.path)) seen.add(r.path);
  }
  return Array.from(seen).sort();
}

function hasAnyTypeInfo(ti: TypeInfo): boolean {
  return (
    ti.extends.length > 0 ||
    ti.implements.length > 0 ||
    ti.usedByTypes.length > 0
  );
}

async function safeFindReferences(
  adapter: LanguageAdapter,
  id: SymbolId,
): Promise<Reference[] | null> {
  try {
    return await adapter.findReferences(id);
  } catch (err) {
    // Stale atlas / tsserver hiccup — log and render with empty refs.
    log.warn("symbol-context: findReferences failed", {
      id,
      err: String(err),
    });
    return null;
  }
}

async function safeGetTypeInfo(
  adapter: LanguageAdapter,
  id: SymbolId,
): Promise<TypeInfo | null> {
  try {
    return await adapter.getTypeInfo(id);
  } catch (err) {
    log.warn("symbol-context: getTypeInfo failed", { id, err: String(err) });
    return null;
  }
}

async function safeGetDiagnostics(
  adapter: LanguageAdapter,
  path: string,
): Promise<Diagnostic[]> {
  try {
    return await adapter.getDiagnostics(path);
  } catch (err) {
    log.warn("symbol-context: getDiagnostics failed", {
      path,
      err: String(err),
    });
    return [];
  }
}
