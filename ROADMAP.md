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
| Task-shaped bundle queries | One MCP call returns what would have taken 12+ primitive calls — `why_does_this_fail(symbol, error)`, `onboard_to_feature(feature)`, `audit_change(diff)`. The headline efficiency-collapse story. | v0.6+ | Planned |
| Progressive disclosure with stable IDs | First response is summary with IDs; Claude Code pulls detail by ID when needed. Avoids returning 500-element lists verbatim. | v0.6+ | Planned |
| Hot-path learning | Top-N queries across sessions cached as pre-computed bundles. Claude Code gets cached answer in one call instead of 15 discovery calls. | v0.6+ | Planned |

Each unlock targets a specific token-burn or architectural-context cost. The version arc is a deliberate sequencing — substrate first (v0.1-v0.4 build the layers), quality-axis methodology second (v0.5 ships LLM-judge methodology + paired-t cross-cell rollup), efficiency-collapse third (v0.6+ ships task-shaped queries on the substrate), learning-based optimization fourth (v0.6+ refines from real usage). v1.0 ships when the substrate + methodology + efficiency-collapse + learning are operating coherently together.

## Versions

Each version expands capability along defined axes. Scope boundaries are deliberate — versions do one thing well rather than approximating multiple things.

### Version dependency graph

Versions aren't a strict chain. Some unlock others; some can slip independently:

```
v0.1 ──┬── v0.2 (language adapter breadth)         — SHIPPED
       │
       ├── v0.3 (claim enrichment + sharpening)    — SHIPPED;
       │                                             input to v0.4 hardening
       │
       ├── v0.4 (production-installability)        — SHIPPED;
       │                                             substrate hardening +
       │                                             doctor script foundation +
       │                                             bounded validity
       │
       └── v0.5 (LLM-judge methodology +           — SHIPPED;
            quality-axis measurement)                paired-t cross-cell rollup
                                                     at N=27 + Phase-9 reference
                                                     doc + adaptive cost priors

v0.6+ (must-ship-before-v1.0; flexible)            — onboarding pipeline (most
                                                     natural v0.6); task-shaped
                                                     queries; semantic layer
                                                     (evidence-gated); remaining
                                                     claim sources; team workflow

v1.0+ (post-launch enrichment)                     — orthogonal; each graduates
                                                     to own version

v1.0 (public launch)                               — gates: onboarding pipeline +
                                                     quality-axis methodology +
                                                     community evidence +
                                                     external dogfood
```

Practical implication: v0.4 shipped 2026-04-29; v0.5 shipped 2026-05-04; v0.6+ specific version assignments at per-version scope-doc time, not now. v1.0 gates land via v0.99 final pre-launch scope-doc.

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

### v0.3 — Claim source enrichment + v0.2 follow-throughs [SHIPPED]

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

**Status:** Shipped 2026-04-28. All five v0.3-SCOPE.md success
criteria satisfied via committed artifacts.

**Empirical validation (Phase 8 reference run):**
- Theme 1.2 fix VALIDATED on Phase 6 p4-stream-lifecycle (ca −57%
  calls / −46% tokens vs v0.2; lead INTENT in v0.3 bundle differs from
  v0.2 confirming narrower claim attribution surfaces streaming-
  lifecycle-specific claim instead of v0.2's general non-streaming
  materialization claim).
- Stream B docstring source value VALIDATED across all three buckets
  (win-bucket beta-ca −45% to −72% tokens vs beta per-repo; no
  over-engineering on tie/trick).
- Theme 1.1 multi-symbol API closure VALIDATED on Phase 7 §5.1's
  cobra c4-subcommand-resolution canonical case (beta-ca uses
  multi-symbol shape with 2 of 3 named symbols matching; cross-target
  evidence on cobra c6 + httpx p4).
- Phase 7 §5.3 cross-harness asymmetry hypothesis FALSIFIED — cobra
  (CLI) never ranks first across absolute / mean / median framings.
  Production-tool implication: CA value robust across harness types;
  addressable audience broader than Phase 7 §5.3 framing suggested.

**Cumulative API spend:** $55.67 (Step 14 atlas re-extraction $22.97
+ Step 15 Phase A reference run $32.70). Vs scope-doc envelope
$23–39: scope expansion documented honestly per Step 14
cost-reconciliation precedent.

**Methodology limits acknowledged:** Step 12 Path 3b atlas-file-
visibility caveat preserved on Beta-vs-Beta+CA comparison (bias
direction conservative); single-run methodology (n=1 per cell);
quality-axis measurement deferred to v0.4 per scope-doc Stream D.

**Phase 7 v0.3+ findings resolution:**
- §5.1 grep-ceiling: closed via Theme 1.1 multi-symbol API.
- §5.2 atlas-file-visibility: methodology fix shipped (Step 12
  filter); v0.3 contamination rate 22.22% (vs v0.2's 23.94%; flat
  within ±2pp); cobra +8.33pp shift documented as v0.4 root-cause
  candidate.
- §5.3 cross-harness asymmetry: rigorously tested in Phase 8 §6;
  FALSIFIED.

**v0.4 candidate observations queued (12-item input for v0.4
planning):** quality-axis blind-grading methodology; clean-workspace
mode; BM25 ranking activation; per-target ceiling defaults;
multi-symbol API usage census; cobra contamination drift root-cause;
test-discipline npm-test standard; per-target retry-overhead modeling;
schema-version detection automation; directory-aware test-file
exclusion; chain α activation gate; Phase 7 §5.3 hypothesis
revisitation under multi-run.

---

### v0.4 — Production-installability foundation [SHIPPED]

**Thesis:** Make ContextAtlas production-usable end-to-end (install
→ atlas → query → trust the output) for a solo developer on an
existing TypeScript / Python / Go codebase. v0.3 proved the tool
*works on three pinned-SHA test repos under controlled conditions*;
v0.4 hardens the substrate so the same tool *works on a developer's
actual codebase* across the variance real-world environments
introduce (Node version drift, LSP server timing, non-standard
test-file layouts, atlas extraction on recent-not-pinned SHAs).

**Delivers (3 streams; full scope per [`v0.4-SCOPE.md`](v0.4-SCOPE.md)):**

- **Stream A — Substrate hardening + cost transparency + commit-
  message extraction.** LSP adapter timing-race robustness
  (bounded-poll pattern); directory-aware test-file exclusion;
  per-target ceiling defaults via priors-derived defaults; per-
  target retry-overhead modeling; cobra contamination drift root-
  cause; commit-message claim source extraction (bimodal-aware
  threshold); cost-projection disclaimer in 5 user-facing surfaces.
- **Stream B — Dogfood + doctor script.** ContextAtlas-on-itself
  extraction + concrete `get_symbol_context` query; doctor script
  foundation (diagnostic-only; config + atlas + SHA + schema +
  LSP + extraction-prerequisites checks). Acceptance test: doctor
  green on contextatlas + cobra HEAD.
- **Stream C — Bounded validity confirmation.** 5 high-leverage
  Phase 8 cells re-run at n=2 trials each (10 total trials);
  trial-variance measurement supports launch-document credibility
  line. NOT full quality-axis blind-grading methodology (that's
  v0.5+ scope).

**Validates:**
- ContextAtlas survives real-user variance.
- v0.3 findings replicate within trial variance (bounded validity;
  not full blind-grading).
- Production-tool-flavored items ship together as a coherent
  foundation for v0.5+ onboarding pipeline work.

**Scope boundaries:**
- Persona-narrowed: solo developer / existing codebase / TS-Python-
  Go. Other personas (new project; team; additional languages)
  defer to v0.5+ per explicit deferral discipline.
- Doctor script is diagnostic-only foundation. Full developer
  onboarding pipeline (configuration helper; ADR bootstrap;
  warm-up; lifecycle) is v0.5+ scope.
- No quality-axis claims published. Bounded validity stream is
  rigor-for-launch-credibility, not rigor-for-research-paper.

**Cost envelope:** $30-50 with $50 ceiling. Detailed in
[`v0.4-SCOPE.md`](v0.4-SCOPE.md) §"Cost envelope".

**Status:** Shipped 2026-04-29 (tag `v0.4.0`). Scope-doc shipped
2026-04-28 (commit `e8b5114`); execution Steps 1-11 across 11
working sessions. All 10 v0.4-SCOPE.md success criteria satisfied
via committed artifacts. Self-use atlas refreshed at ship SHA
(768 symbols / 825 claims; provenance matches HEAD). See
[`research/v0.5-candidates.md`](research/v0.5-candidates.md)
for canonical v0.5+ candidate reference (13 items across substrate
gaps / feature gaps / process improvements / methodology
hardening).

**Empirical validation (v0.4 cycle):**
- **Stream A substrate hardening shipped.** B2 LSP timing-race
  robustness via two-readiness-signals architecture (waitForServer
  Ready + waitForDiagnostics) across all 3 adapters; ADR-18
  documents cross-cutting pattern. A4 directory-aware test-file
  exclusion ships with conservative defaults; A1 priors-derived
  ceiling defaults + A2 retry-overhead modeling absorbed.
  Commit-message extraction lands as third claim source alongside
  ADR + docstring; conservative-default conventional-commits-
  flavored filter.
- **Stream B dogfood + doctor shipped.** ContextAtlas-on-itself
  extraction validates filter-shape vs content-richness empirical
  finding (ContextAtlas's step-stamped commit format yields 3.8%
  filter selectivity vs design-target ~30%; FAIL ≥30 floor; B3
  drop applied per Q3 bifurcated reading). Doctor script provides
  diagnostic-only foundation for v0.5+ onboarding pipeline (5
  categories; 17-21 checks; limited-mode for unconfigured repos).
- **Stream C bounded-validity outcome (BOUNDED):** 5 cells × n=2
  trials; 1/5 over 20% token-Δ (hono h1 45.0% — agent-decision
  branching at identical 5-call count, not methodology violation);
  0/5 over 50%. Aggregates: tokens median 4.4% / max 45.0%; cost
  median 8.4% / max 22.1%. Three-measurement convergence on
  ~4-13% replication-noise-floor (extraction-side, matrix-run
  tokens, cost-side). Launch-narrative credibility line locked in
  `phase-8-trace-analysis-supplement.md` §8.7 (benchmarks repo).

**Named findings:**
1. Filter-shape vs content-richness distinction VALIDATED.
2. Q3 bifurcated reading SHIPPED (≥30 floor = per-repo content
   gate; ≥50 ceiling = launch-narrative gate; honored
   independently).
3. Bounded-validity replication CONFIRMED (BOUNDED per scope-doc
   Step 9.4 lock).
4. Cost-projection-vs-platform-billing systematic 3x reduction
   VALIDATED (cobra $5.44→$1.82; httpx $5.53→$1.85; hono
   $10.89→$3.65; dogfood $7.62→~$3.7); validates Q5 cost-
   disclaimer scope-doc lock.

**Cumulative spend:** $43.80 script-projected / ~$14.50
platform-billed estimated; comfortably below $50 ceiling.

**Why this version:** v0.3 proved efficiency + bundle-precision
improvements; v0.4 hardens substrate so those improvements survive
real-user variance. Quality-axis blind-grading methodology defers
to v0.5+ — production-tool framing prioritizes installability
before research methodology rigor.

---

### v0.5 — Quality-axis blind-grading methodology + LLM-judge harness [SHIPPED]

**Thesis:** Establish quality-axis measurement methodology with
peer-review-defensible rigor. v0.4 shipped bounded validity (n=2;
explicit deferral of full blind-grading); v0.5 ships full LLM-judge
methodology under paired-mode anonymization with paired-t statistical
inference, closing v1.0 ship-gate criterion #1's "full quality-axis
methodology landed pre-v1.0" parenthetical.

**Delivers (per [`STEP-PLAN-V0.5.md`](STEP-PLAN-V0.5.md)):**

- **Step 3-4 — Rubric + anonymization.** Single + paired rubric
  prompts; 5-step anonymization pipeline (strip-list, A/B
  randomization via SHA256 seed, format-ignoring instruction,
  post-hoc position-bias verification, conditional style-normalize
  stretch). [ADR-19](docs/adr/ADR-19-llm-judge-methodology.md)
  documents the methodology.
- **Step 5 — Statistical primitives.** Paired-t CI primitives +
  4-level aggregation (per-trial / per-cell / cross-cell rollup
  Option B-2 at concatenated N=27 differences); ADR-19 §4
  amendment 2026-05-03 commit `05c9fc7` replaces unpaired-pooled
  with paired-t. Sample standard deviation (Bessel's correction).
- **Step 6 — Within-judge consistency calibration.** 10 trials × 2
  passes; ≥80% within-1-point per axis gate. Branch D adjudication
  surfaced single-mode-vs-paired-mode rubric differentiation
  (subsequently revealed at Step 8 to be MODE-SPECIFIC not
  structural — paired-mode unlocks rubric differentiation that
  single-mode obscured; F1 PRIMARY).
- **Step 7-8 — Production grading harness.** 5 anchor cells × n=5
  trials × 2 conditions; hono h1 auto-stretch to n=8 (28 paired
  comparisons + 7 cross-presentation-order regrades; deterministic
  shuffle). Position-bias post-hoc 0.538 — NO TRIGGER (clean below
  strict 0.60).
- **Step 9 — Cross-cell rollup synthesis.** Paired-t at N=27
  differences per axis; threshold pre-registration honored
  (Option α strict three-tier framing locked at Step 9.1.b
  spot-check before precision values computed).
- **Step 10 — Adaptive cost priors + Pipeline Integration
  Discipline.** Adaptive priors aggregation (atlas-version-based
  filter; v0.4.0+ tagged substrate; cumulative aggregation;
  cost-priors-v0.5.json versioned snapshot). Pipeline Integration
  Discipline section added to CLAUDE.md (verify-precedent-before-
  drafting invariant for new claim sources).

**Validates:**
- LLM-judge methodology under paired-mode anonymization produces
  peer-review-defensible quality-axis measurements.
- Cross-cell rollup paired-t at N=27 differences per axis surfaces
  graded distinguishability across factual_correctness (CLEAN +0.370)
  / hallucination (BORDERLINE +0.296) / actionability (BORDERLINE
  +0.148) / completeness (NOT distinguishable +0.037).
- 76% tie rate validates anonymization (judge cannot identify
  conditions from format alone).
- 12:1 ca-favored direction asymmetry as independent inferential
  lens corroborates paired-t inference.

**Scope boundaries:**
- Quality-axis measured at v0.5 anchor-cell substrate (5 cells;
  not full-matrix replication; matrix-replication graduation is
  v0.6+ candidate).
- Calls-bucket reporting (1-3 / 4-7 / 8+) addresses small-N
  quantization-noise concern carried from v0.4.

**Status:** Shipped 2026-05-04 (tag `v0.5.0`). All
STEP-PLAN-V0.5 success criteria satisfied; cross-cell rollup
distinguishability ranges from CLEAN to NOT-distinguishable
across the 4-axis rubric; honest scope-narrative discipline
honored throughout.

**Empirical validation:**
- **Cross-cell rollup paired-t at N=27 (cycle-thesis; ref-doc §6 +
  §8):** factual_correctness mean Δ +0.370; CI [0.176, 0.565] —
  CLEAN. hallucination mean Δ +0.296; CI [0.032, 0.561] —
  BORDERLINE (LB below 0.05 clean-tier threshold but well above
  0.001 borderline-floor). actionability mean Δ +0.148; CI
  [0.005, 0.291] — BORDERLINE. completeness mean Δ +0.037; CI
  [-0.039, 0.113] — NOT distinguishable.
- **Mode-specific rubric differentiation finding (F1 PRIMARY at
  ref-doc §7):** paired-mode unlocks differentiation that single-
  mode obscured; Branch D adjudication at Step 6 originally read
  as structural, Step 8 evidence revealed mode-specificity.
- **Anonymization validation (ref-doc §6 statistical + §7 F2):**
  76% tie rate; position-bias post-hoc 0.538 (clean below strict
  0.60 trigger).
- **Adaptive cost priors:** v0.4.0+ atlas-version-tagged substrate;
  cumulative aggregation; methodology provenance fields captured
  in cost-priors-v0.5.json for future archaeology readers.

**Named findings (9 total; canonical at
[`research/phase-9-v0.5-reference-run.md`](../ContextAtlas-benchmarks/research/phase-9-v0.5-reference-run.md)
§7):**
1. **F1 PRIMARY:** Paired-mode unlocks rubric differentiation
   that single-mode obscures (with 12:1 asymmetry sub-observation
   as independent inferential lens)
2. **F2:** Anonymization pipeline empirically validated by 76% tie
   rate (82/108 axis-comparisons)
3. **F3:** cobra/c4 + httpx/p2 all-zero Δ across all 4 axes (v0.6+
   investigation candidate)
4. **F4:** ca-condition systematic variance asymmetry (demoted
   from Step 7 PRIMARY per Q7(i) cycle-level reframing)
5. **F5:** Hono h1 beta-ca bimodal exploration intrinsic (n=8
   stretch INCREASED variance; not n-driven)
6. **F6:** Position-dependent JSON output formatting (cycle-emergent
   at Step 8.1 retry evidence; distinct from ADR-19 §3 score-bias)
7. **F7:** Cross-order agreement strong (Sonnet position-blind
   on scores)
8. **F8:** Cost-projection accuracy at paired-mode + failed-call
   cost-tracking gap (combined per Q7(ii))
9. **F9:** Cost-discipline preserved across cycle (~$10.25 / ~12%
   base envelope)

**Cumulative API spend:** ~$10.25 platform-billed reconstructed
(~12% of $51-97 base envelope; detailed reconciliation at ref-doc
§6 + Step 8.3 progress log entry).

**Why this version:** v0.4 acknowledged quality-axis blind-grading
deferral as v0.5+ scope; v0.5 closes that deferral with full
methodology rigor. v1.0 ship-gate criterion #1's parenthetical
"(full quality-axis methodology landed pre-v1.0)" closes here;
remaining v1.0 gates (onboarding pipeline; community evidence;
external dogfood) carry forward to v0.6+ scope.

---

### v0.6+ — must-ship-before-v1.0 backlog [FLEXIBLE PLACEMENT]

**Items below MUST ship before v1.0 public launch but specific
version assignment is flexible.** Canonical candidate reference
(see [`research/phase-9-v0.5-reference-run.md`](../ContextAtlas-benchmarks/research/phase-9-v0.5-reference-run.md)
§9 for canonical list of v0.6+ candidates carried forward from
v0.5 cycle). `research/v0.5-candidates.md` remains canonical for
the 9 remaining items not absorbed at v0.5; absorbed-item in-place
annotations mark #7/#8/#9/#12 v0.5-Step-10 closures. ref-doc §9
captures cycle-emergent candidates surfaced during v0.5 execution
(surfaces beyond v0.5-candidates.md inventory scope per Q10
cycle-emergent-only scope lock). Per-version scope-docs (v0.6,
v0.7, ...up to v0.99 if needed) decide which items land when
based on:

- v0.5 launch evidence + drafting surfacing credibility gaps
- Community evidence accumulation (post-v0.5)
- External user requests
- Travis-energy + capacity intersection

This section names everything that doesn't ship in v0.5 with
explicit forward-pointers. v0.5 carries forward the v0.4
silent-deferral-correction discipline by anchoring deferred work
here, not letting it disappear.

**Production-tool deliverables:**

- **Developer onboarding pipeline (full).** End-to-end flow from
  `npm install` to first useful query. Doctor script foundation
  lands in v0.4 Stream B; full pipeline is v0.5+. Most natural
  placement: v0.5 thesis primary. Includes:
  - Configuration helper (Claude-Code-prompted onboarding;
    conversational rather than docs-reading)
  - ADR bootstrap pipeline (formerly v0.5 ROADMAP "ADR-crafting
    pipeline"; opt-in per-repo; Claude drafts architectural
    decisions inferred from code patterns + commit history +
    naming conventions; user reviews + approves drafts)
  - Warm-up prompt automation (post-setup smoke test)
  - Lifecycle / continuous-integration patterns (atlas-staleness
    watching; pre-commit-vs-CI atlas updates; per-session
    refresh strategies)
- **Task-shaped bundle queries.** `why_does_this_fail(symbol,
  error)` — returns relevant symbols + recent commits + related
  ADRs + failing tests, pre-correlated. `onboard_to_feature(
  feature_name)` — minimum context pack to edit a feature safely.
  `audit_change(diff_or_branch)` — architectural review of a
  proposed change. Progressive disclosure with stable IDs.
  Originally v0.5 ROADMAP entry; placement flexible per evidence.
  Strong candidate for v0.6 thesis if semantic layer evidence-
  gates negative.
- **Team workflow / git-flow-for-atlases.** Multi-developer
  collaboration on atlas; merge conflicts; atlas ownership;
  pre-commit-vs-CI atlas updates. Likely v0.6 once solo-dev
  workflow proven (post-v0.4).
- **Claim source enrichment (v0.3-deferred items).** PR-description
  mining (GitHub/GitLab API integration; opt-in flow); README/
  `docs/` parsing for architectural claims (overlaps with
  onboarding pipeline ADR-bootstrap-from-existing-prose work).

**Evidence-gated production-tool items:**

- **Semantic embedding layer.** Vector embeddings over claim text;
  semantic search mode in `find_by_intent`; re-ranking combining
  BM25 + semantic similarity. Per
  [ADR-09](docs/adr/ADR-09-find-by-intent-fts5-bm25.md) fallback
  preference order, embeddings are last resort. v0.6 most natural
  placement *if* v0.4–v0.5 evidence shows BM25-tier ranking
  insufficient.
- **Full quality-axis blind-grading methodology.** Multi-run n≥3
  per cell; correctness scoring rubrics; calibration measurement.
  v0.4 Stream C is bounded validity (rigor-for-launch-credibility);
  full methodology is the next escalation. Trigger: post-v0.4
  launch-document feedback or community evidence demanding rigor.
- **Clean-workspace mode** (atlas-file-visibility resolution path
  b). Per Step 12 methodology note. Conditional on quality-axis
  findings showing beta contamination materially distorts evidence
  beyond Path 3b's filter correction.
- **BM25 ranking activation on `get_symbol_context`** (Theme 1.2
  Fix 3 evidence-gate). Conditional on quality-axis evidence
  supporting activation.
- **camelCase splitting in identifier search.** Conditional on
  user-search-pattern evidence. Per
  [ADR-17](docs/adr/ADR-17-fts5-identifier-tokenizer.md).

**Demand-driven items:**

- **Additional language support.** Rust, .NET, Java, etc. v0.7+
  placement; demand-driven per external user request OR Travis
  personal need.
- **Additional reference targets** beyond cobra/httpx/hono. Django,
  Next.js, etc. Phase 8 §6.6 tagged as "post-v0.5 candidates."

**Per-item placement decision:** at per-version scope-doc drafting
time, not now. v0.4 closure provides input signals (launch-
document drafting; community evidence; capacity); v0.5+ scope-doc
selects v0.5 thesis from this backlog using those signals.

---

### v1.0+ — Enrichment backlog [POST-LAUNCH]

Distinct from v0.5+ must-ship-before-v1.0 backlog above — items
below are **post-v1.0 enrichment**. Each becomes its own ADR +
version when promoted from "tracked" to "planned." Evidence for
promotion: benchmark shows the gap, user feedback identifies the
need, or portfolio demand justifies the build. The "versions do
one thing well" rule still applies.

- **Hot-path caching.** Log query patterns across sessions;
  pre-compute cached answers for top-N queries.
- **Claim capture from agent sessions.** When agents derive
  architectural insights during exploration, capture them as
  proposed claims for human review and promotion.
- **Blame/attribution signals** (non-political framing — "recently
  active contributors to this area" for context, not ownership
  assertion).
- **Branch diversity signals** (merge conflict risk surfacing).
- **LLM-aided commit message classification** at index time
  (richer risk signals than regex).

These items are NOT v1.0 ship blockers. v1.0 ships when the v0.5+
must-ship-before-v1.0 backlog is drained sufficient for public
launch (gate criteria below).

---

### v1.0 — Thesis realized + public launch [PLANNED]

**Delivers:**
- All four architectural layers operating together
- Task-shaped bundle queries as the primary interface
- Signal enrichment removes hard dependency on human-authored
  claims
- Developer onboarding pipeline (install → guided config → atlas
  → first useful query) for solo developers and small teams
- Benchmarks demonstrate meaningful efficiency AND quality
  improvements vs baseline agent usage (full quality-axis blind-
  grading methodology landed pre-v1.0)
- Stable API contract for external consumers
- Documentation suitable for external adoption

**Validates:**
- The original thesis: agents with pre-computed multi-layer
  architectural context perform measurably better than agents
  rediscovering architecture per query.
- ContextAtlas is production-installable on user codebases, not
  just authors' test repos.

**Ship criteria** (testable gates for the v0.x → v1.0 transition):

- Four-layer fusion proved on the cobra/httpx/hono benchmark
  substrate (or expanded substrate per scope decisions) with
  statistically-meaningful wins on both the efficiency and
  quality axes (✓ full quality-axis methodology landed at v0.5
  per ADR-19 + paired-t cross-cell rollup; see v0.5 section.
  Statistically-meaningful-wins gate remains open — v0.5
  established the measurement instrument; v0.6+ uses the
  instrument under expanded substrate)
- Developer onboarding pipeline shipped (configuration helper +
  ADR bootstrap + warm-up + lifecycle); doctor script foundation
  exists (v0.4) and full pipeline composes
- At least one external dogfood trial completed — reviewer,
  friend, or open solicitation. (Full external adoption is a
  v1.x story, not a v1.0 blocker. The gate is "someone else ran
  it on their code and reported back.")
- No pending scope-affecting ADRs — the architectural surface is
  frozen at ship
- Benchmark reproduces across Claude model versions without
  per-model tuning
- Launch-document drafted (Travis personal notes consolidated
  into public launch artifact)

**Specific v1.0 gate criteria** lock at late-cycle scope-doc
(v0.99 or whatever the final pre-v1.0 cycle becomes); items
above are the framing target.

**Scope boundaries:**
- v1.0 is "the thesis working + production-installable," not
  "everything possible." Feature completeness against the thesis
  + production-tool persona, not against all imaginable
  extensions.

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
- **[v0.4-SCOPE.md](v0.4-SCOPE.md)** — Current-version scope anchor (v0.4 in progress; commit `e8b5114`)
- **[v0.3-SCOPE.md](v0.3-SCOPE.md)** — v0.3 scope anchor (shipped 2026-04-28; preserved as historical record)
- **STEP-\*-PLAN.md** — Per-version build plan (v0.4 plan drafting next session)
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

- **2026-05-04 — v0.5 ship.** Tag `v0.5.0`. New v0.5 section
  added between v0.4 and v0.5+ backlog with full SHIPPED
  framing (LLM-judge methodology + paired-t cross-cell rollup
  + adaptive cost priors); cycle-thesis empirical validation
  paragraphs (cross-cell rollup paired-t at N=27 differences
  per axis: factual_correctness CLEAN / hallucination
  BORDERLINE / actionability BORDERLINE / completeness NOT
  distinguishable); 9 named findings list; ~$10.25 cumulative
  platform-billed reconstructed within scope-doc envelope.
  v0.5+ backlog section reframed as v0.6+ backlog [FLEXIBLE
  PLACEMENT] with canonical-reference pointer updated to
  ref-doc §9 (`research/v0.5-candidates.md` remains canonical
  for the 9 unabsorbed items; absorbed-item in-place
  annotations mark #7/#8/#9/#12 v0.5-Step-10 closures per Q10
  two-substrate cycle-lock). Version dependency graph updated
  (v0.5 SHIPPED with paired-t cross-cell rollup at N=27 +
  Phase-9 reference doc + adaptive cost priors annotation;
  v0.6+ flexible). Key efficiency unlocks table: task-shaped
  bundle queries + progressive disclosure slipped from
  v0.5-Planned to v0.6+-Planned (v0.5 actual thesis was
  quality-axis methodology, not task-shaped queries). v1.0
  ship-gate criterion #1 marked partially-closed with closure
  annotation: full quality-axis methodology landed at v0.5;
  statistically-meaningful-wins gate remains open per v0.6+
  expanded-substrate scope. Practical-implication line
  refreshed (v0.5 shipped 2026-05-04). Net delta ~+95 LOC.

- **2026-04-29 — v0.4 ship.** Tag `v0.4.0`. v0.4 section status
  flipped `[IN PROGRESS]` → `[SHIPPED]`; status paragraph
  rewritten as ship-narrative; v0.4 outcome paragraphs replace
  Step-9-only summary with full Stream A / Stream B / Stream C
  validation; named findings list; cumulative spend ($43.80
  script / ~$14.50 platform; well below $50 ceiling); version
  dependency graph updated (`v0.4 — SHIPPED`); practical-
  implication line refreshed. Methodology-limits paragraph
  in CLAUDE.md current-version block captures v0.4 honesty
  scope (n=2; calls quantization; quality-axis deferral;
  cell-selection finding-anchored). Self-use atlas refreshed
  at ship SHA (768 symbols / 825 claims). v0.5+ section
  pointer to `research/v0.5-candidates.md` retained.

- **2026-04-29 — v0.4 Step 10 synthesis.** v0.4 section
  status refreshed to reflect Steps 1-10 complete (Step 11
  ship gate queues next); added Step 9 bounded-validity
  outcome paragraph (BOUNDED; three-measurement noise-floor
  convergence ~4-13%; launch-narrative credibility line
  locked in supplement §8.7); added cumulative spend line
  (~$36.24 script / ~$13-14 platform; well below $50
  ceiling). v0.5+ section gains canonical candidate
  reference pointer to new `research/v0.5-candidates.md`
  (13 candidates, categorized; replaces ad-hoc tracking
  across scope docs and conversation summaries). Net
  delta ~+25 LOC. Companion artifact:
  `research/v0.4-step11-prep-checklist.md` (ship-gate prep).

- **2026-04-28 — v0.3 ship + v0.4 reframe.** v0.3 shipped (tag `v0.3.0`); ROADMAP refreshed in parallel per (γ) production-tool hardening primary thesis lock + P6 backlog discipline. v0.4 section reframed from "Semantic layer [PLANNED, EVIDENCE-GATED]" to "Production-installability foundation [IN PROGRESS]" per [v0.4-SCOPE.md](v0.4-SCOPE.md) (commit `e8b5114`); v0.5 section reframed as "v0.5+ must-ship-before-v1.0 backlog [FLEXIBLE PLACEMENT]" per backlog-discipline lock (every deferred item gets explicit forward-pointer; per-version placement at per-scope-doc time, not now); v0.6+ renamed to v1.0+ enrichment backlog [POST-LAUNCH] clarifying post-v1.0-flavored items distinct from must-ship-before-v1.0 backlog; v1.0 section amended with onboarding pipeline + launch-document + quality-axis methodology ship criteria; version dependency graph updated to reflect v0.4-IN-PROGRESS + v0.5+-flexible-placement framing. Net delta ~+45 LOC. Drafted following 16-item v0.4 candidate inventory walk + cross-instance scope discussion + P1-P6 pushback resolution.

- **2026-04-25 — Phase A realignment.** Added "What ContextAtlas Is FOR" subsection capturing canonical product-positioning anchor (production tool for developers, not research experiment); added Vision tagline integration; added "Key efficiency unlocks" subsection consolidating the 7-item efficiency-collapse list across versions; expanded v0.5 section to include ADR-crafting pipeline as second deliverable alongside task-shaped queries; added developer-tool framing paragraph to Architectural Layers section. Realignment surfaced during Step 7 alignment check; framing source is Travis's anchor statement: *"The benchmark repo should only be used as a tool to better our main repo, whose ultimate goal is to be a production tool for developers to use with Claude Code to enable life improvements for Claude (the token burn, architectural context, etc)."* Non-revisionist amendments — existing content preserved.
