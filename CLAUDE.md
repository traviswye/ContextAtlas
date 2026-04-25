# CLAUDE.md

Instructions for Claude Code working on the ContextAtlas project.

---

## What This Project Is

ContextAtlas is an MCP server that gives Claude Code a curated atlas of a
user's codebase — fusing LSP-grade structural precision with architectural
intent from ADRs, docs, and git history, delivered in single-call context
bundles.

Read `DESIGN.md` for the full architecture. Read `RUBRIC.md` for benchmark
methodology. Read `README.md` for the public-facing positioning.

## Critical Constraints

These are decisions already made. Do not relitigate them.

- **Language:** TypeScript (Node 20+). No Python or Go in the server code
  itself — those are supported as *target languages* via language adapters,
  not as implementation languages.
- **Dependencies:** Minimize. Required: `@modelcontextprotocol/sdk`,
  `@anthropic-ai/sdk`, `better-sqlite3`, a YAML parser, a glob library.
  Do not add state management libraries, ORMs, or HTTP frameworks.
- **`typescript-language-server` placement:** User-provided, not a
  bundled dependency. The TS adapter spawns it as a subprocess, but the
  binary itself is expected to be on the user's PATH or pointed to via
  config. This keeps the package lean and lets users choose their tsserver
  version. `package.json` lists it as a `peerDependency` — do not
  promote to a direct dependency.
- **LSP client strategy:** Raw JSON-RPC over stdio. No
  `vscode-languageclient` / `vscode-jsonrpc` dependency. The LSP
  subset we need (initialize, documentSymbol, references, diagnostics,
  shutdown) is ~150 lines of framing and fits comfortably in
  `src/adapters/lsp-client.ts` without pulling VS Code's client
  machinery. Rationale: dependency minimization per the constraint
  above, and cleaner control over subprocess lifecycle.
- **Storage:** SQLite via `better-sqlite3`. Single file. No Postgres, no
  Redis, no external services.
- **MCP SDK:** `@modelcontextprotocol/sdk`. Follow their patterns.
- **Output format:** Compact text by default, JSON available via input
  parameter. Compact format is defined in DESIGN.md.
- **Symbol ID format:** `sym:<lang-short-code>:<path>:<name>` (see
  ADR-01). Line numbers are NOT part of the ID — they live as a field
  on the Symbol record. Locked; do not change without updating ADR-01,
  DESIGN.md, and bumping the version.
- **Extraction model:** `claude-opus-4-7` at default effort. Not extended
  thinking. See DESIGN.md section on extraction pipeline.
- **Pre-drafted extraction prompt:** `src/extraction/prompt.ts` holds
  the `EXTRACTION_PROMPT` constant — validated pre-scaffolding on 12
  production-grade documents (100% JSON parse success, 169 claims
  extracted correctly across hono and httpx ADRs). The extraction
  pipeline imports from this file; do not duplicate the prompt
  elsewhere. The prompt content, severity taxonomy, and model choice
  are frozen per ADR-02; call signatures, error handling, and output
  validation around it evolve with the pipeline.

## Current Version

- **Current:** v0.2 shipped 2026-04-25. v0.3 (claim source enrichment +
  Phase 7 follow-throughs) queues next; not yet started.
- **Strategic arc:** [`ROADMAP.md`](ROADMAP.md) covers v0.1 → v1.0.
- **v0.2 outcome:** Three-language baseline established across hono
  (TypeScript), httpx (Python), and cobra (Go). Stream A (adapter
  quality polish) and Stream B (Go adapter via gopls + cobra
  benchmark + httpx + cobra reference runs) both shipped. v0.2
  thesis ("works across languages and repos") empirically validated.
- **Three v0.3+ findings logged during Phase 7:** Go grep-ability
  paradigm sensitivity (Phase 7 §5.1, positive calibration);
  atlas-file-visibility benchmark methodology issue (§5.2,
  v0.3 backlog); cross-harness asymmetry hypothesis (§5.3, worth
  tracking through v0.3 reference runs).
- **Historical references:** `STEP-PLAN-V0.2.md` progress log
  documents the per-step execution arc; `v0.2-SCOPE.md` is the
  scope anchor as shipped (success criteria all satisfied — see
  [STEP-PLAN-V0.2.md `## Progress log` Step 11 entry](STEP-PLAN-V0.2.md)).

When making architectural decisions, check ADRs first. ADR-13
(Pyright) and ADR-14 (gopls) document the language-adapter LSP
contracts; ADR-06 (committed atlas) and ADR-11 (git signal index)
document the atlas-side invariants.

v0.1 shipped with Phase 5 empirical validation (50–71% tool-call
reduction on architectural win-bucket prompts on hono). v0.2
shipped Phase 6 (httpx) + Phase 7 (cobra) reference runs validating
cross-language replication. Historical MVP build-plan details
live in git history, not this file.

## Tool scope philosophy

The three tools (`get_symbol_context`, `find_by_intent`,
`impact_of_change`) are not three parallel features. They are one
fused context system with three access patterns:

- `get_symbol_context` — "I know the symbol; give me everything"
- `find_by_intent` — "I don't know the symbol; find it by what it does"
- `impact_of_change` — "I'm about to change this; what breaks?"

The composites (`find_by_intent`, `impact_of_change`) are thin shells
over the primitive (`get_symbol_context`). Most of the hard
engineering is in the primitive; the composites reuse its substrate.
Do not build them as separate parallel systems.

**Protect at all costs:** the primitive and the extraction pipeline.
Regressions there cascade to every composite and every downstream
query.

### Test-file identification convention

Test files are identified primarily via adapter-reported signals
where available (e.g., tsserver's `isTestFile` heuristics), falling
back to filename patterns: `*.test.ts`, `*.spec.ts`, `*.test.tsx`
for TypeScript; `test_*.py`, `*_test.py`, and anything under a
`tests/` directory for Python. The convention is not perfect —
projects using non-standard test layouts may need explicit config
in a future version — but it's sufficient for the benchmark targets
and typical repos.

## ADRs That Constrain This Project

ContextAtlas ADRs live in `docs/adr/`. They constrain ContextAtlas
development itself — the same way ADRs for hono constrain hono
development. When making architectural decisions in this codebase,
check ADRs first.

The ADRs in `benchmarks/adrs/hono/` and `benchmarks/adrs/httpx/` are
*not* about ContextAtlas — they're test fixtures for benchmarking
against those external repos.

## Coding Standards

- **TypeScript strict mode.** `tsconfig.json` sets `strict: true`. Do not
  weaken. Do not use `any` at API surfaces.
- **Small files.** Prefer files under 300 lines. Split when they grow.
- **No circular dependencies.** Adapter → core → storage is the allowed
  direction. Core does not import from adapters directly; adapters are
  loaded via the plugin interface.
- **Tests adjacent to source.** `foo.ts` + `foo.test.ts`. Use Vitest.
- **Error messages are actionable.** Every thrown error should tell the
  user what went wrong and what to do about it.

## What to Ask the User About

Ask before:

- Adding a new runtime dependency (even small ones)
- Changing the MCP tool interface shape
- Changing the symbol ID format
- Changing the output format
- Touching the extraction prompt
- Deciding between "handle this case" and "fail loudly"

Do not ask before:

- Adding tests
- Fixing bugs within established patterns
- Refactoring within a single file
- Adding internal utility functions
- Writing JSDoc / docstrings

## Benchmark Targets

Three external repos are pre-locked. Do not change without discussion:

- `honojs/hono` — TypeScript, 186 source files
- `encode/httpx` — Python, 23 source files
- `spf13/cobra` — Go, 19 source files

ADRs written for all three are in
[`../ContextAtlas-benchmarks/adrs/`](../ContextAtlas-benchmarks/adrs/)
(5 hono + 5 httpx + 8 cobra). Benchmark prompts are in
[`../ContextAtlas-benchmarks/prompts/`](../ContextAtlas-benchmarks/prompts/),
locked per pre-registration discipline. ContextAtlas itself is
dogfooded during development but is not part of the measured
benchmark matrix — the four-condition matrix runs only against the
three external targets above.

## Using ContextAtlas on Itself

As soon as the core tool works, configure ContextAtlas to index its own
ADRs (`docs/adr/`) and documentation. Use it during subsequent development.
This is the dogfooding story — if the tool is not good enough to help
build itself, it is not good enough to ship.

## Common Pitfalls to Avoid

- **Don't reinvent LSP.** Resist the urge to write custom parsers or
  symbol walkers. tsserver and Pyright handle this correctly. Use them.
- **Don't embed.** Vector similarity is tempting for `find_by_intent`
  but out of scope for MVP. Simple text matching against the claim
  field is sufficient. Only revisit if benchmark evidence shows it's
  needed.
- **Don't over-abstract the language adapter.** Two languages is
  sufficient for the abstraction to be real. More generality than that
  is speculative.
- **Don't scope-creep the bundle.** `get_symbol_context` returns a
  symbol-centric bundle. "What are the top N symbols in the repo?" is
  a different query. Do not conflate.
- **Don't make index-time decisions at query time.** The whole point
  is that expensive reasoning happens once at index time. If you find
  yourself adding Anthropic API calls to query resolution, stop and
  reconsider.

## When Things Are Unclear

If you encounter ambiguity not covered by DESIGN.md, RUBRIC.md, README.md,
or this file: ask. Do not guess and make up a convention. The user has
already thought about most cross-cutting concerns and has opinions worth
learning.
