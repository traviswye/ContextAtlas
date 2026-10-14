/**
 * Calibrated model set (v1.2 Phase 7; ADR-02 2026-10-14 amendment).
 *
 * ADR-02's invariant is "frozen prompt + calibrated model set": the
 * prompt texts are frozen, and each model role may use only a model that
 * entered its allowlist with Step-9-style calibration evidence against
 * that frozen prompt (evidence archives: docs/adr/incremental-model-
 * calibration/). The default stays on the model the prompts were
 * validated with until evidence says otherwise.
 *
 * Roles:
 *   - `extraction` — `contextatlas index` (Tier 2, API) via
 *     `index.model`, and the `model:` pins of `/index-atlas` and
 *     `/refresh-atlas` (Tier 1). A skill's `model:` frontmatter wins over
 *     `claude -p --model` (v1.2 Phase 7 probe), so the Tier 1 model is
 *     the shipped `/refresh-atlas` pin; `contextatlas doctor` checks the
 *     installed pins against this list.
 *   - `generation` — `generate-adrs` (CLI and `/generate-adrs`). No config
 *     key: a single calibrated model.
 *
 * Prices are per million tokens, list price, and back the cost preview
 * and `cost_usd`. Every allowlisted model must have a price.
 */

export type ModelRole = "extraction" | "generation";

export const DEFAULT_MODELS: Readonly<Record<ModelRole, string>> = {
  extraction: "claude-opus-4-7",
  generation: "claude-opus-4-7",
};

export const CALIBRATED_MODELS: Readonly<Record<ModelRole, readonly string[]>> = {
  extraction: ["claude-opus-4-7"],
  generation: ["claude-opus-4-7"],
};

export interface ModelPrice {
  readonly inputUsdPerMTok: number;
  readonly outputUsdPerMTok: number;
}

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-4-7": { inputUsdPerMTok: 5.0, outputUsdPerMTok: 25.0 },
};

export function isCalibrated(role: ModelRole, model: string): boolean {
  return CALIBRATED_MODELS[role].includes(model);
}

/** The actionable error for a model outside a role's allowlist. */
export function uncalibratedModelMessage(role: ModelRole, model: string, where: string): string {
  return (
    `${where} is '${model}', which is not calibrated for ${role}. Calibrated: ` +
    `${CALIBRATED_MODELS[role].join(", ")}. A model joins the list only with ` +
    "calibration evidence against the frozen prompt (ADR-02 2026-10-14 " +
    "amendment; docs/adr/incremental-model-calibration/). Remove the setting " +
    `to use the default (${DEFAULT_MODELS[role]}).`
  );
}

export function priceOf(model: string): ModelPrice {
  const price = MODEL_PRICES[model];
  if (price === undefined) {
    throw new Error(
      `No list price recorded for model '${model}' (src/config/models.ts MODEL_PRICES). ` +
        "Every calibrated model needs one; this is a contextatlas bug.",
    );
  }
  return price;
}
