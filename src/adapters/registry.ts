/**
 * Adapter registry — the single point where concrete LanguageAdapter
 * implementations are instantiated (ADR-03).
 *
 * Core code (src/mcp/, src/storage/, src/extraction/) must not import
 * concrete adapters directly. They receive a ready-made adapter via
 * dependency injection from here.
 */

import type { LanguageAdapter, LanguageCode } from "../types.js";

import { TypeScriptAdapter } from "./typescript.js";

export function createAdapter(language: LanguageCode): LanguageAdapter {
  switch (language) {
    case "typescript":
      return new TypeScriptAdapter();
    case "python":
      throw new Error(
        "Python adapter not yet implemented. Lands in step 9 of the build plan.",
      );
    default: {
      const exhaustive: never = language;
      throw new Error(`Unknown language code: ${String(exhaustive)}`);
    }
  }
}
