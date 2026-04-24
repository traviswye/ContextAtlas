/**
 * Adapter registry — the single point where concrete LanguageAdapter
 * implementations are instantiated (ADR-03).
 *
 * Core code (src/mcp/, src/storage/, src/extraction/) must not import
 * concrete adapters directly. They receive a ready-made adapter via
 * dependency injection from here.
 */

import type { LanguageAdapter, LanguageCode } from "../types.js";

import { PyrightAdapter } from "./pyright.js";
import { TypeScriptAdapter } from "./typescript.js";

export function createAdapter(language: LanguageCode): LanguageAdapter {
  switch (language) {
    case "typescript":
      return new TypeScriptAdapter();
    case "python":
      return new PyrightAdapter();
    case "go":
      // GoAdapter lands in Commit 3 of Step 9 (ADR-14). This branch
      // exists to keep the switch exhaustive against LanguageCode
      // once "go" was added in Commit 2; extraction runs that target
      // `languages: [go]` fail fast with a clear message until the
      // adapter class is wired in.
      throw new Error(
        "Go adapter not yet implemented. " +
          "The `go` LanguageCode is registered but the GoAdapter class " +
          "lands in the next commit. Re-run after that commit ships.",
      );
    default: {
      const exhaustive: never = language;
      throw new Error(`Unknown language code: ${String(exhaustive)}`);
    }
  }
}
