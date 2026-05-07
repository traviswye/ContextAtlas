# ContextAtlas v0.6 Cohort Recruitment Process

**Audience:** Internal documentation for how Travis approaches and
onboards v0.6 early-access cohort participants. Not a participant-
facing document — recruitment-facing collateral (outreach
messages, conversation talking points) lives separately.

**Status:** Infrastructure ships at v0.6; cohort exposure runs
during v0.6 Step 7 + extends across cycle execution. v0.7 trial
execution inherits + extends this process for systematic external
recruitment per `v0_7-HANDOFF.md` Stream C.

---

## Cohort target

**Size:** 3-8 participants for v0.6 early-access exposure.
Substrate-quality threshold lower-bounded by 3 (single-participant
selection bias too high); upper-bounded by ~8 to keep feedback
synthesis manageable at v0.6 cycle close.

**Composition:** Travis network — developers known to Travis with
existing trust + collaborative working relationship. Explicit
early-access framing (not public recruitment at v0.6).

**Selection bias acknowledgment:** Travis-network cohorts skew
toward "polite-feedback" pattern + selection-bias on developer
demographics. Feedback synthesis at v0.6 cycle close treats this
as a known limitation (per `v0.6-SCOPE.md` §12 cycle-execution
risks #12 cohort scope substrate-quality conditional on recruitment
success).

## Outreach channels

- **Direct outreach** to Travis network via 1-on-1 messages
  (Slack / email / DM). No public posting at v0.6.
- **No marketplace listings, public forum recruitment, or
  cold outreach** at v0.6. Trust + existing relationship is part
  of why these participants will give honest feedback.
- **No compensation** at v0.6 cycle. Participants contribute
  time as collaborators on a research substrate; recompense is
  implicit (early-access relationship; influence on v0.7 design).

## Outreach framing (talking points)

These talking points represent the substantive content to convey
during outreach. Adapt language to match the specific candidate +
your existing relationship; the substantive points are what
matters, not verbatim wording.

When approaching candidates, lead with these points:

1. **What it is:** "I'm working on a tool that gives Claude
   richer context about your codebase — ADRs, architecture,
   symbol relationships. I'd like you to try it for a couple
   weeks and tell me what works and what doesn't."

2. **Time commitment:** Use feedback template framing: "~5-10
   minutes per session feedback when atlas was relevant; ~30-45
   minutes post-trial structured feedback at the end."

3. **Substrate-generation thesis:** "v0.6 is early-access; you
   should expect rough edges. Your feedback substantively shapes
   v0.7 design + v1.0 launch. This is research, not a polished
   product trial."

4. **Consent + data handling:** Reference ADR-20 explicitly.
   "Observability is opt-in via a flag; you can read the data
   we collect; data lives only on your machine; you can delete
   it any time." Link to
   `docs/adr/ADR-20-cohort-observability-contract.md`.

5. **No compensation; collaborative framing.** Participants are
   early-access collaborators, not test subjects. Position
   accordingly.

## Application / expression-of-interest flow

Lightweight; non-bureaucratic. After initial outreach:

1. **Interested-yes signal:** Candidate replies expressing
   interest. No formal application.

2. **Brief screening conversation** (~15-20 min via Slack DM /
   email / call): walk through screening criteria
   (`screening-criteria.md`). Confirm:
   - Codebase fits (TypeScript / Python / Go; has ADRs preferred)
   - Time budget is realistic (~5-10 min × N sessions + 30-45
     min post-trial)
   - Willingness to provide structured feedback
   - Existing Claude Code familiarity (avoids first-time-user
     friction confounding cohort substrate)

3. **Onboarding handoff:** Once confirmed, send
   `pre-trial-onboarding.md` link with contextatlas install
   instructions + ADR-20 link.

4. **No formal data agreements at v0.6.** ADR-20 is the consent
   contract; participant opting in via `--observe` flag is
   sufficient consent signal.

## Initial conversation expectations

Frame transparently:

- **What's shipping at v0.6:** Atlas extraction + 3 MCP tools
  (`get_symbol_context`, `find_by_intent`, `impact_of_change`) +
  observability instrumentation. Not v1.0; rough edges expected.
- **What's NOT shipping at v0.6:** Polished onboarding flow;
  full quality-axis matrix-replication; production telemetry.
  These are v0.7+.
- **Substrate role:** Cohort feedback informs v0.7 design across
  4 substrates per ADR-20 §5 (routing improvements + tool-
  description tuning + slash-command demand + methodology
  refinements).
- **Cycle close timeline:** v0.6 cycle close ~2-4 weeks after
  Step 9 ship; substrate aggregation happens then; participants
  may submit logs out-of-band per ADR-20 §4.

Acknowledge that recruitment may under-perform (per
`v0.6-SCOPE.md` §12 risk #12). If fewer than 3 candidates
confirm, cycle-close synthesis frames cohort substrate as
"directional-only" rather than "statistically-meaningful."

## Cross-references

- **ADR-20 cohort observability contract:**
  `docs/adr/ADR-20-cohort-observability-contract.md` — consent
  contract; data handling; participant rights
- **Screening criteria:**
  `research/cohort/screening-criteria.md` — qualifying criteria
  reference during screening conversations
- **Pre-trial onboarding:**
  `research/cohort/pre-trial-onboarding.md` — onboarding doc
  sent to confirmed participants
- **Feedback template:**
  `research/cohort/feedback-template.md` (Step 6.1 commit
  `69548f4`) — structured feedback during + post trial
- **Scope source:** `v0.6-SCOPE.md` §Stream C Item 6 —
  recruitment infrastructure scope specification
- **v0.7 inheritance:** `v0_7-HANDOFF.md` Stream C trial-
  execution — systematic external recruitment extends v0.6
  infrastructure
