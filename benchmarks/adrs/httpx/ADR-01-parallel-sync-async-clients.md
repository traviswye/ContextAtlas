---
id: ADR-01
title: Parallel sync and async client classes share configuration via BaseClient; no runtime polymorphism
status: accepted
severity: hard
symbols:
  - Client
  - AsyncClient
  - BaseClient
  - USE_CLIENT_DEFAULT
  - ClientState
---

# ADR-01: Parallel sync and async client classes share configuration via BaseClient; no runtime polymorphism

## Context

httpx needs to offer both synchronous (`requests`-compatible) and
asynchronous (`asyncio`, `trio`) HTTP client APIs. Python has no native
`async`/`sync` polymorphism — an `async def` function is a fundamentally
different thing from a regular `def`: the call site differs (`client.get()`
vs `await client.get()`), the return type differs (`Response` vs
`Awaitable[Response]`), and mixing them at the type level destroys
inference.

Three design paths were available:

- **Option A: Sync-only, async via adapter.** Keep a single synchronous
  client; users wrap calls with `run_in_executor` or similar to await
  them. Rejected: defeats the purpose — blocking I/O in a thread pool is
  not true async, and it locks out `trio`-native code paths.

- **Option B: Single polymorphic client with runtime dispatch.** One
  `Client` class whose methods detect whether they're called from an
  async context and route accordingly. Rejected: destroys type inference
  (return type can't be statically known), leaks runtime complexity into
  every call site, and makes the "is this awaitable?" question a matter
  of runtime inspection.

- **Option C: Two parallel client classes** with matched surfaces, sharing
  as much non-I/O configuration as possible through a common base. This
  is what httpx chose.

## Decision

httpx ships two concrete client classes with matched API surfaces:

- `httpx.Client` (`httpx/_client.py:594`) — synchronous.
  Methods are regular `def`: `client.get(url)` returns `Response`.
- `httpx.AsyncClient` (`httpx/_client.py:1307`) — asynchronous.
  Methods are `async def`: `await client.get(url)` returns `Response`.

Both inherit from a single `BaseClient` (`httpx/_client.py:188`) that
holds all I/O-free configuration and state:

- Auth chain (`_auth`)
- Default headers, cookies, query params
- Timeout configuration (`_timeout: Timeout`)
- Redirect policy (`follow_redirects`, `max_redirects`)
- Event hooks (`_event_hooks`)
- Base URL, trust-env, default encoding
- Lifecycle state (`_state: ClientState`)

`BaseClient` contains zero I/O methods. Every method that hits the wire
(`send`, `get`, `post`, `put`, `delete`, `patch`, `head`, `options`,
`stream`, `request`) exists twice — once on `Client` (sync) and once on
`AsyncClient` (async). The two implementations are parallel: the method
signatures match modulo `async`/`await`, and the semantics are identical.

The client choice is made at **instantiation time**, not at call time.
Once a user picks `Client` or `AsyncClient`, every interaction with that
instance is either sync or async — never mixed. Type checkers see
concrete classes with concrete method signatures; return types are
statically resolvable at every call site.

A `USE_CLIENT_DEFAULT` sentinel (`httpx/_client.py:94-114`) distinguishes
"use whatever the client was configured with" from "explicitly disable
this parameter" (which uses `None`). Both clients use this sentinel
across their I/O method signatures so per-request overrides have
unambiguous semantics.

## Rationale

- **Type safety is preserved at every call site.** A function parameter
  typed as `Client` produces sync return types; `AsyncClient` produces
  awaitables. Static analysis (mypy, pyright) works cleanly without
  special cases or plugins. Overloads that try to express both at once
  inevitably widen return types to `Union[Response, Awaitable[Response]]`,
  which is uselessly imprecise.

- **Users understand the cost up front.** Choosing `AsyncClient` in a
  sync context is a visible error at write-time (you get an awaitable
  you can't await). Runtime polymorphism hides this — `client.get()`
  "working" in every context makes sync/async blending feel free when
  it isn't.

- **Implementation clarity.** The sync path doesn't drag in an event
  loop; the async path doesn't call `asyncio.run()` internally on the
  user's behalf. Each class is what it says it is.

- **Shared configuration is genuinely shared.** Auth objects, headers,
  cookies, timeouts, redirect policy — none of these differ between
  sync and async. Hoisting them to `BaseClient` eliminates the
  duplication that matters (configuration surface) while leaving
  duplicated what legitimately differs (I/O method bodies).

- **Matches Python ecosystem convention.** `sqlite3` vs `aiosqlite`,
  `psycopg2` vs `asyncpg`, `redis.Redis` vs `redis.asyncio.Redis` —
  parallel class trees are how the ecosystem handles this. Deviating
  would surprise users.

## Consequences

- **Method-level duplication is accepted.** `Client.get`, `Client.post`,
  `Client.stream`, `Client.send`, and their `AsyncClient` counterparts
  are separate implementations. Changes to I/O semantics must be applied
  in both places. Hoisting logic into `BaseClient` is only viable for
  I/O-free logic; shortcuts that `await` inside `Client` or block inside
  `AsyncClient` are bugs, not optimizations.

- **Tests must cover both paths.** A fix verified only against `Client`
  can silently diverge on `AsyncClient`. The test suite (`tests/client/`)
  mirrors this structure with paired sync/async test modules.

- **Auth objects must bridge both sides.** Because auth is shared config
  (on `BaseClient`) but is exercised by both sync and async I/O paths,
  `Auth` exposes both `sync_auth_flow` and `async_auth_flow` methods
  (`httpx/_auth.py:62-110`) that adapt a shared generator-based
  `auth_flow` — see ADR-04 for the full auth design.

- **Event hooks follow the same rule.** `event_hooks["request"]` and
  `event_hooks["response"]` may be either sync functions (used by
  `Client`) or coroutine functions (used by `AsyncClient`). Mixing types
  wrong produces runtime errors; `BaseClient` doesn't enforce coroutine-ness
  because the type of hooks depends on which subclass dispatches them.

- **Resource management is per-subclass.** `Client` uses `__enter__` /
  `__exit__`; `AsyncClient` uses `__aenter__` / `__aexit__`. Users
  cannot use `with async_client:` or `async with client:` — the wrong
  context manager shape raises at entry. This is a feature: it prevents
  accidental misuse.

- **`USE_CLIENT_DEFAULT` is an internal implementation detail** exposed
  in public signatures out of necessity (Python has no way to say "omit
  this parameter" in a callee-visible way without a sentinel). Users
  should omit the parameter entirely rather than passing
  `USE_CLIENT_DEFAULT` explicitly; `None` is reserved for explicit
  disable.

- **API surface duplication is load-bearing for documentation.** Users
  reading `Client.get` docs do not benefit from being told "see
  `AsyncClient.get`." The identical surface is the affordance. Docstring
  parity between the two classes is a maintenance requirement, not a
  style preference.
