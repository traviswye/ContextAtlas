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
import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

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

  async listSymbols(_filePath: string): Promise<AtlasSymbol[]> {
    throw new Error(
      "GoAdapter.listSymbols not yet implemented (lands in Step 9 Commit 4).",
    );
  }

  async getSymbolDetails(_id: SymbolId): Promise<AtlasSymbol | null> {
    throw new Error(
      "GoAdapter.getSymbolDetails not yet implemented (lands in Step 9 Commit 4).",
    );
  }

  async findReferences(_id: SymbolId): Promise<Reference[]> {
    throw new Error(
      "GoAdapter.findReferences not yet implemented (lands in Step 9 Commit 5).",
    );
  }

  async getDiagnostics(_filePath: string): Promise<Diagnostic[]> {
    throw new Error(
      "GoAdapter.getDiagnostics not yet implemented (lands in Step 9 Commit 4).",
    );
  }

  async getTypeInfo(_id: SymbolId): Promise<TypeInfo> {
    throw new Error(
      "GoAdapter.getTypeInfo not yet implemented (lands in Step 9 Commit 5).",
    );
  }

  // -------------------------------------------------------------------------
  // Helpers exposed for Commit 4/5 wiring (kept private; listed here so the
  // skeleton communicates intent). The actual implementations inline them.
  // -------------------------------------------------------------------------

  protected symbolId(relPath: string, name: string): SymbolId {
    return `sym:${LANG_CODES.go}:${relPath}:${name}`;
  }

  protected referenceId(relPath: string, line: number): ReferenceId {
    return `ref:${LANG_CODES.go}:${relPath}:${line}`;
  }

  protected toAbs(relPath: string): string {
    if (!this.rootPath) {
      throw new Error("GoAdapter not initialized; call initialize() first.");
    }
    return pathResolve(this.rootPath, relPath);
  }

  protected resolveFile(filePath: string): {
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

  /**
   * Mark an open file unused symbol; Commit 4 wires ensureOpen against
   * didOpen. Skeleton keeps the set initialized so Commit 4 doesn't
   * need to add class state.
   */
  protected hasOpen(absPath: string): boolean {
    return this.openFiles.has(normalizePath(absPath));
  }

  /** File exists + readable check used by Commit 4. */
  protected fileExists(absPath: string): boolean {
    return existsSync(absPath);
  }
}

// ---------------------------------------------------------------------------
// Free helpers
// ---------------------------------------------------------------------------

function resolveGoplsBin(explicit?: string): string {
  return explicit ?? process.env.CONTEXTATLAS_GOPLS_BIN ?? "gopls";
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
