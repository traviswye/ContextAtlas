# RubyAdapter fixture (test/fixtures/ruby/)

Promoted from `test/fixtures/ruby-probe/` at v0.9 Stream A Substep 4.1
(single `git mv`; preserves git history). Houses three roles in one
directory:

1. **Canonical conformance harness fixture** — `sample.rb`,
   `broken.rb`, `consumer.rb` at top level. Consumed by the shared
   conformance harness (`src/adapters/conformance.ts` —
   `runConformanceSuite`) via `src/adapters/ruby.conformance.test.ts`.
   Mirrors `test/fixtures/python/` + `test/fixtures/go/` role.

2. **Secondary Rails-substrate fixture** — `app/`, `lib/`, `config/`,
   `bin/rails`, `Gemfile`, `.ruby-version`. The original v0.9 Substep
   2 multi-model Rails substrate (User / Post / Sluggable concern /
   PostsController) + standalone Ruby modules (Analytics,
   DynamicMethods). Exercises Rails-detection + DSL-macro behavior in
   adapter integration tests beyond the conformance contract.

3. **Probe-substrate provenance** — load-bearing files carried
   forward unchanged from probe-time authoring. `lib/analytics.rb`
   includes the top-level `def greet` added at v0.9 Phase 4 watch (b)
   per commit 43b7396 as empirical evidence for kind-6-uniform
   callable mapping (see ADR-21 §Kind-6-uniform callable mapping +
   Path β commit c54ff7c).

This is **not** a runnable Rails application — no database
configuration, no real initializers, no asset pipeline. It's a
fixture for exercising LSP capabilities against ruby-lsp +
ruby-lsp-rails. Rails detection by ruby-lsp-rails fires on
`Gemfile` + `config/application.rb` presence; runtime correctness is
not a goal.

## Setup (one-shot before running the probe)

```sh
cd test/fixtures/ruby
bundle install
```

Then from the repo root:

```sh
npx tsx scripts/ruby-lsp-probe.ts
```

Findings land at `docs/adr/ruby-lsp-probe-findings-baseline.md`.

## Version pinning

v1.0 ships on the **stable-compatible pair**: ruby-lsp 0.26.x +
ruby-lsp-rails 0.4.8.

Per actual bundler resolution at May 15, 2026: ruby-lsp-rails 0.4.8
depends on ruby-lsp `>= 0.26.0, < 0.27.0`. ruby-lsp's stable max is
0.26.9; the resolver picks the latest compatible patch. ruby-lsp
0.27+ (Rubydex-backed indexer) and ruby-lsp-rails 0.5.0+ are
pre-release only.

**Implication for probe findings**: at 0.26.x, Rubydex (the
2026-05-12 indexer rework that expanded methods/instance-vars
references coverage) is NOT present — Rubydex landed in 0.27+
pre-release. Probe-findings on `findReferences` will reflect pre-
Rubydex coverage shape against the most recent pre-Rubydex stable
patch, which ADR-21 Limitations must document honestly. v1.1
upgrade to the 0.27+/0.5+ pair is anchored as a v1.1-candidate
entry.

## What this fixture exercises

### Canonical conformance harness (added at v0.9 Substep 4.1)

| File | Role |
|---|---|
| `sample.rb` | Plain-Ruby `Greeter` class + top-level `format_greeting` def. classSymbol / functionSymbol / referencedSymbol per `ConformanceFixtureSpec`. |
| `broken.rb` | Deliberate parse error (unclosed paren in method signature). Diagnostic-coverage probe. |
| `consumer.rb` | Cross-file references against `sample.rb` (Greeter, format_greeting) AND secondary Rails substrate (User, Post, Sluggable, Analytics). |

### Secondary Rails-substrate (v0.9 Substep 2 origin)

| File | DSL surface |
|---|---|
| `app/models/user.rb` | has_many, has_one, enum, scope (3x), validates, callbacks (before_save + after_create), class methods, instance methods, constants |
| `app/models/post.rb` | belongs_to, has_and_belongs_to_many, enum, scope (2x), ActiveSupport::Concern include, before_validation |
| `app/models/concerns/sluggable.rb` | ActiveSupport::Concern pattern — included block, class_methods block, instance methods |
| `app/controllers/posts_controller.rb` | < ActionController::Base, before_action, CRUD actions, strong params |
| `lib/analytics.rb` | Plain Ruby module + module_function (no Rails magic) + top-level def empirical evidence (Phase 4 watch (b)). |
| `lib/dynamic_methods.rb` | `define_method` metaprogramming probe |

**External-DSL probe slot deliberately omitted.** ruby-lsp-rails
covers core Rails patterns (associations, scopes, enums, callbacks,
ActiveSupport::Concern, validations) per its documented scope; it
does not surface symbols for third-party DSL macros from gems like
`acts_as_paranoid`, `acts_as_list`, or `acts_as_taggable_on`. This
is a documentation-cited Limitation in ADR-21 rather than fixture-
probed evidence; the fixture focuses on core Rails DSL coverage
delta from the add-on. (Origin: Pattern 7 surface 5 — paranoia
2.6.3 caps at `activerecord < 7.2`, incompatible with Rails 8;
Path B adjudication dropped the external-DSL slot rather than
adopt a replacement gem.)
