# ContextAtlas

**An MCP server that gives Claude Code a curated atlas of your codebase
— fusing LSP-grade structure, architectural intent from your ADRs and
docs, git history, and test associations into single-call context bundles.**

---

## The Problem

Claude Code currently learns your codebase by brute force. Every session
starts fresh. Every "where is X?" triggers multiple grep calls. Every
"what depends on Y?" is another flurry of file reads. On a mid-sized
codebase, answering a single architectural question can consume 40+ tool
calls and 100,000+ tokens before Claude has enough context to reason
well.

Worse: the architectural intent that governs your code — the ADRs, the
design decisions, the "we did it this way because" — is invisible to
Claude. The rule that OrderProcessor must be idempotent lives in
`docs/adr/`. When Claude proposes a change, it has no way to know that
constraint exists.

ContextAtlas closes both gaps through **signal fusion**. Every bundle
Claude receives combines four independent signals about a symbol:

1. **Structural data** from the language server — definition, references,
   types, diagnostics. Compiler-grade precision.
2. **Architectural intent** from your ADRs, READMEs, and design docs —
   structured claims extracted by Opus 4.7 at index time, keyed to
   specific code symbols.
3. **Historical context** from git — recent commits touching the symbol,
   hot/cold indicators, co-change patterns.
4. **Test associations** — which tests reference the symbol, where
   coverage lives.

One MCP call returns all four, fused. No ADRs in your repo yet? You
still get LSP + git + tests in one call instead of fifteen — a
meaningful baseline improvement. Add ADRs and the bundles get richer.
The architecture is designed so any subset of signals produces value.

## Who This Is For

ContextAtlas is built for the average developer using Claude Code on
real codebases — not just engineers at large orgs working on
500,000-file monorepos. Most developers work on projects in the 20 to
300 file range: side projects, startup products, internal tools, mid-sized
open-source libraries. That's the codebase shape ContextAtlas targets.

Token-burn reduction scales with codebase size — on a 200-file framework,
it's dramatic; on a 30-file library, it's modest. But **architectural
intent capture is size-invariant**. A 30-file library can have meaningful
architectural decisions worth surfacing, and Claude respecting them
matters just as much as on a larger codebase. ContextAtlas is built to
help on both.

## How It Works

ContextAtlas runs as an MCP server alongside Claude Code. At index time,
it reads your codebase and your architectural documentation, then builds
a structured atlas:

- **Symbols and structure** from the language server (TypeScript or
  Python): definitions, references, types, diagnostics.
- **Architectural intent** extracted from your ADRs, READMEs, and design
  docs by Opus 4.7, producing structured claims keyed to the specific
  symbols they govern.
- **Recent history** from git: which symbols have been touched, which
  commits matter, which parts of the code are hot.

At query time, Claude calls `get_symbol_context(symbol)` and gets
everything about that symbol in a single response — definition,
references, governing ADR constraints, recent commits, related tests —
in a dense format optimized for LLM consumption.

One call. What would otherwise take 10-15 tool calls.

## Quick Example

Given an ADR stating that `OrderProcessor` must be idempotent, a call
to `get_symbol_context("OrderProcessor")` returns:

```
SYM OrderProcessor@src/orders/processor.ts:42 class
  SIG class OrderProcessor extends BaseProcessor<Order>
  INTENT ADR-07 hard "must be idempotent"
    RATIONALE "All order processing must be safely retryable."
  INTENT ADR-12 soft "prefer async base class for new processors"
  REFS 23 [billing:14 admin:9]
    TOP ref:ts:src/billing/charges.ts:88
    TOP ref:ts:src/admin/orders.ts:12
  GIT hot last=2026-03-14
    RECENT "Fix idempotency bug in retry path" a3f2c1d
  TESTS src/orders/processor.test.ts (+11)
```

Now when Claude is asked to modify `OrderProcessor`, it sees the
idempotency constraint *before* proposing changes — not after a user
review catches the violation.

## How Teams Use It

ContextAtlas produces a **committable team artifact** — `atlas.json` —
that lives in the repo alongside your code and ADRs. This is the piece
that turns ContextAtlas from a personal productivity tool into a team
asset.

**When a new team member clones the repo:**
They pull down `atlas.json` along with everything else. On first run,
ContextAtlas imports the committed atlas directly into their local
cache — no extraction API calls, no 10-minute wait. They're productive
from the moment they open Claude Code.

**When a contributor submits a PR:**
If their code change affects architectural claims, they regenerate
`atlas.json` as part of their commit. Reviewers see both the code
change and the atlas diff in the PR, making it obvious how the change
interacts with architectural intent.

**When a developer bounces between machines:**
Their atlas state is version-controlled, not trapped on one laptop.
Laptop A committed atlas updates yesterday; laptop B pulls and picks
up right where they left off.

**When someone returns to a project after months away:**
They pull the latest main, and the atlas reflects everything the team
did in their absence. Only files changed since they last pulled need
incremental reindex. Their experience of re-engaging with the project
is dramatically smoother than rebuilding context from scratch.

**For open-source projects:**
Casual contributors benefit immediately without paying any setup cost.
The project's accumulated architectural knowledge flows to them
automatically. Maintainers can review atlas changes in PRs with the
same tools they already use for code review.

**For teams that cannot commit the atlas:**
Set `atlas.committed: false` in the config. Every developer runs
their own extraction. The team artifact benefit is lost, but
ContextAtlas still works as a personal tool.

This model — committed team artifact with a local cache for query
performance — is a categorical difference from both session-memory
tools (which can't really be committed) and knowledge-graph tools
(which don't emphasize this pattern). It's described in detail in
[ADR-06 of our own project](docs/adr/ADR-06-committed-atlas-artifact.md).

## Installation

> **Status:** v0.1 shipped with Phase 5 benchmark validation; v0.2 in
> progress (see [ROADMAP.md](ROADMAP.md) and
> [v0.2-SCOPE.md](v0.2-SCOPE.md)). Installation instructions will
> be finalized post-v0.2.

```bash
# Placeholder
npm install -g contextatlas
```

**Runtime requirements:**

- Node.js 20 or newer.
- A TypeScript language server on your system. ContextAtlas declares
  `typescript-language-server` as a **peer dependency** rather than a
  direct one, so you control the version. Install it alongside
  ContextAtlas (e.g. `npm i -D typescript-language-server typescript`).
  Python projects additionally require Pyright on the PATH — configured
  similarly in step 9 of development.

Configure ContextAtlas as an MCP server in your Claude Code settings:

```json
{
  "mcpServers": {
    "contextatlas": {
      "command": "contextatlas",
      "args": ["serve"]
    }
  }
}
```

Create `.contextatlas.yml` in your repo root:

```yaml
version: 1
languages:
  - typescript
  - python
adrs:
  path: docs/adr/
  format: markdown-frontmatter
docs:
  include:
    - README.md
    - docs/**/*.md
git:
  recent_commits: 5
atlas:
  committed: true    # default; commits atlas.json to your repo
```

Then:

```bash
contextatlas index
```

**First run behavior:**

- If `atlas.json` is already committed (teammate ran it first, or
  it came with the repo), ContextAtlas imports it instantly. No API
  calls. You're ready in seconds.
- If no atlas exists yet, ContextAtlas runs full extraction. Depending
  on ADR count and size, this takes 1-10 minutes and costs a few
  dollars in Opus API credits. The resulting `atlas.json` can be
  committed so future contributors skip this step.
- On subsequent runs, only files whose SHAs have changed since the
  last index get reprocessed. Usually seconds.

## Benchmark Results

We benchmark ContextAtlas against baseline Claude Code on three
repositories chosen to reflect realistic developer workloads:

| Repo                | Language   | Source files | Role                         |
|---------------------|------------|--------------|------------------------------|
| honojs/hono         | TypeScript | 186          | Mid-sized framework          |
| encode/httpx        | Python     | 23           | Focused production library   |
| contextatlas (self) | TypeScript | ~40          | Meta/dogfood                 |

**Methodology.** 24 prompts per repo, 6 task buckets, three runs per
condition, blind manual grading. Full methodology in
[RUBRIC.md](RUBRIC.md). Pre-registered rubric, no cherry-picking.

### What we already have evidence for

Three claims are defensible without needing benchmark runs because they
follow from the architecture or from pre-benchmark validation:

- **Setup is materially simpler than Graphify.** A single `.contextatlas.yml`
  with five fields vs. Graphify's broader ingestion scope (code, docs,
  diagrams, papers). Users are indexing in minutes, not hours. This is
  an architectural property of narrower scope, not an empirical claim.

- **Session-to-session value from day one, for any user.** ContextAtlas's
  data source is your repo (ADRs, git, code), not accumulated Claude
  sessions. A new developer cloning the repo gets the same context
  quality as someone who has worked with Claude on the project for
  months. Session-memory tools can't match this because they start with
  nothing on session one.

- **Extraction pipeline works on production-grade docs.** Validated
  pre-benchmark: 12 substantial real-world ADRs tested, 100% JSON parse
  success, 169 structured claims extracted, correct severity classification
  on every claim, cost of $2.89 total (~$0.25 per substantial ADR).
  This isn't aspirational — it's measured.

### What the benchmark will tell us

The numbers below answer the questions we can't answer without running:
how much tool-call reduction ContextAtlas actually delivers per task
bucket, whether constraint-violation rates drop on the "implement within
constraints" bucket, and where the tool helps vs. where it doesn't.

**Headline results (to be populated after benchmark runs):**

| Task bucket              | Baseline calls | CA calls | Baseline score | CA score |
|--------------------------|----------------|----------|----------------|----------|
| Localize                 | — | — | — | — |
| Trace                    | — | — | — | — |
| Understand constraints   | — | — | — | — |
| Impact analysis          | — | — | — | — |
| Bug hypothesis           | — | — | — | — |
| Implement within constraints | — | — | — | — |

The implement-within-constraints bucket is where the tool most obviously
differentiates — this is where baseline Claude routinely produces code
that violates architectural rules that are written down in the repo, and
where ContextAtlas surfaces the rules before Claude commits to a design.

**Dogfooding.** The third benchmark target is ContextAtlas itself. By
the end of development, we wanted the tool to be good enough to help
build itself — Claude Code using ContextAtlas to navigate the ContextAtlas
codebase during ongoing development. ADRs written for ContextAtlas (tool
interface stability, symbol ID format, extraction pipeline stages)
constrain future changes to the tool the same way they constrain
generated code. It's a recursive test: if the tool helps us ship the
tool, it'll help others too.

## What ContextAtlas Is Not

A few deliberate non-claims:

- **Not a session-memory tool.** Projects like claude-mem, engram, and
  anamnesis capture accumulated session history — what Claude learned or
  did in past conversations. ContextAtlas provides static architectural
  ground truth extracted from your code, ADRs, and docs. Different
  information sources with occasional overlap (when session discussions
  became ADRs or commits), but fundamentally different problems.
- **Not a replacement for LSP.** ContextAtlas *uses* LSP as its source
  of structural truth. If you just want LSP-in-MCP, projects like LSP-AI
  solve that well. ContextAtlas layers architectural intent and git
  history on top.
- **In the same category as Graphify, with different architectural bets.**
  Graphify and ContextAtlas both build pre-computed indexes over
  codebases for LLM agents via MCP. That's genuine category overlap,
  and we want to be straight about it. Where we differ:
  - **LSP-grounded vs. heuristic-extracted.** ContextAtlas delegates all
    structural questions to the language server (tsserver, Pyright).
    Graphify derives structure via parsing and extraction.
  - **Pre-composed bundles vs. graph primitives.** ContextAtlas's MCP
    tools return fused bundles in one call. Graphify exposes graph
    operations (`graph_query`, `get_neighbors`, `shortest_path`) that
    callers compose.
  - **Narrow scope vs. broad scope.** ContextAtlas indexes code + prose
    + git. Graphify ingests documentation, diagrams, research papers,
    and more.
  - **Claim-first vs. graph-first.** ContextAtlas stores discrete claims
    with severity labels, optimized for "what constrains this symbol?"
    Graphify models the world as nodes and edges, optimized for "what
    connects to this node?"

  Whether our bets produce better results for a given workload is an
  empirical question. See benchmark results below.
- **Not an embedding-based search tool.** We evaluated this and chose
  symbol-keyed claims instead. Embeddings are fuzzy; LSP symbols are
  exact. For code, exactness wins.

## Architecture at a Glance

Five layers, each with one job:

1. **MCP interface.** `get_symbol_context`, `find_by_intent`, and
   `impact_of_change` tools exposed to Claude.
2. **Query fusion.** Composes results from signal sources per query.
3. **Signal sources.** LSP (via tsserver/Pyright), intent registry (from
   SQLite), git, tests.
4. **Extraction pipeline.** Opus 4.7 reads prose docs and emits structured
   claims keyed to symbols.
5. **Storage.** SQLite index, SHA-keyed for incremental reindex.

Full design in [DESIGN.md](DESIGN.md).

## Data Flow and Privacy

What ContextAtlas does and doesn't send off your machine:

**Sent to Anthropic's API (at index time only):**
- Text contents of ADRs, READMEs, and other markdown docs configured
  via `.contextatlas.yml`
- This happens once per document per change — only on initial index and
  on incremental reindex of changed files

**Never sent anywhere:**
- Your source code
- Your git history
- LSP symbol data (names, references, types)
- Query contents at runtime

**Stored locally only:**
- The extracted claims database (`.contextatlas/index.db` by default)
- All runtime query resolution happens against this local SQLite file

At query time — every `get_symbol_context` call Claude makes during your
work — ContextAtlas performs a local SQLite lookup plus local LSP calls.
No network traffic. No model calls. Your code never leaves your machine
during normal use.

Index-time extraction uses the Anthropic API per standard API terms. If
your ADRs contain sensitive architectural decisions, they'll be processed
under those terms like any other API-submitted content.

## Language Support

**MVP:** TypeScript and Python.

**Roadmap:** Java, Go, .NET, Rust. The language adapter interface is a
stable plugin surface — each new language is an additive contribution,
not a core change.

## What's Implemented Today

**Tools (all three shipped in v0.1):**
- [x] `get_symbol_context` — the primitive, full four-signal fusion
  (LSP + ADR claims + git + tests)
- [x] `find_by_intent` — thin composite, FTS5 + BM25 ranking over
  the claims table (ADR-09)
- [x] `impact_of_change` — thin composite, primitive + git co-change
  + test-impact data

**Infrastructure (shipped in v0.1):**
- [x] Core MCP server skeleton
- [x] TypeScript language adapter (via `typescript-language-server`)
- [x] Python language adapter (via Pyright, ADR-13)
- [x] Adapter conformance test suite (identical behavioral contract
  across both adapters)
- [x] Opus 4.7 index-time extraction pipeline (validated: 100% parse
  success across 12 production-grade documents tested)
- [x] SQLite storage with SHA-based incremental reindex
- [x] Git integration (recent commits, co-change, hot-path signals)
- [x] Compact output format (default) + JSON format (opt-in)
- [x] Benchmark harness (in the separate
  [ContextAtlas-benchmarks](https://github.com/traviswye/ContextAtlas-benchmarks)
  repo; see the linked Benchmarks and Methodology section below)

**Benchmark assets:**
- [x] Production-grade ADRs for benchmark targets (5 hono + 5 httpx)
- [x] Self-ADRs for ContextAtlas's own architectural decisions
- [x] Extraction pipeline validated end-to-end on real ADRs
- [x] Three benchmark repositories (hono, httpx, self)
- [x] Phase 5 reference run (hono) — 50–71% tool-call reduction on
  architectural win-bucket prompts; full synthesis in benchmarks repo

**v0.2 in progress:** Adapter quality polish (Stream A) + Go adapter
via `gopls` with cobra benchmark target + cross-repo httpx reference
run (Stream B). See [`v0.2-SCOPE.md`](v0.2-SCOPE.md) for stream-level
scope.

**Deferred to future versions (see [ROADMAP.md](ROADMAP.md) for specifics):**
- Claim source enrichment: docstrings, READMEs (v0.3)
- External dogfood trial (v0.3)
- Semantic embedding layer for `find_by_intent` (v0.4, evidence-gated)
- Task-shaped bundle queries: `why_does_this_fail`, `onboard_to_feature`,
  `audit_change` (v0.5)
- Hot-path caching, claim capture from agent sessions (v0.6+)
- Additional language adapters beyond Go — Rust, C#, Java (by demand)
- Web dashboard for index inspection (out of roadmap)
- VS Code extension (out of roadmap)

## Contributing

ContextAtlas is currently All Rights Reserved during active development.
The plan is to transition to a permissive open-source license (MIT or
Apache-2.0) after the hackathon, at which point contributions will be
welcomed. Areas where contribution will be especially valuable:

- **New language adapters.** The `LanguageAdapter` interface is small
  and stable. Adding Go, Java, .NET, or Rust support is a
  self-contained project.
- **Non-markdown intent sources.** Currently we support markdown ADRs
  with YAML frontmatter. RST, AsciiDoc, and other formats are
  welcome extensions.
- **Benchmark repos.** We test on three repos today. Additional
  benchmark coverage on more codebases strengthens the eval.

## Credits

Built during the "Build anything with Opus 4.7" hackathon.

ContextAtlas uses:
- Claude Opus 4.7 for index-time intent extraction
- typescript-language-server for TypeScript symbol resolution
- Pyright for Python symbol resolution
- better-sqlite3 for the index store
- @modelcontextprotocol/sdk for MCP server implementation

## Benchmarks and Methodology

Benchmarks and methodology live in a separate repository:
[github.com/traviswye/ContextAtlas-benchmarks](https://github.com/traviswye/ContextAtlas-benchmarks).
That repo contains the harness code, locked prompt sets, published
measurement results, and the full methodology document (RUBRIC.md).
Keeping the harness out of this repo means the benchmarks measure
the published `contextatlas` package's actual behavior rather than
an internal monorepo build.

## License

All Rights Reserved during active development. See LICENSE.
