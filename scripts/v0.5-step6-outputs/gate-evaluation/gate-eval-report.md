# v0.5 Step 6.3 Gate Evaluation Report

**Date:** 2026-05-03T21:23:37.483Z
**Gate determination:** FAIL

## Three-signal disambiguation per Q5 refinement

### Signal 1: Within-judge consistency (Step 6.1 recap)

| Axis | Within-1-point % | Threshold | Gate |
|---|---:|---:|---|
| factual_correctness | 100.0% | ≥80% | ✓ PASS |
| completeness | 100.0% | ≥80% | ✓ PASS |
| actionability | 100.0% | ≥80% | ✓ PASS |
| hallucination | 100.0% | ≥80% | ✓ PASS |

**Exact-match rate (diagnostic):** 90.0%

Interpretation: rubric-application stability — Sonnet scores the same trial twice with what variance? Step 6.1 PASS at +20pt margin per axis.

### Signal 2: Phase A correlation — Travis priors vs Sonnet canonical-rubric pass-1

**Aggregate Spearman:** 0.7406 (threshold ≥0.6 per ADR-19 §5)

**Per-axis direction agreement (n=5; 10 pair-comparisons each):**

| Axis | Direction agreement % | Threshold | Gate |
|---|---:|---:|---|
| factual_correctness | 20.0% | ≥75% | ✗ FAIL |
| completeness | 40.0% | ≥75% | ✗ FAIL |
| actionability | 40.0% | ≥75% | ✗ FAIL |
| hallucination | 40.0% | ≥75% | ✗ FAIL |

**Per-axis MAD (Travis - Sonnet; positive = Travis grades higher):**

| Axis | MAD | Disclosure band per ADR-19 §2 |
|---|---:|---|
| factual_correctness | 0.80 | Modest offset (0.5-1.5; cite with disclosure) |
| completeness | 0.40 | Tight (≤0.5; cite directly) |
| actionability | 0.60 | Modest offset (0.5-1.5; cite with disclosure) |
| hallucination | 0.40 | Tight (≤0.5; cite directly) |

Interpretation: canonical-rubric-vs-Travis-priors alignment — does Sonnet apply the rubric in a way that matches Travis's intuitive judgment?

## Per-trial side-by-side (5 Travis-graded trials)

Format: Sonnet score / Travis score per axis. Δ shown when nonzero.

| Travis # | WJ idx | Cell | factual S/T (Δ) | complete S/T (Δ) | action S/T (Δ) | halluc S/T (Δ) |
|---|---|---|---|---|---|---|
| 1 | 1 | httpx-p4-ca | 2/2 | 3/3 | 3/3 | 1/1 |
| 2 | 3 | cobra-c3-betaca | 1/3 (+2) | 2/3 (+1) | 2/3 (+1) | 1/0 (-1) |
| 3 | 5 | httpx-p2-betaca | 2/3 (+1) | 3/3 | 2/3 (+1) | 1/0 (-1) |
| 4 | 7 | hono-h1-betaca | 2/2 | 3/3 | 3/3 | 1/1 |
| 5 | 9 | cobra-c4-betaca | 1/2 (+1) | 2/3 (+1) | 2/3 (+1) | 1/1 |

## Findings 2-3 adjudication

### Finding 2 (hallucination=1 pattern from Step 6.1)

**Status:** PARTIALLY-REPRODUCES — Sonnet 1-on-everything; Travis disagrees on 2/5 trials (graded 0)

Pattern (b) Sonnet-driven possibility supported on 2 trials; rubric anchor may apply too strictly OR Travis priors over-charitable. Phase B (rubric-mediated) could disambiguate if triggered.

**Hallucination scores:** Sonnet [1,1,1,1,1] vs Travis [1,0,0,1,1]

### Finding 3 (bitwise determinism from Step 6.1)

**Status:** PARTIAL bitwise determinism (7/10 trials at Step 6.1)

Step 2.4 placeholder-rubric n=2 'full bitwise' framing does NOT generalize cleanly to canonical rubric on n=10 substrate. ADR-19 §2 'approximately-deterministic' framing preserved as accurate; 'fully deterministic' framing ruled out for canonical rubric.

## Gate determination

**STEP 6 GATE FAIL** — failures:

- direction agreement axis factual_correctness: 0.2000 < 0.75
- direction agreement axis completeness: 0.4000 < 0.75
- direction agreement axis actionability: 0.4000 < 0.75
- direction agreement axis hallucination: 0.4000 < 0.75

**Travis adjudication required** per Step 6 design proposal §8 decision tree:
- Branch A: Opus escalation per ADR-19 §2 trigger (cost +$0.20-0.40)
- Branch B: rubric refinement (back to Step 3 prompt revision; +$0.10-0.24 re-run)
- Branch C: descope to statistical-only-rigor framing per scope-doc §Rescope conditions
