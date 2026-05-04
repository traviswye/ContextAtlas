# v0.5 Step 8.1 Production Grading — Execution Summary

**Run UUID:** `151d4281-b779-4777-a934-fb436adf0240`
**Date:** 2026-05-04T13:17:31.108Z
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

## Step 8.1 closure — Path A locked (accept 34/35; document; proceed)

✗ 1 failure: cobra/c3-hook-lifecycle trial-2 base grading. **Reproducible** position-dependent JSON parse failure.

Retry attempt confirmed reproducibility: `STEP8_RESUME_UUID=151d4281-b779-4777-a934-fb436adf0240` re-attempted only the failed pair (per resume-from-failure mechanism); same JudgeParseError on retry. Same trial succeeded in Phase 2 cross-order regrade (entry 5/7). Difference: `forceSwapAB=false` (base; assignment=EVEN; A=ca, B=beta-ca) fails; `forceSwapAB=true` (cross-order; assignment=ODD; A=beta-ca, B=ca) succeeds.

Position-dependent JSON output formatting; distinct from ADR-19 §3 score-based position bias concept (different mechanism: output-formatting compliance varies by A/B assignment vs scores varying systematically by position). Single substrate occurrence at n=28 (3.6%); reproducible when triggered. Documented as Step 8 finding (#6).

**Path A adjudication:** accept 34/35 substrate; cobra/c3 cell at n=4 (paired-t df=3); cell qualitative conclusion (strong ca advantage; factual +1.00; hallucination +1.00) holds at reduced n. Methodology cleanliness preserved (no within-substrate mixing of base + regrade per Path B alternative).

Step 8.2 (position-bias verification) unblocks: pure-math post-hoc analysis via Step 4 position-bias.ts on 27/28 base substrate; cross-order regrades (n=7) excluded from base analysis (control mechanism, not main substrate); conditional style-normalize stretch only if >60/40 trigger fires.

**Cost-tracking note:** failed retry attempt consumed ~$0.013 platform-billed but is not reflected in script-tracked totalCost ($0.4394; only successful grades increment counter). Platform-billed actual ~$0.4524 for Step 8.1 first run + retry. Documented as Step 8 finding (#7); v0.6+ harness refinement candidate.

**Manifest reconstruction note:** the resume retry run inadvertently clobbered manifest.json to entries=[] (resume reset state.manifestEntries; no new successful grades on retry; writeManifest persisted empty array). Manifest reconstructed deterministically from per-pair JSONs via Step 4 anonymize() re-invocation (same inputs → same seeds → same parities → same assignment); 34 entries restored matching disk inventory. Harness patched to read+merge existing manifest at resume start (prevents future clobber).
