---
id: ADR-18
title: LSP adapter readiness pattern — two-signal architecture for diagnostics
status: accepted
severity: hard
symbols:
  - waitForServerReady
  - waitForDiagnostics
  - ProgressParams
---

# ADR-18: LSP adapter readiness pattern — two-signal architecture for diagnostics

## Context

[ADR-03](ADR-03-language-adapter-plugin.md) names tsserver,
pyright, and gopls as the three v0.1 LSP adapters; ADR-13 and
ADR-14 document per-server LSP-primitive mappings. None of those
ADRs locks the timing-race semantics of `getDiagnostics` —
specifically, how an adapter waits for diagnostics to arrive
before returning, and how cold-start variance is absorbed.

v0.3 Commit 1.5 (`04f5b9d`) shipped a symptom fix raising the TS
adapter's `getDiagnostics` ceiling 1s → 5s after tsserver cold-
start exceeded the 1s polling ceiling on Node 22 / typescript-
language-server 4.4.1 / typescript 5.9.3. The same fixed-ceiling
polling pattern existed across all three adapters with different
constants (TS 5s, Pyright 1s, gopls 2s) and conflated two distinct
timing concerns: server cold-start absorption + per-file
diagnostic-computation wait.

The v0.4 Stream A B2 deliverable generalizes the symptom fix into
a substantive architectural pattern, anchored on Step 1.1b
empirical probe findings (benchmarks repo
`research/v0.4-step-1-1b-lsp-readiness-probe.md`).

## Decision

### Two readiness signals, not one

Diagnostic-readiness has two distinct phases that the v0.3 pattern
collapsed into a single per-call ceiling:

1. **Server-readiness (cold-start, one-shot per session).** The
   LSP server has finished initial workspace load and can compute
   diagnostics for any opened file. Captured at `initialize()`
   time; never repeats during a session.
2. **Per-file readiness (per-call).** Diagnostics for a specific
   URI have been computed and pushed via
   `textDocument/publishDiagnostics`. Captured per
   `getDiagnostics(filePath)` call.

Conflating these into a single per-call ceiling forces the ceiling
wide enough to absorb cold-start, slowing every warm call.
Separating them lets server-readiness absorb cold-start once at
init time and per-call ceilings stay tight for warm calls.

### Server-readiness via `$/progress` END race (where signal exists)

Two of the three v0.1 adapters' LSP servers emit a
`$/progress` BEGIN→END pair signaling completion of cold-start
project/workspace load:

| Server | Token shape | BEGIN title | Cold-start time (probe) |
|---|---|---|---|
| tsserver (via t-l-s) | UUID | `"Initializing JS/TS language features…"` | ~1.2s |
| gopls | numeric string | `"Setting up workspace"` / `"Loading packages..."` | ~500ms |
| pyright (1.1.409) | n/a | n/a (no `$/progress` emitted) | ~300ms |

The v0.4 helper `waitForServerReady` races a `$/progress` END
frame match against a 3-second ceiling. The ceiling acts as a
safety net — typical cold-start completes in 0.5-1.2s; the ceiling
fires only when the server doesn't emit a recognized signal.

Token-tracking matters because `tsserver`'s END frame contains
only `{kind: "end"}` (no title). The helper captures the token
from a matching BEGIN and resolves only on END for that same
token, so unrelated `$/progress` flows can't accidentally satisfy
the gate.

### Per-file readiness via publishDiagnostics push

`waitForDiagnostics` waits for the next
`textDocument/publishDiagnostics` push for a given URI key, with a
per-adapter ceiling that no longer needs to absorb cold-start:

| Adapter | Per-call ceiling | Rationale |
|---|---|---|
| TypeScript | 1500ms | Probe observed warm push at ~400ms; 3.75x headroom |
| Pyright | 1000ms | Pyright cold-start fast (~300ms); cold-start absorbed by this ceiling rather than separate init-time race |
| gopls | 1500ms | Probe observed warm push at ~600ms; 2.5x headroom |

### Per-adapter opt-in

`waitForServerReady` is opt-in per adapter:

- **tsserver + gopls** wire it. Each provides a per-server
  `$/progress` BEGIN matcher predicate
  (`matchesTsserverColdStartBegin` /
  `matchesGoplsColdStartBegin`).
- **Pyright** does not. No `$/progress` signal source exists in
  pyright 1.1.409 for analysis-completion; cold-start is absorbed
  by the per-call `waitForDiagnostics` ceiling instead.

Wrapping pyright in a no-op `waitForServerReady` would be honest-
fiction code: an await against a never-matching predicate that
always hits the ceiling. The per-adapter opt-in is honest about
per-server reality.

### Short-circuits for degenerate cases

The TypeScript adapter applies two short-circuits to skip the
`waitForServerReady` await when no `$/progress` flow could
possibly fire:

1. **Zero source files in workspace.** tsserver fires `$/progress`
   BEGIN only after a `didOpen` triggers project-load; an empty
   workspace has nothing to trigger it.
2. **No `tsconfig.json` or `jsconfig.json`.** tsserver runs in
   loose-file mode without a project config and doesn't emit
   project-load `$/progress`.

gopls does NOT apply analogous short-circuits because gopls fires
`$/progress` BEGIN immediately on `initialized` regardless of
file-discovery, and Go modules have `go.mod` by definition. The
"no views" cascade case (missing `go.mod`) is absorbed by the
ceiling.

### Architecture summary

| Component | Location | Purpose |
|---|---|---|
| `waitForServerReady(client, matchesBegin, ceilingMs)` | `src/adapters/diagnostics-readiness.ts` | Cold-start `$/progress` END race |
| `waitForDiagnostics(uriKey, listeners, ceilingMs)` | same | Per-file `publishDiagnostics` push race |
| `ProgressParams` interface | same | Typed `$/progress` payload |
| Per-adapter matcher (`matchesXColdStartBegin`) | per-adapter `.ts` | BEGIN-frame title-match predicate |
| Adapter `initialize()` invokes `waitForServerReady` | `typescript.ts`, `go.ts` | Block init until server-ready or ceiling |
| Adapter `getDiagnostics()` invokes `waitForDiagnostics` | all three | Block call until per-file push or ceiling |

## Rationale

- **Two signals, not one** — collapsing them into a single per-
  call ceiling forced 5s+ ceilings that slow warm calls. The
  separation keeps warm-call latency proportional to per-file
  analysis time.
- **`$/progress` END race over alternatives** — empirical probe
  showed END fires before first `publishDiagnostics` for both
  tsserver (~84ms) and gopls (~102ms). It's a stronger signal
  than waiting for an arbitrary "first push" and avoids the
  empty-vs-empty disambiguation problem (no diagnostics yet vs
  no errors found).
- **Title-match prefix over exact match** — tsserver's title
  uses U+2026 horizontal ellipsis (`…`); prefix-match is
  defensive against ASCII variants without committing to a
  specific encoding.
- **Token tracking required** — tsserver's END frame omits
  title; matching on END alone would resolve on any
  `$/progress` END, not specifically the cold-start one.
- **Per-adapter opt-in over forced uniformity** — pyright
  doesn't emit `$/progress` for analysis; wrapping it in a
  no-op race would be honest-fiction code. Production-tool
  framing: ship what works per-server.
- **Short-circuits for degenerate cases** — empty TypeScript
  workspaces / loose-file mode are common in test scenarios
  (see `cli-runner.test.ts`); the short-circuit preserves the
  "init completes in ms against empty src/" contract.

## Consequences

- **Cold-start cost shifts from first `getDiagnostics` call to
  `initialize()`** for tsserver + gopls. Net session runtime
  similar or improved (paid once at init instead of ceiling-
  margin per first call).
- **Adapter `initialize()` is now async-blocking on a real
  resource race**, not just LSP `initialize` request roundtrip.
  Callers that depend on fast init may need to budget the cold-
  start time. Test fixtures use real-project configs; tests
  preserve the contract via short-circuits.
- **Helper file `src/adapters/diagnostics-readiness.ts` is
  shared infrastructure.** Future adapters (Rust, .NET v0.7+)
  follow this pattern: write a per-adapter matcher (~5 LOC),
  wire `waitForServerReady` in `initialize()`, replace inline
  diagnostic race with `waitForDiagnostics` call.
- **ADR-13 + ADR-14 amended** to reference this ADR for the
  cross-cutting pattern; per-server divergences (pyright opts
  out; gopls's title differs from tsserver's) documented in
  this ADR.

## Limitations

- **Title-match brittleness.** Both tsserver's "Initializing JS/
  TS language features" and gopls's "Setting up workspace" are
  hard-coded strings in their respective servers. Upstream
  string changes would silently break server-readiness
  detection and fall back to ceiling. Acceptable per "ceiling
  acts as safety net" framing; flag here so future readers
  know to revisit if servers upgrade.
- **Pyright `$/progress` may emerge in future versions.** Probe
  used pyright 1.1.409 + small fixture; large repos and newer
  pyright versions may emit `$/progress`. Pyright migration
  to opt-in (matching tsserver/gopls pattern) requires only a
  matcher predicate; helper architecture is ready.
- **Single-shot listener.** `waitForDiagnostics` resolves on the
  FIRST `publishDiagnostics` push for a URI. Servers (notably
  gopls) sometimes re-push diagnostics for already-open files
  when new files open; the helper does not capture re-pushes.
  Caching-staleness consideration tracked for v0.5+.
- **Ceiling values are empirical, not adaptive.** Cold-start
  budget (3s) and per-call budgets (1.0s pyright, 1.5s TS+gopls)
  derive from Step 1.1b probe + v0.3 substrate observation.
  Ceilings are constants; adaptive ceilings (e.g., per-repo
  priors from cost-tracking infrastructure) are out of scope
  for v0.4.

## Non-goals

- **Adaptive per-repo ceilings.** Out of scope for v0.4;
  candidate for v0.5+ if benchmark evidence shows constant
  ceilings inadequate.
- **Re-push capture for diagnostic staleness.** Out of scope
  per Limitations.
- **Pyright `$/progress` migration.** Pending upstream emission
  evidence; helper architecture ready.
- **Adapter shutdown-ready signal.** Adapters use shutdown
  request + 2s timeout (`LspClient.stop`). Not in scope of B2.
- **Multi-workspace `$/progress` token disambiguation.** v0.1
  adapters use single-workspace `workspaceFolders`; multi-
  workspace deferred per ADR-14 §Limitations.

## Document relationship

ADR-18 captures the **cross-cutting pattern** for LSP adapter
readiness; per-server LSP-primitive mappings live in per-server
ADRs. The boundary keeps each ADR's scope focused:

| ADR | Scope |
|---|---|
| **ADR-18** (this doc) | Cross-cutting two-signal pattern; `waitForServerReady` + `waitForDiagnostics` helpers; per-adapter opt-in semantics |
| [ADR-13](ADR-13-python-adapter-pyright.md) | Pyright LSP-primitive mappings, declaration-header parsing, Protocol/ABC routing — pyright-specific |
| [ADR-14](ADR-14-go-adapter-gopls.md) | Gopls LSP-primitive mappings, struct-method naming, cross-package implementation — gopls-specific |

Future adapters (Rust v0.7+, .NET v0.7+, etc.) follow the same
shape:

1. **Write per-server matcher** — a small predicate function
   matching the server's `$/progress` BEGIN title, OR opt out
   if the server has no analogous signal (pyright pattern).
2. **Reference ADR-18** for the cross-cutting pattern. No need
   to relitigate the two-signal architecture per adapter.
3. **Write per-server ADR** for primitive mappings, kind
   reduction, and adapter-specific divergences. Same shape as
   ADR-13 / ADR-14.

The empirical anchor (`research/v0.4-step-1-1b-lsp-readiness-
probe.md` in benchmarks repo) establishes the probe pattern;
future adapters re-run a structurally similar probe before their
ADR lands.
