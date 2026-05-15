/**
 * Ruby language adapter backed by ruby-lsp + ruby-lsp-rails (ADR-21).
 *
 * Wraps `ruby-lsp` spawned as a subprocess (via `bundle exec` when
 * Rails detected; via direct gem-install binary otherwise), speaking
 * LSP over stdio. Implements the `LanguageAdapter` interface from
 * src/types.ts per ADR-03 (adapters are plugins) and ADR-07
 * (getTypeInfo is a required capability).
 *
 * Substep 3.1 (this commit): skeleton — constructor, handler stubs,
 * spawn pattern with Windows cmd.exe wrap, initialize handshake,
 * Rails detection, shutdown. Data methods throw "not yet
 * implemented" placeholders. Subsequent Phase 3 substeps fill in
 * listSymbols (3.2), getSymbolDetails (3.3), findReferences (3.4),
 * getDiagnostics (3.5; pull-model — net-new substrate), getTypeInfo
 * (3.6; declaration-parse fallback per Pyright precedent), and
 * getDocstring (3.7; hover-with-comments per gopls precedent).
 *
 * Divergences from ADR-13 (Pyright) + ADR-14 (gopls) documented in
 * ADR-21:
 *   - Pull-model diagnostics (LSP 3.17 `textDocument/diagnostic`
 *     REQUEST), NOT publishDiagnostics notification. Substep 3.5.
 *   - URL-encoding result duplication on Windows (`c%3A` + `c:`
 *     forms). Adapter dedupes via `normalizePath` + (path, line)
 *     tuple. Substep 3.2 + reused thereafter.
 *   - Dual-pattern install (bundler vs direct gem) detected per-
 *     workspace via Gemfile + bin/rails heuristic. This file.
 *   - Windows .bat-spawn wrap in `cmd.exe /c` per CVE-2024-27980.
 *     This file.
 *   - No cold-start `$/progress` readiness gate — ruby-lsp follows
 *     Pyright pattern; per-call ceiling absorbs cold-start variance.
 *   - ruby-lsp-rails add-on is best-effort enhancement, NOT baseline
 *     assumption. Adapter logs add-on load failure but continues
 *     with baseline LSP functionality.
 *
 * See `docs/adr/ruby-lsp-probe-findings-baseline.md` for the
 * empirical probe substrate motivating these design choices.
 */

import { spawn as childSpawn } from "node:child_process";
import { existsSync } from "node:fs";
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
// LspLocation + LspDocumentSymbol re-added at Substep 3.2 (listSymbols) +
// Substep 3.4 (findReferences); omitted from skeleton to keep noUnusedLocals
// clean.

// ---------------------------------------------------------------------------
// Kind mapping per ADR-21 §"Symbol-kind mapping" — initial scaffolding;
// Substep 3.2 expands with DSL-macro pattern detection + `self.method`
// class-method remap. ruby-lsp emitted kinds per probe #1:
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
  // Data methods — Substep 3.1 skeleton stubs. Subsequent substeps fill in
  // per ADR-21 LSP primitive mappings table.
  // -------------------------------------------------------------------------

  async listSymbols(_filePath: string): Promise<AtlasSymbol[]> {
    throw new Error(
      "RubyAdapter.listSymbols not yet implemented (Phase 3 Substep 3.2). " +
        "ADR-21 §LSP primitive mappings: documentSymbol via " +
        "hierarchicalDocumentSymbolSupport request shape + URL-encoding " +
        "dedup pass + kind remapping per ADR-01 reduced taxonomy.",
    );
  }

  async getSymbolDetails(_id: SymbolId): Promise<AtlasSymbol | null> {
    throw new Error(
      "RubyAdapter.getSymbolDetails not yet implemented (Phase 3 Substep 3.3). " +
        "ADR-21 §LSP primitive mappings: hover-based detail extraction; " +
        "strip definition-links section, return signature.",
    );
  }

  async findReferences(_id: SymbolId): Promise<Reference[]> {
    throw new Error(
      "RubyAdapter.findReferences not yet implemented (Phase 3 Substep 3.4). " +
        "ADR-21 §LSP primitive mappings: references request + URL-encoding " +
        "dedup pass; declaration-site vs usage-site handling per Limitations §" +
        "Constant references.",
    );
  }

  async getDiagnostics(_filePath: string): Promise<Diagnostic[]> {
    throw new Error(
      "RubyAdapter.getDiagnostics not yet implemented (Phase 3 Substep 3.5). " +
        "ADR-21 §LSP primitive mappings: LSP 3.17 pull-model via " +
        "textDocument/diagnostic REQUEST (NOT publishDiagnostics notification). " +
        "Net-new substrate pattern not present in Pyright/gopls.",
    );
  }

  async getTypeInfo(_id: SymbolId): Promise<TypeInfo> {
    throw new Error(
      "RubyAdapter.getTypeInfo not yet implemented (Phase 3 Substep 3.6). " +
        "ADR-21 §getTypeInfo: declaration-parse fallback per Pyright " +
        "precedent (ADR-13); extends via class header, implements via " +
        "include/extend/prepend, usedByTypes via pass-1 inventory walk.",
    );
  }

  async getDocstring(_id: SymbolId): Promise<string | null> {
    throw new Error(
      "RubyAdapter.getDocstring not yet implemented (Phase 3 Substep 3.7). " +
        "ADR-21 §LSP primitive mappings: hover-with-comments per gopls " +
        "precedent (NOT Pyright); extract RDoc + rbs-derived content from " +
        "hover markdown response.",
    );
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
