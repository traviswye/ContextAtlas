import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LspClient } from "./lsp-client.js";

/**
 * Unit tests for the FO-5 fix at v0.7 Step 2.2.c (defensive stream-
 * state management in LspClient). Pre-fix behavior:
 *   - `sendRaw` threw on `!this.child`; uncaught from async respond
 *     callback in `dispatch()` = process crash
 *   - No 'error' listener on child.stdin; ERR_STREAM_WRITE_AFTER_END
 *     surfaced as unhandled Socket 'error' event = process crash
 *   - Subprocess unexpected exit had no remediation guidance to user
 *
 * γ hybrid fix (Travis Lock 1):
 *   - sendRaw: defensive no-op + log warn instead of throw
 *   - stdin 'error' listener: catches stream errors
 *   - child 'exit' listener: emits remediation guidance to stderr
 *     when subprocess exited WITHOUT prior `stop()` invocation
 *   - request(): upfront subprocess-state check preserves clear-
 *     error UX for callers (immediate rejection on `!this.child`)
 */

describe("LspClient FO-5 fix — defensive stream-state management", () => {
  let stderrChunks: string[];
  let writeStderr: (chunk: string) => void;

  beforeEach(() => {
    stderrChunks = [];
    writeStderr = (chunk: string) => {
      stderrChunks.push(chunk);
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("request() rejects immediately when subprocess is not started (clear-error UX)", async () => {
    const client = new LspClient("test", { writeStderr });
    await expect(client.request("any/method")).rejects.toThrow(
      /LSP client 'test' is not started/,
    );
  });

  it("notify() on un-started client is a no-op (does not throw)", () => {
    const client = new LspClient("test", { writeStderr });
    // Pre-fix this would have thrown via sendRaw's `!this.child` check.
    // Post-fix it logs warn + returns silently.
    expect(() => client.notify("any/method", { foo: "bar" })).not.toThrow();
  });

  it("subprocess unexpected exit emits remediation guidance to stderr", async () => {
    // Spawn a tiny subprocess that exits immediately (echo command on
    // Windows / Unix). Subprocess exits without `stop()` being called
    // = unexpected exit → remediation message expected.
    const client = new LspClient("test-exit", { writeStderr });
    const isWindows = process.platform === "win32";
    const cmd = isWindows ? "cmd.exe" : "sh";
    const args = isWindows ? ["/c", "exit 0"] : ["-c", "exit 0"];
    client.start(cmd, args, process.cwd());

    // Wait for subprocess to exit + listener to fire.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const combined = stderrChunks.join("");
    expect(combined).toContain("test-exit LSP subprocess exited unexpectedly");
    expect(combined).toContain("degraded state");
    expect(combined).toContain("Open an issue");
  });

  it("stop() suppresses remediation guidance (intentional shutdown)", async () => {
    // Spawn a long-running subprocess; call stop(); verify no
    // remediation message in stderr (shuttingDown=true short-circuits
    // the warning). Uses `node -e "setTimeout(...)"` rather than
    // `timeout`/`sleep` because Windows' `cmd /c timeout` fails fast
    // when not attached to a console (exit code 125) and surfaces as
    // an unexpected-exit before stop() can run.
    //
    // Test timeout extended to 10s: stop()'s internal `shutdown` LSP
    // request times out at 5s when the subprocess isn't a real LSP
    // server (this test fixture isn't); stop() proceeds with stdin
    // end + kill afterward. Total ~5-6s in practice.
    const client = new LspClient("test-stop", { writeStderr });
    client.start(
      process.execPath,
      ["-e", "setTimeout(() => {}, 30000)"],
      process.cwd(),
    );
    // Brief delay so subprocess fully spawns + start handlers wire up.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await client.stop();

    const combined = stderrChunks.join("");
    expect(combined).not.toContain("exited unexpectedly");
  }, 15_000);

  it("sendRaw (via notify) on a closed-stdin client does not crash the process", async () => {
    // Spawn subprocess; wait for exit; THEN attempt notify. Without
    // FO-5 fix this surfaces ERR_STREAM_WRITE_AFTER_END as an
    // unhandled 'error' event = process crash. With FO-5 fix the
    // notify is a no-op (sendRaw returns silently).
    const client = new LspClient("test-after-exit", { writeStderr });
    const isWindows = process.platform === "win32";
    const cmd = isWindows ? "cmd.exe" : "sh";
    const args = isWindows ? ["/c", "exit 0"] : ["-c", "exit 0"];
    client.start(cmd, args, process.cwd());
    // Wait for exit listener to fire + this.child = null.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(() => client.notify("any/method")).not.toThrow();
  });
});
