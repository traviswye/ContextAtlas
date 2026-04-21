---
id: ADR-04
title: Compact text is the default output format; JSON is opt-in
status: accepted
severity: hard
symbols:
  - SymbolContextBundle
  - get_symbol_context
---

# ADR-04: Compact text is the default output format; JSON is opt-in

## Context

Every bundle returned by `get_symbol_context` is consumed by an LLM
(Claude). Token efficiency directly affects the tool's core value
proposition: reducing tool-call burn. JSON is verbose by nature —
quotes around keys, nested braces, arrays with square brackets. On a
bundle with 20 references clustered across 3 modules, JSON is roughly
40-60% more tokens than a well-designed compact text format encoding
the same information.

The tool can always offer JSON for programmatic consumers (benchmark
harnesses, future UI). But the default matters — the default is what
Claude receives on every call.

## Decision

Compact text is the default output format for `get_symbol_context` and
all future bundle-returning tools. JSON is available by passing
`format: "json"` in the input parameters.

The compact format follows the grammar documented in DESIGN.md:

```
SYM <name>@<path>:<line> <kind>
  SIG <signature>
  INTENT <source> <severity> "<claim>"
    RATIONALE "<rationale>"
  REFS <count> [<cluster>:<count> ...]
    TOP <ref-id>
  GIT hot last=<date>
    RECENT "<message>" <sha>
  TESTS <test-path> (+<n>)
  TYPES extends=<list> implements=<list> used_by=<list>
```

The compact grammar is part of DESIGN.md and changes require a minor
version bump. The JSON schema is stable public API documented in
`src/types.ts` (`SymbolContextBundle`).

## Rationale

- Token efficiency is the core value proposition. Defaulting to the
  less efficient format undercuts the pitch.
- Compact format is human-readable. Developers reading Claude's tool-call
  logs can parse it without JSON-pretty-printing tools.
- JSON stays available for consumers that need it. No one is blocked.

## Consequences

- Any new field added to bundles requires defining both its JSON shape
  and its compact representation. Adding only one is a bug.
- The compact grammar is parsed by Claude's LLM, not by a formal parser.
  Minor formatting inconsistencies are tolerated by the consumer, but
  the grammar must be tight enough that Claude doesn't lose information.
- The compact parser on the receiving side is informal. If a future
  automated tool needs to parse compact output, it should request
  `format: "json"` instead.
- Bundle size advice (avoid huge responses) applies to both formats.
  The fix is progressive disclosure via IDs, not format choice.
