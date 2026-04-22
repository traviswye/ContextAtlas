---
id: ADR-13
title: Python adapter uses Pyright; empirical LSP contract and Protocol/ABC semantics
status: accepted
severity: hard
symbols:
  - PyrightAdapter
  - LanguageAdapter
  - TypeInfo
  - parseClassDeclaration
  - resolveProtocolAliases
---

# ADR-13: Python adapter uses Pyright; empirical LSP contract and Protocol/ABC semantics

> **Frontmatter symbols note.** `LanguageAdapter` and `TypeInfo`
> exist in [`src/types.ts`](../../src/types.ts) today.
> `PyrightAdapter`, `parseClassDeclaration`, and
> `resolveProtocolAliases` do NOT exist yet — they are committed to
> land in the implementation commit that follows this ADR. Extraction
> runs between this commit and the implementation commit will report
> those three as unresolved frontmatter hints. Expected behavior,
> same pattern as ADR-09's `claims_fts` pointer before the FTS5
> migration landed.

## Context

Step 9 ships a Python language adapter. [ADR-03](ADR-03-language-adapter-plugin.md)
names Pyright as the intended Python LSP; [DESIGN.md](../../DESIGN.md)
repeats that choice; [ADR-07](ADR-07-type-info-adapter-capability.md)
requires every adapter — Python included — to implement
`getTypeInfo` with the same `{ extends, implements, usedByTypes }`
contract. Three decisions still need locking before code lands:

1. **Pyright vs. alternatives.** DESIGN.md says Pyright; this ADR
   ratifies that choice against the currently-available alternatives
   and documents why.
2. **LSP primitive mappings.** Pyright's LSP implementation diverges
   from `typescript-language-server` in load-bearing ways. The
   existing [TypeScriptAdapter](../../src/adapters/typescript.ts)'s
   patterns do not port directly. Specific divergences need
   documented adapter responses.
3. **Python-specific semantics.** `typing.Protocol` and `abc.ABC`
   have no TypeScript analogue. Multiple syntactic forms of type
   aliases, decorators that change runtime behavior, and @overload
   all need adapter answers.

Per the build-plan gate, a probe phase ran against Pyright 1.1.409
before this ADR — empirical findings live in
[`docs/adr/pyright-probe-findings.md`](pyright-probe-findings.md)
(1681 lines, produced by `scripts/pyright-probe.ts` against
`test/fixtures/pyright-probe/`). The decisions below cite those
findings rather than documentation guesses.

## Decision

### Pyright is the Python LSP; alternatives rejected

**Pyright 1.1.409+** is the sole Python LSP backend for v0.1.
Listed in `peerDependencies` + `devDependencies` as non-optional,
mirroring the typescript-language-server pattern from
[ADR-03](ADR-03-language-adapter-plugin.md).

Rejected alternatives:

- **basedpyright.** Community fork of Pyright with stricter defaults
  and additional reporting. Rejected for v0.1 because Pyright is
  Microsoft-maintained with the broadest MCP-client ecosystem
  familiarity, and basedpyright's behavior-shift (different severity
  defaults, extra `reportMissingModuleSource`) is a divergence
  without evidence. Reconsider if Pyright abandons OSS releases.
- **jedi-language-server** (+ pylsp, which wraps jedi). Rejected as
  a hard disqualifier: lacks reliable type-inference for
  `textDocument/references` across files, and has no inverse-lookup
  story for type relationships. ADR-07's `getTypeInfo` contract
  cannot be satisfied.
- **mypy.** Rejected: it's a type-checker, not an LSP. Doesn't
  answer the question.

### LSP primitive mappings (empirical, per probe findings)

Pyright's LSP surface differs from tsserver's in ways that require
different adapter code, not just a rename. The table below captures
each divergence and the adapter's response. The **§** column points
at the section of `pyright-probe-findings.md` where the empirical
observation was captured.

| Capability | Pyright behavior | Adapter response | § |
|---|---|---|---|
| `textDocument/implementation` | **Not implemented.** Returns JSON-RPC error -32601 "Unhandled method" on every probed target; `implementationProvider` is absent from `initialize` capabilities. | **Source declaration parsing** computes `usedByTypes` during full-indexing runs. Single-file queries that don't have inventory context return `[]` for `usedByTypes`. | Boot (initialize caps), T1 |
| `textDocument/hover` | Returns compact markdown like `(class) Shape` — no class declaration header, no base classes. Usable for signatures on methods/functions/type-aliases/constants; unusable for type relationships. | Hover text used for method / function / type-alias / constant signatures. Class signatures constructed from source declaration instead (`class Widget(Shape, Serializable):`). | T4 |
| `textDocument/documentSymbol` | Classes (regular / ABC / dataclass / Protocol) all report LSP kind 5. Methods (regular / `__init__` / `@property` / `@classmethod` / `@staticmethod`) all report kind 6. Type aliases (all three forms) report kind 13 (Variable). | Adapter remaps based on source-line inspection + hover prefix: Protocol bases detected in declaration header rewrite kind to `interface`; hover `(type)` prefix rewrites kind 13 → `type`; hover `(constant)` / `(property)` prefixes refine further. | T3 |
| `textDocument/references` | Works correctly; cross-file references surface when files are opened via `didOpen`. Standard LSP response shape with uri + range. | Used as-is, same pattern as TypeScriptAdapter. | T2 |
| `textDocument/publishDiagnostics` | Published automatically on `didOpen`. Standard LSP shape (severity / message / range / code / codeDescription). | Notification handler caches by URI. Same pattern as TypeScriptAdapter. | T6 |
| Workspace warmup | No automatic cross-file analysis. `findReferences` only returns hits in files the server has seen via `didOpen`; silence on unopened files. | Adapter walks the project root during `initialize` and opens every `.py` file, mirroring TypeScriptAdapter's tsserver warmup. | T7 |
| `@overload` declarations | Collapse to a single `documentSymbol` entry (kind 12). Hover on the name returns the first overload's signature. | v0.1 surfaces one symbol per overloaded name with the first overload's signature. Limitation documented below. | T5 |

### Declaration-header parsing for `extends`, `implements`, `usedByTypes`

Since `textDocument/implementation` is unavailable and hover omits
the declaration, the adapter reads the source file and parses the
class header directly. Scope is deliberately narrow — the supported
surface is the `class Name(Base1, Base2):` pattern and its common
variants.

**Parser rules (all exportable + unit-tested):**

1. **Locate declaration line.** Use `documentSymbol.selectionRange.start.line`
   to find the `class <Name>` token. `selectionRange` points at the
   identifier, so decorators on preceding lines (`@dataclass`,
   `@runtime_checkable`, multiple stacked decorators) don't affect
   this step — they live above the target line and are ignored.
2. **Extract bases span.** Starting from the declaration line, look
   for `(` after the class name. If absent, the class has no bases
   (`class Foo:`); return empty. If present, collect text from `(`
   through the **matching** `)`, **spanning newlines**. Multi-line
   declarations like:
   ```python
   class Foo(
       Bar,
       Baz,
   ):
   ```
   are read as a single bases span by tracking paren depth across
   lines until depth returns to zero.
3. **Strip balanced `[...]` spans.** Drops generic parameter lists
   like `Generic[T]`, `Base[str, int]`, `Callable[[int], str]`.
   Depth-tracked; nested brackets collapse correctly.
4. **Split on `,` at depth zero.** Commas inside stripped `[...]`
   regions don't split. Each token is trimmed.
5. **Drop keyword arguments.** Any token matching `name=...` is
   a metaclass / `init_subclass` kwarg, not a base. Dropped.
   `class Foo(Bar, metaclass=ABCMeta)` keeps `Bar` only.
6. **Strip trailing `[...]` from each surviving token.** A base like
   `Base1[str]` becomes `Base1`. Dotted names (`typing.Protocol`,
   `collections.abc.Mapping`) are preserved intact as single
   tokens — no further splitting on `.`.

**What the parser does NOT do:**
- Does not resolve `x.y.z` qualified names to an importable module.
  The Protocol detection mechanisms (a/b/c below) handle dotted
  forms via explicit string matching against `typing.Protocol` /
  `typing_extensions.Protocol`.
- Does not execute or evaluate base-list expressions. A base-list
  computed from a function call (`class Foo(mixin_factory()):`)
  degrades to "bases not extracted" — the function-call expression
  isn't a valid identifier name and is dropped with no value
  returned. Pathological case; non-goal for v0.1.
- Does not handle PEP 695 generic class syntax (`class Foo[T](Bar):`)
  specially — the `[T]` portion appears between the class name and
  `(`, but the parser's "look for `(` after class name" rule reads
  past it transparently since we locate via `selectionRange`, not
  via source-column scanning.

**Pathological cases degrade gracefully** — "bases not extracted"
rather than wrong extraction — mirroring TypeScriptAdapter's
declaration-header discipline. Specific pathological inputs listed
in Limitations below.

### Protocol vs. ABC semantics — `implements` routing (D1 approved)

Python conflates inheritance and interface-implementation
syntactically (both use the base list), but not semantically. The
adapter surfaces the distinction by routing Protocol bases to
`implements` and everything else to `extends`:

```python
class Canvas(Drawable, Renderable):  # Drawable is Protocol; Renderable is ABC
  ...
# TypeInfo: extends=["Renderable"], implements=["Drawable"], usedByTypes=[]
```

**Why this matters:** lumping all bases into `extends` for v0.1
would commit to "v0.1 Python claims are architecturally lossy
forever" — a one-way-migrations concern (ROADMAP.md). TypeScript
distinguishes extends/implements syntactically; Python adapter
should surface the same distinction when source expresses it.

**ABCs stay in `extends`.** `abc.ABC` and ABC-derived classes are
nominal abstract classes — they represent inheritance, not
structural conformance. Although ABCs are sometimes informally
called "interfaces," they are subtypes of `object` via concrete
inheritance. Routing them to `extends` matches developer intent
and source syntax. Only `typing.Protocol` (structural, duck-typed)
routes to `implements`.

**`@runtime_checkable` Protocols also route to `implements`.** The
decorator adds `isinstance()` support at runtime but doesn't change
the semantic classification. A runtime-checkable Protocol is still
a Protocol; its bases still go to `implements`.

### Protocol detection — three composed mechanisms

The adapter needs to identify Protocol bases even when the Protocol
is imported from another module and not in the project's symbol
inventory. No single mechanism covers all cases; three compose:

**(a) Hardcoded canonical Protocol names.** The adapter treats
`Protocol` and `typing.Protocol` as Protocols unconditionally. This
covers the dominant case: a class inheriting directly from
`typing.Protocol` with the standard import. Accounts for ~95% of
real code per inspection of the benchmark targets.

**(b) Import alias tracing.** When parsing a source file, the
adapter tracks import-statement aliases:

```python
from typing import Protocol as Interface
from typing_extensions import Protocol
```

Any name that aliases `typing.Protocol` or `typing_extensions.Protocol`
is treated as a Protocol when it appears in a class base list.
Parsing is localized to the file's top-level imports; no whole-
module import graph walk.

**(c) Symbol-inventory lookup for project-defined Protocols.** For
a class `class Alpha(Protocol): ...` declared in the project, the
adapter records during pass-1 indexing that `Alpha` is a Protocol.
Subsequent classes inheriting from `Alpha` route `Alpha` to
`implements`. Detection for pass-1 uses mechanisms (a) and (b) on
`Alpha`'s own declaration.

**Composition:** at lookup time, a base name is treated as a
Protocol if ANY of the three mechanisms fires. Order doesn't
matter — the disjunction is inclusive and precomputed during the
indexing pass that needs it.

### Two-pass indexing for full runs, single-pass for queries

Full indexing (driven by `extractGitSignal`'s callers, or
`contextatlas index`) needs pass-1 Protocol knowledge before pass-2
can compute `usedByTypes`. Separated responsibilities:

- **Pass 1** (full-indexing): walk every project `.py` file,
  compute each class's `isProtocol` flag using mechanisms (a)+(b)
  against each file's imports + declaration. Cache: `Map<SymbolId, boolean>`.
- **Pass 2** (full-indexing): for each class, compute
  `extends` / `implements` / `usedByTypes` using the pass-1 cache
  to route Protocol bases correctly and to identify subclass
  candidates.

**Single-symbol operations (`listSymbols`, `getSymbolDetails`,
`findReferences`, `getDiagnostics`) stay single-pass.** These
return file-local data and don't need inventory-wide Protocol
awareness. Only `getTypeInfo` needs the cache.

**`getTypeInfo` at query time without the cache:** when the
adapter is queried before or without a full-indexing run, the
Protocol cache is unavailable. The adapter falls back to mechanisms
(a) + (b) only — which covers the canonical-Protocol case. Project-
defined Protocols (c) will route to `extends` until the cache is
built. This is a degraded mode but not incorrect — the ADR-07
contract says `implements` contains Protocols; failing to detect a
project-defined Protocol means leaving it in `extends`, which is
the less-lossy error direction.

### SymbolKind mapping (matches [ADR-01](ADR-01-symbol-id-format.md) taxonomy)

| Python construct | Adapter kind | How detected |
|---|---|---|
| Regular class | `class` | LSP kind 5 + no Protocol base |
| `typing.Protocol` class | `interface` | LSP kind 5 + Protocol in bases (mechanisms a/b/c) |
| `abc.ABC` class | `class` | LSP kind 5 + no Protocol base; ABC inheritance not distinguished as separate kind |
| `@dataclass` class | `class` | LSP kind 5; decorator doesn't change kind |
| Method / `__init__` | `method` | LSP kind 6 |
| `@property`-decorated method | `method` | LSP kind 6; hover `(property)` prefix surfaces in signature only |
| `@classmethod` / `@staticmethod` | `method` | LSP kind 6 |
| Top-level function | `function` | LSP kind 12 |
| Type alias (bare / `: TypeAlias` / PEP 695 `type`) | `type` | LSP kind 13 + hover `(type)` prefix |
| Annotated module constant (`X: int = 3`) | `variable` | LSP kind 14 |
| Bare module variable (`X = 3`) | `variable` | LSP kind 13 without hover `(type)` prefix |
| Nested class | `class` | LSP kind 5 (nested in kind 5) |
| Parameter / instance variable | (discarded) | LSP kind 13 nested under a method — not surfaced as a top-level symbol |

**Decorator policy.** `@property`, `@classmethod`, `@staticmethod`,
`@dataclass`, `@runtime_checkable` appear in the signature string
when present (hover already includes them) but don't influence
kind. Rationale: adds granularity without commitment to how
callers should interpret it. Future refinement gate is benchmark
evidence.

### File extensions — `.py` only in v0.1

The adapter's `extensions` list is `[".py"]`. **Stub files (`.pyi`)
are not indexed in v0.1.** Rationale: stubs are type-declaration-
only and carry no implementation. Indexing them would double the
symbol count for libraries that ship stubs alongside source, with
each duplicate carrying a distinct `file_sha` per ADR-01, producing
two atlas entries for the same logical symbol with no way for
consumers to tell they are the same thing. The benchmark target
(httpx) ships source, not stubs, so v0.1 scope isn't affected.

Stub handling is post-MVP and is called out in Non-goals below.
When revisited, three options need weighing (index `.pyi` only
when `.py` is absent; index both and merge at symbol-ID level;
index both as distinct symbols). That's a separate decision with
its own architectural considerations.

## Rationale

- **Pyright over jedi-stack.** `getTypeInfo` is load-bearing for
  `impact_of_change`; jedi can't deliver reliable cross-file
  inference. This isn't a stylistic preference — it's a capability
  disqualifier documented in ADR-07.
- **Empirical grounding.** The probe (commit 66da648) turned up
  `textDocument/implementation = unhandled` as the top finding.
  Without empirical check, the adapter would have been written
  assuming the tsserver `getTypeInfo` pattern ports, discovering
  the gap only at test time or dogfood time. Probe cost ~2 hours
  including re-run for column-math bug; implementation cost savings
  likely multiples of that. Codified in the commit history via the
  probe artifact.
- **Declaration-header parsing is bounded.** The supported surface
  is `class Name(Base1, Base2):` — not general Python. The parser
  is ~50 lines of string manipulation with explicit unit tests for
  each variant. ADR-03's "Cross-adapter assumptions are disallowed"
  rule isn't violated — this parser is local to the Python adapter.
- **Protocol → `implements` routing over lumping.** Python's
  structural-subtyping semantics matter architecturally, and the
  TypeScript adapter already distinguishes `extends` / `implements`
  at the contract layer. Making Python's adapter lump would create
  a cross-language inconsistency that `impact_of_change` consumers
  would have to special-case.
- **ABCs to `extends`, not `implements`.** ABCs are concrete
  inheritance — `class Foo(ABC)` is `Foo extends ABC`. Routing ABCs
  to `implements` would confuse Python developers reading the atlas
  and break the symmetry with TypeScript's `class Foo extends
  AbstractBase`.
- **Three-mechanism Protocol detection.** (a) alone covers ~95%
  but fails on aliased imports; (b) adds alias support at ~15 LOC;
  (c) adds project-defined Protocol support with the pass-1/pass-2
  indexing split. Each mechanism is independently valuable and
  testable. Removing any one leaves a real gap.
- **Two-pass indexing confined to full runs.** Single-symbol ops
  staying single-pass keeps query latency proportional to the
  single-symbol work, not to repo size. The cache is an indexing
  artifact, not a query-time dependency.

## Consequences

- **PyrightAdapter ships with its own declaration parser.**
  Approximately 50 LOC for the class-header parser, 30 LOC for
  the import alias tracer, 20 LOC for Protocol detection logic.
  All three are exportable and directly unit-testable against the
  existing probe fixture.
- **`test/fixtures/pyright-probe/` migrates to `test/fixtures/python/`.**
  The probe fixture becomes the adapter's primary test fixture.
  Additional fixture files may be added for specific conformance
  cases.
- **ADR-07 semantics hold across TypeScript and Python.**
  `TypeInfo.{extends, implements, usedByTypes}` has the same
  meaning in both adapters; only the extraction mechanism differs.
- **Overload limitation documented.** Atlases of Python code with
  `@overload`-heavy APIs will surface one symbol per overloaded
  name with the first overload's signature only. Discoverable via
  `find_by_intent` and linkable to architectural claims, but the
  full overload set isn't visible at the atlas layer. Post-MVP
  refinement gated on benchmark evidence.
- **Shared `LspClient`.** `src/adapters/lsp-client.ts` unchanged.
  Both adapters use it; the probe validated it drives Pyright
  correctly without modification. ADR-03's plugin interface holds.
- **Adapter registry one-line update.** `src/adapters/registry.ts`
  swaps the `"python"` case's throw statement for `new PyrightAdapter()`.
- **Conformance suite lands in the same step.** A shared
  `src/adapters/conformance.ts` spec plus per-adapter
  `conformance.test.ts` files proves both adapters satisfy the
  same behavioral contract. Described in the Step 9 plan commit
  message, not this ADR (it's adapter-infrastructure, not a
  Python-specific decision).

## Limitations

Called out explicitly so future readers don't rediscover them as
bugs:

- **Overloads collapse.** `@overload def f(x: int): ...` +
  `@overload def f(x: str): ...` + implementation surface as one
  symbol with the first overload's signature. Actual overload set
  is invisible at atlas layer. Post-MVP refinement gated on
  benchmark evidence.
- **Protocol detection via declaration parsing.** Generic
  Protocols (`class Proto(Protocol[T]): ...`) are detected via the
  same parser that strips `[...]` spans. Complex cases — Protocol
  as a value computed from a function call, Protocol created via
  metaclass manipulation — fall through to treating the class as
  non-Protocol. The adapter produces correct results for the
  99%-common case; pathological edge cases degrade gracefully (no
  crash, possibly wrong `implements` / `extends` routing).
- **Class-header parser pathological inputs.** Declarations the
  parser reads as "no bases" rather than extracting them:
  - Base-list expressions computed from function calls:
    `class Foo(mixin_factory()):` — the `mixin_factory()` token is
    dropped during the kwarg-filter step (contains `(`) or survives
    as a non-identifier token with no cleanup path. Non-goal for v0.1.
  - Base-list items that are complex type expressions:
    `class Foo(Optional[Bar]):` — the Optional wrapper is stripped
    along with `[Bar]`, leaving the base list empty. Rare in
    practice; Optional / Union / Annotated in a base position is
    unusual Python code.
  - Dynamically-constructed classes via `type()` or metaclass
    `__new__`: invisible to Pyright's documentSymbol to begin with;
    not in the adapter's input.
  - Base-list comprehensions or conditionals (`class Foo(*bases):`
    with star-unpacking): not supported; the `*bases` token is
    dropped.

  The common thread: when source diverges from
  `class Name(Identifier1, Identifier2[Generic], pkg.Identifier3):`,
  the parser degrades to "fewer bases extracted" and continues
  without raising. Wrong routing (a real base dropped) is possible
  in pathological inputs but never wrong data (an extracted base
  that isn't one).
- **ABC vs. concrete-class distinction not surfaced as separate
  SymbolKind.** Both get `class`. ABCs' abstract-method discipline
  is visible via source (a method decorated with `@abstractmethod`)
  but not reflected in the symbol's kind field. Not a bug — ABC
  classes really are classes. Making them a separate kind would
  require propagating "abstract" through the type system, which
  isn't v0.1 scope.
- **Dynamic class construction is invisible.** Classes created
  via `type()` at runtime, dataclass-factory functions, or
  metaclass-driven instantiation aren't in Pyright's document
  symbols and therefore aren't in the atlas. Mirrors Pyright's
  own static-analysis limits.
- **`@runtime_checkable` adds no kind granularity.** Still
  routes to `implements`; the decorator's runtime effect isn't
  surfaced. Identifiable from the signature string if a caller
  cares.
- **Pyright version drift.** Pyright ships every ~2 weeks; hover
  format and LSP capabilities occasionally shift. The probe
  harness (`scripts/pyright-probe.ts`) can be re-run against new
  versions to detect format drift. A CI check rerunning the probe
  on Pyright version bumps is post-v0.1 hardening.

## Non-goals

- **basedpyright support.** Pyright only for v0.1. basedpyright
  revisit requires evidence of concrete Pyright limitations the
  fork addresses.
- **Per-overload symbol representation.** One atlas symbol per
  overloaded name. Post-MVP.
- **pydantic / sqlalchemy / django runtime-modification
  introspection.** Pyright analyzes what's statically visible.
  Classes whose attributes are mutated by metaclasses or
  decorators at import time are visible only in their static
  form. Runtime-augmented attributes are invisible. Consistent
  with Pyright's analytical model; documented so users don't
  expect otherwise.
- **Python version-specific type behavior.** Adapter targets
  Python 3.12+ (PEP 695 `type` statement supported). Older Python
  code parses and indexes fine; no special-case paths.
- **Jupyter notebook indexing.** `.ipynb` is not in the extensions
  list (only `.py` and `.pyi`). Notebook extraction is post-MVP
  if evidence shows demand.
- **Async/await signal extraction.** `async def` surfaces in the
  signature string. No separate kind, no separate claim-extraction
  pass. Post-MVP if evidence emerges.
- **Stub file (`.pyi`) indexing.** Stubs are not indexed in v0.1
  — the adapter's `extensions` list is `.py` only. Three options
  need weighing when revisited: (A) keep `.py`-only (current v0.1),
  (B) index `.pyi` only when `.py` is absent (common for typeshed-
  style pure-stub libraries), (C) index both and define merge
  semantics at the symbol-ID level. The decision has atlas-schema
  implications and deserves its own ADR when evidence forces it.
