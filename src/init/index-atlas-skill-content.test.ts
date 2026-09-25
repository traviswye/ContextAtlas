/**
 * /index-atlas SKILL.md content pins for v1.2 Phase 2 (F-5 canonical
 * commit key; lead decision L-12). The skill ships in the npm package
 * (`.claude/skills/` is in package.json `files`) and `contextatlas init`
 * copies it into user repos, so what it tells the agent to write is part
 * of the atlas contract:
 *
 *   - commits are keyed `commit:<sha>` (the manifest's `source_key`) for
 *     both the `source_shas` key and the claim `source_path`, and the
 *     refresh check still accepts a legacy bare-sha key;
 *   - the refresh "Deleted sources" rule never drops commit keys,
 *     docs-bucket prose keys or zero-docstring keys — only sources that
 *     are really gone;
 *   - streams disabled by `extraction.streams` stay frozen;
 *   - stale text (dead line references, the cost_usd contradiction, the
 *     over-broad validate-extraction description) stays fixed.
 *
 * Precedent: `prime-atlas-skill-content.test.ts`.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SKILL_PATH = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".claude",
  "skills",
  "index-atlas",
  "SKILL.md",
);

const content = readFileSync(SKILL_PATH, "utf8");

/**
 * Text of the section that starts at the first line equal to `heading`
 * and runs to the next heading of the same or a higher level.
 */
function section(heading: string): string {
  const lines = content.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const level = /^#+/.exec(heading)?.[0].length ?? 0;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#+)\s/.exec(lines[i] ?? "");
    if (m && (m[1]?.length ?? 0) <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** Numbered refresh step `n.` inside the refresh section. */
function refreshStep(n: number): string {
  const refresh = section(
    "## Refresh-aware workflow (cold-start vs incremental refresh)",
  );
  const start = refresh.indexOf(`\n${n}. `);
  if (start < 0) throw new Error(`refresh step ${n} not found`);
  const next = refresh.indexOf(`\n${n + 1}. `, start + 1);
  return refresh.slice(start, next < 0 ? undefined : next);
}

interface ExampleAtlas {
  source_shas: Record<string, string>;
  claims: Array<{ source: string; source_path: string; source_sha: string }>;
}

function exampleAtlas(): ExampleAtlas {
  const schema = section(
    "## Canonical atlas schema (v1.4) — your output MUST match this",
  );
  const m = /```json\n([\s\S]*?)\n```/.exec(schema);
  if (!m?.[1]) throw new Error("no json example in the schema section");
  return JSON.parse(m[1]) as ExampleAtlas;
}

const SHA40 = /^[0-9a-f]{40}$/;

describe("/index-atlas SKILL.md — canonical commit key (F-5)", () => {
  it("the schema example keys its commit as commit:<sha> with a real 40-hex sha", () => {
    const atlas = exampleAtlas();
    const commitKeys = Object.keys(atlas.source_shas).filter((k) =>
      k.startsWith("commit:"),
    );
    expect(commitKeys).toHaveLength(1);
    const sha = commitKeys[0]!.slice("commit:".length);
    expect(sha).toMatch(SHA40);
    expect(atlas.source_shas[commitKeys[0]!]).toBe(sha);
    expect(Object.keys(atlas.source_shas).some((k) => SHA40.test(k))).toBe(
      false,
    );
  });

  it("the schema example's commit claim uses source_path == source == commit:<sha>", () => {
    const atlas = exampleAtlas();
    const commitClaims = atlas.claims.filter((c) =>
      c.source.startsWith("commit:"),
    );
    expect(commitClaims).toHaveLength(1);
    const claim = commitClaims[0]!;
    expect(claim.source_path).toBe(claim.source);
    expect(atlas.source_shas[claim.source_path]).toBe(claim.source_sha);
  });

  it("Phase B step 3 writes the manifest's source_key, never the bare sha, as source_path", () => {
    const step3 = section("### Phase B step 3 — Stream C commit-message extraction");
    expect(step3).toContain("source_path: commit.source_key");
    expect(step3).not.toMatch(/source_path: commit\.sha\b/);
  });

  it("Phase B step 4 keys each extracted commit by source_key", () => {
    const step4 = section("### Phase B step 4 — Aggregate + write atlas.json");
    expect(step4).toContain("commit.source_key");
  });

  it("the refresh check accepts both the canonical and the legacy bare-sha key", () => {
    const step = refreshStep(3);
    expect(step).toContain("commit.source_key");
    expect(step).toMatch(/bare/);
    expect(step).toContain("commit.sha");
  });
});

describe("/index-atlas SKILL.md — refresh Deleted-sources rule (L-12 ii)", () => {
  const step = refreshStep(4);

  it("never drops commit keys", () => {
    expect(step).toMatch(/[Cc]ommit keys[^\n]*\n?[^\n]*NEVER/);
  });

  it("never drops docs-bucket prose keys or zero-docstring keys", () => {
    expect(step).toMatch(/docs-bucket/);
    expect(step).toMatch(/no docstrings|zero-docstring/);
    expect(step).toMatch(/NEVER/);
  });

  it("drops only sources that are really gone, not keys the manifest merely omits", () => {
    expect(step).toMatch(/no longer exists/);
    expect(step).not.toMatch(
      /for any key in `baseline\.source_shas`\s+that does NOT appear in the current manifest/,
    );
  });

  it("keeps a disabled stream's keys and claims frozen", () => {
    expect(content).toContain("disabled_streams");
    expect(step).toContain("disabled_streams");
  });

  it("recognises ADR keys the way they are stored, not by an `adrs.path` prefix (review round 2.2)", () => {
    // Keys are relative to source_root, or to the ADR directory in the
    // ADR-08 layout: a renamed ADR's old key must still read as an ADR key.
    expect(step).not.toMatch(/\*\*ADR keys\*\* \(paths under `adrs\.path`/);
    expect(step).toMatch(/NOT always a\s+path starting with `adrs\.path`/);
    expect(step).toMatch(/relative to the manifest's\s+`source_root`/);
    expect(step).toMatch(/relative to the ADR directory\s+itself/);
    expect(step).toMatch(/just `ADR-03-x\.md`/);
    expect(step).toMatch(/matches a `docs\.include` glob is a\s+docs-bucket page/);
  });
});

describe("/index-atlas SKILL.md — refresh keeps preserved links", () => {
  it("preserved baseline claims keep their symbol_ids and symbol_candidates", () => {
    const step4 = section("### Phase B step 4 — Aggregate + write atlas.json");
    expect(step4).toMatch(/[Pp]reserved[^.]*symbol_ids/);
  });
});

describe("/index-atlas SKILL.md — stale text fixed (brief E1)", () => {
  it("no dead pipeline.ts line references", () => {
    expect(content).not.toMatch(/pipeline\.ts:\d+/);
    expect(content).not.toContain("writeDocstringClaim");
  });

  it("does not tell the agent to record cost_usd / cost_model in atlas.json", () => {
    const cost = section("## Cost model");
    expect(cost).not.toMatch(/written to atlas\.json/);
    expect(cost).toMatch(/non-canonical|Do NOT/);
  });

  it("describes validate-extraction coverage as ADR-shaped keys only", () => {
    expect(content).not.toMatch(
      /cross-checks\s+that every source_shas entry has at least one matching\s+claim/,
    );
    const gate = section(
      "### Phase C step 2 — MANDATORY validate-extraction gate (v0.7.1)",
    );
    expect(gate).not.toMatch(/every entry in `source_shas` has ≥ 1 claim/);
    expect(gate).toMatch(/\.md|\.rst/);
  });
});

describe("/index-atlas SKILL.md — review fixes (v1.2 Phase 2)", () => {
  it("Phase B step 3's refresh filter names both key forms, not the bare sha alone", () => {
    const step3 = section("### Phase B step 3 — Stream C commit-message extraction");
    expect(step3).not.toMatch(/only commits whose `sha` is not in\s+baseline source_shas/);
    const intro = step3.slice(0, step3.indexOf("1. "));
    expect(intro).toContain("commit.source_key");
    expect(intro).toContain("commit.sha");
  });

  it("a refresh writes `symbols: []` like a cold start and keeps every preserved `symbol_ids` (lead decision F2)", () => {
    const invariants = section("### Schema invariants (MANDATORY)");
    expect(invariants).toMatch(/`symbols`: an empty array, on a cold start and on a refresh\s+alike/);
    expect(invariants).toMatch(/even though `symbols` is `\[\]`\. NEVER empty them/);
    expect(invariants).not.toMatch(/too large to re-write/);
    expect(invariants).not.toMatch(/carried forward\s+unchanged, so every id/);
    const step4 = section("### Phase B step 4 — Aggregate + write atlas.json");
    expect(step4).toMatch(/`symbols: \[\]`, cold start and refresh alike/);
    expect(step4).toMatch(/Write `symbols: \[\]` \(cold\s+start and refresh\)/);
    expect(step4).not.toMatch(/too large to re-write/);
    expect(step4).not.toMatch(/baseline[^.]*`symbols`[^.]*unchanged/);
    expect(step4).not.toMatch(/Leave `symbols: \[\]`, and/);
  });

  it("the Deleted-sources rule drops a deleted source file's key even while docstring is disabled (as the CLI does)", () => {
    const step = refreshStep(4);
    const deletedFile = step.indexOf("no longer exists");
    const disabled = step.indexOf("disabled_streams");
    expect(deletedFile).toBeGreaterThanOrEqual(0);
    expect(disabled).toBeGreaterThanOrEqual(0);
    // The gone-file rule comes first, so it wins for a disabled stream.
    expect(deletedFile).toBeLessThan(disabled);
    expect(content).not.toMatch(/frozen, as `contextatlas index` does\./);
  });

  it("accepts manifest_version 1 and 2 (2 = some stream disabled)", () => {
    const phaseA = section("### Phase A workflow steps");
    expect(phaseA).toMatch(/manifest_version: "1"` or `"2"`|manifest_version` is `"1"` or `"2"`/);
    const failures = section("## Failure modes");
    expect(failures).toMatch(/"1"[^\n]*"2"|"2"[^\n]*"1"/);
  });

  it("a refresh carries the baseline's extracted_at_sha and git_commits forward (review round 2)", () => {
    const invariants = section("### Schema invariants (MANDATORY)");
    const topLevel = invariants.slice(0, invariants.indexOf("- `version`"));
    expect(topLevel).toMatch(/[Rr]efresh/);
    expect(topLevel).toContain("`extracted_at_sha`");
    expect(topLevel).toContain("`git_commits`");
    expect(topLevel).toMatch(/forward unchanged/);
    const step4 = section("### Phase B step 4 — Aggregate + write atlas.json");
    expect(step4).toContain("`extracted_at_sha`");
    expect(step4).toContain("`git_commits`");
  });

  it("the dangling-link WARNING is repaired by resolve-symbols, never by emptying symbol_ids (review round 2)", () => {
    const step1 = section("### Phase C step 1 — MANDATORY validate-atlas gate");
    expect(step1).toMatch(/WARNING/);
    expect(step1).toMatch(/resolve-symbols/);
    expect(step1).toMatch(/Do NOT empty/);
    const step3 = section("### Phase C step 3 — MANDATORY resolve-symbols invocation");
    expect(step3).toMatch(/re-invoke `contextatlas validate-atlas`/);
    const invariants = section("### Schema invariants (MANDATORY)");
    expect(invariants).toMatch(/NEVER empty them/);
    expect(content).not.toMatch(/give those claims `symbol_ids: \[\]`/);
  });

  it("a refresh runs resolve-symbols right after validate-atlas, before validate-extraction", () => {
    const step1 = section("### Phase C step 1 — MANDATORY validate-atlas gate");
    // The unloadable atlas is repaired before the gate that can loop.
    expect(step1).toMatch(/expected on every refresh/);
    expect(step1).toMatch(/repair it now, before step 2/);
    expect(step1).toMatch(/```bash\ncontextatlas resolve-symbols\ncontextatlas validate-atlas\n```/);
    // resolve-symbols no longer stops on unverifiable links or reads HEAD.
    expect(step1).not.toMatch(/exits 1/);
    expect(content).not.toMatch(/committed at HEAD/);
    const invariants = section("### Schema invariants (MANDATORY)");
    expect(invariants).toMatch(/run resolve-symbols right away \(Phase C step 1\),\s+before validate-extraction/);
    expect(invariants).not.toMatch(/never stop before Phase C step 3/);
    const step3 = section("### Phase C step 3 — MANDATORY resolve-symbols invocation");
    expect(step3).not.toMatch(/exits 1/);
    const failures = section("## Failure modes");
    expect(failures).toMatch(/Run `contextatlas resolve-symbols` right away, before\s+validate-extraction/);
    expect(failures).not.toMatch(/Continue to Phase C step 3, which repairs it/);
    expect(failures).not.toMatch(/could not verify/);
  });

  it("failure modes document the `symbols: []` loss: links into files resolve-symbols cannot list are dropped", () => {
    const failures = section("## Failure modes");
    // Keyed on what resolve-symbols prints on a `symbols: []` refresh: it
    // has no prior symbols there, so no "unverified" count to wait for.
    expect(failures).toMatch(/reports dropped links, orphaned\s+claims, or files it could not list/);
    expect(failures).toMatch(/"could not be\s+listed"/);
    expect(failures).not.toMatch(/next to unverified files/);
    const step1 = section("### Phase C step 1 — MANDATORY validate-atlas gate");
    expect(step1).toMatch(/if it dropped links, orphaned claims, or\s+could not list files, see "Failure modes"/);
    expect(step1).not.toMatch(/next\s+to unverified files/);
    expect(failures).toMatch(/only\s+the claim's `symbol_candidates` can restore it/);
    expect(failures).toMatch(/`contextatlas index` docstring provenance links/);
    expect(failures).toMatch(/frontmatter-fallback links/);
    expect(failures).toMatch(/git checkout -- <atlas\.path>/);
  });

  it("Phase C step 2 checks only ADRs the prose walk lists; kept docs pages and gone keys are exempt and must not be dropped (lead decision F1)", () => {
    const gate = section(
      "### Phase C step 2 — MANDATORY validate-extraction gate (v0.7.1)",
    );
    expect(gate).toMatch(/checks only ADRs the current prose walk lists/);
    expect(gate).toMatch(/Docs-bucket pages/);
    expect(gate).toMatch(/keys whose file is gone are not checked/);
    expect(gate).toMatch(/dropping a deleted ADR's\s+key is refresh rule 4's job/);
    expect(gate).toMatch(/Never drop kept keys or claims/);
    expect(gate).not.toMatch(/missing file whose path names an ADR/);
    expect(gate).not.toMatch(/ADR-08\s+layout only/);
  });

  it("Phase C step 5 gives one remedy for both modes: the server imports atlas.json only into an empty cache", () => {
    const step5 = section(
      "### Phase C step 5 — Tell the user how the MCP server picks up the refresh",
    );
    expect(step5).toMatch(/does not reload it/);
    expect(step5).toMatch(/imports `atlas\.json` only into an empty local\s+cache/);
    expect(step5).toMatch(/closes Claude Code \(or\s+disconnects `contextatlas` in `\/mcp`\)/);
    expect(step5).toMatch(/deletes the local cache file/);
    expect(step5).toMatch(/while no `contextatlas index` is running/);
    expect(step5).toMatch(/with\s+no API calls/);
    expect(step5).toMatch(/With `atlas\.committed: true` nothing is lost/);
    expect(step5).toMatch(/`atlas\.committed: false` this discards anything only that cache holds/);
    expect(step5).toMatch(/Do not delete it yourself/);
    // The server no longer re-imports a changed atlas.json on restart.
    expect(step5).not.toMatch(/At startup the server imports an `atlas\.json` that differs/);
  });
});
