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
import { fileURLToPath } from "node:url";

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

    // Read the source once per call; signature extraction for eligible
    // kinds (class/interface/function/method + type-alias variables)
    // needs the declaration text, and re-reading per symbol would be
    // gratuitous.
    let sourceText: string | null = null;
    const loadSource = (): string => {
      if (sourceText === null) {
        try {
          sourceText = readFileSync(absPath, "utf8");
        } catch {
          sourceText = "";
        }
      }
      return sourceText;
    };

    return result.map((sym) => {
      const base = this.toAtlasSymbol(sym, relPath);
      const signature = deriveSignatureForSymbol(
        base.kind,
        loadSource(),
        sym.selectionRange.start.line,
      );
      return signature !== null ? { ...base, signature } : base;
    });
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

  async getTypeInfo(id: SymbolId): Promise<TypeInfo> {
    const empty: TypeInfo = { extends: [], implements: [], usedByTypes: [] };
    const parsed = parseSymbolId(id);
    if (!parsed || !this.rootPath) return empty;

    const absPath = this.toAbs(parsed.path);
    await this.ensureOpen(absPath);

    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return empty;
    const target = findSymbolByName(symbols, parsed.name);
    if (!target) return empty;
    const targetUri = toFileUri(absPath);

    // Per-call caches: avoid re-reading the same file or re-requesting
    // documentSymbol for candidates that share a source file.
    const fileTextCache = new Map<string, string>();
    const docSymbolCache = new Map<string, LspDocumentSymbol[]>();

    const readText = (uri: string, abs: string): string => {
      let t = fileTextCache.get(uri);
      if (t === undefined) {
        try {
          t = readFileSync(abs, "utf8");
        } catch {
          t = "";
        }
        fileTextCache.set(uri, t);
      }
      return t;
    };

    const result: TypeInfo = { extends: [], implements: [], usedByTypes: [] };

    // Forward direction: parse extends / implements from the declaration
    // header in the source file. tsserver's textDocument/hover strips
    // extends/implements from its response, so we read the source text
    // directly — LSP locates the symbol precisely; the text scan is
    // surgical (header line only, until `{` or end of ~5 lines).
    try {
      const sourceText = readText(targetUri, absPath);
      const header = extractDeclarationHeader(
        sourceText,
        target.selectionRange.start.line,
      );
      const fwd = parseTypeRelationshipsFromDeclaration(header);
      result.extends = fwd.extends;
      result.implements = fwd.implements;
    } catch (err) {
      log.warn("ts-adapter: declaration-header read failed", {
        symbol: id,
        err: String(err),
      });
    }

    // Inverse direction: textDocument/implementation. tsserver returns
    // the transitive closure (grandchildren included), so we filter down
    // to direct children by checking each candidate's own declaration
    // for a reference to the target name.
    try {
      const impls = await this.client.request<LspLocation[] | null>(
        "textDocument/implementation",
        { textDocument: { uri: targetUri }, position: target.selectionRange.start },
        this.options.requestTimeoutMs ?? 30_000,
      );
      if (impls && Array.isArray(impls)) {
        const selfUri = normalizePath(targetUri);
        const seen = new Set<string>();

        for (const loc of impls) {
          if (
            normalizePath(loc.uri) === selfUri &&
            loc.range.start.line === target.selectionRange.start.line
          ) {
            continue; // self
          }

          let candidateSymbols = docSymbolCache.get(loc.uri);
          if (candidateSymbols === undefined) {
            try {
              const targetAbs = fileURLToPath(loc.uri);
              await this.ensureOpen(targetAbs);
              const resp = await this.client.request<
                LspDocumentSymbol[] | null
              >(
                "textDocument/documentSymbol",
                { textDocument: { uri: loc.uri } },
                this.options.requestTimeoutMs ?? 30_000,
              );
              candidateSymbols =
                resp && Array.isArray(resp) ? resp : [];
            } catch {
              candidateSymbols = [];
            }
            docSymbolCache.set(loc.uri, candidateSymbols);
          }

          const enclosing = findEnclosingSymbolNode(
            candidateSymbols,
            loc.range.start,
          );
          if (
            !enclosing ||
            enclosing.name === parsed.name ||
            seen.has(enclosing.name)
          ) {
            continue;
          }

          // Direct-child filter: read the candidate's own declaration
          // header and confirm it references the target name in extends
          // or implements.
          const candidateAbs = fileURLToPath(loc.uri);
          const candidateText = readText(loc.uri, candidateAbs);
          const candidateHeader = extractDeclarationHeader(
            candidateText,
            enclosing.selectionRange.start.line,
          );
          const candidateRel = parseTypeRelationshipsFromDeclaration(
            candidateHeader,
          );
          if (
            candidateRel.extends.includes(parsed.name) ||
            candidateRel.implements.includes(parsed.name)
          ) {
            seen.add(enclosing.name);
            result.usedByTypes.push(enclosing.name);
          }
        }
      }
    } catch (err) {
      log.warn("ts-adapter: implementation failed during getTypeInfo", {
        symbol: id,
        err: String(err),
      });
    }

    return result;
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
    // Resolve against the adapter's root when the input is relative so
    // callers (query layer, MCP handlers) can pass repo-relative paths
    // they already have from symbol records without knowing the root.
    // pathResolve is idempotent on absolute inputs.
    const absPath = pathResolve(this.rootPath, filePath);
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

// ---------------------------------------------------------------------------
// Pure helpers for getTypeInfo — exported for direct unit testing.
// ---------------------------------------------------------------------------

/**
 * Remove balanced `<...>` spans from a declaration header. Eliminates
 * generic type arguments and constraints before extends / implements
 * extraction, so `class Box<T extends Widget>` does NOT register
 * `Widget` as a parent of `Box`.
 */
export function stripGenericBrackets(s: string): string {
  let out = "";
  let depth = 0;
  for (const ch of s) {
    if (ch === "<") {
      depth++;
      continue;
    }
    if (ch === ">" && depth > 0) {
      depth--;
      continue;
    }
    if (depth === 0) out += ch;
  }
  return out;
}

/**
 * Read the declaration header starting at `startLine` (0-indexed),
 * concatenating forward until the first `{` or `;`, or after a small
 * line budget. Used for class / interface / function / method
 * declarations where `{` starts the body.
 *
 * For type aliases with object-shape RHS (`type X = { a: number };`),
 * use `extractTypeAliasHeader` instead — the first `{` there is part
 * of the value, not a body marker.
 */
export function extractDeclarationHeader(
  sourceText: string,
  startLine: number,
  maxLines = 6,
): string {
  const lines = sourceText.split(/\r?\n/);
  let collected = "";
  for (let i = startLine; i < Math.min(lines.length, startLine + maxLines); i++) {
    const line = lines[i] ?? "";
    let terminator = line.length;
    const braceIdx = line.indexOf("{");
    if (braceIdx >= 0) terminator = Math.min(terminator, braceIdx);
    const semiIdx = line.indexOf(";");
    if (semiIdx >= 0) terminator = Math.min(terminator, semiIdx);
    if (terminator < line.length) {
      collected += " " + line.slice(0, terminator);
      break;
    }
    collected += " " + line;
  }
  return collected.trim();
}

/**
 * Read a type-alias header including its right-hand side up to the
 * terminating `;` (or end of line budget). Unlike
 * `extractDeclarationHeader`, this does NOT stop at `{` — type aliases
 * can legitimately contain `{` as part of their value, e.g.
 * `type Point = { x: number; y: number };` should render in full.
 */
export function extractTypeAliasHeader(
  sourceText: string,
  startLine: number,
  maxLines = 6,
): string {
  const lines = sourceText.split(/\r?\n/);
  let collected = "";
  for (let i = startLine; i < Math.min(lines.length, startLine + maxLines); i++) {
    const line = lines[i] ?? "";
    const semiIdx = line.indexOf(";");
    if (semiIdx >= 0) {
      collected += " " + line.slice(0, semiIdx);
      break;
    }
    collected += " " + line;
  }
  return collected.trim();
}

/**
 * Normalize a raw declaration header into a bundle-ready signature:
 * strip the leading `export` keyword (scope metadata, not signature),
 * collapse whitespace runs to single spaces. Retains modifiers like
 * `abstract`, `async`, `declare`, `default` — they carry type-system
 * information readers expect to see.
 */
export function normalizeSignature(header: string): string {
  return header
    .replace(/\s+/g, " ")
    .replace(/^export\s+/, "")
    .trim();
}

/**
 * Detect whether a normalized signature is malformed — typically
 * because extraction truncated mid-expression (unclosed `extends`,
 * dangling `=` from a type alias with an inline complex RHS we
 * couldn't reach). A malformed signature should be OMITTED rather
 * than rendered; `SIG type X =` looks broken to users.
 */
export function looksMalformedSignature(sig: string): boolean {
  return /(?:=|extends|implements|,)\s*$/.test(sig);
}

const SIGNATURE_KINDS: ReadonlySet<SymbolKind> = new Set([
  "class",
  "interface",
  "function",
  "method",
]);

/**
 * Decide whether a symbol should have a signature and, if so, compute
 * it from the source text. Returns null when the symbol is not
 * eligible or when extraction produced something unusable.
 *
 * TS type aliases come back from tsserver with LSP kind Variable (13),
 * which maps to our `variable` kind. Since we don't want every `const`
 * to carry a signature, we distinguish type aliases by peeking at the
 * source line.
 */
function deriveSignatureForSymbol(
  kind: SymbolKind,
  sourceText: string,
  startLine: number,
): string | null {
  if (SIGNATURE_KINDS.has(kind)) {
    const header = extractDeclarationHeader(sourceText, startLine);
    return finalizeSig(header);
  }
  if (kind === "variable") {
    // Detect TS type-alias declarations that tsserver reports as
    // Variable. Match `(export )?type <name> = ...`.
    const line = (sourceText.split(/\r?\n/)[startLine] ?? "").trimStart();
    if (/^(?:export\s+)?type\s+[A-Za-z_$][\w$]*\b/.test(line)) {
      const header = extractTypeAliasHeader(sourceText, startLine);
      return finalizeSig(header);
    }
  }
  return null;
}

function finalizeSig(header: string): string | null {
  if (!header) return null;
  const normalized = normalizeSignature(header);
  if (!normalized) return null;
  if (looksMalformedSignature(normalized)) return null;
  return normalized;
}

/**
 * Parse extends / implements tokens from a raw declaration header
 * like `export abstract class Foo<T> extends Bar implements Baz, Qux`.
 * Generic brackets are stripped first so constraints inside `<…>` do
 * not leak into the parent list.
 */
export function parseTypeRelationshipsFromDeclaration(
  declaration: string,
): { extends: string[]; implements: string[] } {
  const empty = { extends: [], implements: [] } as {
    extends: string[];
    implements: string[];
  };
  if (!declaration) return empty;

  const oneLine = declaration.replace(/\s+/g, " ").trim();
  if (!/\b(class|interface)\b/.test(oneLine)) return empty;

  const stripped = stripGenericBrackets(oneLine);

  const parseList = (text: string | undefined): string[] => {
    if (!text) return [];
    return text
      .split(",")
      .map((s) => s.trim())
      .map((s) => s.split(".").pop() ?? s)
      .map((s) => s.replace(/[{};,].*$/, "").trim())
      .filter((s) => s.length > 0 && /^[A-Za-z_$][\w$]*$/.test(s));
  };

  const extMatch = /\bextends\s+([^{]+?)(?:\s+implements\b|\s*\{|\s*$)/.exec(
    stripped,
  );
  const implMatch = /\bimplements\s+([^{]+?)(?:\s*\{|\s*$)/.exec(stripped);

  return {
    extends: parseList(extMatch?.[1]),
    implements: parseList(implMatch?.[1]),
  };
}

/**
 * Walk a documentSymbol tree and return the deepest symbol whose range
 * contains the given position. Returns null if no symbol contains it.
 */
export function findEnclosingSymbolNode(
  symbols: LspDocumentSymbol[],
  position: { line: number; character: number },
): LspDocumentSymbol | null {
  for (const sym of symbols) {
    if (containsPosition(sym.range, position)) {
      const childMatch =
        sym.children && sym.children.length > 0
          ? findEnclosingSymbolNode(sym.children, position)
          : null;
      return childMatch ?? sym;
    }
  }
  return null;
}

function containsPosition(
  range: LspRange,
  pos: { line: number; character: number },
): boolean {
  if (pos.line < range.start.line || pos.line > range.end.line) return false;
  if (pos.line === range.start.line && pos.character < range.start.character)
    return false;
  if (pos.line === range.end.line && pos.character > range.end.character)
    return false;
  return true;
}
