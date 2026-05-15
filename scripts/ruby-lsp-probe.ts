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
 * Bundler/spawn note (Windows): on win32 we default to `bundle.bat`
 * because Node's spawn doesn't auto-resolve `.bat`/`.cmd` shims
 * without shell:true. Env vars CONTEXTATLAS_BUNDLE_BIN and
 * CONTEXTATLAS_RUBY_LSP_BIN let callers override if their install
 * uses non-standard names or absolute paths.
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
  if (RUBY_LSP_DIRECT) {
    client.start(RUBY_LSP_DIRECT, [], root);
  } else {
    client.start(BUNDLE_BIN, ["exec", "ruby-lsp"], root);
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

    // TODO (Substep 3, probe #1): documentSymbol — baseline + add-on
    //   - For each fixture file, request textDocument/documentSymbol
    //   - Compare ruby-lsp-rails Rails files (models/controllers) to
    //     plain .rb files (lib/) to surface add-on delta
    //   - Capture: acts_as_*, scopes, associations, enums, callbacks
    //   - Most load-bearing — primitive for everything else
    heading(out, "Probe #1 — documentSymbol (TODO Substep 3)");
    out.push("_Not yet implemented — lands in Substep 3._");

    // TODO (Substep 3, probe #2): findReferences — methods specifically
    //   - References on a constant (class/module): expected full support
    //     per ruby-lsp pre-Rubydex baseline (roadmap: constants supported)
    //   - References on an instance variable: roadmap "planned" at the
    //     pre-Rubydex baseline. Rubydex 2026-05-12 expansion is at
    //     0.27+ pre-release, NOT in scope at v1.0 — see file header
    //     "Version pinning" note. Probe captures actual 0.26.x coverage.
    //     0.26.x may have incremental pre-Rubydex improvements not
    //     present in older patches; probe-findings empirical input.
    //   - References on a method with no receiver-type inference: roadmap
    //     "planned" status pre-Rubydex; capture actual 0.26.x coverage
    //   - References on a method inside a typed-context (Sorbet-like
    //     scenarios not in scope at v1.0 but worth a control trial)
    heading(out, "Probe #2 — findReferences (TODO Substep 3)");
    out.push("_Not yet implemented — lands in Substep 3._");

    // TODO (Substep 3, probe #3): publishDiagnostics
    //   - Verify diagnostics published automatically on didOpen
    //   - Capture: severity codes, shape, ranges
    //   - Pair with cold-start $/progress capture above for the full
    //     readiness-pattern story
    heading(out, "Probe #3 — publishDiagnostics (TODO Substep 3)");
    out.push("_Not yet implemented — lands in Substep 3._");

    // TODO (Substep 3, probe #4): hover — format + docstring presence
    //   - Per ADR-13 finding: Pyright hover omits docstrings. What about
    //     ruby-lsp? If hover surfaces YARD/RDoc/Sord docs, getDocstring
    //     path can use hover. If not, parallel to Pyright's direct AST
    //     parse (ast.get_docstring()) — Ruby would need a different
    //     substrate (Prism AST? ruby-lsp's own indexer API?).
    heading(out, "Probe #4 — hover (TODO Substep 3)");
    out.push("_Not yet implemented — lands in Substep 3._");

    // TODO (Substep 3, probe #5): implementation + typeDefinition
    //   - Both likely absent per fresh-read of design-and-roadmap
    //   - Capture: actual JSON-RPC error vs empty result vs unsupported
    //   - Drives ADR-21 §getTypeInfo decision: Pyright pattern
    //     (declaration-parse fallback + pass-1/pass-2 symbol-inventory)
    heading(out, "Probe #5 — implementation + typeDefinition (TODO Substep 3)");
    out.push("_Not yet implemented — lands in Substep 3._");

    // TODO (Substep 3, probe #6): Rails DSL symbol surface (add-on delta)
    //   - The single biggest unknown from fresh-read
    //   - Capture which Rails macros ruby-lsp-rails surfaces in
    //     documentSymbol: has_many, belongs_to, has_one, has_and_belongs_to_many,
    //     scope, enum, validates, before_/after_/around_ callbacks,
    //     acts_as_*, devise integrations, ActiveSupport::Concern
    //   - Compare baseline (rails-rails disabled) to add-on (enabled)
    //   - Most ADR-21-Limitations-relevant probe; residual gaps go
    //     directly into Limitations section
    heading(out, "Probe #6 — Rails DSL surface delta (TODO Substep 3)");
    out.push("_Not yet implemented — lands in Substep 3._");

    // TODO (Substep 3, probe #7): definition
    //   - Auxiliary; jumps from reference site to declaration
    //   - Lower load-bearingness but informs symbol-resolution
    //     story for the adapter
    heading(out, "Probe #7 — definition (TODO Substep 3)");
    out.push("_Not yet implemented — lands in Substep 3._");

    // TODO (Substep 3, probe #8): edge cases
    //   - Metaprogramming: define_method, method_missing
    //   - Mixins: include / extend / prepend; ancestor chain
    //   - Inheritance: subclass references via super
    //   - Dynamic class construction (Class.new)
    //   - These document ADR-21 Limitations pathological-input cases
    //     parallel to ADR-13's class-header parser pathological inputs
    heading(out, "Probe #8 — edge cases (TODO Substep 3)");
    out.push("_Not yet implemented — lands in Substep 3._");
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
