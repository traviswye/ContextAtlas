import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { log } from "../mcp/logger.js";
import {
  buildSymbolInventory,
  type SymbolInventory,
} from "./resolver.js";
import {
  insertClaim,
  listAllClaims,
  listClaimSymbolCandidates,
  listSourceShas,
  setSourceSha,
} from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "./../storage/db.js";
import { upsertSymbols } from "./../storage/symbols.js";
import {
  extractCommitClaims,
  extractCommitMessagesForRepo,
} from "./commit-message-extractor.js";
import {
  createExtractionClient,
  ParseError,
  type ExtractionClient,
} from "./anthropic-client.js";

// Filter, git-log parsing and body-builder tests live in
// commit-log.test.ts (collection split out at v1.2 Phase 2).

// ---------------------------------------------------------------------------
// extractCommitMessagesForRepo orchestration (Step 4.3 + 4.4 + 4.5)
// ---------------------------------------------------------------------------

describe("extractCommitMessagesForRepo", () => {
  let tmp: string;
  let db: DatabaseInstance;
  let inventory: SymbolInventory;

  beforeEach(async () => {
    tmp = mkdtempSync(pathJoin(tmpdir(), "ca-cm-orch-"));
    spawnSync("git", ["init", "-q"], { cwd: tmp });
    mkdirSync(pathJoin(tmp, "src"), { recursive: true });
    db = openDatabase(":memory:");
    upsertSymbols(db, [
      {
        id: "sym:ts:src/widget.ts:WidgetService",
        name: "WidgetService",
        kind: "class",
        path: "src/widget.ts",
        line: 1,
        language: "typescript",
        fileSha: "sha-w",
      },
    ]);
    inventory = await buildSymbolInventory(new Map(), []);
    inventory.allSymbols.push({
      id: "sym:ts:src/widget.ts:WidgetService",
      name: "WidgetService",
      kind: "class",
      path: "src/widget.ts",
      line: 1,
      language: "typescript",
    });
    inventory.byName.set("WidgetService", [
      inventory.allSymbols[inventory.allSymbols.length - 1]!,
    ]);
  });
  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  function commit(subject: string, body = ""): void {
    writeFileSync(pathJoin(tmp, "stamp.txt"), `${Date.now()}-${Math.random()}`);
    spawnSync("git", ["add", "stamp.txt"], { cwd: tmp });
    const msg = body.length > 0 ? `${subject}\n\n${body}` : subject;
    spawnSync("git", ["commit", "-m", msg], {
      cwd: tmp,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Tester",
        GIT_AUTHOR_EMAIL: "tester@example.com",
        GIT_COMMITTER_NAME: "Tester",
        GIT_COMMITTER_EMAIL: "tester@example.com",
      },
    });
  }

  function makeStubClient(
    responder: (body: string) => ReturnType<ExtractionClient["extract"]>,
  ): ExtractionClient {
    return {
      async extract(body) {
        return responder(body);
      },
    };
  }

  it("filter+extract+resolve flow yields claims with resolved candidates", async () => {
    commit("design: introduce WidgetService", "Replaces legacy widget code.");
    commit("chore: bump deps"); // should be filtered out
    const client = makeStubClient(async (body) => ({
      result: {
        claims: [
          {
            symbol_candidates: ["WidgetService"],
            claim: "WidgetService replaces the legacy widget pipeline.",
            severity: "hard",
            rationale: body.slice(0, 30),
            excerpt: body.slice(0, 30),
          },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    }));
    const result = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      client,
    );
    expect(result.commitsTotal).toBe(2);
    expect(result.commitsFiltered).toBe(1);
    expect(result.commitsExtracted).toBe(1);
    expect(result.commitsSkippedIdempotent).toBe(0);
    expect(result.claimsWritten).toBe(1);
    expect(result.claimsWithSymbols).toBe(1);
    const claims = listAllClaims(db);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.source).toMatch(/^commit:[0-9a-f]{40}$/);
    expect(claims[0]!.symbolIds).toEqual([
      "sym:ts:src/widget.ts:WidgetService",
    ]);
  });

  it("idempotency: skips commits whose SHA already in source_shas", async () => {
    commit("design: thing");
    // Pre-seed source_shas as if the commit was already extracted.
    const log0 = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      makeStubClient(async () => ({
        result: { claims: [] },
        usage: { inputTokens: 50, outputTokens: 0 },
      })),
    );
    expect(log0.commitsExtracted).toBe(1);

    // Re-run: should skip.
    let calls = 0;
    const log1 = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      makeStubClient(async () => {
        calls++;
        return {
          result: { claims: [] },
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      }),
    );
    expect(calls).toBe(0);
    expect(log1.commitsExtracted).toBe(0);
    expect(log1.commitsSkippedIdempotent).toBe(1);
  });

  it("captures extraction-client errors per-commit without halting", async () => {
    commit("design: one");
    commit("arch: two");
    let n = 0;
    const client = makeStubClient(async () => {
      n++;
      if (n === 1) throw new Error("simulated 500");
      return {
        result: { claims: [] },
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    });
    const result = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      client,
    );
    expect(result.commitsFiltered).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toMatch(/simulated 500/);
    // Second commit still extracted despite first failing.
    expect(result.commitsExtracted).toBe(1);
  });

  it("user filter augmentation routes additional commits to extraction", async () => {
    commit("internal-tag: rework auth pipeline"); // misses default filter
    const client = makeStubClient(async () => ({
      result: { claims: [] },
      usage: { inputTokens: 0, outputTokens: 0 },
    }));
    const without = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      client,
    );
    expect(without.commitsFiltered).toBe(0);

    // Reset source_shas so the commit isn't skipped on second run.
    db.exec("DELETE FROM source_shas");
    const withFilter = await extractCommitMessagesForRepo(
      db,
      tmp,
      { extraction: { commitMessageFilter: ["^internal-tag:"] } },
      inventory,
      client,
    );
    expect(withFilter.commitsFiltered).toBe(1);
    expect(withFilter.commitsExtracted).toBe(1);
  });

  // -------------------------------------------------------------------------
  // v1.2 Phase 2: canonical keys (F-5 / L-2), per-commit transaction,
  // null-result policy (L-10 iii), additive counters.
  // -------------------------------------------------------------------------

  function headSha(): string {
    const r = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: tmp,
      encoding: "utf8",
    });
    if (r.status !== 0) throw new Error(`git rev-parse: ${r.stderr}`);
    return r.stdout.trim();
  }

  const oneClaim = (
    candidates: string[],
    text = "WidgetService is canonical.",
  ): ExtractionClient =>
    makeStubClient(async () => ({
      result: {
        claims: [
          {
            symbol_candidates: candidates,
            claim: text,
            severity: "soft",
            rationale: "r",
            excerpt: "e",
          },
        ],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    }));

  const claimTextsFor = (sha: string): string[] =>
    listAllClaims(db)
      .filter((c) => c.sourcePath === `commit:${sha}` || c.sourcePath === sha)
      .map((c) => c.claim)
      .sort();

  it("writes the canonical `commit:<sha>` key and source_path (F-5)", async () => {
    commit("design: introduce WidgetService");
    const sha = headSha();
    await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      oneClaim(["WidgetService"]),
    );
    expect(listSourceShas(db)).toEqual({ [`commit:${sha}`]: sha });
    const [claim] = listAllClaims(db);
    expect(claim!.source).toBe(`commit:${sha}`);
    expect(claim!.sourcePath).toBe(`commit:${sha}`);
    expect(claim!.sourceSha).toBe(sha);
  });

  it("idempotence accepts a legacy bare-sha key (Skill form, pre-v1.2)", async () => {
    commit("design: thing");
    const sha = headSha();
    setSourceSha(db, sha, sha);
    let calls = 0;
    const result = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      makeStubClient(async () => {
        calls++;
        return {
          result: { claims: [] },
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      }),
    );
    expect(calls).toBe(0);
    expect(result.commitsSkippedIdempotent).toBe(1);
    expect(result.commitsExtracted).toBe(0);
    expect(result.apiCalls).toBe(0);
  });

  it("re-extraction replaces the commit's claims in either key form (no duplicates)", async () => {
    commit("design: introduce WidgetService");
    const sha = headSha();
    // Stale, unkeyed claims in both forms (e.g. a key removed to force
    // a retry, or a Skill write that lost its key).
    const stale = (sourcePath: string): void => {
      insertClaim(db, {
        source: `commit:${sha}`,
        sourcePath,
        sourceSha: sha,
        severity: "context",
        claim: `stale@${sourcePath}`,
        symbolIds: [],
      });
    };
    stale(`commit:${sha}`);
    stale(sha);

    await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      oneClaim(["WidgetService"], "fresh-1"),
    );
    expect(claimTextsFor(sha)).toEqual(["fresh-1"]);
    expect(listSourceShas(db)).toEqual({ [`commit:${sha}`]: sha });

    // Losing the key and extracting again still yields one claim set.
    db.exec("DELETE FROM source_shas");
    await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      oneClaim(["WidgetService"], "fresh-2"),
    );
    expect(claimTextsFor(sha)).toEqual(["fresh-2"]);
    expect(listSourceShas(db)).toEqual({ [`commit:${sha}`]: sha });
  });

  it("a null result pins the key with zero claims and warns, so it is not re-billed", async () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    try {
      commit("design: produces an unparseable response");
      const sha = headSha();
      const result = await extractCommitMessagesForRepo(
        db,
        tmp,
        {},
        inventory,
        makeStubClient(async () => ({
          result: null,
          usage: { inputTokens: 40, outputTokens: 7 },
        })),
      );
      expect(result.commitsExtracted).toBe(1);
      expect(result.commitsNullResult).toBe(1);
      expect(result.claimsWritten).toBe(0);
      expect(result.errors).toEqual([]);
      // The call was paid for; its usage is counted.
      expect(result.totalUsage).toEqual({ inputTokens: 40, outputTokens: 7 });
      expect(listSourceShas(db)).toEqual({ [`commit:${sha}`]: sha });
      expect(listAllClaims(db)).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
      const [message] = warn.mock.calls[0]!;
      expect(message).toMatch(/no parseable result/);
      expect(message).toContain(`commit:${sha}`);
      expect(message).toMatch(/source_shas/);

      let calls = 0;
      const rerun = await extractCommitMessagesForRepo(
        db,
        tmp,
        {},
        inventory,
        makeStubClient(async () => {
          calls++;
          return { result: null, usage: { inputTokens: 0, outputTokens: 0 } };
        }),
      );
      expect(calls).toBe(0);
      expect(rerun.commitsSkippedIdempotent).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("malformed JSON from the real client (ParseError) is pinned like a null result, with its usage counted (L-10 iii)", async () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    try {
      commit("design: produces fenced JSON");
      const sha = headSha();
      let sdkCalls = 0;
      const anthropic = {
        messages: {
          create: async () => {
            sdkCalls++;
            return {
              stop_reason: "end_turn",
              content: [{ type: "text", text: '```json\n{"claims":[]}\n```' }],
              usage: { input_tokens: 1500, output_tokens: 20 },
            };
          },
        },
      } as unknown as Anthropic;
      const client = createExtractionClient({ anthropic, sleep: async () => {} });

      const first = await extractCommitMessagesForRepo(db, tmp, {}, inventory, client);
      expect(first.errors).toEqual([]);
      expect(first.commitsNullResult).toBe(1);
      expect(first.commitsExtracted).toBe(1);
      expect(first.totalUsage).toEqual({ inputTokens: 1500, outputTokens: 20 });
      expect(listSourceShas(db)).toEqual({ [`commit:${sha}`]: sha });
      const messages = warn.mock.calls.map(([m]) => String(m));
      expect(messages.some((m) => m.includes(`commit:${sha}`) && /source_shas/.test(m))).toBe(true);

      // Pinned: the next run does not bill it again.
      const second = await extractCommitMessagesForRepo(db, tmp, {}, inventory, client);
      expect(second.commitsSkippedIdempotent).toBe(1);
      expect(sdkCalls).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("extractCommitClaims reports a ParseError as null-result with the call's usage", async () => {
    commit("design: another unparseable one");
    const sha = headSha();
    const client: ExtractionClient = {
      async extract() {
        throw new ParseError("json-parse", "", "malformed", {
          inputTokens: 9,
          outputTokens: 4,
        });
      },
    };
    const outcome = await extractCommitClaims(
      db,
      { sha, subject: "design: another unparseable one", body: "", author: "t", date: "d" },
      inventory,
      client,
    );
    expect(outcome).toEqual({
      status: "null-result",
      usage: { inputTokens: 9, outputTokens: 4 },
    });
    expect(listSourceShas(db)).toEqual({ [`commit:${sha}`]: sha });
  });

  it("a thrown client error leaves the commit unkeyed so the next run retries it", async () => {
    commit("design: flaky");
    const sha = headSha();
    const failed = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      makeStubClient(async () => {
        throw new Error("simulated 529");
      }),
    );
    expect(failed.errors).toEqual([
      { sha, error: expect.stringMatching(/simulated 529/) },
    ]);
    expect(failed.apiCalls).toBe(1);
    expect(listSourceShas(db)).toEqual({});

    const retried = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      oneClaim(["WidgetService"]),
    );
    expect(retried.commitsExtracted).toBe(1);
    expect(listSourceShas(db)).toEqual({ [`commit:${sha}`]: sha });
  });

  it("reports apiCalls (attempts, including failures) and unresolvedCandidates", async () => {
    commit("design: one");
    commit("arch: two");
    let n = 0;
    const result = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      makeStubClient(async () => {
        n++;
        if (n === 1) throw new Error("simulated 500");
        return {
          result: {
            claims: [
              {
                symbol_candidates: ["WidgetService", "NoSuchSymbol"],
                claim: "c",
                severity: "hard",
                rationale: "",
                excerpt: "",
              },
            ],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      }),
    );
    expect(result.apiCalls).toBe(2);
    expect(result.commitsExtracted).toBe(1);
    expect(result.unresolvedCandidates).toBe(1);
    expect(result.claimsWithSymbols).toBe(1);
    expect(result.commitsNullResult).toBe(0);
  });

  it("stores each commit atomically: a failed write keeps the prior state and records an error", async () => {
    commit("design: introduce WidgetService");
    const sha = headSha();
    insertClaim(db, {
      source: `commit:${sha}`,
      sourcePath: `commit:${sha}`,
      sourceSha: sha,
      severity: "context",
      claim: "stale",
      symbolIds: [],
    });
    // A symbol the inventory knows but the database does not: linking
    // a claim to it violates the claim_symbols foreign key mid-write.
    const ghost = {
      id: "sym:ts:src/ghost.ts:Ghost",
      name: "Ghost",
      kind: "class" as const,
      path: "src/ghost.ts",
      line: 1,
      language: "typescript" as const,
    };
    inventory.allSymbols.push(ghost);
    inventory.byName.set("Ghost", [ghost]);

    const result = await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      makeStubClient(async () => ({
        result: {
          claims: [
            {
              symbol_candidates: ["WidgetService"],
              claim: "first",
              severity: "soft",
              rationale: "",
              excerpt: "",
            },
            {
              symbol_candidates: ["Ghost"],
              claim: "second",
              severity: "soft",
              rationale: "",
              excerpt: "",
            },
          ],
        },
        usage: { inputTokens: 3, outputTokens: 3 },
      })),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.sha).toBe(sha);
    expect(result.errors[0]!.error).toMatch(/store/i);
    expect(result.claimsWritten).toBe(0);
    // Rolled back: the stale claim is untouched and the commit is not
    // keyed, so the next run retries it.
    expect(claimTextsFor(sha)).toEqual(["stale"]);
    expect(listSourceShas(db)).toEqual({});
  });

  it("F-7: stores the model's raw symbol_candidates on commit claims", async () => {
    commit("design: introduce WidgetService");
    await extractCommitMessagesForRepo(
      db,
      tmp,
      {},
      inventory,
      makeStubClient(async () => ({
        result: {
          claims: [
            {
              symbol_candidates: ["NoSuchSymbol", "WidgetService"],
              claim: "named",
              severity: "soft",
              rationale: "",
              excerpt: "",
            },
            {
              symbol_candidates: [],
              claim: "unnamed",
              severity: "soft",
              rationale: "",
              excerpt: "",
            },
          ],
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      })),
    );
    const byId = listClaimSymbolCandidates(db);
    const byText = new Map(
      listAllClaims(db).map((c) => [c.claim, byId.get(c.id)] as const),
    );
    expect(byText.get("named")).toEqual(["NoSuchSymbol", "WidgetService"]);
    expect(byText.get("unnamed")).toBeUndefined();
    expect(byText.size).toBe(2);
  });
});

