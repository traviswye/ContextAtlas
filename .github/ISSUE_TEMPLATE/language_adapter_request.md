---
name: Language adapter request
about: Request support for an additional language (Rust, Java, .NET, Kotlin, etc.)
title: "[Adapter] Add support for <language>"
labels: enhancement, language-adapter
assignees: ''
---

## Language

Which language are you requesting support for?

## Language server

Which LSP server is the canonical choice for this language? Some
options for common languages:

- **Rust**: `rust-analyzer`
- **Java**: Eclipse JDT LS, Java LS for VS Code
- **.NET / C#**: OmniSharp, csharp-language-server
- **Kotlin**: kotlin-language-server, JetBrains Kotlin LSP

Please cite the canonical project + current stable version.

## Install pattern

How is the language server typically installed in your community?

- Bundled with toolchain (e.g., `rustup` for rust-analyzer)
- Package manager (Homebrew, apt, scoop, etc.)
- IDE-bundled (JetBrains-only, VS Code extension wraps)
- Manual download

## Use case

What does your codebase look like? What kinds of queries would you
want ContextAtlas to support against it? (Architecture exploration,
PR impact analysis, find-symbol-by-intent, etc.)

## ADR + adapter authoring context

Adding a new language adapter follows the pattern established by
ADRs 13 (Pyright), 14 (gopls), 21 (Ruby). The
[`docs/v1_1-INHERITANCE-SUBSTRATE.md`](../../docs/v1_1-INHERITANCE-SUBSTRATE.md)
document captures plan-substrate templates + cross-adapter pattern
artifacts for prospective contributors.

If you intend to contribute the adapter yourself, please indicate
so — that affects prioritization.

## Additional context

Codebases you'd like to test against, comparable tools in the
ecosystem, etc.
