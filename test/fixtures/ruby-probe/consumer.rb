# Cross-file consumer for findReferences probe (v0.9 Stream A Substep 3).
# Each expression below references a symbol declared in app/ or lib/;
# probes verify ruby-lsp 0.24.2 resolves these cross-file references
# correctly across the various symbol kinds. Coverage at the pre-
# Rubydex baseline (per Gemfile Version pinning note) — methods-
# references may be limited per roadmap, instance-variables likely not
# supported. Probe-findings capture actual coverage shape.

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
