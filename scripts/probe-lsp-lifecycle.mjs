/**
 * v0.4 Step 1.2 lifecycle verification — does $/progress END fire
 * once-per-session at initialize, or repeatedly per workspace
 * activity?
 *
 * Tests by opening THREE files post-init (broken.ts, sample.ts,
 * consumer.ts) with 800ms gaps and watching for additional
 * $/progress flows beyond the cold-start one. Same approach for
 * gopls (broken.go, kinds.go, consumer.go).
 *
 * Pyright skipped — the previous probe showed pyright emits no
 * $/progress at all, so lifecycle question is moot for it.
 *
 * Throwaway — discard once Step 1.2 lands.
 */
import { spawn } from "node:child_process";
import { resolve as pathResolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const REPO_ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = pathResolve(REPO_ROOT, "test", "fixtures");
const require = createRequire(import.meta.url);

const GO_BIN_DIRS = [
  "C:\\Program Files\\Go\\bin",
  "C:\\Users\\Travis\\go\\bin",
];
process.env.PATH = [...GO_BIN_DIRS, process.env.PATH ?? ""]
  .filter(Boolean)
  .join(";");

class LspProbe {
  constructor(label, command, args, cwd) {
    this.label = label;
    this.proc = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.requestHandlers = new Map();
    this.events = [];
    this.proc.stdout.on("data", (c) => this.handleData(c));
    this.proc.stderr.on("data", () => {});
    this.proc.on("error", () => {});
  }
  onRequest(method, handler) { this.requestHandlers.set(method, handler); }
  request(method, params, timeoutMs = 30_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${this.label}:${method} timeout`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, t });
      this.sendRaw({ jsonrpc: "2.0", id, method, params });
    });
  }
  notify(method, params) { this.sendRaw({ jsonrpc: "2.0", method, params }); }
  sendRaw(msg) {
    const json = JSON.stringify(msg);
    const payload = Buffer.from(json, "utf8");
    this.proc.stdin.write(`Content-Length: ${payload.length}\r\n\r\n`);
    this.proc.stdin.write(payload);
  }
  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const m = /Content-Length:\s*(\d+)/i.exec(this.buffer.subarray(0, headerEnd).toString("utf8"));
      if (!m) { this.buffer = Buffer.alloc(0); return; }
      const length = parseInt(m[1], 10);
      const total = headerEnd + 4 + length;
      if (this.buffer.length < total) break;
      const payload = this.buffer.subarray(headerEnd + 4, total).toString("utf8");
      this.buffer = this.buffer.subarray(total);
      this.dispatch(payload);
    }
  }
  dispatch(payload) {
    let msg; try { msg = JSON.parse(payload); } catch { return; }
    const ts = Date.now();
    if (typeof msg.id === "number" && msg.method === undefined &&
        (msg.result !== undefined || msg.error !== undefined)) {
      const p = this.pending.get(msg.id);
      if (p) { clearTimeout(p.t); this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result ?? null); }
      return;
    }
    if (msg.method && msg.id !== undefined && msg.id !== null) {
      const h = this.requestHandlers.get(msg.method);
      const respond = (r) => this.sendRaw({ jsonrpc: "2.0", id: msg.id, result: r });
      if (h) Promise.resolve(h(msg.params)).then(respond).catch(() => respond(null));
      else respond(null);
      return;
    }
    if (msg.method) this.events.push({ ts, method: msg.method, params: msg.params });
  }
  async shutdown() {
    try { await this.request("shutdown", null, 3_000); } catch {}
    try { this.notify("exit"); this.proc.stdin.end(); } catch {}
    await new Promise((r) => setTimeout(r, 200));
    if (!this.proc.killed) this.proc.kill();
  }
}

const CAPS = {
  textDocument: {
    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
    publishDiagnostics: {},
    synchronization: { dynamicRegistration: false, didSave: false },
  },
  workspace: { workspaceFolders: true, configuration: true },
  window: { workDoneProgress: true },
};

async function lifecycleProbe(label, command, args, fixtureDir, files, languageId) {
  const probe = new LspProbe(label, command, args, fixtureDir);
  for (const m of ["window/workDoneProgress/create", "client/registerCapability",
                   "client/unregisterCapability", "window/showMessageRequest"]) {
    probe.onRequest(m, () => null);
  }
  probe.onRequest("workspace/configuration", (p) => ((p?.items) ?? []).map(() => ({})));

  await probe.request("initialize", {
    processId: process.pid,
    rootUri: pathToFileURL(fixtureDir).toString(),
    workspaceFolders: [{ uri: pathToFileURL(fixtureDir).toString(), name: "lifecycle" }],
    capabilities: CAPS,
  }, 30_000);
  probe.notify("initialized", {});

  const sessionStart = Date.now();
  const phases = [];
  for (let i = 0; i < files.length; i++) {
    const fileAbs = pathResolve(fixtureDir, files[i]);
    const text = readFileSync(fileAbs, "utf8");
    const phaseStart = Date.now();
    probe.notify("textDocument/didOpen", {
      textDocument: { uri: pathToFileURL(fileAbs).toString(), languageId, version: 1, text },
    });
    // Wait 2.5s — long enough to catch any $/progress that fires
    // for the file's analysis (gopls END frames have come within
    // ~600ms in the cold-start probe; warm timing should be similar
    // or faster).
    await new Promise((r) => setTimeout(r, 2_500));
    phases.push({ file: files[i], phaseStart, phaseEnd: Date.now() });
  }
  await probe.shutdown();

  const progress = probe.events.filter((e) => e.method === "$/progress");
  const pubdiag = probe.events.filter((e) => e.method === "textDocument/publishDiagnostics");

  console.log(`\n=== ${label} ===`);
  console.log(`  Phases (each = open one file + 2.5s wait):`);
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i];
    const inPhase = (e) => e.ts >= ph.phaseStart && e.ts <= ph.phaseEnd;
    const progressInPhase = progress.filter(inPhase);
    const pubdiagInPhase = pubdiag.filter(inPhase);
    console.log(`    Phase ${i + 1}: open ${ph.file} (Δ from session start +${ph.phaseStart - sessionStart}ms)`);
    console.log(`      $/progress events in phase: ${progressInPhase.length}`);
    for (const e of progressInPhase) {
      console.log(`        +${e.ts - sessionStart}ms ${JSON.stringify(e.params).slice(0, 200)}`);
    }
    console.log(`      publishDiagnostics events in phase: ${pubdiagInPhase.length}`);
    for (const e of pubdiagInPhase) {
      console.log(`        +${e.ts - sessionStart}ms diags=${e.params?.diagnostics?.length ?? 0} uri=${e.params?.uri?.split('/').slice(-1)[0]}`);
    }
  }
  console.log(`\n  Total $/progress events: ${progress.length}`);
  const tokens = new Set(progress.map((e) => String(e.params?.token)));
  console.log(`  Unique tokens: ${[...tokens].join(", ")}`);
  console.log(`  Conclusion: ${progress.filter((e) => e.params?.value?.kind === "begin").length === 1 ? "ONCE-PER-SESSION (single begin frame observed)" : "REPEATED PER WORKSPACE ACTIVITY (multiple begin frames)"}`);
}

async function main() {
  const tsCli = require.resolve("typescript-language-server/lib/cli.mjs");
  const goplsBin = process.env.CONTEXTATLAS_GOPLS_BIN ??
    "C:\\Users\\Travis\\go\\bin\\gopls.exe";

  await lifecycleProbe(
    "tsserver lifecycle (3 files, 2.5s gaps)",
    process.execPath,
    [tsCli, "--stdio"],
    pathResolve(FIXTURES, "typescript"),
    ["broken.ts", "sample.ts", "consumer.ts"],
    "typescript",
  );

  await lifecycleProbe(
    "gopls lifecycle (3 files, 2.5s gaps)",
    goplsBin,
    [],
    pathResolve(FIXTURES, "go"),
    ["broken.go", "kinds.go", "consumer.go"],
    "go",
  );
}

main().catch((err) => { console.error(err); process.exit(1); });
