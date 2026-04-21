---
id: ADR-04
title: Type inference flows from route registration through handler and validator to typed RPC client, with no code generation
status: accepted
severity: hard
symbols:
  - Hono
  - HandlerInterface
  - HonoBase
  - Context
  - Input
  - Schema
  - validator
  - hc
  - Client
  - MergePath
  - ToSchema
  - createProxy
---

# ADR-04: Type inference flows from route registration through handler and validator to typed RPC client, with no code generation

## Context

Hono markets "first-class TypeScript support" as one of three core pillars
alongside Web Standards and multi-runtime support. The product promise has
a specific, end-to-end shape:

1. **Path params infer from the pattern.**

   ```ts
   app.get('/users/:id', c => {
     const id = c.req.param('id')  // typed string
   })
   ```

2. **Validator output infers into the handler.**

   ```ts
   app.post('/users', validator('json', v => schema.parse(v)), c => {
     const body = c.req.valid('json')  // typed from validator
   })
   ```

3. **The client is typed from the server, with no code generation.**

   ```ts
   import { hc } from 'hono/client'
   import type { AppType } from '../server'

   const client = hc<AppType>('https://api.example.com')
   await client.users[':id'].$get({ param: { id: '1' } })
   //                                ^— typed, autocompleted, validated
   ```

Every arrow in this chain is a type flow. If any arrow silently drops type
information, the downstream types collapse to `any`. The user's code still
compiles, autocomplete vanishes, `hc` goes stale, and no compiler error
fires. The failure is invisible — the worst kind in a framework whose
marketed differentiator is type safety.

Alternatives considered:

- **Code generation** (OpenAPI → client): adds a build step, drifts from the
  runtime schema, decouples server and client types so drift is possible.
- **Runtime type introspection** (schemas as values): requires a runtime
  schema library dependency, pulling schema types at runtime into every
  client bundle.
- **Explicit route type annotations**: verbose, duplicates information
  already present in the route definition, drifts.

## Decision

The type-inference chain from route registration through handler Context to
typed client MUST be preserved end-to-end. The chain has four load-bearing
segments:

**1. Route methods accumulate a composite Schema.**

Each route method (`.get`, `.post`, `.put`, `.delete`, `.options`, `.patch`,
`.all`, `.on`) is typed via `HandlerInterface` in `src/types.ts:127+`, with
overloads for each handler-chain length (one handler, two handlers,
three handlers, ...). Each route registration returns a new:

```ts
HonoBase<
  IntersectNonAnyTypes<[E, E2, ...]>,
  S & ToSchema<M, P, I, MergeTypedResponse<R>>,
  BasePath,
  CurrentPath
>
```

so that `app.get(...).post(...).route(...)` chains accumulate a composite
`Schema` losslessly. The generic parameter `S` is what `hc<typeof app>`
eventually reads.

**2. Path patterns propagate into handler Context.**

`MergePath<BasePath, P>` carries the route pattern into `Context<E, P, I>`,
so `c.req.param('<name>')` is typed from the pattern string. Nested apps
mounted via `.basePath()` and `.route()` contribute to `BasePath` and
propagate through.

**3. Validator output flows into the handler Input.**

`validator()` middleware (`src/validator/validator.ts:46+`) produces a
`MiddlewareHandler` whose type carries an `Input` with `in`/`out` fields.
When used in a route chain, the validator's `Input` merges into the
downstream handler's `Context<E, P, I>` so `c.req.valid(target)` returns
the validated type. This is why `HandlerInterface` has overloads per chain
length — each arity threads the merged `Input` through.

**4. Client inference with no codegen.**

`hc<typeof app>(baseUrl)` consumes the app's accumulated `Schema` and
produces a typed RPC surface at the call site. The runtime implementation
is a recursive JavaScript `Proxy` — 17 lines in `src/client/client.ts:15-31`:

```ts
const createProxy = (callback: Callback, path: string[]) => {
  return new Proxy(() => {}, {
    get(_obj, key) {
      if (typeof key !== 'string' || key === 'then') return undefined
      return createProxy(callback, [...path, key])
    },
    apply(_1, _2, args) {
      return callback({ path, args })
    },
  })
}
```

The `get` trap recursively builds a Proxy at every property access,
accumulating path segments. The `apply` trap fires when a method like
`$get` is called, dispatching the request with the collected path.

**There is no build step.** The only coupling between server and client is
the TypeScript `typeof app` import at type level. At runtime, the client
ships only the Proxy + fetch machinery.

Changes that break any segment of this chain — returning `any` from a route
method's declared return type, flattening a `HandlerInterface` overload,
losing the `S & ToSchema<...>` accumulation, stripping `Input` through
middleware composition, or degrading the `Schema` surface seen by `hc` —
are REGRESSIONS and MUST be treated as bugs, not refactors or
simplifications.

The rule applies to the **declared type surface**: route method return
types, Context generics, `HandlerInterface` overloads, `hc` return types,
`validator` output types. Internal helper bodies may use `any` where
necessary for the types to compose (e.g., `this as any` returns in
`src/hono-base.ts:139`).

## Rationale

- **It's the marketed differentiator.** Hono can be fast, tiny, and portable
  without type inference — and remain useful. But if it markets first-class
  TypeScript and silently degrades to `any`, users are worse off than if
  nothing had been promised: no error, but no autocomplete, and runtime
  bugs escape that should have been caught in the editor.

- **No codegen is a hard architectural commitment, not a performance
  optimization.** The reason `hc<typeof app>` works is that the full
  `Schema` is accessible from the server app's TypeScript type — no JSON
  emission, no OpenAPI intermediate, no schema registry. If any part of
  the inference chain breaks, the escape valve isn't "fall back to
  codegen" — the escape valve doesn't exist. The types are the contract.

- **Proxy runtime is 17 lines.** The entire typed RPC machinery's runtime
  footprint is the `createProxy` function plus request-building utilities.
  Everything else comes from TypeScript at compile time. This is part of
  the product: no build tools, no schema generation, no runtime schema
  validation overhead on the client.

- **Silent failure is the worst failure mode.** A runtime bug throws; CI
  catches it; someone fixes it. A type regression makes autocomplete stop
  working silently, and users don't notice for weeks. The mitigation is
  type-level tests that fail CI when the inference chain breaks.

- **`typeof app` as the client contract is the payoff for everything
  else.** All the overload work in `src/types.ts`, the `Input` propagation
  through validators, the `MergePath` threading — they exist specifically
  so that `hc<typeof app>` produces a complete, accurate, autocompleted
  client. Degrading any earlier step is equivalent to breaking the client,
  even if no test in the client directory fails.

## Consequences

- **`src/types.ts` is ~1400 lines** and changes there carry wide blast
  radius. Adding a new handler-chain arity requires adding overloads
  across every route method consistently. Inconsistent overload sets cause
  subtle inference collapses for specific call shapes.

- **`any` in a route method's declared return type is a hot review
  signal.** Internal `any` in helper bodies (marked with eslint-disable
  comments) is tolerated where necessary; `any` at the API surface is
  never tolerated.

- **`hc<typeof app>` makes response-shape changes compile-time breaking
  changes for every `hc` consumer** — even when no runtime API shape
  changed. A route returning `c.json({ id })` changed to `c.json({ userId })`
  breaks all typed clients. This is accepted: typed clients mean the
  types are the API. Breaking changes are caught at the client's
  compilation, not at runtime.

- **`tsc --noEmit` is part of the release gate.** `package.json:13`
  runs `"tsc --noEmit && vitest --run"` for the `test` script. Removing
  the type check from the gate removes the primary protection for the
  inference chain.

- **Type-only tests are load-bearing.** `src/hono.test.ts`,
  `src/types.test.ts`, and scattered `.test.ts` files contain type-level
  assertions (`expectTypeOf`, `const _assert: Expect<Equal<A, B>> = true`).
  Removing them to "clean up" the test suite is the same class of mistake
  as removing runtime regression tests.

- **Middleware authors touching `MiddlewareHandler` generics** at
  `src/types.ts:83+` must preserve `Input` propagation. Changes that look
  local — adjusting one generic default, reordering parameters — can
  silently break the validator→handler inference chain for every user.
  PR reviews for type changes should include a "does the validator
  example in the README still infer?" check.

- **The Proxy client has one fragile invariant.** The `get` trap returns
  `undefined` for the `then` property (`src/client/client.ts:18`)
  specifically to prevent the Proxy from being auto-awaited as a thenable
  and collapsing into a resolved promise. Any change to the `get` trap
  must preserve this escape for `then`. This is a runtime invariant that
  isn't captured by types and can only be caught by integration tests.

- **Third-party validators (`@hono/zod-validator` and friends) depend on
  the `validator()` type signature.** Backwards-incompatible changes to
  how `validator()` produces `Input` break every adapter validator in
  the ecosystem. These changes belong in major version bumps with
  migration guidance.

- **Adding a route-level feature (pre-validators, route metadata, etc.)**
  that sits between `.get(path, ...)` and the handler MUST extend
  `HandlerInterface` overloads for every arity. Adding it to only the
  single-handler overload leaves the multi-handler variants broken and is
  a regression per the rule above.
