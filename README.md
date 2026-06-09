<div align="center">

# ContextAtlas

**Stop watching Claude burn tokens grepping for context it can't possibly find.**

ContextAtlas turns your codebase into a *single-call* context bundle for Claude Code —
fusing LSP-grade structure, architectural intent from your Architectural Decision Records (ADRs), git history, and test
associations. Measured **45-72% token reduction with zero quality regression across
benchmark axes** on architectural prompts across the hono / httpx / cobra benchmark suite.

![Claude Code](https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-1f6feb?style=flat)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![Ruby](https://img.shields.io/badge/Ruby-CC342D?style=flat&logo=ruby&logoColor=white)
![C#](https://img.shields.io/badge/C%23-239120?style=flat&logo=csharp&logoColor=white)
![MIT](https://img.shields.io/badge/License-MIT-blue.svg)

</div>

<p align="center">
  <img src="https://raw.githubusercontent.com/traviswye/ContextAtlas/main/docs/demo.gif" alt="ContextAtlas demo" />
</p>

[**Quick start →**](#quick-start) · [**Benchmark results →**](#the-numbers) · [**Why not graph-based? →**](#how-contextatlas-compares-to-alternatives) · [**Architecture →**](#architecture) · [**ADRs →**](docs/adr/)

---

ContextAtlas ships two equivalent paths — CLI and Claude Code Skills —
both producing the same `atlas.json`. See [Quick Start](#quick-start)
for setup.

## The Problem

Claude Code currently learns your codebase by brute force. Every session
starts fresh. Every "where is X?" triggers multiple grep calls. Every
"what depends on Y?" is another flurry of file reads. On a mid-sized
codebase, answering a single architectural question can consume 40+ tool
calls and 100,000+ tokens before Claude has enough context to reason
well.

Worse: the architectural intent that governs your code — the ADRs, the
design decisions, the "we did it this way because" — is invisible to
Claude. The rule that `OrderProcessor` must be idempotent lives in
`docs/adr/`. When Claude proposes a change, it has no way to know that
constraint exists.

Yesterday's understanding doesn't carry to today. Every conversation
starts from zero. Your ADRs, your commit history, your test coverage —
none of it is on the agent's table.

**What if expensive understanding happened once, at index time, and
every query became a dictionary lookup?**

That's ContextAtlas.

## What ContextAtlas Is

ContextAtlas is an MCP server that gives Claude Code a curated atlas of
your codebase — fusing LSP-grade structural precision with architectural
intent extracted from your ADRs, docs, and git history, delivered to
Claude in single-call context bundles.

Every bundle Claude receives combines four independent signals about a
symbol:

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

When Claude is asked to modify `OrderProcessor`, it sees the
idempotency constraint *before* proposing changes — not after a user
review catches the violation.

**Who this is for.** ContextAtlas is built for the average developer
using Claude Code on real codebases — not just engineers at large orgs
working on 500,000-file monorepos. Token-burn reduction scales with
codebase size — dramatic on a 200-file framework, modest on a 30-file
library. But **architectural intent capture is size-invariant.** A
30-file library can have meaningful architectural decisions worth
surfacing, and Claude respecting them matters just as much as on a
larger codebase.

## Beyond tokens: a design-alignment case study

Efficiency and quality are necessary but not sufficient. The
substantive value of context-grounding shows up in **design
choices** on non-trivial code-change tasks.

**A/B trial during v0.3 development.** Identical 3-paragraph
prompt across two ContextAtlas clones: implement a known bug fix —
locate the bug, design and implement the fix, write tests,
document via ADR. The only setup difference: MCP availability.

| Arm | MCP | Approach selected |
|-----|-----|-------------------|
| A (vanilla) | none | Recall-first approach (broader matching; fought the project's precision-thesis with noise) |
| B (CA-aided) | ContextAtlas | Precision-optimization approach (aligned with the project's pre-extracted-claims-with-structural-attribution thesis) |

**Arm B's approach landed in main.** Both arms functionally fixed
the bug at similar wall-clock and token cost. The substantive
difference was *alignment with project design thesis* — the
CA-aided arm could read the relevant ADR + prior architectural
work from the atlas, and made a choice that fit. The vanilla arm
couldn't see that context and chose an approach that worked but
fought the architecture.

Arm A's substantive consideration wasn't lost — captured as
future-work investigation trigger. The recall-vs-precision
tradeoff is preserved.

Full synthesis at [v0.3 Round 3 dogfood evidence](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/v0.3-round-3-dogfood-evidence-2026-04-26.md).

**N=1 trial; this is anecdote, not benchmark.** The systematic
benchmark suite (hono / httpx / cobra) measures efficiency and
quality (see §The Numbers below). This A/B trial measures the
substantively-distinct *design-alignment* axis — which doesn't fit
benchmark-suite methodology (every code-change task is repo-
specific) but is the substantive value proposition for cohort
developers building on real codebases.

## The Numbers

We benchmark ContextAtlas against baseline Claude Code on three
repositories chosen to reflect realistic developer workloads:

| Repo          | Language   | Source files | Role                         |
|---------------|------------|--------------|------------------------------|
| honojs/hono   | TypeScript | 186          | Mid-sized framework          |
| encode/httpx  | Python     | 23           | Focused production library   |
| spf13/cobra   | Go         | 19           | CLI framework                |

**Methodology.** 24 prompts per repo, 6 task buckets, blind manual
grading, pre-registered rubric, no cherry-picking. Full methodology in
[RUBRIC.md](RUBRIC.md).

### Efficiency: 50-71% tool-call reduction on architectural prompts

Phase 5 reference run on hono, six pre-registered prompts:

| Prompt | Bucket | Alpha calls | CA calls | Δ | Alpha $ | CA $ |
|---|---|---:|---:|---:|---:|---:|
| h1-context-runtime | win | 18 | 9 | **−50%** | $2.36 | $1.52 |
| h2-router-contract | win | 11 | 5 | **−55%** | $0.60 | $0.53 |
| h3-middleware-onion | win | 5 | 5 | 0% | $0.38 | $0.47 |
| h4-validator-typeflow | win | 21 | 6 | **−71%** | $2.95 | **$0.52** |
| h5-hono-generics | tie | 11 | 13 | +18% | $0.79 | $1.17 |
| h6-fetch-signature | trick | 3 | 4 | +33% | $0.17 | $0.29 |
| **aggregate** | | **69** | **42** | **−39%** | **$7.25** | **$4.50 (−38%)** |

The headline case: **h4-validator-typeflow ran 7.3× cheaper** ($2.95 → $0.52)
at equivalent answer depth. CA opens with the governing ADR by number;
the baseline reconstructs the architecture from source. Tie and trick
buckets (h5, h6) show CA net-negative as the rubric predicted — CA
over-engineers on questions where architectural intent doesn't carry
load. **Bucket-aware methodology surfaces these expected cases rather
than burying them.**

Cross-language replication: the same architectural-intent win mechanism
holds on Python ([Phase 6 — httpx](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/phase-6-httpx-reference-run.md))
and Go ([Phase 7 — cobra](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/phase-7-cobra-reference-run.md)).
Phase 8 re-ran the locked prompt sets against v0.3-sharpened atlases at
the same pinned target SHAs: **45-72% token reduction on architectural-intent
prompts across all three target languages**. Full synthesis at
[phase-8-v0.3-reference-run.md](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/phase-8-v0.3-reference-run.md).

### Quality: blind-graded, paired-t with confidence intervals

v0.5 shipped the LLM-judge methodology under paired-mode anonymization
(per [ADR-19](docs/adr/ADR-19-llm-judge-methodology.md)). Cross-cell
rollup paired-t at N=27 differences per axis (5 anchor cells × n=5
trials × 2 conditions; hono h1 auto-stretch to n=8):

| Quality axis | Mean Δ (0-3 scale) | 95% CI | Tier |
|---|---:|---|---|
| Factual correctness | +0.370 | [0.176, 0.565] | **CLEAN** |
| Hallucination | +0.296 | [0.032, 0.561] | Borderline |
| Actionability | +0.148 | [0.005, 0.291] | Borderline |
| Completeness | +0.037 | [-0.039, 0.113] | Not distinguishable |

**Threshold pre-registration:** the three-tier framing (≥0.05 CLEAN;
0.001-0.05 BORDERLINE; ≤0 NOT distinguishable) was locked before
precision values were computed. No goalpost-shifting after data.
**76% tie rate confirms anonymization worked** — the judge couldn't
tell which condition was which on three-quarters of comparisons.

Full per-axis numerics + 9 named findings at the
[Phase-9 reference doc](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/phase-9-v0.5-reference-run.md).
Honest methodology limits documented in [§Methodology and Honest
Limits](#methodology-and-honest-limits) below.

## How ContextAtlas Compares to Alternatives

A few deliberate framings — what ContextAtlas is and isn't relative to
neighboring tools:

**vs. graph-based code intelligence (Graphify and similar).** We're in
the same category — both build pre-computed indexes over codebases for
LLM agents via MCP. That's genuine category overlap, and we want to be
straight about it. Where we differ:

- **LSP-grounded vs. heuristic-extracted.** ContextAtlas delegates all
  structural questions to the language server (tsserver, Pyright,
  gopls, ruby-lsp, csharp-ls). Graphify derives structure via parsing
  and extraction.
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
empirical question. See [the numbers above](#the-numbers).

**vs. session-memory tools (claude-mem, engram, anamnesis).** Those
capture accumulated session history — what Claude learned or did in
past conversations. ContextAtlas provides static architectural ground
truth extracted from your code, ADRs, and docs. Different information
sources with occasional overlap (when session discussions become ADRs
or commits), but fundamentally different problems. Session-memory
tools also can't really be committed to a repo; ContextAtlas's atlas
can.

**vs. LSP-in-MCP (LSP-AI and similar).** ContextAtlas *uses* LSP as
its source of structural truth. If you just want LSP-in-MCP, those
projects solve that well. ContextAtlas layers architectural intent
and git history on top.

**vs. embedding-based search.** We evaluated this and chose
symbol-keyed claims instead. Embeddings are fuzzy; LSP symbols are
exact. Embedding-based ranking is a post-MVP enhancement contingent
on benchmark evidence that it helps — see
[ADR-09](docs/adr/ADR-09-find-by-intent-fts5-bm25.md) for the full
rationale.

### The committed-atlas pattern

ContextAtlas produces a **committable team artifact** — `atlas.json` —
that lives in the repo alongside your code and ADRs. This is the piece
that turns ContextAtlas from a personal productivity tool into a team
asset.

- **New team member clones the repo:** they pull down `atlas.json`
  with everything else. On first run, ContextAtlas imports the
  committed atlas directly into their local cache — no extraction API
  calls, no 10-minute wait. Productive from the moment they open
  Claude Code.
- **Contributor submits a PR:** if their code change affects
  architectural claims, they regenerate `atlas.json` as part of their
  commit. Reviewers see both the code change and the atlas diff in
  the PR.
- **Developer bounces between machines:** atlas state is
  version-controlled, not trapped on one laptop.
- **Returning to a project after months away:** pull the latest main,
  and the atlas reflects everything the team did in your absence.
  Only files changed since you last pulled need incremental reindex.
- **Open-source projects:** casual contributors benefit immediately
  without paying any setup cost. The project's accumulated
  architectural knowledge flows to them automatically.

For teams that cannot commit the atlas, set `atlas.committed: false`
in the config. Every developer runs their own extraction. The team
artifact benefit is lost, but ContextAtlas still works as a personal
tool.

This model — committed team artifact with a local cache for query
performance — is a categorical difference from both session-memory
tools and knowledge-graph tools. Detailed in
[ADR-06](docs/adr/ADR-06-committed-atlas-artifact.md).

## Architecture

```
                INDEX TIME (once per source change)
                ──────────────────────────────────────
                ADRs ──────────┐
                Docstrings ────┤
                Git commits ───┼──► Opus 4.7 extraction
                LSP symbols ───┘              │
                                              ▼
                              atlas.json (committed to repo)
                                              │
                                              ▼
                              SQLite + FTS5 BM25 (local cache)

                QUERY TIME (every Claude call, zero API)
                ──────────────────────────────────────
                Claude Code:  get_symbol_context("X")
                                              │
                                              ▼
                              One fused bundle, sub-100ms
                              (LSP refs + intent + git + tests)
```

Five layers, each with one job:

1. **MCP interface.** `get_symbol_context`, `find_by_intent`, and
   `impact_of_change` tools exposed to Claude.
2. **Query fusion.** Composes results from signal sources per query.
3. **Signal sources.** LSP (via tsserver/Pyright/gopls/ruby-lsp/csharp-ls),
   intent registry (from SQLite), git, tests.
4. **Extraction pipeline.** Opus 4.7 reads prose docs and emits
   structured claims keyed to symbols.
5. **Storage.** SQLite index, SHA-keyed for incremental reindex.

Signal fusion at query time works as a substantively cheap lookup:
when Claude calls `get_symbol_context("OrderProcessor")`, the MCP
handler hits the LSP for live structural facts (definition,
references, types) + reads the symbol's pre-extracted intent claims
from SQLite + folds in git heat + tests. The bundle returned to
Claude is composed, not computed — substantive joins happened at
index time. This is the substantive distinction from graph-based
alternatives that expose primitives (`get_neighbors`, `shortest_path`)
which callers compose at query time.

The architectural promise: **expensive understanding happens once at
index time; queries are local dictionary lookups, zero API calls.**
This bounds cost, latency, and unpredictability — and it's a hard
invariant, not an optimization.

Full design in [DESIGN.md](DESIGN.md).

### Data flow and privacy

What ContextAtlas does and doesn't send off your machine:

**Sent to Anthropic's API (at index time only):**
- Text contents of ADRs, READMEs, and other markdown docs configured
  via `.contextatlas.yml`
- This happens once per document per change — only on initial index
  and on incremental reindex of changed files

**Never sent anywhere:**
- Your source code
- Your git history
- LSP symbol data (names, references, types)
- Query contents at runtime

**Stored locally only:**
- The extracted claims database (`.contextatlas/index.db` by default)
- All runtime query resolution happens against this local SQLite file

At query time — every `get_symbol_context` call Claude makes during
your work — ContextAtlas performs a local SQLite lookup plus local LSP
calls. No network traffic. No model calls. Your code never leaves your
machine during normal use.

Index-time extraction uses the Anthropic API per standard API terms. If
your ADRs contain sensitive architectural decisions, they'll be
processed under those terms like any other API-submitted content.

## The Three Tools

The three MCP tools are not three parallel features — they're one fused
context substrate with three access patterns.

**`get_symbol_context`** — *the primitive.* "I know the symbol; give me
everything." Returns the full fused bundle (signature, ADR claims,
references, git heat, tests, types) in a single call. Multi-symbol
mode handles up to 10 symbols per request (per
[ADR-15](docs/adr/ADR-15-multi-symbol-get-symbol-context.md)).

**`find_by_intent`** — *the semantic-query composite.* "I don't know
the symbol; find it by what it does." Ranks by BM25 against indexed
claim text in local SQLite FTS5 — no embedding service, no external
calls, deterministic results (per
[ADR-09](docs/adr/ADR-09-find-by-intent-fts5-bm25.md)).

**`impact_of_change`** — *the blast-radius composite.* "I'm about to
change this; what breaks?" Adds git co-change patterns and test impact
on top of the primitive.

## Refresh Discoverability

ContextAtlas atlas is a substrate you build once and refresh after code
or ADR changes. ONE canonical entry point per cohort path; behavior
adapts based on substrate state:

|                 | CLI                                                 | Skills                                  |
|-----------------|-----------------------------------------------------|-----------------------------------------|
| **Cold-start**  | `contextatlas index` (full extraction)              | `/index-atlas` (full extraction)        |
| **Refresh**     | `contextatlas index` (Phase 4 SHA-diff incremental) | `/index-atlas` (refresh-aware workflow) |

SHA-diff incremental refresh per [ADR-12](docs/adr/ADR-12-cli-subcommand-surface.md)
is substantively cheaper than cold-start scaffolding. Unchanged ADR
and docstring sources skip; only changed sources re-extracted.

## Quick Start

> **Status:** v0.9.0 shipped 2026-05-16. v1.0 public launch substrate
> complete. Package not yet published to npm; install instructions
> below describe the intended shape.

**Runtime requirements:**

- Node.js 20 or newer.
- A language server for each language you configure:
  - **TypeScript** — `typescript-language-server` (declared as a
    **peer dependency** rather than a direct one, so you control the
    version). Install alongside ContextAtlas
    (e.g. `npm i -D typescript-language-server typescript`).
  - **Python** — Pyright on the PATH (also a peer dependency).
  - **Go** — `gopls` on the PATH (install via
    `go install golang.org/x/tools/gopls@latest`).
  - **Ruby** — `ruby-lsp` 0.26.x. Recommended install via Bundler in
    your project's `Gemfile` (`gem 'ruby-lsp', '~> 0.26.0', require:
    false` under `group :development`). Rails projects additionally
    benefit from `ruby-lsp-rails` 0.4.x. Ruby 3.3+ required (4.0+
    recommended).
  - **C# / .NET** — `csharp-ls` 0.24.x on the PATH (Roslyn LSP
    wrapper). Install via `dotnet tool install --global csharp-ls`.
    .NET SDK 8 minimum (10+ recommended; matches cohort backend
    pin). On Windows, the `%USERPROFILE%\.dotnet\tools` directory
    must be on PATH — the adapter enriches PATH automatically for
    Bash/Git-Bash where the SDK installer only configures
    PowerShell.

### Path A — Claude Code Skills (60 seconds, no API key)

```bash
npm install -g contextatlas
contextatlas init
```

Then in Claude Code:

```
/generate-adrs   # Skip if you already have ADRs (any path; see Using existing ADRs below)
/index-atlas     # Build the atlas
/prime-atlas     # Verify connection (once per session)
```

### Path B — CLI (90 seconds, API key required)

```bash
npm install -g contextatlas
export ANTHROPIC_API_KEY=sk-...
contextatlas init
contextatlas generate-adrs   # Skip if you already have ADRs (any path; see Using existing ADRs below)
contextatlas index
contextatlas doctor          # Verify health
```

### Using existing ADRs and docs

ContextAtlas extracts architectural intent from whatever ADRs and
documentation you already have — `generate-adrs` is for repos
without existing ADR substrate.

- **Existing ADRs at `docs/adr/`?** Skip `generate-adrs`;
  ContextAtlas extracts your existing ADRs automatically.
- **ADRs at a different path?** Set `adrs.path` in
  `.contextatlas.yml` (default: `docs/adr/`).
- **README, design docs, or other prose?** ContextAtlas extracts
  these too via `docs.include` (default: `README.md` +
  `docs/**/*.md`). Add custom paths to extract additional
  documentation surfaces.

The extraction pipeline produces structured claims from any prose
source pointed at via config — existing substrate doesn't go unused.
See [Configuration](#configuration) below for full schema.

### MCP server registration

Configure ContextAtlas as an MCP server in your Claude Code settings.
Choose based on whether `contextatlas` is on your PATH:

**Option A — global binary on PATH** (e.g., installed via
`npm install -g` or `npm link`):

```json
{
  "mcpServers": {
    "contextatlas": {
      "command": "contextatlas"
    }
  }
}
```

**Option B — direct dist invocation** (no global install needed):

```json
{
  "mcpServers": {
    "contextatlas": {
      "command": "node",
      "args": ["/absolute/path/to/contextatlas/dist/index.js"]
    }
  }
}
```

### First-run behavior

- If `atlas.json` is already committed (teammate ran it first, or it
  came with the repo), ContextAtlas imports it instantly. No API
  calls. You're ready in seconds.
- If no atlas exists yet, ContextAtlas runs full extraction. Depending
  on ADR count and size, this takes 1-10 minutes and costs a few
  dollars in Opus API credits (CLI path) or session tokens (Skills
  path). The resulting `atlas.json` can be committed so future
  contributors skip this step.
- **Cost projection note.** Script-reported extraction costs use
  full-token API pricing; platform-billed actuals reflect prompt-cache
  discount on the shared `EXTRACTION_PROMPT` prefix and typically run
  **~3x lower**. v0.4 reference measurements: cobra $5.44 → $1.82,
  httpx $5.53 → $1.85, hono $10.89 → $3.65 (3.0x ratio consistent
  across targets). Treat projected costs as conservative upper bounds.
- On subsequent runs, only files whose SHAs have changed since the
  last index get reprocessed. Usually seconds.

## Configuration

Create `.contextatlas.yml` in your repo root:

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
docs:
  include:
    - README.md
    - docs/**/*.md
git:
  recent_commits: 5
atlas:
  committed: true    # default; commits atlas.json to your repo
```

Full reference at [`docs/config.md`](docs/config.md).

## Methodology and Honest Limits

Credibility is built by stating what we don't claim.

**Statistical methodology.** All quality measurements are paired-t with
95% confidence intervals — **no p-values**. NHST at n=5 is
statistically void; CIs preserve effect-size visibility. Threshold
pre-registration honored verbatim (Option α strict three-tier framing
locked before precision values computed).

**Single-judge model.** v0.5 quality measurements use Sonnet 4.6 as
the judge with within-judge consistency ≥80% per axis (pass-1 vs
pass-2). Cross-vendor judge-panel graduation is post-v1.0 work.

**Three benchmark repos.** All quantitative claims are bounded to
hono (TypeScript, 186 files), httpx (Python, 23 files), and cobra
(Go, 19 files), plus our own dogfood. Generalization beyond these is
post-launch cohort work.

**v0.5 substrate scope.** Quality-axis measurements are 5 anchor cells
× n≥5 trials × 2 conditions (hono h1 auto-stretch to n=8); not
full-matrix replication. Matrix-completion graduation is post-v1.0.

**v0.6 cross-cycle replication caveat.** A targeted matrix-replication
subset at v0.6 (8 cells × n=5) showed attenuation on 2 of 4 quality
axes vs the v0.5 anchor cells (factual_correctness CLEAN→BORDERLINE;
actionability BORDERLINE→NOT distinguishable). Root cause: the v0.5
measurements were against an earlier atlas version, and the cross-cycle
methodology didn't control for atlas-substrate-version. Full causal
investigation deferred to post-launch. Detail at
[Phase-10 reference doc](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/phase-10-v0.6-reference-run.md).

**v0.3 single-run methodology.** Phase 8 reports n=1 per cell;
blind-graded quality-axis measurement was added at v0.5. The Beta-vs-
Beta+CA reporting at Phase 8 carries the atlas-file-visibility caveat
(bias direction conservative — actual CA contribution likely larger
than published numbers indicate).

**Dogfooding is not a measured benchmark.** Throughout development,
ContextAtlas indexes its own ADRs and is used by Claude Code during
work on ContextAtlas itself. This is a development practice, not part
of the four-condition matrix — which runs only against the three
external targets.

**Favorable and unfavorable results both published.** Phase 7's
cross-harness asymmetry hypothesis was FALSIFIED on v0.3 substrate.
v0.6's atlas-substrate-version confound was surfaced and disclosed.
Tie and trick buckets routinely show CA net-negative; we report them
inline rather than burying them.

## Status and Roadmap

**Current:** v0.9.0 (shipped 2026-05-16). v1.0 public launch substrate
complete; launch execution work folds into v1.0.0 without a separate
v0.9.1 tag.

**Recent cycle highlights** (full per-cycle scope at
[`docs/release-history.md`](docs/release-history.md)):

- **v0.9 (May 16):** Ruby adapter ship — fourth supported language
  via ruby-lsp + ruby-lsp-rails per ADR-21. Repo launch substrate
  (MIT license + community substrate + cycle docs migration to
  `docs/cycles/v0_X/`). Launch positioning work in progress.
- **v0.8 (May 14):** Substrate-equivalence + path-comparability +
  BM25 activation. Closed Skill-substrate parity to CLI at 65-83%
  claim ratio across hono/httpx/cobra benchmarks.
- **v0.7 (May 12):** Launch-bearing cycle — Path-3 entry-point-
  determined architecture (CLI/Skills equivalence per ADR-02
  graduation) + `generate-adrs` feature with canonical depth-floor
  enforcement via `validate-adrs`.
- **v0.6 (May 9):** Pipeline mechanics + targeted matrix-replication
  subset (8 cells × n=5 × 2 conditions). F1 PRIMARY atlas-substrate-
  version confound surfaced; full causal investigation deferred to
  post-launch.
- **v0.5 (May 4):** Quality methodology cycle — LLM-judge harness +
  paired-mode anonymization per ADR-19 + paired-t statistical
  primitive (ADR-19 §4 amendment). V1.0 ship-gate criterion #1
  parenthetical CLOSED.
- **v0.4 (April 29):** Substrate hardening — LSP timing-race
  robustness via two-readiness-signals (ADR-18) + cost-projection
  disclaimers + dogfood foundation + doctor diagnostic script.
- **v0.3 (April 28):** Atlas precision cycle — narrower attribution
  + multi-symbol API per ADR-15 + atlas schema v1.3 with
  `contextatlas_commit_sha` + Phase 8 cross-target validation
  (45-72% range).
- **v0.2 (April 25):** Three-language baseline — Go adapter via
  gopls per ADR-14 + cross-language cobra/httpx reference runs.
- **v0.1 (initial MVP):** Three MCP tools + TS/Python adapters +
  Opus 4.7 extraction pipeline + SQLite incremental reindex + Phase
  5 hono reference run (50-71% tool-call reduction on architectural
  win-bucket prompts).

**Roadmap (post-v1.0):**

- Cohort exposure execution against carried-forward recruitment
  infrastructure (v1.0 ship-gate criterion #3)
- Full benchmark matrix completion + cross-vendor judge panel
- Semantic embedding layer for `find_by_intent` (evidence-gated)
- Task-shaped bundle queries: `why_does_this_fail`,
  `onboard_to_feature`, `audit_change`
- Additional language adapters by demand: Rust, Java, Kotlin
- Non-markdown intent sources: RST, AsciiDoc

For detailed milestone arc and per-cycle scope:
[ROADMAP.md](ROADMAP.md), [docs/cycles/](docs/cycles/),
[docs/release-history.md](docs/release-history.md), and
[research/v1.1-candidates.md](research/v1.1-candidates.md).

## Language Support

The language adapter interface is a stable plugin surface — each new
language is an additive contribution, not a core change. See
[`docs/language-adapter-guide.md`](docs/language-adapter-guide.md) for
the contributor onboarding walkthrough.

| Language | Adapter | LSP Server | Shipped |
|----------|---------|------------|---------|
| TypeScript | `TypeScriptAdapter` | typescript-language-server | v0.1 |
| Python | `PyrightAdapter` | Pyright | v0.1 |
| Go | `GoAdapter` | gopls | v0.2 |
| Ruby | `RubyAdapter` | ruby-lsp (+ ruby-lsp-rails) | v0.9 |
| C# / .NET | `CsharpAdapter` | csharp-ls (Roslyn) | v1.1 |

## Contributing

ContextAtlas is MIT licensed and welcomes contributions. Areas where
contribution will be especially valuable:

- **New language adapters.** The `LanguageAdapter` interface is small
  and stable. Adding Java, .NET, Rust, Kotlin, or other language
  support is a self-contained project. See
  [`docs/language-adapter-guide.md`](docs/language-adapter-guide.md).
- **Non-markdown intent sources.** Currently we support markdown ADRs
  with YAML frontmatter. RST, AsciiDoc, and other formats are welcome.
- **Benchmark repos.** Additional benchmark coverage on more codebases
  strengthens the eval.

## Benchmarks and Methodology

Benchmarks and methodology live in a separate repository:
[github.com/traviswye/ContextAtlas-benchmarks](https://github.com/traviswye/ContextAtlas-benchmarks).
That repo contains the harness code, locked prompt sets, published
measurement results, and the full methodology document (RUBRIC.md).
Keeping the harness out of this repo means the benchmarks measure the
published `contextatlas` package's actual behavior rather than an
internal monorepo build.

## Credits

Built during the "Build anything with Opus 4.7" hackathon.

ContextAtlas uses:
- Claude Opus 4.7 for index-time intent extraction
- typescript-language-server for TypeScript symbol resolution
- Pyright for Python symbol resolution
- gopls for Go symbol resolution
- ruby-lsp for Ruby symbol resolution
- csharp-ls for C# / .NET symbol resolution (Roslyn LSP wrapper)
- better-sqlite3 for the index store
- @modelcontextprotocol/sdk for MCP server implementation

## License

MIT. See [LICENSE](LICENSE).
