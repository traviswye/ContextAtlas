---
id: ADR-06
title: Atlas is a committed team artifact; local SQLite is a derived cache
status: accepted
severity: hard
symbols:
  - atlas.json
  - index.db
  - AtlasExporter
  - AtlasImporter
  - ContextAtlasConfig
---

# ADR-06: Atlas is a committed team artifact; local SQLite is a derived cache

## Context

ContextAtlas's core value proposition depends on accumulated architectural
knowledge being available to anyone working on a repo — not just the
developer who ran the first index. If every team member must run the
full extraction pipeline on first use, several problems emerge:

- **Onboarding tax.** A new team member joining a repo with 20 ADRs
  pays $5-7 in API credits and waits 8-12 minutes before the tool is
  useful. This tax applies to every new hire, every contributor, every
  developer who bounces between machines.

- **Cross-developer drift.** If Alice runs extraction with Opus 4.7
  today and Bob runs it with Opus 5.0 next month, their severity
  classifications may differ. The team lacks a canonical "what we agreed
  ContextAtlas says about our code" reference.

- **Weak continuity story.** The pitch "the atlas accumulates knowledge
  over time" rings hollow if accumulation is per-user and non-transferable.
  The team's collective architectural reasoning doesn't actually persist
  as a first-class artifact.

- **Open source contribution friction.** External contributors to OSS
  projects get no benefit from ContextAtlas until they pay the first-run
  cost. This discourages casual contribution on projects that would
  otherwise benefit most from architectural grounding.

## Decision

ContextAtlas produces **two artifacts** with distinct lifecycle roles:

**1. `atlas.json` — the committed team artifact.**

- Human-readable JSON format
- Lives at `.contextatlas/atlas.json` by default
- Committed to the repo alongside source code and ADRs
- PR-reviewable via standard git diff
- Self-describing: includes generator version, model used, and SHAs of
  all source files it was built from
- Deterministic ordering (symbols and claims sorted by ID) so git diffs
  are focused and readable

**2. `index.db` — the local derived cache.**

- SQLite binary
- Lives at `.contextatlas/index.db` by default
- **Gitignored** — never committed
- Rebuilt from `atlas.json` on demand
- Used for query-time performance (SQLite indexes, fast joins)

### Flow

- **First run with committed atlas present:** Import `atlas.json` into
  local `index.db`. Zero API calls. Ready immediately.
- **Incremental updates:** Diff current file SHAs against SHAs recorded
  in `atlas.json`. Re-extract only changed files. Update local
  `index.db` and regenerate `atlas.json`.
- **First run with no committed atlas (fallback):** Run full extraction
  as described in DESIGN.md stages 1-5. Produce both artifacts. User
  may optionally commit `atlas.json` to seed the repo.

### The commit-or-not decision is explicit

Not every team will want to commit the atlas. Some will have privacy,
compliance, or preference reasons to keep it local-only. The config
schema surfaces this as a deliberate choice:

```yaml
atlas:
  committed: true          # default; commits atlas.json
  path: .contextatlas/atlas.json
  local_cache: .contextatlas/index.db
```

If `committed: false`, the system falls back to per-user extraction —
no atlas.json produced, every user rebuilds locally. This is the
degraded mode, but it's a supported degraded mode.

## Rationale

- **Zero onboarding cost is a must-have for team adoption.** A tool
  that costs $5 and 10 minutes per new user to become useful will not
  be adopted at scale. Teams committing the atlas make the tool
  useful from clone-time.

- **Canonical extraction eliminates drift.** When one team member ran
  extraction and committed the atlas, everyone else inherits those
  exact claims. Severity classifications, symbol resolutions, and
  rationale extractions are consistent across the team.

- **The atlas becomes a reviewable team artifact.** PR reviewers can
  see how a code change affects the architectural claims about that
  code. Disagreements about what the atlas should contain become
  normal engineering discussions in PRs, not invisible local state.

- **It differentiates ContextAtlas from session-memory tools.**
  claude-mem, engram, and similar tools can't commit their data to
  the repo — that data is conversational, per-user, sometimes private.
  ContextAtlas's atlas is deliberately public team knowledge, and
  committing it is the natural expression of that.

- **It differentiates ContextAtlas from Graphify.** Graphify builds
  a local index per user. Nobody commits a Graphify index to their
  repo. ContextAtlas's committed-atlas model is a categorical
  difference, not just a feature gap.

- **JSON over binary makes the artifact reviewable.** A SQLite file
  in a PR is unreadable. A JSON file with deterministic ordering
  produces focused, meaningful diffs that humans can evaluate.

## Consequences

- **Implementation requires bidirectional sync.** AtlasExporter
  serializes SQLite state to atlas.json. AtlasImporter deserializes
  atlas.json into SQLite. Both must be lossless — round-tripping a
  canonical atlas must be a no-op.

- **Deterministic ordering is a hard requirement.** Symbols sorted by
  ID. Claims sorted by (source, symbol_id, claim). Arrays produced
  in stable order. Any non-determinism creates noise in git diffs
  and undermines the "reviewable artifact" claim.

- **SHA tracking is load-bearing.** Every source file ContextAtlas
  has indexed must have its SHA recorded in atlas.json. Without this,
  incremental reindex cannot distinguish "unchanged" from "changed" —
  the system would either re-extract everything (expensive) or miss
  updates (incorrect).

- **Atlas schema is versioned public API.** The `version` field in
  atlas.json lets us evolve the format. Breaking changes to the atlas
  schema require a major version bump. Migration from v1 to v2 must
  be handled automatically — users should not have to regenerate
  atlases by hand.

  *Additive minor bumps follow a cumulative pattern.* Each post-v1.0
  bump has added one optional, omit-when-absent field — back-compat
  with all earlier versions, no migration needed:
  - **v1.0 → v1.1** ([ADR-11](ADR-11-git-signal-at-index-time.md)) —
    adds `extracted_at_sha` + `git_commits` (target-repo git signals).
  - **v1.1 → v1.2** ([ADR-14](ADR-14-go-adapter-gopls.md), §Decision 4) —
    adds `symbols[].parent_id` (Go interface→method relationship after
    flattening).
  - **v1.2 → v1.3** (v0.3 Theme 1.3) — adds
    `generator.contextatlas_commit_sha` (the *tool's* HEAD, distinct
    from `extracted_at_sha`'s *target repo's* HEAD).

  The omit-when-absent rule is load-bearing: any future minor bump
  MUST add only optional fields, MUST follow the round-trip nullish
  convention (empty/undefined/null all collapse to omission), and
  MUST leave earlier-version atlases readable without modification.
  Anything else is a major bump.

- **PR workflow requires atlas updates to accompany ADR/code changes.**
  If a developer edits an ADR and doesn't update atlas.json, CI should
  flag the drift. Ideally a pre-commit hook regenerates atlas.json
  automatically when relevant files change. This is a tooling
  requirement, not just an architectural one.

- **Large atlases may strain git.** A repo with 100 ADRs producing
  thousands of claims could generate an atlas.json in the megabytes.
  Git handles this fine, but the diff review experience degrades.
  For very large repos, chunking atlas.json (one file per source ADR,
  for example) may be a future enhancement.

- **The "committed: false" escape hatch must be a first-class mode.**
  Some teams legitimately cannot commit the atlas (regulated environments,
  internal-only code, etc.). The system must work correctly in this
  mode, not just "work but lose the team benefit." Testing should
  cover both modes.

- **Schema stability of atlas.json is stricter than the internal
  SQLite schema.** The SQLite schema can evolve with code releases
  as long as migrations work. atlas.json is user-visible and
  committed — changes are more expensive and require user coordination.
  Keep the atlas schema narrow enough to be stable.

- **Privacy consideration.** Atlas contains distilled ADR content
  (excerpts, claims, rationale). If ADRs contain sensitive
  information the team would rather not propagate, the atlas
  propagates distilled versions of that information. The default
  of "committed: true" assumes ADRs are already committed, so the
  atlas adds no new exposure. This assumption should be documented
  but not enforced — teams know their own privacy situation.
