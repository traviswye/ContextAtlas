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

### Removed

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
