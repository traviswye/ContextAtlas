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

## Status: pending

Phase A (this doc) lands as a placeholder matrix. Phase C (hono
spot-check) fills in "Hono usage" and reveals which shapes need
fixture coverage. Phase B (parity fixture + tests) uses that
evidence. Phase D documents outcomes — fix-or-defer per gap — back
into the "Action" column.

## Phase C — hono spot-check findings

*(Populated during Phase C.)*

## Phase B — parity fixture coverage

*(Populated during Phase B.)*

## Phase D — gap outcomes

*(Populated during Phase D.)*

### Fix-or-defer rubric

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
