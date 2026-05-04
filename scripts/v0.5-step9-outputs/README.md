# v0.5 Step 9 Outputs — Main-Repo Audit-Trail Copy

This directory is a main-repo audit-trail copy + navigation aid
for v0.5 Step 9 (Phase-9 reference doc). Canonical artifacts
(reference doc + doc-gen script) live in the benchmarks repo;
this directory captures load-bearing computed substrate for
verification + main-repo cycle-close completeness.

## Cycle thesis evidence summary

V0.5 cycle thesis ("methodology defensible under peer review")
substantively supported per Option α strict three-tier framing.
Cross-cell rollup paired-t at N=27:

- **1 axis CLEAN distinguishable** (factual_correctness; LB
  0.176; mean Δ +0.370; CI [0.176, 0.565])
- **2 axes BORDERLINE distinguishable** (hallucination LB
  0.032; actionability LB 0.005)
- **1 axis NOT distinguishable** (completeness; LB -0.039)

Plus supplementary **12:1 ca-favored direction asymmetry** in
non-tie comparisons (24/2 across 26 non-tie axis-comparisons;
F1 sub-observation; independent inferential lens). Both lenses
point same direction; convergent evidence beyond either alone.

**Threshold pre-registration disclosure:** tier criteria
(≥0.05 = clean; 0.001-0.05 = borderline; ≤0 = not
distinguishable) locked at Step 9.1.b spot-check kickoff BEFORE
precision values were computed; honored without post-hoc
adjustment after data observation. Threshold not pre-cycle-
registered (substrate generated before threshold lock);
disclosed transparently for peer-review reproducibility.

Calibrated tier-gradation outcome scores stronger as reviewable
methodology than flat positive would. Three borderline
classifications + cobra/c3 degenerate-CI caveat honestly bound
the inferential strength.

## Canonical reference doc location

Full reference doc at: `ContextAtlas-benchmarks/research/phase-
9-v0.5-reference-run.md` (commit `e32b5dd`).

Reference doc covers (792 lines):
- §1 Cycle thesis + thesis-evaluation summary
- §2 Methodology (rubric; anonymization; statistical
  methodology; calibration → production)
- §3 Production substrate (Step 7; 56 trials; ca-condition
  variance; hono bimodal)
- §4 Production grading (Step 8; 34/35 paired grades;
  per-cell Δ; cross-order agreement; position-bias)
- §5 Calibration substrate (Step 6; within-judge consistency;
  Travis-intuition; Branch D outcome)
- §6 Statistical computation results (3-tier framing per
  Option α; Tables 1-5)
- §7 Findings (F1 PRIMARY through F9)
- §8 Cycle thesis evaluation
- §9 v0.6+ candidates (15 candidates × explicit source
  attribution per Q9 lock)
- §10 Methodology limits acknowledged (11 limits; 8 inherited
  + 3 new at v0.5)
- §11 Document relationship + revision history

## Doc-gen script

`ContextAtlas-benchmarks/scripts/v0.5-step9-doc-gen.mjs` (429
LOC). Pure-math + filesystem; no API spend. Reads Step 6/7/8
substrate; computes paired-t CIs (per-cell + cross-cell rollup)
via `ContextAtlas-benchmarks/scripts/lib/stats.mjs` sibling
implementation; emits markdown tables.

Re-run via:
```
cd C:/CodeWork/ContextAtlas-benchmarks
node scripts/v0.5-step9-doc-gen.mjs
```

Port-compatibility comments at retro-complete-port sites
(`reporting.ts.generateVarianceTable` + cross-cell rollup table
generator identified for v0.6+ retro-complete copy-paste port).

## Main-repo audit-trail files

| File | Contents |
|---|---|
| `README.md` | This file (navigation + cycle-thesis summary) |
| `computed-tables.md` | Snapshot of 5 computed tables emitted by doc-gen script (Tables 1-5: per-cell paired-t CI; cross-cell rollup; per-cell efficiency; cross-order agreement; tie rate) for verification |

## Cross-repo SHA audit trail

- **Benchmarks repo Step 9.1 commit:** `e32b5dd` (doc-gen
  script + reference doc)
- **Main repo Step 9.2 commit:** [SHA captured at commit time;
  added back-reference to benchmarks-repo ref doc revision
  history per bidirectional audit-trail discipline]

## Navigating to canonical reference

For peer-review or detailed cycle-thesis evaluation, read the
canonical reference doc (792 lines) at the benchmarks-repo
location. This main-repo summary is for quick orientation +
audit-trail completeness only.
