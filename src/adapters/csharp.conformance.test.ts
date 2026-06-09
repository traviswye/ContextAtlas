import { resolve as pathResolve } from "node:path";

import { runConformanceSuite } from "./conformance.js";
import { CsharpAdapter, enrichPathForDotnetTools } from "./csharp.js";

/**
 * Conformance-suite runner for CsharpAdapter. Wires the shared
 * behavioral spec (src/adapters/conformance.ts) to the canonical
 * C# fixture at test/fixtures/csharp/ per ADR-22 (v1.1 Phase 4
 * Substep 4.3).
 *
 * Language-specific behavior (record-as-class kind-5 mapping per
 * ADR-22 §Symbol-kind, pull-model diagnostic handling per ADR-22
 * §Diagnostics, hover-based signature refinement per ADR-22
 * §getSymbolDetails, XML doc parsing per ADR-22 §getDocstring) is
 * covered in csharp.test.ts (TBD). This file exists solely to prove
 * the LanguageAdapter interface contract holds uniformly across
 * adapters (ADR-03's plugin premise).
 *
 * Fixture assumptions satisfied:
 *   - Sample.cs declares Greeter (class → kind "class") and
 *     FormatGreeting (method → kind "method"; C# has no free
 *     functions, all callables are methods. Conformance harness
 *     functionSymbol assertion accepts ["function", "method"] per
 *     ADR-21 Path β c54ff7c + Ruby kind-6-uniform precedent).
 *   - Broken.cs has a deliberate parse error (unclosed paren in
 *     method signature) — csharp-ls (via Roslyn) pull-model
 *     diagnostic surfaces this as severity "error".
 *   - Consumer.cs references Greeter (instantiation + method calls)
 *     satisfying the cross-file findReferences assertion. Existing
 *     User / IUserService / Analytics references preserved from
 *     Phase 0-3 substrate (Path B substrate-continuity precedent
 *     per c54ff7c + 6f9ae29).
 *
 * PATH enrichment per ADR-22 §"Windows PATH-enrichment for dotnet
 * tools". csharp-ls installs as a .NET global tool to
 * `%USERPROFILE%\.dotnet\tools` (Windows) or `~/.dotnet/tools`
 * (Linux/macOS); Bash/Git-Bash on Windows does NOT inherit this
 * path from the SDK installer's PowerShell-only configuration.
 * Parallel to ADR-21 RUBY_BIN_DIRS + ADR-14 gopls "Go binary must
 * be on PATH" finding. Re-uses the adapter's exported
 * `enrichPathForDotnetTools()` for consistency; the adapter also
 * invokes it internally before spawn (idempotent).
 *
 * Non-default dotnet install paths (custom `DOTNET_ROOT`, system-
 * wide installs at `/usr/local/share/dotnet`, etc.) are deliberately
 * NOT enumerated here — those cohort-UX surfaces are Phase 5 doctor
 * substrate concerns, not conformance-test concerns. Conformance
 * test's job is plugin-contract proof (ADR-03); doctor surface
 * absorbs install-path-detection responsibility per cohort
 * onboarding flow (ADR-22 §Toolchain + Phase 5 sweep).
 *
 * Vitest may execute conformance and integration suites in either
 * order; the repeated enrichment is idempotent.
 */

enrichPathForDotnetTools();

runConformanceSuite(
  "CsharpAdapter",
  () => new CsharpAdapter(),
  {
    fixtureRoot: pathResolve("test/fixtures/csharp"),
    files: {
      sample: "Sample.cs",
      broken: "Broken.cs",
      consumer: "Consumer.cs",
    },
    symbols: {
      // Greeter is a regular class (kind === "class").
      classSymbol: "Greeter",
      // FormatGreeting is a method on Greeter; C# has no free
      // functions, all callables are methods. Conformance harness
      // functionSymbol assertion accepts ["function", "method"]
      // per Path β (c54ff7c).
      functionSymbol: "FormatGreeting",
      // Consumer.cs instantiates Greeter and calls its methods, so
      // findReferences(Greeter) returns ≥1 hit in Consumer.cs.
      referencedSymbol: "Greeter",
    },
  },
);
