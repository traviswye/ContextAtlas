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
 * commit list. Later versions add optional fields only (see the version
 * history in ./types.ts); v1.4 `claims[].symbol_candidates` is stored
 * in `claims.symbol_candidates` since v1.2 Phase 2.
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
 * database. Convenience wrapper around `importAtlas`. A file that is not
 * valid JSON (a write torn by a kill, an unresolved merge conflict)
 * fails with a message naming the file and the way back, not a bare
 * `SyntaxError` (v1.2 Phase 2).
 */
export function importAtlasFile(
  db: DatabaseInstance,
  filePath: string,
): void {
  const raw = readFileSync(filePath, "utf8");
  let parsed: AtlasFileV1;
  try {
    parsed = JSON.parse(raw) as AtlasFileV1;
  } catch (err) {
    throw new Error(
      `importAtlas: ${filePath} is not valid JSON (${err instanceof Error ? err.message : String(err)}). ` +
        "An interrupted write or an unresolved merge conflict leaves it like " +
        `this. Restore it, for example with \`git checkout -- ${filePath}\`, ` +
        "then retry.",
    );
  }
  importAtlas(db, parsed);
}

/**
 * Whether the cache holds no atlas content: no symbols, no claims and
 * no source keys. A cache that has only git commits or atlas_meta rows
 * is still empty in this sense. The one seeding rule shared by the MCP
 * server, the init smoke test and `contextatlas index` with
 * `atlas.committed: false`: atlas.json is imported only into an empty
 * cache (v1.2 Phase 2; counting symbols alone replaced a docs-only cache
 * on every start).
 */
export function isCacheEmpty(db: DatabaseInstance): boolean {
  const row = db
    .prepare(
      "SELECT EXISTS (SELECT 1 FROM symbols) OR " +
        "EXISTS (SELECT 1 FROM claims) OR " +
        "EXISTS (SELECT 1 FROM source_shas) AS has_content",
    )
    .get() as { has_content: number };
  return row.has_content === 0;
}

/**
 * The `generated_at` of atlas.json and of the atlas the cache holds, when
 * they differ; null when they match or atlas.json cannot be read or
 * parsed. Stateless: every writer stamps both from one value (an import
 * copies it, `contextatlas index` writes the same value to atlas_meta and
 * atlas.json), so a difference means atlas.json changed without this
 * cache (a pull, an `/index-atlas` refresh) or the cache changed without
 * atlas.json (`atlas.committed: false` runs). The MCP server uses it to
 * warn when it serves a cache that does not match atlas.json (v1.2
 * Phase 2; it does not re-import).
 */
export function atlasGeneratedAtMismatch(
  db: DatabaseInstance,
  atlasPath: string,
): { atlasJson: string; cache: string | null } | null {
  let fileValue: unknown;
  try {
    const parsed = JSON.parse(readFileSync(atlasPath, "utf8")) as {
      generated_at?: unknown;
    };
    fileValue = parsed?.generated_at;
  } catch {
    return null;
  }
  if (typeof fileValue !== "string") return null;
  const row = db
    .prepare("SELECT value FROM atlas_meta WHERE key = ?")
    .get(ATLAS_META_KEYS.generatedAt) as { value: string } | undefined;
  const cacheValue = row?.value ?? null;
  return cacheValue === fileValue ? null : { atlasJson: fileValue, cache: cacheValue };
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

    // claims (+ claim_symbols). symbol_candidates is atlas v1.4+
    // (F-7: persisted so a CLI index no longer strips it).
    const claims: NewClaim[] = atlas.claims.map((entry) => ({
      source: entry.source,
      sourcePath: entry.source_path,
      sourceSha: entry.source_sha,
      severity: entry.severity,
      claim: entry.claim,
      rationale: entry.rationale,
      excerpt: entry.excerpt,
      symbolIds: entry.symbol_ids,
      symbolCandidates: readSymbolCandidates(entry.symbol_candidates),
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
  checkClaimLinks(atlas);
}

/**
 * Claims link symbols through a foreign key, so a claim whose
 * `symbol_ids` names a symbol `symbols` does not list cannot be stored.
 * That is the state of an `/index-atlas` refresh that wrote `symbols: []`
 * and has not run `resolve-symbols` yet. Name the fix instead of letting
 * SQLite report a bare "FOREIGN KEY constraint failed" (v1.2 Phase 2
 * review round 2.2).
 */
function checkClaimLinks(atlas: AtlasFileV1): void {
  const listed = new Set<string>();
  for (const s of atlas.symbols) listed.add(s.id);
  const missing = new Set<string>();
  let claims = 0;
  for (const claim of atlas.claims) {
    const unlisted = (claim.symbol_ids ?? []).filter((id) => !listed.has(id));
    if (unlisted.length === 0) continue;
    claims++;
    for (const id of unlisted) missing.add(id);
  }
  if (missing.size === 0) return;
  const examples = [...missing].sort().slice(0, 3).join(", ");
  const more = missing.size > 3 ? `, and ${missing.size - 3} more` : "";
  throw new Error(
    `importAtlas: ${claims} claim${claims === 1 ? " links" : "s link"} symbols ` +
      `that atlas.json's \`symbols\` does not list (${examples}${more}), so ` +
      "the atlas cannot be loaded. This is what an /index-atlas refresh " +
      "that wrote `symbols: []` looks like before `contextatlas " +
      "resolve-symbols` has run: run `contextatlas resolve-symbols` (it " +
      "rebuilds `symbols`), then retry. Do not empty the claims' " +
      "`symbol_ids`: a claim without `symbol_candidates` cannot be linked again.",
  );
}

/**
 * `claims[].symbol_candidates` as stored: the string entries, in order.
 * A malformed value (not an array) is treated as absent and non-string
 * entries are dropped. Before v1.2 the importer ignored the field
 * entirely, so a malformed one never stopped an atlas from loading;
 * that stays true. `validate-atlas` rejects a non-array at the Skill
 * boundary.
 */
function readSymbolCandidates(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((c): c is string => typeof c === "string");
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
