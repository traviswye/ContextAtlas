# ruby-lsp + ruby-lsp-rails probe archive

Archived substrate from v0.9 Stream A — the empirical capture that
motivated the RubyAdapter design decisions documented in
[`../ADR-21-ruby-adapter-ruby-lsp.md`](../ADR-21-ruby-adapter-ruby-lsp.md).

## Contents

| File | Role |
|---|---|
| `ruby-lsp-probe.ts` | Probe script — drives ruby-lsp 0.26.9 + ruby-lsp-rails 0.4.8 against `test/fixtures/ruby/` and writes findings to `findings-baseline.md`. |
| `findings-baseline.md` | ~3920-line empirical capture: initialize handshake + capabilities advertisement + 6 ordered probes (documentSymbol, hover, references, definition + typeDefinition + implementation, diagnostics, hover/documentation). Re-runs deliberately overwrite this file. |

## Capture provenance

- **v0.9 Stream A Substep 1** (scaffold): initial probe script + handler stubs + initialize handshake.
- **v0.9 Stream A Substep 2** (Rails fixture authoring): `test/fixtures/ruby-probe/` Rails 8.0 fixture (paranoia gem dropped per Pattern 7 surface 5; tzinfo-data added per Substep 3 follow-up).
- **v0.9 Stream A Substep 3** (probe execution): ordered capability probes against ruby-lsp 0.26.9 + ruby-lsp-rails 0.4.8 stable-compatible pair (per Option D adjudication). Path β+δ adjudication accepts baseline-only capture — ruby-lsp-rails Rails-runner addon crashes on `config/database.yml` against the synthetic fixture; core ruby-lsp documentSymbol / hover / references / definition / diagnostics surfaces unaffected.
- **v0.9 Phase 1 re-execution** (Ruby 4.0.3 install): probe re-run after Travis's Ruby 3.3 → 4.0.3 upgrade (Path E-2; addressed PATH-routing precedence). Substrate unchanged at the LSP-protocol layer.
- **v0.9 Phase 4 mid-substep watch (b)** (kind-12 empirical verification): probe re-run after appending top-level `def greet(name)` to `test/fixtures/ruby/lib/analytics.rb` (commit 43b7396) — empirically falsified Path α kind-12 hypothesis; locked Path β conformance harness flexibility at commit c54ff7c.
- **v0.9 Substep 4.1** (fixture promotion): `test/fixtures/ruby-probe/` → `test/fixtures/ruby/` via `git mv` at commit 6f9ae29. Probe `FIXTURE` constant updated in-place.
- **v0.9 Substep 4.2** (this archival): `scripts/ruby-lsp-probe.ts` + `docs/adr/ruby-lsp-probe-findings-baseline.md` → `docs/adr/ruby-lsp-probe/` subdirectory.

## Re-run pattern

Default invocation (post-archival; against the canonical fixture):

```sh
# From repo root:
cd test/fixtures/ruby && bundle install   # one-shot if not yet bundled
cd ../../..
npx tsx docs/adr/ruby-lsp-probe/ruby-lsp-probe.ts
```

Findings overwrite `docs/adr/ruby-lsp-probe/findings-baseline.md`
in-place. Prior captures are preserved in git history; if you need
to compare against the v0.9 Substep 3 close snapshot, use `git show
<commit>:docs/adr/ruby-lsp-probe-findings-baseline.md` against the
pre-archival commit (or `git log --follow` after rename detection).

Override FIXTURE root via env var when re-running against a
non-default target (e.g., a v1.1 upgrade smoke against an alternate
Rails-shaped fixture):

```sh
CONTEXTATLAS_PROBE_ROOT=path/to/other/rails/app \
  npx tsx docs/adr/ruby-lsp-probe/ruby-lsp-probe.ts
```

Bundler / ruby-lsp binary overrides remain available (Windows .bat
shim handling per Substep 3 b-cmd adjudication):

```sh
CONTEXTATLAS_BUNDLE_BIN=bundle.bat \
CONTEXTATLAS_RUBY_LSP_BIN=ruby-lsp.bat \
  npx tsx docs/adr/ruby-lsp-probe/ruby-lsp-probe.ts
```

## Substrate-record observations

**Archive pattern departs from ADR-13 / ADR-14 flat-precedent.** The
Pyright + gopls probe artifacts are preserved at their original
locations:

- `scripts/pyright-probe.ts` + `docs/adr/pyright-probe-findings.md`
- `scripts/gopls-probe.ts` + `docs/adr/gopls-probe-findings.md`

There is no `docs/adr/pyright-probe/` or `docs/adr/gopls-probe/`
subdirectory. The Option K-2-ii archival pattern applied here is a
**new discipline-pattern refinement**, not a precedent-inheritance.
Rationale: ruby-lsp's probe substrate is more substantial (script +
findings + Rails-shaped fixture setup + Rails-runner addon crash
context) than the Pyright/Go probes, so subdirectory grouping
preserves substrate-record cohesion. Worth carry-forward for any
future structurally-complex adapter probe at v1.1+ (per
[`../../research/v1.1-candidates.md`](../../../research/v1.1-candidates.md)
substrate-record candidates).

**Re-runnability preserved deliberately.** Both the script and the
findings file are kept — the script is not throwaway substrate. The
v1.1-candidate upgrade to the ruby-lsp 0.27+/0.5+ pair (Rubydex-
backed indexer; expanded methods/instance-vars references coverage)
will re-execute this probe against the new pair to validate the
adapter's LSP-protocol assumptions remain correct under the new
substrate.

**Original probe-script header comment ("Discard after ADR-21 +
RubyAdapter land") is now stale by design.** The Substep 4.2
adjudication chose preservation over discard; the comment was
revised in-place to reflect the archival decision.
