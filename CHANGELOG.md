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
