---
id: ADR-07
title: Type relationships are a first-class adapter capability; every adapter implements getTypeInfo
status: accepted
severity: hard
symbols:
  - LanguageAdapter
  - TypeInfo
  - TypeScriptAdapter
---

# ADR-07: Type relationships are a first-class adapter capability; every adapter implements getTypeInfo

## Context

ContextAtlas exposes three MCP tools. Two of them need structured type
relationships to deliver their headline value:

- `impact_of_change` (step 11) answers "what breaks if I change
  BaseProcessor?" That question collapses to an inverse-reference
  lookup: find every type that extends or implements the target.
  Without inverse type data, impact analysis degrades to plain
  reference counts, which blur "this class is used in 50 places"
  with "this class has 50 subclasses" — those are very different
  risks.

- `get_symbol_context` (step 6) renders a deep-depth bundle that
  should include `extends`, `implements`, and `used_by` for code
  reviewers and agents reasoning about a symbol. Without structured
  type data, the bundle either parses signatures with regex (brittle)
  or omits type information (incomplete).

Neither tool can compute type relationships generically at the storage
layer. The storage layer holds symbol IDs and claims; it has no
TypeScript or Python grammar. The language server does. This knowledge
must live in the adapter.

A secondary concern is interface stability. With a TypeScript adapter
today and a Python adapter in step 9 (plus .NET, Go, Java, Rust on the
roadmap), the `LanguageAdapter` contract is public API. Adding
`getTypeInfo` after implementations exist means retrofitting. Defining
it now — while the Python adapter is still on paper — keeps every
adapter landing against the same contract.

## Decision

The `LanguageAdapter` interface defined in `src/types.ts` includes
`getTypeInfo(id)` as a required method on every adapter implementation:

```typescript
interface LanguageAdapter {
  // ... existing methods ...
  getTypeInfo(id: SymbolId): Promise<TypeInfo>;
}

interface TypeInfo {
  /** Direct parent classes or types this symbol extends. */
  extends: string[];
  /** Interfaces or traits this symbol implements. */
  implements: string[];
  /**
   * Types that extend or implement this symbol (inverse lookup).
   * Direct children only — transitive closure is not returned.
   */
  usedByTypes: string[];
}
```

Empty arrays are valid returns for symbols with no type relationships
(utility functions, standalone classes, marker interfaces). Adapters
MUST NOT throw for symbols that have no relationships; they return
`{ extends: [], implements: [], usedByTypes: [] }`.

The TypeScript adapter implements `getTypeInfo` via the language server:
- `extends` and `implements` — parse from `textDocument/hover` output,
  with generic constraints (e.g. `<T extends Drawable>`) stripped before
  the extends/implements tokens are extracted.
- `usedByTypes` — `textDocument/implementation` at the symbol's
  declaration position returns the set of subclasses / implementors;
  the adapter maps each returned Location to its enclosing symbol name.

Python (step 9) and future adapters follow the same contract using
their respective language-server primitives. The shape is uniform
across languages even though the extraction mechanism is not.

### Direct-children-only semantics

`usedByTypes` returns direct children only. `class Triangle extends
Polygon extends Shape` produces:
- `Shape.usedByTypes` contains `Polygon`, not `Triangle`.
- `Polygon.usedByTypes` contains `Triangle`.

Callers that need transitive closure compose `getTypeInfo` calls.
This matches tsserver's `textDocument/implementation` default behavior
and is documented at the interface level so language adapters don't
disagree on transitivity.

## Rationale

- **Language-specific extraction.** Type relationships are meaningful
  only within a language's type system. TypeScript has `extends` and
  `implements`; Python has base classes and ABCs; Rust has traits.
  Abstracting this into a single interface while keeping the extraction
  per-adapter is exactly what adapter plugins exist for (ADR-03).

- **Required by step 11.** The `impact_of_change` tool's blast-radius
  bundle includes type-inverse data as a core signal. Shipping a
  stubbed `usedByTypes` that always returns `[]` would produce a
  silently-wrong impact bundle — users would see low blast radius for
  symbols that in fact have many dependents. Worse than missing the
  feature.

- **Interface drift is harder to fix later.** Adding a method to a
  public adapter interface after multiple adapters exist means touching
  every implementation. Defining `getTypeInfo` now — before Python and
  before any third-party adapter — means every future adapter lands
  against the complete interface.

- **LSP primitives exist.** `textDocument/hover` and
  `textDocument/implementation` are standard LSP requests; both are
  implemented by typescript-language-server and Pyright. We are not
  inventing mechanisms, just wiring them through a uniform facade.

## Consequences

- **The adapter interface is a stable contract.** Any change to
  `TypeInfo` is a breaking change requiring a major version bump.
  Adding new fields to `TypeInfo` (e.g., `usedByGenericConstraints`)
  is non-breaking but requires every adapter to update.

- **Every future adapter MUST implement `getTypeInfo`.** This is part
  of the plugin contract, on par with `listSymbols` and
  `findReferences`. An adapter that throws "not implemented" from
  `getTypeInfo` cannot ship.

- **`usedByTypes` accuracy is LSP-state-dependent.** Language servers
  only return inverse references for files they have analyzed. The
  TypeScript adapter's warmup opens every project source file before
  returning from `initialize`, which is sufficient for correctly
  configured workspaces. However, in edge cases — tsserver crashed
  mid-session, users passing `excludeDirs` that hide subclass-bearing
  files, or projects where the warmup hit an error — `usedByTypes`
  may return an empty array for a symbol that actually has subclasses.
  This is not "wrong data" in the falsifiable sense; it is "data
  conditional on what the LSP currently knows." Bundles rendered in
  these conditions will under-report blast radius, and callers that
  act on `usedByTypes` should treat empty results as "no known children
  at this moment," not as an absolute claim.

- **Generic constraints are excluded from `extends` / `implements`.**
  `class Box<T extends Widget>` does NOT register `Widget` as a parent
  of `Box`. The parser strips balanced `<...>` spans from the
  declaration header before extracting extends/implements tokens.
  This matches developer intent and is how reviewers read the code.

- **`textDocument/hover` format stability is a risk worth tracking.**
  tsserver's hover markdown has varied slightly across major versions.
  The TypeScript adapter's hover parser is permissive (first fenced
  code block containing `class`/`interface`/`type` keyword, with
  balanced generic stripping), but a future tsserver version could
  break it. A hover-format canary test in the adapter's test suite
  catches this at CI time rather than at runtime.

- **Performance.** A `getTypeInfo` call for a symbol with N
  descendants costs roughly 1 hover + 1 implementation + up to N
  documentSymbol requests (one per target file, deduped within a
  single call). For a central class with 10 subclasses spread across
  10 files, this is ~12 LSP round-trips. Acceptable at bundle-build
  time; a cross-call cache is post-MVP and gated on benchmark evidence.

- **The renderer depends on this shape.** The compact bundle
  formatter (step 6) reads `TypeInfo` directly for deep-depth output.
  A change to `TypeInfo` propagates to the renderer and any committed
  atlas fixtures.

- **Third-party adapters become contributor-friendly.** Adding a new
  language means implementing six methods, all of which have LSP or
  language-server analogues. The interface is small, the contracts
  are clear, and the tests establish the expected behavior by example.
