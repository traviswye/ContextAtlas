# Docstring probe findings

Cross-language docstring surface examination produced as Step 8
probe artifact (per [STEP-PLAN-V0.3.md](../../STEP-PLAN-V0.3.md)
§"Step 8 — Stream B probe: cross-language docstring surface").
Date: 2026-04-26. Mirrors `pyright-probe-findings.md` and
`gopls-probe-findings.md` per Step 8 ship criterion 1; differs in
shape — content-surface survey rather than LSP protocol traces.

**Pinned benchmark targets:**
- TypeScript: `honojs/hono` at `cf2d2b7e` (4.12.14, 186 source files)
- Python: `encode/httpx` at `26d48e0` (0.28.1, 23 source files)
- Go: `spf13/cobra` at `88b30ab` (14 non-test source files)

**References:**
- [`v0.3-SCOPE.md`](../../v0.3-SCOPE.md) Stream B item 0
- [STEP-PLAN-V0.3.md](../../STEP-PLAN-V0.3.md) §"Step 8" lines 443-481
- [v0.2 retrospective](../../../ContextAtlas-benchmarks/research/v0.2-retrospective.md)
  §"Pre-implementation surveys"
- [ADR-13 (Pyright)](ADR-13-python-adapter-pyright.md);
  [ADR-14 (gopls)](ADR-14-go-adapter-gopls.md) — probe-then-decide
  precedent and existing LSP findings
- [`pyright-probe-findings.md`](pyright-probe-findings.md);
  [`gopls-probe-findings.md`](gopls-probe-findings.md) — convention model

**Status:** Probe complete; Stream B sub-decision recorded in §10.
Cross-referenced from Steps 9, 10, 11, 12 step bodies (per ship
criterion 5).

---

## §1 — Per-language sample — TypeScript (hono `cf2d2b7e`)

7 JSDoc samples covering: type alias / interface with @-tags /
class member with @example code block / @deprecated / @template
generic / interface composing multiple tags / minimal-prose
interface.

**Sample 1 — Type alias with single-line description** (`src/context.ts:23-25`)
```
/**
 * Data type can be a string, ArrayBuffer, Uint8Array (buffer), or ReadableStream.
 */
export type Data = string | ArrayBuffer | ReadableStream | Uint8Array<ArrayBuffer>
```
Doc on `export type Data`. Single-sentence description; no tags.
Most common terse-doc shape.

**Sample 2 — Interface with method-level JSDoc + @param** (`src/context.ts:28-52`)
```
/**
 * Interface for the execution context in a web worker or similar environment.
 */
export interface ExecutionContext {
  /**
   * Extends the lifetime of the event callback until the promise is settled.
   *
   * @param promise - A promise to wait for.
   */
  waitUntil(promise: Promise<unknown>): void
  /**
   * Allows the event to be passed through to subsequent event listeners.
   */
  passThroughOnException(): void
  ...
}
```
Doc on `interface ExecutionContext`. Top-level interface
description plus per-method JSDoc with `@param` tags.
**Hierarchical attribution** — interface has its own claim; each
method has its own claim.

**Sample 3 — Interface with @template / @interface / @param / @returns** (`src/context.ts:143-156`)
```
/**
 * Interface for responding with text.
 *
 * @interface TextRespond
 * @template T - The type of the text content.
 * @template U - The type of the status code.
 *
 * @param {T} text - The text content to be included in the response.
 * @param {U} [status] - An optional status code for the response.
 * @param {HeaderRecord} [headers] - An optional record of headers to include in the response.
 *
 * @returns {Response & TypedResponse<T, U, 'text'>} - The response after rendering the text content, typed with the provided text and status code types.
 */
interface TextRespond { ... }
```
Doc on `interface TextRespond`. Full JSDoc tag set: `@interface`,
`@template` (generic params), `@param` with type annotations,
`@returns` with type. Each tag is mechanically extractable as a
structured field.

**Sample 4 — @deprecated marker** (`src/adapter/bun/websocket.ts:104-107`)
```
/**
 * @deprecated Import `upgradeWebSocket` and `websocket` directly from `hono/bun` instead.
 * @returns A function to create a Bun WebSocket handler.
 */
export const createBunWebSocket = <T>(): CreateWebSocket<T> => ({ ... })
```
Doc on `export const createBunWebSocket`. Severity signal:
`@deprecated` tag is mechanical extraction → `severity: hard`.
Migration prose IS the deprecation explanation (architectural
intent, not just a flag).

**Sample 5 — Class field with @see + @example code block** (`src/context.ts:302-314`)
```
/**
 * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
 *
 * @see {@link https://hono.dev/docs/api/context#env}
 *
 * @example
 * ```ts
 * // Environment object for Cloudflare Workers
 * app.get('*', async c => {
 *   const counter = c.env.COUNTER
 * })
 * ```
 */
env: E['Bindings'] = {}
```
Doc on class field `env` of `Context<E, P, I>`. Uses
`@see {@link URL}` for external doc cross-reference + `@example`
with fenced code block. External documentation reference — the
deeper architectural intent lives at `hono.dev/docs/api/context#env`.

**Sample 6 — Interface with @template only** (`src/context.ts:90-95`)
```
/**
 * Interface for getting context variables.
 *
 * @template E - Environment type.
 */
interface Get<E extends Env> { ... }
```
Doc on `interface Get<E>`. Generic parameter doc only; no
`@param`/`@returns`. Common shape for type-level abstractions.

**Sample 7 — Empty-body interface with terse description** (`src/context.ts:54-57`)
```
/**
 * Interface for context variable mapping.
 */
export interface ContextVariableMap {}
```
Doc on `interface ContextVariableMap`. Empty-body interface
(extension point pattern). One-sentence description; architectural
intent (consumer extends this to declare shape) lives in framework
documentation, not the JSDoc.

---

## §2 — Per-language sample — Python (httpx `26d48e0`)

7 docstring samples covering: class with rich rationale / class
with terse description / property getter one-liner / property
with cross-reference link / function with httpx-Markdown
structured fields / private function terse / class without
docstring (negative observation).

**Sample 1 — Class with rich multi-paragraph rationale** (`httpx/_client.py:94-111`)
```python
class UseClientDefault:
    """
    For some parameters such as `auth=...` and `timeout=...` we need to be able
    to indicate the default "unset" state, in a way that is distinctly different
    to using `None`.

    The default "unset" state indicates that whatever default is set on the
    client should be used. This is different to setting `None`, which
    explicitly disables the parameter, possibly overriding a client default.

    For example we use `timeout=USE_CLIENT_DEFAULT` in the `request()` signature.
    Omitting the `timeout` parameter will send a request using whatever default
    timeout has been configured on the client. Including `timeout=None` will
    ensure no timeout is used.

    Note that user code shouldn't need to use the `USE_CLIENT_DEFAULT` constant,
    but it is used internally when a parameter is not included.
    """
```
Class docstring on `UseClientDefault`. Four paragraphs of
architectural rationale: WHY this class exists (sentinel pattern),
WHEN to use vs `None`, EXAMPLE usage, NOTE on user-facing scope.
Highest claim-text richness in the Python sample. No structured
tags — pure Markdown prose with backtick-inline-code.

**Sample 2 — Class with terse single-paragraph** (`httpx/_client.py:139-143`)
```python
class BoundSyncStream(SyncByteStream):
    """
    A byte stream that is bound to a given response instance, and that
    ensures the `response.elapsed` is set once the response is closed.
    """
```
Class docstring on `BoundSyncStream`. Single-sentence behavioral
description; the architectural mechanism (`response.elapsed`
side-effect) is the load-bearing claim.

**Sample 3 — Property getter with one-liner** (`httpx/_client.py:223-228`)
```python
@property
def is_closed(self) -> bool:
    """
    Check if the client being closed
    """
    return self._state == ClientState.CLOSED
```
Docstring on `is_closed` property. Three-word description (note
grammatical near-error in the original). Property setters in
httpx have NO docstrings even when getters do (e.g.,
`auth.setter` at line 283 has no docstring). Extraction will see
asymmetric coverage on properties.

**Sample 4 — Property with Markdown cross-reference link** (`httpx/_client.py:272-281`)
```python
@property
def auth(self) -> Auth | None:
    """
    Authentication class used when none is passed at the request-level.

    See also [Authentication][0].

    [0]: /quickstart/#authentication
    """
    return self._auth
```
Docstring on `auth` property. Uses Markdown reference-link syntax
(`[label][0]` + `[0]: url`) for external doc cross-reference. The
`/quickstart/...` URL is relative to `mkdocs.yml` site —
meaningful only with httpx's docs site context. Provenance
question: should extraction preserve link refs or flatten to
claim text?

**Sample 5 — Function with httpx-Markdown structured fields** (`httpx/_api.py:39-100`)
```python
def request(method, url, *, params=None, ...) -> Response:
    """
    Sends an HTTP request.

    **Parameters:**

    * **method** - HTTP method for the new `Request` object: `GET`, `OPTIONS`,
    `HEAD`, `POST`, `PUT`, `PATCH`, or `DELETE`.
    * **url** - URL for the new `Request` object.
    * **params** - *(optional)* Query parameters to include in the URL, as a
    string, dictionary, or sequence of two-tuples.
    ...
    * **trust_env** - *(optional)* Enables or disables usage of environment
    variables for configuration.

    **Returns:** `Response`

    Usage:

    ```
    >>> import httpx
    >>> response = httpx.request('GET', 'https://httpbin.org/get')
    >>> response
    <Response [200 OK]>
    ```
    """
```
Docstring on `request` function. **httpx uses its own Markdown
convention — NOT Google / NumPy / Sphinx style.** `**Parameters:**`
header + `* **name** -` bullets, `**Returns:**` header, `Usage:`
+ fenced doctest. Critical finding: Python lacks a single
docstring convention. Extraction must accommodate at minimum:
httpx-Markdown / Google (`Args:` `Returns:` `Raises:`) / NumPy
(`Parameters\n----------` underlines) / Sphinx (`:param name:`
`:returns:`) — plus bare prose.

**Sample 6 — Private function terse docstring** (`httpx/_client.py:62-65`)
```python
def _is_https_redirect(url: URL, location: URL) -> bool:
    """
    Return 'True' if 'location' is a HTTPS upgrade of 'url'
    """
```
Docstring on private `_is_https_redirect` function. (Private —
included for prose-shape diversity; would be out-of-scope for
actual extraction per v0.3-SCOPE Stream B Python convention.) The
single-quote-around `'True'` is unusual convention.

**Sample 7 — Class without docstring (negative observation)** (`httpx/_client.py:188-203`)
```python
class BaseClient:
    def __init__(
        self,
        *,
        auth: AuthTypes | None = None,
        ...
    ) -> None:
```
**`BaseClient` has NO class docstring.** Neither does its
`__init__`. This is a major class in the httpx public API — but
its architectural intent surfaces via `@property` getter
docstrings (Samples 3, 4) and the inheriting `Client` class.
Python docstring coverage often gaps at class level when
properties carry the load. Symbol attribution non-trivial.

---

## §3 — Per-language sample — Go (cobra `88b30ab`)

8 doc comments selected for diversity across surface-shape
dimensions: package-level / type-level / exported var /
multi-paragraph function / bullet-list function / terse
single-line / deprecation marker / build-tag-aware
cross-platform.

**Sample 1 — Package-level doc** (`cobra.go:15-16`)
```
// Package cobra is a commander providing a simple interface to create powerful modern CLI interfaces.
// In addition to providing an interface, Cobra simultaneously provides a controller to organize your application code.
```
Architectural intent on `package cobra` declaration. Two-sentence
statement of what the package IS plus what it provides.

**Sample 2 — Type definition (struct), multi-paragraph** (`command.go:50-53`)
```
// Command is just that, a command for your application.
// E.g.  'go run ...' - 'run' is the command. Cobra requires
// you to define the usage and description as part of your command
// definition to ensure usability.
```
Doc on `type Command struct`. Conceptual definition + example +
soft-requirement ("Cobra requires"). Note: severity-inference
signal "requires" without all-caps MUST.

**Sample 3 — Exported var with safety guidance** (`cobra.go:52-55`)
```
// EnablePrefixMatching allows setting automatic prefix matching. Automatic prefix matching can be a dangerous thing
// to automatically enable in CLI tools.
// Set this to true to enable it.
```
Doc on `var EnablePrefixMatching`. Architectural rationale
("dangerous thing") + activation instructions ("Set this to
true"). Severity signal: "dangerous" prose without formal
`@deprecated`-equivalent.

**Sample 4 — Function with multi-paragraph behavioral spec** (`command.go:262-268`)
```
// Context returns underlying command context. If command was executed
// with ExecuteContext or the context was set with SetContext, the
// previously set context will be returned. Otherwise, nil is returned.
//
// Notice that a call to Execute and ExecuteC will replace a nil context of
// a command with a context.Background, so a background context will be
// returned by Context after one of these functions has been called.
```
Doc on `func (c *Command) Context()`. Two paragraphs separated by
blank-comment-line (Go convention). First paragraph = behavior.
Second paragraph = subtle interaction note ("Notice that...").
Severity signal: "Notice" as soft-warning prose.

**Sample 5 — Function with bullet-list convention** (`args.go:24-28`)
```
// legacyArgs validation has the following behaviour:
// - root commands with no subcommands can take arbitrary arguments
// - root commands with subcommands will do subcommand validity checking
// - subcommands will always accept arbitrary arguments
```
Doc on internal `func legacyArgs`. Bullet-list convention via
`// -` prefix. (Unexported — included for bullet-list shape
diversity; would be out-of-scope for actual extraction per
v0.3-SCOPE Stream B Go item 3.)

**Sample 6 — Terse single-sentence doc** (`args.go:41`)
```
// NoArgs returns an error if any args are included.
```
Doc on `func NoArgs`. Single-sentence convention common across
cobra's PositionalArgs validators. Minimal architectural intent —
implementation contract only.

**Sample 7 — Function with explicit Deprecated marker** (`args.go:125-128`)
```
// ExactValidArgs returns an error if there are not exactly N positional args OR
// there are any positional args that are not in the `ValidArgs` field of `Command`
//
// Deprecated: use MatchAll(ExactArgs(n), OnlyValidArgs) instead
```
Doc on `func ExactValidArgs`. Severity signal: `Deprecated:`
line prefix is the godoc convention; gopls renders specially.
This is the closest Go has to a structured tag. Mechanical
extraction signal for `severity: hard`.

**Sample 8 — Build-tag-aware var with cross-platform note** (`cobra.go:68-71`)
```
// MousetrapHelpText enables an information splash screen on Windows
// if the CLI is started from explorer.exe.
// To disable the mousetrap, just set this variable to blank string ("").
// Works only on Microsoft Windows.
```
Doc on `var MousetrapHelpText`. Cross-platform constraint stated
in prose ("Works only on Microsoft Windows"). The variable is in
build-tag-agnostic `cobra.go`; the implementation it gates is in
`command_win.go` (`//go:build windows`). Cobra documents
cross-platform behavior on the public-API var, not in the
build-tagged implementation file.

---

## §4 — Structured-field availability matrix

> All numerical estimates in this probe are provisional
> surface-analysis derivations from the pinned target SHAs.
> Verified counts come from Steps 10/11 extraction work and Step
> 14 atlas re-extraction.

| Dimension | TS (hono) | Python (httpx) | Go (cobra) |
|---|---|---|---|
| Surface convention | `/** ... */` JSDoc block | Triple-quoted `"""..."""` (PEP 257) | `// ` lines above declaration (godoc) |
| Tagged sections | **Rich.** `@param`, `@returns`, `@template`, `@interface`, `@deprecated`, `@see`, `@example`, `@remarks` | **Plural conventions, no single standard.** httpx-Markdown, Google, NumPy, Sphinx, bare prose | **None formal.** Exception: `Deprecated:` line prefix (godoc-recognized) |
| Bullet-list convention | Markdown bullets in prose; `@param` itself bullet-shaped | Markdown `* ` (Sample 5); occasional `-` | `// - ` prefix (Sample 5) |
| Paragraph separator | Blank line (`*` only) | Blank line in docstring | Blank `// ` line |
| Inline code | Backticks; `{@link URL}` cross-refs | Backticks; older `'single-quoted'` | Backticks (rare, author convention) |
| Severity — hard | `@deprecated` tag — mechanical | **NO native docstring convention.** Runtime `warnings.warn(DeprecationWarning)` only | `Deprecated:` line prefix (mechanical); explicit `MUST`/`required` prose |
| Severity — soft | "Use X instead", "should"; `@see` external link | Imperative prose ("Note that...", "should") | Prose markers ("Notice", "Recommended") |
| Severity — context | Descriptive prose; type-shape descriptions | Default; dominant httpx shape | Default fallback; cross-platform notes |
| Symbol attribution | _Deferred to §7._ Hierarchical (interface + methods) | _Deferred to §7._ Multi-level + property asymmetry | _Deferred to §7._ Flat (binds to next decl) |
| Coverage estimate (provisional) | Library-grade on load-bearing files; thinner on internal helpers _(see §5/§9 representativeness caveat)_ | Mixed; rich on conceptual classes, absent on infrastructure _(see §5/§9 representativeness caveat)_ | ~85-95% on ~177 exported symbols; cobra is godoc-published _(see §5/§9 representativeness caveat)_ |
| Build-tag awareness | N/A (no build tags) | N/A (no build tags) | Public-API docs in agnostic files; tagged files house implementation |
| Markdown rendering | IDE hover renders JSDoc; tsserver `quickInfo` available | Sphinx/pdoc/mkdocstrings render; pyright hover does NOT include docstring _(see §8.3)_ | gopls hover renders rich Markdown _(see §8.1)_ |

---

## §5 — Claim-shape extraction analysis

> _Symbol attribution semantics deferred to §7. This subsection
> covers per-language CLAIM TEXT shape (claim/rationale/excerpt
> content) — what the extractor would see and what would land in
> a claim record._

**TypeScript (hono).** JSDoc surface yields **structured
extractable fields** via tsserver `quickInfo` or direct
`ts.getJSDocCommentsAndTags()` parse. Each tag (`@param`,
`@returns`, `@template`, `@example`) maps to a separate claim
fragment; the leading prose maps to the description claim.
Sample 3 (TextRespond) yields ≥7 distinct fragments per the
@-tag count. **Mechanical extraction** is straightforward; the
contract design question is whether tag-shaped claims compose
naturally with ADR-shape claims at query time, or warrant their
own claim shape.

**Python (httpx).** httpx-Markdown convention plurality forces a
**convention-tolerant extraction prompt**. Sample 5 (`request`)
uses `**Parameters:**` headers + bulleted parameter list — a
shape that Google-style (`Args:` `Returns:` `Raises:`) and
NumPy-style would not match. **At minimum 4 conventions** must
be tolerated by Python extraction (httpx-Markdown / Google /
NumPy / Sphinx) plus bare prose. The convention plurality is the
load-bearing finding for Step 9 (single-vs-dual prompt
decision).

Sample 1 (UseClientDefault) shows that on conceptual classes,
docstring richness rivals ADR-quality architectural reasoning —
the four-paragraph rationale captures WHY-the-class-exists +
WHEN-to-use + EXAMPLE + NOTE-on-scope. This is the upper bound;
Sample 7 (BaseClient with no docstring) is the lower bound on
the same file. **Variance within a single file** is high.

**Go (cobra).** Go doc comments are **free-form prose with one
mechanical signal** (`Deprecated:` line prefix, godoc
convention). Severity-inference signals beyond `Deprecated:` are
prose-pattern matches ("dangerous", "Notice", "Recommended", "must").
Sample 4 (Context()) shows multi-paragraph behavioral spec with
subtle interaction note — typical mid-richness Go doc shape.
Sample 5 (legacyArgs bullet-list) shows godoc-renderable
Markdown bullets. Per ADR-14 Decision 8, build-tag-aware files
surface from all build tags — but cobra empirically documents
public-API on agnostic files, so the build-tag concern is
mostly a non-issue for cobra-shape repos.

**Cross-language richness ranking (provisional):**
1. TS (hono) — richest tagged extraction; mechanical fragments
2. Go (cobra) — rich prose; one mechanical severity signal
3. Python (httpx) — variable; convention plurality complicates
   extraction prompt

**Representativeness caveat (Refinement 2 anchor).** All three
benchmark targets are **library-grade upper-bound coverage**:
cobra publishes to pkg.go.dev; hono is a published web framework;
httpx is a published HTTP library. Production user repos —
internal tools, side projects, smaller open-source — typically
have **substantially lower docstring coverage**, and the gap is
asymmetric (Go libraries tend to have higher coverage than TS
or Python at the same maturity, since `go doc` and pkg.go.dev
incentivize it). **Stream B value-prop on production repos
depends on this gap closing in real-world usage.** See §9 for
contract-design implication.

---

## §6 — Severity inference signals

Per-language severity signals consolidated:

| Severity | TS (hono) | Python (httpx) | Go (cobra) |
|---|---|---|---|
| **hard** | `@deprecated` tag (mechanical); `MUST`/`must`/`required` prose | **STATIC EXTRACTION CANNOT DETECT.** Python deprecation is runtime-only via `warnings.warn(DeprecationWarning)`; httpx has no `.. deprecated::` Sphinx directive | `Deprecated:` line prefix (godoc, mechanical); `MUST`/`must`/`required` prose |
| **soft** | "should", "Use X instead"; `@see` external doc link suggests architectural rationale lives elsewhere | Imperative prose ("Note that...", "should"); "user code shouldn't need..." patterns | "Notice", "Recommended", "can be a dangerous thing" |
| **context** | Descriptive prose without imperatives; type-shape descriptions | Descriptive prose (dominant shape) | Descriptive prose (dominant shape); cross-platform notes |

**Major finding — Python deprecation asymmetry.** Python
deprecation is **runtime-only** via `warnings.warn(DeprecationWarning)`.
httpx samples confirm this pattern at `_client.py:806`,
`_client.py:1521`, `_config.py:47`, `_config.py:60`,
`_urls.py:408`. **No docstring-level convention encodes
deprecation** in httpx; some Python libraries adopt
`.. deprecated::` Sphinx directive, but it's not universal.

Implications:
- **Static-text docstring extraction cannot detect Python
  deprecations.** Severity inference must default to soft/context
  for all Python docstrings; hard-severity must come from a
  separate signal.
- **Possible mitigation (out of probe scope; flag for Step 9):**
  AST-level `warnings.warn(DeprecationWarning, ...)` detection
  surfaces deprecation as a separate claim source. NOT a
  docstring extraction signal; would require pipeline change.
- **Surface in §10 as Step 9 contract-design input** per
  Refinement 3.

**Cross-language severity-signal mechanical-vs-prose mix:**
- TS: 1 mechanical (`@deprecated`) + prose patterns
- Go: 1 mechanical (`Deprecated:`) + prose patterns
- Python: 0 mechanical (in docstring) + prose patterns + runtime-only
  deprecation

The Python asymmetry is **load-bearing for Step 9 prompt
design** — single shared prompt would need to handle Python's
zero-mechanical-signal case explicitly; dual prompt design could
isolate Python's convention plurality and severity-inference
limitation in a Python-specific prompt.

---

## §7 — Symbol attribution semantics

Per-language symbol attribution complexity:

**Go (cobra) — flat.** Doc comment binds to the immediately-
following declaration via Go convention. One comment → one
SymbolId. Mechanically trivial; gopls hover preserves the
binding. Per v0.3-SCOPE Stream B Go item 3 ("doc comments
preceding exported declarations"). Build-tag-aware files
surface from all tags per ADR-14 Decision 8 — but cobra rarely
documents tagged-file internals (Sample 8 documents the
public-API var, not the tagged implementation).

**TypeScript (hono) — mostly flat with one wrinkle.** Most JSDoc
binds to the next declaration (type alias, function, class,
interface). Wrinkle: **interface methods carry their own
JSDoc** (Sample 2, ExecutionContext). This creates **hierarchical
attribution**:
- Interface `ExecutionContext` → its own claim
- Method `waitUntil` → its own claim (with `@param`)
- Method `passThroughOnException` → its own claim
- ... etc.

Each interface method's JSDoc is a separate SymbolId — manageable
since tsserver / TypeScript compiler API surface each member as a
distinct symbol. **No new SymbolId shape needed.**

**Python (httpx) — most complex.** Python attribution surfaces
across:
- **Module-level docstring** (top of `.py` file). httpx
  `__init__.py` has no module docstring (just imports); few
  public modules in httpx do. **Symbol attribution unresolved
  per v0.3-SCOPE Stream B item 2** (TBD `sym:py:<path>:<module>`
  vs `(module)` reserved name).
- **Class-level docstring** (Samples 1, 2). Binds to class
  SymbolId.
- **Function/method-level docstring** (Sample 5). Binds to
  function/method SymbolId.
- **`@property` getter docstring** (Samples 3, 4). Binds to
  property SymbolId.
- **`@<name>.setter` docstring** — empirically absent in httpx
  (e.g., `auth.setter` at line 283 has no docstring). **Property
  asymmetry: getters documented, setters not.** Extraction must
  decide: bind setter docstring (when present) to same SymbolId
  as getter, or treat as separate?
- **Class-without-docstring-but-properties-with** (Sample 7,
  BaseClient). Class has no claim; properties have claims.
  **Architectural intent surfaces via property docs, not class
  doc.** Symbol attribution: property docs attach to property
  SymbolIds; class SymbolId has no claim text.

**Probe recommendation: defer module-level Python SymbolId
shape decision to Step 9.** Probe surfaces evidence (httpx
sparse module docstrings) but does not lock the SymbolId convention.
Step 9 calibration on 10-15 docstring examples will inform
better; locking now is premature.

**Probe recommendation: handle property getter/setter pairs as
single SymbolId at extraction time** (concatenate getter + setter
docstrings if both present; use getter alone if setter undocumented).
Avoid creating two SymbolIds for the same logical attribute.

---

## §8 — Per-language LSP availability for docstring surfacing

Per-language LSP architecture affects the extraction-path
decision (use LSP hover vs direct AST/comment parse). This is
load-bearing for Step 10/11 implementation work, not just
Step 9 prompt design.

### §8.1 — Go (gopls): hover output is rich

gopls hover output includes doc comment text + signature +
methods + pkg.go.dev link. Per
[`gopls-probe-findings.md`](gopls-probe-findings.md) §T4 line
1262+, hover for `interface Shape` returns:

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\ntype Shape interface { // size=16 (0x10)\n\tArea() float64\n\tPerimeter() float64\n}\n```\n\n---\n\nShape is a simple interface.\n\n\n---\n\n[`kinds.Shape` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#Shape)"
  }
}
```

The doc comment ("Shape is a simple interface.") is embedded
between `---` separators; the signature block precedes it; the
pkg.go.dev link follows. **gopls hover provides bundled context;
direct comment parse provides only the doc text.**

**Decision input for Go:** gopls hover preferred for bundled
context (comment + signature + methods); direct parse acceptable
fallback. Existing `GoAdapter` already declares
`hover: { contentFormat: ["markdown"] }` capability
(`go.ts:265`).

### §8.2 — TypeScript (tsserver): JSDoc available via two paths

Two viable paths for TS JSDoc extraction:

**Path A — tsserver `textDocument/hover` / `quickInfo`.**
Returns formatted Markdown including JSDoc tags. Existing
`TypeScriptAdapter` has TODO at `typescript.ts:342` to enrich
`signature` field via `textDocument/hover` — JSDoc extraction
would fold into that path.

**Path B — direct AST parse via `ts.getJSDocCommentsAndTags()`.**
TypeScript compiler API exposes JSDoc programmatically per node.
More granular than hover — preserves tag structure (e.g.,
`@param` per parameter). Adds compiler API dependency to adapter.

**Decision input for TS:** lean Path A (tsserver hover) for
parity with Go gopls path and adapter-as-LSP-only design. Verify
in Step 9 calibration whether tsserver hover preserves enough
JSDoc tag granularity for severity inference (`@deprecated`
detection); if granularity insufficient, fall back to Path B.

### §8.3 — Python (pyright): hover does NOT surface docstrings

Per [ADR-13](ADR-13-python-adapter-pyright.md) line 91 and
empirical confirmation in
[`pyright-probe-findings.md`](pyright-probe-findings.md):
pyright `textDocument/hover` returns "compact markdown like
`(class) Shape`" — **signature/type only, no docstring text**.

This is asymmetric vs Go gopls and TS tsserver — both of which
can return docstring-included hover output.

**Decision input for Python: direct AST parse via
`ast.get_docstring()` is the only path.** Python module
ships with `ast` standard library; no extra dependency. Per-symbol
extraction:
- Module-level: `ast.get_docstring(module_node)`
- Class-level: `ast.get_docstring(class_node)`
- Function/method: `ast.get_docstring(func_node)`
- Property getter/setter: traverse `@property`-decorated
  function nodes; bind to attribute name

**Implication:** Python adapter docstring extraction is
architecturally distinct from Go/TS adapter paths. Step 10/11
implementation must scaffold per-language extraction
differently, OR factor a shared "docstring source" abstraction
that fans out to per-language extractors. **Captured for §10
Step 9 input.**

### Cross-language LSP availability summary

| Language | LSP hover surfaces docstring? | Recommended extraction path |
|---|---|---|
| Go | ✓ (gopls; rich Markdown) | gopls hover preferred; direct parse acceptable |
| TypeScript | ✓ (tsserver `quickInfo`) | tsserver hover (Path A); direct AST (Path B) as fallback |
| Python | ✗ (pyright signature-only) | Direct AST parse via `ast.get_docstring()` (only path) |

---

## §9 — Cross-language contract comparison

Two contract-design tensions surface from §1-§8:

**Tension 1: Surface-richness vs tag-richness.** Go has the
richest single-call hover SURFACE (gopls bundles
comment+signature+methods+pkg.go.dev link); TS has the richest
TAG ecosystem (`@param`, `@deprecated`, `@template`, `@example`,
`@see`); Python has neither — sparse mechanical signals + plural
conventions.

**Tension 2: Mechanical-signal availability.** Go and TS each
have one mechanical severity signal (`Deprecated:` line prefix /
`@deprecated` tag); Python has zero mechanical docstring signals
for severity (deprecation runtime-only per §6). Contract designed
around mechanical signals fails on Python.

**Lowest-common-denominator approach (favors Path A).** Design
the extraction contract around **free-form prose with optional
mechanical signal detection** (handles Go's free-form +
optional `Deprecated:`; handles Python's bare prose + zero
mechanical; handles TS's free-form-prose-plus-many-tags by
treating tags as enrichment). This contract retrofits cleanly
across all three languages because it doesn't require any
language to have features it lacks.

**Highest-common-denominator approach (Path B risk).** Design
the contract around tagged-extraction (TS tag richness as
template). Go would require all-mechanical signals it lacks
(forced fallback to prose extraction); Python would require all
mechanical signals it lacks PLUS convention-plurality handling.
**Path B contract designed against TS-richness wouldn't
retrofit cleanly to Go/Python.**

**Path A (Go-first) per ADR-14 / v0.2 retrospective precedent.**
The ADR-14 finding ("Pre-implementation surveys caught hidden
work before it bit") plus v0.2 retrospective §"Pre-implementation
surveys" both identified Go-first probe-then-decide as the
established pattern. The lowest-common-denominator contract
analysis above reinforces that pattern: design for the
free-form-prose surface (Go's natural shape) and let TS's tag
richness + Python's convention plurality compose as enrichment
rather than driving the contract.

**Production-repo coverage caveat reaffirmed.** All three
benchmark targets (cobra, hono, httpx) are library-grade
upper-bound docstring coverage. **Stream B value-prop on
production repos depends on this gap closing in real-world
usage.** Production Python repos likely have lower coverage
asymmetric to Go (which has go-doc/pkg.go.dev incentives at
publication time). Stream D Step 14/15 measurement should
include code-change scenarios on lower-docstring-coverage targets
to surface this gap empirically.

---

## §10 — Stream B sub-decision recorded

> _This subsection records the language order decision the probe
> evidence supports. Default Path A (Go-first per v0.3-SCOPE)
> unless probe ruled out. If evidence is insufficient to lock a
> decision, this subsection records specific open questions to
> defer to Step 9 — guessing is not a probe output._

**Decision: Path A (Go-first) — probe evidence supports the
default.**

Rationale (probe evidence, not preference):

1. **Go's gopls hover provides the richest single-call surface**
   (§8.1) — bundles doc comment + signature + methods +
   pkg.go.dev link. Contract designed against this surface
   retrofits cleanly to TS (tsserver hover available, §8.2)
   and Python (degrades to direct AST parse, §8.3).

2. **Lowest-common-denominator analysis favors Go-first
   contract** (§9). Free-form prose + optional mechanical
   severity signals composes across all three languages without
   requiring any language to have features it lacks. TS's
   tag-richness adds enrichment without changing the core
   contract; Python's convention plurality is contained as a
   prompt-design problem (Step 9), not a contract-shape problem.

3. **ADR-14 / v0.2 retrospective precedent.** Go-first
   probe-then-decide caught hidden work in adapter implementations
   in v0.2; same pattern applies here. **No probe evidence rules
   out Path A.**

**Cross-references for Step 9 contract design** (per
Refinement 3):

- **§6 (Python deprecation asymmetry).** Python static-text
  docstring extraction cannot detect deprecation; severity
  inference must default to soft/context for Python docstrings.
  Step 9 prompt design must accommodate this — either single
  shared prompt with Python-aware severity-defaulting, or
  Python-specific prompt isolating the limitation.
- **§2 (httpx-Markdown convention variant).** Python convention
  plurality (≥4 styles: httpx-Markdown / Google / NumPy / Sphinx
  / bare prose) is the load-bearing input for Step 9
  single-vs-dual prompt decision. Probe evidence does not lock
  this; Step 9 calibration on 10-15 docstring examples will
  inform.
- **§8.3 (pyright behavior).** Python extraction path is direct
  AST parse via `ast.get_docstring()` — asymmetric vs Go (gopls
  hover) and TS (tsserver hover or direct AST). Step 10/11
  implementation must scaffold per-language extraction
  differently, OR factor a shared "docstring source" abstraction
  that fans out to per-language extractors.

**Open questions deferred to Step 9** (probe surfaces, does not
lock):

- **Single shared extraction prompt vs dual prompt.** Probe
  evidence supports BOTH possibilities. Calibration on 10-15
  docstring examples (Step 9 ship criterion) will inform.
- **AST-level Python deprecation extraction** (out of docstring
  scope). Step 9 should decide whether `warnings.warn(DeprecationWarning)`
  detection at AST level is in scope as a separate claim source,
  or out of scope for v0.3 Stream B.
- **Module-level Python SymbolId shape.** Probe evidence (httpx
  sparse module docstrings) does not lock between
  `sym:py:<path>:<module>` and `(module)` reserved name. Step 9
  calibration will inform.
- **TS extraction path (tsserver hover vs direct AST).** Probe
  evidence leans tsserver hover (§8.2 Path A) for adapter parity
  with Go gopls; calibration verifies whether hover preserves
  sufficient JSDoc tag granularity for severity inference.

**Implementation order under Path A:** Go (Step 10) → Python +
TS (Step 11) per v0.3-SCOPE Stream B item 0 default.

---

**Cross-referenced from:** Steps 9, 10, 11, 12 (per Step 8 ship
criterion 5) — added at probe completion; pending Step 9
beginning to verify cross-references active.
