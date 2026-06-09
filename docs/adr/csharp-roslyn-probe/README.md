# csharp-roslyn-probe — Phase 0 spike substrate

**Status:** Phase 0 (Roslyn probe spike gate) substrate for v1.1
.NET/C# adapter cycle. Per
[`v1.1-SCOPE.md`](../../cycles/v1_1/v1.1-SCOPE.md) §4 Phase 0 and
v1_1-HANDOFF.md observation 19 + Pattern 6: spike surfaces
empirical endpoint behavior before committing the Ruby-anchored
2-3 week estimate.

**Spike scope (narrower than full Phase 1 probe substrate).** Four
empirical checks before A1/A2 architectural fork adjudication:

1. **Endpoint surface** — does Roslyn LSP surface `documentSymbol`,
   `references`, `hover`, `definition`, `typeDefinition`, and a
   diagnostic channel?
2. **Diagnostic delivery channel** — push (`textDocument/
   publishDiagnostics` notifications) vs pull (`textDocument/
   diagnostic` LSP 3.17 request)?
3. **Symbol-kind taxonomy mapping** — what `SymbolKind` values does
   Roslyn return across C# kinds (class, interface, record, enum,
   static class, method, property, field)? Verify clean mapping or
   surface .NET-specific divergence parallel to Ruby's kind-6-uniform
   discovery.
4. **Project-restore / workspace-setup behavior** — what custom
   notifications + log messages does Roslyn LSP send during init and
   project restore? Drives ADR-22 readiness-pattern decision per
   ADR-18.

## Wrapper-as-vehicle framing (Travis 2026-06-08 adjudication)

The probe spawns a **community wrapper** around Microsoft's
`Microsoft.CodeAnalysis.LanguageServer` (which is not designed as a
standalone LSP — it requires editor-extension orchestration).
**Using a wrapper as probe vehicle does NOT commit us to shipping
against it.** The wrapper is a lens to surface endpoint shape
fastest; the A1/A2 architectural fork (continue with wrapper vs
direct integration handling custom protocol ourselves) is
adjudicated **after** empirical data is in hand.

### Maintenance-tail correction (carry into adjudication)

A1 community-wrapper risk is **NOT parallel to ruby-lsp risk**:

- **ruby-lsp** is Shopify-backed (corporate maintenance commitment;
  funding stability; team continuity).
- **SofusA/csharp-language-server** + **razzmatazz/csharp-language-
  server** are solo-maintainer projects. For a production tool's
  supported install path, a single-maintainer wrapper between us
  and the LSP is a higher abandonment risk than ruby-lsp carries.

A1 stays viable post-spike, but the maintenance tail is priced into
the adjudication. "Faster ship" is not free — if the wrapper goes
unmaintained, ContextAtlas cohort is exposed.

### Backend-team editor-stack input (tilts adjudication)

Travis to provide post-SDK-install:

- **VS Code + C# Dev Kit** — Roslyn LSP binary already ships with
  Dev Kit; A2's install burden partly illusory; A2 real cost narrows
  to custom-protocol code in our `lsp-client.ts`.
- **JetBrains Rider** — Roslyn LSP not in cohort stack; A1 wrapper
  must bring it; A1 looks stronger but maintenance tail bites.

## Wrapper options

Two community wrappers exist (both Roslyn-backed; both wrap the
official `Microsoft.CodeAnalysis.LanguageServer`):

| Wrapper | Maintainer | NuGet / install | Cohort | Default for spike vehicle |
|---|---|---|---|---|
| [razzmatazz/csharp-language-server](https://github.com/razzmatazz/csharp-language-server) | Solo (Saulius Menkevičius) | `dotnet tool install --global csharp-ls` (1.15M+ downloads) | Emacs lsp-mode + non-VSCode editor cohort | ✓ default |
| [SofusA/csharp-language-server](https://github.com/SofusA/csharp-language-server) | Solo (Sofus Albertsen) | `cargo install csharp-language-server` (Rust-based; not dotnet tool) | Helix / Neovim | env-overridable alternative |

Probe defaults to razzmatazz's `csharp-ls` (mature; dotnet-tool
distribution; substantively higher cohort adoption per NuGet download
count). Override via env var `CONTEXTATLAS_CSHARP_LSP_BIN` to test
SofusA's Rust-based wrapper or to spawn Microsoft.CodeAnalysis.
LanguageServer directly.

## Prereqs

1. **.NET SDK** — `.NET 8 LTS` minimum (also targets ADR-22
   §Cohort-version range anchor; Travis to confirm against backend
   repo's actual target version). Install from
   [.NET Download](https://dotnet.microsoft.com/download).
2. **csharp-ls tool** — after SDK install:

   ```sh
   dotnet tool install --global csharp-ls
   ```

   Verify install location:

   ```sh
   csharp-ls --version
   ```

   On Windows: typically `%USERPROFILE%\.dotnet\tools\csharp-ls.exe`.
   Should be on PATH after global tool install. No `.bat` shim issue
   parallel to Ruby's `bundle.bat`.

## Re-run pattern

From repo root:

```sh
npx tsx docs/adr/csharp-roslyn-probe/csharp-roslyn-probe.ts
```

Findings overwrite
`docs/adr/csharp-roslyn-probe/findings-baseline.md` in-place. Prior
captures preserved in git history.

**Override binary path** (test alternative wrappers or direct
Microsoft.CodeAnalysis.LanguageServer):

```sh
CONTEXTATLAS_CSHARP_LSP_BIN=path/to/csharp-language-server \
  npx tsx docs/adr/csharp-roslyn-probe/csharp-roslyn-probe.ts
```

**Override fixture root** (re-run against a real C# project for
Pattern 5 first-execution-at-canonical-repo verification):

```sh
CONTEXTATLAS_PROBE_ROOT=path/to/real/csharp/project \
  npx tsx docs/adr/csharp-roslyn-probe/csharp-roslyn-probe.ts
```

## K-2-ii consolidated archival pattern

Following Ruby v0.9 Substep 4.2 precedent. Probe script + findings
file + this README archive at
`docs/adr/csharp-roslyn-probe/` rather than at `scripts/` (the
Pyright + gopls flat-precedent). Substantively-complex adapter
probe substrate keeps cohesion at subdirectory.

## Post-spike adjudication substrate

Once probe runs empirically against the wrapper, this README
extends with:

- Phase 1 entry adjudication (revise estimate band; lock or revise
  2-3 week Ruby-anchored figure)
- A1 vs A2 fork lock (with wrapper-maintenance-tail factored)
- ADR-22 outline informed by empirical findings

## Cross-references

- [`v1.1-SCOPE.md`](../../cycles/v1_1/v1.1-SCOPE.md) — v1.1 cycle
  scope (.NET adapter sole-focus); Phase 0 entry point
- [`v1_1-HANDOFF.md`](../../../v1_1-HANDOFF.md) — observation 19 +
  Pattern 6 (cross-role verification at measurement-substrate
  entry); Patterns 1-7 + 5a/5b sub-decomp
- [`ADR-21`](../ADR-21-ruby-adapter-ruby-lsp.md) — Ruby adapter
  precedent (most-recent template; 5 amendments; pull-model
  diagnostic; kind-6-uniform; dual-pattern install)
- [`ADR-13`](../ADR-13-python-adapter-pyright.md) +
  [`ADR-14`](../ADR-14-go-adapter-gopls.md) — earlier adapter
  precedents
- [`ruby-lsp-probe/`](../ruby-lsp-probe/) — Ruby probe substrate
  archive (K-2-ii precedent reference)
