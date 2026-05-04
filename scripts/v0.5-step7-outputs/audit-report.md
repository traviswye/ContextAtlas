# v0.5 Step 7.3 Audit Report

**Run UUID:** `e46dfd64-cd19-41e5-b6bc-34d1bc65b0b0`
**Atlas:** ContextAtlas v0.4.0
**Audit date:** 2026-05-04T00:25:54.259Z
**Status:** ✓ AUDIT PASS

## Trial inventory

Expected trials: 56 (5 cells × 2 conditions × n=5 base + hono auto-stretch +6)
Trials present: 56/56

## Schema validation

Per-trial schema failures: 0

All trials passed schema validation:
- All required fields present (prompt_id, condition, target_symbol, bucket, metrics, answer, cost_usd, written_at)
- All Step 7 augmented fields present (step7_trial_index, step7_stretch_trial, step7_run_uuid, step7_atlas_version, step7_wall_clock_ms, step7_completed_at)
- All conditions match expected per file path
- All prompt_ids match expected per cell
- All trial_index values match expected per file
- All run_uuid values match manifest
- All atlas_version values match manifest
- All answer fields non-empty
- All cost_usd values non-negative numbers

## Cross-trial consistency

| Check | Computed | Manifest | Δ | Status |
|---|---:|---:|---:|---|
| Per-trial cost sum vs manifest total_cost_usd | $20.5310 | $20.5310 | 0.000000 | ✓ MATCH |
| Trials present vs manifest trials_completed | 56 | 56 | 0 | ✓ MATCH |

## Substrate ready for Step 8 grading?

Yes. All 56 trials verified present + schema-valid + cross-trial-consistent. Step 8 grading can proceed against this substrate.
