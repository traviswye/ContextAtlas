# v0.5 Step 7.1 Production Replication — Execution Summary

**Run UUID:** `e46dfd64-cd19-41e5-b6bc-34d1bc65b0b0`
**Date:** 2026-05-03
**Atlas:** ContextAtlas v0.4.0
**Status:** ✓ 56/56 trials complete; 0 failures

## Cost summary

| Metric | Value |
|---|---:|
| Script-projected cost | $20.5310 |
| Platform-billed cost | $9.61 (Travis-reported actual) |
| Cache discount ratio | ~2.14× (platform/script)
| Trials completed | 56/56 |
| Wall-clock | ~40 minutes (sequential)
| Cost-cap trigger (5) | not hit |
| Failures | 0 |

## Per-cell aggregate stats (n=5 base; hono n=8 with auto-stretch)

| Cell | Cond | n | tokens μ | tokens range/μ | cost μ | calls μ | total cost |
|---|---|---:|---:|---:|---:|---:|---:|
| httpx/p4-stream-lifecycle | ca | 5 | 30704 | 63.0% | $0.5836 | 6.8 | $2.9182 |
| httpx/p4-stream-lifecycle | beta-ca | 5 | 21968 | 16.2% | $0.0902 | 2.6 | $0.4509 |
| cobra/c3-hook-lifecycle | ca | 5 | 20359 | 57.5% | $0.3993 | 4.0 | $1.9965 |
| cobra/c3-hook-lifecycle | beta-ca | 5 | 24862 | 67.9% | $0.1005 | 3.4 | $0.5024 |
| httpx/p2-http3-transport | ca | 5 | 19218 | 23.5% | $0.3673 | 3.0 | $1.8366 |
| httpx/p2-http3-transport | beta-ca | 5 | 19712 | 4.2% | $0.0731 | 2.0 | $0.3655 |
| hono/h1-context-runtime | ca | 8 | 54498 | 61.6% | $0.9590 | 6.9 | $7.6720 |
| hono/h1-context-runtime | beta-ca | 8 | 44420 | 129.9% | $0.1650 | 4.9 | $1.3203 |
| cobra/c4-subcommand-resolution | ca | 5 | 29713 | 45.5% | $0.5654 | 5.4 | $2.8271 |
| cobra/c4-subcommand-resolution | beta-ca | 5 | 26512 | 6.6% | $0.1283 | 3.0 | $0.6417 |

## Variance triggers per ADR-19 §5 (range/mean on per-condition tokens at n=5 base)

| Cell | ca tokens range/μ | beta-ca tokens range/μ | Trigger |
|---|---:|---:|---|
| httpx/p4-stream-lifecycle | 63.0% | 16.2% | TRIGGERS |
| cobra/c3-hook-lifecycle | 57.5% | 67.9% | TRIGGERS |
| httpx/p2-http3-transport | 23.5% | 4.2% | TRIGGERS |
| hono/h1-context-runtime | 51.3% | 104.6% | TRIGGERS (hono auto-stretched per pre-flag) |
| cobra/c4-subcommand-resolution | 45.5% | 6.6% | TRIGGERS |

## Per-trial breakdown

### httpx/p4-stream-lifecycle (Theme 1.2 fix)

| Trial | Cond | tokens | calls | cost | wall (s) | stretch |
|---|---|---:|---:|---:|---:|---|
| 0 | beta-ca | 24126 | 3 | $0.1065 | 38.6 |  |
| 0 | ca | 42992 | 7 | $0.7792 | 38.7 |  |
| 1 | beta-ca | 23359 | 3 | $0.0937 | 33.9 |  |
| 1 | ca | 28727 | 8 | $0.5692 | 35.6 |  |
| 2 | beta-ca | 20726 | 2 | $0.0795 | 37.8 |  |
| 2 | ca | 23636 | 5 | $0.4702 | 30.8 |  |
| 3 | beta-ca | 20557 | 3 | $0.0832 | 39.5 |  |
| 3 | ca | 28906 | 8 | $0.5476 | 31.6 |  |
| 4 | beta-ca | 21074 | 2 | $0.0879 | 40.5 |  |
| 4 | ca | 29259 | 6 | $0.5519 | 31.4 |  |

### cobra/c3-hook-lifecycle (win-bucket)

| Trial | Cond | tokens | calls | cost | wall (s) | stretch |
|---|---|---:|---:|---:|---:|---|
| 0 | beta-ca | 22018 | 3 | $0.1024 | 52.5 |  |
| 0 | ca | 23435 | 5 | $0.4487 | 29.6 |  |
| 1 | beta-ca | 37619 | 5 | $0.1350 | 55.1 |  |
| 1 | ca | 16185 | 4 | $0.3322 | 26.3 |  |
| 2 | beta-ca | 20744 | 3 | $0.0877 | 47.8 |  |
| 2 | ca | 17105 | 3 | $0.3420 | 28.7 |  |
| 3 | beta-ca | 22152 | 3 | $0.0894 | 50.1 |  |
| 3 | ca | 17168 | 3 | $0.3477 | 30.6 |  |
| 4 | beta-ca | 21776 | 3 | $0.0877 | 51.0 |  |
| 4 | ca | 27900 | 5 | $0.5258 | 33.2 |  |

### httpx/p2-http3-transport (win-bucket)

| Trial | Cond | tokens | calls | cost | wall (s) | stretch |
|---|---|---:|---:|---:|---:|---|
| 0 | beta-ca | 20004 | 2 | $0.0758 | 31.1 |  |
| 0 | ca | 17611 | 3 | $0.3392 | 21.8 |  |
| 1 | beta-ca | 19242 | 2 | $0.0745 | 31.6 |  |
| 1 | ca | 21861 | 3 | $0.4202 | 28.1 |  |
| 2 | beta-ca | 20063 | 2 | $0.0733 | 33.9 |  |
| 2 | ca | 17639 | 3 | $0.3413 | 22.8 |  |
| 3 | beta-ca | 19300 | 2 | $0.0707 | 33.8 |  |
| 3 | ca | 21629 | 3 | $0.4065 | 25.1 |  |
| 4 | beta-ca | 19949 | 2 | $0.0711 | 31.6 |  |
| 4 | ca | 17352 | 3 | $0.3295 | 22.1 |  |

### hono/h1-context-runtime (win-bucket; outlier; auto-stretched n=8)

| Trial | Cond | tokens | calls | cost | wall (s) | stretch |
|---|---|---:|---:|---:|---:|---|
| 0 | beta-ca | 30396 | 4 | $0.1590 | 65.0 |  |
| 0 | ca | 61223 | 9 | $1.0632 | 51.6 |  |
| 1 | beta-ca | 43742 | 5 | $0.1569 | 66.3 |  |
| 1 | ca | 46367 | 5 | $0.8336 | 46.2 |  |
| 2 | beta-ca | 64724 | 7 | $0.1919 | 74.6 |  |
| 2 | ca | 43226 | 5 | $0.7872 | 47.2 |  |
| 3 | beta-ca | 32297 | 5 | $0.1759 | 72.4 |  |
| 3 | ca | 64770 | 9 | $1.1407 | 55.1 |  |
| 4 | beta-ca | 83694 | 7 | $0.2101 | 75.4 |  |
| 4 | ca | 38682 | 6 | $0.7023 | 41.2 |  |
| 5 | beta-ca | 26004 | 3 | $0.1250 | 64.1 | yes |
| 5 | ca | 48914 | 6 | $0.8859 | 48.5 | yes |
| 6 | beta-ca | 27456 | 3 | $0.1352 | 64.1 | yes |
| 6 | ca | 60574 | 7 | $1.0471 | 47.0 | yes |
| 7 | beta-ca | 47047 | 5 | $0.1661 | 66.0 | yes |
| 7 | ca | 72231 | 8 | $1.2119 | 44.9 | yes |

### cobra/c4-subcommand-resolution (Theme 1.1 closure)

| Trial | Cond | tokens | calls | cost | wall (s) | stretch |
|---|---|---:|---:|---:|---:|---|
| 0 | beta-ca | 26550 | 3 | $0.1258 | 60.4 |  |
| 0 | ca | 35801 | 8 | $0.6795 | 44.0 |  |
| 1 | beta-ca | 26369 | 3 | $0.1200 | 57.7 |  |
| 1 | ca | 29612 | 5 | $0.5611 | 37.3 |  |
| 2 | beta-ca | 26789 | 3 | $0.1234 | 60.5 |  |
| 2 | ca | 29386 | 5 | $0.5456 | 33.7 |  |
| 3 | beta-ca | 27301 | 3 | $0.1466 | 73.9 |  |
| 3 | ca | 22283 | 4 | $0.4404 | 35.3 |  |
| 4 | beta-ca | 25552 | 3 | $0.1258 | 62.3 |  |
| 4 | ca | 31485 | 5 | $0.6005 | 41.1 |  |

## Hono h1 catastrophic-variance observation

Hono h1 beta-ca triggers ADR-19 §5 catastrophic threshold (>100% range/mean on tokens at n=5: 104.6%; persists post-stretch n=8).

Per-trial token sequence (beta-ca, n=8): 30396, 43742, 64724, 32297, 83694, 26004, 27456, 47047

Pattern: bimodal exploration — some trials terminate at ~26-32k tokens (efficient path); others sprawl to ~64-84k (extended exploration). Structural property of model + prompt + condition interaction; intrinsic variance not n-driven. Stretching to n=8 did NOT reduce variance (range expanded from baseline n=5).

Per scope-doc §Rescope conditions: variance >100% triggers escalate. **Travis adjudication required.**

## Non-hono variance triggers

Four non-hono cells trigger >20% variance on at least one condition:

- **httpx/p4-stream-lifecycle**: ca=63.0% / beta-ca=16.2%
- **cobra/c3-hook-lifecycle**: ca=57.5% / beta-ca=67.9%
- **httpx/p2-http3-transport**: ca=23.5% / beta-ca=4.2%
- **cobra/c4-subcommand-resolution**: ca=45.5% / beta-ca=6.6%

Pattern: ca-condition (atlas tools) more variable than beta-ca (baseline tools); structural — atlas-mediated exploration finds different paths trial-to-trial; baseline grep/read more deterministic. Per Q7 lock: Travis adjudicates stretch decision.

## Step 7.2 / 7.3 / 7.4 unblock

Step 7.1 closes with substrate generation complete. Step 7.2 (stretch adjudication) requires Travis adjudication on:
1. Hono h1 catastrophic variance: ship with disclosure (Branch D-equivalent)? Stretch further? Methodology reconsideration?
2. Four non-hono cells variance triggers: stretch all? Stretch worst (cobra c3 at 67.9% beta-ca)? Accept variance + ship with disclosure?

After Travis adjudication, Step 7.3 (audit + verification) and Step 7.4 (close commit) follow.
