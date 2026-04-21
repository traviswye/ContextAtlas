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
 * Format: sym:<lang>:<path>:<line>:<name>
 * Example: "sym:ts:src/orders/processor.ts:42:OrderProcessor"
 */
export type SymbolId = string;

/** Stable identifier for a reference. Format: "ref:<lang>:<path>:<line>". */
export type ReferenceId = string;

export type LanguageCode = "typescript" | "python";

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
