# v0.5 Step 8.1 Production Grading — Execution Summary

**Run UUID:** `151d4281-b779-4777-a934-fb436adf0240`
**Date:** 2026-05-04T12:57:45.637Z
**Step 7 substrate:** `e46dfd64-cd19-41e5-b6bc-34d1bc65b0b0`
**Rubric:** RUBRIC_PROMPT_PAIRED canonical (Step 3 commit 6ed89ce)
**Model:** Claude Sonnet 4.6 (default per ADR-19 §2)

## Cost summary

| Metric | Value |
|---|---:|
| Total grade calls | 34 |
| Base pairs | 27 / 28 |
| Cross-order regrades | 7 / 7 |
| Script-projected cost | $0.4394 |
| Cost-cap $5.00 hit? | no |
| Failures | 1 |

## Per-cell aggregate scores (base grades; n=5 per cell; hono n=8)

| Cell | n | factual mean Δ | completeness mean Δ | actionability mean Δ | hallucination mean Δ |
|---|---:|---:|---:|---:|---:|
| httpx/p4-stream-lifecycle | 5 | 0.60 | 0.00 | 0.20 | 0.20 |
| cobra/c3-hook-lifecycle | 4 | 1.00 | 0.25 | 0.50 | 1.00 |
| httpx/p2-http3-transport | 5 | 0.00 | 0.00 | 0.00 | 0.00 |
| hono/h1-context-runtime | 8 | 0.38 | 0.00 | 0.13 | 0.38 |
| cobra/c4-subcommand-resolution | 5 | 0.00 | 0.00 | 0.00 | 0.00 |

Δ = mean(ca) - mean(beta-ca) per axis; positive = ca scored higher than beta-ca.

## Cross-presentation-order agreement (n=7 regrade subset)

| Axis | ca exact-match (base vs regrade) | beta-ca exact-match | Pairs |
|---|---:|---:|---:|
| factual_correctness | 100% | 83% | 6 |
| completeness | 100% | 100% | 6 |
| actionability | 100% | 100% | 6 |
| hallucination | 83% | 83% | 6 |

Position-blind judge: ca/beta-ca scores match across base + regrade regardless of position assignment. Per ADR-19 §3 cross-presentation-order agreement signal.

## Step 8.1 closure

✗ 1 failures or incomplete grading (34/35).
Step 8.2 blocked until grading complete; investigate failures; re-run via STEP8_RESUME_UUID.
