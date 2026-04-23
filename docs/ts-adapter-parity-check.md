# TypeScriptAdapter parity check (v0.2 Stream A #4)

**Status:** Investigation artifact. Tracks Step 4 of
[`../STEP-PLAN-V0.2.md`](../STEP-PLAN-V0.2.md). Supersedes the scope
doc's "Python-adapter dogfood query set" framing, which referenced
an artifact that didn't exist — see revision history in the step
plan.

## Purpose

Step 4's ship criterion: *"Identify any Python-only affordances that
should exist in TypeScript too (e.g., is the declaration-header
parser's pathology handling as robust in TS?)."*

The `pyright.test.ts` integration suite accumulated density during
v0.1 httpx dogfood — each edge case that surfaced on real Python
code became a regression-protected test. The `typescript.test.ts`
integration suite is sparse by comparison (~8 tests on a 14-line
`sample.ts`), not because TS has fewer edge cases but because the
v0.1 TS fixture stayed minimal.

Step 4's deliverable: mirror Python's integration-test coverage
density on the TS side, informed by real TS pathology surfaced
during a hono spot-check.

## Out of scope

Already covered by `src/adapters/conformance.ts` (both adapters
pass per Step 9):

- Symbol-ID shape and language code on listSymbols output
- Missing-file handling (returns [], doesn't throw)
- Invalid-ID handling across `getSymbolDetails` / `findReferences` /
  `getTypeInfo` (returns null / [] / empty shape, doesn't throw)
- Diagnostics surface errors from broken fixtures
- Cross-file references via `findReferences`
- `getTypeInfo` shape contract (arrays present even when empty)

Nothing in this doc re-asserts the conformance contract.

## Parity matrix

Each row: a language-specific pathology with coverage status on each
adapter and action decision. Rows are added during Phase C (hono
spot-check) and Phase B (fixture authoring). "Status" and "Action"
fields get populated as findings land.

### Shape-level pathology

| Pathology | Python analog | Python coverage | TS coverage (pre-Step-4) | Hono usage | Action |
|---|---|---|---|---|---|
| `interface` declarations | `typing.Protocol` via remap | `remaps typing.Protocol subclasses to kind 'interface'` | untested | TBD Phase C | TBD |
| Native `enum { A, B }` members | `class X(Enum)` members (Step 1) | Step 1 fixture + tests | untested | TBD | TBD |
| `abstract class` + `abstract method()` | `abc.ABC` subclass | `keeps ABC subclasses as kind 'class'` | untested | TBD | TBD |
| Getters / setters on a class | `@property` / `@x.setter` | implicit via Counter fixture (sample.py) | untested | TBD | TBD |
| `static method()` on a class | `@staticmethod` / `@classmethod` | implicit via Counter fixture | untested | TBD | TBD |
| Generic class with constraint | Type-parameter classes | not explicitly asserted | untested | TBD | TBD |
| `namespace X { }` | n/a | n/a | untested | 3 files (JSX, Deno) | TBD |
| Declaration merging (`interface X` twice) | n/a | n/a | untested | likely via JSX namespace | TBD |
| Arrow-function exports (`export const fn = () =>`) | n/a | n/a | untested | TBD | TBD |
| `readonly` property modifier | n/a | n/a | untested | TBD | TBD |
| Index signatures (`[key: string]: T`) | Not directly analogous | n/a | untested | TBD | TBD |
| Type-only imports (`import type { X }`) | n/a | n/a | untested | TBD | TBD |
| Type-only exports (`export type { X }`) | n/a | n/a | untested | TBD | TBD |

### Non-shape behaviors

| Behavior | Python coverage | TS coverage (pre-Step-4) | Action |
|---|---|---|---|
| Declaration-header parser robustness on multi-line signatures | `multi-line class declaration` + similar | implicit in `extractDeclarationHeader` unit tests | audit |
| Signature extraction for class with bases | `surfaces signatures for classes with bases` | similar ("populates signatures for class/function/type-alias") | audit |
| Signature extraction for overloaded function | covered explicitly for Python overloads | likely untested for TS function overloads | audit |

## Status: Step 4 complete (Phase D landed)

Execution flow ran A → C → B → D per the step plan's revision. Phase
C (hono spot-check) informed Phase B (fixture). Four gaps fixed in
v0.2; one deferred to v0.3 with rationale.

## Phase C — hono spot-check findings

Three files probed: `src/jsx/base.ts`, `src/hono-base.ts`,
`src/http-exception.ts`. Five material gaps surfaced (see `##
Revision history` in STEP-PLAN-V0.2.md for the formal rescope entry):

- **Gap 1 (HIGH):** TS `listSymbols` iterates only top-level symbols.
  Hono's class methods (`route`, `getResponse`, etc.) invisible;
  `Hono` class resolves to 1 symbol with no members.
- **Gap 2 (MEDIUM):** Namespace children (`JSX.Element`,
  `JSX.IntrinsicElements`, etc. inside `export namespace JSX`)
  invisible.
- **Gap 3 (MEDIUM):** Complex class signature extraction truncates
  on generic defaults — `class Hono<S extends Schema = {}, ...>` had
  empty signature because `extractDeclarationHeader` stopped at the
  `{` inside the generic default.
- **Gap 4 (LOW-MEDIUM):** Arrow-function exports (`export const fn =
  () => ...`) resolve to `kind=variable` with empty signature.
- **Gap 5 (BUG):** Type-alias signatures bleed into the next
  declaration under ASI convention (no trailing `;`).
  `extractTypeAliasHeader` terminated only on `;` so collected
  ran into subsequent `export type FC = ...`.

## Phase B — parity fixture coverage

`test/fixtures/typescript/parity.ts` exercises:
- `ParityClass` — class with instance method, static method, readonly
  property (Gap 1)
- `ParityInterface` — interface with property signatures + method
  signature (Gap 1)
- `ParityNamespace` — namespace with inner interface + inner type
  alias (Gap 2)
- `FirstTypeAlias` / `SecondTypeAlias` — ASI-convention adjacent
  type aliases (Gap 5)
- `GenericHost<T, S = {}, U>` — multi-line generic class with `{}`
  default to mirror hono's Hono class pathology (Gap 3)
- `arrowExport` — arrow-function const export (Gap 4 surface, no
  target assertion in v0.2)

Integration tests live in `src/adapters/typescript.test.ts` under
the `"parity (v0.2 Stream A #4)"` describe block.

## Phase D — gap outcomes

### Fixed in v0.2

| Gap | Commit | Fix | Production LOC |
|---|---|---|---|
| 1 (class/interface children) | `36b2c87` | `listSymbols` iterates `sym.children` for container kinds (LSP 2/5/11); children whose mapped kind is `"other"` are filtered (matches Python policy) | ~25 |
| 2 (namespace children) | `36b2c87` | Rides on Gap 1 — LSP kind=2 (Module/Namespace) added to CONTAINER_KINDS set | ~3 |
| 3 (generic-default truncation) | `1aca8bf` | `extractDeclarationHeader` tracks `<...>` depth via character scan; `{` and `;` treated as terminators only at genericDepth 0 | ~15 |
| 5 (type-alias signature bleed) | `7646243` | `extractTypeAliasHeader` adds second termination condition — stops before a subsequent line that starts a new top-level declaration (column-0 keyword match); exports `looksLikeNewTopLevelDeclaration` for unit testing | ~20 (inc. new helper + tests) |

### Deferred to v0.3

**Gap 4 — arrow-function export signatures.** `export const fn = (...) =>` resolves to `kind=variable` with empty signature. Users see the const as a variable without parameter list or return type.

**Defer rationale:**
- Not correctness — surfaced symbol is correctly typed as a variable; it just lacks signature detail.
- Fix requires a new signature-extraction path (arrow-function heuristic detecting `= (...) =>` after a const declaration), distinct from the class/function declaration-header extractor.
- Common pattern but not v0.2-thesis-blocking; deferred until v0.3 where the broader claim-source-enrichment work is happening and signature extraction can be revisited holistically (e.g., alongside JSDoc-driven signature augmentation).

### Known limitation (not a gap)

**TS fields typed as function don't surface as methods.** hono's `Hono` class declares HTTP verb routes as properties with function types:

```typescript
class Hono {
  get!: HandlerInterface<...>   // LSP kind=7 (Field)
  post!: HandlerInterface<...>  // LSP kind=7 (Field)
  ...
  route(path, app): Hono { ... }  // LSP kind=6 (Method)
}
```

Verification against hono post-Step-4 confirmed: `route` surfaces as `method`; `get`/`post`/`put`/`delete` do NOT surface. This is correct policy — the children-iteration filters kinds that map to `"other"`, which includes LSP kind=7 (Property) and kind=8 (Field). Matches Python's "drop instance vars" discipline.

No Python analog exists for "field typed as function" — Python methods are always `def name(self):` which LSP emits as kind=6. TS idiom of function-typed fields is strictly TS; the consistent-policy choice is to treat them as fields (dropped) rather than methods (kept). Claims that reference `Hono.get` should resolve to the `Hono` class itself, where the handler types are visible in the class signature.

If future evidence (e.g., claim-resolution failures on real hono code) suggests this policy produces wrong results, the fix surface is extending `mapSymbolKind` to map LSP kind=7 to a new SymbolKind (requires ADR-01 amendment) or relaxing the child-filter policy to surface fields alongside methods (requires ADR-03 policy amendment). Neither fits v0.2 scope.

### Fix-or-defer rubric (reference)

- **Fix in v0.2** if: the gap produces wrong or absent symbols on
  real code shapes in hono or common TS projects, AND fix size is
  ≤ 50 LOC with clear regression test coverage.
- **Defer to v0.3+** if: the gap is edge-case only, OR fix size is
  large, OR fix requires an ADR amendment that isn't justified by
  current benchmark evidence.
- **No action** if: current behavior is correct and test coverage
  is sufficient (Step 1 outcome — "already correct, tests protect
  against regression").

## Document relationship

- [`../STEP-PLAN-V0.2.md`](../STEP-PLAN-V0.2.md) — parent step plan
- [`adr/ADR-03-language-adapter-plugin.md`](adr/ADR-03-language-adapter-plugin.md)
  — LanguageAdapter plugin interface contract
- [`adr/ADR-13-python-adapter-pyright.md`](adr/ADR-13-python-adapter-pyright.md)
  — precedent for empirical probe-before-code pattern
- [`../src/adapters/conformance.ts`](../src/adapters/conformance.ts)
  — shared behavioral contract (out-of-scope for this parity check)
