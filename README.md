<div align="center">

# ContextAtlas

**Stop watching Claude burn tokens grepping for context it can't possibly find.**

ContextAtlas turns your codebase into a *single-call* context bundle for Claude Code —
fusing LSP-grade structure, architectural intent from your ADRs, git history, and test
associations. Measured **45-72% token reduction** on architectural prompts across the
hono / httpx / cobra benchmark suite.

![Claude Code](https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-1f6feb?style=flat)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![Ruby](https://img.shields.io/badge/Ruby-CC342D?style=flat&logo=ruby&logoColor=white)
![MIT](https://img.shields.io/badge/License-MIT-blue.svg)

</div>

<!-- DEMO-GIF-PLACEHOLDER-STREAM-D -->

[**Quick start →**](#installation) · [**Benchmark results →**](#benchmark-results) · [**Architecture →**](#architecture-at-a-glance) · [**ADRs →**](docs/adr/)

---

## Two ways to use ContextAtlas

ContextAtlas ships two equivalent entry paths — pick based on your workflow:

**CLI path** (`contextatlas init` + `contextatlas index`):
- Best fit: teams comfortable with API key management; CI/CD integration
- Anthropic API direct; ~$5-15 per repo one-time scaffolding;
  ~$0.20-1 per incremental refresh

**Skills path** (`/index-atlas` + `/generate-adrs`):
- Best fit: individual developers; Claude Code-only workflows
- No API key required; runs under your Claude subscription

Both paths produce substrate-equivalent `atlas.json` per
[ADR-02](docs/adr/ADR-02-extraction-sole-api-caller.md). Deeper detail:
[§Atlas refresh + cohort entry paths](#atlas-refresh--cohort-entry-paths)
below.

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

- **Symbols and structure** from the language server (TypeScript,
  Python, Go, or Ruby): definitions, references, types, diagnostics.
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

> **Status:** v0.1 + v0.2 + v0.3 + v0.4 + v0.5 + v0.6 + v0.7 shipped (v0.7 on 2026-05-12).
> Three-language baseline validated on hono (TypeScript), httpx (Python), and
> cobra (Go) — Phase 5/6/7/8/9/10 reference runs in the
> [benchmarks repo](https://github.com/traviswye/ContextAtlas-benchmarks).
> v1.0 public launch substrate complete; v0.8+ candidates queued post-launch
> per [`research/v0.8-candidates.md`](research/v0.8-candidates.md). Package not
> yet published to npm; install instructions below describe the intended shape.

```bash
# Placeholder
npm install -g contextatlas
```

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
    benefit from `ruby-lsp-rails` 0.4.x for Rails-specific symbol
    awareness. Ruby 3.3+ required (4.0+ recommended).

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

The MCP server runs on default no-arg invocation.

Create `.contextatlas.yml` in your repo root:

```yaml
version: 1
languages:
  - typescript
  - python
  - go
  - ruby
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
- **Cost projection note.** Script-reported extraction costs use
  full-token API pricing; platform-billed actuals reflect prompt-
  cache discount on the shared `EXTRACTION_PROMPT` prefix and
  typically run **~3x lower**. v0.4 Step 5 reference measurements:
  cobra $5.44 → $1.82, httpx $5.53 → $1.85, hono $10.89 → $3.65
  (3.0x ratio consistent across targets). Treat projected costs as
  conservative upper bounds.
- On subsequent runs, only files whose SHAs have changed since the
  last index get reprocessed. Usually seconds.

**Alternative — Skill cohort path.** Claude Code users can trigger
index-time work via Skills instead of CLI. After `contextatlas init`
scaffolds `.contextatlas/prompts/`:

- `/index-atlas` — runs ADR + docstring extraction via Skills
  (subscription-bounded; no API key required)
- `/generate-adrs` — generates canonical-depth-floor ADRs for repos
  lacking them

Both paths produce equivalent atlas substrate; choose based on cohort
preference (CLI = Anthropic API direct; Skills = subscription-bounded;
see [ADR-02](docs/adr/ADR-02-extraction-sole-api-caller.md) for full
substrate-equivalence framing per v0.7 Path-3 entry-point-determined
architecture).

## Atlas refresh + cohort entry paths

ContextAtlas atlas is a substrate you build once and refresh after
code or ADR changes. The 4-cohort entry surface covers two pipeline-
mechanic dimensions × two cohort-tooling dimensions:

|                 | CLI                                          | Skills                                  |
|-----------------|----------------------------------------------|-----------------------------------------|
| **Cold-start**  | `contextatlas index` (full extraction)       | `/index-atlas` (full extraction)        |
| **Refresh**     | `contextatlas index` (Phase 4 SHA-diff incremental) | `/index-atlas` (refresh-aware workflow) |

**Refresh discoverability.** ONE canonical entry point per cohort
path; behavior adapts based on substrate state. CLI: `contextatlas
index` first run scaffolds; subsequent runs refresh incrementally
via Phase 4 SHA-diff gating — unchanged ADR and docstring sources
skip; only changed sources re-extracted. Skills: `/index-atlas`
workflow dispatches cold-start vs incremental refresh based on
whether `.contextatlas/atlas.json` already exists.

**Cost framing.** SHA-diff incremental refresh per ADR-12 substrate
is substantively cheaper than cold-start scaffolding. Typical
incremental refresh ~$0.20-1 per run; cold-start varies with ADR
count and size (see Installation section cost projection note above
for empirical reference target data).

**ADR generation.** New repos can bootstrap ADRs via `contextatlas
generate-adrs` (CLI; Anthropic API) or `/generate-adrs` (Skills;
subscription-bounded). Both paths produce canonical-depth-floor-
compliant ADRs via mechanical `validate-adrs` enforcement at both
surfaces. Expect $5-15 per repo on CLI path (one-time-per-repo
investment in the foundational ADR substrate; empirical lock at
v0.8+ post-launch). Skills path is subscription-bounded.

## Benchmark Results

We benchmark ContextAtlas against baseline Claude Code on three
repositories chosen to reflect realistic developer workloads:

| Repo          | Language   | Source files | Role                         |
|---------------|------------|--------------|------------------------------|
| honojs/hono   | TypeScript | 186          | Mid-sized framework          |
| encode/httpx  | Python     | 23           | Focused production library   |
| spf13/cobra   | Go         | 19           | CLI framework                |

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

### Phase 5 reference run — measured on hono

Phase 5 shipped a single-run reference matrix across four conditions
(alpha / ca / beta / beta-ca) on six pre-registered prompts. Full
synthesis:
[phase-5-reference-run.md](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/phase-5-reference-run.md).

**Efficiency — CA vs Alpha (hono, 6 prompts):**

| Prompt | Bucket | Alpha calls | CA calls | Δ | Alpha $ | CA $ |
|---|---|---:|---:|---:|---:|---:|
| h1-context-runtime | win | 18 | 9 | **−50%** | $2.36 | $1.52 |
| h2-router-contract | win | 11 | 5 | **−55%** | $0.60 | $0.53 |
| h3-middleware-onion | win | 5 | 5 | 0% | $0.38 | $0.47 |
| h4-validator-typeflow | win | 21 | 6 | **−71%** | $2.95 | **$0.52** |
| h5-hono-generics | tie | 11 | 13 | +18% | $0.79 | $1.17 |
| h6-fetch-signature | trick | 3 | 4 | +33% | $0.17 | $0.29 |
| **aggregate** | | **69** | **42** | **−39%** | **$7.25** | **$4.50 (−38%)** |

**Efficiency — Beta-CA vs Beta (Claude Code CLI harness):**

Beta-CA cost was lower than Beta on every measured prompt. Aggregate
across 5 cells: Beta $1.43 → Beta-CA $0.68 (**−52%**). h6 beta-ca was
not measured — the run halted at the $14 budget ceiling after 23 of
24 cells. The cross-harness trick-bucket trajectory is captured in
the synthesis document.

**Highlights:**
- **h4-validator-typeflow** — 7.3× cheaper ($2.95 → $0.52) at
  equivalent answer depth. CA opens with the governing ADR by
  number; alpha reconstructs the architecture from source.
- **Tie/trick buckets** (h5, h6) show CA net-negative, as RUBRIC
  predicted — CA over-engineers on questions where architectural
  intent doesn't carry load (TS-compiler-space or trivial lookup).
  Bucket-aware methodology surfaces these expected cases rather
  than burying them.
- **Within-harness comparisons only.** Alpha-vs-beta cost deltas
  conflate model pricing, CLI caching, and harness architecture.
  See RUBRIC.md §System prompt asymmetry.

### Cross-language replication — Phases 6 + 7

Cross-language replication validated on Python (httpx, Phase 6) and
Go (cobra, Phase 7). The c1/h1/p1 architectural-intent win mechanism
is consistent across all three languages. Go's grep-friendly naming
convention reduces the magnitude of CA's efficiency advantage on
dispersed-symbol prompts (see Phase 7 §5.1 for paradigm sensitivity
finding).

- **Phase 6 — httpx (Python):**
  [phase-6-httpx-reference-run.md](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/phase-6-httpx-reference-run.md)
- **Phase 7 — cobra (Go):**
  [phase-7-cobra-reference-run.md](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/phase-7-cobra-reference-run.md)

### Phase 8 reference run — v0.3 cross-target measurement

Phase 8 (`ContextAtlas-benchmarks/research/phase-8-v0.3-reference-run.md`)
re-ran the locked pre-registered prompt sets against v0.3-sharpened
atlases at the same pinned target SHAs as Phase 5/6/7 — apples-to-apples
comparison. Headline finding: **adding ContextAtlas to a Claude Code
session reduces token consumption by 45–72% on architectural-intent
prompts vs Claude Code without ContextAtlas, replicated across all
three target languages (Go / Python / TypeScript).**

Four named findings:
- **Theme 1.2 fix VALIDATED** on Phase 6 p4-stream-lifecycle (the
  canonical "muddy bundle" cell): ca uses 57% fewer calls and 46%
  fewer tokens vs v0.2.
- **Stream B docstring source value VALIDATED** across win/tie/trick
  buckets: −45% to −72% tokens in win-bucket cells; no over-engineering
  on tie/trick.
- **Theme 1.1 multi-symbol API closure VALIDATED** on cobra
  c4-subcommand-resolution (Phase 7 §5.1's grep-ceiling case): beta-ca
  uses the multi-symbol shape with 2 of 3 named symbols matching;
  Phase 7's predicted closure pattern realized.
- **Phase 7 §5.3 cross-harness hypothesis FALSIFIED.** "CA delivers
  larger gains in CLI harnesses than in SDK harnesses" does not
  replicate on v0.3 substrate — cobra (CLI) never ranks first across
  absolute / mean / median framings. Production-tool implication:
  ContextAtlas isn't CLI-niche; SDK and library users get equal or
  larger benefit.

Methodology limit per Step 12 Path 3b: Beta-vs-Beta+CA reporting
carries the documented atlas-file-visibility caveat (bias direction
conservative — actual CA contribution is likely larger than published
numbers indicate). v0.3 ships under single-run methodology (n=1 per
cell); blind-grading quality-axis measurement is v0.4 scope.

### Quality axis — measured at v0.5 with paired-mode LLM-judge methodology

V0.5 ships full quality-axis blind-grading methodology under
paired-mode anonymization (per ADR-19 + Phase-9 reference doc).
Cross-cell rollup paired-t at N=27 differences per axis (5 anchor
cells × n=5 trials × 2 conditions; hono h1 auto-stretch to n=8)
distinguishes on 3 of 4 quality axes:

- **factual_correctness:** mean Δ +0.370; CI [0.176, 0.565] —
  CLEAN
- **hallucination:** mean Δ +0.296; CI [0.032, 0.561] —
  BORDERLINE
- **actionability:** mean Δ +0.148; CI [0.005, 0.291] —
  BORDERLINE
- **completeness:** mean Δ +0.037; CI [-0.039, 0.113] — NOT
  distinguishable

**Threshold pre-registration disclosure.** Three-tier
distinguishability framing locked at Step 9.1.b spot-check
before precision values computed (Option α strict three-tier:
≥0.05 = CLEAN; 0.001-0.05 = BORDERLINE; ≤0 = NOT
distinguishable). No goalpost-shifting after data; thresholds
honored verbatim. Hallucination CI lower bound 0.032 is below
the 0.05 clean-tier threshold but well above the 0.001
borderline-floor — peer-review-defensible borderline
classification, not clean. Completeness NOT distinguishable
preserved honestly per threshold pre-registration discipline.

**Methodology defensibility.** Paired-mode anonymization (5-step
protocol per ADR-19 §3) controls for stylistic identification
between conditions; paired-t statistical primitive (per ADR-19
§4 amendment 2026-05-03 replacing unpaired-pooled) increases
inferential power on per-cell-paired comparisons. Single-judge-
model methodology (Sonnet pass-1 vs pass-2 within-judge
consistency ≥80% per axis); cross-vendor judge-panel graduation
deferred to v0.6+. Substrate scope: 5 anchor cells (not full-
matrix replication; matrix-replication graduation v0.6+); n=5
per-cell trials × 2 conditions (hono h1 auto-stretch n=8).

Full per-axis paired-t CI numerics + cycle-thesis evaluation +
9 named findings at the [Phase-9 reference doc](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/phase-9-v0.5-reference-run.md)
§6 + §8 + §7.

### Quality axis — v0.6 cycle 8-cell matrix-replication subset

V0.6 cycle ran targeted matrix-replication subset (5 v0.5 anchor
cells + 3 v0.6 new tier-gradation test points = 8 cells × n=5
trials × 2 conditions = ~80 trials) to test v0.5 tier-gradation
generalization beyond anchor-cell substrate. **2 of 4 axes
DIVERGED** in v0.5-vs-v0.6 tier-gradation comparison:
factual_correctness CLEAN→BORDERLINE; actionability
BORDERLINE→NOT distinguishable. Hallucination + completeness
tier-gradation preserved.

**F1 PRIMARY finding — atlas-substrate-version confound.** v0.5
baseline measured against v0.4.0 atlas; v0.6 measurements
against v0.5.0 atlas. 5 v0.5 anchor cells (identical prompts;
identical methodology) attenuate 28-100% on ALL 4 axes when
re-run against v0.5.0 substrate. Decomposition rules out
noise-increase as primary mechanism; atlas-substrate-version-
correlated effect shift is primary. Causal mechanism
investigation deferred to v0.8+ post-launch cycle. F9
methodology-design-gap pattern observation: tag-AND-control
pattern (not just tag-only) needed for cross-cycle methodology
comparison.

**V1.0 ship-gate criterion #1 statistically-meaningful-wins
status.** PARTIAL via v0.6 8-cell subset (DIVERGED 2-of-4 axes);
closes at v0.8+ full matrix-completion + F1-F9 methodology
amendments per launch-bearing reframe. Honest 2-of-3 MET + 1
carried forward framing — no over-claiming. v1.0 ship-gate
criterion #1 quality-axis methodology parenthetical CLOSED at
v0.5 preserved; statistical-wins gate carries forward to v0.8+.

Full per-cell paired-t CI numerics + 9 named v0.6 findings + 5
methodology amendment scope items at the [Phase-10 reference
doc](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/phase-10-v0.6-reference-run.md).

Cross-repo and cross-language validation shipped in v0.2 — see
the Phase 6/7 links above and [`v0.2-SCOPE.md`](docs/cycles/v0_2/v0.2-SCOPE.md)
for context. v0.3 Phase 8 cross-target measurement at the Phase
8 link above.

**Dogfooding.** Throughout development, ContextAtlas indexes its own
ADRs and is used by Claude Code during work on ContextAtlas itself.
ADRs written for ContextAtlas (tool interface stability, symbol ID
format, extraction pipeline stages) constrain future changes to the
tool the same way they constrain generated code. Recursive test: if
the tool helps us ship the tool, it'll help others too. This is a
development practice, not part of the measured benchmark matrix —
the four-condition matrix runs only against the three external
targets above.

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

**Infrastructure (shipped in v0.1 + v0.2):**
- [x] Core MCP server skeleton
- [x] TypeScript language adapter (via `typescript-language-server`)
- [x] Python language adapter (via Pyright, ADR-13)
- [x] **Go language adapter (via `gopls`, ADR-14) — v0.2**
- [x] **Ruby language adapter (via `ruby-lsp` + `ruby-lsp-rails`,
  ADR-21) — v0.9**
- [x] Adapter conformance test suite (identical behavioral contract
  across all four adapters)
- [x] Opus 4.7 index-time extraction pipeline (validated: 100% parse
  success across 12 production-grade documents tested)
- [x] SQLite storage with SHA-based incremental reindex
  (atlas schema v1.4 — v0.2 added `parent_id` support for
  flattened-child symbols required by ADR-14's interface
  method handling; v0.3 added `generator.contextatlas_commit_sha`
  per ADR-11's additive-versioning pattern; v0.4 + v0.5 + v0.6
  unchanged at v1.3; v0.7 bumped to v1.4 at Step 2.3.a.1 per
  canonical AtlasFileV1 schema enforcement substrate)
- [x] Git integration (recent commits, co-change, hot-path signals)
- [x] Compact output format (default) + JSON format (opt-in)
- [x] Benchmark harness (in the separate
  [ContextAtlas-benchmarks](https://github.com/traviswye/ContextAtlas-benchmarks)
  repo; see the linked Benchmarks and Methodology section below)

**Benchmark assets:**
- [x] Production-grade ADRs for benchmark targets (5 hono + 5 httpx
  + 8 cobra)
- [x] Self-ADRs for ContextAtlas's own architectural decisions
- [x] Extraction pipeline validated end-to-end on real ADRs
- [x] Three benchmark repositories: hono (TypeScript), httpx
  (Python), cobra (Go) — three-language baseline
- [x] **Phase 5 reference run (hono)** — 50–71% tool-call reduction
  on architectural win-bucket prompts; full synthesis in
  benchmarks repo
- [x] **Phase 6 reference run (httpx) — v0.2** — cross-repo
  validation; win-bucket pattern replicates on Python
- [x] **Phase 7 reference run (cobra) — v0.2** — cross-language
  validation; c1/h1/p1 architectural-intent invariant confirmed;
  three v0.3+ findings (Go grep-ability sensitivity, atlas-file
  visibility, cross-harness asymmetry hypothesis)

**v0.2 shipped (2026-04-25):** Adapter quality polish (Stream A) +
Go adapter via `gopls` (ADR-14) with cobra benchmark target +
cross-repo httpx reference run + cross-language cobra reference
run (Stream B). Three-language baseline established. Three v0.3+
investigation findings logged in benchmarks-repo Phase 7
synthesis. See [`v0.2-SCOPE.md`](docs/cycles/v0_2/v0.2-SCOPE.md) for the original
stream-level scope and the Phase 6/7 synthesis docs above for
empirical findings.

**v0.3 shipped (2026-04-28):** Stream A atlas precision (Theme 1.2
narrower attribution + Theme 1.1 multi-symbol API per ADR-15 + Theme
1.3 atlas schema v1.3 with `contextatlas_commit_sha`); Stream B
docstring source extraction across TS/Python/Go; Stream C methodology
hardening (atlas-file-visibility filter + per-language cost priors +
cross-harness asymmetry comparison convention); Stream D Phase 8
reference run + supplement. Four named findings (3 VALIDATED + 1
FALSIFIED). Cumulative spend across Step 14 atlas re-extraction +
Step 15 reference run: $55.67. See [`v0.3-SCOPE.md`](docs/cycles/v0_3/v0.3-SCOPE.md)
for original stream-level scope; Phase 8 synthesis docs for empirical
detail.

**v0.4 shipped (2026-04-29):** Stream A substrate hardening (LSP
adapter timing-race robustness via two-readiness-signals
architecture per ADR-18; directory-aware test-file exclusion;
priors-derived ceiling defaults; commit-message extraction as
third claim source; cost-projection disclaimer in 5 user-facing
surfaces); Stream B contextatlas-on-itself dogfood + diagnostic-
only doctor script foundation (5 categories; 17-21 checks);
Stream C bounded-validity matrix-run replication (5 cells × n=2
trials; BOUNDED outcome; tokens median 4.4% / max 45.0%; three-
measurement convergence ~4-13% replication-noise-floor). Four
named findings: filter-shape vs content-richness distinction
VALIDATED; Q3 bifurcated reading SHIPPED; bounded-validity
replication CONFIRMED; cost-projection-vs-platform-billing
systematic 3x reduction VALIDATED. Cumulative spend: ~$43.80
script-projected / ~$14.50 platform-billed estimated; below
$50 ceiling. See [`v0.4-SCOPE.md`](docs/cycles/v0_4/v0.4-SCOPE.md) for original
stream-level scope.

**v0.5 shipped (2026-05-04):** Stream A LLM-judge harness +
rubric prompt + 5-step anonymization pipeline (per ADR-19;
position-bias post-hoc 0.538 NO TRIGGER); Stream B paired-t
statistical methodology + Phase-9 reference doc (4-level
aggregation including cross-cell rollup at N=27 differences per
axis; ADR-19 §4 amendment 2026-05-03 replaces unpaired-pooled);
Stream C adaptive cost priors + Pipeline Integration Discipline
(methodology riders #7/#8/#9/#12). Substrate: 5 anchor cells ×
n=5 trials × 2 conditions; hono h1 auto-stretch to n=8. Cross-
cell rollup distinguishes on 3 of 4 quality axes (1 CLEAN / 2
BORDERLINE / 1 NOT distinguishable per Option α strict three-
tier framing); threshold pre-registration honored. Nine named
findings (full text at Phase-9 reference doc §7): F1 PRIMARY
paired-mode unlocks rubric differentiation single-mode obscures;
F2-F9 per ref-doc §7. V1.0 ship-gate criterion #1 quality-axis
methodology parenthetical CLOSED at v0.5; statistically-
meaningful-wins gate remains open (matrix-replication graduation
v0.6+). Cumulative spend: ~$10.25 platform-billed reconstructed
/ ~12% of $51-97 base envelope. See [`v0.5-SCOPE.md`](docs/cycles/v0_5/v0.5-SCOPE.md)
for original stream-level scope.

**v0.6 shipped (2026-05-09):** Stream A pipeline-mechanics (A4
lazy-spawn + A6 doctor deep LSP health check + H5 multi-
dimension state-detection + A7 self-use onboarding pipeline +
B13-flag stub per pending-resolution architecture); Stream B
targeted matrix-replication subset (8 cells × n=5 × 2 conditions
= ~80 trials; DIVERGED 2-of-4 axes vs v0.5 anchor-cell baseline
per Phase-10 §8; F1 PRIMARY atlas-substrate-version confound
surfaced + 9 named findings at Phase-10 ref-doc); Stream C
cohort infrastructure (feedback template + tool-description
observability + ADR-20 consent contract + recruitment
infrastructure + B17 self-use logging hybrid capture). Tier 3
cohort exposure cancellation per Q7.0.9 pre-registration framing
— recruitment infrastructure ships at v1.0 ready for v0.8+
post-launch cohort exposure execution per launch-bearing reframe
(Travis pivot at v0.6 Step 7.5 — v0.7 = launch-bearing not
substrate-generation). V1.0 ship-gate status post-v0.6:
criterion #1 parenthetical CLOSED at v0.5 (preserved); criterion
#1 statistically-meaningful-wins PARTIAL via 8-cell subset →
v0.8+ matrix-completion; criterion #2 PARTIAL via Step 4.5
pipeline-mechanics → v0.7 empirical verification; criterion #3
NOT MET via Tier 3 cancellation → v0.8+ post-launch. Honest
2-of-3 MET + 1 carried forward framing. See
[`v0.6-SCOPE.md`](docs/cycles/v0_6/v0.6-SCOPE.md) for original stream-level
scope; [`v0_7-HANDOFF.md`](docs/cycles/v0_7/v0_7-HANDOFF.md) for v0.7 launch-
bearing reframe + v0.8+ deferral substrate.

**v0.7 shipped (2026-05-12):** Launch-bearing cycle ship to v1.0
public launch substrate complete, under 3-tier scope (PRIMARY
claude-code-only + SECONDARY install/setup + TERTIARY deferred).
PRIMARY (a): Path-3 entry-point-determined architecture shipped
(CLI = Anthropic API direct; Skills = subscription-bounded;
ADR-02 graduation + re-amendment; Strategy pattern + Skills
mechanism + legacy deprecation cycle). PRIMARY (b): generate-
adrs feature shipped with investigative-depth-per-decision-
candidate workflow + canonical depth-floor mechanical
enforcement via `validate-adrs`; CLI substrate-equivalence
closed at Step 2.4.a (β-1 extended thinking 32k budget + β-2
auto-invoke validate-adrs post-generation). SECONDARY:
contextatlas-on-itself dogfood at Step 3 atlas refresh (CLI
Phase 4 SHA-diff incremental empirically validated; α SKILL.md
`/index-atlas` refresh-aware workflow amendment). TERTIARY
substrate-gap fixes deferred to v0.8+ per locked scope. 4-
cohort entry-surface framing shipped (CLI + Skill × cold-start
+ reference-context). 15 Class-15 cycle-execution observations
captured (capstone composition). 21 v0.8+ forward-pointer
candidates consolidated at
[`research/v0.8-candidates.md`](research/v0.8-candidates.md).
V1.0 ship-gate status post-v0.7: 2-of-3 MET + 2 carried-forward
(criterion #1 parenthetical CLOSED at v0.5 preserved; criterion
#1 statistically-meaningful-wins PARTIAL via v0.6 8-cell subset
→ v0.8+ matrix-completion; criterion #2 newly CLOSED at v0.7 via
PRIMARY (a) + PRIMARY (b) pipeline-mechanics empirical
verification; criterion #3 NOT MET via v0.6 Tier 3 cancellation
→ v0.8+ post-launch cohort exposure execution). See
[`v0.7-SCOPE.md`](docs/cycles/v0_7/v0.7-SCOPE.md) for original tier-level scope;
[`v0_8-HANDOFF.md`](docs/cycles/v0_8/v0_8-HANDOFF.md) for v0.8 cycle pre-planning
canonical bridge document.

**v0.8+ candidate observations queued.** Multiple complementary
substrates per post-v1.0-launch posture:
(1) [`research/v0.8-candidates.md`](research/v0.8-candidates.md)
captures the 21 v0.8+ forward-pointer candidates consolidated at
v0.7 cycle close (substrate evolution + mechanical absorption +
cohort UX refinement + test substrate + cross-cycle inheritance
categories);
(2) [`v0_8-HANDOFF.md`](docs/cycles/v0_8/v0_8-HANDOFF.md) v0.8 cycle pre-planning
canonical bridge document (forward-pointer scope handoff; post-
v1.0-launch posture; cohort exposure execution per v0.6 Tier 3
deferred; F1-F9 atlas-substrate-version confound causal
investigation; matrix-completion graduation per v0.6 8-cell
subset);
(3) [Phase-10 reference doc §9](https://github.com/traviswye/ContextAtlas-benchmarks/blob/main/research/phase-10-v0.6-reference-run.md)
captures cycle-emergent v0.7+ candidates surfaced during v0.6
execution (canonical inventory residual);
(4) [`research/v0.5-candidates.md`](research/v0.5-candidates.md)
remains canonical for residual unabsorbed v0.5+ items.
v0.8+ cycle target: post-v1.0-launch substrate-graduation + cohort
exposure execution.

**Deferred to future versions (see [ROADMAP.md](ROADMAP.md) for specifics):**
- README / `docs/` parsing for architectural claims (v0.8+
  candidate; docstring extraction shipped at v0.3 + ADR
  generation pipeline shipped at v0.7 via `contextatlas
  generate-adrs` CLI + `/generate-adrs` Skill paths per "What's
  Implemented Today" above)
- External dogfood trial (v1.0 ship-gate criterion #3) —
  recruitment infrastructure shipped at v0.6; trial execution
  deferred to v0.8+ post-launch cohort exposure cycle per
  launch-bearing reframe Tier 3 application
- Semantic embedding layer for `find_by_intent` (v0.8+, evidence-gated)
- Task-shaped bundle queries: `why_does_this_fail`, `onboard_to_feature`,
  `audit_change` (v0.8+ post-launch per launch-bearing reframe)
- Hot-path caching, claim capture from agent sessions (v0.8+ post-launch)
- Additional language adapters beyond Go — Rust, C#, Java (by demand)
- Web dashboard for index inspection (out of roadmap)
- VS Code extension (out of roadmap)

## Contributing

ContextAtlas is MIT licensed and welcomes contributions. Areas where
contribution will be especially valuable:

- **New language adapters.** The `LanguageAdapter` interface is small
  and stable. Adding Java, .NET, Rust, Kotlin, or other language
  support is a self-contained project. See
  [`docs/language-adapter-guide.md`](docs/language-adapter-guide.md)
  for the contributor onboarding walkthrough.
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

MIT. See [LICENSE](LICENSE).
