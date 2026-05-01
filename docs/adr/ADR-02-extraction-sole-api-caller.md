---
id: ADR-02
title: Extraction pipeline is the only Anthropic API caller in the codebase
status: accepted
severity: hard
symbols:
  - ExtractionPipeline
  - LanguageAdapter
---

# ADR-02: Extraction pipeline is the only Anthropic API caller in the codebase

## Context

ContextAtlas's value proposition rests on a clean separation: expensive
reasoning happens at index time, cheap lookups happen at query time. If
query-time code paths start making Anthropic API calls — for
"smart disambiguation," for "summarizing long bundles," for any reason —
the performance and cost characteristics fundamentally change. Queries
stop being sub-100ms. Costs stop being predictable. The architecture
silently becomes something else.

This is a load-bearing invariant. It must be enforced, not just
intended.

## Decision

The extraction pipeline (`src/extraction/`) and the v0.5 grading harness
(`src/grading/`) are the only modules in the codebase permitted to import
from `@anthropic-ai/sdk` or otherwise call the Anthropic API. Both are
research-time / index-time only.

Query-time code paths — MCP tool handlers, language adapters, storage
layer, git integration, config parsing — MUST NOT call the Anthropic
API under any circumstances.

Language adapters MUST NOT call the Anthropic API. They are local
tooling wrappers (tsserver, Pyright); introducing model calls into the
adapter layer would violate the query-time invariant.

## Rationale

- Query latency must stay sub-100ms. Model calls add seconds.
- Query cost must be zero. Model calls cost cents per request at scale.
- The architectural promise is "pay once at index time." Violations of
  that promise undermine the pitch.

## Consequences

- Features that would naturally want a model call at query time
  ("disambiguate these three candidates," "summarize this long claim")
  must be handled differently:
  - Move the work to index time (pre-compute and store)
  - Fall back to deterministic heuristics (pick first, truncate, etc.)
  - Expose the ambiguity to the caller and let Claude decide
- This rule can be enforced mechanically. A grep for imports of
  `@anthropic-ai/sdk` outside `src/extraction/` and `src/grading/`
  should return zero matches. CI may enforce this.
- The single exception is the extraction pipeline itself, which is
  exactly where expensive model reasoning belongs.

## Revision history

- **2026-04-30** — v0.5 Step 2.0 amendment: extended permitted-modules
  list to include `src/grading/` for v0.5 LLM-judge harness work.
  Trigger: ADR-19 §2 + STEP-PLAN-V0.5 Step 2 surfaced ADR-02 boundary
  at design-proposal time per investigation-first discipline. Load-
  bearing invariant unchanged (query-time vs research-time / index-
  time separation; sub-100ms queries; zero query cost preserved);
  permitted-modules list expanded by one to reflect the invariant's
  research-time application. CI enforcement grep pattern updated
  correspondingly.
