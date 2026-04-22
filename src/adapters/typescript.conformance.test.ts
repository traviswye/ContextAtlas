import { resolve as pathResolve } from "node:path";

import { runConformanceSuite } from "./conformance.js";
import { TypeScriptAdapter } from "./typescript.js";

/**
 * Conformance-suite runner for TypeScriptAdapter. The suite itself is
 * defined in src/adapters/conformance.ts; this file wires it to the
 * existing test/fixtures/typescript/ directory and the symbol names
 * that fixture exposes.
 *
 * The existing `typescript.test.ts` covers language-specific behavior
 * (hover parsing, generic-bracket stripping, tsserver quirks). This
 * conformance file proves the interface contract holds uniformly
 * across adapters (ADR-03).
 */

runConformanceSuite(
  "TypeScriptAdapter",
  () => new TypeScriptAdapter(),
  {
    fixtureRoot: pathResolve("test/fixtures/typescript"),
    files: {
      sample: "sample.ts",
      broken: "broken.ts",
      consumer: "consumer.ts",
    },
    symbols: {
      classSymbol: "Calculator",
      functionSymbol: "greet",
      referencedSymbol: "Calculator",
    },
  },
);
