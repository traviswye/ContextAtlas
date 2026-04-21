---
id: ADR-05
title: Response bodies are streamed by default; full materialization is explicit; streaming responses are lifecycle-managed
status: accepted
severity: hard
symbols:
  - Response
  - Response.content
  - Response.text
  - Response.read
  - Response.aread
  - Response.stream
  - Response.iter_bytes
  - Response.iter_text
  - ResponseNotRead
  - ResponseClosed
  - Client.stream
  - AsyncClient.stream
  - BoundSyncStream
  - BoundAsyncStream
---

# ADR-05: Response bodies are streamed by default; full materialization is explicit; streaming responses are lifecycle-managed

## Context

An HTTP response's body may be anywhere from zero bytes to gigabytes. A
client has three possible default behaviors:

- **Buffer everything always.** `response.content` always works; users
  never have to think about streaming. This is the `requests` default.
  Simple, but a 10 GB download silently allocates 10 GB of memory, and
  streaming APIs feel bolted on.

- **Stream always; require explicit buffer.** Every response starts as
  a stream over the wire; the user must call `read()` to materialize
  the body. Explicit about cost, but awkward for the common case where
  small JSON bodies just want to be read.

- **Buffer by default; explicit streaming context.** Normal methods
  (`client.get(...)`) return a fully-read response; streaming methods
  (`client.stream(...)`) return a response whose body must be consumed
  via an iterator. httpx chose this variant, with strict lifecycle
  enforcement for streamed responses.

Alongside the default behavior, there are concerns about resource
management. A streamed response holds a socket open. If the user
forgets to close it, the connection leaks. If they try to access
`.content` on a streamed response that hasn't been `.read()`, they
get surprising behavior — either an empty body, a blocking read, or
an error.

## Decision

**Normal (non-streaming) calls fully materialize the body before
returning.** `client.get(url)`, `client.post(url)`, and similar methods
read the full response body into `response.content` as part of the
`send` flow. Users can freely access `.content`, `.text`, `.json()`
without additional ceremony.

**Streaming is opt-in, via `Client.stream(...)` / `AsyncClient.stream(...)`**
(`httpx/_client.py:827-845`):

```python
with client.stream("GET", url) as response:
    for chunk in response.iter_bytes():
        process(chunk)
```

The `stream()` method is a **context manager** (`@contextmanager`
for sync, `@asynccontextmanager` for async). Exiting the context closes
the underlying stream, releasing the socket back to the pool or
terminating the connection. Without the context manager, the stream is
not guaranteed to be cleaned up.

**Response bodies track read-state explicitly.** The `Response` class
(`httpx/_models.py`) distinguishes three states:

- **Unread** — body is still on the wire.
- **Read** — body has been materialized into `._content`.
- **Closed** — stream has been closed; no further reads possible.

Attempting `response.content` on an unread streamed response raises
`ResponseNotRead` (`httpx/_exceptions.py`). Attempting further iteration
after `read()` or `close()` raises `StreamConsumed` or `StreamClosed`.
These errors are informative — they tell the user exactly which
lifecycle mistake they made.

**Streaming iteration methods are paired sync/async:**

- `response.iter_bytes()` / `response.aiter_bytes()` — raw bytes.
- `response.iter_text()` / `response.aiter_text()` — decoded text.
- `response.iter_lines()` / `response.aiter_lines()` — line-by-line.
- `response.iter_raw()` / `response.aiter_raw()` — undecoded bytes
  (no gzip/brotli/zstd decompression).

**Stream lifecycle is bound to response via `BoundSyncStream` /
`BoundAsyncStream`** (`httpx/_client.py:139-183`). These wrap the raw
transport stream and record `response.elapsed` on close. Closing
propagates to the underlying transport stream; reading after close
raises.

**Event hooks run at response-ready time**, not at
body-materialization time. `response` event hooks fire before the body
is read, so hooks may call `response.read()` (or `response.aread()`)
to force materialization if they need the body.

## Rationale

- **The common case is small JSON.** Most HTTP calls in application
  code are for API responses of a few KB. Forcing every such call to
  be wrapped in a streaming context manager would be hostile ergonomics
  for no benefit. Buffering by default honors the common case.

- **The streaming case is real but rare.** Large downloads, server-sent
  events, log tails — these exist and matter, and deserve a first-class
  API. But they are not the default; making them opt-in via
  `client.stream(...)` keeps the ergonomic cost on the feature that
  benefits from it.

- **Explicit lifecycle prevents leaks.** A streamed response holds a
  socket; without context management, the socket leaks. Making `stream()`
  a context manager — and raising on post-close access — surfaces leaks
  as errors rather than silent connection exhaustion.

- **The three-state model (Unread/Read/Closed) gives clear errors.**
  `ResponseNotRead` tells the user "you need to call `read()` first";
  `StreamConsumed` tells them "you already iterated this; start a new
  request"; `StreamClosed` tells them "you exited the context manager;
  start a new request." The alternative — returning empty bodies or
  blocking — hides bugs.

- **Sync/async parity is preserved.** Streaming iteration matches the
  sync/async pattern of the client itself: `iter_bytes` vs
  `aiter_bytes`, `stream` (context manager) vs `stream` (async context
  manager). Users who understand ADR-01's sync/async split understand
  streaming without additional mental overhead.

- **Event hooks can opt into materialization.** A logging hook that
  wants to log the response body can call `response.read()` explicitly.
  A metrics hook that just needs status and headers doesn't pay the
  materialization cost. Running hooks before body-read gives them the
  choice.

## Consequences

- **`client.stream(...)` is the only supported way to stream.** Users
  who bypass the context manager and construct a `Response` directly
  are off the supported path. Documentation and examples must route
  users through `stream()`.

- **`response.read()` is idempotent but `iter_bytes()` is not.** Calling
  `read()` twice returns the cached `.content`; calling `iter_bytes()`
  after `read()` or after a previous iteration raises `StreamConsumed`.
  This is deliberate — iteration consumes the stream; reading caches
  the result.

- **`response.content` outside a stream context is safe.** Non-streamed
  responses (from `client.get(...)` etc.) have `.content` populated
  before the method returns. The `ResponseNotRead` error is specifically
  for streamed responses that haven't been read.

- **Auth schemes that need response bodies (`requires_response_body`
  in ADR-04) force materialization.** A digest auth scheme causes the
  first-leg response body to be read even in a `client.stream(...)`
  call — this is expected because auth runs before streaming iteration
  starts.

- **Large uploads are not auto-streamed on the request side.**
  This ADR concerns response streaming. For request streaming (large
  uploads), users pass a generator or file-like object as `content`;
  the transport consumes it lazily. The symmetry is not perfect —
  request streaming doesn't require a context manager because its
  lifecycle is bounded by the single `.send()` call.

- **Connection pool pressure depends on user discipline.** A user who
  opens `client.stream(...)` and then iterates slowly — say, a server-
  sent-events consumer that reads one event per minute — holds a pool
  slot for as long as iteration runs. Clients with small pools
  (`Limits`) must account for this in their design.

- **`response.elapsed` is only meaningful after stream close.** The
  `BoundSyncStream` / `BoundAsyncStream` wrappers
  (`_client.py:139-183`) record `elapsed` when the stream closes.
  For streaming responses, this measures time-to-last-byte, not
  time-to-first-byte. Users needing TTFB must measure manually before
  entering iteration.

- **Changing the default to "stream everything" would be a breaking
  change.** Every existing `response.content` access in user code
  would raise `ResponseNotRead`. The default-buffer behavior is a
  stable public commitment; migration to stream-default would be a
  major version break.

- **HTTP/2 multiplexing interacts with streaming.** An HTTP/2 stream
  can be held open while other streams on the same connection
  progress, but the underlying connection is shared. Streaming
  responses under HTTP/2 do not block other requests on the same
  connection; under HTTP/1.1 they do (until keep-alive reuses the
  socket after close). Users choosing streaming under high-throughput
  conditions should prefer HTTP/2.
