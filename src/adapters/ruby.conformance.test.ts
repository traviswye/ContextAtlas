import { resolve as pathResolve } from "node:path";

import { runConformanceSuite } from "./conformance.js";
import { RubyAdapter } from "./ruby.js";

/**
 * Conformance-suite runner for RubyAdapter. Wires the shared
 * behavioral spec (src/adapters/conformance.ts) to the canonical
 * Ruby fixture at test/fixtures/ruby/ — promoted from the probe
 * fixture per ADR-21 (v0.9 Substep 4.1, commit 6f9ae29).
 *
 * Language-specific behavior (kind-6-uniform callable mapping per
 * Path β c54ff7c, pull-model diagnostic handling, URL-encoding
 * dedup, DSL macro kind-6 acceptance, self.method preserve-verbatim,
 * declaration-parse extends/implements) is covered in `ruby.test.ts`.
 * This file exists solely to prove the LanguageAdapter interface
 * contract holds uniformly across adapters (ADR-03's plugin premise).
 *
 * Fixture assumptions satisfied:
 *   - sample.rb declares Greeter (class → kind "class"),
 *     format_greeting (top-level def → kind "method" per Ruby's
 *     kind-6-uniform callable mapping; conformance harness
 *     functionSymbol assertion accepts ["function", "method"]
 *     per Path β c54ff7c)
 *   - broken.rb has a deliberate parse error (unclosed paren in
 *     method signature) — ruby-lsp's pull-model diagnostic surfaces
 *     this as severity "error"
 *   - consumer.rb references Greeter (instantiation + method calls)
 *     satisfying the cross-file findReferences assertion
 *
 * PATH enrichment per gopls precedent (go.conformance.test.ts:30-44).
 * Ruby's install variation is wider than Go's (multiple RubyInstaller
 * major versions on Windows; Homebrew Intel vs Apple Silicon split on
 * macOS); conservative candidate list per Path P-1 scope:
 *   - Windows: RubyInstaller 3.3 / 3.4 / 4.0 default install roots
 *   - macOS: Homebrew Intel + Apple Silicon ruby formula paths
 *   - Linux: system + commonly-built /usr/local locations
 *
 * Rbenv / RVM / chocolatey / non-default installer paths are
 * deliberately NOT enumerated here — those cohort-UX surfaces are
 * Phase-5-doctor-substrate concerns, not conformance-test concerns.
 * Conformance test's job is plugin-contract proof (ADR-03); doctor
 * surface absorbs install-path-detection responsibility per cohort
 * onboarding flow (ADR-21 §Install Pattern + Phase 5 sweep).
 *
 * Vitest may execute conformance and integration suites in either
 * order; the repeated enrichment is idempotent.
 */

function enrichRubyPath(): void {
  const candidates = [
    // Windows RubyInstaller — major versions matching ADR-21
    // §Cohort-version range (Ruby 3.3+ minimum; Ruby 4.0+ recommended).
    "C:\\Ruby40-x64\\bin",
    "C:\\Ruby34-x64\\bin",
    "C:\\Ruby33-x64\\bin",
    // macOS Homebrew — Intel (/usr/local) + Apple Silicon (/opt/homebrew).
    "/usr/local/opt/ruby/bin",
    "/opt/homebrew/opt/ruby/bin",
    // Linux system + commonly-built locations.
    "/usr/bin",
    "/usr/local/bin",
  ].filter((p): p is string => typeof p === "string");
  const sep = process.platform === "win32" ? ";" : ":";
  const parts = [...candidates, process.env.PATH ?? ""].filter(Boolean);
  process.env.PATH = parts.join(sep);
}

enrichRubyPath();

runConformanceSuite(
  "RubyAdapter",
  () => new RubyAdapter(),
  {
    fixtureRoot: pathResolve("test/fixtures/ruby"),
    files: {
      sample: "sample.rb",
      broken: "broken.rb",
      consumer: "consumer.rb",
    },
    symbols: {
      // Greeter is a regular class (kind === "class").
      classSymbol: "Greeter",
      // format_greeting is a top-level def; Ruby's kind-6-uniform
      // callable mapping → kind "method". Conformance harness
      // functionSymbol assertion accepts ["function", "method"] per
      // Path β (c54ff7c).
      functionSymbol: "format_greeting",
      // consumer.rb instantiates Greeter and calls its methods, so
      // findReferences(Greeter) returns ≥1 hit in consumer.rb.
      referencedSymbol: "Greeter",
    },
  },
);
