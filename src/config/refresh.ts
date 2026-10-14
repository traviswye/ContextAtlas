/**
 * The optional `refresh:` config section (v1.2 Phase 6; ADR-05
 * 2026-10-14 amendment): cost controls for Tier 1 incremental claim
 * refresh (`contextatlas refresh-claims`, which runs the `/refresh-atlas`
 * skill through headless `claude -p` on the subscription).
 *
 *   refresh:
 *     auto_claims: true          # false: pre-push and --if-due never run Tier 1
 *     max_sources_per_run: 25    # pending sources one run extracts; the rest stay queued
 *     max_turns: 80              # claude -p --max-turns
 *     min_interval_minutes: 60   # --if-due: at most one automatic run per interval
 *     max_utilization: 0.8       # --if-due: skip while the last recorded usage is above this
 *
 * Tier 0 (`index --structural`, the git hooks) is unaffected by every
 * key here. A manual `contextatlas refresh-claims` ignores `auto_claims`,
 * `min_interval_minutes` and `max_utilization`, but honours the caps.
 */

export interface RefreshConfig {
  autoClaims: boolean;
  maxSourcesPerRun: number;
  maxTurns: number;
  minIntervalMinutes: number;
  maxUtilization: number;
}

export const DEFAULT_REFRESH: RefreshConfig = {
  autoClaims: true,
  maxSourcesPerRun: 25,
  maxTurns: 80,
  minIntervalMinutes: 60,
  maxUtilization: 0.8,
};

export const REFRESH_KEYS = [
  "auto_claims",
  "max_sources_per_run",
  "max_turns",
  "min_interval_minutes",
  "max_utilization",
] as const;

/** Parse `refresh:`; undefined when absent. Throws an actionable error on bad values. */
export function validateRefresh(raw: unknown, configPath: string): Partial<RefreshConfig> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid 'refresh' section: expected an object. Source: ${configPath}`);
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!(REFRESH_KEYS as readonly string[]).includes(key)) {
      throw new Error(
        `Unknown key 'refresh.${key}'. Valid keys: ${REFRESH_KEYS.join(", ")}. Source: ${configPath}`,
      );
    }
  }
  const out: Partial<RefreshConfig> = {};
  if (obj.auto_claims !== undefined) {
    if (typeof obj.auto_claims !== "boolean") {
      throw new Error(
        `Invalid 'refresh.auto_claims': expected true or false. Source: ${configPath}`,
      );
    }
    out.autoClaims = obj.auto_claims;
  }
  const int = (key: string, min: number, max: number): number | undefined => {
    const v = obj[key];
    if (v === undefined) return undefined;
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
      throw new Error(
        `Invalid 'refresh.${key}': expected an integer from ${min} to ${max}. Source: ${configPath}`,
      );
    }
    return v;
  };
  const maxSources = int("max_sources_per_run", 1, 1000);
  if (maxSources !== undefined) out.maxSourcesPerRun = maxSources;
  const maxTurns = int("max_turns", 5, 1000);
  if (maxTurns !== undefined) out.maxTurns = maxTurns;
  const interval = int("min_interval_minutes", 0, 10_080);
  if (interval !== undefined) out.minIntervalMinutes = interval;
  if (obj.max_utilization !== undefined) {
    const v = obj.max_utilization;
    if (typeof v !== "number" || !(v > 0) || v > 1) {
      throw new Error(
        `Invalid 'refresh.max_utilization': expected a fraction above 0 and at most 1 (0.8 = 80%). Source: ${configPath}`,
      );
    }
    out.maxUtilization = v;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/** The effective refresh settings: config values over the defaults. */
export function resolveRefresh(config: { refresh?: Partial<RefreshConfig> }): RefreshConfig {
  return { ...DEFAULT_REFRESH, ...(config.refresh ?? {}) };
}
