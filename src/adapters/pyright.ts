/**
 * Python language adapter backed by Pyright (ADR-13).
 *
 * Wraps `pyright-langserver` spawned as a subprocess, speaking LSP
 * over stdio. Implements the `LanguageAdapter` interface from
 * src/types.ts per ADR-03 (adapters are plugins) and ADR-07
 * (getTypeInfo is a required capability).
 *
 * Divergences from TypeScriptAdapter documented in ADR-13:
 *   - Pyright does NOT implement textDocument/implementation;
 *     usedByTypes is computed via source-file declaration parsing
 *     + optional pass-1 Protocol cache for full-indexing runs.
 *   - Pyright hover omits class declaration headers; class
 *     signatures are built from source, other kinds use hover text.
 *   - Pyright emits uniform LSP kinds for Protocol / ABC /
 *     dataclass; Protocol→interface remap requires source-line
 *     inspection + three-mechanism Protocol detection.
 *   - Type aliases (all three Python syntactic forms) collapse to
 *     LSP kind 13 (Variable); hover `(type)` prefix drives remap.
 *
 * See `docs/adr/pyright-probe-findings.md` for primary-source LSP
 * behavior capture that motivated these divergences.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join as pathJoin, resolve as pathResolve } from "node:path";

import { log } from "../mcp/logger.js";
import {
  LANG_CODES,
  type Diagnostic,
  type LanguageAdapter,
  type LanguageCode,
  type Reference,
  type ReferenceId,
  type Symbol as AtlasSymbol,
  type SymbolId,
  type SymbolKind,
  type TypeInfo,
} from "../types.js";
import {
  normalizePath,
  toFileUri,
  toRelativePath,
} from "../utils/paths.js";

import { LspClient } from "./lsp-client.js";

// ---------------------------------------------------------------------------
// LSP wire types — minimal subset reused from the TypeScript adapter's
// shape. We deliberately do not import vscode-languageserver-types, per
// CLAUDE.md's dependency-minimization rule.
// ---------------------------------------------------------------------------

interface LspPosition {
  line: number;
  character: number;
}
interface LspRange {
  start: LspPosition;
  end: LspPosition;
}
interface LspLocation {
  uri: string;
  range: LspRange;
}
interface LspDocumentSymbol {
  name: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}
interface LspDiagnostic {
  range: LspRange;
  severity?: number;
  message: string;
}

// ---------------------------------------------------------------------------
// LSP SymbolKind → our SymbolKind.
//
// Pyright's emitted kinds per probe §T3:
//   5  Class       — regular/ABC/dataclass/Protocol classes (adapter remaps
//                    Protocol→interface via source-line parse)
//   6  Method      — __init__, methods, @property, @classmethod, @staticmethod
//   12 Function    — top-level def
//   13 Variable    — bare module var, type alias (all 3 forms), params,
//                    instance vars (adapter remaps type aliases via hover)
//   14 Constant    — annotated module constant (X: int = 3)
//
// Values not observed in Python collapse to "other".
// ---------------------------------------------------------------------------
function mapPyrightKind(lspKind: number): SymbolKind {
  switch (lspKind) {
    case 5:
      return "class";
    case 6:
      return "method";
    case 12:
      return "function";
    case 14:
      return "variable";
    case 13:
      return "variable";
    default:
      return "other";
  }
}

function mapDiagnosticSeverity(n: number | undefined): Diagnostic["severity"] {
  switch (n) {
    case 1:
      return "error";
    case 2:
      return "warning";
    default:
      return "info";
  }
}

// ---------------------------------------------------------------------------
// PyrightAdapter
// ---------------------------------------------------------------------------

export interface PyrightAdapterOptions {
  /**
   * Override the path to the pyright-langserver entry point. If omitted,
   * resolved from the consuming project's node_modules.
   */
  cliPath?: string;
  /** Upper bound on a single LSP request. */
  requestTimeoutMs?: number;
}

/** Extensions indexed in v0.1 per ADR-13's "File extensions" decision. */
export const PYTHON_EXTENSIONS: readonly string[] = [".py"];

export class PyrightAdapter implements LanguageAdapter {
  readonly language: LanguageCode = "python";
  readonly extensions: readonly string[] = PYTHON_EXTENSIONS;

  private readonly client: LspClient;
  private readonly options: PyrightAdapterOptions;
  private rootPath: string | null = null;
  private readonly openFiles = new Set<string>();
  private readonly diagnosticsByUri = new Map<string, Diagnostic[]>();
  private readonly diagnosticsListeners = new Map<string, () => void>();

  /**
   * Pass-1 Protocol cache — populated by `buildProtocolCache()` during
   * full-indexing runs (ADR-13 §Two-pass indexing). Single-symbol
   * operations do NOT populate this; getTypeInfo falls back to
   * mechanisms (a)+(b) only when the cache is empty, which is the
   * documented degraded mode.
   */
  private readonly protocolCache = new Map<SymbolId, boolean>();

  constructor(options: PyrightAdapterOptions = {}) {
    this.client = new LspClient("pyright");
    this.options = options;
    this.client.onNotification(
      "textDocument/publishDiagnostics",
      (params) => {
        const p = params as {
          uri: string;
          diagnostics: LspDiagnostic[];
        } | null;
        if (!p || typeof p.uri !== "string" || !this.rootPath) return;
        const normalizedUri = normalizePath(p.uri);
        let rel: string;
        try {
          rel = toRelativePath(normalizedUri, this.rootPath);
        } catch {
          return;
        }
        const mapped: Diagnostic[] = (p.diagnostics ?? []).map((d) => ({
          severity: mapDiagnosticSeverity(d.severity),
          message: d.message,
          path: rel,
          line: d.range.start.line + 1,
          column: d.range.start.character,
        }));
        this.diagnosticsByUri.set(normalizedUri, mapped);
        const listener = this.diagnosticsListeners.get(normalizedUri);
        if (listener) listener();
      },
    );
    // Pyright issues server-initiated requests during startup; the client
    // hangs without handlers for these. Minimal no-op stubs suffice.
    for (const method of [
      "window/workDoneProgress/create",
      "client/registerCapability",
      "workspace/configuration",
    ]) {
      this.client.onRequest(method, () => null);
    }
  }

  async initialize(rootPath: string): Promise<void> {
    if (this.rootPath) {
      throw new Error("PyrightAdapter.initialize called twice.");
    }
    const absRoot = pathResolve(rootPath);
    this.rootPath = normalizePath(absRoot);

    const cliPath = this.options.cliPath ?? resolvePyrightLangserver();
    log.info(`[py-adapter] starting pyright-langserver`, {
      cliPath,
      rootPath: this.rootPath,
    });

    this.client.start(process.execPath, [cliPath, "--stdio"], absRoot);

    await this.client.request(
      "initialize",
      {
        processId: process.pid,
        rootUri: toFileUri(absRoot),
        workspaceFolders: [
          { uri: toFileUri(absRoot), name: "workspace" },
        ],
        capabilities: {
          textDocument: {
            documentSymbol: {
              hierarchicalDocumentSymbolSupport: true,
            },
            references: {},
            hover: { contentFormat: ["markdown", "plaintext"] },
            publishDiagnostics: {},
            synchronization: {
              dynamicRegistration: false,
              didSave: false,
            },
          },
          workspace: {
            workspaceFolders: true,
            configuration: true,
          },
        },
      },
      this.options.requestTimeoutMs ?? 30_000,
    );
    this.client.notify("initialized", {});

    // Pyright requires `didOpen` for cross-file references (probe §T7).
    // Walk the project once and open every .py file — same warmup pattern
    // TypeScriptAdapter uses against tsserver.
    this.warmupProject(absRoot);
  }

  private warmupProject(rootAbs: string): void {
    const extSet = new Set(this.extensions);
    const skipDirs = new Set([
      "node_modules",
      "dist",
      "build",
      ".git",
      ".contextatlas",
      ".venv",
      "venv",
      "__pycache__",
      ".tox",
      ".mypy_cache",
      ".pytest_cache",
    ]);
    const walk = (dir: string): void => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const name = entry.name;
        if (name.startsWith(".") && name !== "." && name !== "..") continue;
        const full = pathJoin(dir, name);
        if (entry.isDirectory()) {
          if (skipDirs.has(name)) continue;
          walk(full);
        } else if (entry.isFile() && extSet.has(extname(name))) {
          try {
            this.ensureOpenSync(full);
          } catch {
            // Skip unreadable files; they simply won't be analyzed.
          }
        }
      }
    };
    walk(rootAbs);
  }

  private ensureOpenSync(absPath: string): void {
    if (this.openFiles.has(absPath)) return;
    const text = readFileSync(absPath, "utf8");
    this.client.notify("textDocument/didOpen", {
      textDocument: {
        uri: toFileUri(absPath),
        languageId: "python",
        version: 1,
        text,
      },
    });
    this.openFiles.add(absPath);
  }

  private async ensureOpen(absPath: string): Promise<void> {
    this.ensureOpenSync(absPath);
  }

  async shutdown(): Promise<void> {
    this.rootPath = null;
    this.openFiles.clear();
    this.diagnosticsByUri.clear();
    this.diagnosticsListeners.clear();
    this.protocolCache.clear();
    await this.client.stop();
  }

  async listSymbols(filePath: string): Promise<AtlasSymbol[]> {
    const { absPath, relPath } = this.resolveFile(filePath);
    if (!existsSync(absPath)) return [];
    await this.ensureOpen(absPath);
    const result = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!result || !Array.isArray(result)) return [];

    const sourceText = safeReadFile(absPath);
    const imports = parseImportAliases(sourceText);

    // Collect top-level symbols + class methods (one level of nesting for
    // classes). Parameters / instance variables under methods are dropped
    // per ADR-13 §SymbolKind mapping.
    const out: AtlasSymbol[] = [];
    for (const sym of result) {
      const mapped = this.mapDocumentSymbol(
        sym,
        relPath,
        sourceText,
        imports,
      );
      if (mapped) out.push(mapped);
      if (sym.kind === 5 && sym.children) {
        for (const child of sym.children) {
          const childMapped = this.mapDocumentSymbol(
            child,
            relPath,
            sourceText,
            imports,
          );
          if (childMapped) out.push(childMapped);
        }
      }
    }
    return out;
  }

  /**
   * Turn a single LSP DocumentSymbol into an Atlas Symbol, applying the
   * ADR-13 kind remaps (Protocol→interface, type-alias→type,
   * constant→variable-with-hint). Returns null for kinds we discard
   * (parameters under methods, instance variables).
   */
  private mapDocumentSymbol(
    sym: LspDocumentSymbol,
    relPath: string,
    sourceText: string,
    imports: ImportAliases,
  ): AtlasSymbol | null {
    const rawKind = mapPyrightKind(sym.kind);
    if (rawKind === "other") return null;

    // Drop kind-13 symbols that aren't recognizable as module-level or
    // type-alias entries. Pyright nests parameters + instance vars as
    // kind-13 children under methods; we don't want them as atlas
    // symbols.
    if (sym.kind === 13) {
      const line =
        sourceText.split(/\r?\n/)[sym.selectionRange.start.line] ?? "";
      // Type-alias detection: only accept kind-13 entries whose source
      // line looks like a module-level type-alias form.
      if (isTypeAliasLine(line, sym.name)) {
        const base = this.toAtlasSymbol(sym, relPath, "type");
        const sig = extractTypeAliasSignature(line, sym.name);
        if (sig) base.signature = sig;
        return base;
      }
      if (isModuleLevelAssignment(line, sym.name)) {
        return this.toAtlasSymbol(sym, relPath, "variable");
      }
      return null;
    }

    // Annotated module constant (kind 14) — keep as variable.
    if (sym.kind === 14) {
      return this.toAtlasSymbol(sym, relPath, "variable");
    }

    // Class / method / function — source declaration drives signature.
    const base = this.toAtlasSymbol(sym, relPath, rawKind);

    if (sym.kind === 5) {
      const header = extractClassDeclaration(
        sourceText,
        sym.selectionRange.start.line,
      );
      const parsed = parseClassDeclaration(header);
      if (parsed.signature) base.signature = parsed.signature;
      // Protocol→interface kind remap via mechanisms (a)+(b) —
      // mechanism (c) requires the two-pass cache and is applied during
      // getTypeInfo (not here).
      if (parsed.bases.some((b) => isProtocolBase(b, imports))) {
        base.kind = "interface";
      }
      return base;
    }

    if (sym.kind === 6 || sym.kind === 12) {
      const header = extractCallableSignatureLine(
        sourceText,
        sym.selectionRange.start.line,
      );
      if (header) base.signature = header;
      return base;
    }

    return base;
  }

  async getSymbolDetails(id: SymbolId): Promise<AtlasSymbol | null> {
    const parsed = parseSymbolId(id);
    if (!parsed) return null;
    const symbols = await this.listSymbols(parsed.path);
    return symbols.find((s) => s.name === parsed.name) ?? null;
  }

  async findReferences(id: SymbolId): Promise<Reference[]> {
    const parsed = parseSymbolId(id);
    if (!parsed || !this.rootPath) return [];
    const absPath = this.toAbs(parsed.path);
    if (!existsSync(absPath)) return [];
    await this.ensureOpen(absPath);

    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return [];
    const target = findSymbolByName(symbols, parsed.name);
    if (!target) return [];

    const position = target.selectionRange.start;
    const locations = await this.client.request<LspLocation[] | null>(
      "textDocument/references",
      {
        textDocument: { uri: toFileUri(absPath) },
        position,
        context: { includeDeclaration: false },
      },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!locations || !Array.isArray(locations)) return [];

    return locations.map((loc): Reference => {
      const rel = toRelativePath(normalizePath(loc.uri), this.rootPath!);
      const line = loc.range.start.line + 1;
      return {
        id: this.referenceId(rel, line),
        symbolId: id,
        path: rel,
        line,
        column: loc.range.start.character,
      };
    });
  }

  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    const { absPath } = this.resolveFile(filePath);
    if (!existsSync(absPath)) return [];
    await this.ensureOpen(absPath);
    const uriKey = normalizePath(toFileUri(absPath));

    const existing = this.diagnosticsByUri.get(uriKey);
    if (existing) return existing;

    // Pyright publishes diagnostics automatically on didOpen (probe §T6),
    // so the window between didOpen and first diagnostics is short. Wait
    // up to 1s for the push, then return whatever we have.
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.diagnosticsListeners.delete(uriKey);
        resolve();
      }, 1_000);
      this.diagnosticsListeners.set(uriKey, () => {
        clearTimeout(timeout);
        this.diagnosticsListeners.delete(uriKey);
        resolve();
      });
    });
    return this.diagnosticsByUri.get(uriKey) ?? [];
  }

  async getTypeInfo(id: SymbolId): Promise<TypeInfo> {
    const empty: TypeInfo = { extends: [], implements: [], usedByTypes: [] };
    const parsed = parseSymbolId(id);
    if (!parsed || !this.rootPath) return empty;

    const absPath = this.toAbs(parsed.path);
    if (!existsSync(absPath)) return empty;
    await this.ensureOpen(absPath);

    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return empty;
    const target = findSymbolByName(symbols, parsed.name);
    if (!target || target.kind !== 5) return empty;

    const sourceText = safeReadFile(absPath);
    const imports = parseImportAliases(sourceText);
    const declHeader = extractClassDeclaration(
      sourceText,
      target.selectionRange.start.line,
    );
    const declParsed = parseClassDeclaration(declHeader);

    // Forward direction: split bases into extends vs implements using
    // the three Protocol-detection mechanisms. Mechanism (c) is
    // available only when the pass-1 cache is populated.
    const result: TypeInfo = { extends: [], implements: [], usedByTypes: [] };
    for (const base of declParsed.bases) {
      if (isProtocolBase(base, imports)) {
        result.implements.push(base);
        continue;
      }
      // Mechanism (c) — cache lookup. Base names from cross-file
      // inheritance need resolving through imports to find the base's
      // SymbolId. For v0.1 we do best-effort: if ANY cache key matches
      // the base's short name as a Protocol, route to implements.
      if (this.cacheMarksProtocolByName(base, imports)) {
        result.implements.push(base);
      } else {
        result.extends.push(base);
      }
    }

    // Inverse direction: Pyright has no textDocument/implementation
    // (probe §T1), so we walk the workspace and find classes whose own
    // declaration header references `parsed.name` as a base. The walk
    // is bounded by the already-opened file set — warmup populates it.
    if (this.openFiles.size > 0) {
      const seen = new Set<string>();
      for (const candidateAbs of this.openFiles) {
        if (candidateAbs === absPath) continue;
        const candidateText = safeReadFile(candidateAbs);
        if (!candidateText) continue;
        const matches = findClassesExtending(candidateText, parsed.name);
        for (const name of matches) {
          if (!seen.has(name)) {
            seen.add(name);
            result.usedByTypes.push(name);
          }
        }
      }
    }

    return result;
  }

  /**
   * Pass-1: populate the Protocol cache by walking every opened file,
   * identifying classes whose declaration header inherits from a
   * Protocol, and recording their SymbolId → true.
   *
   * Intended to run during full-indexing (ADR-13 §Two-pass indexing).
   * `contextatlas index` orchestrator should call this after warmup,
   * before any getTypeInfo calls. Query-time paths can skip it and
   * rely on the (a)+(b) degraded mode.
   */
  async buildProtocolCache(): Promise<number> {
    if (!this.rootPath) return 0;
    this.protocolCache.clear();
    for (const candidateAbs of this.openFiles) {
      const sourceText = safeReadFile(candidateAbs);
      if (!sourceText) continue;
      const imports = parseImportAliases(sourceText);
      const rel = toRelativePath(
        normalizePath(candidateAbs),
        this.rootPath,
      );
      const classes = findClassesMatchingProtocol(sourceText, imports);
      for (const name of classes) {
        const id = this.symbolId(rel, name);
        this.protocolCache.set(id, true);
      }
    }
    return this.protocolCache.size;
  }

  private cacheMarksProtocolByName(
    baseName: string,
    imports: ImportAliases,
  ): boolean {
    if (this.protocolCache.size === 0) return false;
    // Normalize the base name — drop any dotted prefix (qualified import
    // like `module.Proto`) and check the import map for an alias.
    const short = baseName.includes(".")
      ? (baseName.split(".").pop() ?? baseName)
      : baseName;
    const resolvedName = imports.nameToOriginal.get(short) ?? short;

    for (const id of this.protocolCache.keys()) {
      const parts = parseSymbolId(id);
      if (parts && parts.name === resolvedName) return true;
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private resolveFile(filePath: string): {
    absPath: string;
    relPath: string;
  } {
    if (!this.rootPath) {
      throw new Error(
        "PyrightAdapter not initialized. Call initialize(rootPath) first.",
      );
    }
    const absPath = pathResolve(this.rootPath, filePath);
    const relPath = toRelativePath(absPath, this.rootPath);
    return { absPath, relPath };
  }

  private toAbs(relPath: string): string {
    if (!this.rootPath) {
      throw new Error("PyrightAdapter not initialized.");
    }
    return pathResolve(this.rootPath, relPath);
  }

  private toAtlasSymbol(
    sym: LspDocumentSymbol,
    relPath: string,
    kind: SymbolKind,
  ): AtlasSymbol {
    return {
      id: this.symbolId(relPath, sym.name),
      name: sym.name,
      kind,
      path: relPath,
      line: sym.selectionRange.start.line + 1,
      language: this.language,
    };
  }

  private symbolId(relPath: string, name: string): SymbolId {
    return `sym:${LANG_CODES[this.language]}:${relPath}:${name}`;
  }

  private referenceId(relPath: string, line: number): ReferenceId {
    return `ref:${LANG_CODES[this.language]}:${relPath}:${line}`;
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers — most exported for direct unit testing.
// ---------------------------------------------------------------------------

function resolvePyrightLangserver(): string {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve("pyright/langserver.index.js");
  } catch (err) {
    throw new Error(
      "Could not locate pyright-langserver. It is a peer dependency — " +
        "install it in your project (npm i -D pyright) or pass an explicit " +
        "cliPath to PyrightAdapter.\n" +
        `Underlying resolution error: ${String(err)}`,
    );
  }
}

function parseSymbolId(
  id: SymbolId,
): { path: string; name: string } | null {
  // Format: sym:<lang>:<path>:<name>
  // Path may contain colons (e.g. "C:/..."), so split from both ends.
  if (!id.startsWith("sym:")) return null;
  const rest = id.slice("sym:".length);
  const firstColon = rest.indexOf(":");
  if (firstColon === -1) return null;
  const afterLang = rest.slice(firstColon + 1);
  const lastColon = afterLang.lastIndexOf(":");
  if (lastColon === -1) return null;
  const path = afterLang.slice(0, lastColon);
  const name = afterLang.slice(lastColon + 1);
  if (!path || !name) return null;
  return { path, name };
}

function findSymbolByName(
  symbols: LspDocumentSymbol[],
  name: string,
): LspDocumentSymbol | null {
  for (const s of symbols) {
    if (s.name === name) return s;
    if (s.children) {
      const nested = findSymbolByName(s.children, name);
      if (nested) return nested;
    }
  }
  return null;
}

function safeReadFile(absPath: string): string {
  try {
    return readFileSync(absPath, "utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Class-declaration parser (ADR-13 §Declaration-header parsing).
//
// Scope: `class Name(Base1, Base2):` and common variants — generics,
// multi-line base lists, metaclass kwargs, dotted-name bases. NOT
// general Python parsing. Pathological inputs degrade gracefully to
// "bases not extracted" rather than wrong extraction.
// ---------------------------------------------------------------------------

export interface ParsedClassDeclaration {
  /**
   * Base class names in source order, with generic brackets stripped.
   * Dotted names (`typing.Protocol`) preserved as single tokens.
   */
  bases: string[];
  /**
   * Human-readable class signature derived from the declaration. Empty
   * when the class has no bases (`class Foo:` → `class Foo`).
   */
  signature: string | null;
}

/**
 * Extract the `class Name(...)` declaration starting at `startLine`
 * (0-indexed). Collects text from the `class` keyword through the
 * matching `)` (or the end of the `class Name:` form if no `(` is
 * present), spanning newlines with paren-depth tracking.
 *
 * Returns "" when the start line doesn't contain `class `.
 */
export function extractClassDeclaration(
  sourceText: string,
  startLine: number,
  maxLines = 20,
): string {
  const lines = sourceText.split(/\r?\n/);
  if (startLine >= lines.length) return "";
  const first = lines[startLine] ?? "";
  const classIdx = first.indexOf("class ");
  if (classIdx === -1) return "";

  const slice = first.slice(classIdx);
  const parenOpen = slice.indexOf("(");

  // No-bases form: `class Foo:`. Take the slice up to `:` if present,
  // otherwise the whole slice.
  if (parenOpen === -1) {
    const colonIdx = slice.indexOf(":");
    if (colonIdx === -1) return slice.trim();
    return slice.slice(0, colonIdx).trim();
  }

  // Bases form: walk chars tracking paren depth until matching `)` is
  // found. Depth-zero return stops collection at the close-paren, so
  // trailing `:` and method body are never captured.
  let depth = 0;
  let collected = "";
  const endLine = Math.min(lines.length, startLine + maxLines);
  for (let lineIdx = startLine; lineIdx < endLine; lineIdx++) {
    const lineStr = lineIdx === startLine ? slice : lines[lineIdx] ?? "";
    for (const ch of lineStr) {
      if (ch === "(") {
        depth++;
        collected += ch;
        continue;
      }
      if (ch === ")") {
        collected += ch;
        depth--;
        if (depth === 0) {
          return collected.replace(/\s+/g, " ").trim();
        }
        continue;
      }
      collected += ch;
    }
    // Inter-line separator — collapses to a space via whitespace
    // normalization at return time.
    collected += "\n";
  }
  // Fell off the budget (unclosed parens or very long declaration).
  // Best-effort return; the downstream parser degrades to "no bases".
  return collected.replace(/\s+/g, " ").trim();
}

/**
 * Parse the output of {@link extractClassDeclaration} into bases and
 * a synthetic signature. Implements ADR-13's six parser rules.
 */
export function parseClassDeclaration(
  header: string,
): ParsedClassDeclaration {
  if (!header) return { bases: [], signature: null };

  const trimmed = header.trim();
  // Extract class name.
  const nameMatch = /^class\s+([A-Za-z_][\w]*)/.exec(trimmed);
  if (!nameMatch) return { bases: [], signature: null };
  const className = nameMatch[1]!;

  // Locate parenthesized bases span.
  const parenOpen = trimmed.indexOf("(");
  if (parenOpen === -1) {
    return { bases: [], signature: `class ${className}` };
  }
  // Find matching close by depth tracking.
  let depth = 0;
  let parenClose = -1;
  for (let i = parenOpen; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        parenClose = i;
        break;
      }
    }
  }
  if (parenClose === -1) {
    // Unclosed parens — degrade to "no bases extracted", but still
    // produce a best-effort signature.
    return { bases: [], signature: `class ${className}` };
  }
  const inner = trimmed.slice(parenOpen + 1, parenClose);
  const bases = splitBaseList(inner);

  const signature =
    bases.length > 0
      ? `class ${className}(${bases.join(", ")})`
      : `class ${className}`;

  return { bases, signature };
}

/**
 * Split a parenthesized base list (the text between `(` and `)`) into
 * its constituent base names per ADR-13 parser rules 3-6:
 *   - Strip balanced `[...]` spans (drops generics)
 *   - Split on commas at depth 0
 *   - Drop kwarg tokens (`name=...`)
 *   - Strip trailing `[...]` from each surviving token
 *   - Reject tokens that aren't valid identifiers (or dotted identifiers)
 */
export function splitBaseList(inner: string): string[] {
  if (!inner.trim()) return [];

  // Split on commas at depth zero (tracking [...] depth; also tolerate
  // nested parens from Callable[[...], ...] forms).
  const tokens: string[] = [];
  let current = "";
  let bracketDepth = 0;
  let parenDepth = 0;
  for (const ch of inner) {
    if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);

    if (ch === "," && bracketDepth === 0 && parenDepth === 0) {
      tokens.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) tokens.push(current);

  const out: string[] = [];
  const DOTTED_NAME = /^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*$/;
  for (const raw of tokens) {
    let token = raw.trim();
    if (!token) continue;
    // Drop kwarg form (metaclass=Meta, init_subclass_kwarg=value).
    if (/^[A-Za-z_][\w]*\s*=/.test(token)) continue;
    // Strip trailing [...] (generic parameterization on the base itself).
    token = token.replace(/\[.*?\]\s*$/, "").trim();
    // Strip leading *args / **kwargs — not a valid base token.
    if (token.startsWith("*")) continue;
    // Must be a simple or dotted identifier. Anything else (function
    // calls, complex expressions) degrades to "not extracted".
    if (!DOTTED_NAME.test(token)) continue;
    out.push(token);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Import-alias parser (ADR-13 §Protocol detection mechanism b).
// ---------------------------------------------------------------------------

export interface ImportAliases {
  /**
   * Map from local name → original name. `from typing import Protocol
   * as Interface` produces `Interface → Protocol`. `import typing`
   * produces no entry (module imports don't alias the symbol).
   *
   * Used to resolve aliased Protocol references in class base lists.
   */
  nameToOriginal: Map<string, string>;
  /**
   * Set of qualified Protocol references that should be treated as
   * Protocols. Populated when the file imports `typing.Protocol` or
   * `typing_extensions.Protocol` in any form.
   */
  protocolAliases: Set<string>;
}

const PROTOCOL_SOURCES: ReadonlySet<string> = new Set([
  "typing",
  "typing_extensions",
]);

/**
 * Parse the top-of-file import statements for Protocol aliases.
 * Recognizes:
 *   from typing import Protocol
 *   from typing import Protocol as Interface
 *   from typing_extensions import Protocol
 *   import typing
 *   import typing as t
 *
 * Only scans top-level imports — nested / conditional imports ignored.
 * Stops at the first non-import, non-blank, non-comment line.
 */
export function parseImportAliases(sourceText: string): ImportAliases {
  const nameToOriginal = new Map<string, string>();
  const protocolAliases = new Set<string>();
  // Canonical Protocol names always treated as Protocols (mechanism a).
  protocolAliases.add("Protocol");
  protocolAliases.add("typing.Protocol");
  protocolAliases.add("typing_extensions.Protocol");

  const lines = sourceText.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith('"""') || line.startsWith("'''")) continue;
    // Stop at the first line that looks like actual code (not an import,
    // not a future-annotation, not a simple string-module-docstring).
    if (
      !line.startsWith("from ") &&
      !line.startsWith("import ") &&
      !line.startsWith('"""') &&
      !line.startsWith("'''")
    ) {
      // Skip decorator-only lines or module-level constants that
      // appear before class defs — import statements may continue
      // later in the file (rare but legal). Keep scanning.
      continue;
    }

    // `from <module> import X, Y as Z, ...`
    const fromMatch = /^from\s+([\w.]+)\s+import\s+(.+?)(?:\s+#.*)?$/.exec(
      line,
    );
    if (fromMatch) {
      const module = fromMatch[1]!;
      const importList = fromMatch[2]!;
      const isProtocolSource = PROTOCOL_SOURCES.has(module);
      // Strip surrounding parens for multi-line imports wrapped in ()
      const cleaned = importList.replace(/[()]/g, " ").trim();
      for (const part of cleaned.split(",")) {
        const t = part.trim();
        if (!t) continue;
        const asMatch = /^([\w]+)\s+as\s+([\w]+)$/.exec(t);
        if (asMatch) {
          const orig = asMatch[1]!;
          const alias = asMatch[2]!;
          nameToOriginal.set(alias, orig);
          if (isProtocolSource && orig === "Protocol") {
            protocolAliases.add(alias);
          }
        } else if (/^[\w]+$/.test(t)) {
          // `from typing import Protocol` — Protocol now resolvable
          // by its short name (already in protocolAliases).
          if (isProtocolSource && t === "Protocol") {
            protocolAliases.add("Protocol");
          }
        }
      }
      continue;
    }

    // `import <module>` or `import <module> as <alias>`
    const impMatch = /^import\s+([\w.]+)(?:\s+as\s+([\w]+))?/.exec(line);
    if (impMatch) {
      const module = impMatch[1]!;
      const alias = impMatch[2];
      if (PROTOCOL_SOURCES.has(module) && alias) {
        // `import typing as t` — subsequent `t.Protocol` is a Protocol.
        protocolAliases.add(`${alias}.Protocol`);
      }
      continue;
    }
  }

  return { nameToOriginal, protocolAliases };
}

// ---------------------------------------------------------------------------
// Protocol-detection combinator (ADR-13 §three composed mechanisms).
// Mechanism (c) lives on the adapter (needs cache); this function is
// mechanisms (a) + (b).
// ---------------------------------------------------------------------------

export function isProtocolBase(
  baseName: string,
  imports: ImportAliases,
): boolean {
  if (imports.protocolAliases.has(baseName)) return true;
  // Resolve aliased imports: `Interface` may alias `Protocol`.
  const original = imports.nameToOriginal.get(baseName);
  if (original === "Protocol") return true;
  // Dotted-name check — `typing_extensions.Protocol` via full path.
  if (baseName === "Protocol") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Inventory walk for usedByTypes + Protocol cache (ADR-13 §Two-pass).
// ---------------------------------------------------------------------------

/**
 * Scan source text for classes whose declaration includes `targetName`
 * as a base (matching the common-surface patterns). Returns the set of
 * derived class names. Used by PyrightAdapter.getTypeInfo to compute
 * usedByTypes in lieu of textDocument/implementation.
 *
 * Matching is name-equality; dotted-prefix stripping applies so
 * `typing.Protocol` in a base list matches `Protocol` queries.
 */
export function findClassesExtending(
  sourceText: string,
  targetName: string,
): string[] {
  const out: string[] = [];
  const lines = sourceText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.includes("class ")) continue;
    const header = extractClassDeclaration(sourceText, i);
    if (!header) continue;
    const parsed = parseClassDeclaration(header);
    if (parsed.bases.length === 0) continue;
    const matches = parsed.bases.some((b) => {
      // Match target against the base's short name OR the full dotted form.
      const short = b.includes(".") ? (b.split(".").pop() ?? b) : b;
      return b === targetName || short === targetName;
    });
    if (matches) {
      const nameMatch = /^class\s+([A-Za-z_][\w]*)/.exec(header);
      if (nameMatch && !out.includes(nameMatch[1]!)) {
        out.push(nameMatch[1]!);
      }
    }
  }
  return out;
}

/**
 * Walk source text for classes whose declaration inherits from a
 * Protocol (per mechanisms a+b). Used by PyrightAdapter.buildProtocolCache
 * during pass-1 of a full-indexing run.
 */
export function findClassesMatchingProtocol(
  sourceText: string,
  imports: ImportAliases,
): string[] {
  const out: string[] = [];
  const lines = sourceText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.includes("class ")) continue;
    const header = extractClassDeclaration(sourceText, i);
    if (!header) continue;
    const parsed = parseClassDeclaration(header);
    if (parsed.bases.length === 0) continue;
    if (parsed.bases.some((b) => isProtocolBase(b, imports))) {
      const nameMatch = /^class\s+([A-Za-z_][\w]*)/.exec(header);
      if (nameMatch && !out.includes(nameMatch[1]!)) {
        out.push(nameMatch[1]!);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Type alias + callable signature extraction helpers.
// ---------------------------------------------------------------------------

/**
 * Detect a module-level type-alias line per ADR-13's three syntactic
 * forms:
 *   UserIdV1 = str
 *   UserIdV2: TypeAlias = str
 *   type UserIdV3 = str        (PEP 695)
 *
 * The Pyright LSP reports all three as kind 13 (Variable); we remap to
 * `type` when the source matches one of these patterns.
 */
export function isTypeAliasLine(line: string, name: string): boolean {
  const trimmed = line.trimStart();
  if (!trimmed) return false;
  // PEP 695: `type Name = ...`
  if (new RegExp(`^type\\s+${escapeRegex(name)}\\s*[=\\[:]`).test(trimmed)) {
    return true;
  }
  // Annotated TypeAlias: `Name: TypeAlias = ...`
  if (
    new RegExp(
      `^${escapeRegex(name)}\\s*:\\s*(?:typing\\.)?TypeAlias\\s*=`,
    ).test(trimmed)
  ) {
    return true;
  }
  // Bare assignment with a type-shaped RHS — this is permissive
  // and matches any `Name = Expression` where RHS is a type name or
  // generic. We conservatively only remap when the bare form has RHS
  // that looks like a type.
  const bareMatch = new RegExp(
    `^${escapeRegex(name)}\\s*=\\s*(.+)$`,
  ).exec(trimmed);
  if (bareMatch) {
    const rhs = bareMatch[1]!.trim();
    // Accept single identifier, dotted name, or generic `Name[...]` form.
    if (
      /^[A-Za-z_][\w.]*(?:\[.*\])?$/.test(rhs) ||
      /^(?:Union|Optional|List|Dict|Tuple|Callable|Literal)\b/.test(rhs)
    ) {
      return true;
    }
  }
  return false;
}

function isModuleLevelAssignment(line: string, name: string): boolean {
  const trimmed = line.trimStart();
  // Match the specific pattern `X = value` or `X: type = value` at
  // module level — indentation must be zero (no leading whitespace).
  if (trimmed !== line) return false;
  return new RegExp(`^${escapeRegex(name)}\\s*(?::[^=]+)?=`).test(trimmed);
}

function extractTypeAliasSignature(
  line: string,
  name: string,
): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Normalize both forms into `type Name = ...` style for consistency.
  // PEP 695 already is; convert others.
  const pepMatch = new RegExp(
    `^(type\\s+${escapeRegex(name)}\\s*=\\s*.+)$`,
  ).exec(trimmed);
  if (pepMatch) return pepMatch[1]!.replace(/\s+/g, " ");
  const annotated = new RegExp(
    `^(${escapeRegex(name)}\\s*:\\s*(?:typing\\.)?TypeAlias\\s*=\\s*.+)$`,
  ).exec(trimmed);
  if (annotated) return annotated[1]!.replace(/\s+/g, " ");
  const bare = new RegExp(
    `^(${escapeRegex(name)}\\s*=\\s*.+)$`,
  ).exec(trimmed);
  if (bare) return bare[1]!.replace(/\s+/g, " ");
  return null;
}

/**
 * Extract the `def name(...)` line for a function/method, spanning
 * multi-line signatures via paren tracking. Returns the single-line
 * normalized signature (e.g. `def greet(name: str) -> str`).
 */
export function extractCallableSignatureLine(
  sourceText: string,
  startLine: number,
  maxLines = 10,
): string | null {
  const lines = sourceText.split(/\r?\n/);
  if (startLine >= lines.length) return null;
  const first = lines[startLine] ?? "";
  const defIdx = first.search(/\b(?:async\s+def|def)\s+/);
  if (defIdx === -1) return null;

  // Paren-depth track across lines until `:` at depth 0 or end of
  // budget.
  let collected = "";
  let depth = 0;
  for (let i = startLine; i < Math.min(lines.length, startLine + maxLines); i++) {
    const line = i === startLine ? first.slice(defIdx) : lines[i] ?? "";
    for (let j = 0; j < line.length; j++) {
      const ch = line[j]!;
      if (ch === "(") depth++;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      collected += ch;
      if (depth === 0 && (ch === ":" || ch === "\n")) {
        if (ch === ":") {
          return collected
            .slice(0, -1) // drop the trailing colon
            .replace(/\s+/g, " ")
            .trim();
        }
      }
    }
    collected += "\n";
  }
  // Fell off the budget — return best-effort.
  const trimmed = collected.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
