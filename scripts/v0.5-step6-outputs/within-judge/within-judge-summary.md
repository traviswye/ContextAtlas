# v0.5 Step 6.1 within-judge calibration record

**Status:** PROBE PASS — within-judge thresholds satisfied
**Date:** 2026-05-03T20:48:50.116Z
**Substrate:** 10 Step 9 trials × 2 passes = 20 gradeSingle calls
**Rubric:** RUBRIC_PROMPT_SINGLE canonical (Step 3 commit 6ed89ce)
**Model:** Claude Sonnet 4.6 (default per ADR-19 §2)
**Total cost:** $0.180942

## Per-trial scores (pass-1 vs pass-2)

| Trial | Cell | Cond | Run | Axis | Pass 1 | Pass 2 | Δ |
|---|---|---|---|---|---:|---:|---:|
| trial-01-httpx-p4-ca-r1 | httpx-p4-ca | ca | r1 | factual_correctness | 2 | 2 | 0 |
| trial-01-httpx-p4-ca-r1 | httpx-p4-ca | ca | r1 | completeness | 3 | 3 | 0 |
| trial-01-httpx-p4-ca-r1 | httpx-p4-ca | ca | r1 | actionability | 3 | 3 | 0 |
| trial-01-httpx-p4-ca-r1 | httpx-p4-ca | ca | r1 | hallucination | 1 | 1 | 0 |
| trial-02-httpx-p4-ca-r2 | httpx-p4-ca | ca | r2 | factual_correctness | 1 | 2 | 1 |
| trial-02-httpx-p4-ca-r2 | httpx-p4-ca | ca | r2 | completeness | 3 | 3 | 0 |
| trial-02-httpx-p4-ca-r2 | httpx-p4-ca | ca | r2 | actionability | 2 | 3 | 1 |
| trial-02-httpx-p4-ca-r2 | httpx-p4-ca | ca | r2 | hallucination | 1 | 1 | 0 |
| trial-03-cobra-c3-betaca-r1 | cobra-c3-betaca | beta-ca | r1 | factual_correctness | 1 | 1 | 0 |
| trial-03-cobra-c3-betaca-r1 | cobra-c3-betaca | beta-ca | r1 | completeness | 2 | 2 | 0 |
| trial-03-cobra-c3-betaca-r1 | cobra-c3-betaca | beta-ca | r1 | actionability | 2 | 2 | 0 |
| trial-03-cobra-c3-betaca-r1 | cobra-c3-betaca | beta-ca | r1 | hallucination | 1 | 1 | 0 |
| trial-04-cobra-c3-betaca-r2 | cobra-c3-betaca | beta-ca | r2 | factual_correctness | 1 | 1 | 0 |
| trial-04-cobra-c3-betaca-r2 | cobra-c3-betaca | beta-ca | r2 | completeness | 2 | 2 | 0 |
| trial-04-cobra-c3-betaca-r2 | cobra-c3-betaca | beta-ca | r2 | actionability | 2 | 2 | 0 |
| trial-04-cobra-c3-betaca-r2 | cobra-c3-betaca | beta-ca | r2 | hallucination | 1 | 1 | 0 |
| trial-05-httpx-p2-betaca-r1 | httpx-p2-betaca | beta-ca | r1 | factual_correctness | 2 | 2 | 0 |
| trial-05-httpx-p2-betaca-r1 | httpx-p2-betaca | beta-ca | r1 | completeness | 3 | 3 | 0 |
| trial-05-httpx-p2-betaca-r1 | httpx-p2-betaca | beta-ca | r1 | actionability | 2 | 2 | 0 |
| trial-05-httpx-p2-betaca-r1 | httpx-p2-betaca | beta-ca | r1 | hallucination | 1 | 1 | 0 |
| trial-06-httpx-p2-betaca-r2 | httpx-p2-betaca | beta-ca | r2 | factual_correctness | 2 | 2 | 0 |
| trial-06-httpx-p2-betaca-r2 | httpx-p2-betaca | beta-ca | r2 | completeness | 3 | 3 | 0 |
| trial-06-httpx-p2-betaca-r2 | httpx-p2-betaca | beta-ca | r2 | actionability | 3 | 3 | 0 |
| trial-06-httpx-p2-betaca-r2 | httpx-p2-betaca | beta-ca | r2 | hallucination | 1 | 1 | 0 |
| trial-07-hono-h1-betaca-r1 | hono-h1-betaca | beta-ca | r1 | factual_correctness | 2 | 2 | 0 |
| trial-07-hono-h1-betaca-r1 | hono-h1-betaca | beta-ca | r1 | completeness | 3 | 3 | 0 |
| trial-07-hono-h1-betaca-r1 | hono-h1-betaca | beta-ca | r1 | actionability | 3 | 3 | 0 |
| trial-07-hono-h1-betaca-r1 | hono-h1-betaca | beta-ca | r1 | hallucination | 1 | 1 | 0 |
| trial-08-hono-h1-betaca-r2 | hono-h1-betaca | beta-ca | r2 | factual_correctness | 2 | 2 | 0 |
| trial-08-hono-h1-betaca-r2 | hono-h1-betaca | beta-ca | r2 | completeness | 3 | 3 | 0 |
| trial-08-hono-h1-betaca-r2 | hono-h1-betaca | beta-ca | r2 | actionability | 3 | 3 | 0 |
| trial-08-hono-h1-betaca-r2 | hono-h1-betaca | beta-ca | r2 | hallucination | 1 | 1 | 0 |
| trial-09-cobra-c4-betaca-r1 | cobra-c4-betaca | beta-ca | r1 | factual_correctness | 1 | 1 | 0 |
| trial-09-cobra-c4-betaca-r1 | cobra-c4-betaca | beta-ca | r1 | completeness | 2 | 3 | 1 |
| trial-09-cobra-c4-betaca-r1 | cobra-c4-betaca | beta-ca | r1 | actionability | 2 | 2 | 0 |
| trial-09-cobra-c4-betaca-r1 | cobra-c4-betaca | beta-ca | r1 | hallucination | 1 | 1 | 0 |
| trial-10-cobra-c4-betaca-r2 | cobra-c4-betaca | beta-ca | r2 | factual_correctness | 1 | 1 | 0 |
| trial-10-cobra-c4-betaca-r2 | cobra-c4-betaca | beta-ca | r2 | completeness | 3 | 3 | 0 |
| trial-10-cobra-c4-betaca-r2 | cobra-c4-betaca | beta-ca | r2 | actionability | 3 | 2 | 1 |
| trial-10-cobra-c4-betaca-r2 | cobra-c4-betaca | beta-ca | r2 | hallucination | 1 | 1 | 0 |

## Aggregate within-judge stats per ADR-19 §5

| Axis | Within-1-point % | Exact-match % | MAD | Gate (≥80%) |
|---|---:|---:|---:|---|
| factual_correctness | 100.0% (10/10) | 90.0% (9/10) | 0.10 | ✓ PASS |
| completeness | 100.0% (10/10) | 90.0% (9/10) | 0.10 | ✓ PASS |
| actionability | 100.0% (10/10) | 80.0% (8/10) | 0.20 | ✓ PASS |
| hallucination | 100.0% (10/10) | 100.0% (10/10) | 0.00 | ✓ PASS |

## Finding 3 verification (Step 2 carry-forward)

**Pattern check:** score-level pass-1 vs pass-2 equality per trial
**Bitwise-identical trials:** 7/10 (70.0%)
**Interpretation:** PARTIAL bitwise determinism (7/10 trials)

## Gate evaluation

All 4 axes cleared within-1-point ≥ 80% threshold per ADR-19 §5.
Within-judge consistency component of Step 6 gate: **PASS**.

Step 6.2 (Travis-intuition Phase A) unblocks; Step 6.3 (gate evaluation) follows after Travis grading complete.
