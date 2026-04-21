---
id: ADR-04
title: Authentication is a generator-based flow that may yield multiple requests and inspect responses
status: accepted
severity: hard
symbols:
  - Auth
  - Auth.auth_flow
  - Auth.sync_auth_flow
  - Auth.async_auth_flow
  - BasicAuth
  - DigestAuth
  - FunctionAuth
  - NetRCAuth
  - requires_request_body
  - requires_response_body
---

# ADR-04: Authentication is a generator-based flow that may yield multiple requests and inspect responses

## Context

HTTP authentication is not uniform. Different schemes have fundamentally
different shapes:

- **Basic auth** — attach an `Authorization: Basic ...` header to every
  request. Stateless, single-request.
- **Bearer auth** — attach a bearer token. Same shape as basic, different
  credential.
- **Digest auth** — the server responds to the first request with
  `401 Unauthorized` and a challenge (nonce, realm, qop); the client must
  compute a hash over the nonce + request body + credentials, then resend
  the request with the digest response. Two-leg, stateful per-request.
- **NTLM / Kerberos** — three-leg handshake: send initial request,
  receive `WWW-Authenticate: Negotiate <token>`, compute next token,
  resend with `Authorization: Negotiate <token>`, receive next challenge
  or success. N-leg, stateful.
- **OAuth-style refresh-on-401** — send request; if response is 401 and
  the token is refreshable, refresh it, then resend the request with the
  new credential.

Common auth models in the ecosystem fall short:

- **"Add a header" callback** (`requests`' default `auth` parameter in
  its simplest form): works for Basic and Bearer. Cannot express digest
  because the callback has no access to the server's challenge.
- **Subclass the session / transport**: heavy; auth becomes a global
  concern rather than a per-request configuration; mixing auth schemes
  in one client is awkward.
- **Interceptor chain with mutation**: can express retry-with-new-auth
  but the mental model is convoluted — mutable state across an interceptor
  stack, unclear ordering.

httpx needed an auth model that:

1. Handles the simple case (Basic, Bearer) with minimal boilerplate.
2. Handles the multi-leg case (Digest, NTLM) without ad-hoc hooks.
3. Works identically under sync and async (with minimal duplication).
4. Does not require the transport or client to know about any specific
   auth scheme.

## Decision

**Auth is a generator.** The `Auth` base class
(`httpx/_auth.py:22-110`) defines a single conceptual method:

```python
class Auth:
    requires_request_body = False
    requires_response_body = False

    def auth_flow(
        self, request: Request
    ) -> typing.Generator[Request, Response, None]:
        """
        Execute the authentication flow.

        To dispatch a request, `yield` it:
            yield request

        The client will `.send()` the response back into the flow:
            response = yield request

        A `return` (or reaching generator end) finishes the flow with
        the last response obtained.

        You can dispatch as many requests as necessary.
        """
        yield request
```

The generator **yields** requests and **receives** responses via
generator `send`. This is the Python `send()`-into-generator protocol
standard. A two-line `BasicAuth` subclass is:

```python
class BasicAuth(Auth):
    def auth_flow(self, request):
        request.headers["Authorization"] = self._auth_header
        yield request
```

A digest auth implementation (`httpx/_auth.py:175+`) looks approximately:

```python
class DigestAuth(Auth):
    requires_response_body = True  # needs full 401 response body

    def auth_flow(self, request):
        response = yield request          # send unauthenticated request
        if response.status_code != 401:
            return                        # no challenge; we're done
        # Parse WWW-Authenticate, compute digest, set Authorization header
        request.headers["Authorization"] = self._build_auth_header(
            request, response
        )
        yield request                     # resend with digest header
```

The generator's control flow is the protocol — there is no separate
"callback after response" mechanism. This works uniformly for
arbitrarily many legs.

**Sync/async adapters sit above `auth_flow`.** Because `Auth.auth_flow`
is a plain generator (not a coroutine), the same generator works under
both sync and async drivers. `Auth.sync_auth_flow`
(`httpx/_auth.py:62-85`) and `Auth.async_auth_flow`
(`httpx/_auth.py:87-110`) wrap the base generator and handle
`requires_request_body` / `requires_response_body` via sync `read()` or
async `aread()` respectively. Users subclass `auth_flow` once; both
runtimes work.

Authors of auth schemes that do their own I/O (e.g., fetching a token
from disk, calling a remote OAuth endpoint) override
`sync_auth_flow` / `async_auth_flow` directly because the I/O shape
differs per runtime.

**Body-read declarations are explicit.** An auth scheme that needs to
inspect the request body before yielding (e.g., digest auth hashing the
body) sets `requires_request_body = True`; the sync/async wrappers
ensure the body is materialized before the generator starts. Same for
`requires_response_body` when the scheme needs to parse a challenge.

## Rationale

- **The Python generator protocol is already a coroutine.** `yield
  value` suspends; `gen.send(response)` resumes. httpx's auth is
  essentially a coroutine, expressed in the one coroutine form that
  predates `async/await` and works with both sync and async drivers.
  No re-invention.

- **Multi-leg protocols compose naturally.** Digest's 401-challenge
  retry, NTLM's handshake, OAuth's refresh-on-401 — all of these are
  simple loops and conditionals inside the generator. The same body
  of code describes the protocol; the driver (sync or async) just
  executes the I/O between yields.

- **One implementation per auth scheme.** Users subclass `auth_flow`
  once. The sync client and async client both work with the same
  subclass. Compare to a design where authors must implement both
  `sync_authenticate` and `async_authenticate`: twice the surface,
  twice the bugs.

- **The client doesn't know about auth schemes.** `Client.send` /
  `AsyncClient.send` just drive whichever generator they're given.
  Digest, NTLM, custom schemes — all look identical to the client.
  Adding a new auth scheme doesn't touch `Client.send`.

- **`requires_request_body` and `requires_response_body` flags are
  minimal.** The client pre-reads only what's needed, preserving the
  default streaming model (ADR-05). Schemes that don't need bodies
  (Basic, Bearer) keep streaming intact.

- **Per-request auth is natural.** A request can have its own auth
  (overriding the client default) just by passing `auth=` to
  `.send()`. The auth flow is scoped to that call; no global state.

## Consequences

- **`Auth` subclasses must follow generator semantics.** Calling
  `yield` from the wrong place (e.g., inside a helper function that's
  not a generator) silently fails. Python's generator protocol is
  subtle; reviewers should flag non-obvious control flow in custom
  `auth_flow` implementations.

- **Auth flows must be deterministic and finite.** Generators that
  loop forever or raise at unexpected points create denial-of-service
  and surprising exception scenarios. Schemes with retry limits must
  encode the limit in the generator body; there is no framework-level
  guard.

- **Request body handling is subtle.** When
  `requires_request_body = True`, the body is read and buffered in
  memory before the flow starts. This may be unacceptable for large
  uploads. Streaming auth schemes with body-dependent signatures are
  not supported by the current model without custom work.

- **Response body handling likewise.** `requires_response_body = True`
  forces the response body to be read, not streamed. For protocols that
  parse small challenges (digest), this is fine; for protocols that
  inspect large response bodies, it defeats streaming.

- **Auth overrides between client-level and per-request are first-class.**
  `client.get(url, auth=SomeOtherAuth())` replaces the client's default
  auth for that single call. The `USE_CLIENT_DEFAULT` sentinel
  distinguishes "use client auth" from `auth=None` (explicitly no auth).

- **Auth objects are typically stateless per instance.** Digest auth
  is a notable exception — it caches nonce-count state. Reusing a
  stateful auth object across concurrent requests requires locking
  (see `DigestAuth` implementation for the precedent).

- **Third-party auth libraries (e.g., `httpx-auth`, `httpx-oauth`)
  depend on this contract.** Any change to the generator protocol
  (e.g., changing what the driver sends back, or when) breaks every
  ecosystem auth library. Treat as stable public API.

- **The `requires_request_body` / `requires_response_body` declarations
  are forward-compatible.** If a future version introduces streamed
  auth-flow support, these flags will gate new behavior. Overriding
  them falsely (claiming not to need what you need) silently breaks
  auth; the default of `False` is conservative for streaming.

- **`FunctionAuth`'s simple callable shape** (`httpx/_auth.py:113-123`)
  is the ergonomic entry point for Basic-auth-like schemes that don't
  need the full generator. It wraps a `Request -> Request` function.
  This is deliberately the common case's sugar; complex auth falls
  through to `Auth` subclassing.
