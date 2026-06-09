/**
 * C# language adapter backed by csharp-ls + Microsoft.CodeAnalysis.
 * LanguageServer (ADR-22).
 *
 * Wraps `csharp-ls` (razzmatazz/csharp-language-server) spawned as a
 * subprocess, speaking LSP over stdio. csharp-ls itself wraps the
 * official Roslyn LSP (Microsoft.CodeAnalysis.LanguageServer) and
 * presents a clean LSP-spec interface to clients — absorbs Roslyn's
 * custom protocol (project-restore signaling, .sln/.csproj
 * resolution, MSBuild SDK registration). Implements the
 * `LanguageAdapter` interface from src/types.ts per ADR-03 (adapters
 * are plugins) and ADR-07 (getTypeInfo is a required capability).
 *
 * Phase 3 implementation complete across 8 substeps:
 *   - 3.1: skeleton — constructor, handler stubs, spawn pattern
 *     (with Windows PATH-enrichment for dotnet tools), initialize
 *     handshake, shutdown.
 *   - 3.2: listSymbols — hierarchical-tree walk + parentId
 *     back-pointer + File-kind-1 wrapper skip + Roslyn detail field
 *     as signature substrate.
 *   - 3.3: getSymbolDetails — hover-based signature refinement +
 *     parseCsharpHoverContent + findSymbolByName + parseSymbolId.
 *   - 3.4: findReferences — clean LSP Location[] (no URL-encoding
 *     dedup needed; Roslyn cleaner than ruby-lsp per Phase 0).
 *   - 3.5: getDiagnostics — LSP 3.17 pull-model
 *     (textDocument/diagnostic REQUEST; net-new substrate parallel
 *     to ADR-21 Ruby).
 *   - 3.6: getTypeInfo — native typeDefinition + implementation;
 *     declaration-line scan only for base-vs-interface
 *     disambiguation (not multi-pass class-hierarchy walk parallel
 *     to ADR-13 Pyright / ADR-21 Ruby).
 *   - 3.7: getDocstring — forward-composition consumer of 3.3
 *     parseCsharpHoverContent prose field; XML doc summary + Parameters:
 *     section surfaced as structured markdown.
 *   - 3.8: adapter close + consolidation (THIS commit) — header
 *     doc update + inline-require hoist + Phase 3 close substrate-
 *     record observations.
 *
 * Divergences from ADR-13 (Pyright) + ADR-14 (gopls) + ADR-21 (Ruby)
 * documented in ADR-22:
 *   - Wrapper-as-vehicle: csharp-ls wraps Microsoft.CodeAnalysis.
 *     LanguageServer. ContextAtlas sees clean LSP-spec endpoints; the
 *     wrapper absorbs Roslyn's custom protocol.
 *   - Single-pattern install (dotnet tool global; no dual-pattern
 *     parallel to Ruby's bundler-vs-gem).
 *   - Windows PATH-enrichment for `%USERPROFILE%\.dotnet\tools`
 *     (Bash/Git-Bash doesn't inherit dotnet tools path from
 *     PowerShell-configured PATH). Parallel to ADR-21 RUBY_BIN_DIRS +
 *     ADR-14 gopls "Go binary must be on PATH" finding. Phase 0
 *     spike empirical (2026-06-08).
 *   - Pull-model diagnostics (LSP 3.17 `textDocument/diagnostic`
 *     REQUEST), parallel to ADR-21; NOT publishDiagnostics
 *     notification (parallel to Pyright/gopls).
 *   - Native typeDefinition + implementation (Roslyn supports both);
 *     no declaration-parse fallback parallel to ADR-13 Pyright
 *     Protocol-cache or ADR-21 Ruby class-hierarchy parse.
 *   - Hover includes XML doc summaries + parameter descriptions
 *     out of the box (parallel to gopls; substantively different
 *     from ADR-13 Pyright omits-docstrings).
 *   - No cold-start `$/progress` readiness gate — Roslyn (via
 *     csharp-ls) follows Pyright pattern per Phase 0 probe empirical;
 *     per-call ceiling absorbs cold-start variance.
 *   - csharp-ls is solo-maintained (Saulius Menkevičius); NOT
 *     corporate-backed parallel to ruby-lsp's Shopify backing.
 *     Maintenance-tail mitigations per ADR-22: A2 fallback path;
 *     doctor staleness signal; minimum-version pin.
 *
 * See `docs/adr/csharp-roslyn-probe/findings-baseline.md` for the
 * Phase 0 empirical probe substrate motivating these design choices.
 */

import { spawn as childSpawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import {
  join as pathJoin,
  resolve as pathResolve,
} from "node:path";

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
import { normalizePath, toFileUri, toRelativePath } from "../utils/paths.js";

import { LspClient } from "./lsp-client.js";

// ---------------------------------------------------------------------------
// LSP wire types — minimal subset (CLAUDE.md dependency-minimization rule).
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
  code?: string | number;
  source?: string;
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
// Kind mapping per ADR-22 §"Symbol-kind mapping". Roslyn (via csharp-ls)
// emits clean LSP standard kinds — no .NET-specific divergence parallel
// to Ruby's kind-12-uniform discovery. Empirically verified at Phase 0
// probe (see findings-baseline.md):
//   1  File         — top-level wrapper per file; adapter walks children
//                    and starts at namespace level (filtered out)
//   3  Namespace    — namespace declarations (both file-scoped and
//                    block-scoped forms)
//   5  Class        — class, record, delegate (LSP spec has no
//                    dedicated record kind; Roslyn pragmatic mapping)
//   6  Method       — all callable members (instance, static, async)
//   7  Property     — property declarations with {get; set;}, {get; init;},
//                    expression-bodied — all emit kind 7
//   8  Field        — fields, const fields (reduced taxonomy maps to
//                    `variable` parallel to gopls iota-const + Ruby
//                    constant precedent)
//   9  Constructor  — constructor declarations; remap to method
//   10 Enum         — enum declarations
//   11 Interface    — interface declarations
//   22 EnumMember   — enum member values; remap to variable
//   23 Struct       — struct declarations; remap to class (struct's
//                    distinguishing features not load-bearing for
//                    adapter contract at v1.1.0)
//   24 Event        — event declarations; remap to method (events are
//                    method-like delegate invocations)
// ---------------------------------------------------------------------------
export function mapCsharpKind(lspKind: number): SymbolKind {
  switch (lspKind) {
    case 3:
      return "module"; // namespace → module (closest fit in reduced taxonomy)
    case 5:
      return "class"; // class, record, delegate
    case 6:
      return "method";
    case 7:
      // property — no dedicated `property` in reduced SymbolKind taxonomy.
      // Maps to `variable` parallel to gopls iota-const + Ruby constant
      // precedent; semantically property is a field-like accessor and
      // downstream consumers interact with it like a variable. Future
      // v1.x candidate to add `property` to the SymbolKind enum if
      // downstream consumers need the distinction.
      return "variable";
    case 8:
      return "variable"; // field, const
    case 9:
      return "method"; // constructor
    case 10:
      return "enum";
    case 11:
      return "interface";
    case 22:
      return "variable"; // enum member
    case 23:
      return "class"; // struct
    case 24:
      return "method"; // event
    default:
      return "other";
  }
}

export function mapDiagnosticSeverity(
  n: number | undefined,
): Diagnostic["severity"] {
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
// Dotnet-tool PATH enrichment per ADR-22 §"Windows PATH-enrichment for
// dotnet tools". Surfaced at Phase 0 first probe attempt (2026-06-08):
// Bash/Git-Bash on Windows does NOT have %USERPROFILE%\.dotnet\tools on
// PATH; only PowerShell does (SDK installer configures PowerShell only).
// When a Node process spawned from Bash tries to spawn csharp-ls, the
// call fails with `Error: spawn csharp-ls ENOENT`.
//
// Pattern parallel to ADR-21 RUBY_BIN_DIRS + ADR-14 gopls
// "Go binary must be on PATH" finding. Runs unconditionally at start;
// doctor preflight verifies post-enrichment findability.
// ---------------------------------------------------------------------------
export function enrichPathForDotnetTools(): void {
  const toolDirs = [
    process.env.USERPROFILE
      ? `${process.env.USERPROFILE}\\.dotnet\\tools`
      : null,
    process.env.HOME ? `${process.env.HOME}/.dotnet/tools` : null,
  ].filter((d): d is string => d !== null);

  if (toolDirs.length === 0) return;

  const sep = process.platform === "win32" ? ";" : ":";
  process.env.PATH = [...toolDirs, process.env.PATH ?? ""]
    .filter(Boolean)
    .join(sep);
}

// ---------------------------------------------------------------------------
// CsharpAdapter
// ---------------------------------------------------------------------------

export interface CsharpAdapterOptions {
  /**
   * Override the csharp-ls binary path. When set, bypasses default
   * resolution and spawns the binary directly. Defaults to
   * `process.env.CONTEXTATLAS_CSHARP_LSP_BIN` when unset.
   */
  cliPath?: string;
  /** Upper bound on a single LSP request. Defaults to 60s. */
  requestTimeoutMs?: number;
  /**
   * Skip the `dotnet --version` preflight. Reserved for tests that
   * stub the LSP transport — production code should leave at default
   * `false` so the adapter fails fast when `dotnet` is missing from
   * PATH.
   */
  skipDotnetPreflight?: boolean;
  /**
   * Override the `dotnet` binary used by the preflight. Defaults to
   * `"dotnet"` (resolved via PATH). Test-only; production users should
   * put `dotnet` on PATH per ADR-22.
   */
  dotnetBin?: string;
  /**
   * Skip the PATH enrichment for dotnet tools. Reserved for tests
   * that control the spawn environment directly. Production code
   * should leave at default `false`.
   */
  skipPathEnrichment?: boolean;
}

/** Extensions indexed at v1.1 per ADR-22 (`.cs` only at v1.1.0). */
export const CSHARP_EXTENSIONS: readonly string[] = [".cs"];

export class CsharpAdapter implements LanguageAdapter {
  readonly language: LanguageCode = "csharp";
  readonly extensions: readonly string[] = CSHARP_EXTENSIONS;

  private readonly client: LspClient;
  private readonly options: CsharpAdapterOptions;
  private rootPath: string | null = null;
  private readonly openFiles = new Set<string>();
  private readonly diagnosticsByUri = new Map<string, Diagnostic[]>();
  private readonly diagnosticsListeners = new Map<string, () => void>();

  constructor(options: CsharpAdapterOptions = {}) {
    this.client = new LspClient("csharp-ls");
    this.options = options;

    // textDocument/publishDiagnostics — csharp-ls (via Roslyn) uses
    // pull-model per ADR-22 §Diagnostics, so this handler likely never
    // fires (Phase 0 probe empirical: 0 publishDiagnostics for
    // Broken.cs vs 3 diagnostics returned via pull). Wired defensively
    // in case csharp-ls ever toggles to push or a future Roslyn
    // version bridges via extensions. getDiagnostics at Substep 3.5
    // uses the pull-request path.
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

    // window/logMessage + window/showMessage — csharp-ls surfaces
    // project-load status messages here. Phase 0 probe captured clean
    // setup log (LSP self-identification + license attribution +
    // solution discovery + .csproj load). Warnings + errors surface;
    // info/log skipped.
    this.client.onNotification("window/logMessage", (params) => {
      const p = params as { type?: number; message?: string } | null;
      if (!p?.message) return;
      if (p.type === 1 || p.type === 2) {
        log.warn(`[csharp-ls server] ${p.message}`);
      }
    });
    this.client.onNotification("window/showMessage", (params) => {
      const p = params as { type?: number; message?: string } | null;
      if (!p?.message) return;
      if (p.type === 1 || p.type === 2) {
        log.warn(`[csharp-ls show] ${p.message}`);
      }
    });

    // Server-initiated request stubs. csharp-ls may issue these during
    // startup; without handlers the init hangs. Matches gopls / pyright /
    // ruby-lsp precedent.
    for (const method of [
      "window/workDoneProgress/create",
      "client/registerCapability",
      "client/unregisterCapability",
      "window/showMessageRequest",
    ]) {
      this.client.onRequest(method, () => null);
    }

    // workspace/configuration — defensive length-matched array
    // response per ADR-14 gopls precedent. csharp-ls's Phase 0 init
    // surfaced `initial csharp config` reading without errors;
    // length-matched is LSP-spec-correct and safe.
    this.client.onRequest("workspace/configuration", (params) => {
      const items = (params as { items?: unknown[] } | null)?.items ?? [];
      return items.map(() => ({}));
    });
  }

  async initialize(rootPath: string): Promise<void> {
    if (this.rootPath) {
      throw new Error("CsharpAdapter.initialize called twice.");
    }
    const absRoot = pathResolve(rootPath);
    this.rootPath = normalizePath(absRoot);

    // PATH enrichment per ADR-22 §"Windows PATH-enrichment for dotnet
    // tools". Runs before spawn so csharp-ls is findable when Node was
    // launched from Bash on Windows (PowerShell-only path config).
    if (!this.options.skipPathEnrichment) {
      enrichPathForDotnetTools();
    }

    // ADR-22 §"Toolchain (linear punch list — doctor-substrate)" —
    // Preflight `dotnet --version` so we fail fast with an actionable
    // error rather than the cryptic "spawn csharp-ls ENOENT" surface
    // that fires when dotnet isn't installed (csharp-ls is downloaded
    // via dotnet tool install; binary depends on dotnet runtime).
    // Parallel to ADR-21 RubyAdapter ruby-preflight + ADR-14 gopls
    // go-version preflight.
    if (!this.options.skipDotnetPreflight) {
      await runDotnetVersionPreflight(this.options.dotnetBin ?? "dotnet");
    }

    // Spawn pattern resolution. Single pattern at v1.1.0 (no dual-
    // pattern parallel to Ruby's bundler-vs-gem). Default binary
    // `csharp-ls`; env override via CONTEXTATLAS_CSHARP_LSP_BIN; option
    // override via cliPath. Direct spawn — dotnet tools install as
    // real .exe (Windows) or executable (Linux/macOS), not .bat shims
    // (no CVE-2024-27980 wrap needed parallel to Ruby).
    const cliPath =
      this.options.cliPath ??
      process.env.CONTEXTATLAS_CSHARP_LSP_BIN ??
      "csharp-ls";

    log.info(`[csharp-adapter] starting csharp-ls`, {
      cliPath,
      rootPath: this.rootPath,
    });

    this.client.start(cliPath, [], absRoot);

    // csharp-ls's capability declaration per Phase 0 probe empirical
    // capture (see docs/adr/csharp-roslyn-probe/findings-baseline.md
    // §"initialize response — capabilities"). We declare:
    //   - documentSymbol (hierarchical) — Substep 3.2
    //   - references — Substep 3.4
    //   - definition — Substep 3.7 (peek) + Substep 3.6 (typeInfo)
    //   - hover (markdown) — Substep 3.3 + 3.7 (XML doc + signature)
    //   - typeDefinition — Substep 3.6 (native; no declaration-parse
    //     fallback parallel to Pyright/Ruby)
    //   - implementation — Substep 3.6 (native; cleanly returns
    //     implementer locations for usedByTypes)
    //   - publishDiagnostics — defensive (csharp-ls uses pull-model
    //     per ADR-22; declaring doesn't hurt)
    //   - diagnostic (pull-model per LSP 3.17) — Substep 3.5
    await this.client.request(
      "initialize",
      {
        processId: process.pid,
        rootUri: toFileUri(absRoot),
        workspaceFolders: [{ uri: toFileUri(absRoot), name: "workspace" }],
        capabilities: {
          textDocument: {
            documentSymbol: {
              hierarchicalDocumentSymbolSupport: true,
            },
            references: {},
            definition: {},
            hover: { contentFormat: ["markdown", "plaintext"] },
            typeDefinition: {},
            implementation: {},
            publishDiagnostics: {},
            diagnostic: {
              dynamicRegistration: false,
              relatedDocumentSupport: false,
            },
            synchronization: {
              dynamicRegistration: false,
              didSave: false,
            },
          },
          workspace: {
            workspaceFolders: true,
            configuration: true,
            diagnostics: { refreshSupport: false },
          },
        },
      },
      this.options.requestTimeoutMs ?? 120_000,
    );
    this.client.notify("initialized", {});

    // No cold-start `$/progress` readiness gate. ADR-22 §LSP primitive
    // mappings + Phase 0 probe boot section confirmed csharp-ls follows
    // Pyright pattern — empty $/progress traffic during init. Per-call
    // ceiling at request time absorbs any cold-start variance. ADR-18
    // readiness-pattern decision.
  }

  async shutdown(): Promise<void> {
    await this.client.stop();
    this.rootPath = null;
    this.openFiles.clear();
    this.diagnosticsByUri.clear();
    this.diagnosticsListeners.clear();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve a filePath argument to absolute + workspace-relative
   * forms. Accepts either absolute paths or workspace-relative paths;
   * returns both for use by callers (LSP requests need absolute paths
   * via toFileUri; Symbol-IDs need workspace-relative paths per ADR-01).
   */
  private resolveFile(filePath: string): { absPath: string; relPath: string } {
    if (!this.rootPath) {
      throw new Error(
        "CsharpAdapter not initialized; call initialize() first.",
      );
    }
    const abs = pathResolve(this.rootPath, filePath);
    const absNormalized = normalizePath(abs);
    const rel = toRelativePath(absNormalized, this.rootPath);
    return { absPath: absNormalized, relPath: rel };
  }

  /**
   * Send `textDocument/didOpen` for `absPath` if not already opened
   * in this session. csharp-ls (like Pyright + gopls + ruby-lsp)
   * requires files to be opened before symbol queries return results.
   */
  private async ensureOpen(absPath: string): Promise<void> {
    const normalized = normalizePath(absPath);
    if (this.openFiles.has(normalized)) return;
    this.openFiles.add(normalized);
    this.client.notify("textDocument/didOpen", {
      textDocument: {
        uri: toFileUri(absPath),
        languageId: "csharp",
        version: 1,
        text: readFileSync(absPath, "utf8"),
      },
    });
  }

  /**
   * Construct a C# Symbol-ID per ADR-01 format: `sym:cs:<path>:<name>`.
   * Path is workspace-relative forward-slash-separated; name is the
   * symbol identifier as csharp-ls emits it. C# has no `self.`-prefix-
   * verbatim pattern parallel to Ruby — static methods emit with same
   * name shape as instance methods (kind 6 uniformly).
   */
  private symbolId(relPath: string, name: string): SymbolId {
    return `sym:${LANG_CODES["csharp"]}:${relPath}:${name}`;
  }

  // -------------------------------------------------------------------------
  // Data methods — Phase 3 Substeps 3.2-3.7. NOT implemented at 3.1
  // (skeleton substep). Each throws a clear remediation message
  // pointing at the substep that will implement it. LanguageAdapter
  // contract requires all six methods; this scaffolding satisfies the
  // type contract while the implementation lands at subsequent
  // substeps.
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

    // Walk the hierarchical documentSymbol tree, flattening to a flat
    // AtlasSymbol[] with parentId back-pointers per ADR-14 gopls
    // precedent. csharp-ls (via Roslyn) documentSymbol response per
    // Phase 0 probe (see findings-baseline.md):
    //   - File (kind 1) wraps the entire file at top level. SKIPPED;
    //     adapter descends into children directly per ADR-22
    //     §Symbol-kind mapping ("File (skipped)"). This is the C#-
    //     specific divergence from Ruby precedent (ruby-lsp emits
    //     classes/modules at top level without a File wrapper).
    //   - Namespace (kind 3) appears under File with children for the
    //     classes/interfaces/enums it contains.
    //   - Class/Record (kind 5) / Interface (kind 11) / Enum (kind 10)
    //     / Struct (kind 23) appear under Namespace with children for
    //     methods/properties/fields/etc.
    //   - Method (kind 6) / Constructor (kind 9) / Property (kind 7) /
    //     Field (kind 8) / EnumMember (kind 22) / Event (kind 24)
    //     appear under their containing type.
    //
    // C# has no functions-vs-methods semantic divergence parallel to
    // Ruby's kind-12-uniform discovery (ADR-21); all callable members
    // emit kind 6 uniformly per Phase 0 empirical. No `self.` prefix
    // preservation pattern parallel to Ruby's Φ-γ-variant lock.
    //
    // Method symbol names from Roslyn include the parameter list
    // (e.g., `FindByEmail(string email)`); preserved verbatim in
    // Symbol-ID name field per Roslyn-overload-disambiguation
    // convention. Properties / fields / classes don't carry this
    // suffix.
    const out: AtlasSymbol[] = [];
    const walk = (
      sym: LspDocumentSymbol,
      parentId: SymbolId | undefined,
    ): void => {
      const kind = mapCsharpKind(sym.kind);
      if (kind === "other") {
        // Filter out: kinds not in adapter contract (e.g., method
        // parameters at deep nesting if Roslyn surfaces them as
        // children of methods; not observed in Phase 0 probe but
        // defensive). Children of filtered symbols are NOT recursively
        // walked — scoped to the filtered parent and not independently
        // relevant per ADR-22 §Symbol-kind mapping.
        return;
      }
      const atlasSym: AtlasSymbol = {
        id: this.symbolId(relPath, sym.name),
        name: sym.name,
        kind,
        path: relPath,
        line: sym.selectionRange.start.line + 1,
        language: "csharp",
      };
      if (sym.detail !== undefined && sym.detail.length > 0) {
        // Roslyn detail field is rich — full type signatures
        // (`void Broken.DoSomething(string arg)`, `int User.
        // PremiumTierLimit`, `Task User.SendWelcomeEmailAsync()`,
        // `CsharpProbe.Models` for namespaces). Surfaced as-is for
        // signature consumers per ADR-22 §LSP primitive mappings.
        atlasSym.signature = sym.detail;
      }
      if (parentId !== undefined) {
        atlasSym.parentId = parentId;
      }
      out.push(atlasSym);

      // Recurse children with current symbol as parent. Depth bounded
      // by Roslyn's tree shape (Namespace → Class → Method; typical
      // depth ≤ 4 including outermost File wrapper).
      if (sym.children && sym.children.length > 0) {
        for (const child of sym.children) {
          walk(child, atlasSym.id);
        }
      }
    };

    for (const top of result) {
      // Phase 0 finding: Roslyn returns File (kind 1) as the top-level
      // wrapper around the actual content. Skip File symbol and descend
      // into its children directly per ADR-22 §Symbol-kind mapping
      // ("File (skipped)").
      if (top.kind === 1) {
        if (top.children && top.children.length > 0) {
          for (const child of top.children) {
            walk(child, undefined);
          }
        }
        continue;
      }
      walk(top, undefined);
    }

    return out;
  }

  async getSymbolDetails(id: SymbolId): Promise<AtlasSymbol | null> {
    const parsed = parseSymbolId(id);
    if (!parsed || !this.rootPath) return null;
    const { absPath, relPath } = this.resolveFile(parsed.path);
    if (!existsSync(absPath)) return null;
    await this.ensureOpen(absPath);

    // Re-query documentSymbol to find target with full LSP position
    // info. listSymbols normalizes to AtlasSymbol[] which loses
    // selectionRange.start needed for hover positioning. Matches
    // gopls + ruby precedent (re-query documentSymbol to get position
    // before hover call).
    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return null;
    const target = findSymbolByName(symbols, parsed.name);
    if (!target) return null;

    const kind = mapCsharpKind(target.kind);
    if (kind === "other") return null;

    // Build base AtlasSymbol from documentSymbol substrate; hover
    // enrichment refines signature below when available.
    const baseSym: AtlasSymbol = {
      id,
      name: target.name,
      kind,
      path: relPath,
      line: target.selectionRange.start.line + 1,
      language: "csharp",
    };
    if (target.detail !== undefined && target.detail.length > 0) {
      // Roslyn's documentSymbol detail field is already rich (full type
      // signatures like `void Broken.DoSomething(string arg)`, `int
      // User.PremiumTierLimit`). Used as baseline; hover may refine
      // with markdown-formatted version below.
      baseSym.signature = target.detail;
    }

    // ADR-22 §LSP primitive mappings: hover used for getSymbolDetails
    // (signature refinement) + getDocstring (Substep 3.7, prose
    // extraction). Roslyn hover envelope per Phase 0 probe:
    //   ```csharp
    //   <signature>
    //   ```
    //   <optional XML doc summary>
    //   <optional Parameters: list>
    const hover = await this.client.request<{
      contents?: { kind?: string; value?: string } | string;
    } | null>(
      "textDocument/hover",
      {
        textDocument: { uri: toFileUri(absPath) },
        position: target.selectionRange.start,
      },
      this.options.requestTimeoutMs ?? 30_000,
    );

    // Null fallthrough — Roslyn returns null hover for unresolved
    // symbols (rare; would indicate Roslyn parse failure). Adapter
    // returns base Symbol unchanged with documentSymbol-derived
    // signature; no error.
    if (!hover || !hover.contents) return baseSym;
    const value =
      typeof hover.contents === "object" &&
      "value" in hover.contents &&
      typeof hover.contents.value === "string"
        ? hover.contents.value
        : null;
    if (!value) return baseSym;

    const { signature: hoverSig } = parseCsharpHoverContent(value);
    if (hoverSig !== null) {
      // Hover signature preferred when available — markdown-formatted
      // version is cleaner than the raw documentSymbol detail (e.g.,
      // hover surfaces `User? User.FindByEmail(string email)` whereas
      // documentSymbol detail surfaces same content but is less
      // structurally guaranteed across Roslyn versions). Forward-
      // composition pattern: prose field consumed at Substep 3.7
      // (getDocstring).
      return { ...baseSym, signature: hoverSig };
    }
    return baseSym;
  }

  async findReferences(id: SymbolId): Promise<Reference[]> {
    const parsed = parseSymbolId(id);
    if (!parsed || !this.rootPath) return [];
    const { absPath } = this.resolveFile(parsed.path);
    if (!existsSync(absPath)) return [];
    await this.ensureOpen(absPath);

    // Re-query documentSymbol to find target with selectionRange.start
    // position (same pattern as 3.3 getSymbolDetails; gopls + ruby
    // precedent).
    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return [];
    const target = findSymbolByName(symbols, parsed.name);
    if (!target) return [];

    // textDocument/references with includeDeclaration: false per
    // ADR-22 §LSP primitive mappings + Pyright/gopls/Ruby precedent
    // (verified cross-adapter at ADR-21 Substep 3.4 Pattern 7 axis 5
    // cross-reference-claim-coherence catch; pyright.ts + go.ts +
    // ruby.ts all use false).
    const locations = await this.client.request<LspLocation[] | null>(
      "textDocument/references",
      {
        textDocument: { uri: toFileUri(absPath) },
        position: target.selectionRange.start,
        context: { includeDeclaration: false },
      },
      this.options.requestTimeoutMs ?? 30_000,
    );

    // Empty-result handling: Roslyn returns empty `[]` when no
    // cross-file references exist (e.g., querying a private symbol
    // unused outside its declaring class). Adapter returns empty
    // Reference[] without error. null + non-array also fold through
    // to empty per defensive precedent.
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return [];
    }

    // No URL-encoding dedup needed per ADR-22 §LSP primitive mappings
    // (Phase 0 probe empirical) — Roslyn returns clean single-encoded
    // URIs without the c%3A vs c: doubling that ADR-21 Ruby substrate
    // had to dedup. Direct map to Reference[].
    const rootPath = this.rootPath;
    return locations.map((loc): Reference => {
      const rel = toRelativePath(normalizePath(loc.uri), rootPath);
      const line = loc.range.start.line + 1;
      return {
        id: buildReferenceId(rel, line),
        symbolId: id,
        path: rel,
        line,
        column: loc.range.start.character,
      };
    });
  }

  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    const { absPath, relPath } = this.resolveFile(filePath);
    if (!existsSync(absPath)) return [];
    await this.ensureOpen(absPath);

    // LSP 3.17 pull-model textDocument/diagnostic request per ADR-22
    // §"Diagnostics via PULL model" + Phase 0 probe #6. Roslyn (via
    // csharp-ls) advertises diagnosticProvider and returns full
    // DocumentDiagnosticReport with Roslyn-substrate items (CS####
    // error codes + ranges + severity + codeDescription URIs).
    // Push-model publishDiagnostics returns 0 (Roslyn doesn't use
    // that channel) — pull-model is canonical per ADR-22.
    //
    // Per-call ceiling absorbs cold-start variance (Pyright-pattern
    // per ADR-18 + Phase 0 probe empty $/progress confirmation).
    // No waitForServerReady gate; per-call timeout is sufficient.
    const response = await this.client.request<DocumentDiagnosticReport | null>(
      "textDocument/diagnostic",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );

    return buildDiagnosticsFromResponse(response, relPath);
  }

  async getTypeInfo(id: SymbolId): Promise<TypeInfo> {
    const empty: TypeInfo = { extends: [], implements: [], usedByTypes: [] };
    const parsed = parseSymbolId(id);
    if (!parsed || !this.rootPath) return empty;
    const { absPath } = this.resolveFile(parsed.path);
    if (!existsSync(absPath)) return empty;
    await this.ensureOpen(absPath);

    // Re-query documentSymbol to find target with range info.
    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return empty;
    const target = findSymbolByName(symbols, parsed.name);
    if (!target) return empty;

    // getTypeInfo applies to type-like symbols only — classes/records
    // (kind 5), interfaces (kind 11), structs (kind 23). Methods,
    // properties, fields, enum members all return empty TypeInfo per
    // ADR-07 contract semantics. Enums (kind 10) skipped — their
    // `: byte` underlying-type specifier isn't OOP-inheritance.
    const isTypeKind =
      target.kind === 5 || target.kind === 11 || target.kind === 23;
    if (!isTypeKind) return empty;

    // Parse declaration line for extends + implements per ADR-22
    // §"getTypeInfo — native LSP endpoints (no declaration-parse
    // fallback)". Note: ADR-22's "no declaration-parse fallback"
    // claim applies to the typeDefinition / implementation endpoint
    // availability — those work natively. The declaration-line scan
    // here is a SHALLOW source-read for the `: A, B, C` clause to
    // separate base-class (extends) from interfaces (implements),
    // because LSP doesn't expose this distinction directly. Single-
    // line read; not the multi-pass class-hierarchy walk that
    // ADR-13 Pyright + ADR-21 Ruby required.
    const source = readFileSync(absPath, "utf8");
    const lines = source.split(/\r?\n/);
    const declarationLine = lines[target.selectionRange.start.line] ?? "";
    const isInterface = target.kind === 11;
    const { extends: ext, implements: impl } = parseCsharpClassDeclaration(
      declarationLine,
      target.name,
      isInterface,
    );

    // usedByTypes via textDocument/implementation per ADR-22 §LSP
    // primitive mappings. Roslyn returns LSP Location[] of files that
    // implement (for interfaces) or derive (for classes) the target.
    // Adapter reads each implementer's declaration line to extract
    // the type name. Single-line read per implementer; defensive
    // against null/error responses (some symbols don't support
    // implementation queries cleanly).
    let usedByTypes: string[] = [];
    try {
      const implLocations = await this.client.request<LspLocation[] | null>(
        "textDocument/implementation",
        {
          textDocument: { uri: toFileUri(absPath) },
          position: target.selectionRange.start,
        },
        this.options.requestTimeoutMs ?? 30_000,
      );
      if (implLocations && Array.isArray(implLocations)) {
        const names = new Set<string>();
        for (const loc of implLocations) {
          const implName = extractTypeNameFromLocation(loc);
          if (implName !== null && implName !== target.name) {
            names.add(implName);
          }
        }
        usedByTypes = Array.from(names);
      }
    } catch {
      // implementation may fail on some symbol kinds (e.g., querying
      // on a non-implementable position). Per ADR-22 §Limitations,
      // empty usedByTypes is the defensive degraded mode.
    }

    return {
      extends: ext,
      implements: impl,
      usedByTypes,
    };
  }

  async getDocstring(id: SymbolId): Promise<string | null> {
    const parsed = parseSymbolId(id);
    if (!parsed || !this.rootPath) return null;
    const { absPath } = this.resolveFile(parsed.path);
    if (!existsSync(absPath)) return null;
    await this.ensureOpen(absPath);

    // Re-query documentSymbol to find target with position info
    // (same pattern as 3.3 getSymbolDetails). Forward-composition
    // design per ADR-22: same hover request + same parser as 3.3;
    // different field consumed (prose instead of signature).
    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return null;
    const target = findSymbolByName(symbols, parsed.name);
    if (!target) return null;

    // Hover request at symbol position. Roslyn returns markdown with
    // ```csharp code-block signature + XML doc summary + Parameters:
    // list per Phase 0 probe #3. The post-code-fence prose is the
    // docstring substrate; parseCsharpHoverContent extracts it.
    const hover = await this.client.request<{
      contents?: { kind?: string; value?: string } | string;
    } | null>(
      "textDocument/hover",
      {
        textDocument: { uri: toFileUri(absPath) },
        position: target.selectionRange.start,
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

    // Forward-composition: parseCsharpHoverContent returns
    // { signature, prose }. 3.3 consumes signature; 3.7 consumes
    // prose. Single hover request, single markdown parse, two field
    // consumers per ADR-22 §"getDocstring".
    //
    // Roslyn prose typically includes:
    //   - XML <summary> rendered as plain markdown text
    //   - <param> tags rendered as "Parameters:" section with
    //     parameter list items
    //   - <returns> tags rendered as "Returns:" section (if present)
    //   - <remarks> rendered as additional prose paragraphs
    //
    // Per LanguageAdapter contract: returns null when prose is empty/
    // whitespace-only or missing. Comment-syntax-stripped per Step 9
    // calibration shape (no `///` markers or `<summary>` tags;
    // Roslyn renders these as plain markdown).
    const { prose } = parseCsharpHoverContent(value);
    return prose;
  }
}

// ---------------------------------------------------------------------------
// Standalone helpers (module-level; exported for doctor reuse + tests).
// ---------------------------------------------------------------------------

/**
 * Run `dotnet --version` to verify dotnet SDK is installed and
 * accessible. Throws actionable error if missing.
 *
 * Per ADR-22 §"Toolchain" — dotnet is the prereq for csharp-ls
 * (csharp-ls is distributed as a dotnet tool; depends on dotnet
 * runtime). Preflight surfaces "dotnet not on PATH" before the
 * adapter spawns csharp-ls and hits the cryptic ENOENT path.
 *
 * Parallel to ADR-21 `runRubyVersionPreflight` and ADR-14 gopls's
 * `go version` preflight.
 */
export async function runDotnetVersionPreflight(
  dotnetBin: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = childSpawn(dotnetBin, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      // Windows: spawn .exe-resolution preference; we don't wrap in
      // shell because dotnet.exe is a real executable (not a .bat
      // shim parallel to Ruby's bundle.bat).
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      reject(
        new Error(
          `dotnet preflight failed — ${dotnetBin} not findable on PATH. ` +
            `Install .NET 10 SDK from https://dotnet.microsoft.com/download ` +
            `then re-run. Underlying error: ${err.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `dotnet preflight failed with exit code ${code}. ` +
              `stderr: ${stderr.trim()} stdout: ${stdout.trim()}. ` +
              `Verify .NET SDK install and PATH.`,
          ),
        );
        return;
      }
      const version = stdout.trim();
      log.info(`[csharp-adapter] dotnet preflight passed`, { version });
      // ADR-22 §"Cohort-version support range" — primary support is
      // .NET 10.x; .NET 8/9 best-effort. Doctor at Phase 5.2 surfaces
      // signal-warn for older SDKs; here we only verify dotnet is
      // findable + invokable. Version-range gating lives at doctor.
      resolve();
    });
  });
}

/**
 * Detect a `.sln` / `.slnx` / `.csproj` file under `root` (any depth).
 * Used by doctor checks at Phase 5.2 to report detected project files.
 * csharp-ls itself auto-discovers via MSBuild resolution; this helper
 * is observational only (parallel to ADR-21 detectRails).
 *
 * Returns the first project file found (in priority order: .sln >
 * .slnx > .csproj), or null if none present.
 */
export function detectProjectFile(root: string): string | null {
  // Prefer .sln / .slnx at root (highest priority — multi-project
  // solution; csharp-ls loads via MSBuildLocator).
  for (const ext of [".sln", ".slnx"]) {
    const candidates = findFilesByExt(root, ext, 1);
    if (candidates.length > 0) return candidates[0]!;
  }
  // Fall back to .csproj search (depth-limited to avoid walking
  // node_modules / bin / obj on large repos).
  const csprojs = findFilesByExt(root, ".csproj", 3);
  return csprojs.length > 0 ? csprojs[0]! : null;
}

function findFilesByExt(
  root: string,
  ext: string,
  maxDepth: number,
): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    for (const name of readdirSync(dir)) {
      if (
        name.startsWith(".") ||
        name === "bin" ||
        name === "obj" ||
        name === "node_modules" ||
        name === "packages"
      ) {
        continue;
      }
      const abs = pathJoin(dir, name);
      try {
        const stat = statSync(abs);
        if (stat.isDirectory()) {
          walk(abs, depth + 1);
        } else if (name.endsWith(ext)) {
          out.push(abs);
        }
      } catch {
        // Permission denied / broken symlink — skip silently.
      }
    }
  };
  walk(root, 0);
  return out.sort();
}

// ---------------------------------------------------------------------------
// Symbol-ID + hover parsers (module-level; exported for tests + reuse).
// ---------------------------------------------------------------------------

/**
 * Recursively search an LspDocumentSymbol tree for the first symbol
 * matching `name`. Returns the matched LspDocumentSymbol or null.
 *
 * C# symbol names from Roslyn include parameter lists for methods
 * (`FindByEmail(string email)`); caller passes the verbatim name as
 * parsed from Symbol-ID. Per ADR-22 §"Symbol-kind mapping", Roslyn
 * uses parameter-included names for overload disambiguation;
 * preserving this match shape end-to-end.
 *
 * Generic over the tree shape per ADR-21 RubyAdapter precedent
 * (findSymbolByName); the search is structurally identical across
 * adapters (depth-first, name-equality match).
 */
export function findSymbolByName(
  symbols: readonly LspDocumentSymbol[],
  name: string,
): LspDocumentSymbol | null {
  for (const sym of symbols) {
    if (sym.name === name) return sym;
    if (sym.children && sym.children.length > 0) {
      const found = findSymbolByName(sym.children, name);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Parse csharp-ls hover response markdown envelope into structured
 * `{ signature, prose }` shape per ADR-22 §LSP primitive mappings
 * (Phase 0 probe empirical substrate — see findings-baseline.md
 * §"Probe #3 — hover").
 *
 * Roslyn hover envelope structure (probe-empirical):
 *   ```csharp
 *   <signature line(s)>
 *   ```
 *
 *   <optional XML doc summary text>
 *
 *   Parameters:
 *   - ``param``: <description>
 *
 * Parser strips:
 *   - The fenced ```csharp code block (extracts inner content as
 *     signature)
 *
 * Parser preserves:
 *   - First fenced ```csharp code block content as signature
 *   - All post-fence prose as `prose` (consumed by getDocstring at
 *     Substep 3.7; includes summary text + parameters list)
 *
 * Edge cases:
 *   - Empty/null value → both fields null
 *   - Code block only (no prose) → signature populated, prose null
 *     (matches User.PremiumTierLimit-style hover with just signature)
 *   - No code block → signature null, prose = stripped value
 *     (defensive; not observed in Phase 0 probe but possible if
 *     Roslyn returns plain-text hover in some edge case)
 *
 * Returns: `{ signature, prose }` — both string-or-null.
 * Forward-composition design per ADR-22: Substep 3.3 consumes
 * `signature`; Substep 3.7 consumes `prose`. Single hover request,
 * single markdown parse, two field consumers.
 */
export function parseCsharpHoverContent(value: string): {
  signature: string | null;
  prose: string | null;
} {
  const codeBlockMatch = /```csharp\n([\s\S]*?)\n```/.exec(value);
  const signature = codeBlockMatch ? codeBlockMatch[1]!.trim() : null;

  let prose: string | null;
  if (codeBlockMatch) {
    const afterBlock = value.slice(
      codeBlockMatch.index + codeBlockMatch[0].length,
    );
    const proseRaw = afterBlock.trim();
    prose = proseRaw.length > 0 ? proseRaw : null;
  } else {
    const proseRaw = value.trim();
    prose = proseRaw.length > 0 ? proseRaw : null;
  }

  return { signature, prose };
}

/**
 * Parse a C# SymbolId (`sym:cs:<path>:<name>`) into its components.
 * Returns null for IDs that don't match the expected shape — callers
 * treat that as "no such symbol" rather than throwing.
 *
 * C# symbol names from Roslyn can contain `(`, `)`, `,`, ` `,
 * `<`, `>` from parameter lists (method overload disambiguation per
 * Roslyn convention) and generic type parameters (e.g.,
 * `Repository<TEntity>`). Path component is the first colon-delimited
 * segment after `sym:cs:`; remaining is the name.
 */
export function parseSymbolId(
  id: SymbolId,
): { path: string; name: string } | null {
  const match = /^sym:cs:([^:]+):(.+)$/.exec(id);
  if (!match) return null;
  return { path: match[1]!, name: match[2]! };
}

/**
 * LSP 3.17 DocumentDiagnosticReport variants per
 * https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_diagnostic
 *
 * Roslyn (via csharp-ls) emits the `kind: "full"` variant per Phase 0
 * probe #6 empirical capture. The `kind: "unchanged"` variant is
 * defined for incremental refresh optimization (when caller passes
 * prior resultId); adapter doesn't use this at v1.1.0 — every call
 * is a fresh "full" query.
 */
export type DocumentDiagnosticReport =
  | {
      kind: "full";
      items?: LspDiagnostic[];
      resultId?: string;
      relatedDocuments?: unknown;
    }
  | {
      kind: "unchanged";
      resultId: string;
      relatedDocuments?: unknown;
    };

/**
 * Build ContextAtlas Diagnostic[] from a csharp-ls (Roslyn) pull-model
 * DocumentDiagnosticReport response. Exported for unit-test access to
 * variant handling without requiring live LSP integration.
 *
 * Variant handling per ADR-22 §"Diagnostics via PULL model":
 *   - null response → empty array (defensive; per-call timeout
 *     fallback case)
 *   - kind: "unchanged" → empty array (Roslyn shouldn't emit this
 *     when no previousResultId is sent, but defensive handling at
 *     v1.0; future enhancement could track resultId state for
 *     "diagnostics-haven't-changed" optimization)
 *   - kind: "full" → items mapped to ContextAtlas Diagnostic[]
 *     with severity remap via mapDiagnosticSeverity + 1-indexed
 *     line conversion
 *
 * Roslyn diagnostic substrate richness (CS error codes, codeDescription
 * URIs to Microsoft docs) not preserved in adapter response — Diagnostic
 * contract per types.ts has only severity/message/path/line/column.
 * Future v1.x candidate per ADR-22 §"Diagnostic substrate richness":
 * extend Diagnostic with optional `code` + `codeDescription` fields
 * for richer downstream consumption.
 */
export function buildDiagnosticsFromResponse(
  response: DocumentDiagnosticReport | null,
  relPath: string,
): Diagnostic[] {
  if (!response) return [];
  if (response.kind === "unchanged") return [];
  const items = response.items ?? [];
  return items.map((d): Diagnostic => ({
    severity: mapDiagnosticSeverity(d.severity),
    message: d.message,
    path: relPath,
    line: d.range.start.line + 1,
    column: d.range.start.character,
  }));
}

/**
 * Parse a C# class/interface/struct declaration line and extract the
 * `extends` + `implements` lists from the `: A, B, C` clause.
 *
 * C# inheritance syntax: `[modifiers] class|interface|struct|record
 * Name[<TypeParams>] [: Base, IFace1, IFace2] [where ...] { ... }`.
 * Base class (if present) is always the FIRST item; all subsequent
 * items are interfaces. For interface declarations, ALL items in the
 * `:` clause are parent interfaces (interfaces can extend multiple
 * interfaces).
 *
 * **I-prefix heuristic for class first-item disambiguation**
 * (ADR-22 §Limitations). For class/struct/record (not interface),
 * the first item after `:` may be either a base class or a single
 * interface. C# has no syntactic distinction; semantic info (which
 * the source line lacks) is needed. The adapter uses the .NET
 * convention `I[A-Z]...` as the interface heuristic:
 *
 *   - First item matches `/^I[A-Z]/` → treated as interface (implements)
 *   - First item doesn't match → treated as base class (extends)
 *
 * Edge cases (documented as v1.1.0 Limitation; v1.2+ may upgrade
 * via typeDefinition semantic query):
 *   - Base class starting with I+Uppercase (e.g., `IdentityUser`) →
 *     incorrectly classified as interface
 *   - Interface NOT following I-prefix convention (rare in real
 *     C# code) → incorrectly classified as base class
 *
 * Generic type parameters (`<T>`, `<TEntity, TResult>`) are stripped
 * from extracted names for canonical identity (matches ADR-14 gopls
 * generic-handling precedent). Where clauses (`where T : new()`) and
 * opening braces terminate the parse.
 *
 * Returns: `{ extends, implements }` — both string[].
 */
export function parseCsharpClassDeclaration(
  line: string,
  targetName: string,
  isInterface: boolean,
): { extends: string[]; implements: string[] } {
  // Strip generic parameters from target name for matching (target
  // may be `Repository` even if declaration is `Repository<TEntity>`).
  const bareTarget = targetName.replace(/<.*>$/, "");

  // Find position of target name followed by optional generic params,
  // then look for `:` clause.
  const targetPattern = new RegExp(
    `\\b${escapeRegex(bareTarget)}(?:<[^>]*>)?\\s*:\\s*([^{]+?)(?:\\s+where\\s|\\s*\\{|\\s*$)`,
  );
  const match = targetPattern.exec(line);
  if (!match || !match[1]) {
    return { extends: [], implements: [] };
  }

  // Parse comma-separated items in the `: ...` clause. Strip generic
  // params from each. Filter empties.
  const items = match[1]
    .split(",")
    .map((s) => s.trim().replace(/<.*$/, ""))
    .filter((s) => s.length > 0);

  if (items.length === 0) {
    return { extends: [], implements: [] };
  }

  if (isInterface) {
    // Interfaces only "extend" other interfaces (multiple-parent
    // semantics); no `implements` distinction.
    return { extends: items, implements: [] };
  }

  // Class/record/struct: first item may be base class OR interface.
  // I-prefix heuristic disambiguates (v1.1.0 limitation per ADR-22).
  const first = items[0]!;
  const firstIsInterface = /^I[A-Z]/.test(first);
  if (firstIsInterface) {
    return { extends: [], implements: items };
  }
  return { extends: [first], implements: items.slice(1) };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract a type name from an LSP Location pointing at a type
 * declaration site. Used by getTypeInfo's usedByTypes resolution to
 * convert textDocument/implementation Location[] responses into
 * type-name strings.
 *
 * Reads the file at loc.uri, finds the line at loc.range.start.line,
 * and extracts the identifier following `class|interface|struct|
 * record` keyword on that line.
 *
 * Returns null if:
 *   - File not readable
 *   - Line doesn't contain a type declaration keyword
 *   - Identifier extraction fails (malformed source)
 *
 * Generic-stripped for canonical identity (matches
 * parseCsharpClassDeclaration generic-handling).
 */
export function extractTypeNameFromLocation(loc: LspLocation): string | null {
  let absPath: string;
  try {
    absPath = normalizePath(loc.uri);
  } catch {
    return null;
  }
  if (!existsSync(absPath)) return null;
  let source: string;
  try {
    source = readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  const lines = source.split(/\r?\n/);
  const line = lines[loc.range.start.line] ?? "";
  const match = /\b(?:class|interface|struct|record)\s+(\w+)/.exec(line);
  if (!match) return null;
  return match[1] ?? null;
}

/**
 * Construct a C# Reference-ID per ADR-01 format: `ref:cs:<path>:<line>`.
 * Path is workspace-relative forward-slash-separated; line is
 * 1-indexed (human-readable). Exported for testability of ID format
 * separate from full findReferences flow.
 */
export function buildReferenceId(relPath: string, line: number): ReferenceId {
  return `ref:${LANG_CODES["csharp"]}:${relPath}:${line}`;
}

// Re-export LANG_CODES for downstream consumers that build symbol IDs
// directly (matches pyright.ts + go.ts + ruby.ts re-export convention).
export { LANG_CODES };
