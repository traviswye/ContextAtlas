/**
 * TypeScript language adapter.
 *
 * Wraps `typescript-language-server` spawned as a subprocess, speaking LSP
 * over stdio. Implements the `LanguageAdapter` interface from src/types.ts
 * per ADR-03 (adapters are plugins).
 *
 * Every path crossing into or out of LSP goes through normalizePath()
 * (ADR-01). Symbol IDs use repo-relative forward-slash paths with
 * case-normalized drive letters.
 */

import { readdirSync, readFileSync } from "node:fs";
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
} from "../types.js";
import {
  normalizePath,
  toFileUri,
  toRelativePath,
} from "../utils/paths.js";

import { LspClient } from "./lsp-client.js";

// ---------------------------------------------------------------------------
// LSP wire types (minimal subset — we don't depend on the vscode-languageserver
// types package to keep dependencies slim per CLAUDE.md).
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

// LSP SymbolKind → our SymbolKind. Values we don't care about collapse to "other".
function mapSymbolKind(lspKind: number): SymbolKind {
  switch (lspKind) {
    case 5:
      return "class";
    case 11:
      return "interface";
    case 12:
      return "function";
    case 6:
      return "method";
    case 10:
      return "enum";
    case 2:
      return "module";
    case 13:
    case 14:
      return "variable";
    case 26:
    case 23:
      return "type";
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
// TypeScriptAdapter
// ---------------------------------------------------------------------------

export interface TypeScriptAdapterOptions {
  /**
   * Override the path to the typescript-language-server CLI. If omitted,
   * resolved from the consuming project's node_modules.
   */
  cliPath?: string;
  /** Upper bound on a single LSP request. */
  requestTimeoutMs?: number;
}

export class TypeScriptAdapter implements LanguageAdapter {
  readonly language: LanguageCode = "typescript";
  readonly extensions: readonly string[] = [".ts", ".tsx", ".mts", ".cts"];

  private readonly client: LspClient;
  private readonly options: TypeScriptAdapterOptions;
  private rootPath: string | null = null;
  private readonly openFiles = new Set<string>();
  private readonly diagnosticsByUri = new Map<string, Diagnostic[]>();
  private readonly diagnosticsListeners = new Map<string, () => void>();

  constructor(options: TypeScriptAdapterOptions = {}) {
    this.client = new LspClient("typescript");
    this.options = options;
    this.client.onNotification("textDocument/publishDiagnostics", (params) => {
      const p = params as {
        uri: string;
        diagnostics: LspDiagnostic[];
      } | null;
      if (!p || typeof p.uri !== "string" || !this.rootPath) return;
      const normalizedUri = normalizePath(p.uri);
      // Silently skip diagnostics for files outside the workspace root
      // (tsserver sometimes reports on transitively-loaded files).
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
    });
  }

  async initialize(rootPath: string): Promise<void> {
    if (this.rootPath) {
      throw new Error("TypeScriptAdapter.initialize called twice.");
    }
    const absRoot = pathResolve(rootPath);
    this.rootPath = normalizePath(absRoot);

    const cliPath = this.options.cliPath ?? resolveTsServerCli();
    log.info(`[ts-adapter] starting typescript-language-server`, {
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
            publishDiagnostics: {},
            synchronization: {
              dynamicRegistration: false,
              didSave: false,
            },
          },
          workspace: { workspaceFolders: true },
        },
      },
      this.options.requestTimeoutMs ?? 30_000,
    );
    this.client.notify("initialized", {});

    // tsserver only searches reference sites in files it has in its program.
    // Opening a file pulls in its transitive imports, but dependents — files
    // that import the target — won't be searched unless explicitly opened.
    // Walk the workspace once and open every matching source file so that
    // findReferences returns project-wide results.
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
        if (name.startsWith(".")) continue;
        const full = pathJoin(dir, name);
        if (entry.isDirectory()) {
          if (skipDirs.has(name)) continue;
          walk(full);
        } else if (entry.isFile() && extSet.has(extname(name))) {
          try {
            this.ensureOpenSync(full);
          } catch {
            // Skip files we can't read; they simply won't be searched.
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
        languageId: languageIdForExt(extname(absPath)),
        version: 1,
        text,
      },
    });
    this.openFiles.add(absPath);
  }

  async shutdown(): Promise<void> {
    this.rootPath = null;
    this.openFiles.clear();
    this.diagnosticsByUri.clear();
    this.diagnosticsListeners.clear();
    await this.client.stop();
  }

  async listSymbols(filePath: string): Promise<AtlasSymbol[]> {
    const { absPath, relPath } = this.resolveFile(filePath);
    await this.ensureOpen(absPath);
    const result = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!result || !Array.isArray(result)) return [];
    return result.map((sym) => this.toAtlasSymbol(sym, relPath));
  }

  async getSymbolDetails(id: SymbolId): Promise<AtlasSymbol | null> {
    const parsed = parseSymbolId(id);
    if (!parsed) return null;
    const symbols = await this.listSymbols(parsed.path);
    const found = symbols.find((s) => s.name === parsed.name) ?? null;
    // TODO(step-6-polish): enrich `signature` field via textDocument/hover
    // on the symbol's selectionRange. Deferred from step 2 to keep this
    // step focused on the interface + basic listing.
    return found;
  }

  async findReferences(id: SymbolId): Promise<Reference[]> {
    const parsed = parseSymbolId(id);
    if (!parsed || !this.rootPath) return [];
    const absPath = this.toAbs(parsed.path);
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
    await this.ensureOpen(absPath);
    const uriKey = normalizePath(toFileUri(absPath));

    // If diagnostics already arrived, return them.
    const existing = this.diagnosticsByUri.get(uriKey);
    if (existing) return existing;

    // Otherwise wait up to 1s for the push notification.
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

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private async ensureOpen(absPath: string): Promise<void> {
    this.ensureOpenSync(absPath);
  }

  private resolveFile(filePath: string): { absPath: string; relPath: string } {
    if (!this.rootPath) {
      throw new Error(
        "TypeScriptAdapter not initialized. Call initialize(rootPath) first.",
      );
    }
    const absPath = pathResolve(filePath);
    const relPath = toRelativePath(absPath, this.rootPath);
    return { absPath, relPath };
  }

  private toAbs(relPath: string): string {
    if (!this.rootPath) {
      throw new Error("TypeScriptAdapter not initialized.");
    }
    return pathResolve(this.rootPath, relPath);
  }

  private toAtlasSymbol(
    sym: LspDocumentSymbol,
    relPath: string,
  ): AtlasSymbol {
    return {
      id: this.symbolId(relPath, sym.name),
      name: sym.name,
      kind: mapSymbolKind(sym.kind),
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
// Module-level helpers
// ---------------------------------------------------------------------------

function resolveTsServerCli(): string {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve("typescript-language-server/lib/cli.mjs");
  } catch (err) {
    throw new Error(
      "Could not locate typescript-language-server. It is a peer " +
        "dependency — install it in your project (npm i -D " +
        "typescript-language-server typescript) or pass an explicit " +
        "cliPath to TypeScriptAdapter.\n" +
        `Underlying resolution error: ${String(err)}`,
    );
  }
}

function languageIdForExt(ext: string): string {
  switch (ext) {
    case ".tsx":
      return "typescriptreact";
    case ".ts":
    case ".mts":
    case ".cts":
    default:
      return "typescript";
  }
}

function parseSymbolId(
  id: SymbolId,
): { path: string; name: string } | null {
  // Format: sym:<lang>:<path>:<name>
  // Path may itself contain colons (e.g. "C:/..."), so split from both ends.
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
