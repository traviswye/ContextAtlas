---
id: ADR-01
title: Symbol ID format is stable public API; identity is path + name, not line
status: accepted
severity: hard
symbols:
  - SymbolId
  - Symbol
  - LANG_CODES
---

# ADR-01: Symbol ID format is stable public API; identity is path + name, not line

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

A specific stability concern drives the shape of the ID itself: **line
numbers are volatile in ways that symbol identity is not.** Adding a
3-line function at the top of a 200-line file shifts the line of every
symbol below it, even though none of those symbols changed semantically.
If line numbers are part of the ID, every such edit produces a cascade
of ID changes and correspondingly noisy atlas.json diffs. That directly
conflicts with ADR-06's reviewable-artifact promise.

If the ID format changes, every downstream consumer breaks silently.

## Decision

Symbol IDs follow a fixed format keyed to **path + name**, not line:

```
sym:<lang>:<path>:<name>
```

Example: `sym:ts:src/orders/processor.ts:OrderProcessor`

Reference IDs follow the same rule with `ref:` prefix and include line
(because a reference *is* a site in a file, not an entity):

```
ref:<lang>:<path>:<line>
```

Example: `ref:ts:src/billing/charges.ts:88`

**Line numbers are supplementary metadata, not identity.** Every
`Symbol` record stores `line` as a field, and it's returned in bundle
output and atlas.json entries. But the ID itself is stable across line
moves. Moving a symbol within a file updates its `line` field; its ID
does not change.

**Language codes use short forms in IDs.** The mapping is authoritative
and lives as a single constant `LANG_CODES` in `src/types.ts`:

| LanguageCode   | Short code |
|----------------|------------|
| `typescript`   | `ts`       |
| `python`       | `py`       |

New languages add entries to `LANG_CODES`. The short code is the token
used in symbol IDs; the full code is used in config and interfaces.

**Path normalization is required at ingest.** All paths in symbol IDs
(and in atlas.json, and in the storage schema) use forward-slash
separators, even on Windows. Backslash paths are normalized at the
ingest boundary by a single `normalizePath()` utility. A Windows
developer and a Linux developer working on the same repo produce
byte-identical symbol IDs.

The format MUST NOT change in MVP or v0.x releases. A change to the ID
format requires a major version bump and an explicit migration note.

## Rationale

- **Line-stability preserves the reviewable-atlas property.** Routine
  edits (adding an import, inserting a helper function, reformatting)
  should not cascade into atlas.json churn. Using path + name as the
  stable identity keeps cosmetic changes cosmetic in the diff.
- **Symbol identity is semantic, not textual.** Most refactoring tools,
  IDEs, and code-aware systems treat symbols by their qualified name,
  not their position in the file. Git itself tracks content by hash,
  not location. Our ID format follows the same principle.
- **Line remains useful as metadata.** Debugging, navigation, and
  tool-call-log reading all benefit from knowing where a symbol lives.
  Keeping it in every Symbol record (just not in the ID) preserves
  this.
- **Short language codes save tokens.** Symbol IDs appear in every
  bundle, every atlas.json entry, and potentially thousands of times
  per index. `ts` vs. `typescript` is 10 bytes per occurrence. Across
  a mature repo's atlas, this is non-trivial.
- **Path normalization eliminates an entire class of Windows/Linux
  bugs.** Mixed-separator paths appearing as "different symbols" is
  the kind of issue that surfaces weeks into use and is maddening to
  track down. Normalizing at ingest is cheap insurance.
- **Third-party tools cannot defend against format drift with static
  types.** They rely on the format being stable.
- **Committed atlases from older tooling must remain readable by newer
  tooling within a major version.** Format stability is the mechanism.

## Consequences

- **Overloaded names in the same file collide.** Two symbols with the
  same name at different lines in the same file produce the same ID.
  For MVP, we accept this limitation: the first declaration wins, and
  subsequent overloads are currently not addressable via ID. A future
  version may introduce a disambiguator (e.g. an overload index), but
  that is a major-version change and is out of scope for MVP.
- **Moving a symbol to a different file changes its ID.** A file split
  or a move from `src/orders/` to `src/billing/` produces a new ID and
  invalidates claims bound to the old one. This is correct behavior —
  the symbol has been relocated — and incremental reindex rebinds
  claims as part of its normal flow.
- **The Symbol record is the authoritative source of line information.**
  Consumers that need a line number (for jump-to-definition, log
  output, etc.) read the `line` field from the Symbol record, never
  parse it out of the ID. Any code that tries to extract line from
  ID is broken.
- **`LANG_CODES` is stable public API.** Adding entries is additive;
  changing existing short codes (e.g. renaming `ts` to `typescript`)
  is a breaking change requiring a major version bump.
- **`normalizePath()` is a single enforcement point.** It must be
  called at every ingest boundary: reading file paths from LSP,
  parsing config, importing atlas.json, scanning ADR directories.
  Forgetting it anywhere creates a bifurcation where some IDs use
  `\` and some use `/`, silently producing "duplicate" symbols.
  Code review should flag any path-handling code that doesn't go
  through this utility.
- **Symbol ID changes in atlas.json produce focused, reviewable diffs.**
  Non-stable ordering or volatile IDs would make diffs meaningless;
  see ADR-06 for the deterministic-ordering requirement.
- **Renaming a symbol changes its ID.** A rename from `OrderProcessor`
  to `PaymentProcessor` is a semantic change and legitimately produces
  a new ID. Claims bound to the old ID are rebound by incremental
  reindex as part of its normal flow. Stale IDs in Claude's session
  context are acceptable — they just return "not found" and Claude
  re-queries.
