---
id: ADR-14
title: Go adapter uses gopls; PATH + workspace/configuration requirements, struct-method naming, cross-package implementation
status: accepted
severity: hard
symbols:
  - GoAdapter
  - LanguageAdapter
  - TypeInfo
---

# ADR-14: Go adapter uses gopls; PATH + workspace/configuration requirements, struct-method naming, cross-package implementation

> **Frontmatter symbols note.** `LanguageAdapter` and `TypeInfo`
> exist in [`src/types.ts`](../../src/types.ts) today. `GoAdapter`
> does NOT exist yet — it is committed to land in the Step 9
> implementation commit that follows this ADR. Extraction runs
> between this commit and Step 9 will report `GoAdapter` as an
> unresolved frontmatter hint, same pattern as ADR-13's
> `PyrightAdapter` placeholder.

## Context

Step 9 ships a Go language adapter.
[ADR-03](ADR-03-language-adapter-plugin.md) names gopls as the
intended Go LSP; [ADR-07](ADR-07-type-info-adapter-capability.md)
requires every adapter — Go included — to implement `getTypeInfo`
with the same `{ extends, implements, usedByTypes }` contract.
Three decisions need locking before code lands:

1. **Gopls vs. alternatives.** ADR-03 names gopls; this ADR
   ratifies that choice and documents why alternatives fail.
2. **Runtime prerequisites beyond "spawn the LSP."** Gopls has
   two non-obvious hard requirements (Go-binary on PATH +
   `workspace/configuration` handler shape) that must be handled
   by the adapter, not inherited from the `LspClient` defaults
   that work for pyright and typescript-language-server.
3. **Go-specific symbol semantics.** Methods with receivers,
   embedded structs, interface embedding, generics, iota const
   blocks, and build-tagged conditional files each need
   adapter-side mapping decisions.

Per the Step 8 gate, a probe phase ran against gopls v0.21.1
before this ADR — empirical findings live in
[`docs/adr/gopls-probe-findings.md`](gopls-probe-findings.md)
(2300+ lines of raw capture + 12 observations + decision block,
produced by `scripts/gopls-probe.ts` against
`test/fixtures/go/`). Decisions below cite those findings rather
than documentation guesses.

## Decision

### Gopls is the Go LSP; alternatives rejected

**Gopls v0.21.1+** is the sole Go LSP backend for v0.1.
Unlike pyright (which is npm-distributed and can be a
`peerDependency`), gopls is Go-distributed: users install via
`go install golang.org/x/tools/gopls@<version>`. This follows
the **tsserver pattern** from [ADR-03](ADR-03-language-adapter-plugin.md)
and CLAUDE.md: "user-provided, not a bundled dependency."

Version pin: **v0.21.1** as of the probe (Feb 2026). Pin must
track the Go toolchain version closely — gopls's "only latest
Go" build-support policy means a gopls compiled against Go 1.23
cannot be used against a Go 1.26 toolchain. An earlier proposed
pin of v0.16.2 surfaced this: v0.16 is incompatible with Go 1.26
builds. Document the current pin in README install instructions;
bump when the user's Go toolchain bumps.

Rejected alternatives:

- **Manual `go/parser` + `go/types` subprocess.** Go ships
  `go/parser` and `go/types` as stdlib. Writing a minimal
  LSP-equivalent in Go and calling it from the Node adapter was
  considered. Rejected: rebuilds what gopls already solves
  (cross-package resolution, interface satisfaction, generics
  inference); doesn't support ADR-07's `impact_of_change` story
  without most of gopls's machinery anyway.
- **go-langserver (sourcegraph).** Unmaintained since 2020;
  gopls explicitly superseded it per upstream announcement.
- **govim/gopls-LSP wrappers.** Not standalone servers — they
  wrap gopls. No benefit over direct gopls invocation.

### Runtime prerequisites

Two requirements surfaced during the probe phase must be
handled by `GoAdapter`, not inherited from the generic
`LspClient` setup.

#### 1. `go` binary must be on the gopls process's PATH

Gopls spawns `go` as a subprocess for module loading, dependency
analysis, and build-related operations. Without it, gopls emits
`"Error loading workspace folders (expected 1, got 0)"` at
startup and every subsequent LSP request returns `"no views"`
(gopls's internal term for "no active workspace scope").

Probe evidence: findings §1a. Fix during the probe: prepend
`C:\Program Files\Go\bin` and `<USERPROFILE>\go\bin` to
`process.env.PATH` before spawning.

**Adapter responsibility:** document `go` as a user PATH
requirement, parallel to the tsserver PATH requirement in
CLAUDE.md. On initialization, validate by running `go version`
as a preflight; if it fails, emit an actionable error:

```
GoAdapter: `go` binary not found on PATH. Install Go 1.22+ and
ensure `go version` works in a plain shell, then retry. gopls
requires `go` for module resolution; without it, no Go symbols
will be indexed.
```

#### 2. `workspace/configuration` handler must return a length-matched array

Gopls issues `workspace/configuration` requests asking for its
settings, e.g. `{ items: [{ section: "gopls" }] }`. The
LSP-spec-correct response is an array of the same length as the
request's `items[]`.

Pyright tolerates `null` as a response to this request. Gopls
does not: `null` causes gopls to skip workspace view creation,
producing the same `"no views"` cascade as the PATH issue.

Probe evidence: findings §1b. Fix during the probe:

```typescript
client.onRequest("workspace/configuration", (params) => {
  const items = (params as { items?: unknown[] } | null)?.items ?? [];
  return items.map(() => ({}));
});
```

**Adapter responsibility:** implement this handler, do not
delegate to a generic null-stub. For v0.1, returning empty
objects (gopls defaults) is sufficient. Reconsider if the
adapter needs gopls-specific settings
(`build.buildFlags`, `analyses.*`, etc.) — out of scope for v0.1.

### LSP primitive mappings (empirical, per probe findings)

For each adapter method, a direct mapping to a gopls LSP
request. All methods probed cleanly — no fallback paths needed.

| LanguageAdapter method | gopls LSP request | Probe evidence |
|---|---|---|
| `listSymbols(filePath)` | `textDocument/documentSymbol` | §T3, §T3b |
| `getSymbolDetails(symbolId)` | hover over the symbol's declaration position | §T4 |
| `findReferences(symbolId)` | `textDocument/references` (rooted in declaration per `textDocument/definition`) | §T0, §T2 |
| `getDiagnostics(filePath)` | `textDocument/publishDiagnostics` (consumed via notification handler) | §T7 |
| `getTypeInfo(symbolId)` | `textDocument/implementation` + `textDocument/typeDefinition` combined | §T1, §T1b, Bonus |

No LSP method returned "method not supported" on the core path.

### Symbol-kind mapping

Gopls emits these LSP SymbolKind codes for Go constructs:

| LSP Kind | Go construct | Adapter mapping |
|---:|---|---|
| 5 | type definition OR type alias | `class` (disambiguate via `detail`) |
| 6 | method (interface or struct) | `method` |
| 8 | field OR embedded struct OR interface-embedding entry | `other` |
| 11 | interface | `interface` |
| 12 | top-level function | `function` |
| 13 | package-level var | `other` |
| 14 | package-level const | `other` |
| 23 | struct | `class` |

Per [ADR-01](ADR-01-symbol-id-format.md), the adapter outputs
reduced kinds: `function`, `method`, `class`, `interface`,
`other`. Struct and type-definition collapse to `class` under
this reduction; that is ADR-01-intended.

### Struct-method naming: preserve gopls's receiver encoding

Gopls emits struct methods as top-level documentSymbol entries
with names like `(*Rectangle).Area` (pointer receiver) or
`(Rectangle).Perimeter` (value receiver). Generic receivers get
the type-parameter list preserved: `(*Stack[T]).Push`.

This is fundamentally different from pyright and
typescript-language-server, which both nest methods as children
of the enclosing class/interface. ADR-01's SymbolId format
accommodates this natively:

```
sym:go:test/fixtures/go/kinds.go:(*Rectangle).Area
sym:go:test/fixtures/go/kinds.go:(Rectangle).Perimeter
sym:go:test/fixtures/go/kinds.go:(*Stack[T]).Push
```

**Decision:** preserve the gopls receiver-encoded name verbatim
in SymbolId. Do NOT strip parens or receiver prefix. Rationale:
the encoding is deterministic, unique, and human-readable; the
`*` vs bare prefix carries semantic information (pointer vs
value receiver) that would otherwise require a side-field on
the Symbol record.

Probe evidence: §T3, finding §4.

### Interface-method nesting asymmetry

While struct methods are flat top-level, **interface methods
are children of the interface** in gopls's documentSymbol
output. Shape's `Area` and `Perimeter` appear in
`Shape.children[]`; Renderer's `Render` in `Renderer.children[]`;
embedded interfaces (`Shape` nested in Renderer) appear as a
`kind: 8` child with the embedded type's name.

**Decision:** the adapter flattens interface children to
top-level Symbol records, producing SymbolIds like:

```
sym:go:kinds.go:Shape             (the interface itself)
sym:go:kinds.go:Shape.Area        (flattened method)
sym:go:kinds.go:Shape.Perimeter
```

Rationale: flat layout matches the struct-method shape, keeps
the downstream claim-extraction pipeline uniform, and
preserves the `ParentType.Method` relationship through the dot
in the name.

**Parent pointer preservation (load-bearing):** the flattened
method Symbol records a `parent_id` field pointing to the
interface's SymbolId. Concretely, the Symbol for
`sym:go:kinds.go:Shape.Area` carries
`parent_id: "sym:go:kinds.go:Shape"`. This preserves the
interface → method relationship so downstream consumers can
still query "which methods does Shape declare?" without walking
children arrays. Flattening without the back-pointer would
drop the interface-membership signal entirely — strictly worse
than gopls's native nested shape. The dot-in-name is a
convenience for readers; `parent_id` is the authoritative link.

Probe evidence: §T3, finding §5.

### Iota const block: flatten to independent constants

A `const (…)` block with `iota` produces N top-level
documentSymbol entries — one per declared name — not a nested
block symbol. Hover distinguishes the anchor (`= iota // 0`)
from implicit followers (`= 1`, `= 2`).

**Decision:** flatten iota const members to independent
top-level Symbol records. Do NOT reconstruct a synthetic block
container. Rationale: matches gopls's native shape; iota is
syntactic sugar rather than semantic grouping; block membership
is recoverable from line-adjacency + shared leading doc comment
if a consumer needs it later.

Probe evidence: §T3 (const StatusReady/Running/Done as flat
entries), §T4 (hover semantics of anchor vs follower), finding §6.

### Embedded structs: surface fields as children, not methods

When struct A embeds struct B (anonymous field), gopls's
documentSymbol for A shows B as a child `kind: 8` (field) entry
named for the embedded type. Promoted methods from B do NOT
appear as children of A in documentSymbol.

They DO appear in A's hover output ("Width through Rectangle …")
and in `implementation` query results rooted at A.

**Decision:** the adapter preserves the embedded-field
documentSymbol shape for ingestion (B surfaces as a field of A).
Promoted method tracking happens via `getTypeInfo` (which uses
`implementation` + hover), not via `listSymbols`. Attempting to
synthesize phantom method-child entries is out of scope.

Probe evidence: §T3 (Square's children[] contains Rectangle as
field), §T4 (Square's hover lists promoted fields + methods).

### Generics preserved verbatim

Every place a type-parameter list appears in source, gopls
preserves it in both `name` and `detail`:

- `type Stack[T any] struct { items []T }`
- `(*Stack[T]).Push`
- `func Map[T, U any](items []T, fn func(T) U) []U`
- `func Sum[T int | float64](items []T) T` (union constraint)

**Decision:** signatures, names, and SymbolIds carry generics
verbatim. No adapter-side reconstruction or normalization. The
type-parameter list is part of the canonical name.

Probe evidence: §T3 + §T4, finding §7.

### `getTypeInfo` uses `implementation` directly (no inventory-walk fallback)

For [ADR-07](ADR-07-type-info-adapter-capability.md)'s
`{ extends, implements, usedByTypes }` contract, gopls's
`textDocument/implementation` endpoint delivers both directions
of interface satisfaction:

- **Interface → implementers:** `implementation` on an interface
  returns all types that satisfy it, including cross-package.
- **Concrete → interfaces satisfied:** `implementation` on a
  struct returns the interfaces it implements.
- **Embedder listed as implementer:** a `Renderer` interface that
  embeds `Shape` is listed as a `Shape` implementer.

This is materially simpler than the pyright path. ADR-13
required an inventory-walk fallback because pyright's
`implementation` endpoint did not surface Protocol/ABC
implementers reliably. Gopls has no such gap.

**Decision:** `getTypeInfo` calls `implementation` once,
partitions results by whether each result location is an
interface-type or concrete-type declaration (using hover or
documentSymbol of the target), and returns the partitioned
lists as `implements` vs `usedByTypes`. `extends` is derived
from hover output (embedded-interface lines) or documentSymbol
children (for interfaces, the embedded-interface child entry).

Probe evidence: §T1, §T1b, finding §9.

### Cross-package implementation is workspace-scoped

A single `workspaceFolders` initialize call covering the module
root is sufficient for gopls to index implementation relationships
across all packages in the workspace. No per-package reinitialize
needed.

Probe evidence: §T1b (renderer.Circle + renderer.FancyRenderer
surfaced as Shape implementers once `renderer/impl.go` was
opened alongside the root-package files).

### Build-tagged files: surface all symbols, let pipeline dedup

Files with `//go:build` constraints (e.g., `command_windows.go`
+ `command_notwin.go` in cobra) return symbols via per-file
documentSymbol regardless of which build tag is active.
documentSymbol is text-level; build-constraint evaluation
happens at the package-view level.

**Decision:** the adapter surfaces symbols from all `.go` files
it's asked to process. The v0.1 Go adapter does NOT filter by
build tag.

**Layer responsibility (explicit):** pipeline layer is
responsible for package-level dedup. Adapter surface is
intentionally symbol-exhaustive — it returns everything gopls
provides for every file, regardless of build constraint. This
separation keeps the adapter contract clean ("surface everything
gopls sees") and lets the pipeline apply language-specific
semantics (e.g., "if two `.go` files in the same package declare
the same symbol under mutually exclusive `//go:build` tags,
keep the one matching the repo's primary build target"). Claim
extraction sees the pipeline's output, not the adapter's raw
feed, so it is not responsible for build-tag dedup either.

Probe evidence: §T3b (platform_windows.go and platform_other.go
both return their `platformName` + `platformGreeting` symbols
despite mutually exclusive build constraints), finding §10.

## Rationale

**Why gopls (not a homegrown go/types driver):** gopls solves
cross-package resolution, interface satisfaction, and generic
inference already. Reimplementing that stack in Go-as-called-from-
Node would ship 10× the code for no empirical gain — the probe
shows gopls is reliable and feature-complete for ADR-07's
requirements.

**Why preserve receiver-encoded method names:** Go's native
idiom is `(Receiver).Method`. Stripping to a bare `Method` would
lose the pointer-vs-value receiver distinction and conflict with
ADR-01's requirement that SymbolIds be deterministic and unique
per-file. Multiple types in the same file can have a method
called `Area`; receiver-encoded names guarantee uniqueness
without needing a container-path prefix.

**Why flatten interface children (breaking symmetry with
gopls's native shape):** downstream claim extraction iterates
a flat symbol inventory. A nested children shape for interfaces
vs flat for structs would force every consumer to handle both.
The flattening is ~5 LOC in the adapter and saves complexity
everywhere else.

**Why no inventory-walk for `getTypeInfo`:** gopls's
`implementation` endpoint is complete. Writing the fallback
defensively would add untested code and slow the happy path.
If a future gopls version degrades here, add the fallback then,
with a probe-captured repro.

## Consequences

**Adapter implementation budget.** Based on pyright precedent
(`src/adapters/pyright.ts` is 1247 LOC), GoAdapter should land
in 700-1000 LOC. Smaller because:
- No Protocol/ABC fallback logic
- No inventory-walk for `getTypeInfo`
- No alias-resolution pass (gopls's hover handles both forms)

**New peer dependency at the project level:** none inside npm.
Gopls is installed via `go install` at the user level.
Document in README.

**Test fixture layout** mirrors pyright: `test/fixtures/go/`
with the probe fixtures carrying forward as the GoAdapter's
integration-test substrate. Cross-package `renderer/` subdirectory
stays.

**Step 9 ship criteria unlocked:** empirical grounding for
`GoAdapter` in place. The probe scaffold remains in the tree as
living documentation; re-runnable if gopls is upgraded or if a
behavior question surfaces.

## Limitations

- **Single-module only.** The v0.1 Go adapter does not support
  Go workspaces (`go.work`) or multi-module setups. A
  `workspaceFolders` list with one root is the supported shape.
- **No vendor-mode special-casing.** If a target repo uses
  `vendor/` (cobra doesn't), the adapter treats vendored files
  as regular sources. Gopls's behavior under vendor mode was
  not probed; assume best-effort.
- **No GOPATH support.** Module-mode only. GOPATH-era Go code
  was not probed and is not a target.
- **No cgo support.** `cgo`-using files were not probed.
  Expected to work via gopls's native handling, but unverified.
- **No `//go:generate` semantics.** Generated files are
  indexed as-is; the generator comment is opaque text to the
  adapter.
- **Version tracking discipline required.** Gopls pin must bump
  with the user's Go toolchain (see the "only latest Go"
  policy). Leaving a stale gopls pinned against a newer Go
  toolchain silently breaks module loading.

## Non-goals

- Vendoring gopls as a binary dependency of the npm package.
  Follows the tsserver precedent: user-installed, PATH-resolved.
- Supporting Go workspaces (`go.work`). v0.2+ if demand surfaces.
- Build-tag-aware symbol filtering. All files surface all
  symbols; the pipeline layer decides dedup policy.
- Rewriting receiver-encoded method names into some
  language-neutral form. Go's syntax is part of the identity.
- Reimplementing gopls's interface-satisfaction logic as a
  fallback. If gopls's `implementation` endpoint breaks in a
  future version, add the fallback then — don't build it
  speculatively.
