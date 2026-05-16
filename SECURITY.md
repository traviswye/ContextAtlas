# Security Policy

## Supported versions

ContextAtlas follows [Semantic Versioning](https://semver.org/).
Security fixes are issued for the current major version line.

| Version | Supported |
|---------|-----------|
| v1.0.x  | ✅ Yes    |
| < v1.0  | ❌ No (pre-1.0 development releases; please upgrade) |

## Reporting a vulnerability

If you discover a security vulnerability in ContextAtlas, please
report it privately. **Do NOT file a public GitHub issue for
security vulnerabilities.**

**Contact:** traviswye@blueflip.net

Please include:

- A description of the vulnerability
- Steps to reproduce (if applicable)
- The version affected
- Any mitigations or workarounds you have identified
- Whether you would like attribution in a security advisory

## Response timeline

- **Acknowledgment**: within 1 week of report receipt
- **Initial investigation**: within 30 days of report receipt

For critical severity issues, response may be faster. ContextAtlas
is a small project; we will be honest about our capacity to address
reports promptly.

## Disclosure

We follow coordinated disclosure. Once a fix is available, we will:

1. Release a patched version
2. Publish a GitHub Security Advisory describing the issue
3. Credit the reporter (unless attribution is declined)

For non-critical issues, we may bundle the fix into the next regular
release rather than issuing a dedicated patch.

## Scope

This policy covers vulnerabilities in:

- The ContextAtlas npm package (`contextatlas`)
- The MCP server it provides
- The CLI subcommands it exposes

It does NOT cover:

- Vulnerabilities in language servers ContextAtlas spawns
  (typescript-language-server, Pyright, gopls, ruby-lsp) — report
  those to the respective upstream projects
- Vulnerabilities in npm dependencies — report those to the
  respective package maintainers (we will track and update affected
  dependencies in our own release notes)
- Issues in benchmark target repositories (hono / httpx / cobra)
- Issues in the separate ContextAtlas-benchmarks repository
