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

export type LanguageCode = "typescript" | "python";

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
} as const;

/** Inverse mapping: short code → full LanguageCode. */
export const LANG_CODES_INVERSE: Record<string, LanguageCode> = {
  ts: "typescript",
  py: "python",
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
    lastTouched: string;
    recentCommits: Array<{ sha: string; date: string; message: string }>;
    hot: boolean;
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

  initialize(rootPath: string): Promise<void>;
  shutdown(): Promise<void>;
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
}