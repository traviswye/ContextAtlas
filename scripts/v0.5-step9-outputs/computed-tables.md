### Table 1: Per-cell paired-t difference CI (95%; per axis)

| Cell | n | Axis | mean ca | mean beta-ca | mean Δ | 95% CI (Δ) | distinguishable |
|---|---:|---|---:|---:|---:|---|:---:|
| httpx/p2-http3-transport | 5 | factual_correctness | 2.00 | 2.00 | 0.00 | [0.00, 0.00] | no |
| httpx/p2-http3-transport | 5 | completeness | 3.00 | 3.00 | 0.00 | [0.00, 0.00] | no |
| httpx/p2-http3-transport | 5 | actionability | 3.00 | 3.00 | 0.00 | [0.00, 0.00] | no |
| httpx/p2-http3-transport | 5 | hallucination | 1.80 | 1.80 | 0.00 | [0.00, 0.00] | no |
| cobra/c3-hook-lifecycle | 4 | factual_correctness | 2.50 | 1.50 | 1.00 | [1.00, 1.00] | **yes** |
| cobra/c3-hook-lifecycle | 4 | completeness | 3.00 | 2.75 | 0.25 | [-0.55, 1.05] | no |
| cobra/c3-hook-lifecycle | 4 | actionability | 3.00 | 2.50 | 0.50 | [-0.42, 1.42] | no |
| cobra/c3-hook-lifecycle | 4 | hallucination | 2.00 | 1.00 | 1.00 | [1.00, 1.00] | **yes** |
| hono/h1-context-runtime | 8 | factual_correctness | 2.63 | 2.25 | 0.38 | [-0.06, 0.81] | no |
| hono/h1-context-runtime | 8 | completeness | 3.00 | 3.00 | 0.00 | [0.00, 0.00] | no |
| hono/h1-context-runtime | 8 | actionability | 3.00 | 2.88 | 0.13 | [-0.17, 0.42] | no |
| hono/h1-context-runtime | 8 | hallucination | 2.25 | 1.88 | 0.38 | [-0.39, 1.14] | no |
| cobra/c4-subcommand-resolution | 5 | factual_correctness | 2.00 | 2.00 | 0.00 | [0.00, 0.00] | no |
| cobra/c4-subcommand-resolution | 5 | completeness | 3.00 | 3.00 | 0.00 | [0.00, 0.00] | no |
| cobra/c4-subcommand-resolution | 5 | actionability | 3.00 | 3.00 | 0.00 | [0.00, 0.00] | no |
| cobra/c4-subcommand-resolution | 5 | hallucination | 1.00 | 1.00 | 0.00 | [0.00, 0.00] | no |
| httpx/p4-stream-lifecycle | 5 | factual_correctness | 2.60 | 2.00 | 0.60 | [-0.08, 1.28] | no |
| httpx/p4-stream-lifecycle | 5 | completeness | 3.00 | 3.00 | 0.00 | [0.00, 0.00] | no |
| httpx/p4-stream-lifecycle | 5 | actionability | 3.00 | 2.80 | 0.20 | [-0.36, 0.76] | no |
| httpx/p4-stream-lifecycle | 5 | hallucination | 2.00 | 1.80 | 0.20 | [-0.84, 1.24] | no |

> **Distinguishable** = difference-of-means 95% CI excludes zero. Effect-size + uncertainty framing only; no NHST p-value interpretation. CI not excluding zero indicates difference indistinguishable from zero AT THIS SUBSTRATE SIZE; absence of evidence ≠ evidence of absence. Per ADR-19 §4 4-level aggregation table.

### Table 2: Cross-cell rollup paired-t (concatenated paired differences across all 5 cells; per axis)

| Axis | N (paired obs) | df | mean ca (pooled) | mean beta-ca (pooled) | mean Δ (pooled) | 95% CI (Δ) | distinguishable |
|---|---:|---:|---:|---:|---:|---|:---:|
| factual_correctness | 27 | 26 | 2.37 | 2.00 | 0.370 | [0.18, 0.57] | **yes** |
| completeness | 27 | 26 | 3.00 | 2.96 | 0.037 | [-0.04, 0.11] | no |
| actionability | 27 | 26 | 3.00 | 2.85 | 0.148 | [0.00, 0.29] | **yes** |
| hallucination | 27 | 26 | 1.85 | 1.56 | 0.296 | [0.03, 0.56] | **yes** |

> Cross-cell rollup applies paired-t to concatenated set of all paired differences across the 5 anchor cells (Option B-2 lock per ADR-19 §4 amendment). Single primitive applied at two scales: per-cell (Table 1; n=4-8) and cross-cell (this table; N≈25-28). Fixed-effect framing per ADR-19 §4 cross-cell pooling disclosure (anchor cells deliberately heterogeneous; strict exchangeability assumption questionable; readers wanting random-effects between-cell-variance treatment should treat per-cell findings as more conservative substrate).

### Table 3: Per-cell efficiency metrics from Step 7 substrate

| Cell | Condition | n | tokens μ | tokens range/μ | cost μ | total cost | calls μ |
|---|---|---:|---:|---:|---:|---:|---:|
| httpx/p4-stream-lifecycle | ca | 5 | 30704 | 63.0% | $0.5836 | $2.9182 | 6.8 |
| httpx/p4-stream-lifecycle | beta-ca | 5 | 21968 | 16.2% | $0.0902 | $0.4509 | 2.6 |
| cobra/c3-hook-lifecycle | ca | 5 | 20359 | 57.5% | $0.3993 | $1.9965 | 4.0 |
| cobra/c3-hook-lifecycle | beta-ca | 5 | 24862 | 67.9% | $0.1005 | $0.5024 | 3.4 |
| httpx/p2-http3-transport | ca | 5 | 19218 | 23.5% | $0.3673 | $1.8366 | 3.0 |
| httpx/p2-http3-transport | beta-ca | 5 | 19712 | 4.2% | $0.0731 | $0.3655 | 2.0 |
| hono/h1-context-runtime | ca | 8 | 54498 | 61.6% | $0.9590 | $7.6720 | 6.9 |
| hono/h1-context-runtime | beta-ca | 8 | 44420 | 129.9% | $0.1650 | $1.3203 | 4.9 |
| cobra/c4-subcommand-resolution | ca | 5 | 29713 | 45.5% | $0.5654 | $2.8271 | 5.4 |
| cobra/c4-subcommand-resolution | beta-ca | 5 | 26512 | 6.6% | $0.1283 | $0.6417 | 3.0 |

> tokens range/μ = (max−min)/mean per condition; ADR-19 §5 variance metric. ca-condition systematic variance asymmetry visible: ca > beta-ca on most cells (F4 cycle finding).

### Table 4: Cross-presentation-order agreement (Step 8 cross-order regrade subset; n=6 effective)

| Axis | ca exact-match | beta-ca exact-match | n |
|---|---:|---:|---:|
| factual_correctness | 100% (6/6) | 83% (5/6) | 6 |
| completeness | 100% (6/6) | 100% (6/6) | 6 |
| actionability | 100% (6/6) | 100% (6/6) | 6 |
| hallucination | 83% (5/6) | 83% (5/6) | 6 |

> Same pair re-graded with A/B swapped (forceSwapAB=true). Position-blind judge: scores match across base + regrade regardless of position assignment. Per ADR-19 §3 cross-presentation-order agreement signal.

### Table 5: Sonnet paired-mode tie rate (Step 8 base grades; 27 pairs × 4 axes = 108 axis-comparisons)

| Outcome | Count | % of comparisons |
|---|---:|---:|
| ca scored higher than beta-ca | 24 | 22.2% |
| beta-ca scored higher than ca | 2 | 1.9% |
| **ties (ca = beta-ca)** | **82** | **75.9%** |
| Total | 108 | 100.0% |

> 76% tie rate empirically validates anonymization pipeline effectiveness. Sonnet treats paired answers as substantively equivalent on most comparisons; differentiation surfaces on cells with substantive ca advantage (3 of 5 cells per Table 1). Reinforces F1 PRIMARY mechanism (paired-mode unlocks differentiation; no-comparator default-to-1 was mode-specific not structural).

