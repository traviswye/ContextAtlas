---
name: refresh-atlas
description: Tier 1 incremental claim refresh for ContextAtlas. Re-extracts claims for the sources in the pending queue only (changed ADRs, changed docstring files, new filtered commits), then runs the Skill-path gates. Runs headless through `contextatlas refresh-claims` (subscription-bounded; no API key) or by hand in a Claude Code session. Requires an existing .contextatlas/atlas.json; first-time extraction is /index-atlas or `contextatlas index`.
model: claude-opus-4-7
effort: xhigh
allowed-tools: Read, Write, Edit, Glob, Bash(contextatlas:*)
---

# refresh-atlas — re-extract the pending sources

`contextatlas index --structural` (run by the git hooks) keeps the
local cache's symbols and git signal current and records every source
whose claims are out of date in `.contextatlas/local/pending.json`.
This skill extracts claims for those sources, and only those, and
writes them into `.contextatlas/atlas.json`.

It may run headless (`claude -p`, started by `contextatlas
refresh-claims`). **Never ask the user a question and never wait for
input.** When something blocks you, stop and print one line starting
with `REFRESH-FAILED:` that says what blocked you; do not leave a
half-written atlas.json behind.

Arguments: `$ARGUMENTS` (for example `--max-sources 25`), passed to
`list-extraction-sources` below. Empty means no cap.

This skill reuses `/index-atlas`. Read
`.claude/skills/index-atlas/SKILL.md` once, at the start, for:
- "Canonical atlas schema (v1.4)" and "Schema invariants": the exact
  shape every claim, key and top-level field must have;
- "Phase B" steps 1 to 3: how to extract a claim set from one ADR, one
  docstring entry and one commit, and how to fill each claim's
  `source`, `source_path`, `source_sha`, `symbol_ids` and
  `symbol_candidates`;
- "Phase C": the gate commands and how to react to each failure.

Everything below overrides `/index-atlas` where they differ.

## Step 1 — List the pending sources

```bash
contextatlas list-extraction-sources --pending $ARGUMENTS --output .contextatlas/local/refresh-sources.json
```

A non-zero exit is a setup failure: print `REFRESH-FAILED:` with its
stderr and stop.

Read `.contextatlas/local/refresh-sources.json`. Its `pending` section
says how many sources are queued (`queued`), how many this manifest
covers (`selected`) and how many stay for a later run (`remaining`).
If `pending.selected` is 0, print `REFRESHED nothing pending` and stop
without touching atlas.json.

Then Read `.contextatlas/prompts/extraction.md`: that file's content is
`EXTRACTION_PROMPT`, the frozen prompt. If it is missing, print
`REFRESH-FAILED: .contextatlas/prompts/extraction.md is missing; run
contextatlas init` and stop. Never write a prompt of your own.

Read `.contextatlas/atlas.json` (the baseline). If it does not exist,
print `REFRESH-FAILED: no atlas.json; build it first with /index-atlas
or contextatlas index` and stop.

## Step 2 — Extract each selected source

Every source in the manifest is changed or new; there is no SHA check
to make. Extract them in manifest order (ADRs, then docstrings, then
commits), one `EXTRACTION_PROMPT` reasoning pass per source, exactly
as `/index-atlas` Phase B steps 1 to 3 describe:
- each `sources.adrs` entry: one ADR; key `adr.path` → `adr.sha`;
- the `sources.docstrings` entries of one `source_path`: one pass per
  entry, all of that file's claims together; key `source_path` →
  `file_sha`;
- each `sources.commits` entry: one commit; key `commit.source_key` →
  `commit.sha`, even when it yields no claims.

Each `pending.files_without_docstrings` entry is a source file with no
documented exported symbol left. Extract nothing for it: drop its
claims and key it as `source_path` → `file_sha`.

## Step 3 — Write atlas.json

Start from the baseline and change only the selected sources:
- For every selected source key (ADR path, docstring `source_path`,
  `commit.source_key`, and each `files_without_docstrings` path):
  remove the baseline claims whose `source_path` equals that key, add
  the claims you extracted for it, and set its `source_shas` entry to
  the value given in Step 2.
- Keep every other claim, every other `source_shas` entry, and
  `extracted_at_sha` and `git_commits`, exactly as the baseline has
  them. Do not delete keys of sources the manifest does not list; that
  is not this skill's job.
- Set `generated_at` to the current ISO time, and `symbols` to `[]`
  (step 4 rebuilds it).

Write the whole object to `.contextatlas/atlas.json` with the Write
tool, as JSON you compose directly (no scripts).

## Step 4 — Gates (all must pass)

Run, in this order, each until it exits 0, following `/index-atlas`
Phase C for the remedies:

```bash
contextatlas validate-atlas
contextatlas validate-extraction
contextatlas resolve-symbols
contextatlas validate-atlas
```

You may re-extract a failing source twice. If a gate still fails,
print `REFRESH-FAILED:` with the gate's message and stop;
`contextatlas refresh-claims` restores the previous atlas.json.

## Step 5 — Report

Print one line and stop:

```
REFRESHED adrs=<n> docstring_files=<n> commits=<n> keyed_without_claims=<n> remaining=<pending.remaining>
```

`contextatlas refresh-claims` then recomputes the pending queue, so
you do not edit `.contextatlas/local/pending.json`.
