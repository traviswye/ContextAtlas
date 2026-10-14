---
id: ADR-24
title: The atlas refreshes automatically in three cost tiers; only Tier 2 calls the API
status: accepted
severity: hard
symbols:
  - runStructuralRefresh
  - writePendingQueue
  - installHooks
  - acquireRunLock
  - runRefreshClaims
  - subscriptionEnv
  - checkDue
  - AtlasReloader
  - freshnessChecks
  - ensureCacheIgnored
---

# ADR-24: The atlas refreshes automatically in three cost tiers; only Tier 2 calls the API

## Context

Through v1.1 the atlas went stale silently. Nothing triggered a
refresh, and the running MCP server never re-read `atlas.json`. The
dogfood atlas was 17 commits behind HEAD at v1.2 entry. ContextAtlas
is now the project-brain layer under a workspace command center
(v1.2 re-sequence, 2026-09-24), and a warm-started session is only as
good as the atlas it reads.

Two constraints shape the answer. Nobody should have to remember to
run anything. And automatic refresh must not become a token drain:
extraction is the only expensive step (ADR-02), and running it on
every commit would cost more than the atlas is worth.

The decisions below were taken phase by phase in the v1.2 cycle
(`docs/cycles/v1_2/v1.2-SCOPE.md`, lead decisions L-16 to L-22, D-2
and D-3). The mechanisms are specified in the ADR-12, ADR-05 and
ADR-06 2026-10-14 amendments. This ADR records the architecture they
form.

## Decision

### Three tiers, split by cost

| Tier | What it does | Cost | Trigger |
|---|---|---|---|
| **0, structural** | LSP symbol inventory, stale-symbol pruning, orphan re-link, git signal, SHA diff into the pending queue | Free: no model call, no API key | Git hooks: post-commit, post-merge, post-checkout (branch switches) |
| **1, incremental claims** | Re-extracts claims for pending sources only | Subscription: headless `claude -p` running `/refresh-atlas`, batched and capped | pre-push hook (`refresh-claims --if-due`); a nightly schedule recipe; manual |
| **2, full / first time** | `contextatlas index`, `index --full` | API | Manual |

- **Tier 0** is `contextatlas index --structural`. A refusing client
  backs the "no model call" guarantee: any extraction attempt throws.
  Changed, added and new sources go to `.contextatlas/local/pending.json`,
  one entry per source key.
- **Tier 1** runs on the subscription, never the API. The child
  environment has every `ANTHROPIC_*` key removed. The run is
  killed before its first model call if Claude Code reports any key
  source other than the subscription login. `--bare` is never passed,
  because it forces API-key auth (D-2).
- **Tier 2** stays on the API. First-time extraction quality is
  higher on the CLI path (the v0.8 Skill-vs-CLI claim-ratio finding),
  and it is a one-time, previewed cost (ADR-12 2026-09-25 cost
  preview).

### Hooks never write tracked files

Hook-started Tier 0 runs are cache-only (`--no-export`, L-21). They
never write `atlas.json`, which would otherwise be dirty after every
commit and could block branch switches. `atlas.json` changes only on
an explicit `index` or a Tier 1 run. Hooks start their work in the
background and return at once, so git never waits.

Concurrent runs are serialized by the run lock
(`.contextatlas/local/index.lock`). Structural runs that pile up
during a rebase coalesce into one waiter. A model-calling run never
waits: if the lock is held, it is refused.

### Tier 1 cost controls

Cost is bounded per run, over time, and by a kill switch (ADR-05
`refresh:`):
- per run: `max_sources_per_run` (25) and `max_turns` (80);
- over time, for automatic runs:
  - `min_interval_minutes` (60);
  - `max_utilization` (0.8). A run is skipped while the subscription
    usage recorded by the last session is at or above this fraction,
    until that window resets. Checking costs nothing.
- `auto_claims: false` stops automatic Tier 1; Tier 0 keeps running.

Other controls:
- **Noise filter.** A code-only edit whose docstrings are unchanged
  does not queue docstring re-extraction.
- **Ledger.** Every invocation is recorded in
  `.contextatlas/local/refresh-log.jsonl`, with turns, Claude Code's
  list-price estimate and the usage windows.
- **Preflight.** Setup is checked before a session starts: the queue
  is not empty, no run holds the lock, and `atlas.json` and the
  extraction prompt artifact exist. None of these checks spends tokens
  (Phase 8 fix).

The scope's `refresh.trigger` and `refresh.auto_structural` keys were
not built. The trigger is whatever is installed: the hooks
(`contextatlas hooks install`), a scheduler entry running
`refresh-claims --if-due`, or neither. Tier 0 is turned off by
uninstalling the hooks.

### A failed Tier 1 run leaves no damage

`refresh-claims` snapshots `atlas.json` first. It restores the
snapshot when:
- the session reports a failure;
- the session runs out of turns;
- the refreshed atlas does not validate (`validate-atlas`).

The queue drains only for sources the session keyed. The overflow
beyond the caps stays pending.

### Tier 1 model

Tier 1 extracts with the frozen prompt and a model from the
calibrated set (ADR-02). The Phase 7 calibration tested Opus, Sonnet
and Haiku 5.5. Every candidate failed the pre-registered
symbol-candidate recall floor, so `claude-opus-4-7` stays the
default and the only calibrated model (D-3 (a);
`docs/adr/incremental-model-calibration/RESULTS.md`).

### Refreshed state reaches running sessions

With `atlas.committed: true`, the MCP server watches `atlas.json` and
re-imports it when the content changes (ADR-06 2026-10-14). Tool calls
in flight finish first, and a malformed file is rejected. With
`committed: false` the local cache is the source of truth and is not
reloaded (L-19). Query time still makes no model call (ADR-02): every
tier runs at index time.

### Local-only state

- **`.contextatlas/local/`.** Holds the pending queue, run log, run
  lock, ledger, hook logs and docstring digests. The directory carries
  its own `.gitignore` (`*`), so it is never committed and needs no
  change to the repository's own `.gitignore`. The v1.3 session
  overlay reuses this namespace; `atlas.json` stays pure (ADR-06).
- **The local cache.** It is kept out of git by
  `.contextatlas/.gitignore`. `init`, and every `index` run that
  exports, add the cache file and its SQLite side files to it (Phase 9
  fix). A fresh repository used to commit `index.db`, and the hooks
  then left it modified after every commit.

### Visibility

`contextatlas doctor` reports freshness (ADR-12 2026-10-14, Phase 8):
- how far the cache and `atlas.json` trail HEAD;
- the pending queue by stream;
- orphaned claims;
- stale and unreachable source keys;
- hook state;
- Tier 1 ledger totals.

`contextatlas hooks status` gives the short form.

## Rationale

The split follows where the cost is. Everything that needs no model
(symbols, links, git signal, change detection) runs on every commit,
because it is free. Everything that needs a model waits until push,
and then runs once for the whole batch, with hard per-run caps.
`src/refresh/runner.ts:runRefreshClaims` gates every automatic run
before any session starts:

```ts
if (options.ifDue) {
  if (!refresh.autoClaims) {
    return record({ ...base, outcome: "skipped", reason: "refresh.auto_claims is false" }, 0);
  }
  const due = checkDue(readLedger(configRoot), refresh);
  if (!due.due) return record({ ...base, outcome: "skipped", reason: due.reason ?? "not due" }, 0);
}
```

`src/refresh/ledger.ts:checkDue` reads only the local ledger, so a
skipped run costs nothing. The subscription, not the API, pays for
Tier 1. A developer's subscription already has headroom between
sessions, and the utilization ceiling keeps Tier 1 from eating into
the user's own work. `src/refresh/claude-session.ts:subscriptionEnv`
strips API keys from the child, so a misconfigured environment cannot
turn Tier 1 into API spend.

Keeping hooks cache-only (`src/extraction/structural.ts:runStructuralRefresh`
with `--no-export`) keeps the committed artifact an explicit act.
Teams review `atlas.json` changes like any other diff, and they come
from `index` or Tier 1, never from a commit hook.

Alternatives considered:

- **File-save watcher or resident daemon**: refreshes on every save.
  It would need a long-running process per repository and would
  re-extract half-finished edits. Commit and push are the meaningful
  change units, and a daemon multiplies cost by edit frequency.
- **Tier 1 on the API by default**: simpler auth, with no Claude Code
  dependency. But it makes every push a paid API call, the token
  drain this ADR exists to avoid. `contextatlas index` remains the API
  path for anyone who wants it.
- **Hooks that export atlas.json**: the committed atlas would always
  match HEAD. But the working tree would be dirty after every commit,
  and a dirty `atlas.json` can block branch switches (L-21).
- **A cheaper Tier 1 model (Sonnet or Haiku 5.5)**: lower cost per
  run. All candidates failed the pre-registered symbol-candidate
  recall floor in the Phase 7 calibration (D-3 (a)). The calibrated
  model set (ADR-02) lets one be added once there is evidence.

## Consequences

- The atlas's structure stays current at no cost, and its claims
  catch up at push time on the subscription. The API is used only when
  someone runs `index` on purpose.
- Between Tier 1 runs, claims for pending sources describe an older
  version of them. Doctor shows this as a WARN; it is the price of not
  extracting per commit.
- The Tier 1 session overhead is fixed (about 62k prompt tokens,
  mostly cache reads, from the user's global skills and plugins; D-2).
  Batching amortizes it, which is why Tier 1 runs on push rather than
  on commit.
- Hooks are opt-in: `init --yes` installs them, and an interactive
  `init` asks (default no). A repository without hooks behaves as in
  v1.1, plus hot reload.
- Tier 1 depends on Claude Code being installed and logged in. When it
  is missing, or the prompt artifact is missing, the run is skipped or
  fails before spending anything. Tier 0 does not depend on it.
