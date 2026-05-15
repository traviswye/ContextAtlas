# ruby-lsp probe fixture

Minimal Rails 8.0 application substrate authored for
[`scripts/ruby-lsp-probe.ts`](../../../scripts/ruby-lsp-probe.ts)
per v0.9 Stream A Substep 2.

This is **not** a runnable Rails application — no database
configuration, no real initializers, no asset pipeline. It's a
fixture for exercising LSP capabilities against ruby-lsp +
ruby-lsp-rails. Rails detection by ruby-lsp-rails fires on
`Gemfile` + `config/application.rb` presence; runtime correctness
is not a goal.

## Setup (one-shot before running the probe)

```sh
cd test/fixtures/ruby-probe
bundle install
```

Then from the repo root:

```sh
npx tsx scripts/ruby-lsp-probe.ts
```

Findings land at `docs/adr/ruby-lsp-probe-findings.md`.

## Version pinning

v1.0 ships on the **stable-compatible pair**: ruby-lsp 0.24.2 +
ruby-lsp-rails 0.4.8.

ruby-lsp's stable max is 0.26.9 (May 2026), but ruby-lsp-rails 0.4.8
pins ruby-lsp `>= 0.24.0, < 0.25.0` — the add-on lags 2+ minor
versions behind main. ruby-lsp 0.27+ (Rubydex-backed indexer) and
ruby-lsp-rails 0.5.0+ are pre-release only.

**Implication for probe findings**: at 0.24.2, Rubydex (the
2026-05-12 indexer rework that expanded methods/instance-vars
references coverage) is NOT present. Probe-findings on
`findReferences` will reflect pre-Rubydex coverage shape, which
ADR-21 Limitations must document honestly. v1.1 upgrade to the
0.27+/0.5+ pair is anchored as a v1.1-candidate entry.

## What this fixture exercises

| File | DSL surface |
|---|---|
| `app/models/user.rb` | has_many, has_one, enum, scope (3x), validates, callbacks (before_save + after_create), `acts_as_paranoid` (external DSL), class methods, instance methods, constants |
| `app/models/post.rb` | belongs_to, has_and_belongs_to_many, enum, scope (2x), ActiveSupport::Concern include, before_validation |
| `app/models/concerns/sluggable.rb` | ActiveSupport::Concern pattern — included block, class_methods block, instance methods |
| `app/controllers/posts_controller.rb` | < ActionController::Base, before_action, CRUD actions, strong params |
| `lib/analytics.rb` | Plain Ruby module + module_function (no Rails magic) |
| `lib/dynamic_methods.rb` | `define_method` metaprogramming probe |
| `consumer.rb` | Cross-file references for `findReferences` probe |
| `broken.rb` | Deliberate parse error for `publishDiagnostics` probe |

## Promotion to `test/fixtures/ruby/`

Per ADR-13 precedent (`test/fixtures/pyright-probe/` → `test/fixtures/python/`),
this directory promotes to `test/fixtures/ruby/` once ADR-21 and the
RubyAdapter implementation land. The probe-specific directory carries
forward as the adapter's integration-test substrate.
