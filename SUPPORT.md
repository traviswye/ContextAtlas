# Getting Help with ContextAtlas

This is a small open-source project. Support is best-effort from
the community; please be patient with response times.

## Where to ask

### Bugs and unexpected behavior

[Open a GitHub Issue](https://github.com/traviswye/contextatlas/issues/new/choose)
using the **Bug report** template. Please include:

- ContextAtlas version (`contextatlas --version` or `npm ls contextatlas`)
- Node version (`node --version`)
- OS + version
- Steps to reproduce
- Expected vs actual behavior
- Relevant log output

### Feature requests

[Open a GitHub Issue](https://github.com/traviswye/contextatlas/issues/new/choose)
using the **Feature request** template. Describe the use case
first; concrete proposals are easier to evaluate when the
underlying need is clear.

### Language adapter requests

[Open a GitHub Issue](https://github.com/traviswye/contextatlas/issues/new/choose)
using the **Language adapter request** template. v1.0 ships with
TypeScript / Python / Go / Ruby; Rust / Java / .NET / others are
on the roadmap by demand.

### Security vulnerabilities

See [SECURITY.md](SECURITY.md). **Do NOT file public issues for
security vulnerabilities.**

### General questions

For now, please use GitHub Issues. GitHub Discussions is a v1.1+
consideration (will be enabled if cohort feedback warrants).

## Where to read first

Before asking, the following may answer your question:

- **[README.md](README.md)** — what ContextAtlas is, how to install,
  how to configure
- **[DESIGN.md](DESIGN.md)** — architecture, atlas schema, symbol-ID
  format, config schema
- **[ROADMAP.md](ROADMAP.md)** — what shipped per version + what's
  planned
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — how to contribute
- **`docs/adr/`** — Architectural Decision Records explaining
  design choices

## Running `contextatlas doctor`

If you are hitting setup or configuration issues, run:

```sh
contextatlas doctor
```

The doctor subcommand runs diagnostic checks across config / atlas /
SHA tracking / language servers / extraction / state detection. Its
output identifies common gaps + suggests remediations.

## Response expectations

This is a small project with one maintainer. Response times:

- **Bug reports**: aim for acknowledgment within 1 week
- **Feature requests**: triaged opportunistically; no SLA
- **PRs**: review aim within 1 week; complex PRs may take longer
- **Security reports**: see [SECURITY.md](SECURITY.md) for SLA

If a response is overdue, a polite ping on the issue is welcome.
