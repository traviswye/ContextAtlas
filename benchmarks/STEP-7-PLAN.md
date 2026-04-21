# Step-7 Benchmark Plan (captured pre-restructure)

**Purpose.** This document captures the complete step-7 benchmark
harness plan as of end-of-day-1 dogfooding. It exists so the plan
survives the imminent monorepo restructure and a fresh agent session
without requiring re-planning. After the restructure, this file moves
to `packages/benchmarks/STEP-7-PLAN.md`. A resuming session should
read it top-to-bottom and begin implementation.

**Status at time of writing.** Steps 1-6 complete and pushed to main.
The primitive `get_symbol_context` is dogfooded against ContextAtlas's
own atlas (committed at `.contextatlas/atlas.json`) and delivers
richly — SymbolId rose from 1 → 15 linked claims after the frontmatter
resolver hint landed, type aliases render with `kind: type`, REFS
clusters show meaningful module structure. Next: measure against a
baseline using realistic developer prompts on external repos.

---

## 1. Scope (step 7 vs step 13)

**Step 7 MVP:**
- 12 prompts run (6 per benchmark repo: hono, httpx)
- Single run per prompt per condition
- Results captured as per-run JSON + a summary table
- Goal: feedback loop on whether the primitive delivers; numbers to
  course-correct, not publish

**Step 13 extension (out of scope here, but designed now):**
- Additional 12 prompts (bringing the full suite to 24, matching
  RUBRIC.md's eventual methodology)
- Three runs per prompt, medians reported
- Blind manual grading layer for correctness
- Polished summary for the README

**All 24 prompts are designed up-front** — the held-out 12 are drafted
here to prevent prompt-drift later. Step 7 only runs the first 12.

---

## 2. Methodology decisions (locked)

### Dual baseline harness (Option Gamma)

Both baselines are implemented and run:

- **Alpha baseline** — custom agent using the Anthropic SDK directly,
  with a tool set that mirrors Claude Code's default codebase-exploration
  tools: `Read`, `Grep`, `Glob`, `LS`. Workflow tools (Edit, Write,
  TodoWrite, etc.) are deliberately excluded — they aren't used in
  exploration and would add noise. The Alpha tool set is frozen and
  documented in `RUBRIC.md`.

- **Beta baseline** — real Claude Code CLI driven headlessly via
  subprocess with prompt injection and stop detection. Measures what
  users actually experience end-to-end, including Claude Code's own
  UX optimizations.

Both baselines use Claude Opus 4.7. Same model across all conditions
controls model-level variance.

**Publish both numbers.** The Alpha-vs-Beta gap is itself informative:
it reveals where Claude Code's own harness adds value, layered beneath
whatever ContextAtlas adds on top. Numbers that look like
`baseline (Alpha): 12 calls | baseline (Beta): 7 calls | contextatlas: 2 calls`
tell a more complete story than either alone.

**ContextAtlas condition** = the Alpha base agent with our MCP server
additionally connected, exposing `get_symbol_context`, `find_by_intent`,
`impact_of_change`. We compare Alpha-baseline ↔ Alpha-plus-CA to
isolate our marginal contribution, and also compare CA ↔ Beta-baseline
to show delta against the real-world tool a user has today.

Conditions, in full:
- `alpha` — Alpha base agent only
- `ca` — Alpha base agent + ContextAtlas MCP
- `beta` — Claude Code CLI headless

### Prompt diversity (anti-cherry-picking)

Per repo, step-7's 6 prompts follow a deliberate mix:

- **3 clear-win prompts** — architectural constraint / impact questions
  that require ADR context. ContextAtlas should materially outperform.
- **2 tie/marginal prompts** — simple localization answerable from one
  or two files. ContextAtlas and baseline should be close; if CA
  over-shoots with architectural framing, that's a real signal.
- **1 trick/uncertain prompt** — baseline might legitimately outperform
  (trivial questions where bundles are overkill; recently-renamed code
  where ADR claims reference old names; etc.).

This ratio produces a benchmark that's credible. All-wins would be
obvious cherry-picking. Including genuine ties and one trick makes the
"wins" defensible.

### Prompts are locked before any measurement

P-hacking prevention: we lock the prompt text before running a single
benchmark call. Iteration after seeing baseline performance would
invalidate the result. The lock step is explicit — prompts are
committed to the repo, and the benchmark harness reads them from the
committed file.

### Metrics captured per run

- `tool_calls: int` — count of tool invocations (any tool)
- `input_tokens: int` / `output_tokens: int` / `total_tokens: int` —
  summed across all model calls for this prompt, from Anthropic
  `usage` fields
- `wall_clock_ms: int` — first model call to final text response
- `answer_text: string` — full final response (for step-13 blind
  grading)
- `tool_trace: Array<{ tool_name, args, result_preview }>` — full
  call sequence
- `capped: null | "tool_calls" | "tokens" | "wall_clock"` — populated
  if a cap fired (see below)

Correctness is NOT auto-measured in step 7. That's step 13.

### Cost / runtime caps

Each prompt-condition run is capped:
- 30 tool calls maximum
- 200_000 total tokens maximum
- 300 seconds wall-clock maximum
- **+30s grace extension** if the run hits the wall-clock cap while
  actively making tool calls (prevents measurement artifacts from
  abrupt mid-exploration termination). Grace extends once, not
  repeatedly.

When a cap fires, the run terminates cleanly and records the
`capped` field. The run is still included in the results but flagged.

### Runs per prompt

Step 7: **single run per prompt per condition**. Quick iteration,
we're course-correcting not publishing.

Step 13: three runs per prompt, medians reported. Infrastructure
designed for it but not used in step 7.

### Benchmark repo provisioning

**Manual clone at pinned commits.** The RUBRIC documents the exact
SHAs. Users clone into `benchmarks/repos/hono/` and
`benchmarks/repos/httpx/` (both gitignored per the existing
`.gitignore` rule). Harness verifies the SHA matches the documented
pin before running; refuses to run on a drifted checkout.

Automatic cloning at first run is deferred — manual provisioning is
simpler and explicit for step 7. Revisit for step 13.

### Pre-populated atlases

Hono and httpx atlases are extracted once (estimated $4-6 total for
~7 ADRs per repo) and **committed alongside ContextAtlas's own
atlas** under `benchmarks/atlases/hono/atlas.json` and
`benchmarks/atlases/httpx/atlas.json`. Source code stays gitignored
per the existing rule; only the atlas artifacts are committed. This
mirrors ADR-06's flagship-mode claim — teams pull the atlas, they
don't re-extract.

---

## 3. Target symbols (per repo)

Selection criteria: each touches a non-trivial hard-severity ADR
claim, spans multiple ADRs where possible, and represents real code
(not concepts or filenames).

### hono (step-7 set)

1. `Hono` — core class, cross-referenced in ADR-01/03/04
2. `compose` — middleware onion function (ADR-03)
3. `RegExpRouter` — concrete router impl (ADR-02)
4. `Context` — request/response context (ADR-01/03)
5. `validator` — type flow through handler (ADR-04)
6. `Hono.fetch` — trivial signature lookup (tie/trick)

### httpx (step-7 set)

1. `Client` / `AsyncClient` (pair, ADR-01)
2. `BaseTransport` — transport abstraction (ADR-03)
3. `Auth.auth_flow` — generator-based auth (ADR-04)
4. `Response.stream` — streaming discipline (ADR-05)
5. `HTTPTransport` — httpcore-backed concrete (ADR-02/03)
6. `Client.get` — trivial signature lookup (tie/trick)

### Step-13 held-out sets (designed now, run later)

**hono held-out:** jsx backends (ADR-05), Context lifetime (ADR-01),
middleware return-vs-next (ADR-03), `env` on Context (trick), `hc`
client (ADR-04), middleware storage location (tie).

**httpx held-out:** `MockTransport` (ADR-03), auth_flow yield
semantics (ADR-04), re-read streams (ADR-05), default timeout (tie),
`httpx.get()` return (trick), proxy configuration (tie).

---

## 4. Prompts (locked for step 7)

Phrasing mimics how a real developer would ask. Each prompt maps to
one target symbol and one task bucket.

### hono — step-7 set (6 prompts)

| id | target | bucket | prompt |
|----|--------|--------|--------|
| h1-context-runtime | Context | constraint (win) | "If I'm writing a new Hono route handler, what can I safely assume is on Context at runtime? I want to make sure my handler works in both Cloudflare Workers and Node." |
| h2-router-contract | RegExpRouter | impact/constraint (win) | "I want to replace RegExpRouter with my own implementation. What's the contract I need to satisfy?" |
| h3-middleware-onion | compose | localize (win) | "Where is Hono's middleware onion actually composed? I need to understand what `next()` is doing mechanically." |
| h4-validator-typeflow | validator | constraint (win) | "I want to add a zod validator to a route. How does the validator's type flow into the handler and the typed RPC client?" |
| h5-hono-generics | Hono | impact (tie) | "If I change the Hono class's type parameters, which downstream types would need to update?" |
| h6-fetch-signature | Hono.fetch | localize (trick) | "What's the signature of Hono's `.fetch` method? I need to mount a Hono app inside another framework." |

### httpx — step-7 set (6 prompts)

| id | target | bucket | prompt |
|----|--------|--------|--------|
| p1-sync-async-split | Client/AsyncClient | constraint (win) | "Why does httpx have both Client and AsyncClient instead of one class? Can I merge them?" |
| p2-http3-transport | BaseTransport | impact (win) | "I want to add an HTTP/3 transport. What base interface do I implement?" |
| p3-custom-auth | Auth.auth_flow | localize+constraint (win) | "How does httpx handle authentication? I need to implement a custom auth scheme that does a token refresh." |
| p4-stream-lifecycle | Response.stream | constraint (win) | "When I call `response.content` on a streaming response, what happens? What's the lifecycle I need to respect?" |
| p5-drop-anyio | (module-level) | constraint (tie) | "Can I drop anyio and just use raw asyncio in httpx?" |
| p6-client-get-args | Client.get | localize (trick) | "What arguments does `httpx.Client.get` accept?" |

### Step-13 held-out prompts (designed now, run later)

These are captured so they can be run verbatim in step 13 without
re-design. Not run in step 7. Same bucket distribution per repo.

**hono (6 held-out):**
- h7-jsx-backend-integration (ADR-05, win)
- h8-context-sharing (ADR-01, win)
- h9-middleware-return-semantics (ADR-03, win)
- h10-env-type-on-context (tie/trick)
- h11-hc-request-shape (tie)
- h12-middleware-storage-location (tie)

**httpx (6 held-out):**
- p7-mock-transport-contract (ADR-03, win)
- p8-auth-yield-semantics (ADR-04, win)
- p9-stream-reread (ADR-05, win)
- p10-default-timeout-location (tie)
- p11-httpx-get-return (trick)
- p12-proxy-configuration (tie)

Full prompt text for the held-out set will be drafted in the step-7
prompt-file alongside the step-7 set, but gated by a `bucket:
"held_out"` field so the step-7 harness ignores them.

---

## 5. Results recording

### Per-run JSON

`benchmarks/runs/<timestamp>/<repo>/<prompt_id>/<condition>.json`

```jsonc
{
  "prompt_id": "h3-middleware-onion",
  "repo": "hono",
  "condition": "alpha",            // "alpha" | "ca" | "beta"
  "target_symbol": "compose",
  "bucket": "win",                 // "win" | "tie" | "trick" | "held_out"
  "metrics": {
    "tool_calls": 14,
    "input_tokens": 52380,
    "output_tokens": 1420,
    "total_tokens": 53800,
    "wall_clock_ms": 38400
  },
  "capped": null,                  // or "tool_calls" | "tokens" | "wall_clock"
  "answer": "...full final response text...",
  "trace": [
    { "tool": "Grep", "args": { "pattern": "..." }, "result_preview": "..." },
    ...
  ]
}
```

### Summary table (stdout + `summary.md`)

```
hono — step 7 (6 prompts)
─────────────────────────────────────────────────────────────────────────
                         alpha             beta              ca
prompt_id          calls tok  wall   calls tok  wall   calls tok  wall
h1-context-runtime    12  49k  34s    10  38k  28s      2   4.8k 8s
...
TOTALS                XX XXXk  XXs    XX XXXk  XXs      XX  XXk   XXs
delta vs alpha                                          −XX% −XX% −XX%
delta vs beta                                           −XX% −XX% −XX%

httpx — step 7 (6 prompts)
─────────────────────────────────────────────────────────────────────────
...

GRAND TOTAL — 12 prompts
─────────────────────────────────────────────────────────────────────────
...
```

Ratio columns (`delta vs alpha` / `delta vs beta`) are the punchline
for the demo.

### Artifact commits

- Commit `benchmarks/atlases/hono/atlas.json` and
  `benchmarks/atlases/httpx/atlas.json` (the per-repo atlases).
- Commit `benchmarks/prompts/hono.yml` and `httpx.yml` (the locked
  prompt files).
- Commit **one reference** run's artifacts: `benchmarks/runs/reference/`
  with both the summary table and the per-prompt JSONs. Subsequent
  iteration runs land under timestamped subdirs which are gitignored
  so the repo doesn't bloat.

---

## 6. File plan (post-restructure paths)

All paths below are the post-restructure locations the resuming
session should target. Pre-restructure, the harness lives under
`benchmarks/`; after the monorepo split, it moves to
`packages/benchmarks/`.

**New (benchmark package):**
- `packages/benchmarks/package.json` — own workspace package
- `packages/benchmarks/harness/run.ts` — driver; orchestrates
  conditions × prompts × repos
- `packages/benchmarks/harness/alpha-agent.ts` — Alpha base agent
- `packages/benchmarks/harness/beta-agent.ts` — Claude Code CLI
  driver
- `packages/benchmarks/harness/ca-agent.ts` — Alpha agent + CA
  MCP client (thin wrapper)
- `packages/benchmarks/harness/metrics.ts` — metrics types, writers
- `packages/benchmarks/harness/caps.ts` — cap enforcement + grace
  extension
- `packages/benchmarks/harness/tools/read.ts`, `grep.ts`, `glob.ts`,
  `ls.ts` — the Alpha tool implementations
- `packages/benchmarks/harness/claude-code-driver.ts` — subprocess,
  prompt injection, stop detection (Beta only)
- `packages/benchmarks/prompts/hono.yml` — all 12 hono prompts
  (6 step-7 + 6 held-out)
- `packages/benchmarks/prompts/httpx.yml` — all 12 httpx prompts
- `packages/benchmarks/configs/hono.yml` — `.contextatlas.yml` for
  hono
- `packages/benchmarks/configs/httpx.yml` — `.contextatlas.yml` for
  httpx
- `packages/benchmarks/atlases/hono/atlas.json` — pre-populated
  atlas (committed)
- `packages/benchmarks/atlases/httpx/atlas.json` — pre-populated
  atlas (committed)
- `packages/benchmarks/runs/reference/...` — reference run's
  artifacts (committed)
- `packages/benchmarks/STEP-7-PLAN.md` — this file, moved from
  `benchmarks/STEP-7-PLAN.md`

**Modified:**
- `RUBRIC.md` — document the Alpha tool set, the Alpha-vs-Beta
  distinction, pinned benchmark repo SHAs, prompt-lock policy.
- `.gitignore` — ensure `packages/benchmarks/runs/*` is ignored
  except `packages/benchmarks/runs/reference/`.

---

## 7. Definition of done for step 7

1. All 12 step-7 prompts are committed and locked.
2. Alpha, Beta, and CA harnesses all run successfully end-to-end on
   at least one prompt.
3. Cost caps work (verified by running a deliberately-capped prompt).
4. Full 12-prompt × 3-condition run completes within the expected
   time envelope (estimate: 12 × 3 × ~60s average = ~36 min, plus
   Alpha/Beta baseline overhead).
5. Summary table is produced and committed under
   `packages/benchmarks/runs/reference/`.
6. RUBRIC.md updated with pinned SHAs, Alpha tool set, and prompt-
   lock policy.
7. Observations documented: at least a paragraph per repo on what
   the numbers show, any surprises, any follow-up fixes identified.

Step 7 does NOT need to produce polished marketing numbers. It
produces signal we use to decide whether to keep the current
primitive, tune intent filtering, or make other architectural
adjustments before step 13 publishes.

---

## 8. Open questions deferred to implementation time

- **How does the Beta driver inject prompts into `claude`?** Depends
  on whether Claude Code has a headless mode or we pipe via stdin
  with a start-and-exit flag. Investigate at implementation time;
  fall back to a minimal Alpha-only step 7 if Beta proves
  intractable. Alpha-only is still a useful benchmark.
- **Token counting on Beta.** Claude Code doesn't expose per-request
  token usage to callers. May need to approximate via answer length
  + tool-call trace, or skip token metrics for Beta and note the
  limitation.
- **Atlas pre-population run.** Who runs the hono/httpx extractions?
  User runs them; cost is $4-6; atlases get committed.

---

## 9. Resumption protocol

When the next session resumes step 7:

1. Read this file end-to-end.
2. Check `packages/benchmarks/` scaffold is in place (post-restructure).
3. Verify `benchmarks/repos/hono/` and `benchmarks/repos/httpx/` are
   cloned at the pinned SHAs (per RUBRIC.md).
4. Verify atlases are committed under
   `packages/benchmarks/atlases/<repo>/atlas.json`.
5. Start implementing the harness in the file order under section 6.
6. Lock the prompts (if not already committed) before any run.
7. Run the full 12-prompt × 3-condition benchmark.
8. Commit results under `packages/benchmarks/runs/reference/`.

**Do not re-plan.** This document is the plan.
