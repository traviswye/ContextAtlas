# ContextAtlas: Design Document

**Status:** v0.1 + v0.2 shipped (2026-04-25). Three-language baseline
validated (hono / httpx / cobra) via Phase 5/6/7 reference runs in
the [benchmarks repo](https://github.com/traviswye/ContextAtlas-benchmarks).
Architectural reference, not a scope document — v0.2 scope lives in
[`v0.2-SCOPE.md`](v0.2-SCOPE.md); version-arc context in
[`ROADMAP.md`](ROADMAP.md).
**Last Updated:** 2026-04-23
**Scope:** Core architecture. Most sections apply across versions;
adapter lineup and scope-gate lists are refreshed as versions
advance.

---

## What ContextAtlas Is

ContextAtlas is an MCP server that gives Claude Code a curated atlas of your
codebase. It fuses LSP-grade structural precision with architectural intent
extracted from your ADRs, docs, and git history, delivered to Claude in
single-call context bundles.

The core idea: Claude Code currently discovers codebases through brute-force
exploration — `grep`, `find`, `cat`, repeated across dozens of tool calls.
Every query re-does the same expensive discovery. ContextAtlas does the
expensive work once, at index time, and serves queries from a cheap
pre-computed index keyed to real code symbols.

## The Problem ContextAtlas Solves

Three concrete failure modes of baseline Claude Code:

**1. Token burn on structural discovery.** Every "where is X defined?" and
"what depends on Y?" triggers multiple grep calls, file reads, and follow-up
exploration. On a 200-file codebase, a single architectural question can
consume 40+ tool calls and 100k+ tokens before Claude has enough context to
reason.

**2. Architectural intent is invisible.** An ADR saying "OrderProcessor
must be idempotent" lives in `docs/adr/`. When Claude proposes a change to
`OrderProcessor`, it has no way to know that constraint exists unless
something in the immediate file mentions it. The maintainer's architectural
reasoning is unreachable.

**3. Context is rebuilt every session.** Claude Code sessions are stateless.
Everything Claude learns about a repo in one session is gone in the next.
Nothing is cached across sessions.

ContextAtlas addresses all three with a single architectural move: **push
expensive understanding to index time, serve queries cheaply from a durable
index keyed to LSP-resolved symbols.**

## Design Principles

Six principles inform every design decision below:

**1. Do more per tool call.** Every tool call has fixed overhead. The win is
density, not speed. A single `get_symbol_context` call returns what would
otherwise take 8-15 grep/read/blame round-trips.

**2. Index-time work, query-time lookups.** High-effort reasoning (Opus 4.7
extracting structured claims from prose) happens once per source change.
Queries are dictionary lookups.

**3. LSP is the ground truth for structure.** Symbol names, references,
types, diagnostics — always from the language server, never from regex.
Compiler-grade precision or nothing.

**4. Intent is the differentiator.** Every other tool in this space does
some version of structural extraction. ContextAtlas's distinctive value is
surfacing architectural intent — ADR constraints, design rationale, historical
decisions — keyed to the specific symbols they govern.

**5. Progressive disclosure over firehose.** Bundles return compact
summaries with stable IDs. Claude pulls detail by ID only when needed.
Avoids context pollution.

**6. Learn from usage, not from heuristics.** Across many sessions, the
same ~20 queries account for most of the traffic on any given repo —
"where is auth?", "what's the data flow for X?", the well-worn paths.
ContextAtlas logs query patterns and can pre-compute answers to
frequently-asked questions. The system gets faster on the queries users
actually make, without guessing up front what those will be.

## Architecture Overview

ContextAtlas is layered. Each layer contributes a different kind of knowledge:

```
┌─────────────────────────────────────────────────────────────┐
│ MCP Interface Layer                                         │
│   get_symbol_context, find_by_intent, impact_of_change      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│ Query Fusion Layer                                          │
│   Composes results from signal sources per query shape      │
└─────────────────────────────────────────────────────────────┘
         │           │           │            │
    ┌────▼───┐  ┌────▼────┐ ┌───▼────┐  ┌────▼─────┐
    │  LSP   │  │ Intent  │  │  Git   │  │  Tests   │
    │ Layer  │  │Registry │  │ Layer  │  │  Layer   │
    └────────┘  └─────────┘  └────────┘  └──────────┘
         │           │            │            │
    ┌────▼───┐  ┌────▼────┐  ┌───▼────┐  ┌────▼─────┐
    │tsserver│  │ SQLite  │  │ git    │  │ file     │
    │Pyright │  │ Index   │  │ log    │  │ naming   │
    └────────┘  └─────────┘  └────────┘  └──────────┘
```

**Signal sources are independent.** LSP, intent, git, and tests each provide
their own kind of information. Fusion happens at query time, not ingest time.
This keeps indexing cheap and lets each query request only the signals it
needs.

**The intent registry is the novel layer.** At index time, Opus 4.7 reads
every ADR, design doc, and structured docstring in the repo, and extracts
structured claims of the form `{symbol, constraint, severity, rationale,
source}`. These claims are written to SQLite keyed to LSP-resolved symbol IDs.
At query time, a single join surfaces the claims for any requested symbol.

## Tool Interface (MCP)

Three MCP tools, all in MVP scope. `get_symbol_context` is the primitive
that does the substantive work. `find_by_intent` and `impact_of_change`
are thin composites over the primitive — reusing the same index, the
same extraction output, and the same symbol resolution layer. Together
they give ContextAtlas three distinct access patterns into one fused
context substrate:

- `get_symbol_context` — "I know the symbol; give me everything"
- `find_by_intent` — "I don't know the symbol; find it by what it does"
- `impact_of_change` — "I'm about to change this; what breaks?"

### `get_symbol_context`

The primitive. Returns a fused context bundle for a symbol — or for a
batch of symbols (multi-symbol mode, ADR-15).

**Input:**

```jsonc
{
  "symbol": "OrderProcessor",              // required: string OR string[] (max 10)
  "file_hint": "src/orders/processor.ts",  // optional, disambiguates (uniform across batch)
  "depth": "summary" | "standard" | "deep", // default: standard
  "include": ["refs", "intent", "git", "types", "tests"], // optional filter
  "max_refs": 50,                           // cap on references
  "query": "stream lifecycle response state" // optional, ADR-16: BM25-rank intent claims
}
```

**Output (default compact format):**

```
SYM OrderProcessor@src/orders/processor.ts:42 class
  SIG class OrderProcessor extends BaseProcessor<Order>
  INTENT ADR-07 hard "must be idempotent"
    RATIONALE "All order processing must be safely retryable."
  INTENT ADR-12 soft "prefer async base class"
  REFS 23 [billing:14 admin:9]
    TOP ref:ts:src/billing/charges.ts:88
    TOP ref:ts:src/admin/orders.ts:12
  GIT hot last=2026-03-14
    RECENT "Fix idempotency bug in retry path" a3f2c1d
  TESTS src/orders/processor.test.ts (+11)
  TYPES extends=BaseProcessor implements=[] used_by=[OrderQueue, OrderHandler]
```

JSON format available via `format: "json"` input parameter.

**Design rationale for compact format:** Empirically produces ~40-60% token
savings vs JSON on the same content, with no measurable loss in Claude's
ability to use the information. JSON is available for programmatic
consumers.

**Multi-symbol mode (ADR-15).** When `symbol` is an array of up to 10
names, the response carries one sub-bundle per symbol, separated by
named delimiters. Per-symbol failures inline as ERR sub-bundles in
their positional slot; the call returns `isError: true` only when
*every* symbol failed to resolve. Order matches request order.
Duplicate input strings are dropped via `.trim()`-normalized
exact-string-match dedup before resolution. Single-string input
preserves the legacy single-bundle output shape (no envelope, no
delimiters) — `["Foo"]` and `"Foo"` produce different shapes by design.

**Optional BM25 query ranking (ADR-16).** When the server's
`mcp.symbol_context_bm25` config flag is enabled AND the caller passes
a `query` parameter, claims in the intent block are FTS5
BM25-ranked against the query — same primitives as `find_by_intent`
([ADR-09](docs/adr/ADR-09-find-by-intent-fts5-bm25.md)). The sort
chain is BM25 → severity (hard > soft > context) → source → claim_id.
Claims that don't match any query token still surface in the bundle
but sort to the end via a `+Infinity` sentinel — `get_symbol_context`'s
"give me everything attached to this symbol" contract is preserved;
BM25 only re-orders, never filters. **Two-layer gating:** flag-off OR
query-absent both fall back to v0.2 deterministic ordering (severity
→ source → claim_id), preserving byte-equivalence for existing
callers. Multi-symbol mode applies the same query uniformly to every
symbol in the batch (per ADR-15 §3 uniform-options rule).

**Caller caveat — cross-severity promotion (ADR-16 §Decision 2
chain α).** When BM25 ranking is active (server flag enabled +
caller passes `query`), the chain α design (BM25 dominates;
severity is tiebreaker, not primary sort) may promote
context-severity claims above hard-severity claims for
query-relevance reasons. Step 6 spot-check
([`research/v0.3-stream-a-spot-check.md`](../ContextAtlas-benchmarks/research/v0.3-stream-a-spot-check.md))
measured 7-of-8 probe combinations exhibiting this cross-severity
promotion (main-repo `144c576`; benchmarks `e81dbe2`). For
example: a query `"response stream lifecycle"` against a bundle
with one context-severity claim describing the lifecycle and
three hard-severity claims about general response constraints —
BM25 may surface the lifecycle claim first because it BM25-
matches the query. Callers should treat top-INTENT under BM25
as "most-relevant-to-this-query" rather than "most-severe-
constraint-overall." See [ADR-16 §Decision 2](docs/adr/ADR-16-bm25-symbol-context.md)
for the chain α rationale and the soft-chain-α future alternative
flagged in Step 7.

Compact output:

```
--- get_symbol_context: OrderProcessor (1 of 2) ---
SYM OrderProcessor@src/orders/processor.ts:42 class
  ...

--- get_symbol_context: GhostSymbol (2 of 2) ---
ERR not_found
  MESSAGE Symbol 'GhostSymbol' not found. ...
```

JSON output (envelope shape):

```jsonc
{
  "results": [
    { "symbol": "OrderProcessor", "bundle": { ... }, "error": null },
    { "symbol": "GhostSymbol", "bundle": null,
      "error": { "code": "not_found", "message": "..." } }
  ]
}
```

When *all* symbols fail, the compact response prepends
`ERR all_symbols_failed\n  COUNT <N>\n` plus a blank line (compact-only
affordance — JSON consumers detect all-failed via `isError: true` plus
walking `results`). Cap exceedance (11+ items) raises an MCP
`InvalidParams` protocol error rather than silently truncating —
explicit error is the cleaner failure mode.

### `find_by_intent`

Semantic query against the intent registry. "Where is payment idempotency
enforced?" returns symbols whose claims match the query.

**Input:**

```jsonc
{
  "query": "where is payment idempotency enforced?",
  "limit": 5
}
```

**Output:**

```jsonc
{
  "matches": [
    {
      "symbol_id": "sym:ts:src/orders/processor.ts:OrderProcessor",
      "name": "OrderProcessor",
      "relevance": 0.94,
      "matched_intent": { "source": "ADR-07", "claim": "must be idempotent" },
      "snippet": "class OrderProcessor extends BaseProcessor<Order>"
    }
  ]
}
```

**Status:** MVP. Implementation is a thin composite over the primitive:
SQL text matching (SQLite `LIKE` or FTS5) against the `claims` table,
returning linked symbols with simple relevance ordering (exact phrase
match > word overlap). No embeddings, no vector search for MVP — the
extracted claim text is already structured prose, and text matching on
structured claims performs well enough without the complexity of a
vector pipeline. Embedding-based ranking is a post-MVP enhancement
contingent on benchmark evidence that it helps.

### `impact_of_change`

Derived bundle for "if I modify X, what else is affected?"

**Input:**

```jsonc
{
  "symbol": "OrderProcessor",              // required
  "file_hint": "src/orders/processor.ts",  // optional
  "include": ["refs", "tests", "git", "intent"]  // optional filter
}
```

**Output (compact format):**

```
IMPACT OrderProcessor@src/orders/processor.ts:42
  INTENT ADR-07 hard "must be idempotent" (affects change)
  DIRECT_REFS 23 [billing:14 admin:9]
  TESTS src/orders/processor.test.ts (+11)
  GIT_COCHANGE 5 files historically change with this
    src/orders/queue.ts (8 co-commits)
    src/billing/charges.ts (5 co-commits)
  RISK_SIGNALS hot=true recent_fix="Fix idempotency bug"
```

**Status:** MVP. Implementation is composition: calls `get_symbol_context`
internally, adds git co-change analysis (`git log --name-only` filtered
to commits touching the target file) and test-impact analysis (test
files referencing the symbol via LSP). Returns a blast-radius-shaped
bundle.

## Symbol ID Format

```
sym:<lang-short-code>:<path>:<n>
```

Example: `sym:ts:src/orders/processor.ts:OrderProcessor`

**Line numbers are not part of the ID.** They live as a field on the
Symbol record (`line`). This keeps IDs stable across line moves, which
in turn keeps atlas.json diffs reviewable. See ADR-01 for the full
rationale.

**Language short codes** come from the authoritative `LANG_CODES`
constant in `src/types.ts`:

| LanguageCode   | Short code |
|----------------|------------|
| `typescript`   | `ts`       |
| `python`       | `py`       |

Adding a language adapter adds an entry to `LANG_CODES`. Changing an
existing short code is a breaking change requiring a major version bump.

**Path normalization is required at every ingest boundary.** All paths
(in symbol IDs, reference IDs, atlas.json, and the storage schema) use
forward-slash separators regardless of OS. A single `normalizePath()`
utility must be applied when reading from LSP, parsing config, importing
atlas.json, or scanning file systems. Without this, the same file on
different operating systems would produce different IDs, silently
breaking team consistency.

Stable across commits as long as the (path, name) pair does not change.
When it does, incremental reindex catches it. Ambiguous cases (overloaded
names in the same file) currently collide — first declaration wins. A
future major version may add a disambiguator.

Reference IDs follow the pattern `ref:<lang-short-code>:<path>:<line>`.
Unlike Symbol IDs, Reference IDs include line because a reference *is*
a location in a file.

## Config Schema

Per-repo configuration via `.contextatlas.yml` at repo root.

```yaml
version: 1
languages:
  - typescript
  - python
adrs:
  path: docs/adr/
  format: markdown-frontmatter
  symbol_field: symbols
docs:
  include:
    - README.md
    - docs/**/*.md
    - CONTRIBUTING.md
git:
  recent_commits: 5
index:
  model: claude-opus-4-7
atlas:
  committed: true                        # commit atlas.json to the repo
  path: .contextatlas/atlas.json         # committed artifact location
  local_cache: .contextatlas/index.db    # gitignored SQLite cache
extraction:                              # optional; v0.2 + v0.3 knobs
  budget_warn_usd: 1.50                  # USD warn threshold (v0.2 Stream A #2)
  narrow_attribution: drop               # claim-attribution rule (v0.3 Fix 2)
mcp:                                     # optional; v0.3 query-time knobs
  symbol_context_bm25: true              # BM25 ranking on get_symbol_context (ADR-16)
```

Seven sections required (`extraction` is optional). No inheritance, no
workspaces, no cross-repo refs. MVP-scoped deliberately. See ADR-06 for
the atlas committed/local-cache split.

### `extraction` section (optional)

Pipeline knobs surfaced after v0.2 reference runs.

- **`budget_warn_usd`** (v0.2 Stream A #2). When the cumulative
  Anthropic API cost during an extraction run exceeds this threshold,
  a single warning is logged to stderr. Not a hard cap — the run
  continues. CLI flag `--budget-warn <usd>` overrides at invocation
  time. Absent means no budget check.
- **`narrow_attribution`** (v0.3 Theme 1.2 Fix 2). Claim-attribution
  narrowing rule targeting the muddy-bundle mechanism documented in
  Phase 6 §5.1
  ([`../ContextAtlas-benchmarks/research/phase-6-httpx-reference-run.md`](../ContextAtlas-benchmarks/research/phase-6-httpx-reference-run.md)
  §5.1 + the `atlas-claim-attribution-ranking.md` companion note in
  the same directory). Three states:
  - **Absent (default).** Baseline v0.2 behavior — frontmatter symbols
    inherit as a per-claim baseline merged with model-extracted
    candidates. Preserves byte-equivalence with pre-Step-5 atlases.
  - **`drop`.** Drop frontmatter inheritance entirely; claims attach
    only to model-extracted candidates. Cleanest experimental knob;
    isolates the Phase 6 mechanism check. Regression risk: claims
    where the model didn't surface specific candidates may attach to
    ZERO symbols, becoming invisible to `get_symbol_context` lookups.
  - **`drop-with-fallback`.** Same as `drop`, but recovers when a
    claim would otherwise resolve to zero symbols by falling back to
    frontmatter inheritance for that claim only. Addresses the `drop`
    regression risk; cheap insurance.
  - CLI flag `--narrow-attribution=<value>` overrides at invocation
    time.

  **Step 7 ship default (Pattern 2 retention).** v0.3 ships
  `drop-with-fallback` as default-on per [STEP-PLAN-V0.3 Step 7
  progress log](STEP-PLAN-V0.3.md). The "Absent (default)" semantics
  above describe the pre-Step-7 schema; the Step 7 decision flips
  the absent-value behavior to `drop-with-fallback`-equivalent.
  Opt-out for v0.2-equivalent attribution: explicit
  `extraction.narrow_attribution: off` (the `off` schema value +
  config-default flip implementation lands bundled with Step 14
  atlas re-extraction — until then, the schema described above is
  current shipped state). Pattern 2 commits maintenance of all
  flag-off codepaths through v0.3-v0.5+ until Stream D + dogfood +
  production evidence supports retirement.

  **Narrowing risk (post-Step 7 default-on caveat).**
  `drop-with-fallback` recovers zero-symbol cases but does NOT
  recover partial-loss cases. Concrete example: claim X attaches
  to {A, B, C, D, E} under v0.2 attribution. Under
  `drop-with-fallback` default-on, X now attaches to {A, B} only.
  The missing {C, D, E} aren't recovered because the fallback rule
  fires only when a claim resolves to zero symbols; X still
  resolves to ≥1 symbol so fallback doesn't trigger. Users wanting
  full v0.2 attribution behavior must explicitly opt out via
  `extraction.narrow_attribution: off`. Step 5 spot-check evidence
  (main-repo `b025d3d`; benchmarks `68e3d1e`) measured this
  trade-off as net-positive on the p4-stream-lifecycle cell;
  Stream D Step 14/15 re-measures at scale.

### `mcp` section (optional)

Server-side query-time knobs. Affect how the MCP server ranks /
composes responses from an already-extracted atlas; do not affect
extraction.

- **`symbol_context_bm25`** (v0.3 Theme 1.2 Fix 3 — ADR-16). When
  `true`, `get_symbol_context` BM25-ranks the intent block IF the
  caller passes a `query` parameter. Falls back to v0.2 deterministic
  ordering otherwise. **Two-layer gating** (flag + query): both
  required for BM25 to activate. Defaults to absent (false).
  v0.2-equivalence canary tests in
  [`src/queries/symbol-context.test.ts`](src/queries/symbol-context.test.ts)
  protect the flag-absent path against silent regressions. See
  [ADR-16](docs/adr/ADR-16-bm25-symbol-context.md) for the full
  decision record + Phase 6 §5.1 motivation.

## Extraction Pipeline

The index-time pipeline that turns prose into structured claims.

**Stage 1 — Source collection.** Walk the repo. Collect ADR files (from
config path), READMEs, contributing docs, and any markdown matching the
configured globs. Read file contents into memory.

**Stage 2 — Symbol inventory.** Use the LSP layer to enumerate all
exported symbols in the repo. This becomes the target vocabulary for
symbol resolution in stage 4.

**Stage 3 — Structured extraction with Opus 4.7.** For each document,
prompt Opus 4.7 to extract architectural claims in strict JSON matching
this schema:

```jsonc
{
  "claims": [
    {
      "symbol_candidates": ["OrderProcessor", "BaseProcessor"],
      "claim": "must be idempotent",
      "severity": "hard" | "soft" | "context",
      "rationale": "enables safe retry on network failures",
      "excerpt": "All order processing must be safely retryable..."
    }
  ]
}
```

Severity taxonomy:
- **hard** — explicit constraint, violation is a bug ("must", "never")
- **soft** — preference, violation is a smell ("should", "prefer")
- **context** — background information, no rule ("this module handles...")

**Reasoning effort.** We use Opus 4.7 at default effort, not extended
thinking. Opus 4.7's extended thinking API (`thinking.type: "adaptive"` +
`output_config.effort`) was tested and deferred: on production-grade ADRs,
default effort produced valid JSON with accurate severity classification
on every claim across 12 documents tested. Extended thinking is available
as an escape hatch for edge cases but is not the default. This keeps
extraction cost at the $0.25 per substantial ADR envelope rather than
multiples of that.

**Stage 4 — Symbol resolution.** Resolve fuzzy symbol_candidates to canonical
symbol IDs via the LSP inventory. Exact matches are linked; ambiguous matches
keep all candidates; non-matches are dropped (and logged as potential
hallucinations).

**Stage 5 — Storage.** Insert claims into SQLite keyed to symbol IDs,
and serialize to atlas.json for commit to the repo. See the
"Atlas as Team Artifact" section below for the bidirectional
sync model.

**Stage 6 — Incremental reindex.** Hash every source file. On reindex,
compare current file SHAs against SHAs recorded in atlas.json (if
present) or against the last-run cache. Only re-process changed files.
Delete stale claims for changed files, re-run the pipeline, insert new
claims. Unchanged files stay untouched.

**Stage 0 — Atlas import (preceding stages 1-6 when atlas.json exists).**
Before doing any extraction, check for a committed atlas.json. If
present:
1. Import all symbols and claims into local SQLite
2. Record the committed SHAs as the baseline
3. Stages 1-5 then only run on files whose current SHA differs from
   the committed baseline (incremental from the committed state)

This is how new team members and returning contributors avoid paying
the full first-run cost. See ADR-06 for the architectural rationale.

## Atlas as Team Artifact

ContextAtlas produces two artifacts with different lifecycle roles:

### atlas.json — committed team artifact

Human-readable JSON, committed to the repo alongside source code and
ADRs. This is the canonical team-wide knowledge base. It's what new
contributors inherit when they clone the repo.

Schema:

```jsonc
{
  "version": "1.3",
  "generated_at": "2026-04-25T03:06:25Z",
  "generator": {
    "contextatlas_version": "0.3.0",
    "contextatlas_commit_sha": "a1b2c3d4e5f6...",
    "extraction_model": "claude-opus-4-7"
  },
  "source_shas": {
    "docs/adr/ADR-01.md": "abc123...",
    "docs/adr/ADR-02.md": "def456..."
  },
  "symbols": [
    {
      "id": "sym:ts:src/orders/processor.ts:OrderProcessor",
      "name": "OrderProcessor",
      "kind": "class",
      "path": "src/orders/processor.ts",
      "line": 42,
      "signature": "class OrderProcessor extends BaseProcessor<Order>",
      "file_sha": "..."
    },
    {
      "id": "sym:go:kinds.go:Shape.Area",
      "name": "Shape.Area",
      "kind": "method",
      "path": "kinds.go",
      "line": 56,
      "signature": "func() float64",
      "parent_id": "sym:go:kinds.go:Shape",
      "file_sha": "..."
    }
  ],
  "claims": [
    {
      "source": "ADR-07",
      "source_path": "docs/adr/ADR-07-idempotency.md",
      "source_sha": "ghi789...",
      "severity": "hard",
      "claim": "must be idempotent",
      "rationale": "...",
      "excerpt": "...",
      "symbol_ids": ["sym:ts:src/orders/processor.ts:OrderProcessor"]
    }
  ]
}
```

Key properties of atlas.json:

- **Deterministic ordering.** Symbols sorted by ID. Claims sorted by
  (source, symbol_id, claim). This keeps git diffs focused and readable.
- **SHA-tracked.** Every source file has its SHA recorded. Enables
  efficient incremental reindex by diffing current SHAs against
  committed SHAs.
- **Self-describing.** Version, generator info, and extraction model
  recorded so future tooling knows how the atlas was produced.
- **Versioned schema.** `version` field at the top. Breaking schema
  changes require major version bumps and automatic migration.
- **Fully loadable.** No streaming, no chunking for MVP. Even a large
  atlas loads in one pass.
- **Optional fields use omit-when-empty.** `signature` and `parent_id`
  on symbols and `rationale` / `excerpt` on claims are omitted from
  the JSON when their value is empty, `null`, or `undefined`. Importers
  treat missing keys as absent. This convention is part of the
  round-trip invariant: any new optional field added later MUST follow
  the same rule, and no field may be added that requires preserving a
  distinction between absent, `null`, and empty string — round-trip
  collapses those states.
- **`parent_id` (atlas schema v1.2+).** Optional back-pointer for
  symbols flattened from a nested-child shape to top-level — currently
  used by the Go adapter ([ADR-14](docs/adr/ADR-14-go-adapter-gopls.md))
  to preserve the interface → method relationship after flattening
  Go interface methods from gopls's documentSymbol children to
  sibling top-level entries (e.g., `Shape.Area` carries
  `parent_id: "sym:go:kinds.go:Shape"`). v1.0 / v1.1 atlases import
  cleanly with `parent_id` undefined on every symbol; v1.2 atlases
  round-trip the field. Same additive-bump pattern ADR-11 used for
  the 1.0 → 1.1 git-signal addition.
- **`generator.contextatlas_commit_sha` (atlas schema v1.3+).**
  Optional git HEAD SHA of the contextatlas binary that produced
  the atlas (v0.3 Theme 1.3). Records the *tool's* HEAD for
  provenance — distinct from `extracted_at_sha` on the envelope,
  which records the *target repo's* HEAD. Omitted when the binary
  is not run from a git checkout (e.g., a published `npm install`-ed
  binary) or when SHA resolution fails. Earlier-version atlases
  import cleanly with the field absent.

### index.db — local derived cache

SQLite binary, gitignored, never committed. This is the query-time
performance layer — fast joins, indexed lookups, compact storage.
Every developer has their own index.db; it's rebuilt from atlas.json
on demand.

SQLite schema:

```sql
CREATE TABLE symbols (
  id          TEXT PRIMARY KEY,    -- sym:<lang-short-code>:<path>:<n>
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  path        TEXT NOT NULL,
  line        INTEGER NOT NULL,
  signature   TEXT,
  file_sha    TEXT NOT NULL
);

CREATE TABLE claims (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_sha  TEXT NOT NULL,
  severity    TEXT NOT NULL,
  claim       TEXT NOT NULL,
  rationale   TEXT,
  excerpt     TEXT
);

CREATE TABLE claim_symbols (
  claim_id    INTEGER NOT NULL,
  symbol_id   TEXT NOT NULL,
  PRIMARY KEY (claim_id, symbol_id),
  FOREIGN KEY (claim_id) REFERENCES claims(id),
  FOREIGN KEY (symbol_id) REFERENCES symbols(id)
);

CREATE INDEX idx_claim_symbols_symbol ON claim_symbols(symbol_id);
CREATE INDEX idx_symbols_name ON symbols(name);
```

Many-to-many between claims and symbols — a single claim frequently
references multiple symbols (e.g., "OrderProcessor and BaseProcessor
must be idempotent"). Empirically confirmed during extraction testing.

In addition to the three query tables above, the storage layer persists
three artifact-metadata tables so that atlas.json round-trip through
SQLite is lossless (ADR-06 requires this):

```sql
CREATE TABLE _meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);  -- internal schema version bookkeeping

CREATE TABLE atlas_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);  -- top-level atlas.json fields: version, generated_at, generator.*

CREATE TABLE source_shas (
  source_path TEXT PRIMARY KEY,
  source_sha  TEXT NOT NULL
);  -- SHA of each prose doc that fed extraction (ADRs, READMEs)
```

`source_shas` is deliberately a separate concept from the `file_sha`
column on `symbols`: the former tracks prose documents consumed by the
extraction pipeline (used for "has this ADR changed since last
extraction?"); the latter tracks code files enumerated by the language
adapter (used for "has this source file changed since last symbol
listing?"). Distinct invalidation triggers, distinct storage.

### Sync model between artifacts

- **atlas.json → index.db:** AtlasImporter reads the committed JSON
  and inserts records into SQLite. Idempotent — running it on a fresh
  SQLite and on an existing one both produce the same final state.
- **index.db → atlas.json:** AtlasExporter serializes SQLite state to
  deterministic JSON. Lossless — round-tripping atlas.json through
  SQLite back to atlas.json produces a byte-identical file.

Both directions must preserve all data. Any loss of fidelity in either
direction would cause the committed atlas to drift from reality across
team members.

### The "committed: false" escape hatch

Not every team can or wants to commit the atlas. Regulated environments,
internal-only codebases, and teams with other preferences may set
`atlas.committed: false` in their config. In this mode:

- No atlas.json is produced
- Every team member runs full extraction independently
- No cross-developer consistency guarantees
- No zero-cost onboarding

This is the degraded mode, but it's a supported degraded mode. The
system must work correctly under both settings.

## Language Adapter Interface

Adapters are plugins. Each implements a consistent interface so new
languages can be added without modifying core.

```typescript
interface LanguageAdapter {
  language: string;                    // "typescript", "python"
  extensions: string[];                // [".ts", ".tsx"]

  // Enumerate all exported symbols in a file
  listSymbols(filePath: string): Promise<Symbol[]>;

  // Get full definition details
  getSymbolDetails(symbolId: string): Promise<SymbolDetail>;

  // Find all references to a symbol
  findReferences(symbolId: string): Promise<Reference[]>;

  // Get diagnostics for a file
  getDiagnostics(filePath: string): Promise<Diagnostic[]>;
}
```

**Shipped in v0.1:** TypeScript (via typescript-language-server) and
Python (via Pyright, [ADR-13](docs/adr/ADR-13-python-adapter-pyright.md)).

**Shipped in v0.2:** Go (via `gopls`,
[ADR-14](docs/adr/ADR-14-go-adapter-gopls.md)) — three-language
baseline established. ADR-14 documents the gopls-specific runtime
prerequisites (PATH-resolved `go` binary, length-matched
`workspace/configuration` response) and structural decisions
(receiver-encoded struct method names preserved verbatim, interface
methods flattened with `parent_id` back-pointer, iota const block
members surfaced as flat top-level constants).

**Future (by demand):** .NET (OmniSharp), Java (Eclipse JDT LS), Rust
(rust-analyzer). Each is a separate contributor-friendly surface
because the adapter interface is stable.

## Scope Gates (MVP)

**In scope:**
- TypeScript and Python language adapters
- All three MCP tools: `get_symbol_context` (primitive),
  `find_by_intent` and `impact_of_change` (thin composites over the
  primitive)
- ADR + README + markdown docs as intent sources
- Markdown with YAML frontmatter as the ADR convention
- SQLite-backed index with SHA-based incremental reindex
- **Committed atlas.json ↔ local index.db sync** (import on startup,
  export after reindex; see ADR-06)
- Compact and JSON output formats
- Per-repo config file
- Git integration (recent commits, co-change analysis for
  `impact_of_change`, hot/cold indicator)

**Out of scope for MVP:**
- Additional language adapters beyond TS/Python
- Cross-repo symbol resolution
- Monorepo workspace awareness
- Embedding-based semantic search (`find_by_intent` uses text matching
  for MVP; embeddings reconsidered post-hackathon if benchmarks warrant)
- Query logging and hot-path pre-computation (v0.6+ per ROADMAP —
  record query patterns, then act on them)
- Web UI or visualization
- VS Code extension

**Deliberately deferred:**
- Adapters beyond v0.2's Go addition: Rust, .NET, Java (v0.3+ by
  demand — see [ROADMAP.md](ROADMAP.md))
- Non-markdown intent formats (RST, asciidoc, etc.)
- Graph clustering and architectural visualization

### Scope-gate philosophy

MVP includes all three tools because they share substrate — the
primitive (`get_symbol_context`) does the substantive work, and the
two composites reuse the same index, extraction output, and symbol
resolution. Shipping one tool understates the architecture; shipping
three tools makes the three access patterns (lookup, search,
blast-radius) unmistakable to anyone evaluating the tool.

The composites use the simplest possible implementations: SQL text
matching for `find_by_intent`, direct composition with git log for
`impact_of_change`. No new infrastructure, no embeddings, no separate
subsystems. If the primitive is solid, the composites are thin
shells over it.

A day-4 scope gate in CLAUDE.md enforces the discipline: if the
primitive is not rock-solid by end of day 4, do not proceed to the
composites. Protect the primitive at all costs.

## Performance Characteristics

Empirical numbers from extraction testing on production-grade ADRs:

| Metric                              | Value                    |
|-------------------------------------|--------------------------|
| Parse success rate                  | 100% (12 of 12 tested)   |
| Average claims per ADR              | 14.1                     |
| Severity distribution (hard/soft/context) | 59% / 10% / 32%    |
| Extraction latency per ADR          | 25-35 seconds            |
| Extraction cost per ADR (substantial) | $0.24-0.31             |

**First-index cost model:**

| Repo size                | Estimated cost   | Wall-clock       |
|--------------------------|------------------|------------------|
| Small (5 short ADRs)     | ~$0.30           | 1-2 minutes      |
| Medium (10 mixed ADRs)   | $1-2             | 3-5 minutes      |
| Large (20 substantial ADRs) | $5-7          | 8-12 minutes     |

**Incremental reindex cost:** < $0.50 for typical day-to-day changes (1-2
files touched). SHA-based invalidation ensures no wasted work.

**Query-time cost:** Zero LLM calls. Pure SQLite lookups + LSP queries.
Sub-100ms per `get_symbol_context` call on typical hardware.

## Benchmark Methodology (Summary)

Full methodology in RUBRIC.md. Brief outline:

- **Targets:** honojs/hono (TypeScript, 186 source files), encode/httpx
  (Python, 23 source files), spf13/cobra (Go, 19 source files). Three
  external targets establish the cross-language baseline; ContextAtlas
  itself is dogfooded during development but is not part of the
  measured matrix.
- **Prompts:** 24 prompts across 6 task buckets (localize, trace,
  understand constraints, impact analysis, bug hypothesis, implement
  within constraints).
- **Axes:** Efficiency (tool calls, tokens, wall-clock) + Correctness
  (task success, constraint violations, hallucinations) + Confidence
  (calibration).
- **Fairness:** Same model version both sides. Blind manual grading.
  Three runs per prompt, medians reported. Pre-registered rubric.

## Risks and Open Questions

**Risk: Extraction time affects demo flow.** 10-minute first-index on a
large repo is too long to run live in a demo. Mitigation: pre-index demo
repos in advance; show cached results during live demo; clearly label
indexing as "one-time cost, runs in background."

**Risk: Symbol resolution edge cases.** Python classes with the same name
in different modules; TypeScript method overloads; files with both default
and named exports. Mitigation: MVP uses simple exact-match-with-file-hint;
ambiguous cases return all candidates.

**Risk: Prompt changes with model updates.** The extraction prompt is
tuned for current Opus 4.7 behavior. Future model versions might produce
different output shapes. Mitigation: version the prompt, log extraction
output for regression review, lock model string in config.

**Open: Stale indexes after aggressive refactors.** A rename from
`OrderProcessor` to `PaymentProcessor` invalidates every claim keyed
to the old name. Incremental reindex catches the file change but the
claim→symbol binding is stale until reindex completes. Acceptable for
MVP; worth surfacing in docs.

**Open: Scaling to very large repos.** 1000+ file codebases will push
first-index cost toward $20-50 and extraction time toward hours. Likely
need chunked extraction and partial re-runs. Out of MVP scope; track as
v2 concern.

## References and Related Work

- **Graphify** — Knowledge graph approach over codebases. Complementary,
  not competitive. ContextAtlas is LSP-grounded and intent-keyed;
  Graphify is embedding-adjacent and broader-scoped.
- **LSP-AI, lsp-skill** — LSP-as-MCP projects. ContextAtlas layers on
  this idea with architectural intent as a distinct signal source.
- **claude-mem, engram, anamnesis** — Session-memory tools. Different
  problem (conversational continuity) from ContextAtlas's architectural
  grounding. Complementary.

---

## Versioning

This document tracks the shipped architecture; v0.1 + v0.2 shipped
(2026-04-25). Material changes to the tool interface, storage schema,
or config schema bump the minor version. Atlas schema versioning is
additive within minor versions (v0.2 bumped 1.1 → 1.2; v0.3 bumped
1.2 → 1.3 to add `generator.contextatlas_commit_sha`, all following
ADR-11's pattern). Per-version release notes start with v0.3;
v0.1 + v0.2 historical record lives in
[`STEP-PLAN-V0.2.md`](STEP-PLAN-V0.2.md) progress logs and the
benchmarks-repo Phase 5/6/7 synthesis docs.
