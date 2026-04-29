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
  the `EXTRACTION_PROMPT` constant — validated on two empirical bases:
  (1) pre-scaffolding ADR validation on 12 production-grade documents
  (100% JSON parse success, 169 claims extracted correctly across
  hono and httpx ADRs); (2) v0.3 Step 9 docstring calibration on 13
  samples across TypeScript / Python / Go (11/13 PASS; JSON parse
  100%; severity discipline 100%; cost $0.45). The prompt handles
  ADR + docstring inputs via H1 (single shared prompt) design.
  The extraction pipeline imports from this file; do not duplicate
  the prompt elsewhere. The prompt content, severity taxonomy, and
  model choice are frozen per ADR-02; call signatures, error
  handling, and output validation around it evolve with the
  pipeline. Refinements within the prompt require calibration
  evidence parallel to v0.3 Step 9.

## Current Version

- **Current:** v0.4 shipped 2026-04-29. v0.5 planning queues next;
  not yet started.
- **Strategic arc:** [`ROADMAP.md`](ROADMAP.md) covers v0.1 → v1.0.
- **v0.4 outcome:** Production-installability foundation. Stream A
  substrate hardening (B2 LSP timing-race robustness with
  bounded-poll + readiness-signal pattern across TS/Python/Go
  adapters per ADR-18; A4 directory-aware test-file exclusion; A1
  priors-derived ceiling defaults; A2 retry-overhead modeling;
  commit-message extraction as third claim source; cost-projection
  disclaimer landed in 5 user-facing surfaces). Stream B
  contextatlas-on-itself dogfood + diagnostic-only doctor script
  foundation (5 categories; 17-21 checks; limited-mode for
  unconfigured repos). Stream C bounded-validity matrix-run
  replication (5 cells × n=2 trials; BOUNDED outcome; tokens median
  4.4% / max 45.0%; three-measurement convergence ~4-13%
  replication-noise-floor across extraction-side / matrix-run-side
  / cost-side). Four named findings: filter-shape vs content-
  richness distinction VALIDATED (commit-message filter is
  conventional-commits-flavored; under-captures non-conventional
  corpora); Q3 bifurcated reading SHIPPED (≥30 floor + ≥50 ceiling
  honored independently); bounded-validity replication CONFIRMED;
  cost-projection-vs-platform-billing systematic 3x reduction
  VALIDATED across 4 reference targets.
- **Methodology limits acknowledged in v0.4 ship narrative:** n=2
  trial replication (full statistical methodology n>2 deferred to
  v0.5+); calls-Δ quantization noise on small-N cells (token-Δ is
  load-bearing metric); quality-axis blind-grading explicitly
  v0.5+ scope; Phase 8 substrate cell selection finding-anchored
  not random (full-matrix replication is v0.5+).
- **v0.3 outcome (preserved as historical record):** Stream A atlas
  precision (Theme 1.2 narrower attribution per ADR-16 amendment +
  Theme 1.1 multi-symbol API per ADR-15 + Theme 1.3 atlas schema
  v1.3 with `contextatlas_commit_sha`); Stream B docstring source
  extraction across TS/Python/Go; Stream C methodology hardening;
  Stream D Phase 8 reference run + trace-analysis supplement. Four
  named findings: Theme 1.2 VALIDATED, Stream B VALIDATED, Theme 1.1
  VALIDATED, Theme 2.2 FALSIFIED.
- **v0.2 outcome (preserved as historical record):** Three-language
  baseline established across hono (TypeScript), httpx (Python), and
  cobra (Go). Stream A + Stream B both shipped. v0.2 thesis ("works
  across languages and repos") empirically validated.
- **v0.5+ candidates** (canonical reference at
  [`research/v0.5-candidates.md`](research/v0.5-candidates.md);
  13 items across substrate gaps / feature gaps / process
  improvements / methodology hardening). v0.5 thesis selection at
  per-version scope-doc drafting time; likely candidate is
  developer onboarding pipeline (#13) per ROADMAP framing.
- **Historical references:** `STEP-PLAN-V0.3.md` + `STEP-PLAN-V0.2.md`
  progress logs document per-step execution arcs; `v0.3-SCOPE.md` +
  `v0.2-SCOPE.md` are the scope anchors as shipped.

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
- **Run `npm test` (full suite) before committing `src/` changes.**
  Type-check + lint alone don't catch assertion regressions like the
  v0.3 Commit 0.5 prose-string case (a `summary.test.ts` assertion
  against a stale prose string went unnoticed for 5 commits because
  pre-commit only ran `node --check` + `typecheck`). Pre-commit hook
  automation deferred to v0.5+ candidate (CLAUDE.md "minimize
  dependencies" principle weighs against husky for v0.4); developer
  discipline is the v0.4 standard.

## Extraction cost framing (v0.4 Step 6 / Q5 lock)

Script-reported extraction costs use Anthropic's full-token API
pricing. Actual platform-billed costs reflect prompt-cache discount
(~90% off cached `EXTRACTION_PROMPT` prefix once the first call
warms the cache). v0.4 Step 5 measurements showed ~3x reduction
script-vs-platform across three reference targets:
- cobra: $5.44 script → $1.82 platform
- httpx: $5.53 script → $1.85 platform (estimated; cache-discount-consistent)
- hono: $10.89 script → $3.65 platform (estimated)

**Honest scope-narrative discipline.** Claim conservative
projections; note actual-typically-lower. Don't tune projection
math toward platform-actual values (Q5 lock — pricing volatility
makes maintenance a liability, not a one-time fix). Adaptive
priors-based correction is a v0.5+ candidate if priors observably
drift.

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
