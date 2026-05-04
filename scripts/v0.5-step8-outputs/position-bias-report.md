# v0.5 Step 8.2 Position-Bias Verification Report

**Date:** 2026-05-04T13:29:27.563Z
**Substrate:** 27 base grades from Step 8.1 (Path A; cobra/c3 trial-2 base missing per reproducible JSON parse failure; documented in Step 8.1 retry evidence commit a3388a1)
**Threshold:** strict > 0.6 imbalance per Step 4 position-bias.ts lock
**Trigger condition:** aggregate.imbalance > 0.6

## Per-axis position-bias imbalance

Counts where A scored strictly higher than B vs B strictly higher than A on each axis (ties excluded). Imbalance = max(a_higher, b_higher) / (a_higher + b_higher); 0 if both zero.

| Axis | a_higher | b_higher | ties | imbalance |
|---|---:|---:|---:|---:|
| factual_correctness | 4 | 6 | 17 | 0.600 |
| completeness | 1 | 0 | 26 | 1.000 |
| actionability | 3 | 1 | 23 | 0.750 |
| hallucination | 4 | 7 | 16 | 0.636 |

## Aggregate (pooled across 4 axes)

| Metric | Value |
|---|---:|
| Total a_higher | 12 |
| Total b_higher | 14 |
| Total ties | 82 |
| **Aggregate imbalance** | **0.538** |
| Threshold | 0.60 |
| **Trigger fires?** | **no** |
| n_pairs | 27 |

## Interpretation

Aggregate imbalance 0.538 CLEARS threshold 0.60. Score-based position bias NOT detected.

Sonnet judge is largely position-blind on score axis (consistent with Step 8.1 cross-order agreement signal of 83-100% per axis). ADR-19 §3 expected behavior validated empirically. Style-normalize stretch NOT triggered; Step 8.3 conditional substep skipped.

## Distinction from Step 8 Finding 6

This metric measures SCORE-based position bias (does scoring systematically favor position A or B across pairs?).

Finding 6 (Step 8.1 retry evidence commit a3388a1) describes OUTPUT-FORMATTING asymmetry: Sonnet's JSON output validity varied by A/B assignment on cobra/c3 trial-2 specifically (forceSwapAB=false fails; forceSwapAB=true succeeds). Different mechanism; different metric; different remediation path.

Both findings preserved as separate empirical observations for v0.5 final reporting. Score-based position bias = Step 8.2 substantive; output-formatting asymmetry = Finding 6 substantive.
