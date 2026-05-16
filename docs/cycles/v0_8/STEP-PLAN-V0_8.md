# STEP-PLAN-V0_8.md

**Status:** Active execution plan for v0.8 launch-bearing-closure
cycle preceding v0.9 administrative cycle preceding v1.0 public
launch trigger. See `## Revision history` for material rescopes;
routine progress-log entries in `## Progress log`.

**Initialized:** 2026-05-12 (Cluster 1 / Step 1.0 work post-
v0.8-SCOPE.md commit `3f8fc89`).

---

## Conventions

### Cluster structure (4 substep clusters + cycle close)

V0.8 cycle adopts **substep cluster** framework per LOCK 1
Option α at v0.8 cycle pre-planning design adjudication surface
(matches v0.6 Stream A/B/C concurrent pattern + v0.7 6-substep
Option α ship-gate ladder precedent at abstraction). Substep
clusters substantively shipped via commits at canonical
boundaries (cluster open + per-substep ship + cluster close).

Cluster types applying at v0.8:

- **Cluster-bounded parallel** (Cluster 1): benchmarks-repo
  parallel cadence per Option γ ordering at LOCK A. Stream B
  matrix-completion at benchmarks-repo substantively orthogonal
  to main-repo clusters 2-4.
- **Cluster-bounded sequential** (Clusters 2-4): main-repo
  sequential per Option γ ordering. Each cluster ships before
  next cluster opens; substep ordering within cluster firms at
  Step N.0 design-adjudication substep.
- **Cycle-close-bounded** (Cluster 5 / Step 5): cycle-close
  substep cluster absorbing ROADMAP.md update + backlog file
  rename + v0_9-HANDOFF.md substrate + cross-repo back-reference
  + ship gate + annotated tag landing per LOCK G + LOCK 2 + v0.7
  ship-gate 6-substep precedent inheritance.

### Step N.0 design-adjudication cadence

Each cluster opens with a Step N.0 design-adjudication substep
that locks cluster's substep-level breakdown per discipline #3
surface-inline-before-commit cadence applied to cluster design
phase. Inheritance from v0.6 + v0.7 Step N.0 cadence convention;
pattern established at every cycle's step-design surface.

Q-pattern Q1.0.X / Q2.0.X / Q3.0.X / Q4.0.X / Q5.0.X per cluster
captures design adjudications at canonical scope-doc anchor.

### Progress log entries

When a substep ships, append entry to `## Progress log` reverse-
chronological. Format inherits v0.5/v0.6/v0.7 STEP-PLAN progress
log entries:

```
### Step N.X shipped — YYYY-MM-DD

[Ship-narrative paragraphs]

| Substep | branch | commit | Notes |
|---|---|---|---|
| N.X.Y | ... | ... | ... |

#### Q-lock summaries (if applicable)

#### Cycle-execution observations (if applicable)
```

### Substrate-evolution drift framework

V0.8 cycle inherits v0.7 cycle Q-pre-4 substrate-evolution drift
framework:

- **Path C (post-state framing)** — DEFAULT for substrate-
  evolution after substantive work shipped against pre-state
  scope. Earlier-cycle-substrate-docs preserved as historical
  record; later-cycle-shipped-state reflects current substrate
  per cycle execution.
- **Path A (update-pre-state framing)** — APPLIES for mid-cycle
  scope adjustment BEFORE substantive work shipped against
  superseded scope. Surfaces via amendment commit with explicit
  scope-acknowledgment pre-state vs post-state framing change.

### Cycle-discipline constraint per LOCK 1 (load-bearing)

**NOTHING from v0.8 pushes to v0.9.** Critical cycle-discipline
constraint preserved at every substep cluster + cycle-close
surface:

- V0.9 substantively bears administrative-completion weight only
  (repo hygiene + doc reorganization + npm deployment)
- Load-bearing-to-launch items in v0.8 cycle scope (all 4 cluster
  scopes + cycle close cycle-doc updates) substantively MUST
  complete in v0.8 — non-negotiable per launch-readiness
  discipline
- Non-load-bearing-to-launch items defer BECAUSE non-load-bearing
  to `research/v1.1-candidates.md` substrate per LOCK 2 backlog
  file rename framing — NOT "pushed from v0.8 to v1.1"
- Discipline rationale: keeping v0.9 framing private at v0.8
  cycle thinking prevents substrate-erosion risk where v0.8
  cycle work substantively softens because "v0.9 will catch it"

---

## Cross-references

- [`v0.8-SCOPE.md`](v0.8-SCOPE.md) — canonical v0.8 scope-doc
  (commit `3f8fc89`); Direction D' refined + 4 substep cluster
  framework + LOCKs A-H + LOCKs 1-2 + V1.0 ship-gate evolution
  + methodology amendments + deferred-items enumeration with
  "deferred BECAUSE non-load-bearing-to-launch" framing
- [`v0_8-HANDOFF.md`](v0_8-HANDOFF.md) — v0.8 cycle pre-planning
  bridge document (commit `49ca82c`); §1-§4 framework substrate-
  inheritance from v0.7 cycle close
- [`research/v0.8-candidates.md`](research/v0.8-candidates.md)
  — 21 v0.8+ forward-pointer candidates substrate (commit
  `345696d`; substantively renamed to `research/v1.1-
  candidates.md` at v0.8 cycle close per LOCK 2)
- [`v0.7-SCOPE.md`](v0.7-SCOPE.md) — v0.7 scope anchor (shipped
  2026-05-12; tag `v0.7.0`); 3-tier scope inheritance pattern +
  Q-pre-1 through Q-pre-6 locks + launch-bearing cycle thesis
- [`STEP-PLAN-V0.7.md`](STEP-PLAN-V0.7.md) — v0.7 cycle per-
  step execution log; 17 Class-15 capstone composition + 6-
  substep ship-gate ladder + atomic ship-gate discipline pattern
- [`v0_7-HANDOFF.md`](v0_7-HANDOFF.md) — v0.7 cycle pre-planning
  bridge document; F1-F9 methodology amendments substrate +
  cycle-pre-planning insights
- [`ROADMAP.md`](ROADMAP.md) — strategic arc v0.1 → v1.0 (will
  absorb v0.5/v0.6/v0.7/v0.8 cycle progression at v0.8 cycle
  close per LOCK G ROADMAP substrate-currency gap absorption)
- [`CLAUDE.md`](CLAUDE.md) — current-version pointer +
  contextatlas-project working-instructions (Current Version
  block reflects v0.7 ship at present; updates at v0.8 cycle
  close)

---

## §1 Cycle overview

### V0.8 cycle thesis (per v0.8-SCOPE.md §1)

V0.8 launch-bearing-closure cycle ships V1.0 ship-gate criterion
#1 statistical closure + cohort-onboarding-pipeline completion
via 4 substep cluster framework per Direction D' refined lock
(Travis + dev + advisor convergent triangulation):

- **Cluster 1 — Stream B matrix-completion** (benchmarks-repo
  parallel cadence). Full 24-cell × n=5 × 2 conditions = 240
  trials at single fixed atlas-substrate; F9 tag-AND-control
  discipline. Closes V1.0 ship-gate criterion #1 statistical-
  meaningful-wins.
- **Cluster 2 — TERTIARY A1+A2+A3 absorption** (main-repo
  sequential). User-trust pre-launch gates carried-since-v0.4.
- **Cluster 3 — /prime-atlas Skill substrate** (main-repo
  sequential). Closes cohort-onboarding-pipeline surface end-to-
  end (init + /generate-adrs + /index-atlas + /prime-atlas).
- **Cluster 4 — Bounded mechanical absorption** (main-repo
  sequential). FO-15 + FO-16 + SDK upgrade ^0.27.0 → ^0.32.0.
- **Cluster 5 — Cycle close** (main-repo sequential cycle-close
  substep cluster). ROADMAP.md update + backlog file rename +
  v0_9-HANDOFF.md substrate + cross-repo back-reference + ship
  gate + v0.8.0 annotated tag landing.

### V1.0 ship-gate criteria narrative shift

Pre-v0.8 (post-v0.7 cycle close): **"2-of-3 MET + 2 carried-
forward"** (#1 quality-axis CLOSED at v0.5 preserved; #1
statistical △ PARTIAL via v0.6 8-cell subset; #2 onboarding
CLOSED at v0.7; #3 external dogfood ✗ NOT MET).

Post-v0.8 (locked): **"3-of-3 MET + 1 deferred-by-design"** (#1
quality-axis preserved; #1 statistical ✓ MET via v0.8 Cluster 1
Stream B matrix-completion; #2 onboarding preserved + completed
via /prime-atlas Skill at Cluster 3; #3 external dogfood △
DEFERRED-BY-DESIGN — v1.0 launch trigger IS the cohort exposure
event).

### V0.8 cycle pre-planning bridge inheritance

V0.8 cycle pre-planning inherits substrate from v0.7 cycle close
via:

- `v0_8-HANDOFF.md` (commit `49ca82c`) §1-§4 framework
  substantively delivered cycle-completion narrative + substrate-
  inheritance framing + v0.8 cycle pre-planning surface + v0.7-
  SCOPE.md absorbed-item annotations
- `research/v0.8-candidates.md` (commit `345696d`) 21 v0.8+
  forward-pointer candidates substrate (4 categories + TERTIARY
  deferred + cross-cycle inheritance items); substantively
  consumed by v0.8 scope adjudication at LOCKs A-H + LOCKs 1-2;
  renamed to `research/v1.1-candidates.md` at v0.8 cycle close
  per LOCK 2

---

## §2 Substep ladder per cluster

### Cluster 1 — Stream B matrix-completion (benchmarks-repo parallel cadence)

**Cluster scope per v0.8-SCOPE.md §2 + LOCK C + LOCK D:**

Full 24-cell × n=5 × 2 conditions = 240 trials at single fixed
atlas-substrate. F9 tag-AND-control discipline applied via run
manifest substrate per LOCK D.1; F3 cell-selection empirical
pre-screen + F5 variance-control auto-stretch refinement absorbed
per LOCK D.3 selective absorption.

**Substeps:**

- [ ] **Step 1.0** — Design adjudications (Q1.0.X locks per
  matrix-completion methodology + F3 + F5 + F9 amendment
  substrate design + cell selection per F3 dry-run pre-screen).
  Substantive substrate-anchored design surface at benchmarks-
  repo `scripts/` cadence.
- [ ] **Step 1.1+** — Cell selection + dry-run pre-screen (F3).
  n=2 dry-run trials per candidate cell before n=5 commitment;
  ~100-150 LOC at benchmarks-repo `scripts/v0.8-cell-screen.mjs`.
- [ ] **Step 1.2+** — Run manifest substrate engineering (F9
  LOCK D.1). Per-trial manifest captures
  `contextatlas.version_label` + `atlas.substrate.version` +
  `atlas.substrate.commit_sha` + `atlas.target.commit_sha` +
  `extraction.substrate.fingerprint` + `methodology.cycle` +
  `methodology.amendments`; ~50-100 LOC at benchmarks-repo.
- [ ] **Step 1.3+** — Matrix execution (240 trials with F5
  variance-control auto-stretch refinement). Substrate-
  improvement at benchmarks-repo orchestration scripts.
- [ ] **Step 1.4+** — Paired-t cross-cell rollup analysis per
  ADR-19 §4 at N=240 substrate (>3x larger than v0.5 N=27 +
  v0.6 8-cell subset).
- [ ] **Step 1.5+** — Phase-11 reference doc generation
  (canonical full substrate at benchmarks-repo `research/`).
- [ ] **Step 1.X** — Cluster close (per-axis distinguishability
  framing per ADR-19 §4; V1.0 ship-gate criterion #1 statistical
  closure verification).

**Cluster wall-clock:** ~2-3 weeks benchmarks-repo parallel
cadence per LOCK H.

**Cluster cost envelope:** ~$200-400 per LOCK C (extrapolated
from v0.6 cost-priors).

**Closure criteria:** Stream B matrix-completion produces clean
within-cycle data per F9 discipline; matrix-completion outcome
per-axis distinguishability framing intact; #1 statistical
UPGRADED from △ PARTIAL to ✓ MET.

### Cluster 2 — TERTIARY A1+A2+A3 absorption (main-repo sequential)

**Cluster scope per v0.8-SCOPE.md §2 + LOCK F:**

A1 first (independent quick-win) → A2+A3 paired (shared
idempotency surface). ~3-5 cycle days bounded.

**Substeps:**

- [ ] **Step 2.0** — Design adjudications (Q2.0.X locks per
  TERTIARY scope detail + A1 classifier branch design + A2+A3
  idempotency model design).
- [ ] **Step 2.1** — A1 absorption: `classifyError` catch-all
  conflates JSON-parse vs API errors. Fix: dedicated `ParseError`
  class + classifier branch. ~30-50 LOC `src/extraction/` +
  ~5-10 new tests; ~0.5 cycle day.
- [ ] **Step 2.2+** — A2+A3 paired absorption:
  - A2: `extractDocstringsForFile` non-idempotent at symbol
    level. Fix: symbol-id-keyed idempotency at extraction time;
    ~40-80 LOC + ~10-15 tests; ~1 cycle day.
  - A3: `pipeline.ts` Stage 5 deletion handling defeats Stream
    C idempotency. Fix: claim-source-aware deletion sweep +
    file-deletion idempotency at pipeline Stage 5; ~50-100 LOC
    + ~10-15 tests; ~1 cycle day.
- [ ] **Step 2.X** — Cluster close (substrate-trust gates
  closed pre-v1.0 launch; npm test all-PASS baseline preserved
  per CLAUDE.md src-changes-require-full-test discipline).

**Cluster wall-clock:** ~3-5 cycle days bounded per LOCK H.

**Closure criteria:** All 3 substrate-gap fixes shipped with
test coverage; cohort-trust user-facing gates closed pre-v1.0
launch.

### Cluster 3 — /prime-atlas Skill substrate (main-repo sequential)

**Cluster scope per v0.8-SCOPE.md §2 + LOCKs B.1-B.5:**

Closes v1.0 launch-narrative cohort-onboarding-pipeline surface
end-to-end (atlas scaffolding via /index-atlas + ADR foundation
via /generate-adrs + per-session priming via /prime-atlas).
~3-5 cycle days bounded; ~200-300 LOC SKILL.md scale matching
/index-atlas + /generate-adrs precedent.

**Substeps:**

- [ ] **Step 3.0** — Design adjudications (Q3.0.X locks per
  SKILL.md structure + tool-call probe substrate design at
  sentinel-symbol-from-atlas pattern + tools-introduction prompt
  scope at ~80-150 LOC + per-session entry point manual-invoke
  pattern).
- [ ] **Step 3.1** — SKILL.md substrate generation at
  `.claude/skills/prime-atlas/SKILL.md` (~200-300 LOC). YAML
  frontmatter (`name: prime-atlas` + `description: ...` +
  `model: claude-opus-4-7` + `effort: xhigh`); "When to use this
  skill" + "What this skill does" + Tools-introduction prompt +
  Failure modes + Tool usage sections.
- [ ] **Step 3.2** — Tests + empirical validation at
  contextatlas-on-itself dogfood substrate. Tool-call probe
  pattern verification; .mcp.json checks-only verification;
  tools-introduction prompt rendering. Substantively absorbs
  `research/v0.8-candidates.md` item #5 partial (Skill cohort
  entry path empirical validation) per LOCK 2 rename inheritance.
- [ ] **Step 3.X** — Cluster close (Skill substrate shipped;
  cohort-onboarding-pipeline surface end-to-end complete; CLAUDE.md
  cohort UX section + README.md cohort entry paths section
  reference /prime-atlas at v0.8 cycle close cycle-doc updates).

**Cluster wall-clock:** ~3-5 cycle days bounded per LOCK H.

**Closure criteria:** /prime-atlas Skill substrate shipped;
tests cover tool-call probe + atlas.json checks + .mcp.json
verification; empirical validation at contextatlas-on-itself
dogfood substrate.

### Cluster 4 — Bounded mechanical absorption (main-repo sequential)

**Cluster scope per v0.8-SCOPE.md §2 + LOCK E:**

SDK upgrade first → FO-15 + FO-16 paired at validate-atlas
surface. ~3-5 cycle days bounded.

**Substeps:**

- [ ] **Step 4.0** — Design adjudications (Q4.0.X locks per
  SDK migration scope + FO-15 + FO-16 validate-atlas substrate
  design; FO-16 sub-adjudication validate-atlas-side mechanical
  enforcement per LOCK E α).
- [ ] **Step 4.1** — SDK upgrade ^0.27.0 → ^0.32.0. Mechanical
  edit: package.json line bump + npm install regression sweep +
  type-API migrations if needed (SDK 0.32+ types `thinking`
  parameter natively; clears inline cast workaround at
  `src/generation/generators/anthropic-api-direct.ts`).
  ~30 min-4 hours wall-clock per migration scope.
- [ ] **Step 4.2+** — FO-15 + FO-16 paired absorption at
  validate-atlas surface:
  - FO-15: `contextatlas_version` invariant — semver parse +
    installed-version-match validation; ~30-50 LOC `src/
    extraction/cli-validate-atlas.ts` + ~5-8 tests.
  - FO-16: timestamp format invariant — ISO 8601 parse +
    bounded-staleness check; ~20-40 LOC + ~3-5 tests.
- [ ] **Step 4.X** — Cluster close (SDK upgrade clean at
  ^0.32.0; FO-15 + FO-16 validate-atlas-side mechanical
  enforcement shipped; canonical schema invariants strengthened
  pre-v1.0 launch).

**Cluster wall-clock:** ~3-5 cycle days bounded per LOCK H.

**Closure criteria:** SDK upgrade clean (npm test all-PASS at
^0.32.0); FO-15 + FO-16 mechanical enforcement shipped with
test coverage.

### Cluster 5 — Cycle close (main-repo sequential cycle-close substep cluster)

**Cluster scope per v0.8-SCOPE.md §2 + LOCK G + LOCK 2 + LOCK 5
(cross-repo back-reference precedent inheritance):**

Cycle-close cycle-doc updates substeps + atomic ship-gate per
v0.7 6-substep precedent. Substantively absorbs ROADMAP.md
update + backlog file rename + v0_9-HANDOFF.md substrate +
cross-repo back-reference + ship gate + v0.8.0 annotated tag
landing.

**Substeps:**

- [ ] **Step 5.0** — Design adjudications (cycle-close substep
  ladder shape per v0.7 6-substep Option α precedent; per-
  substep ship criteria locked; Class-X trajectory disposition
  framing).
- [ ] **Step 5.1** — Pre-flight verification (atlas refresh
  sanity at contextatlas-on-itself; doctor; npm test final
  baseline; npm run build clean).
- [ ] **Step 5.2** — Cycle-doc updates substeps (combined per
  LOCK G + LOCK 2 cycle-close cycle-doc absorption shape;
  ~100-180 min combined):
  - ROADMAP.md absorption (revision history v0.5/v0.6/v0.7/v0.8
    + v0.8+ block refinement + v0.9 administrative cycle soft-
    reference + v1.1+ candidate substrate framing per LOCK 2)
  - `research/v0.8-candidates.md` → `research/v1.1-candidates.md`
    rename + inline annotations (absorbed-at-v0.8 items per
    cluster + carry-forward candidates with "deferred BECAUSE"
    framing per LOCK 1 discipline preservation)
  - `v0_9-HANDOFF.md` substrate generation per v0_7-HANDOFF.md
    + v0_8-HANDOFF.md precedent (§1-§4 framework; ~150-200 LOC
    bounded)
  - Cross-references updated at canonical surfaces
    (`v0_8-HANDOFF.md` §2 substrate-inheritance framing;
    CLAUDE.md "v0.8+ candidates" Current Version block →
    v1.1+; ROADMAP.md v1.1+ block reference)
  - CLAUDE.md Current Version block update (v0.7 → v0.8
    transition + v0.8 outcome + methodology limits inserted;
    v0.7 preserved as historical record per v0.6/v0.5 pattern)
  - README.md launch-narrative refresh (status block + /prime-
    atlas added to cohort entry paths section + v0.8 shipped
    block + v1.1+ candidates section + atlas schema annotation
    if applicable)
  - package.json version bump 0.7.0 → 0.8.0
- [ ] **Step 5.3** — Ship commit landing per HEREDOC discipline
  + §1-§7 substrate structure (matches v0.7 Step 5.3 precedent
  per LOCK 8 tag body launch-narrative substrate requirements
  inheritance).
- [ ] **Step 5.4** — V0.8.0 annotated tag landing per v0.5/v0.6/
  v0.7 tag landing precedent. Tag body §1-§4 substrate (cycle
  thesis evaluation + 4-of-4 tier MET + V1.0 ship-gate state +
  cycle integrity audit-trail substrate handoff per Step 7.5
  post-execution verification discipline).
- [ ] **Step 5.5** — Cross-repo back-reference at ContextAtlas-
  benchmarks per LOCK 5 v0.5/v0.6/v0.7 precedent (Phase-11 ref-
  doc §X revision history if Cluster 1 Phase-11 doc shipped;
  alternative canonical surface adjudication at Step 5.0 design
  surface). Cycle close commit absorbing substrate inventory.
- [ ] **Step 5.6** — Atomic final push per Adjudication 3
  atomic ship-gate discipline lock inheritance from v0.7
  (main-repo + tag + benchmarks-repo if cross-repo back-
  reference applicable).

**Cluster wall-clock:** ~3-4 cycle days bounded per LOCK H.

**Closure criteria:** Ship commit landed; v0.8.0 annotated tag
landed; cross-repo back-reference landed (if applicable per
Step 5.0 design surface); atomic final push completed; V1.0
ship-gate state post-v0.8 substantively at 3-of-3 MET + 1
deferred-by-design.

**Unblocks.** V0.9 administrative cycle (repo hygiene + doc
reorganization + npm deployment) preceding V1.0 public launch
trigger per LOCK 1 cycle-discipline constraint.

---

## §3 Progress log

*Entries added in reverse-chronological order as substeps ship.*

### Cluster 4 shipped — 2026-05-12 (Mechanical absorption — SDK upgrade ^0.27.0 → ^0.32.0 + FO-15 + FO-16 paired absorption; Q4.0.1.c benchmarks-repo follow-up; substantive cycle-pacing margin continues)

V0.8 Cluster 4 substantively closes per LOCK E ordering (SDK first → FO-15 + FO-16 paired) + 10 Q4.0.X substantive locks at Step 4.0 design adjudication surface. Substantive cycle-pacing margin continues — Cluster 4 wall-clock ~1-1.5 cycle days actual vs ~3-5 cycle days LOCK H envelope; 4 clusters now substantively bounded under LOCK H (Clusters 2 + 3 + 4 at main-repo; Cluster 1 pending Travis-side execution per Adjudication 6 carry-forward).

Batched Cluster 4.X close commit absorbing Steps 4.0 + 4.1 + 4.2 + Q4.0.1.c benchmarks-repo follow-up per LOCK 1 Option α-relaxed pattern (continues Cluster 3 precedent at `664e17f`).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 4.0 | main | (this commit; design adjudication surface) | 10 Q4.0.X locks: SDK version target (Q4.0.1.a Option α ^0.32.0) + breaking-changes inventory approach (Q4.0.1.b Option α pre-edit) + Q1.0.2.d adapter_versions scope confirmed (Q4.0.1.c split — language-adapter-only; sdk_version standalone manifest field) + type-cast removal scope (Q4.0.1.d Option α paired with SDK upgrade) + baseline preservation (Q4.0.1.e) + FO-15 semver+match (Q4.0.2.a Option β) + FO-16 refined dual-invariant (Q4.0.2.b: mtime-anchor ERROR + 6mo-staleness WARNING) + substep ordering (Q4.0.3 Option α 2 ship commits) + test discipline (Q4.0.4) + ship criteria (Q4.0.5) |
| 4.1 | main | `b3fb375` | SDK upgrade ship commit — package.json ^0.27.0 → ^0.32.0 (resolves to 0.32.1); 0.28→0.32 changelog inventory documented inline; NO breaking changes affecting `messages.create()` usage; npm test 1568/87 baseline preserved |
| 4.2 | main | `b54befb` | FO-15 + FO-16 paired absorption — `cli-validate-atlas.ts` +95 LOC + tests +180 LOC (11 new); npm test 1579/87 all PASS (within Q4.0.4 target 1578-1581) |
| Q4.0.1.c follow-up | benchmarks-repo | `5d86b99` | `readInstalledSdkVersion()` + `sdk_version` standalone manifest field at `scripts/v0.8-cell-screen.mjs`; EXCLUDED from Q1.0.2.d fingerprint hash per split lock; benchmarks-repo tests 16 → 17 |
| Cluster 4.X-progress | main | (this commit) | STEP-PLAN-V0_8.md §3 batched Cluster 4 progress log entry per LOCK 1 Option α-relaxed cadence |

#### Step 4.1 substantive scope — SDK upgrade ^0.27.0 → ^0.32.0

SDK version target per LOCK E framing (^0.32.0; resolves to 0.32.1 — latest patch in 0.32.x range; 2024-11-05). Breaking changes inventory per Q4.0.1.b Option α:
- **0.28.0**: parallel-tool-use disable + retry-count header — no usage impact
- **0.29.x**: message batches API + type refactors at metadata/tool — orthogonal to `messages.create()` usage
- **0.30.x**: computer-use beta + bedrock/vertex `beta.messages.create()` — no usage impact
- **0.31.0**: token counting + PDFs + `isolatedModules` + `use type imports` — already compliant via `import type`
- **0.32.x**: new haiku model + missing token-counting types — no breakers

**NO breaking changes** affecting `messages.create()` with `thinking` parameter usage at `src/generation/generators/anthropic-api-direct.ts`.

##### Empirical SDK type-layer finding (LOCK 1 Option γ disposition)

v0.7 Step 2.4.a β-1 inline comment claimed "SDK 0.27.3 does NOT type the `thinking` parameter (added in ~0.32+)". Step 4.1 empirical verification at this commit substantively FALSIFIES the "added in ~0.32+" assumption: `grep thinking node_modules/@anthropic-ai/sdk/**/*.d.ts` returns zero matches at 0.32.1. Extended thinking is beta-feature parameter; runtime API accepts it but TypeScript types don't expose it at 0.32.x.

Q4.0.1.d Option α disposition refined per empirical state: cast removal aborted at Step 4.1 commit; cast RETAINED at LOCK E ^0.32.0 version target. Inline comment substantively updated to reflect empirical state. Thinking-native-typing migration queued at `research/v0.8-candidates.md` (pre-rename until Cluster 5 / Step 5.2 per LOCK 2) as v1.0+ candidate per LOCK 1 Option γ disposition (Option β mid-cycle SDK bump to latest 0.95.x ruled out — non-launch-bearing benefit at launch-bearing cycle; wrong risk profile).

#### Step 4.2 substantive scope — FO-15 + FO-16 paired absorption

**FO-15 mechanical enforcement** (Q4.0.2.a Option β) at `cli-validate-atlas.ts`:
- `isSemver(value)` helper: regex `/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/` (X.Y.Z + optional prerelease)
- `readPackageVersion()` inline helper per `src/index.ts:55` pattern (inheritance precedent; no shared utility per CLAUDE.md dependency-minimization)
- Validate `generator.contextatlas_version` is parseable as semver AND matches installed package version
- Closes "agent invented version" surface per FO-15 origin observation (Step 2.3 Checkpoint 3 self-absorption at v0.7 cycle)

**FO-16 dual-invariant mechanical enforcement** (Q4.0.2.b refined):
- **Invariant 1 — File-mtime anchor (ERROR)**: `generated_at` MUST be ≤ atlas file mtime; logically impossible to violate legitimately; closes "agent populated representative timestamp" surface per FO-16 origin observation; disposition: validate-atlas FAILS exit 2
- **Invariant 2 — 6mo-staleness (WARNING)**: `generated_at` SHOULD be within 6 months of validate-atlas invocation time; informational signal for cohort users running against stale substrate; disposition: validate-atlas PASSES exit 0 with WARNING surfaced to stderr
- ISO 8601 parse check precedes both invariants; parse failure → ERROR

##### ValidateAtlasCliResult shape additive note (substrate-consistency record)

`ValidateAtlasCliResult` public-surface API expanded with `warnings: readonly string[]` field per Q4.0.2.b refined dual-invariant scope. **Additive change**: existing PASS=0/FAIL=2 exit semantics preserved; new field surfaces FO-16 Invariant 2 staleness disposition. Existing callers reading `exitCode` + `errors` continue working without modification. Test seams added at `ValidateAtlasCliOptions`: `installedPackageVersionOverride` (FO-15 version-match seam) + `nowOverride` (FO-16 staleness window seam).

#### Q4.0.1.c benchmarks-repo follow-up — sdk_version forensic substrate

Per Q4.0.1.c split lock at Step 4.0: SDK version captured as standalone manifest field at run manifest substrate; EXCLUDED from Q1.0.2.d fingerprint hash. Forensic-data discipline: future SDK bumps preserve atlas substrate fingerprint stability; manifest field queryable for cross-cycle regression correlation if needed.

Benchmarks-repo cross-repo reference: commit `5d86b99` — `readInstalledSdkVersion()` export at `scripts/v0.8-cell-screen.mjs` + JSDoc clarification on Q4.0.1.c split scope + `sdk_version` field captured once per matrix-cycle invocation + spread into each per-trial manifest at `runCellScreen`. Benchmarks-repo test baseline 16 → 17 (1 new `readInstalledSdkVersion` semver-shape test).

#### 11th Class-18 trajectory observation candidate

**dev-empirical-engineering-judgment-surfacing-locked-design-vs-empirical-SDK-substrate-mismatch-pre-implementation** captured at Step 4.1 surface. Same pattern as Cluster 2 Step 2.2.a A2+A3 empirical reproduction (10th candidate) but at **dependency-substrate surface** (SDK type layer) rather than **internal-code-substrate surface** (validate-atlas FO-15/FO-16 partial-absorbed state). Cross-substrate-surface reproducibility paired with 10th candidate.

Substantive insight: locked design adjudications based on inferred/historical assumptions about substrate state may not match empirical reality at later cycle execution surface. Discipline preservation: pre-implementation empirical verification before substantive engineering work is the cycle-integrity-preservation pattern. 10th + 11th candidates demonstrate this discipline at both internal-code + external-dependency substrates.

Class-18 trajectory disposition per Travis discretion at cycle close commit body authoring time per v0.7 Option C precedent inheritance.

#### Test baseline preservation

`npm test` (main-repo): 1579 / 87 all PASS (Step 3.X-progress baseline 1568 + 11 new FO-15/FO-16 tests = 1579 expected). Within Q4.0.4 target range 1578-1581. Clean baseline expansion per CLAUDE.md src-changes-require-full-test canonical discipline.

`npx vitest` (benchmarks-repo): 17 tests pass (16 baseline + 1 new `readInstalledSdkVersion` test).

#### Cycle-execution observations

- **Substantive cycle-pacing margin continues**: 4 clusters now substantively bounded under LOCK H envelopes (Cluster 2 + Cluster 3 + Cluster 4 main-repo at ~1-1.5 cycle days each vs ~3-5 cycle days LOCK H). Cumulative cycle-pacing margin substantively reproducible across substep cluster boundaries.
- **Locked-design-vs-empirical-substrate mismatch pattern empirically validated** at 2 surfaces (10th candidate internal-code substrate + 11th candidate dependency substrate). Substantively meaningful empirical pattern for v0.9+ cycle pre-planning discipline (empirical verification at cycle boundary before substantive candidate-item locking).
- **Q1.0.2.d substrate fingerprint scope confirmation** (language-adapter-only; sdk_version orthogonal per Q4.0.1.c split) preserves substrate stability across future SDK bumps. Forensic-data substrate at sdk_version manifest field substantively enables cross-cycle regression correlation without retroactive substrate invalidation cascade.

#### Next

Cluster 4 substantively closes. Cluster 5 cycle close (ROADMAP.md + backlog file rename + v0_9-HANDOFF.md + cross-repo back-reference + ship gate + v0.8.0 annotated tag landing) CANNOT trigger until Cluster 1 completes per launch-bearing scope (Stream B matrix-completion is V1.0 ship-gate criterion #1 statistical closure substrate per LOCK A Option γ + LOCK C). Cluster 1 substantively pause-state at Step 1.1 dev-side closure (commit `d799cd1` benchmarks-repo); awaiting Travis-side execution trigger per Adjudication 6 carry-forward (~2-3 days benchmarks-repo cadence; ~$50-100 cost envelope; aggregate manifest paste-back triggers dev-side Step 1.1 final closure → Steps 1.2 → 1.3 → 1.4 → 1.5 → 1.X close at benchmarks-repo cadence → Cluster 5 main-repo cycle close).

### Step 3.1 + Step 3.2 shipped — 2026-05-12 (/prime-atlas SKILL.md substrate + content unit tests; Cluster 3 substantive progression toward Step 3.X cluster close)

V0.8 Cluster 3 substeps 3.1 + 3.2 substantively ship per LOCK B.1-B.5 + Q3.0.X locks at Step 3.0 design adjudication surface. /prime-atlas Skill substantively completes the v1.0 launch cohort onboarding pipeline at 4-Skill substrate (init + /generate-adrs + /index-atlas + /prime-atlas per cohort entry surfaces).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 3.1 | main | `6553f17` | /prime-atlas SKILL.md substrate at canonical path; 215 LOC within ~200-300 LOC envelope per LOCK B.4 + LOCK H; YAML frontmatter pinning model + effort per v0.7 Step 2.3.c.0 inheritance; npm test 1537/86 baseline preserved |
| 3.2 | main | `78cbdcd` | SKILL.md content unit tests (Q3.0.7 Option γ dev-side component); 31 tests across 8 substantive areas; npm test 1568/87 all PASS (1537 + 31 = 1568 expected) |
| 3.X-progress | main | (this commit) | STEP-PLAN-V0_8.md §3 batched Step 3.1+3.2 progress log entry per pragmatic LOCK 1 Option α adaptation (Cluster 2 strict per-substep .b-progress pattern → Cluster 3 batched dual-substep .b-progress per cycle-pacing discipline at Travis's relaxed-cadence signal "trigger all three now") |

#### Cluster 3 substantive scope

**/prime-atlas Skill substrate** (Step 3.1; 215 LOC at `.claude/skills/prime-atlas/SKILL.md`):
- Frontmatter: name=prime-atlas + 5-sentence substantive description + model=claude-opus-4-7 + effort=xhigh per v0.7 Step 2.3.c.0 frontmatter pinning inheritance
- §-section framework per Q3.0.1.b: When to use this skill + What this skill does (6 numbered procedural steps) + Failure modes (7-row outcome matrix) + Tools introduction (3 MCP tools enumeration + when-to-use patterns + cohort UX awareness + edge cases) + Tool usage + Cross-references
- Tool-call probe MCP introspection per Q3.0.2 substrate (load atlas.json → validate substrate → pick sentinel symbol per Q3.0.2.a Option α first-entry → probe get_symbol_context → interpret outcome per 7-row matrix)
- Checks-only .mcp.json verification per Q3.0.3 Option α (presence-only; init substrate inherits without modification)
- Substantive when-to-use guidance per Q3.0.4 Option β (Skill self-contained ~80-150 LOC; README absorbs broader narrative at Cluster 5 / Step 5.2 per LOCK G)
- 2nd person imperative voice per Q3.0.6 Option α v0.7 SKILL.md precedent inheritance
- Manual invoke per-session entry per Q3.0.5 Option α + cohort UX documentation at Q3.0.5.a Option γ composite (README + CLAUDE.md absorbed at Cluster 5 / Step 5.2)

**SKILL.md content unit tests** (Step 3.2; 253 LOC at `src/init/prime-atlas-skill-content.test.ts`):
- 31 tests across 8 substantive areas (frontmatter + §-section framework + tool-call probe procedural steps + failure modes matrix + tools introduction + voice register + cross-references + tool usage discipline)
- Q3.0.7 Option γ composite component (dev-side); manual empirical validation at contextatlas-on-itself dogfood is TRAVIS-SIDE forward-pointer at Cluster 3 close

#### Test baseline preservation

`npm test`: 1568 tests / 87 files / all PASS (v0.7+A1+A3 baseline 1537 + 31 new SKILL content tests = 1568 expected). Clean baseline preservation per CLAUDE.md src-changes-require-full-test canonical discipline.

#### Cohort impact framing (substantively absorbed at Cluster 5 / Step 5.2)

Cohort users at v1.0 launch get per-session entry point Skill that:
- Verifies MCP connection via empirical tool-call probe (no Claude Code API surface dependency per CC2/CC3 framing)
- Primes session with substantive when-to-use guidance for 3 ContextAtlas MCP tools (architectural prompts → ContextAtlas tools FIRST; primitive Grep patterns → existing tool sufficient)
- Surfaces atlas-version awareness + SHA-diff refresh discipline + compact format trade-offs

Cluster 5 / Step 5.2 README.md cohort entry paths section + CLAUDE.md Current Version block absorb /prime-atlas reference per Q3.0.5.a Option γ composite documentation discipline at cycle-doc updates substep.

#### Manual empirical validation forward-pointer (TRAVIS-SIDE)

Q3.0.7 Option γ composite second component (manual empirical validation at contextatlas-on-itself dogfood) is TRAVIS-SIDE execution per session-context boundary discipline. Travis-side scope: open new Claude Code session in contextatlas repo + invoke `/prime-atlas` + observe outcome + paste-back outcome for Step 3.X cluster close substrate. Partial absorption of research/v0.8-candidates.md item #5 (Skill cohort entry path empirical validation) substantively realized via this composite at Cluster 3 cluster close.

#### Cycle-execution observations

- **Class-18 5th observation candidate** (dev-empirical-engineering-judgment-surfacing-additional-design-adjudication-candidates pattern) substantively reproduced at Step 3.0 design adjudication surface (Q3.0.6 + Q3.0.7 + Q3.0.8 surfaced beyond advisor enumeration; matches Step 1.0 + Step 2.0 surfaces). Cross-substep-cluster reproducibility at 3 substep clusters now empirically validated.
- **LOC envelope discipline**: SKILL.md 215 LOC within ~200-300 envelope per LOCK B.4 + LOCK H (substantively bounded; substantively under upper bound; substantively distinct from prior LOC overrun pattern at scope-doc + ship-prep edits).
- **Travis relaxed-cadence signal** at "trigger all three now" + "Push when ready" at Cluster 3 trigger surface → dev pragmatic adaptation: batched Step 3.1+3.2 progress log per single .X-progress commit vs strict LOCK 1 Option α per-substep .b-progress pattern. Substantively preserves cycle-narrative documentation discipline at substantively reduced commit count.

#### Travis-side manual empirical validation outcome (2026-05-12; Q3.0.7 Option γ composite second component)

Travis ran `/prime-atlas` in a fresh Claude Code session at C:\CodeWork\contextatlas. Outcome:
- ✓ Read tool loaded `.contextatlas/atlas.json` (v1.4 at SHA `fe3ae7e`; 27 source SHAs tracked) + `.mcp.json` (contextatlas server entry present)
- ✓ Picked sentinel symbol: `sym:ts:scripts/gopls-probe.ts:COBRA_ROOT` (first entry in atlas symbols[]; deterministic per Q3.0.2.a Option α)
- ✓ Probed `get_symbol_context` via MCP — returned bundle (git + diagnostics signals)
- ✓ Reported "MCP connected; atlas substrate aligned. Session ready."
- ✓ Surfaced tools-introduction prompt per Q3.0.4 substantive substrate (3 MCP tools enumeration + when-to-use patterns + cohort UX awareness + ADR-02 query-time-no-API-calls invariant)
- ✓ 2nd person voice register preserved at SKILL opening per Q3.0.6 Option α v0.7 SKILL.md precedent inheritance

Substantively the canonical Skill behavior matches locked design — empirically validates Q3.0.7 Option γ composite (dev-side unit tests + Travis-side manual empirical validation BOTH components substantively complete). Partial absorption of `research/v0.8-candidates.md` item #5 (Skill cohort entry path empirical validation at contextatlas-on-itself dogfood substrate) substantively realized.

#### Step 3.X Cluster 3 close

Cluster 3 substantively closes. Substantive criteria satisfied:
- Step 3.1 /prime-atlas SKILL.md substrate shipped (215 LOC at `.claude/skills/prime-atlas/SKILL.md`) ✓
- Step 3.2 SKILL.md content unit tests shipped (31 tests at `src/init/prime-atlas-skill-content.test.ts`) ✓
- Q3.0.7 Option γ composite both components empirically validated (dev-side unit tests + Travis-side manual empirical validation) ✓
- Test baseline preserved (1568 / 87 all PASS at canonical baseline) ✓
- /prime-atlas Skill cohort discoverability surface ready for v1.0 launch ✓

Cohort impact framing: cohort users at v1.0 launch get per-session entry point Skill that empirically primes Claude Code session with ContextAtlas tools substrate. README.md cohort entry paths section + CLAUDE.md Current Version block absorb /prime-atlas reference per Q3.0.5.a Option γ composite documentation discipline at Cluster 5 / Step 5.2 cycle-doc updates substep.

Cluster 3 wall-clock substantively bounded: ~1-1.5 cycle days actual (Step 3.0 design ~30 min + Step 3.1 SKILL.md substrate ~1 hour + Step 3.2 unit tests ~30 min + Travis-side empirical validation ~5 min) vs ~3-5 cycle days LOCK H envelope. Substantive cycle-pacing margin substantively similar to Cluster 2 empirical-validation-driven scope-narrowing pattern.

#### Next

Cluster 4 mechanical absorption (SDK upgrade ^0.27.0 → ^0.32.0 + FO-15 + FO-16) triggers next per Option γ main-repo sequential continuation. Parallel Step 1.1 dev-side benchmarks-repo engineering remains pending (per Adjudication 6 carry-forward; Travis discretion at relaxed-cadence signal preserved).

### Step 2.2 shipped — 2026-05-12 (A2 + A3 paired absorption — A2 absorbed-at-earlier-cycle + A3 Stage 5 symbol cleanup; Cluster 2 partial scope per empirical-validation-driven scope-narrowing)

V0.8 Cluster 2 Step 2.2 substantively closes per Cluster 2 partial scope confirmation. Substantive cycle-pacing margin realized: original LOCK F envelope ~3-5 cycle days (A1+A2+A3 paired) compressed to refined ~1-1.5 cycle days (A1 Step 2.1 + A3 Step 2.2.b) per empirical-validation-driven scope-narrowing discipline at Step 2.2.a investigation surface.

| Substep | branch | commit | Notes |
|---|---|---|---|
| 2.2.a | main | (no commit; investigation surface only) | A2 + A3 empirical reproduction per Option γ discipline; 4 tests at `src/storage/v0_8-a2-a3-investigation.test.ts` documenting v0.7+ baseline state — A2 NOT vulnerable + A3 SUBSTANTIVELY VULNERABLE (3-angle demonstration) |
| 2.2.b | main | `31421ed` | A3 absorption ship commit — Stage 5 symbol cleanup via deleteSymbolsByPath; 252 insertions / 1 deletion; npm test 1537 / 86 all PASS |
| 2.2.b-progress | main | (this commit) | STEP-PLAN-V0_8.md §3 Step 2.2 progress log entry per LOCK 1 Option α separate progress-log commit discipline |

#### A2 disposition — ABSORBED AT EARLIER CYCLE

Per Step 2.2.a empirical reproduction outcome: A2 stale-CLAIMS framing per research/v0.5-candidates.md #2 substantively NOT VULNERABLE at v0.7+ baseline. Absorbed via `deleteClaimsBySourcePath` at `extractDocstringsForFile` line 818 (v0.3 Stream B substrate per JSDoc). File-level claim wipe substantively wipes renamed-symbol stale claims at re-extraction surface.

Carry-forward: mark A2 as ABSORBED AT EARLIER CYCLE in `research/v1.1-candidates.md` inline annotation at Cluster 5 / Step 5.2 backlog file rename per LOCK 2.

#### A3 substantive scope (Step 2.2.b ship)

- **Primary fix at `src/extraction/pipeline.ts` Stage 5** (~15 LOC): added `deleteSymbolsByPath(db, deletedPath)` alongside existing `deleteClaimsBySourcePath(db, deletedPath)` + source_shas delete. Substantive JSDoc explains A3 absorption + LOCK 2.a Stage 5 placement + LOCK 2.b retain discipline.
- **Cascade behavior**: `deleteSymbolsByPath` (storage/symbols.ts:151-154) manual cascade wipes `claim_symbols` rows referencing deleted symbols; commit claims at source_path "commit:<sha>" SURVIVE Stage 5 (LOCK 2.b retain discipline) with `symbolIds = []` post-cascade (orphan-claim-shell; historical-narrative substrate preserved).
- **Regression tests** at `src/storage/v0_8-a2-a3-investigation.test.ts` (converted from Step 2.2.a investigation per LOCK 3 Option γ): 4 tests covering A2 preservation regression + A3 post-fix-state at Stage 5 + selective cascade (multi-symbol claim with some symbols persisting) + idempotency (repeated deletion no-op).

#### Locked-design vs empirical-bug-shape observation

Q2.0.2.a Option α `(file_path, symbol_id)` composite key locked at v0.8 cycle pre-planning substantively **DOES NOT FIT** actually-vulnerable A3 scenario (A3 bug surface is at symbol-cleanup-at-Stage-5 layer, not claims-composite-key layer). Q2.0.2.b "claim-source-aware deletion sweep" closer fit but canonical fix lives at SYMBOL deletion + cascade layer (`deleteSymbolsByPath` already cascades correctly; just needed invocation at Stage 5). Locked design adjudication based on historical-substrate-framing did not match empirical-substrate-state at v0.7+ baseline. 10th Class-18 trajectory observation candidate per dev-empirical-engineering-judgment-surfacing-locked-design-vs-empirical-bug-shape-mismatch-pattern per advisor surfacing.

#### Cohort impact framing (substantively absorbed at Cluster 5 / Step 5.2 per Q2.0.7 lock)

Cohort users at v1.0 launch with deleted source files get clean atlas state — no orphan symbols persisting at deleted file paths; no orphan `claim_symbols` rows referencing them. Commit-message-extracted claims persist as historical-narrative substrate with empty `symbolIds` post-symbol-cleanup (LOCK 2.b retain discipline; commit-narrative substrate preserved beyond symbol lifecycle).

#### Test baseline preservation

`npm test`: 1537 tests / 86 files / all PASS (v0.7+A1 baseline 1533 + 4 new A3 regression tests = 1537 expected). Clean baseline preservation per CLAUDE.md src-changes-require-full-test canonical discipline.

#### Cycle-execution observations

- **Empirical-validation-driven scope-narrowing pattern** substantively demonstrated at Step 2.2 surface — Travis Option γ disposition path triggered substantive cycle-pacing margin (Cluster 2 wall-clock compression from ~3-5 cycle days to ~1-1.5 cycle days). Substantively meaningful cycle-discipline observation.
- **Locked-design vs empirical-bug-shape mismatch** at Q2.0.2.a Option α composite key vs A3 actual bug shape (Stage 5 symbol cleanup). 10th Class-18 trajectory observation candidate per substrate-currency-discipline gap forward-pointer at substantive implementation surface.

#### Next

Cluster 2 substantively closes post-Step-2.2.b-progress commit. Cluster 3 /prime-atlas Skill substrate triggers next per Option γ ordering + main-repo sequential continuation. Parallel Step 1.1 dev-side engineering at benchmarks-repo (pre-flight + `scripts/v0.8-cell-screen.mjs` + unit tests) remains pending Travis trigger per prior Adjudication 6 disposition.

### Step 2.1 shipped — 2026-05-12 (A1 absorption — ParseError + classifier branch; carries-since-v0.4 user-trust pre-launch gate per LOCK 1 launch-readiness discipline)

V0.8 Cluster 2 TERTIARY A1 absorption shipped per LOCK F substep ordering (A1 first → A2+A3 paired) + Q2.0.3.a Option α per-substep atomic ship discipline. Substantively the canonical A1 fix per research/v0.5-candidates.md #1 framing (v0.4 Step 5 httpx 24-error investigation root cause masked via classifyError catch-all conflating parse-vs-API failures; cohort users at v1.0 launch get substantively distinguishable error messages enabling self-diagnosis).

| Substep | branch | commit | Notes |
|---|---|---|---|
| 2.1 | main | `7ef1c45` | A1 absorption ship commit — ParseError class + classifier branch + parseAndValidate throw refactor + 6 new tests; 142 insertions / 18 deletions; npm test 1533 / 85 all PASS |
| 2.1.b | main | (this commit) | STEP-PLAN-V0_8.md §3 Step 2.1 progress log entry per LOCK 1 Option α separate progress-log commit discipline |

#### A1 substantive scope

- **ParseError class** at `src/extraction/anthropic-client.ts` (co-located alongside classifyError per Q2.0.1.a Option α); 3 canonical reasons: `json-parse` + `shape-invalid` + `claims-not-array`
- **Classifier branch** at `classifyError`: ParseError → "fail" (deterministic; no retry) as first check; existing SDK error classification (RateLimitError + InternalServerError + APIConnectionError → retry; AuthenticationError + others → fail) preserved
- **parseAndValidate refactor**: throws ParseError instead of returning null on JSON.parse / shape / claims-not-array failures; existing per-claim malformed-entry drop semantics preserved (partial salvage at claim level)
- **Type tightening**: `parseAndValidate` return type `ExtractionResult | null` → `ExtractionResult` (parse failures throw; non-parse-failure paths still return null at extract() boundary for max_tokens / no-text-content)

#### Zero-blast-radius validation

All 3 `anthropicClient.extract()` callers (`pipeline.ts:362+` ADR extraction + `pipeline.ts:842+` docstring extraction + `commit-message-extractor.ts:366+`) already wrap in try/catch with errors-array accumulation — ParseError naturally surfaces in errors arrays without caller-side changes.

#### Cohort impact framing (substantively absorbed at Cluster 5 / Step 5.2 per Q2.0.7 lock)

Cohort users at v1.0 launch encountering extraction failures get substantively distinguishable error messages enabling self-diagnosis (parse failure → "Model returned malformed JSON; same input expected to produce same parse failure deterministically" with reason taxonomy; API failure → existing retry-with-backoff log preserved). Substantively documentation-scope at Cluster 5 / Step 5.2 README.md launch-narrative refresh (not Cluster 2 engineering scope per Q2.0.7 lock).

#### Test baseline preservation

`npm test`: 1533 tests / 85 files / all PASS (v0.7 baseline 1527 + 6 new A1 tests = 1533 expected). Clean baseline preservation per CLAUDE.md src-changes-require-full-test canonical discipline.

#### Cycle-execution observations

- **LOC envelope slightly over** (~30-50 LOC envelope per LOCK F; actual +47 LOC net at `anthropic-client.ts`) substantively defensible per substrate-fidelity-preservation-vs-LOC-budget discipline (substantive ParseError class JSDoc + reason taxonomy). Class-18 2nd observation candidate empirically reproducible at engineering-substrate-surface (substantively distinct from documentation-substrate-surface pattern at v0.7 Step 5.2 + v0.8 scope-doc LOC overruns).
- **STEP-PLAN-V0_8.md progress log entry gap surfacing at Step 2.1 close** (this Step 2.1.b commit substantively absorbs per LOCK 1 Option α separate progress-log commit discipline). Class-18 7th observation candidate per dev-empirical-engineering-judgment-surfacing-procedural-discipline-gap-at-substep-close pattern; substantively meaningful empirical pattern recognition by dev at substep close surface (substantively reproducible procedural-discipline-gap-recognition pattern).

#### Next

Step 2.2 A2+A3 paired absorption substep triggers per LOCK F Option α sequential cadence + Q2.0.3.a Option α per-substep atomic ship discipline (main-repo continuation). Parallel Step 1.1 dev-side engineering at benchmarks-repo continues per Option γ ordering (pre-flight + `scripts/v0.8-cell-screen.mjs` + unit tests).

---

*v0.8 cycle execution started at Cluster 1 / Step 1.0 (benchmarks-
repo parallel cadence) + Cluster 2 / Step 2.0 (main-repo
sequential start) per Option γ ordering. Progress log entries
populate as substeps ship.*

---

## §4 9-step canonical ship-gate inheritance reference

V0.8 cycle close Cluster 5 inherits 9-step canonical ship-gate
sequence per v0.5+ canonical inheritance pattern + v0.7 Class-15
instance 17 atomic ship-gate discipline-leveraging precedent
(cosmetic remediation pre-push window affordance):

1. **Pre-flight verification** (npm test main + benchmarks-repo
   green + atlas refresh sanity at contextatlas-on-itself +
   doctor + npm run build clean)
2. **Apply working content** (cycle-doc updates per LOCK G +
   LOCK 2 + ship discipline)
3. **Stage explicit-paths** (CLAUDE.md + README.md +
   package.json + research/v1.1-candidates.md + v0_9-HANDOFF.md
   + ROADMAP.md + atlas.json + STEP-PLAN-V0_8.md)
4. **Create ship commit via HEREDOC** (§1-§7 substrate structure
   per v0.7 Step 5.3 ship commit precedent)
5. **Verify commit landed** (git log -1 + commit body integrity
   spot-check)
6. **Create annotated tag `v0.8.0`** via HEREDOC per v0.5/v0.6/
   v0.7 SHA-free precedent (tag body §1-§4 substrate per LOCK 8
   tag body launch-narrative substrate requirements inheritance)
7. **Verify tag created** (git tag -l -n + git show v0.8.0)
8. **Step 7.5 post-execution verification** (canonical Step 7.5
   inheritance): inspect committed body + tagged body for
   HEREDOC escape artifacts; encoding issues; formatting drift;
   cross-document SHA reference accuracy. **STOP if artifacts
   caught**; apply Path X amend + tag re-create per pre-push
   window affordance per v0.7 Class-15 instance 17 cosmetic
   remediation precedent (`~$0.23` escape pattern detection +
   delete + recreate tag pre-push).
9. **Capture ship-commit SHA + atomic final push** (main +
   v0.8.0 tag + benchmarks-repo cross-repo back-reference per
   Adjudication 3 atomic ship-gate discipline lock).

**Substantive cycle-discipline observation:** Step 7.5 post-
execution verification substantively bounded the v0.7 cosmetic
`~$0.23` HEREDOC escape artifact at Step 5.4 surface; atomic
ship-gate discipline-leveraging (delete pre-fix tag + recreate
against ship commit pre-push) preserved canonical launch artifact
substrate quality. v0.8 cycle inherits identical discipline
pattern at Cluster 5 Step 5.4 surface.

---

## §5 Class-X trajectory disposition forward-pointer

**V0.7 cycle close trajectory state (per Step 5.5 commit
`49ca82c` Option C disposition lock):** 17 Class-15 cycle-
execution observations preserved at capstone composition. 15
instances substantively held capstone through Step 3.2 close +
2 cycle-close-emergent instances (16 + 17) captured at v0.7
ship-gate substep cluster maturity per Option C honest empirical
pattern recognition.

**V0.8 cycle Class-X trajectory disposition forward-pointer.**
V0.8 cycle may surface additional cycle-execution observations
per substep cluster maturity. Substantive observation candidate
enumeration surfacing at v0.8 cycle pre-planning surface (worth
quiet conscious framing for Travis discretion at substep cluster
close surfaces + cycle close commit body authoring time):

- **Travis-product-judgment-surfacing-cycle-integrity-
  discipline-constraint pattern.** Travis surfaced LOCK 1 v0.9
  administrative cycle "under wraps" framing WITH discipline
  constraints (NOTHING from v0.8 pushes to v0.9; load-bearing-
  to-launch items MUST complete in v0.8) at v0.8 scope-doc
  adjudication surface. Substantively distinct from v0.7 cycle
  Class-16 (dev-empirical-correction-of-advisor-attribution-
  framing-at-destructive-action-boundary) + Class-17 (dev-
  empirical-cosmetic-blemish-detection-at-canonical-launch-
  artifact-surface). Substantive v0.8 cycle observation
  candidate per honest empirical pattern recognition.

- **Dev-empirical-engineering-judgment-surfacing-substantive-
  content-density-vs-estimates pattern.** LOC overrun at
  canonical substrate generation surfaces (v0.8-SCOPE.md +197
  net LOC; v0.7 Step 5.2 CLAUDE.md +56 net + README.md +104 net
  precedent). Substrate-fidelity preservation substantively
  justifies dense framing vs Travis architectural-shape estimate
  bounds. Cross-cycle empirical validation of substantive
  content density pattern.

- **Dev-empirical-engineering-judgment-surfacing-cleaner-option-
  than-advisor/Travis-initial-lean pattern.** LOCK B.1 /prime-
  atlas Skill naming adjudication at v0.8 cycle pre-planning
  surface — Travis substantive lean /start walked back at dev's
  engineering judgment surface (substance-over-timing semantics
  + namespace conflict avoidance + matches /index-atlas +
  /generate-adrs action-verb + atlas-or-substrate-object
  pattern). Substantive v0.8 cycle observation candidate per
  Travis substantive surfacing at v0.7 cycle close inheritance.

**Class-18 trajectory disposition framing.** Per Travis
discretion at substep cluster close surfaces + cycle close
commit body authoring time. Substantively bounded per honest
empirical pattern recognition discipline; either capstone-
preservation (hold at 17 v0.7 cycle close composition) OR
honest-empirical-pattern-capture (expand at v0.8 cycle close
per cycle-narrative substantive weight) defensible per Travis
adjudication.

Advisor lean preserves the v0.7 Option C precedent of capturing
substantively distinct empirical patterns when they surface at
substep cluster maturity, rather than artificial capstone
preservation. But final disposition per Travis discretion at
cycle close.

---

## §6 Honest scope-locking disclaimer

**V0.8 cycle-execution discipline inheritance from v0.5/v0.6/
v0.7 cycle pre-planning pattern:**

- **F2-sequencing-style per-cycle thesis discipline preserved**
  — v0.8 cycle adjudicates its own scope thesis per established
  cycle pre-planning pattern; v0.8-SCOPE.md + STEP-PLAN-V0_8.md
  are cycle-doc substrate for THIS cycle, NOT a prescription for
  v0.9+ administrative cycle OR v1.0+ launch trigger.
- **Travis Lock 2 no-wall-clock-ceiling discipline preserved**
  throughout cycle. Wall-clock estimates at v0.8-SCOPE.md §6 +
  STEP-PLAN-V0_8.md per-cluster wall-clock are cycle-pacing
  planning only; substantive cycle-pacing discipline preserved
  per substantive cycle-pacing surface observations at substep
  cluster boundaries.
- **Cycle-execution-time discipline observations carried forward
  from v0.7 cycle close** (17 Class-15 capstone composition; 15
  + 2 cycle-close-emergent instances 16 + 17). v0.8 cycle may
  surface additional Class-X observations per substep cluster
  maturity; Class-18 trajectory disposition per Travis
  discretion at substep cluster close surfaces + cycle close
  commit body authoring time.
- **F9 tag-AND-control discipline absorbed at v0.8** per LOCKs
  D.1 + D.2; canonical methodology requirement at RUBRIC.md
  amendment surface at cycle close cycle-doc updates substep;
  future cycles inherit.
- **Atomic ship-gate discipline preserved** per Adjudication 3
  inheritance from v0.7 (local-only state allows clean fix pre-
  push window affordance; Class-15 instance 17 v0.7 cycle
  cosmetic remediation precedent inherited at Step 5.4 tag
  landing surface).
- **Honest scope-narrative discipline preserved** across all
  cycle-doc framings; deferred-to-v1.0+ items honestly framed
  with "deferred BECAUSE non-load-bearing-to-launch" discipline
  framing per LOCK 1; "3-of-3 MET + 1 deferred-by-design"
  narrative shift honestly positioned vs current post-v0.7
  "2-of-3 MET + 2 carried-forward" framing.

**LOCK 1 v0.9 administrative cycle "under wraps" discipline
preserved at every substep cluster + cycle-close surface:**

- NOTHING from v0.8 pushes to v0.9
- V0.9 substantively bears administrative-completion weight only
  (repo hygiene + doc reorganization + npm deployment)
- Load-bearing-to-launch items in v0.8 cycle scope (all 4 cluster
  scopes + cycle close cycle-doc updates) substantively MUST
  complete in v0.8 — non-negotiable per launch-readiness
  discipline
- Non-load-bearing-to-launch items defer BECAUSE non-load-bearing
  to `research/v1.1-candidates.md` substrate per LOCK 2 backlog
  file rename framing — NOT "pushed from v0.8 to v1.1"
- Discipline rationale: keeping v0.9 framing private at v0.8
  cycle thinking prevents substrate-erosion risk where v0.8
  cycle work substantively softens because "v0.9 will catch it"

**LOCK 2 backlog file rename discipline preserved at cycle close
substep cluster:**

- `research/v0.8-candidates.md` → `research/v1.1-candidates.md`
  rename at Cluster 5 / Step 5.2 cycle-doc updates substep
- Inline absorbed-at-v0.8 annotations per per-candidate
  substantive detail preservation (Cluster 1 Stream B matrix-
  completion + F3 + F5 + F9 amendments / Cluster 2 TERTIARY
  A1+A2+A3 / Cluster 3 /prime-atlas Skill partial / Cluster 4
  FO-15 + FO-16 + SDK upgrade)
- Carry-forward candidates preserved at v1.1+ substrate with
  framing refinement per LOCK 1 discipline constraint
- Cross-references updated at canonical surfaces (CLAUDE.md +
  v0_8-HANDOFF.md + ROADMAP.md v1.1+ block + v0_9-HANDOFF.md)

**V1.0 launch positioning post-v0.8 cycle close:**

V0.8 cycle close substantively positions v0.9 administrative
cycle as next cycle, with v1.0 public launch trigger following
v0.9 cycle close. v0.9 cycle scope content NOT in v0.8 cycle
adjudication surface; locked at v0.9 cycle pre-planning per
established cycle pre-planning pattern. V1.0 launch trigger
executes against substrate inherited from v0.8 + v0.9 (3-of-3
MET V1.0 ship-gate criteria substrate + full cohort-onboarding-
pipeline + N=240 Stream B matrix-completion + F3 + F5 + F9
methodology amendments + recruitment infrastructure + user-trust
gates closed + substrate hygiene + ROADMAP substrate-currency +
v0.9 admin cycle completion).

V1.0 launch is the cohort exposure event; ContextAtlas v1.0
ships into actual cohort usage rather than into more pre-launch
validation cycles per LOCK 1 cycle-discipline constraint
preservation.

---

## Revision history

- **2026-05-12 (cycle pre-planning draft)** — initial STEP-PLAN-
  V0_8.md draft per v0.8-SCOPE.md commit `3f8fc89` + v0.8 cycle
  pre-planning design adjudication LOCKs A-H + LOCKs 1-2 +
  Adjudication 1-2 substep cluster framework lock. Substrate-
  inheritance bridge from v0.7 STEP-PLAN-V0.7.md + v0_8-HANDOFF.md
  (commit `49ca82c`) to v0.8 cycle execution. 4 substep clusters
  + cycle close substep cluster per Option γ ordering (main-repo
  sequential clusters 2-4 + cycle-close + benchmarks-repo
  parallel Stream B cadence). Progress log skeleton ready for
  substep ship entry population per established discipline.
