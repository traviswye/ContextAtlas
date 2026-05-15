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
    case "ruby":
      // Placeholder per v0.9 Stream A Phase 2 type substrate landing
      // ahead of Phase 3 RubyAdapter implementation. Matches ADR-13
      // precedent: registry case lands with placeholder throw during
      // pre-implementation; replaced with `new RubyAdapter(...)` at
      // Phase 3 ship. ADR-21 documents the adapter design substrate
      // this placeholder anchors against.
      throw new Error(
        "RubyAdapter not yet implemented (v0.9 Stream A Phase 3 work). " +
          "Type substrate for Ruby landed at Phase 2; adapter implementation " +
          "follows per ADR-21 Decision section. See docs/adr/" +
          "ADR-21-ruby-adapter-ruby-lsp.md.",
      );
    default: {
      const exhaustive: never = language;
      throw new Error(`Unknown language code: ${String(exhaustive)}`);
    }
  }
}
