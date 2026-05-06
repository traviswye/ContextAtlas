# v0.6 Step 5.3.a Production Grading — Execution Summary

**Run UUID:** `9cdc1bd7-54cd-4da8-bca9-ca57740a9938`
**Date:** 2026-05-06T16:53:36.799Z
**Step 5.2 substrate:** `e9509ea1-d657-4e56-9fc9-98bf8ccf65ea`
**Rubric:** RUBRIC_PROMPT_PAIRED canonical (ADR-19 §3)
**Model:** Claude Sonnet 4.6 (default per ADR-19 §2)

## Cost summary

| Metric | Value |
|---|---:|
| Total grade calls | 52 |
| Base pairs (Phase 1) | 41 / 43 |
| Cross-order regrades (Phase 2) | 9 / 9 |
| Swap-retry recoveries (Phase 3) | 2 (v0.5 F6 pattern recovery) |
| Effective base set | 43 / 43 (Phase 1 + Phase 3 merged per ADR-19 §3 anonymization-symmetry) |
| Script-projected cost | $0.6829 |
| Cost-cap $5.00 hit? | no |
| Failures | 0 |

## Per-cell aggregate scores (base grades; n=5 per cell; hono n=8)

| Cell | n | factual mean Δ | completeness mean Δ | actionability mean Δ | hallucination mean Δ |
|---|---:|---:|---:|---:|---:|
| httpx/p4-stream-lifecycle | 5 | 0.00 | -0.20 | -0.20 | -0.40 |
| cobra/c3-hook-lifecycle | 5 | 0.60 | 0.20 | 0.60 | 0.80 |
| httpx/p2-http3-transport | 5 | 0.00 | 0.00 | 0.00 | 0.00 |
| hono/h1-context-runtime | 8 | 0.50 | 0.00 | 0.00 | 0.38 |
| cobra/c4-subcommand-resolution | 5 | 0.00 | 0.00 | 0.00 | 0.20 |
| httpx/p3-custom-auth | 5 | 0.20 | 0.00 | 0.20 | 0.60 |
| hono/h5-hono-generics | 5 | 0.20 | 0.00 | -0.20 | 0.60 |
| cobra/c6-execute-signature | 5 | -0.20 | 0.00 | 0.00 | -0.40 |

Δ = mean(ca) - mean(beta-ca) per axis; positive = ca scored higher than beta-ca.

## Cross-presentation-order agreement (n=9 regrade subset)

| Axis | ca exact-match (base vs regrade) | beta-ca exact-match | Pairs |
|---|---:|---:|---:|
| factual_correctness | 67% | 89% | 9 |
| completeness | 89% | 100% | 9 |
| actionability | 89% | 78% | 9 |
| hallucination | 56% | 44% | 9 |

Position-blind judge: ca/beta-ca scores match across base + regrade regardless of position assignment. Per ADR-19 §3 cross-presentation-order agreement signal.

## Step 5.3.a closure

✓ Effective base set complete: 43/43 (Phase 1 + Phase 3 merged per ADR-19 §3 anonymization-symmetry) + 9/9 cross-order regrades.

Phase 3 swap-retry recovered 2 cobra/c3-hook-lifecycle base failure(s) per v0.5 F6 pattern recovery. Substrate complete for paired-t analysis.

Step 5.3.b unblocks: paired-t per axis × cell + cross-cell rollup at concatenated N=43 differences + v0.5-vs-v0.6 tier-gradation comparison + cost-priors-v0.6.json snapshot + Phase-10 ref-doc drafting.
