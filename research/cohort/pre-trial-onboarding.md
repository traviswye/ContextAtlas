# ContextAtlas v0.6 Pre-Trial Onboarding

**Audience:** Cohort participants confirmed via the recruitment
process. This is the participant-facing onboarding doc — sent
after screening passes, before the first session.

Welcome — and thank you. You're an early-access collaborator on
ContextAtlas v0.6; your feedback substantively shapes v0.7
design + v1.0 launch substrate.

This document covers what to expect, how to provide feedback,
and the consent + opt-out paths for observability.

---

## What to expect

### Trial scope

- **Duration:** ~2-4 weeks calendar window. Flexible; you set
  your own session frequency.
- **Session frequency:** Use the tool naturally during your
  normal Claude Code workflow. There are no specific tasks you
  need to complete. We're trying to learn how the tool fits
  (or doesn't) into how you actually work.
- **What you'll be doing:** Using Claude Code with the
  ContextAtlas MCP server enabled. Atlas tools surface when
  Claude reaches for them; you don't need to invoke them
  manually.
- **What we're learning:** Which atlas tools Claude routes to,
  which it misses, where the tool-description language could be
  clearer, where natural-routing fails.

### What's shipping at v0.6 (substantive scope-disclaimer)

v0.6 is early-access. Expect rough edges:

- **Atlas extraction** of ADRs + docstrings + commit-message
  intent into a queryable substrate
- **3 MCP tools** Claude can use: `get_symbol_context`,
  `find_by_intent`, `impact_of_change`
- **Onboarding pipeline** (`contextatlas init`) — usable, not
  yet polished
- **Observability instrumentation** (`--observe` flag) —
  documented in ADR-20 (see "Consent + observability" below)

### What's NOT shipping at v0.6

- Polished onboarding UX (v0.7 work)
- Full quality-axis matrix-replication (v0.7 methodology
  graduation)
- Centralized telemetry / dashboards (out-of-scope by design;
  see ADR-20)
- Multi-machine session correlation (out-of-scope at v0.6)

If you hit friction on any of the above, it's expected — and
your feedback on what's frustrating substantively informs v0.7
prioritization.

## Time commitment summary

Match your investment to your actual usage. From the feedback
template:

- **Per-session feedback:** ~5-10 minutes per atlas-relevant
  session. Sparse-is-OK; honest sparse beats forced verbose.
  Sessions where atlas tools weren't relevant don't need
  feedback entries.
- **Post-trial structured feedback:** ~30-45 minutes once at
  end of cohort exposure.
- **Total time budget:** Roughly 1-3 hours total for light
  cohort use; 3-6 hours total for heavier users.

You can fill some sessions and skip others, or stop at any
time.

## How to provide feedback

Two complementary streams (per ADR-20 §1 + feedback template
two-layer consent framing):

### 1. Per-session feedback (manual; voluntary at every point)

Fill `research/cohort/feedback-template.md` per-session entries
when atlas tools were relevant to your work. The template
isolates three failure modes:

- Did Claude invoke an atlas tool when expected?
- If yes, was output useful?
- If no, what did you expect / what did Claude do instead?

Submission method: see "How to submit feedback" below.

### 2. Observability data (auto-captured if `--observe` is on)

If you opted in via `--observe`, the MCP server logs each
tool-call to `.contextatlas/observe-log.jsonl` in your repo.
This complements the manual feedback by capturing what Claude
*actually* did (which informs interpretation of your feedback
about what Claude *should* have done).

**Per ADR-20 (cohort observability contract):**

- Logs are local-only; nothing uploaded automatically
- You can read the file at any time (it's plain JSONL)
- You can delete it at any time
- You decide whether to submit it at trial close

### How to submit feedback

At cycle close (~2-4 weeks after trial start), Travis will reach
out with submission instructions. Submission is out-of-band:

- **Per-session + post-trial feedback:** Send the filled
  template via Slack / email (whatever channel you used during
  recruitment).
- **Observability log:** Optional. If you choose to submit, send
  `.contextatlas/observe-log.jsonl` via the same channel.
  You can review it first; you can redact lines if anything
  looks off; you can decline submission entirely.

## Setup walkthrough

### 1. Install ContextAtlas

```
npm install -g @contextatlas/contextatlas
```

(Or follow the install instructions Travis sent you separately.)

### 2. Run init in your project

```
cd /path/to/your/repo
contextatlas init --observe
```

The `--observe` flag enables observability for this project.
Per ADR-20 §2, **passing `--observe` IS the consent signal**
— there's no separate prompt or click-through. You opted in by
typing it.

If you'd rather try observability per-session without writing
it into your config, skip `--observe` here and pass it to the
MCP invocation later instead (see "Per-session opt-in" below).

`init` walks you through atlas extraction + smoke test + MCP
registration. Expect ~1-3 minutes for small repos; longer for
large ones.

### 3. Verify the success message

Init prints a structured success message confirming:

- Config scaffold created at `.contextatlas.yml`
- Atlas extracted (symbol count summary)
- Smoke test passed
- MCP registration written to `.mcp.json`

If observability is enabled, the success message confirms it.
Reference ADR-20 if anything is unclear.

### 4. Start using Claude Code

ContextAtlas MCP tools surface automatically when Claude reaches
for them. Use Claude Code normally — atlas surfaces when
relevant, stays out of the way otherwise.

## Consent + observability

The full cohort observability contract is in
[`docs/adr/ADR-20-cohort-observability-contract.md`](../../docs/adr/ADR-20-cohort-observability-contract.md).
Key points:

### What's captured (per ADR-20 §3)

- Tool name (which of the 3 atlas tools Claude called)
- Sanitized request arguments
- Response shape (success/error; latency; result count)
- Timestamp + anonymized session-id
- ContextAtlas version

### What's NOT captured (per ADR-20 §1)

- Your prompts to Claude or Claude's reasoning
- Your source code text
- Atlas content returned to Claude
- Email addresses, home-directory paths, or absolute filesystem
  paths beyond your repo cwd (sanitized at the boundary)

### Per-session opt-in

If you didn't pass `--observe` at init, you can enable
observability per-session:

```
contextatlas --observe
```

This enables observability for that MCP session only, without
editing your config.

### Opt-out

To stop observability:

- Edit `.contextatlas.yml` and set `observability.enabled: false`
- OR remove the `observability` section from the config entirely
- Delete `.contextatlas/observe-log.jsonl` to remove already-
  collected data

A `--no-observe` flag for explicit per-session override is
deferred to v0.7+ pending cohort feedback.

### Your rights (per ADR-20 §7)

- **Access:** Read `.contextatlas/observe-log.jsonl` directly
- **Deletion:** Delete the log file at any time
- **Portability:** JSONL is a standard format
- **Refusal of submission:** You can use observability locally
  without submitting at trial close

## First-session expectations

You don't need a specific task list. Just use Claude Code
normally. Some patterns that surface useful cohort substrate:

- **Architectural questions** — "Why does this module use the
  observer pattern?" / "What does the X subsystem do?"
- **Symbol-level questions** — "Where is OrderProcessor used?" /
  "What's the relationship between BaseHandler and its
  subclasses?"
- **Impact analysis** — "What might break if I change the
  signature of this function?"

Atlas tools target these patterns. If Claude reaches for them,
substrate captured. If Claude doesn't reach for them when you
expected it to, substrate captured *and* worth flagging in
per-session feedback (the missed-invocation failure mode).

You don't have to drive these queries intentionally — natural
workflow surfacing is the substrate we're after.

## Q&A / contact

Travis is the primary contact for v0.6 cohort. Reach out via
the channel you used during recruitment for:

- Setup issues / tool errors / unclear messages
- Questions about ADR-20 / consent / data handling
- Feedback template clarifications
- Anything else that surfaces during the trial

v0.7+ may scale to a wider cohort with a different contact
model; v0.6 is small-cohort + direct-Travis-contact by design.

## Cross-references

- **ADR-20 cohort observability contract:**
  [`docs/adr/ADR-20-cohort-observability-contract.md`](../../docs/adr/ADR-20-cohort-observability-contract.md)
- **Feedback template:**
  [`research/cohort/feedback-template.md`](feedback-template.md)
  (Step 6.1)

---

Thank you again for spending time with v0.6. Your feedback is
load-bearing for v0.7.
