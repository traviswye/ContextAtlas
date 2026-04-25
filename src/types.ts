/**
 * Shared type definitions for ContextAtlas.
 *
 * These types anchor the shape of data flowing through the system. Changes
 * here ripple across language adapters, storage, query fusion, and MCP
 * handlers — update DESIGN.md when changing public shapes.
 */

// ============================================================================
// Symbol identification
// ============================================================================

/**
 * Stable identifier for a symbol.
 * Format: sym:<lang-short-code>:<path>:<name>
 * Example: "sym:ts:src/orders/processor.ts:OrderProcessor"
 *
 * Line numbers are NOT part of the ID. They live as a field on the Symbol
 * record (`line`). This keeps IDs stable across cosmetic line moves so
 * atlas.json diffs stay meaningful (see ADR-01).
 *
 * Paths in IDs use forward-slash separators regardless of OS.
 * All path ingest goes through normalizePath() (see ADR-01).
 */
export type SymbolId = string;

/**
 * Stable identifier for a reference site.
 * Format: "ref:<lang-short-code>:<path>:<line>"
 *
 * Unlike Symbol IDs, Reference IDs DO include line — a reference is a
 * location in a file, not an entity.
 */
export type ReferenceId = string;

export type LanguageCode = "typescript" | "python" | "go";

/**
 * Authoritative mapping from LanguageCode (used in config and interfaces)
 * to the short code used in symbol IDs.
 *
 * Per ADR-01, this is stable public API. Adding entries is additive;
 * changing existing short codes is a breaking change requiring a major
 * version bump.
 */
export const LANG_CODES: Record<LanguageCode, string> = {
  typescript: "ts",
  python: "py",
  go: "go",
} as const;

/** Inverse mapping: short code → full LanguageCode. */
export const LANG_CODES_INVERSE: Record<string, LanguageCode> = {
  ts: "typescript",
  py: "python",
  go: "go",
} as const;

export type SymbolKind =
  | "class"
  | "interface"
  | "function"
  | "method"
  | "type"
  | "enum"
  | "variable"
  | "module"
  | "other";

export interface Symbol {
  id: SymbolId;
  name: string;
  kind: SymbolKind;
  path: string;
  line: number;
  signature?: string;
  language: LanguageCode;
  /**
   * Optional back-pointer to a parent symbol. Used by adapters that
   * flatten nested-child declarations to top-level Symbol records and
   * need to preserve the parent → child relationship — e.g., Go
   * interface methods flattened from interface children to sibling
   * top-level entries per ADR-14 §Decision 4. Left undefined for
   * top-level symbols with no parent relationship (functions,
   * classes, standalone vars/constants, etc.).
   */
  parentId?: SymbolId;
  /**
   * SHA of the source file this symbol lives in. Optional on the adapter
   * boundary (adapters don't compute SHAs), required at the storage
   * boundary (indexer stamps SHA before insert).
   */
  fileSha?: string;
}

export interface Reference {
  id: ReferenceId;
  symbolId: SymbolId;
  path: string;
  line: number;
  column?: number;
}

// ============================================================================
// Intent claims (from extraction pipeline)
// ============================================================================

export type Severity = "hard" | "soft" | "context";

export interface Claim {
  id: number;
  source: string; // e.g. "ADR-07", "README"
  sourcePath: string;
  /** SHA of the source document the claim was extracted from. */
  sourceSha: string;
  severity: Severity;
  claim: string;
  rationale?: string;
  excerpt?: string;
  symbolIds: SymbolId[];
}

// ============================================================================
// Bundles (MCP tool output)
// ============================================================================

export type BundleDepth = "summary" | "standard" | "deep";

export type BundleSignal = "refs" | "intent" | "git" | "types" | "tests";

export interface SymbolContextBundle {
  version: "1.0";
  symbol: Symbol;
  intent?: Claim[];
  refs?: {
    count: number;
    clusters: Array<{
      module: string;
      count: number;
      topIds: ReferenceId[];
    }>;
  };
  types?: {
    extends?: string[];
    implements?: string[];
    usedByTypes?: string[];
  };
  git?: {
    /** ISO-8601 date of the most recent commit that touched the symbol's file. */
    lastTouched: string;
    /** Author email of that most recent commit. */
    lastTouchedAuthor: string;
    /**
     * Recent commits on the symbol's file, newest-first. Size is
     * bounded by `config.git.recentCommits`.
     */
    recentCommits: Array<{
      sha: string;
      date: string;
      message: string;
      authorEmail: string;
    }>;
    /** True when `commitCount >= config.git.recentCommits` (ADR-11). */
    hot: boolean;
    /** Total commits in the stored window that touched the symbol's file. */
    commitCount: number;
    /** Threshold used to decide `hot` — surfaced so renderers can explain it. */
    hotThreshold: number;
  };
  tests?: {
    files: string[];
    relatedCount: number;
  };
  diagnostics?: Diagnostic[];
}

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  path: string;
  line: number;
  column?: number;
}

// ============================================================================
// Language adapter interface
// ============================================================================

export interface LanguageAdapter {
  readonly language: LanguageCode;
  readonly extensions: readonly string[];

  listSymbols(filePath: string): Promise<Symbol[]>;
  getSymbolDetails(id: SymbolId): Promise<Symbol | null>;
  findReferences(id: SymbolId): Promise<Reference[]>;
  getDiagnostics(filePath: string): Promise<Diagnostic[]>;
  /**
   * Return the type relationships for a symbol. See ADR-07 for the
   * contract: direct children only on `usedByTypes`, generic constraints
   * excluded from `extends`, empty arrays are valid returns.
   */
  getTypeInfo(id: SymbolId): Promise<TypeInfo>;

  initialize(rootPath: string): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Type relationships for a symbol (ADR-07).
 *
 * `extends` and `implements` describe the forward direction: what this
 * symbol inherits from or implements. `usedByTypes` is the inverse
 * lookup: which types extend or implement this symbol.
 *
 * All three are arrays of plain names (not symbol IDs) because they're
 * rendered as-is in the compact bundle format. An ID-resolved variant
 * could be added in a later major version if callers need it.
 */
export interface TypeInfo {
  extends: string[];
  implements: string[];
  /** Direct children only; no transitive closure. */
  usedByTypes: string[];
}

// ============================================================================
// Config
// ============================================================================

export interface ContextAtlasConfig {
  version: 1;
  languages: LanguageCode[];
  adrs: {
    path: string;
    format: "markdown-frontmatter";
    symbolField?: string;
  };
  docs: {
    include: string[];
  };
  git: {
    recentCommits: number;
  };
  index: {
    model: string;
  };
  atlas: {
    committed: boolean;
    path: string;        // committed artifact location
    localCache: string;  // gitignored SQLite cache location
  };
  /**
   * Optional source-code location (ADR-08 runtime extension).
   * When present, `source.root` is the path (resolved against the
   * config file's directory) where language adapters should
   * initialize. When absent, adapters initialize against the config
   * file's directory, matching the single-root common case.
   */
  source?: {
    root: string;
  };
  /**
   * Optional extraction-pipeline knobs (v0.2 Stream A #2 +
   * v0.3 Theme 1.2 Fix 2).
   *
   * `budgetWarnUsd`: when the cumulative API cost during an
   * extraction run exceeds this threshold, a single warning is
   * logged to stderr. Not a hard cap — the run continues. Absent
   * means no budget check. CLI flag `--budget-warn` overrides this
   * value at invocation time.
   *
   * `narrowAttribution`: claim-attribution narrowing rule (v0.3
   * Theme 1.2 Fix 2; targets Phase 6 §5.1 muddy-bundle mechanism).
   * Absent (default) preserves v0.2 baseline (frontmatter symbols
   * inherited as per-claim baseline). Two on-states ship behind
   * this flag for Step 7 evaluation:
   *   - `"drop"`: drop frontmatter inheritance entirely; claims
   *     attach only to model-extracted candidates. Cleanest
   *     experimental knob; Phase 6 §5.1's mechanism check.
   *   - `"drop-with-fallback"`: drop, but fall back to merging
   *     frontmatter when a claim resolves to zero symbols.
   *     Recovers Option A's "claim attaches to no symbols → invisible
   *     to get_symbol_context" regression risk.
   * CLI flag `--narrow-attribution=<value>` overrides config.
   */
  extraction?: {
    budgetWarnUsd?: number;
    narrowAttribution?: "drop" | "drop-with-fallback";
  };
}