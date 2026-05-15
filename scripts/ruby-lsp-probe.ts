/**
 * ruby-lsp + ruby-lsp-rails LSP probe — throwaway empirical behavior
 * capture for ADR-21 (Ruby adapter).
 *
 * Goal: exercise ruby-lsp 0.26.x + ruby-lsp-rails 0.4.8 (the
 * stable-compatible pair per bundler resolution at May 2026; see
 * "Version pinning" below) against a minimal Rails-shaped fixture so
 * ADR-21's LSP primitive mappings + Limitations sections are grounded
 * in observed behavior rather than documentation guesses.
 *
 * Version pinning (Option D adjudication; cycle-observation 24
 * fourth surface): per actual bundler resolution, ruby-lsp-rails
 * 0.4.8 depends on ruby-lsp `>= 0.26.0, < 0.27.0`. ruby-lsp 0.27+
 * (Rubydex-backed indexer) and ruby-lsp-rails 0.5.0+ exist only as
 * pre-release. v1.0 ships on the stable 0.26.x/0.4.8 pair; v1.1
 * candidate tracks upgrade to 0.27+/0.5+ once both have stable
 * releases.
 *
 * Implication for probe findings: 0.26.x is still pre-Rubydex
 * (Rubydex landed in 0.27+). Rubydex's expanded methods/instance-
 * var references coverage is NOT present at 0.26.x. Probe-findings
 * reflect pre-Rubydex coverage at the most recent pre-Rubydex
 * stable patch, which ADR-21 Limitations must document honestly.
 *
 * Per v0.9 Stream A plan:
 *   - Substep 1 (this file, scaffold): boot + handler stubs +
 *     initialize handshake + ordered probe-section placeholders.
 *   - Substep 2: author test/fixtures/ruby-probe/ Rails fixture.
 *   - Substep 3: implement the ordered capability probes (TODO
 *     markers below).
 *   - Substep 4: human-author docs/adr/ruby-lsp-probe-findings.md
 *     from probe output.
 *   - Substep 5: compose Travis's real-Rails-repo dogfood findings.
 *
 * Reuses src/adapters/lsp-client.ts unchanged (Pyright/gopls
 * precedent). If the probe can't drive ruby-lsp with that client,
 * that's itself a finding for ADR-21.
 *
 * Bundler/spawn note (Windows): bundle is `bundle.bat` and gem-
 * installed ruby-lsp is `ruby-lsp.bat`. Both are .bat shims; Node's
 * spawn refuses direct execution without shell:true per
 * CVE-2024-27980 (security fix landed in Node 18.20.2+/20.12.2+).
 * Probe-local fix per Substep 3 b-cmd adjudication: wrap in
 * `cmd.exe /c` so spawn sees an .exe directly. Adapter-
 * implementation will need symmetric Windows handling at adapter
 * phase — that's a separate adjudication informed by this probe-
 * phase substrate, not pre-locked here. Env vars
 * CONTEXTATLAS_BUNDLE_BIN and CONTEXTATLAS_RUBY_LSP_BIN let callers
 * override if their install uses non-standard names or absolute
 * paths; both work on the cmd.exe wrap path on Windows.
 *
 * Discard after ADR-21 + RubyAdapter land. The findings file the
 * probe produces is what carries forward.
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

import { LspClient } from "../src/adapters/lsp-client.js";
import { toFileUri, normalizePath } from "../src/utils/paths.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIXTURE = pathResolve("test/fixtures/ruby-probe");
const OUTPUT = pathResolve("docs/adr/ruby-lsp-probe-findings.md");

/**
 * Bundler command. ruby-lsp is invoked via `bundle exec ruby-lsp` per
 * the Rails-detected install pattern (v0.9 Stream A adjudication #3).
 * Windows defaults to `bundle.bat` because Node's spawn doesn't
 * auto-resolve .bat shims without shell:true.
 */
const BUNDLE_BIN =
  process.env.CONTEXTATLAS_BUNDLE_BIN ??
  (process.platform === "win32" ? "bundle.bat" : "bundle");

/**
 * Optional override to spawn ruby-lsp directly (gem-install pattern)
 * instead of via `bundle exec`. When set, BUNDLE_BIN is ignored.
 */
const RUBY_LSP_DIRECT =
  process.env.CONTEXTATLAS_RUBY_LSP_BIN ?? null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Json = unknown;

/** Recursively collect .rb files under a root, skipping vendor + hidden dirs. */
function walkRubyRecursive(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    if (name.startsWith(".") || name === "vendor" || name === "node_modules") {
      continue;
    }
    const abs = pathJoin(root, name);
    if (statSync(abs).isDirectory()) {
      out.push(...walkRubyRecursive(abs));
      continue;
    }
    if (extname(name) === ".rb") out.push(abs);
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

/**
 * Find the position (0-indexed line + character) of an identifier
 * inside a source file. Picks the first occurrence; good enough for a
 * probe. Substep 3 capability probes use this to anchor hover /
 * references / definition queries.
 */
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
  root: string;
}

/**
 * Boot ruby-lsp against a fixture root.
 *
 * Returns the initialized probe client + the raw `initialize` result
 * (whose `capabilities` field is itself an ADR-21 finding — it tells
 * us which LSP methods ruby-lsp advertises support for, which is the
 * authoritative answer for the implementation/typeDefinition status
 * question my fresh-read flagged from the design-and-roadmap doc).
 *
 * Implementation note: ruby-lsp can be spawned in two patterns:
 *   - `bundle exec ruby-lsp` (Rails-detected, locked Gemfile)
 *   - `ruby-lsp` (gem-install global)
 *
 * The probe defaults to the bundler pattern (v0.9 Stream A
 * adjudication #3); CONTEXTATLAS_RUBY_LSP_BIN overrides to spawn the
 * global gem binary directly.
 */
async function bootRubyLsp(
  name: string,
  root: string,
): Promise<{ probe: ProbeClient; initResult: unknown }> {
  const client = new LspClient(name);
  const diagnosticsByUri = new Map<string, unknown[]>();
  const progressEvents: ProbeClient["progressEvents"] = [];
  const serverMessages: ProbeClient["serverMessages"] = [];

  // textDocument/publishDiagnostics — captured by URI. ADR-18 readiness
  // pattern hinges on this notification path.
  client.onNotification("textDocument/publishDiagnostics", (params) => {
    const p = params as { uri: string; diagnostics: unknown[] } | null;
    if (!p) return;
    diagnosticsByUri.set(normalizePath(p.uri), p.diagnostics ?? []);
  });

  // $/progress — for cold-start readiness signal capture. Open
  // empirical question (Substep 3 finding): does ruby-lsp emit
  // BEGIN/END frames for workspace setup (gopls pattern, ADR-14) or
  // fall through to per-call ceiling (Pyright pattern, ADR-13)?
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

  // window/logMessage + window/showMessage — capture server-side log
  // and notice traffic for diagnostic value. ruby-lsp may surface
  // setup warnings (missing add-on, Rails detection failure, etc.)
  // via these channels.
  client.onNotification("window/logMessage", (p) => {
    const m = p as { type?: number; message?: string } | null;
    if (!m?.message) return;
    serverMessages.push({ channel: "log", type: m.type, message: m.message });
    if (m.type === 1 || m.type === 2) {
      console.error(`[ruby-lsp log:${m.type}] ${m.message}`);
    }
  });
  client.onNotification("window/showMessage", (p) => {
    const m = p as { type?: number; message?: string } | null;
    if (!m?.message) return;
    serverMessages.push({ channel: "show", type: m.type, message: m.message });
    console.error(`[ruby-lsp show:${m.type}] ${m.message}`);
  });

  // Server-initiated request stubs. Same set as gopls + pyright; if
  // ruby-lsp doesn't emit any of these the stubs are dead weight, but
  // missing a needed one would hang the init handshake.
  for (const method of [
    "window/workDoneProgress/create",
    "client/registerCapability",
    "client/unregisterCapability",
    "window/showMessageRequest",
  ]) {
    client.onRequest(method, () => null);
  }

  // workspace/configuration — gopls requires a length-matched array
  // (ADR-14 §"workspace/configuration handler"); pyright tolerates
  // null. Default to gopls-strict shape per LSP spec; if probe
  // surfaces that ruby-lsp tolerates null, that's an ADR-21 finding
  // (and the adapter can simplify).
  client.onRequest("workspace/configuration", (params) => {
    const items = (params as { items?: unknown[] } | null)?.items ?? [];
    return items.map(() => ({}));
  });

  // Spawn. Two patterns supported, switchable via env vars set above:
  //   - bundler (default): `bundle exec ruby-lsp` (Rails-detected
  //     pattern). Override binary via CONTEXTATLAS_BUNDLE_BIN — e.g.
  //     absolute path on Windows where bundle is `bundle.bat`.
  //   - direct: spawn ruby-lsp binary itself (gem-install pattern).
  //     Enable by setting CONTEXTATLAS_RUBY_LSP_BIN to the absolute
  //     binary path; bypasses BUNDLE_BIN entirely.
  //
  // Windows .bat-spawn handling (CVE-2024-27980): both bundle.bat
  // and ruby-lsp.bat are shims; Node refuses direct spawn. Wrap in
  // cmd.exe /c so spawn sees the .exe directly. Symmetric across
  // both spawn paths. Probe-local fix per Substep 3 b-cmd
  // adjudication; adapter phase will revisit with full substrate.
  const isWindows = process.platform === "win32";
  if (RUBY_LSP_DIRECT) {
    if (isWindows) {
      client.start("cmd.exe", ["/c", RUBY_LSP_DIRECT], root);
    } else {
      client.start(RUBY_LSP_DIRECT, [], root);
    }
  } else {
    if (isWindows) {
      client.start(
        "cmd.exe",
        ["/c", BUNDLE_BIN, "exec", "ruby-lsp"],
        root,
      );
    } else {
      client.start(BUNDLE_BIN, ["exec", "ruby-lsp"], root);
    }
  }

  const initResult = await withTimeout("initialize", 60_000, () =>
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
      root,
    },
    initResult,
  };
}

/** Open every .rb file in `files` via textDocument/didOpen. */
async function openAll(probe: ProbeClient, files: string[]): Promise<void> {
  for (const p of files) {
    const uri = toFileUri(p);
    probe.openedUris.push(uri);
    probe.client.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "ruby",
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
  out.push("# ruby-lsp probe findings");
  out.push("");
  out.push(
    "Raw behavior capture from ruby-lsp 0.26.x + ruby-lsp-rails 0.4.8",
  );
  out.push(
    "(stable-compatible pair per bundler resolution at May 2026)",
  );
  out.push("against a minimal Rails 8 fixture. Produced by");
  out.push("`scripts/ruby-lsp-probe.ts` on " + new Date().toISOString() + ".");
  out.push("");
  out.push(
    "Purpose: ground ADR-21's LSP primitive mappings and Limitations",
  );
  out.push(
    "sections in observed behavior — empirical-probe-substrate-before-",
  );
  out.push("ADR-authoring discipline per ADR-13 (Pyright) + ADR-14 (gopls)");
  out.push("precedent.");
  out.push("");
  out.push("**Version targets.** Ruby 3.3, Rails 8.0, ruby-lsp 0.26.x");
  out.push("(latest 0.26.9), ruby-lsp-rails 0.4.8 (auto-loaded when");
  out.push("Rails detected).");
  out.push("");
  out.push(
    "**Version pinning rationale** (Option D adjudication; cycle-",
  );
  out.push(
    "observation 24 fourth surface): per actual bundler resolution,",
  );
  out.push("ruby-lsp-rails 0.4.8 depends on ruby-lsp `>= 0.26.0, < 0.27.0`.");
  out.push("ruby-lsp 0.27+ (Rubydex-backed indexer; landed in pre-release");
  out.push("per Rails-at-Scale 2026-05-12) is NOT in scope at v1.0; v1.1");
  out.push("candidate tracks the upgrade. 0.26.x is still pre-Rubydex,");
  out.push("so probe-findings on findReferences reflect pre-Rubydex");
  out.push("coverage shape at the most recent pre-Rubydex stable patch.");
  out.push("");

  const rubyFiles = walkRubyRecursive(FIXTURE).map((p) => normalizePath(p));

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  out.push("## Boot — fixture");
  out.push("");
  out.push(
    `- Spawn pattern: ${RUBY_LSP_DIRECT ? `direct (\`${RUBY_LSP_DIRECT}\`)` : `bundler (\`${BUNDLE_BIN} exec ruby-lsp\`)`}`,
  );
  out.push(`- Fixture: \`${FIXTURE}\``);
  out.push(`- .rb files: ${rubyFiles.length}`);
  rubyFiles.forEach((p) => out.push(`  - \`${p.split("/").pop()}\``));

  const { probe, initResult } = await bootRubyLsp("ruby-lsp-probe", FIXTURE);
  try {
    subheading(out, "initialize response — capabilities");
    out.push(
      "_Load-bearing for ADR-21: the `capabilities` field below is the",
    );
    out.push(
      "authoritative answer for which LSP methods ruby-lsp advertises_",
    );
    out.push("_support for (implementation, typeDefinition, references,_");
    out.push("_etc.). Per fresh-read of the design-and-roadmap doc,_");
    out.push("_implementation + typeDefinition are NOT mentioned as_");
    out.push("_supported; this capture confirms-or-falsifies that._");
    out.push("");
    const caps = (initResult as { capabilities?: unknown })?.capabilities;
    block(out, "json", json(caps ?? initResult));

    subheading(out, "serverInfo");
    const info = (initResult as { serverInfo?: unknown })?.serverInfo;
    block(out, "json", json(info ?? "not returned"));

    // Let ruby-lsp settle before we flood didOpens. The settle duration
    // is itself an empirical question — Substep 3 should record the
    // observed cold-start window for ADR-21 readiness-pattern decision.
    await new Promise((r) => setTimeout(r, 1_000));

    await openAll(probe, rubyFiles);

    // Wait for workspace analysis to complete. ruby-lsp 0.26.x's
    // analysis time on a small Rails fixture is unknown (pre-Rubydex
    // indexer architecture) — Substep 3 tightens this based on
    // observed $/progress traffic.
    await new Promise((r) => setTimeout(r, 5_000));

    // -------------------------------------------------------------------
    // Cold-start readiness signal
    // -------------------------------------------------------------------
    heading(out, "Cold-start readiness — $/progress traffic");
    out.push(
      "Captures every $/progress event received during init + warmup.",
    );
    out.push(
      "Determines whether ruby-lsp follows gopls pattern (clean BEGIN/END",
    );
    out.push(
      "frames for workspace setup; adapter can race init against ceiling)",
    );
    out.push(
      "or Pyright pattern (no signal; per-call ceiling absorbs cold-start).",
    );
    out.push(
      "Result drives ADR-21 §readiness-pattern decision per ADR-18.",
    );
    out.push("");
    block(out, "json", json(probe.progressEvents));

    subheading(out, "server messages (log + show)");
    out.push(
      "Surfaces setup warnings — particularly ruby-lsp-rails add-on auto-",
    );
    out.push(
      "load status messages. Rails detection failure should surface here.",
    );
    out.push("");
    block(out, "json", json(probe.serverMessages));

    // ===================================================================
    // Substep 3 capability probes land below.
    // Ordered by load-bearingness for ADR-21 Limitations content per
    // v0.9 Stream A adjudication #6.
    // ===================================================================

    // -------------------------------------------------------------------
    // Probe #1 — documentSymbol (baseline + add-on)
    // -------------------------------------------------------------------
    heading(out, "Probe #1 — documentSymbol");
    out.push(
      "Full documentSymbol tree for the 6 load-bearing fixture files.",
    );
    out.push(
      "ruby-lsp-rails enhances Rails-detected files (app/ paths);",
    );
    out.push(
      "baseline ruby-lsp handles plain Ruby (lib/). The add-on delta",
    );
    out.push("surfaces by comparing the two sets — see probe #6 for the");
    out.push("focused delta analysis.");
    out.push("");
    out.push(
      "Files in scope: app/models/user.rb, app/models/post.rb,",
    );
    out.push(
      "app/models/concerns/sluggable.rb, app/controllers/posts_controller.rb,",
    );
    out.push("lib/analytics.rb, lib/dynamic_methods.rb.");
    out.push("");

    const probe1Files = [
      "app/models/user.rb",
      "app/models/post.rb",
      "app/models/concerns/sluggable.rb",
      "app/controllers/posts_controller.rb",
      "lib/analytics.rb",
      "lib/dynamic_methods.rb",
    ];

    for (const rel of probe1Files) {
      const filePath = pathJoin(FIXTURE, rel);
      const uri = toFileUri(filePath);
      subheading(out, rel);
      const syms = await withTimeout("documentSymbol", 15_000, () =>
        probe.client.request("textDocument/documentSymbol", {
          textDocument: { uri },
        }),
      );
      block(out, "json", json(syms));
    }

    // -------------------------------------------------------------------
    // Probe #2 — findReferences (methods specifically)
    // -------------------------------------------------------------------
    heading(out, "Probe #2 — findReferences");
    out.push(
      "Probes findReferences across symbol kinds at the pre-Rubydex",
    );
    out.push(
      "baseline (0.26.9). Expected per ruby-lsp roadmap: constants",
    );
    out.push(
      "supported, instance vars + methods on untyped receivers limited.",
    );
    out.push("Probe captures actual 0.26.9 coverage shape.");
    out.push("");
    out.push(
      "Mid-probe surprise watch: if 0.26.9 surfaces methods-references",
    );
    out.push(
      "for untyped-receiver cases (i.e., partial Rubydex-style expansion",
    );
    out.push(
      "contrary to roadmap), that's substantive enough to pause and",
    );
    out.push("re-frame ADR-21 Limitations scope.");
    out.push("");

    const refTargets = [
      {
        file: "app/models/user.rb",
        needle: "class User <",
        identifier: "User",
        label: "User constant (class declaration)",
      },
      {
        file: "app/models/user.rb",
        needle: "PREMIUM_TIER_LIMIT",
        identifier: "PREMIUM_TIER_LIMIT",
        label: "User::PREMIUM_TIER_LIMIT (top-level constant)",
      },
      {
        file: "app/models/user.rb",
        needle: "def display_name",
        identifier: "display_name",
        label: "User#display_name (instance method)",
      },
      {
        file: "app/models/user.rb",
        needle: "def self.find_by_email",
        identifier: "find_by_email",
        label: "User.find_by_email (class method)",
      },
      {
        file: "app/models/user.rb",
        needle: "scope :recent",
        identifier: "recent",
        label: "User.recent (scope — generates class method)",
      },
      {
        file: "app/models/concerns/sluggable.rb",
        needle: "def to_param",
        identifier: "to_param",
        label: "Sluggable#to_param (mixin instance method)",
      },
      {
        file: "app/models/concerns/sluggable.rb",
        needle: "def find_by_slug!",
        identifier: "find_by_slug!",
        label: "Sluggable.find_by_slug! (mixin class method via class_methods block)",
      },
      {
        file: "lib/analytics.rb",
        needle: "def track",
        identifier: "track",
        label: "Analytics.track (module function)",
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
    // Probe #3 — publishDiagnostics
    // -------------------------------------------------------------------
    heading(out, "Probe #3 — publishDiagnostics");
    out.push("ruby-lsp uses prism 1.9.0 as its parser substrate.");
    out.push("broken.rb contains a deliberate unclosed-paren parse error;");
    out.push("expected output is a diagnostic with severity error from");
    out.push("prism. Cold-start $/progress traffic was already captured");
    out.push(
      "earlier (see \"Cold-start readiness\" section above) — that's",
    );
    out.push("the readiness-pattern decision substrate.");
    out.push("");
    out.push("Diagnostic counts per opened URI:");
    out.push("");

    for (const [uri, diags] of probe.diagnosticsByUri) {
      const fileName = uri.split("/").slice(-3).join("/");
      out.push(
        `- \`${fileName}\`: ${(diags as unknown[]).length} diagnostic(s)`,
      );
    }
    out.push("");

    subheading(out, "broken.rb diagnostics (prism-emitted parse error)");
    const brokenUri = probe.openedUris.find((u) => u.endsWith("broken.rb"));
    if (brokenUri) {
      const brokenDiags =
        probe.diagnosticsByUri.get(normalizePath(brokenUri)) ?? [];
      out.push(`count: ${(brokenDiags as unknown[]).length}`);
      out.push("");
      block(out, "json", json(brokenDiags));
    } else {
      out.push("_broken.rb URI not found in openedUris_");
    }

    // -------------------------------------------------------------------
    // Probe #4 — hover (format + docstring presence)
    // -------------------------------------------------------------------
    heading(out, "Probe #4 — hover");
    out.push("Probes hover on varied symbol kinds. Compares against");
    out.push("ADR-13 (Pyright omits docstrings) and ADR-14 (gopls");
    out.push("includes them). Drives ADR-21 §getDocstring path");
    out.push("decision.");
    out.push("");
    out.push(
      "Fixture has no YARD/RDoc docstrings, so this probe primarily",
    );
    out.push(
      "captures the hover format envelope. Docstring-presence question",
    );
    out.push(
      "informed by what appears for comment-adjacent methods (e.g.,",
    );
    out.push("`# placeholder` comment above send_welcome_email in user.rb).");
    out.push(
      "rbs 4.0.2 sidebar observation: if hover surfaces rbs-derived",
    );
    out.push("type info anywhere, capture it as an additional finding.");
    out.push("");

    const hoverTargets = [
      {
        file: "app/models/user.rb",
        needle: "class User <",
        identifier: "User",
        label: "User (class declaration)",
      },
      {
        file: "app/models/user.rb",
        needle: "PREMIUM_TIER_LIMIT",
        identifier: "PREMIUM_TIER_LIMIT",
        label: "PREMIUM_TIER_LIMIT (constant)",
      },
      {
        file: "app/models/user.rb",
        needle: "has_many :posts",
        identifier: "has_many",
        label: "has_many :posts (Rails DSL macro)",
      },
      {
        file: "app/models/user.rb",
        needle: "scope :active",
        identifier: "scope",
        label: "scope :active (Rails DSL macro)",
      },
      {
        file: "app/models/user.rb",
        needle: "enum :role",
        identifier: "enum",
        label: "enum :role (Rails DSL macro)",
      },
      {
        file: "app/models/user.rb",
        needle: "def display_name",
        identifier: "display_name",
        label: "display_name (instance method)",
      },
      {
        file: "app/models/user.rb",
        needle: "def self.find_by_email",
        identifier: "find_by_email",
        label: "find_by_email (class method)",
      },
      {
        file: "app/models/user.rb",
        needle: "def send_welcome_email",
        identifier: "send_welcome_email",
        label: "send_welcome_email (method with adjacent `# placeholder` comment)",
      },
      {
        file: "app/models/post.rb",
        needle: "belongs_to :user",
        identifier: "belongs_to",
        label: "belongs_to :user (Rails DSL macro)",
      },
      {
        file: "app/models/concerns/sluggable.rb",
        needle: "extend ActiveSupport::Concern",
        identifier: "Concern",
        label: "ActiveSupport::Concern (constant in module declaration context)",
      },
      {
        file: "lib/analytics.rb",
        needle: "module Analytics",
        identifier: "Analytics",
        label: "Analytics (plain Ruby module)",
      },
      {
        file: "lib/analytics.rb",
        needle: "module_function",
        identifier: "module_function",
        label: "module_function (Ruby visibility keyword)",
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
    // Probe #5 — implementation + typeDefinition
    // -------------------------------------------------------------------
    heading(out, "Probe #5 — implementation + typeDefinition");
    out.push(
      "Per fresh-read of ruby-lsp design-and-roadmap, neither method",
    );
    out.push(
      "is documented as supported. Probe captures actual behavior",
    );
    out.push("(JSON-RPC error -32601 / empty result / actual response).");
    out.push("Drives ADR-21 §getTypeInfo decision: confirms Pyright-style");
    out.push(
      "declaration-parse fallback need (ADR-13 precedent) rather than",
    );
    out.push("gopls's clean implementation-endpoint pattern (ADR-14).");
    out.push("");

    subheading(out, "implementation queries");

    const implTargets = [
      {
        file: "app/models/user.rb",
        needle: "class User <",
        identifier: "User",
        label: "implementation on User (class)",
      },
      {
        file: "app/models/concerns/sluggable.rb",
        needle: "module Sluggable",
        identifier: "Sluggable",
        label: "implementation on Sluggable (module/Concern)",
      },
    ];

    for (const t of implTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) {
        subheading(out, t.label);
        out.push("_needle not found_");
        continue;
      }
      const col = pos.character + t.needle.indexOf(t.identifier);
      const uri = toFileUri(filePath);
      subheading(out, t.label);
      const impl = await withTimeout("implementation", 10_000, () =>
        probe.client.request("textDocument/implementation", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
        }),
      );
      out.push(
        `position: \`${t.file}\` line ${pos.line + 1}, char ${col}`,
      );
      out.push("");
      block(out, "json", json(impl));
    }

    subheading(out, "typeDefinition queries");

    const typeDefTargets = [
      {
        file: "consumer.rb",
        needle: "post = Post.first",
        identifier: "post",
        label: "typeDefinition on `post` local var",
      },
      {
        file: "consumer.rb",
        needle: "User.find_by_email",
        identifier: "User",
        label: "typeDefinition on User reference site",
      },
    ];

    for (const t of typeDefTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) {
        subheading(out, t.label);
        out.push("_needle not found_");
        continue;
      }
      const col = pos.character + t.needle.indexOf(t.identifier);
      const uri = toFileUri(filePath);
      subheading(out, t.label);
      const td = await withTimeout("typeDefinition", 10_000, () =>
        probe.client.request("textDocument/typeDefinition", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
        }),
      );
      out.push(
        `position: \`${t.file}\` line ${pos.line + 1}, char ${col}`,
      );
      out.push("");
      block(out, "json", json(td));
    }

    // -------------------------------------------------------------------
    // Probe #6 — Rails DSL surface delta (ruby-lsp-rails add-on)
    // -------------------------------------------------------------------
    heading(
      out,
      "Probe #6 — Rails DSL symbol surface (add-on delta)",
    );
    out.push("The single biggest unknown from fresh-read. Captures which");
    out.push("Rails DSL macros ruby-lsp-rails surfaces in documentSymbol:");
    out.push("has_many, belongs_to, has_one, has_and_belongs_to_many,");
    out.push("scope, enum, validates, before_/after_/around_ callbacks,");
    out.push("ActiveSupport::Concern. Most ADR-21-Limitations-relevant");
    out.push("probe; residual gaps go directly into Limitations section.");
    out.push("");
    out.push(
      "Per Path B (Pattern 7 surface 5): external-DSL macros",
    );
    out.push(
      "(acts_as_*, devise integrations) deliberately not in fixture;",
    );
    out.push(
      "cited finding in ADR-21 from ruby-lsp-rails documented scope,",
    );
    out.push("not fixture-probe evidence.");
    out.push("");
    out.push(
      "Analysis pattern: compare app/ files (Rails-detected; add-on",
    );
    out.push("enhances) vs lib/ files (plain Ruby; baseline). Probe #1");
    out.push(
      "already captured the raw documentSymbol output; this probe",
    );
    out.push(
      "re-queries with focus on the delta and notes which DSL symbols",
    );
    out.push("surface for downstream Limitations enumeration.");
    out.push("");
    out.push(
      "Mid-probe commit-split exception: if findings here warrant",
    );
    out.push(
      "standalone framing (substantively different from documentation-",
    );
    out.push(
      "predicted behavior), surface to Travis/advisor before completing",
    );
    out.push("probes #7–#8 per Pattern 7 boundary discipline.");
    out.push("");

    subheading(
      out,
      "Add-on-enhanced: app/models/user.rb (re-query for clarity)",
    );
    out.push(
      "Rails DSL surface in source: has_many, has_one, enum, scope (3x),",
    );
    out.push("validates (2x), before_save, after_create.");
    out.push("");
    const userUri = toFileUri(pathJoin(FIXTURE, "app/models/user.rb"));
    const userSyms = await withTimeout("documentSymbol", 15_000, () =>
      probe.client.request("textDocument/documentSymbol", {
        textDocument: { uri: userUri },
      }),
    );
    block(out, "json", json(userSyms));

    subheading(
      out,
      "Baseline: lib/analytics.rb (plain Ruby; no Rails magic)",
    );
    out.push(
      "Plain Ruby module + module_function — no Rails DSL. Baseline",
    );
    out.push("for what ruby-lsp surfaces without add-on contribution.");
    out.push("");
    const analyticsUri = toFileUri(pathJoin(FIXTURE, "lib/analytics.rb"));
    const analyticsSyms = await withTimeout("documentSymbol", 15_000, () =>
      probe.client.request("textDocument/documentSymbol", {
        textDocument: { uri: analyticsUri },
      }),
    );
    block(out, "json", json(analyticsSyms));

    subheading(
      out,
      "Add-on-enhanced: app/models/post.rb (mixin via Sluggable)",
    );
    out.push(
      "Post includes Sluggable (ActiveSupport::Concern). Add-on may",
    );
    out.push(
      "surface Sluggable's class_methods + included block contents in",
    );
    out.push("Post's symbol tree.");
    out.push("");
    const postUri = toFileUri(pathJoin(FIXTURE, "app/models/post.rb"));
    const postSyms = await withTimeout("documentSymbol", 15_000, () =>
      probe.client.request("textDocument/documentSymbol", {
        textDocument: { uri: postUri },
      }),
    );
    block(out, "json", json(postSyms));

    subheading(
      out,
      "Add-on-enhanced: app/controllers/posts_controller.rb (controller DSL)",
    );
    out.push("PostsController uses before_action. Add-on may surface as");
    out.push("a special symbol; or treat as plain method call.");
    out.push("");
    const controllerUri = toFileUri(
      pathJoin(FIXTURE, "app/controllers/posts_controller.rb"),
    );
    const controllerSyms = await withTimeout(
      "documentSymbol",
      15_000,
      () =>
        probe.client.request("textDocument/documentSymbol", {
          textDocument: { uri: controllerUri },
        }),
    );
    block(out, "json", json(controllerSyms));

    // -------------------------------------------------------------------
    // Probe #7 — definition (cross-file resolution)
    // -------------------------------------------------------------------
    heading(out, "Probe #7 — definition");
    out.push("Cross-file definition probes from consumer.rb reference");
    out.push("sites to their declarations. Composes with zeitwerk 2.7.5");
    out.push("autoload conventions — does ruby-lsp resolve User (loaded");
    out.push("via Rails autoload) without explicit require statements?");
    out.push("Captured here as zeitwerk-compose-observation sidebar.");
    out.push("");

    const defTargets = [
      {
        file: "consumer.rb",
        needle: "User.find_by_email",
        identifier: "User",
        label: "User constant reference → user.rb declaration",
      },
      {
        file: "consumer.rb",
        needle: "User.find_by_email",
        identifier: "find_by_email",
        label: "find_by_email class method → user.rb declaration",
      },
      {
        file: "consumer.rb",
        needle: "User.recent",
        identifier: "recent",
        label: "recent scope → user.rb declaration",
      },
      {
        file: "consumer.rb",
        needle: "post.user.display_name",
        identifier: "display_name",
        label: "display_name → user.rb declaration",
      },
      {
        file: "consumer.rb",
        needle: "Post.find_by_slug!",
        identifier: "find_by_slug!",
        label: "find_by_slug! mixin method → sluggable.rb declaration",
      },
      {
        file: "consumer.rb",
        needle: "post.to_param",
        identifier: "to_param",
        label: "to_param mixin method → sluggable.rb declaration",
      },
      {
        file: "consumer.rb",
        needle: "Analytics.track",
        identifier: "track",
        label: "Analytics.track → analytics.rb declaration",
      },
    ];

    for (const t of defTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) {
        subheading(out, t.label);
        out.push("_needle not found_");
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
    // Probe #8 — edge cases
    // -------------------------------------------------------------------
    heading(out, "Probe #8 — edge cases");
    out.push("Edge cases that document ADR-21 Limitations parallel to");
    out.push(
      "ADR-13's class-header-parser pathological inputs (Pyright)",
    );
    out.push("and ADR-14's build-tag handling (gopls):");
    out.push(
      "- Metaprogramming: define_method-in-enumerable-loop via",
    );
    out.push("  lib/dynamic_methods.rb. Travis-flagged load-bearing case;");
    out.push("  if this hangs or crashes ruby-lsp, surface immediately.");
    out.push("- Mixin chain: Post includes Sluggable; does documentSymbol");
    out.push("  surface inherited methods or only post.rb-explicit ones?");
    out.push(
      "- Inheritance via super: fixture deliberately lacks super calls",
    );
    out.push(
      "  — flagged as fixture-gap finding rather than emit fake-positive.",
    );
    out.push("");

    subheading(
      out,
      "documentSymbol on lib/dynamic_methods.rb (define_method-in-loop)",
    );
    out.push(
      "Travis-flagged load-bearing case. If this hangs or crashes",
    );
    out.push(
      "ruby-lsp, the timeout fires and the probe captures the error.",
    );
    out.push(
      "Expected baseline: ruby-lsp surfaces the literal define_method",
    );
    out.push(
      "call as a method symbol, NOT the generated active?/inactive?/",
    );
    out.push(
      "pending?/suspended? predicates — those exist only at runtime.",
    );
    out.push("");
    const dynUri = toFileUri(pathJoin(FIXTURE, "lib/dynamic_methods.rb"));
    const dynSyms = await withTimeout("documentSymbol", 15_000, () =>
      probe.client.request("textDocument/documentSymbol", {
        textDocument: { uri: dynUri },
      }),
    );
    block(out, "json", json(dynSyms));

    subheading(
      out,
      "findReferences on define_method-generated method (`active?`)",
    );
    out.push(
      "Companion to above. If ruby-lsp doesn't surface `active?` as",
    );
    out.push(
      "a symbol, references query lands on the literal string `active`",
    );
    out.push(
      "inside the STATUSES array. Captures behavior either way for",
    );
    out.push("ADR-21 Limitations.");
    out.push("");
    const dynPath = pathJoin(FIXTURE, "lib/dynamic_methods.rb");
    const activePos = locate(dynPath, ":active");
    if (activePos) {
      const col = activePos.character + 1; // skip leading `:` to land on `active`
      const refs = await withTimeout("references", 10_000, () =>
        probe.client.request("textDocument/references", {
          textDocument: { uri: dynUri },
          position: { line: activePos.line, character: col },
          context: { includeDeclaration: false },
        }),
      );
      out.push(
        `position: lib/dynamic_methods.rb line ${activePos.line + 1}, char ${col}`,
      );
      out.push("");
      block(out, "json", json(refs));
    } else {
      out.push("_`:active` needle not found in lib/dynamic_methods.rb_");
    }

    subheading(
      out,
      "documentSymbol on app/models/post.rb (mixin via Sluggable include)",
    );
    out.push("Post includes Sluggable. Most LSPs surface only Post's");
    out.push(
      "explicit symbols (belongs_to, scope, etc.) — not Sluggable's",
    );
    out.push(
      "inherited to_param / find_by_slug! / generate_slug. Captured",
    );
    out.push(
      "from probe #6 above; re-noted here as edge-case verification",
    );
    out.push(
      "of the inheritance-chain limit (in-fixture analog to ADR-13's",
    );
    out.push("class-header-parser cross-language edge-case documentation).");
    out.push("");
    out.push("_See probe #6 output for app/models/post.rb documentSymbol._");

    out.push("");
    out.push(
      "_Inheritance via super not exercised — fixture lacks super calls._",
    );
    out.push(
      "_Flagged as fixture-gap finding for ADR-21 Limitations rather_",
    );
    out.push(
      "_than emit fake-positive coverage claim. Adapter-implementation_",
    );
    out.push("_phase can extend fixture if super-call resolution evidence_");
    out.push("_is needed._");
  } finally {
    await probe.client.stop();
  }

  // -------------------------------------------------------------------------
  // Travis weekend dogfood composition section
  // -------------------------------------------------------------------------
  // TODO (Substep 5): real-Rails-work-repo observations from Travis's
  // weekend dogfood compose here. Distinguishes mechanically-reproducible
  // controlled-fixture findings (above) from qualitative practitioner
  // observations (below). First-execution-at-canonical-repo discipline
  // from v0.8.
  out.push("");
  out.push("---");
  out.push("");
  out.push("## Real-repo composition (TODO Substep 5)");
  out.push("");
  out.push(
    "_Travis weekend dogfood observations against real Rails work-repo._",
  );
  out.push("_Not yet captured — lands in Substep 5._");

  writeFileSync(OUTPUT, out.join("\n") + "\n", "utf8");
  console.log(`Probe complete. Findings written to ${OUTPUT}`);
}

main().catch((err) => {
  console.error("PROBE FAILED:", err);
  process.exit(1);
});
