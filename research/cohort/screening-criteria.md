# ContextAtlas v0.6 Cohort Screening Criteria

**Audience:** Internal screening reference used during
recruitment-process.md screening conversations. Not a participant-
facing document.

**Purpose:** Qualifying criteria for v0.6 early-access cohort
participants. Substrate-quality threshold — participants meeting
these criteria produce feedback that v0.7 design can act on;
participants outside these criteria produce feedback colored by
confounds (first-time-user friction; codebase-shape mismatch;
time-budget mismatch).

---

## Required qualifying criteria

### 1. Language coverage

Participant's primary codebase must use one of v0.6's three
supported languages:

- **TypeScript** (Node 20+; tsserver via `typescript-language-server`)
- **Python** (Pyright LSP)
- **Go** (gopls)

**Rationale:** Out-of-scope languages (Rust, Java, .NET, etc.)
have no v0.6 atlas extraction support. Cohort exposure on
unsupported languages produces no actionable substrate.

**Polyglot codebases:** Acceptable if at least one supported
language has substantive footprint. Mixed-language repos with
small TS shim around Rust core, for example, would be screened
toward "needs codebase-fit conversation."

### 2. Codebase characteristics

**ADRs strongly preferred** (not strictly required, but
substantively affects cohort substrate quality):

- **Substantive ADRs (≥5 ADRs):** Optimal cohort fit. Atlas
  extracts architectural intent from ADRs; richer ADR substrate
  → richer atlas → more substantive cohort feedback.
- **Minimal ADRs (1-4 ADRs):** Acceptable. Cohort substrate is
  thinner but still informs tool-description tuning + routing
  failure modes.
- **No ADRs:** Cohort exposure routes through doctor's missing-
  ADRs message + interactive guidance path (per Step 4 routing
  decisions). Substantively different cohort experience; flag
  for separate substrate stratification at cycle close.

**Codebase size:** No hard floor or ceiling. Useful coverage
across size buckets per feedback-template.md:

- Small (<10k LOC) — fast atlas extraction; rapid feedback
  loops; representative of new-project-bootstrap scenarios
- Medium (10k-100k LOC) — substantively interesting middle
  band; most cohort participants likely fall here
- Large (100k-1M LOC) — exercises atlas extraction at scale;
  substrate for v0.7 performance + cost concerns
- Very large (>1M LOC) — out-of-scope at v0.6; extraction-cost
  concerns + onboarding-flow stress beyond v0.6 substrate

**Architectural complexity:** Production codebases (not toy
projects) preferred. Sustained engineering — multiple
contributors; revision history; some structural decisions worth
documenting — produces richer cohort substrate than greenfield
prototypes.

### 3. Time commitment expectations

Participant must have realistic time budget for the trial:

- **Per-session feedback:** ~5-10 minutes per atlas-relevant
  session (per feedback-template.md framing; sparse-is-OK)
- **Post-trial structured feedback:** ~30-45 minutes once at
  end of cohort exposure
- **Trial duration:** Calendar window of ~2-4 weeks
  (substantively flexible; participant-defined session
  frequency)
- **Total time budget:** Roughly 1-3 hours total for
  participants with light atlas-tool usage; 3-6 hours total
  for heavier cohort participants

**Out-of-scope:** Participants whose schedules can't budget
~1-3 hours over a 2-4 week window. Better to wait for v0.7
rather than rush a trial that produces only thin substrate.

### 4. Structured-feedback willingness

Participant must be **willing to provide written feedback** —
not just verbal impressions. Feedback template
(`research/cohort/feedback-template.md`) is the substrate-
quality enforcement mechanism: structured questions isolate
failure modes that anecdotal "it was fine" feedback can't.

**Out-of-scope:** Participants who are happy to use the tool
but won't fill out feedback. Substrate-quality threshold
not met; recruitment screening should redirect.

### 5. Existing Claude Code familiarity

Participant must have **prior Claude Code experience** — at
minimum, comfortable with the CLI invocation pattern + slash
commands + MCP tool surfaces.

**Rationale:** First-time-user friction with Claude Code itself
confounds cohort substrate. Cohort feedback should isolate
"atlas tool friction" from "Claude Code friction." Participants
new to Claude Code also need to learn that surface, blurring
which substrate-shaped observations apply.

**Out-of-scope:** First-time Claude Code users. Recommend they
spend 1-2 weeks getting familiar with Claude Code first; revisit
for v0.7 cohort.

## Out-of-scope criteria

The following pattern-matches eliminate participants from v0.6
cohort regardless of other qualifying-criteria fit:

- **Formal data agreements required.** ADR-20 is the consent
  contract; participants requiring formal DPAs / NDAs are
  out-of-scope at v0.6 (v0.7+ may extend infrastructure for
  enterprise-scope cohort).
- **No time budget for written feedback.** See criterion 4.
- **First-time Claude Code users.** See criterion 5.
- **Out-of-scope language as primary codebase.** See
  criterion 1.
- **Codebase size >1M LOC.** Out-of-scope at v0.6 per
  extraction-cost + onboarding-stress concerns; revisit at
  v0.7+.

## Soft-preference criteria (not required; positive signals)

- **Existing MCP server experience.** Participants who have
  used other MCP servers (besides ContextAtlas) bring useful
  comparison frame.
- **Substantive ADR practice already in place.** Codebases with
  ADR-bootstrap pattern matured produce richest cohort
  substrate.
- **Diverse architectural patterns** (event-driven, monorepo,
  CLI tool, web framework, etc.) across cohort. Substantive
  cross-pattern feedback at cycle close.
- **Willingness to share codebase characteristics openly.** Per
  feedback-template.md "Codebase characteristics" section.

## Cross-references

- **Recruitment process:**
  `research/cohort/recruitment-process.md` — outreach + screening
  conversation flow that uses these criteria
- **Pre-trial onboarding:**
  `research/cohort/pre-trial-onboarding.md` — sent to confirmed
  participants after screening passes
- **Feedback template:**
  `research/cohort/feedback-template.md` (Step 6.1 commit
  `69548f4`) — structured feedback substrate
- **ADR-20:** `docs/adr/ADR-20-cohort-observability-contract.md`
  — consent contract referenced during screening
- **Scope source:** `v0.6-SCOPE.md` §Stream C Item 6 — screening
  criteria specification
