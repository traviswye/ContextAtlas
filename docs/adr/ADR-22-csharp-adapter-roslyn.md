---
id: ADR-22
title: C# adapter uses csharp-ls wrapper around Microsoft.CodeAnalysis.LanguageServer; pull-model diagnostics
status: accepted
severity: hard
symbols:
  - CsharpAdapter
  - LanguageAdapter
  - TypeInfo
---

# ADR-22: C# adapter uses csharp-ls wrapper around Microsoft.CodeAnalysis.LanguageServer; pull-model diagnostics

> **Frontmatter symbols note.** `LanguageAdapter` and `TypeInfo` exist
> in [`src/types.ts`](../../src/types.ts) today. `CsharpAdapter` does
> NOT exist yet — it is committed to land in the implementation commit
> that follows this ADR. Extraction runs between this commit and the
> implementation commit will report `CsharpAdapter` as an unresolved
> frontmatter hint. Same pattern as ADR-13 (`PyrightAdapter`) and
> ADR-21 (`RubyAdapter`) before their respective implementation
> commits landed.

## Context

v1.1.0 ships a C#/.NET language adapter at language-parity with
TypeScript / Python / Go / Ruby — the 5th supported language.
[ADR-03](ADR-03-language-adapter-plugin.md) names a C# LSP as future
adapter scope; [ADR-07](ADR-07-type-info-adapter-capability.md)
requires every adapter — C# included — to implement `getTypeInfo`
with the same `{ extends, implements, usedByTypes }` contract.

Cohort representation: .NET is a substantively-represented enterprise
production stack. v1.1.0's adapter expansion targets the dominant
typed-language gap in v1.0's TypeScript / Python / Go / Ruby scope.
The typing-spectrum framing from v0.1 places C# at the
statically-typed end alongside Go and TypeScript-with-strict-mode;
Roslyn's type-substrate richness makes `getTypeInfo` cleaner than
the dynamic-language adapters' declaration-parse fallback patterns.

Per the cycle-precedent gate, a Phase 0 probe spike ran against
**csharp-ls 0.24.0.0** (wrapping Microsoft.CodeAnalysis.LanguageServer)
against .NET SDK 10.0.203 before this ADR — empirical findings live
in [`docs/adr/csharp-roslyn-probe/findings-baseline.md`](csharp-roslyn-probe/findings-baseline.md).
Decisions below cite probe findings explicitly with empirical-vs-
cited sources marked.

The probe surfaced five substantive load-bearing findings:

1. **Endpoint surface is clean and complete.** `documentSymbol` /
   `references` / `hover` / `definition` / `typeDefinition` /
   diagnostic all surface clean LSP-spec responses. Roslyn also
   advertises `implementationProvider`, `typeHierarchyProvider`,
   `callHierarchyProvider`, `workspaceSymbolProvider`,
   `semanticTokensProvider`, `inlayHintProvider` — substantially
   richer than ruby-lsp's surface.
2. **Diagnostics use LSP 3.17 pull-model**, not push-model. Roslyn
   advertises `diagnosticProvider: { interFileDependencies: false,
   workspaceDiagnostics: true }` and does NOT emit
   `textDocument/publishDiagnostics` notifications. Adapter MUST use
   `textDocument/diagnostic` REQUEST. Net-new substrate parallel to
   ADR-21 (Ruby); diverges from ADR-13 (Pyright) + ADR-14 (gopls)
   push-model.
3. **Hover surfaces XML doc summaries + parameter descriptions** out
   of the box — closer to gopls pattern (ADR-14) than Pyright pattern
   (ADR-13) for the `getDocstring` path. No prose-extraction
   gymnastics needed; csharp-ls hands back markdown with code-block
   signature + summary text + parameter list.
4. **csharp-ls absorbs Roslyn's custom protocol entirely.** Zero
   custom notifications surfaced during probe init + warmup; zero
   `$/progress` events. Wrapper presents a clean LSP-spec interface
   to the client; ContextAtlas's LSP client does NOT need to handle
   Roslyn-specific project-restore signaling or solution-open
   custom notifications. The wrapper handles `.sln` / `.csproj`
   auto-discovery + MSBuild SDK registration internally.
5. **Symbol-kind taxonomy maps cleanly to LSP standard.** No .NET-
   specific divergence parallel to Ruby's kind-6-uniform discovery.
   Records map to `SymbolKind.Class` (5) — LSP spec has no dedicated
   record kind; Roslyn pragmatic mapping. No edge-case discovery
   required.

## Decision

### csharp-ls 0.24.x as cohort install vehicle

**csharp-ls 0.24.0** (or any 0.24.x patch) is the wrapper-as-cohort-
install path. csharp-ls is a [F#-based LSP wrapper](https://github.com/razzmatazz/csharp-language-server)
by Saulius Menkevičius distributed via NuGet
(`dotnet tool install --global csharp-ls`; 1.15M+ downloads as of
2026-06). The wrapper downloads + manages Microsoft.CodeAnalysis.
LanguageServer (the official Roslyn LSP) under the hood and presents
a clean LSP-spec interface to clients.

```sh
dotnet tool install --global csharp-ls
csharp-ls --version
# Expected: csharp-ls, 0.24.x
```

**Wrapper-as-substrate rationale (Phase 0 spike adjudication; Option
A1 path):** Microsoft.CodeAnalysis.LanguageServer is not designed as
a standalone LSP — it requires editor-extension orchestration for
project-restore signaling, .sln / .csproj awareness, and custom
notifications. csharp-ls fills that orchestration gap. ContextAtlas
sees clean LSP-spec endpoints rather than Roslyn's hybrid protocol.

The A2 alternative — direct Microsoft.CodeAnalysis.LanguageServer
integration handling custom protocol in `lsp-client.ts` — adds 2-3
weeks of substrate work for marginal upside given csharp-ls's
production cohort adoption. A2 remains an explicit fallback path
documented in §Limitations.

**Maintenance-tail acknowledgment.** csharp-ls is solo-maintained by
Saulius Menkevičius (single-maintainer project, NOT corporate-backed
like ruby-lsp's Shopify backing). Three mitigations preserve cohort
safety:

1. **A2 fallback path documented.** If csharp-ls becomes unmaintained
   at v1.2+, ContextAtlas ships a Roslyn-direct adapter without
   architectural rewrite — custom-protocol substrate becomes adapter-
   internal rather than wrapper-delegated.
2. **Doctor staleness signal.** v1.1.x adds a doctor check that
   warns when csharp-ls release age exceeds 12 months (cohort
   maintenance-staleness early-warning).
3. **Minimum-version pin + major-version block.** Adapter pins
   `csharp-ls` to a minimum version range; allows cohort flexibility
   for newer patches but blocks on majors until adapter-side
   validation runs against the new substrate.

### Single-pattern install (dotnet tool global)

Unlike Ruby's dual-pattern (gem + bundler), C# has one canonical
install pattern: dotnet tool global install via NuGet. csharp-ls is
distributed as a `dotnet tool` package; the binary lands at
`%USERPROFILE%\.dotnet\tools\csharp-ls.exe` (Windows) or
`$HOME/.dotnet/tools/csharp-ls` (Linux/macOS) as a real executable
(not a shim — no CVE-2024-27980 .bat-spawn issue parallel to Ruby's
bundle.bat workaround).

**Spawn pattern.** Adapter spawns `csharp-ls` directly:

```typescript
this.client.start("csharp-ls", [], this.repoRoot);
```

No shell wrapping. No bundler equivalent. Cohort experience:
single-step install, single-step verification.

### LSP primitive mappings (empirical, per probe findings)

Probe execution against csharp-ls 0.24.0.0 + .NET SDK 10.0.203 at
v1.1.0 Phase 0 (2026-06-08). Differences from Ruby / Pyright / gopls
are called out per §.

| Capability | Roslyn (via csharp-ls) behavior | Adapter response | Probe § |
|---|---|---|---|
| `textDocument/documentSymbol` | Hierarchical via `hierarchicalDocumentSymbolSupport: true` request shape. Returns full tree (File kind 1 → Namespace kind 3 → Class/Record kind 5 → Method kind 6 / Property kind 7 / Field kind 8). `detail` field surfaces rich type signatures (`void Broken.DoSomething(string arg)`, `int User.PremiumTierLimit`, `Task User.SendWelcomeEmailAsync()`). Works even on parse-error files via partial-parse recovery. | Used as-is. Adapter kind-mapping per §Symbol-kind mapping below. No special-case handling required parallel to Ruby's `self.` prefix preservation. | Probe #1 |
| `textDocument/references` | Works cross-file for all symbol kinds. Returns LSP `Location[]` with `uri` + `range`. No URL-encoding duplication issue parallel to Ruby's Windows-specific path-doubling. | Used as-is. Standard ContextAtlas Reference shape mapping. | Probe #2 |
| `textDocument/definition` | Works cross-file using LSP `Location` shape (`uri` + `range`). Resolves type references, method references, static method references across files. Same cleanliness as Pyright / gopls. | Used as-is. | Probe #4 |
| `textDocument/typeDefinition` | **Advertised in capabilities AND functional.** Returns the type-declaration location for typed variables (e.g., `User? user` → `Models/User.cs:7` User record declaration). Major divergence from Ruby (`typeDefinition` not advertised; hangs) and Python (Pyright Protocol-ABC needs declaration-parse fallback). | Used directly for `getTypeInfo.extends` resolution. NO declaration-parse fallback needed — substantively cleaner than Pyright (ADR-13) and Ruby (ADR-21). | Probe #5 |
| `textDocument/implementation` | **Advertised in capabilities AND functional.** Returns implementer locations for interface members; class-derived locations for virtual methods. Same cleanliness as gopls (ADR-14). | Used directly for `getTypeInfo.usedByTypes` resolution. NO declaration-parse fallback needed. | Capability advertised; full empirical probe extends at Phase 1 substep 2 |
| `textDocument/hover` | Returns markdown with `kind: "markdown"` envelope containing fenced code-block signature + XML doc summary text + parameter descriptions (when `<param>` tags present in source). For methods/properties without XML docs: returns just the signature code block. Closer to gopls pattern (rich content) than Pyright pattern (signature-only). | Used for `getSymbolDetails` and `getDocstring`. Adapter strips the code-fence wrapper for `signature`; takes the post-code-fence prose for `docstring`. | Probe #3 |
| `textDocument/diagnostic` (PULL) | **LSP 3.17 pull-model.** Roslyn advertises `diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: true }`. Returns `DocumentDiagnosticReport` with `kind: "full"` + Roslyn-substrate items (CS#### error codes + ranges + severity + `codeDescription.href` URIs linking to Microsoft docs). Push-model `publishDiagnostics` count: **0** (Roslyn does NOT use this channel). | **Adapter MUST use pull-model request** (`textDocument/diagnostic`), NOT publishDiagnostics. Parallel to ADR-21 (Ruby) pull-model; diverges from ADR-13 (Pyright) + ADR-14 (gopls) push-model. | Probe #6 |
| Workspace warmup | No `$/progress` cold-start signal (empty in probe). Pyright-pattern; closer to ADR-21 Ruby baseline. | Adapter `initialize()` does NOT call `waitForServerReady` (gopls pattern in ADR-18); falls through to per-call diagnostic ceiling. | Probe boot |

**Capabilities Roslyn (via csharp-ls) advertises but adapter does NOT
consume at v1.1.0** (future arc candidates):

- `workspaceSymbolProvider: true` — project-wide symbol search
- `typeHierarchyProvider: true` — class hierarchy navigation; future
  `getTypeInfo` enhancement candidate
- `callHierarchyProvider: true` — caller/callee navigation; future
  `impact_of_change` enhancement candidate
- `semanticTokensProvider` (20 token types + `static` modifier) —
  syntax highlighting; not in adapter contract
- `inlayHintProvider: { resolveProvider: false }` — UI hint surface;
  not in adapter contract
- `codeActionProvider`, `codeLensProvider`, `renameProvider`,
  `foldingRangeProvider`, `documentFormattingProvider`,
  `documentOnTypeFormattingProvider` — editor surfaces; not in
  adapter contract
- `signatureHelpProvider` — completion-time signature display; not
  in adapter contract

### Symbol-kind mapping (matches [ADR-01](ADR-01-symbol-id-format.md) taxonomy)

| C# construct | Roslyn kind | Adapter kind | How detected |
|---|---:|---|---|
| File (top-level wrapper) | 1 | (skipped) | LSP kind 1. Adapter walks `children` and starts at the namespace level. |
| Namespace | 3 | `namespace` | LSP kind 3. Both `namespace CsharpProbe;` (file-scoped) and `namespace { ... }` (block-scoped) forms emit kind 3. |
| Class | 5 | `class` | LSP kind 5 inside a namespace. |
| Record | 5 | `class` | LSP kind 5. **LSP spec has no dedicated record kind**; Roslyn pragmatic mapping to Class. Adapter accepts this representation — record's distinguishing features (positional parameters, `init`-setters, value-equality) are not load-bearing for the LanguageAdapter contract. Future v1.x candidate to add `record` to the adapter's `SymbolKind` enum if downstream consumers need the distinction. |
| Struct | 23 | `class` | LSP kind 23 (Struct). Adapter maps to `class` for the LanguageAdapter contract; struct's distinguishing features (value type, `readonly` modifier, layout) not load-bearing at v1.1.0. |
| Interface | 11 | `interface` | LSP kind 11. |
| Method | 6 | `method` | LSP kind 6 inside class/interface/struct body. C# has functions-vs-methods distinction at the language level (static vs instance) but ALL callable members emit LSP kind 6 (no kind-12 divergence parallel to Ruby's class-method pattern). |
| Constructor | 9 | `method` | LSP kind 9 (Constructor). Adapter maps to `method` parallel to Pyright/gopls/Ruby; constructor's distinguishing features (no return type, name == class name) not load-bearing. |
| Property | 7 | `property` | LSP kind 7. C# property syntax (`{ get; init; }`, `{ get; set; }`, expression-bodied) all emit kind 7. |
| Const field | 8 | `variable` | LSP kind 8 (Field). ContextAtlas's reduced SymbolKind has no `constant` (matches ADR-14 gopls iota-const + ADR-21 Ruby constant handling); `variable` is the closest fit. |
| Field | 8 | `variable` | LSP kind 8. |
| Enum | 10 | `enum` | LSP kind 10. |
| Enum member | 22 | `variable` | LSP kind 22 (EnumMember). Maps to `variable` parallel to Ruby/Python enum-member handling. |
| Event | 24 | `method` | LSP kind 24 (Event). Events are method-like delegate invocations; map to `method` for adapter contract. |
| Delegate | 5 | `class` | LSP kind 5 (Class). Delegate's distinguishing features (function-pointer type) not load-bearing at adapter contract level. |

**Decorator policy.** C# uses attributes (`[Attribute]`) which apply
to symbols but do NOT introduce new symbols. Roslyn does not surface
attributes as documentSymbol entries (parallel to Python's
`@decorator` handling in ADR-13). Adapter accepts this; downstream
consumers query the attributed symbol directly.

**Functions-vs-methods uniformity.** C# has no top-level functions
outside class/namespace context (file-scoped programs synthesize a
`<Program>$<Main>$` class wrapper; top-level statements emit as
methods of that synthesized class). All callable members emit LSP
kind 6 inside their enclosing type. No kind-12-uniform divergence
parallel to Ruby's class-method discovery; no `self.`-prefix
preservation needed.

### Diagnostics via PULL model (LSP 3.17)

`textDocument/diagnostic` is a request, not a notification. The
adapter constructs a request like:

```typescript
const result = await client.request<DocumentDiagnosticReport>(
  "textDocument/diagnostic",
  { textDocument: { uri: toFileUri(absPath) } },
  timeoutMs,
);
```

The response shape per LSP 3.17:

```typescript
type DocumentDiagnosticReport =
  | { kind: "full"; items: Diagnostic[]; resultId?: string }
  | { kind: "unchanged"; resultId: string };
```

Adapter handles both. The `unchanged` variant is an optimization
Roslyn uses when file diagnostics haven't changed since the caller's
last `resultId`-tagged query; adapter passes the prior resultId on
subsequent calls (or omits, accepting potential re-emit).

**Diagnostic substrate richness.** Roslyn diagnostics include
substantively more substrate than Pyright/gopls:

- `code` — Roslyn error code (CS####); e.g., `CS1026`, `CS1002`,
  `CS0501`
- `codeDescription.href` — URI linking to Microsoft documentation
  page for the error code
- `source: "lsp"` — substrate provenance marker
- `severity` — LSP severity enum (1 = Error, 2 = Warning, 3 = Info,
  4 = Hint)
- `range` — precise character-level span

ContextAtlas consumes the standard LSP Diagnostic shape; the extra
substrate (error codes, docs URIs) is preserved in adapter responses
for future enrichment passes.

**Per-call ceiling per ADR-18.** No cold-start `waitForServerReady`
race — Roslyn doesn't emit `$/progress` BEGIN/END frames per Phase 0
spike. Per-call diagnostic ceiling at 1500ms (matching gopls's
post-cold-start ceiling; cold-start variance folded into per-call
budget).

### `getTypeInfo` — native LSP endpoints (no declaration-parse fallback)

Major divergence from ADR-13 (Pyright declaration-parse fallback for
Protocol/ABC resolution) and ADR-21 (Ruby declaration-parse fallback
for class hierarchies because typeDefinition/implementation
unavailable). **Roslyn supports both endpoints natively:**

- `getTypeInfo.extends` ← `textDocument/typeDefinition` query at the
  symbol position; returns the type-declaration location; adapter
  reads the target file's symbol name from documentSymbol cache.
- `getTypeInfo.implements` ← parse `: BaseType, IInterface1,
  IInterface2` from the class/struct declaration source line (single
  pass; same precedent as ADR-14 gopls `:` parsing for `type X struct
  { ... }` embeds, but applies to inheritance + interface lists).
- `getTypeInfo.usedByTypes` ← `textDocument/implementation` query
  at the interface/class position; returns implementer locations;
  adapter reads target files' symbol names from documentSymbol cache.

**Adapter implementation simplicity:** because Roslyn provides
typeDefinition + implementation natively, `getTypeInfo` requires:
- 2 LSP calls (typeDefinition + implementation)
- 1 declaration-line parse for `implements` list
- 0 pass-1 inventory walks (parallel to Pyright's Protocol cache;
  not needed for C#)

The declaration-line parse for `implements` is narrow: locate the
class/interface declaration via documentSymbol.selectionRange,
read the declaration line, parse the post-colon `:` portion for
comma-separated base + interface references. Strip whitespace +
generic-type parameters (`<T>`) for the symbol-name level (full
generic types preserved in the source).

### Windows PATH-enrichment for dotnet tools

**Empirical Phase 0 finding (2026-06-08).** Bash on Windows
(Git-Bash) does NOT have `%USERPROFILE%\.dotnet\tools` on PATH; only
PowerShell does (configured by SDK installer for PowerShell only).
When a Node process is spawned from Bash and tries to `spawn
csharp-ls`, the call fails with `Error: spawn csharp-ls ENOENT`.

Pattern parallel to:
- ADR-21 `RUBY_BIN_DIRS` workaround (Windows install)
- ADR-14 gopls "Go binary must be on PATH" finding

**Adapter substrate.** `CsharpAdapter.start()` enriches PATH before
spawning csharp-ls:

```typescript
private enrichPathForDotnetTools(): void {
  const toolDirs = [
    process.env.USERPROFILE
      ? `${process.env.USERPROFILE}\\.dotnet\\tools`
      : null,
    process.env.HOME
      ? `${process.env.HOME}/.dotnet/tools`
      : null,
  ].filter((d): d is string => d !== null);
  if (toolDirs.length === 0) return;
  const sep = process.platform === "win32" ? ";" : ":";
  process.env.PATH = [...toolDirs, process.env.PATH ?? ""]
    .filter(Boolean)
    .join(sep);
}
```

**Doctor preflight check** (Substep 5.2). Doctor C# environment
surface verifies:
- `dotnet --version` returns 10.x (cohort-version anchor)
- `csharp-ls` is findable on PATH (after enrichment)
- `.dotnet/tools/csharp-ls(.exe)` exists on filesystem (Pattern 7
  axis 2 — empirical-verification-before-claim)
- `csharp-ls --version` returns 0.24.x or compatible

### Project-system awareness (.sln / .csproj)

csharp-ls handles project-system discovery internally:

1. Looks for `.sln` / `.slnx` files at workspace root
2. If none, looks for `.csproj` / `.fsproj` files at workspace root
3. Loads via MSBuildLocator + MSBuild registered SDK
4. Resolves TargetFramework from project file (e.g., `net10.0`)

**Adapter implication:** no `.sln` / `.csproj` parsing in
ContextAtlas. Adapter passes the repo root as workspace folder;
csharp-ls + Roslyn handle the rest. Multi-project solutions
(parallel to apis repo's 10-project solution) load via the
solution-discovery path.

**Cohort-realistic workspace shapes:**

- Single .csproj (class library, simple console app) — auto-discovered
- Multi-project .sln with shared / api / lib projects — solution-loaded
- .slnx (newer XML solution format) — same path
- Mixed C# + F# solution — csharp-ls loads C# projects; F# projects
  not in adapter scope at v1.1.0

## Rationale

### Why csharp-ls wrapper over direct Microsoft.CodeAnalysis.LanguageServer

Microsoft.CodeAnalysis.LanguageServer is the Microsoft-distributed
Roslyn LSP server, but it is not designed as a standalone LSP. It
expects editor-extension orchestration:

- Custom protocol notifications for project-restore signaling
- `.sln` / `.slnx` / `.csproj` resolution via custom "open" calls
- NuGet restore lifecycle management
- Workspace-setup error handling

ContextAtlas's `lsp-client.ts` implements standard LSP-spec
framing — JSON-RPC over stdio, request/response correlation,
notification handlers, server-initiated request stubbing. Adding
Roslyn custom-protocol substrate would expand the LSP client beyond
its current 150-line surface area into Roslyn-specific complexity
that would diverge from the other 4 adapters' clean LSP-spec
patterns.

csharp-ls fills the orchestration gap. ContextAtlas sees clean
LSP-spec endpoints. Phase 0 spike empirically confirmed: zero custom
notifications surfaced; zero project-restore signaling leaked
through.

**Why razzmatazz/csharp-language-server (csharp-ls) over alternative
wrappers:**

- **SofusA/csharp-language-server** — Rust-based wrapper distributed
  via cargo. Higher friction for .NET cohort (requires Rust toolchain
  install). Smaller cohort adoption.
- **OmniSharp (legacy LSP-shim)** — pre-Roslyn-LSP era; deprecated by
  Microsoft in favor of Roslyn LSP. Out of scope.
- **csharp-ls** — dotnet tool install pattern (zero extra toolchain);
  1.15M+ NuGet downloads; matches cohort distribution channel.

### Why pull-model diagnostic (not push-model)

Per Phase 0 spike empirical evidence: Roslyn advertises
`diagnosticProvider` and returns 3 diagnostics for Broken.cs via
pull request, but emits 0 publishDiagnostics notifications. The push
channel is simply not used by Roslyn LSP. Adapter aligns with
substrate.

Parallel to ADR-21 (Ruby) pull-model adoption; diverges from ADR-13
(Pyright) and ADR-14 (gopls) push-model. Two of five v1.1.0 adapters
now use pull; LspClient supports both patterns transparently per
ADR-18 readiness-pattern decision.

### Why no declaration-parse fallback for getTypeInfo

Roslyn provides `textDocument/typeDefinition` + `textDocument/
implementation` natively. ADR-13 (Pyright) needed declaration-parse
fallback because Pyright doesn't surface Protocol/ABC relationships
cleanly via typeDefinition; ADR-21 (Ruby) needed declaration-parse
fallback because ruby-lsp does not advertise typeDefinition or
implementation capabilities at all.

For C#, the LSP endpoints work. Adapter implementation is
substantively simpler — 2 LSP calls + 1 declaration-line parse vs
Pyright's pass-1 Protocol cache + pass-2 Protocol-detection.

### Why net10.0 cohort-version anchor

Cohort developer baseline at v1.1.0:
- Travis backend repo (apis): targets net10.0; SDK pinned to 10.0.203
- Travis mobile repo (mobileapp): .NET MAUI multi-targeting net10.0-
  android + net10.0-ios; SDK pinned to 10.0.203
- Industry: .NET 10 GA shipped November 2025; current LTS at v1.1.0
  ship time

Older .NET 8 LTS cohort users supported via signal-warn doctor
pattern (parallel to Ruby 3.3 → 4.0.3 cohort-version handling at
ADR-21 §Cohort-version range). Adapter functions against .NET 8.0+
SDKs (csharp-ls 0.24.x supports back through .NET 6.0); doctor
surfaces "running against older .NET; consider upgrading to .NET 10
LTS" message rather than blocking.

## Consequences

### Positive

- **Cleaner adapter implementation than ADR-13 (Pyright) or ADR-21
  (Ruby).** Native typeDefinition + implementation eliminate
  declaration-parse fallback complexity. ADR-22 amendment frequency
  expected at 0-2 (Pyright/gopls precedent), not 5 (Ruby precedent).
- **Rich hover substrate.** XML doc comments + parameter descriptions
  surface in `getDocstring` without extra parsing.
- **Project-system handled by wrapper.** csharp-ls absorbs `.sln` /
  `.csproj` resolution + MSBuild SDK registration; adapter doesn't
  need to.
- **Diagnostic substrate richness.** Roslyn provides CS error codes
  + Microsoft docs URIs in addition to LSP-standard diagnostic fields.
- **Two cohort repos benefit.** Both apis (814 .cs files) + mobileapp
  (5,274 .cs files) immediately atlas-extractable with .NET adapter
  ship.

### Negative

- **Solo-maintainer wrapper dependency.** csharp-ls is single-
  maintainer (Saulius Menkevičius); NOT corporate-backed parallel
  to ruby-lsp (Shopify). Three mitigations land at v1.1.x: A2
  fallback path documentation; doctor staleness signal; minimum-
  version pin + major-version block.
- **No `$/progress` cold-start signal.** Per-call ceiling pattern
  required parallel to Pyright/Ruby (gopls's clean BEGIN/END
  pattern not available).
- **No dedicated SymbolKind for records.** Records map to class
  kind=5; the record's distinguishing semantics (positional
  parameters, init-setters, value-equality) not load-bearing for
  v1.1.0 LanguageAdapter contract but worth documenting for future
  v1.x consumer needs.
- **Cohort developers on .NET 8 LTS may see older-version warning**
  per signal-warn doctor pattern.

### Neutral

- **Atlas extraction scale.** mobileapp at 5,274 .cs files is
  substantially larger than any prior benchmark fixture (hono 186,
  httpx 23, cobra 19). Phase 5 Pattern 5 first-execution-at-
  canonical-repo verification confirms behavior at scale; v1.1.x
  candidate for incremental-extraction performance refinement if
  needed.
- **Multi-targeting projects** (apps that target both net10.0-
  android + net10.0-ios in one .csproj) — csharp-ls handles per its
  internal MSBuild resolution; adapter does not see the multi-
  targeting at LSP layer.

## Install Pattern

### Toolchain (linear punch list — doctor-substrate)

| Step | Command | Doctor check |
|---|---|---|
| 1. Install .NET SDK | Download SDK 10.0.x from [dotnet.microsoft.com/download](https://dotnet.microsoft.com/download) | `dotnet --version` returns 10.x |
| 2. Install csharp-ls | `dotnet tool install --global csharp-ls` | `csharp-ls --version` returns 0.24.x; binary findable on PATH (Windows: `%USERPROFILE%\.dotnet\tools\csharp-ls.exe`) |
| 3. Verify PATH | (Windows-specific) Bash/Git-Bash needs `%USERPROFILE%\.dotnet\tools` on PATH; PowerShell has it auto-configured | Adapter's `enrichPathForDotnetTools()` runs unconditionally at start; doctor verifies post-enrichment findability |
| 4. Workspace project files | Either `.sln` / `.slnx` / `.csproj` at workspace root | csharp-ls auto-discovers; doctor reports detected project files |

### Cohort-version support range

**Primary support:** .NET 10 SDK (10.0.x). LTS through November 2028.
Matches Travis cohort repos (apis + mobileapp).

**Best-effort support:** .NET 8 LTS SDK (8.0.x) and .NET 9 SDK
(9.0.x). csharp-ls 0.24.x supports back through .NET 6.0. Doctor
warns when running against older SDK with substantive remediation
text ("consider upgrading to .NET 10 LTS").

**Out of scope:** .NET Framework 4.x (Windows-only legacy runtime;
not Roslyn-LSP-compatible). .NET Core 3.x and earlier (out-of-
support). Mono / Xamarin classic (pre-MAUI; out-of-support).

### Multi-targeting projects

`.csproj` with `<TargetFrameworks>net10.0-android;net10.0-ios</TargetFrameworks>`
(plural; MAUI cross-platform pattern) loads via csharp-ls's MSBuild
resolution. Adapter sees the project's symbols per platform-
conditional `#if ANDROID` / `#if IOS` regions resolved per csharp-ls's
choice of primary target.

**Limitation:** Symbols inside platform-conditional regions may surface
only for csharp-ls's chosen target framework. Documented Limitation at
§Multi-targeting-conditional-symbol-visibility below.

## Limitations

### csharp-ls solo-maintainer abandonment risk

**Surfaced:** csharp-ls is solo-maintained by Saulius Menkevičius.
Not corporate-backed parallel to ruby-lsp (Shopify). Risk: project
unmaintenance leaves ContextAtlas .NET adapter with broken substrate
at csharp-ls's last working state.

**Mitigation:**
1. A2 fallback path documented (Roslyn-direct adapter at v1.2+
   without architectural rewrite).
2. Doctor staleness signal — warn when csharp-ls release age exceeds
   12 months.
3. Minimum-version pin + major-version block — adapter accepts
   `csharp-ls >= 0.24.0, < 1.0.0`; major version requires adapter-
   side validation.

**Telemetry not in scope** (per [ADR-20](ADR-20-cohort-observability-contract.md)
consent contract). v1.1.x candidate: if cohort feedback surfaces
csharp-ls abandonment, accelerate A2 path implementation.

### No `$/progress` cold-start signal

**Surfaced:** Phase 0 probe empirical — Roslyn (via csharp-ls) emits
zero `$/progress` events during init + warmup.

**Mitigation:** Per-call diagnostic ceiling at 1500ms per ADR-18
Pyright-pattern. Cold-start variance folded into per-call budget;
no `waitForServerReady` race.

### Multi-targeting conditional symbol visibility

**Surfaced:** documentation citation (csharp-ls handles multi-
targeting via MSBuild's primary-target resolution).

**Behavior:** Symbols inside `#if ANDROID` / `#if IOS` /
`#if !NET10_0` conditional regions may surface only for the chosen
target framework. Multi-targeting projects (e.g., MAUI mobileapp
.csproj with `net10.0-android;net10.0-ios`) need empirical
verification at Phase 5 Pattern 5 first-execution-at-canonical-repo.

**Empirical verification candidate** at v1.1.x: dogfood against
mobileapp's actual cross-target codebase; surface to v1.2+ if
conditional-symbol-visibility gap is substantive.

### Records map to class kind (no dedicated record kind)

**Surfaced:** Phase 0 probe — `record User(...)` emits LSP
SymbolKind.Class (5).

**Behavior:** Adapter maps to `class`. Distinguishing record semantics
(positional parameters, `init`-setters, value-equality, deconstruction)
not surfaced as separate symbol kinds. Downstream consumers needing
the distinction would query the symbol's signature/source.

**v1.2+ candidate:** Add `record` to ContextAtlas SymbolKind enum if
downstream consumer needs surface. Currently no consumer dependency.

### Generic-type parameter handling

**Behavior:** `class Repository<TEntity>` surfaces as documentSymbol
entry with `name: "Repository<TEntity>"`. Adapter symbol-ID uses the
generic-stripped name (`Repository`) for canonical identity; full
signature in the `detail` field. Cross-references between `Repository
<User>` and `Repository<Post>` both resolve to the same generic class
declaration.

**Limitation:** specific generic instantiations not distinguished at
symbol-ID level (single `Repository` symbol, not separate `Repository
_User_` / `Repository_Post_`). Matches ADR-14 gopls generic-handling
precedent.

### Attribute-decorated symbols don't surface attributes as children

**Behavior:** `[HttpGet("/users")]` on a method surfaces the method as
documentSymbol entry; the attribute is NOT a separate symbol.

**Parallel to:** ADR-13 Python `@decorator` handling; ADR-14 gopls
build-tag handling.

**Adapter response:** the method's full signature in `detail` field
preserves the attribute prefix in some Roslyn responses; downstream
consumers can query the attributed symbol directly.

### Partial classes split across files

**Behavior:** `partial class Service` declared in `Service.cs` +
`Service.generated.cs` surfaces as separate documentSymbol entries
per file. Adapter atlas extraction may produce two symbol records
sharing the same fully-qualified name; symbol-resolution layer
deduplicates per ADR-01 symbol-ID canonical-path field.

**Limitation candidate:** if cohort feedback surfaces partial-class
duplication confusion at the MCP retrieval layer, dedup at
extraction-time is a v1.2+ refinement.

### F#, VB.NET, MSBuild props files not in adapter scope

**Behavior:** csharp-ls supports F# via `.fsproj` files but
ContextAtlas adapter targets `.cs` files only.

**Adapter response:** init `excludePatterns` filters non-`.cs` source
files; F# / VB.NET projects produce empty atlases. Future adapter
candidates per [ROADMAP.md](../../ROADMAP.md) Arc 2.

## Non-goals

- **Editor integration beyond MCP.** v1.1.0 ships an MCP-only
  adapter parallel to TS/Python/Go/Ruby. VS Code C# Dev Kit / Rider /
  JetBrains ReSharper integrations not in scope (preserves ROADMAP
  agents-not-humans-at-keyboards stated focus).
- **VS Code C# Dev Kit driving (A2 sub-path).** Cohort users running
  VS Code can have C# Dev Kit installed in parallel; ContextAtlas
  spawns its own csharp-ls instance via the dotnet tool path.
- **Direct Microsoft.CodeAnalysis.LanguageServer integration (A2 path).**
  Deferred per Phase 0 spike adjudication. Documented as v1.2+
  fallback if csharp-ls maintenance becomes a concern.
- **Build-server-protocol (BSP) integration.** Roslyn BSP server is
  separate substrate not in v1.1.0 scope. Future arc candidate if
  ContextAtlas adopts build-server queries (compilation-error
  surfacing, build-graph navigation).
- **NuGet package metadata extraction.** `.csproj` `<PackageReference>`
  entries are not claim sources at v1.1.0. Future Arc 3 candidate per
  ROADMAP "API specs" entry (NuGet packages share substrate with
  OpenAPI/Swagger-style API catalog).
- **Source generators substrate.** Roslyn source generators emit
  synthesized `.cs` files at build time; ContextAtlas indexes the
  generated output if present at extraction time, treats it as
  regular `.cs` substrate. Live-generation tracking out of scope.
- **Multi-language solution support.** Solutions with mixed .NET
  Framework projects or pre-Roslyn build targets out of scope.

## Cross-references

- [ADR-01](ADR-01-symbol-id-format.md) — Symbol ID format canonical
  reference
- [ADR-03](ADR-03-language-adapter-plugin.md) — LanguageAdapter
  plugin architecture invariant
- [ADR-07](ADR-07-type-info-adapter-capability.md) — TypeInfo
  contract specification
- [ADR-13](ADR-13-python-adapter-pyright.md) — Pyright (Python)
  adapter precedent
- [ADR-14](ADR-14-go-adapter-gopls.md) — gopls (Go) adapter precedent
- [ADR-18](ADR-18-lsp-adapter-readiness-pattern.md) — LSP adapter
  readiness pattern (per-call ceiling vs $/progress race)
- [ADR-20](ADR-20-cohort-observability-contract.md) — cohort
  observability consent contract
- [ADR-21](ADR-21-ruby-adapter-ruby-lsp.md) — Ruby adapter precedent
  (most recent template; pull-model diagnostic precedent)

## Probe substrate references

- [`csharp-roslyn-probe/`](csharp-roslyn-probe/) — K-2-ii
  consolidated probe substrate archive
- [`csharp-roslyn-probe/csharp-roslyn-probe.ts`](csharp-roslyn-probe/csharp-roslyn-probe.ts) —
  Phase 0 probe script (six probes against csharp-ls 0.24.0.0)
- [`csharp-roslyn-probe/findings-baseline.md`](csharp-roslyn-probe/findings-baseline.md) —
  Phase 0 empirical capture (1917 lines)
- [`csharp-roslyn-probe/README.md`](csharp-roslyn-probe/README.md) —
  Phase 0 README with wrapper-as-vehicle framing + maintenance-tail
  correction
