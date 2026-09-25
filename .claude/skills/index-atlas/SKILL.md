---
name: index-atlas
description: Run ContextAtlas extraction inside Claude Code session (subscription-bounded; no Anthropic API key needed). Walks ADRs + source-symbol docstrings + filtered commit messages via `contextatlas list-extraction-sources` and extracts architectural claims via per-source iteration discipline. Persists to .contextatlas/atlas.json (committable artifact); LSP symbol resolution via mandatory `contextatlas resolve-symbols` post-extraction; canonical Claude Code entry point per ADR-02 v0.7 amendment §Decision entry-point-determined cost model. Substrate-equivalence with CLI extraction path closed at v0.7.1 ADR-02 amendment §index-atlas substrate-equivalence closure.
model: claude-opus-4-7
effort: xhigh
---

# index-atlas — ContextAtlas extraction via Claude Code session

## When to use this skill

You're running ContextAtlas extraction inside your Claude Code
session. User invoked you via `/index-atlas` slash command directly,
OR via contextatlas project context surfacing in their session.

This is THE canonical entry point for subscription-bounded
extraction. The `contextatlas` CLI binary uses Anthropic API
direct extraction (different cost model; not this skill's concern).
Per ADR-02 v0.7 amendment §Decision: extraction has two entry
points; each entry point uses the appropriate cost model for its
invocation context.

If user is asking how to extract atlas.json:
- They're working in Claude Code session right now → invoke this skill
- They want CLI / CI/CD / scripting workflow → tell them to use
  `contextatlas index` from terminal (uses Anthropic API direct;
  requires `ANTHROPIC_API_KEY` env var)

## What this skill does

Substrate-equivalent extraction at /index-atlas surface per v0.7.1
Path D closure. Three MANDATORY phases (A → B → C). Do not advance
until the prior phase substantively completes:

- **Phase A** — Source-document walk via `contextatlas list-
  extraction-sources` CLI Bash gate + manifest consumption via
  Read tool. Per-source enumeration discipline produces the full
  source registry across all three streams (ADRs + source-symbol
  docstrings + filtered commit messages) before any extraction
  call. Phase A IS the iteration discipline that closes the v0.7
  Step 2.3.b.0 substrate-equivalence regression falsified at v0.8
  Step 1.1.b factorial three-repo empirical.

- **Phase B** — Per-source extraction loop. For each source in the
  manifest, one canonical EXTRACTION_PROMPT invocation against the
  source content; aggregate per-source claims into atlas.json.
  The per-source iteration IS the mechanical floor — CLI's per-
  call API loop is its mechanical floor by construction; Phase B
  per-source reasoning loop is the subscription-bounded
  equivalent.

- **Phase C** — Mandatory mechanical-floor CLI gates in order:
  `contextatlas validate-atlas` (canonical schema) →
  `contextatlas validate-extraction` (depth-floor + coverage) →
  `contextatlas resolve-symbols` (LSP bridge) →
  `contextatlas doctor` (final verification). Each gate must exit
  0 before advancing to the next.

This mirrors the v0.7 Step 2.3.c.0 generate-adrs closure pattern
(cycle-execution observation 13 reproducibility) at the
/index-atlas surface.

## Canonical atlas schema (v1.4) — your output MUST match this

The atlas.json you write at workflow Phase B MUST conform exactly to
this shape. Mimic the structure below; the `contextatlas
validate-atlas` mandatory gate (Phase C step 1) will reject any
deviation with specific remediation, and the workflow cannot
proceed until the atlas validates.

```json
{
  "version": "1.4",
  "generated_at": "2026-05-13T20:00:00.000Z",
  "generator": {
    "contextatlas_version": "0.7.1",
    "extraction_model": "claude-opus-4-7"
  },
  "source_shas": {
    "docs/adr/ADR-01-name.md": "abc123def456...",
    "src/router.ts": "fedcba789...",
    "commit:0a1b2c3d4e5f60718293a4b5c6d7e8f901234567": "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567"
  },
  "symbols": [],
  "claims": [
    {
      "source": "adr:ADR-01-name.md",
      "source_path": "docs/adr/ADR-01-name.md",
      "source_sha": "abc123def456...",
      "severity": "hard",
      "claim": "Brief architectural claim about the symbol(s)",
      "rationale": "Why this claim matters architecturally",
      "excerpt": "Direct quote from the source document",
      "symbol_ids": [],
      "symbol_candidates": ["SymbolName1", "SymbolName2"]
    },
    {
      "source": "docstring:src/router.ts",
      "source_path": "src/router.ts",
      "source_sha": "fedcba789...",
      "severity": "soft",
      "claim": "Router invariant the docstring documents",
      "rationale": "Why the documented contract matters",
      "excerpt": "Direct quote from the docstring",
      "symbol_ids": [],
      "symbol_candidates": ["RegExpRouter"]
    },
    {
      "source": "commit:0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
      "source_path": "commit:0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
      "source_sha": "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
      "severity": "context",
      "claim": "Architectural intent visible in commit message",
      "rationale": "Why this intent matters going forward",
      "excerpt": "Direct quote from commit body",
      "symbol_ids": [],
      "symbol_candidates": []
    }
  ]
}
```

### Schema invariants (MANDATORY)

- Top-level fields exactly: `version`, `generated_at`, `generator`,
  `source_shas`, `symbols`, `claims`. Nothing else. Do NOT add
  `cost_usd`, `cost_model`, `repo`, `sources`, or any other
  top-level field.
- `version`: the string `"1.4"`. Not `"1"`. Not `"1.3"` (deprecated
  for new writes).
- `generator`: a structured object with `contextatlas_version` +
  `extraction_model` string fields. NOT a free-form string like
  `"contextatlas/index-atlas skill"`.
- `claims`: a flat top-level array. Each claim is one object with
  ALL the fields shown above. Do NOT nest claims inside a
  `sources: [{ claims: [...] }]` structure — the canonical schema
  has claims at the top level and records each claim's source via
  the per-claim `source` + `source_path` + `source_sha` fields.
- `claims[].source` prefix conventions per stream:
  - ADR stream: `"adr:<basename>"` (e.g., `"adr:ADR-01-name.md"`)
  - Docstring stream: `"docstring:<source_path>"` (e.g.,
    `"docstring:src/router.ts"`)
  - Commit stream: `"commit:<sha>"` (full 40-char hex)
- `claims[].source_path` per stream:
  - ADR stream: the repo-relative ADR path (`adr.path`)
  - Docstring stream: the repo-relative source path
    (`docstring.source_path`)
  - Commit stream: `"commit:<sha>"` — the same value as `source`,
    given in the manifest as `commit.source_key`. NEVER the bare sha.
    (`/index-atlas` copies from before v1.2 wrote the bare 40-hex sha
    here and as the `source_shas` key. Readers accept that legacy
    form and `contextatlas index` migrates it, but always WRITE the
    canonical `commit:<sha>` form.)
- `symbols`: empty array at the time you write the atlas. The
  `contextatlas resolve-symbols` Phase C step populates it via
  LSP walk.
- `claims[].symbol_ids`: empty array on every claim you newly
  extract. Phase C resolve-symbols populates it. Refresh case:
  preserved baseline claims keep their existing `symbol_ids`.
- `claims[].symbol_candidates`: the raw symbol names you extracted
  from the source document text. Phase C resolves them into the
  canonical `symbol_ids` array. For Stream B docstring claims,
  ALWAYS include the documented symbol name as the first candidate
  (the CLI docstring stream links the documented symbol by exact
  id; the name as first candidate is how resolve-symbols recovers
  that link on this path).
- `severity`: one of exactly `"hard"`, `"soft"`, `"context"`. No
  other values.
- `source_shas`: full registry of every walked source. Keys are
  source identifiers: ADR repo-relative paths (value `adr.sha`);
  source-file repo-relative paths (value `docstring.file_sha`);
  `"commit:<sha>"` for commits (the manifest's `commit.source_key`;
  value `commit.sha`). The `validate-extraction` Phase C gate
  cross-checks that every ADR-shaped entry (a `.md` or `.rst` path)
  has at least one claim with that `source_path` (silent-skip
  detection). Source-file and commit entries may legitimately have
  zero claims.

## How extraction works

The extraction prompt is canonical to ContextAtlas — DO NOT modify
it. ContextAtlas owns the prompt per ADR-02 §Decision permitted-
modules invariant; this skill consumes the prompt via Read tool
against the `.contextatlas/prompts/extraction.md` artifact (Path-γ
Read-tool refactor per v0.7 Step 2.3.a.0).

Load the canonical prompt ONCE at the start of the skill via Read
tool against:

  `.contextatlas/prompts/extraction.md` (relative to cwd)

This file is generated by `contextatlas init` from the canonical
`EXTRACTION_PROMPT` constant at `src/extraction/prompt.ts`. The
user repo must have run `contextatlas init` before invoking this
skill (init copies the artifact from the installed contextatlas
package into `.contextatlas/prompts/`). If the file does not
exist at this path, instruct the user to run
`contextatlas init` before retrying.

**DO NOT** improvise an extraction prompt from training-data
familiarity. The legacy `contextatlas show-prompt` CLI subcommand
was removed entirely at v0.7 Step 2.3.b.0 — there is no
alternative path. Use Read tool against the artifact.

## Phase A — Source-document walk (MANDATORY before Phase B)

Phase A produces the full source registry the Skill iterates in
Phase B. The CLI subcommand `contextatlas list-extraction-sources`
pre-walks all three streams via the same file-walker + LSP-symbol-
inventory + commit-message-extractor substrate the CLI extraction
pipeline uses; this guarantees substrate-equivalence at the source-
discovery layer (per Q1.1.G.α architectural framing in v0.7.1
ADR-02 amendment).

### Phase A workflow steps

1. **Invoke list-extraction-sources via Bash** to walk all three
   streams and write the manifest to a known path:

   ```bash
   contextatlas list-extraction-sources --output .contextatlas/extraction-sources.json
   ```

   Non-zero exit indicates a setup failure (missing or invalid
   config; adapter init failure). Surface stderr to user with
   actionable remediation; do NOT proceed to Phase B. (A non-git
   tree or a missing `git` binary does not fail the command; it only
   leaves `sources.commits` empty.)

2. **Read the manifest** via Read tool against
   `.contextatlas/extraction-sources.json`. Verify shape:
   - `manifest_version: "1"`
   - `sources.adrs` — array of ADR entries
   - `sources.docstrings` — array of symbol-with-docstring entries
   - `sources.commits` — array of filtered commit entries; each
     carries `source_key` (`"commit:<sha>"`)
   - `summary` — per-stream counts, plus `disabled_streams`: the
     streams `extraction.streams` in `.contextatlas.yml` turned off
     (absent or `[]` = none)

3. **Enumerate the source registry mentally**:
   - Stream A: `manifest.summary.adr_count` ADRs to extract from
   - Stream B: `manifest.summary.symbols_with_docstrings` symbols
     with docstrings to extract from
   - Stream C: `manifest.summary.filtered_commits` filtered commits
     to extract from
   - Total source-extraction calls = sum of all three
   - A stream listed in `manifest.summary.disabled_streams` has an
     empty array on purpose: extract nothing for it, and (refresh
     case) carry its baseline keys and claims forward unchanged —
     frozen, as `contextatlas index` does.

4. **For refresh-case** (existing `.contextatlas/atlas.json`):
   Read the existing atlas.json via Read tool; capture
   `source_shas` as the SHA-diff baseline; capture `claims` as the
   preserved-claims substrate. See "Refresh-aware workflow"
   section below for per-stream SHA-diff dispatch in Phase B.

Phase A complete when: manifest is loaded; you've enumerated total
sources count per stream; (refresh-case) baseline atlas.json is
read. Proceed to Phase B.

## Phase B — Per-source extraction loop (MANDATORY)

Phase B is the load-bearing mechanical-floor enforcement at the
Skill workflow boundary. Per-source iteration discipline:

- **One canonical EXTRACTION_PROMPT invocation per source-document.**
  Each invocation is a separate reasoning loop producing JSON
  claims for that one source. DO NOT collapse multiple sources
  into a single mega-prompt; the per-source iteration IS the
  substrate-equivalence floor with CLI's per-call API loop.

- **RESPOND WITH JSON LITERAL DIRECTLY per source.** Do NOT write
  a Python/JS/shell script to generate atlas.json by encoding
  claims as data literals. Reason through each source; produce the
  JSON as your direct textual response. Aggregate per-source JSON
  outputs into the final atlas.json at the end of Phase B.

- **Order**: Stream A (ADRs) → Stream B (docstrings) → Stream C
  (commits). Process sources in manifest order within each stream.

### Phase B step 1 — Stream A ADR extraction

For each `adr` in `manifest.sources.adrs` (cold-start: ALL ADRs;
refresh: only changed/new ADRs per refresh-aware workflow):

1. Concatenate `EXTRACTION_PROMPT + adr.content + "\n---\n"` (the
   `EXTRACTION_PROMPT` value was loaded at the start of the skill
   from `.contextatlas/prompts/extraction.md`).
2. Reason through the ADR content; produce JSON claims matching
   the per-claim schema in "Canonical atlas schema" above.
3. For each claim, set:
   - `source: "adr:" + path.basename(adr.path)` (e.g.,
     `"adr:ADR-01-name.md"`)
   - `source_path: adr.path` (the repo-relative ADR path)
   - `source_sha: adr.sha`
   - `symbol_ids: []`
   - `symbol_candidates: [...]` — extracted from ADR prose
4. Validate the JSON parses + each claim has all required fields.
   Drop malformed claims (log warning); don't fail the whole run.

### Phase B step 2 — Stream B docstring extraction

For each `docstring` in `manifest.sources.docstrings` (cold-start:
ALL symbols-with-docstrings; refresh: only docstrings whose
`file_sha` differs from baseline):

1. Concatenate `EXTRACTION_PROMPT + docstring.docstring + "\n---\n"`.
   The `docstring.docstring` field is the raw docstring TEXT pre-
   extracted by `contextatlas list-extraction-sources` via the
   LSP adapter's `getDocstring` API (the same filter chain as the
   CLI docstring stream: exported symbols only, then a non-empty
   `getDocstring`).
2. Reason through the docstring content; produce JSON claims.
3. For each claim, set:
   - `source: "docstring:" + docstring.source_path` (e.g.,
     `"docstring:src/router.ts"`)
   - `source_path: docstring.source_path`
   - `source_sha: docstring.file_sha`
   - `symbol_ids: []`
   - `symbol_candidates: [docstring.symbol_name, ...other symbols
     the docstring mentions]` — ALWAYS include
     `docstring.symbol_name` as the first candidate to preserve
     the documented-symbol provenance link the CLI docstring stream
     sets by exact symbol id.
4. Some docstrings won't surface architectural claims — that's
   expected; an empty claims array is fine. Don't fabricate.

### Phase B step 3 — Stream C commit-message extraction

For each `commit` in `manifest.sources.commits` (cold-start: ALL
filtered commits; refresh: only commits whose `sha` is not in
baseline source_shas):

1. Concatenate `EXTRACTION_PROMPT + commit.extraction_body +
   "\n---\n"`. The `commit.extraction_body` is pre-built per
   `buildCommitExtractionBody` (subject + body) — matches CLI
   commit-message-extractor discipline exactly.
2. Reason through commit content; produce JSON claims.
3. For each claim, set:
   - `source: "commit:" + commit.sha`
   - `source_path: commit.source_key` (`"commit:" + commit.sha`;
     the same value is the commit's `source_shas` key)
   - `source_sha: commit.sha`
   - `symbol_ids: []`
   - `symbol_candidates: [...]` — extracted from commit prose
4. Key the commit in `source_shas` as `commit.source_key` →
   `commit.sha`, even when it yields no claims (most commits do
   not), so a refresh does not extract it again.

### Phase B step 4 — Aggregate + write atlas.json

After all three streams complete:

1. Build the unified atlas.json structure per the canonical schema
   above:
   - `version: "1.4"`
   - `generated_at`: current ISO timestamp
   - `generator`: `{ contextatlas_version, extraction_model:
     "claude-opus-4-7" }`
   - `source_shas`: full registry. Cold-start: aggregate of
     manifest sources (ADR paths → adr.sha; source-file paths →
     docstring.file_sha for files with extracted docstrings;
     `commit.source_key` → commit.sha for each extracted commit).
     Refresh-case: union of preserved baseline entries (unchanged,
     frozen and kept sources, in the form the baseline holds them) +
     newly-computed SHAs (changed + new sources); only the entries
     refresh rule 4 finds deleted are removed.
   - `symbols: []`
   - `claims`: aggregate of all per-source claims emitted across
     all three streams. Refresh-case: union of preserved baseline
     claims (every source not re-extracted and not deleted) +
     newly-extracted claims (CHANGED + NEW sources); only claims of
     sources refresh rule 4 finds deleted are dropped.

2. Persist via Write tool to `.contextatlas/atlas.json`.

3. Each claim's `source_sha` field MUST match the corresponding
   hash in `source_shas` for that source. Leave `symbols: []`, and
   give each newly extracted claim `symbol_ids: []` (Phase C
   resolve-symbols populates them). Preserved baseline claims
   (refresh case) keep their `symbol_ids` and `symbol_candidates`
   exactly as the baseline has them: resolve-symbols keeps every
   link whose symbol still exists, and a preserved claim without
   candidates (common in CLI-built atlases) could not be re-linked
   if you emptied it.

Phase B complete when atlas.json contains claims from all
extracted manifest sources (subject to refresh-case skip
discipline) AND `source_shas` covers all walked sources.

### Phase B expected wall-clock + session token guidance

Per-source iteration scales linearly with corpus size. Empirical
calibration from CLI Stream A+B+C wall-clock at three reference
repos (v0.8 Stage 2.a CLI baseline):

- **hono** (12 ADRs + ~280 symbols-with-docstrings + ~190 filtered
  commits): ~24 minutes CLI wall-clock equivalent
- **httpx** (10 ADRs + ~200 symbols-with-docstrings + ~3 commits):
  ~12 minutes CLI wall-clock equivalent
- **cobra** (11 ADRs + ~200 symbols-with-docstrings + ~7 commits):
  ~12 minutes CLI wall-clock equivalent

Skill subscription-bounded path consumes session tokens
equivalently. Cohort UX framing: subscription-bounded extraction
takes comparable wall-clock to CLI extraction at subscription
budget cost vs API-bill cost.

If Phase B partially fails mid-iteration (network glitch; user
interrupt; tool error), the per-source idempotence pattern allows
resumption: re-invoke `/index-atlas`; refresh-aware workflow
captures partially-completed atlas.json as baseline; per-source
SHA-diff dispatches sources still needing extraction. Substantively
equivalent to CLI's incremental retry pattern.

## Phase C — Mandatory mechanical-floor gates

After Phase B writes atlas.json, invoke FOUR mandatory CLI gates
in order. Each gate must exit 0 before proceeding to the next.

### Phase C step 1 — MANDATORY validate-atlas gate

```bash
contextatlas validate-atlas
```

If exit code is NON-ZERO, the atlas does NOT conform to canonical
schema. Read the stderr output (contains specific remediation for
each failing invariant — e.g., "Top-level `generator` must be an
object", "Top-level `claims` field missing — but a non-canonical
`sources` array was found instead"). Apply each remediation; re-
write the atlas.json; re-invoke `contextatlas validate-atlas`.
DO NOT proceed to step 2 until validate-atlas exits 0.

### Phase C step 2 — MANDATORY validate-extraction gate (v0.7.1)

```bash
contextatlas validate-extraction
```

This gate enforces extraction-quality invariants beyond shape (per
v0.7.1 Step 1.1.b.0 + Q1.1.G.α substrate-equivalence closure):

- `adr_claims_present`: atlas has ≥1 claim with
  `source.startsWith("adr:")`. Zero ADR claims indicates Phase B
  did not iterate Stream A — re-check Phase A manifest +
  re-execute Phase B step 1.
- `adr_depth_floor`: per-ADR claim count ≥ 8 (calibrated from
  v0.8 Stage 2.a CLI empirical three-repo mean ~12.6 claims/ADR;
  conservative floor at ~64% threshold). Below-floor ADRs indicate
  shallow Phase B extraction call — re-extract those ADRs.
- `source_coverage`: every ADR-shaped entry in `source_shas` (a
  `.md` or `.rst` path) has ≥ 1 claim with matching `source_path`.
  A zero-claim ADR indicates Phase B skipped it mid-iteration —
  re-execute Phase B against the missing sources. Source-file and
  commit entries are exempt (most legitimately yield zero claims).

If exit code is NON-ZERO, read stderr (per-invariant remediation
guidance). Re-execute Phase B against the failing sources;
re-write atlas.json; re-invoke `contextatlas validate-extraction`.
DO NOT proceed to step 3 until validate-extraction exits 0.

### Phase C step 3 — MANDATORY resolve-symbols invocation

```bash
contextatlas resolve-symbols
```

After validate-extraction exits 0, invoke `contextatlas
resolve-symbols`. This CLI subcommand spawns LSP adapters, walks
the codebase, resolves each claim's `symbol_candidates` into
canonical `symbol_ids` via R8 name-form normalization, and writes
the enriched atlas back atomically. **The atlas is INCOMPLETE
without this step** — `symbols[]` remains empty and
`claims[].symbol_ids` stays unpopulated; downstream MCP query
tools (get_symbol_context, find_by_intent, impact_of_change)
cannot operate without resolved symbols. Report stdout output
verbatim to the user — it surfaces the resolved-claim count +
unresolved-candidate count. Zero API cost (local LSP subprocess
only).

### Phase C step 4 — MANDATORY doctor verification

```bash
contextatlas doctor
```

After resolve-symbols completes, invoke `contextatlas doctor` and
report the output to the user. Specifically verify that:
- `atlas.has_symbols` reports PASS with a non-zero symbol count
- `atlas.has_claims` reports PASS with a non-zero claim count
- `atlas.schema_version_compatible` reports PASS

If `atlas.has_symbols` is FAIL, the workflow did NOT complete
successfully — go back and identify which step (resolve-symbols
likely) was skipped or failed; do not report success to the user
until doctor confirms the atlas substrate is canonical.

### Substantive bash invocation rationale

The four Phase C Bash invocations (`validate-atlas`,
`validate-extraction`, `resolve-symbols`, `doctor`) are necessary
subprocess interactions — the CLI subcommands run schema
validation against TypeScript types, depth-floor + coverage
checks against atlas content, spawn LSP adapters, and inspect
filesystem state; none of which Read tool can substitute. The
`Bash(contextatlas:*)` allowlist covers all four. Unlike the
deprecated `show-prompt` / `show-generate-prompt` subcommands
(static content; removed at v0.7 Step 2.3.b.0 per Travis
foundational substrate-consistency framing), these invocations
are load-bearing for cross-path substrate equivalence with the
CLI extraction path.

Phase A also uses one Bash invocation (`list-extraction-sources`)
— same principled boundary: zero-API-cost local source walking
(file walker + LSP symbol inventory + git log filter) that Read
tool cannot substitute (LSP servers are dynamic subprocesses).

## Refresh-aware workflow (cold-start vs incremental refresh)

`/index-atlas` is the canonical Skill entry point for BOTH first-
time atlas construction AND atlas refresh after code/ADR changes.
The workflow dispatches based on whether `.contextatlas/atlas.json`
already exists:

**Cold-start case (no existing `.contextatlas/atlas.json`):**
Full extraction across all three streams. Phase B iterates every
source in the manifest; populates `source_shas` with full
registry; writes atlas with all claims. No SHA-diff gating
applies because there is no baseline to compare against.

**Refresh case (existing `.contextatlas/atlas.json`):**
Phase 4 SHA-diff incremental extraction per ADR-12 substrate.
Phase A reads both the manifest (current state) AND the existing
atlas.json (baseline). Phase B dispatches per source per stream:

1. **Stream A (ADRs)** — for each `adr` in manifest.sources.adrs:
   - If `baseline.source_shas[adr.path] === adr.sha` (UNCHANGED):
     SKIP extraction; preserved claims with matching
     `source_path === adr.path` carry forward unchanged.
   - If `baseline.source_shas[adr.path] !== adr.sha` OR adr.path
     absent from baseline (CHANGED or NEW): EXTRACT via Phase B
     step 1.

2. **Stream B (docstrings)** — for each `docstring` in
   manifest.sources.docstrings:
   - If `baseline.source_shas[docstring.source_path] ===
     docstring.file_sha` (UNCHANGED file): SKIP extraction;
     preserved claims with matching
     `source_path === docstring.source_path` carry forward.
   - If `baseline.source_shas[docstring.source_path] !==
     docstring.file_sha` OR source_path absent from baseline
     (CHANGED or NEW file): EXTRACT via Phase B step 2 for ALL
     docstring entries from that file.
   - File-granularity SHA-diff mirrors the CLI docstring stream's
     per-file SHA gate; changing one symbol in a file re-extracts
     all symbols in that file (cheaper than per-symbol SHA
     tracking).

3. **Stream C (commits)** — for each `commit` in
   manifest.sources.commits:
   - If `baseline.source_shas` has the key `commit.source_key`
     (`"commit:<sha>"`) OR the legacy bare key `commit.sha`
     (written by `/index-atlas` before v1.2): already extracted —
     SKIP. Its preserved claims (`source_path` equal to that key)
     carry forward unchanged, in whichever form the baseline holds
     them. Do not add a second key for the same commit;
     `contextatlas index` migrates bare keys to the canonical form.
   - Otherwise (new filtered commit since last refresh): EXTRACT
     via Phase B step 3 and key it as `commit.source_key` →
     `commit.sha`.

4. **Deleted sources** — drop a baseline source only when it is
   really gone. The manifest does not list everything the atlas
   holds, so a key the manifest does not list is NOT by itself a
   deleted source. For each baseline `source_shas` key that no
   manifest entry matches (`adr.path`, `docstring.source_path`, a
   commit's `source_key` or bare `sha`), apply the first rule that
   fits:
   - **Commit keys** (`"commit:<sha>"`, or a legacy bare 40-hex sha):
     NEVER drop. Commits are immutable; a commit that no longer
     passes the filter or is outside the walked history keeps its
     key and claims (`contextatlas index` never deletes commit keys
     either).
   - **Keys of a stream in `manifest.summary.disabled_streams`**
     (for example every source-file key while `docstring` is
     disabled): NEVER drop. They stay frozen until the stream is
     re-enabled.
   - **Source-file keys** (the docstring stream: a path with a
     source extension such as `.ts`, `.py`, `.go`, `.rb`, `.cs`):
     the manifest lists only files that HAVE docstrings, while
     `contextatlas index` also keys files with no docstrings. Drop
     the key and its claims only when the file no longer exists
     (check the exact path, relative to the manifest's
     `source_root`, with the Glob tool). Otherwise keep both.
   - **ADR keys** (paths under `adrs.path` in `.contextatlas.yml`):
     drop the key and its claims only when the file no longer
     exists (a deleted or renamed ADR). An existing file there that
     the manifest does not list is a docs-bucket note, such as a
     probe-findings page that does not follow an ADR naming
     convention: keep it.
   - **Every other key — docs-bucket prose keys** (`docs.include`
     files such as `README.md`, `DESIGN.md` or other `docs/**`
     pages, extracted by `contextatlas index`; the manifest offers
     this Skill ADRs only): NEVER drop.
   When in doubt, keep: a stale key costs nothing, while a dropped
   key loses claims that only another extraction can rebuild.

5. **Aggregate at Phase B step 4** — final atlas is the union of:
   (a) preserved baseline claims for every source that was not
   re-extracted and is not deleted (unchanged, frozen and kept
   sources),
   (b) newly-extracted claims for CHANGED + NEW sources,
   with (c) baseline claims dropped only for sources rule 4 finds
   deleted. `source_shas` is the union of preserved entries +
   newly-computed SHAs (CHANGED + NEW), with only those deleted-
   source entries removed.

This mirrors the CLI's `contextatlas index` Phase 4 SHA-diff
extraction pattern (per ADR-12 substrate) and substantively bounds
refresh cost — cohort users re-running `/index-atlas` after a
single ADR edit pay only the extraction cost for the one changed
document, not the full corpus.

## Cost model

Claude Code session tokens (subscription-bounded). No Anthropic
API key required, and no API cost. Report the cost model
(subscription-bounded, $0 API cost) to the user in your final
message — Do NOT record it in atlas.json: `cost_usd` and
`cost_model` are non-canonical top-level fields that
`validate-atlas` rejects (see "Schema invariants" above). Per
ADR-02 v0.7 §Consequences cost-accounting-reflects-entry-point
lock.

**Cohort UX framing**: subscription-bounded extraction takes
comparable wall-clock to CLI extraction at subscription budget cost
(no API bill). Session token consumption scales linearly with
corpus size — see Phase B "expected wall-clock + session token
guidance" section above for empirical anchors per reference repo.

## Tool usage

This skill uses Claude Code session tools to perform extraction:

- **Read** for the canonical extraction prompt artifact
  (`.contextatlas/prompts/extraction.md`); the Phase A manifest
  (`.contextatlas/extraction-sources.json`); refresh-case
  existing atlas (`.contextatlas/atlas.json`) and
  `.contextatlas.yml` (`adrs.path`, for refresh rule 4)
- **Glob** for refresh rule 4: checking whether a source file or
  ADR the manifest does not list still exists
- **Write** for `.contextatlas/atlas.json` persistence (claims-only
  stub state in canonical AtlasFileV1 v1.4 shape per "Canonical
  atlas schema" section above)
- **Bash** for:
  - **Phase A (MANDATORY)**: `contextatlas list-extraction-sources
    --output .contextatlas/extraction-sources.json` — walks all 3
    streams via existing main-repo walker substrate; emits JSON
    manifest for Skill consumption
  - **Phase C step 1 (MANDATORY)**: `contextatlas validate-atlas`
    — canonical schema verification; non-zero exit triggers fix +
    re-validate loop
  - **Phase C step 2 (MANDATORY; v0.7.1)**: `contextatlas
    validate-extraction` — depth-floor + coverage verification;
    non-zero exit triggers Phase B re-execution against failing
    sources + re-validate loop
  - **Phase C step 3 (MANDATORY)**: `contextatlas resolve-symbols`
    — LSP bridge; atlas is INCOMPLETE without this step
  - **Phase C step 4 (MANDATORY)**: `contextatlas doctor` — final
    verification; atlas.has_symbols PASS required

The `Bash(contextatlas:*)` allowlist covers all five invocations.
Bundled helper scripts deferred to v0.8+ per v0.7 ship scope.

## Failure modes

- **`.contextatlas/prompts/extraction.md` missing**: user has not
  run `contextatlas init` in this repo (or init failed to copy
  artifacts). Surface remediation: instruct user to run
  `contextatlas init` and retry. Do NOT improvise the prompt.
- **`contextatlas list-extraction-sources` exits non-zero (Phase A
  gate)**: setup failure (missing or invalid config; adapter init
  failure). Read stderr for actionable remediation; do NOT
  proceed to Phase B. Common case: LSP peer dependencies missing
  (`npm install` contextatlas peer deps). A non-git working tree
  or a missing `git` binary does not fail the command: Stream C is
  just empty (stderr shows a warning).
- **Manifest stream empty because it is disabled**: a stream listed
  in `manifest.summary.disabled_streams` (set via
  `extraction.streams` in `.contextatlas.yml`) is empty on
  purpose. Extract nothing for it and keep its baseline keys and
  claims unchanged; this is not a failure.
- **`contextatlas validate-atlas` prints a WARNING about legacy
  bare-sha commit keys**: the baseline atlas holds commits written
  by an `/index-atlas` copy from before v1.2. Harmless (readers
  accept both forms; `contextatlas index` migrates them), and exit
  code 0. Make sure every commit YOU add uses `commit.source_key`.
- **Manifest shape unexpected**: if the Read manifest doesn't
  match the `manifest_version: "1"` expectation, surface the gap
  to the user and stop. Substrate-currency between
  list-extraction-sources output and Skill consumption is load-
  bearing; manifest version mismatch indicates a deployment skew.
- **`contextatlas validate-atlas` exits non-zero (Phase C step 1
  gate)**: read stderr carefully — it contains specific
  remediation for each failing schema invariant. Apply each
  remediation; re-write the atlas.json; re-invoke
  `contextatlas validate-atlas`. DO NOT proceed to step 2 until
  validate-atlas exits 0.
- **`contextatlas validate-extraction` exits non-zero (Phase C step
  2 gate; v0.7.1)**: read stderr per-invariant remediation; identify
  failing invariant(s); re-execute Phase B against the failing
  sources (e.g., re-extract shallow ADRs; re-iterate skipped
  sources); re-write the atlas.json; re-invoke
  `contextatlas validate-extraction`. DO NOT proceed to step 3
  until validate-extraction exits 0.
- **`contextatlas resolve-symbols` exits non-zero**: surface stderr
  output to user with remediation guidance. Common cases: LSP
  adapter init failed (peer dependencies missing — `npm install`
  contextatlas peer deps); atlas malformed (re-validate via
  validate-atlas); config invalid (run `contextatlas doctor` to
  diagnose). User can re-invoke `contextatlas resolve-symbols`
  manually after fixing the issue.
- **`contextatlas doctor` reports `atlas.has_symbols` FAIL (Phase C
  step 4 verification)**: resolve-symbols was likely skipped or
  failed silently. Go back to Phase C step 3 and re-invoke. Do NOT
  report Skill workflow success to the user while atlas.has_symbols
  reports FAIL.
- **Source document missing mid-Phase-B**: log warning; skip the
  document; continue. Phase A produced the manifest snapshot; if a
  source disappears between Phase A and Phase B (rare; race
  condition), graceful skip is correct behavior.
- **Malformed JSON output from per-source reasoning**: log warning
  with first 200 chars of output; skip that source's claims;
  continue. Per-source failure is bounded — other sources' claims
  preserved.
- **Schema validation failure on per-claim shape**: drop malformed
  claims (per-claim granularity); log warning; preserve valid
  claims from same source. validate-atlas Phase C gate catches
  any aggregate shape violations downstream.
- **Persistence write failure (Phase B step 4)**: fail loudly per
  CLAUDE.md "actionable error messages" discipline; surface error
  to user.
- **Phase B partial completion + Skill interrupt**: subsequent
  `/index-atlas` invocation hits the refresh-aware case; preserved
  claims from the partially-written atlas.json carry forward via
  SHA-diff baseline; only un-extracted sources re-execute. Per-
  source idempotence preserved.
