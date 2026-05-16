# Cross-file consumer for the RubyAdapter conformance test substrate
# (v0.9 Stream A Substep 4.1 — post fixture-promotion from
# test/fixtures/ruby-probe/). The shared conformance harness
# (`src/adapters/conformance.ts`) uses the sample.rb reference below
# to verify findReferences returns a cross-file hit. The remaining
# Rails-flavored expressions preserve the substrate originally
# authored at v0.9 Substep 3 for cross-file reference exercise
# against the secondary Rails fixture content (Path B substrate-
# continuity precedent at commit c54ff7c). Coverage at the pre-
# Rubydex baseline (per Gemfile Version pinning note) — methods-
# references may be limited per roadmap, instance-variables likely not
# supported. Probe-findings (archived at docs/adr/ruby-lsp-probe/ at
# Substep 4.2) capture actual coverage shape.

# Canonical conformance reference — Greeter from sample.rb.
greeter = Greeter.new("alice")
greeter.hello
Greeter.default
format_greeting("bob")

# --- Secondary Rails-substrate references (preserved from probe era) ---

# User scope chain (constant resolution + scope methods).
User.recent.active

# User class method (defined via `def self.find_by_email`).
User.find_by_email('test@example.com')

# User enum predicate (enum-generated class method).
User.roles[:admin]

# Post belongs_to + User instance method.
post = Post.first
post.user.display_name

# Post enum predicate (enum-generated instance method).
post.published?

# Sluggable instance method (mixin via `include Sluggable` in Post).
post.to_param

# Sluggable class method (mixin via class_methods block).
Post.find_by_slug!('hello-world')

# Module function (no Rails magic).
Analytics.track('page_view', { url: '/' })

# User constant.
limit = User::PREMIUM_TIER_LIMIT

# Sluggable module reference.
include_path = Sluggable
