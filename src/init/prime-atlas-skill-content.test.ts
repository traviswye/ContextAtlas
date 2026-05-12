/**
 * V0.8 Step 3.2 — SKILL.md content unit tests for /prime-atlas per
 * Q3.0.7 Option γ composite component (SKILL.md content unit tests +
 * manual empirical validation at contextatlas-on-itself dogfood).
 *
 * Verifies canonical SKILL.md substrate shape:
 *   - Frontmatter: name + description + model + effort fields
 *     (Q3.0.1.a Option β substantive description; v0.7 Step 2.3.c.0
 *     frontmatter pinning inheritance for model + effort)
 *   - §-section framework per Q3.0.1.b
 *   - Tool-call probe procedural steps per Q3.0.2 substrate
 *   - Failure modes matrix per Q3.0.2 outcome interpretation
 *   - Tools introduction substrate per Q3.0.4 (3 MCP tools)
 *   - 2nd person imperative voice per Q3.0.6 Option α
 *
 * Manual empirical validation at contextatlas-on-itself dogfood is
 * TRAVIS-SIDE execution (cohort user opens new Claude Code session
 * + invokes /prime-atlas + observes outcome; analogous to v0.7 Step
 * 5.1 atlas refresh Travis-side cadence per API-key + session-context
 * boundary discipline).
 */

import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSkillContent(): string {
  // Walk up from src/init/ to repo root, then to .claude/skills/prime-atlas/
  const repoRoot = pathResolve(__dirname, "..", "..");
  const skillPath = pathResolve(
    repoRoot,
    ".claude",
    "skills",
    "prime-atlas",
    "SKILL.md",
  );
  return readFileSync(skillPath, "utf8");
}

describe("/prime-atlas SKILL.md canonical content (v0.8 Step 3.1)", () => {
  const content = loadSkillContent();

  // -------------------------------------------------------------------------
  // Frontmatter substrate (Q3.0.1.a Option β + v0.7 SKILL.md precedent)
  // -------------------------------------------------------------------------

  describe("frontmatter (Q3.0.1.a Option β substantive)", () => {
    it("starts with YAML frontmatter delimited by --- markers", () => {
      expect(content.startsWith("---\n")).toBe(true);
      const secondDelim = content.indexOf("\n---\n", 4);
      expect(secondDelim).toBeGreaterThan(0);
    });

    it("declares name: prime-atlas", () => {
      expect(content).toMatch(/^name:\s*prime-atlas\s*$/m);
    });

    it("declares model: claude-opus-4-7 per v0.7 Step 2.3.c.0 pinning inheritance", () => {
      expect(content).toMatch(/^model:\s*claude-opus-4-7\s*$/m);
    });

    it("declares effort: xhigh per v0.7 Step 2.3.c.0 pinning inheritance", () => {
      expect(content).toMatch(/^effort:\s*xhigh\s*$/m);
    });

    it("description spans ≥3 sentences per Q3.0.1.a Option β substantive scale", () => {
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      expect(frontmatterMatch).not.toBeNull();
      const frontmatter = frontmatterMatch![1]!;
      const descMatch = frontmatter.match(/description:\s*([\s\S]*?)(?=\n[a-z_]+:|$)/);
      expect(descMatch).not.toBeNull();
      const description = descMatch![1]!.trim();
      // Substantive sentence count: count `.` followed by space or newline
      // (substantively the sentence boundary marker)
      const sentences = description
        .split(/\.[\s]/)
        .filter((s) => s.trim().length > 0);
      expect(sentences.length).toBeGreaterThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  // §-section framework (Q3.0.1.b)
  // -------------------------------------------------------------------------

  describe("§-section framework (Q3.0.1.b)", () => {
    const requiredSections = [
      "## When to use this skill",
      "## What this skill does",
      "## Failure modes",
      "## Tools introduction",
      "## Tool usage",
      "## Cross-references",
    ];

    for (const section of requiredSections) {
      it(`includes section: ${section}`, () => {
        expect(content).toContain(section);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Tool-call probe procedural steps (Q3.0.2 substrate)
  // -------------------------------------------------------------------------

  describe("tool-call probe procedural steps (Q3.0.2 substrate)", () => {
    it("references .contextatlas/atlas.json as substrate load target", () => {
      expect(content).toContain(".contextatlas/atlas.json");
    });

    it("references .mcp.json as verification target (Q3.0.3 checks-only)", () => {
      expect(content).toContain(".mcp.json");
    });

    it("references get_symbol_context as probe tool", () => {
      expect(content).toContain("get_symbol_context");
    });

    it("references sentinel symbol selection per Q3.0.2.a Option α", () => {
      expect(content.toLowerCase()).toContain("sentinel symbol");
      expect(content).toMatch(/first entry|symbols\[\]/i);
    });

    it("numbered procedural steps present (1-6 steps minimum)", () => {
      // Match numbered list items in "What this skill does" section
      const matches = content.match(/^\d+\.\s+\*\*/gm);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(6);
    });
  });

  // -------------------------------------------------------------------------
  // Failure modes matrix (Q3.0.2 outcome interpretation)
  // -------------------------------------------------------------------------

  describe("failure modes matrix (Q3.0.2 outcome interpretation)", () => {
    it("includes failure modes table with ≥6 outcome rows", () => {
      // Markdown table rows in Failure modes section
      const failureSection = content.split("## Failure modes")[1]!;
      const tableSection = failureSection.split("##")[0]!;
      const rows = tableSection
        .split("\n")
        .filter((line) => line.startsWith("|") && !line.includes("---"));
      // Header row + ≥6 outcome rows = ≥7 total rows
      expect(rows.length).toBeGreaterThanOrEqual(7);
    });

    it("references key outcomes: tool not found / not_found / atlas missing / .mcp.json missing", () => {
      expect(content.toLowerCase()).toContain("tool not found");
      expect(content).toContain("not_found");
      expect(content.toLowerCase()).toContain("atlas.json missing");
      expect(content.toLowerCase()).toContain(".mcp.json missing");
    });
  });

  // -------------------------------------------------------------------------
  // Tools introduction substrate (Q3.0.4 — 3 MCP tools)
  // -------------------------------------------------------------------------

  describe("tools introduction (Q3.0.4 substantive when-to-use guidance)", () => {
    it("enumerates get_symbol_context MCP tool with description", () => {
      expect(content).toMatch(/`get_symbol_context\([^)]*\)`/);
    });

    it("enumerates find_by_intent MCP tool with description", () => {
      expect(content).toMatch(/`find_by_intent\([^)]*\)`/);
    });

    it("enumerates impact_of_change MCP tool with description", () => {
      expect(content).toMatch(/`impact_of_change\([^)]*\)`/);
    });

    it("includes when-to-use guidance contrasting ContextAtlas vs primitive tools", () => {
      expect(content).toMatch(/ContextAtlas tools FIRST/);
      expect(content).toMatch(/[Pp]rimitive (Grep|tools)/);
    });

    it("includes cohort UX awareness: atlas-version + SHA-diff refresh", () => {
      expect(content.toLowerCase()).toContain("atlas-version");
      expect(content).toContain("SHA-diff");
    });

    it("references ADR-02 query-time-no-API-calls invariant", () => {
      expect(content).toContain("ADR-02");
      expect(content.toLowerCase()).toContain("query-time-no-api-calls");
    });
  });

  // -------------------------------------------------------------------------
  // Voice register (Q3.0.6 Option α 2nd person imperative)
  // -------------------------------------------------------------------------

  describe("voice register (Q3.0.6 Option α 2nd person imperative)", () => {
    it("uses 2nd person voice at SKILL opening (matches v0.7 SKILL.md precedent)", () => {
      // V0.7 /index-atlas + /generate-adrs SKILL.md precedent: 2nd person
      // voice register established at SKILL opening (e.g., "You're running
      // ContextAtlas extraction..."); subsequent sections use imperative
      // voice without explicit "you" prefix.
      const youreMatches = content.match(/\bYou(?:'re|\s+(?:are|invoked|want))/g);
      expect(youreMatches).not.toBeNull();
      expect(youreMatches!.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-references substrate (substantively the canonical bridge)
  // -------------------------------------------------------------------------

  describe("cross-references", () => {
    it("references ADR-02 + ADR-04 + ADR-09 + ADR-12 canonical surfaces", () => {
      expect(content).toContain("ADR-02");
      expect(content).toContain("ADR-04");
      expect(content).toContain("ADR-09");
      expect(content).toContain("ADR-12");
    });

    it("references /index-atlas + /generate-adrs Skill substrates", () => {
      expect(content).toContain("/index-atlas");
      expect(content).toContain("/generate-adrs");
    });

    it("references README.md + CLAUDE.md canonical project surfaces", () => {
      expect(content).toContain("README.md");
      expect(content).toContain("CLAUDE.md");
    });
  });

  // -------------------------------------------------------------------------
  // Tool usage discipline (Q3.0.2 + Q3.0.3 substrate)
  // -------------------------------------------------------------------------

  describe("tool usage discipline", () => {
    it("references Read tool as canonical substrate access pattern", () => {
      expect(content).toContain("Read tool");
    });

    it("explicitly disallows Bash for this Skill workflow", () => {
      expect(content).toMatch(/Do NOT use Bash/i);
    });

    it("declares read-only workflow (no substrate modifications)", () => {
      expect(content.toLowerCase()).toMatch(
        /read-only|do not modify the atlas/,
      );
    });
  });
});
