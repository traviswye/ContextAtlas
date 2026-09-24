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
