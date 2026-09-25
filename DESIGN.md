# ContextAtlas: Design Document

**Status:** v0.9.0 shipped 2026-05-16; v1.0 public launch substrate
complete. Five-language baseline (TypeScript / Python / Go / Ruby /
C#); three-language benchmark substrate (hono / httpx / cobra)
validated via Phase 5–10 reference runs in the
[benchmarks repo](https://github.com/traviswye/ContextAtlas-benchmarks).
Architectural reference, not a scope document — cycle-by-cycle
narrative at [`docs/release-history.md`](docs/release-history.md);
version-arc context in [`ROADMAP.md`](ROADMAP.md); current-cycle
anchor at [`v1_1-HANDOFF.md`](v1_1-HANDOFF.md).
**Last Updated:** 2026-06-09
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
BM25 only re-orders, never filters. **Two-layer gating:** flag-off
falls back to v0.2 deterministic ordering (severity → source →
claim_id), preserving byte-equivalence. Query-absent activation
closed at v0.8 Ship 1 (`ab38f54`) via handler-side
`args.query ?? symbol.name` synthesis — when the flag is on and no
explicit query is provided, the symbol name itself becomes the BM25
query, surfacing the most-relevant-to-this-symbol claims first.
This closed the v0.3-era dormancy gap (shipped substrate but
inactive in practice without callers passing `query`). Multi-symbol
mode applies the same query (or per-symbol synthesized fallback)
uniformly to every symbol in the batch per ADR-15 §3 uniform-options
rule.

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
| `go`           | `go`       |
| `ruby`         | `rb`       |
| `csharp`       | `cs`       |

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
  - go
  - ruby
  - csharp
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
extraction:                              # optional; every key optional
  budget_warn_usd: 1.50                  # USD warn threshold (v0.2 Stream A #2)
  narrow_attribution: drop               # claim-attribution rule (v0.3 Fix 2)
  exclude_pattern:                       # extra source-walk excludes (v0.4 A4)
    - "**/generated/**"
  commit_message_filter:                 # extra commit-filter regexes (v0.4)
    - "^perf[:(]"
  streams: [adr, docstring, commit]      # streams `index` extracts (v1.2)
mcp:                                     # optional; v0.3 query-time knobs
  symbol_context_bm25: true              # BM25 ranking on get_symbol_context (ADR-16)
```

Required: `version` (must be `1`), `languages`, and `adrs` with
`adrs.path`. `docs`, `git`, `index` and `atlas` fall back to the
values shown above when omitted (`adrs.format` defaults to
`markdown-frontmatter`; `adrs.symbol_field` has no default).
`extraction` and `mcp` are optional, and so are `source` (ADR-08),
`observability` (ADR-20), `lsp` and the deprecated `architecture`.
Unknown keys are errors (ADR-05); the one exception today is `lsp`,
whose unknown sub-keys are ignored. No inheritance, no
workspaces, no cross-repo refs. MVP-scoped deliberately. See ADR-06
for the atlas committed/local-cache split.

(Until 2026-09-25 this paragraph read "Seven sections required
(`extraction` is optional)". The first parser, `ba2e58c`, had exactly
those seven top-level keys, but only `version`, `languages` and `adrs`
have ever been required.)

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
  progress log](docs/cycles/v0_3/STEP-PLAN-V0.3.md). The "Absent (default)" semantics
  above describe the pre-Step-7 schema; the Step 7 decision flips
  the absent-value behavior to `drop-with-fallback`-equivalent.
  The `off` opt-out this paragraph used to announce for
  v0.2-equivalent attribution (`extraction.narrow_attribution: off`)
  was never implemented. As shipped (checked 2026-09-25): the parser
  accepts only `drop` and `drop-with-fallback`; an absent value
  behaves as `drop-with-fallback`; and the v0.2 baseline, which merged
  frontmatter symbols into every claim, is not reachable from config.
  Pattern 2 retention applies to the `drop` vs `drop-with-fallback`
  axis.

  **Narrowing risk (post-Step 7 default-on caveat).**
  `drop-with-fallback` recovers zero-symbol cases but does NOT
  recover partial-loss cases. Concrete example: claim X attaches
  to {A, B, C, D, E} under v0.2 attribution. Under
  `drop-with-fallback` default-on, X now attaches to {A, B} only.
  The missing {C, D, E} aren't recovered because the fallback rule
  fires only when a claim resolves to zero symbols; X still
  resolves to ≥1 symbol so fallback doesn't trigger. No config value
  restores full v0.2 attribution (see above). Step 5 spot-check evidence
  (main-repo `b025d3d`; benchmarks `68e3d1e`) measured this
  trade-off as net-positive on the p4-stream-lifecycle cell;
  Stream D Step 14/15 re-measures at scale.
- **`exclude_pattern`** (v0.4 Step 2, A4). Glob patterns (minimatch,
  repo-relative) added to the per-language default excludes when the
  source tree is walked; the defaults always apply (augment-only).
  Excluded files get no symbols. Their docstring keys and claims are
  removed while the docstring stream is enabled, and kept frozen while
  it is disabled (see `streams` below).
- **`commit_message_filter`** (v0.4 Stream A). Regex patterns
  (case-insensitive) added to the default commit filter. They are
  tested against the subject plus the first 200 characters of the
  body; the defaults always apply (augment-only).
- **`streams`** (v1.2 Phase 2; ADR-05 2026-09-25 amendment). Which
  claim streams `contextatlas index` extracts: `adr` (ADRs **and**
  `docs.include` files), `docstring`, `commit`. Absent means all
  three. Order does not matter; the streams run adr → docstring →
  commit. The list must not be empty and must include `adr`; unknown
  values and duplicates are errors. A disabled stream's existing
  claims are kept, frozen, and `contextatlas doctor` warns about
  them. `contextatlas list-extraction-sources` honours the key too.

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

**Reasoning effort.** We use Opus 4.7 at default effort for the
`contextatlas index` extraction path (claim extraction from ADRs,
docstrings, and filtered commit messages). Opus 4.7's extended
thinking API (`thinking.type: "adaptive"` + `output_config.effort`)
was tested and deferred for extraction: on production-grade ADRs,
default effort produced valid JSON with accurate severity
classification on every claim across 12 documents tested. This
keeps extraction cost at the $0.25 per substantial ADR envelope
rather than multiples of that.

The `contextatlas generate-adrs` path (v0.7) uses different reasoning
discipline. ADR generation is the foundational substrate the entire
atlas builds on — atlas quality is bounded by ADR quality. Per the
deliberate quality-cost trade-off in CLAUDE.md "Generation cost
framing," the CLI generate-adrs path uses adaptive thinking at
`xhigh` effort (`thinking: { type: "adaptive" }` +
`output_config: { effort: "xhigh" }`, streamed via
`messages.stream().finalMessage()`, `max_tokens` 64000 shared by
thinking and the ADR JSON) to support investigative-
depth-per-decision-candidate workflow with canonical depth-floor
mechanical enforcement via `validate-adrs`. This re-expresses v0.7
Step 2.4.a β-1 (extended thinking, 32k `budget_tokens`), which
claude-opus-4-7 rejects with HTTP 400; see the ADR-02 2026-09-24
amendment. The Skill `/generate-adrs` path runs at the same xhigh
effort level via Claude Code's session-bounded reasoning (SKILL.md
frontmatter pin). Generation cost expectation: $5-15 per repo,
one-time. See ADR-02 v0.7 amendment for the substrate-equivalence
framing across both paths.

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

Exceptions (v1.2 Phase 2 review fixes; `atlas-baseline.ts`):
- **An unfinished run.** Each run records, in the local cache only,
  the SHA-256 of the atlas.json it started from and clears the record
  when it finishes. If a run was interrupted (each unit is stored in
  the cache as soon as it is extracted, but atlas.json is written only
  at the end) and atlas.json has not changed since, the next run still
  imports atlas.json, then carries over the units the interrupted run
  stored: the keys whose SHA differs from atlas.json's, with their
  claims (`unsaved-work.ts`). A commit is carried only when HEAD
  reaches it, and a file's unit only while the working tree still has
  that content (a reverted WIP edit or a deleted scratch file is left
  to atlas.json). The cache-only key-stream records go back to their
  state when the interrupted run started. The run then extracts only
  what is left and exports. What the interrupted run deleted or pruned
  is not carried: this run recomputes it against the current tree and
  config. Nor is a unit whose SHA equals atlas.json's: an interrupted
  `index --full` re-extraction of unchanged files is lost, and another
  `--full` bills it again. The mark also records the process that set
  it (`run-owner.ts`, round 2.3), so the MCP server can tell a running
  `index` from one that died (see "index.db — local derived cache").
- **`atlas.committed: false`.** The cache is the source of truth, so a
  leftover atlas.json only seeds an empty cache (the rule the MCP
  server and the init smoke test share: no symbols, claims or source
  keys) and is otherwise ignored with a warning. Such a run changes the
  cache without writing atlas.json, so it drops the cache's record of
  which atlas.json it holds (`index.key_streams_atlas_sha256`; so does
  a committed run with no atlas.json until Stage 7 writes one, round
  2.3): after a switch back to `committed: true` the next import, and
  the MCP server, treat the cache as holding no atlas.json.
- **`atlas.committed: true` and no atlas.json.** The cache is the
  baseline, and the run writes atlas.json even if nothing changed. The
  gitignored cache survives a branch switch, so commits it extracted
  that git knows but HEAD does not reach (another branch) are dropped
  first.

**Retries (v1.2 Phase 2 review round 2.3).** A prose or docstring
file that is not stored (a call that threw, an unparseable response, a
failed read or write) keeps its claims and key and is recorded in a
cache-only retry list (`retry-keys.ts`); the next run extracts it
whatever its key says, until it is stored. Without the list a failure
under `--full`, where the key already names the file's current
content, was never retried by a plain run.

**Per-stream baseline and structural refresh (v1.2).** `source_shas`
holds keys for three claim streams:
- prose: ADR/doc relPaths;
- docstring: source-file relPaths;
- commit: `commit:<sha>`. Until v1.2 Phase 2 the `/index-atlas` Skill
  wrote the bare sha instead; readers accept both forms, and every
  `contextatlas index` migrates bare keys (and their claims'
  `source_path`) to `commit:<sha>`.

Every `contextatlas index` run:
- **Classifies** each baseline key by the `source` prefix of its
  claims. A zero-claim key uses the stream this cache recorded writing
  it (prose or docstring, while the key still holds that SHA; a
  cache-only record, v1.2 Phase 2 review fix), then the prose walk,
  then the key's shape.
- **Diffs** only the prose keys against the prose walk.
- **Applies one deletion rule per stream:**
  - a prose key goes when the prose walk no longer produces it;
  - a docstring key goes when its source file is gone from disk, or
    (v1.2 Phase 2, while the docstring stream runs) when the file is
    no longer walked and a configured adapter owns its extension;
  - a commit key is never deleted.
- **Prunes stale symbols** after upserting the fresh LSP inventory.
  Pruned: symbols of deleted or newly excluded files, and symbols a
  listed file no longer contains. Kept: symbols of files whose listing
  failed, or whose language is not configured.
- **Keeps orphaned claims.** Pruning removes the claim-symbol links; a
  claim left with no link stays in the atlas and is reported as
  orphaned.

A run that prunes or deletes anything re-exports `atlas.json`; a run
that changes nothing leaves it byte-identical. `contextatlas
resolve-symbols` (Skill path) applies the same prune rules and drops
claim links to symbols that no longer exist. See the ADR-12
2026-09-24 amendment for the rules and the stage-by-stage stream
table.

**Three-stream extraction (v1.2 Phase 2).** `contextatlas index`
extracts every stream `extraction.streams` enables (default: all
three), in the order prose → docstring → commit. Each stream has its
own re-extraction gate:
- **prose:** a file is re-extracted when its SHA differs from its key.
- **docstring:** a source file is re-extracted when its SHA differs
  from its key. It makes one call per exported symbol with a
  non-empty docstring. Its claims are replaced, and the key moved, only
  when every call for the file succeeded; otherwise it keeps its old
  claims and key and is retried next run. A file with no documented
  exported symbol is keyed with no claims.
- **commit:** a filter-passing commit is extracted once, when no key
  exists for it; commits are immutable.

`--full` bypasses the prose and docstring gates, not the commit gate.
Before the first model call the run prints a cost estimate to stderr.
Library callers of `runExtractionPipeline` that do not pass
`deps.streams` get prose only. See the ADR-12 2026-09-25 amendment
for the stage table, failure semantics and summary keys.

### Two-paths extraction architecture (v0.7+)

The extraction pipeline above describes the canonical pipeline as a
single execution flow. At v0.7,
[ADR-02](docs/adr/ADR-02-extraction-sole-api-caller.md) graduated and
re-amended to support **two substrate-equivalent entry points** to
the same pipeline, accommodating two distinct cost models.

**CLI path** (`contextatlas index`, `contextatlas generate-adrs`).
Anthropic API direct; pay-per-use via `ANTHROPIC_API_KEY`. Suitable
for CI/CD integration, automated atlas refresh, and non-Claude-Code
agent integration. Cost model: ~$0.20–1 per incremental refresh;
~$5–15 per repo for first-time `generate-adrs` scaffolding (the
deliberate quality investment documented in CLAUDE.md "Generation
cost framing").

**Skills path** (`/index-atlas`, `/generate-adrs`, `/prime-atlas`).
Subscription-bounded; runs under the user's Claude subscription.
No separate API key required; no per-call API billing. Suitable for
Claude Code–only workflows with zero-friction setup. Skills load
the canonical prompts (`EXTRACTION_PROMPT`, `GENERATE_ADRS_PROMPT`)
from build-time artifacts at `.contextatlas/prompts/`, ensuring
substrate equivalence with the CLI path.

**Substrate equivalence enforcement.** Both paths produce identical
atlases. Mechanical validation gates at both surfaces enforce this:

- `contextatlas validate-atlas` — atlas.json schema validation
  against the canonical AtlasFileV1 v1.4 schema; non-canonical
  atlases fail loudly with specific remediation. Mandatory workflow
  gate for the `/index-atlas` Skill.
- `contextatlas validate-adrs` — depth-floor canonical-shape
  validation on generated ADRs. Mandatory workflow gate for
  `generate-adrs` at both CLI and Skill surfaces (v0.7 Step 2.4.a
  β-2 auto-invoke).
- `contextatlas validate-extraction` — extraction depth-floor
  (≥8 claims per ADR; ≥1 claim per source) and source-coverage
  validation.
- `contextatlas resolve-symbols` — LSP bridge resolving extraction-
  stage symbol candidates to canonical symbol IDs. Local LSP
  subprocess only; zero API cost.

**Why two paths.** The frozen-prompt invariant locks the **substrate
value** (prompt text, severity taxonomy, output schema, model
choice) per ADR-02; the **load mechanism** evolves. CLI imports the
canonical prompt constant directly from `src/extraction/prompt.ts`;
Skills load via the Read tool against `.contextatlas/prompts/*.md`
artifacts generated at build time by
`scripts/generate-prompt-artifacts.mjs`. Both paths ship the same
substrate — the difference is the entry surface and cost model,
not the value extracted.

The substrate-equivalence claim was empirically validated across
v0.7.1 + v0.7.2 + v0.7.3 substep ships at v0.8 cycle: Skill atlases
land at 65–83% of CLI claim count across hono / httpx / cobra
benchmarks, with depth-floor ≥8 ADRs preserved at both substrates.
See v0.8 cycle outcome in ROADMAP.md for the empirical detail.

## Atlas as Team Artifact

ContextAtlas produces two artifacts with different lifecycle roles:

### atlas.json — committed team artifact

Human-readable JSON, committed to the repo alongside source code and
ADRs. This is the canonical team-wide knowledge base. It's what new
contributors inherit when they clone the repo.

Schema:

```jsonc
{
  "version": "1.4",
  "generated_at": "2026-05-16T12:00:00Z",
  "generator": {
    "contextatlas_version": "0.9.0",
    "contextatlas_commit_sha": "a1b2c3d4e5f6...",
    "extraction_model": "claude-opus-4-7"
  },
  "source_shas": {
    "docs/adr/ADR-01.md": "abc123...",          // prose: file SHA
    "docs/adr/ADR-02.md": "def456...",
    "src/orders/processor.ts": "0a1b2c...",     // docstring: file SHA
    "commit:a1b2c3d4...": "a1b2c3d4..."         // commit: the commit SHA
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
      "source": "adr:ADR-07-idempotency.md",
      "source_path": "docs/adr/ADR-07-idempotency.md",
      "source_sha": "ghi789...",
      "severity": "hard",
      "claim": "must be idempotent",
      "rationale": "...",
      "excerpt": "...",
      "symbol_ids": ["sym:ts:src/orders/processor.ts:OrderProcessor"],
      "symbol_candidates": ["OrderProcessor"]
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
- **Atlas schema v1.4 (v0.7 Step 2.3.a.1).** Canonical AtlasFileV1
  schema enforcement substrate landed at v0.7. Same additive-bump
  pattern as 1.0 → 1.1 (git signal) and 1.2 → 1.3
  (`contextatlas_commit_sha`) — v1.3 and earlier atlases import
  cleanly; mechanical validation via `contextatlas validate-atlas`
  enforces canonical shape at the CLI boundary and as a mandatory
  workflow gate for the `/index-atlas` Skill.
- **Claim `source` field format.** Identifies where the claim was
  extracted from. Three shapes:
  - **Markdown intent** (ADRs, design docs) — `"adr:<basename>"`
    (e.g., `"adr:ADR-07-idempotency.md"`), for files under
    `adrs.path` and `docs.include` alike. CLI atlases from before
    v0.7.2 carry a bare identifier instead (e.g., `"ADR-07"`,
    `"DESIGN"`); readers accept both.
  - **Structured docstrings** extracted from source code (v0.3
    Stream B) — `"docstring:<path>"` (e.g.,
    `"docstring:src/orders/processor.ts"`).
  - **Commit-message intent** (v0.4 Stream A) — `"commit:<sha>"`
    (e.g., `"commit:a1b2c3d4..."`). Architectural-intent claims
    extracted from filtered git commit messages. User augmentation
    via `extraction.commit_message_filter` config array. Historical
    note: v0.4 gated per-repo integration of this stream on a "Q3"
    threshold (≥30 claims/repo on at least 2 of 3 repos AND any
    single repo above 50). `scripts/dogfood-extract.mjs` acted on it
    by deleting a repo's commit claims below 30, and so did a one-off
    benchmarks-repo script at v0.4 Step 5.7
    (`scripts/v0.4-step5-q3-bifurcated-drop.mjs`), which removed the
    commit claims from the committed cobra and httpx atlases; the
    benchmarks driver (`extract-benchmark-atlas.mjs`) only reports
    it. v1.2 Phase 2 dropped it: the CLI
    `index` extracts filtered commits whenever the `commit` stream
    is enabled, and `extraction.streams` is the off switch.

  All three forms carry `source_path` + `source_sha` for
  provenance; for commit-message claims, `source_path == source`
  and `source_sha == commit SHA`. The commit key form
  `commit:<sha>` is canonical on both extraction paths from v1.2
  Phase 2 (for `source`, `source_path` and the `source_shas` key).
  Skill-built atlases from before then used the bare sha as
  `source_path` and key; `contextatlas index` migrates them, and
  `validate-atlas` warns about them.
- **`symbol_candidates` (atlas schema v1.4, optional).** The raw
  symbol names the extraction model proposed for a claim, before
  resolution to `symbol_ids`. Kept so symbols can be re-resolved
  later without a model call (`contextatlas resolve-symbols`).
  Emitted after `symbol_ids`, in the order stored, and omitted when
  empty. The local cache has stored it since v1.2 Phase 2 (cache
  migration 6), so a CLI `index` no longer strips it, and CLI
  extraction writes it for all three streams. For docstring claims
  the CLI records only the model's candidates; the documented symbol
  is identified by its exact id in `symbol_ids`. The field is
  index-time data only: MCP tool output never includes it.

### index.db — local derived cache

SQLite binary, gitignored, never committed. This is the query-time
performance layer — fast joins, indexed lookups, compact storage.
Every developer has their own index.db; it's rebuilt from atlas.json
on demand. With `atlas.committed: true` the MCP server imports
atlas.json at startup whenever it differs from the file the cache last
imported or wrote (a pull, an `/index-atlas` refresh), except while an
`index` run over the cache is still running or the file cannot be
imported (then it serves the cache as it stands, with a warning); a
mark left by a run that died does not hold the import off (the mark
names its process; a run on another host counts as running). With
`committed: false` it only seeds an empty cache, and warns when
atlas.json differs from what the cache holds (v1.2 Phase 2 review
rounds 2.2 and 2.3; `server-cache-load.ts`). The server loads
atlas.json only at startup: after an `/index-atlas` refresh the user
restarts Claude Code or reconnects the server (`/mcp`).

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
- The local cache is the baseline. An atlas.json left over from
  `committed: true` seeds an empty cache once and is otherwise
  ignored, with a warning to delete it (v1.2 Phase 2 review fix;
  before, `index` imported it on every run and re-extracted everything
  newer than it)

This is the degraded mode, but it's a supported degraded mode. The
system must work correctly under both settings.

## Language Adapter Interface

Adapters are plugins. Each implements a consistent interface so new
languages can be added without modifying core.

```typescript
interface LanguageAdapter {
  language: string;                    // "typescript", "python", "go", "ruby", "csharp"
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

**Shipped in v0.9:** Ruby (via `ruby-lsp` + optional
`ruby-lsp-rails`, [ADR-21](docs/adr/ADR-21-ruby-adapter-ruby-lsp.md))
— four-language baseline established at v1.0 launch. ADR-21
documents the ruby-lsp-specific decisions: pull-model diagnostics
(`textDocument/diagnostic` requests rather than push notifications,
per LSP 3.17); dual-install pattern (Rails-detected bundler vs
direct gem install); declaration-parse fallback for type
relationships; graceful rails-boot degradation when `ruby-lsp-rails`
is unavailable. Ruby 3.3+ required, 4.0+ recommended.

**Shipped in v1.1:** C# / .NET (via `csharp-ls`, a Roslyn LSP
wrapper, [ADR-22](docs/adr/ADR-22-csharp-adapter-roslyn.md)) —
five-language baseline established at v1.1.0. ADR-22 documents the
csharp-ls-specific decisions: pull-model diagnostics
(`textDocument/diagnostic` requests parallel to ruby-lsp); File-
kind-1 wrapper skip at documentSymbol top level (C#-specific Roslyn
shape); Roslyn-overload-disambiguation symbol name convention
(parameter list encoded into method names); native Windows PATH
enrichment for `%USERPROFILE%\.dotnet\tools`. .NET SDK 8 minimum,
10+ recommended.

**Future (by demand):** Java (Eclipse JDT LS), Rust (rust-analyzer),
Kotlin (kotlin-language-server). Each is a separate contributor-
friendly surface because the adapter interface is stable — see
[ROADMAP.md](ROADMAP.md) §v1.1+ priorities for the post-launch
adapter-expansion direction.

## Scope Gates (as of v1.0)

**In scope:**
- TypeScript, Python, Go, Ruby, and C# / .NET language adapters
- All three MCP tools: `get_symbol_context` (primitive),
  `find_by_intent` and `impact_of_change` (thin composites over the
  primitive)
- ADR + README + markdown docs + docstrings + filtered commit
  messages as intent sources
- Markdown with YAML frontmatter as the ADR convention
- SQLite-backed index with SHA-based incremental reindex
- **Committed atlas.json ↔ local index.db sync** (import on startup,
  export after reindex; see ADR-06)
- Compact and JSON output formats
- Per-repo config file
- Git integration (recent commits, co-change analysis for
  `impact_of_change`, hot/cold indicator)
- Two-paths extraction architecture per ADR-02 v0.7 amendment
  (CLI = Anthropic API direct; Skills = subscription-bounded;
  substrate-equivalent via mechanical validation gates)
- BM25 ranking on `get_symbol_context` (active at v0.8 per ADR-16
  amendment + Ship 1 handler-side synthesis)

**Out of scope at v1.0:**
- Cross-repo symbol resolution and multi-repo extraction (carried
  forward to v1.1+ per ROADMAP — ADR-05 amendment required)
- Codex / local LLM extraction (carried forward to v1.1+ per
  ROADMAP — ADR-02 amendment required)
- Embedding-based semantic search (`find_by_intent` uses FTS5 + BM25;
  embeddings remain post-launch evidence-gated per ADR-09)
- Query logging and hot-path pre-computation (post-launch enrichment
  per ROADMAP)
- Web UI or visualization
- VS Code extension

**Deliberately deferred (demand-driven):**
- Additional language adapters beyond TS / Python / Go / Ruby / C# —
  Rust, Java, Kotlin (v1.1+ priorities per ROADMAP;
  contributor-friendly surface per `docs/language-adapter-guide.md`)
- Non-markdown intent formats (RST, asciidoc, etc.)
- Graph clustering and architectural visualization

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

**Cost framings post-v0.2 (refinement layers):**

- **Platform-billed vs script-projected (v0.4 finding).** Script-
  reported extraction costs use full-token API pricing; actual
  platform-billed costs reflect prompt-cache discount on the
  `EXTRACTION_PROMPT` prefix. Empirical 3.0× reduction validated
  across three reference targets (cobra $5.44 → $1.82; httpx
  $5.53 → $1.85; hono $10.89 → $3.65). Treat projected costs as
  conservative upper bounds.
- **Generate-adrs cost framing (v0.7).** `contextatlas generate-adrs`
  is foundational substrate, not recurring cost — atlas quality is
  bounded by ADR quality. Expected cost: $5–15 per repo, one-time.
  Cost reflects deep investigation (extended thinking 32k budget on
  CLI; xhigh effort on Skill) plus canonical depth-floor enforcement.
  Deliberate quality-cost trade-off per CLAUDE.md "Generation cost
  framing."
- **Incremental refresh cost (v0.8 empirical).** Substantively
  cheaper than cold-start scaffolding. Typical incremental refresh
  $0.20–1 per run per ADR-12 SHA-diff substrate; unchanged ADR and
  docstring sources skip; only changed sources re-extracted.
- **Generate-adrs thinking configuration (v1.2 Phase 0).** The CLI's
  v0.7 32k thinking budget above is replaced by adaptive thinking at
  `xhigh` effort, the same effort level the Skill pins, because
  claude-opus-4-7 rejects `budget_tokens` (ADR-02 2026-09-24
  amendment). Thinking is no longer capped at 32k; it shares the
  whole 64000-token `max_tokens` with the ADR JSON. The $5–15 v0.7
  expectation has not been re-derived for this configuration: no
  live CLI `generate-adrs` run has been made on it yet, and the
  pre-flight estimator does not model thinking tokens.
- **Three-stream `index` (v1.2 Phase 2).** The first-index table above
  covers ADR prose only. `contextatlas index` now also makes one call
  per documented exported symbol and one per filter-passing commit,
  unless `extraction.streams` turns those streams off. On this
  repository a zero-API probe at `9d2bf4c` planned 479 calls (13 prose
  files, 461 docstring calls across 108 files, 5 commits); the
  run's own preview estimated $4.42 to $10.35. Each run prints such an
  estimate to stderr before its first model call. Later runs pay only
  for changed files and new commits.
- **Cost framing correction (2026-09-25).** The "Platform-billed vs
  script-projected" bullet above is very likely wrong about the cause.
  The v0.4 script costs were computed with `pricing.ts` constants of
  $15/$75 per million tokens, which v0.6 (`6c48078`) corrected to
  $5/$25: a factor of 3, which matches the observed 2.98–2.99 (two of
  the three platform figures were estimates). The extraction
  request has never sent `cache_control`, so no prompt-cache discount
  applied. Script-reported costs at the current $5/$25 are expected to
  track platform billing, not to run about 3× above it. Do not
  discount `cost_usd` or the `index` preview by 3×. See the CLAUDE.md
  "Extraction cost framing" correction.

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
- **Fairness:** Same model version both sides. Blind LLM-judge
  grading under paired-mode anonymization (per ADR-19 + Phase-9
  reference doc for v0.5 baseline + Phase-10 reference doc for
  v0.6 8-cell matrix-replication subset substrate); v0.5 uses
  n=5 trials per cell with paired-t cross-cell rollup at N=27
  differences per axis; v0.6 8-cell subset (5 v0.5 anchor cells
  + 3 v0.6 new tier-gradation test points × n=5 × 2 conditions
  = ~80 trials; DIVERGED 2-of-4 axes per Phase-10 §8 vs v0.5
  baseline; F1 PRIMARY atlas-substrate-version confound per
  Phase-10 §11). Pre-registered rubric per threshold pre-
  registration discipline.
- **v0.7 launch-bearing reframe.** v0.7 cycle reframed as launch-
  bearing not substrate-generation (Travis pivot at v0.6 Step 7.5);
  no new reference run substrate generated. v0.6 F1-F9 methodology
  amendments + matrix-completion gate + cross-vendor judge-panel
  graduation + cohort exposure execution carry forward to post-
  launch.
- **v0.8 Option B re-validation.** v0.5 efficiency paradigm
  re-validated at v0.8 substrate scale via 4-condition factorial
  (alpha + ca + beta + beta-ca; 8 intersection cells × n=3 trials
  = 96 trials; $39.40 platform-billed; fingerprint
  `d613f0ca1ea3d861`; atlas substrate SHA `826fd87`). At the
  alpha-vs-ca contrast (cleanest atlas-effect control): 5 of 6
  non-trick cells reduced tool-call count; 2 biggest wins (httpx/p1,
  hono/h5) at 50%+ reductions; 1 atlas-induced over-exploration
  case (cobra/c3) flagged for v1.1+ investigation. Full v0.5-rigor
  paired-t at v0.8 substrate is v1.1+ candidate per launch-bearing
  reframe.

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
(2026-04-25); v0.3 shipped (2026-04-28); v0.4 shipped (2026-04-29);
v0.5 shipped (2026-05-04); v0.6 shipped (2026-05-09); v0.7 shipped
(2026-05-12); v0.8 shipped (2026-05-14); v0.9 shipped (2026-05-16
— v1.0 launch substrate complete). Material changes to the tool
interface, storage schema, or config schema bump the minor version.
Atlas schema versioning is additive within minor versions (v0.2
bumped 1.1 → 1.2 for `parent_id`; v0.3 bumped 1.2 → 1.3 to add
`generator.contextatlas_commit_sha`; v0.7 bumped 1.3 → 1.4 for
canonical AtlasFileV1 schema enforcement substrate at Step 2.3.a.1;
v0.4 + v0.5 + v0.6 + v0.8 + v0.9 atlas schema unchanged within their
cycles — substrate-hardening, methodology, substrate-cohort-
infrastructure, substrate-equivalence + BM25 activation, and Ruby
adapter cycles respectively, all following ADR-11's additive-bump
pattern). Per-version release notes start with v0.3; v0.1 + v0.2
historical record lives in [`STEP-PLAN-V0.2.md`](docs/cycles/v0_2/STEP-PLAN-V0.2.md)
progress logs and the benchmarks-repo Phase 5/6/7 synthesis docs;
v0.3–v0.9 cycle narrative at [`docs/release-history.md`](docs/release-history.md).
