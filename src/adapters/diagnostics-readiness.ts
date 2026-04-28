/**
 * Shared bounded-poll helpers for LSP adapter readiness signals.
 *
 * Background — two distinct readiness signals matter:
 *
 *   1. Server-readiness (cold-start, one-shot per session). The
 *      LSP server has finished initial workspace load and can
 *      compute diagnostics for any opened file. tsserver + gopls
 *      emit a `$/progress` BEGIN→END pair for this; pyright does
 *      not (its cold-start is fast enough that the per-call
 *      diagnostics ceiling absorbs cold-start variance).
 *
 *   2. Per-file readiness (per-call). Diagnostics for a specific
 *      URI have been computed and pushed via
 *      `textDocument/publishDiagnostics`. This is the only signal
 *      for "diagnostics for this file are ready" — there is no
 *      stronger surface across the three servers we drive.
 *
 * v0.4 Step 1.1b probe (benchmarks repo
 * `research/v0.4-step-1-1b-lsp-readiness-probe.md`) is the
 * empirical anchor.
 */

import type { LspClient } from "./lsp-client.js";

export interface ProgressParams {
  token?: number | string;
  value?: {
    kind?: "begin" | "report" | "end";
    title?: string;
    message?: string;
  };
}

/**
 * Wait for the server's cold-start `$/progress` END frame (paired
 * with a BEGIN frame whose title matches `matchesBegin`), or for
 * `ceilingMs` to elapse. Whichever resolves first wins; the
 * ceiling acts as a safety net.
 *
 * Adapters with no clean cold-start `$/progress` (pyright) pass a
 * predicate that never matches; the ceiling fires after `ceilingMs`,
 * sized as a generous cold-start budget so per-call ceilings can
 * stay tight.
 *
 * Token-tracking matters because tsserver's END frame contains
 * only `{kind: "end"}` — title is on BEGIN. We capture the token
 * from a matching BEGIN and resolve only on END for the same
 * token, so unrelated `$/progress` flows can't accidentally
 * satisfy this.
 */
export function waitForServerReady(
  client: LspClient,
  matchesBegin: (params: ProgressParams) => boolean,
  ceilingMs: number,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let coldStartToken: number | string | null = null;
    const timer = setTimeout(() => resolve(), ceilingMs);
    client.onNotification("$/progress", (params) => {
      const p = params as ProgressParams;
      if (
        p?.value?.kind === "begin" &&
        coldStartToken === null &&
        matchesBegin(p) &&
        p.token !== undefined
      ) {
        coldStartToken = p.token;
      } else if (
        p?.value?.kind === "end" &&
        coldStartToken !== null &&
        p.token === coldStartToken
      ) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/**
 * Wait for the next `textDocument/publishDiagnostics` push for a
 * given URI key (caller populates `diagnosticsListeners`), or for
 * `ceilingMs` to elapse. Lifts the inline listener-race pattern
 * that previously lived inside each adapter's `getDiagnostics`.
 */
export function waitForDiagnostics(
  uriKey: string,
  diagnosticsListeners: Map<string, () => void>,
  ceilingMs: number,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      diagnosticsListeners.delete(uriKey);
      resolve();
    }, ceilingMs);
    diagnosticsListeners.set(uriKey, () => {
      clearTimeout(timer);
      diagnosticsListeners.delete(uriKey);
      resolve();
    });
  });
}
