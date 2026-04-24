/**
 * Gopls LSP probe — throwaway empirical behavior capture.
 *
 * Goal: exercise gopls v0.21.1 against a diverse Go fixture (and a
 * cobra sanity pass) so ADR-14's mappings are grounded in observed
 * behavior rather than documentation guesses.
 *
 * Reuses src/adapters/lsp-client.ts unchanged — if the probe can't
 * drive gopls with that client, that's itself a finding.
 *
 * Discard after ADR-14 + GoAdapter land. The findings file it
 * produces is what actually carries forward.
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

const FIXTURE = pathResolve("test/fixtures/go");
const OUTPUT = pathResolve("docs/adr/gopls-probe-findings.md");
const COBRA_ROOT = "C:\\CodeWork\\cobra";
// Absolute path because this shell's PATH doesn't include the user-
// level Go bin dir. Adapter will prefer PATH resolution; this is a
// probe-specific workaround. Documented as a finding in ADR-14.
const GOPLS_BIN =
  process.env.CONTEXTATLAS_GOPLS_BIN ??
  "C:\\Users\\Travis\\go\\bin\\gopls.exe";

// FINDING (also for ADR-14): gopls spawns `go` as a subprocess for
// module loading. It must be on PATH in the gopls process's env, OR
// gopls fails with "Error loading workspace folders" and every
// subsequent request returns "no views". We prepend the Go bin dirs
// to the current process's PATH so spawn() inherits them.
const GO_BIN_DIRS = [
  "C:\\Program Files\\Go\\bin",
  "C:\\Users\\Travis\\go\\bin",
];
process.env.PATH = [...GO_BIN_DIRS, process.env.PATH ?? ""]
  .filter(Boolean)
  .join(";");

type Json = unknown;

function walkGo(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const abs = pathJoin(root, name);
    if (statSync(abs).isDirectory()) continue;
    if (extname(name) === ".go") out.push(abs);
  }
  return out.sort();
}

/**
 * Recursively collect .go files, skipping vendor and hidden dirs.
 * Used so the probe picks up the cross-package `renderer/impl.go`
 * alongside the root fixture files.
 */
function walkGoRecursive(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    if (name.startsWith(".") || name === "vendor") continue;
    const abs = pathJoin(root, name);
    if (statSync(abs).isDirectory()) {
      out.push(...walkGoRecursive(abs));
      continue;
    }
    if (extname(name) === ".go") out.push(abs);
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
 * probe.
 */
function locate(
  filePath: string,
  needle: string,
): LspPosition | null {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i]!.indexOf(needle);
    if (idx >= 0) return { line: i, character: idx };
  }
  return null;
}

interface ProbeClient {
  client: LspClient;
  openedUris: string[];
  diagnosticsByUri: Map<string, unknown[]>;
  root: string;
}

async function bootGopls(
  name: string,
  root: string,
): Promise<{ probe: ProbeClient; initResult: unknown }> {
  const client = new LspClient(name);
  const diagnosticsByUri = new Map<string, unknown[]>();
  client.onNotification("textDocument/publishDiagnostics", (params) => {
    const p = params as { uri: string; diagnostics: unknown[] } | null;
    if (!p) return;
    diagnosticsByUri.set(normalizePath(p.uri), p.diagnostics ?? []);
  });

  // Gopls emits server-initiated requests; stub them so the server doesn't wait.
  for (const method of [
    "window/workDoneProgress/create",
    "client/registerCapability",
    "client/unregisterCapability",
    "window/showMessageRequest",
  ]) {
    client.onRequest(method, () => null);
  }

  // workspace/configuration: gopls requires a matching-shape array
  // response (one item per section requested). Returning null or {}
  // causes "no views" — gopls skips workspace activation.
  client.onRequest("workspace/configuration", (params) => {
    const items = (params as { items?: unknown[] } | null)?.items ?? [];
    return items.map(() => ({}));
  });

  // Capture gopls log/message output for diagnostic value.
  client.onNotification("window/logMessage", (p) => {
    const m = p as { type?: number; message?: string } | null;
    if (!m?.message) return;
    // Suppress noise; only log warnings/errors (types 1, 2).
    if (m.type === 1 || m.type === 2) {
      console.error(`[gopls log:${m.type}] ${m.message}`);
    }
  });
  client.onNotification("window/showMessage", (p) => {
    const m = p as { type?: number; message?: string } | null;
    if (!m?.message) return;
    console.error(`[gopls show:${m.type}] ${m.message}`);
  });

  client.start(GOPLS_BIN, [], root);

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
    probe: { client, openedUris: [], diagnosticsByUri, root },
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
        languageId: "go",
        version: 1,
        text: readFileSync(p, "utf8"),
      },
    });
  }
}

async function main() {
  const out: string[] = [];
  out.push("# gopls probe findings");
  out.push("");
  out.push(
    "Raw behavior capture from gopls v0.21.1 against a diverse Go",
  );
  out.push(
    "fixture + cobra sanity pass. Produced by `scripts/gopls-probe.ts`",
  );
  out.push(`on ${new Date().toISOString()}.`);
  out.push("");
  out.push(
    "Purpose: ground ADR-14's LSP primitive mappings in observed behavior.",
  );
  out.push("");
  out.push(
    "**Version pin note.** gopls v0.21.1 is the current stable release",
  );
  out.push(
    "(Feb 2026) backing Go 1.26.2. An earlier proposal of v0.16.2 would",
  );
  out.push(
    "have been incompatible with Go 1.26 — gopls's \"only latest Go\"",
  );
  out.push(
    "build support policy means pins must track the Go toolchain",
  );
  out.push(
    "closely. ADR-14 should document v0.21.1 as the probe-tested version",
  );
  out.push("and call out the version-compatibility gotcha.");

  const goFiles = walkGoRecursive(FIXTURE).map((p) => normalizePath(p));

  // -------------------------------------------------------------------------
  // Fixture boot
  // -------------------------------------------------------------------------
  out.push("");
  out.push("## Boot — fixture");
  out.push("");
  out.push(`- Gopls binary: \`${GOPLS_BIN}\` (on PATH)`);
  out.push(`- Fixture: \`${FIXTURE}\``);
  out.push(`- .go files: ${goFiles.length}`);
  goFiles.forEach((p) => out.push(`  - \`${p.split("/").pop()}\``));

  const { probe, initResult } = await bootGopls("gopls-probe", FIXTURE);
  try {
    subheading(out, "initialize response (trimmed to capabilities)");
    const caps = (initResult as { capabilities?: unknown })?.capabilities;
    block(out, "json", json(caps ?? initResult));

    subheading(out, "serverInfo");
    const info = (initResult as { serverInfo?: unknown })?.serverInfo;
    block(out, "json", json(info ?? "not returned"));

    // Let gopls settle before we flood didOpens.
    await new Promise((r) => setTimeout(r, 500));

    await openAll(probe, goFiles);

    // Give gopls time to analyze the workspace — Go's module
    // resolution is slower than Python's.
    await new Promise((r) => setTimeout(r, 5_000));

    // -------------------------------------------------------------------
    // T7 — Workspace warmup: diagnostics published after didOpen
    // -------------------------------------------------------------------
    heading(out, "T7 — Workspace warmup (diagnostics after didOpen)");
    out.push(
      "Does gopls publish diagnostics for opened files without further trigger?",
    );
    out.push("");
    for (const [uri, diags] of probe.diagnosticsByUri) {
      out.push(
        `- \`${uri.split("/").pop()}\`: ${(diags as unknown[]).length} diagnostic(s)`,
      );
    }
    out.push("");
    out.push(
      "_Fixture is intentionally clean — any non-zero count indicates gopls flagged something we need to understand._",
    );

    // -------------------------------------------------------------------
    // T3 — documentSymbol on kinds.go — the main pathology dump
    // -------------------------------------------------------------------
    heading(out, "T3 — documentSymbol (kinds.go)");
    out.push(
      "Captures the full symbol tree gopls returns for the pathology",
    );
    out.push(
      "fixture — covers structs, interfaces, methods (both receiver",
    );
    out.push(
      "kinds), generics, type aliases vs type definitions, iota const",
    );
    out.push("blocks, and exported vs unexported names.");
    const kindsUri = probe.openedUris.find((u) => u.endsWith("kinds.go"))!;
    const kindsDocSyms = await withTimeout("documentSymbol", 20_000, () =>
      probe.client.request("textDocument/documentSymbol", {
        textDocument: { uri: kindsUri },
      }),
    );
    block(out, "json", json(kindsDocSyms));

    // -------------------------------------------------------------------
    // T3b — documentSymbol on platform_* files (build-tag pathology)
    // -------------------------------------------------------------------
    heading(out, "T3b — documentSymbol on build-tagged files");
    out.push(
      "Do `//go:build` constraints hide symbols from documentSymbol on",
    );
    out.push(
      "the non-matching platform? Probe is running on Windows, so",
    );
    out.push(
      "`platform_windows.go` should be 'active' and `platform_other.go`",
    );
    out.push("should be excluded — but documentSymbol is a per-file");
    out.push(
      "request, so gopls may still return symbols for the inactive file.",
    );
    for (const name of ["platform_windows.go", "platform_other.go"]) {
      const uri = probe.openedUris.find((u) => u.endsWith(name));
      if (!uri) continue;
      const syms = await withTimeout("documentSymbol", 10_000, () =>
        probe.client.request("textDocument/documentSymbol", {
          textDocument: { uri },
        }),
      );
      subheading(out, name);
      block(out, "json", json(syms));
    }

    // -------------------------------------------------------------------
    // T4 — hover on varied targets
    // -------------------------------------------------------------------
    heading(out, "T4 — hover output samples");
    out.push(
      "Each target's `needle` is a phrase locating the line; `identifier` is the specific name hover should land on.",
    );
    const hoverTargets = [
      { file: "kinds.go", needle: "type Shape interface", identifier: "Shape", label: "interface Shape" },
      { file: "kinds.go", needle: "type Renderer interface", identifier: "Renderer", label: "interface Renderer (embeds Shape)" },
      { file: "kinds.go", needle: "type Rectangle struct", identifier: "Rectangle", label: "struct Rectangle" },
      { file: "kinds.go", needle: "type Square struct", identifier: "Square", label: "struct Square (embeds Rectangle)" },
      { file: "kinds.go", needle: "func (r *Rectangle) Area", identifier: "Area", label: "method Area (pointer receiver)" },
      { file: "kinds.go", needle: "func (r Rectangle) Perimeter", identifier: "Perimeter", label: "method Perimeter (value receiver)" },
      { file: "kinds.go", needle: "type UserID int64", identifier: "UserID", label: "type definition UserID" },
      { file: "kinds.go", needle: "type NodeID = UserID", identifier: "NodeID", label: "type alias NodeID" },
      { file: "kinds.go", needle: "type Stack[T any] struct", identifier: "Stack", label: "generic type Stack" },
      { file: "kinds.go", needle: "func (s *Stack[T]) Push", identifier: "Push", label: "method on generic receiver" },
      { file: "kinds.go", needle: "func Map[T, U any]", identifier: "Map", label: "generic function Map" },
      { file: "kinds.go", needle: "func Sum[T int | float64]", identifier: "Sum", label: "generic function Sum (union constraint)" },
      { file: "kinds.go", needle: "const DefaultTimeout = 30", identifier: "DefaultTimeout", label: "exported const" },
      { file: "kinds.go", needle: "const maxRetries = 3", identifier: "maxRetries", label: "unexported const" },
      { file: "kinds.go", needle: "StatusReady = iota", identifier: "StatusReady", label: "iota const (first)" },
      { file: "kinds.go", needle: "StatusRunning", identifier: "StatusRunning", label: "iota const (implicit)" },
    ];
    for (const h of hoverTargets) {
      const filePath = pathJoin(FIXTURE, h.file);
      const pos = locate(filePath, h.needle);
      if (!pos) {
        subheading(out, h.label);
        out.push(`_needle not found: \`${h.needle}\`_`);
        continue;
      }
      const withinNeedle = h.needle.indexOf(h.identifier);
      if (withinNeedle < 0) {
        subheading(out, h.label);
        out.push(`_identifier not inside needle: \`${h.identifier}\`_`);
        continue;
      }
      const col = pos.character + withinNeedle;
      const uri = toFileUri(filePath);
      const hover = await withTimeout("hover", 10_000, () =>
        probe.client.request("textDocument/hover", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
        }),
      );
      subheading(out, h.label);
      out.push(`position: line ${pos.line}, char ${col}`);
      out.push("");
      block(out, "json", json(hover));
    }

    // -------------------------------------------------------------------
    // T0 — definition (go-specific; not in pyright probe)
    // -------------------------------------------------------------------
    heading(out, "T0 — textDocument/definition");
    out.push(
      "Per ADR-13, definition grounds findReferences. For Go, expected behavior:",
    );
    out.push(
      "definition on a *reference site* jumps to the declaration. Probe from consumer.go.",
    );
    const defTargets = [
      { file: "consumer.go", needle: "NewRectangle(w, h)", identifier: "NewRectangle", label: "NewRectangle usage → kinds.go declaration" },
      { file: "consumer.go", needle: "Map(items", identifier: "Map", label: "generic Map usage → kinds.go declaration" },
      { file: "consumer.go", needle: "Stack[int]{}", identifier: "Stack", label: "generic Stack usage → kinds.go declaration" },
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
      out.push(`position: line ${pos.line}, char ${col}`);
      out.push("");
      block(out, "json", json(defn));
    }

    // -------------------------------------------------------------------
    // T2 — findReferences on cross-file symbols
    // -------------------------------------------------------------------
    heading(out, "T2 — references (cross-file)");
    const refTargets = [
      { file: "kinds.go", needle: "func NewRectangle(", identifier: "NewRectangle", label: "NewRectangle" },
      { file: "kinds.go", needle: "type Rectangle struct", identifier: "Rectangle", label: "Rectangle" },
      { file: "kinds.go", needle: "type Stack[T any]", identifier: "Stack", label: "Stack (generic)" },
      { file: "kinds.go", needle: "func Map[T, U any]", identifier: "Map", label: "Map (generic)" },
    ];
    for (const t of refTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) continue;
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
      block(out, "json", json(refs));
    }

    // -------------------------------------------------------------------
    // T1 — implementation (the Go-critical probe)
    // -------------------------------------------------------------------
    heading(out, "T1 — implementation (interface → implementers, and reverse)");
    out.push(
      "Go interfaces are satisfied implicitly. Does gopls return Rectangle + ShapeRenderer as implementers of Shape? Does it return Shape + Renderer as interfaces satisfied by Rectangle?",
    );
    const implTargets = [
      { file: "kinds.go", needle: "type Shape interface", identifier: "Shape", label: "Shape (interface → implementers)" },
      { file: "kinds.go", needle: "type Renderer interface", identifier: "Renderer", label: "Renderer (interface → implementers)" },
      { file: "kinds.go", needle: "type Rectangle struct", identifier: "Rectangle", label: "Rectangle (concrete → interfaces satisfied)" },
      { file: "kinds.go", needle: "type ShapeRenderer struct", identifier: "ShapeRenderer", label: "ShapeRenderer (concrete → interfaces satisfied)" },
    ];
    for (const t of implTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) continue;
      const col = pos.character + t.needle.indexOf(t.identifier);
      const uri = toFileUri(filePath);
      const impl = await withTimeout("implementation", 15_000, () =>
        probe.client.request("textDocument/implementation", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
        }),
      );
      subheading(out, t.label);
      out.push(`position: line ${pos.line}, char ${col}`);
      out.push("");
      block(out, "json", json(impl));
    }

    // -------------------------------------------------------------------
    // T1b — cross-package implementation
    // -------------------------------------------------------------------
    heading(out, "T1b — implementation (cross-package)");
    out.push(
      "Extends T1: re-queries implementation on `kinds.Shape` and `kinds.Renderer` now that the subpackage `renderer/impl.go` is loaded in the workspace. Verifies gopls indexes implementers across package boundaries — the pattern real codebases need.",
    );
    out.push("");
    out.push(
      "Expected: Shape implementers now include `renderer.Circle` and `renderer.FancyRenderer` (via compile-time `var _ kinds.Shape = (*Circle)(nil)` witnesses); Renderer implementers include `renderer.FancyRenderer`.",
    );
    const crossImplTargets = [
      { file: "kinds.go", needle: "type Shape interface", identifier: "Shape", label: "Shape (now with renderer/ loaded)" },
      { file: "kinds.go", needle: "type Renderer interface", identifier: "Renderer", label: "Renderer (now with renderer/ loaded)" },
    ];
    for (const t of crossImplTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) continue;
      const col = pos.character + t.needle.indexOf(t.identifier);
      const uri = toFileUri(filePath);
      const impl = await withTimeout("implementation", 15_000, () =>
        probe.client.request("textDocument/implementation", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
        }),
      );
      subheading(out, t.label);
      out.push(`position: line ${pos.line}, char ${col}`);
      out.push("");
      block(out, "json", json(impl));
    }

    // -------------------------------------------------------------------
    // Bonus — typeDefinition
    // -------------------------------------------------------------------
    heading(out, "Bonus — textDocument/typeDefinition");
    const typeDefTargets = [
      { file: "consumer.go", needle: "r := NewRectangle(w, h)", identifier: "r", label: "r (local var via generic inference)" },
      { file: "kinds.go", needle: "type NodeID = UserID", identifier: "NodeID", label: "NodeID (alias)" },
      { file: "kinds.go", needle: "var DefaultRenderer Renderer", identifier: "DefaultRenderer", label: "DefaultRenderer (interface-typed var)" },
    ];
    for (const t of typeDefTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) continue;
      const col = pos.character + t.needle.indexOf(t.identifier);
      const uri = toFileUri(filePath);
      const td = await withTimeout("typeDefinition", 10_000, () =>
        probe.client.request("textDocument/typeDefinition", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
        }),
      );
      subheading(out, t.label);
      out.push(`position: line ${pos.line}, char ${col}`);
      out.push("");
      block(out, "json", json(td));
    }
  } finally {
    await probe.client.stop();
  }

  // -------------------------------------------------------------------------
  // Cobra sanity — boot gopls against a real ~2000-LOC file
  // -------------------------------------------------------------------------
  out.push("");
  out.push("---");
  heading(out, "Cobra sanity check");
  out.push(
    "Boot gopls against `C:\\CodeWork\\cobra` (19 source files, go.mod at root).",
  );
  out.push(
    "Confirms gopls handles a real module correctly — module resolution,",
  );
  out.push(
    "dependency loading, and documentSymbol on a 2000+ LOC file.",
  );

  const { probe: cobraProbe, initResult: cobraInit } = await bootGopls(
    "gopls-cobra-sanity",
    COBRA_ROOT,
  );
  try {
    subheading(out, "initialize response (serverInfo only)");
    const info = (cobraInit as { serverInfo?: unknown })?.serverInfo;
    block(out, "json", json(info ?? "not returned"));

    await new Promise((r) => setTimeout(r, 500));

    const commandPath = pathJoin(COBRA_ROOT, "command.go");
    const commandUri = toFileUri(commandPath);
    cobraProbe.openedUris.push(commandUri);
    cobraProbe.client.notify("textDocument/didOpen", {
      textDocument: {
        uri: commandUri,
        languageId: "go",
        version: 1,
        text: readFileSync(commandPath, "utf8"),
      },
    });

    // Let gopls analyze the module — may need longer than the fixture
    // because deps are loaded.
    await new Promise((r) => setTimeout(r, 10_000));

    subheading(out, "diagnostics on command.go");
    const commandDiags =
      cobraProbe.diagnosticsByUri.get(normalizePath(commandUri)) ?? [];
    out.push(`count: ${(commandDiags as unknown[]).length}`);
    if ((commandDiags as unknown[]).length > 0 && (commandDiags as unknown[]).length < 20) {
      block(out, "json", json(commandDiags));
    } else if ((commandDiags as unknown[]).length >= 20) {
      out.push("_(truncated — too many diagnostics to embed; listing first 5)_");
      block(out, "json", json((commandDiags as unknown[]).slice(0, 5)));
    }

    subheading(out, "documentSymbol count on command.go");
    const cmdSyms = await withTimeout("documentSymbol", 30_000, () =>
      cobraProbe.client.request("textDocument/documentSymbol", {
        textDocument: { uri: commandUri },
      }),
    );
    if (Array.isArray(cmdSyms)) {
      out.push(`top-level symbols: ${(cmdSyms as unknown[]).length}`);
      out.push("");
      out.push(
        "First 5 with `name` + `kind` only (full capture would flood the doc):",
      );
      const snip = (cmdSyms as Array<{ name: string; kind: number }>)
        .slice(0, 5)
        .map((s) => ({ name: s.name, kind: s.kind }));
      block(out, "json", json(snip));
    } else {
      block(out, "json", json(cmdSyms));
    }

    // Definition jump to verify cross-module resolution works
    subheading(out, "definition jump on pflag import usage");
    out.push(
      "Probes whether gopls resolves symbols from `github.com/spf13/pflag` (a dep via go.sum).",
    );
    const flagSetPos = locate(commandPath, "pflag.FlagSet");
    if (flagSetPos) {
      const col = flagSetPos.character + "pflag.".length;
      const defn = await withTimeout("definition", 15_000, () =>
        cobraProbe.client.request("textDocument/definition", {
          textDocument: { uri: commandUri },
          position: { line: flagSetPos.line, character: col },
        }),
      );
      out.push(`position: line ${flagSetPos.line}, char ${col}`);
      out.push("");
      block(out, "json", json(defn));
    } else {
      out.push("_pflag.FlagSet reference not found in command.go_");
    }
  } finally {
    await cobraProbe.client.stop();
  }

  writeFileSync(OUTPUT, out.join("\n") + "\n", "utf8");
  console.log(`Probe complete. Findings written to ${OUTPUT}`);
}

main().catch((err) => {
  console.error("PROBE FAILED:", err);
  process.exit(1);
});
