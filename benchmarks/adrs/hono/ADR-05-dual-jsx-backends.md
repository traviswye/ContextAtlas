---
id: ADR-05
title: Dual JSX backends — server streaming and DOM hydration — share an element model behind distinct entry points
status: accepted
severity: hard
symbols:
  - hono/jsx
  - hono/jsx/dom
  - hono/jsx/dom/client
  - jsx-runtime
  - jsxImportSource
  - Suspense
  - ErrorBoundary
  - createContext
  - useContext
---

# ADR-05: Dual JSX backends — server streaming and DOM hydration — share an element model behind distinct entry points

## Context

Hono aims to be both a server framework (generating HTML responses) and a
basis for client applications (DOM rendering and hydration). These are
genuinely different rendering problems:

- **Server-side rendering** needs to stream string chunks, support
  async components (`<Suspense>`), handle `ErrorBoundary` fallbacks, and
  finish as fast as possible. There is no DOM, no reconciler, no stateful
  effects across time — a component renders once per request.

- **Client-side rendering** needs a reconciler, a scheduler, hook state
  across renders, effects (`useEffect`, `useLayoutEffect`), transitions,
  refs, hydration from server-rendered HTML, and a compatibility surface
  that matches developer expectations shaped by React.

React solves this with a single element model and separate `react-dom/server`
and `react-dom/client` renderers. Svelte, Solid, and Vue each make their own
trade-offs. The relevant choice for Hono was whether to:

- **Option A**: Ship a single isomorphic JSX runtime that handles both
  server streaming and DOM hydration. Simpler surface area, but forces
  the server to pull in reconciler/effect code it never uses, and the
  client to understand string-streaming concerns it doesn't need.
- **Option B**: Ship two JSX runtimes behind separate entry points, sharing
  only what legitimately overlaps (element representation, component
  contract, context). Larger surface to maintain, but each side ships only
  what it needs.

## Decision

Hono ships **two JSX runtimes behind distinct entry points**, sharing a
common element/component model:

**`hono/jsx` — server-side** (`src/jsx/`)
- String-streaming SSR; `<Suspense>` streaming with boundary placeholders;
  async components; `ErrorBoundary`.
- Render target: string chunks to a `ReadableStream` or concatenated
  response body.
- Hook surface: render-time concerns (`useContext`, `use`, `memo`,
  lightweight hook stubs). Stateful client hooks (`useState`, `useEffect`)
  are not meaningful here and are either no-ops or unavailable.
- JSX runtime: `src/jsx/jsx-runtime.ts`, `src/jsx/jsx-dev-runtime.ts`
  (for TypeScript's `jsxImportSource` pragma).
- Entry: `src/jsx/index.ts` (package export `hono/jsx`).

**`hono/jsx/dom` — client-side** (`src/jsx/dom/`)
- DOM mounting, hydration, reconciler, scheduler, full hook suite —
  `useState`, `useEffect`, `useLayoutEffect`, `useInsertionEffect`,
  `useReducer`, `useTransition`, `useDeferredValue`, `useSyncExternalStore`,
  `useId`, `useRef`, `useImperativeHandle`, `useCallback`, `useMemo`,
  `useActionState`, `useOptimistic`, `startTransition`,
  `startViewTransition`, `forwardRef`.
- React-compatibility shims for the hooks and lifecycle behavior developers
  expect from ecosystem conventions.
- Render target: DOM mutations against a root element.
- JSX runtime: `src/jsx/dom/jsx-runtime.ts`,
  `src/jsx/dom/jsx-dev-runtime.ts`.
- Entry: `src/jsx/dom/index.ts` (package export `hono/jsx/dom`). A
  dedicated mount entry ships as `hono/jsx/dom/client`.

**Shared core** (`src/jsx/`)
- Element and Fragment representation (`src/jsx/base.ts`) — both backends
  consume the same element shape.
- `createContext` / `useContext` semantics (`src/jsx/context.ts`).
- Common types (`src/jsx/types.ts`).
- `Children` utilities (`src/jsx/children.ts`).

**Backend selection is at build time, not runtime.** Users configure
TypeScript's `jsxImportSource`:

```json
// tsconfig.json for server code
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "hono/jsx" } }

// tsconfig.json for client code
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "hono/jsx/dom" } }
```

The TypeScript JSX transform then emits imports from the chosen
`/jsx-runtime` entry, and only the selected backend's code is bundled.

## Rationale

- **Server and client care about fundamentally different things.** A
  reconciler is necessary on the client (to diff and patch a mounted
  tree) and useless on the server (which renders once and flushes). An
  effect scheduler matters on the client (to batch effects across
  re-renders) and is meaningless on the server. Forcing one runtime to do
  both either makes the server ship a reconciler it never uses
  (bundle-size problem on Workers, where the 1 MB limit is real) or
  constrains the client to a string-first abstraction that impedes DOM
  optimizations.

- **Hook semantics legitimately diverge.** `useEffect` on the server has
  no meaning — there is no commit phase, nothing to clean up.
  `useActionState` has different coupling to transitions in each
  context. Splitting hook implementations reflects real semantic
  divergence rather than papering over it. A unified runtime would have
  to either stub hooks on the server (breaking shared components that
  use them) or pay for client-only machinery on the server.

- **Shared element model keeps components portable.** A component that
  consumes only shared primitives — elements, props, context — can render
  on either side. This is the minimum viable isomorphism: enough for
  most components written carefully; not promising more than the runtimes
  can actually deliver.

- **Import-time backend selection beats runtime branching.** The build
  decides which JSX runtime ships to where. Workers bundles don't load
  DOM hook code; browser bundles don't ship string-SSR internals.
  Tree-shaking alone is not sufficient because server and client
  runtimes have different module shapes with different side effects —
  the entry point decides.

- **Matches developer mental model.** Developers familiar with React's
  `react-dom/server` / `react-dom/client` split understand this structure
  immediately. The separate-entry-point pattern is industry-standard for
  frameworks doing both SSR and hydration.

## Consequences

- **Features that exist on both sides must be implemented in both places.**
  Shared: `createContext`, `useContext`, element rendering, component
  contract. Duplicated: most hooks (`src/jsx/hooks/` for server,
  `src/jsx/dom/hooks/` for client). This duplication is load-bearing —
  attempts to unify hook implementations that have legitimately different
  semantics will produce subtle bugs that show up only in specific
  render paths.

- **The two subsystems can drift semantically.** A change to server
  `useContext` without a matching change to client `useContext` silently
  breaks isomorphic components. Tests MUST cover both renderers for any
  shared primitive. Cross-renderer regression tests are as load-bearing
  as cross-runtime adapter tests.

- **Users building isomorphic components must be disciplined about
  imports.** Importing `useEffect` from `hono/jsx/dom` in code that also
  runs server-side pulls DOM hook code into the server bundle and
  frequently fails at runtime. Build configs must route
  `jsxImportSource` per-target; monorepo setups often need per-package
  tsconfigs.

- **Adding a third rendering backend** (native, terminal, image rendering,
  React Native) requires a third entry point following the same pattern,
  not a runtime option on an existing runtime. This is expected — the
  architecture is explicitly extensible via additional backends, not
  via backend flags.

- **The JSX subsystem is a significant fraction of the codebase.**
  `src/jsx/` and `src/jsx/dom/` together span 30+ files with dozens of
  hooks and intrinsic-element implementations. Changes must be verified
  against both renderers; either-side-only changes are suspect.

- **React-compatibility is a feature of `hono/jsx/dom`, not `hono/jsx`.**
  The server runtime does not commit to matching React's server
  semantics — only to producing valid HTML streams with Hono's own
  feature set. Apps doing both SSR and hydration must work within the
  intersection of both runtimes' APIs; features unique to one side
  cannot be used by shared components.

- **Package-export commitment.** `hono/jsx`, `hono/jsx/dom`, and
  `hono/jsx/dom/client` are public entry points. Removing or
  restructuring them is a breaking change for every downstream user.
  `package.json` exports map (`./jsx`, `./jsx/dom`, `./jsx/dom/client`,
  plus the `jsx-runtime` and `jsx-dev-runtime` variants) is the stable
  contract users depend on for their build configuration.

- **The `jsx-runtime.ts` / `jsx-dev-runtime.ts` files are implicit API
  surface.** TypeScript emits imports from these files automatically when
  `jsxImportSource` is configured. Changes to their exported names
  (`jsx`, `jsxs`, `jsxDEV`, `Fragment`) break every compiled file in
  every downstream app. These are not internal modules despite looking
  like generated glue.
