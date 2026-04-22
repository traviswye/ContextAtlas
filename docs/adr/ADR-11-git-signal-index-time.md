---
id: ADR-11
title: Git signal is extracted at index time, stored in atlas.json, served from SQLite at query time
status: accepted
severity: hard
symbols:
  - extractGitSignal
  - runExtractionPipeline
  - importAtlas
  - exportAtlas
  - buildBundle
  - handleImpactOfChange
  - git_commits
  - git_file_commits
---

# ADR-11: Git signal is extracted at index time, stored in atlas.json, served from SQLite at query time

## Context

Step 10 of the MVP plan wires git data into the bundle:

- `get_symbol_context` gains a `git` signal — `lastTouched`,
  `recentCommits`, `hot`.
- `impact_of_change` (step 11) composes over that same substrate
  plus a file-level **co-change** lookup — "files historically
  changed alongside this one."

Both tools are query-time surfaces. The design question is where
git reasoning happens. Four axes need locking before coding, plus
the response shape, the interaction with ADR-08's external-roots
model, and a staleness story for the committed artifact:

1. **Index-time vs query-time.** Run `git log` per MCP call, or
   snapshot git data during extraction and serve from storage?
2. **Hot/cold definition.** What counts as "hot"? Recent-commit
   count, author-breadth, elapsed days?
3. **Co-change algorithm.** How to compute "files that change
   together with this one"?
4. **Attribution granularity.** File-level or symbol-level?
5. **Response shape.** How does git data land in the bundle and
   in `impact_of_change`'s output?
6. **Interaction with ADR-08.** Git runs in the source tree; ADR-08
   separates config root from source root. Which root drives git?
7. **Staleness.** The committed atlas pins git state at extraction
   time; the working tree advances past it. How do users notice
   and update?

## Decision

### Substrate: index-time extraction, storage-backed at query time

Git data is extracted during the extraction pipeline (step 5 of
the build order, now bearing a git phase) and lives in SQLite +
atlas.json. No MCP tool shells out to `git` at query time. This
mirrors the extraction-pipeline discipline of ADR-02: expensive
index-time reasoning, cheap query-time lookups.

Extraction runs `git log -500 --no-merges --name-only --pretty=...`
as a subprocess against `repoRoot`. The output is parsed into
commit records (sha, date ISO-8601, subject, author email) plus
the list of files each commit touched. Merge commits are dropped
— they inflate co-change without representing real edits.

The 500-commit window is per-extraction, not per-symbol. One
subprocess call produces enough history to serve every symbol in
the repo. The cap prevents unbounded growth on long-lived repos
while still covering multi-quarter history for typical projects.

### Storage model — atlas.json v1.1 + derived local cache

The committed team artifact stores git data as a compact commit
list. The local SQLite cache derives a file→commit index from it
on import. Storage is lossless-round-trip per ADR-06:
`atlas.json → SQLite → atlas.json` produces a byte-identical file.

**atlas.json additions (version bumps to `"1.1"`):**

```jsonc
{
  "version": "1.1",
  "generated_at": "...",
  "extracted_at_sha": "a1b2c3d...",        // git HEAD when extraction ran
  "generator": { ... },
  "source_shas": { ... },
  "symbols": [ ... ],
  "claims": [ ... ],
  "git_commits": [                          // NEW
    {
      "sha": "a1b2c3d",
      "date": "2026-04-20T14:02:11Z",
      "message": "fix: handle retry on idempotency conflict",
      "author_email": "alice@example.com",
      "files": ["src/orders/processor.ts", "src/orders/queue.ts"]
    }
  ]
}
```

`git_commits` is sorted by `date` descending (newest first);
`files` within each commit is sorted ascending. Deterministic
ordering keeps diffs reviewable.

**SQLite schema v3 (new migration):**

```sql
CREATE TABLE git_commits (
  sha           TEXT PRIMARY KEY,
  date          TEXT NOT NULL,        -- ISO-8601
  message       TEXT NOT NULL,
  author_email  TEXT NOT NULL
);

CREATE TABLE git_file_commits (
  file_path     TEXT NOT NULL,
  commit_sha    TEXT NOT NULL,
  PRIMARY KEY (file_path, commit_sha),
  FOREIGN KEY (commit_sha) REFERENCES git_commits(sha)
);

CREATE INDEX idx_git_file_commits_file ON git_file_commits(file_path);
```

Atlas stores `git_commits` with embedded `files` arrays; the
local cache **derives** `git_file_commits` on import by flattening
those arrays. Round-trip is lossless because export reconstructs
`files` by joining `git_file_commits` back to the commit row. This
saves atlas bytes (one row per commit rather than one row per
commit×file) and lets the query path run against a pre-indexed
file-pivoted table.

Co-change is computed on-the-fly by self-join on `git_file_commits`:

```sql
SELECT gfc2.file_path AS other_file, COUNT(*) AS co_count
FROM git_file_commits gfc1
JOIN git_file_commits gfc2
  ON gfc1.commit_sha = gfc2.commit_sha
 AND gfc1.file_path != gfc2.file_path
WHERE gfc1.file_path = ?
GROUP BY gfc2.file_path
ORDER BY co_count DESC
LIMIT ?
```

With 500 commits × ~5 files/commit = ~2,500 rows, the self-join
runs in single-digit milliseconds. A pre-computed
`git_cochange` cache table is deliberately **not** shipped for
v0.1 — it's a post-MVP optimization if benchmark evidence shows
the self-join dominates query latency.

### Hot/cold: commit-count threshold against the extraction window

A file is **hot** when it appears in `≥ config.git.recentCommits`
distinct commits within the 500-commit extraction window. The
config's existing `git.recentCommits` field (already used by the
bundle for "show N recent commits") doubles as the hotness
threshold. One knob, one meaning.

This is an intentionally coarse signal. Alternatives considered:

- **Elapsed-days threshold** (e.g. "touched in last 30 days") —
  rejected because it re-introduces a clock dependency at query
  time. Index-time freezes the window at extraction, so a repo
  that's been idle for six weeks would report "not hot" on any
  file even if three people landed changes on the same file the
  day before extraction. Commit-count against the extraction
  window is author-activity-proportional rather than calendar-
  proportional, which matches the question users actually ask.
- **Author-breadth** (≥ N distinct authors) — rejected as v0.1
  scope. Post-MVP if the coarse signal proves too noisy.

### Attribution granularity: file-level, always

Git operates on files. The symbol → git mapping is **one-hop via
`symbol.path`**. A symbol's `lastTouched`, `recentCommits`, and
`hot` are all computed from the file's commit history. No
line-range blame, no hunks-that-intersect-signature heuristics.

Rationale:

- Line-level blame is expensive (per-symbol per-query), unstable
  under formatting churn, and wrong under refactors (rename moves
  lines without changing intent).
- File-level is what users actually ask: "is this file hot?",
  "who else touches this file?". The symbol is the lookup key;
  the file is the signal axis.
- Matches how the intent layer works: claims attach to symbols,
  but the signal that populates them (the ADR's text) is
  file-level.

### Response shape

**`get_symbol_context` gains a populated `git` block:**

```
GIT
  last_touched: 2026-04-12T14:02:11Z by alice@example.com
  hot: yes (17 commits in window)
  recent_commits:
    - a1b2c3d 2026-04-12 fix: handle retry on idempotency conflict
    - b2c3d4e 2026-04-10 refactor: extract retry predicate
    - c3d4e5f 2026-04-08 test: cover stale-lock case
```

Shape matches the `git` field already declared in
`src/types.ts`'s `SymbolContextBundle`. The `hot: yes (N commits)`
rendering carries the threshold into the output so consumers
understand why it's hot without re-reading the config.

**`impact_of_change` gains a `GIT_COCHANGE` block and a
`RISK_SIGNALS` block**, specified in full in step-11 scope:

```
IMPACT sym:ts:src/orders/processor.ts:OrderProcessor
  GIT_COCHANGE (top 5)
    src/orders/queue.ts        12 commits
    src/orders/types.ts         9 commits
    test/orders.test.ts         7 commits
    src/billing/charges.ts      3 commits
    src/config.ts               2 commits
  RISK_SIGNALS
    hot: yes (17 commits in window)
    test_coverage: 2 test files referenced
    diagnostics: 0
    intent_density: 3 hard claims
  ... (primitive-style refs/intent/tests blocks follow)
```

Compact by default; JSON available via the existing `format`
input parameter (ADR-09 pattern).

### Interaction with ADR-08

Git always runs against **`repoRoot`**, never `configRoot`. The
subprocess `git log -C <repoRoot> ...` (or `cwd: repoRoot`) is
unambiguous. A benchmarks-style setup where config lives in a
separate repo still drives the pipeline against the target
source tree's git history, not the benchmarks repo's. This is
the symmetric case to ADR-08's source-vs-prose split: source
paths and source-file git history live together; ADRs and docs
live wherever the author put them.

If `repoRoot` is not inside a git working tree (detected by
absence of `.git/` ancestor, or `git rev-parse` non-zero exit),
the git phase logs a warning and records zero commits. The
pipeline completes; the bundle omits the `git` block for every
symbol. No hard failure — git absence is a legitimate state
(fresh checkout not yet initialized, tarball deployments) that
shouldn't block extraction.

### Staleness detection and update workflow

The committed atlas pins git state at extraction time — the
`extracted_at_sha` field above. The working tree advances past
that SHA as developers land commits. Without a staleness signal,
a team member running queries against yesterday's atlas can't
tell whether they're seeing current history.

**Atlas metadata.** Extraction records the current git HEAD SHA
in `atlas.extracted_at_sha` at the top level of `atlas.json`. The
field is optional on read so pre-1.1 atlases load unchanged; it
is always written on extract.

**Staleness detection CLI.** The binary accepts a `--check` flag:

```
contextatlas --check
```

`--check` loads the committed atlas, reads `extracted_at_sha`,
and compares against `git rev-parse HEAD`. Exits `0` when equal
(atlas is current), `1` when they differ (atlas is stale or
newer), `2` when the atlas has no `extracted_at_sha` (pre-1.1)
or the repo is not a git tree. The exit code is the whole
contract — no dependency on stdout parsing. `--check` does not
start the MCP server or the adapters; it's a cheap metadata
read.

**Staleness is advisory, not blocking.** A stale atlas still
serves queries. It's correct about symbols and claims up to its
extraction SHA, and its git signal is bounded to that window.
Consumers who care (CI, pre-push hooks) run `--check` and act
on the exit code; queries on a stale atlas still return useful
data.

**Update workflows — primitives, not policy.** ContextAtlas ships
the primitives (`--check`, re-run extraction, commit the
regenerated atlas) and deliberately does not prescribe a
workflow. Four shapes teams can compose:

- **CI-driven.** A scheduled or post-merge workflow runs
  extraction on `main`, opens a PR if `atlas.json` changed. Most
  robust against human forgetfulness; adds API-call latency to
  the merge cadence.
- **Pre-commit hook.** Fail the commit if `--check` is non-zero
  and the diff touches source files. Keeps the atlas sync'd
  with each change, at the cost of per-commit extraction time.
- **Pre-push hook.** Cheaper than pre-commit; batches extraction
  to push boundaries. Accepts that intermediate commits in a
  push carry a stale atlas.
- **Manual.** Run `contextatlas --reindex` (or the equivalent
  script entry) when a human notices the atlas is behind.
  Lowest friction, highest drift risk.

DESIGN.md will carry worked examples for each shape; the ADR
stays neutral on which teams should adopt.

**Git signal re-extraction is full each run, not SHA-incremental.**
Unlike prose files (where SHA-diff gates re-extraction because
Opus calls are expensive), git log is subprocess-fast — seconds,
not minutes, for a 500-commit window. The git phase always
rebuilds `git_commits` + `git_file_commits` from a fresh
`git log` on every extraction run. No incremental merge logic,
no partial updates, no "just append commits newer than SHA X"
path. Simpler, consistent, and side-steps the "what if history
was force-pushed / rebased" edge cases that SHA-incremental
updates introduce.

Prose extraction remains SHA-incremental per DESIGN.md — only
Opus-backed stages pay the unchanged-skip optimization because
they're the expensive stages.

## Rationale

- **Index-time over query-time.** Query-time git means every MCP
  call spawns a subprocess, blocks on its output, and re-parses
  history that doesn't change between calls. Index-time means
  one parse per extraction, cheap DB reads per query, and a
  fully deterministic offline-reproducible atlas. The latency
  win compounds with `impact_of_change` which needs the
  self-join over file→commit pairs.
- **Storage as commits + derived pivot, not pre-joined.** Storing
  `git_commits` with embedded `files` arrays in atlas.json keeps
  the artifact compact and human-reviewable in PRs. Deriving
  `git_file_commits` on import lets SQL do its job. A
  pre-computed `git_cochange` cache is tempting but premature —
  the self-join is fast on 500-commit windows, and a cache adds
  invalidation complexity without measured need.
- **File-level attribution only.** Symbol-level git attribution
  via blame is a rabbit hole (line-hunk heuristics, rename
  tracking, formatting noise) that would cost weeks for a signal
  that answers a question users aren't asking. "Is this file
  hot?" is the real question. Symbols map to files; files have
  git history.
- **Commit-count hotness against the extraction window.** An
  absolute-calendar threshold (days) re-introduces a clock
  dependency at query time and reports "not hot" for quiet
  projects with recent concentrated activity. Commit-count
  against the extraction window is author-activity-proportional
  — it measures "how contentious is this file in recent
  development" rather than "has anyone touched this file
  lately."
- **`extracted_at_sha` + `--check`, no forced re-index.**
  Teams have legitimate reasons to run a slightly-stale atlas
  (benchmarks, debugging a specific historical state, API-key
  scarcity). Making staleness advisory rather than blocking
  respects those cases. `--check` gives CI and hook authors
  the primitive they need to build whatever policy they prefer.
- **Full git re-extract per run.** The cost differential
  between full-rebuild and SHA-incremental for `git log` is
  negligible (seconds either way). The correctness differential
  is large — incremental merges of rewritten history (force
  push, rebase, squash) are a notorious source of subtle bugs.
  Matching the "prose uses SHA-diff because Opus is expensive"
  logic would be cargo-culting a pattern whose motivation
  doesn't apply.
- **ADR-08 symmetry.** Source + source-file git history share a
  root; ADRs + docs share a separate one. The split that ADR-08
  introduced for prose paths maps cleanly onto git: git follows
  source, not config.

## Consequences

- `ATLAS_VERSION` bumps from `"1.0"` to `"1.1"`. The storage
  layer accepts both — reading a v1.0 atlas still works; it
  just lacks the `git_commits` / `extracted_at_sha` fields.
  Every fresh extraction writes v1.1.
- `atlas.json` grows by commits × 80 bytes + files × 60 bytes
  (rough). For a typical 500-commit repo with 5 files per
  commit, that's ~190KB of git data. Acceptable for a
  team-artifact committed to git; the existing symbol + claim
  payload dominates for non-trivial repos anyway.
- Schema migration v3 is additive — no touches to v1 or v2
  tables. Existing atlases read into v1/v2 state; v3 tables
  start empty. First re-extraction populates them.
- `runExtractionPipeline` gains a git phase between source
  indexing and claim writing. The phase is idempotent — running
  it on an up-to-date atlas re-walks the same 500 commits and
  produces byte-identical tables.
- `buildBundle` picks up a populated `git` block when the signal
  is in `include`. `DEFAULT_SIGNALS` adds `"git"` — the
  primitive's "return everything in one call" philosophy finally
  covers every declared axis.
- `impact_of_change` handler stops being a placeholder. The
  compact IMPACT block format above is load-bearing for step 11
  tests; any drift requires an ADR amendment.
- A new `--check` CLI path exists alongside `--config-root` /
  `--config`. The binary's normal startup is unaffected —
  `--check` is a short-circuit mode that exits before MCP setup.
- Benchmarks can now attribute test-wins on "hot file" and
  "co-change" queries. The RUBRIC.md impact-of-change bucket
  has a non-trivial tool to measure.
- Repos without git (bare checkouts, tarballs, fresh clones
  with no `.git`) produce atlases whose `git_commits` is empty
  and whose `extracted_at_sha` is absent. Bundles omit the
  `git` block for every symbol. No hard failure.

## Non-goals

- **Line-level blame or hunk-intersection symbol attribution.**
  File-level is the attribution granularity. Refinement is
  post-MVP and evidence-gated.
- **Unbounded-history ingestion.** 500 commits is the cap.
  Configurable maximum is post-MVP; 500 is enough for MVP
  benchmarks and bounds atlas size.
- **Author-breadth, churn-velocity, or calendar-days
  hotness.** Single coarse `hot: bool` with commit-count
  rationale. Additional signals are post-MVP.
- **Pre-computed `git_cochange` cache table.** Self-join on
  500-commit windows is fast enough for MVP. Ship a cache if
  benchmarks show latency dominated by co-change queries.
- **Per-symbol commit filtering via semantic-matching on
  commit messages.** `impact_of_change` uses file-level
  co-change, not "commits whose message mentions this symbol."
  Message-mining is a separate feature if evidence ever asks.
- **Non-`git` VCS backends.** `hg`, `fossil`, `svn` are out.
  The extractor shells out to `git`; other VCS support would
  be a separate ADR with its own extraction path.
- **Query-time `git log` calls.** Hard boundary. If a query
  needs fresh git data, the user re-runs extraction.
- **Forced re-indexing on staleness.** `--check` exits non-zero;
  `--check --force-reindex` is not a v0.1 flag. Teams decide
  whether staleness is blocking in their own workflow.
