# Contributing to ContextAtlas

Thank you for your interest in ContextAtlas. Contributions are
welcomed under the [MIT License](LICENSE).

This guide covers the contributor onboarding path. By participating
you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting help

- **Bugs / unexpected behavior**: file a [GitHub Issue](https://github.com/traviswye/contextatlas/issues)
  using the **Bug report** template.
- **Feature requests**: file an Issue using the **Feature request** template.
- **Language adapter requests**: file an Issue using the **Language adapter request** template (Rust, Java, .NET, etc.).
- **General questions**: see [SUPPORT.md](SUPPORT.md).
- **Security vulnerabilities**: see [SECURITY.md](SECURITY.md) — do NOT file public issues for vulnerabilities.

## Development setup

Prerequisites:

- Node.js 20 or newer
- A language server for each language you intend to test against:
  - **TypeScript**: `typescript-language-server` (peer dependency; `npm i -D typescript-language-server typescript`)
  - **Python**: Pyright on PATH (peer dependency)
  - **Go**: `gopls` on PATH (`go install golang.org/x/tools/gopls@latest`)
  - **Ruby**: `ruby-lsp` 0.26.x via Bundler (Ruby 3.3+; 4.0+ recommended)

Clone + install:

```sh
git clone https://github.com/traviswye/contextatlas.git
cd contextatlas
npm install
```

## Running tests

```sh
npm test               # full vitest suite
npm run typecheck      # tsc --noEmit
```

The full test suite includes language-adapter integration tests
that spawn the corresponding language servers. Tests that require a
specific language server will fail at suite-level beforeAll if that
server is not installed; this is expected behavior for contributors
focused on a single language's adapter.

## Pull request workflow

1. **File an issue first** for new features or substantive changes
   so we can discuss approach before implementation.
2. **Branch from `main`** using a descriptive name (`fix-ruby-rails-detection`,
   `add-rust-adapter`, etc.).
3. **Write tests** for new behavior. Adjacent test file convention:
   `foo.ts` ↔ `foo.test.ts`. Use Vitest.
4. **Verify locally**:
   - `npm test` passes
   - `npm run typecheck` passes
5. **Open a PR** referencing the issue. Use the PR template; the
   summary should focus on the *why* not just the *what*.
6. **Respond to review** — reviewers may request changes; this is
   normal. Force-push to your branch to update.

### Commit message convention

No strict format required, but please:

- Lead with a concise summary line (≤72 chars)
- Wrap body at ~72 chars
- Explain *why* the change is needed, not just *what* it does
- Reference the issue (`#123`) if applicable

## Contribution areas

Areas where contribution is especially valuable at v1.0:

- **New language adapters** — Rust, Java, .NET, Kotlin, etc.
  See `docs/language-adapter-guide.md` (forthcoming at v0.9.1 Stream B.4)
  for the adapter authoring guide. The `LanguageAdapter` interface
  (`src/types.ts`) is small and stable; adding a new language is a
  self-contained project. Internal discipline patterns + plan-substrate
  templates are at [`docs/v1_1-INHERITANCE-SUBSTRATE.md`](docs/v1_1-INHERITANCE-SUBSTRATE.md)
  for reference.
- **Non-markdown intent sources** — RST, AsciiDoc, JSDoc-rich
  comments, etc. Currently we support markdown ADRs with YAML
  frontmatter.
- **Benchmark repos** — we test on three external repos (hono / httpx
  / cobra). Additional benchmark coverage strengthens the eval.
- **Documentation improvements** — README clarifications, ADR
  amendments (see `docs/adr/` for ADR conventions), guides.

## Architectural Decision Records (ADRs)

ContextAtlas uses ADRs for architectural decisions. They live in
`docs/adr/` with naming convention `ADR-NN-short-title.md` and YAML
frontmatter (see existing ADRs as templates).

For substantive changes (new language adapter, new MCP tool, schema
changes, etc.), an ADR is typically required. Discuss the ADR shape
in the issue thread before authoring; reviewers will guide you to
the right ADR scope.

## Code style

- TypeScript strict mode (`tsconfig.json` `strict: true`)
- Small files (under 300 lines preferred; split when growing)
- Tests adjacent to source (`foo.ts` + `foo.test.ts`)
- Error messages should be actionable (tell the user what went wrong
  and what to do about it)
- Prefer composition over abstraction; two examples is sufficient for
  abstraction to be real

## Questions

Open a GitHub Issue or see [SUPPORT.md](SUPPORT.md).
