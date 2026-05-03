/**
 * Lint-style regression sentinels for the canonical rubric prompts
 * shipped at Step 3.1+3.2 (commit 6ed89ce).
 *
 * Purpose: catch accidental drops of axis names, JSON schema spec,
 * anti-RLHF instruction, or framing-prefix divergence between SINGLE
 * and PAIRED constants if a future edit refactors rubric-prompt.ts.
 *
 * NOT scope:
 *   - Language quality tests (require calibration evidence; Step 6
 *     calibration substrate is the empirical test).
 *   - Prose-quality assertions.
 *   - Rubric correctness (Step 6 calibration adjudicates).
 *
 * See ADR-19 §1 + §3 for the design lock these sentinels protect.
 */

import { describe, expect, it } from "vitest";

import {
  RUBRIC_PROMPT_PAIRED,
  RUBRIC_PROMPT_SINGLE,
} from "./rubric-prompt.js";

const AXIS_NAMES = [
  "factual_correctness",
  "completeness",
  "actionability",
  "hallucination",
] as const;

/**
 * Whitespace-normalized substring check. Used for assertions whose
 * target spans line boundaries in the canonical text (e.g., the
 * anti-RLHF instruction wraps after "do" in RUBRIC_PROMPT_PAIRED).
 * Line-wrapping is a formatting choice; regression sentinels should
 * catch word-drop, not wrap-position changes.
 */
function containsNormalized(haystack: string, needle: string): boolean {
  const normalize = (s: string): string => s.replace(/\s+/g, " ");
  return normalize(haystack).includes(normalize(needle));
}

describe("rubric-prompt regression sentinels", () => {
  describe("RUBRIC_PROMPT_SINGLE", () => {
    it("mentions all 4 axis names per ADR-19 §1", () => {
      for (const axis of AXIS_NAMES) {
        expect(RUBRIC_PROMPT_SINGLE).toContain(axis);
      }
    });

    it("contains 0-3 scale specifier", () => {
      expect(RUBRIC_PROMPT_SINGLE).toContain("0-3");
    });

    it("contains literal JSON schema spec with axis keys + 0|1|2|3 union", () => {
      for (const axis of AXIS_NAMES) {
        expect(RUBRIC_PROMPT_SINGLE).toContain(`"${axis}": 0|1|2|3`);
      }
    });

    it("contains 'Output ONLY a JSON object' discipline line (Step 2.4-validated wording)", () => {
      expect(RUBRIC_PROMPT_SINGLE).toContain("Output ONLY a JSON object");
    });

    it("contains worked-anchor labels confirming Phase 5 §5.1 substrate is inlined", () => {
      expect(RUBRIC_PROMPT_SINGLE).toContain("ALPHA H4");
      expect(RUBRIC_PROMPT_SINGLE).toContain("CA H4");
      expect(RUBRIC_PROMPT_SINGLE).toContain("real output");
    });

    it("uses single-mode framing ('an answer', not 'two answers')", () => {
      expect(RUBRIC_PROMPT_SINGLE).toContain("grade an answer");
      expect(RUBRIC_PROMPT_SINGLE).not.toContain(
        "grade two answers (presented as A and B)",
      );
    });
  });

  describe("RUBRIC_PROMPT_PAIRED", () => {
    it("mentions all 4 axis names per ADR-19 §1", () => {
      for (const axis of AXIS_NAMES) {
        expect(RUBRIC_PROMPT_PAIRED).toContain(axis);
      }
    });

    it("contains 0-3 scale specifier", () => {
      expect(RUBRIC_PROMPT_PAIRED).toContain("0-3");
    });

    it("contains literal paired JSON schema spec with A and B keys", () => {
      expect(RUBRIC_PROMPT_PAIRED).toContain('"A":');
      expect(RUBRIC_PROMPT_PAIRED).toContain('"B":');
      for (const axis of AXIS_NAMES) {
        expect(RUBRIC_PROMPT_PAIRED).toContain(`"${axis}": 0|1|2|3`);
      }
    });

    it("contains 'Output ONLY a JSON object' discipline line (Step 2.4-validated wording)", () => {
      expect(RUBRIC_PROMPT_PAIRED).toContain("Output ONLY a JSON object");
    });

    it("contains 'do not invent distinctions to break ties' anti-RLHF instruction (ADR-19 §3 load-bearing)", () => {
      expect(
        containsNormalized(
          RUBRIC_PROMPT_PAIRED,
          "do not invent distinctions to break ties",
        ),
      ).toBe(true);
    });

    it("uses paired-mode framing ('two answers (presented as A and B)')", () => {
      expect(RUBRIC_PROMPT_PAIRED).toContain(
        "grade two answers (presented as A and B)",
      );
    });

    it("contains worked-anchor labels confirming Phase 5 §5.1 substrate is inlined", () => {
      expect(RUBRIC_PROMPT_PAIRED).toContain("ALPHA H4");
      expect(RUBRIC_PROMPT_PAIRED).toContain("CA H4");
      expect(RUBRIC_PROMPT_PAIRED).toContain("real output");
    });
  });

  describe("structural distinctness between SINGLE and PAIRED", () => {
    it("PAIRED is longer than SINGLE (paired framing + paired schema add tokens)", () => {
      expect(RUBRIC_PROMPT_PAIRED.length).toBeGreaterThan(
        RUBRIC_PROMPT_SINGLE.length,
      );
    });

    it("framing prefixes differ — SINGLE 'an answer' is absent from PAIRED framing", () => {
      expect(RUBRIC_PROMPT_PAIRED).not.toContain("grade an answer");
    });

    it("anti-RLHF instruction is PAIRED-only (no A/B in SINGLE to tie)", () => {
      expect(
        containsNormalized(
          RUBRIC_PROMPT_SINGLE,
          "do not invent distinctions to break ties",
        ),
      ).toBe(false);
    });
  });

  describe("honest-labeling discipline (ADR-19 §1 transparency)", () => {
    it("Axis 4 score-0 anchor labeled HYPOTHETICAL-ILLUSTRATIVE in both constants", () => {
      expect(RUBRIC_PROMPT_SINGLE).toContain("HYPOTHETICAL-ILLUSTRATIVE");
      expect(RUBRIC_PROMPT_PAIRED).toContain("HYPOTHETICAL-ILLUSTRATIVE");
    });

    it("Phase 5 fragments labeled 'real output' in both constants", () => {
      expect(RUBRIC_PROMPT_SINGLE).toContain("ALPHA H4 (real output)");
      expect(RUBRIC_PROMPT_SINGLE).toContain("CA H4 (real output)");
      expect(RUBRIC_PROMPT_PAIRED).toContain("ALPHA H4 (real output)");
      expect(RUBRIC_PROMPT_PAIRED).toContain("CA H4 (real output)");
    });
  });
});
