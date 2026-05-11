import { describe, expect, it } from "vitest";

import {
  GENERATE_ADRS_PROMPT,
  GENERATION_MAX_TOKENS,
  GENERATION_MODEL,
  OPUS_INPUT_PRICE_PER_MILLION_USD,
  OPUS_OUTPUT_PRICE_PER_MILLION_USD,
  REFERENCE_CONTEXT_TOKEN_WARNING_THRESHOLD,
} from "./prompt.js";

describe("GENERATE_ADRS_PROMPT canonical content (v0.7 Step 2.2.a.2)", () => {
  it("is non-empty + non-placeholder canonical prompt content", () => {
    expect(GENERATE_ADRS_PROMPT.length).toBeGreaterThan(1000);
    // Placeholder sentinel from Step 2.2.a.1 should NOT appear in
    // shipped Step 2.2.a.2 content.
    expect(GENERATE_ADRS_PROMPT).not.toContain("[GENERATE_ADRS_PROMPT placeholder");
  });

  it("specifies JSON output schema with adrs array", () => {
    expect(GENERATE_ADRS_PROMPT).toContain('"adrs"');
    expect(GENERATE_ADRS_PROMPT).toContain('"number"');
    expect(GENERATE_ADRS_PROMPT).toContain('"title"');
    expect(GENERATE_ADRS_PROMPT).toContain('"symbols"');
    expect(GENERATE_ADRS_PROMPT).toContain('"severity_summary"');
    expect(GENERATE_ADRS_PROMPT).toContain('"markdown_body"');
  });

  it("specifies 4-section ADR template (Context / Decision / Rationale / Consequences)", () => {
    expect(GENERATE_ADRS_PROMPT).toContain("## Context");
    expect(GENERATE_ADRS_PROMPT).toContain("## Decision");
    expect(GENERATE_ADRS_PROMPT).toContain("## Rationale");
    expect(GENERATE_ADRS_PROMPT).toContain("## Consequences");
  });

  it("specifies severity taxonomy (hard / soft / context)", () => {
    expect(GENERATE_ADRS_PROMPT).toContain('"hard"');
    expect(GENERATE_ADRS_PROMPT).toContain('"soft"');
    expect(GENERATE_ADRS_PROMPT).toContain('"context"');
  });

  it("includes scale-variance calibration (Refinement 2)", () => {
    expect(GENERATE_ADRS_PROMPT).toContain("Small codebase");
    expect(GENERATE_ADRS_PROMPT).toContain("Substantial codebase");
    expect(GENERATE_ADRS_PROMPT).toContain("Very large codebase");
    expect(GENERATE_ADRS_PROMPT).toContain("15-30 ADRs");
  });

  it("specifies symbol reference convention (path/to/file.ts:SymbolName)", () => {
    expect(GENERATE_ADRS_PROMPT).toContain("path/to/file.ts:SymbolName");
  });

  it("includes reference-context current-vs-superseded handling (Refinement 1)", () => {
    expect(GENERATE_ADRS_PROMPT).toContain("REFERENCE CONTEXT");
    expect(GENERATE_ADRS_PROMPT).toContain("CURRENT architectural decisions");
    expect(GENERATE_ADRS_PROMPT).toContain("superseded/withdrawn/rejected");
  });

  it("includes architectural-evolution observation framing (Refinement 3)", () => {
    expect(GENERATE_ADRS_PROMPT).toContain("architectural-evolution observation");
    expect(GENERATE_ADRS_PROMPT).toContain("Earlier documentation described");
  });

  it("instructs JSON-only output (no prose, no markdown fencing)", () => {
    expect(GENERATE_ADRS_PROMPT).toContain("Output ONLY the JSON object");
  });

  it("references cold-start path when no reference context provided", () => {
    expect(GENERATE_ADRS_PROMPT).toContain("cold-start path");
  });
});

describe("GENERATION_MODEL + constants (v0.7 Step 2.2.a.2)", () => {
  it("uses Claude Opus 4.7 (same model as extraction)", () => {
    expect(GENERATION_MODEL).toBe("claude-opus-4-7");
  });

  it("specifies generous max output tokens for 5-30 ADRs", () => {
    expect(GENERATION_MAX_TOKENS).toBeGreaterThanOrEqual(32_000);
  });

  it("REFERENCE_CONTEXT_TOKEN_WARNING_THRESHOLD locked at 500k per Lock 1", () => {
    expect(REFERENCE_CONTEXT_TOKEN_WARNING_THRESHOLD).toBe(500_000);
  });

  it("Opus 4.7 pricing constants match Anthropic public pricing (Jan 2026)", () => {
    expect(OPUS_INPUT_PRICE_PER_MILLION_USD).toBe(5);
    expect(OPUS_OUTPUT_PRICE_PER_MILLION_USD).toBe(25);
  });
});
