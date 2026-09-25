# Changelog

All notable changes to ContextAtlas are documented here.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

For substantive cycle-engineering detail beyond the per-version
summaries below, see the corresponding `docs/cycles/v0_X/`
subdirectory (cycle scope + step plans), `v1_1-HANDOFF.md`
(cycle-engineering knowledge clusters), and
[`docs/release-history.md`](docs/release-history.md) (cycle
narrative substrate — what shipped per cycle + why it mattered +
load-bearing empirical findings).

## [Unreleased]

### Added

- Community substrate: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
  (Contributor Covenant 2.1), `SECURITY.md`, `SUPPORT.md`,
  `CHANGELOG.md` (this file), `.github/` issue + PR templates,
  minimal CI workflow (typecheck) — v0.9.1 Stream B.3.
- `contextatlas index` summary fields (v1.2 Phase 1). The fields are
  appended; existing keys and their order are unchanged (ADR-12).
  - `symbols_pruned`, `claims_orphaned`, `docstring_sources_deleted`
    and `unverified_symbol_files`, in both output formats.
  - `orphaned_claims_by_source` (`--json` only).
  - `files_deleted` now counts deleted ADR/doc sources only, its
    documented meaning.
- `contextatlas index` extracts docstrings and commit messages as well
  as ADRs/docs (v1.2 Phase 2). Before, only `/index-atlas` and
  `scripts/dogfood-extract.mjs` did.
  - **Streams run in a fixed order:** ADR/docs prose, then docstrings,
    then commits, sharing one `--budget-warn` check.
  - **Docstrings:** one call per exported symbol with a docstring. A
    source file is re-extracted when its SHA changes.
  - **Commits:** one call per commit that passes the commit filter,
    once per commit.
  - **No git:** the commit stream is skipped with an info log in a
    non-git tree or when git is missing, and with a warning on other
    git errors. The run goes on.
  - The Pipeline Integration Discipline stage table is in the ADR-12
    2026-09-25 amendment.
- `extraction.streams` config key (v1.2 Phase 2; ADR-05 2026-09-25
  amendment). Chooses which streams `index` extracts: `adr` (ADRs and
  `docs.include` files), `docstring`, `commit`. The default, with the
  key absent, is all three.
  - The list must not be empty and must include `adr`. Unknown values
    and duplicates are errors; order does not matter.
  - A disabled stream's claims are kept, frozen.
  - Releases before this one reject the key as unknown.
- Cost preview for `contextatlas index` (v1.2 Phase 2). Before the
  first model call, the run prints an estimate to stderr: calls and
  input tokens per stream, and a cost range. It is printed only when
  a call is planned, and it names disabled streams. There is no
  prompt, and stdout is unchanged.
- `contextatlas index` summary fields (v1.2 Phase 2), appended after
  `unverified_symbol_files` in both output formats:
  `streams_enabled`, `docstring_files_extracted`,
  `docstring_files_unchanged`, `docstring_symbols_extracted`,
  `docstring_claims_written`, `commits_extracted`, `commits_skipped`,
  `commit_claims_written`, `commit_keys_migrated`.
- `contextatlas doctor` checks (v1.2 Phase 2):
  - `config.extraction_streams` lists the enabled streams. It warns
    when `atlas.json` still holds claims of a disabled stream.
  - `extraction.skills_fresh` compares the installed
    `.claude/skills/*/SKILL.md` copies with the package's. It warns
    on missing or different copies and names the file to copy.
    `contextatlas init` never overwrites an installed skill.
- `contextatlas list-extraction-sources` (v1.2 Phase 2):
  - honours `extraction.streams`: a disabled stream gets an empty
    array, and `summary.disabled_streams` names it. With docstrings
    disabled, no language server is started.
  - each commit entry gains `source_key` (`commit:<sha>`).
  - `manifest_version` is `"1"` when every stream is enabled and `"2"`
    when a stream is disabled, with a stderr note. An `/index-atlas`
    copy from before v1.2 stops on `"2"` instead of reading a
    disabled stream's empty array as deleted sources and dropping its
    claims.
- `contextatlas validate-atlas` warns (exit code unchanged) when commits
  are stored under the legacy bare-sha key (v1.2 Phase 2).
- `--help` lists `--json` under `index` (v1.2 Phase 2).
- Library functions (v1.2 Phase 2, used by the benchmarks scripts):
  - `parseCommitLog` and `extractCommitMessagesForRepo` take an
    optional `gitBinary`.
  - `extractCommitMessagesForRepo` results gain `apiCalls`,
    `unresolvedCandidates` and `commitsNullResult`.
  - New per-unit functions `extractCommitClaims` and
    `extractDocstringFile`.
  - The commit filter and `git log` parsing moved to
    `src/extraction/commit-log.ts`, and the docstring functions to
    `docstring-stream.ts` / `docstring-read.ts`. The old modules
    re-export every name they exported before.

### Changed

- License transitioned from "All Rights Reserved" placeholder to
  MIT License — v0.9.1 Stream B.2.
- Historical cycle docs migrated from repo root to `docs/cycles/v0_X/`
  subdirectories with cross-reference sweep across README / DESIGN /
  ROADMAP — v0.9.1 Stream B.1.
- `@anthropic-ai/sdk` `^0.32.0` → `^0.128.0`, resolving to 0.128.0
  (v1.2 Phase 0).
  - The extraction request body is unchanged: `{ model, max_tokens,
    messages }`, with no thinking and no sampling params.
  - The API clients ContextAtlas builds pass `authToken: null`.
    Without it, SDK 0.128.0 would send an `ANTHROPIC_AUTH_TOKEN` from
    the environment as a Bearer header next to `x-api-key`; 0.32.x
    did not.
- MCP dependency (v1.2 Phase 0): `@modelcontextprotocol/sdk` `^0.5.0`
  is replaced by the v2 split package `@modelcontextprotocol/server`,
  pinned exactly to `2.1.0`. `@modelcontextprotocol/client` and
  `@modelcontextprotocol/core` `2.1.0` are added as test-only
  devDependencies.
  - The low-level `Server` and the hand-written JSON Schema tool
    definitions are kept. `tools/list` output is byte-identical to
    0.5.0, and zod stays a transitive dependency only.
  - v2 was chosen over `@modelcontextprotocol/sdk` 1.x. 1.x installs
    express, hono, cors and other HTTP-framework packages as hard
    dependencies; v2 does not.
- MCP protocol negotiation (v1.2 Phase 0). The server now echoes the
  client's requested protocol version when it is one the SDK supports
  (2024-10-07 through 2025-11-25: 2024-10-07, 2024-11-05, 2025-03-26,
  2025-06-18, 2025-11-25). SDK 0.5.0 supported only 2024-11-05 and
  2024-10-07: it echoed 2024-10-07 and answered 2024-11-05 to every
  other request.
  - An unsupported version gets 2025-11-25. That includes 2026-07-28
    sent through a plain `initialize`.
  - The 2026-07-28 protocol era (`server/discover`) is not served yet:
    `server/discover` returns -32601, and a client pinned to
    2026-07-28 fails to negotiate. Clients that open with
    `initialize` negotiate normally; that is Claude Code's default for
    stdio servers.
- MCP error responses (v1.2 Phase 0):
  - JSON-RPC `error.message` no longer starts with
    `MCP error -326xx: `. Error codes are unchanged. SDK 0.x clients,
    which add their own prefix, now show it once instead of twice.
  - A malformed `tools/call` (missing `name`, `arguments` not an
    object) now returns -32602 `Invalid tools/call request: …`
    instead of -32603.
  - Tool results with `isError` serialize as `{content, isError}`
    instead of `{isError, content}`. The meaning is the same.
- MCP stdio lifecycle (v1.2 Phase 0). When the client closes stdin,
  the server now shuts down and exits 0; it used to keep running.
  Requests still in flight at that point are aborted and not answered.
- MCP startup logging to stderr (v1.2 Phase 0):
  - `MCP protocol version: X` is now `MCP SDK max supported protocol
    version: X (negotiated version is logged when a client
    initializes)`.
  - A new `MCP client initialized (negotiated protocol version: V)`
    line is logged per client.
  - A warning is logged if `notifications/initialized` arrives without
    a successful handshake.
- Retries for extraction and LLM-judge calls (v1.2 Phase 0):
  - The ContextAtlas wrapper is now the only retry layer. Each request
    is sent with the SDK option `maxRetries: 0`, so SDK retries never
    stack under it. Before, only the SDK's internal retries were live
    (see Fixed).
  - Retry decisions follow SDK 0.128.0: an `x-should-retry` response
    header wins; otherwise 408, 409, 429, 5xx and connection errors
    retry.
  - The default is 3 retries, so a call makes at most 4 attempts
    instead of the SDK's 3.
  - `Retry-After` / `retry-after-ms` is honored, capped at 30 s by
    default. The HTTP-date form is not parsed. Backoff has no jitter.
- `contextatlas generate-adrs` error handling (v1.2 Phase 0):
  - Authentication failures (401/403) now exit 2 (setup error, per
    ADR-12) instead of 1.
  - New actionable errors for a truncated response
    (`stop_reason` `max_tokens` / `model_context_window_exceeded`) and
    for an interrupted response stream.
  - Other API errors now include the error `type`. Only transient ones
    (no status, 408, 409, 5xx) advise re-running. A 404 points at
    model availability, a 413 at narrowing the input, and other 4xx
    say that re-running will not help.
- `npm run build` now deletes `dist/` before compiling (v1.2
  Phase 0), so compiled modules whose sources were removed can no
  longer survive a rebuild or reach the tarball. A type error does
  not leave `dist/` empty: `noEmitOnError` is off, so `tsc` still
  emits the JavaScript before exiting non-zero, and the build then
  skips prompt-artifact generation.
- **`contextatlas index` costs more by default** (v1.2 Phase 2).
  Without `extraction.streams`, every run, including `init`'s first
  one, makes docstring and commit calls.
  - The first run after upgrading keys every source file whose
    docstrings it can read (files with none get a key and no claims)
    and every filter-passing commit, so expect a large one-time
    `atlas.json` diff.
  - On this repository a zero-API plan of the first three-stream run
    (at `9d2bf4c`) came to 479 calls, estimated at $4.42 to $10.35.
  - `extraction.streams: [adr]` restores ADR/docs-only extraction.
- Summary totals cover every stream (v1.2 Phase 2): `claims_written`,
  `unresolved_candidates`, `api_calls`, `input_tokens`,
  `output_tokens`, `cost_usd` and `extraction_errors`. `files_*` stay
  ADR/docs only. A docstring error's `sourcePath` is the file (the
  symbol is named in `error`); a commit error's is `commit:<sha>`.
- `index --full` re-extracts docstrings as well as ADRs/docs (v1.2
  Phase 2). Commits are never re-extracted by `--full`.
- Commit claims use one key form, `commit:<sha>`, as `source`,
  `source_path` and `source_shas` key on both paths (v1.2 Phase 2).
  - `/index-atlas` used to write the bare sha. Every `index` run now
    migrates bare keys and their claims, and logs a warning when a
    commit existed in both forms.
  - Readers accept both forms.
  - **Upgrading Skill users:** refresh `.claude/skills/index-atlas/`
    (`doctor` shows which copies differ). An old copy keeps writing
    bare keys, which `index` keeps migrating.
- `/index-atlas` refresh (v1.2 Phase 2):
  - it never drops commit keys, keys of a disabled stream, or
    `docs.include` prose keys (which the Skill does not extract);
  - it drops a source-file or ADR key only when the file is gone;
  - preserved claims keep their `symbol_ids` and `symbol_candidates`.
- A commit whose extraction returns no parseable result (max_tokens
  or malformed JSON) is now keyed with zero claims and a warning, so it
  is not billed again on every run (v1.2 Phase 2). The warning names
  the key to delete to retry. ADRs/docs and docstrings still retry.
- `contextatlas index` exits 1 when every call of the docstring or
  commit stream failed (v1.2 Phase 2). The rest of the run is saved
  and exported first, the summary is printed, and a stderr message
  says what to do. Only calls that threw an API or network error (and
  failed commit writes) count: a response that does not parse is
  reported per source but never fails the stream.
- `atlas.committed: false` (v1.2 Phase 2 review): `index` no longer
  imports a leftover `atlas.json` over a non-empty local cache. The
  file only seeds an empty cache, and is otherwise ignored with a
  warning to delete it.
- `validate-extraction` (v1.2 Phase 2 review) no longer holds prose
  that is not an ADR to the ADR depth floor and coverage checks: a
  path whose file exists and that is not in the ADR bucket
  (`docs.include` pages such as README.md, or a note in the ADR
  directory without an ADR file name). A missing file is still
  checked.
- `validate-atlas` (v1.2 Phase 2 review) fails when a claim's
  `symbol_ids` names a symbol `symbols` does not list; such an atlas
  cannot be loaded.
- `list-extraction-sources` (v1.2 Phase 2 review) leaves a source file
  out of the manifest when `getDocstring` fails for any of its
  symbols, so `/index-atlas` keeps that file's claims and key and the
  next walk retries it.
- `/index-atlas` refresh (v1.2 Phase 2 review) carries the baseline
  `symbols` forward instead of writing `symbols: []`, and drops a
  deleted source file's key and claims even while the docstring
  stream is disabled, as `index` does. Local cache migration 7 adds a
  cache-only `source_key_streams` table (never exported).

### Removed

- *Pending, not yet removed:* `scripts/dogfood-extract.mjs` (not part
  of the npm package) is to be retired once the v1.2 Phase 2 paid
  parity run shows `index` matches it. Its v0.4 "Q3" rule, which
  deleted a repo's commit claims when there were fewer than 30, has no
  counterpart in `index` and will go with it.
- The `@modelcontextprotocol/sdk` 0.5.0 dependency tree (v1.2
  Phase 0).
- The `node-fetch` / `formdata-node` chain of `@anthropic-ai/sdk`
  0.32.x, which goes with the SDK upgrade (v1.2 Phase 0). This removes:
  - the `node-domexception` deprecation warning at `npm install`;
  - the Node 22 `punycode` (DEP0040) deprecation warning at startup.

### Fixed

- Anthropic SDK error classes were imported from
  `@anthropic-ai/sdk/error.js`, which resolves to the SDK's CommonJS
  build (v1.2 Phase 0). `instanceof` therefore never matched the
  errors the ESM client actually throws. Through 1.1.3 this meant:
  - the extraction and judge wrappers never retried;
  - `generate-adrs` never mapped API errors to its remediation
    messages.

  Error classes are now imported from the package root. Errors thrown
  by another SDK copy are also recognized, by HTTP status or
  connection-error class name.
- `contextatlas generate-adrs` sent
  `thinking: { type: "enabled", budget_tokens: 32000 }`, which
  claude-opus-4-7 rejects with HTTP 400 (v1.2 Phase 0).
  - It now sends `thinking: { type: "adaptive" }` +
    `output_config: { effort: "xhigh" }` over a streaming request.
    `max_tokens` is unchanged at 64000.
  - That is the same effort level the `/generate-adrs` Skill pins.
    See the ADR-02 2026-09-24 amendment.
- LLM-judge calls on claude-opus-4-7, the ADR-19 §2 escalation model,
  sent `temperature`, 0 by default (v1.2 Phase 0). That model rejects
  non-default sampling params with HTTP 400; per the SDK 0.128.0
  typings, only `temperature: 1.0` is still accepted, for backwards
  compatibility. `temperature` is now omitted for Opus 4.7; the
  Sonnet 4.6 default judge keeps `temperature: 0`.
- Retry-After delays are now read from SDK 0.128.0's web `Headers`
  objects as well as plain header records (v1.2 Phase 0). After the
  SDK upgrade, bracket access would have silently dropped the delay.
- The published npm tarball carried orphaned compiled modules whose
  sources were removed in v0.7 (v1.2 Phase 0):
  `dist/extraction/cli-show-prompt.*` and
  `dist/generation/cli-show-generate-prompt.*`. The clean build drops
  them.
- `contextatlas index` deleted docstring and commit claims from any
  atlas that carried them (v1.2 Phase 1, F-4).
  - **Cause.** Every `source_shas` key was diffed against the
    ADR/docs walk, so each docstring key (a source-file path) and
    each commit key came back "deleted". Stage 5 then deleted those
    claims, their `source_shas` rows, and the freshly indexed symbols
    of every docstring-keyed file, which cut the ADR claims' links
    into those files.
  - **Who was affected.** Atlases built by the `/index-atlas` Skill or
    by `scripts/dogfood-extract.mjs` — the ones that carry docstring
    and commit claims.
  - **Silent.** The run exited 0 and `validate-extraction` passed.
  - **Fix.** Keys are now classified by stream. A prose key is deleted
    when the prose walk no longer finds it (now also under `--full`).
    A docstring key is deleted when its source file is gone. A commit
    key is never deleted.
  - **Reproduction numbers.** On the v0.4 dogfood atlas, with no
    source changes, one run dropped:
    - docstring claims 377 → 0;
    - symbols 768 → 219;
    - ADR-claim links into docstring files 1423 → 0.
- `contextatlas index` never removed stale symbols (v1.2 Phase 1,
  F-1). Symbols of deleted, renamed, moved or newly excluded source
  files, and symbols removed from files that still exist, stayed in
  `atlas.json` indefinitely.
  - **Pruning.** They are now pruned after each run's inventory, and
    the claim links to them go too. Claims themselves are never
    deleted: a claim left with no link is kept and reported as
    orphaned.
  - **Kept.** Symbols of a file whose language-server listing failed,
    or whose language is not configured for the run, stay and are
    counted as unverified.
  - **One-time diff.** The first run after upgrading can remove many
    symbols at once, e.g. test-file symbols left over from before the
    v0.4 test-file exclusion.
- `contextatlas resolve-symbols` could leave claim links to symbols
  that no longer exist (v1.2 Phase 1). It kept each claim's earlier
  `symbol_ids`, so after a source file was deleted the next run wrote
  an `atlas.json` that failed to import (`FOREIGN KEY constraint
  failed`).
  - Links to missing symbols are now dropped, and the claims left
    with no link are reported as orphaned.
  - The earlier symbols of files whose listing failed are now kept
    instead of dropped.
- `contextatlas index --json` printed a second, plain-text line on
  stdout after the JSON object when the run exported: the
  `validate-extraction` result (v1.2 Phase 2). That line now goes to
  stderr, so stdout is one JSON object. `key=value` output is
  unchanged.
- Docstring extraction could lose claims silently (v1.2 Phase 2). It
  deleted a file's claims before extracting, and pinned the file's
  SHA even when a call failed, so the lost claims were never
  retried.
  - A file's claims are now replaced, and its SHA pinned, only when
    every call for it succeeded, in one transaction. Otherwise the old
    claims and key stay and the next run retries the file.
  - This applies to `index` and to the exported
    `extractDocstringsForFile`, whose signature and result fields are
    unchanged.
  - A symbol-listing failure in `extractDocstringsForFile` now throws
    before anything is changed. A foreign-key failure is returned as
    an error instead of escaping.
- Commit-message extraction (v1.2 Phase 2):
  - A commit stored under both key forms could hold duplicate claims.
    Its claims are now replaced in one transaction.
  - A failed write (e.g. a foreign-key violation) escaped and aborted
    the run. It is now rolled back and reported for that commit, which
    is retried next run.
- `claims[].symbol_candidates` was dropped by every CLI `index` run
  (v1.2 Phase 2, F-7).
  - The local cache stores it now (cache migration 6), and `atlas.json`
    emits it after `symbol_ids` when non-empty.
  - CLI extraction also writes it, for all three streams.
  - MCP tool output does not include it and is unchanged.
- `/index-atlas` refresh dropped every `source_shas` key its manifest
  did not list, with the key's claims (v1.2 Phase 2). That included
  commit keys, `docs.include` prose keys (the Skill extracts only
  `adrs.path` prose) and source files with no docstring, for example
  in atlases built by the CLI. It also emptied preserved claims'
  `symbol_ids`.
- `/index-atlas` SKILL.md told the agent to record `cost_usd` /
  `cost_model` in `atlas.json`, which `validate-atlas` rejects (v1.2
  Phase 2).
- `validate-atlas` remediation pointed to an atlas example in
  `prompts/extraction.md`, which has none (v1.2 Phase 2). It now points
  to the canonical schema in the `/index-atlas` SKILL.md.
- `--help` said `index --full` re-extracts "everything" (v1.2
  Phase 2). It re-extracts ADRs/docs and docstrings; commits stay
  key-gated.
- An interrupted `contextatlas index` lost the work it had paid for
  (v1.2 Phase 2 review). Docstring files and commits are saved to the
  local cache as they finish, but `atlas.json` is written only at the
  end, and the next run imported `atlas.json` over the cache and paid
  for everything again. A run now records in the cache the
  `atlas.json` it started from; when the next run finds that record
  and `atlas.json` unchanged, it keeps the cache, extracts only what
  is left, and exports. A changed `atlas.json` is still imported.
- With `atlas.committed: false` and an `atlas.json` left over from the
  committed workflow, every `index` re-extracted everything newer
  than that file (v1.2 Phase 2 review). See "Changed".
- A commit whose response was malformed JSON was never pinned (v1.2
  Phase 2 review): the client throws `ParseError` for it, which the
  commit stream treated as an API failure. The commit was billed again
  on every run, its tokens were missing from `cost_usd`, and when it
  was the only pending commit `index` exited 1 blaming the API key.
  It is now pinned like any null result. The tokens of a response
  that does not parse are counted in every stream (`ParseError` now
  carries its usage).
- One docstring that always came back unparseable made every later
  `index` exit 1, even with nothing changed (v1.2 Phase 2 review).
  Unparseable results no longer count toward a stream failure; the
  file is still reported and retried.
- The stream-failure message could quote a docstring read error (an
  LSP timeout) as the first failed call and blame the API key (v1.2
  Phase 2 review). It now quotes the first failed call.
- A source file keyed with no claims by one of the prose and docstring
  streams was never extracted by the other after `docs.include`
  changed (v1.2 Phase 2 review), because both key by path at the same
  SHA. The local cache now records which stream keyed each path
  (migration 7), and classification uses it. This includes following
  the `docs.include` collision warning's own advice.
- `contextatlas index` exited 1 after exporting on repositories whose
  `docs.include` pages had fewer than 8 claims, or none (v1.2 Phase 2
  review; the CLI side predates Phase 2): `validate-extraction` held
  them to the ADR depth floor. An `/index-atlas` refresh that kept
  those pages, as it must, could never pass its gate.
- The `validate-extraction` failure message told users to run
  `index --full`, which since Phase 2 also re-extracts every docstring
  file (v1.2 Phase 2 review). It now says so and gives an ADR-only
  route.
- `init` told users to re-run `init` after an `index` that exported
  and then exited 1 (v1.2 Phase 2 review). A re-run skips extraction
  once `atlas.json` matches HEAD, so the failed work was never
  retried. `init` now says to run `contextatlas index` first.
- An `/index-atlas` refresh wrote preserved `symbol_ids` next to
  `symbols: []`, an atlas that cannot be imported until
  `resolve-symbols` runs (v1.2 Phase 2 review). An interrupted or
  gate-blocked refresh left the MCP server failing at startup with a
  raw SQLite error. See "Changed".
- A `getDocstring` failure in `list-extraction-sources` made an
  `/index-atlas` refresh drop that symbol's claims and pin the file's
  new SHA (v1.2 Phase 2 review). See "Changed".

### Security

- Removing `@modelcontextprotocol/sdk` 0.5.0 clears
  GHSA-w48q-cv73-mx4w (v1.2 Phase 0). That advisory covers DNS
  rebinding protection not being enabled by default in versions
  < 1.24.0. It concerns the HTTP transports; ContextAtlas is
  stdio-only.
- An in-range lockfile refresh moves `brace-expansion` 5.0.7 → 5.0.12,
  pulled in via `glob` → `minimatch` (v1.2 Phase 0). This clears
  GHSA-mh99-v99m-4gvg and GHSA-rgw5-rvv9-x895.

## [0.9.0] - 2026-05-16

Ruby adapter ship cycle (Stream A operationally complete; no
formal tag — content folds into v1.0.0 launch).

### Added

- Ruby language adapter (ADR-21) — fourth supported language;
  ruby-lsp 0.26.x + ruby-lsp-rails 0.4.x stable-compatible pair.
- 116 Ruby-specific tests (94 unit + 14 conformance + 8 doctor
  environment).
- Doctor Ruby/Rails check surface — 10-check substrate
  (`src/doctor/checks/ruby-environment.ts`) covering Ruby version
  + bundler + ruby-lsp + Rails detection + ruby-lsp-rails + multi-
  Ruby PATH + non-PATH installs + libyaml + tzinfo-data +
  database.yml.
- Rails-specific default excludePatterns
  (`vendor/bundle`, `tmp`, `log`, `.bundle`, `storage`,
  `public/assets`).
- `docs/v1_1-INHERITANCE-SUBSTRATE.md` — forward-looking adapter
  authoring reference for v1.1+ cycles.

### Changed

- Conformance harness `functionSymbol` assertion accepts
  `"function"` OR `"method"` (Path β; Ruby kind-6-uniform callable
  mapping per language-structural-property).
- ADR-21 accumulated 5 substantive amendments within cycle
  (Φ-γ-variant `self.method` verbatim + Constant-references
  Limitations + getTypeInfo declaration-parse Limitations +
  kind-6-uniform Symbol-kind expansion + Cohort-version range).

See [v0.9 close substrate-record](v1_1-HANDOFF.md) §7 for
cycle-engineering detail.

## [0.8.0] - 2026-05-14

Substrate-equivalence + path-comparability + BM25 activation
cycle. Last substantive code/features cycle before v1.0 public
launch prep.

### Added

- BM25 activation on `get_symbol_context` (Ship 1: handler-side
  `args.query ?? symbol.name` synthesis; Ship 4b: doctor
  recommendation gate).
- Skill-vs-CLI substrate-equivalence at 65-83% claim ratio across
  hono/httpx/cobra benchmarks.
- v0.5 efficiency-paradigm re-validation via Option B 4-condition
  factorial (96 trials; 5 of 6 non-trick cells reduced tool-call
  count).

### Changed

- ADR-16 (BM25) amended with behavioral disclosure per Ship 4b.

See [v0.8 cycle artifacts](docs/cycles/v0_8/) for detail.

## [0.7.3] - 2026-05-14

### Added

- BM25 activation substrate-version bump (Ship 1 prerequisite
  for v0.8 work).

## [0.7.2] - 2026-05-13

### Fixed

- CLI source convention + validate-extraction scoping
  (substrate-currency hotfix between v0.7.1 ship and v0.8 work).

## [0.7.1] - 2026-05-13

### Added

- Path-3 entry-point-determined architecture: CLI uses Anthropic
  API direct; Skills use subscription-bounded execution.
- ADR-02 amendment + version bump.

## [0.7.0] - 2026-05-12

Launch-bearing cycle to v1.0 public launch substrate.

### Added

- `contextatlas generate-adrs` command with investigative-depth-per-
  decision-candidate workflow + canonical depth-floor mechanical
  enforcement via `validate-adrs`.
- 4-cohort entry-surface framing (CLI + Skill × cold-start +
  reference-context).
- Claude Code Skills mechanism for `/index-atlas` + `/generate-adrs`.

See [v0.7 cycle artifacts](docs/cycles/v0_7/) for detail.

## [0.6.0] - 2026-05-09

Early-access pipeline-mechanics + targeted matrix-replication
subset + cohort infrastructure cycle.

### Added

- Doctor deep LSP health check (sample-symbol traversal beyond
  spawn test).
- Cohort feedback template + tool-description observability per
  ADR-20 consent contract + recruitment infrastructure.
- Lazy adapter spawn (A4) + self-use onboarding pipeline (A7).

### Changed

- 8-cell matrix-replication subset (DIVERGED 2-of-4 axes vs v0.5;
  F1 atlas-substrate-version confound primary mechanism).

See [v0.6 cycle artifacts](docs/cycles/v0_6/) for detail.

## [0.5.0] - 2026-05-04

LLM-judge methodology + quality-axis blind-grading cycle.

### Added

- Single + paired rubric prompts; 5-step anonymization pipeline
  per ADR-19.
- Paired-t statistical methodology (ADR-19 §4 amendment 2026-05-03).
- Adaptive cost priors (`scripts/aggregate-cost-priors.mjs`).

### Changed

- Cross-cell rollup distinguishes 3 of 4 quality axes
  (factual_correctness CLEAN; hallucination + actionability
  BORDERLINE; completeness NOT distinguishable).

See [v0.5 cycle artifacts](docs/cycles/v0_5/) for detail.

## [0.4.0] - 2026-04-29

Production-installability foundation cycle.

### Added

- LSP timing-race robustness with bounded-poll + readiness-signal
  pattern across TS/Python/Go adapters (ADR-18).
- Diagnostic-only doctor script foundation (5 categories;
  17-21 checks; limited-mode for unconfigured repos).
- Commit-message extraction as third claim source.
- Cost-projection disclaimer across 5 user-facing surfaces.

### Changed

- Directory-aware test-file exclusion (A4 substrate hardening).

See [v0.4 cycle artifacts](docs/cycles/v0_4/) for detail.

## [0.3.0] - 2026-04-28

Atlas precision + docstring source extraction cycle.

### Added

- Docstring source extraction across TypeScript / Python / Go.
- Atlas schema v1.3 with `contextatlas_commit_sha` provenance.
- Multi-symbol API (Theme 1.1 per ADR-15).

### Changed

- Narrower attribution per ADR-16 amendment (Theme 1.2).

See [v0.3 cycle artifacts](docs/cycles/v0_3/) for detail.

## [0.2.0] - 2026-04-25

Three-language baseline cycle. Validated cross-language replication.

### Added

- Go language adapter (gopls; ADR-14).
- Atlas schema v1.2 with `parent_id` support for ADR-14 interface-
  method flattening.
- Phase 6 reference run (httpx, Python; 24/24 cells clean).
- Phase 7 reference run (cobra, Go).

### Changed

- v0.2 thesis ("works across languages and repos") empirically
  validated.

See [v0.2 cycle artifacts](docs/cycles/v0_2/) for detail.

## [0.1.0]

Initial MVP release. Pre-cycle-discipline; predates per-cycle scope
+ step-plan substrate documentation conventions established at v0.2.

### Added

- Core MCP server skeleton with `get_symbol_context`,
  `find_by_intent`, `impact_of_change` tools.
- TypeScript language adapter (via `typescript-language-server`).
- Python language adapter (via Pyright; ADR-13).
- Opus 4.7 index-time extraction pipeline (ADR-02).
- SQLite storage with SHA-based incremental reindex.
- Phase 5 empirical validation on hono (50-71% tool-call reduction
  on architectural win-bucket prompts).
- Atlas schema v1.0 → v1.1 (additive git-signal addition per
  ADR-11).

See [ROADMAP.md](ROADMAP.md) §v0.1 for detail (no dedicated cycle
subdirectory; pre-cycle-discipline).
