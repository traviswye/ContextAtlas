---
id: ADR-19
title: LLM-judge methodology — rubric, anonymization, statistical methodology
status: accepted
severity: hard
symbols:
  - judgeClient
  - rubricPrompt
  - anonymizeOutput
  - meanWithCI
  - differenceOfMeansCI
---

# ADR-19: LLM-judge methodology — rubric, anonymization, statistical methodology

## Context

Phase 5 §6.3 (v0.1 hono reference run) catalogued surface
evidence of CA quality patterns — ADR-citation density, exact
file:line references vs approximations, named-symbol enumeration —
and explicitly deferred rigorous quality-axis measurement to a
future cycle. v0.4 Phase 8 §8 supplement (Step 9 bounded-validity)
shipped n=2 trial replication on 5 anchor cells, confirming
~4-13% replication-noise-floor convergence; §8.7 framed the
launch-narrative credibility line as "v0.3 findings replicate
within trial variance; full statistical methodology with quality-
axis blind-grading is v0.5+ scope." That floor is what v0.5
escalates from.

v0.5 thesis: close v1.0 ship-gate criterion #1 (efficiency +
quality wins under full quality-axis methodology) by shipping
the rigorous-evidence foundation — full statistical bounded-
validity (n≥5 + CIs); blind-graded quality measurement with
judge-agreement statistics; calls-bucket reporting; adaptive
priors. After v0.5, ContextAtlas's empirical claims withstand
peer-review scrutiny.

The methodology infrastructure required for that thesis spans
five cross-cutting decisions — rubric design; judge-model
selection + escalation; output anonymization; statistical
methodology; threshold values. Distributing those decisions
across Steps 2-8 implementation files would scatter the
methodology rationale and make peer-review reading harder.
This ADR consolidates the cross-cutting pattern; per-step ADRs
(if any) reference back to this one.

The closest in-repo precedent is [ADR-18](ADR-18-lsp-adapter-readiness-pattern.md)
— cross-cutting LSP-adapter readiness pattern, with per-server
divergences captured in [ADR-13](ADR-13-python-adapter-pyright.md)
and [ADR-14](ADR-14-go-adapter-gopls.md). ADR-19 follows the
same shape: cross-cutting methodology here; implementation
specifics (e.g., exact rubric prompt text) in source files
(per [ADR-02](ADR-02-extraction-sole-api-caller.md) extraction-
prompt single-source-of-truth precedent). Per F1 two-lock-point
clarification in `v0.5-SCOPE.md` §7.2.1: rubric DESIGN locks
here at Step 1; rubric PROMPT TEXT commits to source at Step 3.

## Decision

### 1. Rubric design — 4 axes, 0-3 scale, worked-example anchored

The rubric exists primarily to surface the **tied-outputs
quality-axis pattern** Phase 5 §3.1 first identified —
"efficiency-only metrics under-measure CA value when calls
tie." A 4-axis quality measurement with 0-3 ordinal scale
makes that pattern empirically visible: when ca and beta-ca
tie on call-count efficiency but the ca answer scores 3 on
actionability vs the beta-ca answer at 1, the rubric captures
the win the pure efficiency metric can't see. Other rubric
uses (per-cell win/loss adjudication; cross-cell aggregate
quality findings) are downstream of this primary purpose.

**Four axes (Q2 lean confirmed; per-failure-mode separability):**

| # | Axis | Question | Failure mode isolated |
|---|---|---|---|
| 1 | Factual correctness | Are asserted facts about the code/architecture accurate? | Wrong claims |
| 2 | Completeness | Does the answer cover the prompt's actual scope? | Under-coverage |
| 3 | Actionability | Can the user proceed from this answer? | Vague or over-extracted |
| 4 | Hallucination | Does the answer assert specific items that don't exist? | Fabrication |

Axes 1 + 4 are correlated but separable per failure mode. A
vague-but-technically-correct answer scores high on 1 (no
errors asserted) and high on 4 (no fabrication); a partially-
correct answer with one fabricated ADR reference scores 2/3
on 1 and 1/3 on 4. The Q2 Open Question about compression to
3 axes is **deferred to Step 6 calibration** with binding
trigger:

- **Compress to 3 axes (merge 1+4 → "factual integrity")** if
  Spearman rank correlation between axis-1 and axis-4 scores
  ≥ 0.85 across Step 6 calibration substrate AND fewer than
  2 of 10 trials show a >1-point gap between axis-1 and axis-4
  scores. **Both** conditions must hold; either alone preserves
  4-axis separability.

Spearman (rank correlation) is chosen over Pearson (linear) —
0-3 ordinal scores have no meaningful interval scale. Pearson
would treat the gap from 0→1 as equivalent to 2→3, which is
not what the anchors encode.

**0-3 scale with worked examples anchored in real Phase 5
trial outputs** (see `src/grading/rubric-prompt.ts` at Step 3
for the in-source canonical anchor set; this section provides
the methodology rationale).

For each axis, scale anchors are: 0 = absent/wrong; 1 = partial;
2 = mostly correct; 3 = exemplary. Each anchor cites a specific
verbatim fragment from a real anchor-cell trial output (Phase 5
§5.1 h4-validator-typeflow alpha vs ca opening verbatim text).
Aspirational anchors ("a 3 is excellent") fail peer review;
example-anchored anchors ("a 3 cites file:line and ADR-by-
number; see Phase 5 §5.1 h4-CA opening") survive.

**Axis 4 (Hallucination) score-0 anchor uses hypothetical-
illustrative example.** Real v0.3+v0.4 trial outputs did not
produce score-0-level fabrication; the example shows what
fabrication detection would catch, not what was observed.
Disclosed transparently in `src/grading/rubric-prompt.ts` and
in phase-9 reference doc.

**Trick-bucket bloat handling (Axis 3 override):** for trivial-
lookup prompts (Phase 5 h6-fetch-signature pattern), score
actionability ≤ 1 if the answer carries irrelevant ADR context
that buries the lookup answer in over-extraction. This is the
mechanism that lets the rubric surface CA's known weakness on
trick-bucket prompts honestly; without it, factually-correct-
but-bloated answers score 3 on factual correctness AND 3 on
actionability, hiding the over-extraction failure mode.

**Six edge cases handled:** truncated outputs (score what
shipped; truncation IS a quality failure mode); non-English
content (out of v0.5 scope; flag in notes if encountered);
format-anomaly (handled by anonymization §3 + judge prompt
format-ignoring instruction); partial-right + partial-wrong
(axes scored independently); no-answer / honest refusal
(factual 3 + completeness 0 pattern); tied outputs (no special
handling — the 4-axis rubric IS the instrument designed to
surface them, not an edge case).

### 2. Judge-model selection + escalation criterion

> **Amended 2026-05-05 (commit `[backfill SHA]`):** §2 cost-
> projection content updated to apply Opus 4.7 verified pricing
> ($5/$25 input/output base; ~1.67× Sonnet baseline pricing) per
> v0.5 Step 2 finding #3 (Opus 4.7 = 1.67× Sonnet pricing
> relationship) + finding #4 (`src/extraction/pricing.ts`
> staleness fix from $15/$75 to $5/$25 base; verified 2026-04-30).
> Pre-amendment "$100 absolute upper bound" framing was Sonnet-
> baseline-referenced / staleness-anchored; post-amendment framing
> reflects current Opus 4.7 pricing model with empirical anchor.
> Cross-reference: CLAUDE.md "Cost-priors interpretation discipline
> (v0.6 Step 2 / E2 lock)" section (commit `9aab055`) for cycle-
> execution-time discipline governing versioned cost-priors
> snapshot consumption.

**Single-judge: Claude Sonnet 4.6 default; Opus 4.7 escalation
backup if Step 6 calibration fails Travis-intuition correlation
(per `v0.5-SCOPE.md` §7.1.1).** Cross-vendor panel (Claude +
GPT + Gemini) deferred to v1.x post-launch hardening per
methodology limits; out of v0.5 cost envelope.

**Three orthogonal Step 6 failure modes → three different
recovery paths:**

| Failure mode | Indicates | Recovery |
|---|---|---|
| Within-judge consistency low | Rubric anchor language unclear; judge can't apply rubric stably regardless of model | Rubric refinement — Opus escalation does NOT solve this |
| Travis-intuition correlation low (aggregate or per-axis) | Either Sonnet-capability problem OR rubric-design problem | Opus escalation as diagnostic step, then branch on Opus result |
| Systematic lenience/strictness only (high correlation, large MAD) | Judge tracks Travis on different scale; bias is correctable | Rubric anchor refinement OR explicit offset disclosure — never escalation alone |

**Escalation trigger.** Escalation fires when at least one of
the following conditions is breached: (1) aggregate Spearman
correlation < 0.6 across all 12-20 grade pairs; (2) per-axis
direction agreement < 75% on ≥ 1 of the 4 axes.

**Direction agreement** (per-axis metric appropriate for
small-N substrate, n=3-5 trials per axis): fraction of trial-
pair comparisons where sign(judge_a[i] - judge_a[j]) =
sign(travis_a[i] - travis_a[j]). At n=3 → 3 pairs; n=5 → 10
pairs. Catches mixed-pattern divergence that aggregate Spearman
can mask. Spearman at n=3 is binary in practice; direction
agreement has more granularity at small-N.

**Mean Absolute Difference (MAD)** reported per-axis at every
Step 6 calibration regardless of escalation status:

- MAD ≤ 0.5: judge tracks Travis tightly; absolute scores cite
  directly.
- 0.5 < MAD ≤ 1.5: modest systematic offset; cite scores with
  disclosure ("judge runs ~X points higher/lower than
  calibration human; ranking-based findings unaffected").
- MAD > 1.5: large systematic offset; trigger rubric anchor
  refinement (not escalation; if correlation is high, the
  rubric needs tighter anchors not a different judge).

**Step 7-8 model lock if escalation fires:** Option A (Step 7-8
production runs on Opus) as principled default. Rationale: v0.5
thesis is "methodology defensible under peer review"; running
production grading on a calibration-failed judge with
disclosure (Option B) doesn't survive scrutiny.

**Travis-rescope-decision branch preserved at Step 6
escalation-event** — three-way choice:

1. **Option A (full Opus production).** Full Opus Step 7-8;
   budget impact under current Opus 4.7 pricing (verified $5/$25
   input/output base per v0.5 Step 2 finding #4; ~1.67× Sonnet
   baseline pricing relationship per finding #3) projects ~$33-50
   theoretical upper bound (recalibrated from pre-amendment $100
   framing which was Sonnet-baseline-referenced + staleness-
   anchored against $15/$75 pre-fix pricing). Empirical anchor:
   v0.5 cycle actual ~$10.25 platform-billed reconstructed (well
   under projection per cache-discount + n=5 substrate efficiency).
   Explicit Travis rescope decision per scope-doc §Rescope
   conditions if cycle-execution trajectory exceeds projection.
2. **Option C (subset Opus + Sonnet remainder).** Step 8 subset
   on Opus; phase-9 ref doc reports both judges.
3. **Statistical-only-rigor + grading-deferred** to v0.5.5 or
   v0.6 carry-forward. Criterion #1 partially closes; full
   quality-axis defers per scope-doc §Rescope.

Travis chooses among three paths under no time pressure because
the decision shape locks here, not at Step 6.

### 3. Output anonymization — 5-step protocol

**Strip-list empirically derived from inspection of two real
Step 9 trial JSON files** (`httpx/p4-stream-lifecycle/ca.json` +
`httpx/p2-http3-transport/beta-ca.json`):

| Field | Leaks | Action |
|---|---|---|
| `condition`, `bucket`, `target_symbol`, `repo`, `prompt_id` | Direct labels | Strip |
| `metrics.*`, `cost_usd`, `wall_clock_ms`, `capped`, `errored` | Order-of-magnitude differences leak condition (e.g., $0.57 ca vs $0.07 beta-ca) | Strip |
| `diagnostics` (entire field) | Beta-only signature (`claudeCodeVersion`, `modelUsage`, `cacheReadInputTokens`) | Strip |
| `trace[].tool` prefix `mcp__contextatlas__*` | 100% beta-ca tell | Strip entire `trace` |
| `trace[].result_preview` atlas markers (`INTENT`, `SYM`, `GIT`) | Distinguishes alpha/beta from ca/beta-ca | Strip entire `trace` |
| `written_at`, file paths in artifact-path strings | Run-clustering correlates | Strip |

**Decision: strip the trace entirely.** Strip-by-field is
necessary but insufficient — the trace structure itself leaks.
Judge sees prompt + answer only.

**Constructed grading-input shape:**

```json
{
  "prompt": "<full prompt text>",
  "answer_A": "<answer field content>",
  "answer_B": "<answer field content from paired trial>",
  "presentation_id": "<seed-derived UUID>"
}
```

**Filename-marker stripping** preserves source-code file:line
references (legitimate Axis 3 quality signal per Phase 5 §6.3
"compose.ts:73 lines (exact)"); strips only harness artifact
filenames (`compact_format.txt`, `summary.md`, `run-manifest.json`,
`phase-N-*.md`, `step9-*.json`). Mechanical regex with explicit
allowlist (`.py`, `.ts`, `.go`, `.rs`, `.java`, `.tsx`, `.js`).

**A/B randomization per-pair with logged seed:**

```
seed = SHA256(cell_id || trial_index || run_uuid).hex[:16]
hash_int = int(seed[:8], 16)
A := ca_trial_i if hash_int even else beta-ca_trial_i
B := beta-ca_trial_i if hash_int even else ca_trial_i
```

Manifest persisted to `grading-run-manifest.json` (companion to
existing `run-manifest.json` pattern); written before grading
call; not visible to judge. Post-hoc verification reads manifest
to decode A↔condition.

**Cross-presentation-order check:** for k=5-10 of the 25 pairs,
regrade with A/B swapped via different seed. Same scores ↔ same
content regardless of position = position-bias-resistant.
Reported as Step 8 judge-agreement statistic.

**Judge prompt format-ignoring instruction** (worked text
prepended to every grading call; locks at Step 3 in-source):

```
You will grade two answers (presented as A and B) against a
rubric. Both answers respond to the same prompt; they may use
different formatting, phrasing, or structure. Score substance,
not presentation.

CRITICAL: ignore all of the following — none are quality
signals: markdown formatting choices; length alone (a tightly-
precise short answer can score equal to a thoroughly-explained
long answer); tone, voice, formality, hedging style; whether
file references are inline or grouped; whether ADR references
appear in prose or block quotes.

Evaluate substance against the rubric: factual correctness;
completeness; actionability; hallucination. Score each axis
0-3 per the rubric anchors.

If A and B are substantively equivalent, score them equally —
do not invent distinctions to break ties.
```

The "do not invent distinctions to break ties" line is a
deliberate anti-RLHF-bias instruction; protects the tied-
outputs pattern that motivates the rubric's existence (see §1).

**Post-hoc position-correlation verification** (Step 8-only;
Step 6 substrate too small for valid computation):

```
imbalance = max(count_A_higher, count_B_higher) / n
trigger if imbalance > 0.60
```

At n=25 (Step 8 substrate; 5 anchor cells × n=5 trial-pairs),
60% corresponds to ≥ 15 of 25 pairs leaning one way. p(≥15)
under null ≈ 0.21 — false-positive rate is non-negligible by
design. **Triggering the verification is NOT a methodology
failure**; it is a verification mechanism that runs to detect
residual leakage. Phase-9 ref doc framing language: "position-
correlation verification triggered at threshold X; investigation
outcome below" — outcome can be "format-leak → style-norm re-
grade clears" OR "content-leak → honest finding that one
condition produces systematically X-shaped answers."

**Style-normalization stretch goal** triggered by position-
correlation > 60/40: strip-markdown + uniform formatter →
re-grade k=5-10 imbalanced subset. Cost adder ~$5-15. Branch
on re-graded imbalance:

- Re-graded imbalance ≤ 50/50: leak was format-based; report
  Step 8 results with format-normalized re-grade as primary
  number; original grades supplementary.
- Re-graded imbalance still > 60/40: leak is content-based; one
  condition genuinely produces "stronger-looking" answers
  regardless of format. Honest finding, not methodology failure.

**Judge ground-truth — Option A default; Option B pivot:**

- **Option A (default):** prompt + answer only. Cleanest
  anonymization; smallest prompt; factual axis depends on
  Sonnet's training knowledge.
- **Option B (pivot):** prompt + answer + relevant ADR(s)
  inlined as ground-truth context. +$5-15 across Step 8; ADRs
  are condition-neutral so don't leak.

**Pivot conjunction (binding at Step 6):** switch to Option B
IF Step 6 factual-axis correlation < 0.6 AND other axes pass
thresholds. If ALL axes fail, that's a rubric-design problem
(§1 anchor refinement, not Option B switch). The pivot is
specifically the diagnostic case where factual-axis is the lone
underperformer.

### 4. Statistical methodology — descriptive CI only

> **Amended 2026-05-03 (commit `05c9fc7`):** §4 difference-of-
> means formula updated from unpaired-pooled (df=n_A+n_B−2) to
> paired-t (df=n−1) per Step 5 design adjudication. Cross-cell
> rollup math clarified as paired-t at concatenated N=25 differences
> (not weighted-mean of per-cell differences). Welch's correction
> paragraph removed (moot under paired-t). See updated CI
> computation paragraph below; Rationale §Paired-t-for-difference-
> of-means bullet; ADR-19 §Revision history; STEP-PLAN-V0.5
> §Revision history entry referencing this amendment commit.

**Library: roll-our-own t-distribution lookup table** (~30 LOC
per repo). Honors CLAUDE.md "Dependencies: Minimize" principle.
Static t-critical values for df ∈ {1..30} at α ∈ {0.025, 0.05};
covers 95% and 90% two-sided CIs at Step 7 sample sizes. Two
implementations acceptable at this code size: `src/grading/stats.ts`
(main repo; consumed by judge-agreement stats); `scripts/lib/stats.mjs`
(benchmarks repo; consumed by trial aggregation + phase-9
reporting). simple-statistics (Node-native package) considered
and rejected — 50KB dependency for ~5 t-table values fails the
dep-min cost-benefit.

**Single-sample CI:** 95% CI = mean ± t_critical(df, 0.025) × SE,
where SE = sd(values) / sqrt(n) and df = n − 1.

**Difference-of-means CI uses paired-t** (per 2026-05-03 amendment).
The v0.5 substrate is structurally paired: each trial-index has
both ca and beta-ca outputs against the same prompt + same
anchor cell. Compute differences[i] = ca[i] − beta-ca[i] across
the n paired trials; the difference-of-means CI is then a single-
sample CI on the differences:

  df = n − 1
  mean_diff = mean(differences)
  SE_diff = sd(differences) / sqrt(n)
  CI_diff = mean_diff ± t_critical(df, 0.025) × SE_diff

At v0.5 base substrate (n=5 trials per cell), df=4 →
t_critical(4, 0.025) ≈ 2.776.

**Cross-cell rollup applies the same paired-t primitive to the
concatenated set of all paired differences across the 5 anchor
cells** (N=25 paired obs at v0.5 base substrate; df=24 →
t_critical(24, 0.025) ≈ 2.064), NOT a weighted-mean-of-per-cell-
differences (Welch-Satterthwaite-style) pooling. Single primitive
applied at two scales — per-cell within-cell pairs (n=5) and
cross-cell concatenated pairs (N=25) — keeps the formula uniform.

Paired-t controls for trial-difficulty variance via the
var(differences) computation: shared per-trial-index difficulty
between ca and beta-ca produces positive within-pair correlation,
which paired-t absorbs into a tighter CI. The pre-amendment
unpaired-pooled formula would over-count trial-difficulty variance
into the error term (defensibly-but-conservatively wider CIs);
paired-t is the textbook fit for paired data structure. Welch's
correction concern (which applied to the unpaired-pooled formula's
equal-variance assumption) is moot under paired-t — paired
differences yield a single variance estimate with no equal-
variance assumption needed.

**4-level aggregation:**

| Level | Computed | Reported |
|---|---|---|
| Per-trial | Raw values | Persisted; not directly in narrative |
| Per-cell | Mean + 95% CI (3 efficiency metrics × 4 quality axes per condition) | Per-cell variance table |
| Per-cell ca-vs-beta-ca difference | Difference-of-means + 95% CI | Comparison table; primary cell-level finding |
| Cross-cell rollup | Pooled mean across 5 anchor cells (n=25 per condition); aggregate CI | Aggregate table; **load-bearing for ship narrative** |

**No NHST; no p-values; no multiple-comparisons correction.**
At n=5 statistical power is too low for meaningful significance
testing; CIs communicate effect size + uncertainty more
transparently. Multiple-comparisons concern dissolves under
descriptive framing — the problem doesn't get solved, it gets
bypassed by choosing the right framing.

**"Distinguishable" column** (auto-generated tables): yes if
difference-of-means CI excludes zero; no otherwise. **Not a
hypothesis test — explicit caption framing required:**
"Distinguishable = difference-of-means 95% CI excludes zero.
Effect-size + uncertainty framing only. Readers should interpret
as 'population-mean difference is unlikely to be zero under
stated assumptions' not as 'statistically significant.'"
Protects descriptive-CI-only commitment from being interpreted
as NHST through the back door.

**Cross-cell pooling fixed-effect disclosure** (phase-9 ref
doc): "Aggregate cross-cell findings reported as fixed-effect
pooled mean at n=25 per condition. Anchor cells are deliberately
heterogeneous (Theme 1.1 closure vs Theme 1.2 fix vs win-bucket
prompts); strict exchangeability assumption is questionable.
Readers wanting random-effects between-cell-variance treatment
should treat per-cell findings as the more conservative
substrate. Random-effects meta-analysis at k=5 cells has its
own small-N problems (between-cell variance estimate is itself
noisy); v0.5 ships fixed-effect with this disclosure."

### 5. Threshold values

Quality-axis gating thresholds (Step 6) and variance-trigger
thresholds (Steps 6 + 7) lock per `v0.5-SCOPE.md` §7.1.1 +
§7.3.1. Substrate counts reflect cost constraints (within-judge
regrade is cheap; Travis-intuition manual grading is Travis-
time-constrained), not methodological choices.

| # | Threshold | Value | Substrate |
|---|---|---|---|
| (a)-primary | Per-axis within-1-point agreement | ≥ 80% per axis (≥ 8 of 10) | 10 trials × 4 axes regrade pairs (40; 10/axis) |
| (a)-diagnostic | Aggregate exact-match rate | ≥ 50% | Same n=40 pool; reported, not gating |
| (b)-aggregate | Travis-intuition aggregate Spearman | ≥ 0.6 | 12-20 grade pairs (3-5 trials × 4 axes) |
| (b)-per-axis | Travis-intuition direction agreement | ≥ 75% per axis | 3-5 trial pairs per axis |
| (c)-preventive | Step 6 cell variance pre-flag | tokens range/mean > 20% | Step 9 n=2 trial data per cell |
| (c)-in-flight | Step 7 in-flight rescope | tokens range/mean > 50% on ≥ 2 cells | Step 7 n=5 trial data |
| (c)-catastrophic | Step 7 catastrophic | tokens range/mean > 100% on any cell | Step 7 n=5 trial data |

**Empirical pre-flag from Step 9 §8 data:** hono/h1-context-
runtime/beta-ca already pre-flagged for n=7-8 stretch at Step 7
(45% > 20% threshold). Step 7 cost projection updates to 27
trials minimum (5 anchor cells × n=5 + n=2 stretch on hono h1).

**Range/mean (not CV)** as variance metric for cross-cycle
comparability with Phase 8 §8 framing. CV (stdev/mean) is more
standard at n ≥ 5; persisted trial data supports CV recomputation
if reviewer prefers. Range/mean is conservative (slightly larger
than CV at n=5+).

**Calls-Δ% NOT a variance trigger.** Phase 8 §8.4: calls is
quantization noise on small-N cells (e.g., 2→3 calls = 40%);
token-Δ is the load-bearing metric. v0.5 Stream C #9 calls-
bucket reporting (1-3 / 4-7 / 8+) addresses calls separately.

## Rationale

- **Tied-outputs as primary justification for rubric** — Phase 5
  §3.1 first identified the pattern; the rubric exists to make
  it empirically visible. Other rubric uses are downstream.
- **0-3 ordinal scale + Spearman** — interval-scale assumptions
  (Pearson; mean-with-CI on the score itself) are unwarranted
  for ordinal grading; rank-based statistics are the right shape.
- **Three orthogonal failure modes** — collapsing them into a
  single "judge-fails" path would force the wrong recovery
  (e.g., Opus escalation when the rubric is unclear).
- **Empirical leak inspection over hypothesis-anchored strip-
  list** — reading two real Step 9 JSON files surfaced
  structural leakage (trace mcp prefix; diagnostics field beta-
  only) that field-level hypothesis would miss.
- **"Do not invent distinctions to break ties"** — anti-RLHF-
  bias instruction; protects the rubric's primary purpose from
  judge-tendency to over-call ties as wins.
- **Descriptive CI over NHST** — at n=5, statistical power is
  too low for NHST to be meaningful; multiple-comparisons
  correction becomes its own peer-review attack surface; CIs
  communicate effect size + uncertainty cleanly.
- **Roll-our-own t-distribution** — ~30 LOC vs 50KB dependency;
  CLAUDE.md dep-min principle wins on cost-benefit.
- **Paired-t for difference-of-means** (per 2026-05-03 amendment) —
  v0.5 substrate is structurally paired (each trial-index has both
  ca and beta-ca outputs against the same prompt + same anchor
  cell). Trial-difficulty variance is real and shared between
  conditions at trial-i, producing positive within-pair correlation.
  Paired-t controls for this via var(differences) computation,
  yielding tighter CIs and cleaner condition-effect attribution
  than unpaired-pooled. Reviewer-defensibility: paired-t is the
  textbook fit for paired data structure; unpaired-pooled would
  defensibly-but-conservatively over-count trial-difficulty variance
  into the error term. Cross-cell rollup applies the same paired-t
  primitive at the concatenated-differences scale (N=25 paired
  obs); fixed-effect framing matches existing ADR-19 §4 cross-cell
  pooling disclosure unchanged.
- **Pre-flag hono h1 from Step 9 data** — operational clarity
  that falls out of threshold lock; updates Step 7 budget
  before any new spend.

## Consequences

- **Steps 2-8 reference this ADR** for methodology decisions.
  Rubric prompt text in `src/grading/rubric-prompt.ts` (Step 3);
  judge harness in `src/grading/judge-client.ts` (Step 2);
  anonymization pipeline + position-correlation harness in
  `src/grading/` (Step 4); statistical primitives in
  `src/grading/stats.ts` + `scripts/lib/stats.mjs` (Step 5).
  Per-step ADRs (if any) reference back to ADR-19; this ADR
  doesn't relitigate per-step.
- **Step 6 entry-state pre-determined.** hono/h1-context-runtime/beta-ca
  pre-flagged for n=7-8 stretch at Step 7 the moment Step 6
  calibration starts. Step 7 cost projection: 27 trials minimum,
  within scope-doc envelope.
- **Step 7-8 model branch deferred to Step 6 escalation-event
  with three-way Travis rescope choice locked.** No Step 6
  decision-time-pressure on the budget envelope.
- **Phase-9 ref doc structure constrained** by descriptive-CI
  framing + fixed-effect disclosure + non-NHST caption language
  + position-correlation-trigger-not-failure framing. Phase-9
  ref doc author (Step 9) inherits this ADR's language
  conventions.

## Limitations

- **Single-judge with known limitation.** Same training corpus +
  RLHF lineage between Sonnet 4.6 (judge) and Opus 4.7 (matrix-
  run model) — cousins not strangers. Cross-vendor judge panel
  ({Sonnet, GPT, Gemini}) would isolate per-vendor quality
  differences from rubric-fit signal but is out of v0.5 budget.
  **Cross-vendor judge panel deferred to v1.x post-launch
  hardening.**
- **n=5 vs full statistical rigor.** Per-cell n=5 is CI-
  computation floor (below = embarrassingly small-N for 95% CI
  bounds). v0.5 ships finding-anchored cells (5 anchor prompts ×
  2 conditions); full-matrix replication (36 cells × n=5) is
  v0.5+ stretch goal post-v1.0.
- **Cell selection finding-anchored, not random.** Five cells
  selected for cross-finding + cross-repo spread (Theme 1.1
  closure + Theme 1.2 fix + per-repo win-bucket cells), not by
  random sampling from the 36-cell matrix. Bounded-validity
  outcome generalizes within the finding-anchor set; full-matrix
  replication is v0.5+.
- **Quality-axis rubric is opinion-shaped, not ground-truth.**
  4-axis rubric reflects rubric-designer perspective on what
  "quality" means for atlas-bundled context. Different rubric
  designs would produce different quality measurements. Rubric
  is documented + locked at this ADR; subject to community-
  evidence revision in future cycles.
- **Output style leakage residual after anonymization.**
  Anonymization reduces but cannot eliminate style-based label
  leakage (compact-vs-verbose output formats may leak even with
  metadata stripping). Mitigated by judge prompt format-ignoring
  instruction + post-hoc position-correlation +
  style-normalization stretch.
- **Within-judge stochasticity.** Mitigated by Step 6 consistency
  check; threshold-gated; residual stochasticity reported in
  phase-9 ref doc.
- **MAD threshold at 1.5 for anchor refinement is empirically
  unanchored.** Set at "half the scale range"; first-cycle v0.5
  calibration generates the empirical anchor for v0.6+
  refinement.

## Non-goals

- **Cross-vendor judge panel.** v1.x post-launch hardening per
  Limitations.
- **Full-matrix statistical replication (36 cells × n=5).** v0.5+
  stretch goal post-v1.0; framework exists in v0.5 to support it
  when needed.
- **Quality-axis calibration on additional reference targets
  beyond cobra/httpx/hono.** Per ROADMAP §v1.0+ enrichment
  backlog. Demand-driven.
- **External-grader human panel.** Single-point Travis-intuition
  human anchor in v0.5; full external-graders panel deferred.
- **Adaptive rubric refinement during cycle.** Rubric locks at
  this ADR; mid-cycle refinement is a rescope condition (per
  `v0.5-SCOPE.md` §Rescope), not a routine path.
- **Mid-cycle judge-model switching** (other than Step 6
  escalation event). Once Step 7 production starts on a judge
  model, that model runs through Step 8 grading. No per-cell
  judge selection.

## Document relationship

ADR-19 captures the **cross-cutting methodology pattern** for
v0.5 LLM-judge work; per-step implementation specifics live in
source files (rubric prompt text in `src/grading/rubric-prompt.ts`
per ADR-02 extraction-prompt single-source-of-truth precedent)
or per-component ADRs (none currently; v0.6+ if cross-vendor
panel work surfaces vendor-specific ADRs).

| ADR | Scope |
|---|---|
| **ADR-19** (this doc) | Cross-cutting v0.5 LLM-judge methodology — rubric, anonymization, statistics, thresholds |
| [ADR-02](ADR-02-extraction-sole-api-caller.md) | Sole-API-caller constraint; extraction-prompt single-source-of-truth precedent |
| [ADR-18](ADR-18-lsp-adapter-readiness-pattern.md) | Cross-cutting LSP-adapter readiness pattern; structural template ADR-19 mirrors |

Empirical anchors (this ADR cites these as the basis for
specific methodology choices):

- `../../ContextAtlas-benchmarks/research/phase-5-reference-run.md`
  §5.1 (h4 verbatim alpha vs ca opening; rubric scale anchors);
  §6.3 (surface evidence patterns; quality-axis primary-purpose
  framing); §3.1 (tied-outputs pattern; rubric primary
  justification).
- `../../ContextAtlas-benchmarks/research/phase-8-trace-analysis-supplement.md`
  §8 (v0.4 bounded-validity; ~4-13% noise floor; v0.5 thresholds
  anchored against this band).
- Step 9 trial JSON files (`runs/2026-04-29T05-*Z/...`) inspected
  directly for §3 strip-list derivation.

Future v0.6+ ADRs (if cross-vendor panel ships, if rubric
refinement surfaces) follow the same shape: cross-cutting
pattern at the ADR layer; per-vendor or per-axis specifics in
source files.

## Revision history

- **2026-05-03** — v0.5 Step 5.0 amendment: §4 difference-of-means
  formula updated from unpaired-pooled (df=n_A+n_B−2; SE_diff =
  sqrt(var_A/n_A + var_B/n_B)) to paired-t (df=n−1; SE_diff =
  sd(differences) / sqrt(n)). Cross-cell rollup math clarified as
  paired-t at concatenated N=25 differences (not weighted-mean of
  per-cell differences). Welch's correction paragraph removed (moot
  under paired-t). Rationale §Paired-t-for-difference-of-means
  bullet added explaining within-pair correlation rationale +
  reviewer-defensibility framing. Trigger: Step 5 design proposal
  investigation-first surfaced paired-vs-unpaired tension at
  primitive-implementation time. Travis adjudication 2026-05-03:
  paired-t correctness for structurally-paired v0.5 substrate;
  unpaired-pooled was default-textbook-without-explicit-adjudication
  at original Step 1.4 lock. ADR-19 frontmatter symbols list
  unchanged (`differenceOfMeansCI` semantically accurate under
  either formula; only the underlying computation differs).

- **2026-05-05** — v0.6 Step 2.2 amendment: §2 cost-projection
  content updated to apply Opus 4.7 verified pricing ($5/$25
  input/output base; ~1.67× Sonnet baseline pricing) per v0.5
  Step 2 finding #3 (Opus 4.7 = 1.67× Sonnet pricing relationship)
  + finding #4 (`src/extraction/pricing.ts` staleness fix from
  $15/$75 to $5/$25 base; verified 2026-04-30). Pre-amendment
  "$100 absolute upper bound" framing was Sonnet-baseline-
  referenced / staleness-anchored; post-amendment framing
  reflects current Opus 4.7 pricing model with empirical anchor
  (v0.5 cycle actual ~$10.25 platform-billed reconstructed).
  Bidirectional cross-reference established with CLAUDE.md "Cost-
  priors interpretation discipline (v0.6 Step 2 / E2 lock)"
  section (commit `9aab055`); CLAUDE.md section references this
  amendment for full pricing-model context. Trigger: v0.5 Step 2
  finding #3 + finding #4 surfaced pricing-staleness during v0.5
  cycle execution; B15 Phase-9 ref-doc §9 candidate captured
  amendment work as v0.6 Stream B Tier-1 elevated entry per Item
  7 lock; Q2.0.3 lock at v0.6 Step 2.0 commit `92321d3` confirmed
  direct-amendment pattern matching v0.5 §4 paired-t amendment
  precedent. SHA backfill discipline applied per v0.5 SHA-
  placeholder-backfill precedent (initial commit `[backfill SHA]`
  placeholder; separate backfill commit replaces with actual SHA
  per chicken-and-egg-avoidance pattern).
