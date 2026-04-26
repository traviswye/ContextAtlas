# ContextAtlas Roadmap

## Vision

ContextAtlas is a multi-layer signal fusion tool that serves architectural context to LLM agents via the Model Context Protocol (MCP). Rather than forcing agents to rediscover a codebase's architecture through repeated primitive tool calls (grep, find-references, read-file), ContextAtlas pre-computes and serves a fused view of symbol structure, architectural intent, version history, and eventually semantic similarity — all through task-shaped queries that collapse dozens of agent operations into a single call.

The goal: LLM agents reason **with** architectural context, not around its absence.

**Thesis:** LLM agents equipped with pre-computed multi-layer architectural context complete architectural tasks with measurably fewer tool calls **and** higher answer quality than agents that rediscover architecture per query.

Both axes matter. Efficiency wins on some prompts, quality wins on others, and the benchmark methodology is designed to surface both independently — a tool that halves tool-call counts without moving answer quality is a different result from one that improves answer quality at equal call cost, and both results count.

In product terms: ContextAtlas is the MCP server that sits under Claude Code, helping it work better on the real user repo it's connected to. This is a production tool for developers, not a research experiment — the benchmark methodology exists to ensure the tool actually delivers value to users.

## What ContextAtlas Is FOR

ContextAtlas is a production tool for developers. Specifically: an MCP server that sits under Claude Code, helping it work better on the real user repo it's connected to. Every Claude Code session starts with zero context about the repo — ContextAtlas provides curated architectural context (claims keyed to symbols, with structural facts from LSP and git signals) so Claude Code's reasoning is grounded rather than rediscovered.

The "life improvements for Claude" this tool targets:

- **Token-burn reduction.** A single `get_symbol_context` call returns what 12+ primitive tool calls (grep, find-references, read-file, git-blame) would have returned, fused. Claude Code spends fewer tokens on discovery and more on reasoning.
- **Architectural context surfacing.** Decisions captured in ADRs, design docs, and commit messages — invisible to Claude Code today — surface alongside code structure. Claude Code respects architectural constraints rather than discovering them after a user catches a violation.
- **Session-to-session continuity.** Atlas state lives in `atlas.json`, committed alongside code. New sessions inherit the team's accumulated architectural knowledge instead of starting fresh.

**This is a production tool, not a research experiment on Claude technology.** The benchmark repo ([ContextAtlas-benchmarks](https://github.com/traviswye/ContextAtlas-benchmarks)) is measurement instrumentation for improving the developer tool — its purpose is to better the main repo, not to publish a research artifact. Methodology serves production utility, not vice versa.

The methodology rigor is load-bearing for the goal. v0.1-v0.3 maintained reference runs, ship-blocker canaries, evidence-gated decisions, and multi-instance critique loops precisely because that discipline produces the developer tool — it ensures the tool actually delivers value rather than shipping plausible-sounding improvements that don't hold up under measurement. It's not separate from the goal; it's how the goal gets achieved.

The test question for scope and technical decisions is: *does this make ContextAtlas more useful as the MCP server under a developer's Claude Code on their real user repo?* Methodology is the means; the developer tool is the end. When token-burn-reduction conflicts with measurement-purity, or when feature-shipping conflicts with rigorous-validation, the developer tool's utility on real user repos is the resolving criterion.

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

**What this means in a real Claude Code session.** When a developer asks Claude Code "why does OrderProcessor have to be idempotent?", the four layers compose into a single response: Layer 1 surfaces the symbol's location and type signature; Layer 3 surfaces ADR-07's "must be idempotent" constraint and its rationale; Layer 4 surfaces recent commits about the idempotency bug fix in the retry path; Layer 2 (post-MVP) surfaces conceptually-similar idempotent patterns elsewhere in the codebase. All four arrive in one MCP call. Without ContextAtlas, Claude Code rediscovers each signal via separate primitive tool calls — typically 10-15 of them, sometimes more — and synthesizes the result itself, burning tokens on discovery rather than on reasoning about the user's actual question. The layered architecture exists to collapse that discovery cost; the developer tool's value is the collapse.

## Key efficiency unlocks

ContextAtlas commits to a set of efficiency unlocks across the version arc. Each addresses a specific cost developers and Claude Code currently pay; each maps to a target version with current implementation status.

| Unlock | Description | Target | Status |
|---|---|---|---|
| Intent registry keyed to symbols | Architectural claims (ADRs, docs, commit messages) parsed into structured records, keyed to LSP symbols. Claude Code asks about a symbol; gets the design intent in the same response. | v0.1 | **Shipped** |
| Signal fusion at query time, not ingest time | Each signal source (LSP, ADRs, git, docs) stays independent at storage. Queries compose across sources. New sources join the fusion without reshaping existing data. | v0.1 | **Shipped** |
| LLM-native compact output format | Dense, stable, structured format optimized for token density. ~40-60% savings vs JSON on the same content (per ADR-04). | v0.1 | **Shipped** |
| Cross-session caching with SHA-based invalidation | Atlas claims cached per-file via `source_shas`; incremental reindex re-extracts only changed files. Unchanged code = zero re-extraction work. Atlas itself functions as the cross-session/cross-developer cache (committed artifact per ADR-06). | v0.1 (SHA-diff gating per ADR-12) | **Shipped** |
| Task-shaped bundle queries | One MCP call returns what would have taken 12+ primitive calls — `why_does_this_fail(symbol, error)`, `onboard_to_feature(feature)`, `audit_change(diff)`. The headline efficiency-collapse story. | v0.5 | Planned |
| Progressive disclosure with stable IDs | First response is summary with IDs; Claude Code pulls detail by ID when needed. Avoids returning 500-element lists verbatim. | v0.5 | Planned |
| Hot-path learning | Top-N queries across sessions cached as pre-computed bundles. Claude Code gets cached answer in one call instead of 15 discovery calls. | v0.6+ | Planned |

Each unlock targets a specific token-burn or architectural-context cost. The version arc is a deliberate sequencing — substrate first (v0.1-v0.4 build the layers), efficiency-collapse second (v0.5 ships task-shaped queries on the substrate), learning-based optimization third (v0.6+ refines from real usage). v1.0 ships when the substrate + efficiency-collapse + learning are operating coherently together.

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

### v0.1 — Serving architecture with hand-authored intent [SHIPPED]

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

**Scope boundaries (as designed):**
- Originally scoped single-language (TypeScript). Python adapter via Pyright landed late in v0.1 under [ADR-13](docs/adr/ADR-13-python-adapter-pyright.md) — validates the ADR-03 plugin interface ahead of v0.2.
- Intent claims come from ADRs only. Docstring / README / PR description extraction is v0.3.
- Task-shaped bundle queries beyond `impact_of_change` are v0.5.
- No semantic similarity. BM25 over claim text only.

**Status:** Shipped. All MVP steps (1–12) complete; step 13 (full benchmark expansion with blind grading) moved post-v0.2 per [`v0.2-SCOPE.md`](v0.2-SCOPE.md). Phase 5 reference run completed on hono at benchmarks commit `be65a96`.

**Empirical validation (Phase 5 reference run):**
- **50–71% tool-call reduction** on architectural win-bucket prompts (h1 18→9 calls, h2 11→5, h4 21→6)
- **7.3× efficiency gain** on h4-validator-typeflow showcase ($2.95 alpha → $0.52 CA at equivalent answer depth)
- Efficiency thesis empirically supported; tie/trick buckets behave as RUBRIC predicted (CA over-engineers on non-architectural prompts, by design)
- Quality-axis measurement deferred to step 13 (single execution post-v0.3 per v0.2-SCOPE.md)
- Full synthesis: [`../ContextAtlas-benchmarks/research/phase-5-reference-run.md`](../ContextAtlas-benchmarks/research/phase-5-reference-run.md)

---

### v0.2 — Language adapter breadth + cross-repo validation [SHIPPED]

**Delivers:**
- **Stream A — Adapter quality polish.** PyrightAdapter kind-mapping refinements, cost tracking in extraction pipeline, unresolved-candidate diagnostics, TypeScriptAdapter parity check, Claude Code CLI MCP disclaimer investigation (resolved as harness `--allowedTools` regression — fix shipped in benchmarks repo, ADR-14 documented for future hardening).
- **Stream B — Third language adapter + cross-repo benchmark.** Go adapter via `gopls` ([ADR-14](docs/adr/ADR-14-go-adapter-gopls.md)) + conformance suite; cobra as benchmark target (8 ADRs, prompts pre-registered); **httpx reference run** + **cobra reference run** — cross-repo + cross-language validation of the Phase 5 methodology.

Python adapter and conformance test suite shipped in v0.1 (commits 701dba3 → 6f8d8ae); v0.2 built on that foundation. Full scope: [`v0.2-SCOPE.md`](v0.2-SCOPE.md). Atlas schema bumped 1.1 → 1.2 (additive `parent_id` support for ADR-14's interface-method flattening — same pattern as ADR-11's 1.0 → 1.1 git-signal addition).

**Validates:**
- ADR-03's LanguageAdapter abstraction holds across three distinct LSP implementations (tsserver, Pyright, gopls).
- Phase 5 methodology replicates cross-repo (httpx, Phase 6) and cross-language (Go/cobra, Phase 7).
- "Works across languages and repos, not just authors' hand-picked TypeScript sample" — v0.2's core thesis empirically supported.

**Scope boundaries:**
- No new MCP tools. Existing three tools gained language coverage.
- No new signal sources (Stream C — docstring / README mining — moved to v0.3).
- No external-user trial (Stream D — moved to v0.3 alongside Stream C).
- h5-class TS-compiler-space gap not addressed (v0.4+ per [`v0.2-SCOPE.md`](v0.2-SCOPE.md) §Beyond v0.2 scope).

**Status:** Shipped 2026-04-25. All four v0.2-SCOPE.md success criteria satisfied via committed artifacts.

**Empirical validation:**
- **Phase 6 reference run (httpx, Python):** 24/24 cells clean, $8.11 cost (post-Step-7 amendment); cross-repo replication of Phase 5's win-bucket pattern. Full synthesis: [`../ContextAtlas-benchmarks/research/phase-6-httpx-reference-run.md`](../ContextAtlas-benchmarks/research/phase-6-httpx-reference-run.md).
- **Phase 7 reference run (cobra, Go):** 24/24 cells clean, $7.19 cost, 12-min wall clock — cleanest single run in the v0.1/v0.2 series. Three-language baseline established. Full synthesis: [`../ContextAtlas-benchmarks/research/phase-7-cobra-reference-run.md`](../ContextAtlas-benchmarks/research/phase-7-cobra-reference-run.md).
- **c1 / h1 / p1 architectural-intent win mechanism is consistent across all three languages.** Identical commands-as-data / context-runtime / sync-async-split architectural prompt produces clean CA wins on each.
- **Three v0.3+ investigation findings logged:** Go grep-ability paradigm sensitivity (Phase 7 §5.1, positive calibration), atlas-file-visibility benchmark methodology issue (Phase 7 §5.2, v0.3+ backlog candidate), cross-harness asymmetry hypothesis (Phase 7 §5.3, beta-ca-vs-beta consistently stronger than ca-vs-alpha — worth tracking through v0.3).

---

### v0.3 — Claim source enrichment + v0.2 follow-throughs [PLANNED]

**Delivers (claim source enrichment — original v0.3 scope):**
- Docstring extraction (JSDoc, docstrings, XML doc comments) as claim source
- README / `docs/` / `CONTRIBUTING.md` parsing for architectural claims
- Git commit message claim extraction (beyond the v0.1 regex for fix/bug/hotfix)
- PR description mining (via GitHub/GitLab API integration, opt-in)
- Claim provenance: every claim traces to its source (ADR-N, docstring at file:line, commit SHA, PR #)

**Delivers (v0.2 follow-throughs — promoted from Phase 7 findings):**
- **Multi-symbol `get_symbol_context` call shape** (or batched `find_by_intent` with explicit symbol disjunction). From Phase 7 §5.1 Go grep-ability finding: knowledgeable Grep retrieves multiple related symbols in one regex disjunction; CA's per-symbol fetches add overhead on flat-package languages. A multi-symbol call shape closes most of that gap.
- **Atlas-file-visibility benchmark methodology fix.** From Phase 7 §5.2: visible `atlases/<repo>/` artifacts in the benchmarks workspace can mislead the beta condition on prompts whose target symbol has a generic name. Recommended starting point: trace-time filter excluding cells where beta's trace references atlas paths. To be authored at `research/atlas-file-visibility-benchmark-methodology.md` (benchmarks repo).
- **Cross-harness asymmetry tracking.** From Phase 7 §5.3: across hono / httpx / cobra, the beta-ca-vs-beta delta is consistently stronger than the ca-vs-alpha delta. v0.3 reference runs should include this comparison explicitly to confirm or falsify the hypothesis on additional targets.

**Validates:**
- The "ADR dependency" concern from v0.1 dissolves. Typical repos have SOME architectural signal even without dedicated ADRs.
- Claim provenance supports review workflows (which claims are high-confidence vs. speculative?)
- Signal fusion at query time handles multiple heterogeneous claim sources.
- Phase 7's three findings either resolve into v0.3 deliverables or graduate to confirmed cross-target findings on additional benchmark runs.

**Scope boundaries:**
- No claim capture from agent sessions (v0.6+).
- Source ingestion is static (at extraction time), not continuous.

**Rationale:** This version addresses two concerns simultaneously: (1) v0.1's ADR-dependency concern (most real repos have architectural signal scattered across docs / commit messages / PR descriptions, not curated ADRs); (2) Phase 7's paradigm-sensitivity and methodology findings, which surfaced concrete next steps, not abstract directions.

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

### v0.5 — Task-shaped bundle queries + ADR-crafting pipeline [PLANNED]

v0.5 ships two related user-experience improvements — both make ContextAtlas more useful on the typical user repo.

**Deliverable A — Task-shaped bundle queries:**

- `why_does_this_fail(symbol, error)` — returns relevant symbols + recent commits + related ADRs + failing tests, pre-correlated
- `onboard_to_feature(feature_name)` — minimum context pack to edit a feature safely
- `audit_change(diff_or_branch)` — architectural review of a proposed change
- Progressive disclosure with stable IDs — summaries first, detail on demand by ID

**Deliverable B — Pipeline-driven ADR generation for repos without ADR culture:**

Most user repos — IC developer side projects, small open-source libraries, internal tools — don't have curated ADR culture. v0.1-v0.4 ContextAtlas requires either ADRs (best case) or docstrings (v0.3 fallback) for architectural-intent extraction; on repos with neither, the tool's architectural-context value is marginal.

v0.5's ADR-crafting pipeline closes that gap. When a user installs ContextAtlas on a repo without ADRs, an opt-in pipeline asks Claude to draft architectural decisions inferred from code patterns, commit history, and naming conventions. The user reviews drafts; accepted drafts become committed ADRs that ContextAtlas then indexes via the standard v0.1+ pipeline. v0.1's `adrs.path` config already supports externalized ADR locations (corporate teams often have ADRs in a separate docs repo); v0.5's pipeline composes with this so drafted ADRs can land at the configured path.

The motivation is production-utility: without this, ContextAtlas is most useful on repos with rich ADR culture — a small fraction of real user repos. The pipeline is what makes the tool useful on the typical user repo, including IC developer side projects and open-source projects without strong documentation discipline.

**Validates:**

- Task-shaped bundles deliver the efficiency collapse the thesis predicts (one tool call replaces 12+ primitive calls).
- ADR-crafting pipeline broadens ContextAtlas's user-base from "repos with ADR culture" to "repos with code, commits, and naming conventions" — closer to all user repos.
- The abstraction "task" is expressible in MCP tool schemas cleanly.

**Scope boundaries:**

- Each task is a thin composite over existing primitives. No new substrate.
- Task registry is small and curated. Not a general task-definition framework.
- ADR-crafting pipeline is opt-in per repo, never automatic. User reviews and approves drafts.
- Pipeline targets "repos without ADRs"; repos with existing ADRs use the standard v0.1+ extraction path unchanged.

**Why this is where the headline wins land:** Per the thesis, "every tool call has fixed overhead, so the win is doing more per call, not calling faster." v0.5 ships the task-level wins (Deliverable A) and broadens the user-base (Deliverable B). v0.5 is where ContextAtlas shifts from "primitive MCP server with ADR dependency" to "task-level assistant for any repo."

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

---

## Revision history

- **2026-04-25 — Phase A realignment.** Added "What ContextAtlas Is FOR" subsection capturing canonical product-positioning anchor (production tool for developers, not research experiment); added Vision tagline integration; added "Key efficiency unlocks" subsection consolidating the 7-item efficiency-collapse list across versions; expanded v0.5 section to include ADR-crafting pipeline as second deliverable alongside task-shaped queries; added developer-tool framing paragraph to Architectural Layers section. Realignment surfaced during Step 7 alignment check; framing source is Travis's anchor statement: *"The benchmark repo should only be used as a tool to better our main repo, whose ultimate goal is to be a production tool for developers to use with Claude Code to enable life improvements for Claude (the token burn, architectural context, etc)."* Non-revisionist amendments — existing content preserved.
