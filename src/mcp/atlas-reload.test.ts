import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listAllClaims } from "../storage/claims.js";
import { openDatabase, type DatabaseInstance } from "../storage/db.js";
import type { AtlasFileV1 } from "../storage/types.js";

import { AtlasReloader, RequestGate } from "./atlas-reload.js";

function atlas(generatedAt: string, claim: string): AtlasFileV1 {
  return {
    version: "1.4",
    generated_at: generatedAt,
    generator: { contextatlas_version: "0.0.1", extraction_model: "claude-opus-4-7" },
    source_shas: { "docs/adr/ADR-01.md": "a".repeat(64) },
    symbols: [],
    claims: [
      {
        source: "adr:ADR-01.md",
        source_path: "docs/adr/ADR-01.md",
        source_sha: "a".repeat(64),
        severity: "hard",
        claim,
        symbol_ids: [],
      },
    ],
  } as AtlasFileV1;
}

describe("RequestGate (v1.2 Phase 4)", () => {
  it("runs an exclusive body only after in-flight calls finish, and holds new calls until it is done", async () => {
    const gate = new RequestGate();
    const order: string[] = [];
    let releaseCall!: () => void;
    const inFlight = gate.run(async () => {
      order.push("call-1 start");
      await new Promise<void>((r) => (releaseCall = r));
      order.push("call-1 end");
    });
    const swap = gate.exclusive(() => order.push("swap"));
    const late = gate.run(async () => {
      order.push("call-2");
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(["call-1 start"]);
    releaseCall();
    await Promise.all([inFlight, swap, late]);
    expect(order).toEqual(["call-1 start", "call-1 end", "swap", "call-2"]);
  });

  it("releases waiting calls when the exclusive body throws", async () => {
    const gate = new RequestGate();
    await expect(
      gate.exclusive(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(gate.run(async () => "ok")).resolves.toBe("ok");
  });
});

describe("AtlasReloader (v1.2 Phase 4)", () => {
  let dir: string;
  let db: DatabaseInstance;
  let reloader: AtlasReloader;
  const path = () => pathJoin(dir, "atlas.json");
  const write = (a: AtlasFileV1 | string) =>
    writeFileSync(path(), typeof a === "string" ? a : JSON.stringify(a));
  const claims = () => listAllClaims(db).map((c) => c.claim);

  beforeEach(() => {
    dir = mkdtempSync(pathJoin(tmpdir(), "ca-reload-"));
    db = openDatabase(":memory:");
    reloader = new AtlasReloader({ db, atlasPath: path(), gate: new RequestGate(), debounceMs: 20 });
  });
  afterEach(() => {
    reloader.stop();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports missing, reloads, then skips identical content", async () => {
    expect(await reloader.reloadIfChanged()).toBe("missing");
    write(atlas("t1", "first"));
    expect(await reloader.reloadIfChanged()).toBe("reloaded");
    expect(claims()).toEqual(["first"]);
    expect(await reloader.reloadIfChanged()).toBe("unchanged");
  });

  it("skips an atlas.json whose generated_at the cache already holds", async () => {
    write(atlas("t1", "first"));
    await reloader.reloadIfChanged();
    write(atlas("t1", "same generated_at, other content"));
    expect(await reloader.reloadIfChanged()).toBe("already-current");
    expect(claims()).toEqual(["first"]);
  });

  it("keeps the previous state on a malformed or invalid atlas, and retries once it is fixed", async () => {
    write(atlas("t1", "first"));
    await reloader.reloadIfChanged();
    write("{ truncated");
    expect(await reloader.reloadIfChanged()).toBe("failed");
    write(JSON.stringify({ ...atlas("t2", "x"), claims: "not an array" }));
    expect(await reloader.reloadIfChanged()).toBe("failed");
    expect(claims()).toEqual(["first"]);
    write(atlas("t2", "second"));
    expect(await reloader.reloadIfChanged()).toBe("reloaded");
    expect(claims()).toEqual(["second"]);
  });

  it("reloads after a write observed by the watch (debounced)", async () => {
    write(atlas("t1", "first"));
    await reloader.reloadIfChanged();
    reloader.start();
    // An atomic replace, as contextatlas index writes it.
    writeFileSync(`${path()}.tmp`, JSON.stringify(atlas("t2", "watched")));
    const { renameSync } = await import("node:fs");
    renameSync(`${path()}.tmp`, path());
    await expect
      .poll(() => claims(), { timeout: 5_000, interval: 50 })
      .toEqual(["watched"]);
  });
});
