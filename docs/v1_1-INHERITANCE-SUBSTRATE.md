# v1.1+ Inheritance Substrate

**Authored:** 2026-05-16 at v0.9.0 cycle close
**Purpose:** Forward-looking adapter authoring reference for v1.1+ language adapter cycles
**Audience:** Future dev/advisor team authoring Rust / Java / .NET / additional language adapters

---

## Purpose

This document carries forward discipline-pattern artifacts, structural design patterns, and substrate-record observations from v0.2-v0.9 adapter authoring cycles (TS / Python / Go / Ruby). It serves as forward-looking reference for v1.1+ cycle planning when new language adapters get authored.

Distinct from [`../v1_1-HANDOFF.md`](../v1_1-HANDOFF.md) (which captures cycle-specific backlog + retrospective observations from v0.8 + v0.9 closes). This document is **prospective** — what future adapter authors should anticipate, prepare for, and plan around at probe-phase + ADR-authoring + implementation + conformance + integration phases.

Also distinct from [`language-adapter-guide.md`](language-adapter-guide.md) (external contributor onboarding for new language adapter authoring; LanguageAdapter interface tour + registry integration + conformance wire-up + PR checklist; external-contributor-friendly vocabulary). This INHERITANCE-SUBSTRATE document targets the dev/advisor team's internal discipline patterns; the language-adapter-guide targets a community contributor adding a new language adapter from outside the project. The two compose: language-adapter-guide references this document for "internal discipline pattern detail" where contributors want to understand the substantive reasoning behind plan-substrate templates.

## Anticipated v1.1+ adapter candidates

Per README §Language Support roadmap: Rust, Java, .NET (by demand). Empirical cohort feedback at v1.0+ informs prioritization.

**Anticipated install-variation breadth (informs PATH-enrichment-helper need):**

- **Rust:** rustup-managed; cargo conventionally on PATH. Probably no PATH enrichment needed (parallel to pyright).
- **Java:** wide install variation (system JDK / jenv / sdkman / IDE-bundled JDK / Coursier). Likely needs PATH enrichment (similar to or wider than Ruby).
- **.NET:** dotnet typically on PATH after install but installer-version-variant. May need PATH enrichment depending on cohort install patterns.

Per v0.9 Stream A observation (11) in [`../v1_1-HANDOFF.md`](../v1_1-HANDOFF.md) §7: LSP-server-install-variation correlates with PATH-enrichment-helper need.

## Adapter authoring discipline patterns

### Pattern 7 four-axis verification (canonical)

At plan-substrate entry for any new adapter cycle:

1. **Structural-precedent verification** — claims about adapter structure vs ADR-01 / ADR-13 / ADR-14 / ADR-21 precedents
2. **Measurement-claim verification** — empirical data vs substrate
3. **Named-version-anchor verification** — cited versions vs canonical upstream sources
4. **Dependency-constraint verification** — pairwise version compat vs package-manager resolver execution

Canonicalized at v0.9 cycle (commit `815125f`). Apply at every probe-phase + ADR-authoring + adapter implementation entry surface.

### Pattern 7 axis 5 (canonical at v0.9 close; sub-decomposed)

Meta-verification: claims about substrate verified against actual substrate.

- **5a Cross-reference-claim-coherence** — cited precedents claim what we say they claim
- **5b Substrate-coverage-completeness** — empirical substrate covers the range of cases ADR/adapter scope claims to handle

Both surface at downstream empirical verification, not at authoring-time documentation review. For new adapter ADR authoring: when citing precedent ADRs (ADR-13 / ADR-14 / ADR-21 / etc), verify the cited section actually says what you summarize it as saying.

### Pause-and-surface vs verify-and-act discipline

Canonicalized at v0.9 commit `b6ea824` (Path B paranoia drop):

- **Scope-affecting decisions** → pause-and-surface for adjudication (shared-module changes, new SymbolKind taxonomy, ADR amendments, substrate-axis additions)
- **Constraint-correcting decisions** → verify-and-act (probe-empirical-grounded fixes within existing substrate)

Pattern 7 four-axis verification continues to apply at every decision surface for either path.

### Empirical-survey-before-decomposition discipline

Before locking phase/substep decomposition for new adapter cycle: empirical survey of existing surface (current adapters' structure, doctor checkExecutable switch, init scaffolding via LANG_CODES, default excludePatterns, etc.). Pre-deciding decomposition without survey risks:

- **Over-decomposition** (when work is simpler than estimated through existing infrastructure)
- **Under-decomposition** (when work is more complex than estimated through scope expansion)

Pattern applied at v0.9 Phase 5 (Z-3 hybrid emerged from survey) + v0.9 close (migration scope corrected by dev's grep — 30+ cross-reference files / 15+ markdown links would have broken; migration deferred to Stream B substep).

### Forward-composition design pattern

When two substeps consume related substrate (e.g., signature + docstring both from hover response), design earlier substep to produce both outputs; later substep consumes without re-parsing. v0.9 example: 3.3 `parseRubyHoverContent` returns `{ signature, prose }`; 3.7 consumes prose field.

Phase plan substep enumeration should identify forward-composition opportunities at planning surface, not discover them empirically mid-implementation.

### Skip-with-rationale pattern

Multi-surface updates (e.g., language-enumeration across README + DESIGN + docs + package.json + etc.): empirical grep produces inventory of surfaces; some surfaces deliberately NOT touched. Each skip gets explicit reason captured. Future-reader sees why surface wasn't touched.

v0.9 Substep 5.1 example: CLAUDE.md / MCP schemas / benchmark targets / historical TS+Python framing all skipped with explicit reasons.

### Substep-bounded ship-commit discipline

Each substep produces one commit. Mid-substep surgical revisions ship as separate commits per `b6ea824` boundary. Commits accumulate substrate-record observations in commit bodies; phase close commits consolidate cycle observations.

### Execution-discipline (staging-set verification)

Before `git commit` fires: `git status --short` empirical check that staging set matches modification set. Catches partial-stage scenarios where:

- `git add` with explicit path scopes narrower than modification set
- Heredoc parse errors prevent commit execution (use commit-via-`-F` file pattern for commit bodies with apostrophes or technical content)
- Other staging mechanism failures

Two v0.9 empirical instances (4.1 post-commit catch; 4.3 pre-commit catch). Discipline-pattern artifact effectiveness demonstrated empirically when reinforced — applied cleanly across 4.2 + 4.3 + 5.1 + 5.2 + Sub-close-2 + Sub-close-3 without recurrence.

## Cross-adapter pattern artifacts

### Adapter divergence axes

Adapter pattern uniformity at `LanguageAdapter` base-class shape; adapter implementation divergence at two axes:

**(a) LSP response-shape conventions** (per-LSP)
- Hover-based getSymbolDetails (Ruby) vs structured-fields-based (Pyright / gopls)
- Pull-model `textDocument/diagnostic` LSP 3.17 (Ruby) vs push-model `publishDiagnostics` (Pyright / gopls)
- URL-encoding dedup needs (per-LSP location-response shape)

**(b) Language-structural-properties** (per-language)
- Functions-vs-methods semantic split (Python / Go yes; Ruby no — kind-6-uniform callable mapping)
- Class hierarchy locally-parseable (Ruby) vs requires-pass-1-inventory (Pyright Protocol resolution)
- `self.method` / receiver-prefix handling (Ruby / Go preserve verbatim; per language convention)

For new adapter cycles: probe-phase substrate should distinguish wire-protocol probing (version-stable per v0.9 Phase 1 finding) from environmental probing (version-sensitive) at substep boundary.

### Cross-adapter conformance harness flexibility

Conformance harness (`src/adapters/conformance.ts`) accommodates language-semantic-divergence via per-language flexibility:

- `classSymbol`: "class" OR "interface" (pre-existing precedent, line 50; Python Protocol)
- `functionSymbol`: "function" OR "method" (v0.9 Path β `c54ff7c`; Ruby kind-6-uniform callable mapping)

For new adapter cycles: anticipate language-semantic-divergence at conformance harness contract design surface. If new language has structural surface that doesn't map cleanly to existing harness assertions, propose flexibility extension via shared-module-change adjudication (`b6ea824` discipline).

### Doctor-substrate null-filter-at-orchestrator pattern

Doctor checks return null when not-applicable; orchestrator filters. Avoids PASS-with-irrelevant-message cohort UX noise.

Applies to:
- Framework-conditional checks (Rails-conditional for Ruby; Spring-conditional for Java; ASP.NET-conditional for .NET)
- Platform-conditional checks (Windows-specific libyaml, tzinfo-data for Ruby; macOS-specific paths for Java)
- Optional-substrate checks (suppress when no non-PATH installs detected)

v0.9 reference implementation: `src/doctor/checks/ruby-environment.ts` (Substep 5.2 commit `6570440`).

### Probing-against-actual-channel-pattern discipline

Probe scripts encode delivery-channel assumptions. Cross-adapter probe substrate quality depends on probing-against-actual-channel-pattern, not assumed-channel-pattern (the assumption-pattern risk: copying probe substrate from precedent adapter and not re-validating channel shape against new LSP).

For new adapter probe-phase authoring: empirically verify the new LSP's delivery channel for diagnostics (push vs pull), references, definitions, etc. before authoring probe substrate. Don't inherit ruby-lsp / Pyright / gopls's specific channel assumptions.

### K-2-ii consolidated archival pattern

For new adapter cycles: probe substrate (script + findings) archives to `docs/adr/{language}-lsp-probe/` consolidated subdirectory at probe-phase close. Includes:

- Probe script (preserve verbatim with env override pattern documented in archive README)
- Findings baseline file (preserve verbatim)
- README documenting archive purpose, capture provenance, re-run pattern

Distinct from ADR-13 (Pyright) + ADR-14 (gopls) live-path retention — K-2-ii is the canonical pattern for v1.1+ adapter probe substrate. v0.9 reference: `docs/adr/ruby-lsp-probe/` (commit `eb69d53`).

## Substrate-design dimensions

### Fixture-substrate-version vs cohort-actual-version axis

Distinct from Pattern 7's four verification axes. Probe substrate version (what we anchor LSP/probe to) may diverge from cohort-actual-version (what cohort developers actually run).

For new adapter cycles: §install-pattern framing should anchor BOTH versions from outset. Probe phase should re-run against cohort-actual-version before adapter implementation, not anchor at older LSP-tested-stable version.

v0.9 reference: Phase 1 closed the Ruby 3.3 → 4.0.3 gap explicitly rather than carrying as v1.1 amendment.

### Diagnostic-delivery-channel-axis

Push-model (`publishDiagnostics` notifications) vs pull-model (`textDocument/diagnostic` LSP 3.17 request). For new adapter cycles: probe per-LSP rather than assuming push-model parallel to Pyright/gopls. Net-new substrate-design dimension surfaced at v0.9 Ruby.

### LSP wire protocol behavior is runtime-version-stable

v0.9 Phase 1 empirically validated: LSP wire protocol behavior is Ruby-runtime-version-stable across the supported range (3.3 → 4.0). Environmental-coupling (toolchain, build deps, runtime ecosystem) is where version-sensitivity lives.

For new adapter cycles: probe substrate validation should distinguish wire-protocol probing (version-stable) from environmental probing (version-sensitive) at substep boundary.

## ADR amendment frequency expectations

Substantive ADRs for structurally-complex languages should expect **3-5 amendments per shipping cycle** as implementation pressure surfaces gaps that documentation review didn't anticipate.

Cross-adapter precedent:
- ADR-13 (Pyright) — 0 substantive amendments at original cycle
- ADR-14 (gopls) — 0 substantive amendments at original cycle
- ADR-21 (Ruby) — 5 substantive amendments within v0.9 cycle

Pattern correlates with language structural complexity. Future adapters in this category (Ruby, likely Java) should anticipate higher amendment frequency. Pre-allocate substep capacity for amendments at phase plan substep enumeration time.

## Plan-substrate templates

### Probe-phase substep enumeration template

Per v0.9 Stream A Substeps 1-5:
1. Probe scaffold (mirror existing probe script structure; ~300-400 LOC)
2. Fixture authoring (target-language fixture with cohort-realistic content)
3. Probe implementation (capability probes per ADR target scope)
4. ADR authoring (against probe-empirical findings)
5. Cohort-version amendment (probe re-execution against cohort-actual-version if divergent from initial probe substrate)

### Adapter implementation phase decomposition

Per v0.9 Stream A Phase 3 (8 substeps for full data-method coverage):
- 3.1 Skeleton (constructor, handlers, spawn, initialize, shutdown)
- 3.2 listSymbols (foundation for utility reuse)
- 3.3 getSymbolDetails
- 3.4 findReferences
- 3.5 getDiagnostics
- 3.6 getTypeInfo (declaration-parse + usedByTypes scope decision)
- 3.7 getDocstring (forward-composition consumer of 3.3 substrate if shared parsing)
- 3.8 Adapter close + consolidation

Wall-clock estimate: 1-1.5 weeks per Pyright/Ruby precedent.

### Conformance test substrate phase

Per v0.9 Phase 4:
- 4.1 Fixture promotion (probe fixture → canonical harness fixture; per Option F-b reshape if fixture content is rich)
- 4.2 Probe substrate archival (K-2-ii consolidated subdirectory)
- 4.3 Conformance test scaffold (wire shared harness; Path P-1 PATH-enrichment if install variation warrants)

### Integration sweep phase

Per v0.9 Phase 5 (Z-3 hybrid decomposition):
- 5.1 Docs + init + excludePatterns (mostly verify-and-act through existing LANG_CODES infrastructure)
- 5.2 Doctor substrate (substantial new authoring for environment checks; null-filter-at-orchestrator pattern)

## Test-infrastructure observations

**EBUSY tmpdir Windows flake** (carried from v0.9 as v1.1+ investigation candidate per [`../v1_1-HANDOFF.md`](../v1_1-HANDOFF.md) §7). Test-infrastructure category, separate from Pattern 7. May require architectural change or simply tmpdir cleanup discipline. Doesn't block adapter cycles but does inflate noise in test-run-vs-baseline comparison; worth resolving before next adapter cycle for clean baseline tracking.

## Naming + convention observations

**Cycle artifact naming.** v0.9 uses underscore (`v0_9-`). Historical cycles used dot notation (`v0.2-`, `STEP-PLAN-V0.2.md`). v0.9 close migration (deferred to Stream B substep) preserves historical filenames verbatim per non-revisionist substrate-record discipline.

**Per-cycle close convention.** v0.7 + v0.8 cycles consolidated observations into next-cycle HANDOFF docs rather than separate CYCLE-CLOSE docs. v0.9 follows this precedent — Stream A close substrate-record consolidated into [`../v1_1-HANDOFF.md`](../v1_1-HANDOFF.md) §7 append section per Y-2 lock. For v1.1+ cycle closes: continue Y-2 precedent (append to next-cycle HANDOFF; no separate per-cycle close doc).

**Tooling-discipline observations.** Heredoc-apostrophe + multi-Ruby-install PATH precedence (v0.9 catches) preserved as cycle-execution lessons in [`../v1_1-HANDOFF.md`](../v1_1-HANDOFF.md) §7. Worth v1.1 inheritance for any cycle authoring commit bodies with apostrophes (commit-via-`-F` file pattern) or any cycle touching Windows + multi-version-language-install topology (`where.exe` empirical disambiguation needed).

---

## Substrate references

- [`../v1_1-HANDOFF.md`](../v1_1-HANDOFF.md) — v0.8 + v0.9 close cycle-engineering knowledge clusters (§1-§6 v0.8 close; §7 v0.9 Stream A close)
- [`../research/v1.1-candidates.md`](../research/v1.1-candidates.md) — v1.1 candidate work-items inventory
- [`../docs/adr/ADR-03-language-adapter-plugin.md`](adr/ADR-03-language-adapter-plugin.md) — LanguageAdapter plugin architecture (foundational invariant for all new adapter cycles)
- [`../docs/adr/ADR-13-python-adapter-pyright.md`](adr/ADR-13-python-adapter-pyright.md) — Python adapter precedent (declaration-parse + Protocol→interface remap)
- [`../docs/adr/ADR-14-go-adapter-gopls.md`](adr/ADR-14-go-adapter-gopls.md) — Go adapter precedent (PATH-enrichment + receiver-prefix-verbatim)
- [`../docs/adr/ADR-21-ruby-adapter-ruby-lsp.md`](adr/ADR-21-ruby-adapter-ruby-lsp.md) — Ruby adapter precedent (kind-6-uniform + pull-model diagnostic + Rails detection + dual-pattern install)
- [`../src/adapters/conformance.ts`](../src/adapters/conformance.ts) — shared conformance harness contract (per-language flexibility precedents)
- [`../src/doctor/checks/ruby-environment.ts`](../src/doctor/checks/ruby-environment.ts) — null-filter-at-orchestrator reference implementation
- [`../docs/adr/ruby-lsp-probe/`](adr/ruby-lsp-probe/) — K-2-ii consolidated probe substrate archival reference
