# Incremental-model calibration: results (v1.2 Phase 7)

Run 2026-10-14 against `PREREGISTRATION.md` (committed at `bea37fd`
before any call). Harness: `scripts/v1.2-phase7-calibrate.mjs`. Sample
(paths only; the private C# repository is anonymized):
`sample-manifest.json`. Aggregates: `metrics.json`. Raw claims stay
out of the repository because they contain private source text.

- 630 extraction calls (6 cells × 35 calls × 3 trials) plus 340 judge
  calls. Spend: $10.20 at list price (cap $35), plus $0.09 of smoke
  runs.
- Every cell was answered by its own model (`servedBy` in
  `metrics.json`; checked because an earlier smoke run on a stale
  build had silently sent every cell to Opus 4.7).

## Thresholds (from the baseline's own run-to-run noise)

The baseline's trials 2 and 3, scored against its trial 1, gave
coverage 0.976, 0.03 contradictions per source, and candidate recall
0.948. The pre-registered thresholds are therefore:
- coverage ≥ 0.876;
- contradictions ≤ 0.28 per source;
- candidate recall ≥ 0.848.

Parse must be 100% and labeled severity 6/6.

## Results

| Cell | Parse | Labeled severity | Coverage | Contradictions/source | Candidate recall | Claims/call | $/call | Verdict |
|---|---|---|---|---|---|---|---|---|
| baseline (Opus 4.7) | 100% | 6/6 | 0.976 (noise floor) | 0.03 | 0.948 | 2.61 | 0.0201 | reference |
| opus-5-5 | 100% | 6/6 | 0.967 | 0.00 | **0.734** | 2.90 | 0.0160 | fail (recall) |
| opus-5-5-low | 100% | 6/6 | 0.962 | 0.00 | **0.695** | 2.65 | 0.0147 | fail (recall) |
| sonnet-5-5 | **96.2%** (4 malformed JSON) | **5/6** | 0.903 | 0.00 | **0.657** | 2.17 | 0.0081 | fail (parse, severity, recall) |
| sonnet-5-5-low | 100% | 6/6 | 0.934 | 0.00 | **0.659** | 2.00 | 0.0066 | fail (recall) |
| haiku-5-5 | **99.0%** (1 malformed JSON) | **0/6** | 0.972 | 0.03 | **0.816** | 3.38 | 0.0007 | fail (parse, severity, recall) |

## Outcome: D-3 (a), keep `claude-opus-4-7` for Tier 1

No cell meets every pre-registered criterion, so the calibrated model
set is unchanged (`src/config/models.ts`), and `/refresh-atlas` keeps
its `claude-opus-4-7` pin.

## Observations (not part of the decision)

- **Assertion coverage held up; candidate names did not.** Every
  candidate stated nearly all of the baseline's assertions (coverage
  0.90 to 0.97) and contradicted the source no more often than the
  baseline. What failed is candidate recall: the newer models name
  `symbol_candidates` differently from Opus 4.7. Candidates resolve to
  symbols by exact name (`resolveCandidates`), so naming differences
  can cost claim-to-symbol links. That is why recall was pre-registered
  as a criterion.
- **A possible follow-up.** Measure resolved-link recall (candidates
  run through the resolver against each repository's inventory) rather
  than raw candidate strings. If Opus 5.5's candidates resolve as well
  as the baseline's, the recall gap is cosmetic. That would be a new
  pre-registered evaluation; it does not reinterpret this one.
- **Haiku 5.5** never marked a deprecation `hard` (0/6). It also wrote
  the most claims per call (3.38, mostly `context`) and the most output
  tokens (≈1000 per call, adaptive thinking). It is unsuitable for
  extraction under this prompt.
- **Sonnet 5.5 at default effort** returned malformed JSON 4 times in
  105 calls. At `low` effort it parsed cleanly.
- **Cost.** Opus 5.5 would have cut Tier 1 cost about 20% (27% at `low`
  effort) for the same parse and severity behaviour, but it failed
  recall.
