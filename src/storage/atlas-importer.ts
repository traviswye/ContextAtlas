/**
 * AtlasImporter — loads atlas.json into SQLite.
 *
 * The entire import runs in a single transaction (ADR-06's round-trip
 * invariant requires all-or-nothing import semantics: partial state on
 * failure is worse than empty). Existing rows in the target tables are
 * cleared before the new data is written, so importing twice produces
 * the same final state regardless of starting state.
 */

import { readFileSync } from "node:fs";

import { LANG_CODES_INVERSE, type Symbol as AtlasSymbol } from "../types.js";

import {
  clearClaims,
  clearSourceShas,
  insertClaims,
  setSourceSha,
  type NewClaim,
} from "./claims.js";
import type { DatabaseInstance } from "./db.js";
import { clearSymbols, upsertSymbols } from "./symbols.js";
import type { AtlasFileV1 } from "./types.js";

export const ATLAS_META_KEYS = {
  version: "version",
  generatedAt: "generated_at",
  generatorContextatlasVersion: "generator.contextatlas_version",
  generatorExtractionModel: "generator.extraction_model",
} as const;

/**
 * Read an atlas.json file from disk, parse it, and import into the given
 * database. Convenience wrapper around `importAtlas`.
 */
export function importAtlasFile(
  db: DatabaseInstance,
  filePath: string,
): void {
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as AtlasFileV1;
  importAtlas(db, parsed);
}

/**
 * Replace the database's atlas-owned tables with the contents of the given
 * atlas object. Idempotent: importing the same atlas twice yields the
 * same final state. Non-atlas tables are untouched.
 */
export function importAtlas(db: DatabaseInstance, atlas: AtlasFileV1): void {
  validateAtlas(atlas);

  const tx = db.transaction(() => {
    // Clear existing atlas-owned state so import is idempotent regardless
    // of starting state.
    clearClaims(db);
    clearSymbols(db);
    clearSourceShas(db);
    db.exec("DELETE FROM atlas_meta;");

    // atlas_meta header
    const setMeta = db.prepare(
      "INSERT INTO atlas_meta (key, value) VALUES (?, ?)",
    );
    setMeta.run(ATLAS_META_KEYS.version, atlas.version);
    setMeta.run(ATLAS_META_KEYS.generatedAt, atlas.generated_at);
    setMeta.run(
      ATLAS_META_KEYS.generatorContextatlasVersion,
      atlas.generator.contextatlas_version,
    );
    setMeta.run(
      ATLAS_META_KEYS.generatorExtractionModel,
      atlas.generator.extraction_model,
    );

    // source_shas
    for (const [path, sha] of Object.entries(atlas.source_shas)) {
      setSourceSha(db, path, sha);
    }

    // symbols
    const symbols: AtlasSymbol[] = atlas.symbols.map((entry) => ({
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      path: entry.path,
      line: entry.line,
      signature: entry.signature,
      language: inferLanguageFromId(entry.id),
      fileSha: entry.file_sha,
    }));
    upsertSymbols(db, symbols);

    // claims (+ claim_symbols)
    const claims: NewClaim[] = atlas.claims.map((entry) => ({
      source: entry.source,
      sourcePath: entry.source_path,
      sourceSha: entry.source_sha,
      severity: entry.severity,
      claim: entry.claim,
      rationale: entry.rationale,
      excerpt: entry.excerpt,
      symbolIds: entry.symbol_ids,
    }));
    insertClaims(db, claims);
  });
  tx();
}

function validateAtlas(atlas: AtlasFileV1): void {
  if (!atlas || typeof atlas !== "object") {
    throw new Error("importAtlas: atlas must be a non-null object.");
  }
  if (atlas.version !== "1.0") {
    throw new Error(
      `importAtlas: unsupported atlas version '${atlas.version}'. ` +
        "This release reads v1.0 only; re-generate the atlas or upgrade.",
    );
  }
  if (!atlas.generator?.contextatlas_version) {
    throw new Error(
      "importAtlas: missing generator.contextatlas_version. " +
        "Atlas was produced by a non-compliant tool or is corrupted.",
    );
  }
  if (!Array.isArray(atlas.symbols) || !Array.isArray(atlas.claims)) {
    throw new Error(
      "importAtlas: symbols and claims must be arrays in atlas.json.",
    );
  }
}

function inferLanguageFromId(
  id: string,
): AtlasSymbol["language"] {
  const parts = id.split(":");
  if (parts.length < 4 || parts[0] !== "sym") {
    throw new Error(
      `importAtlas: malformed symbol ID '${id}' — expected 'sym:<lang>:<path>:<name>'.`,
    );
  }
  const short = parts[1]!;
  const lang = LANG_CODES_INVERSE[short];
  if (!lang) {
    throw new Error(
      `importAtlas: unknown language short-code '${short}' in '${id}'.`,
    );
  }
  return lang;
}
