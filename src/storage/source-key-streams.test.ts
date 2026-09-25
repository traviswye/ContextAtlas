import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { importAtlas } from "./atlas-importer.js";
import { exportAtlas, serializeAtlas } from "./atlas-exporter.js";
import {
  clearSourceShas,
  deleteSourceSha,
  setSourceSha,
} from "./claims.js";
import { type DatabaseInstance, openDatabase } from "./db.js";
import {
  deleteSourceKeyStream,
  listSourceKeyStreams,
  recordSourceKeyStream,
} from "./source-key-streams.js";
import type { AtlasFileV1 } from "./types.js";

const EMPTY_ATLAS: AtlasFileV1 = {
  version: "1.4",
  generated_at: "2026-09-25T00:00:00.000Z",
  generator: { contextatlas_version: "1.2.0", extraction_model: "claude-opus-4-7" },
  source_shas: { "src/a.ts": "sha-a" },
  symbols: [],
  claims: [],
};

describe("source_key_streams (cache-only writer records)", () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  it("records, replaces and lists the writer stream per path", () => {
    recordSourceKeyStream(db, "src/a.ts", "prose", "sha-1");
    recordSourceKeyStream(db, "src/b.ts", "docstring", "sha-2");
    recordSourceKeyStream(db, "src/a.ts", "docstring", "sha-3");
    expect(listSourceKeyStreams(db)).toEqual(
      new Map([
        ["src/a.ts", { stream: "docstring", sha: "sha-3" }],
        ["src/b.ts", { stream: "docstring", sha: "sha-2" }],
      ]),
    );
    deleteSourceKeyStream(db, "src/b.ts");
    expect([...listSourceKeyStreams(db).keys()]).toEqual(["src/a.ts"]);
  });

  it("deleteSourceSha drops the path's record with the key", () => {
    setSourceSha(db, "src/a.ts", "sha-1");
    recordSourceKeyStream(db, "src/a.ts", "prose", "sha-1");
    deleteSourceSha(db, "src/a.ts");
    expect(listSourceKeyStreams(db).size).toBe(0);
  });

  it("survives clearSourceShas and the atlas import, and is never exported", () => {
    recordSourceKeyStream(db, "src/a.ts", "prose", "sha-a");
    clearSourceShas(db);
    importAtlas(db, EMPTY_ATLAS);
    expect(listSourceKeyStreams(db).get("src/a.ts")).toEqual({
      stream: "prose",
      sha: "sha-a",
    });
    expect(serializeAtlas(exportAtlas(db))).not.toMatch(/source_key_streams|"prose"/);
  });

  it("skips rows with an unknown stream value", () => {
    db.prepare(
      "INSERT INTO source_key_streams (source_path, stream, source_sha) VALUES (?, ?, ?)",
    ).run("x", "bogus", "s");
    expect(listSourceKeyStreams(db).size).toBe(0);
  });
});
