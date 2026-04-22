# ContextAtlas Roadmap

## Vision

ContextAtlas is a multi-layer signal fusion tool that serves architectural context to LLM agents via the Model Context Protocol (MCP). Rather than forcing agents to rediscover a codebase's architecture through repeated primitive tool calls (grep, find-references, read-file), ContextAtlas pre-computes and serves a fused view of symbol structure, architectural intent, version history, and eventually semantic similarity — all through task-shaped queries that collapse dozens of agent operations into a single call.

The goal: LLM agents reason **with** architectural context, not around its absence.

**Thesis:** LLM agents equipped with pre-computed multi-layer architectural context complete architectural tasks with measurably fewer tool calls **and** higher answer quality than agents that rediscover architecture per query.

Both axes matter. Efficiency wins on some prompts, quality wins on others, and the benchmark methodology is designed to surface both independently — a tool that halves tool-call counts without moving answer quality is a different result from one that improves answer quality at equal call cost, and both results count.

## Guiding Principles

These invariants carry across every version. They constrain scope and shape decisions:

- **Atlas is a portable, reviewable, committed artifact.** (See [ADR-06](docs/adr/ADR-06-committed-atlas-artifact.md).) The atlas.json file is the complete served surface. It travels with the code, survives PR review, and is reproducible from source+config. No runtime dependency on external state that isn't in the atlas. A team commits atlas.json alongside their code; anyone with the repo and the contextatlas binary can query it without re-extracting, re-authenticating, or fetching external resources.

- **No query-time LLM calls.** (See [ADR-02](docs/adr/ADR-02-extraction-sole-api-caller.md).) All reasoning happens at extraction time, once, producing durable claims. Query time is deterministic lookup. This bounds cost, latency, and unpredictability.

- **Evidence-gated upgrades.** New architectural features ship when benchmarks show they're needed, not when they sound good. Embedding-based search, per-symbol git attribution, semantic reranking — all are post-MVP, evidence-gated in their respective ADRs.

- **Signal fusion at query time, not ingest time.** Each signal source (LSP, ADRs, git, docs) is kept independent at storage. Queries compose across sources. This keeps ingestion cheap and lets new sources join the fusion without reshaping existing data.

- **MCP protocol correctness.** ContextAtlas advertises only callable tools, returns structured responses, and respects client tool-use contracts. The MCP surface is a stable contract, not an internal implementation detail — external consumers (Claude Code, Claude Desktop, other MCP clients) depend on correct behavior.

- **Do it right, not descope for timeline.** This is a multi-release project. Individual version scope isn't determined by external deadlines. When a decision surfaces between "ship the workaround" and "do it properly," we do it properly.

- **Dogfood always.** ContextAtlas indexes itself and is used during its own development. When the tool stops being useful for building itself, treat that as a signal about the tool, not an inconvenience to route around.

- **One-way migrations.** Atlas schema, symbol ID format, MCP tool shapes, and ADR decisions are forward-only. No back-porting, no dual-writing to support old formats alongside new. When a break is necessary, it lands as a deliberate version bump with a clear upgrade path, not as compatibility cruft.

## Architectural Layers

ContextAtlas implements signal fusion across four layers, each deterministic and LLM-complementary:

| Layer | What it provides | Backed by |
|-------|------------------|-----------|
| 1. LSP | Symbol structure — definitions, references, types, signatures | `tsserver`, Pyright¹ |
| 2. Semantic | Conceptual similarity — "find auth patterns like this one" | Vector embeddings (post-MVP, evidence-gated) |
| 3. Architectural | Intent, constraints, decisions — "why this code exists" | ADRs, design docs, PR descriptions, commit messages |
| 4. Version history | Change patterns, hotness, co-change — "what moves together" | `git log` extraction, analyzed at index time |

¹ Per-language adapter. Additional adapters (Go, Rust, C#, etc.) are representative future scope, not committed; each would ship in its own version.

Layer 1 provides correctness — the LSP truth of the code as it exists. Layer 2 provides conceptual bridging — connecting queries to code by similarity rather than keyword match. Layer 3 provides intent — why this code exists and what constraints govern it. Layer 4 provides recency and change patterns — what moves together, what's hot, what's been touched recently. The LLM handles reasoning and explanation; the layers handle structure and facts.

## Versions

Each version expands capability along defined axes. Scope boundaries are deliberate — versions do one thing well rather than approximating multiple things.

### Version dependency graph

Versions aren't a strict chain. Some unlock others; some can slip independently:

```
v0.1 ──┬── v0.2 (Python breadth)        — independent; can slip without blocking v0.3+
       │
       ├── v0.3 (claim enrichment)      — input for v0.4 (more text worth embedding)
       │                                  input for v0.5 (richer substrate for tasks)
       │
       ├── v0.4 (semantic layer)        — optional; v0.5 doesn't require it if BM25 holds
       │
       └── v0.5 (task-shaped queries)   — composes over v0.1–v0.4; headline wins live here

v0.6+ (enrichment backlog)              — orthogonal; each graduates to its own version
```

Practical implication: v0.2 slippage doesn't block v0.3+. v0.4 gates on v0.3 delivering enough text to make embedding worthwhile. v0.5 can ship without v0.4 if benchmark evidence doesn't justify the semantic layer.

### v0.1 — Serving architecture with hand-authored intent [IN PROGRESS]

**Delivers:**
- Layer 1 (TypeScript via tsserver)
- Layer 3 partial — intent claims extracted from hand-authored ADRs
- Layer 4 — git history signals (commits, hotness, co-change) via index-time extraction
- Three MCP tools: `get_symbol_context` (primitive), `find_by_intent` (intent query), `impact_of_change` (blast radius)
- Benchmark harness with four-condition measurement (alpha, ca, beta, beta-ca — see [RUBRIC.md](../ContextAtlas-benchmarks/RUBRIC.md) for condition definitions)
- Atlas v1.1 schema, portable + reviewable + self-describing

**Validates:**
- The serving architecture works end-to-end: source → extraction → claims → atlas → MCP → agent
- Architectural context measurably changes agent answer quality on architectural questions
- Multi-layer fusion (symbols + ADRs + git) composes correctly through thin-composite tools
- The benchmark methodology (pre-registered prompts, single-run reference, bucket-based expected outcomes) is sound

**Scope boundaries:**
- Single language adapter (TypeScript). Python deferred to v0.2.
- Intent claims come from ADRs only. Docstring / README / PR description extraction is v0.3.
- Task-shaped bundle queries beyond `impact_of_change` are v0.5.
- No semantic similarity. BM25 over claim text only.

**Status:** Steps 1-8, 10, 11 shipped. Steps 9 (Python adapter), 13 (full benchmark expansion) pending. MVP benchmark reference run pending main-repo atlas re-extraction.

> _Numeric success criteria for v0.1 will be retrofit after the MVP benchmark reference run produces real data. Setting thresholds pre-data would be false precision._

---

### v0.2 — Language adapter breadth [PLANNED]

**Delivers:**
- Python adapter via Pyright (proves ADR-03's plugin interface with a second implementation)
- Potentially additional adapters (Go, Rust, C# — scoped based on portfolio / dogfood needs)
- Adapter conformance test suite (both adapters pass the same behavioral tests)
- Benchmark extension to Python codebase (httpx prompts already pre-registered)

**Validates:**
- ADR-03's LanguageAdapter abstraction holds across fundamentally different LSP implementations
- The pipeline's language-agnostic layers (extraction, resolution, atlas) work identically across adapters
- Benchmark methodology generalizes beyond TypeScript

**Scope boundaries:**
- No new MCP tools. Existing three tools gain language coverage.
- No new signal sources. v0.2 is breadth, not depth.

---

### v0.3 — Claim source enrichment [PLANNED]

**Delivers:**
- Docstring extraction (JSDoc, docstrings, XML doc comments) as claim source
- README / `docs/` / `CONTRIBUTING.md` parsing for architectural claims
- Git commit message claim extraction (beyond the v0.1 regex for fix/bug/hotfix)
- PR description mining (via GitHub/GitLab API integration, opt-in)
- Claim provenance: every claim traces to its source (ADR-N, docstring at file:line, commit SHA, PR #)

**Validates:**
- The "ADR dependency" concern from v0.1 dissolves. Typical repos have SOME architectural signal even without dedicated ADRs.
- Claim provenance supports review workflows (which claims are high-confidence vs. speculative?)
- Signal fusion at query time handles multiple heterogeneous claim sources

**Scope boundaries:**
- No claim capture from agent sessions (v0.6+).
- Source ingestion is static (at extraction time), not continuous.

**Rationale:** This version directly addresses the concern that v0.1 is only useful for repos with curated ADRs. Most real repos have architectural signal scattered across docs, commit messages, and PR descriptions — v0.3 harvests it.

---

### v0.4 — Semantic layer [PLANNED, EVIDENCE-GATED]

**Delivers:**
- Vector embeddings over claim text (model TBD, evaluated against benchmarks)
- Semantic search mode in `find_by_intent` — "find code with similar intent" rather than keyword-matched intent
- Re-ranking combining BM25 + semantic similarity

**Validates:**
- Semantic search adds value beyond BM25 on real queries
- Benchmark methodology can detect the improvement

**Scope boundaries:**
- Embedding happens at index time, not query time. (Consistent with no-query-time-LLM principle.)
- Added only if v0.1/v0.3 benchmarks show BM25 insufficient. If BM25 is "good enough," v0.4 slips or skips.

**Gate:** See [ADR-09](docs/adr/ADR-09-find-by-intent-fts5-bm25.md) for the explicit fallback preference order (sanitizer → filters → tokenizer → embeddings).

---

### v0.5 — Task-shaped bundle queries [PLANNED]

**Delivers:**
- `why_does_this_fail(symbol, error)` — returns relevant symbols + recent commits + related ADRs + failing tests, pre-correlated
- `onboard_to_feature(feature_name)` — minimum context pack to edit a feature safely
- `audit_change(diff_or_branch)` — architectural review of a proposed change
- Progressive disclosure with stable IDs — summaries first, detail on demand by ID

**Validates:**
- Task-shaped bundles deliver the efficiency collapse the thesis predicts (one tool call replaces 12+ primitive calls)
- The abstraction "task" is expressible in MCP tool schemas cleanly
- Agents adapt tool-use patterns when given task-shaped options

**Scope boundaries:**
- Each task is a thin composite over existing primitives. No new substrate.
- Task registry is small and curated. Not a general task-definition framework.

**Why this is where the headline wins land:** Per the thesis, "every tool call has fixed overhead, so the win is doing more per call, not calling faster." v0.5 is where ContextAtlas shifts from "primitive MCP server" to "task-level assistant."

---

### v0.6+ — Enrichment backlog [PLANNED]

Not a monolithic version — a holding area for promoted work. Each entry graduates to its own version when benchmark evidence, user feedback, or portfolio demand justifies the build. The "versions do one thing well" rule still applies: v0.6 ships exactly one of these, not all, and the others stay in backlog.

- **Hot-path caching.** Log query patterns across sessions; pre-compute cached answers for top-N queries.
- **Claim capture from agent sessions.** When agents derive architectural insights during exploration, capture them as proposed claims for human review and promotion.
- **Blame/attribution signals** (non-political framing — "recently active contributors to this area" for context, not ownership assertion).
- **Branch diversity signals** (merge conflict risk surfacing).
- **LLM-aided commit message classification** at index time (richer risk signals than regex).

Each becomes its own ADR when promoted from "tracked" to "planned." Evidence for promotion: benchmark shows the gap, user feedback identifies the need, or portfolio demand justifies the build.

---

### v1.0 — Thesis realized [PLANNED]

**Delivers:**
- All four architectural layers operating together
- Task-shaped bundle queries as the primary interface
- Signal enrichment removes hard dependency on human-authored claims
- Benchmarks demonstrate meaningful efficiency AND quality improvements vs. baseline agent usage
- Stable API contract for external consumers
- Documentation suitable for external adoption

**Validates:**
- The original thesis: agents with pre-computed multi-layer architectural context perform measurably better than agents rediscovering architecture per query.

**Ship criteria** (replace "thesis realized" as an abstract target — these are the testable gates for the v0.x → v1.0 transition):

- Four-layer fusion proved on at least two independent repo benchmarks with statistically-meaningful wins on both the efficiency and quality axes
- At least one external dogfood trial completed — reviewer, friend, or open solicitation. (Full external adoption is a v1.x story, not a v1.0 blocker. The gate is "someone else ran it on their code and reported back," not "ten teams depend on it.")
- No pending scope-affecting ADRs — the architectural surface is frozen at ship
- Benchmark reproduces across Claude model versions without per-model tuning

**Scope boundaries:**
- v1.0 is "the thesis working," not "everything possible." Feature completeness against the thesis, not against all imaginable extensions.

## Explicit Non-Goals

These are things ContextAtlas is deliberately **not** trying to be:

- **Not a general-purpose LSP wrapper.** LSP is a layer input, not the product.
- **Not an IDE replacement.** Integration with agents, not humans-at-keyboards.
- **Not a blame or ownership tool.** Version history is architectural signal, not political signal. "Who owns this" is outside scope.
- **Not trying to solve the general case of any single layer.** Semantic search, architectural graph extraction, LSP protocol itself — each has specialist tools. ContextAtlas fuses them; it doesn't replace them.
- **Not a hidden magic box.** The atlas is reviewable. Claims have provenance. Decisions are documented in ADRs. Reviewability is core value, not optional.
- **Not optimized for any single language ecosystem.** Generic across adapters. Specific tuning per language belongs in the adapter, not the core.
- **Not a linter or style-checker.** ContextAtlas serves context; it does not enforce rules or flag style violations. Teams run those tools separately.
- **Not a CI merge gate.** The `--check` staleness probe exists for teams that want to build gates; ContextAtlas itself does not block PRs.
- **Not a replacement for code review.** Claim surfacing and impact analysis augment review — they don't substitute for a human reading a diff.

## Rescope conditions

Honest about what would cause us to pause the roadmap and re-plan rather than push through:

- **Benchmark shows ContextAtlas consistently worse than baseline on a notable share of prompts** → investigate cause before adding features. The evidence-gated principle applies in reverse too: don't layer new work on a foundation the data says is underperforming.
- **ADR-gated architectural assumption breaks under external dogfood** → ADR amendment before the next version ships, not a workaround in code. ADRs are load-bearing; if one is wrong, fix the decision, not the symptom.
- **Claude model shift narrows or erases the baseline gap** → re-measure before claiming value. The thesis isn't "tool good," it's "tool measurably better than this model's baseline." If the baseline improves past us, that's a signal.
- **Extraction cost scales poorly on large codebases (>10k files)** → investigate streaming / batched / incremental modes before claiming general applicability. The cost envelope has to be believable for the thesis to transfer to real teams; a tool that costs $500 per reindex isn't "multi-layer signal fusion at reasonable cost."

These aren't automatic kill-switches — they're triggers to stop adding features and re-plan in the open.

## How this document relates to others

ContextAtlas has multiple docs serving different readers. This roadmap is the strategic view — what's built, what's next, what's not. The documents below serve specific contexts:

- **[README.md](README.md)** — What ContextAtlas is, how to use it, current feature status
- **[DESIGN.md](DESIGN.md)** — Architectural design in technical detail
- **[docs/adr/](docs/adr/)** — Specific architectural decisions with rationale
- **[CLAUDE.md](CLAUDE.md)** — Guidance for AI collaborators working on this repo
- **STEP-\*-PLAN.md** (in benchmarks) — Current-version build plan (v0.1)
- **[RUBRIC.md](../ContextAtlas-benchmarks/RUBRIC.md)** (in benchmarks repo) — Measurement methodology

## Open questions (tracked, not decided)

These are architectural choices that will need answering as later versions approach but don't need answering today:

1. **Claim review workflow at scale.** v0.3+ introduces heterogeneous claim sources (ADRs, docstrings, commit messages, PR descriptions). How do teams triage claim quality when the atlas contains thousands? Promotion UI? Severity by source? Batch review?

2. **Adapter plugin model.** If ContextAtlas supports 10+ languages (v0.2+), do adapters live in-tree or externalize? What's the stability contract for external adapter authors?

3. **Claim update vs. append semantics.** When ADRs are revised or docs are updated, do we overwrite existing claims, version them, or append-and-mark-superseded? Affects git-like atlas history.

4. **Multi-repo atlases.** For monorepos or related-repo collections, does ContextAtlas compose atlases or does each repo have its own?

5. **Privacy / sensitive code handling.** Claim extraction at commercial scale eventually needs a story for "don't put these phrases in the atlas." Opt-out mechanisms, pattern filters, org-level controls.

6. **Cost envelope at enterprise scale.** Extraction spends real API budget. What policy surface do org-level consumers need — per-run ceilings, per-repo throttles, cost-to-refresh estimates? Ties directly to the "extraction cost scales poorly" rescope trigger above.

7. **Generalization beyond pre-designed benchmarks.** The pre-registered benchmark repos (hono, httpx) were chosen deliberately. Does the tool help on a repo we didn't pre-analyze, where we couldn't design the prompt set? How do we validate generalization without just designing new benchmarks indefinitely?

8. **Agent learning over time.** v0.6+ mentions claim capture from agent sessions as a backlog item. The broader question is what the atlas learns from usage. Is it entirely human-curated? Agent-proposed with human promotion? Automatic inclusion with periodic review? The answer affects how ContextAtlas positions relative to static documentation tools — a tool that gets smarter with use is different from a tool that's frozen at extraction time.

Tracked here, not committed to a version. Each gets its own ADR when approached.
