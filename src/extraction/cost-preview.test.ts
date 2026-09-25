import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildCostPreview,
  estimateStreamCost,
  formatCostPreview,
  OUTPUT_TOKEN_PRIORS,
} from "./cost-preview.js";
import type { ExtractionPlan } from "./extraction-plan.js";
import {
  computeCostUsd,
  estimateTokensFromChars,
} from "./pricing.js";
import { EXTRACTION_PROMPT } from "./prompt.js";

describe("estimateTokensFromChars", () => {
  it("rounds up and is conservative (about 3 characters per token)", () => {
    expect(estimateTokensFromChars(0)).toBe(0);
    expect(estimateTokensFromChars(1)).toBe(1);
    expect(estimateTokensFromChars(3000)).toBe(1000);
  });
});

describe("estimateStreamCost", () => {
  it("prices every call as prompt + body + separator input, with the stream's output-token range", () => {
    const e = estimateStreamCost("docstring", 1, ["abc", "defgh"]);
    const perCall = (body: string) =>
      estimateTokensFromChars(EXTRACTION_PROMPT.length + body.length + "\n---\n".length);
    expect(e.calls).toBe(2);
    expect(e.units).toBe(1);
    expect(e.inputTokens).toBe(perCall("abc") + perCall("defgh"));
    expect(e.outputTokensLow).toBe(2 * OUTPUT_TOKEN_PRIORS.docstring.low);
    expect(e.outputTokensHigh).toBe(2 * OUTPUT_TOKEN_PRIORS.docstring.high);
    expect(e.costLowUsd).toBeCloseTo(
      computeCostUsd({ inputTokens: e.inputTokens, outputTokens: e.outputTokensLow }),
      12,
    );
    expect(e.costHighUsd).toBeGreaterThan(e.costLowUsd);
  });

  it("uses a larger output range for prose than for docstrings and commits", () => {
    expect(OUTPUT_TOKEN_PRIORS.adr.high).toBeGreaterThan(OUTPUT_TOKEN_PRIORS.docstring.high);
    for (const s of ["adr", "docstring", "commit"] as const) {
      expect(OUTPUT_TOKEN_PRIORS[s].high).toBeGreaterThan(OUTPUT_TOKEN_PRIORS[s].low);
    }
  });
});

describe("buildCostPreview + formatCostPreview", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-preview-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function plan(): ExtractionPlan {
    const adr = pathJoin(tmp, "ADR-01.md");
    writeFileSync(adr, "---\nid: ADR-01\n---\nbody text\n");
    return {
      streams: new Set(["adr", "docstring"]),
      prose: [{ absPath: adr, relPath: "docs/adr/ADR-01.md", sha: "1", bucket: "adr", format: "md" }],
      docstring: {
        files: [
          {
            relPath: "src/a.ts",
            sha: "a",
            adapter: undefined as never,
            symbols: [],
            docstrings: {
              symbolsProcessed: 2,
              symbolsExported: 2,
              entries: [
                { symbolId: "sym:ts:src/a.ts:A", docstring: "doc A" },
                { symbolId: "sym:ts:src/a.ts:B", docstring: "doc B" },
              ],
              errors: [],
            },
          },
          {
            relPath: "src/empty.ts",
            sha: "e",
            adapter: undefined as never,
            symbols: [],
            docstrings: { symbolsProcessed: 0, symbolsExported: 0, entries: [], errors: [] },
          },
        ],
        filesUnchanged: 3,
        calls: 2,
      },
      commit: null,
    };
  }

  it("counts per-stream calls (prose body without frontmatter), names disabled streams and totals the range", () => {
    const p = buildCostPreview(plan());
    expect(p.streams.map((s) => [s.stream, s.units, s.calls])).toEqual([
      ["adr", 1, 1],
      ["docstring", 1, 2],
    ]);
    const adr = p.streams[0]!;
    expect(adr.inputTokens).toBe(
      estimateTokensFromChars(EXTRACTION_PROMPT.length + "body text\n".length + 5),
    );
    expect(p.disabled).toEqual(["commit"]);
    expect(p.calls).toBe(3);
    expect(p.costLowUsd).toBeCloseTo(p.streams[0]!.costLowUsd + p.streams[1]!.costLowUsd, 12);
    expect(p.costHighUsd).toBeCloseTo(p.streams[0]!.costHighUsd + p.streams[1]!.costHighUsd, 12);
  });

  it("reports a skipped commit stream with its reason", () => {
    const p = buildCostPreview({
      ...plan(),
      streams: new Set(["adr", "docstring", "commit"]),
      commit: { status: "skipped", reason: "not a git repository" },
    });
    expect(p.disabled).toEqual([]);
    expect(p.skipped).toEqual([{ stream: "commit", reason: "not a git repository" }]);
  });

  it("formats an informational block: per-stream lines, total range, disabled streams; no prompt and no '~3x lower' wording", () => {
    const text = formatCostPreview(buildCostPreview(plan()));
    expect(text).toMatch(/adr\s+1 file\s+1 call/);
    expect(text).toMatch(/docstring\s+1 file\s+2 calls/);
    expect(text).toMatch(/total\s+3 calls/);
    expect(text).toMatch(/\$\d+\.\d{2} to \$\d+\.\d{2}/);
    expect(text).toMatch(/disabled: commit/);
    expect(text).toContain("claude-opus-4-7");
    expect(text).not.toMatch(/3x|\[y\/N\]|continue\?/i);
    expect(text.endsWith("\n")).toBe(true);
  });
});
