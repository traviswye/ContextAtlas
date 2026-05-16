module Analytics
  VERSION = '1.0.0'

  module_function

  def track(event_name, properties = {})
    [event_name, properties]
  end

  def identify(user_id, traits = {})
    [user_id, traits]
  end
end

# Pure top-level def added for v0.9 Stream A Phase 4 mid-substep
# watch (b) empirical verification per Travis Path α adjudication.
# Confirms LSP kind value ruby-lsp 0.26.9 emits for top-level def
# (NOT module-scoped). Informs mapRubyKind name-aware discriminator
# design — kind 12 with no `self.` prefix vs class methods (kind 12
# with `self.` prefix). Pyright/gopls precedent maps kind 12 →
# "function" uniformly; ADR-21 §Symbol-kind mapping table currently
# only enumerates class method case (kind 12 + `self.` prefix →
# "method"). Verification confirms or falsifies the kind 12 prior
# for top-level def.
def greet(name)
  "Hello, #{name}!"
end
