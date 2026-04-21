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
  version. If `package.json` currently lists it under `dependencies`,
  move it to `peerDependencies` or document it as a runtime requirement
  during step 2.
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
- **Pre-drafted extraction prompt:** `src/extraction/prompt.ts` already
  exists and is INTENTIONAL pre-work, not scratch code. It contains the
  `EXTRACTION_PROMPT` constant validated pre-scaffolding on 12
  production-grade documents (100% JSON parse success, 169 claims
  extracted correctly across hono and httpx ADRs). Step 5 should import
  from this file rather than duplicate the prompt. The prompt content,
  severity taxonomy, and model choice are frozen per ADR-02; call
  signatures, error handling, and output validation around it are
  expected to evolve during implementation.

## MVP Scope — What to Build

Build in this order. Do not build items further down the list until the
earlier ones work end-to-end.

**1. MCP server skeleton.** Accepts connection, registers tools, responds
   to pings. Empty tool handlers are fine for this stage.

**2. TypeScript language adapter.** Wraps `typescript-language-server`.
   Implements the `LanguageAdapter` interface from DESIGN.md.
   `listSymbols`, `getSymbolDetails`, `findReferences`, `getDiagnostics`
   must all work on a test TS file.

**3. SQLite storage layer + atlas.json sync.** Schema defined in
   DESIGN.md. Migration runner, connection management, CRUD helpers for
   symbols and claims. **Also required at this step:** AtlasImporter
   (loads atlas.json → SQLite) and AtlasExporter (dumps SQLite →
   atlas.json with deterministic ordering). These are load-bearing for
   the team-artifact model per ADR-06 — do not treat them as
   afterthoughts.

**4. Config file parsing.** `.contextatlas.yml` reader. Validates the
   schema documented in DESIGN.md, including the `atlas` section with
   `committed`, `path`, and `local_cache` fields.

**5. Extraction pipeline with atlas-aware startup.** Reads ADRs from the
   configured path, runs Opus 4.7 extraction per DESIGN.md stage 3,
   resolves symbol candidates to LSP IDs, writes to SQLite. **Import the
   `EXTRACTION_PROMPT` from `src/extraction/prompt.ts`** — it was
   pre-drafted and validated on 12 production-grade documents. Do not
   duplicate it inline. **Before extraction, check for committed
   atlas.json and import if present** (per DESIGN.md stage 0). Only
   extract files whose SHAs differ from the committed baseline. After
   extraction, regenerate atlas.json if `atlas.committed: true` in
   config.

**6. `get_symbol_context` tool — the primitive.** End-to-end. Takes a
   symbol, returns a compact bundle. This is the load-bearing tool
   everything else composes over. Must be polished before moving on.

   **Test-file identification convention:** Test files are identified
   primarily via adapter-reported signals where available (e.g., tsserver's
   `isTestFile` heuristics), falling back to filename patterns:
   `*.test.ts`, `*.spec.ts`, `*.test.tsx` for TypeScript; `test_*.py`,
   `*_test.py`, and anything under a `tests/` directory for Python. The
   convention is not perfect — projects using non-standard test layouts
   may need explicit config in a future version — but it's sufficient
   for the benchmark targets and typical repos.

   **Day-4 scope gate:** By end of day 4, `get_symbol_context` must be
   working end-to-end on a real repo with real extraction output. If it
   is not solid at this point, stop and polish it. Do not proceed to
   the composite tools (steps 8 or 11) with a shaky primitive. Shipping
   one polished tool beats shipping three half-working tools.

**7. Benchmark harness — minimum viable form.** Before building more
   tools, build the measurement infrastructure. Runs a small fixed
   prompt set (start with ~5 prompts, not the full 24) against both
   baseline Claude Code and ContextAtlas. Records tool calls, tokens,
   and wall-clock. Outputs a simple comparison table. Do not over-engineer
   — the harness is here to give you feedback on whether the primitive
   is actually delivering, not to produce the final benchmark numbers.

   **Prerequisites that do not yet exist on disk:**
   - `benchmarks/prompts/hono.md` and `benchmarks/prompts/httpx.md`
     (need to be written — draft 5 prompts per repo minimum)
   - `benchmarks/configs/hono.yml` and `benchmarks/configs/httpx.yml`
     (need to be written — copy the default `.contextatlas.yml` and
     point ADR path at `benchmarks/adrs/<repo>/`)
   - Cloned benchmark repos (hono and httpx) somewhere the harness can
     find them — either `benchmarks/repos/` (gitignored) or a
     user-configurable path

   Acknowledge during step 6 polish that these assets need creating;
   don't leave it until step 7 starts. If they don't exist on day 4,
   step 7 will slip.

   **Why this is step 7, not step 12:** Running the benchmark iteratively
   starting mid-week beats running it polished at the end. If day-4
   numbers show bundles bloating tokens, you adjust the format. If they
   show the intent layer not firing on the right queries, you tune
   severity filtering. If baseline Claude is already fine on some
   bucket, you focus energy elsewhere. Running the benchmark only at
   the end removes the ability to course-correct.

**8. `find_by_intent` tool — thin composite.** SQL text matching
   (`LIKE` or FTS5) against the `claims` table, returning linked
   symbols. No embeddings, no vector search, no fancy ranking. Simple
   relevance ordering: exact phrase match > word overlap > nothing.
   This is a one-day addition built on top of step 6's primitive.

**9. Python adapter via Pyright.** Same interface as the TypeScript
   adapter. Should work without refactoring the core.

**10. Git integration.** Recent commits touching a symbol, hot/cold
    indicator. Feeds into the primitive's `git` signal and is used by
    step 11.

**11. `impact_of_change` tool — thin composite.** Calls the primitive
    internally, adds git co-change data ("files that historically change
    together with this one") and test-impact data ("tests that reference
    this symbol"). Format as a blast-radius bundle. One-day addition.

**12. Incremental reindex.** SHA-based change detection. Only re-extract
    changed files.

**13. Expand the benchmark harness.** Grow from the ~5-prompt MVP harness
    (step 7) to the full 24-prompt set per repo. Add blind grading
    infrastructure. Polish the output table for the README.

### Tool scope philosophy

The three tools (`get_symbol_context`, `find_by_intent`,
`impact_of_change`) are not three parallel features. They are one
fused context system with three access patterns:

- `get_symbol_context` — "I know the symbol; give me everything"
- `find_by_intent` — "I don't know the symbol; find it by what it does"
- `impact_of_change` — "I'm about to change this; what breaks?"

Each composite (#8, #11) is a thin shell over the primitive (#6). Most
of the hard engineering is in the primitive; the composites reuse its
substrate. Do not build them as separate parallel systems.

### Cut order if running behind

If scope pressure forces cuts, in this order:
1. Full benchmark expansion (#13) — MVP harness from step 7 is enough
   for the demo
2. Incremental reindex (#12) — full reindex is acceptable for demo
3. `impact_of_change` (#11)
4. `find_by_intent` (#8)
5. Python adapter (#9)

Protect the primitive (`get_symbol_context`), the extraction pipeline,
and the MVP benchmark harness (step 7) at all costs. The benchmark
harness stays protected because you need it to decide what else to
protect.

Everything beyond item 12 is v0.2 and out of scope for MVP. See
DESIGN.md `Scope Gates` section for the exhaustive out-of-scope list.

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

Three repos are pre-locked. Do not change without discussion:

- `honojs/hono` — TypeScript, 186 source files
- `encode/httpx` — Python, 23 source files
- ContextAtlas itself — dogfood

ADRs written for the first two are in `benchmarks/adrs/`. Benchmark
prompts will land in `benchmarks/prompts/` during the hackathon week.

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
