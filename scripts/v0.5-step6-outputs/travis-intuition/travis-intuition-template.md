# Travis-Intuition Grading Worksheet (Phase A: unmediated)

> **Phase A methodology:** Grade each trial using your intuition without referencing the canonical rubric (`RUBRIC_PROMPT_SINGLE` in `src/grading/rubric-prompt.ts`). The goal is to capture priors-vs-Sonnet baseline — does Sonnet's canonical-rubric output match your unmediated judgment? If Phase A correlation falls below ADR-19 §5 thresholds (Spearman <0.6 OR per-axis direction agreement <75% on any axis), Phase B (rubric-mediated grading) triggers as diagnostic-only. Phase A is the load-bearing baseline.

**Substrate:** 5 trials = trial 1 of each unique (cell, condition) pair from Step 6.1 within-judge n=10 substrate. Per Step 6 design Q2 lock; deterministic selection.

**Axes (0-3 scale; intuition only; no rubric reference):**
- `factual_correctness`: are asserted facts about the code/architecture accurate?
- `completeness`: does the answer cover the prompt scope?
- `actionability`: can the user proceed from this answer?
- `hallucination`: does the answer assert items that don't exist?

**Reference for cross-checking after grading (NOT during):** Sonnet's pass-1 scores per trial captured in `scripts/v0.5-step6-outputs/within-judge/trial-NN-...-pass-1.json`. Avoid peeking until your scores are final to preserve unmediated discipline.

---

## Trial 1: httpx/p4-stream-lifecycle/ca (trial 1)

**Source path:** `ContextAtlas-benchmarks/runs/2026-04-29T05-36-15-709Z/httpx/p4-stream-lifecycle/ca.json`

**Prompt:**

> When I call `response.content` on a streaming response, what happens? What's the lifecycle I need to respect?

**Answer:**

I have everything I need. Here's the complete answer:

## What happens when you call `response.content` on a streaming response

**It raises `ResponseNotRead`** — by design. Looking at `Response.content` in `httpx/_models.py:635-639`:

```python
@property
def content(self) -> bytes:
    if not hasattr(self, "_content"):
        raise ResponseNotRead()
    return self._content
```

The body is only materialized into `self._content` when something explicitly reads the stream. For non-streaming requests httpx does this for you before returning; for streaming it doesn't.

This is a deliberate architectural commitment from **ADR-05**, not an implementation detail:

> *"Accessing response.content on an unread streamed response must raise ResponseNotRead."* — surfaces lifecycle mistakes as errors rather than returning empty bodies or blocking.

> *"Buffer-by-default response behavior is a stable public commitment; switching to stream-by-default would be a major version breaking change."* — every existing `response.content` access would raise `ResponseNotRead` under stream-default.

## The lifecycle you must respect

Response bodies track **three states: Unread → Read → Closed.** Several hard rules govern transitions:

1. **Always use `client.stream(...)` as a context manager.** Per ADR-05: *"Streaming responses are opt-in via Client.stream/AsyncClient.stream, which must be used as a context manager. Exiting the context closes the underlying stream and releases the socket; without the context manager, cleanup is not guaranteed."* The stream lifecycle is bound to the response via `BoundSyncStream`/`BoundAsyncStream`, which record `response.elapsed` on close and propagate close to the transport.

2. **To access `.content`, you must first call `.read()` (or `.aread()`).** That populates `self._content`. After this, `.content`, `.text`, and `.json()` all work normally.

3. **Pick one: `read()` OR `iter_bytes()` — not both.** Per ADR-05: *"`response.read()` is idempotent (returns cached `.content`); `iter_bytes()` is not and raises `StreamConsumed` after prior read/iteration."* Iteration consumes; reading caches.

4. **Don't touch the response after the context exits.** *"Iteration or reads after read()/close() must raise `StreamConsumed` or `StreamClosed`."*

5. **`response.elapsed` is only meaningful after close** — it measures time-to-last-byte for streamed responses. TTFB must be measured manually.

## Typical patterns

```python
# Wrong — raises ResponseNotRead
with client.stream("GET", url) as r:
    data = r.content   # ❌

# Right — iterate
with client.stream("GET", url) as r:
    for chunk in r.iter_bytes():
        ...
    # r.content still raises here — stream was consumed, not read

# Right — force materialization, then use .content/.text/.json()
with client.stream("GET", url) as r:
    r.read()
    data = r.content   # ✅
```

## Adjacent gotchas worth knowing

- **Auth schemes can force materialization even inside `stream()`.** Schemes declaring `requires_response_body` (e.g. digest auth) materialize the first-leg body because auth runs before streaming iteration begins.
- **Event hooks fire before the body is materialized** and may opt-in by calling `response.read()`/`aread()`.
- **`iter_raw`/`aiter_raw`** return undecoded bytes — no gzip/brotli/zstd decompression — vs `iter_bytes` which decodes.
- **Pool pressure (soft constraint):** slow streaming consumers hold a pool slot for the entire iteration. Under HTTP/1.1 this also blocks other requests on the same connection — prefer HTTP/2 for high-throughput streaming.

**Your scores (0-3 scale; no rubric reference; intuition):**

- `factual_correctness`: __
- `completeness`: __
- `actionability`: __
- `hallucination`: __

**Notes (especially when scores feel uncertain or when the answer surprises you):**

_(your notes here; free text)_

---

## Trial 2: cobra/c3-hook-lifecycle/beta-ca (trial 1)

**Source path:** `ContextAtlas-benchmarks/runs/2026-04-29T05-36-52-571Z/cobra/c3-hook-lifecycle/beta-ca.json`

**Prompt:**

> I have a root command with a `PersistentPreRun` that initializes a logger, and a child command with its own `PreRun` that uses that logger. What's cobra's actual guarantee about hook ordering — and if my `RunE` returns an error, does `PostRun` still fire?

**Answer:**

# Cobra hook ordering: the actual guarantees

Looking at the cobra atlas (ADR-03 captures the lifecycle constraints explicitly), there are two questions tangled together here, and the answer to your second one is the source of one of cobra's most common production bugs.

## 1. Hook ordering with default settings

By default (`EnableTraverseRunHooks = false`), cobra walks **child → root** looking for `PersistentPreRun`/`PersistentPreRunE` and **fires only the first one it finds**. This is *override* semantics, not augment semantics.

> "By default (EnableTraverseRunHooks=false), only the nearest ancestor with a PersistentPreRun(E) hook fires; the chain walks child-to-root and breaks at the first defined hook." — ADR-03 (hard)

**This bites your scenario directly.** If your child command defines its *own* `PersistentPreRun` (note: just `PreRun` is fine — it doesn't shadow), the root's logger-init hook silently never runs:

> "Nearest-ancestor-wins means a child's hook silently suppresses ancestor hooks... The subgroup's hook must remember to invoke its parent's hook manually, or logging goes dark." — ADR-03

Since your description says the child has only `PreRun` (not `PersistentPreRun`), you're fine — the root's `PersistentPreRun` will fire, then the child's `PreRun`. The full pipeline order is roughly:

1. `OnInitialize` global hooks
2. `--help` / `--version` short-circuit (no hooks fire if these match)
3. `ValidateArgs`
4. nearest-ancestor `PersistentPreRunE` → `PersistentPreRun`
5. `PreRunE` → `PreRun`
6. `ValidateRequiredFlags` / `ValidateFlagGroups` *(deliberately after PreRun, so PreRunE can set defaults that satisfy required-flag checks)*
7. `RunE` → `Run`
8. `PostRunE` → `PostRun`
9. nearest-ancestor `PersistentPostRunE` → `PersistentPostRun`
10. deferred `OnFinalize` global hooks

If you want every ancestor's persistent hook to fire (root-to-leaf on the way in, leaf-to-root on the way out — stack-unwinding), set the package global `cobra.EnableTraverseRunHooks = true`. It's a global, not a per-Command field, by design.

## 2. Does PostRun fire on RunE error? **No.**

This is the load-bearing answer:

> "PostRun, PostRunE, and PersistentPostRun do NOT execute if Run/RunE returns an error; any pipeline error short-circuits all subsequent hooks." — ADR-03 (hard)

> "Cleanup code that must run after Run regardless of success must use defer inside RunE, not PostRun/PostRunE." — ADR-03 (hard, with rationale: *"this is the most frequent source of production bugs around the hook model"*)

So `PostRun` is **not** a `finally` block. If you need guaranteed cleanup (close files, release locks, flush an audit log, flush your logger), put it in a `defer` inside the `RunE` closure:

```go
RunE: func(cmd *cobra.Command, args []string) error {
    defer logger.Sync()         // runs even on error
    defer releaseLock()
    return doWork()
},
PostRunE: func(cmd *cobra.Command, args []string) error {
    // success-only path; skipped if RunE returned non-nil
    return nil
},
```

The two escape hatches for "always run" semantics are:
- `defer` inside `RunE` (recommended)
- `cobra.OnFinalize(...)` global finalizers, which *do* run as deferreds even on error — but they're program-level, not command-scoped.

## Bonus gotcha relevant to your setup

Two more ADR-03 constraints worth knowing since you have a logger-init in `PersistentPreRun`:

- **`Run` (no E) cannot signal failure except via `os.Exit`**, which bypasses `PostRun`, `PersistentPostRun`, *and* `OnFinalize`. Prefer `RunE` everywhere.
- **A `PreRunE` error skips `ValidateRequiredFlags`** — so `PreRunE` cannot assume required flags have been validated yet.

**Your scores (0-3 scale; no rubric reference; intuition):**

- `factual_correctness`: __
- `completeness`: __
- `actionability`: __
- `hallucination`: __

**Notes (especially when scores feel uncertain or when the answer surprises you):**

_(your notes here; free text)_

---

## Trial 3: httpx/p2-http3-transport/beta-ca (trial 1)

**Source path:** `ContextAtlas-benchmarks/runs/2026-04-29T05-37-49-695Z/httpx/p2-http3-transport/beta-ca.json`

**Prompt:**

> I want to add an HTTP/3 transport. What base interface do I implement?

**Answer:**

# HTTP/3 Transport: Base Interface

You should implement **`BaseTransport`** (sync) and/or **`AsyncBaseTransport`** (async), both defined in `httpx/_transports/base.py`. These are httpx's two parallel abstract base classes for the transport layer.

## Which one(s) to implement

Per ADR-03, the sync and async base classes are **siblings, not unified under a common ABC** — mixing is not supported. So:

- For an `HTTP3Transport` usable from `httpx.Client` → subclass `BaseTransport`
- For an `AsyncHTTP3Transport` usable from `httpx.AsyncClient` → subclass `AsyncBaseTransport`
- If you want both runtimes (likely, since HTTP/3 is typically async-first), ship **two separate classes** — that's the same pattern `MockTransport` follows.

## What you must implement

Just one method (this is "stable public API" per ADR-03):

- `handle_request(request: Request) -> Response` on `BaseTransport`
- `handle_async_request(request: Request) -> Response` on `AsyncBaseTransport`

Plus context-manager support (`__enter__`/`__exit__` or `__aenter__`/`__aexit__`) so connection-pool resources get released — clients delegate their lifecycle to the transport.

## Hard constraints to respect (ADR-03)

1. **Don't reimplement client features.** Redirects, auth flows, cookie persistence, event hooks, and timeout coordination live above the transport layer. Your HTTP/3 transport just maps `Request → Response`.
2. **Raise `httpx` exception types**, not errors from your underlying HTTP/3 library (e.g., `aioquic`, `httpcore`'s future H3 support, etc.). Translate at the boundary — the way the default transports translate `httpcore.*Error` to `httpx.*Error`.
3. **Runtime-agnostic async.** If your async transport uses an event loop, follow `ASGITransport`'s pattern of using `sniffio` to support both asyncio and Trio (ADR-02).
4. **Don't expand the base interface.** Add HTTP/3-specific knobs (QUIC config, alt-svc handling, 0-RTT options, etc.) as constructor parameters on your subclass, not as new methods on the base.

## Wiring it in

Users will plug it in via the `transport=` parameter on `Client`/`AsyncClient`, or via `mounts={"https://": HTTP3Transport(...)}` for per-URL routing through `URLPattern`.

## Reference implementations to study

- `HTTPTransport` / `AsyncHTTPTransport` in `httpx/_transports/default.py` — the closest analog, since they wrap a network-layer library (`httpcore`) and do exception translation.
- `ASGITransport` in `httpx/_transports/asgi.py` — example of an async-only transport with sniffio-based runtime detection.

**Your scores (0-3 scale; no rubric reference; intuition):**

- `factual_correctness`: __
- `completeness`: __
- `actionability`: __
- `hallucination`: __

**Notes (especially when scores feel uncertain or when the answer surprises you):**

_(your notes here; free text)_

---

## Trial 4: hono/h1-context-runtime/beta-ca (trial 1)

**Source path:** `ContextAtlas-benchmarks/runs/2026-04-29T05-38-26-001Z/hono/h1-context-runtime/beta-ca.json`

**Prompt:**

> If I'm writing a new Hono route handler, what can I safely assume is on Context at runtime? I want to make sure my handler works in both Cloudflare Workers and Node.

**Answer:**

# Hono Context — what's safe to assume in a cross-runtime handler

The short version: **the only thing universally guaranteed on `c` is what comes from the Web Standard `app.fetch(request, env, ctx)` entry point** (per ADR-01 in the Hono atlas). Everything else is conditional.

## ✅ Always available (Workers + Node + everywhere else)

These are derived purely from Web Standards, so they're safe in any handler:

- **`c.req`** — `HonoRequest` wrapping a Web Standard `Request`. Methods like `c.req.param()`, `c.req.query()`, `c.req.json()`, `c.req.valid()` (if you used `validator()`), `c.req.header()` are all built on `Request`/`Headers`/`URL`.
- **`c.res`** — Web Standard `Response`.
- **Response builders**: `c.json()`, `c.text()`, `c.html()`, `c.body()`, `c.redirect()`, `c.notFound()` — all return Web Standard `Response`.
- **`c.set(key, val)` / `c.get(key)` / `c.var`** — per-request variable bag. `c.var` is documented as "accesses the value of a variable on Context" (`src/context.ts:593`). Type-safe if you typed the `Variables` generic on your `Hono<{ Variables: ... }>`.
- **`c.header()`, `c.status()`** — response header/status mutation.
- **`c.finalized`** — whether a response has been produced.
- **`c.error`** — error from upstream middleware, if any.

## ⚠️ Conditional — present in Workers, **may throw in Node**

These are populated from the second/third args of `app.fetch(request, env, ctx)`. Node's `@hono/node-server` adapter doesn't generally pass them, so accessing them can throw:

- **`c.executionCtx`** — getter at `src/context.ts:391`. Atlas docstring: *"Accessing this throws an error if the context does not have an ExecutionContext."* This is where `waitUntil` / `passThroughOnException` live. **Workers: yes. Node: throws.**
- **`c.event`** — getter at `src/context.ts:377`. Atlas docstring: *"Accessing this property throws if the context has no FetchEvent."* Service-worker‑style only — don't reach for it in modern Workers (module syntax) or Node.
- **`c.env`** — present and typed if you supplied a `Bindings` generic and the adapter passed `env`. On Workers this holds your bindings (KV, D1, secrets). On Node it's typically `{}` or `process.env`-shaped only if your bootstrap injects it. **Don't assume specific keys exist unless your adapter wires them.**

## Practical pattern for portable handlers

```ts
type Env = { Bindings: { MY_KV: KVNamespace }, Variables: { userId: string } }

app.get('/work', async (c) => {
  // ✅ always safe
  const id = c.req.param('id')
  const user = c.get('userId')

  // ⚠️ guard before using waitUntil — throws on Node
  const bg = doBackgroundWork()
  try {
    c.executionCtx.waitUntil(bg)
  } catch {
    await bg // Node fallback: just await it
  }

  // ⚠️ c.env shape depends on adapter — don't assume bindings exist
  if ('MY_KV' in c.env && c.env.MY_KV) {
    await c.env.MY_KV.put('k', 'v')
  }

  return c.json({ ok: true })
})
```

## Why the asymmetry exists (architectural)

From ADR-01 in the atlas:
- Core is built **entirely on Web Standard APIs** — no runtime-specific globals. That's why `c.req` / `c.res` / response helpers always work.
- **`@hono/node-server` is a separate package**, not in `src/adapter/`, "because adding it to `src/adapter/` would pull Node types into the main `hono` package." So Node's adapter shape isn't owned by core, and what it injects into `env`/`ctx` is up to that package.
- The single entry point `app.fetch(request, env, ctx)` is uniform; whatever the adapter omits becomes a runtime hole on `c`.

## Bonus — a couple of quirks worth knowing

- `c.req.parseBody()` is hand-rolled (ADR-01 zero-deps rule) — works the same everywhere, but it's a Hono implementation, not a runtime feature.
- If you write middleware that needs cross-request state, the only sanctioned `node:` import in middleware is `node:async_hooks` via `context-storage` — and it's cross-runtime in practice (Node/Bun/Deno/Workers all support `AsyncLocalStorage`).
- If your middleware calls `await next()`, it must call it **at most once** (ADR-03) — calling twice throws `'next() called multiple times'`. Forgetting `await` is a silent concurrency bug not caught by types.

**TL;DR for your handler:** lean on `c.req`, `c.res`, `c.json/text/html`, `c.set/get/var`. Treat `c.executionCtx`, `c.event`, and specific keys on `c.env` as Workers-conditional and guard them.

**Your scores (0-3 scale; no rubric reference; intuition):**

- `factual_correctness`: __
- `completeness`: __
- `actionability`: __
- `hallucination`: __

**Notes (especially when scores feel uncertain or when the answer surprises you):**

_(your notes here; free text)_

---

## Trial 5: cobra/c4-subcommand-resolution/beta-ca (trial 1)

**Source path:** `ContextAtlas-benchmarks/runs/2026-04-29T05-39-45-525Z/cobra/c4-subcommand-resolution/beta-ca.json`

**Prompt:**

> My CLI has a `database install` subcommand. If a user types `myapp db inst`, will cobra find it? What's cobra's actual resolution algorithm, and what do I have to opt into if I want prefix matching like git does?

**Answer:**

I have enough authoritative context from cobra's ADR-04. Here's the answer:

## Will `myapp db inst` resolve to `database install`?

**No — not by default.** Two things are working against you:

1. **`db` ≠ `database`.** Cobra does no prefix matching unless you opt in. Resolution at the top level looks for an exact name (or alias) match — `db` is neither, so the lookup fails immediately at the root.
2. **Even after opting in, `db` would still likely fail** because prefix matching requires a *unique* prefix. If you also have, say, `debug` or `deploy`, `db` is ambiguous and Cobra returns `nil` rather than guessing.

If you actually want `db` → `database`, the idiomatic answer is **register `db` as an alias** (`Aliases: []string{"db"}`), not turn on prefix matching.

## Cobra's actual resolution algorithm (ADR‑04)

Entry point is `Command.Find` (`command.go:757-779`). At each level:

1. **`stripFlags`** is called first so flags and their values become transparent to positional resolution (this is why `myapp --quiet serve` still finds `serve`). This *requires* persistent-flag merging to have happened — flags must be fully declared before `Find` runs.
2. **`findNext`** scans the receiver's children. For each child, **`commandNameMatches`** (`command.go:1928`) checks the canonical name and every alias in a single pass.
3. **Exact match wins, always.** The first exact name-or-alias hit returns immediately, *before any prefix matching is considered*. So a command named `db` would beat `database` even if prefix matching were on.
4. **Prefix pass (only if `EnablePrefixMatching == true`)**: collects every child whose name starts with the token.
   - 1 candidate → resolved.
   - 0 candidates → unknown command.
   - **≥2 candidates → returns `nil`.** Cobra deliberately does not pick the shortest, the alphabetically first, or the first-declared. The rationale (verbatim from ADR-04): *"A silent wrong answer is worse than an explicit failure."*
5. **Depth-first, no backtracking.** Once a level resolves to a child, the algorithm descends and never reconsiders. Plan your tree so subcommand names aren't also plausible positional args.
6. **`TraverseChildren`** (per-command, not global): if set, Cobra uses `Traverse` instead of `Find` so flags can be parsed as it descends — useful when persistent flags need to appear *before* the subcommand.

`EnableCaseInsensitive` is a separate global toggle that affects both exact and prefix matching, with a hot-path cost (lowercases on every comparison across the whole tree).

## What you opt into for git-style prefix matching

```go
cobra.EnablePrefixMatching = true   // cobra.go:55, defaults to false
```

That's the only switch. **But read the warnings carefully** — they're load-bearing:

- **It's a global, not per-command.** Affects every level of the tree.
- **Adding a new sibling that shares a prefix silently breaks user muscle memory.** If users habitually type `myapp db inst` and you later add `dbtools`, `db` becomes ambiguous and starts returning unknown-command errors. ADR-04 explicitly recommends **enforcing a naming-convention gate in code review** for teams that turn this on.
- **Suggestions are independent of resolution.** The "Did you mean…?" prefix suggestions in `SuggestionsFor` run regardless of `EnablePrefixMatching` — that global only controls *resolution*. So users get prefix-based hints out of the box even with the default settings; they just have to retype the full name.
- **Aliases share the same namespace as canonical names**, and Cobra does *not* validate collisions at registration time. If two siblings collide on a name/alias, `findNext` returns whichever comes first in declaration order — so you have to police this manually.
- **Don't replace `Args` on the root with `ArbitraryArgs`** if you care about the unknown-command error path; `legacyArgs` (`args.go:28`) is what produces those errors with suggestions.

### Practical recommendation for your `database install` case

Prefer one of:

```go
dbCmd := &cobra.Command{
    Use:     "database",
    Aliases: []string{"db"},                         // explicit, safe
}
installCmd := &cobra.Command{
    Use:     "install",
    Aliases: []string{"inst", "i"},                  // explicit, safe
}
```

That gives you `myapp db inst` deterministically without the ambiguity-time-bomb of `EnablePrefixMatching`, and it's resilient to adding `debug`/`deploy`/`infrastructure` later.

**Your scores (0-3 scale; no rubric reference; intuition):**

- `factual_correctness`: __
- `completeness`: __
- `actionability`: __
- `hallucination`: __

**Notes (especially when scores feel uncertain or when the answer surprises you):**

_(your notes here; free text)_

---

## Submission

When all 5 trials × 4 axes = 20 grades are complete, paste this filled markdown back to the conversation OR save as `scripts/v0.5-step6-outputs/travis-intuition/travis-intuition-filled.md` and reference the path. Step 6.3 gate evaluation will compute Spearman + per-axis direction agreement vs Sonnet pass-1 scores from Step 6.1 outputs.
