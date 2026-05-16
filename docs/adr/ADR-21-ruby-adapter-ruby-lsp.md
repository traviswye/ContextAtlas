---
id: ADR-21
title: Ruby adapter uses ruby-lsp; ruby-lsp-rails as best-effort enhancement; pull-model diagnostics
status: accepted
severity: hard
symbols:
  - RubyAdapter
  - LanguageAdapter
  - TypeInfo
  - parseClassDeclaration
---

# ADR-21: Ruby adapter uses ruby-lsp; ruby-lsp-rails as best-effort enhancement; pull-model diagnostics

> **Frontmatter symbols note.** `LanguageAdapter` and `TypeInfo` exist
> in [`src/types.ts`](../../src/types.ts) today. `RubyAdapter` and
> `parseClassDeclaration` do NOT exist yet — they are committed to
> land in the implementation commit that follows this ADR. Extraction
> runs between this commit and the implementation commit will report
> those two as unresolved frontmatter hints. Same pattern as ADR-13's
> `PyrightAdapter` placeholder before the Python adapter implementation
> landed.

## Context

v0.9 Stream A ships a Ruby + Rails language adapter at language-parity
with TypeScript / Python / Go.
[ADR-03](ADR-03-language-adapter-plugin.md) names ruby-lsp as the
intended Ruby LSP;
[ADR-07](ADR-07-type-info-adapter-capability.md) requires every adapter
— Ruby included — to implement `getTypeInfo` with the same
`{ extends, implements, usedByTypes }` contract.

Cohort representation: Ruby on Rails is a substantively-represented
production framework. v1.0's four-language scope (TypeScript / Python /
Go / Ruby) covers the dominant statically-typed-friendly languages
(TS / Python with type hints / Go) plus one canonical dynamic-language
LSP target (Ruby). The typing-spectrum framing from v0.1 holds: ruby
sits at the dynamic-language end of the spectrum where ruby-lsp's
documented limits become Limitations rather than blockers.

Per the cycle-precedent gate, a probe phase ran against ruby-lsp 0.26.9
+ ruby-lsp-rails 0.4.8 before this ADR — empirical findings live in
[`docs/adr/ruby-lsp-probe/findings-baseline.md`](ruby-lsp-probe/findings-baseline.md)
(3915 lines, baseline-only capture per v0.9 Stream A Substep 3 Path
β+δ adjudication; the ruby-lsp-rails add-on did not load successfully
against the synthetic fixture). Decisions below cite probe findings or
documentation citations rather than guesses, with empirical-vs-cited
sources explicitly marked.

The probe surfaced four substantive load-bearing findings that re-shape
sections of this ADR beyond the pre-cycle framing:

1. **ruby-lsp baseline surfaces most Rails DSL macros** as
   documentSymbol entries directly — without the add-on. The "add-on
   delta" framing is materially narrower than the pre-cycle scope
   anticipated; the add-on enhances rather than enables Rails support.
2. **Diagnostics use LSP 3.17 pull-model**, not push-model. ruby-lsp
   advertises `diagnosticProvider: { workspaceDiagnostics: false }` and
   does not emit `textDocument/publishDiagnostics` notifications.
   Adapter must use `textDocument/diagnostic` REQUEST.
3. **Hover surfaces rich RDoc + rbs-derived content** when available
   (Rails source documentation, rbs type signatures, etc.) — closer to
   gopls pattern than Pyright pattern for the `getDocstring` path.
4. **ruby-lsp-rails requires a fully-bootable Rails app** to load
   successfully — its Rails-runner subprocess runs the complete
   `Rails.application.initialize!` sequence. The synthetic probe
   fixture surfaced an iteration-tail of Rails-boot requirements;
   adapter design treats the add-on as best-effort enhancement, NOT
   baseline assumption.

## Decision

### ruby-lsp 0.26.9 + ruby-lsp-rails 0.4.8 — stable-compatible pair

**ruby-lsp 0.26.9** (or any 0.26.x patch) is the sole Ruby LSP backend
for v1.0. **ruby-lsp-rails 0.4.8** is auto-loaded by ruby-lsp v0.3+
when Rails is detected (Gemfile presence + `bin/rails` heuristic per
ruby-lsp source). Pin per fixture Gemfile:

```ruby
group :development do
  gem 'ruby-lsp', '~> 0.26.0', require: false
  gem 'ruby-lsp-rails', '~> 0.4.8', require: false
end
```

**Stable-compatible pair derivation (Option D adjudication;
Pattern 7 surfaces 3-4):** ruby-lsp's stable max is 0.26.9 (May 2026),
but ruby-lsp-rails 0.4.8 depends on ruby-lsp `>= 0.26.0, < 0.27.0`
per Bundler's resolver-verified dependency graph. ruby-lsp 0.27+
(Rubydex-backed indexer rework per Rails-at-Scale 2026-05-12) and
ruby-lsp-rails 0.5.0+ exist only as pre-release at this date. v1.1
candidate tracks the upgrade to the 0.27+/0.5+ pair once both have
stable releases.

**Implication:** 0.26.x is pre-Rubydex; probe-findings on
`findReferences` reflect pre-Rubydex coverage shape. The pre-cycle
framing anticipated this as a substantial Limitation; empirical
findings show it is substantially narrower (see Limitations §Gap 1).

Rejected alternatives:

- **solargraph.** Less actively maintained than ruby-lsp; uses a
  documentation-driven design rather than Prism-parser-driven static
  analysis. ruby-lsp's Shopify-maintained cadence + Prism integration
  + ruby-lsp-rails add-on ecosystem are substantively stronger for
  ContextAtlas's atlas-substrate goals. Reconsider if Shopify ceases
  active maintenance.
- **ruby-lsp pre-Shopify versions.** Earlier ruby-lsp (different
  upstream) is deprecated; current Shopify ruby-lsp is the canonical
  successor.
- **Sorbet / steep.** Type-checker-first systems, not full LSPs.
  Don't answer ADR-07's `getTypeInfo` contract on un-annotated code,
  which is the dominant case in Rails codebases. Sorbet integration
  is a v1.1+ candidate for `getTypeInfo` enhancement on annotated
  codebases.

### Dual-pattern install (gem + bundler)

Per adjudication #3 from Stream A kickoff, the RubyAdapter supports
**two install patterns** at the adapter level:

1. **Global gem (`gem install ruby-lsp`)** for non-Rails Ruby projects.
   Spawn pattern: `ruby-lsp` directly (PATH-resolved).
2. **Bundler-detected (`bundle exec ruby-lsp`)** for Rails projects.
   Spawn pattern: `bundle exec ruby-lsp` from project root with Gemfile.

`contextatlas doctor` checks both paths. The dual-pattern spec sits
between two precedents:

- **Pyright (ADR-13):** `peerDependency` in npm package; locked version;
  adapter assumes presence at fixed-relative-path-or-PATH.
- **gopls (ADR-14):** user-installed via `go install`; PATH-resolved;
  documented as user requirement; preflight `go version` check.

ruby-lsp sits closer to gopls (user-installed, PATH-resolved) but the
Rails detection adds the bundler-via-fixture-Gemfile path that neither
precedent has. ADR-21's adapter behavior: detect Rails (Gemfile + 
`bin/rails`), branch to bundler-exec or direct-gem invocation.

### LSP primitive mappings (empirical, per probe findings)

Probe execution against ruby-lsp 0.26.9 (Substep 3, baseline file
section references inline). Differences from gopls / Pyright are
called out per §.

| Capability | ruby-lsp behavior | Adapter response | Probe § |
|---|---|---|---|
| `textDocument/documentSymbol` | Hierarchical via `hierarchicalDocumentSymbolSupport: true` request shape. Classes (kind 5), Modules (kind 2), Methods (kind 6 — includes Rails DSL macros with `"macro :argument"` naming), class methods (kind 12 with `"self.method"` name), Constants (kind 14), Instance variables (kind 8, nested under enclosing methods). | Used as-is. Adapter kind-mapping per Symbol-kind mapping §. Class methods detected via `self.` prefix in the name field; remap to `method` kind. **`self.` prefix preserved verbatim** in Symbol-ID name field per gopls receiver-prefix precedent (ADR-14 §Decision 4); consumers pattern-match `^self\.` for class-method discrimination. | Probe #1 |
| `textDocument/references` | Works cross-file for most symbol kinds. Each result returned TWICE under different URI encodings (`c%3A` and `c:` lowercase) on Windows — see Limitations §URL-encoding. Empty `[]` for top-level constant queried at declaration position. | Used with path-dedup pass (normalize URL encoding; dedupe on `(path, line)` tuple). Documented Limitation for declaration-site constant queries. | Probe #2 |
| `textDocument/definition` | Works cross-file using LSP LocationLink format (`targetUri`/`targetRange`/`targetSelectionRange`). Cross-mixin resolution works (Sluggable mixin methods resolve from Post/User references). Empty `[]` for scopes. Same URL-encoding duplication as references. | Used with path-dedup pass. LocationLink-format consumption; remap to standard ContextAtlas Reference shape. Scopes documented as edge-case. | Probe #7 |
| `textDocument/hover` | Returns markdown with `kind: "markdown"` envelope containing code block + definition links. For Rails DSL macros resolved from gem source: rich RDoc inline (200+ line dumps from `has_many` / `belongs_to`). For methods with rbs signatures: rbs-derived signature + RDoc (rbs 4.0.2 contribution). For user-defined methods without docstrings: `null`. For unresolved DSL (e.g., `scope :active`): `null`. | Used for `getSymbolDetails` and `getDocstring`. Adapter strips definition-links section to extract the prose portion (matches gopls pattern of docstring-from-hover; substantively different from ADR-13 Pyright omits-docstrings). | Probe #4 |
| `textDocument/diagnostic` (PULL) | **LSP 3.17 pull-model.** ruby-lsp advertises `diagnosticProvider: { workspaceDiagnostics: false }` in initialize capabilities and does NOT emit `textDocument/publishDiagnostics` notifications. broken.rb returned `count: 0` empty diagnostics in the probe because the probe used the push-channel handler; ruby-lsp doesn't use that channel. | **Adapter MUST use pull-model request** (`textDocument/diagnostic`), NOT the publishDiagnostics notification pattern that ADR-13 (Pyright) / ADR-14 (gopls) use. Cold-start absorbed via per-call ceiling (Pyright-pattern per ADR-18) — no `$/progress` BEGIN/END (empty in probe). | Probe #3 |
| `textDocument/implementation` | **Not advertised in capabilities.** Queries HANG rather than return JSON-RPC error -32601. Probe queries timed out at 10s. | Adapter does NOT call this method. `getTypeInfo` `usedByTypes` computed via declaration-parse fallback (Pyright pattern, ADR-13). | Probe #5 |
| `textDocument/typeDefinition` | **Not advertised in capabilities.** Queries HANG rather than return JSON-RPC error. Probe queries timed out at 10s. | Adapter does NOT call this method. `getTypeInfo` `extends` computed via declaration-parse fallback. | Probe #5 |
| Workspace warmup | No `$/progress` cold-start signal (empty in probe). Pyright-pattern. | Adapter `initialize()` does NOT call `waitForServerReady` (gopls pattern in ADR-18); falls through to per-call diagnostic ceiling. | Probe boot |

**Capabilities ruby-lsp advertises but adapter does NOT consume at v1.0:**

- `workspaceSymbolProvider: true` (project-wide symbol search; not in
  adapter contract)
- `typeHierarchyProvider: {}` (class hierarchy navigation; future
  `getTypeInfo` enhancement candidate at v1.1+)
- `renameProvider: { prepareProvider: true }` (refactoring; not in
  adapter contract)
- `semanticTokensProvider` (syntax highlighting; not in adapter
  contract)
- `experimental.{ addon_detection, compose_bundle, full_test_discovery }`
  (test-discovery is a v1.1+ candidate for tests-section of bundle
  responses)

### Symbol-kind mapping (matches [ADR-01](ADR-01-symbol-id-format.md) taxonomy)

| Ruby construct | ruby-lsp kind | Adapter kind | How detected |
|---|---:|---|---|
| Class | 5 | `class` | LSP kind 5 |
| Module | 2 | `module` | LSP kind 2 |
| Method (instance) | 6 | `method` | LSP kind 6 inside a class body. |
| Top-level `def` | 6 | `method` | LSP kind 6 with no enclosing class/module container. Ruby has no functions-vs-methods semantic split (see §Kind-6-uniform callable mapping below); top-level def is structurally a method on `Object` and emits the same LSP kind as instance methods. |
| Module function (`def foo` under `module_function`) | 6 | `method` | LSP kind 6 inside a `module` body. Ruby-lsp does not distinguish module functions from instance methods at the LSP kind layer; both emit kind 6. |
| Class method (`def self.foo`) | 12 | `method` | LSP kind 12 + `self.` prefix in name. The adapter remaps to `method` kind AND **preserves the `self.` prefix verbatim** in the symbol-ID name field (per ADR-14 gopls receiver-prefix-verbatim precedent; see Rationale). The `self.` prefix disambiguates class methods from instance methods at the Symbol.name level — downstream consumers needing class-method discrimination pattern-match on `^self\.`. The kind-12 emission for class methods is the ONLY divergence from Ruby's kind-6-uniform callable mapping (see §Kind-6-uniform callable mapping below). |
| Rails DSL macro (has_many, scope, validates, before_save, etc.) | 6 | `method` | LSP kind 6 + name matches `^[a-z_]+(:|\s)` pattern (macro-with-argument form). Surfaced as method symbols with name like `"has_many :posts"`. |
| Constant | 14 | `variable` | LSP kind 14. ContextAtlas's reduced SymbolKind doesn't have `constant`; `variable` is the closest fit (matches ADR-14 gopls iota-const handling). |
| Instance variable (`@name`) | 8 | (filtered out) | LSP kind 8 nested under a method. Not surfaced as a top-level Symbol (matches ADR-13 Python parameter/instance-var filtering). |
| Module namespace alias (constant pointing at a Module) | 14 | `variable` | LSP kind 14. ContextAtlas doesn't distinguish module-aliases from other constants at v1.0. |

**Decorator policy.** Ruby doesn't use decorators per se, but DSL
macros (`acts_as_*`, `has_many`, `validates`, callbacks) appear as
top-level method calls inside class bodies and ruby-lsp surfaces them
as kind-6 method symbols. The adapter accepts this representation —
the `"macro :argument"` name form preserves the macro's parameter for
downstream consumers. See Limitations §DSL-symbol-naming for the
trade-off.

**Kind-6-uniform callable mapping.** Ruby has no functions-vs-methods
semantic split — all callables are methods (instance methods on a
class, top-level def methods on `Object`, module functions exposed
via `module_function`, singleton methods, etc.). Ruby-lsp's documentSymbol
emits LSP kind 6 (`Method`) uniformly across these forms; the only
divergence is class methods declared with `def self.foo`, which emit
kind 12 (`Function`) and are preserved with the `self.` prefix
verbatim per Φ-γ-variant (see Class method row above + Rationale).
Empirically verified at v0.9 Stream A Phase 4 mid-substep watch (b)
per probe fixture amendment (top-level `def greet` added to
`lib/analytics.rb`; documentSymbol emits kind 6, parallel to instance
methods inside the same file's `module Analytics` body).

This is a language-structural property, not an LSP-convention
divergence from Pyright/gopls — it reflects Ruby's actual semantic
model (everything is a method on some object). The adapter therefore
maps kind 6 → `method` uniformly without context-discrimination; the
conformance harness (`src/adapters/conformance.ts`) accommodates this
via per-language flexibility (`functionSymbol` accepts kind ===
`"function"` OR `"method"`), parallel to the existing classSymbol
class-or-interface flexibility for languages like Python where the
`Protocol` shape legitimately maps to `interface`. Downstream
consumers that need structural-context discrimination (top-level vs
inside-class) walk the symbol container hierarchy rather than relying
on kind.

### Diagnostics via PULL model (LSP 3.17)

`textDocument/diagnostic` is a request, not a notification. The
adapter constructs a request like:

```typescript
const result = await client.request<DocumentDiagnosticReport>(
  "textDocument/diagnostic",
  { textDocument: { uri: toFileUri(absPath) } },
  timeoutMs,
);
```

The response shape per LSP 3.17:

```typescript
type DocumentDiagnosticReport =
  | { kind: "full"; items: Diagnostic[]; resultId?: string }
  | { kind: "unchanged"; resultId: string };
```

Adapter handles both. The `unchanged` variant is an optimization
ruby-lsp uses when the file's diagnostics haven't changed since the
caller's last `resultId`-tagged query; adapter passes the prior
resultId on subsequent calls (or omits, accepting potential re-emit).

**Per-call ceiling per ADR-18.** No cold-start `waitForServerReady`
race — ruby-lsp doesn't emit `$/progress` BEGIN/END frames. Per-call
diagnostic ceiling at 1500ms (matching gopls's post-cold-start
ceiling, since cold-start variance is folded into the per-call
budget).

### `getTypeInfo` — declaration-parse fallback (Pyright precedent)

Since `textDocument/implementation` and `textDocument/typeDefinition`
are unavailable, the adapter reads source files and parses class /
module declarations directly. Scope is deliberately narrow — the
supported surface is `class Name < Base`, `class Name`, `module Name`,
`module Foo::Bar`, with `include`/`extend`/`prepend` calls in the
body.

**Parser rules:**

1. **Locate declaration line.** Use `documentSymbol.selectionRange.start.line`
   to find the `class <Name>` or `module <Name>` token.
2. **Extract superclass (extends).** For `class`: after the class name,
   look for `<`. If present, capture text from `<` to the end of the
   line (or to `;`/newline whichever first). Strip whitespace; the
   result is the superclass name. Dotted/scoped names
   (`ActiveRecord::Base`, `ApplicationRecord`) preserved intact.
3. **Extract mixins (implements equivalent).** Inside the class/module
   body, scan for `include`, `extend`, and `prepend` statements at the
   top level (not nested in `if`/`def`/etc. blocks per pass-1
   discipline). Each statement's argument(s) is a mixin reference;
   collect into the `implements` field.
4. **Distinguish `include` vs `extend` vs `prepend`.** All three
   contribute to `implements` at v1.0 (matches ADR-13's Protocol vs
   ABC distinction at semantic but not adapter-output level). v1.1
   candidate to split per-call-shape if downstream consumers need it.
5. **`usedByTypes` via pass-1 inventory walk.** Symbol-inventory
   pass-1 records `superclass` and `mixins` per class; pass-2 inverts
   this map to compute `usedByTypes` for each class/module
   (matches ADR-13 Python's Protocol-detection cache pattern). Single-
   symbol query path (no full-indexing context) returns empty
   `usedByTypes` — matches ADR-13's `getTypeInfo at query time
   without the cache` degraded mode.

**ActiveSupport::Concern semantics.** A class includes a module
defined with `extend ActiveSupport::Concern`. ruby-lsp surfaces the
Concern's `included do` and `class_methods do` block contents as
direct children of the module (see Limitations §Concern-block-flattening).
The adapter treats the Concern as a mixin: `include Sluggable` in
`Post` adds `"Sluggable"` to `Post`'s `implements`. The Concern's
methods are NOT surfaced as inherited members in `Post`'s
documentSymbol output — that's a mixin-chain limit documented in
Limitations.

### Rails DSL surface — partially in baseline + cited add-on

**Empirical** (probe #6 baseline): ruby-lsp 0.26.9 baseline ALREADY
surfaces most Rails DSL macros as documentSymbol entries:

- `has_many`, `has_one`, `belongs_to`, `has_and_belongs_to_many`:
  surfaced as kind 6 with name like `"has_many :posts"`
- `scope :name`: surfaced as kind 6 with name `"scope :name"`
- `validates :attr`: surfaced as kind 6 with name `"validates :attr"`
- `before_save`, `after_create`, `before_validation`: surfaced as
  kind 6 with name `"before_save :method_name"`
- `before_action` (in controllers): same pattern

**Not surfaced in baseline:**

- `enum :name` macro — conspicuously absent
- `include ModuleName` — not in documentSymbol output
- `extend ActiveSupport::Concern` — not in documentSymbol output
- Concern blocks (`included do`, `class_methods do`) — contents bubble
  up to direct children of the enclosing module

**Cited add-on contributions** (per ruby-lsp-rails README + design
docs; per Path B precedent for external DSL):

- CodeLens for running tests / examples
- Definition resolution for `belongs_to`/`has_many` association
  targets (jumps to associated model class)
- Hover enrichment with database column info from `db/schema.rb`
- Routes navigation
- ActiveRecord magic method awareness (`find_by_*`, dynamic finders)

These are documentation-cited and remain to be empirically confirmed
or contradicted by Substep 5 work-repo qualitative observations
against a real bootable Rails app. ADR-21 §probe #6 substrate at
[`ruby-lsp-probe/findings-baseline.md` §"Probe #6"](ruby-lsp-probe/findings-baseline.md)
remains baseline-only.

**Adapter response:** the adapter accepts the kind-6 DSL-macro
symbols as method symbols. Downstream extraction/atlas consumers see
them as methods. Atlas claims that reference DSL macros (e.g., an
ADR mentioning `scope :recent`) resolve correctly via the macro's
symbol-ID. The `enum`-not-surfaced gap is documented in Limitations.

### URL-encoding result duplication (Windows-specific)

**Empirical** (probe #2, #4, #7): ruby-lsp returns each cross-file
location TWICE under different URI encodings on Windows:

```
file:///c%3A/CodeWork/contextatlas/test/fixtures/...
file:///c:/CodeWork/contextatlas/test/fixtures/...
```

The two encodings differ only in the drive-letter colon encoding
(URL-encoded `%3A` vs literal `:`). The adapter must **dedupe on
normalized path** before returning Reference[] / Symbol[]
collections to downstream consumers — otherwise every reference
count doubles.

Adapter approach: pass all URIs through `normalizePath()` (ADR-01)
which lowercases drive letters and normalizes separators. Dedupe
the resulting `(path, line, column)` tuples.

This is the only Windows-specific encoding behavior we've observed
across the three precedent LSPs (tsserver / pyright / gopls). The
behavior is parallel to but distinct from those servers' Windows
handling. Reproducible only on win32; non-Windows behavior expected
clean but unverified in this probe.

## Rationale

**Why ruby-lsp (not solargraph).** ruby-lsp's Shopify-maintained
release cadence (active development, monthly releases), Prism-based
parser architecture (Ruby's standard parser; fast + accurate), and
ruby-lsp-rails add-on ecosystem are substantively stronger than
solargraph's documentation-driven design. Probe confirmed Prism's
parse-error emission via diagnostics; rbs integration for hover; rich
RDoc resolution from gem sources. solargraph remains a v1.1+ option
if user demand warrants.

**Why pre-Rubydex 0.26.x stable (not 0.27+ beta).** Option D
adjudication at v0.9 Stream A: ship on stable-compatible pair, not
pre-release. ruby-lsp 0.27+ has Rubydex (methods-references coverage
expansion) but only as beta1/2/3; ruby-lsp-rails 0.5.0+ similarly
pre-release. The 0.26.x baseline pre-Rubydex coverage is
substantially better than the pre-cycle framing anticipated (probe
empirical evidence; see Limitations §Gap 1) — the upgrade pressure
is lower than initially anchored.

**Why pull-model diagnostics (not push).** ruby-lsp explicitly
advertises `workspaceDiagnostics: false` and uses LSP 3.17 pull-model
exclusively. Probe confirmed push-channel returns 0 diagnostics for
broken.rb's deliberate parse error — the channel doesn't fire. The
adapter MUST adopt pull-model OR lose all diagnostic visibility.
This is a hard constraint, not a stylistic choice.

**Why best-effort ruby-lsp-rails (not required).** Probe demonstrated
empirically that ruby-lsp baseline works WITHOUT the add-on loading.
The add-on requires `Rails.application.initialize!` to succeed —
substantial environmental coupling (tzinfo-data + database.yml +
credentials + more on a real Rails 8 boot). Treating the add-on as
required would couple the adapter to user-environment correctness in
ways that fail loudly when something's slightly off. Graceful
degradation is the correct design: probe demonstrated `documentSymbol`,
`findReferences`, `hover`, `definition` all work even when add-on
fails to load.

**Why declaration-parse for `getTypeInfo` (not implementation
endpoint).** ruby-lsp doesn't advertise `implementation` or
`typeDefinition` in capabilities, and queries to them hang rather
than fail cleanly. Pyright (ADR-13) ran into the same gap for
Protocol detection; the precedent's declaration-parse approach
adapts directly to Ruby's `class Name < Base; include Mixin`
syntax with minor surface adjustments.

**Why preserve `self.method` name verbatim per gopls precedent.**
Class methods appear in ruby-lsp's documentSymbol output as kind 12
(Function) with name `"self.find_by_email"`. The `self.` prefix is
the canonical Ruby identifier for class-method declarations. The
adapter remaps kind 12 → `method` (reduced taxonomy has no separate
class-method kind) AND **preserves the `self.` prefix verbatim** in
the symbol-ID name field. This disambiguates: an instance method
`foo` produces `sym:rb:<path>:foo`; a class method `self.foo` produces
`sym:rb:<path>:self.foo`. Different Symbol-IDs, no collision.

Parallels ADR-14's `*Type` vs `Type` receiver-prefix handling for
Go — ADR-14 §Decision 4 explicitly says "Adapter preserves
receiver-encoded method names verbatim in SymbolId. Do NOT strip
parens or receiver prefix." Same precedent applied to Ruby's
`self.` prefix: receiver-distinguishing prefix is part of the
canonical method identity, preserved at the SymbolId layer.

Downstream consumers needing class-method-vs-instance-method
discrimination pattern-match on `^self\.` in Symbol.name. No
SymbolFlag mechanism required; no Symbol-type substrate amendment
needed. (Earlier ADR-21 framing referenced a TBD SymbolFlag; that
framing was internally inconsistent with the gopls cross-reference
and was resolved at Substep 3.2 implementation pressure per Φ-γ-
variant adjudication. See commit body for full inconsistency-
diagnosis substrate.)

**Why URL-encoding dedup (not server-side fix).** ruby-lsp returns
duplicate URI encodings on Windows. Adapter-side dedup is the right
layer — upstream fix in ruby-lsp would be a future-version migration;
ContextAtlas should not block on it. Dedup is ~5 LOC after path
normalization through `normalizePath()`.

## Consequences

- **RubyAdapter ships at ~1500-2000 LOC.** Larger than Pyright (1247
  LOC) because of the additional surface area:
  - Pull-model diagnostic request/response handling
  - URL-encoding dedupe pass on all cross-file collections
  - Rails detection logic + dual-pattern spawn (bundler vs direct gem)
  - DSL-macro symbol acceptance + remapping pass
  - Declaration-parse for `getTypeInfo` (analogous to Pyright's parser)
  - `self.method` class-method-prefix handling + flag preservation
- **`test/fixtures/ruby/` migrated from `test/fixtures/ruby-probe/`**
  at v0.9 Substep 4.1 (single `git mv`; preserves git history),
  per ADR-13 / ADR-14 precedent (`pyright-probe/` → `python/`,
  `gopls-probe/` → `go/`). Probe fixture's load-bearing files
  carried forward as the adapter's integration-test substrate;
  canonical `sample.rb` authored at promotion time to fit the
  conformance harness contract (`src/adapters/conformance.ts`).
  v1.1 candidate to extend fixture with super-call resolution
  evidence + larger Rails sample once ruby-lsp-rails has stable
  0.27+/0.5+ pair.
- **ADR-07 semantics hold across all four languages** — TypeScript /
  Python / Go / Ruby. `TypeInfo.{extends, implements, usedByTypes}`
  has the same meaning; only the extraction mechanism differs.
- **Conformance suite includes Ruby.** A new
  `src/adapters/ruby.conformance.test.ts` (~60 LOC glue) wires the
  shared conformance suite (per ADR-03 + `src/adapters/conformance.ts`)
  against `test/fixtures/ruby/`. Standard fixtures `sample.rb`,
  `broken.rb`, `consumer.rb` per the harness contract.
- **`contextatlas doctor` gains Ruby-specific checks** (per Install
  Pattern section below):
  - `ruby --version` preflight (parallel to ADR-14's `go version`)
  - `bundle --version` preflight (when fixture has Gemfile)
  - `ruby-lsp` resolvable via PATH OR `bundle exec ruby-lsp`
  - `ruby-lsp-rails` presence detection when Rails detected
  - Windows-specific: libyaml dev headers via MSYS2; Rails-boot
    smoke test (`bin/rails runner "puts 'ok'"`) when Rails detected
- **Adapter registry one-line update.** `src/adapters/registry.ts`
  adds the `"ruby"` case constructing `new RubyAdapter()`.
- **Type substrate updates.** `LanguageCode` union adds `"ruby"`;
  `LANG_CODES` adds `ruby: "rb"`; `LANG_CODES_INVERSE` adds
  `rb: "ruby"`.
- **Pull-model diagnostic shape changes the LspClient contract
  minimally.** No interface change; just a new request type. Other
  adapters (Pyright / gopls) continue to use push-model notification
  handlers without modification.
- **README + DESIGN.md + ContextAtlas package metadata** updated to
  list Ruby as a supported language.
- **Doctor check matrix expands to five Ruby-specific checks**
  (toolchain + Rails-boot smoke test).

## Install Pattern

ruby-lsp itself is pure Ruby with no native extensions; install is
trivial when the user has working Ruby. The substantive install
matrix is **environment-coupling that the user's Rails project
requires for ruby-lsp-rails to load successfully**. Five surfaces
documented at v0.9 Stream A Substep 3:

### Toolchain (linear punch list — doctor-substrate)

1. **libyaml dev headers** (Windows + RubyInstaller).
   Pyright/gopls have no analog. Rails 8 pulls `psych` which needs
   libyaml. Doctor recommendation:
   ```
   ridk exec pacman -S --noconfirm mingw-w64-ucrt-x86_64-libyaml
   ```
2. **`.bat`/`.cmd` spawn handling** (Windows + Node ≥ 18.20.2 /
   20.12.2 per CVE-2024-27980). Adapter wraps `bundle.bat` /
   `ruby-lsp.bat` in `cmd.exe /c` invocation. Probe-empirical
   per [bf05c9c](https://github.com/traviswye/ContextAtlas/commit/bf05c9c).
3. **Ruby binary on PATH.** Bundle process spawns `ruby.exe`; must be
   on the bundle process's PATH. Parallel to ADR-14 gopls's `go
   binary on PATH` finding. Adapter preflight: spawn `ruby --version`;
   fail fast with actionable error if missing.
4. **tzinfo-data Gemfile requirement** (Rails 8 + Windows). Rails
   `rails new` includes this by default; manually-authored Gemfiles
   often omit it. Doctor: detect Rails + Windows + missing
   `tzinfo-data` from `Gemfile.lock`; recommend addition.

### Architectural-coupling (Rails-boot precondition)

5. **`Rails.application.initialize!` must succeed** for ruby-lsp-rails
   to load. The runner subprocess runs the full Rails boot — every
   railtie, every initializer, every config requirement (database.yml,
   credentials, secret_key_base, etc.). Substantively more demanding
   than the four toolchain checks combined.

   **Doctor check:** when Rails detected, run a smoke test:
   ```
   bin/rails runner "puts 'ok'"
   ```
   If it succeeds, ruby-lsp-rails will likely load. If it fails, doctor
   surfaces the actual Rails error (database.yml missing, master.key
   missing, etc.) as the actionable remediation. Adapter degrades
   gracefully: ruby-lsp baseline continues to work.

### Adapter design: graceful degradation

**Probe-empirical demonstration** (Substep 3 baseline file): ruby-lsp
baseline works correctly even when ruby-lsp-rails fails. All 8 probes
returned useful data; the only loss is the Rails-specific add-on
enhancements (CodeLens, association definition resolution, db/schema
hover enrichment, routes navigation).

Adapter contract:

- `ruby-lsp` presence: hard requirement. Adapter `initialize()` fails
  fast with actionable error if unavailable.
- `ruby-lsp-rails` add-on success: soft requirement. Adapter logs
  add-on load failure (with the Rails error surfaced) but continues
  with baseline LSP functionality. `getSymbolContext` bundles for
  Rails-DSL symbols (`has_many :posts` etc.) work without the add-on
  — they surface as method symbols per baseline observation.

### Cohort-version support range

Pre-v1.0 substrate-gathering survey (v0.9 Stream A Substep 5,
Path R-III) revealed cohort Ruby/Rails developers may run versions
newer than the LSP-tested-stable versions the probe substrate
anchors to. Three axes worth explicit framing:

- **Ruby version range supported:** Ruby 4.0.x (probe-substrate
  baseline; cohort-actual-version anchored at Phase 1 lock —
  empirical probe re-execution on Ruby 4.0.3 against ruby-lsp
  0.26.9 confirmed compatibility; Substep 3 baseline captured on
  Ruby 3.3 remains in git history at `a7e6f85` / `a1ddb01`).
  Earlier Ruby 3.3.x cohort developers supported via doctor's
  warn-not-error pattern; ruby-lsp 0.26.9 covers Ruby 3.3-4.0 per
  Shopify's maintenance cadence. Doctor's `ruby --version` check
  reports the installed version but does NOT block on minor-
  version-gap — **warn-not-error pattern**. The adapter exercises
  only the LSP wire protocol, which is Ruby-version-stable across
  3.3-4.0 per Shopify maintenance scope.

- **Rails version range supported:** Rails 8.0 is the probe-tested
  baseline (synthetic fixture). Cohort developers on Rails 8.1
  (current stable, released ~March 2026) may surface ruby-lsp-rails
  0.4.8 + Rails 8.1 compatibility friction at add-on load —
  ruby-lsp-rails 0.4.8 was authored for Rails 7.x / 8.0; Rails 8.1
  compatibility is empirically untested at v1.0. Adapter's graceful-
  degradation framing covers this case: ruby-lsp baseline continues
  working when the add-on fails. v1.1 candidate: verify Rails 8.1
  + add-on combination once ruby-lsp-rails 0.5+ stable releases OR
  via post-launch cohort reports.

- **Windows install path covers both Ruby version anchors.**
  RubyInstaller3 has both 3.3.x and 4.0.x available; the same
  `ridk install` + `ridk exec pacman -S libyaml` sequence
  documented in the toolchain section applies symmetrically across
  versions. Doctor's recommendation surface need not differentiate.

**Substrate-record observation** (v1.1 inheritance pattern):
fixture-substrate-version (what we anchor LSP/probe to) vs
cohort-actual-version (what cohort developers actually run) is a
distinct substrate axis from Pattern 7's four verification axes.
Survey empirical evidence at Substep 5 close: cohort Ruby/Rails
developers may run bleeding-edge versions that LSP add-on releases
lag against (recognition-service pinned Ruby 4.0.3 + Rails 8.1;
ContextAtlas fixture had pinned Ruby 3.3 + Rails 8.0). **Path V-a
adjudication** closed the gap at Phase 1 lock by shifting fixture-
substrate-version to cohort-actual-version (Ruby 4.0.3) rather
than carrying it as v1.1 amendment — eliminates the discrepancy
for Ruby version specifically; Rails version delta (8.0 vs 8.1)
remains carried-forward as v1.1 candidate. Doctor's warn-not-error
pattern still accommodates earlier-cohort gap (developers on
Ruby 3.3.x continue to work). v1.1 cycle's Rust / Java / .NET
adapter authoring should consider both anchors — fixture-substrate-
version AND cohort-actual-version range — in §install-pattern
framing from the outset, rather than retrofitting at survey
discovery. Path V-a is the resolution-shape precedent: anchor
fixture to current cohort version when available.

## Limitations

Called out explicitly so future readers don't rediscover them as
bugs:

### Gap 1 — methods-references at pre-Rubydex baseline (smaller than
pre-cycle framing)

Probe-empirical: ruby-lsp 0.26.9 baseline surfaces methods-references
cross-file substantively better than the ruby-lsp roadmap's
"limited" language suggested. References found for:

- Instance methods (`User#display_name`): cross-file ✓
- Class methods (`User.find_by_email`): cross-file ✓
- Scopes (`User.recent`): cross-file ✓
- Mixin instance methods (`Sluggable#to_param`): cross-file via include ✓
- Mixin class methods (`Sluggable.find_by_slug!`): cross-file via include ✓
- Module functions (`Analytics.track`): cross-file ✓

The roadmap "limited" framing applies to genuinely-untyped cases:
methods called via `send`/`public_send`, dynamic dispatch through
`method_missing`, methods generated by `define_method`-in-loop (see
§Metaprogramming below). For static call sites resolvable by Prism
parser + ruby-lsp's heuristic-typing, references work.

**Sized impact:** Gap 1 in v1.0 is narrower than ADR-21 pre-authoring
anticipated. Documentation-cited Rubydex expansion (v0.27+ pre-release)
would close residual cases; v1.1 candidate.

### Gap 2 — Rails DSL surface (partially handled in baseline + cited
add-on)

Baseline ruby-lsp surfaces most Rails DSL macros (has_many,
belongs_to, scope, validates, callbacks) as documentSymbol entries.
What's NOT in baseline:

- `enum :name` macro — conspicuously absent from documentSymbol output.
  Cited add-on may surface enum (unconfirmed; Substep 5 work-repo
  observation needed). v1.1 follow-up if Substep 5 contradicts.
- `include ModuleName` statements — not surfaced as documentSymbol
  entries. The mixin relationship is recovered by the adapter's
  declaration-parse pass (see §getTypeInfo), not from documentSymbol.
- `extend ActiveSupport::Concern` — not surfaced.

Cited add-on enhancements (documentation citation per ruby-lsp-rails
README; Substep 5 work-repo qualitative observations pending):

- CodeLens (tests/examples)
- Association definition-resolution (jumps `belongs_to :user` to
  User class)
- Hover enrichment with db/schema column info
- Routes navigation
- ActiveRecord magic method awareness

### Constant references at declaration site

Top-level constants queried at their declaration position return empty
`[]` (probe #2 `PREMIUM_TIER_LIMIT` example). Consumer references via
`User::PREMIUM_TIER_LIMIT` are not detected by ruby-lsp's references
implementation when the cursor is on the declaration. Adapter-side
workaround: also probe the references at usage sites if the
declaration-site query returns empty. v1.1 candidate to refine.

Empirically reconfirmed at v0.9 Stream A Phase 3 Substep 3.4 findReferences
implementation. Adapter honors the gap by returning empty `Reference[]`
without error per `if (!locations || !Array.isArray(locations) || locations.length === 0)`
fold-through; downstream consumers see zero references for constant
declaration-site queries.

### URL-encoding result duplication (Windows-specific)

Every cross-file LSP response duplicates each location under two URI
encodings (`c%3A` and `c:`). Adapter dedupes via `normalizePath()`.
The duplication doubles every uncorrected count. Documented in
Decision §URL-encoding-result-duplication.

### `enum` DSL macro not in documentSymbol

`enum :role, { admin: 0, editor: 1, viewer: 2 }` is NOT surfaced as
a documentSymbol entry in baseline ruby-lsp (probe #1 user.rb output).
Adapter does not synthesize a phantom entry; the macro is invisible
at v1.0. Cited add-on may surface it; Substep 5 work-repo confirms or
falsifies.

### Mixin chain invisibility (inherited methods not surfaced)

`Post` includes `Sluggable`. Post's documentSymbol output surfaces
only Post's explicitly-defined symbols (belongs_to, scope, etc.) —
NOT Sluggable's `to_param` / `find_by_slug!` / `generate_slug`.
Matches typical LSP behavior (Pyright + gopls behave similarly).
Adapter relies on the cross-mixin definition+references resolution
(which DOES work cross-file per probe #7) rather than synthesizing
inherited-member entries.

### ActiveSupport::Concern block flattening

`included do ... end` and `class_methods do ... end` block contents
appear as direct children of the module in documentSymbol output —
the block container structure is NOT preserved. Adapter accepts this
flattened representation. The class_methods block's methods surface
as kind 6 (method), same as instance methods — the adapter has no
way at v1.0 to distinguish a class-method-via-class_methods-block
from a regular instance method on the Module. Cited add-on may
provide kind-12-remapping; unverified.

### `getTypeInfo` declaration-parse v1.0 scope

Substep 3.6 implementation lands the declaration-parse fallback
per Pyright precedent. v1.0 scope:

- **`extends`**: standard `class Name < Super` syntax (with
  optional namespacing on either side: `class Foo::Bar < Baz::Qux`)
  parsed via `parseRubyClassExtends`. Singleton class syntax
  (`class << self`) not parsed for extends — singleton class is
  not standard inheritance. Conditional class definitions (e.g.,
  `class Foo < Bar if cond`) NOT parsed for extends. Modules
  return `[]` for extends (no superclass syntax in Ruby).
- **`implements`**: top-level `include` / `extend` / `prepend`
  statements within class/module body parsed via
  `parseRubyMixins`. Multi-mixin-per-line syntax
  (`include Foo, Bar`) only captures the first identifier
  (`Foo`) at v1.0; v1.1 candidate to extend regex for comma-list
  parsing if benchmark evidence demands. ActiveSupport::Concern's
  `included do` and `class_methods do` block contents NOT scanned
  for nested `include` statements (parser is line-range-bounded
  to the class body; nested-block-scope-aware parsing is v1.1
  candidate per Concern bubble-up framing in §getTypeInfo).
- **`usedByTypes`**: ALWAYS empty array at v1.0. Single-symbol-
  query path returns degraded mode per ADR-13 precedent
  ("getTypeInfo at query time without the cache"). Full pass-1
  inventory walk for usedByTypes computation (Pyright-pattern
  Protocol-cache shape adapted for Ruby class-hierarchy) is v1.1
  candidate; deferred at v1.0 per simpler-adapter-private-scope
  framing. Downstream consumers see `usedByTypes: []` for all
  Ruby symbols at v1.0.

Reopened class scope: parser only sees the line at the
selectionRange start. If a class is reopened in multiple files,
inheritance is parseable only at the FIRST occurrence (the
declaration line). Reopened-class mixins ARE surfaced via
parseRubyMixins per the line-range-scan it performs against the
specific symbol's range.

### implementation + typeDefinition: hang, not fail-clean

Queries to these methods HANG rather than return JSON-RPC error
-32601 ("Method not supported"). Adapter must rely on capabilities
introspection at initialize-time (we confirmed both absent) and NOT
call these methods. Documented because a future caller adding new
adapter methods could waste 10s/call if not aware.

### `define_method` generated methods invisible

`lib/dynamic_methods.rb` declares `STATUSES.each { |s| define_method("#{s}?") { ... } }`.
The generated `active?` / `inactive?` / etc. methods are NOT
surfaced in documentSymbol output. Only the literal `STATUSES`
constant + `current_status` regular method appear. Parallel to
ADR-13 Pyright's `@overload` collapse: pathological inputs degrade
gracefully (no false positives; the generated methods are simply
invisible at static-analysis time).

### Diagnostic delivery via PULL only

ruby-lsp does NOT emit `textDocument/publishDiagnostics`
notifications. The probe push-channel handler captured 0 diagnostics
for broken.rb's parse error. Adapter MUST use
`textDocument/diagnostic` REQUEST per LSP 3.17 pull-model. This is
a substantive design departure from ADR-13/14 which both use
push-model. Documented because new adapters or new LSP backends may
default to the push pattern by analogy.

### ruby-lsp-rails add-on conditional on Rails-boot success

ruby-lsp-rails requires `Rails.application.initialize!` to succeed
in its Rails-runner subprocess. On user codebases with broken
Rails-boot (database.yml missing, credentials missing, etc.), the
add-on fails to load and Rails-specific enhancements are unavailable.
Adapter degrades gracefully: ruby-lsp baseline continues to work.
Doctor recommends running `bin/rails runner "puts 'ok'"` to verify
Rails-boot success before relying on add-on-enhanced behavior.

### External-DSL gem invisibility (documentation-cited)

ruby-lsp-rails covers core Rails patterns per its documented scope;
it does not surface symbols for third-party DSL macros from gems
like `acts_as_paranoid`, `acts_as_list`, `acts_as_taggable_on`.
Users with such gems will see those macros as plain method calls
(or invisible if ruby-lsp doesn't recognize them as method calls).
This is a documentation-cited Limitation per Path B precedent;
fixture deliberately omits external DSL for this evidence (would
have required additional gem compatibility iteration per Pattern 7
surface 5 lock).

### Pre-Rubydex coverage shape (v1.1 upgrade target)

ruby-lsp 0.27+ introduces the Rubydex indexer rework with documented
methods-references expansion + instance-variable references coverage.
0.27+ exists only as pre-release at v1.0 ship date. v1.1 candidate
tracks upgrade to 0.27+/0.5+ stable pair; closes residual Gap 1
coverage; potentially closes additional gaps not yet visible.

## Non-goals

- **solargraph support.** ruby-lsp only for v1.0. solargraph revisit
  requires evidence of concrete ruby-lsp limitations the alternative
  addresses + sustained user demand.
- **Sorbet integration.** v1.1+. Would enable typed
  receiver-resolution for methods-references on annotated codebases.
  Out of scope at v1.0 — Rails codebases predominantly don't use
  Sorbet.
- **rbs type inference beyond hover.** rbs 4.0.2 contributes to hover
  signatures (probe #4 `module_function` example). Adapter does not
  consume rbs for `getTypeInfo` or `findReferences` at v1.0. v1.1+
  if benchmark evidence demands.
- **External-DSL gem support.** Third-party `acts_as_*` gems
  invisible at v1.0. Documented Limitation; not a hidden gap.
- **Bundle-aware spawn detection beyond Rails.** Adapter spawns
  `bundle exec ruby-lsp` when Rails detected (Gemfile + `bin/rails`);
  otherwise spawns `ruby-lsp` direct. Non-Rails Bundler projects
  (e.g., gem development) fall through to the direct-gem path. v1.1
  candidate if cohort demand emerges.
- **Workspace symbol search via `workspaceSymbolProvider`.** ruby-lsp
  advertises this capability but the adapter contract doesn't require
  it at v1.0. Future enhancement candidate.
- **Type hierarchy navigation via `typeHierarchyProvider`.** Similar
  to above — capability available, not consumed at v1.0. Future
  `getTypeInfo` enhancement candidate.
- **Test discovery via `experimental.full_test_discovery`.** ruby-lsp
  has experimental capabilities for test enumeration. Not in scope
  at v1.0; tests-section of `getSymbolContext` bundle uses file-
  pattern matching per CLAUDE.md test-file-identification convention.
- **Workspace diagnostics.** ruby-lsp explicitly advertises
  `workspaceDiagnostics: false`. Per-file pull-model is the only
  mode; ContextAtlas adapter contract is per-file anyway.
