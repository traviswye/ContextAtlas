import { resolve as pathResolve } from "node:path";

import { runConformanceSuite } from "./conformance.js";
import { GoAdapter } from "./go.js";

/**
 * Conformance-suite runner for GoAdapter. The suite itself is defined
 * in src/adapters/conformance.ts; this file wires it to the existing
 * test/fixtures/go/ directory and the symbol names that fixture
 * exposes.
 *
 * The existing `go.test.ts` covers Go-specific behavior (receiver
 * encoding, interface-method flattening, iota handling, cross-package
 * implementation, build-tag files). This conformance file proves the
 * interface contract holds uniformly across adapters (ADR-03).
 *
 * Fixture assumptions satisfied:
 *   - kinds.go declares Rectangle (struct → kind "class"),
 *     NewRectangle (kind "function"), and many other symbols
 *   - broken.go has a deliberate type error (anonymous function body
 *     returning a value despite no return type) — see broken.go
 *   - consumer.go references NewRectangle, satisfying the
 *     cross-file findReferences assertion
 *
 * PATH enrichment is handled by go.test.ts's module-scope setup.
 * Vitest may execute conformance and integration suites in either
 * order; the repeated enrichment is idempotent.
 */

function enrichGoPath(): void {
  const candidates = [
    "C:\\Program Files\\Go\\bin",
    process.env.USERPROFILE
      ? `${process.env.USERPROFILE}\\go\\bin`
      : null,
    process.env.HOME ? `${process.env.HOME}/go/bin` : null,
    "/usr/local/go/bin",
  ].filter((p): p is string => typeof p === "string");
  const sep = process.platform === "win32" ? ";" : ":";
  const parts = [...candidates, process.env.PATH ?? ""].filter(Boolean);
  process.env.PATH = parts.join(sep);
}

enrichGoPath();

runConformanceSuite(
  "GoAdapter",
  () => new GoAdapter(),
  {
    fixtureRoot: pathResolve("test/fixtures/go"),
    files: {
      sample: "kinds.go",
      broken: "broken.go",
      consumer: "consumer.go",
    },
    symbols: {
      classSymbol: "Rectangle",
      functionSymbol: "NewRectangle",
      referencedSymbol: "NewRectangle",
    },
  },
);
