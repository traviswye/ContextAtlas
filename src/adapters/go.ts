/**
 * Go language adapter.
 *
 * Wraps `gopls` spawned as a subprocess, speaking LSP over stdio.
 * Implements the `LanguageAdapter` interface from src/types.ts per
 * ADR-03 (adapters are plugins) and ADR-14 (gopls-specific mapping
 * decisions and runtime prerequisites).
 *
 * Every path crossing into or out of LSP goes through normalizePath()
 * (ADR-01). Symbol IDs use repo-relative forward-slash paths with
 * case-normalized drive letters.
 *
 * Runtime prerequisites worth knowing (both documented in ADR-14):
 *   - The `go` binary must be on the process's PATH. Gopls spawns
 *     `go` as a subprocess for module loading; without it every LSP
 *     request returns "no views." The adapter runs a `go version`
 *     preflight in initialize() and fails fast with an actionable
 *     error if the binary is missing.
 *   - The `workspace/configuration` handler must return a
 *     length-matched array (pyright tolerates null; gopls does not).
 *     Implemented in the constructor.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
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
// LSP wire types (minimal subset; we don't depend on
// vscode-languageserver-types to keep the dep surface small per CLAUDE.md).
// ---------------------------------------------------------------------------

interface LspPosition {
  line: number;
  character: number;
}
interface LspRange {
  start: LspPosition;
  end: LspPosition;
}
interface LspDiagnostic {
  range: LspRange;
  severity?: number;
  message: string;
}
interface LspDocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}
interface LspLocation {
  uri: string;
  range: LspRange;
}

// ---------------------------------------------------------------------------
// Kind mapping per ADR-14 §"Symbol-kind mapping"
// ---------------------------------------------------------------------------

/**
 * Map gopls's LSP SymbolKind numbers to our reduced SymbolKind vocabulary.
 * ADR-14 §"Symbol-kind mapping" specifies:
 *   - 5 Class (type definition OR type alias) → "class"
 *   - 6 Method (interface methods + struct methods) → "method"
 *   - 8 Field (struct fields, embedded fields, embedded-interface entries)
 *     → "other" (we don't surface raw fields as top-level symbols)
 *   - 11 Interface → "interface"
 *   - 12 Function → "function"
 *   - 13 Variable (package-level var) → "variable"
 *   - 14 Constant (plain const + iota members) → "variable"
 *     (per ADR-14 finding §6, iota members are flat top-level constants —
 *     kept as "variable" in our reduced vocabulary since SymbolKind has
 *     no "constant" value)
 *   - 23 Struct → "class"
 *   - anything else → "other"
 */
export function mapGoSymbolKind(lspKind: number): SymbolKind {
  switch (lspKind) {
    case 5:
    case 23:
      return "class";
    case 11:
      return "interface";
    case 12:
      return "function";
    case 6:
      return "method";
    case 13:
    case 14:
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
// GoAdapter
// ---------------------------------------------------------------------------

export interface GoAdapterOptions {
  /**
   * Override the gopls binary path. Defaults to
   * `process.env.CONTEXTATLAS_GOPLS_BIN` when set, falling back to
   * `"gopls"` (resolved via PATH at spawn time). Tests use this to
   * point at a specific gopls installation independent of the shell's
   * PATH.
   */
  cliPath?: string;
  /** Upper bound on a single LSP request. Defaults to 30s. */
  requestTimeoutMs?: number;
  /**
   * Skip the `go version` preflight. Reserved for tests that stub the
   * LSP transport — production code should leave this at its default
   * `false` so the adapter fails fast when `go` is missing from PATH.
   */
  skipGoPreflight?: boolean;
  /**
   * Override the `go` binary used by the preflight. Defaults to `"go"`
   * (resolved via PATH). Test-only; production users should put `go`
   * on PATH per ADR-14.
   */
  goBin?: string;
}

export const GO_EXTENSIONS: readonly string[] = [".go"];

export class GoAdapter implements LanguageAdapter {
  readonly language: LanguageCode = "go";
  readonly extensions: readonly string[] = GO_EXTENSIONS;

  private readonly client: LspClient;
  private readonly options: GoAdapterOptions;
  private rootPath: string | null = null;
  private readonly openFiles = new Set<string>();
  private readonly diagnosticsByUri = new Map<string, Diagnostic[]>();
  private readonly diagnosticsListeners = new Map<string, () => void>();

  constructor(options: GoAdapterOptions = {}) {
    this.client = new LspClient("gopls");
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

    // Server-initiated stubs. Gopls issues these during startup; without
    // handlers the init hangs.
    for (const method of [
      "window/workDoneProgress/create",
      "client/registerCapability",
      "client/unregisterCapability",
      "window/showMessageRequest",
    ]) {
      this.client.onRequest(method, () => null);
    }

    // ADR-14 §"workspace/configuration handler" — gopls requires a
    // length-matched array response. Returning null (pyright-tolerated)
    // causes gopls to skip workspace-view creation, which cascades into
    // "no views" errors on every subsequent request.
    this.client.onRequest("workspace/configuration", (params) => {
      const items = (params as { items?: unknown[] } | null)?.items ?? [];
      return items.map(() => ({}));
    });
  }

  async initialize(rootPath: string): Promise<void> {
    if (this.rootPath) {
      throw new Error("GoAdapter.initialize called twice.");
    }
    const absRoot = pathResolve(rootPath);
    this.rootPath = normalizePath(absRoot);

    // ADR-14 §"Go binary on PATH" — gopls spawns `go` as a subprocess
    // for module loading. Run `go version` as a preflight so we fail
    // fast with an actionable error instead of the cryptic "no views"
    // cascade gopls produces when it can't find `go`.
    if (!this.options.skipGoPreflight) {
      await runGoVersionPreflight(this.options.goBin ?? "go");
    }

    const cliPath = resolveGoplsBin(this.options.cliPath);
    log.info(`[go-adapter] starting gopls`, {
      cliPath,
      rootPath: this.rootPath,
    });

    this.client.start(cliPath, [], absRoot);

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
            definition: {},
            hover: { contentFormat: ["markdown", "plaintext"] },
            implementation: {},
            typeDefinition: {},
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
      this.options.requestTimeoutMs ?? 60_000,
    );
    this.client.notify("initialized", {});
  }

  async shutdown(): Promise<void> {
    await this.client.stop();
    this.rootPath = null;
  }

  // -------------------------------------------------------------------------
  // Data methods — implementations land in Commits 4-5 of Step 9.
  // Skeleton throws "not yet implemented" so callers fail loudly rather
  // than silently returning empty results during the in-progress window.
  // -------------------------------------------------------------------------

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

    const out: AtlasSymbol[] = [];

    // Map a gopls documentSymbol to our AtlasSymbol shape. Returns
    // null when the kind lives on the "other" filter path (fields,
    // embedded-interface entries, module namespaces) — caller drops.
    const toAtlasSymbol = (
      sym: LspDocumentSymbol,
      effectiveName: string,
      parentId?: SymbolId,
    ): AtlasSymbol | null => {
      const kind = mapGoSymbolKind(sym.kind);
      if (kind === "other") return null;
      const atlasSym: AtlasSymbol = {
        id: this.symbolId(relPath, effectiveName),
        name: effectiveName,
        kind,
        path: relPath,
        line: sym.selectionRange.start.line + 1,
        language: "go",
      };
      if (sym.detail && sym.detail.length > 0) {
        atlasSym.signature = sym.detail;
      }
      if (parentId !== undefined) {
        atlasSym.parentId = parentId;
      }
      return atlasSym;
    };

    for (const top of result) {
      const topSym = toAtlasSymbol(top, top.name);
      if (!topSym) continue;
      out.push(topSym);

      // ADR-14 §Decision 4 (interface-method flattening): gopls nests
      // interface methods as children of the interface. We flatten
      // them to top-level Symbol records with a `parent_id`
      // back-pointer and a dotted name (`Shape.Area`) so downstream
      // consumers see a uniform flat layout regardless of whether the
      // owner is a struct or interface. Struct children (kind 23) are
      // fields — they map to "other" and are filtered at
      // toAtlasSymbol, so no flattening happens for them; struct
      // methods are already top-level with receiver-encoded names
      // (finding §4) and pass through unchanged.
      //
      // Interface children that are themselves kind 8 (embedded
      // interfaces, e.g. `Shape` nested inside `Renderer`) map to
      // "other" and are dropped. Their promoted methods surface via
      // the `implementation` endpoint in getTypeInfo (Commit 5), not
      // via listSymbols.
      if (top.kind === 11 && top.children) {
        for (const child of top.children) {
          const flatName = `${top.name}.${child.name}`;
          const flattened = toAtlasSymbol(child, flatName, topSym.id);
          if (!flattened) continue;
          out.push(flattened);
        }
      }
    }

    return out;
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
    const { absPath } = this.resolveFile(parsed.path);
    if (!existsSync(absPath)) return [];
    await this.ensureOpen(absPath);

    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return [];

    const target = findTargetPosition(symbols, parsed.name);
    if (!target) return [];

    const locations = await this.client.request<LspLocation[] | null>(
      "textDocument/references",
      {
        textDocument: { uri: toFileUri(absPath) },
        position: target,
        context: { includeDeclaration: false },
      },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!locations || !Array.isArray(locations)) return [];

    const refs: Reference[] = [];
    for (const loc of locations) {
      let refAbs: string;
      try {
        refAbs = fileURLToPath(loc.uri);
      } catch {
        continue;
      }
      let refRel: string;
      try {
        refRel = toRelativePath(normalizePath(refAbs), this.rootPath);
      } catch {
        // Reference is outside the workspace root — skip. Stdlib
        // references to e.g. `io.Writer` land here.
        continue;
      }
      const line = loc.range.start.line + 1;
      refs.push({
        id: this.referenceId(refRel, line),
        symbolId: id,
        path: refRel,
        line,
        column: loc.range.start.character,
      });
    }
    return refs;
  }

  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    const { absPath } = this.resolveFile(filePath);
    if (!existsSync(absPath)) return [];
    await this.ensureOpen(absPath);
    const uriKey = normalizePath(toFileUri(absPath));

    // If diagnostics already landed via publishDiagnostics (delivered
    // async after didOpen), return them. Otherwise wait briefly for
    // gopls to finish analysis and emit.
    const existing = this.diagnosticsByUri.get(uriKey);
    if (existing !== undefined) return existing;

    await new Promise<void>((resolve) => {
      let settled = false;
      const settle = (): void => {
        if (settled) return;
        settled = true;
        this.diagnosticsListeners.delete(uriKey);
        resolve();
      };
      this.diagnosticsListeners.set(uriKey, settle);
      setTimeout(settle, 2_000);
    });

    return this.diagnosticsByUri.get(uriKey) ?? [];
  }

  private async ensureOpen(absPath: string): Promise<void> {
    const normalized = normalizePath(absPath);
    if (this.openFiles.has(normalized)) return;
    this.openFiles.add(normalized);
    const uri = toFileUri(absPath);
    let text: string;
    try {
      text = readFileSync(absPath, "utf8");
    } catch {
      // Can't open what we can't read; dropping silently leaves the
      // caller's empty-result path intact.
      this.openFiles.delete(normalized);
      return;
    }
    this.client.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: "go", version: 1, text },
    });
  }

  async getDocstring(id: SymbolId): Promise<string | null> {
    const parsed = parseSymbolId(id);
    if (!parsed || !this.rootPath) return null;
    const { absPath } = this.resolveFile(parsed.path);
    if (!existsSync(absPath)) return null;
    await this.ensureOpen(absPath);

    // Locate the symbol's precise position via documentSymbol.
    // selectionRange.start lands on the identifier itself (not on the
    // surrounding declaration syntax) — critical for hover accuracy
    // per Substep 10.1 spike finding (Sample #4 receiver-vs-method
    // disambiguation). We MUST use the LSP-provided position rather
    // than re-derive it from a name string match against source text.
    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return null;

    // Search top-level + interface-method-flattened entries (matches
    // listSymbols' shape per ADR-14 §Decision 4).
    const findPosition = (
      syms: readonly LspDocumentSymbol[],
      parentName?: string,
    ): LspPosition | null => {
      for (const sym of syms) {
        const fullName = parentName ? `${parentName}.${sym.name}` : sym.name;
        if (fullName === parsed.name) return sym.selectionRange.start;
        // Recurse into interface-method children (kind 11) only;
        // matches listSymbols' flattening.
        if (sym.kind === 11 && sym.children) {
          const childMatch = findPosition(sym.children, sym.name);
          if (childMatch) return childMatch;
        }
      }
      return null;
    };
    const position = findPosition(symbols);
    if (!position) return null;

    // Hover for the docstring text. gopls returns markdown with three
    // sections separated by `\n---\n` per Substep 10.1 spike:
    //   ```go
    //   <signature block>
    //   ```
    //   ---
    //   <doc-comment prose>           ← extraction target
    //   ---
    //   <metadata: pkg.go.dev link, methods on type>
    const hover = await this.client.request<{
      contents?: { kind?: string; value?: string } | string;
    } | null>(
      "textDocument/hover",
      {
        textDocument: { uri: toFileUri(absPath) },
        position,
      },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!hover || !hover.contents) return null;
    const value =
      typeof hover.contents === "object" &&
      "value" in hover.contents &&
      typeof hover.contents.value === "string"
        ? hover.contents.value
        : null;
    if (!value) return null;
    return parseDocstringFromGoplsHover(value);
  }

  async getTypeInfo(id: SymbolId): Promise<TypeInfo> {
    const empty: TypeInfo = { extends: [], implements: [], usedByTypes: [] };
    const parsed = parseSymbolId(id);
    if (!parsed || !this.rootPath) return empty;
    const { absPath } = this.resolveFile(parsed.path);
    if (!existsSync(absPath)) return empty;
    await this.ensureOpen(absPath);

    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return empty;

    // getTypeInfo only applies to top-level type symbols (interfaces +
    // structs). Flattened interface-method names (e.g., `Shape.Area`)
    // and struct methods (`(*Rectangle).Area`) return the empty shape
    // — they're not types, they're members.
    const topLevel = symbols.find((s) => s.name === parsed.name);
    if (!topLevel) return empty;
    const sourceKind = mapGoSymbolKind(topLevel.kind);
    if (sourceKind !== "interface" && sourceKind !== "class") {
      return empty;
    }

    const result: TypeInfo = { extends: [], implements: [], usedByTypes: [] };

    // Forward direction (extends): interface embedding + struct
    // embedding both surface as kind-8 children of the source symbol
    // with the embedded type as the child name. Distinguish from
    // regular fields by whether the child's detail matches its name
    // (embedded: detail==name, e.g., Square.Rectangle child has
    // detail="Rectangle"; field: detail is the field type, e.g.,
    // Square.corner child has detail="string").
    if (topLevel.children) {
      for (const child of topLevel.children) {
        if (child.kind !== 8) continue;
        if (child.detail === child.name) {
          result.extends.push(child.name);
        }
      }
    }

    // Inverse direction (implements / usedByTypes): call
    // textDocument/implementation per ADR-14 §"getTypeInfo uses
    // implementation directly." Partition results by SOURCE kind:
    //   - source is interface → every result is an implementer →
    //     usedByTypes (structs that satisfy the interface, plus
    //     embedder interfaces)
    //   - source is struct → every result is an interface this
    //     struct satisfies → implements
    // This is cleaner than partitioning by target kind because
    // gopls already filters the directionally-relevant set.
    const impls = await this.client.request<LspLocation[] | null>(
      "textDocument/implementation",
      {
        textDocument: { uri: toFileUri(absPath) },
        position: topLevel.selectionRange.start,
      },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!impls || !Array.isArray(impls)) return result;

    const selfUri = normalizePath(toFileUri(absPath));
    const selfLine = topLevel.selectionRange.start.line;
    const docSymbolCache = new Map<string, LspDocumentSymbol[]>();
    const seen = new Set<string>();

    for (const loc of impls) {
      // Skip self — gopls usually doesn't return it but guard anyway.
      if (
        normalizePath(loc.uri) === selfUri &&
        loc.range.start.line === selfLine
      ) {
        continue;
      }

      let targetSymbols = docSymbolCache.get(loc.uri);
      if (targetSymbols === undefined) {
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
          targetSymbols = resp && Array.isArray(resp) ? resp : [];
        } catch {
          targetSymbols = [];
        }
        docSymbolCache.set(loc.uri, targetSymbols);
      }

      const enclosing = findEnclosingSymbol(
        targetSymbols,
        loc.range.start,
      );
      if (!enclosing || seen.has(enclosing.name)) continue;
      seen.add(enclosing.name);

      if (sourceKind === "interface") {
        result.usedByTypes.push(enclosing.name);
      } else {
        result.implements.push(enclosing.name);
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private symbolId(relPath: string, name: string): SymbolId {
    return `sym:${LANG_CODES.go}:${relPath}:${name}`;
  }

  private referenceId(relPath: string, line: number): ReferenceId {
    return `ref:${LANG_CODES.go}:${relPath}:${line}`;
  }

  private resolveFile(filePath: string): {
    absPath: string;
    relPath: string;
  } {
    if (!this.rootPath) {
      throw new Error("GoAdapter not initialized; call initialize() first.");
    }
    const absPath = pathResolve(this.rootPath, filePath);
    const relPath = toRelativePath(
      normalizePath(absPath),
      this.rootPath,
    );
    return { absPath, relPath };
  }
}

// ---------------------------------------------------------------------------
// Free helpers
// ---------------------------------------------------------------------------

/**
 * Extract the doc-comment prose section from gopls hover output.
 *
 * gopls hover returns a three-section markdown structure (verified
 * empirically across 7 cobra symbols spanning surface-shape diversity
 * during Substep 10.1 spike — packages, types, vars, functions, methods,
 * deprecation markers, build-tag-aware vars):
 *
 * ```
 * ```go
 * <signature block>
 * ```
 * ---
 * <doc-comment prose, multi-paragraph supported via blank lines>
 * ---
 * <metadata: pkg.go.dev link, methods on type, package path>
 * ```
 *
 * Section 2 (between the two `\n---\n` separators) is the doc-comment
 * prose — the load-bearing extraction target. Returns null when:
 *   - Fewer than 2 sections exist (no `---` separator → likely no docstring)
 *   - Section 2 is empty/whitespace-only (signature-only hover)
 *
 * Type/struct hover signature blocks are LONG (~200 LOC for cobra's
 * `type Command struct`) but the `\n---\n` split is content-agnostic
 * and remains reliable. See Step 10 docstring-probe-findings spike
 * notes in the v0.3 commit ladder for substantive findings.
 */
export function parseDocstringFromGoplsHover(
  hoverValue: string,
): string | null {
  const sections = hoverValue.split("\n---\n");
  if (sections.length < 2) return null;
  const docSection = sections[1];
  if (docSection === undefined) return null;
  const trimmed = docSection.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

function resolveGoplsBin(explicit?: string): string {
  return explicit ?? process.env.CONTEXTATLAS_GOPLS_BIN ?? "gopls";
}

/**
 * Parse a Go SymbolId (`sym:go:<path>:<name>`) into its components.
 * Returns null for IDs that don't match the expected shape — callers
 * treat that as "no such symbol" rather than throwing.
 *
 * Go symbol names can contain `()`, `*`, `[`, `]`, and `.` from the
 * receiver encoding (`(*Rectangle).Area`, `(*Stack[T]).Push`,
 * `Shape.Area`) but never colons, so a greedy regex anchored on the
 * second `:` divides path from name cleanly.
 */
export function parseSymbolId(
  id: SymbolId,
): { path: string; name: string } | null {
  const match = /^sym:go:([^:]+):(.+)$/.exec(id);
  if (!match) return null;
  return { path: match[1]!, name: match[2]! };
}

/**
 * Locate the position of a symbol identified by `name` within the
 * documentSymbol tree. Handles three naming shapes uniformly:
 *   - top-level plain names ("Shape", "NewRectangle")
 *   - receiver-encoded struct-method names ("(*Rectangle).Area",
 *     "(*Stack[T]).Push") — these are top-level symbols in gopls's
 *     output, so a direct top-level match works
 *   - flattened interface-method names ("Shape.Area") — not
 *     top-level; split on the first dot and look up as parent.child
 *     within the interface's children array
 */
export function findTargetPosition(
  symbols: LspDocumentSymbol[],
  name: string,
): LspPosition | null {
  for (const s of symbols) {
    if (s.name === name) return s.selectionRange.start;
  }
  const dotIdx = name.indexOf(".");
  if (dotIdx <= 0) return null;
  const parentName = name.substring(0, dotIdx);
  const childName = name.substring(dotIdx + 1);
  const parent = symbols.find((s) => s.name === parentName);
  if (!parent || !parent.children) return null;
  const child = parent.children.find((c) => c.name === childName);
  if (!child) return null;
  return child.selectionRange.start;
}

/**
 * Walk a documentSymbol tree and return the innermost symbol whose
 * range contains the given position. Used by getTypeInfo to resolve
 * each `implementation` result location back to the declaring
 * symbol's name for the `implements` / `usedByTypes` partition.
 */
export function findEnclosingSymbol(
  symbols: LspDocumentSymbol[],
  pos: LspPosition,
): LspDocumentSymbol | null {
  for (const s of symbols) {
    if (!positionInRange(pos, s.range)) continue;
    if (s.children) {
      for (const child of s.children) {
        if (positionInRange(pos, child.range)) return child;
      }
    }
    return s;
  }
  return null;
}

function positionInRange(pos: LspPosition, range: LspRange): boolean {
  const afterStart =
    pos.line > range.start.line ||
    (pos.line === range.start.line && pos.character >= range.start.character);
  const beforeEnd =
    pos.line < range.end.line ||
    (pos.line === range.end.line && pos.character <= range.end.character);
  return afterStart && beforeEnd;
}

/**
 * Run `<goBin> version` and resolve when it exits 0. Throws with an
 * actionable message when the subprocess can't be spawned or exits
 * non-zero — per ADR-14, this is the fail-fast path that surfaces a
 * missing `go` binary before gopls's "no views" cascade kicks in.
 */
export function runGoVersionPreflight(goBin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(goBin, ["version"], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => {
      reject(
        new Error(
          `GoAdapter: \`${goBin} version\` could not be spawned. ` +
            "Install Go 1.22+ and ensure `go version` works in a plain " +
            "shell, then retry. Gopls requires `go` on PATH for module " +
            "resolution; without it, no Go symbols will be indexed.\n" +
            `Underlying error: ${String(err)}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `GoAdapter: \`${goBin} version\` exited with code ${code}. ` +
            "Verify your Go install is usable (`go version` in a plain " +
            "shell should print a version). " +
            (stderr.trim() ? `stderr: ${stderr.trim()}` : ""),
        ),
      );
    });
  });
}
