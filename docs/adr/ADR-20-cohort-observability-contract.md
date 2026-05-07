---
id: ADR-20
title: Cohort observability contract — consent, data handling, participant rights
status: accepted
severity: hard
symbols:
  - createObservabilityWriter
  - getSessionId
  - sanitize
  - stripPaths
  - stripPII
---

# ADR-20: Cohort observability contract — consent, data handling, participant rights

## Context

ContextAtlas v0.6's "minimum viable cycle under cohort exposure"
strategy (per `v0.6-SCOPE.md` §Stream C) ships tool-description
observability to capture which MCP tools Claude routes-to during
cohort sessions, correlated with cohort feedback for v0.7 design
substrate. Observability is opt-in instrumentation per the
`--observe` flag; cohort participants explicitly consent to data
capture before any observation lands.

Step 6.2 (commit `a624390`) shipped the implementation substrate —
PII filter, observation writer, MCP server-level interception,
config + CLI plumbing. This ADR documents the contract that
substrate enforces: what's collected, how it's stored, what
participants can do with their data, how long it's retained.

The closest in-repo precedent is [ADR-19](ADR-19-llm-judge-methodology.md) —
cross-cutting methodology contract documenting cross-step
methodology decisions in one place rather than scattering rationale
across implementation files. ADR-20 follows the same shape: contract
here; implementation specifics in `src/observability/sanitize.ts`
and `src/observability/observe.ts` per [ADR-02](ADR-02-extraction-sole-api-caller.md)
single-source-of-truth precedent.

This contract is participant-facing. Cohort participants reading
ADR-20 should be able to answer four questions: *what gets collected?
who can see it? what can I do with my data? when is it deleted?*

## Decision

### 1. Scope

ContextAtlas observability covers MCP tool-call invocations made by
Claude (via Claude Code or other MCP clients) against this
ContextAtlas server, when the participant has explicitly opted in
via the `--observe` flag.

**In scope:**

- Per-call invocations of `get_symbol_context`, `find_by_intent`,
  `impact_of_change`
- Tool name + sanitized request arguments + response shape
  (status / latency / result_count / symbol_id) + timestamp
- Anonymized session identifier (per-process, not user-correlatable)
- ContextAtlas version that produced the observation

**Out of scope (explicitly NOT collected):**

- User prompt content / conversational history with Claude
- Source code text from the participant's repository
- Atlas content (claims, ADRs, symbol bodies)
- Identity-revealing PII (email addresses, home-directory paths,
  absolute filesystem paths outside the configured cwd)
- Network telemetry (no remote upload at v0.6)

The MCP protocol surface ContextAtlas observes is the JSON-RPC
`tools/call` boundary — what Claude asked the server, what the
server returned. The richer Anthropic API conversational context
(user messages, Claude's reasoning, tool-use traces preceding the
MCP call) is *outside* ContextAtlas's observability scope and is
not captured by this contract.

### 2. Consent process

Observability is **off by default**. No observations are written
unless the participant explicitly opts in.

**The `--observe` flag IS the consent signal** (per Q6.0.4 hybrid
wiring lock). There is no separate prompt, click-through, or EULA;
passing `--observe` *is* the act of consent.

**Two opt-in pathways:**

1. `contextatlas init --observe` writes
   `observability: { enabled: true }` into the participant's
   `.contextatlas.yml` config. Persists across sessions until the
   participant opts out.
2. `contextatlas --observe` (mcp default subcommand) enables
   observability for that session only, without editing the config
   file. Useful for trying observability before persisting.

**Opt-out at v0.6:**

- Edit `.contextatlas.yml` and set `observability.enabled: false`,
  OR remove the `observability` section entirely.
- Delete the existing `observe-log.jsonl` file to remove already-
  collected data (see §7 Participant rights).
- A `--no-observe` flag for explicit per-session override is
  deferred to v0.7+ pending cohort empirical feedback (per Q6.2.6
  lock + Refinement 3 annotation).

**Cohort recruitment framing:** participants reading recruitment
materials at Step 6.4 (`research/cohort/recruitment-process.md`)
will see this ADR linked as the consent contract. Trial onboarding
documentation (`research/cohort/pre-trial-onboarding.md`) points
participants here before any observability runs.

### 3. Data collected

Each observation written to the log is a single JSON line containing:

| Field | Purpose | Example |
|---|---|---|
| `timestamp` | When the call happened (ISO 8601) | `"2026-05-07T14:32:11Z"` |
| `contextatlas_version` | Cycle-version provenance | `"0.6.0"` |
| `session_id` | Anonymized per-process identifier | `"3a8f1c9b2e4d5f60"` |
| `tool` | Which MCP tool was called | `"get_symbol_context"` |
| `request_args` | **Sanitized** request arguments | `{"symbol": "OrderProcessor"}` |
| `response.status` | `"success"` or `"error"` | `"success"` |
| `response.latency_ms` | Server processing time | `47` |
| `response.result_summary` | Compact result shape (optional) | `{"symbol_kind": "class"}` |
| `response.error_message` | Sanitized error text (error path only) | `"symbol not resolved"` |

**`session_id` derivation:** SHA256 hash of `process.pid + start
timestamp`, truncated to 16 hex chars. Stable for the lifetime of
one MCP server process; distinct on the next invocation. **Not
user-correlatable across sessions** — there is no stored mapping
between session_id and participant identity.

**Sanitization** (per Step 6.2 `sanitize.ts` substrate, applied
*before* the writer sees the observation):

- Email patterns matching `/[\w.+-]+@[\w.-]+\.\w+/g` → `<redacted>`
- Home-directory paths (`/Users/<user>/...`, `/home/<user>/...`,
  `C:\Users\<user>\...`) → `<home>`
- cwd-prefixed paths → `<cwd>` + relative tail
- Allowlist fields (`tool`, `kind`, `language`, `status`,
  `latency_ms`, etc.) preserved verbatim
- Defensive: cycles → `<cycle>`; recursion >64 → `<recursion-limit>`

**What's NOT logged** (reiterated for clarity):

- The participant's source code text
- The user's prompts to Claude or Claude's reasoning
- ADR or claim content the atlas returned to Claude
- Absolute filesystem paths beyond the configured cwd
- Any field not on the Observation interface
  (`src/observability/observe.ts:29`)

**v0.6 v1 minimal-defensible-baseline disclosure** (per Q6.2.3 +
Refinement 2): the PII denylist currently covers email patterns
only. Pattern enumeration may extend at v0.7+ pending cohort
empirical surface. Allowlist + path-stripping provide the primary
PII protection; denylist is a secondary backstop.

### 4. Storage

Observations are stored **locally only** — there is no remote
upload, no telemetry endpoint, no analytics service in v0.6.

- **Location:** `.contextatlas/observe-log.jsonl` at the
  participant's repo root, by default. Configurable via
  `observability.logPath` in `.contextatlas.yml`.
- **Format:** Newline-delimited JSON (JSONL); one observation per
  line; append-only.
- **Atomicity:** Each line is written via a single
  `fs.appendFileSync` call; partial writes don't corrupt prior
  observations.
- **No log rotation in v0.6:** Logs grow unbounded across sessions.
  Empirical observation: cohort logs typically remain under 10MB
  per cycle. Rotation is deferred to v0.7+ pending size empirical
  surface.
- **No remote upload:** Aggregation pattern for cohort substrate
  consumption (how cohort logs reach Travis at cycle close) is
  out-of-band rather than automated upload. Specifics firm at
  Step 6.4 recruitment infrastructure.

### 5. Use

Cohort observability data informs four v0.7 design substrates:

1. **v0.7 H2 atlas tool routing improvements:** Which tool Claude
   reaches for first, which it falls back to, where natural-routing
   fails — directly informs tool-description tuning.
2. **v0.7 H1 tool-description tuning targets:** Latency + result
   shape patterns surface which tool surfaces feel "worth invoking"
   vs. friction-prone.
3. **v0.7 slash-command design substrate:** Repeated invocation
   patterns may indicate workflow primitives that warrant slash-
   command surfaces.
4. **Cohort empirical surface for methodology refinements:**
   Observation patterns + cohort feedback (Step 6.1 template)
   cross-reference into v0.7 cycle pre-planning.

**Use boundaries:**

- Observability data is **not** used to identify individual
  participants or their codebases.
- Observability data is **not** shared with third parties outside
  the ContextAtlas project.
- Aggregated patterns (e.g., "60% of sessions invoked
  `get_symbol_context` first") may appear in v0.7 cycle close
  documentation; individual session traces do not.

### 6. Retention

Cohort observability data is retained for the **cohort exposure
window** (defined at Step 6.4 recruitment infrastructure) plus the
**v0.6 cycle-close synthesis window** (typically 2-4 weeks after
cycle ship for substrate aggregation).

**v0.6 retention policy:**

- During cohort exposure: data retained on participant's local
  filesystem at `observability.logPath`.
- At cycle close: participants may submit log files (out-of-band)
  for substrate aggregation OR delete locally without submission.
- Post-cycle-close: aggregated substrate (de-identified, pattern-
  level) retained in benchmarks-repo cycle reference doc; raw
  per-participant logs not retained centrally.
- **Specifics firm at v0.7 cycle pre-planning** based on Step 6.4
  recruitment infrastructure decisions and cohort exposure-window
  sizing.

**Deletion process:**

- **Participant-initiated:** Delete `observe-log.jsonl` at any
  time — no further action required. New observations only land
  if `observability.enabled` remains true.
- **Project-initiated:** Aggregated substrate (anonymized, pattern-
  level) referenced in cycle-close docs is not removed; raw logs
  participants don't submit are never collected centrally.

### 7. Participant rights

Cohort participants have four rights regarding their observability
data:

**1. Access.** The log file lives at a config-known location
(`observability.logPath`, default `.contextatlas/observe-log.jsonl`).
Participants can read, inspect, and search it directly with any
text tool. JSONL format is line-by-line readable; `jq` works for
structured queries.

**2. Deletion.** Delete `observe-log.jsonl` at any time to remove
all collected data. To stop further collection: set
`observability.enabled: false` in `.contextatlas.yml` OR remove the
`observability` section entirely. No deletion-request workflow is
needed because data lives only on the participant's machine.

**3. Portability.** JSONL is a standard format. Participants can
copy the log to any system, transform it with standard JSON tools,
or analyze it independently. Field names and shapes are documented
in §3 Data collected.

**4. Refusal of submission.** Cohort participants who enabled
observability during a session may decline to submit logs at cycle
close. Substrate aggregation is opt-in at submission time;
participants may run with `--observe` to inspect their own data
without submitting.

**No identity correlation:** Because session_id is anonymized and
not centrally mapped to participant identity, there is no "give
me all data about user X" request to fulfill — the participant *is*
the access point for their own data.

### 8. Cross-references

**Implementation substrate (Step 6.2; commit `a624390`):**

- `src/observability/sanitize.ts` — PII filter (denylist + allowlist
  + path-stripping)
- `src/observability/observe.ts` — JSONL writer + session_id +
  Observation shape
- `src/mcp/server.ts` — server-level interception via
  `CreateServerOptions.observabilityWriter`
- `src/cli-args.ts` — `--observe` flag wiring
- `src/init/config-scaffold.ts` — `observability` section emission
  in scaffold
- `src/index.ts` — writer construction at MCP startup

**Cohort process documentation:**

- `research/cohort/feedback-template.md` (Step 6.1; commit
  `69548f4`) — voluntary structured feedback complementing
  observability data; two-layer consent clarification
- `research/cohort/recruitment-process.md` (Step 6.4) — how
  participants encounter ADR-20 during recruitment
- `research/cohort/screening-criteria.md` (Step 6.4) — recruitment
  qualifying criteria
- `research/cohort/pre-trial-onboarding.md` (Step 6.4) — onboarding
  walkthrough referencing this ADR before observability begins

**Methodology context:**

- `v0.6-SCOPE.md` §Stream C — strategic framing of cohort exposure
  + observability as v0.7 substrate generation
- `STEP-PLAN-V0.6.md` — Step 6 progress log entries; B17 hybrid
  capture sub-blocks
- `CLAUDE.md` "Extraction cost framing" — honest-scope-narrative
  discipline (parallel pattern: claim conservative; note actual-
  typically-better)

**Related ADRs:**

- [ADR-19](ADR-19-llm-judge-methodology.md) — cross-cutting
  methodology contract precedent (rubric / anonymization /
  statistical methodology)
- [ADR-12](ADR-12-cli-subcommand-surface.md) — CLI subcommand
  surface (where `--observe` flag rules live)
- [ADR-05](ADR-05-single-flat-yaml-config.md) — config schema
  (where `observability` section lives)

## Consequences

- **Cohort participants have a clear consent contract** before any
  observability runs. Recruitment + onboarding documentation
  (Step 6.4) references ADR-20 as the consent anchor.
- **Privacy-load-bearing rigor** lives in two places — sanitize.ts
  test substrate (18 tests at Step 6.2) and this contract (§3 Data
  collected enumeration). Either one drifting from the other is a
  process bug.
- **v0.7 substrate is well-defined.** Cohort observability data
  flows into 4 enumerated v0.7 design substrates (§5 Use); use
  boundaries prevent scope creep.
- **Cohort empirical surface may extend the contract.** Pattern
  enumeration at v0.7+ may add PII patterns; retention specifics
  firm at v0.7 cycle pre-planning. ADR-20 amendments at that point
  follow ADR-19 §4 amendment precedent.

## Limitations

- **PII denylist is minimal at v0.6 v1** (email patterns only).
  Allowlist + path-stripping provide primary protection; cohort
  empirical surface may justify expansion.
- **No remote upload pathway in v0.6.** Aggregation is out-of-band
  at cycle close. Centralized aggregation infrastructure is v0.7+
  scope contingent on cohort scale.
- **Retention specifics deferred** to v0.7 cycle pre-planning. v0.6
  cohort exposure runs under "cohort exposure window + cycle-close
  synthesis" framing without firm day-count.
- **Single-machine session scoping.** Observability does not follow
  participants across machines; each ContextAtlas instance has its
  own log. Cross-machine correlation is not in scope.

## Non-goals

- **Centralized telemetry endpoint.** Out of scope for v0.6;
  candidate for v0.7+ contingent on cohort scale + opt-in
  aggregation infrastructure.
- **Identity-correlated tracking.** Out of scope by design.
  session_id is anonymized; no participant-identity mapping exists.
- **Real-time observability dashboards.** Out of scope for v0.6.
  Substrate analysis happens at cycle close.
- **Automated PII pattern learning.** Pattern enumeration extension
  is human-curated at v0.7+; no ML-based PII detection planned.
