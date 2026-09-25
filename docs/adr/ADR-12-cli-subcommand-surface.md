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
- `--budget-warn <usd>` — v0.2 amendment; see Cost visibility below.
- `--verbose` — v0.2 amendment; see Verbose diagnostics below.

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
  input_tokens=N          # v0.2 amendment — see Cost visibility below
  output_tokens=N         # v0.2 amendment
  cost_usd=N.NNNN         # v0.2 amendment (4-decimal formatting)
  ```
  Parseable by CI scripts without regex gymnastics. `key=value` lines are stable across releases; new keys may be added, existing keys never renamed. (One-way migrations principle again.)
- stdout (`--json`): a single JSON object with the same fields as the `key=value` output, plus any nested structures that don't flatten cleanly (e.g. `extraction_errors: [...]` when non-empty). Same stability contract: new fields may appear, existing fields never rename. Exit codes are unchanged between default and `--json` output. In `--json`, `cost_usd` is emitted as a number (not a string), truncated to four decimals.

### Cost visibility (v0.2 amendment — 2026-04-23)

Three new summary fields were added as an additive extension of the
stdout contract. These codify behavior added in v0.2 Stream A #2 and
sit under the pre-existing "new keys may be added, existing keys
never renamed" guarantee — no breakage for consumers pinned on the
v0.1 subset.

- `input_tokens` — cumulative `input_tokens` across successful
  Anthropic API calls during the run.
- `output_tokens` — cumulative `output_tokens`.
- `cost_usd` — computed cost under Opus 4.7 pricing ($15/M input,
  $75/M output; constants in `src/extraction/pricing.ts`). Formatted
  to four decimal places in `key=value` output so sub-cent
  development iterations remain informative (`cost_usd=0.0053`
  rather than `0.00`). In `--json`, `cost_usd` is a number truncated
  to four decimals. Failed-retry token usage is not captured —
  visibility is limited to responses we actually received.
- `extraction.budget_warn_usd` (YAML config, optional) / `--budget-warn <usd>`
  (CLI flag, optional, overrides config) specifies a threshold
  ceiling. When cumulative `cost_usd` exceeds it during a run, a
  single warning is logged to stderr (`[warn] extraction: budget
  warning — ...`) and no further warnings fire for the remainder of
  the run. This is advisory, not a hard cap: the run continues and
  the exit code is unaffected. The semantic is intentionally loose
  — a hard cap is a distinct feature (not scoped for v0.2) and
  carries different UX requirements (when to abort, how to handle
  partial state).

### Verbose diagnostics (v0.2 amendment — 2026-04-23)

The `--verbose` flag on `index` emits per-file unresolved-token
detail to stderr at the end of a run. Default summary's counts
(`unresolved_candidates=N`, `unresolved_frontmatter_hints=N`) are
preserved unchanged; verbose adds the *specific tokens* behind
those counts, grouped by source file, with claim-text context for
each.

**Channel:** stderr. Follows `npm --verbose` / `git --verbose` /
`curl -v` convention — verbose amplifies the diagnostic channel,
not the summary channel. stdout stays pinned to the stable
ADR-12 `key=value` (or `--json`) contract. `--verbose` and
`--json` are orthogonal; combining them emits JSON summary on
stdout plus verbose detail on stderr.

**Format:**

```
[info] unresolved symbol candidates (--verbose): N tokens across M files
  docs/adr/ADR-07.md
    [frontmatter] Validator, Controller
    [claim: "must be idempotent" (hard)] Ghost, AlsoGhost
  docs/adr/ADR-04.md
    [claim: "validates input" (soft)] Validator.run
```

Grouped by source file (matches the authoring unit — debugging
ADR-to-symbol drift is file-centric). Claim text is truncated at
60 characters with a `...` marker to keep lines readable.

**Zero-unresolved case:** silent. No stderr emission when every
token resolves. The default summary's `unresolved_candidates=0`
already confirms success; a "no unresolved candidates" cheerleader
line would add noise without adding signal.

**Not yet supported** (explicitly out of scope for v0.2):
- Surfacing unresolved detail in the `--json` stdout body. If CI
  consumers need it, the `key=value`/JSON contract accommodates
  additive fields under the existing stability guarantee; revisit
  when evidence warrants.
- "Did you mean?" suggestions for unresolved tokens (nearest-neighbor
  symbol lookup). Useful but v0.3+; belongs with the broader
  claim-source-enrichment work.

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

## Amendment (2026-09-24, v1.2 Phase 1): stream-aware deletions and stale-symbol pruning in `index`

The "First-run vs. incremental behavior" spec above says an
incremental run will "delete claims for removed files". Two defects
in how the pipeline carried that out were found at v1.2 cycle entry
(`docs/cycles/v1_2/v1.2-SCOPE.md` §2 F-1, F-4). They were fixed
together, because in a three-stream atlas F-4 hid F-1.

- **F-4: deletion was not stream-aware.** `source_shas` holds keys
  for three claim streams. Prose keys are ADR/doc relPaths.
  Docstring keys are source-file relPaths such as `src/router.ts`,
  written even when a file yields zero claims. Commit keys come in
  two forms (F-5): the CLI commit extractor writes `commit:<sha>`,
  and the `/index-atlas` Skill writes the bare 40-hex sha.
  - **What went wrong.** Stage 2 diffed every key against the prose
    walk, so every docstring and commit key came back "deleted".
    Stage 5 then deleted those keys' claims, their `source_shas`
    rows, and (through `deleteSymbolsByPath`) the freshly upserted
    symbols of each docstring key's file.
  - **Real-data reproduction.** The reproduction used the v0.4
    dogfood atlas at 454fcc8, with all 24 prose SHAs unchanged and
    zero API calls:
    - docstring claims 377 → 0;
    - symbols 768 → 219;
    - `source_shas` 80 → 24;
    - ADR-claim links into the 56 docstring-keyed files 1423 → 0;
    - injected commit claims (both key forms) 6 → 0.
  - **Silent.** On an atlas with modern `adr:` prose sources the run
    exited 0, and the auto-invoked `validate-extraction` reported
    "conforms (449 claims across 24 sources)".
- **F-1: stale symbols were never pruned.** Stage 0 re-imports the
  committed atlas's symbols; Stage 4 only upserts the fresh
  inventory. Symbols of deleted, renamed, moved or newly excluded
  source files, and symbols removed from files that still exist,
  survived every run.
  - **Deleted file.** Deleting `src/adapters/go.ts` in a prose-only
    fixture left its 30 symbols and 61 ADR-claim links in the atlas.
  - **Committed dogfood atlas (generated at 751031a).** 229 of 1184
    symbols were stale or no longer in the inventory.

### Decision

**1. Source-key classification** (`src/extraction/source-keys.ts`).
Each baseline key is classified as prose, docstring or commit.
- **Primary signal: claims.** The `source` prefix of the claims
  stored under the key: `docstring:` → docstring, `commit:` →
  commit, anything else → prose (`adr:` and the legacy `ADR-NN` /
  `DESIGN` names).
  - When a key's claims disagree, the stream whose deletion rule
    deletes least wins: commit, then docstring, then prose.
- **Zero-claim keys: shape fallback, in order.**
  - A key the current prose walk produced → prose.
  - `commit:` prefix or a bare 40-hex sha → commit.
  - A path whose extension belongs to **any** registered language
    adapter (not only the configured ones) → docstring.
  - Anything else → prose.
- **Extension list.** `REGISTERED_LANGUAGE_EXTENSIONS` is typed
  `Record<LanguageCode, …>`, so adding a language without an entry
  fails compilation. `src/adapters/registry.test.ts` pins each entry
  to the adapter's own `extensions`. The copy exists because core
  modules must not import concrete adapters.

**2. Stream-aware Stage 5.** Stage 2 now diffs only the prose part of
the baseline. Stage 5 applies one rule per stream:

| Stream | A key is deleted (claims + `source_shas` row) when… |
|---|---|
| prose | it is absent from the prose walk. This now also holds under `--full`, which previously never deleted. |
| docstring | its source file no longer exists under the source root. A changed file keeps its claims and baseline key, because the CLI does not re-extract docstrings until v1.2 Phase 2 (Phase 3 queues it). |
| commit | never (the v0.8 LOCK 2.b retain discipline, which the key-based delete had silently broken). |

`--full` does not change the docstring or commit rules. Stage 5 no
longer deletes symbols: `deleteSymbolsByPath` on a prose path had
nothing to delete, and symbol cleanup (including the A3
`claim_symbols` cascade) moved to the prune step.

**3. Stale-symbol pruning** (`src/extraction/symbol-prune.ts`, Stage
4a, right after the Stage 4 upsert and before Stages 5–6). Stage 6
resolves candidates against the fresh inventory, which never holds a
pruned symbol, so no claim written in the same run can link to one.
- **Coverage report.** `buildSymbolInventory` now reports which
  walked files were listed and which failed (`listedPaths` /
  `failedPaths`).
- **Rules.** For every stored symbol path, the first matching rule
  applies:
  1. the file no longer exists → prune all its symbols;
  2. the file was walked and listed → prune its symbols missing from
     the new listing;
  3. the file was walked but `listSymbols` threw (or no adapter
     answered) → keep all its symbols, count it as unverified;
  4. the file exists, was not walked, and a configured adapter owns
     its extension (an exclude pattern now drops it) → prune;
  5. the file exists, was not walked, and no configured adapter owns
     its extension (language not configured this run) → keep, count
     it as unverified.
- **Cascade.** Pruning deletes the pruned symbols' `claim_symbols`
  rows (`deleteSymbolsByIds`, one transaction).
- **Claims are never deleted by pruning.** A claim whose last link
  is removed is **orphaned**: it stays in the atlas and is reported.
  Phase 3 queues orphaned claims' sources for Tier 1 re-extraction.
- **Warnings.** Unverified files produce one warning with counts and
  sample paths. Orphaned claims produce one warning listing their
  sources.

**4. Summary output.** Appended per this ADR's "new keys may be added,
existing keys never renamed" rule. Existing keys keep their names and
order.
- **`key=value`.** Four keys follow `extraction_errors`:
  `symbols_pruned`, `claims_orphaned`, `docstring_sources_deleted`,
  `unverified_symbol_files`.
- **`--json`.** The same four fields, plus
  `orphaned_claims_by_source: [{source, source_path, count}]`, sorted
  by `source` and then `source_path`.
- **`files_deleted` now counts prose deletions only.** That was its
  documented meaning; the F-4 bug had inflated it with docstring and
  commit keys, for example `files_deleted=56` on the unchanged
  reproduction atlas.

**5. Export decision.** Stage 7 also re-exports when symbols were
pruned or a docstring key was deleted. A run that changes nothing
still leaves `atlas.json` byte-identical: the no-op contract is
unchanged. On the reproduction fixtures, a second `index` run exported
nothing and left the file's SHA-256 unchanged.

**6. Skill-path parity (`contextatlas resolve-symbols`).**
- **Before.** The Skill path's symbol writer rebuilt `symbols[]`
  wholesale from the LSP walk, so stale symbols did not persist. But
  it merged each claim's prior `symbol_ids` into the new ones, and it
  left claims with no candidates untouched. A link to a symbol whose
  file had been deleted therefore survived as a dangling id. The
  importer then rejects the atlas (`FOREIGN KEY constraint failed`:
  `claim_symbols.symbol_id` references `symbols.id`). The wholesale
  rebuild also dropped the symbols of any file whose listing failed.
- **Now.** It applies the same `planSymbolPrune` rules:
  - prior symbols are kept only for unverified files;
  - `claims[].symbol_ids` entries with no matching symbol are
    dropped;
  - claims left with no links are reported as orphaned. The new
    stdout line is printed only when something changed.
- **Unchanged:** it still walks without the configured
  `exclude_pattern`s (see Consequences).

### Pipeline-integration stage table

Per CLAUDE.md "Pipeline Integration Discipline". Stage numbers follow
`src/extraction/pipeline.ts`. Prose is the precedent stream.

| Stage | prose (precedent) | docstring | commit |
|---|---|---|---|
| 0 import | Imported with the atlas | Symmetric to prose | Symmetric to prose |
| 1 walk + classify | Prose walk; classified by claim source (`adr:` / legacy) | Not walked by the CLI `index`. Divergence: classified by `docstring:` claims or a registered source extension | Not walked by the CLI `index`. Divergence: classified by `commit:` claims or key shape (both F-5 forms) |
| 2 SHA diff | Prose baseline vs prose walk | Not applicable: no CLI re-extraction until Phase 2 | Not applicable: commits are immutable |
| 3–4a inventory, upsert, prune | Stream-independent. Symbols belong to source files, and the prune rules cover every stored symbol path whichever stream's claims link to it | Symmetric | Symmetric |
| 5 deletions | Deleted iff absent from the prose walk (also under `--full`) | Divergence: deleted iff the file is missing on disk | Divergence: never deleted |
| 6 extraction | Changed/added prose files | Not applicable (v1.2 Phase 2) | Not applicable (v1.2 Phase 2) |
| 6b orphan report | Per claim source | Symmetric | Symmetric; commit claims orphan but are retained (LOCK 2.b) |
| 7 export | `didModify` adds prunes and docstring deletions | Symmetric | Symmetric |
| Skill `resolve-symbols` | Same prune rules via `planSymbolPrune`; dangling links dropped | Symmetric | Symmetric |

### Consequences

- **The first `index` after upgrading prunes accumulated stale
  symbols.** Expect a one-time `atlas.json` diff. On the v0.4
  reproduction atlas, 223 symbols were pruned:
  - 4 no longer listed;
  - 219 at test paths excluded since the v0.4 A4 exclusion (rule 4).

  One claim was orphaned; 12 links went with those symbols.
- **Rule 4 applies to test-file symbols written by
  `resolve-symbols`.** That writer walks without `exclude_pattern`, so
  a CLI `index` after a Skill refresh prunes those symbols again. This
  cross-path churn is recorded as an open question for Phase 3 in the
  v1.2 scope doc. `resolve-symbols` walk scope is unchanged here.
- **Orphaned claims are now visible.** They stop reaching symbol
  bundles until their source is re-extracted. `claims_orphaned` makes
  that measurable.
- **F-5 is not normalized here.** Both commit key forms are
  recognized; unifying them belongs to Phase 2 (three-stream CLI).
- **`symbol_candidates` is still lost.** The storage layer has no
  column for `claims[].symbol_candidates` (atlas v1.4 optional field),
  so any CLI `index` run on a Skill-built atlas drops it on re-export.
  This predates Phase 1 and is recorded as a Phase 2/3 input.

## Amendment (2026-09-25, v1.2 Phase 2): three-stream `index`, cost preview, canonical commit keys

Until this amendment the shipped `contextatlas index` extracted
ADR/docs prose only. Docstring and commit-message extraction existed
as library functions, called by `scripts/dogfood-extract.mjs` and the
benchmarks scripts but not by the CLI (`docs/cycles/v1_2/v1.2-SCOPE.md`
§2 F-2). The same phase closes two v1.2 cycle-entry findings. The
two extraction paths wrote commit keys in two forms (F-5), and
`claims[].symbol_candidates` did not survive a CLI run (F-7).

### Decision

**1. Streams.** `index` extracts the streams that
`extraction.streams` enables (ADR-05 2026-09-25 amendment); without
the key it extracts all three. They always run in the fixed order
prose (`adr`) → docstring → commit, one after another, and share one
cost tracker and budget check. Prose runs first so that its
"every document failed" error (since the review fixes it counts only
API or network errors) can never discard a later stream's paid work.
- **Library default.** `runExtractionPipeline` extracts the streams in
  `deps.streams`. When the field is omitted it extracts prose only,
  the pre-Phase-2 library behaviour. `AnthropicAPIDirectExtractor`
  passes `resolveExtractionStreams(config)`. Library callers such as
  the benchmarks driver therefore keep the prose-only stream set until
  they opt in. Their atlas substrate still changes (see "Library
  callers" under Consequences).
- **Stages 1, 1b and 2 always run.** Only the Stage 6 prose extraction
  depends on `adr` being enabled. Skipping the prose walk would make
  Stage 5 treat every prose key as deleted.

**2. New and changed stages** (`src/extraction/pipeline.ts`, now the
orchestration only).
- **Stage 0.5, commit-key migration (F-5).** After the atlas import and
  before the baseline is read, `normalizeCommitKeys`
  (`source-keys.ts`) rewrites every commit stored under a bare 40-hex
  sha to `commit:<sha>`. It rewrites both the `source_shas` key and
  `claims.source_path`; claim ids and symbol links are unchanged.
  - Only keys that the Phase 1 classification places in the commit
    stream are touched. A prose file with a 40-hex name is left alone.
  - When a sha exists in both forms, the `commit:<sha>` form wins. The
    bare-form claims are deleted, and the count is logged as a warning
    that says how to refresh a pre-v1.2 installed Skill.
  - It runs on every `index`, whatever streams are enabled, because
    installed SKILL.md copies are never overwritten. It is idempotent.
    A migration counts as a modification for Stage 7.
- **Stage 5, docstring rule (L-11).** A docstring key is still deleted
  when its file no longer exists. While the docstring stream runs,
  one more case is deleted: the file exists, is no longer walked, and
  a configured adapter owns its extension, so an exclude pattern now
  drops it (Phase 1 prune rule 4). A file whose language is not
  configured keeps its key (rule 5). With the stream disabled, such
  keys stay frozen. A changed file keeps its claims and key at Stage 5;
  Stage 6c replaces them.
- **Plan** (`extraction-plan.ts`), after Stage 5 and before any model
  call. No model calls and no database writes.
  - prose: Stage 2's changed and added files.
  - docstring: walked source files whose SHA differs from their key.
    Excluded: files whose `listSymbols` failed this run (their stored
    symbols and claims are unverified, and the key is kept), and
    files that `docs.include` also matches (one warning; both streams
    key by relPath, so extracting them here would replace their prose
    claims). For the planned files the plan reads the docstrings of
    exported symbols through the language adapters (LSP only) and
    hands the result to Stage 6c, so the preview's call count is
    exact and no file is read twice. Symbols come from the Stage 3
    inventory; nothing is listed twice.
  - commit: `git log --no-merges` through the commit filter, minus
    commits already keyed in either form. Only when the git signal
    (Stage 4b) found a HEAD. This log is separate from the git signal
    and not capped (the git signal keeps its 500-commit cap), so a
    first run covers the whole filtered history.
- **Stage 6c, docstring stream** (`stream-stages.ts` →
  `extractDocstringFile` in `docstring-stream.ts`). One call per
  exported symbol with a non-empty docstring, sequential; the request
  body is the raw docstring.
- **Stage 6d, commit stream** (`stream-stages.ts` →
  `extractCommitClaims` in `commit-message-extractor.ts`). One call per
  pending commit, sequential; the body is the subject, a blank line
  and the message body.
- **Stage 6b** (orphan report) now runs after 6c and 6d, so claims
  those stages re-extracted are not reported.
- **Stage 7** also re-exports when a commit key was migrated, a
  docstring file was stored, or a commit was keyed. A run that changes
  nothing still leaves `atlas.json` byte-identical.

**3. Write and failure semantics per unit** (lead decision L-10).
- **Docstring file.** Its claims are replaced and its SHA pinned only
  when every call for the file succeeded, in one transaction (delete
  by path, insert, set the key). A call that throws, a result that
  does not parse, a failed docstring read, or a failed write leaves
  the file's previous claims and key untouched. The error is recorded
  and the next run retries the whole file (after `--full`, when the
  kept key already matches the file, only another `--full` does;
  Decision 4). Once one call for a file fails, the file's remaining
  calls are not made. A
  planned file with no documented exported symbol is keyed with zero
  claims.
- **Commit.** One transaction deletes the commit's claims in both key
  forms, drops a bare key, inserts the new claims and sets
  `commit:<sha>` → sha. A call that throws leaves the commit unkeyed,
  so the next run retries it. A result that does not parse (max_tokens
  or malformed JSON) pins the key with zero claims and logs a warning
  naming the key to remove from `source_shas` to retry: in
  `atlas.json` with `atlas.committed: true`, in the local cache
  (`atlas.local_cache`, table `source_shas`) with `false`. Commits are
  immutable, so re-billing a likely-deterministic failure on every run
  would buy nothing. Prose and docstrings keep retry-on-null.
- **No git.** In a non-git tree, or when git is unavailable, the commit
  stream is skipped with an info log. Any other `git log` failure is
  skipped with a warning. Neither fails the run.
- **A stream where every call failed.** When a docstring or commit
  stream attempted at least one call and all of them failed, the run
  still finishes the remaining streams and Stage 7. `index` then prints
  the summary, writes an actionable message to stderr, and exits 1.
  Throwing mid-run would skip the remaining streams and Stage 7 for
  no benefit. The prose all-fail throw is unchanged (exit 1, before
  export). Only calls that threw an API or network error (and, for
  commits, failed writes) count as failed, for the prose throw too;
  see "Review fixes (2026-09-25)" below.

**4. `--full`** (L-7). It re-extracts every prose file and, while the
docstring stream runs, every listed docstring file. Commits stay gated
by their key: they are immutable, and `--full` exists for prompt or
model changes, where re-billing the whole filtered history would need
its own explicit flag.
- **A failed `--full` re-extraction** keeps the file's previous claims
  and its key, which already names the file's current content, so the
  SHA gate of a plain run does not retry it; only another `--full`
  does, and that re-extracts every file again. `index` lists those
  files in a warning, and the docstring `extraction_errors` entry and
  the exit-1 message, closing line included, say the same (review
  fixes). When every prose call fails, the run throws before that
  warning and before the docstring stream, and the thrown error says
  to re-run `--full`. A changed or new file that fails under `--full`
  is retried by a plain run.
- **An interrupted `--full`** keeps the re-extractions it completed
  (checkpoints, Decision 10). The unchanged files it did not reach
  keep keys that match their content, so again only another `--full`
  completes the rebuild.

**5. Cost preview** (L-8 (a); `cost-preview.ts`). Before the first
model call, `index` prints an estimate to **stderr**. stdout is
unchanged, so `--json` still carries one object.
- **When.** Only when the plan has at least one model call. A no-op
  run prints nothing.
- **Content.** Per enabled stream: units (files or commits), calls and
  estimated input tokens. Then the total calls, a low-high cost range
  and the pricing line. Disabled streams are named. A skipped commit
  stream gives its reason.
- **Not interactive.** There is no prompt and no confirmation; the run
  continues. `--budget-warn` stays the in-run guard, and `cost_usd` in
  the summary is the actual. The preview carries no "actual is ~3x
  lower" wording (CLAUDE.md "Extraction cost framing", 2026-09-25
  correction).
- **Estimate.** Input tokens are the request text
  (`EXTRACTION_PROMPT` + body + `"\n---\n"`) at 3 characters per token
  (`CHARS_PER_TOKEN_ESTIMATE`, `pricing.ts`). Output tokens are fixed
  per-call priors, low/high: prose 1,000/6,000; docstring 30/400;
  commit 30/400 (`OUTPUT_TOKEN_PRIORS`). Both are to be recalibrated
  from the Phase 2 paid parity run.
- **API key first.** A missing `ANTHROPIC_API_KEY` still exits 2
  before any planning, so no preview is printed.

**6. Summary output** (L-9). The "new keys may be added, existing keys
never renamed" rule holds. Existing keys keep their names and order.
- **Widened to all streams:** `claims_written`,
  `unresolved_candidates`, `api_calls`, `input_tokens`,
  `output_tokens`, `cost_usd` and `extraction_errors`. `cost_usd` and
  `--budget-warn` therefore mean the run's true spend.
- **Still prose only:** `files_extracted`, `files_unchanged`,
  `files_deleted` and `unresolved_frontmatter_hints`. `--verbose`
  unresolved-token detail is also prose only.
- **Widened in meaning:** `docstring_sources_deleted` also counts the
  Stage 5 L-11 deletions.
- **`extraction_errors` entries** keep the shape
  `{sourcePath, error}`. A docstring entry uses the file's relPath and
  names the symbol id in `error`; a commit entry uses `commit:<sha>`.
- **Appended after `unverified_symbol_files`**, in this order, in both
  formats:

  | Key | Meaning |
  |---|---|
  | `streams_enabled` | Streams enabled for this run (`extraction.streams`), in canonical order. An enabled stream can still be skipped, such as the commit stream without a git tree (`commits_extracted=0`). Comma-joined in `key=value`; an array in `--json`. |
  | `docstring_files_extracted` | Docstring files stored this run, including zero-docstring files keyed with no claims. |
  | `docstring_files_unchanged` | Walked, listed source files the docstring SHA gate skipped. |
  | `docstring_symbols_extracted` | Calls behind the stored docstring files (one per documented symbol). |
  | `docstring_claims_written` | Claims those files wrote. |
  | `commits_extracted` | Commits keyed this run: claims stored, or a null result pinned. |
  | `commits_skipped` | Filter-passing commits skipped because they were already keyed. |
  | `commit_claims_written` | Claims the commit stream wrote. |
  | `commit_keys_migrated` | Commits moved from the bare-sha form by Stage 0.5. |

  Which stream failed entirely is not a summary key; the exit code
  and the stderr message carry it.

**7. `--json` prints exactly one JSON object on stdout.** When the
run exported (since the review fixes, on every `atlas.committed: true`
run with an `atlas.json` on disk), `index` runs `validate-extraction`,
which printed its
one-line result to stdout after the JSON object. That broke the
single-object contract above. Under `--json` the validator's line now
goes to stderr. `key=value` output is unchanged: the line still
follows the summary on stdout.

**8. Canonical commit key (F-5, L-2).** `commit:<sha>` is the
`source_shas` key and the `claims.source_path` of every commit claim,
so `source_path == source`.
- The `/index-atlas` Skill writes it from v1.2 on;
  `list-extraction-sources` gives it to the Skill as
  `commit.source_key`.
- Every reader accepts the legacy bare-sha form permanently.
- `validate-atlas` warns (exit 0) on bare-form keys and claim paths.

**9. `symbol_candidates` survives `index` (F-7, L-5).**
- Local cache migration 6 adds `claims.symbol_candidates`.
- The importer keeps `claims[].symbol_candidates`. The exporter emits
  it after `symbol_ids`, in stored order, only when non-empty. An
  empty list therefore exports as an absent key.
- CLI extraction now records the model's raw candidates on the claims
  of all three streams. Docstring claims record only the model's
  candidates: provenance stays the exact documented symbol id in
  `symbol_ids`.
- The field never reaches `Claim` or MCP tool output; that output is
  byte-identical.
- The atlas schema stays 1.4, where the field was already optional.

**10. Checkpoint exports** (review fixes; lead decision F7;
`createCheckpointer` in `atlas-export-stage.ts`). With
`atlas.committed: true`, `index` also writes `atlas.json` while it
extracts, so an interrupted run (Ctrl-C, a crash, a closed terminal)
keeps the units it stored. Before, when `atlas.json` existed at the
start of the run, it was written only at Stage 7 and the next run's
Stage 0 imported it over the cache, so the interrupted run's paid work
was billed again (in 1.1.3 for prose). A run that starts without
`atlas.json` is the exception, where 1.1.3 lost nothing: see "Known
limitations" under "Review fixes (2026-09-25)".
- **When.** After a stored unit, once `checkpointIntervalMs` has
  passed since the last export, or since the checkpointer was created
  (after the cost preview, just before Stage 6). A unit is a prose file
  whose claims and key were written, a stored docstring file, or a
  keyed commit (claims stored, or a null result pinned). The default
  interval is 30 s (`DEFAULT_CHECKPOINT_INTERVAL_MS`), checked only at
  unit boundaries; `0` exports after every unit (the tests use it).
  There is also one at the end of Stage 6 (after the all-failed check)
  and one at the end of Stage 6c, when a unit is pending. After Stage
  6d the next export is Stage 7; only the read-only Stage 6b runs in
  between.
- **What.** The Stage 7 export (`finalizeAtlas`) over the units stored
  so far: `generated_at` is the time of the checkpoint, and `version`
  and the generator fields are Stage 7's. The one difference: a
  checkpoint keeps the `extracted_at_sha` the run started from (absent
  when it was absent); only Stage 7 stamps HEAD. A checkpoint therefore
  never reads more current than the atlas did before the run. After an
  interrupted first run it has no `extracted_at_sha`, so `init` does not
  skip extraction, and `--check` and atlas-only mode do not treat it as
  current; an atlas whose `extracted_at_sha` already named HEAD before
  the run reads as current as it did then. `git_commits` is already this
  run's list (Stage 4b ran), which against the older `extracted_at_sha`
  only reads as stale.
- **Whole units.** A docstring file (S5), a commit (S3) and, since the
  review fixes, a prose file are each written in one transaction, and
  the writes run synchronously between awaits, so a checkpoint holds
  whole units only. Each checkpoint is what a completed run over those
  units would have written, apart from `extracted_at_sha`. ADR-06 is
  unchanged: `atlas.json` stays the source of truth, and each checkpoint
  is a consistent atlas.
- **Atomic.** `atlas.json` is written to `<atlas>.tmp`, then renamed
  over the file ("Review fixes (2026-09-25)" below).
- **The next run** imports the checkpointed `atlas.json` at Stage 0 as
  usual. Completed prose and docstring units carry their current SHA as
  key, so the SHA gates skip them; unfinished units still carry their
  old key, or none, and are extracted; keyed commits are skipped. Stage
  4a pruning, Stage 5 deletions and Stage 0.5 migrations the checkpoint
  already holds leave nothing to do, and any it missed are recomputed
  without API calls. Nothing depends on the local cache: a fresh cache
  gives the same run.
- **No-op runs are unchanged.** Only a stored unit makes a checkpoint
  pending, so a run that stores nothing never writes `atlas.json`
  before Stage 7 and still leaves it byte-identical. A run that
  checkpointed stored a unit, so `didModify` is true and Stage 7 writes
  the final, stamped atlas.
- **A failed checkpoint** is logged once as a warning, and the run goes
  on (lead decision F7). Its units stay pending for the next checkpoint
  or Stage 7, which still fails loudly. The interval restarts, so a
  failing export is not retried at every unit boundary.
- **Validation and output.** `validate-extraction` runs once, after the
  pipeline (Decision 7), not per checkpoint, so the run after an
  interruption validates the atlas. The cost preview, the summary and
  `atlasExported` (the Stage 7 export) are unchanged; each checkpoint
  logs one info line to stderr ("checkpoint: atlas.json holds the work
  stored so far"), and only the Stage 7 export logs "atlas.json
  written".
- **Library callers** of `runExtractionPipeline` with
  `atlas.committed: true` checkpoint too (`deps.checkpointIntervalMs`,
  default 30 s); the final `atlas.json` is the same.
- **`atlas.committed: false`: no checkpoints.** Every unit is durable in
  the cache, the source of truth in that mode, as soon as it is stored,
  and Stage 0 never imports over a non-empty cache.
- **Differences from a completed run** are listed under "Review fixes
  (2026-09-25)", "Known limitations": the next run does not repeat the
  orphan warning, a partial `atlas.json` is a working-tree edit, and a
  run on a temporary tree or config leaves that tree's pruning and
  deletions in `atlas.json`.

### Pipeline-integration stage table

Per CLAUDE.md "Pipeline Integration Discipline". Stage numbers follow
`src/extraction/pipeline.ts`, as in the Phase 1 table; the DESIGN.md
"Extraction Pipeline" stage is in brackets. Prose is the precedent
stream. This table supersedes the Phase 1 table's docstring and
commit columns for stages 1, 2 and 6.

| Stage [DESIGN] | prose (precedent) | docstring | commit |
|---|---|---|---|
| 0 import [Stage 0] | Imported with the atlas (`atlas.committed: true`); with `atlas.committed: false`, only into an empty cache (review fixes) | Symmetric to prose | Symmetric to prose, except that with `atlas.committed: true` and no `atlas.json` the cache is the baseline, so commits it extracted on another branch reach this branch's first `atlas.json` (a known limitation; review fixes) |
| 0.5 key migration | Not applicable | Not applicable | Divergent: bare-sha keys and claim paths become `commit:<sha>`, because two paths wrote two forms; counts as a modification |
| 1 collect [Stage 1] | `walkProseFiles` | Divergent: reuses the Stage 3 source walk (`walkSourceFiles` + exclude patterns); no second walker | Divergent: `git log --no-merges` + commit filter (`parseCommitLog`), because commits live in git history, not the filesystem; skipped without a git HEAD |
| 1b classify | By claim source; a zero-claim key by the prose walk, then key shape (known limitation after a `docs.include` change: remove the key or run `--full` once; review fixes) | Symmetric to prose (Phase 1) | Symmetric to prose (Phase 1; both key forms recognized) |
| 2 SHA gate [Stage 6] | Per-file SHA vs the prose baseline; `--full` forces | Same rule against the docstring baseline, evaluated in the plan after Stage 3; files whose listing failed and files `docs.include` also matches are skipped; `--full` forces | Divergent: key presence in either form (commits are immutable); `--full` does not force |
| 3–4a inventory, upsert, prune [Stage 2] | Stream-independent | Symmetric; also consumes the Stage 3 inventory (no re-listing) | Symmetric; candidates resolve against the same inventory |
| 4b git signal (ADR-11) | Not applicable | Not applicable | Related: its HEAD gates the stream; the stream's own `git log` is uncapped, the signal's is capped at 500 |
| 5 deletions [Stage 6] | Absent from the prose walk | Divergent: file gone; or, while the stream runs, file no longer walked and owned by a configured adapter | Divergent: never deleted (LOCK 2.b) |
| plan + preview | Counts planned files | Counts calls exactly via the zero-API docstring read | Counts pending commits |
| 6 extract [Stage 3] | Frontmatter-stripped file, batches of 3 | Divergent: one call per documented exported symbol, sequential; body = raw docstring | Divergent: one call per pending commit, sequential; body = subject + blank line + body |
| 6 API call [Stage 3] | `EXTRACTION_PROMPT` + body, frozen request, wrapper retries | Symmetric to prose | Symmetric to prose |
| 6 resolve [Stage 4] | `resolveCandidates` + frontmatter fallback (`narrowAttribution`) | Divergent: the documented symbol's id + `resolveCandidates`; no frontmatter | Divergent: `resolveCandidates` only |
| 6 store [Stage 5] | Delete by path, insert and key in one transaction (review fixes), after a parsed result; source `adr:<basename>`; raw candidates kept | Divergent: all-or-nothing per file in one transaction; source `docstring:<relPath>`, `source_path` relPath; raw candidates kept | Divergent: one transaction per commit (delete both forms, insert, key `commit:<sha>`); null result pinned with zero claims; `source` = `source_path` = `commit:<sha>`; raw candidates kept |
| 6 errors, budget | `extraction_errors`; all-fail throw (API or network errors only) | Shared budget; own errors; all-fail → exit 1 after export | Same as docstring |
| 6b orphan report | Per claim source | Symmetric; runs after 6c | Symmetric; runs after 6d; orphan shells retained |
| 7 export [Stage 5] | `didModify`, or no `atlas.json` yet (`atlas.committed: true`); checkpoint exports after Stages 6 and 6c and, at most every 30 s, after a stored unit (Decision 10); only Stage 7 stamps `extracted_at_sha` | Symmetric; adds stored docstring files and L-11 deletions; a stored file is a checkpoint unit | Symmetric; adds keyed commits and migrations; a keyed commit is a checkpoint unit |
| Skill `resolve-symbols` | Phase 1 prune rules | Symmetric | Symmetric; no key normalization at this boundary (the next CLI `index` migrates) |

### Notes on earlier text in this ADR

These correct statements above without rewriting them (Pattern 3).
- **`--full`.** The flag list and "First-run vs. incremental behavior"
  say it re-extracts "every prose file". Since this amendment it also
  re-extracts docstring files while that stream runs; commits stay
  key-gated (Decision 4).
- **Flag list.** `--narrow-attribution <drop|drop-with-fallback>` has
  been accepted by `index` since v0.3 (`7e1956a`) but is missing from
  the "Flags accepted by `index`" list. It overrides
  `extraction.narrow_attribution`.
- **Pricing.** "Cost visibility" quotes $15/M input and $75/M output.
  `pricing.ts` has used $5/M and $25/M since v0.6 (`6c48078`,
  2026-05-09).
- **`cost_usd` in `--json`.** It is rounded to four decimals
  (`toFixed(4)`), not truncated.
- **Phase 1 amendment.** Its docstring row ("the CLI does not
  re-extract docstrings until v1.2 Phase 2"), its stage-table
  "Not walked" and "Not applicable (v1.2 Phase 2)" cells, and its
  consequences "F-5 is not normalized here" and "`symbol_candidates`
  is still lost" are superseded by Decisions 2, 8 and 9 above.

### Consequences

- **Default-on cost.** Every `index` without `extraction.streams`,
  including `init`'s first run (lead decision L-13 (a)), now makes
  docstring and commit model calls. The preview shows the size first.
  On this repository, a zero-API probe at `9d2bf4c` planned 479 calls:
  13 prose files, 461 docstring calls across 108 files, and 5
  commits. The preview estimated $4.42 to $10.35.
- **One-time `atlas.json` diff.** The first three-stream run keys
  every walked source file whose symbols and docstrings it can read
  (a file with no documented exported symbol gets a key with no
  claims) and every filter-passing commit. It migrates bare
  commit keys and adds `symbol_candidates` to every claim it
  re-extracts.
- **Exit 1 for a failed stream.** A run can exit 1 after exporting.
  CI that reads the exit code sees the failure; the summary on stdout
  is complete, and nothing new was recorded for the failed units.
- **Library callers.** A caller that omits `deps.streams` stays prose
  only. Stage 0.5 still runs for it; on an atlas that already uses
  canonical keys it changes nothing. The result object gains the
  per-stream fields above. The atlases library callers produce still
  change, so benchmark atlases regenerated with this dist are an
  atlas-substrate change to tag and control for in the benchmarks
  methodology log (F1/F9 tag-and-control):
  - every claim the library writes carries `symbol_candidates`
    (Decision 9): prose through `runExtractionPipeline`, and the
    driver's own `extractDocstringsForFile` and
    `extractCommitMessagesForRepo` passes;
  - `extractDocstringsForFile` stores a file only when every call for
    it succeeded (Decision 3), so a failing call now leaves that file
    with its previous claims (or none) instead of the other symbols'
    new claims;
  - `extractCommitMessagesForRepo` pins a commit whose response does
    not parse (null result or malformed JSON) instead of retrying it.
- **Skill path.** `/index-atlas` writes canonical commit keys and no
  longer drops keys its manifest does not enumerate. `doctor` gains
  `extraction.skills_fresh`, which flags installed skill copies that
  differ from the package's. See `docs/cycles/v1_2/v1.2-SCOPE.md`
  Phase 2 outcome.

### Review fixes (2026-09-25)

**Consolidation note.** Four unreleased review rounds (`a2caa41`,
`c1c1003`, `5261fbe`, `ac8d784`) and a simplification commit (`aae41d4`;
lead decision 2026-09-25, SIMPLIFY) changed Phase 2 before release.
This section records the net behaviour against 1.1.3. It replaces the
four per-round sections (lead decision 2026-09-25); their text,
including the mechanisms removed before release, is in git history at
`ac8d784` (Pattern 3: the history is kept, not rewritten). Decisions 1,
3, 4, 7 and 10 and the stage table above state the final behaviour.
The lead decisions F1 to F7 named below are recorded in
`docs/cycles/v1_2/v1.2-SCOPE.md`, Phase 2 outcome.

#### Kept fixes

*Accounting and failure semantics*
- **Malformed JSON.** The extraction client throws `ParseError` for
  output that is not the expected JSON; it never returned
  `result: null` for it. In every stream the tokens of such a response
  are now counted in `cost_usd` and the budget check
  (`ParseError.usage`). A commit whose response does not parse is
  pinned with zero claims, as L-10 (iii) states; before, it stayed
  unkeyed and was billed again on every run.
- **What fails a stream, and the prose all-failed throw** (L-10 ii;
  lead decision F4). Only calls that threw an API or network error,
  and failed commit writes, count. An unparseable response (a null
  result, malformed JSON) never does: a prose or docstring file keeps
  its claims and key and is retried (a docstring file's, and a prose
  file's malformed JSON, are reported in `extraction_errors`); a
  commit's is pinned and logged as a warning (it is counted in
  `commits_extracted`, with no claims). Before, one unparseable
  docstring made every later `index` exit 1, and one unparseable ADR,
  when it was the only prose work, made `index` throw before the
  docstring and commit streams on every run, blaming the API key. The
  exit message quotes the first failed call's error, not an earlier
  docstring read error. A prose file that cannot be read when its turn
  comes (deleted or locked since the Stage 1 walk) makes no call, as a
  docstring file that cannot be read makes none: it is reported in
  `extraction_errors` but is not in `api_calls`, and the prose throw
  fires only when every call the stream made failed. In 1.1.3 it counted
  as a failed call, so such a race with one changed ADR threw the
  auth/config error.
- **One transaction per prose file.** A prose file's claims and key are
  written in one transaction, as a docstring file's (S5) and a
  commit's (S3) are. Before, a kill between the delete and the key
  write under `--full` with `atlas.committed: false` left partial
  claims under a key that already matched the file, never retried.
- **The pinned-commit warning** names both places the key can live:
  `atlas.json` with `atlas.committed: true`, the local cache
  (`atlas.local_cache`, table `source_shas`) with `false`.
- **`--full` failures.** `index` lists the files `--full` re-extracted
  that failed and whose key already matched their content, and the
  docstring error and the exit-1 message (its closing line too) say
  that only another `--full` retries them; when every prose call fails,
  the thrown error says so (Decision 4).

*Stage 0, exports and the local cache*
- **An interrupted run keeps its work:** checkpoint exports
  (Decision 10).
- **`atlas.committed: false`.** `index` imported a leftover
  `atlas.json` on every run but never exported, so every run billed
  again everything newer than the leftover file. The cache is now the
  source of truth: `atlas.json` only seeds an empty cache and is
  otherwise not read, with a warning on every run while it exists
  (lead decision F6). The warning says how to switch to
  `atlas.committed: true` without losing the cache's work: delete or
  move `atlas.json` first, and the next `index` writes it from the
  cache. (Switching with the leftover in place imports it over the
  cache, and that work is billed again.)
- **One seeding rule.** `index` in that mode, the MCP server and the
  `init` smoke test import `atlas.json` only into an empty cache, one
  with no symbols, claims or source keys (`isCacheEmpty`,
  `atlas-importer.ts`). Before, the server and the smoke test imported
  it into any cache without symbols, so a docs-only cache with
  `atlas.committed: false` was replaced by a leftover `atlas.json` on
  every server start.
- **`atlas.committed: true` without `atlas.json`.** The cache is the
  baseline, and Stage 7 writes `atlas.json` even when nothing changed.
  Before, after `atlas.json` was deleted (or `committed` switched back
  to true), a no-change run logged "atlas.json untouched" and never
  wrote it.
- **Atomic atlas writes.** `index` (checkpoints and the Stage 7 export)
  and `resolve-symbols` share one writer (`writeAtlasFileAtomic`,
  `atlas-exporter.ts`): it writes `<atlas>.tmp`, then renames it over
  `atlas.json`, so a reader or a kill sees the old file or the new one.
  On Windows a rename onto a file another process holds open fails with
  EPERM, EACCES or EBUSY, often only briefly: the rename is tried 4
  times, 50 ms apart, then the file is written directly (the 1.1.3
  behaviour, not atomic) and the temporary file removed, also when that
  write fails too (a read-only `atlas.json`; its error is rethrown).
  When `atlas.json` is a symbolic link (a shared atlas), the temporary
  file goes beside the link's target and the rename replaces the
  target, so the link stays and the shared file is updated, as 1.1.3's
  direct write did (a rename onto the link would replace the link with
  a regular file). Every `index` run removes a `<atlas>.tmp` left by a
  killed write at Stage 0, in both `atlas.committed` modes (`init` does
  not gitignore that file, so a leftover could otherwise be committed).
- **A torn or conflicted `atlas.json`** fails to import with a message
  naming the file and the way back (`git checkout -- <path>`), not a
  bare `SyntaxError` (`importAtlasFile`; `index`, the MCP server and
  `init`).
- **Claim links to unlisted symbols.** The importer fails with a message
  that says how many claims are affected and to run
  `contextatlas resolve-symbols`, not a bare `FOREIGN KEY constraint
  failed`.
- **MCP server stale-cache hint.** The server still imports
  `atlas.json` only into an empty cache (reload on change is Phase 4).
  When it serves a non-empty cache and `atlas.json`'s `generated_at`
  differs from the cache's `atlas_meta` `generated_at`, it logs one
  warning at startup that names the remedy: stop the server (exit
  Claude Code, or disconnect `contextatlas` in `/mcp`), delete the
  local cache and restart; the cache is rebuilt from `atlas.json` with
  no API calls, and with `atlas.committed: false` this discards
  anything only the cache holds. The check is stateless
  (`atlasGeneratedAtMismatch`, `atlas-importer.ts`). Every writer
  stamps both values from one timestamp, so they match after a CLI
  `index`, finished or stopped at a checkpoint, and differ after a
  pull, an `/index-atlas` refresh, or `atlas.committed: false` runs.
  With `atlas.committed: false` and a leftover `atlas.json`, it warns on
  every start once an `index` run has changed the cache.
- **Schema guard.** A local cache whose schema version is above the
  latest this build knows (`LATEST_SCHEMA_VERSION`, 6) is used as it
  is, with a warning: a later release would skip its own migrations up
  to that version on it. The unreleased review builds migrated caches
  to 7 and 8.

*Validators*
- **`validate-extraction` checks only ADRs the current prose walk
  lists** (lead decision F1). Docs-bucket pages (`docs.include` files
  such as README.md, wherever they are stored relative to), notes in
  the ADR directory without an ADR file name, and keys whose file is
  gone are exempt from `adr_depth_floor` and `source_coverage`;
  `adr_claims_present` is unchanged. If the walk fails, nothing is
  exempt. Before, `index` exited 1 on docs pages with fewer than 8
  claims after every exporting run (the CLI side predates Phase 2), and
  an `/index-atlas` refresh that kept such pages, as it must, could
  never pass its gate. The cost is under "Known limitations".
- **Its failure remediation** says that `--full` also re-extracts every
  docstring file, and gives an ADR-only route
  (`extraction.streams: [adr]` for one run).
- **`index` runs it on every `atlas.committed: true` run with an
  `atlas.json` on disk** (lead decision F5), not only on runs that
  export, as since v0.7.1. Before, a run that exported and failed the
  check exited 1, and the next run with nothing to extract exited 0 on
  the same failing atlas. The check is local (no API call). A no-change
  `index` therefore exits 1 over a committed atlas that fails the depth
  floor (a teammate's, or an older one).
- **`validate-atlas`** warns (exit 0) when a claim's `symbol_ids` names
  a symbol that `symbols` does not list, and names `resolve-symbols` as
  the fix: such an atlas cannot be loaded until it runs. It is a
  warning, not an error, because it is the expected state of every
  `/index-atlas` refresh (F2) and of atlases `resolve-symbols` wrote up
  to 1.1.3, and because the error's other remedy, emptying the links,
  lost them for good on claims without `symbol_candidates`. The message
  states the `symbols: []` link loss ("Known limitations").

*`list-extraction-sources`*
- `manifest_version` is `"2"` exactly when `extraction.streams`
  disables a stream, `"1"` otherwise, with a stderr note when it is
  `"2"` (lead decision F3; L-12 had kept `"1"` for the additive
  `source_key`). An `/index-atlas` copy from before v1.2 stops on any
  version but `"1"`; before, it read a disabled stream's empty array as
  deleted sources and dropped that stream's claims.
- A file whose `getDocstring` fails for any symbol is left out of the
  manifest whole (the CLI's all-or-nothing file rule), so the Skill
  keeps its claims and key. Before, the manifest listed the symbols
  that read, and a refresh dropped the failed symbol's claims and
  pinned the file's new SHA.
- It passes `lsp.initialize_timeout_ms` to its adapters, as `index` and
  `resolve-symbols` do. Before (also before Phase 2), on a slow
  language server the Skill's Phase A step timed out, or left whole
  files out, where they succeeded.

*`init`*
- After an `index` that exported and exited 1, `init` no longer says to
  re-run `init`, which skips extraction once `atlas.json` matches HEAD.
  After a stream failure it says to run `contextatlas index` to retry,
  then `init`; after a failed `validate-extraction`, to fix the failing
  ADRs and run `index` (or `index --full`) until it exits 0, then
  `init`.

*`/index-atlas` and `/prime-atlas` SKILL.md*
- **`symbols: []` on every refresh** (lead decision F2), as on a cold
  start; preserved claims keep their `symbol_ids` and
  `symbol_candidates`. Phase C step 1 then runs `resolve-symbols` (and
  `validate-atlas` again) right after the `validate-atlas` warning,
  before `validate-extraction`, so the atlas does not stay unloadable
  while extraction depth is fixed; step 3 runs it again. The link loss
  this can cause is under "Known limitations". Its Failure modes key on
  what `resolve-symbols` reports on such a refresh: dropped links,
  orphaned claims, or files it could not list. `resolve-symbols` names
  those files, and leaves out its "unverified (prior symbols kept)"
  count when the atlas had no `symbols`, where it is always 0.
- A refresh carries the baseline's `extracted_at_sha` and `git_commits`
  forward. Before, a refresh of a CLI-built atlas dropped the git
  signal the MCP tools serve, and `--check` reported staleness as
  unknown.
- The Phase B commit filter names both key forms; a deleted source
  file's key and claims are dropped even while the docstring stream is
  disabled, as CLI Stage 5 does; manifest versions `"1"` and `"2"` are
  accepted.
- Refresh rule 4 recognises ADR keys the way they are stored (relative
  to `source_root`, or to the ADR directory when it lies outside
  `source_root`), with an example per layout, not by an `adrs.path`
  prefix, so a deleted or renamed ADR's key is dropped in those layouts
  too.
- The `validate-extraction` gate text states the walk rule and says
  never to drop kept keys or claims to pass it.
- Phase C step 5, and `/prime-atlas`'s stale-sentinel row, say how the
  running MCP server picks up the refresh, in one text for both
  `atlas.committed` modes: stop the server, delete the local cache
  while no `contextatlas index` is running, and restart or reconnect;
  with `false` this discards anything only the cache holds; on a first
  build, while the cache is still empty, a restart or reconnect is
  enough.
- `/prime-atlas`'s malformed-`atlas.json` row says to restore the file
  first (`git checkout -- <atlas.path>`, or resolve the merge conflict),
  then refresh, matching the importer's message. It used to suggest
  `contextatlas index --full` to rebuild, which stops at an invalid
  `atlas.json` (also in 1.1.3); with `atlas.committed: false`, `index`
  never rewrites the file, so the row says to delete it when it cannot
  be restored.

*Documentation*
- ADR-02's 2026-09-25 entry names the second CLI/Skill difference (the
  `docs.include` collision skip the manifest does not apply) and the
  assumption behind the L-14 parity bar.
- The CHANGELOG "Fixed" section lists only fixes of behaviour released
  in 1.1.3.
- The README privacy note says that `generate-adrs` sends member names
  too, that a `docs.include` glob matching source files sends them
  whole, and that the Skill does not extract `docs.include` pages.
- DESIGN.md's `exclude_pattern` and v0.4 Q3 notes were corrected.

#### Known limitations

Documented, not fixed.
- **A run on a temporary tree or config.** A checkpoint holds this
  run's Stage 4a pruning and Stage 5 deletions, as a completed run
  would. An interrupted run on another branch, a stash, WIP edits or a
  wrong exclude pattern therefore leaves them in `atlas.json`: claims
  of unchanged ADRs stay unlinked after the tree comes back (orphaned,
  the Phase 1 prune rule; re-linking from candidates is Phase 3), and
  reverted WIP is billed again. To abandon an interrupted run, run
  `git checkout -- <atlas.path>` before the next `index`; this also
  discards that run's paid work.
- **A partial `atlas.json` is an uncommitted working-tree edit.** Do
  not commit `atlas.json` while `index` runs. Git carries the edit
  across a branch switch only when `atlas.json` is identical at both
  HEADs (otherwise it refuses the checkout); the next `index` on the
  other branch then imports the first branch's commit keys and claims,
  which LOCK 2.b keeps. Re-run `index` to finish, or
  `git checkout -- <atlas.path>`, before switching.
- **An interrupted run that started without `atlas.json`** (a first
  `index` or `init`, a regeneration after deleting it, or the switch
  from `atlas.committed: false` that the Stage 0 warning describes).
  Its first checkpoint creates `atlas.json`, so after an interruption
  the next run imports it over the cache and extracts again the units
  stored since the last checkpoint: at most one interval (30 s) of work
  plus the calls in flight. 1.1.3 lost nothing here: without
  `atlas.json` the next run used the cache, which held every stored
  unit. Skipping checkpoints while Stage 0 found no `atlas.json` would
  restore that, at the cost of Decision 10's "a fresh cache gives the
  same run" for such runs; that is a lead decision, not taken here.
- **No second orphan report.** The next run keeps the claims an
  interrupted run's prune orphaned but does not report them again (a
  doctor orphaned-claims check is Phase 8).
- **Interrupted or failed `--full`** (Decision 4): only another `--full`
  retries the files whose key already matched their content.
- **Zero-claim keys across the prose and docstring streams.** Both
  streams key a file by relPath at the same SHA. After a `docs.include`
  change moves a file between them, a key one stream wrote with no
  claims looks unchanged to the other, which never extracts the file.
  The remedy, which the `docs.include` collision warning names: remove
  that path's entry from `source_shas` (in `atlas.json` with
  `atlas.committed: true`, in the local cache with `false`), or run
  `index --full` once (it re-extracts every ADR, docs page and
  docstring file). A portable fix, recording the keying stream in
  `atlas.json`, is Phase 3.
- **`atlas.committed: true` without `atlas.json`: another branch's
  commits.** The cache is the baseline and survives a checkout, so
  commit keys and claims it holds from another branch reach this
  branch's first `atlas.json` and stay (LOCK 2.b). If the cache was used
  on another branch, delete it before the first `index` on a branch
  without `atlas.json` (that run then extracts everything, as a first
  run does). A doctor check for commit keys HEAD cannot reach is
  Phase 8.
- **The `symbols: []` refresh link loss** (F2). `resolve-symbols` keeps
  a link when its symbol is in the fresh listing, or is listed in the
  atlas's `symbols` for a file it cannot verify, and adds links from
  each claim's `symbol_candidates`. With `symbols: []` there is no such
  record, so a link into a file it cannot list in that run (its listing
  failed, or its language is not configured) is dropped, and reported
  as dropped links and orphaned claims; the summary names the files
  whose listing failed. A later run restores it only
  from the claim's candidates. Links no candidate names (claims without
  candidates, `contextatlas index` docstring provenance links, ADR
  frontmatter-fallback links) come back only when their source is
  re-extracted, and an unchanged ADR is not. With
  `atlas.committed: true`, restoring the committed `atlas.json`
  (`git checkout -- <atlas.path>`) and re-running `/index-atlas` once
  the language server lists those files avoids the loss.
- **A deleted ADR's leftover key** (F1). `validate-extraction` no
  longer catches a key whose ADR file is gone. Only an agent error in
  `/index-atlas` refresh rule 4 can leave one (CLI Stage 5 drops it);
  1.1.3 caught it only when the key also had fewer than 8 claims. A
  doctor stale-key check is Phase 8.
- **The MCP server does not re-import** (since v0.2; Phase 4 hot
  reload). After a pull, an `/index-atlas` refresh, or a switch from
  `atlas.committed: false` back to `true`, it serves the old cache until
  the cache is deleted, now with the startup warning above. With
  `atlas.committed: false` a Skill-written `atlas.json` never reaches a
  non-empty cache (F6); whether that mode should load it is a Phase 4
  decision. The warning compares `generated_at` only, and
  `resolve-symbols` keeps `generated_at`, so a standalone
  `resolve-symbols` run is not flagged.
- **Unparseable responses** (F4). A model change that breaks parsing
  shows as `extraction_errors` (and pinned commits) with exit 0, not as
  a thrown error.
- **The Windows fallback write is not atomic.** A kill during it can
  tear `atlas.json`; the importer then names the file and the way back.

#### Removed before release

Present in the review commits, never released, and removed by the
simplification (`aae41d4`):
- **The resume state machine:** the cache-only unfinished-run mark
  (`_meta` `index.unfinished_run_atlas_sha256`) and its owner record
  (`index.unfinished_run_owner`, a pid and host), the carry-over of an
  interrupted run's stored units over the Stage 0 import with its
  working-tree validity filter, and the modules `atlas-baseline.ts`,
  `unsaved-work.ts`, `source-key-files.ts`, `run-owner.ts` and
  `cache-meta.ts`. Replaced by checkpoint exports (Decision 10).
- **Local cache migrations 7 and 8** (the cache-only tables
  `source_key_streams` and `source_key_streams_run_start`, with the
  `_meta` keys `index.key_streams_atlas_sha256` and
  `index.run_start_key_streams_atlas_sha256`; `source-key-streams.ts`),
  which recorded the stream that keyed each path. The zero-claim key
  limitation above is documented instead. `LATEST_SCHEMA_VERSION` is 6
  again.
- **The foreign-commit filter** (`git merge-base --is-ancestor`;
  `foreign-commits.ts`), which dropped commits HEAD cannot reach from a
  committed cache without `atlas.json`. Documented above.
- **The MCP server's startup re-import** of a changed `atlas.json`
  (`server-cache-load.ts`). Replaced by the seed-only rule and the
  stale-cache warning; reload on change is Phase 4.
- **The cache-only `--full` retry list** (`_meta`
  `index.retry_source_keys`; `retry-keys.ts`). Replaced by the `--full`
  warning and messages (Decision 4).
- **`resolve-symbols`' recovery of symbol records from the `atlas.json`
  committed at HEAD** (`git show HEAD:<atlas>`), and its exit 1 when a
  link into a file it could not list had no record
  (`atlas-symbol-reconcile.ts`). `resolve-symbols` again drops such
  links and reports them; the loss is documented above.
- **`validate-extraction`'s path reading for missing files** (the ADR
  naming convention under `adrs.path`, and the config-root
  `docs.include` reading in the ADR-08 layout). Replaced by walk
  membership (F1).
