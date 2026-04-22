/**
 * Pyright LSP probe — throwaway empirical behavior capture.
 *
 * Goal: exercise Pyright 1.1.409 against a diverse Python fixture and
 * capture raw LSP responses so ADR-13's mappings are grounded in
 * observed behavior rather than documentation guesses.
 *
 * Reuses src/adapters/lsp-client.ts unchanged — if the probe can't
 * drive pyright with that client, that's itself a finding.
 *
 * Discard after ADR-13 + PyrightAdapter land. The findings file it
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

const FIXTURE = pathResolve("test/fixtures/python");
const OUTPUT = pathResolve("docs/adr/pyright-probe-findings.md");
const PYRIGHT_ENTRY = pathResolve(
  "node_modules/pyright/langserver.index.js",
);

type Json = unknown;

function walkPy(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const abs = pathJoin(root, name);
    if (statSync(abs).isDirectory()) continue;
    if (extname(name) === ".py") out.push(abs);
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

async function main() {
  const out: string[] = [];
  out.push("# Pyright probe findings");
  out.push("");
  out.push("Raw behavior capture from Pyright 1.1.409 against a diverse");
  out.push("Python fixture. Produced by `scripts/pyright-probe.ts` on");
  out.push(`${new Date().toISOString()}.`);
  out.push("");
  out.push(
    "Purpose: ground ADR-13's LSP primitive mappings in observed behavior.",
  );
  out.push("");

  const client = new LspClient("pyright-probe");
  const pyFiles = walkPy(FIXTURE).map((p) => normalizePath(p));
  const openedUris: string[] = [];

  const diagnosticsByUri = new Map<string, unknown[]>();
  client.onNotification("textDocument/publishDiagnostics", (params) => {
    const p = params as { uri: string; diagnostics: unknown[] } | null;
    if (!p) return;
    diagnosticsByUri.set(normalizePath(p.uri), p.diagnostics ?? []);
  });

  // Pyright sends server-initiated requests; the client needs handlers
  // or the server waits. These are minimal no-op stubs.
  for (const method of [
    "window/workDoneProgress/create",
    "client/registerCapability",
    "workspace/configuration",
  ]) {
    client.onRequest(method, () => null);
  }

  try {
    out.push("## Boot");
    out.push("");
    out.push(`- Pyright entry: \`${PYRIGHT_ENTRY}\``);
    out.push(`- Fixture: \`${FIXTURE}\``);
    out.push(`- .py files: ${pyFiles.length}`);
    pyFiles.forEach((p) => out.push(`  - \`${p.split("/").pop()}\``));

    client.start(process.execPath, [PYRIGHT_ENTRY, "--stdio"], FIXTURE);

    const initResult = await withTimeout("initialize", 30_000, () =>
      client.request("initialize", {
        processId: process.pid,
        rootUri: toFileUri(FIXTURE),
        workspaceFolders: [
          { uri: toFileUri(FIXTURE), name: "pyright-probe" },
        ],
        capabilities: {
          textDocument: {
            documentSymbol: {
              hierarchicalDocumentSymbolSupport: true,
            },
            references: {},
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

    subheading(out, "initialize response (trimmed to capabilities)");
    const caps = (initResult as { capabilities?: unknown })?.capabilities;
    block(out, "json", json(caps ?? initResult));

    client.notify("initialized", {});

    // Give pyright a beat to settle before we flood didOpens — it
    // reads pyproject.toml during startup.
    await new Promise((r) => setTimeout(r, 500));

    // Open every .py file — mirrors what the real adapter's warmup
    // will do. Pyright's analysis often needs this before cross-file
    // requests like implementation return meaningful results.
    for (const p of pyFiles) {
      const uri = toFileUri(p);
      openedUris.push(uri);
      client.notify("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: "python",
          version: 1,
          text: readFileSync(p, "utf8"),
        },
      });
    }

    // Let pyright analyze.
    await new Promise((r) => setTimeout(r, 3_000));

    // -----------------------------------------------------------------
    // T7 — Workspace warmup / implicit analysis
    // -----------------------------------------------------------------
    heading(out, "T7 — Workspace warmup (diagnostics after didOpen)");
    out.push(
      "Pyright's behavior on didOpen: does it publish diagnostics for " +
        "opened files without further trigger?",
    );
    out.push("");
    for (const [uri, diags] of diagnosticsByUri) {
      out.push(`- \`${uri.split("/").pop()}\`: ${diags.length} diagnostic(s)`);
    }

    // -----------------------------------------------------------------
    // T6 — Diagnostics on broken.py
    // -----------------------------------------------------------------
    heading(out, "T6 — Diagnostics (broken.py)");
    const brokenUri = openedUris.find((u) => u.endsWith("broken.py"))!;
    const brokenDiags = diagnosticsByUri.get(normalizePath(brokenUri)) ?? [];
    out.push(`broken.py reported ${brokenDiags.length} diagnostic(s):`);
    block(out, "json", json(brokenDiags));

    // -----------------------------------------------------------------
    // T3 — Document symbols: which LSP kinds does Pyright emit?
    // -----------------------------------------------------------------
    heading(out, "T3 — documentSymbol (sample.py)");
    const sampleUri = openedUris.find((u) => u.endsWith("sample.py"))!;
    const docSyms = await withTimeout("documentSymbol", 20_000, () =>
      client.request("textDocument/documentSymbol", {
        textDocument: { uri: sampleUri },
      }),
    );
    block(out, "json", json(docSyms));

    // -----------------------------------------------------------------
    // T4 — hover format: what does it look like?
    // -----------------------------------------------------------------
    heading(out, "T4 — hover output samples");
    // Each target names the full "needle" (context phrase so `locate`
    // finds the right line) and the specific `identifier` within it
    // we want hover to land on.
    const hoverTargets = [
      { file: "sample.py", needle: "class Shape", identifier: "Shape", label: "class Shape" },
      { file: "sample.py", needle: "class Widget", identifier: "Widget", label: "class Widget (multi-base)" },
      { file: "sample.py", needle: "class Drawable", identifier: "Drawable", label: "class Drawable (Protocol)" },
      { file: "sample.py", needle: "class Renderable", identifier: "Renderable", label: "class Renderable (ABC)" },
      { file: "sample.py", needle: "class Counter", identifier: "Counter", label: "class Counter" },
      { file: "sample.py", needle: "def count(self)", identifier: "count", label: "@property count" },
      { file: "sample.py", needle: "def zero(cls)", identifier: "zero", label: "@classmethod zero" },
      { file: "sample.py", needle: "def is_zero(value", identifier: "is_zero", label: "@staticmethod is_zero" },
      { file: "sample.py", needle: "class Point", identifier: "Point", label: "@dataclass Point" },
      { file: "sample.py", needle: "UserIdV1 = str", identifier: "UserIdV1", label: "type alias form 1 (bare)" },
      { file: "sample.py", needle: "UserIdV2: TypeAlias", identifier: "UserIdV2", label: "type alias form 2 (TypeAlias)" },
      { file: "sample.py", needle: "type UserIdV3", identifier: "UserIdV3", label: "type alias form 3 (PEP 695)" },
      { file: "sample.py", needle: "def parse(value: int)", identifier: "parse", label: "overloaded parse (first @overload)" },
      { file: "sample.py", needle: "def greet(name", identifier: "greet", label: "function greet" },
      { file: "sample.py", needle: "DEFAULT_RETRIES", identifier: "DEFAULT_RETRIES", label: "module constant" },
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
        client.request("textDocument/hover", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
        }),
      );
      subheading(out, h.label);
      out.push(`position: line ${pos.line}, char ${col}`);
      out.push("");
      block(out, "json", json(hover));
    }

    // -----------------------------------------------------------------
    // T1 — textDocument/implementation: does it return subclasses?
    // -----------------------------------------------------------------
    heading(out, "T1 — implementation (the critical probe)");
    out.push(
      "For each target, asks Pyright `textDocument/implementation` at " +
        "the symbol's declaration and records what it returns. If results " +
        "point at subclasses.py entries, we have `usedByTypes` via LSP. " +
        "If results point at parent/self/empty, we need the inventory-walk " +
        "fallback.",
    );
    const implTargets = [
      { file: "sample.py", needle: "class Shape", identifier: "Shape", label: "Shape" },
      { file: "sample.py", needle: "class Polygon", identifier: "Polygon", label: "Polygon" },
      { file: "sample.py", needle: "class Renderable", identifier: "Renderable", label: "Renderable (ABC)" },
      { file: "sample.py", needle: "class Drawable", identifier: "Drawable", label: "Drawable (Protocol)" },
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
      const impl = await withTimeout("implementation", 15_000, () =>
        client.request("textDocument/implementation", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
        }),
      );
      subheading(out, t.label);
      out.push(`position: line ${pos.line}, char ${col}`);
      out.push("");
      block(out, "json", json(impl));
    }

    // -----------------------------------------------------------------
    // T2 — findReferences on a symbol used across files
    // -----------------------------------------------------------------
    heading(out, "T2 — references (Counter, Triangle, greet)");
    const refTargets = [
      { file: "sample.py", needle: "class Counter", identifier: "Counter", label: "Counter" },
      { file: "sample.py", needle: "class Triangle", identifier: "Triangle", label: "Triangle" },
      { file: "sample.py", needle: "def greet(name", identifier: "greet", label: "greet" },
    ];
    for (const t of refTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) continue;
      const col = pos.character + t.needle.indexOf(t.identifier);
      const uri = toFileUri(filePath);
      const refs = await withTimeout("references", 15_000, () =>
        client.request("textDocument/references", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
          context: { includeDeclaration: false },
        }),
      );
      subheading(out, t.label);
      block(out, "json", json(refs));
    }

    // -----------------------------------------------------------------
    // T5 — Overloaded parse — docSymbol + hover
    // -----------------------------------------------------------------
    heading(out, "T5 — Overloads (parse function)");
    out.push(
      "Captures how documentSymbol represents @overload alternates (one " +
        "entry? three?) and what hover returns on each.",
    );
    const parseEntries = Array.isArray(docSyms)
      ? (docSyms as Array<{ name: string }>).filter((s) => s.name === "parse")
      : [];
    subheading(out, "documentSymbol entries named 'parse'");
    out.push(`count: ${parseEntries.length}`);
    block(out, "json", json(parseEntries));

    // -----------------------------------------------------------------
    // typeDefinition probe — what does it return for various targets?
    // -----------------------------------------------------------------
    heading(out, "Bonus — textDocument/typeDefinition");
    out.push(
      "For completeness: capture what typeDefinition returns on a few " +
        "targets so ADR-13 can decide whether it plays a role in the " +
        "type-info story.",
    );
    const typeDefTargets = [
      {
        file: "consumer.py",
        needle: "Counter.zero()",
        label: "Counter expression",
      },
      {
        file: "sample.py",
        needle: "UserIdV2: TypeAlias",
        label: "UserIdV2 name",
      },
    ];
    for (const t of typeDefTargets) {
      const filePath = pathJoin(FIXTURE, t.file);
      const pos = locate(filePath, t.needle);
      if (!pos) continue;
      const col = pos.character;
      const uri = toFileUri(filePath);
      const td = await withTimeout("typeDefinition", 10_000, () =>
        client.request("textDocument/typeDefinition", {
          textDocument: { uri },
          position: { line: pos.line, character: col },
        }),
      );
      subheading(out, t.label);
      block(out, "json", json(td));
    }
  } finally {
    await client.stop();
  }

  writeFileSync(OUTPUT, out.join("\n") + "\n", "utf8");
  console.log(`Probe complete. Findings written to ${OUTPUT}`);
}

main().catch((err) => {
  console.error("PROBE FAILED:", err);
  process.exit(1);
});
