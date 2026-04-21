---
id: ADR-02
title: Router is an interface with multiple implementations behind a chooser and performance-shaped presets
status: accepted
severity: hard
symbols:
  - Router
  - RegExpRouter
  - TrieRouter
  - SmartRouter
  - LinearRouter
  - PatternRouter
  - UnsupportedPathError
  - hono
  - hono/tiny
  - hono/quick
---

# ADR-02: Router is an interface with multiple implementations behind a chooser and performance-shaped presets

## Context

No single routing algorithm wins on every axis a web framework cares about:

| Router         | Match speed | Build cost  | Path coverage | Bundle size |
|----------------|-------------|-------------|---------------|-------------|
| RegExpRouter   | Fastest     | High        | Limited       | Medium      |
| TrieRouter     | Good        | Low         | Full          | Medium      |
| LinearRouter   | O(n)        | Near-zero   | Good          | Small       |
| PatternRouter  | Varies      | Low         | Full          | Smallest    |

- **RegExpRouter** compiles all routes into one combined regex for fast
  matching, but throws `UnsupportedPathError` on path shapes it can't encode
  and pays a non-trivial up-front build cost.
- **TrieRouter** supports every path shape Hono allows but is slower per
  match than RegExpRouter.
- **LinearRouter** does near-zero work at build time and walks routes in
  order at match time. Ideal for very short-lived workers where the router
  is built once per request and route count is modest.
- **PatternRouter** wraps the platform's `URLPattern` — it ships the smallest
  code because the regex engine is the runtime's, not the framework's.

Picking one of these as the framework's only router forces users to optimize
for one use case. Hono targets three distinct ones:

- Long-running servers (Node, Bun, Deno standalone) — match speed dominates.
- Edge / cold-start workers (Workers, Lambda) — per-request build cost
  matters because the router may be constructed on every invocation.
- Minimum-bundle deploys (tiny edge workloads, constrained environments) —
  bundle size dominates.

## Decision

**All router implementations implement `Router<T>`** defined in
`src/router.ts`:

```ts
export interface Router<T> {
  name: string
  add(method: string, path: string, handler: T): void
  match(method: string, path: string): Result<T>
}
```

New router implementations must implement the full interface. Partial
implementations (e.g., a router that throws on certain HTTP methods, or
doesn't support a subset of path patterns the other routers accept) are not
allowed.

The `Result<T>` shape is deliberately dual — `[[T, ParamIndexMap][],
ParamStash] | [[T, Params][]]` (`src/router.ts:98`). Implementations may pick
whichever representation suits their algorithm; consumers of router output
must handle both.

**A `SmartRouter` chooses between routers at first match**
(`src/router/smart-router/router.ts`). It is constructed with an ordered
list of routers. On first `match()`, it tries each router in order, catches
`UnsupportedPathError`, locks to the first router that succeeds, and
hot-swaps its own `match` method to the winner's bound method:

```ts
this.match = router.match.bind(router)
this.#routers = [router]
this.#routes = undefined
```

Subsequent requests bypass SmartRouter entirely — the selection cost is paid
once.

**Three presets ship as separate entry points:**

| Import           | Router strategy                              | Optimized for             |
|------------------|----------------------------------------------|---------------------------|
| `hono` (default) | `SmartRouter([RegExpRouter, TrieRouter])`    | Long-running servers      |
| `hono/quick`     | `SmartRouter([LinearRouter, TrieRouter])`    | Edge / cold-start workers |
| `hono/tiny`      | `PatternRouter` alone                        | Minimum bundle size       |

Advanced users may bypass presets by passing any `Router<T>` directly:
`new Hono({ router: new RegExpRouter() })` (`src/hono-base.ts:46-65`).

## Rationale

- **The interface is what makes everything downstream possible.** Presets,
  user-supplied routers, the SmartRouter chooser, future router
  implementations — none of these work without a shared contract. A single
  canonical router would remove the interface, and remove every useful
  thing downstream of it.

- **SmartRouter trades a tiny one-time cost for avoiding a hard choice.**
  The try-each-router cost is paid on the first match and never again —
  `match` is rebound to the winner, so subsequent requests go straight to
  the chosen router with no intermediate dispatch.

- **Presets encode performance shape, not feature flags.** `hono/quick` vs.
  `hono/tiny` aren't configuration options toggled at runtime; they're
  different module graphs so the bundler ships different code. A Workers
  deployment importing `hono/tiny` doesn't pay the cost of RegExpRouter's
  builder code even though that code exists in the repo.

- **The `Result<T>` dual shape is a deliberate optimization point.**
  `ParamIndexMap` + `ParamStash` avoids eagerly constructing per-request
  `Params` objects for every matched route — consumers can read indices and
  look up values on demand. Routers that don't benefit from this return the
  simpler `Params` shape.

## Consequences

- **New routers must support the full path grammar**, including every path
  shape that at least one existing router already accepts. Otherwise a
  preset swap (`hono` → `hono/tiny`) would silently change which routes
  work — a breakage no test can catch without enumerating every path
  pattern.

- **The dual `Result<T>` shape is part of the public contract.** Anything
  consuming router output (`compose()`, context construction, `app.routes`
  introspection) must handle both representations. Consumers assuming one
  form will break when the active router uses the other.

- **SmartRouter mutates itself on first match.** `router.name` changes from
  `"SmartRouter"` to e.g. `"SmartRouter + RegExpRouter"`. Tests, dev tools,
  and introspection code that read `router.name` must tolerate this
  transition. Users needing fully deterministic behavior should pass a
  concrete router instead of a SmartRouter-based preset.

- **Preset choice is a public API commitment.** Removing `hono/quick` or
  `hono/tiny` is a breaking change for every downstream user importing
  from those paths. Adding new presets is additive and safe.

- **Runtime behavior may differ subtly between presets for the same app.**
  A pattern supported by RegExpRouter+TrieRouter (`hono` default) might not
  be supported by PatternRouter (`hono/tiny`) because the underlying
  platform's `URLPattern` has different semantics. Documentation must flag
  which path shapes are universally supported across all presets.

- **The "pass your own router" escape hatch is real.** Users who want a
  router that isn't shipped — say, a custom radix tree optimized for their
  route set — can implement `Router<T>` and pass it in. The interface is
  their API, not just an internal abstraction. Breaking changes to the
  interface are breaking changes to user code.

- **Benchmarks must cover each router.** `benchmarks/routers/` exists
  precisely because the multi-router strategy requires comparative data to
  keep the presets' rationale valid. Removing routers or presets without
  benchmark evidence is not a supported maintenance path.
