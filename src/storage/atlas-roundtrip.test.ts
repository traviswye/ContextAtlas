/**
 * Committed round-trip canary for the main repo's own committed
 * atlas. Protects the "existing atlases read unchanged" promise
 * from ADR-08 (and from ADR-06's round-trip invariant more
 * generally).
 *
 * If a future storage change breaks round-trip fidelity on the
 * real dogfood atlas — not the hand-crafted fixture that already
 * has its own round-trip test — this test fails on the very next
 * CI run. Without the commit, we'd rely on remembering to verify
 * manually, which silently rots.
 *
 * The test intentionally reads the committed atlas from disk
 * (.contextatlas/atlas.json), not a fixture. The value of this
 * test IS that it exercises real-world data.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { describe, expect, it } from "vitest";

import { exportAtlas, serializeAtlas } from "./atlas-exporter.js";
import { importAtlasFile } from "./atlas-importer.js";
import { openDatabase } from "./db.js";

const MAIN_REPO_ATLAS = pathResolve(".contextatlas/atlas.json");

describe("main repo atlas round-trip canary", () => {
  it("round-trips byte-identically through import + export", () => {
    // Gracefully skip when the committed atlas isn't present on
    // disk (e.g., a shallow clone or a build environment that
    // excludes .contextatlas/). The canary exists to catch
    // regressions when the atlas IS present — not to force its
    // presence on every runner.
    if (!existsSync(MAIN_REPO_ATLAS)) {
      // Vitest doesn't expose a skip primitive from inside an
      // `it`, so we exit early with an informative log instead.
      // The test passes trivially; the signal lives in the logs.
      // eslint-disable-next-line no-console
      console.log(
        `atlas-roundtrip: skipping, ${MAIN_REPO_ATLAS} not present`,
      );
      return;
    }

    const original = readFileSync(MAIN_REPO_ATLAS, "utf8");
    const db = openDatabase(":memory:");
    try {
      importAtlasFile(db, MAIN_REPO_ATLAS);
      const rebuilt = serializeAtlas(exportAtlas(db));
      expect(rebuilt).toBe(original);
    } finally {
      db.close();
    }
  });
});
