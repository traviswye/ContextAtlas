---
id: ADR-03
title: Transport is a pluggable abstraction with parallel sync and async base classes; enables in-process ASGI/WSGI testing and mocking
status: accepted
severity: hard
symbols:
  - BaseTransport
  - AsyncBaseTransport
  - HTTPTransport
  - AsyncHTTPTransport
  - ASGITransport
  - WSGITransport
  - MockTransport
  - Client.transport
  - AsyncClient.transport
  - mounts
---

# ADR-03: Transport is a pluggable abstraction with parallel sync and async base classes; enables in-process ASGI/WSGI testing and mocking

## Context

An HTTP client's transport is the component that actually turns a
`Request` into a `Response`. Users need this to be swappable for several
reasons:

- **Testing.** Calling a real HTTP endpoint from tests is slow, flaky,
  and often impossible in CI. Users need to substitute a mock that
  returns canned responses without the network.

- **In-process server testing.** A user building an ASGI or WSGI
  application wants to run `httpx.Client(transport=WSGITransport(app))`
  and exercise the app through the normal client API, with no real
  socket. This is the standard `requests`-equivalent pattern the `encode`
  ecosystem pioneered via Starlette's `TestClient`.

- **Custom pooling / proxying.** Users with unusual network topologies
  (Unix domain sockets, custom proxies, retries, circuit breakers) need
  to inject their own transport without modifying httpx itself.

- **Per-URL routing.** A user may want requests to `internal.company`
  to go through an in-process mock while `api.external.com` requests
  use the real network transport.

The choice was whether to make transport a real extension point
(abstract base class, documented contract, multiple shipping
implementations) or to keep it a private implementation detail and
require users to monkey-patch or fork.

## Decision

**Transport is a first-class pluggable abstraction**, with two parallel
abstract base classes mirroring the sync/async split from ADR-01:

```python
# httpx/_transports/base.py
class BaseTransport:
    def handle_request(self, request: Request) -> Response: ...
    def close(self) -> None: ...
    def __enter__(self) -> Self: ...
    def __exit__(self, ...) -> None: ...

class AsyncBaseTransport:
    async def handle_async_request(self, request: Request) -> Response: ...
    async def aclose(self) -> None: ...
    async def __aenter__(self) -> Self: ...
    async def __aexit__(self, ...) -> None: ...
```

The two base classes are **not unified under a common ABC**. They are
siblings. A transport implementation picks one side or the other; mixing
is not supported.

Five transports ship in `httpx/_transports/`:

| Transport              | Sync/Async | Purpose                                |
|------------------------|------------|----------------------------------------|
| `HTTPTransport`        | sync       | Default; wraps httpcore connection pool |
| `AsyncHTTPTransport`   | async      | Default; wraps httpcore async pool     |
| `WSGITransport`        | sync       | Runs a WSGI application in-process     |
| `ASGITransport`        | async      | Runs an ASGI application in-process    |
| `MockTransport`        | both       | User-provided handler function for tests |

Clients accept a `transport` parameter at construction. When `transport`
is `None`, the default httpcore-backed transport is instantiated.

Clients also accept a `mounts` parameter — a `dict[str, Transport]`
keyed by URL pattern. Matching URLs route to the mounted transport
rather than the default (`_client.py:697-716, 760-769`). This enables
patterns like:

```python
client = httpx.Client(
    mounts={
        "all://*.internal/": WSGITransport(my_wsgi_app),
        "all://": HTTPTransport(),
    }
)
```

Transports are **context-manageable**: `with transport:` /
`async with transport:` properly releases connection pool resources.
Clients delegate their own `__enter__`/`__exit__` to the underlying
transports.

## Rationale

- **Testing is a first-class use case.** `encode`-ecosystem users
  routinely test ASGI applications via `httpx.AsyncClient(transport=
  ASGITransport(app))`. This substitutes for running a real server
  behind `uvicorn` and replicates production's request/response flow
  end-to-end, minus the socket. Making this easy was a design goal,
  not an afterthought.

- **Parallel sync/async bases mirror the client split.** Under ADR-01,
  `Client` and `AsyncClient` are separate concrete classes — making
  transports separate too means the types line up: a `Client` takes a
  `BaseTransport`, an `AsyncClient` takes an `AsyncBaseTransport`.
  Unifying transports under one ABC would require clients to do runtime
  type checks to reject the wrong shape, defeating the type-safety
  argument that motivates ADR-01.

- **Explicit over implicit.** Without a transport abstraction, users who
  need mocking or in-process testing must monkey-patch httpcore or the
  httpx internals. Both are fragile and break on every release.
  First-class transports make the extension point stable API.

- **Mounts enable the "multi-destination test" pattern.** Real apps
  call several services; tests need to mock some while hitting others
  (or mocking all). `mounts` makes this a configuration choice at the
  client level rather than a global patch.

- **Context management on transports is correct resource handling.**
  Connection pools hold sockets; ASGI transports may hold reference
  to the app. Requiring explicit close (or context management) ensures
  tests don't leak file descriptors between cases.

## Consequences

- **New transport implementations pick a side.** Authors of third-party
  transports (e.g., `httpx-aiohttp`, caching wrappers, retry shims)
  must decide sync or async and commit to the corresponding base class.
  "Dual-mode" transports are possible only by providing two separate
  classes (see `MockTransport`, which supplies both sync and async
  handler callbacks but keeps the sync and async code paths distinct).

- **The transport interface is minimal and public.** `handle_request` /
  `handle_async_request` is the single method third-party transports
  must implement. This is stable API; breaking changes to it are
  breaking changes for every wrapper in the ecosystem.

- **Client features live above the transport layer.** Redirects, auth
  flows (ADR-04), cookie persistence, event hooks, timeout coordination —
  all implemented in `Client` / `AsyncClient` wrapping calls to
  `transport.handle_request`. This is deliberate: transports should
  not re-implement these concerns.

- **Exception translation happens at the default transport boundary.**
  `HTTPTransport` / `AsyncHTTPTransport` map httpcore exceptions to
  httpx exceptions (`_transports/default.py:71-82`). Third-party
  transports are expected to raise httpx exception types (or
  subclasses). Raising `httpcore.*Error` directly leaks an implementation
  detail.

- **`mounts` uses `URLPattern` matching** (`_utils.py`'s `URLPattern`
  class), a compact URL-matching DSL supporting `all://`, scheme,
  host, port, and wildcards. Users extending `mounts` must understand
  this pattern grammar; documentation should cover it explicitly.

- **Testing with `ASGITransport` is async-only.** Users testing ASGI
  apps must use `AsyncClient(transport=ASGITransport(app))`; there is
  no sync wrapper that hides the event loop. Sync testing of ASGI
  apps requires `asyncio.run`-wrapping at the test level. `WSGITransport`
  is the sync equivalent for WSGI apps.

- **The ABC boundary is the extension contract.** If a future httpx
  version introduced a new method to `BaseTransport` (e.g.,
  `handle_stream_request`), every third-party transport would need to
  implement it or fail. Additions to the base classes are breaking
  changes. Prefer extending via new transport classes over expanding
  the base interface.

- **ASGITransport's dual-runtime support** (asyncio and Trio via
  `sniffio` in `_transports/asgi.py:29-52`) is an ADR-02 consequence:
  the transport layer must uphold the runtime-agnosticism commitment,
  not just the user-facing API.
