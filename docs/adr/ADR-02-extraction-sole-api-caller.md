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

The extraction pipeline (`src/extraction/`) is the only module in the
codebase permitted to import from `@anthropic-ai/sdk` or otherwise call
the Anthropic API.

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
  `@anthropic-ai/sdk` outside `src/extraction/` should return zero
  matches. CI may enforce this.
- The single exception is the extraction pipeline itself, which is
  exactly where expensive model reasoning belongs.
