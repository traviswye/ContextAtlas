# ContextAtlas: Benchmark Methodology

**Status:** Draft v0.1
**Last Updated:** [date]

---

## Purpose

This document defines how we measure ContextAtlas against baseline Claude
Code. It is pre-registered: the rubric below is fixed before any benchmark
run, grading is blind to which condition produced each output, and all
results are reported — not just the favorable ones.

The goal is credibility. A benchmark methodology that anyone can replicate
and audit is more valuable than flashy numbers from a methodology nobody
trusts.

## Benchmark Targets

Three repositories, chosen to reflect different realistic use cases:

| Repo                | Language   | Source files | Role in benchmark              |
|---------------------|------------|--------------|--------------------------------|
| honojs/hono         | TypeScript | 186          | Mid-sized framework            |
| encode/httpx        | Python     | 23           | Focused production library     |
| contextatlas        | TypeScript | ~30-50 (WIP) | Meta/dogfood: tool on itself   |

Hono and httpx are both actively maintained, recognizable, and have
genuine architectural decisions captured in ADRs we authored for this
benchmark. ContextAtlas itself is included as a dogfooding case: by the
end of hackathon week, we want to be able to say our tool is good enough
to help build itself.

**Why this set:** The repos vary in size (23 to 186 source files) and
domain (HTTP client, web framework, developer tool). This breadth reflects
how the tool is actually used — most real developer work happens on
codebases in this size range, not on Django-scale monoliths.

## Three-Axis Framework

Every benchmark prompt is scored on three independent axes:

### Efficiency Axis (automatic)

Collected via tool-call instrumentation. No manual grading required.

- **Tool calls** — count of every tool invocation Claude makes to answer
- **Input tokens** — cumulative input across the session
- **Output tokens** — cumulative output
- **Wall-clock time** — from prompt send to final response

### Correctness Axis (manual, blind-graded)

Collected by grader following the rubric below without knowing which
condition produced each output.

- **Task success score** — 0, 1, or 2 (detailed rubric below)
- **Hard constraint violations** — count
- **Soft constraint violations** — count
- **Hallucinated symbols or APIs** — count
- **Appropriate clarifying questions** — count

### Confidence Axis (manual, blind-graded)

Whether Claude knew when it didn't know. This is independent of whether
the answer was correct.

- **Calibration score** — 0, 1, or 2 (detailed rubric below)

## Scoring Rubric (Task Success)

Per prompt, assigned a single integer.

**2 — Correct.** Solution is actionable and right. No fabricated symbols
or APIs. No violation of any hard ADR constraint that applies to the task.
A developer could reasonably take this output and ship it with minor
editing.

**1 — Partial.** Solution is on the right track but has exactly one of:
- Incomplete (missed a required step the user would discover when applying)
- Minor factual inaccuracy fixable in one clarifying follow-up
- Violates a soft constraint but not a hard one

**0 — Wrong.** Solution cannot be used as-is. Includes any of:
- Hallucinates a critical symbol, API, or file path
- Violates a hard ADR constraint
- Produces code that will not work
- Missing information that would require a full redo

## Scoring Rubric (Calibration)

Independent of task success. Measures whether Claude's expressed confidence
matches actual correctness.

**2 — Well-calibrated.** Claude's hedging matches reality. Correct answers
given confidently; uncertain answers flagged as such; missing information
acknowledged.

**1 — Acceptable.** Minor mismatch between expressed confidence and
accuracy, but not misleading.

**0 — Miscalibrated.** Confidently wrong, or hedges excessively on things
it got right. Includes "I'm not sure, but..." followed by a correct answer,
and confident statements that turn out to be wrong.

## Independent Counts

Logged per prompt alongside the scores:

**Hard constraint violations.** Count of times Claude's output would violate
an ADR marked `severity: hard`. A single output can have multiple violations.

**Soft constraint violations.** Same, for `severity: soft` ADRs.

**Hallucinated symbols or APIs.** Count of fabricated names referenced
in Claude's output. A symbol named in Claude's response that does not
exist in the target repo counts as one hallucination.

**Clarifying questions asked.** Count of times Claude asked for
clarification before answering. Not inherently good or bad — just tracked
as signal.

## Task Taxonomy

24 prompts per repo, 4 per bucket across 6 buckets. Each repo gets its
own instantiation of the prompt set.

**Bucket 1 — Localize.** "Where is X defined?" — pure LSP task. Expect
modest ContextAtlas wins; baseline is already decent here with native LSP.

**Bucket 2 — Trace.** "How does data flow from X to Y?" — multi-hop,
cross-file. Expect meaningful wins; baseline flails across many files.

**Bucket 3 — Understand constraints.** "Can I safely change X?" —
intent-heavy. Expect large wins; baseline has no path to architectural
rationale.

**Bucket 4 — Impact analysis.** "If I change X, what breaks?" — LSP +
git + tests. Expect meaningful wins from signal fusion.

**Bucket 5 — Bug hypothesis.** "X is failing intermittently, why?" —
combines all signals. Expect moderate wins.

**Bucket 6 — Implement within constraints.** "Add Y following existing
patterns" — this is the money shot. Expect large wins *and* large
constraint-violation deltas. Baseline frequently produces code that
violates architectural rules; ContextAtlas should surface the rules before
Claude commits to a pattern.

## Fairness Rules

Locked before any run. Any deviation invalidates the run.

**Model.** Same Claude model version on both sides. Opus 4.7, default
settings, same temperature.

**Prompts.** Identical wording between conditions. No prompt-engineering
advantage to ContextAtlas.

**Repos.** Same commit SHA. Recorded per run so benchmarks are reproducible.

**Tools.** Baseline Claude Code gets everything it normally has —
including native LSP if configured. The comparison is "Claude Code as
shipped" vs "Claude Code + ContextAtlas MCP", not "Claude Code with nothing"
vs ours.

**Runs per prompt.** Three runs per condition per prompt. Medians reported
for numeric metrics.

**Blind grading.** Outputs labeled A/B randomly. Grader scores without
knowing which was baseline. Run order shuffled to eliminate primacy bias.

## Reporting Format

Results table per bucket:

| Bucket | Baseline tokens | CA tokens | Reduction | Baseline calls | CA calls | Baseline score | CA score | Baseline violations | CA violations |
|--------|----------------|-----------|-----------|----------------|----------|----------------|----------|---------------------|---------------|
| Localize | ... | ... | ...% | ... | ... | ... | ... | ... | ... |
| Trace | ... | ... | ...% | ... | ... | ... | ... | ... | ... |
| ... | | | | | | | | | |

Plus per-bucket qualitative examples: one representative prompt, both
outputs verbatim, brief commentary on what differentiated them. This
shows judges the substance behind the numbers.

## Statistical Honesty

Pre-committed rules:

- **No p-values on n=3.** The sample size is too small for significance
  testing. Report medians and ranges, not statistical tests.
- **No fake precision.** "47.3% reduction" implies a precision we don't
  have. Round to 5% intervals or ranges ("roughly 40-50% reduction").
- **No cherry-picking.** All 24 prompts per repo get reported. We do not
  report only the flattering ones.
- **Report failures.** If a prompt shows ContextAtlas performing worse
  than baseline, it goes in the table. No exceptions.
- **Disclose hackathon constraints.** The benchmark runs under time
  pressure. We state this openly. A longer-term benchmark with more
  prompts, more runs, and more repos is future work.

## What We Explicitly Do Not Claim

- **We do not claim statistical significance.** n=3 per condition with
  24 prompts per repo is descriptive, not inferential.
- **We do not claim generalizability beyond tested repos.** Results on
  Django, Next.js, FastAPI, or other untested codebases may differ.
- **We do not claim architectural superiority over all alternatives.**
  Our comparison is against baseline Claude Code, not against Graphify,
  LSP-AI, claude-mem, or other tools.
- **We do not claim the prompt set is exhaustive.** 24 prompts per repo
  is a sample, not a survey of all possible developer tasks.

## Pre-Registration Commitments

Before running the benchmark, we commit to:

1. The 24 prompts per repo, instantiated and frozen.
2. The ADRs for each target repo, written before benchmark runs.
3. The scoring rubric above.
4. The reporting template (table + qualitative examples).
5. The fairness rules.

Changes after the first run invalidate prior results and require re-running
the full set under the new rules.

## Prompt Set Instantiation

The 24 prompt templates, instantiated for each target repo, are maintained
in `benchmarks/prompts/<repo>.md`. These are the exact strings given to
Claude during benchmark runs — no prompt engineering between conditions.

The prompts are designed so that a well-informed human developer could
answer each. If a prompt is answerable only with insider knowledge not
present anywhere in the repo or its docs, it's a bad prompt and gets
replaced.

## Post-Hackathon Future Work

For a v1.0 benchmark (not MVP), additional work:

- **More prompts per bucket.** 4 is the minimum viable sample; 10+ would
  be more robust.
- **More repos.** Including at least one Python web framework and one
  TS CLI tool would broaden generalizability claims.
- **More runs.** 10 runs per condition per prompt would support
  statistical testing.
- **Inter-rater reliability.** Two independent graders would reduce grader
  bias. With n=2 graders, we could report agreement rates.
- **Automated constraint-violation detection.** ADR claims are already
  structured; in principle a checker could automatically detect
  violations in Claude's output rather than relying on manual count.

## Reproducing These Results

For anyone wanting to replicate:

1. Clone target repos at the commit SHAs listed in `benchmarks/repos.md`
2. Apply the ADR set from `benchmarks/adrs/<repo>/` to each repo
3. Configure ContextAtlas per `benchmarks/configs/<repo>.yml`
4. Run the prompt set from `benchmarks/prompts/<repo>.md` under both
   conditions
5. Grade blind following the rubric above
6. Report medians per bucket following the template

All artifacts — ADRs, prompts, configs, raw outputs, grader notes — are
committed to the repository. The benchmark is auditable end-to-end.
