import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { frontmatterModel, skillModelChecks } from "../doctor/checks/skills.js";
import { EXTRACTION_MODEL } from "../extraction/prompt.js";
import { computeCostUsd } from "../extraction/pricing.js";
import { GENERATION_MODEL } from "../generation/prompt.js";

import {
  CALIBRATED_MODELS,
  DEFAULT_MODELS,
  MODEL_PRICES,
  isCalibrated,
  priceOf,
  uncalibratedModelMessage,
} from "./models.js";
import { loadConfig } from "./parser.js";

describe("calibrated model set (v1.2 Phase 7)", () => {
  it("defaults are the models the frozen prompts were validated with, and are calibrated", () => {
    expect(DEFAULT_MODELS.extraction).toBe(EXTRACTION_MODEL);
    expect(DEFAULT_MODELS.generation).toBe(GENERATION_MODEL);
    expect(isCalibrated("extraction", DEFAULT_MODELS.extraction)).toBe(true);
    expect(isCalibrated("generation", DEFAULT_MODELS.generation)).toBe(true);
  });

  it("every calibrated model has a list price", () => {
    for (const models of Object.values(CALIBRATED_MODELS)) {
      for (const m of models) expect(MODEL_PRICES[m]).toBeDefined();
    }
    expect(() => priceOf("claude-unknown")).toThrow(/No list price/);
    expect(computeCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(30);
  });

  it("names the calibrated models and the remedy for an uncalibrated one", () => {
    const msg = uncalibratedModelMessage("extraction", "claude-haiku-5-5", "'index.model'");
    expect(msg).toMatch(/not calibrated for extraction/);
    expect(msg).toMatch(/claude-opus-4-7/);
    expect(msg).toMatch(/incremental-model-calibration/);
  });
});

describe("index.model and skill pins are checked against the allowlist", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(pathJoin(tmpdir(), "ca-models-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const config = (extra: string) =>
    writeFileSync(
      pathJoin(root, ".contextatlas.yml"),
      ["version: 1", "languages: [typescript]", "adrs:", "  path: docs/adr/", extra, ""].join("\n"),
    );

  it("accepts a calibrated index.model and rejects any other", () => {
    config("index:\n  model: claude-opus-4-7");
    expect(loadConfig(root).index.model).toBe("claude-opus-4-7");
    config("index:\n  model: claude-haiku-5-5");
    expect(() => loadConfig(root)).toThrow(/'index.model' is 'claude-haiku-5-5', which is not calibrated/);
  });

  it("doctor warns about an uncalibrated or missing skill pin, and passes calibrated ones", () => {
    const skill = (name: string, front: string) => {
      mkdirSync(pathJoin(root, ".claude", "skills", name), { recursive: true });
      writeFileSync(pathJoin(root, ".claude", "skills", name, "SKILL.md"), `---\nname: ${name}\n${front}---\n\nbody\n`);
    };
    skill("index-atlas", "model: claude-opus-4-7\n");
    skill("generate-adrs", "model: claude-opus-4-7\n");
    const ctx = { repoRoot: root } as Parameters<typeof skillModelChecks>[0];
    expect(skillModelChecks(ctx)[0]?.status).toBe("pass");
    skill("refresh-atlas", "model: claude-haiku-5-5\n");
    skill("generate-adrs", "effort: xhigh\n");
    const warn = skillModelChecks(ctx)[0];
    expect(warn?.status).toBe("warn");
    expect(warn?.message).toMatch(/refresh-atlas pins claude-haiku-5-5, not calibrated for extraction/);
    expect(warn?.message).toMatch(/generate-adrs has no model: pin/);
    expect(frontmatterModel("---\nmodel: 'claude-opus-4-7'\n---\n")).toBe("claude-opus-4-7");
  });
});
