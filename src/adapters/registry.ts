/**
 * Adapter registry — the single point where concrete LanguageAdapter
 * implementations are instantiated (ADR-03).
 *
 * Core code (src/mcp/, src/storage/, src/extraction/) must not import
 * concrete adapters directly. They receive a ready-made adapter via
 * dependency injection from here.
 */

import type { LanguageAdapter, LanguageCode } from "../types.js";

import { GoAdapter } from "./go.js";
import { PyrightAdapter } from "./pyright.js";
import { TypeScriptAdapter } from "./typescript.js";

export interface CreateAdapterOptions {
  /**
   * Override the LSP `initialize` request timeout (ms). Per v0.7
   * Step 2.2.d FO-6 (β) diagnostic substrate: configurable via
   * `.contextatlas.yml` `lsp.initialize_timeout_ms`; threads through
   * to per-adapter `requestTimeoutMs` option. Default per-adapter
   * (30000ms for pyright + typescript-language-server; gopls uses
   * its own default).
   */
  initializeTimeoutMs?: number;
}

export function createAdapter(
  language: LanguageCode,
  options: CreateAdapterOptions = {},
): LanguageAdapter {
  const initializeTimeoutMs = options.initializeTimeoutMs;
  switch (language) {
    case "typescript":
      return new TypeScriptAdapter(
        initializeTimeoutMs !== undefined
          ? { requestTimeoutMs: initializeTimeoutMs }
          : undefined,
      );
    case "python":
      return new PyrightAdapter(
        initializeTimeoutMs !== undefined
          ? { requestTimeoutMs: initializeTimeoutMs }
          : {},
      );
    case "go":
      return new GoAdapter(
        initializeTimeoutMs !== undefined
          ? { requestTimeoutMs: initializeTimeoutMs }
          : undefined,
      );
    default: {
      const exhaustive: never = language;
      throw new Error(`Unknown language code: ${String(exhaustive)}`);
    }
  }
}
