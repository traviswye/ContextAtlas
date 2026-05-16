/**
 * Ruby language adapter backed by ruby-lsp + ruby-lsp-rails (ADR-21).
 *
 * Wraps `ruby-lsp` spawned as a subprocess (via `bundle exec` when
 * Rails detected; via direct gem-install binary otherwise), speaking
 * LSP over stdio. Implements the `LanguageAdapter` interface from
 * src/types.ts per ADR-03 (adapters are plugins) and ADR-07
 * (getTypeInfo is a required capability).
 *
 * Phase 3 implementation complete across 8 substeps:
 *   - 3.1: skeleton — constructor, handler stubs, spawn pattern,
 *     initialize handshake, Rails detection, shutdown
 *   - 3.2: listSymbols — hierarchical-tree walk + parentId
 *     back-pointer + URL-encoding dedup utility foundation
 *   - 3.3: getSymbolDetails — hover-based signature enrichment +
 *     parseRubyHoverContent + findSymbolByName
 *   - 3.4: findReferences — first empirical reuse of dedup
 *     utility; includeDeclaration: false per actual precedent
 *   - 3.5: getDiagnostics — LSP 3.17 pull-model
 *     (textDocument/diagnostic REQUEST; net-new substrate)
 *   - 3.6: getTypeInfo — declaration-parse fallback per Pyright
 *     precedent; parseRubyClassExtends + parseRubyMixins
 *   - 3.7: getDocstring — hover-with-comments per gopls precedent;
 *     forward-composition consumer of parseRubyHoverContent prose
 *   - 3.8: adapter close — final cleanup + Phase 3 substrate-record
 *
 * Divergences from ADR-13 (Pyright) + ADR-14 (gopls) documented in
 * ADR-21:
 *   - Pull-model diagnostics (LSP 3.17 `textDocument/diagnostic`
 *     REQUEST), NOT publishDiagnostics notification.
 *   - URL-encoding result duplication on Windows (`c%3A` + `c:`
 *     forms). Adapter dedupes via `normalizePath` + (path, line)
 *     tuple per dedupLocationsByNormalizedPath utility.
 *   - Dual-pattern install (bundler vs direct gem) detected per-
 *     workspace via Gemfile + bin/rails heuristic.
 *   - Windows .bat-spawn wrap in `cmd.exe /c` per CVE-2024-27980.
 *   - No cold-start `$/progress` readiness gate — ruby-lsp follows
 *     Pyright pattern; per-call ceiling absorbs cold-start variance.
 *   - ruby-lsp-rails add-on is best-effort enhancement, NOT baseline
 *     assumption. Adapter logs add-on load failure but continues
 *     with baseline LSP functionality.
 *   - getSymbolDetails uses hover for signature enrichment (Pyright/
 *     gopls don't); ruby-lsp's documentSymbol typically omits the
 *     detail field, hover provides rich RDoc + rbs-derived signatures.
 *   - getTypeInfo uses local declaration-parse from documentSymbol
 *     range (Pyright pass-1/pass-2 cache architecture not replicated
 *     since Ruby's class hierarchy is locally-parseable);
 *     usedByTypes always [] at v1.0 per simpler-adapter-private-scope.
 *   - getDocstring uses hover-with-comments (gopls precedent;
 *     substantively different from ADR-13 Pyright omits-docstrings).
 *   - self.method class-method names preserve `self.` prefix verbatim
 *     in Symbol-ID per Φ-γ-variant lock (ADR-21 §Rationale; gopls
 *     receiver-prefix-verbatim precedent applied to Ruby).
 *
 * See `docs/adr/ruby-lsp-probe-findings-baseline.md` for the
 * empirical probe substrate motivating these design choices.
 */

import { spawn as childSpawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
// Kind mapping per ADR-21 §"Symbol-kind mapping". DSL-macro pattern
// detection + `self.method` class-method remap handled at listSymbols
// layer (Substep 3.2). ruby-lsp emitted kinds per probe #1:
//   2  Module     — module declarations + Concern modules
//   5  Class      — class declarations
//   6  Method     — instance methods + Rails DSL macros (`has_many :posts`
//                  with arg-included name); receiver-prefixed names
//                  (`self.method`) — Substep 3.2 remap
//   8  Field      — instance variables nested under methods (filtered out
//                  per ADR-13 Python parameter/instance-var precedent)
//   12 Function   — class methods (`def self.foo`)
//   14 Constant   — constants (PREMIUM_TIER_LIMIT, VERSION etc.)
// ---------------------------------------------------------------------------
export function mapRubyKind(lspKind: number): SymbolKind {
  switch (lspKind) {
    case 2:
      return "module";
    case 5:
      return "class";
    case 6:
      return "method";
    case 12:
      return "method"; // class methods (`def self.foo`); remap to method
    case 14:
      return "variable"; // constants — reduced taxonomy has no `constant`
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
// RubyAdapter
// ---------------------------------------------------------------------------

export interface RubyAdapterOptions {
  /**
   * Override the ruby-lsp binary path. When set, bypasses dual-pattern
   * detection and spawns the binary directly (gem-install pattern).
   * Defaults to `process.env.CONTEXTATLAS_RUBY_LSP_BIN` when unset.
   */
  cliPath?: string;
  /** Upper bound on a single LSP request. Defaults to 30s. */
  requestTimeoutMs?: number;
  /**
   * Skip the `ruby --version` preflight. Reserved for tests that stub
   * the LSP transport — production code should leave at default
   * `false` so the adapter fails fast when `ruby` is missing from PATH.
   */
  skipRubyPreflight?: boolean;
  /**
   * Override the `ruby` binary used by the preflight. Defaults to
   * `"ruby"` (resolved via PATH). Test-only; production users should
   * put `ruby` on PATH per ADR-21.
   */
  rubyBin?: string;
  /**
   * Override the bundler binary. Defaults to platform-appropriate
   * (`bundle.bat` on win32, `bundle` elsewhere). Honors
   * `process.env.CONTEXTATLAS_BUNDLE_BIN` env override.
   */
  bundleBin?: string;
}

/** Extensions indexed in v0.9 per ADR-21 "File extensions" decision (`.rb` only). */
export const RUBY_EXTENSIONS: readonly string[] = [".rb"];

export class RubyAdapter implements LanguageAdapter {
  readonly language: LanguageCode = "ruby";
  readonly extensions: readonly string[] = RUBY_EXTENSIONS;

  private readonly client: LspClient;
  private readonly options: RubyAdapterOptions;
  private rootPath: string | null = null;
  private readonly openFiles = new Set<string>();
  private readonly diagnosticsByUri = new Map<string, Diagnostic[]>();
  private readonly diagnosticsListeners = new Map<string, () => void>();

  /**
   * Rails-detected flag set at initialize-time per ADR-21 §"Rails
   * DSL handling". Informs downstream consumers (doctor checks,
   * extraction pipeline) whether the add-on path is expected.
   * Adapter degrades gracefully regardless — the add-on either loads
   * or doesn't; baseline ruby-lsp continues working either way.
   */
  private railsDetected = false;

  constructor(options: RubyAdapterOptions = {}) {
    this.client = new LspClient("ruby-lsp");
    this.options = options;

    // textDocument/publishDiagnostics — ruby-lsp uses pull-model
    // (LSP 3.17) per ADR-21, so this handler likely never fires.
    // Wired defensively in case ruby-lsp ever toggles to push or
    // bridges via extensions. If it fires, captured for symmetry
    // with Pyright/gopls precedent; getDiagnostics still uses the
    // pull-request path at Substep 3.5.
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

    // window/logMessage + window/showMessage — ruby-lsp surfaces
    // add-on load status messages here, including ruby-lsp-rails
    // Rails-runner subprocess success/failure. Per ADR-21 §"Adapter
    // design: graceful degradation", add-on failure is logged but
    // not fatal.
    this.client.onNotification("window/logMessage", (params) => {
      const p = params as { type?: number; message?: string } | null;
      if (!p?.message) return;
      // Surface warnings + errors (type 1=Error, 2=Warning); skip
      // info/log spam.
      if (p.type === 1 || p.type === 2) {
        log.warn(`[ruby-lsp server] ${p.message}`);
      }
    });
    this.client.onNotification("window/showMessage", (params) => {
      const p = params as { type?: number; message?: string } | null;
      if (!p?.message) return;
      if (p.type === 1 || p.type === 2) {
        log.warn(`[ruby-lsp show] ${p.message}`);
      }
    });

    // Server-initiated request stubs. ruby-lsp may issue these during
    // startup; without handlers the init hangs. Matches gopls/pyright
    // precedent.
    for (const method of [
      "window/workDoneProgress/create",
      "client/registerCapability",
      "client/unregisterCapability",
      "window/showMessageRequest",
    ]) {
      this.client.onRequest(method, () => null);
    }

    // workspace/configuration — defensive length-matched array
    // response per ADR-14 gopls precedent (pyright tolerates null;
    // ruby-lsp behavior on this empirically untested at v1.0, but
    // length-matched is LSP-spec-correct and safe across servers).
    this.client.onRequest("workspace/configuration", (params) => {
      const items = (params as { items?: unknown[] } | null)?.items ?? [];
      return items.map(() => ({}));
    });
  }

  async initialize(rootPath: string): Promise<void> {
    if (this.rootPath) {
      throw new Error("RubyAdapter.initialize called twice.");
    }
    const absRoot = pathResolve(rootPath);
    this.rootPath = normalizePath(absRoot);

    // ADR-21 §"Install pattern" — bundle spawns `ruby.exe` as a
    // subprocess. Preflight `ruby --version` so we fail fast with an
    // actionable error rather than the cryptic
    // "'ruby.exe' is not recognized" surface that fires inside
    // cmd.exe → bundle.bat → ruby resolution. Parallel to ADR-14
    // gopls's `go version` preflight.
    if (!this.options.skipRubyPreflight) {
      await runRubyVersionPreflight(this.options.rubyBin ?? "ruby");
    }

    // Rails detection per ADR-21 §"Rails DSL handling". ruby-lsp
    // auto-loads ruby-lsp-rails when it detects Rails via Gemfile +
    // bin/rails. Adapter's role is observational — we don't load the
    // add-on (ruby-lsp does); we just capture detection state for
    // doctor-substrate visibility + downstream graceful-degradation
    // framing.
    this.railsDetected = detectRails(absRoot);
    log.info(`[ruby-adapter] Rails detection`, {
      rootPath: this.rootPath,
      railsDetected: this.railsDetected,
    });

    // Spawn pattern resolution per ADR-21 §"Dual-pattern install" +
    // Windows .bat handling. Returns { command, args } tuple suitable
    // for LspClient.start.
    const spawn = resolveSpawnPattern({
      cliPathOverride: this.options.cliPath,
      bundleBinOverride: this.options.bundleBin,
      railsDetected: this.railsDetected,
    });
    log.info(`[ruby-adapter] starting ruby-lsp`, {
      command: spawn.command,
      args: spawn.args,
      rootPath: this.rootPath,
      pattern: spawn.pattern,
    });

    this.client.start(spawn.command, spawn.args, absRoot);

    // ruby-lsp's capability declaration per probe baseline empirical
    // capture (see ruby-lsp-probe-findings-baseline.md
    // §"initialize response — capabilities"). We declare:
    //   - documentSymbol (hierarchical) — Substep 3.2
    //   - references — Substep 3.4
    //   - definition — Substep 3.7 (peek) + Substep 3.6 (typeInfo)
    //   - hover (markdown) — Substep 3.3 + 3.7
    //   - publishDiagnostics — defensive (ruby-lsp uses pull-model
    //     per ADR-21; declaring doesn't hurt)
    //   - diagnostic (pull-model per LSP 3.17) — Substep 3.5
    //
    // NOT declared (per ADR-21 §LSP primitive mappings):
    //   - implementation (ruby-lsp doesn't advertise; queries hang)
    //   - typeDefinition (same)
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
          },
        },
      },
      this.options.requestTimeoutMs ?? 60_000,
    );
    this.client.notify("initialized", {});

    // No cold-start `$/progress` readiness gate. ADR-21 §LSP
    // primitive mappings + probe boot section confirmed
    // ruby-lsp 0.26.9 follows Pyright pattern — empty $/progress
    // traffic during init. Per-call ceiling at request time absorbs
    // any cold-start variance. ADR-18 readiness-pattern decision.
  }

  async shutdown(): Promise<void> {
    await this.client.stop();
    this.rootPath = null;
    this.openFiles.clear();
    this.diagnosticsByUri.clear();
    this.diagnosticsListeners.clear();
    this.railsDetected = false;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve a filePath argument to absolute + workspace-relative
   * forms. Accepts either absolute paths or workspace-relative
   * paths; returns both for use by callers (LSP requests need
   * absolute paths via toFileUri; Symbol-IDs need workspace-
   * relative paths per ADR-01).
   */
  private resolveFile(filePath: string): { absPath: string; relPath: string } {
    if (!this.rootPath) {
      throw new Error("RubyAdapter not initialized; call initialize() first.");
    }
    const abs = pathResolve(this.rootPath, filePath);
    const absNormalized = normalizePath(abs);
    const rel = toRelativePath(absNormalized, this.rootPath);
    return { absPath: absNormalized, relPath: rel };
  }

  /**
   * Send `textDocument/didOpen` for `absPath` if not already opened
   * in this session. ruby-lsp (like Pyright + gopls) requires files
   * to be opened before symbol queries return results. Matches
   * gopls/pyright `ensureOpen` precedent.
   */
  private async ensureOpen(absPath: string): Promise<void> {
    const normalized = normalizePath(absPath);
    if (this.openFiles.has(normalized)) return;
    this.openFiles.add(normalized);
    const { readFileSync } = await import("node:fs");
    this.client.notify("textDocument/didOpen", {
      textDocument: {
        uri: toFileUri(absPath),
        languageId: "ruby",
        version: 1,
        text: readFileSync(absPath, "utf8"),
      },
    });
  }

  /**
   * Construct a Ruby Symbol-ID per ADR-01 format: `sym:rb:<path>:<name>`.
   * Path is workspace-relative forward-slash-separated; name is the
   * symbol identifier as ruby-lsp emits it (including verbatim `self.`
   * prefix for class methods per Φ-γ-variant lock, and verbatim
   * `"macro :argument"` form for Rails DSL macros).
   */
  private symbolId(relPath: string, name: string): SymbolId {
    return `sym:${LANG_CODES["ruby"]}:${relPath}:${name}`;
  }

  // -------------------------------------------------------------------------
  // Data methods — all 6 LanguageAdapter capabilities implemented across
  // Phase 3 Substeps 3.2-3.7 per ADR-21 LSP primitive mappings table.
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
    // precedent. ruby-lsp's documentSymbol response has:
    //   - Classes (kind 5) / Modules (kind 2) at top level with
    //     children[] for their methods, constants, DSL macros, etc.
    //   - Methods (kind 6) may have nested children (kind 8 instance
    //     vars). The kind-8 children are filtered out per ADR-13
    //     Python parameter/instance-var filtering precedent.
    //   - DSL macro symbols (has_many :posts, scope :active) surface
    //     as kind-6 entries with their "macro :argument" naming
    //     preserved verbatim per probe-empirical (ADR-21 §LSP
    //     primitive mappings).
    //   - Class methods (`def self.foo`) surface as kind-12 (Function)
    //     with `self.` prefix in name. Adapter remaps kind to `method`
    //     via mapRubyKind AND preserves `self.` prefix verbatim in
    //     Symbol-ID name field per Φ-γ-variant lock (ADR-21 §Rationale
    //     "Why preserve `self.method` name verbatim per gopls
    //     precedent" + commit a76c1c4 surgical revision).
    const out: AtlasSymbol[] = [];
    const walk = (
      sym: LspDocumentSymbol,
      parentId: SymbolId | undefined,
    ): void => {
      const kind = mapRubyKind(sym.kind);
      if (kind === "other") {
        // Filter out: instance variables (kind 8 nested under methods)
        // and any other kinds we don't surface as top-level Symbol
        // records. Children of filtered symbols are NOT recursively
        // walked — they're scoped to the filtered parent and not
        // independently relevant per ADR-21 §Symbol-kind mapping.
        return;
      }
      const atlasSym: AtlasSymbol = {
        id: this.symbolId(relPath, sym.name),
        name: sym.name,
        kind,
        path: relPath,
        line: sym.selectionRange.start.line + 1,
        language: "ruby",
      };
      if (sym.detail !== undefined && sym.detail.length > 0) {
        atlasSym.signature = sym.detail;
      }
      if (parentId !== undefined) {
        atlasSym.parentId = parentId;
      }
      out.push(atlasSym);

      // Recurse children with current symbol as parent. Class/Module
      // children include methods + DSL macros + constants; Method
      // children include kind-8 instance vars (filtered). Recurse
      // depth is bounded by ruby-lsp's tree shape (typically
      // class/module → method → instance vars; depth ≤ 3).
      if (sym.children && sym.children.length > 0) {
        for (const child of sym.children) {
          walk(child, atlasSym.id);
        }
      }
    };

    for (const top of result) {
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
    // gopls precedent (go.ts getDocstring re-queries documentSymbol
    // to get position before hover call).
    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return null;
    const target = findSymbolByName(symbols, parsed.name);
    if (!target) return null;

    const kind = mapRubyKind(target.kind);
    if (kind === "other") return null;

    // Build base AtlasSymbol; hover enrichment adds signature below
    // when available.
    const baseSym: AtlasSymbol = {
      id,
      name: target.name,
      kind,
      path: relPath,
      line: target.selectionRange.start.line + 1,
      language: "ruby",
    };
    if (target.detail !== undefined && target.detail.length > 0) {
      baseSym.signature = target.detail;
    }

    // ADR-21 §LSP primitive mappings: hover used for getSymbolDetails.
    // Substantively diverges from Pyright/gopls precedent (both leave
    // signature as listSymbols-populated). ruby-lsp's documentSymbol
    // typically doesn't populate detail field; hover provides rich
    // RDoc + rbs-derived signatures (probe #4 baseline).
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

    // Null fallthrough — probe #4 captured null hover for user-defined
    // methods without docstrings + unresolved DSL macros (e.g.,
    // `scope :active`). Adapter returns Symbol unchanged with no
    // signature enrichment; no error.
    if (!hover || !hover.contents) return baseSym;
    const value =
      typeof hover.contents === "object" &&
      "value" in hover.contents &&
      typeof hover.contents.value === "string"
        ? hover.contents.value
        : null;
    if (!value) return baseSym;

    const { signature: hoverSig } = parseRubyHoverContent(value);
    if (hoverSig !== null) {
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
    // position (same pattern as 3.3 getSymbolDetails; gopls precedent).
    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return [];
    const target = findSymbolByName(symbols, parsed.name);
    if (!target) return [];

    // textDocument/references with includeDeclaration: false per
    // ADR-21 §LSP primitive mappings + Pyright/gopls precedent
    // (verified empirically at Substep 3.4 cross-reference-claim-
    // coherence catch: pyright.ts:493 + go.ts:422 + probe substrate
    // all use false; Pattern 7 axis 5 second instance — see commit
    // body for full framing).
    const locations = await this.client.request<LspLocation[] | null>(
      "textDocument/references",
      {
        textDocument: { uri: toFileUri(absPath) },
        position: target.selectionRange.start,
        context: { includeDeclaration: false },
      },
      this.options.requestTimeoutMs ?? 30_000,
    );

    // Empty-result handling: ruby-lsp 0.26.9 baseline returns empty
    // `[]` for constant declaration-site queries (probe #2
    // PREMIUM_TIER_LIMIT). Adapter returns empty Reference[] without
    // error per ADR-21 §Limitations "Constant references at
    // declaration site". null + non-array also fold through to empty.
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return [];
    }

    // First empirical reuse of dedupLocationsByNormalizedPath utility
    // from Substep 3.2. ADR-21 §URL-encoding result duplication —
    // ruby-lsp returns each cross-file location TWICE under c%3A vs
    // c: URI encodings on Windows. Adapter dedupes via
    // normalizePath-driven (path, line, col) tuple key.
    const deduped = dedupLocationsByNormalizedPath(locations, (loc) => ({
      uri: loc.uri,
      line: loc.range.start.line,
      col: loc.range.start.character,
    }));

    const rootPath = this.rootPath;
    return deduped.map((loc): Reference => {
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

    // LSP 3.17 pull-model textDocument/diagnostic request per ADR-21
    // §LSP primitive mappings + Probe #3. Substantively diverges from
    // Pyright/gopls which use publishDiagnostics push-model
    // notification pattern. Probe captured count: 0 for broken.rb
    // because probe used push-channel handler which ruby-lsp doesn't
    // populate; pull-request returns actual diagnostics from prism
    // parser per ADR-21 Decision §"Diagnostics via PULL model".
    //
    // Per-call ceiling absorbs cold-start variance (Pyright pattern
    // per ADR-18 + probe substrate empty $/progress confirmation).
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

    // Re-query documentSymbol to find target with range info per
    // gopls/Pyright precedent. Pull range AND selectionRange — body
    // scan needs range.start..range.end (full class body); declaration
    // line uses selectionRange.start (class header).
    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return empty;
    const target = findSymbolByName(symbols, parsed.name);
    if (!target) return empty;

    // getTypeInfo applies to type-like symbols only — classes (kind
    // 5) + modules (kind 2). Methods, constants, instance vars all
    // return empty TypeInfo per ADR-07 contract semantics.
    const kind = mapRubyKind(target.kind);
    if (kind !== "class" && kind !== "module") return empty;

    // Read source for declaration-parse fallback per ADR-21
    // §getTypeInfo (Pyright precedent — ADR-13 §getTypeInfo). ruby-lsp
    // doesn't expose textDocument/implementation or typeDefinition
    // (probe #5: queries hang); declaration-parse from source is the
    // canonical approach.
    let sourceText: string;
    try {
      sourceText = readFileSync(absPath, "utf8");
    } catch {
      return empty;
    }

    // extends: parse class header `class Name < Super` syntax.
    // Modules return [] (no `module Name < Other` syntax in Ruby).
    const extendsList = parseRubyClassExtends(
      sourceText,
      target.selectionRange.start.line,
    );

    // implements: scan class body for include/extend/prepend
    // statements at top level. ADR-21 §getTypeInfo §Decision: all
    // three (include/extend/prepend) treated uniformly as
    // implements at v1.0; v1.1 candidate to split per call shape
    // if downstream consumers need it.
    const implementsList = parseRubyMixins(
      sourceText,
      target.range.start.line,
      target.range.end.line,
    );

    // usedByTypes: empty at v1.0 per simpler-adapter-private-scope
    // framing (Travis's watch (c) verify-and-act; ADR-21 §getTypeInfo
    // notes pass-1 inventory walk via Pyright precedent for full-
    // indexing runs but adapter at single-symbol-query path returns
    // degraded-mode empty per ADR-13 precedent for "getTypeInfo at
    // query time without the cache"). v1.1 candidate to add full
    // pass-1 inventory walk if benchmark evidence demands.
    return {
      extends: extendsList,
      implements: implementsList,
      usedByTypes: [],
    };
  }

  async getDocstring(id: SymbolId): Promise<string | null> {
    const parsed = parseSymbolId(id);
    if (!parsed || !this.rootPath) return null;
    const { absPath } = this.resolveFile(parsed.path);
    if (!existsSync(absPath)) return null;
    await this.ensureOpen(absPath);

    // documentSymbol → find target → hover (same pattern as 3.3
    // getSymbolDetails). Forward-composition design from Substep 3.3:
    // parseRubyHoverContent returns { signature, prose }; 3.3
    // consumes signature, 3.7 consumes prose. Single hover request
    // per symbol; no re-parsing.
    const symbols = await this.client.request<LspDocumentSymbol[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri: toFileUri(absPath) } },
      this.options.requestTimeoutMs ?? 30_000,
    );
    if (!symbols || !Array.isArray(symbols)) return null;
    const target = findSymbolByName(symbols, parsed.name);
    if (!target) return null;

    // ADR-21 §LSP primitive mappings: hover-with-comments per gopls
    // precedent (substantively different from ADR-13 Pyright omits-
    // docstrings). Probe #4 captured rich RDoc for DSL macros
    // resolved from gem source (200+ lines for has_many) + rbs-
    // derived signatures + RDoc for module_function. User-defined
    // methods without docstrings return null hover.
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

    return extractDocstringFromHoverResponse(hover);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether `rootPath` is a Rails application per the heuristic
 * ruby-lsp uses: Gemfile presence + bin/rails presence. Probe-empirical
 * substrate at boot section "Detected test library: rails (bin/rails
 * present)" confirms this is what ruby-lsp triggers add-on auto-load
 * on. Adapter mirrors the heuristic for observational purposes (doctor
 * substrate; downstream consumers may key off this flag).
 */
export function detectRails(rootPath: string): boolean {
  const gemfile = pathJoin(rootPath, "Gemfile");
  const binRails = pathJoin(rootPath, "bin", "rails");
  return existsSync(gemfile) && existsSync(binRails);
}

/**
 * Resolve the spawn command + args for the ruby-lsp subprocess per
 * ADR-21 §"Dual-pattern install" + §"Windows .bat-spawn handling".
 *
 * Precedence:
 *   1. `cliPathOverride` (env var CONTEXTATLAS_RUBY_LSP_BIN or
 *      options.cliPath): direct gem-install pattern — spawn the
 *      binary directly. On Windows, wrap in cmd.exe /c because
 *      gem-installed ruby-lsp.bat is a .bat shim.
 *   2. Rails-detected: bundler pattern — spawn `bundle exec
 *      ruby-lsp`. On Windows, wrap in cmd.exe /c because bundle.bat
 *      is a .bat shim.
 *   3. No-Rails fallback: assume gem-install pattern — spawn
 *      `ruby-lsp` resolved via PATH. Windows wrap applies.
 */
export function resolveSpawnPattern(opts: {
  cliPathOverride?: string;
  bundleBinOverride?: string;
  railsDetected: boolean;
}): { command: string; args: string[]; pattern: "direct" | "bundler" } {
  const isWindows = process.platform === "win32";
  const direct = opts.cliPathOverride ?? process.env.CONTEXTATLAS_RUBY_LSP_BIN;

  if (direct) {
    if (isWindows) {
      return { command: "cmd.exe", args: ["/c", direct], pattern: "direct" };
    }
    return { command: direct, args: [], pattern: "direct" };
  }

  if (opts.railsDetected) {
    const bundleBin =
      opts.bundleBinOverride ??
      process.env.CONTEXTATLAS_BUNDLE_BIN ??
      (isWindows ? "bundle.bat" : "bundle");
    if (isWindows) {
      return {
        command: "cmd.exe",
        args: ["/c", bundleBin, "exec", "ruby-lsp"],
        pattern: "bundler",
      };
    }
    return {
      command: bundleBin,
      args: ["exec", "ruby-lsp"],
      pattern: "bundler",
    };
  }

  // No Rails detected — assume gem-install pattern with `ruby-lsp` on PATH.
  if (isWindows) {
    return {
      command: "cmd.exe",
      args: ["/c", "ruby-lsp"],
      pattern: "direct",
    };
  }
  return { command: "ruby-lsp", args: [], pattern: "direct" };
}

/**
 * Spawn `ruby --version` as a preflight per ADR-21 §"Install pattern"
 * + parallel to ADR-14 gopls's `go version` preflight. Resolves on
 * exit code 0; rejects with actionable error otherwise.
 *
 * The error message references ADR-21 install pattern + the doctor
 * recommendation surface (Windows + RubyInstaller users may need
 * `ridk install` if `ruby` is missing entirely).
 */
export function runRubyVersionPreflight(rubyBin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = childSpawn(rubyBin, ["--version"], {
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
          `RubyAdapter: \`${rubyBin} --version\` could not be spawned. ` +
            "Install Ruby 3.3+ (Ruby 4.0+ recommended per ADR-21 cohort-" +
            "actual-version anchor) and ensure `ruby --version` works in " +
            "a plain shell, then retry. Windows + RubyInstaller users " +
            "may need to run `ridk install` for full toolchain setup; " +
            "see ADR-21 §Install Pattern for environmental matrix.\n" +
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
          `RubyAdapter: \`${rubyBin} --version\` exited with code ${code}. ` +
            "stderr: " +
            (stderr.trim() || "(empty)") +
            "\nADR-21 §Install Pattern documents toolchain requirements.",
        ),
      );
    });
  });
}

/**
 * Extract docstring prose from a ruby-lsp hover response per ADR-21
 * §LSP primitive mappings. Forward-composition consumer of
 * parseRubyHoverContent's `prose` field (3.3 substrate; 3.7 reuses).
 *
 * Exported for unit-test access to the response-handling pipeline
 * without requiring live LSP integration. Defensive null-fallthrough
 * for response variants:
 *   - null response → null
 *   - missing contents → null
 *   - string contents (LSP older shape) → null at v1.0 (only
 *     handle markdown content envelope)
 *   - object contents without value field → null
 *   - empty value → null
 *   - value with no code block AND no prose → null
 *   - value with code block only (no RDoc body; e.g., User class
 *     hover from probe #4) → null prose
 *   - value with code block + RDoc body → prose returned (HTML
 *     comments stripped, definition-links stripped, per
 *     parseRubyHoverContent's existing logic)
 */
export function extractDocstringFromHoverResponse(
  response:
    | {
        contents?: { kind?: string; value?: string } | string;
      }
    | null,
): string | null {
  if (!response || !response.contents) return null;
  const value =
    typeof response.contents === "object" &&
    "value" in response.contents &&
    typeof response.contents.value === "string"
      ? response.contents.value
      : null;
  if (!value) return null;
  const { prose } = parseRubyHoverContent(value);
  return prose;
}

/**
 * Parse Ruby class extends (superclass) from source line. Ruby
 * syntax: `class Name < Super` (with optional namespacing on
 * either side: `class Foo::Bar < Baz::Qux`).
 *
 * Returns array (not single value) for symmetry with TypeInfo.extends
 * shape — Ruby supports only single inheritance, so the array is
 * always 0 or 1 element. Modules return [] (no superclass syntax).
 *
 * Edge cases handled:
 *   - `class Name` (no superclass) → []
 *   - `class << self` (singleton class syntax) → [] (not standard
 *     inheritance; the regex requires `<` followed by identifier,
 *     not `<<`)
 *   - `module Name` → [] (modules have no superclass syntax)
 *   - Out-of-bounds line index → []
 *   - Empty/missing line → []
 *
 * Reopened class scope: this parser only sees the line at
 * `classLine0Indexed`. If a class is reopened in multiple files,
 * the inheritance is parseable only at the FIRST occurrence (the
 * declaration line). Reopened-class mixins are still surfaced via
 * parseRubyMixins per the line-range-scan it performs.
 */
export function parseRubyClassExtends(
  sourceText: string,
  classLine0Indexed: number,
): string[] {
  const lines = sourceText.split(/\r?\n/);
  const line = lines[classLine0Indexed];
  if (!line) return [];
  // Match: ^[whitespace] class [identifier with :: support] <
  //        [identifier with :: support]
  // Identifier pattern \w+(?:::\w+)* matches Foo or Foo::Bar or
  // Foo::Bar::Baz. The `<` requires a single < (not <<; singleton
  // class syntax), with optional spacing.
  const match = /^\s*class\s+\w+(?:::\w+)*\s*<\s*(\w+(?:::\w+)*)/.exec(line);
  if (!match) return [];
  return [match[1]!];
}

/**
 * Parse Ruby mixin statements (include/extend/prepend) from class
 * body. Scans lines from `startLine0Indexed + 1` (after class
 * header) to `endLine0Indexed - 1` (before closing `end`).
 *
 * All three mixin keywords (include, extend, prepend) treated
 * uniformly per ADR-21 §getTypeInfo §Decision — collected into a
 * single array. Order preserved per source position.
 *
 * Edge cases handled:
 *   - Multiple includes: all surfaced
 *   - Namespaced mixins (`include Foo::Bar`): preserved verbatim
 *   - Mixins at top of class body (common): scanned
 *   - Mixins inside method bodies: NOT matched (regex requires
 *     line to start with whitespace + keyword + identifier; method
 *     body content typically has deeper indentation but the
 *     keyword pattern still fires — this is a v1.0 known
 *     limitation; v1.1 candidate for proper scope-aware parsing)
 *   - Reopened class bodies: scanned via line-range
 *   - ActiveSupport::Concern's `included do` block contents NOT
 *     scanned for mixins (Concern bubble-up is v1.1 candidate per
 *     ADR-21 §getTypeInfo)
 */
export function parseRubyMixins(
  sourceText: string,
  startLine0Indexed: number,
  endLine0Indexed: number,
): string[] {
  const lines = sourceText.split(/\r?\n/);
  const result: string[] = [];
  // Scan from line AFTER class header (header is at startLine) to
  // line BEFORE closing `end` (end is at endLine).
  const from = startLine0Indexed + 1;
  const to = Math.min(endLine0Indexed - 1, lines.length - 1);
  for (let i = from; i <= to; i++) {
    const line = lines[i];
    if (!line) continue;
    // Match: ^[whitespace] (include|extend|prepend) [identifier
    // with :: support] [optional rest of line for symbol args etc.]
    const match = /^\s*(include|extend|prepend)\s+(\w+(?:::\w+)*)/.exec(line);
    if (match) {
      result.push(match[2]!);
    }
  }
  return result;
}

/**
 * LSP 3.17 pull-model diagnostic response shape per ADR-21
 * §LSP primitive mappings. Two variants:
 *   - full: items array contains diagnostics for the document
 *   - unchanged: no items; resultId only (diagnostics haven't
 *     changed since previousResultId in request — adapter doesn't
 *     send previousResultId at v1.0, but defensive handling here)
 *
 * relatedDocuments key (diagnostics for OTHER files affected by
 * errors in this file) is part of the LSP 3.17 spec but ignored
 * at v1.0 — adapter contract is per-file scope.
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
 * Build ContextAtlas Diagnostic[] from a ruby-lsp pull-model
 * DocumentDiagnosticReport response. Exported for unit-test access
 * to variant handling without requiring live LSP integration.
 *
 * Variant handling per ADR-21 §LSP primitive mappings:
 *   - null response → empty array (defensive; per-call timeout
 *     fallback case)
 *   - kind: "unchanged" → empty array (ruby-lsp shouldn't emit
 *     this when no previousResultId is sent, but defensive
 *     handling at v1.0; future enhancement could track resultId
 *     state for "diagnostics-haven't-changed" optimization)
 *   - kind: "full" → items mapped to ContextAtlas Diagnostic[]
 *     with severity remap via mapDiagnosticSeverity + 1-indexed
 *     line conversion
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
 * Construct a Ruby Reference-ID per ADR-01 format:
 * `ref:rb:<path>:<line>`. Path is workspace-relative forward-slash-
 * separated; line is 1-indexed (human-readable). Exported for
 * testability of ID format separate from full findReferences flow.
 */
export function buildReferenceId(relPath: string, line: number): ReferenceId {
  return `ref:${LANG_CODES["ruby"]}:${relPath}:${line}`;
}

/**
 * Recursive walker over LspDocumentSymbol[] looking for a symbol by
 * name. Walks children depth-first; first match wins. Returns null
 * if no match.
 *
 * Match shape: ruby-lsp's documentSymbol may emit DSL macros with
 * "macro :argument" naming (e.g., "has_many :posts"), class methods
 * with "self." prefix (e.g., "self.find_by_email"), and standard
 * names. Caller passes the verbatim name as parsed from Symbol-ID.
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
 * Parse ruby-lsp hover response markdown envelope into structured
 * `{ signature, prose }` shape per ADR-21 §LSP primitive mappings
 * (Probe #4 baseline empirical substrate).
 *
 * ruby-lsp hover envelope structure (probe-empirical):
 *   ```ruby
 *   <signature line(s) — single-line or multi-line for overloads>
 *   ```
 *
 *   **Definitions**: [link1](file:///...) | [link2](file:///...)
 *
 *   <optional HTML comment with rdoc-file metadata>
 *   <optional RDoc body — may be empty (User class) or substantial
 *    (has_many's 200+ line documentation)>
 *
 * Parser strips:
 *   - Definition-links section (the `**Definitions**: ...` paragraph)
 *   - HTML comments (rdoc-file metadata, not user-facing)
 *
 * Parser preserves:
 *   - First fenced ```ruby code block content (signature; multi-line
 *     when ruby-lsp emits overload counts or expanded signatures)
 *   - RDoc body prose (consumed by getDocstring at Substep 3.7)
 *
 * Edge cases:
 *   - Empty/null value → both fields null
 *   - Code block only (no prose) → signature populated, prose null
 *   - No code block → signature null, prose = stripped value
 *
 * Returns: `{ signature, prose }` — both string-or-null.
 * Forward-composition design: Substep 3.3 consumes `signature`;
 * Substep 3.7 consumes `prose`. Single hover request, single
 * markdown parse, two field consumers.
 */
export function parseRubyHoverContent(value: string): {
  signature: string | null;
  prose: string | null;
} {
  const codeBlockMatch = /```ruby\n([\s\S]*?)\n```/.exec(value);
  const signature = codeBlockMatch ? codeBlockMatch[1]!.trim() : null;

  let prose: string | null;
  if (codeBlockMatch) {
    const afterBlock = value.slice(
      codeBlockMatch.index + codeBlockMatch[0].length,
    );
    const proseRaw = afterBlock
      .replace(/^\s*\n?\*\*Definitions\*\*:[^\n]*\n*/m, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
    prose = proseRaw.length > 0 ? proseRaw : null;
  } else {
    const proseRaw = value
      .replace(/^\s*\n?\*\*Definitions\*\*:[^\n]*\n*/gm, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
    prose = proseRaw.length > 0 ? proseRaw : null;
  }

  return { signature, prose };
}

/**
 * URL-encoding dedup utility per ADR-21 §"URL-encoding result
 * duplication (Windows-specific)". ruby-lsp returns each cross-file
 * location TWICE under different URI encodings (`c%3A` and `c:`
 * forms) on Windows; the adapter dedupes via `normalizePath`-driven
 * tuple-keyed deduplication.
 *
 * Generic over the response item type — caller provides an extractor
 * function returning the URI + position to dedup on. listSymbols
 * (Substep 3.2) doesn't actually need dedup (single-file response,
 * no cross-file collisions), but this utility ships now as foundation
 * for Substeps 3.4 (findReferences), 3.6 (getTypeInfo →
 * declaration-parse may reuse references), and any cross-file
 * resolution that surfaces in Substep 3.7. Validates the path-line-
 * tuple-key shape generalizes across LSP response types.
 *
 * Edge cases handled:
 *   - URL-encoded `%3A` vs literal `:` drive-letter forms (probe-
 *     empirical)
 *   - Forward-slash vs backslash separators (normalizePath converts)
 *   - Optional column-component for cases needing finer dedup
 *     granularity than (path, line)
 */
export function dedupLocationsByNormalizedPath<T>(
  items: readonly T[],
  extractKey: (item: T) => { uri: string; line: number; col?: number },
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const { uri, line, col } = extractKey(item);
    const path = normalizePath(uri);
    const key = `${path}:${line}:${col ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Parse a Ruby SymbolId (`sym:rb:<path>:<name>`) into its components.
 * Returns null for IDs that don't match the expected shape — callers
 * treat that as "no such symbol" rather than throwing.
 *
 * Ruby symbol names can contain `:`, ` `, `.`, `!`, `?` from DSL macros
 * (`has_many :posts`), Module::Constant qualification, `self.method`
 * class-method prefix, and predicate/bang method conventions. Path
 * component is the first colon-delimited segment after `sym:rb:`.
 *
 * Symbol-ID DSL-macro format question raised in Phase 3 plan watch #3
 * — empirical resolution comes at Substep 3.2 documentSymbol mapping.
 */
export function parseSymbolId(
  id: SymbolId,
): { path: string; name: string } | null {
  const match = /^sym:rb:([^:]+):(.+)$/.exec(id);
  if (!match) return null;
  return { path: match[1]!, name: match[2]! };
}

// Re-export LANG_CODES for downstream consumers that build symbol IDs
// directly (matches pyright.ts + go.ts re-export convention).
export { LANG_CODES };
