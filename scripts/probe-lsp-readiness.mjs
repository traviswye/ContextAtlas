/**
 * v0.4 Step 1.1b — LSP readiness-signal probe.
 *
 * For each of (tsserver via typescript-language-server, pyright-
 * langserver, gopls), capture every incoming server notification
 * with timestamps relative to didOpen so we can answer:
 *   1. Does the server emit $/progress notifications around
 *      diagnostic computation?
 *   2. What token shapes does it use, and does the End frame fire
 *      before / with / after publishDiagnostics?
 *   3. Are there other notification methods worth treating as
 *      readiness signals?
 *
 * Outputs to stdout as a flat per-message log per server, plus a
 * trailing summary block that the findings note consumes verbatim.
 *
 * Throwaway — discard after Step 1.5 ADR-13/14 amendments land.
 */
import { spawn } from "node:child_process";
import { resolve as pathResolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const REPO_ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = pathResolve(REPO_ROOT, "test", "fixtures");
const require = createRequire(import.meta.url);

// Ensure gopls finds `go` — same workaround scripts/gopls-probe.ts uses.
const GO_BIN_DIRS = [
  "C:\\Program Files\\Go\\bin",
  "C:\\Users\\Travis\\go\\bin",
];
process.env.PATH = [...GO_BIN_DIRS, process.env.PATH ?? ""]
  .filter(Boolean)
  .join(";");

/**
 * Minimal raw-stdio LSP probe. Owns its own framing so we can log
 * EVERY incoming message — LspClient drops unknown notifications.
 */
class LspProbe {
  constructor(label, command, args, cwd) {
    this.label = label;
    this.cwd = cwd;
    this.proc = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.requestHandlers = new Map();
    this.events = []; // { ts, kind, method, id?, params?, result? }
    this.startTs = 0;
    this.proc.stdout.on("data", (chunk) => this.handleData(chunk));
    this.proc.stderr.on("data", (chunk) => {
      const s = chunk.toString("utf8").trimEnd();
      if (s) this.events.push({ ts: Date.now(), kind: "stderr", text: s });
    });
    this.proc.on("error", (err) => {
      this.events.push({ ts: Date.now(), kind: "proc-error", err: String(err) });
    });
  }
  onRequest(method, handler) {
    this.requestHandlers.set(method, handler);
  }
  send(method, params, id) {
    const msg = id !== undefined
      ? { jsonrpc: "2.0", id, method, params }
      : { jsonrpc: "2.0", method, params };
    this.sendRaw(msg);
  }
  request(method, params, timeoutMs = 30_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.label}: '${method}' timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, t });
      this.sendRaw({ jsonrpc: "2.0", id, method, params });
    });
  }
  notify(method, params) {
    this.sendRaw({ jsonrpc: "2.0", method, params });
  }
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
      const header = this.buffer.subarray(0, headerEnd).toString("utf8");
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) {
        this.buffer = Buffer.alloc(0);
        return;
      }
      const length = parseInt(m[1], 10);
      const total = headerEnd + 4 + length;
      if (this.buffer.length < total) break;
      const payload = this.buffer.subarray(headerEnd + 4, total).toString("utf8");
      this.buffer = this.buffer.subarray(total);
      this.dispatch(payload);
    }
  }
  dispatch(payload) {
    let msg;
    try { msg = JSON.parse(payload); } catch { return; }
    const ts = Date.now();
    // Response to our request
    if (typeof msg.id === "number" && msg.method === undefined &&
        (msg.result !== undefined || msg.error !== undefined)) {
      const p = this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.t);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result ?? null);
      }
      this.events.push({ ts, kind: "response", id: msg.id });
      return;
    }
    // Server-initiated request
    if (msg.method && msg.id !== undefined && msg.id !== null) {
      this.events.push({ ts, kind: "server-request", method: msg.method, id: msg.id, params: msg.params });
      const handler = this.requestHandlers.get(msg.method);
      const respond = (result) => this.sendRaw({ jsonrpc: "2.0", id: msg.id, result });
      if (handler) Promise.resolve(handler(msg.params)).then(respond).catch(() => respond(null));
      else respond(null);
      return;
    }
    // Notification — the meat of this probe.
    if (msg.method) {
      this.events.push({ ts, kind: "notification", method: msg.method, params: msg.params });
    }
  }
  async shutdown() {
    try { await this.request("shutdown", null, 3_000); } catch {}
    try { this.notify("exit"); } catch {}
    try { this.proc.stdin.end(); } catch {}
    await new Promise((r) => setTimeout(r, 200));
    if (!this.proc.killed) this.proc.kill();
  }
}

const CLIENT_CAPABILITIES = {
  textDocument: {
    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
    publishDiagnostics: { relatedInformation: true },
    synchronization: { dynamicRegistration: false, didSave: false },
  },
  workspace: { workspaceFolders: true, configuration: true },
  // Critical: advertise window.workDoneProgress so server-initiated
  // $/progress flows trigger window/workDoneProgress/create requests.
  window: { workDoneProgress: true },
};

function toFileUri(absPath) {
  return pathToFileURL(absPath).toString();
}

async function probeOne(label, command, args, fixtureDir, fixtureFile, languageId) {
  const probe = new LspProbe(label, command, args, fixtureDir);
  // Stub all server-initiated requests as null (success).
  for (const m of [
    "window/workDoneProgress/create",
    "client/registerCapability",
    "client/unregisterCapability",
    "window/showMessageRequest",
  ]) {
    probe.onRequest(m, () => null);
  }
  // gopls requires length-matched array on workspace/configuration.
  probe.onRequest("workspace/configuration", (params) => {
    const items = (params && params.items) ?? [];
    return items.map(() => ({}));
  });

  await probe.request("initialize", {
    processId: process.pid,
    rootUri: toFileUri(fixtureDir),
    workspaceFolders: [{ uri: toFileUri(fixtureDir), name: "probe" }],
    capabilities: CLIENT_CAPABILITIES,
  }, 30_000);
  probe.notify("initialized", {});

  // Mark the didOpen timestamp — this is the "t=0" anchor for all
  // subsequent notifications.
  const fixtureAbs = pathResolve(fixtureDir, fixtureFile);
  const text = readFileSync(fixtureAbs, "utf8");
  const didOpenTs = Date.now();
  probe.startTs = didOpenTs;
  probe.notify("textDocument/didOpen", {
    textDocument: { uri: toFileUri(fixtureAbs), languageId, version: 1, text },
  });

  // Wait for the first publishDiagnostics for our URI, then keep
  // listening for an additional 1.5s tail to catch trailing
  // $/progress End frames. Hard ceiling 12s.
  const targetUri = toFileUri(fixtureAbs);
  const deadline = Date.now() + 12_000;
  let firstPublishTs = null;
  while (Date.now() < deadline) {
    const e = probe.events.find(
      (e) => e.kind === "notification" &&
            e.method === "textDocument/publishDiagnostics" &&
            e.params && e.params.uri === targetUri,
    );
    if (e) { firstPublishTs = e.ts; break; }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (firstPublishTs) {
    await new Promise((r) => setTimeout(r, 1_500));
  }
  await probe.shutdown();

  return {
    label,
    didOpenTs,
    firstPublishTs,
    events: probe.events,
  };
}

function dumpReport(label, result) {
  const { didOpenTs, firstPublishTs, events } = result;
  console.log(`\n${"=".repeat(70)}`);
  console.log(`${label}`);
  console.log("=".repeat(70));
  if (firstPublishTs === null) {
    console.log(`  WARNING: no publishDiagnostics observed within 12s ceiling`);
  } else {
    console.log(`  publishDiagnostics arrived @ +${firstPublishTs - didOpenTs}ms`);
  }
  console.log(`  total events captured: ${events.length}`);
  console.log("");
  console.log(`  events (timestamp delta from didOpen, in ms):`);
  for (const e of events) {
    const dt = e.ts - didOpenTs;
    if (e.kind === "stderr") {
      console.log(`    +${dt}ms  [stderr]  ${e.text.slice(0, 200)}`);
    } else if (e.kind === "proc-error") {
      console.log(`    +${dt}ms  [proc-error]  ${e.err}`);
    } else if (e.kind === "server-request") {
      console.log(`    +${dt}ms  [req<-server] ${e.method}  id=${e.id}` +
        (e.method === "$/progress" || e.method === "window/workDoneProgress/create"
          ? `  params=${JSON.stringify(e.params).slice(0, 200)}`
          : ""));
    } else if (e.kind === "notification") {
      const summary =
        e.method === "$/progress"
          ? `  params=${JSON.stringify(e.params).slice(0, 240)}`
          : e.method === "textDocument/publishDiagnostics"
          ? `  diagnostics=${(e.params?.diagnostics?.length ?? 0)}`
          : e.method === "window/logMessage" || e.method === "window/showMessage"
          ? `  msg=${JSON.stringify(e.params?.message ?? "").slice(0, 120)}`
          : e.method === "telemetry/event"
          ? `  payload=${JSON.stringify(e.params).slice(0, 160)}`
          : "";
      console.log(`    +${dt}ms  [notif]   ${e.method}${summary}`);
    } else if (e.kind === "response") {
      console.log(`    +${dt}ms  [resp]    id=${e.id}`);
    }
  }
}

function summarize(results) {
  console.log(`\n${"#".repeat(70)}`);
  console.log("# Per-server summary");
  console.log("#".repeat(70));
  for (const r of results) {
    const dt = r.firstPublishTs ? r.firstPublishTs - r.didOpenTs : null;
    const progressEvents = r.events.filter(
      (e) => e.kind === "notification" && e.method === "$/progress",
    );
    const createReqs = r.events.filter(
      (e) => e.kind === "server-request" && e.method === "window/workDoneProgress/create",
    );
    const tokens = new Set();
    for (const p of progressEvents) {
      const tok = p.params?.token;
      if (tok !== undefined) tokens.add(String(tok));
    }
    const beforePub = r.firstPublishTs
      ? progressEvents.filter((e) => e.ts <= r.firstPublishTs).length
      : 0;
    const afterPub = r.firstPublishTs
      ? progressEvents.filter((e) => e.ts > r.firstPublishTs).length
      : 0;

    console.log(`\n${r.label}:`);
    console.log(`  publishDiagnostics arrival: ${dt === null ? "(none)" : `+${dt}ms`}`);
    console.log(`  workDoneProgress/create requests: ${createReqs.length}`);
    console.log(`  $/progress notifications: ${progressEvents.length} (before pub: ${beforePub}, after pub: ${afterPub})`);
    console.log(`  $/progress unique tokens: [${[...tokens].join(", ")}]`);
    if (progressEvents.length > 0) {
      console.log(`  sample $/progress payloads:`);
      for (const p of progressEvents.slice(0, 6)) {
        console.log(`    +${p.ts - r.didOpenTs}ms  ${JSON.stringify(p.params).slice(0, 160)}`);
      }
    }
  }
}

async function main() {
  const tsCli = require.resolve("typescript-language-server/lib/cli.mjs");
  const pyrightCli = require.resolve("pyright/langserver.index.js");
  const goplsBin = process.env.CONTEXTATLAS_GOPLS_BIN ??
    "C:\\Users\\Travis\\go\\bin\\gopls.exe";

  const results = [];

  console.log("# Probing tsserver...");
  results.push(await probeOne(
    "tsserver (via typescript-language-server)",
    process.execPath,
    [tsCli, "--stdio"],
    pathResolve(FIXTURES, "typescript"),
    "broken.ts",
    "typescript",
  ));

  console.log("# Probing pyright-langserver...");
  results.push(await probeOne(
    "pyright-langserver",
    process.execPath,
    [pyrightCli, "--stdio"],
    pathResolve(FIXTURES, "python"),
    "broken.py",
    "python",
  ));

  console.log("# Probing gopls...");
  results.push(await probeOne(
    "gopls",
    goplsBin,
    [],
    pathResolve(FIXTURES, "go"),
    "broken.go",
    "go",
  ));

  for (const r of results) dumpReport(r.label, r);
  summarize(results);
}

main().catch((err) => {
  console.error("PROBE FAILED:", err);
  process.exit(1);
});
