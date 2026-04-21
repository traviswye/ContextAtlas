---
id: ADR-03
title: Language adapters are plugins; core does not import adapters directly
status: accepted
severity: hard
symbols:
  - LanguageAdapter
  - TypeScriptAdapter
  - PythonAdapter
---

# ADR-03: Language adapters are plugins; core does not import adapters directly

## Context

ContextAtlas supports TypeScript and Python in MVP, with a roadmap to
Java, Go, .NET, and Rust. Each language adapter is a separate module
that wraps a specific language server. If core code imports concrete
adapters by name, adding a new language requires modifying core — which
means language support is not truly pluggable, it's a growing switch
statement pretending to be a plugin system.

## Decision

Core code (`src/mcp/`, `src/storage/`, `src/extraction/`) imports only
the `LanguageAdapter` interface from `src/types.ts`. Core code MUST NOT
import concrete adapter implementations.

Adapter loading happens in one place: the bootstrap code in
`src/index.ts` (or a dedicated `src/adapters/registry.ts`). That single
location reads the config's `languages` field, instantiates the
corresponding adapters, and hands them to core via dependency injection.

Adding a new language adapter requires:
1. A new file in `src/adapters/` implementing `LanguageAdapter`
2. One line in the adapter registry
3. Tests for the new adapter

No other file in the codebase should need to change.

## Rationale

- Keeps the adapter interface meaningful. If core knows about specific
  adapters, the interface abstraction is ceremonial.
- Enables third-party adapters. Contributors adding Rust or Java support
  can do so without touching code they don't own.
- Tests can substitute mock adapters without monkey-patching.

## Consequences

- Dependency injection pattern is required throughout. Functions that
  need a language adapter receive it as a parameter, never import it
  directly.
- The adapter interface is stable public API. Changes to `LanguageAdapter`
  break every adapter implementation. Treat interface changes like
  protocol changes.
- Cross-adapter assumptions are disallowed. Code that only works for
  TypeScript but not Python has a design bug — either the logic belongs
  in the adapter, or the interface needs to expose the capability.
- Adapters must not share state with each other. Each operates
  independently within its language.
