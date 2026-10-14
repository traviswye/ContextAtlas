# Incremental-model calibration: pre-registration (v1.2 Phase 7)

Written 2026-10-14, before any calibration call. The results land in
`RESULTS.md` next to this file. Decision D-3 (v1.2-SCOPE §5) is made
against the criteria below, not against criteria chosen after seeing
the numbers.

## Question

May a cheaper model than `claude-opus-4-7` run Tier 1 (`/refresh-atlas`,
incremental claim refresh) with the frozen `EXTRACTION_PROMPT`?
Tier 2 (`contextatlas index`, `/index-atlas`) is out of scope.

## Cells

| Cell | Model | Request |
|---|---|---|
| baseline | `claude-opus-4-7` | frozen request (no `thinking`, no `output_config`) |
| opus-5-5 | `claude-opus-5-5` | frozen request (the model runs adaptive thinking by default) |
| sonnet-5-5 | `claude-sonnet-5-5` | frozen request (adaptive thinking by default) |
| haiku-5-5 | `claude-haiku-5-5` | frozen request (adaptive thinking by default) |
| opus-5-5-low | `claude-opus-5-5` | frozen request + `output_config.effort: "low"` |
| sonnet-5-5-low | `claude-sonnet-5-5` | frozen request + `output_config.effort: "low"` |

The two `-low` cells change the request body. A pass there would admit
that model only together with that request change.

Every call goes through `createExtractionClient`, i.e. the CLI's own
request, `max_tokens` (16000), response parsing and validation.

## Sample (fixed before any call)

Tier-1-sized sources, 35 calls per cell and trial:
- 12 docstring files, 3 per language, first in sorted path order with
  1 to 4 documented exported symbols: hono (TypeScript), httpx
  (Python), cobra (Go), and a private C# repository (paths only in the
  archive);
- 4 ADRs: hono ADR-03, httpx ADR-04, cobra ADR-03 (benchmark ADRs) and
  ContextAtlas ADR-04;
- 4 commits: the most recent filter-passing commit with a body in hono,
  httpx, cobra and ContextAtlas.

3 trials per cell.

## Measures

- **Parse:** calls that return schema-valid JSON, out of all calls.
  A `max_tokens` stop or a malformed response counts as a failure.
- **Severity, labeled:** the two deprecation commits (httpx, cobra)
  must each yield at least one `hard` claim (v0.3 Step 9 rule).
- **Coverage:** an Opus 4.7 judge reads the source, the baseline trial-1
  claims (reference) and a cell's claims, and scores the fraction of
  the reference's assertions the cell also states (0 to 1). It also
  counts the cell's claims that contradict the source. The judge also
  scores baseline trials 2 and 3 against trial 1, which gives the
  baseline's own run-to-run noise floor.
- **Candidate recall:** of the symbol candidates any baseline trial
  produced for a source, the fraction the cell produced.
- Cost and output tokens per call (list price).

## Pass criteria for Tier 1 (all must hold, per cell)

1. Parse: 100% over all trials.
2. Severity, labeled: 100% (6 of 6 commit-trials).
3. Mean coverage ≥ the baseline noise floor − 0.10.
4. Contradictions per source ≤ the baseline's + 0.25.
5. Candidate recall ≥ the baseline's own trial-to-trial recall − 0.10.

Among passing cells, the recommendation is the cheapest per call. If
none passes, the outcome is D-3 (a): keep Opus 4.7.

## Budget

Cap $35 at list price for extraction plus judging (Travis,
2026-10-14). The harness stops before a call would cross the cap and
reports the run as incomplete.
