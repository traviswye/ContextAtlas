---
id: ADR-05
title: Configuration is a single flat YAML file; no inheritance, no cross-repo refs
status: accepted
severity: hard
symbols:
  - ContextAtlasConfig
  - contextatlas.yml
  - resolveExtractionStreams
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

## Amendment (2026-09-25, v1.2 Phase 2): `extraction.streams`

v1.2 Phase 2 makes the CLI `contextatlas index` extract all three
claim streams: ADR/docs prose, source docstrings and filtered commit
messages. Before, it extracted prose only (`docs/cycles/v1_2/v1.2-SCOPE.md`
§2 F-2). Decision point D-1 in that doc chose a config gate over a
fixed default, so that a team can turn the docstring and commit
streams off to control cost.

### Decision

**The key.** `extraction.streams` is an optional list:

```yaml
extraction:
  streams: [adr, docstring, commit]
```

- **Values.** `adr`, `docstring`, `commit`, lowercase.
  - `adr` is the prose stream. In `contextatlas index` it covers the
    files under `adrs.path` **and** the files matched by
    `docs.include`; all of them get claim source `adr:<basename>`.
    (The `/index-atlas` Skill extracts `adrs.path` files only;
    `docs.include` extraction on that path is planned for v1.2
    Phase 6.)
  - `docstring` covers docstrings of exported source symbols.
  - `commit` covers commit messages that pass the commit filter
    (`extraction.commit_message_filter` adds patterns to the defaults).
- **Default.** When the key is absent, all three streams run. The
  default is applied where the value is used
  (`resolveExtractionStreams` in `src/config/streams.ts`), not written
  into the parsed config. `contextatlas init` writes no `streams` key.
- **Order does not matter.** The list is stored in canonical order and
  the streams always run in the fixed order adr → docstring → commit.
  Prose runs first so that its "every document failed" error can never
  discard a later stream's paid work.

**Validation** (`validateExtractionStreams` in `src/config/parser.ts`).
Each of these is a config error naming the config file:
- the value is not a list (including `null`);
- the list is empty;
- an entry is not a string, is not one of the three values (wrong case
  included), or appears twice;
- the list does not include `adr`.

The empty-list and missing-`adr` errors tell the user to remove the
key or include `adr`. `adr` is required because `index` runs
`validate-extraction` after every exporting run, and its invariants
need ADR claims. The docstring and commit streams are the real cost
levers. Either rule can be relaxed later without breaking a config
that loads today.

**Disabling a stream keeps its claims.** The key gates extraction,
not content.
- A disabled stream's claims and `source_shas` keys stay in the atlas,
  frozen. They are still returned by queries.
- `contextatlas doctor` reports the enabled streams
  (`config.extraction_streams`) and warns when `atlas.json` still holds
  claims of a disabled stream.
- A docstring key whose file no longer exists is still deleted. The
  v1.2 Phase 2 rule that also deletes the key of a file that exists but
  is no longer walked applies only while the docstring stream runs
  (ADR-12 2026-09-25 amendment).
- The Skill path honours the key too. `contextatlas
  list-extraction-sources` emits empty arrays for disabled streams and
  names them in `summary.disabled_streams`, and `/index-atlas` keeps
  their keys frozen, except that it too drops the key and claims of a
  source file that no longer exists. With a stream disabled the
  manifest is `manifest_version: "2"`, which `/index-atlas` copies
  from before v1.2 refuse, instead of reading the empty arrays as
  deleted sources (ADR-12, review fixes).

### Consequences

- **Additive optional keys stay `version: 1`.** The Consequences above
  say that adding a field "bumps the `version` field". Practice has
  been different. The first parser (`ba2e58c`) accepted seven
  top-level keys, `version` through `atlas`. Every key added since then
  was optional and kept `version: 1`: `source`, `extraction` and its
  keys, `mcp`, `observability`, `architecture` and `lsp`. The parser
  still accepts version 1 only. `version` is the handle for breaking
  changes, as the last bullet of the original Consequences says. An
  optional key is not one: every config that loaded before still
  loads. `extraction.streams` follows that practice. (What an
  unchanged config now does is a separate matter; see Cost below.)
- **Older binaries reject the key.** Unknown keys are errors, so a
  contextatlas release from before v1.2 Phase 2 fails to load a config
  that sets `extraction.streams` ("Unknown key 'extraction.streams'").
  A team on mixed versions should leave the key out until everyone has
  upgraded. Without the key, a Phase 2 release extracts all three
  streams and an older one extracts prose only.
- **Cost.** Without the key, `contextatlas index` now makes docstring
  and commit model calls by default, including `init`'s first run. The
  run prints a cost preview to stderr first (ADR-12 2026-09-25
  amendment). `streams: [adr]` restores prose-only extraction.
