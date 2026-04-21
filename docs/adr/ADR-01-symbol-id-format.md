---
id: ADR-01
title: Symbol ID format is stable public API
status: accepted
severity: hard
symbols:
  - SymbolId
  - Symbol
---

# ADR-01: Symbol ID format is stable public API

## Context

Every bundle returned by ContextAtlas references symbols by ID. Claude
Code receives these IDs and may use them to request additional detail or
cross-reference within a session. Third-party tooling built on top of
ContextAtlas — benchmark harnesses, export scripts, future UI
integrations — will encode these IDs into their own data structures.

Per ADR-06, symbol IDs are also persisted into `atlas.json`, the
committed team artifact. This means IDs now appear in git history,
PR diffs, and code review tooling. They are no longer just within-session
handles — they are tokens committed to the repo that every team member
reads from. Format instability would cause noisy diffs on every index
run, undermine the "reviewable atlas" property, and break cross-version
compatibility when an older committed atlas is read by newer tooling.

If the ID format changes, every downstream consumer breaks silently.

## Decision

Symbol IDs follow a fixed format:

```
sym:<lang>:<path>:<line>:<n>
```

Example: `sym:ts:src/orders/processor.ts:42:OrderProcessor`

The format MUST NOT change in MVP or v0.x releases. A change to the ID
format requires a major version bump and an explicit migration note.

Reference IDs follow the same rule with `ref:` prefix:
`ref:<lang>:<path>:<line>`.

## Rationale

- IDs are the primary handle for cross-call references. Breaking the
  format breaks continuity between tool calls.
- Third-party tools cannot defend against format drift with static types.
  They must rely on the format being stable.
- The format is deliberately human-readable so debugging doesn't require
  decoding — and so PR reviewers reading atlas.json diffs can understand
  what changed at a glance.
- Committed atlases from older tooling must remain readable by newer
  tooling within a major version. Format stability is the mechanism.

## Consequences

- New information (overload index, module context, etc.) cannot be
  added to the ID format without a major version bump.
- Collisions from overloaded names in the same file resolve to the
  first declaration; subsequent overloads are not currently addressable
  via ID. This is an accepted limitation documented in DESIGN.md.
- When a symbol is renamed, its ID changes. Incremental reindex handles
  this by deleting claims bound to the old ID and re-binding to the new
  one. Stale IDs in Claude's session context are acceptable — they just
  return "not found" and Claude re-queries.
- Symbol ID changes in atlas.json produce focused, reviewable diffs.
  Non-stable ordering would make diffs meaningless; see ADR-06 for the
  deterministic-ordering requirement.
