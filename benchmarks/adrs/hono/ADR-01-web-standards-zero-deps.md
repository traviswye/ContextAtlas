---
id: ADR-01
title: Web Standards as core abstraction; zero runtime dependencies
status: accepted
severity: hard
symbols:
  - hono
  - Hono
  - HonoBase
  - Context
  - HonoRequest
  - fetch
  - adapter
---

# ADR-01: Web Standards as core abstraction; zero runtime dependencies

## Context

Hono targets nine-plus JavaScript runtimes — Cloudflare Workers, Cloudflare
Pages, Deno, Bun, AWS Lambda, Lambda@Edge, Vercel Edge Functions, Netlify
Functions, Service Workers, and Node.js via the separate `@hono/node-server`
package. These runtimes disagree on file I/O, crypto primitives, stream
implementations, HTTP server shapes, and environment/secret access. They
converge on one substrate: the WHATWG Fetch standard
(`Request`, `Response`, `Headers`, `URL`, `URLSearchParams`, `fetch`,
`ReadableStream`, `TextEncoder`/`TextDecoder`, `AbortController`, and
`globalThis.crypto` for Web Crypto).

Two failure modes follow from ignoring this convergence:

1. **Runtime-specific imports in core**. A `import { readFile } from 'node:fs'`
   anywhere in `src/hono.ts` or `src/context.ts` makes the framework fail to
   load on Cloudflare Workers at startup and silently pull polyfills on Deno.
2. **Runtime dependencies in core**. A dependency that works on Node may not
   exist on Workers. A polyfill dep bloats every bundle and expands the supply
   chain. Users install `hono` expecting portability and zero bundle cost.

Both failures share a root cause: core code assumed something other than the
Web Standard substrate.

## Decision

1. **Core code is built entirely on Web Standard APIs.** Permitted primitives:
   `Request`, `Response`, `Headers`, `URL`, `URLSearchParams`, `fetch`,
   `ReadableStream` / `WritableStream` / `TransformStream`, `TextEncoder` /
   `TextDecoder`, `globalThis.crypto` (Web Crypto), `AbortController` /
   `AbortSignal`, `Blob`, `FormData`. No runtime-specific globals or imports.

2. **The `hono` package has zero runtime dependencies.** `package.json` lists
   only `devDependencies`. New dependencies in the `dependencies` field are
   rejected. Dev-time packages (TypeScript, vitest, eslint, `@types/*`) are
   permitted because they do not ship.

3. **Runtime-specific integration lives in `src/adapter/<runtime>/**`.** Each
   adapter translates the runtime's native event/request shape into a Web
   Standard `Request`, invokes `app.fetch(request, env, ctx)` on core, and
   shapes the returned `Response` back into whatever the runtime expects.

4. **"Core" is precisely defined**: `src/hono.ts`, `src/hono-base.ts`,
   `src/context.ts`, `src/compose.ts`, `src/request.ts`, `src/types.ts`,
   `src/router/**`, `src/validator/**`, `src/client/**`, and `src/utils/**`.
   Middleware in `src/middleware/**` must prefer Web Standards; where a
   runtime-specific import is unavoidable it must be cross-runtime in practice
   (the single current example is `node:async_hooks` for `AsyncLocalStorage`
   in `src/middleware/context-storage/index.ts`, now supported by Node, Bun,
   Deno, and Cloudflare Workers).

## Rationale

- **Portability is the product.** Hono's tagline is "Web framework built on
  Web Standards." The zero-dep, no-runtime-imports combination is what makes
  that tagline load-bearing rather than aspirational. A user can reasonably
  expect `app.fetch(request, env, ctx)` to run unmodified on any of the
  supported runtimes because no piece of core depends on anything outside
  the Web Standard substrate.

- **Bundle size compounds.** Every transitive dep is shipped by bundlers by
  default. `hono/tiny` advertises sub-12 kB; that only holds if core brings
  nothing along. On Workers, where the 1 MB compressed bundle limit is real,
  a single careless dep can blow the budget for the entire application.

- **Trust and supply chain.** Users running on Workers or Lambda Edge operate
  in environments where auditing transitive dependencies is expensive or
  impossible. `npm install hono` adding nothing but `hono` itself is a
  security property, not a nicety.

- **Single `fetch` entry point.** Because core only traffics in Web Standards,
  the same `app.fetch(request, env, ctx)` signature works everywhere. The
  adapter's job is to produce that call — not to modify the app's behavior.

- **Mechanical enforcement.** Both rules can be checked automatically: any
  non-empty `dependencies` field fails CI; any `node:` import outside
  `src/adapter/**` (with the `node:async_hooks` exception) fails a grep-based
  lint. Reviewers don't need judgment to catch violations.

## Consequences

- **Utilities are hand-implemented.** Functionality that other frameworks
  delegate to libraries — cookie parsing, query parsing, MIME detection,
  base64, JWT signing/verification, UUID, body reading — lives in
  `src/utils/**`. The `utils/` directory is larger than in dependency-heavy
  frameworks. This is the deliberate cost of the zero-dep rule.

- **Third-party middleware lives outside this repo.** Middleware that needs
  deps (Zod validation, OpenAPI generation, Sentry, Prisma integration) ships
  under `@hono/*` scope or user-owned packages. `hono-middleware` monorepo
  contains the officially-maintained set. These are separate npm packages;
  installing them is opt-in and their deps don't affect users who don't.

- **Node-specific packages stay outside core.** `@hono/node-server` is a
  separate package even though Node is a supported runtime, because adding
  it to `src/adapter/` would pull Node types into the main `hono` package
  and affect every non-Node user's type resolution. Adapters inside this
  repo are for runtimes whose type surface is either Web-Standard or
  already shipped by the runtime (Cloudflare's `@cloudflare/workers-types`
  is devDependency-only).

- **New features that need runtime APIs fork into adapter implementations.**
  Streaming file I/O, WebSocket upgrade, connection info (client IP),
  signed-cookie crypto — each requires one adapter file per runtime. Adding
  a capability is not a single patch to core.

- **Per-adapter helpers legitimately import runtime primitives.**
  `src/adapter/bun/serve-static.ts` imports `node:fs/promises`;
  `src/adapter/deno/serve-static.ts` imports `node:path`;
  `src/adapter/lambda-edge/handler.ts` imports `node:crypto`. These are
  expected — they only run on runtimes that provide those modules.

- **The `node:async_hooks` exception in context-storage middleware** is
  documented as cross-runtime-in-practice. If any supported runtime drops
  `AsyncLocalStorage` support, this middleware must be re-homed to an
  adapter-specific location or dropped. The exception is not open-ended —
  future `node:` imports in `src/middleware/**` require explicit ADR-level
  justification.

- **Reviewers can enforce both rules mechanically.**
  - `package.json` `dependencies` field must remain empty or absent.
  - `rg "from ['\"](node:|bun|fs|path|crypto|http|https)['\"]" src/` must
    return only entries under `src/adapter/**` (plus the documented
    context-storage exception and test files, which don't ship).
