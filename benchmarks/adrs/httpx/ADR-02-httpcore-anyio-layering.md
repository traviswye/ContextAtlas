---
id: ADR-02
title: httpx is layered on httpcore for wire protocol and uses sniffio/anyio patterns to support both asyncio and Trio
status: accepted
severity: hard
symbols:
  - httpcore
  - sniffio
  - anyio
  - HTTPTransport
  - AsyncHTTPTransport
  - ASGITransport
---

# ADR-02: httpx is layered on httpcore for wire protocol and uses sniffio/anyio patterns to support both asyncio and Trio

## Context

A modern HTTP client must solve several independent problems:

1. **Wire protocol** — HTTP/1.1 and HTTP/2 parsing, connection
   establishment, TLS handshakes, keep-alive, connection pooling.
2. **Client-level semantics** — redirects, authentication, cookies,
   content encoding/decoding, multipart bodies, URL handling.
3. **Async runtime** — Python has two production async runtimes,
   `asyncio` (stdlib) and `trio` (structured concurrency). They have
   incompatible primitives (`asyncio.Event` vs `trio.Event`,
   `asyncio.Lock` vs `trio.Lock`, different task semantics).

Building all three into one library creates tight coupling. A change to
connection pooling risks breaking auth handling; a change to Trio
support risks breaking asyncio. Coupling also forces users onto every
transitive choice — you cannot take httpx's auth without taking its
specific connection pool implementation, or vice versa.

Three architectural options existed:

- **Option A: Single monolith.** One library doing everything. Rejected:
  poor separation of concerns; hard to maintain; forces "all or nothing"
  on users wanting just one piece.
- **Option B: asyncio-only, no Trio support.** Simpler — pick one async
  runtime and live with it. Rejected: the `encode` team ships Starlette
  and ASGI tooling that runs under both; committing httpx to asyncio-only
  would fragment the stack.
- **Option C: Layered architecture.** A lower-level library for wire
  protocol and pooling (httpcore), with httpx on top providing the
  user-facing API. Use runtime-agnostic patterns (sniffio detection) to
  support both asyncio and Trio.

## Decision

httpx adopts a **layered architecture** with a clean split of
responsibilities:

**httpcore (separate package, pinned as `httpcore==1.*`)** — handles:
- HTTP/1.1 and HTTP/2 parsing and framing
- TCP/TLS connection establishment
- Connection pooling, keep-alive, concurrency limits
- Low-level request/response primitives

**httpx (this package)** — handles:
- User-facing `Client` / `AsyncClient` API (ADR-01)
- Request/Response models, URL, Headers, Cookies, multipart
- Authentication flows (ADR-04)
- Redirect handling, cookie persistence, event hooks
- Content encoding/decoding (gzip, brotli, zstd)
- Transport abstraction layer (ADR-03) — adapters to httpcore and
  alternatives (ASGI, WSGI, Mock)

The boundary is enforced by the transport layer: httpx's default
`HTTPTransport` / `AsyncHTTPTransport` (`httpx/_transports/default.py`)
wraps httpcore's connection pool and maps httpcore exceptions into
httpx exceptions (`HTTPCORE_EXC_MAP`, `_transports/default.py:71-82`).
No other httpx module imports httpcore directly.

**Async runtime agnosticism:** httpx declares `anyio` as a dependency but
does not use anyio as a full abstraction layer in every call path.
Instead, it uses the `sniffio` + dual-import pattern where runtime
primitives are needed:

```python
# httpx/_transports/asgi.py:29-52
def is_running_trio() -> bool:
    try:
        import sniffio
        if sniffio.current_async_library() == "trio":
            return True
    except ImportError:
        pass
    return False

def create_event() -> Event:
    if is_running_trio():
        import trio
        return trio.Event()
    import asyncio
    return asyncio.Event()
```

`sniffio` is the ecosystem-standard detector for which async library is
active in the current task. `anyio` provides the broader abstraction
when httpx needs blocking-thread dispatch or cross-runtime sleeping.

**Trio support is a tested commitment.** `pyproject.toml` declares
`"Framework :: AsyncIO"` and `"Framework :: Trio"` classifiers. The CI
matrix exercises both runtimes. Breaking Trio support is a regression,
not a simplification.

## Rationale

- **Separation of concerns.** Users who want only connection pooling
  without httpx's API can depend on httpcore directly. Users who want a
  different transport (ASGI in-process, mocks, a custom pool) can swap
  the transport without forking httpx. The boundary is clean because it
  is minimal: `Request → Response` over an abstract transport interface.

- **Layered libraries scale better than monoliths.** httpcore evolves
  its connection pool and HTTP/2 support on its own cadence; httpx
  evolves its API and auth on its own. A bug in one does not block
  releases of the other. The `httpcore==1.*` pin protects httpx from
  accidental breakage while allowing httpcore to patch.

- **`sniffio` avoids a hard choice between asyncio and Trio.** Hardcoding
  asyncio would lock out the `encode` stack's Trio-based deployments.
  Requiring users to declare their runtime at client construction would
  leak implementation complexity into the user API. Runtime detection
  at the points where primitives differ (event creation, locking) is
  the minimal-invasiveness approach.

- **Trio support costs relatively little.** The places where primitives
  differ are narrow — event creation inside `ASGITransport`,
  task-level locking — and the `sniffio` pattern makes them explicit
  and auditable.

- **httpcore's HTTP/2 support is opt-in** via the `http2` extras
  (`pyproject.toml:45-46` — `h2>=3,<5`). Because httpx delegates wire
  protocol to httpcore, HTTP/2 support is installable without
  restructuring httpx itself. The extras-based install pattern is a
  consequence of the layering.

## Consequences

- **httpcore's API is httpx's dependency surface.** Upgrading httpcore
  across a major version (e.g. `1.* → 2.*`) is a coordinated release
  for httpx. The `==1.*` pin makes this explicit.

- **Exception translation is load-bearing.** Users see httpx exceptions
  (`ConnectTimeout`, `ReadError`, `RemoteProtocolError`) regardless of
  which httpcore exception was actually raised. The mapping at
  `_transports/default.py:71-82` is the single source of truth; adding
  a new httpcore exception without mapping it leaks
  `httpcore.*Error` to users.

- **Trio support requires ecosystem discipline.** Code that calls
  `asyncio.create_task`, `asyncio.sleep`, or uses `asyncio.Lock` where
  a primitive would be reachable under Trio is a Trio regression.
  Reviewers must flag direct `asyncio.*` use outside of asyncio-only
  code paths. Prefer `anyio` abstractions when synchronization is
  needed in cross-runtime code.

- **`sniffio` is a hard runtime dependency** even though Trio itself is
  not. This is acceptable — `sniffio` is tiny and exists precisely for
  this use case.

- **ASGI/WSGI transports extend the runtime contract.** `ASGITransport`
  must work under both asyncio and Trio (`_transports/asgi.py`);
  `WSGITransport` is sync-only and may assume no async context. Tests
  verify both.

- **Documentation must not hide the layering.** Users running into a
  connection-level bug may need to file against httpcore, not httpx.
  The troubleshooting docs should acknowledge this rather than pretending
  httpx is a single library.

- **Feature requests sit at a layer boundary.** "Add per-host
  concurrency limits" belongs in httpcore (connection pooling);
  "Add a per-request header callback" belongs in httpx (auth/event
  hooks). Landing features on the wrong layer creates the tight
  coupling this ADR exists to prevent.

- **The layering does not remove the need for httpx's transport
  abstraction.** ADR-03 explains why `BaseTransport`/`AsyncBaseTransport`
  exists even though the default implementation wraps httpcore —
  it lets users plug in ASGI, WSGI, mocks, or custom transports
  without any httpcore at all.
