# Deliberate parse error for publishDiagnostics probe (v0.9 Stream A
# Substep 3). Unclosed paren in method signature; ruby-lsp's parser
# (Prism) should emit a diagnostic with severity error.

class Broken
  def initialize(name
    @name = name
  end
end
