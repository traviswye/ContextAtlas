/**
 * Docstring stream core (v1.2 Phase 2, lead decision L-10 i).
 *
 * A file's docstring claims are replaced, and its SHA pinned, only when
 * every step for that file succeeded; any read error, thrown call, null
 * result or failed write leaves the previous claims and key exactly as
 * they were, so the next run retries the whole file.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getSourceSha,
  insertClaim,
  listAllClaims,
  listClaimSymbolCandidates,
  setSourceSha,
} from "../storage/claims.js";
import { type DatabaseInstance, openDatabase } from "../storage/db.js";
import { upsertSymbols } from "../storage/symbols.js";
import type {
  LanguageAdapter,
  Symbol as AtlasSymbol,
  SymbolId,
} from "../types.js";

import { ParseError, type ExtractionClient } from "./anthropic-client.js";
import { isExportedSymbol, type FileDocstrings } from "./docstring-read.js";
import {
  extractDocstringFile,
  extractDocstringsForFile,
} from "./docstring-stream.js";
import * as pipeline from "./pipeline.js";
import type { ExtractedClaim } from "./prompt.js";
import type { SymbolInventory } from "./resolver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REL = "src/lib.go";

function sym(name: string, path = REL): AtlasSymbol {
  return {
    id: `sym:go:${path}:${name}`,
    name,
    kind: "function",
    path,
    line: 1,
    language: "go",
    fileSha: "sha-any",
  };
}

function inventoryOf(symbols: readonly AtlasSymbol[]): SymbolInventory {
  const byName = new Map<string, AtlasSymbol[]>();
  for (const s of symbols) {
    const list = byName.get(s.name) ?? [];
    list.push(s);
    byName.set(s.name, list);
  }
  return { byName, allSymbols: [...symbols] };
}

type DocstringBehaviour = string | null | Error;

/** Adapter serving docstrings by symbol id; records getDocstring calls. */
function stubAdapter(docstrings: ReadonlyMap<SymbolId, DocstringBehaviour>): {
  adapter: LanguageAdapter;
  docstringCalls: SymbolId[];
} {
  const docstringCalls: SymbolId[] = [];
  const adapter: LanguageAdapter = {
    language: "go",
    extensions: [".go"],
    async initialize() {},
    async shutdown() {},
    async listSymbols() {
      throw new Error("the core must not re-list symbols");
    },
    async getSymbolDetails() {
      return null;
    },
    async findReferences() {
      return [];
    },
    async getDiagnostics() {
      return [];
    },
    async getTypeInfo() {
      return { extends: [], implements: [], usedByTypes: [] };
    },
    async getDocstring(id: SymbolId) {
      docstringCalls.push(id);
      const d = docstrings.get(id);
      if (d instanceof Error) throw d;
      return d ?? null;
    },
  };
  return { adapter, docstringCalls };
}

type Response = readonly ExtractedClaim[] | null | Error;

/**
 * Body-keyed client: claims, a null result, or a throw per body. An
 * unexpected body throws, so a stray call can never pass silently.
 */
function stubClient(responses: ReadonlyMap<string, Response>): {
  client: ExtractionClient;
  bodies: string[];
} {
  const bodies: string[] = [];
  const client: ExtractionClient = {
    async extract(body: string) {
      bodies.push(body);
      const r = responses.get(body);
      if (r === undefined) throw new Error(`unexpected body: ${body}`);
      if (r instanceof Error) throw r;
      return {
        result: r === null ? null : { claims: [...r] },
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    },
  };
  return { client, bodies };
}

function claim(text: string, candidates: string[] = []): ExtractedClaim {
  return {
    symbol_candidates: candidates,
    claim: text,
    severity: "context",
    rationale: "r",
    excerpt: "e",
  };
}

const A = sym("FuncA");
const B = sym("FuncB");
const C = sym("FuncC");
const LOGGER = sym("Logger", "src/log.go");

/** Seed a previous extraction of REL: one claim linked to A, key sha-old. */
function seedOld(db: DatabaseInstance, symbolIds: SymbolId[] = [A.id]): void {
  insertClaim(db, {
    source: `docstring:${REL}`,
    sourcePath: REL,
    sourceSha: "sha-old",
    severity: "context",
    claim: "old claim",
    symbolIds,
  });
  setSourceSha(db, REL, "sha-old");
}

function claimsFor(db: DatabaseInstance, path: string) {
  return listAllClaims(db).filter((c) => c.sourcePath === path);
}

function expectUnchanged(db: DatabaseInstance): void {
  const claims = claimsFor(db, REL);
  expect(claims.map((c) => c.claim)).toEqual(["old claim"]);
  expect(getSourceSha(db, REL)).toBe("sha-old");
}

// ---------------------------------------------------------------------------
// extractDocstringFile — the per-file core
// ---------------------------------------------------------------------------

describe("extractDocstringFile", () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = openDatabase(":memory:");
    upsertSymbols(db, [A, B, C, LOGGER]);
  });

  afterEach(() => {
    db.close();
  });

  it("on success replaces the file's claims and pins the new SHA", async () => {
    seedOld(db);
    const { adapter } = stubAdapter(
      new Map<SymbolId, DocstringBehaviour>([
        [A.id, "A uses Logger."],
        [B.id, "B doc."],
      ]),
    );
    const { client, bodies } = stubClient(
      new Map<string, Response>([
        ["A uses Logger.", [claim("A logs via Logger", ["Logger", "Ghost"])]],
        ["B doc.", [claim("B is documented")]],
      ]),
    );

    const outcome = await extractDocstringFile(
      db,
      adapter,
      { relPath: REL, sha: "sha-new", symbols: [A, B] },
      inventoryOf([A, B, LOGGER]),
      client,
    );

    expect(outcome.status).toBe("stored");
    if (outcome.status !== "stored") return;
    expect(outcome.claimsWritten).toBe(2);
    expect(outcome.unresolvedCandidates).toBe(1); // Ghost
    expect(outcome.apiCalls).toBe(2);
    expect(outcome.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
    expect(bodies).toEqual(["A uses Logger.", "B doc."]);

    const claims = claimsFor(db, REL);
    expect(claims.map((c) => c.claim).sort()).toEqual([
      "A logs via Logger",
      "B is documented",
    ]);
    const aClaim = claims.find((c) => c.claim === "A logs via Logger")!;
    // Channel A (provenance) + Channel B (cross-reference).
    expect([...aClaim.symbolIds].sort()).toEqual([A.id, LOGGER.id].sort());
    expect(aClaim.source).toBe(`docstring:${REL}`);
    expect(aClaim.sourceSha).toBe("sha-new");
    // F-7: raw candidates kept verbatim for export.
    expect(listClaimSymbolCandidates(db).get(aClaim.id)).toEqual([
      "Logger",
      "Ghost",
    ]);
    expect(getSourceSha(db, REL)).toBe("sha-new");
  });

  it("a thrown call keeps the old claims and key and stops calling for that file", async () => {
    seedOld(db);
    const { adapter } = stubAdapter(
      new Map<SymbolId, DocstringBehaviour>([
        [A.id, "A doc."],
        [B.id, "B doc."],
        [C.id, "C doc."],
      ]),
    );
    const { client, bodies } = stubClient(
      new Map<string, Response>([
        ["A doc.", [claim("A claim")]],
        ["B doc.", new Error("529 overloaded")],
        ["C doc.", [claim("C claim")]],
      ]),
    );

    const outcome = await extractDocstringFile(
      db,
      adapter,
      { relPath: REL, sha: "sha-new", symbols: [A, B, C] },
      inventoryOf([A, B, C]),
      client,
    );

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.phase).toBe("extract");
    // C is never paid for: the file is retried whole next run anyway.
    expect(bodies).toEqual(["A doc.", "B doc."]);
    expect(outcome.apiCalls).toBe(2);
    expect(outcome.failedCalls).toBe(1);
    expect(outcome.unparseableCalls).toBe(0);
    // A thrown call's usage is unknown; only A's is counted.
    expect(outcome.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0]!.symbolId).toBe(B.id);
    expect(outcome.errors[0]!.error).toMatch(/529 overloaded/);
    expect(outcome.errors[0]!.error).toContain(REL);
    expect(outcome.errors[0]!.error).toMatch(/next run retries/);
    expectUnchanged(db);
  });

  it("a null result keeps the old claims and key and is reported", async () => {
    seedOld(db);
    const { adapter } = stubAdapter(
      new Map<SymbolId, DocstringBehaviour>([
        [A.id, "A doc."],
        [B.id, "B doc."],
      ]),
    );
    const { client, bodies } = stubClient(
      new Map<string, Response>([
        ["A doc.", null],
        ["B doc.", [claim("B claim")]],
      ]),
    );

    const outcome = await extractDocstringFile(
      db,
      adapter,
      { relPath: REL, sha: "sha-new", symbols: [A, B] },
      inventoryOf([A, B]),
      client,
    );

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.phase).toBe("extract");
    expect(bodies).toEqual(["A doc."]);
    // The API answered: an unparseable result is per-source noise, not a
    // failed call for the stream-level (L-10 ii) check.
    expect(outcome.failedCalls).toBe(0);
    expect(outcome.unparseableCalls).toBe(1);
    // A null result still consumed tokens.
    expect(outcome.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(outcome.errors[0]!.symbolId).toBe(A.id);
    expect(outcome.errors[0]!.error).toMatch(/no parseable result/);
    expectUnchanged(db);
  });

  it("malformed JSON (ParseError) is handled like a null result, with its usage counted", async () => {
    seedOld(db);
    const { adapter } = stubAdapter(
      new Map<SymbolId, DocstringBehaviour>([
        [A.id, "A doc."],
        [B.id, "B doc."],
      ]),
    );
    const bodies: string[] = [];
    const client: ExtractionClient = {
      async extract(body: string) {
        bodies.push(body);
        if (body === "A doc.") {
          return {
            result: { claims: [claim("A claim")] },
            usage: { inputTokens: 100, outputTokens: 50 },
          };
        }
        throw new ParseError("json-parse", "", "Model returned malformed JSON", {
          inputTokens: 30,
          outputTokens: 7,
        });
      },
    };

    const outcome = await extractDocstringFile(
      db,
      adapter,
      { relPath: REL, sha: "sha-new", symbols: [A, B] },
      inventoryOf([A, B]),
      client,
    );

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.phase).toBe("extract");
    expect(bodies).toEqual(["A doc.", "B doc."]);
    expect(outcome.apiCalls).toBe(2);
    expect(outcome.failedCalls).toBe(0);
    expect(outcome.unparseableCalls).toBe(1);
    // Both calls were billed, including the one that did not parse.
    expect(outcome.usage).toEqual({ inputTokens: 130, outputTokens: 57 });
    expect(outcome.errors[0]!.symbolId).toBe(B.id);
    expect(outcome.errors[0]!.error).toMatch(/malformed JSON/);
    expectUnchanged(db);
  });

  it("a file with no docstrings is keyed with zero claims, clearing old ones", async () => {
    seedOld(db);
    const { adapter } = stubAdapter(
      new Map<SymbolId, DocstringBehaviour>([[A.id, null]]),
    );
    const { client, bodies } = stubClient(new Map());

    const outcome = await extractDocstringFile(
      db,
      adapter,
      { relPath: REL, sha: "sha-new", symbols: [A] },
      inventoryOf([A]),
      client,
    );

    expect(outcome.status).toBe("stored");
    if (outcome.status !== "stored") return;
    expect(outcome.claimsWritten).toBe(0);
    expect(outcome.apiCalls).toBe(0);
    expect(bodies).toEqual([]);
    expect(claimsFor(db, REL)).toEqual([]);
    expect(getSourceSha(db, REL)).toBe("sha-new");
  });

  it("a file with no symbols at all is keyed too", async () => {
    const { adapter } = stubAdapter(new Map());
    const { client } = stubClient(new Map());

    const outcome = await extractDocstringFile(
      db,
      adapter,
      { relPath: "src/empty.go", sha: "sha-empty", symbols: [] },
      inventoryOf([]),
      client,
    );

    expect(outcome.status).toBe("stored");
    expect(getSourceSha(db, "src/empty.go")).toBe("sha-empty");
  });

  it("a docstring read error keeps the old claims and key and makes no call", async () => {
    seedOld(db);
    const { adapter } = stubAdapter(
      new Map<SymbolId, DocstringBehaviour>([
        [A.id, "A doc."],
        [B.id, new Error("hover timed out")],
      ]),
    );
    const { client, bodies } = stubClient(
      new Map<string, Response>([["A doc.", [claim("A claim")]]]),
    );

    const outcome = await extractDocstringFile(
      db,
      adapter,
      { relPath: REL, sha: "sha-new", symbols: [A, B] },
      inventoryOf([A, B]),
      client,
    );

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.phase).toBe("read");
    expect(outcome.apiCalls).toBe(0);
    expect(bodies).toEqual([]);
    expect(outcome.errors[0]!.symbolId).toBe(B.id);
    expect(outcome.errors[0]!.error).toMatch(/hover timed out/);
    expect(outcome.errors[0]!.error).toMatch(/next run retries/);
    expectUnchanged(db);
  });

  it("uses cached docstrings from the planning pre-pass without re-reading", async () => {
    const { adapter, docstringCalls } = stubAdapter(new Map());
    const cached: FileDocstrings = {
      symbolsProcessed: 1,
      symbolsExported: 1,
      entries: [{ symbolId: A.id, docstring: "cached A doc." }],
      errors: [],
    };
    const { client } = stubClient(
      new Map<string, Response>([["cached A doc.", [claim("A claim")]]]),
    );

    const outcome = await extractDocstringFile(
      db,
      adapter,
      { relPath: REL, sha: "sha-new", symbols: [A] },
      inventoryOf([A]),
      client,
      cached,
    );

    expect(outcome.status).toBe("stored");
    expect(outcome.docstrings).toBe(cached);
    expect(docstringCalls).toEqual([]);
    expect(claimsFor(db, REL).map((c) => c.claim)).toEqual(["A claim"]);
  });

  it("FK: a documented symbol missing from the symbols table fails before any call", async () => {
    const orphan = sym("NotUpserted");
    seedOld(db);
    const { adapter } = stubAdapter(
      new Map<SymbolId, DocstringBehaviour>([[orphan.id, "Orphan doc."]]),
    );
    const { client, bodies } = stubClient(
      new Map<string, Response>([["Orphan doc.", [claim("orphan claim")]]]),
    );

    const outcome = await extractDocstringFile(
      db,
      adapter,
      { relPath: REL, sha: "sha-new", symbols: [orphan] },
      inventoryOf([orphan]),
      client,
    );

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.phase).toBe("store");
    expect(outcome.apiCalls).toBe(0);
    expect(bodies).toEqual([]);
    expect(outcome.errors[0]!.symbolId).toBe(orphan.id);
    expect(outcome.errors[0]!.error).toMatch(/not in the symbols table/);
    expect(outcome.errors[0]!.error).toMatch(/upsertSymbols/);
    expectUnchanged(db);
  });

  it("FK: a write that fails mid-transaction is rolled back, keeping the old claims and key", async () => {
    // Ghost resolves through the inventory but was never upserted, so
    // linking it violates claim_symbols' foreign key after the delete
    // and the first inserts already ran inside the transaction.
    const ghost = sym("Ghost", "src/ghost.go");
    seedOld(db);
    const { adapter } = stubAdapter(
      new Map<SymbolId, DocstringBehaviour>([
        [A.id, "A doc."],
        [B.id, "B mentions Ghost."],
      ]),
    );
    const { client } = stubClient(
      new Map<string, Response>([
        ["A doc.", [claim("A claim")]],
        ["B mentions Ghost.", [claim("B links Ghost", ["Ghost"])]],
      ]),
    );

    const outcome = await extractDocstringFile(
      db,
      adapter,
      { relPath: REL, sha: "sha-new", symbols: [A, B] },
      inventoryOf([A, B, ghost]),
      client,
    );

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.phase).toBe("store");
    expect(outcome.apiCalls).toBe(2);
    expect(outcome.failedCalls).toBe(0);
    expect(outcome.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0]!.symbolId).toBe(B.id);
    expect(outcome.errors[0]!.error).toMatch(/rolled back/);
    expect(outcome.errors[0]!.error).toMatch(/FOREIGN KEY/);
    expectUnchanged(db);
  });
});

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

describe("pipeline.ts re-exports", () => {
  it("re-exports the docstring entry points by identity", () => {
    // The benchmarks repo and scripts import these from pipeline.js.
    expect(pipeline.extractDocstringsForFile).toBe(extractDocstringsForFile);
    expect(pipeline.isExportedSymbol).toBe(isExportedSymbol);
  });
});
