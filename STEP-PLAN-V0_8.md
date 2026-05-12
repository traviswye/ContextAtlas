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
