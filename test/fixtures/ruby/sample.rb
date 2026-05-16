# Canonical conformance fixture for RubyAdapter
# (test/fixtures/ruby/sample.rb). Mirrors test/fixtures/python/sample.py
# and test/fixtures/go/sample/sample.go in role: a small standalone
# source file providing the symbols the shared conformance harness
# probes (`src/adapters/conformance.ts` `runConformanceSuite`).
#
# Conformance harness contract (post-v0.9 Path β):
#   - classSymbol      = "Greeter"        # → kind "class"
#   - functionSymbol   = "format_greeting" # → kind "method" (Ruby
#                                          #   kind-6-uniform per
#                                          #   ADR-21 §Kind-6-uniform
#                                          #   callable mapping;
#                                          #   conformance accepts
#                                          #   ["function","method"])
#   - referencedSymbol = "Greeter"         # consumer.rb instantiates
#                                          #   and calls Greeter
#                                          #   methods → findReferences
#                                          #   returns cross-file hit
#
# Plain-Ruby (no Rails). Rich Rails substrate lives in app/, lib/,
# config/ for secondary fixture exercise.

class Greeter
  GREETING_LIMIT = 100

  attr_reader :name

  def initialize(name)
    @name = name
  end

  def hello
    "Hello, #{@name}!"
  end

  def shout
    "#{hello.upcase}"
  end

  def self.default
    new("world")
  end
end

# Top-level def — ruby-lsp documentSymbol emits LSP kind 6 (Method),
# uniform with instance methods inside the Greeter class above per
# Ruby's no-functions-vs-methods semantic split. mapRubyKind →
# "method"; conformance harness `functionSymbol` assertion accepts
# ["function", "method"]. Empirically verified at v0.9 Phase 4
# Path β commit c54ff7c (see also lib/analytics.rb top-level
# `def greet` for the original probe-fixture empirical evidence).
def format_greeting(name, prefix: "Hello")
  "#{prefix}, #{name}!"
end
