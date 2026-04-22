import { resolve as pathResolve } from "node:path";

import { runConformanceSuite } from "./conformance.js";
import { PyrightAdapter } from "./pyright.js";

/**
 * Conformance-suite runner for PyrightAdapter. Wires the shared
 * behavioral spec (src/adapters/conformance.ts) to the Python fixture
 * at test/fixtures/python/ — migrated from the probe fixture per
 * ADR-13.
 *
 * Language-specific behavior (Protocol→interface remap, type-alias
 * form handling, class-header parser edge cases) is covered in
 * `pyright.test.ts`. This file exists solely to prove the
 * LanguageAdapter interface contract holds uniformly across adapters
 * (ADR-03's plugin premise).
 */

runConformanceSuite(
  "PyrightAdapter",
  () => new PyrightAdapter(),
  {
    fixtureRoot: pathResolve("test/fixtures/python"),
    files: {
      sample: "sample.py",
      broken: "broken.py",
      consumer: "consumer.py",
    },
    symbols: {
      // Shape is a regular class (kind === "class").
      classSymbol: "Shape",
      functionSymbol: "greet",
      // consumer.py imports and uses `greet` from sample.py, so
      // findReferences(greet) returns ≥1 hit in consumer.py.
      referencedSymbol: "greet",
    },
  },
);
