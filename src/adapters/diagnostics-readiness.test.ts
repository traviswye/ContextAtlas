import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ProgressParams,
  waitForDiagnostics,
  waitForServerReady,
} from "./diagnostics-readiness.js";
import type { LspClient } from "./lsp-client.js";

/**
 * Minimal stub for LspClient — `waitForServerReady` only depends on
 * `onNotification`. Exposing an `emit` hook lets tests drive the
 * `$/progress` flow synchronously.
 */
function makeStubClient(): {
  client: LspClient;
  emit: (method: string, params: unknown) => void;
} {
  const handlers = new Map<string, (p: unknown) => void>();
  const stub = {
    onNotification(method: string, handler: (p: unknown) => void): void {
      handlers.set(method, handler);
    },
  };
  return {
    client: stub as unknown as LspClient,
    emit(method, params) {
      handlers.get(method)?.(params);
    },
  };
}

describe("waitForServerReady (ADR-18 server-readiness gate)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const matchesTest = (p: ProgressParams): boolean =>
    (p?.value?.title ?? "").startsWith("Test");

  it("resolves on matching BEGIN→END pair", async () => {
    const { client, emit } = makeStubClient();
    const promise = waitForServerReady(client, matchesTest, 5_000);
    emit("$/progress", {
      token: "tok-1",
      value: { kind: "begin", title: "Test load" },
    });
    emit("$/progress", { token: "tok-1", value: { kind: "end" } });
    await expect(promise).resolves.toBeUndefined();
  });

  it("does NOT resolve on END for a different token; ceiling fires instead", async () => {
    const { client, emit } = makeStubClient();
    const promise = waitForServerReady(client, matchesTest, 1_000);
    let settled = false;
    promise.then(() => {
      settled = true;
    });
    emit("$/progress", {
      token: "tok-real",
      value: { kind: "begin", title: "Test load" },
    });
    emit("$/progress", { token: "tok-other", value: { kind: "end" } });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(settled).toBe(true);
  });

  it("ignores BEGIN with non-matching title; ceiling fires", async () => {
    const { client, emit } = makeStubClient();
    const promise = waitForServerReady(client, matchesTest, 1_000);
    let settled = false;
    promise.then(() => {
      settled = true;
    });
    emit("$/progress", {
      token: "tok-other",
      value: { kind: "begin", title: "Other thing" },
    });
    emit("$/progress", { token: "tok-other", value: { kind: "end" } });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(settled).toBe(true);
  });

  it("captures token from FIRST matching BEGIN; subsequent BEGINs ignored", async () => {
    const { client, emit } = makeStubClient();
    const promise = waitForServerReady(client, matchesTest, 5_000);
    let settled = false;
    promise.then(() => {
      settled = true;
    });
    emit("$/progress", {
      token: "tok-first",
      value: { kind: "begin", title: "Test 1" },
    });
    emit("$/progress", {
      token: "tok-second",
      value: { kind: "begin", title: "Test 2" },
    });
    // END for the SECOND token — should NOT resolve since the
    // helper captured tok-first and ignored the subsequent BEGIN.
    emit("$/progress", { token: "tok-second", value: { kind: "end" } });
    await Promise.resolve();
    expect(settled).toBe(false);
    // END for the FIRST captured token — resolves.
    emit("$/progress", { token: "tok-first", value: { kind: "end" } });
    await promise;
    expect(settled).toBe(true);
  });

  it("resolves on ceiling when no $/progress ever arrives (pyright path)", async () => {
    const { client } = makeStubClient();
    const promise = waitForServerReady(client, () => false, 1_000);
    let settled = false;
    promise.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });
});

describe("waitForDiagnostics (ADR-18 per-file readiness)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when the listener fires; clears the listener entry", async () => {
    const listeners = new Map<string, () => void>();
    const promise = waitForDiagnostics("uri-1", listeners, 5_000);
    expect(listeners.has("uri-1")).toBe(true);
    listeners.get("uri-1")!();
    await expect(promise).resolves.toBeUndefined();
    expect(listeners.has("uri-1")).toBe(false);
  });

  it("resolves on ceiling when no listener fires; clears the listener entry", async () => {
    const listeners = new Map<string, () => void>();
    const promise = waitForDiagnostics("uri-1", listeners, 1_000);
    let settled = false;
    promise.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(listeners.has("uri-1")).toBe(false);
  });

  it("listener firing clears the ceiling timer (no double-resolve)", async () => {
    const listeners = new Map<string, () => void>();
    const promise = waitForDiagnostics("uri-1", listeners, 1_000);
    listeners.get("uri-1")!();
    await promise;
    // Advance well past the ceiling — should be a no-op since the
    // timer was cleared on listener fire.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(listeners.has("uri-1")).toBe(false);
  });
});
