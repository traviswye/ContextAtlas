/**
 * Tests for src/grading/anonymize.ts.
 *
 * Coverage targets per Step 4 design lock:
 *   - stripFilenameMarkers: harness denylist matches stripped; source-
 *     code refs + ADR refs + edge cases (phase-5.ts; src/phase-detector.ts)
 *     preserved.
 *   - deriveSeed: deterministic; throws on separator collision +
 *     non-integer trial_index.
 *   - abParity: even/odd derivation; invalid-hex throws.
 *   - derivePresentationId: deterministic; UUID-formatted layout.
 *   - anonymize: deterministic; parity-driven A/B assignment;
 *     forceSwapAB flips; manifest entry shape; cross_order_regrade
 *     reflects forceSwapAB.
 *   - decodeAssignment: inverse of anonymize at assignment level.
 *   - writeManifest + readManifest: round-trip; version validation.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  abParity,
  anonymize,
  decodeAssignment,
  deriveSeed,
  derivePresentationId,
  readManifest,
  stripFilenameMarkers,
  writeManifest,
  type AnonymizeOptions,
  type RunManifest,
  type RunManifestEntry,
  type TrialOutput,
} from "./anonymize.js";

// ============================================================================
// Fixtures
// ============================================================================

const FIXTURE_CA_TRIAL: TrialOutput = {
  answer:
    "The whole system is governed by ADR-04: type-inference chain " +
    "from route registration to typed client. See src/validator/" +
    "validator.test.ts:36-61 for reference impl. Atlas data sourced " +
    "from compact_format.txt and run-manifest.json.",
};

const FIXTURE_BETA_CA_TRIAL: TrialOutput = {
  answer:
    "Looking at httpx/_models.py:635-639 you can see the implementation. " +
    "ADR-05 documents the lifecycle. Per phase-5-reference-run.md the " +
    "pattern surfaces with step9-trial-data.json captured.",
};

const FIXTURE_OPTS: AnonymizeOptions = {
  prompt: "How does validator type flow work in hono?",
  caTrial: FIXTURE_CA_TRIAL,
  betaCaTrial: FIXTURE_BETA_CA_TRIAL,
  caSourcePath: "runs/2026-04-29T05-36-15-709Z/hono/h4/ca.json",
  betaCaSourcePath: "runs/2026-04-29T05-36-15-709Z/hono/h4/beta-ca.json",
  cellId: "hono/h4-validator-typeflow",
  trialIndex: 0,
  runUuid: "step8-2026-05-03-run-001",
  pairUuid: "pair-uuid-fixture-0001",
};

// ============================================================================
// stripFilenameMarkers
// ============================================================================

describe("stripFilenameMarkers", () => {
  it("strips compact_format.txt", () => {
    expect(stripFilenameMarkers("see compact_format.txt for output")).toBe(
      "see [artifact] for output",
    );
  });

  it("strips summary.md", () => {
    expect(stripFilenameMarkers("written to summary.md")).toBe(
      "written to [artifact]",
    );
  });

  it("strips run-manifest.json", () => {
    expect(stripFilenameMarkers("see run-manifest.json")).toBe(
      "see [artifact]",
    );
  });

  it("strips phase-N-*.md harness artifacts", () => {
    expect(stripFilenameMarkers("phase-5-reference-run.md")).toBe(
      "[artifact]",
    );
    expect(stripFilenameMarkers("phase-8-trace-analysis-supplement.md")).toBe(
      "[artifact]",
    );
  });

  it("strips step9-*.json harness artifacts", () => {
    expect(stripFilenameMarkers("step9-trial-data.json")).toBe("[artifact]");
    expect(stripFilenameMarkers("step9-results.json")).toBe("[artifact]");
  });

  it("preserves source-code refs (.py, .ts, .go, .rs, .java, .tsx, .js)", () => {
    const sourceRefs = [
      "httpx/_models.py:635-639",
      "src/validator/validator.test.ts:36-61",
      "internal/cobra/command.go",
      "src/lib/parser.rs",
      "com/example/Foo.java",
      "components/Button.tsx",
      "scripts/build.js",
    ];
    for (const ref of sourceRefs) {
      expect(stripFilenameMarkers(ref)).toBe(ref);
    }
  });

  it("preserves ADR-NN references", () => {
    expect(stripFilenameMarkers("per ADR-04 and ADR-19")).toBe(
      "per ADR-04 and ADR-19",
    );
  });

  it("does NOT strip phase-N.ts (allowlist extension wins; denylist requires .md)", () => {
    expect(stripFilenameMarkers("see phase-5.ts for fixture")).toBe(
      "see phase-5.ts for fixture",
    );
  });

  it("does NOT strip src/phase-detector.ts (path containing 'phase-' but not phase-N-*.md shape)", () => {
    expect(stripFilenameMarkers("see src/phase-detector.ts")).toBe(
      "see src/phase-detector.ts",
    );
  });

  it("strips multiple harness artifacts in single text", () => {
    const input =
      "atlas at compact_format.txt; verified by phase-5-reference-run.md";
    expect(stripFilenameMarkers(input)).toBe(
      "atlas at [artifact]; verified by [artifact]",
    );
  });

  it("preserves empty string", () => {
    expect(stripFilenameMarkers("")).toBe("");
  });

  it("preserves text with no filename markers", () => {
    const text = "The function returns void; see ADR-04 for rationale.";
    expect(stripFilenameMarkers(text)).toBe(text);
  });

  it("preserves source-code path adjacent to harness artifact (mixed content)", () => {
    expect(
      stripFilenameMarkers(
        "src/foo.ts implements compact_format.txt serialization",
      ),
    ).toBe("src/foo.ts implements [artifact] serialization");
  });
});

// ============================================================================
// deriveSeed
// ============================================================================

describe("deriveSeed", () => {
  it("is deterministic — same inputs produce same seed", () => {
    const s1 = deriveSeed("hono/h4-validator-typeflow", 0, "run-001");
    const s2 = deriveSeed("hono/h4-validator-typeflow", 0, "run-001");
    expect(s1).toBe(s2);
  });

  it("returns 16 hex characters", () => {
    const seed = deriveSeed("hono/h4", 0, "run-001");
    expect(seed).toMatch(/^[0-9a-f]{16}$/);
  });

  it("different cell_id produces different seed", () => {
    const s1 = deriveSeed("hono/h4", 0, "run-001");
    const s2 = deriveSeed("httpx/p4", 0, "run-001");
    expect(s1).not.toBe(s2);
  });

  it("different trial_index produces different seed", () => {
    const s1 = deriveSeed("hono/h4", 0, "run-001");
    const s2 = deriveSeed("hono/h4", 1, "run-001");
    expect(s1).not.toBe(s2);
  });

  it("different run_uuid produces different seed", () => {
    const s1 = deriveSeed("hono/h4", 0, "run-001");
    const s2 = deriveSeed("hono/h4", 0, "run-002");
    expect(s1).not.toBe(s2);
  });

  it("throws when cell_id contains the seed-input separator ':'", () => {
    expect(() => deriveSeed("hono:h4-validator", 0, "run-001")).toThrow(
      /separator collision/,
    );
  });

  it("throws when run_uuid contains the seed-input separator ':'", () => {
    expect(() => deriveSeed("hono/h4", 0, "run:001")).toThrow(
      /separator collision/,
    );
  });

  it("throws when trial_index is negative", () => {
    expect(() => deriveSeed("hono/h4", -1, "run-001")).toThrow(
      /non-negative integer/,
    );
  });

  it("throws when trial_index is non-integer", () => {
    expect(() => deriveSeed("hono/h4", 1.5, "run-001")).toThrow(
      /non-negative integer/,
    );
  });
});

// ============================================================================
// abParity
// ============================================================================

describe("abParity", () => {
  it("returns 'even' for seed starting with hex producing even int", () => {
    expect(abParity("00000000aaaaaaaa")).toBe("even");
    expect(abParity("00000002ffffffff")).toBe("even");
  });

  it("returns 'odd' for seed starting with hex producing odd int", () => {
    expect(abParity("00000001aaaaaaaa")).toBe("odd");
    expect(abParity("00000003ffffffff")).toBe("odd");
  });

  it("respects the first 8 hex chars (full 32-bit int parity)", () => {
    // ffffffff = 4294967295 = odd
    expect(abParity("ffffffff00000000")).toBe("odd");
    // fffffffe = 4294967294 = even
    expect(abParity("fffffffe00000000")).toBe("even");
  });

  it("throws when seed prefix is not valid hex", () => {
    expect(() => abParity("zzzzzzzz12345678")).toThrow(/valid hex/);
  });
});

// ============================================================================
// derivePresentationId
// ============================================================================

describe("derivePresentationId", () => {
  it("is deterministic — same seed produces same id", () => {
    const id1 = derivePresentationId("0123456789abcdef");
    const id2 = derivePresentationId("0123456789abcdef");
    expect(id1).toBe(id2);
  });

  it("produces standard UUID 8-4-4-4-12 layout", () => {
    const id = derivePresentationId("0123456789abcdef");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("different seeds produce different ids", () => {
    const id1 = derivePresentationId("0123456789abcdef");
    const id2 = derivePresentationId("fedcba9876543210");
    expect(id1).not.toBe(id2);
  });
});

// ============================================================================
// anonymize — main entry point
// ============================================================================

describe("anonymize", () => {
  it("is deterministic — same inputs produce same output", () => {
    const r1 = anonymize(FIXTURE_OPTS);
    const r2 = anonymize(FIXTURE_OPTS);
    expect(r1.gradingInput).toEqual(r2.gradingInput);
    // manifestEntry timestamps differ; compare assignment-relevant fields
    expect(r1.manifestEntry.seed).toBe(r2.manifestEntry.seed);
    expect(r1.manifestEntry.assignment).toEqual(r2.manifestEntry.assignment);
    expect(r1.manifestEntry.assignment_parity).toBe(
      r2.manifestEntry.assignment_parity,
    );
    expect(r1.manifestEntry.presentation_id).toBe(
      r2.manifestEntry.presentation_id,
    );
  });

  it("includes prompt unchanged in gradingInput", () => {
    const result = anonymize(FIXTURE_OPTS);
    expect(result.gradingInput.prompt).toBe(FIXTURE_OPTS.prompt);
  });

  it("includes presentation_id matching the seed-derived id", () => {
    const result = anonymize(FIXTURE_OPTS);
    const expected = derivePresentationId(
      deriveSeed(
        FIXTURE_OPTS.cellId,
        FIXTURE_OPTS.trialIndex,
        FIXTURE_OPTS.runUuid,
      ),
    );
    expect(result.gradingInput.presentation_id).toBe(expected);
    expect(result.manifestEntry.presentation_id).toBe(expected);
  });

  it("applies filename-marker stripping to ca answer", () => {
    const result = anonymize(FIXTURE_OPTS);
    const caAnswerLanded =
      result.manifestEntry.assignment.A === "ca"
        ? result.gradingInput.answer_A
        : result.gradingInput.answer_B;
    expect(caAnswerLanded).toContain("[artifact]");
    expect(caAnswerLanded).not.toContain("compact_format.txt");
    expect(caAnswerLanded).not.toContain("run-manifest.json");
    // Source code refs preserved
    expect(caAnswerLanded).toContain("src/validator/validator.test.ts:36-61");
    expect(caAnswerLanded).toContain("ADR-04");
  });

  it("applies filename-marker stripping to beta-ca answer", () => {
    const result = anonymize(FIXTURE_OPTS);
    const betaCaAnswerLanded =
      result.manifestEntry.assignment.A === "beta-ca"
        ? result.gradingInput.answer_A
        : result.gradingInput.answer_B;
    expect(betaCaAnswerLanded).toContain("[artifact]");
    expect(betaCaAnswerLanded).not.toContain("phase-5-reference-run.md");
    expect(betaCaAnswerLanded).not.toContain("step9-trial-data.json");
    // Source code refs preserved
    expect(betaCaAnswerLanded).toContain("httpx/_models.py:635-639");
    expect(betaCaAnswerLanded).toContain("ADR-05");
  });

  it("forceSwapAB=true flips assignment from natural parity", () => {
    const natural = anonymize(FIXTURE_OPTS);
    const swapped = anonymize({ ...FIXTURE_OPTS, forceSwapAB: true });
    expect(swapped.manifestEntry.assignment.A).toBe(
      natural.manifestEntry.assignment.B,
    );
    expect(swapped.manifestEntry.assignment.B).toBe(
      natural.manifestEntry.assignment.A,
    );
    expect(swapped.gradingInput.answer_A).toBe(natural.gradingInput.answer_B);
    expect(swapped.gradingInput.answer_B).toBe(natural.gradingInput.answer_A);
  });

  it("forceSwapAB=true sets cross_order_regrade=true; default false", () => {
    expect(anonymize(FIXTURE_OPTS).manifestEntry.cross_order_regrade).toBe(
      false,
    );
    expect(
      anonymize({ ...FIXTURE_OPTS, forceSwapAB: true }).manifestEntry
        .cross_order_regrade,
    ).toBe(true);
  });

  it("manifest entry contains all required ADR-19 §3 fields", () => {
    const result = anonymize(FIXTURE_OPTS);
    const e = result.manifestEntry;
    expect(e.pair_uuid).toBe(FIXTURE_OPTS.pairUuid);
    expect(e.cell_id).toBe(FIXTURE_OPTS.cellId);
    expect(e.trial_index).toBe(FIXTURE_OPTS.trialIndex);
    expect(e.run_uuid).toBe(FIXTURE_OPTS.runUuid);
    expect(e.seed).toMatch(/^[0-9a-f]{16}$/);
    expect(["even", "odd"]).toContain(e.assignment_parity);
    expect(e.assignment.A === "ca" || e.assignment.A === "beta-ca").toBe(true);
    expect(e.assignment.B === "ca" || e.assignment.B === "beta-ca").toBe(true);
    expect(e.assignment.A).not.toBe(e.assignment.B);
    expect(e.ca_source_path).toBe(FIXTURE_OPTS.caSourcePath);
    expect(e.beta_ca_source_path).toBe(FIXTURE_OPTS.betaCaSourcePath);
    expect(e.presentation_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(e.anonymization_version).toBe(1);
    expect(typeof e.created_at).toBe("string");
    expect(new Date(e.created_at).toString()).not.toBe("Invalid Date");
  });

  it("assignment matches assignment_parity (even → A=ca, odd → A=beta-ca)", () => {
    const result = anonymize(FIXTURE_OPTS);
    if (result.manifestEntry.assignment_parity === "even") {
      expect(result.manifestEntry.assignment.A).toBe("ca");
      expect(result.manifestEntry.assignment.B).toBe("beta-ca");
    } else {
      expect(result.manifestEntry.assignment.A).toBe("beta-ca");
      expect(result.manifestEntry.assignment.B).toBe("ca");
    }
  });
});

// ============================================================================
// decodeAssignment
// ============================================================================

describe("decodeAssignment", () => {
  it("returns the assignment from a manifest entry unchanged", () => {
    const result = anonymize(FIXTURE_OPTS);
    expect(decodeAssignment(result.manifestEntry)).toEqual(
      result.manifestEntry.assignment,
    );
  });
});

// ============================================================================
// writeManifest + readManifest — round-trip + version validation
// ============================================================================

describe("writeManifest + readManifest", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "anonymize-test-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("round-trips a manifest through disk", () => {
    const result = anonymize(FIXTURE_OPTS);
    const manifest: RunManifest = {
      run_uuid: FIXTURE_OPTS.runUuid,
      step8_cycle_started_at: new Date().toISOString(),
      anonymization_version: 1,
      entries: [result.manifestEntry],
    };
    const path = join(tmpDir, "manifest-roundtrip.json");
    writeManifest(path, manifest);
    const loaded = readManifest(path);
    expect(loaded.run_uuid).toBe(manifest.run_uuid);
    expect(loaded.entries.length).toBe(1);
    expect(loaded.entries[0]).toEqual(result.manifestEntry);
  });

  it("readManifest throws when anonymization_version is missing", () => {
    const path = join(tmpDir, "manifest-no-version.json");
    writeManifest(path, {
      run_uuid: "x",
      step8_cycle_started_at: new Date().toISOString(),
      anonymization_version: 1,
      entries: [],
    });
    // Overwrite with version-stripped variant
    writeFileSync(
      path,
      JSON.stringify({ run_uuid: "x", entries: [] }),
      "utf8",
    );
    expect(() => readManifest(path)).toThrow(/anonymization_version/);
  });

  it("readManifest throws on unsupported anonymization_version", () => {
    const path = join(tmpDir, "manifest-bad-version.json");
    writeFileSync(
      path,
      JSON.stringify({
        run_uuid: "x",
        anonymization_version: 999,
        entries: [],
      }),
      "utf8",
    );
    expect(() => readManifest(path)).toThrow(/unsupported anonymization_version/);
  });

  it("readManifest preserves entries[] ordering", () => {
    const e1: RunManifestEntry = anonymize(FIXTURE_OPTS).manifestEntry;
    const e2: RunManifestEntry = anonymize({
      ...FIXTURE_OPTS,
      trialIndex: 1,
      pairUuid: "pair-uuid-fixture-0002",
    }).manifestEntry;
    const e3: RunManifestEntry = anonymize({
      ...FIXTURE_OPTS,
      trialIndex: 2,
      pairUuid: "pair-uuid-fixture-0003",
    }).manifestEntry;
    const manifest: RunManifest = {
      run_uuid: FIXTURE_OPTS.runUuid,
      step8_cycle_started_at: new Date().toISOString(),
      anonymization_version: 1,
      entries: [e1, e2, e3],
    };
    const path = join(tmpDir, "manifest-ordered.json");
    writeManifest(path, manifest);
    const loaded = readManifest(path);
    expect(loaded.entries.map((e) => e.trial_index)).toEqual([0, 1, 2]);
  });
});
