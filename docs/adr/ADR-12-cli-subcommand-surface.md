---
id: ADR-12
title: CLI subcommand surface — flags compose, subcommands partition
status: accepted
severity: hard
symbols:
  - parseArgs
  - ParsedArgs
  - main
  - runIndexSubcommand
---

# ADR-12: CLI subcommand surface — flags compose, subcommands partition

## Context

The `contextatlas` binary today does one thing: start the MCP
server over stdio. The extraction pipeline
(`runExtractionPipeline`) exists as a library function called
only from tests. There is no user-facing way to refresh an
atlas.

The gap has already created inconsistencies:

- **README.md line 204** documents `contextatlas index` as a
  quickstart step — a command that does not exist.
- **ADR-11 line 302** references `contextatlas --reindex` as
  the "manual update workflow" primitive — another command
  that does not exist, documented in the ADR that shipped
  today.
- **ADR-11's `--check` staleness workflow** depends on users
  being able to re-run extraction when the check fails. That
  dependency is unfulfilled without a CLI.
- **ROADMAP.md's rescope condition** about extraction cost at
  scale presumes a way for users to observe that cost — which
  presumes an invocation surface.

v0.3+ will add more index-time operations (docstring
extraction, PR mining, etc.). Each one needs an invocation
surface. Deciding the CLI shape ad-hoc as operations land
guarantees drift and inconsistency — two years from now
`contextatlas index`, `contextatlas extract-docstrings`,
`contextatlas --capture-from-session` and
`contextatlas-import-prs` will all coexist with no rule for
which pattern new operations follow.

This ADR locks the CLI model before the second operation lands.

## Decision

### Architectural rule — flags compose, subcommands partition

The distinction that governs every CLI addition from v0.1
forward:

- **Flags are orthogonal modifiers** that work across
  operations. `--config-root`, `--config`, `--verbose`,
  `--dry-run` compose with any subcommand; they don't change
  *what* the tool is doing, only *how* or *against what*.
- **Subcommands are distinct operations** with distinct
  argument shapes, distinct outputs, distinct stdio contracts,
  and distinct exit-code semantics. "Serve MCP over stdio"
  and "run the extraction pipeline and write an atlas" are
  different operations — different args, different
  behaviors, different success criteria.

Future operations (claim capture from agent sessions per
v0.6+, docstring import per v0.3, PR mining per v0.3, etc.)
will be subcommands. Flags stay reserved for modifiers that
apply across operations.

### Subcommand set for v0.1

```
contextatlas                        # default: start MCP server on stdio
contextatlas index                  # run extraction pipeline
contextatlas index --full           # force full re-extract (skip SHA-diff gate)
contextatlas --check                # staleness probe (see "asymmetry" below)
```

**No-subcommand default is MCP serving.** MCP clients spawn
the binary with no args and expect stdio JSON-RPC. That is a
hard external contract — Claude Code, Claude Desktop, and any
other compliant client depend on it. Breaking it would
require those clients to learn a new invocation. The binary's
"no args" shape is effectively an API surface and is covered
by the roadmap's one-way-migrations principle: forward-only,
no breaks without a major version bump.

**Subcommand is the first positional argument.** Before any
flag parsing, the parser inspects `argv[0]` (of the user
arguments, not `process.argv[0]`). If it matches a known
subcommand name, subcommand mode is entered. Otherwise, the
legacy no-subcommand path is taken. Flags may appear before
or after the subcommand name — subcommand detection is
positional, not order-sensitive for flags.

### `index` as the name, not `extract` or `reindex`

`index` names the complete pipeline operation: walk, extract,
resolve, store, export. It covers both first-run ("no atlas
yet") and update ("atlas exists; advance its state") cases
without the caller having to know which they're in — SHA-diff
gating inside the pipeline handles that.

Alternatives rejected:

- **`extract`** — too narrow. The Anthropic extraction call is
  only one stage of the pipeline (stage 3 in DESIGN.md). Users
  running `contextatlas extract` would reasonably expect a
  partial operation; they actually want the whole pipeline.
- **`reindex`** — presumes an index already exists. First-run
  users would reasonably reject it.
- **`refresh`** — same issue as reindex; implies pre-existing
  state.
- **`build`** — too generic; `build` means different things
  in different toolchains.

README already documents `contextatlas index`. Codifying the
existing documentation rather than renaming is the
least-disruptive choice.

### `--check` stays a flag, not a subcommand

ADR-11 shipped `--check` as a flag on `df39f7a`. That contract
is preserved. `--check` is technically an operation (it does
something different from serving MCP) and would be more
consistent as a subcommand `contextatlas check`, but:

- The ADR-11 contract is already external (documentation,
  CI hook examples forthcoming).
- The roadmap's **one-way-migrations** principle says
  forward-only; no back-porting, no dual-support.
- `--check` is cheap, zero-side-effect, stateless. Its
  "flag-ness" reflects its character (quick probe, exit).
  A full subcommand structure is overkill.

The asymmetry is intentional and limited to this one case.
Future check-like probes (v0.6+ might add a signals-quality
check, a claim-coverage check, etc.) will be subcommands,
not flags. Flag-status is grandfathered for `--check`, not
a pattern.

### Exit code scheme — per-subcommand 0/1/2 semantics, no unification

Each subcommand defines its own 0/1/2 meanings:

| Subcommand | 0            | 1                      | 2                               |
|------------|--------------|------------------------|---------------------------------|
| (MCP serve) | normal exit | server failure         | startup/config error            |
| `index`     | success     | extraction failure     | config/adapter/setup error      |
| `--check`   | current     | stale                  | unknown (pre-1.1 / non-git / missing atlas) |

CI consumers parse exit codes in the context of the
subcommand they invoked. `contextatlas --check` returning 1
means "stale"; `contextatlas index` returning 1 means
"extraction broke." They don't collide because the caller
knows which they ran.

The rejected alternative was a unified scheme (staleness
10-19, extraction 20-29, etc.). That would break ADR-11's
`--check` 0/1/2 contract, which is already external and
one-way-migration-locked. Asymmetry is the right cost to
pay to honor the shipped contract.

Documented explicitly here so future ADRs don't
un-asymmetrize it by accident — the asymmetry is a choice,
not an oversight.

### `index` subcommand spec

**Flags accepted by `index`:**
- `--config-root <path>` / `--config-root=<path>` — same semantics as ADR-08
- `--config <file>` / `--config=<file>` — same semantics as ADR-08
- `--full` — bypass SHA-diff gating; re-extract every prose file regardless of staleness
- `--json` — emit the completion summary as a single JSON object on stdout instead of the default `key=value` lines. Same fields, machine-friendly shape, consistent with the `format: "compact" | "json"` pattern `get_symbol_context` and `find_by_intent` already use for their MCP responses.

**Not accepted by `index`:**
- `--check` — flag belongs to the no-subcommand mode (staleness probe); passing it alongside `index` is rejected with an actionable error

**First-run vs. incremental behavior.**

`contextatlas index` handles three paths transparently from a
single command surface — the caller does not need to know
which case they're in. Pipeline internals handle the branch:

- **No atlas.json exists at `atlas.path`.** Full extraction
  runs: walk every prose file, extract claims, write
  `atlas.json` + `atlas.local_cache`. Summary reports
  `files_extracted=N, files_unchanged=0`. Logs read
  "initial extraction complete."
- **atlas.json exists.** SHA-diff-gated incremental: import
  the committed atlas, diff current prose SHAs against the
  baseline, extract only changed/added files, delete claims
  for removed files. The git phase always runs in full (per
  ADR-11). Summary reports `files_extracted=N,
  files_unchanged=M`.
- **`--full` flag passed.** Bypass the SHA-diff gate; every
  prose file is re-extracted regardless of its baseline SHA.
  Used for rebuilds after prompt changes, model changes, or
  suspected extraction quality issues. Same cost as first-run.

One command, three paths. No separate `contextatlas init`
subcommand — "initialize" is not a distinct operation; it's
the no-atlas-yet case of indexing.

**Output:**
- stderr: human-readable progress lines via the existing logger (same format as MCP server startup logs)
- stdout (default): a summary block on successful completion, one line per metric:
  ```
  files_extracted=N
  files_unchanged=N
  files_deleted=N
  claims_written=N
  symbols_indexed=N
  git_commits_indexed=N
  extracted_at_sha=<sha-or-null>
  atlas_exported=true|false
  wall_clock_ms=N
  api_calls=N
  ```
  Parseable by CI scripts without regex gymnastics. `key=value` lines are stable across releases; new keys may be added, existing keys never renamed. (One-way migrations principle again.)
- stdout (`--json`): a single JSON object with the same fields as the `key=value` output, plus any nested structures that don't flatten cleanly (e.g. `extraction_errors: [...]` when non-empty). Same stability contract: new fields may appear, existing fields never rename. Exit codes are unchanged between default and `--json` output.

**Side effects:**
- Writes `atlas.json` when `atlas.committed: true` and changes occurred
- Writes to `atlas.local_cache` (SQLite) always
- Never writes outside the configured atlas paths

**API key discovery:**
- Reads `ANTHROPIC_API_KEY` from environment
- If absent, exits code 2 with an actionable error message
- No `.env` file loading in v0.1. If users want that, they use a shell wrapper or their platform's env management

### ADR-11 amendment (bundled with this ADR's commit)

ADR-11's "Update workflows — primitives, not policy" section
references `contextatlas --reindex` in the **Manual** bullet.
That text predates this ADR by a few hours. Amend the text to
`contextatlas index`. No footnote, no cross-reference; ADRs
are self-contained. The amendment lands in the same commit as
this ADR.

## Rationale

- **Subcommand vs flag is not a stylistic choice.** The two
  patterns encode different semantics. Flags compose
  commutatively across operations; subcommands partition
  operation space. Mixing the two produces ambiguous contracts
  (is `--index` a modifier on something else? Or the operation
  itself?). Naming the rule up front prevents future debates.

- **MCP-default-no-subcommand is load-bearing.** Every MCP
  client spawns the binary with no args. Breaking that to
  introduce a "serve" subcommand would force every downstream
  tool to update invocation — cost borne by others, benefit
  largely aesthetic. One-way migrations + external contract
  = grandfather the no-subcommand path.

- **`index` over `extract`/`reindex`.** README already
  documents it; the name covers the whole pipeline rather
  than one stage; neither alternative covers both first-run
  and refresh cases cleanly.

- **`--check` flag-status grandfathered.** ADR-11 is 24 hours
  old and `--check` has already been publicly announced via
  commit message. Rewriting it to a subcommand would be pure
  breakage with no user benefit. The asymmetry is bounded
  (one flag, clearly called out) and costs less than breaking
  the contract.

- **Per-subcommand exit codes, not unified.** Unifying would
  break ADR-11's 0/1/2 `--check` contract. Preserving the
  per-subcommand semantics matches how most POSIX tools work
  (git, npm, kubectl — their exit codes mean different things
  per subcommand).

- **Structured `key=value` stdout.** CI consumers need
  parseable output. JSON adds dependency on a JSON parser in
  shell scripts. Plain `key=value` lines compose with `grep`,
  `awk`, `cut`. New subcommands may emit richer formats
  (`--json` flag for machine consumption), but the plain-text
  contract stays stable for existing `key=value` fields.

- **No `.env` loading.** Adds a dependency surface
  (`dotenv` or hand-rolled parsing) for a convenience the
  user can replicate with `source .env` in their shell or
  platform-specific env management. Keeps the binary's runtime
  deps minimal per CLAUDE.md.

## Consequences

- `src/cli-args.ts` gains subcommand detection in `parseArgs`.
  `ParsedArgs` gains `subcommand: "mcp" | "index"` (mcp = no
  subcommand = default). `--check` stays on the flag side.
- `src/index.ts` gains a dispatcher at the top of `main()`
  that branches on `subcommand` before the existing
  MCP-server setup runs.
- New module `src/extraction/cli-runner.ts` wraps
  `runExtractionPipeline` with the CLI-specific concerns:
  API key discovery, Anthropic client construction, adapter
  lifecycle, summary printing, exit-code mapping.
- ADR-11's Manual update workflow bullet text is updated from
  `contextatlas --reindex` to `contextatlas index` in the same
  commit as this ADR.
- Future subcommands (capture-claims, import-docs, etc.) slot
  into the existing dispatcher without re-designing arg
  parsing.
- `--check` asymmetry documented as intentional and bounded;
  future probes use subcommands.
- README.md's existing `contextatlas index` documentation
  becomes real. No README changes needed for this ADR — the
  doc was ahead of the code, now the code catches up.
- CI and hook writers get a stable `key=value` contract to
  build against. The four update workflows in ADR-11
  (CI-driven, pre-commit, pre-push, manual) all have
  concrete shell to write against.

## Implementation invariants

These aren't design decisions — they're rules derived from
the design that the implementation must preserve. Called out
here because they span the change and a reader of ADR-12 six
months from now will otherwise wonder why the code does
things a particular way.

- **Backward compatibility with shipped flags.**
  `--config-root`, `--config`, and `--check` must continue to
  behave exactly as they did before this ADR. Subcommand
  parsing is additive. Any argv that worked against
  `df39f7a` must still work, including error messages on
  malformed input.

- **Dispatch before config load.** The subcommand dispatcher
  runs before `loadConfig`. Different subcommands have
  different config-error semantics (e.g. `index` needs a
  full config; a hypothetical future `check-config` might
  want to surface parse errors without throwing). Loading
  config before knowing which subcommand is running would
  impose one subcommand's error model on all of them.

- **Adapter lifecycle discipline.** The `index` subcommand
  spawns adapter subprocesses (tsserver) the same way the
  MCP server does, and must shut them down cleanly on exit
  — success, failure, or signal. No zombie processes. This
  matches the shutdown discipline already in `src/index.ts`
  for the MCP path: adapter `.shutdown()` called in a
  `finally` block.

- **API key discovery is explicit, not silent.** Missing
  `ANTHROPIC_API_KEY` produces an actionable error message
  ("set ANTHROPIC_API_KEY in your environment before running
  `contextatlas index`") and exits code 2. Not a cryptic
  SDK-level 401 surfaced after the pipeline has already
  started walking files. The check runs early, before any
  side-effect-bearing work.

- **Subcommand parsing precedes flag parsing.** The first
  positional argv entry is inspected for subcommand names
  before flag parsing walks the argv array. This lets flags
  appear on either side of the subcommand name
  (`contextatlas --config-root /x index` and
  `contextatlas index --config-root /x` both work) while
  keeping the dispatch decision positional.

- **Exit on completion.** The `index` subcommand runs the
  pipeline, prints the summary, and exits. It does not
  keep a stdio channel open, does not linger waiting for
  input, and does not load MCP-server-specific code paths.
  Memory, file descriptors, and subprocesses are released
  before exit.

## Non-goals

- **General-purpose CLI framework.** No adoption of commander,
  yargs, or oclif. Hand-rolled parsing in `cli-args.ts`
  continues — the subcommand surface is small enough (v0.1:
  two; v0.5: maybe six) that a framework would be overkill.
- **YAML/JSON config for CLI flags.** Flags are passed on the
  command line or via env. A `.contextatlasrc` for default
  flag values is out of scope.
- **Alias support.** `reindex`, `extract`, `refresh`, `build`
  do not alias `index`. One canonical name per operation;
  aliases proliferate and drift. Users who remember the wrong
  name see an actionable error pointing them at the right one.
- **Plugin system for third-party subcommands.** The subcommand
  table is in-tree. External authors adding subcommands is a
  v1.x conversation and has its own architectural questions
  (symbol ID stability, atlas schema stability, etc.) worth
  their own ADR.
- **Interactive / TTY-aware output.** The binary is scripted by
  both MCP clients and CI systems. Output is always non-
  interactive. Terminal detection, progress bars, colored
  output — all out of scope.
- **Remote execution / daemon mode.** `contextatlas index`
  runs the pipeline in-process and exits. A long-running
  daemon that services extraction requests is a different
  product (closer to a build server than a CLI tool).
- **Uninstall / cleanup subcommands.** `contextatlas
  uninstall` or `contextatlas clean` not in v0.1. Users
  delete the `.contextatlas/` directory themselves.
