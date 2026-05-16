# Language Adapter Authoring Guide

This guide walks contributors through adding a new language adapter
to ContextAtlas. v1.0 ships TypeScript / Python / Go / Ruby; Rust /
Java / .NET / Kotlin / others are welcomed contributions.

**Audience:** community contributors. If you are looking for
internal discipline patterns + plan-substrate templates (Pattern 7
verification, pause-and-surface discipline, etc.), see
[`v1_1-INHERITANCE-SUBSTRATE.md`](v1_1-INHERITANCE-SUBSTRATE.md)
for the dev-team-internal companion document.

**Prerequisites:**

- Familiarity with TypeScript (strict mode)
- Familiarity with the Language Server Protocol (LSP) and the LSP
  server you intend to wrap
- Reading [DESIGN.md](../DESIGN.md) and [CONTRIBUTING.md](../CONTRIBUTING.md)
  end-to-end before opening an adapter PR

**Before you start:**

- File a [Language adapter request issue](https://github.com/traviswye/contextatlas/issues/new/choose)
  so we can discuss approach before substantive implementation
- Confirm the LSP server choice + version + stable install pattern

---

## 1. Understand the `LanguageAdapter` interface

The contract is in [`src/types.ts`](../src/types.ts):

```typescript
export interface LanguageAdapter {
  readonly language: LanguageCode;
  readonly extensions: readonly string[];

  // Data methods (6):
  listSymbols(filePath: string): Promise<Symbol[]>;
  getSymbolDetails(id: SymbolId): Promise<Symbol | null>;
  findReferences(id: SymbolId): Promise<Reference[]>;
  getDiagnostics(filePath: string): Promise<Diagnostic[]>;
  getTypeInfo(id: SymbolId): Promise<TypeInfo>;
  getDocstring(id: SymbolId): Promise<string | null>;

  // Lifecycle (2):
  initialize(rootPath: string): Promise<void>;
  shutdown(): Promise<void>;
}
```

Read [ADR-03](adr/ADR-03-language-adapter-plugin.md) for the plugin
architecture invariant — core code MUST NOT import concrete adapters
directly; the registry is the single integration point.

**Existing adapters as reference implementations:**

- [`src/adapters/typescript.ts`](../src/adapters/typescript.ts) — typescript-language-server
- [`src/adapters/pyright.ts`](../src/adapters/pyright.ts) — Pyright ([ADR-13](adr/ADR-13-python-adapter-pyright.md))
- [`src/adapters/go.ts`](../src/adapters/go.ts) — gopls ([ADR-14](adr/ADR-14-go-adapter-gopls.md))
- [`src/adapters/ruby.ts`](../src/adapters/ruby.ts) — ruby-lsp + ruby-lsp-rails ([ADR-21](adr/ADR-21-ruby-adapter-ruby-lsp.md))

Each adapter is ~1000-1500 LOC. Read the most structurally similar
adapter for your target language before designing.

---

## 2. Probe-phase substrate (optional but recommended)

Before authoring the adapter, write a probe script that exercises
your LSP server against a small fixture and captures empirical
responses. This grounds your ADR + adapter implementation in
observed behavior rather than documentation guesses.

**Probe script convention:**

- Location at probe time: `scripts/<language>-lsp-probe.ts`
- Archive at probe-phase close: `docs/adr/<language>-lsp-probe/`
  (subdirectory containing `<language>-lsp-probe.ts` + findings
  baseline + README) per K-2-ii consolidated archival pattern
- Reuse [`src/adapters/lsp-client.ts`](../src/adapters/lsp-client.ts)
  for the JSON-RPC framing
- Capture: initialize handshake + capabilities + documentSymbol +
  hover + references + definition + diagnostics

See [`docs/adr/ruby-lsp-probe/`](adr/ruby-lsp-probe/) for the most
recent example (Ruby adapter at v0.9). The Ruby probe substrate
captures ruby-lsp's actual capability advertisement + response
shapes against a synthetic Rails fixture.

---

## 3. Author an ADR

Per ADR-13 / ADR-14 / ADR-21 precedent shape, the adapter ADR
should cover:

- **Decision** — which LSP server + version range + why
- **Rationale** — why this LSP server vs alternatives
- **LSP primitive mappings** — how each LanguageAdapter method
  maps to LSP requests (and what's NOT supported and why)
- **Symbol-kind mapping** — language-specific kind → ContextAtlas
  SymbolKind table (per [ADR-01](adr/ADR-01-symbol-id-format.md)
  taxonomy)
- **Install pattern** — how cohort developers obtain the LSP server
  (peer dependency? PATH-resolved binary? Bundler-managed?)
- **Limitations** — known v1.0 scope-outs + v1.1+ candidates
- **Cohort-version range** — what versions of the LSP server +
  underlying language runtime the adapter targets

ADRs live in [`docs/adr/`](adr/) with naming convention
`ADR-NN-<slug>.md` + YAML frontmatter. Existing ADRs are templates.

---

## 4. Implement the adapter

**Add the language code:**

In [`src/types.ts`](../src/types.ts), extend `LanguageCode`:

```typescript
export type LanguageCode = "typescript" | "python" | "go" | "ruby" | "kotlin";

export const LANG_CODES: Record<LanguageCode, string> = {
  typescript: "ts",
  python: "py",
  go: "go",
  ruby: "rb",
  kotlin: "kt",  // your addition
} as const;
```

This is a stable public API addition (per [ADR-01](adr/ADR-01-symbol-id-format.md));
breaking changes to existing short codes require a major version bump.

**Author the adapter:**

Create `src/adapters/<language>.ts` implementing `LanguageAdapter`.
Recommended substep decomposition (matches v0.9 Ruby Phase 3 shape):

1. Skeleton (constructor, handlers, spawn, initialize, shutdown)
2. `listSymbols` (foundation for utility reuse)
3. `getSymbolDetails`
4. `findReferences`
5. `getDiagnostics`
6. `getTypeInfo` (declaration-parse + usedByTypes scope decision)
7. `getDocstring` (forward-composition consumer of #3 substrate if
   shared parsing applies)

Wall-clock estimate: ~1-1.5 weeks per Pyright/Ruby precedent.

**Wire into the registry:**

Edit [`src/adapters/registry.ts`](../src/adapters/registry.ts) to
add a case for your language. This is the ONLY core-code edit
required per [ADR-03](adr/ADR-03-language-adapter-plugin.md) plugin
invariant.

**Default exclude patterns:**

Edit [`src/config/exclude-patterns.ts`](../src/config/exclude-patterns.ts)
to add `<language>` defaults (test files, build artifacts, generated
code) to `DEFAULT_EXCLUDE_PATTERNS`.

---

## 5. Test substrate

ContextAtlas expects three layers of test coverage for each adapter:

**Unit tests** — `src/adapters/<language>.test.ts`:

- Pure-function helpers (kind mapping, ID parsing, dedup utilities, etc.)
- No adapter spawn / LSP-server dependency
- Vitest convention; adjacent to source file

**Conformance tests** — `src/adapters/<language>.conformance.test.ts`:

- ~60 LOC glue wiring the shared conformance harness
  ([`src/adapters/conformance.ts`](../src/adapters/conformance.ts)
  `runConformanceSuite`) to your fixture
- Proves the `LanguageAdapter` interface contract holds uniformly
  across adapters
- Fixture spec: `classSymbol` + `functionSymbol` + `referencedSymbol`
  in your `sample.<ext>` + `broken.<ext>` (parse error) +
  `consumer.<ext>` (cross-file reference)
- If your LSP requires non-default PATH setup, add a
  `enrichLanguagePath()` helper (see
  [`src/adapters/go.conformance.test.ts`](../src/adapters/go.conformance.test.ts)
  + [`src/adapters/ruby.conformance.test.ts`](../src/adapters/ruby.conformance.test.ts)
  for precedent)

**Doctor checks** — `src/doctor/checks/<language>-environment.ts`
(if substantive install/environment surface):

- Per [`src/doctor/checks/ruby-environment.ts`](../src/doctor/checks/ruby-environment.ts)
  precedent for languages with substantive install variation
- Use `category: "lsp"` per `src/doctor/types.ts` enum constraint
- Return null for non-applicable checks (orchestrator filters)
- Dispatched from `lsp.ts` `checkExecutable` branch

**Fixture conventions:**

Test fixtures live in `test/fixtures/<language>/`. Mirror existing
`test/fixtures/python/` + `test/fixtures/go/` + `test/fixtures/ruby/`
in structure.

---

## 6. Documentation surfaces

Update the following on your PR:

- [`README.md`](../README.md) — language-server setup paragraph
  (Runtime requirements section) + adapter checklist
- [`DESIGN.md`](../DESIGN.md) — LanguageCode short-code table +
  example config languages list
- [`ROADMAP.md`](../ROADMAP.md) — adapter status line
- [`package.json`](../package.json) — `keywords` field (your
  language)
- Your ADR — final version in `docs/adr/ADR-NN-<slug>.md`

Skip-with-rationale convention applies: if a documentation surface
mentions languages but doesn't need updating for your contribution
(e.g., MCP tool descriptions that are language-agnostic), call that
out in your PR description so reviewers can verify the skip is
deliberate.

---

## 7. PR checklist

Before opening the PR:

- [ ] ADR authored + linked in PR
- [ ] Adapter implementation passes `npm run typecheck`
- [ ] Unit tests adjacent to source (`<language>.test.ts`)
- [ ] Conformance test scaffold wires shared harness
  (`<language>.conformance.test.ts`)
- [ ] Doctor checks (if substantive install surface)
- [ ] Fixture authored at `test/fixtures/<language>/` (sample +
  broken + consumer)
- [ ] `src/types.ts` LanguageCode + LANG_CODES additions
- [ ] `src/adapters/registry.ts` registry case
- [ ] `src/config/exclude-patterns.ts` defaults
- [ ] README + DESIGN + ROADMAP + package.json doc updates
- [ ] `npm test` passes (or expected suite skips noted in PR)
- [ ] [Code of Conduct](../CODE_OF_CONDUCT.md) acknowledgment

---

## Reference materials

- [`v1_1-INHERITANCE-SUBSTRATE.md`](v1_1-INHERITANCE-SUBSTRATE.md)
  — internal discipline patterns + plan-substrate templates +
  cross-adapter pattern artifacts (Pattern 7 verification, pause-
  and-surface discipline, K-2-ii consolidated archival, etc.)
- [`adr/ADR-03-language-adapter-plugin.md`](adr/ADR-03-language-adapter-plugin.md)
  — plugin architecture invariant
- [`adr/ADR-13-python-adapter-pyright.md`](adr/ADR-13-python-adapter-pyright.md)
  — Pyright adapter (npm peer dep install pattern)
- [`adr/ADR-14-go-adapter-gopls.md`](adr/ADR-14-go-adapter-gopls.md)
  — gopls adapter (PATH-resolved install pattern; PATH-enrichment
  conformance helper)
- [`adr/ADR-21-ruby-adapter-ruby-lsp.md`](adr/ADR-21-ruby-adapter-ruby-lsp.md)
  — ruby-lsp + ruby-lsp-rails adapter (dual-pattern install + pull-
  model diagnostics + Rails-detection)

## Questions

Open a GitHub Issue or see [SUPPORT.md](../SUPPORT.md).
