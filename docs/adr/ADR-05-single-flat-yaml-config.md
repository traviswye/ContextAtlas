---
id: ADR-05
title: Configuration is a single flat YAML file; no inheritance, no cross-repo refs
status: accepted
severity: hard
symbols:
  - ContextAtlasConfig
  - contextatlas.yml
---

# ADR-05: Configuration is a single flat YAML file; no inheritance, no cross-repo refs

## Context

Configuration surface is where MVP projects either stay focused or get
dragged into scope creep. Every "just one more config option" adds
parsing complexity, documentation burden, and user confusion. Every
inheritance chain ("my project config inherits from my team config")
doubles the mental model.

ContextAtlas's config needs are limited: language list, ADR path, doc
globs, git settings, extraction model, and atlas sync options. Roughly
seven top-level sections. Deliberately compact.

## Decision

Configuration lives in a single `.contextatlas.yml` file at the repo
root. The schema is documented in DESIGN.md and implemented in
`src/types.ts` as `ContextAtlasConfig`.

The config file:
- MUST be a single file. No includes, no imports, no inheritance chains.
- MUST be in the repo root. Not a subdirectory, not a dotfile
  elsewhere.
- MUST be YAML. Not JSON, not TOML, not a TS file.
- MUST validate against the declared schema. Unknown top-level keys
  are errors, not warnings.

Features that might seem reasonable but are explicitly rejected:
- Inheritance from a parent config (`extends: ../shared.yml`)
- Cross-repo references (`imports-from: other-repo/.contextatlas.yml`)
- Monorepo workspace awareness
- Environment-specific overrides

If any of these becomes necessary, it's a v1.0+ conversation, not a
v0.x field addition.

## Rationale

- A single file is greppable, copyable, reviewable in a single PR.
- No inheritance means no debugging of "what config is actually
  active?" questions.
- YAML is the standard for dev-tool config files (GitHub Actions,
  Docker, Kubernetes, CircleCI). Not introducing a less-familiar
  format.
- Strict schema validation surfaces config bugs at startup, not at
  runtime when a missing key causes unexpected behavior.

## Consequences

- Monorepo users with multiple distinct projects need multiple
  configs (one per project root). This is accepted.
- Teams that want a shared config across repos must copy it, or use
  symlinks. No framework-level inheritance.
- Adding a new config field is a deliberate decision — bumps the
  `version` field, documented in DESIGN.md, added to `ContextAtlasConfig`
  type.
- The `version: 1` field at the top of the config is the migration
  handle for future breaking changes. Treat it as sacred.
