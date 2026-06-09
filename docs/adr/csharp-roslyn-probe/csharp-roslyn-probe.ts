/**
 * csharp-roslyn-probe — Phase 0 spike probe for v1.1 .NET/C# adapter
 * cycle. Empirical capture against a community wrapper around
 * Microsoft.CodeAnalysis.LanguageServer (Roslyn LSP).
 *
 * Goal: surface the four spike checks empirically before locking the
 * Ruby-anchored 2-3 week estimate and the A1/A2 architectural fork:
 *
 *   1. Endpoint surface — documentSymbol, references, hover, definition,
 *      typeDefinition, diagnostic channel.
 *   2. Diagnostic delivery channel — push (publishDiagnostics) vs pull
 *      (textDocument/diagnostic).
 *   3. Symbol-kind taxonomy mapping for .NET kinds (class, interface,
 *      record, enum, static class, method, property, field).
 *   4. Project-restore / workspace-setup behavior — what custom
 *      notifications + log messages does Roslyn LSP send during init
 *      and project restore?
 *
 * Wrapper-as-vehicle framing (Travis 2026-06-08 adjudication): using a
 * community wrapper here does NOT commit us to shipping against it.
 * The wrapper is a lens to surface endpoint shape fastest; A1/A2 fork
 * (continue with wrapper vs direct integration handling custom protocol
 * ourselves) is adjudicated after empirical data is in hand.
 *
 * Maintenance-tail correction (carry into adjudication): SofusA's and
 * razzmatazz's wrappers are solo-maintainer projects, NOT parallel to
 * Shopify-backed ruby-lsp. A1 ship path is faster but the abandonment
 * risk is priced in. Don't treat "faster ship" as free.
 *
 * Default wrapper: SofusA/csharp-language-server (more recently
 * updated). Override via CONTEXTATLAS_CSHARP_LSP_BIN to test against
 * razzmatazz/csharp-language-server or to spawn Microsoft.CodeAnalysis.
 * LanguageServer directly for A2 substrate.
 *
 * Per v1.1 SCOPE Phase 0 ~1 day spike scope. Narrower than Ruby v0.9
 * Phase 1 probe substrate — six probes vs eight; no Rails-equivalent
 * add-on layer; no metaprogramming edge-case probes. Phase 1 expands
 * this probe substrate if the spike adjudicates Phase 1 entry.
 */

import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  extname,
  join as pathJoin,
  resolve as pathResolve,
} from "node:path";

import { LspClient } from "../../../src/adapters/lsp-client.js";
import { toFileUri, normalizePath } from "../../../src/utils/paths.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIXTURE = process.env.CONTEXTATLAS_PROBE_ROOT
  ? pathResolve(process.env.CONTEXTATLAS_PROBE_ROOT)
  : pathResolve("test/fixtures/csharp");

const OUTPUT = pathResolve(
  "docs/adr/csharp-roslyn-probe/findings-baseline.md",
);

/**
 * Wrapper binary. Defaults to razzmatazz's csharp-ls (dotnet tool global
 * install via NuGet; 1.15M+ downloads as of 2026-06; mature wrapper
 * around Microsoft.CodeAnalysis.LanguageServer for non-VSCode clients).
 *
 * Override via CONTEXTATLAS_CSHARP_LSP_BIN to test alternative vehicles:
 * - SofusA/csharp-language-server (Rust-based; install via cargo or
 *   pre-built binary; alternative wrapper for Helix/Neovim cohort)
 * - Microsoft.CodeAnalysis.LanguageServer directly (A2 path; requires
 *   custom-protocol handling in lsp-client.ts)
 *
 * Windows note: dotnet tools install as real .exe binaries at
 * %USERPROFILE%\.dotnet\tools\, NOT .bat shims. Direct spawn works
 * without cmd.exe wrap (cleaner than Ruby's bundle.bat path).
 */
const CSHARP_LSP_BIN =
  process.env.CONTEXTATLAS_CSHARP_LSP_BIN ?? "csharp-ls";

// FINDING (for ADR-22 + doctor): on Windows, dotnet tools install to
// %USERPROFILE%\.dotnet\tools\ which is added to PowerShell PATH at
// SDK install time but NOT to Bash/Git-Bash PATH. When the LSP client
// spawns csharp-ls from a Node process launched via Bash, spawn fails
// with ENOENT. Parallel to:
//   - ruby-lsp's RUBY_BIN_DIRS workaround (ADR-21 Windows install)
//   - gopls's "Go binary must be on PATH" finding (ADR-14)
// Probe-specific workaround: prepend %USERPROFILE%\.dotnet\tools to
// PATH so spawn resolves csharp-ls.exe. Adapter implementation will
// need symmetric handling — likely doctor preflight check (.dotnet/
// tools on PATH; csharp-ls findable; dotnet --version surfaces 10.x)
// + clear remediation. Surfaced at Phase 0 first probe attempt
// (2026-06-08).
const DOTNET_TOOL_DIRS = [
  process.env.USERPROFILE
    ? `${process.env.USERPROFILE}\\.dotnet\\tools`
    : null,
  // Linux/macOS dotnet tools default
  process.env.HOME ? `${process.env.HOME}/.dotnet/tools` : null,
].filter((d): d is string => d !== null);

if (DOTNET_TOOL_DIRS.length > 0) {
  const sep = process.platform === "win32" ? ";" : ":";
  process.env.PATH = [...DOTNET_TOOL_DIRS, process.env.PATH ?? ""]
    .filter(Boolean)
    .join(sep);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Json = unknown;

function walkCsRecursive(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    if (
      name.startsWith(".") ||
      name === "bin" ||
      name === "obj" ||
      name === "node_modules"
    ) {
      continue;
    }
    const abs = pathJoin(root, name);
    if (statSync(abs).isDirectory()) {
      out.push(...walkCsRecursive(abs));
      continue;
    }
    if (extname(name) === ".cs") out.push(abs);
  }
  return out.sort();
}

function heading(out: string[], title: string): void {
  out.push("");
  out.push(`## ${title}`);
  out.push("");
}

function subheading(out: string[], title: string): void {
  out.push("");
  out.push(`### ${title}`);
  out.push("");
}

function block(out: string[], lang: string, text: string): void {
  out.push("```" + lang);
  out.push(text);
  out.push("```");
}

function json(value: Json): string {
  return JSON.stringify(value, null, 2);
}

async function withTimeout<T>(
  label: string,
  timeoutMs: number,
  fn: () => Promise<T>,
): Promise<T | { error: string }> {
  try {
    const timed = new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    return await Promise.race([fn(), timed]);
  } catch (err) {
    return { error: String(err) };
  }
}

interface LspPosition {
  line: number;
  character: number;
}

function locate(filePath: string, needle: string): LspPosition | null {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i]!.indexOf(needle);
    if (idx >= 0) return { line: i, character: idx };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Probe client + boot
// ---------------------------------------------------------------------------

interface ProbeClient {
  client: LspClient;
  openedUris: string[];
  diagnosticsByUri: Map<string, unknown[]>;
  progressEvents: Array<{
    token: number | string | undefined;
    kind: string | undefined;
    title?: string;
    message?: string;
    receivedAtMs: number;
  }>;
  serverMessages: Array<{
    channel: "log" | "show";
    type: number | undefined;
    message: string;
  }>;
  customNotifications: Array<{
    method: string;
    paramsSnapshot: string;
    receivedAtMs: number;
  }>;
  root: string;
}

/**
 * Boot the wrapper-as-vehicle Roslyn LSP. Captures every notification
 * channel of interest for the four spike checks.
 */
async function bootCsharpLsp(
  name: string,
  root: string,
): Promise<{ probe: ProbeClient; initResult: unknown }> {
  const client = new LspClient(name);
  const diagnosticsByUri = new Map<string, unknown[]>();
  const progressEvents: ProbeClient["progressEvents"] = [];
  const serverMessages: ProbeClient["serverMessages"] = [];
  const customNotifications: ProbeClient["customNotifications"] = [];

  // textDocument/publishDiagnostics — push-model diagnostic channel.
  // Captures whether Roslyn LSP uses this channel (vs pull-model
  // textDocument/diagnostic) — spike check 2.
  client.onNotification("textDocument/publishDiagnostics", (params) => {
    const p = params as { uri: string; diagnostics: unknown[] } | null;
    if (!p) return;
    diagnosticsByUri.set(normalizePath(p.uri), p.diagnostics ?? []);
  });

  // $/progress — cold-start readiness signal.
  client.onNotification("$/progress", (params) => {
    const p = params as {
      token?: number | string;
      value?: { kind?: string; title?: string; message?: string };
    } | null;
    if (!p?.value) return;
    progressEvents.push({
      token: p.token,
      kind: p.value.kind,
      title: p.value.title,
      message: p.value.message,
      receivedAtMs: Date.now(),
    });
  });

  // window/logMessage + window/showMessage — Roslyn surfaces project
  // restore status + workspace setup messages here.
  client.onNotification("window/logMessage", (p) => {
    const m = p as { type?: number; message?: string } | null;
    if (!m?.message) return;
    serverMessages.push({ channel: "log", type: m.type, message: m.message });
    if (m.type === 1 || m.type === 2) {
      console.error(`[csharp-lsp log:${m.type}] ${m.message}`);
    }
  });
  client.onNotification("window/showMessage", (p) => {
    const m = p as { type?: number; message?: string } | null;
    if (!m?.message) return;
    serverMessages.push({ channel: "show", type: m.type, message: m.message });
    console.error(`[csharp-lsp show:${m.type}] ${m.message}`);
  });

  // Roslyn / wrapper-specific custom notifications. Captures
  // project-restore signaling + any other non-LSP-spec messages — spike
  // check 4. Names below are based on Roslyn LSP research; actual names
  // surface empirically at probe run-time.
  const customNotificationMethods = [
    "workspace/projectInitializationComplete",
    "workspace/_roslyn_projectHasUnresolvedDependencies",
    "workspace/_roslyn_projectNeedsRestore",
    "solution/open",
    "project/open",
    "roslyn/projectInitializationComplete",
    "roslyn/projectHasUnresolvedDependencies",
  ];
  for (const method of customNotificationMethods) {
    client.onNotification(method, (params) => {
      customNotifications.push({
        method,
        paramsSnapshot: JSON.stringify(params),
        receivedAtMs: Date.now(),
      });
      console.error(`[csharp-lsp custom-notif] ${method}`);
    });
  }

  // Server-initiated request stubs.
  for (const method of [
    "window/workDoneProgress/create",
    "client/registerCapability",
    "client/unregisterCapability",
    "window/showMessageRequest",
  ]) {
    client.onRequest(method, () => null);
  }

  // workspace/configuration — gopls-strict shape per LSP spec.
  client.onRequest("workspace/configuration", (params) => {
    const items = (params as { items?: unknown[] } | null)?.items ?? [];
    return items.map(() => ({}));
  });

  // Spawn the wrapper. Direct spawn — no cmd.exe wrap needed on Windows
  // because dotnet tools install as real .exe (not .bat shims).
  client.start(CSHARP_LSP_BIN, [], root);

  const initResult = await withTimeout("initialize", 120_000, () =>
    client.request("initialize", {
      processId: process.pid,
      rootUri: toFileUri(root),
      workspaceFolders: [{ uri: toFileUri(root), name }],
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
          diagnostic: { dynamicRegistration: false },
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
    }),
  );

  client.notify("initialized", {});
  return {
    probe: {
      client,
      openedUris: [],
      diagnosticsByUri,
      progressEvents,
      serverMessages,
      customNotifications,
      root,
    },
    initResult,
  };
}

async function openAll(probe: ProbeClient, files: string[]): Promise<void> {
  for (const p of files) {
    const uri = toFileUri(p);
    probe.openedUris.push(uri);
    probe.client.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "csharp",
        version: 1,
        text: readFileSync(p, "utf8"),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Main probe flow
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const out: string[] = [];
  out.push("# csharp-roslyn-probe findings (Phase 0 spike)");
  out.push("");
  out.push(
    "Empirical capture against community wrapper around Microsoft.",
  );
  out.push(
    "CodeAnalysis.LanguageServer (Roslyn LSP). Produced by",
  );
  out.push(
    "`docs/adr/csharp-roslyn-probe/csharp-roslyn-probe.ts` on " +
      new Date().toISOString() +
      ".",
  );
  out.push("");
  out.push(
    "**Spike vehicle:** `" + CSHARP_LSP_BIN + "` (wrapper around Roslyn",
  );
  out.push(
    "LSP). Using a wrapper as probe vehicle does NOT commit ContextAtlas",
  );
  out.push(
    "to shipping against it — vehicle is a lens to surface endpoint",
  );
  out.push("shape fastest; A1/A2 fork adjudicated post-empirical.");
  out.push("");
  out.push("**Four spike checks driven by this probe:**");
  out.push("");
  out.push(
    "1. Endpoint surface — documentSymbol / references / hover /",
  );
  out.push("   definition / typeDefinition / diagnostic.");
  out.push(
    "2. Diagnostic delivery channel — push (publishDiagnostics) vs",
  );
  out.push("   pull (textDocument/diagnostic).");
  out.push("3. Symbol-kind taxonomy mapping across C# kinds.");
  out.push(
    "4. Project-restore / workspace-setup behavior — custom",
  );
  out.push("   notifications + log messages during init + restore.");
  out.push("");

  const csFiles = walkCsRecursive(FIXTURE).map((p) => normalizePath(p));

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  out.push("## Boot — fixture");
  out.push("");
  out.push(`- Spawn: \`${CSHARP_LSP_BIN}\``);
  out.push(`- Fixture: \`${FIXTURE}\``);
  out.push(`- .cs files: ${csFiles.length}`);
  csFiles.forEach((p) => out.push(`  - \`${p.split("/").slice(-2).join("/")}\``));

  const { probe, initResult } = await bootCsharpLsp(
    "csharp-roslyn-probe",
    FIXTURE,
  );
  try {
    subheading(out, "initialize response — capabilities");
    out.push(
      "_Load-bearing for ADR-22: the `capabilities` field below is the",
    );
    out.push(
      "authoritative answer for which LSP methods Roslyn (via the wrapper)_",
    );
    out.push(
      "_advertises support for. Spike check 1 — endpoint surface verification._",
    );
    out.push("");
    const caps = (initResult as { capabilities?: unknown })?.capabilities;
    block(out, "json", json(caps ?? initResult));

    subheading(out, "serverInfo");
    const info = (initResult as { serverInfo?: unknown })?.serverInfo;
    block(out, "json", json(info ?? "not returned"));

    // Let Roslyn settle before flooding didOpens. Roslyn LSP needs
    // project-restore time on cold-start — substantively longer than
    // ruby-lsp's <1s settle. Spike check 4 — workspace-setup behavior.
    await new Promise((r) => setTimeout(r, 3_000));

    await openAll(probe, csFiles);

    // Extended wait for project restore + workspace analysis. Roslyn's
    // cold-start is workspace-aware (gopls-style); needs more time than
    // ruby-lsp baseline.
    await new Promise((r) => setTimeout(r, 15_000));

    // -------------------------------------------------------------------
    // Spike check 4 — Project-restore / workspace-setup behavior
    // -------------------------------------------------------------------
    heading(out, "Spike check 4 — Project-restore + workspace-setup behavior");
    out.push("Captures every $/progress event, custom notification, and");
    out.push(
      "server message received during init + warmup. Drives ADR-22",
    );
    out.push("§readiness-pattern decision per ADR-18.");
    out.push("");

    subheading(out, "$/progress events");
    block(out, "json", json(probe.progressEvents));

    subheading(out, "Custom (non-LSP-spec) notifications");
    out.push(
      "Roslyn LSP sends custom notifications for project-restore",
    );
    out.push(
      "signaling. The wrapper may absorb some; whatever surfaces here",
    );
    out.push("is what ContextAtlas's adapter (or LSP client) would need");
    out.push("to handle at A2 path. A1 path implies wrapper handles them.");
    out.push("");
    block(out, "json", json(probe.customNotifications));

    subheading(out, "Server messages (log + show)");
    out.push(
      "Roslyn typically surfaces project restore status, workspace",
    );
    out.push(
      "load errors, and analyzer warnings via window/logMessage. ",
    );
    out.push(
      "Substantively load-bearing for ADR-22 readiness-pattern.",
    );
    out.push("");
    block(out, "json", json(probe.serverMessages));

    // ===================================================================
    // Spike check 1 — Endpoint surface
    // ===================================================================

    // -------------------------------------------------------------------
    // Probe #1 — documentSymbol (also drives spike check 3 symbol-kind)
    // -------------------------------------------------------------------
    heading(out, "Probe #1 — documentSymbol (drives spike checks 1 + 3)");
    out.push("Full documentSymbol tree for fixture files. Symbol-kind");
    out.push("values in the response drive spike check 3 — verify that");
    out.push("Roslyn returns clean LSP standard kinds for C# constructs:");
    out.push("class (5), interface (11), method (6), property (7), field");
    out.push("(8), enum (10), enum member (22), constructor (9), namespace");
    out.push("(3). Open question: which kind is used for record types?");
    out.push("LSP spec has no dedicated SymbolKind for records.");
    out.push("");

    for (const filePath of csFiles) {
      const rel = filePath.replace(normalizePath(FIXTURE) + "/", "");
      const uri = toFileUri(filePath);
      subheading(out, rel);
      const syms = await withTimeout("documentSymbol", 30_000, () =>
        probe.client.request("textDocument/documentSymbol", {
          textDocument: { uri },
        }),
      );
      block(out, "json", json(syms));
    }

    // -------------------------------------------------------------------
    // Probe #2 — references (cross-file)
    // -------------------------------------------------------------------
    heading(out, "Probe #2 — references (drives spike check 1)");
    out.push("Probes findReferences for cross-file resolution. Roslyn");
    out.push("expected to surface clean cross-file references (parallel");
    out.push("to gopls/pyright; substantively cleaner than ruby-lsp");
    out.push("pre-Rubydex baseline).");
    out.push("");

    const refTargets = [
      {
        file: "Models/User.cs",
        needle: "public record User",
        identifier: "User",
        label: "User record (class declaration)",
      },
      {
        file: "Models/User.cs",
        needle: "PremiumTierLimit",
        identifier: "PremiumTierLimit",
        label: "User.PremiumTierLimit (const field)",
      },
      {
        file: "Models/User.cs",
        needle: "public string DisplayName",
        identifier: "DisplayName",
        label: "User.DisplayName (property)",
      },
      {
        file: "Services/IUserService.cs",
        needle: "interface IUserService",
        identifier: "IUserService",
        label: "IUserService (interface)",
      },
      {
        file: "Lib/Analytics.cs",
        needle: "public static void Track",
        identifier: "Track",
        label: "Analytics.Track (static method)",
      },
    ];

    for (const t of refTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) {
        subheading(out, t.label);
        out.push(`_needle not found: \`${t.needle}\` in \`${t.file}\`_`);
        continue;
      }
      const col = pos.character + t.needle.indexOf(t.identifier);
      const uri = toFileUri(filePath);
      const refs = await withTimeout("references", 15_000, () =>
        probe.client.request("textDocument/references", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
          context: { includeDeclaration: false },
        }),
      );
      subheading(out, t.label);
      out.push(
        `position: \`${t.file}\` line ${pos.line + 1}, char ${col}`,
      );
      out.push("");
      block(out, "json", json(refs));
    }

    // -------------------------------------------------------------------
    // Probe #3 — hover (XML doc comments + signature)
    // -------------------------------------------------------------------
    heading(out, "Probe #3 — hover (drives spike check 1)");
    out.push("Probes hover for signature + docstring (XML doc comment)");
    out.push("surfacing. Drives ADR-22 §getDocstring decision:");
    out.push("");
    out.push("- ADR-13 (Pyright): docstrings omitted from hover");
    out.push("- ADR-14 (gopls): docstrings included");
    out.push("- ADR-21 (ruby-lsp): docstrings included");
    out.push("");
    out.push("Fixture has XML doc comments (`/// <summary>`) on most");
    out.push("symbols; probe captures whether Roslyn surfaces them.");
    out.push("");

    const hoverTargets = [
      {
        file: "Models/User.cs",
        needle: "public record User",
        identifier: "User",
        label: "User (record declaration)",
      },
      {
        file: "Models/User.cs",
        needle: "PremiumTierLimit",
        identifier: "PremiumTierLimit",
        label: "PremiumTierLimit (const field)",
      },
      {
        file: "Models/User.cs",
        needle: "public string DisplayName",
        identifier: "DisplayName",
        label: "DisplayName (property)",
      },
      {
        file: "Models/User.cs",
        needle: "public async Task SendWelcomeEmailAsync",
        identifier: "SendWelcomeEmailAsync",
        label: "SendWelcomeEmailAsync (async instance method)",
      },
      {
        file: "Models/User.cs",
        needle: "public static User? FindByEmail",
        identifier: "FindByEmail",
        label: "FindByEmail (static method)",
      },
      {
        file: "Services/IUserService.cs",
        needle: "interface IUserService",
        identifier: "IUserService",
        label: "IUserService (interface declaration)",
      },
      {
        file: "Services/UserService.cs",
        needle: "class UserService",
        identifier: "UserService",
        label: "UserService (class declaration; inheritdoc context)",
      },
      {
        file: "Lib/Analytics.cs",
        needle: "public static class Analytics",
        identifier: "Analytics",
        label: "Analytics (static class)",
      },
    ];

    for (const t of hoverTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) {
        subheading(out, t.label);
        out.push(`_needle not found: \`${t.needle}\` in \`${t.file}\`_`);
        continue;
      }
      const col = pos.character + t.needle.indexOf(t.identifier);
      const uri = toFileUri(filePath);
      const hover = await withTimeout("hover", 10_000, () =>
        probe.client.request("textDocument/hover", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
        }),
      );
      subheading(out, t.label);
      out.push(
        `position: \`${t.file}\` line ${pos.line + 1}, char ${col}`,
      );
      out.push("");
      block(out, "json", json(hover));
    }

    // -------------------------------------------------------------------
    // Probe #4 — definition (cross-file resolution)
    // -------------------------------------------------------------------
    heading(out, "Probe #4 — definition (drives spike check 1)");
    out.push("Cross-file definition probes from Consumer.cs reference");
    out.push("sites to their declarations. Expected clean resolution");
    out.push("(Roslyn is workspace-aware; substantively parallel to");
    out.push("gopls's clean cross-file resolution).");
    out.push("");

    const defTargets = [
      {
        file: "Consumer.cs",
        needle: "User? user = await",
        identifier: "User",
        label: "User type reference → Models/User.cs declaration",
      },
      {
        file: "Consumer.cs",
        needle: "_service.GetByIdAsync",
        identifier: "GetByIdAsync",
        label: "GetByIdAsync → IUserService declaration",
      },
      {
        file: "Consumer.cs",
        needle: "Analytics.Track",
        identifier: "Track",
        label: "Analytics.Track → Lib/Analytics.cs declaration",
      },
      {
        file: "Consumer.cs",
        needle: "User.FindByEmail",
        identifier: "FindByEmail",
        label: "User.FindByEmail (static) → Models/User.cs declaration",
      },
    ];

    for (const t of defTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) {
        subheading(out, t.label);
        out.push(`_needle not found: \`${t.needle}\` in \`${t.file}\`_`);
        continue;
      }
      const col = pos.character + t.needle.indexOf(t.identifier);
      const uri = toFileUri(filePath);
      const defn = await withTimeout("definition", 10_000, () =>
        probe.client.request("textDocument/definition", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
        }),
      );
      subheading(out, t.label);
      out.push(
        `position: \`${t.file}\` line ${pos.line + 1}, char ${col}`,
      );
      out.push("");
      block(out, "json", json(defn));
    }

    // -------------------------------------------------------------------
    // Probe #5 — typeDefinition
    // -------------------------------------------------------------------
    heading(out, "Probe #5 — typeDefinition (drives spike check 1)");
    out.push("Probes typeDefinition on typed variables in Consumer.cs.");
    out.push("C# is strongly typed (unlike Ruby's untyped receivers), so");
    out.push("typeDefinition should surface cleanly. Drives ADR-22");
    out.push("§getTypeInfo decision — likely cleaner than Pyright's");
    out.push("Protocol-vs-ABC fallback or Ruby's local-parseability");
    out.push("workaround.");
    out.push("");

    const typeDefTargets = [
      {
        file: "Consumer.cs",
        needle: "User? user = await",
        identifier: "user",
        label: "typeDefinition on `user` local var (User?)",
      },
      {
        file: "Consumer.cs",
        needle: "UserRole role = user.Role",
        identifier: "role",
        label: "typeDefinition on `role` local var (UserRole enum)",
      },
      {
        file: "Consumer.cs",
        needle: "private readonly IUserService _service",
        identifier: "_service",
        label: "typeDefinition on `_service` field (IUserService)",
      },
    ];

    for (const t of typeDefTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) {
        subheading(out, t.label);
        out.push(`_needle not found_`);
        continue;
      }
      const col = pos.character + t.needle.indexOf(t.identifier);
      const uri = toFileUri(filePath);
      const td = await withTimeout("typeDefinition", 10_000, () =>
        probe.client.request("textDocument/typeDefinition", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
        }),
      );
      subheading(out, t.label);
      out.push(
        `position: \`${t.file}\` line ${pos.line + 1}, char ${col}`,
      );
      out.push("");
      block(out, "json", json(td));
    }

    // -------------------------------------------------------------------
    // Probe #6 — diagnostic delivery channel (spike check 2)
    // -------------------------------------------------------------------
    heading(out, "Probe #6 — diagnostic delivery channel (spike check 2)");
    out.push("Probes BOTH push-model (textDocument/publishDiagnostics");
    out.push("notification, captured during init) AND pull-model");
    out.push("(textDocument/diagnostic LSP 3.17 request) to determine");
    out.push("Roslyn's diagnostic channel. Ruby-lsp uses pull-model");
    out.push("(net-new substrate at ADR-21); Pyright/gopls use push-model");
    out.push("(ADR-13/ADR-14). Roslyn empirical channel surfaces here.");
    out.push("");

    subheading(out, "Push-model: diagnostics received during init");
    out.push("Diagnostic counts per opened URI (via publishDiagnostics):");
    out.push("");
    for (const [uri, diags] of probe.diagnosticsByUri) {
      const fileName = uri.split("/").slice(-2).join("/");
      out.push(
        `- \`${fileName}\`: ${(diags as unknown[]).length} diagnostic(s)`,
      );
    }
    out.push("");

    const brokenUri = probe.openedUris.find((u) => u.endsWith("Broken.cs"));
    subheading(out, "Broken.cs diagnostics (deliberate parse error)");
    if (brokenUri) {
      const brokenDiags =
        probe.diagnosticsByUri.get(normalizePath(brokenUri)) ?? [];
      out.push(
        `Push-model count: ${(brokenDiags as unknown[]).length}`,
      );
      out.push("");
      block(out, "json", json(brokenDiags));
    } else {
      out.push("_Broken.cs URI not found in openedUris_");
    }

    subheading(out, "Pull-model: textDocument/diagnostic request");
    out.push("LSP 3.17 pull-model request. Captures whether Roslyn");
    out.push("supports the pull endpoint AND whether it returns the");
    out.push("same diagnostics as the push channel.");
    out.push("");
    if (brokenUri) {
      const pullDiags = await withTimeout("diagnostic-pull", 10_000, () =>
        probe.client.request("textDocument/diagnostic", {
          textDocument: { uri: brokenUri },
        }),
      );
      block(out, "json", json(pullDiags));
    } else {
      out.push("_Broken.cs URI not available for pull-model probe_");
    }
  } finally {
    await probe.client.stop();
  }

  // -------------------------------------------------------------------------
  // Phase 0 spike adjudication placeholder
  // -------------------------------------------------------------------------
  out.push("");
  out.push("---");
  out.push("");
  out.push("## Phase 0 spike adjudication (TODO — human review)");
  out.push("");
  out.push(
    "_To be authored after probe completes empirically. Four spike",
  );
  out.push("checks against this empirical capture, plus A1/A2 fork");
  out.push("adjudication with wrapper-maintenance-tail factored. See");
  out.push("[README.md](README.md) §Post-spike adjudication substrate._");

  writeFileSync(OUTPUT, out.join("\n") + "\n", "utf8");
  console.log(`Probe complete. Findings written to ${OUTPUT}`);
}

main().catch((err) => {
  console.error("PROBE FAILED:", err);
  process.exit(1);
});
