/**
 * AtlasImporter — loads atlas.json into SQLite.
 *
 * The entire import runs in a single transaction (ADR-06's round-trip
 * invariant requires all-or-nothing import semantics: partial state on
 * failure is worse than empty). Existing rows in the target tables are
 * cleared before the new data is written, so importing twice produces
 * the same final state regardless of starting state.
 *
 * Supports atlas versions 1.0 and 1.1 (ADR-11). v1.0 atlases have no
 * git block; they load into empty git tables without complaint. v1.1
 * atlases populate git_commits + git_file_commits from the embedded
 * commit list.
 */

import { readFileSync } from "node:fs";

import type { GitCommit } from "../extraction/git-extractor.js";
import { LANG_CODES_INVERSE, type Symbol as AtlasSymbol } from "../types.js";

import {
  clearClaims,
  clearSourceShas,
  insertClaims,
  setSourceSha,
  type NewClaim,
} from "./claims.js";
import type { DatabaseInstance } from "./db.js";
import { clearGitCommits, replaceGitCommits } from "./git.js";
import { clearSymbols, upsertSymbols } from "./symbols.js";
import {
  SUPPORTED_ATLAS_VERSIONS,
  type AtlasFileV1,
  type AtlasVersion,
} from "./types.js";

export const ATLAS_META_KEYS = {
  version: "version",
  generatedAt: "generated_at",
  generatorContextatlasVersion: "generator.contextatlas_version",
  /**
   * Atlas schema v1.3+ (v0.3 Theme 1.3) — git HEAD SHA of the
   * contextatlas binary that produced the atlas. Optional; absent
   * when the binary is not run from a git checkout.
   */
  generatorContextatlasCommitSha: "generator.contextatlas_commit_sha",
  generatorExtractionModel: "generator.extraction_model",
  /** ADR-11 — git HEAD SHA at extraction time. Stored even when null-absent. */
  extractedAtSha: "extracted_at_sha",
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
    clearGitCommits(db);
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
    if (atlas.generator.contextatlas_commit_sha !== undefined) {
      setMeta.run(
        ATLAS_META_KEYS.generatorContextatlasCommitSha,
        atlas.generator.contextatlas_commit_sha,
      );
    }
    setMeta.run(
      ATLAS_META_KEYS.generatorExtractionModel,
      atlas.generator.extraction_model,
    );
    if (atlas.extracted_at_sha !== undefined) {
      setMeta.run(ATLAS_META_KEYS.extractedAtSha, atlas.extracted_at_sha);
    }

    // source_shas
    for (const [path, sha] of Object.entries(atlas.source_shas)) {
      setSourceSha(db, path, sha);
    }

    // symbols — parent_id is atlas v1.2+; 1.0/1.1 entries omit it
    // and import cleanly with parentId undefined.
    const symbols: AtlasSymbol[] = atlas.symbols.map((entry) => ({
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      path: entry.path,
      line: entry.line,
      signature: entry.signature,
      language: inferLanguageFromId(entry.id),
      parentId: entry.parent_id,
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

    // git_commits — v1.1 only. Derive git_file_commits on the fly.
    if (atlas.git_commits && atlas.git_commits.length > 0) {
      const commits: GitCommit[] = atlas.git_commits.map((gc) => ({
        sha: gc.sha,
        date: gc.date,
        message: gc.message,
        authorEmail: gc.author_email,
        files: gc.files,
      }));
      replaceGitCommits(db, commits);
    }
  });
  tx();
}

function validateAtlas(atlas: AtlasFileV1): void {
  if (!atlas || typeof atlas !== "object") {
    throw new Error("importAtlas: atlas must be a non-null object.");
  }
  if (!isSupportedVersion(atlas.version)) {
    throw new Error(
      `importAtlas: unsupported atlas version '${atlas.version}'. ` +
        `This release reads ${SUPPORTED_ATLAS_VERSIONS.join(", ")}; ` +
        "re-generate the atlas or upgrade.",
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
  if (
    atlas.git_commits !== undefined &&
    !Array.isArray(atlas.git_commits)
  ) {
    throw new Error(
      "importAtlas: git_commits must be an array when present.",
    );
  }
}

function isSupportedVersion(v: unknown): v is AtlasVersion {
  return (
    typeof v === "string" &&
    (SUPPORTED_ATLAS_VERSIONS as readonly string[]).includes(v)
  );
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
