---
id: ADR-03
title: Koa-style onion middleware via compose(); single-handler fast path
status: accepted
severity: hard
symbols:
  - compose
  - MiddlewareHandler
  - Handler
  - Next
  - Context
  - Hono
  - HonoBase
---

# ADR-03: Koa-style onion middleware via compose(); single-handler fast path

## Context

A web framework's middleware model is a foundational choice with many
downstream consequences. It dictates what middleware can do, how errors
propagate, whether wrapping logic (timing, tracing, error boundaries, CORS,
retries) is natural or awkward, and how framework-level composition
primitives like `app.route()` and `app.mount()` behave across nested apps.

Three common models exist:

- **Express-style callback pipeline**: middleware signature is
  `(req, res, next) => void`; middleware calls `next(err?)` to advance the
  pipeline. To run code *after* downstream handlers, middleware must attach
  listeners (`res.on('finish')`) or wrap `res.end`. Wrapping logic is
  awkward; async error handling is manual.

- **Koa-style onion composition**: middleware signature is
  `(ctx, next) => Promise<void>`; middleware `await`s `next()` to invoke
  the rest of the chain, then continues. Wrapping is natural — the
  middleware holds execution between `before-next` and `after-next`.
  Errors propagate via promise rejection and are caught at the outer layer.

- **Fastify-style encapsulation**: middleware is registered within scopes;
  each scope has its own lifecycle hooks; more isolation, stricter plugin
  contracts, less dynamic composition.

## Decision

Hono uses **Koa-style onion composition**. The implementation is
`src/compose.ts` — 74 lines modeled on `koa-compose` with additions for
`onError` and `onNotFound` handlers.

The middleware signature is:

```ts
type MiddlewareHandler<E, P, I> = (
  c: Context<E, P, I>,
  next: Next
) => Promise<Response | void>
```

Middleware calls `await next()` to invoke the rest of the chain, then may
inspect or modify `c.res` afterward. Errors thrown anywhere in the chain are
caught by `compose()` and delegated to the app's `onError` handler
(`src/compose.ts:52-59`). If a handler returns nothing and `c.finalized` is
false at the tail of the chain, the `onNotFound` handler runs
(`src/compose.ts:62-65`).

As a performance carve-out, **routes that matched exactly one handler do
NOT flow through `compose()`**. The dispatch code in
`src/hono-base.ts:424-442` detects `matchResult[0].length === 1` and invokes
the single handler directly with an inline `next` that triggers the
not-found handler if the handler doesn't finalize. Routes with two or more
handlers (middleware + terminal handler, or any chain) go through `compose()`
normally.

Within `compose()`, each middleware call is guarded against double-advance:
calling `next()` twice triggers `'next() called multiple times'`
(`src/compose.ts:33-35`), preventing the class of bugs where a middleware
accidentally calls `next` in both a happy path and an error path.

## Rationale

- **Wrapping is the dominant middleware pattern.** Logger, timing, request-id,
  CORS, secure-headers, body-limit, compress, etag, timeout, pretty-json —
  nearly every middleware in `src/middleware/**` does work before AND after
  `next()`. Onion composition makes this trivial:

  ```ts
  const timing: MiddlewareHandler = async (c, next) => {
    const start = performance.now()
    await next()
    c.header('X-Response-Time', `${performance.now() - start}ms`)
  }
  ```

  The same pattern in Express requires either a `res.on('finish')` listener
  or monkey-patching `res.end` — both error-prone.

- **Error propagation is lexical.** Because `next()` returns a promise,
  ordinary `try { await next() } catch (e) {}` works. Middleware that needs
  to catch and transform errors from downstream (e.g., converting
  `HTTPException` to JSON) reads like normal async code. The framework's
  own error handler is a parameter to `compose()`, not a global pipeline
  stage, so sub-apps composed via `app.route()` can carry their own error
  handlers scoped to their route group.

- **The fast-path matters at the edge.** Many routes have exactly one
  handler — the terminal handler, with no middleware — especially on edge
  deploys that minimize middleware to keep cold start fast. Skipping
  `compose()` for these routes saves one closure allocation, one outer
  promise, and one microtask per request. On Workers, where cold start and
  per-request overhead are measured in milliseconds, this is not
  theoretical.

- **Small file = auditable.** `compose.ts` is 74 lines. Every 2+ handler
  request on every Hono deployment flows through this code. The fact that
  it fits on one screen is itself a feature: dispatch bugs can be
  diagnosed by reading the whole file, not by tracing through a dispatcher
  and a scheduler and a handler registry.

## Consequences

- **Middleware MUST call `await next()` at most once.** Calling it twice
  fails at `src/compose.ts:34` with a recognizable error. This is enforced
  at runtime, not at type level — code review and linting remain
  responsible for catching double-`next()` patterns before they ship.

- **Forgetting `await` on `next()` is a real class of bugs** that neither
  the type system nor `compose()` catches. Middleware that calls `next()`
  without `await` will let downstream handlers run concurrently with its
  own continuation, violating the onion model. Linters that enforce
  `require-await` or `no-floating-promises` help but are not foolproof.

- **Two dispatch paths exist** — the single-handler fast-path and the
  `compose()`-mediated path. Tests that exercise middleware composition
  MUST have at least two handlers in the route; otherwise they don't
  exercise `compose()` at all. Fixing a bug in `compose.ts` without
  verifying the one-handler path still works (or vice versa) is a trap.

- **`onError` is per-compose-invocation**, not global. `src/hono-base.ts:208-232`
  wires this up for nested apps: when an app mounted via `.route()` has a
  non-default `errorHandler`, its handlers are wrapped with a per-app
  `compose([], subApp.errorHandler)(...)` call so errors in the sub-app
  are caught by its own handler, not the parent's. This is a deliberate
  nuance — mounted apps maintain their error-handling identity.

- **`compose.ts` is high blast radius.** Every 2+ handler route on every
  Hono deployment goes through this file. Changes here ripple to every
  user of every middleware. Performance regressions here are measurable
  across the entire ecosystem. Reviews of `compose.ts` changes should
  include micro-benchmarks.

- **The fast-path is an invariant, not an optimization.** Removing it
  "because it duplicates compose logic" is a subtle regression: the
  fast-path's code path is not equivalent to `compose()` with a single
  middleware entry, because `compose()` allocates closures and promises
  unconditionally. This is documented by the inline comment in
  `src/hono-base.ts:423`: `// Do not compose if it has only one handler`.

- **The Koa model locks Hono out of Fastify-style encapsulation.**
  Plugins that rely on scope-local lifecycle (schema compilation, per-scope
  logger injection) must be rebuilt in terms of middleware composition.
  This is accepted: Hono's model is simpler and composes across runtimes
  without a plugin manager.
