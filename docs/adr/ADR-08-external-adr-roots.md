---
id: ADR-08
title: External ADR roots — adrs.path may resolve outside the source root
status: accepted
severity: hard
symbols:
  - walkProseFiles
  - runExtractionPipeline
  - ExtractionPipelineDeps
  - ContextAtlasConfig
  - parseArgs
  - main
---

# ADR-08: External ADR roots — adrs.path may resolve outside the source root

## Context

Several legitimate architectures separate where ADRs live from where
source code lives:

- Organizations with shared architecture documents in a dedicated
  repo, consumed by multiple source repos.
- Monorepos that keep architecture documents in their own package,
  published independently from code.
- Open-source projects versioning architecture docs separately from
  implementation.
- Benchmark / methodology projects (e.g. ContextAtlas-benchmarks)
  that own ADRs describing external codebases, with the target
  source cloned locally.

The original ContextAtlas pipeline coupled "where source lives" to
"where ADRs live" — `walkProseFiles` enforced that ADR absolute
paths must be under the source root via `toRelativePath`, which
throws when an ADR path falls outside. The coupling made the
above architectures unexpressible.

The coupling wasn't intentional. It was a side effect of the path
normalization invariants from ADR-01, which are motivated by source
code identity stability: symbol IDs must be byte-identical on every
team member's machine, so source paths must be canonicalized relative
to a single known root. Those invariants are load-bearing for source
files. They were never meant to apply to ADR files, which are
identified by content-hash, not by position in a code tree.

## Decision

`adrs.path` in `.contextatlas.yml` may resolve to a location outside
the source root. It accepts three forms:

1. **Relative path under the source root** — e.g. `docs/adr/`.
   Common case; unchanged behavior.
2. **Absolute path** — e.g. `/org/shared/adrs/`.
3. **Relative path that traverses outside the source root** — e.g.
   `../shared-architecture/adrs/`.

The pipeline accepts a new optional `configRoot` parameter on
`runExtractionPipeline`'s deps. `configRoot` names the directory
containing `.contextatlas.yml` and acts as the resolution base for
`adrs.path` and `docs.include` glob patterns. If omitted,
`configRoot` defaults to `repoRoot`, preserving current behavior for
the common case where config lives alongside source.

When the benchmarks-style architecture requires ADRs and source
code in different repositories:

```typescript
await runExtractionPipeline({
  repoRoot: pathResolve(benchmarksRepo, "repos/hono"),
  configRoot: benchmarksRepo,  // adrs.path resolves from here
  config,
  ...
});
```

Source-file walking continues to use `repoRoot`. The source-
under-source-root invariant from ADR-01 stays intact. Only prose
file walking (ADRs + docs) is affected by `configRoot`.

### Runtime coverage

The MCP runtime binary (`src/index.ts`) accepts the same axis
separation via a `--config-root <path>` CLI flag and an optional
`source: { root }` config block. Without them, the binary uses
`process.cwd()` for everything and behavior is bit-for-bit identical
to the pre-ADR-08 shape.

- `--config-root <path>` (or `--config-root=<path>`) names where
  `.contextatlas.yml` lives. Resolves atlas.path and
  atlas.local_cache against this. Defaults to `process.cwd()`.
  Unknown flags and missing/empty values reject with actionable
  errors; there's no silent fallback to cwd on typos.
- `config.source.root` (when present, relative to configRoot or
  absolute) tells the adapter where source code lives. When absent,
  adapter initializes against configRoot, matching today's
  single-root flow.

Resolution order at runtime startup:

1. `configRoot` = `--config-root` value if passed, else `process.cwd()`.
2. Load config from `configRoot/.contextatlas.yml`.
3. `sourceRoot` = `pathResolve(configRoot, config.source.root)` if
   `source.root` is set, else `configRoot`.
4. Atlas + local cache resolve against `configRoot`.
5. Adapters initialize against `sourceRoot`.

Alongside `--config-root`, the binary accepts `--config <file>`
(or `--config=<file>`) to select a config file whose name differs
from the default `.contextatlas.yml`. The value resolves against
`configRoot` when relative, enabling invocations like
`--config-root /path/to/benchmarks --config configs/hono.yml` that
pick one of many configs stored inside a single benchmarks-style
repo. When `--config` is absent, the binary still looks for
`<configRoot>/.contextatlas.yml` as before. Absolute values of
`--config` bypass `configRoot` for file location but do not change
how paths inside that config resolve — `atlas.path` and
`source.root` remain relative to `configRoot`.

The benchmarks-repo CA integration uses all three knobs:
`--config-root /path/to/benchmarks-repo` + `--config configs/hono.yml`
at spawn time, and `source: { root: repos/hono/ }` inside the
selected config, so MCP queries serve the cloned-hono atlas while
config and committed atlas live alongside the benchmarks harness
and the harness can swap which target repo is served by changing
only the `--config` value.

Unlike extraction-side `configRoot`, the runtime `source.root` is
declared in the config file rather than passed as a function
argument. Extraction pipeline callers (scripts, harnesses) are
already custom code and happily pass `configRoot` as a parameter.
The runtime binary is spawned by MCP clients which pass only CLI
args and env — the config file is the natural place for it. A user
pinning source location to a specific tree should encode that in
the config, not rely on spawn-time conventions.

### Stored path rule

`source_path` values in `atlas.json` follow a deterministic
two-branch rule:

- When the resolved prose file path is **under** `repoRoot` →
  stored relative to `repoRoot` (backward compat with every existing
  committed atlas).
- When the resolved prose file path is **outside** `repoRoot` →
  stored relative to the appropriate base: the ADR base directory
  for ADR-bucket files, `configRoot` for docs-bucket files.

Atlas format version stays at `"1.0"`. Existing atlases read and
round-trip unchanged.

## Rationale

- **Minimal schema change.** The config already accepts `adrs.path`
  as a free-form string. Absolute paths and traversal paths flow
  through `pathResolve` correctly. No new schema fields for a
  capability most users won't touch.
- **Security boundary preserved.** `toRelativePath` stays strict and
  continues to enforce "under root" for source files. The relaxation
  is local to prose-file path storage, where the identity concern
  is content-hash, not position-in-tree.
- **`configRoot` separates two concerns that were accidentally
  fused.** Source root (for the adapter) and config root (for
  relative path resolution in `adrs.path` / `docs.include`) are
  conceptually different axes. Making the separation first-class
  avoids unspoken state leaking across caller implementations —
  the alternative of absolutizing paths in every caller would
  distribute unobvious knowledge across call sites.
- **Backward compatibility is mechanical.** Every existing config
  has `configRoot === repoRoot`; every existing atlas has all ADRs
  under the source root. Both conditions pass through the new code
  on the unchanged branch.

## Consequences

- Readers of `source_path` must consult the config to fully resolve
  external ADR paths. This was implicitly true before (all path
  resolution depends on `repoRoot`), but is now explicit for the
  ADR bucket specifically.
- The benchmarks repo's extraction flow becomes expressible without
  workarounds, unblocking CA integration there.
- `walkProseFiles` signature gains an optional third argument for
  `configRoot`. Callers passing only the first two arguments retain
  current behavior.
- Source-file walking remains strictly under-root-enforced. Any
  attempt to configure source code paths outside the source root
  continues to fail — preserving the security and ID-stability
  invariants from ADR-01 that motivated the constraint originally.
- A round-trip canary test asserts the main repo's own committed
  atlas survives storage code changes byte-identically. Catches any
  accidental drift in the storage layer that would break the
  "existing atlases read unchanged" promise.

## Non-goals

This ADR explicitly does NOT cover:

- **Multiple ADR roots in a single config.** Only one `adrs.path`
  per config. Teams wanting ADRs from multiple sources can either
  aggregate them into one directory at build time, or run extraction
  multiple times with different configs and merge results externally.
- **ADR aggregation across locations.** No merge semantics are
  defined or implemented for combining ADR trees from different
  sources. If two ADRs have colliding identifiers (e.g., both declare
  `ADR-01`), behavior is undefined; aggregation callers must
  deduplicate before invoking ContextAtlas.
- **Non-filesystem ADR roots.** ADRs must be readable from the
  filesystem. URL-based, archive-based, or VCS-protocol-based ADR
  sources are out of scope.
- **Cross-source-root atlas portability.** An atlas generated
  against source root A cannot be used as-is against source root B.
  Atlases are source-root-specific by design; relocating ADRs across
  source roots requires re-extraction because SHAs and path
  contexts change.
- **ADR indexing via `adrs.path` that points at a file rather than a
  directory.** `adrs.path` must name a directory. Single-ADR-file
  configurations are not supported; wrap the file in a directory.
