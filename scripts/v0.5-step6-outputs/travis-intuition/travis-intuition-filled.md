# Travis-Intuition Phase A Grades — Filled

> **Provenance:** Travis filled in scores + notes in local editor on
> 2026-05-03. Submitted to conversation as score summary + technical
> note summaries. Full notes preserved in conversation transcript;
> summarized below for audit trail.
>
> **Methodology:** Phase A unmediated grading per Step 6 design Q5
> lock. Travis graded each trial using intuition without referencing
> the canonical rubric (RUBRIC_PROMPT_SINGLE in
> src/grading/rubric-prompt.ts).

## Grades Summary

| Trial | Cell | Condition | factual_correctness | completeness | actionability | hallucination |
|---|---|---|---:|---:|---:|---:|
| 1 | httpx/p4-stream-lifecycle | ca | 2 | 3 | 3 | 1 |
| 2 | cobra/c3-hook-lifecycle | beta-ca | 3 | 3 | 3 | 0 |
| 3 | httpx/p2-http3-transport | beta-ca | 3 | 3 | 3 | 0 |
| 4 | hono/h1-context-runtime | beta-ca | 2 | 3 | 3 | 1 |
| 5 | cobra/c4-subcommand-resolution | beta-ca | 2 | 3 | 3 | 1 |

## Notes (summarized from conversation transcript)

**Trial 1 (httpx/p4-stream-lifecycle/ca):** Mutually-exclusive
`read()` / `iter_bytes()` correction surfaced. Hallucination=1
captures slight overclaim around the read/iter_bytes mutual
exclusivity framing.

**Trial 2 (cobra/c3-hook-lifecycle/beta-ca):** No fabrication
detected; clean hook ordering description. factual_correctness=3
reflects exemplary citation discipline.

**Trial 3 (httpx/p2-http3-transport/beta-ca):** No fabrication
detected; clean transport-interface description. factual_correctness=3
reflects exemplary citation discipline.

**Trial 4 (hono/h1-context-runtime/beta-ca):** Slight Node adapter
uncertainty surfaced. Hallucination=1 captures minor overclaim
around Node adapter behavior.

**Trial 5 (cobra/c4-subcommand-resolution/beta-ca):** db-not-prefix-
of-database catch surfaced — answer's prefix-matching framing has a
subtle issue around how `db` actually maps to `database`.
Hallucination=1 captures this overclaim.

## Submission

This filled markdown is the persisted audit-trail substrate for
Step 6.3 gate-evaluation script (`scripts/v0.5-step6-gate-eval.mjs`).
Scores are hardcoded into the gate-eval script with explicit
`sourced from travis-intuition-filled.md` provenance comment.
