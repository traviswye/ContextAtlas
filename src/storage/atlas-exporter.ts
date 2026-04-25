/**
 * AtlasExporter — serializes SQLite state to atlas.json.
 *
 * The entire read runs in a single transaction so concurrent writers
 * cannot corrupt the export (SQLite gives us snapshot isolation within
 * a transaction). Output is deterministic: key order is canonical,
 * arrays are sorted, nullish optional fields are omitted.
 *
 * Nullish convention (round-trip invariant): "" / undefined / null are
 * treated identically on export — all three omit the key. Importers
 * treat missing keys as absent. Any future field that must survive
 * round-trip through null states MUST NOT rely on this layer preserving
 * the distinction.
 *
 * In production, step 5 (extraction pipeline) decides whether an index
 * run was a no-op (skip re-export entirely) or a real run (pass an
 * explicit `generatedAt`). This exporter does not know which case it's
 * in — it correctly handles both by accepting an override and falling
 * back to the stored value.
 *
 * Atlas v1.1 adds `extracted_at_sha` and `git_commits` per ADR-11. The
 * exporter emits v1.1 unconditionally; the new optional fields are
 * omitted when no git data was collected (non-git source trees).
 */

import { writeFileSync } from "node:fs";

import {
  listAllClaims,
  listSourceShas,
} from "./claims.js";
import type { DatabaseInstance } from "./db.js";
import { listAllGitCommits } from "./git.js";
import { listAllSymbols } from "./symbols.js";
import {
  ATLAS_VERSION,
  SUPPORTED_ATLAS_VERSIONS,
  type AtlasClaimEntry,
  type AtlasFileV1,
  type AtlasGitCommit,
  type AtlasSymbolEntry,
  type AtlasVersion,
} from "./types.js";
import { ATLAS_META_KEYS } from "./atlas-importer.js";

export interface ExportAtlasOptions {
  /**
   * Override the `generated_at` timestamp. If omitted, the value stored
   * in SQLite's `atlas_meta` is used — which is what enables lossless
   * round-trip (import → export yields the same timestamp).
   */
  generatedAt?: string;
  /** Override the generator info. Falls back to stored values. */
  contextatlasVersion?: string;
  /**
   * Override the contextatlas binary's git HEAD SHA captured at
   * extraction time (atlas schema v1.3+, v0.3 Theme 1.3). Defaults
   * to the value stored in `atlas_meta`. Pass `null` to explicitly
   * omit (e.g., when the binary is not in a git checkout).
   */
  contextatlasCommitSha?: string | null;
  extractionModel?: string;
  /**
   * Override the git HEAD SHA captured at extraction time. Defaults to
   * the value stored in `atlas_meta` during the extraction run. Pass
   * `null` to explicitly omit the field (e.g., non-git source tree).
   */
  extractedAtSha?: string | null;
  /**
   * Override the atlas version to emit. Defaults to the version stored
   * in `atlas_meta` (preserving round-trip for imported atlases),
   * falling back to the current {@link ATLAS_VERSION} for databases
   * with no version meta set. Pipeline's stage 7 writes
   * ATLAS_VERSION into meta after a real extraction run so upgraded
   * atlases export at the new version.
   */
  version?: AtlasVersion;
}

/**
 * Serialize the current database state to a deterministically-ordered
 * AtlasFileV1 object.
 */
export function exportAtlas(
  db: DatabaseInstance,
  options: ExportAtlasOptions = {},
): AtlasFileV1 {
  // Wrap the reads in a transaction so concurrent writers don't split
  // our view of the data. better-sqlite3 transactions are synchronous,
  // so we return the value directly.
  const tx = db.transaction(() => {
    const meta = readAtlasMeta(db);
    const generatedAt =
      options.generatedAt ?? meta.generated_at ?? new Date().toISOString();
    const contextatlasVersion =
      options.contextatlasVersion ??
      meta["generator.contextatlas_version"] ??
      "0.0.0";
    // contextatlas_commit_sha follows the same null-vs-undefined override
    // semantics as extracted_at_sha: explicit `null` forces omission;
    // `undefined` falls back to stored meta (which itself may be absent).
    const contextatlasCommitShaResolved =
      options.contextatlasCommitSha === null
        ? undefined
        : (options.contextatlasCommitSha ??
          meta["generator.contextatlas_commit_sha"] ??
          undefined);
    const extractionModel =
      options.extractionModel ??
      meta["generator.extraction_model"] ??
      "unknown";
    const version = resolveVersion(options.version, meta["version"]);

    // extracted_at_sha is optional. An explicit `null` override forces
    // omission; `undefined` falls back to the stored meta value (which
    // itself may be absent for v1.0-imported or non-git atlases).
    const extractedAtShaResolved =
      options.extractedAtSha === null
        ? undefined
        : (options.extractedAtSha ?? meta["extracted_at_sha"] ?? undefined);

    const sourceShas = sortObjectKeys(listSourceShas(db));

    const symbols: AtlasSymbolEntry[] = listAllSymbols(db)
      .map((s): AtlasSymbolEntry => {
        // Canonical key order for symbols:
        //   id, name, kind, path, line, signature?, parent_id?, file_sha.
        // Rebuild the literal in canonical order whenever an optional
        // key is present so serialization is deterministic.
        const hasSig = hasValue(s.signature);
        const hasParent = hasValue(s.parentId);
        if (hasSig && hasParent) {
          return {
            id: s.id,
            name: s.name,
            kind: s.kind,
            path: s.path,
            line: s.line,
            signature: s.signature,
            parent_id: s.parentId,
            file_sha: s.fileSha ?? "",
          };
        }
        if (hasSig) {
          return {
            id: s.id,
            name: s.name,
            kind: s.kind,
            path: s.path,
            line: s.line,
            signature: s.signature,
            file_sha: s.fileSha ?? "",
          };
        }
        if (hasParent) {
          return {
            id: s.id,
            name: s.name,
            kind: s.kind,
            path: s.path,
            line: s.line,
            parent_id: s.parentId,
            file_sha: s.fileSha ?? "",
          };
        }
        return {
          id: s.id,
          name: s.name,
          kind: s.kind,
          path: s.path,
          line: s.line,
          file_sha: s.fileSha ?? "",
        };
      })
      .sort((a, b) => compareStrings(a.id, b.id));

    const claims: AtlasClaimEntry[] = listAllClaims(db)
      .map((c): AtlasClaimEntry => {
        const symbol_ids = [...c.symbolIds].sort(compareStrings);
        const base: AtlasClaimEntry = {
          source: c.source,
          source_path: c.sourcePath,
          source_sha: c.sourceSha,
          severity: c.severity,
          claim: c.claim,
          symbol_ids,
        };
        // Canonical key order for claims: source, source_path, source_sha,
        // severity, claim, rationale, excerpt, symbol_ids. Rebuild the
        // literal to match the canonical order when optional fields exist.
        if (hasValue(c.rationale) || hasValue(c.excerpt)) {
          const rebuilt: AtlasClaimEntry = {
            source: c.source,
            source_path: c.sourcePath,
            source_sha: c.sourceSha,
            severity: c.severity,
            claim: c.claim,
            ...(hasValue(c.rationale) ? { rationale: c.rationale } : {}),
            ...(hasValue(c.excerpt) ? { excerpt: c.excerpt } : {}),
            symbol_ids,
          };
          return rebuilt;
        }
        return base;
      })
      .sort((a, b) => {
        // Per DESIGN.md: "sorted by (source, symbol_id, claim)". A claim
        // has multiple symbol_ids, so symbol_id here means the first id
        // after sorting that claim's symbol_ids alphabetically. In
        // practice duplicate (source, first-symbol, claim) tuples don't
        // occur, but if they did Array.prototype.sort is stable in modern
        // V8, so insertion order breaks the tie consistently.
        const bySource = compareStrings(a.source, b.source);
        if (bySource !== 0) return bySource;
        const aFirst = a.symbol_ids[0] ?? "";
        const bFirst = b.symbol_ids[0] ?? "";
        const bySymbol = compareStrings(aFirst, bFirst);
        if (bySymbol !== 0) return bySymbol;
        return compareStrings(a.claim, b.claim);
      });

    // git_commits — canonical order is date DESC then sha ASC, which
    // listAllGitCommits already returns. `files` per commit is already
    // sorted ascending by the storage layer. Omit entirely when empty
    // so v1.0-style atlases (no git data) still round-trip cleanly
    // at the wire level.
    const storedGitCommits = listAllGitCommits(db);
    const gitCommits: AtlasGitCommit[] = storedGitCommits.map((c) => ({
      sha: c.sha,
      date: c.date,
      message: c.message,
      author_email: c.authorEmail,
      files: c.files,
    }));

    // Top-level canonical key order: version, generated_at,
    // extracted_at_sha (when present), generator, source_shas,
    // symbols, claims, git_commits (when present).
    const atlas: AtlasFileV1 = {
      version,
      generated_at: generatedAt,
      ...(extractedAtShaResolved !== undefined
        ? { extracted_at_sha: extractedAtShaResolved }
        : {}),
      // Canonical generator key order: contextatlas_version,
      // contextatlas_commit_sha (when present), extraction_model.
      // commit_sha sits adjacent to its sibling provenance field
      // (contextatlas_version) rather than at the end so the two
      // tool-identity fields read together; extraction_model trails
      // since it identifies the *model* rather than the *binary*.
      generator: {
        contextatlas_version: contextatlasVersion,
        ...(contextatlasCommitShaResolved !== undefined
          ? { contextatlas_commit_sha: contextatlasCommitShaResolved }
          : {}),
        extraction_model: extractionModel,
      },
      source_shas: sourceShas,
      symbols,
      claims,
      ...(gitCommits.length > 0 ? { git_commits: gitCommits } : {}),
    };
    return atlas;
  });
  return tx();
}

/**
 * Serialize an atlas to canonical JSON text: 2-space indent, LF newlines,
 * exactly one trailing newline. Suitable for writing directly to disk.
 */
export function serializeAtlas(atlas: AtlasFileV1): string {
  return JSON.stringify(atlas, null, 2) + "\n";
}

/**
 * Export the database to atlas.json at the given path. Writes LF-only
 * output — a .gitattributes entry on the atlas file is the long-term
 * way to guarantee line-ending stability across OSes; this function
 * handles the serialization side of that pair.
 */
export function exportAtlasToFile(
  db: DatabaseInstance,
  filePath: string,
  options: ExportAtlasOptions = {},
): void {
  const atlas = exportAtlas(db, options);
  writeFileSync(filePath, serializeAtlas(atlas), "utf8");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readAtlasMeta(db: DatabaseInstance): Record<string, string> {
  const rows = db
    .prepare("SELECT key, value FROM atlas_meta")
    .all() as { key: string; value: string }[];
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  // The map uses the string keys so consumers don't need to repeat the
  // enum everywhere.
  void ATLAS_META_KEYS;
  return out;
}

function sortObjectKeys(obj: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(obj).sort(compareStrings)) {
    sorted[key] = obj[key]!;
  }
  return sorted;
}

function compareStrings(a: string, b: string): number {
  // Byte-wise compare (default JS string compare). Deterministic and
  // locale-independent — critical for cross-machine atlas reproducibility.
  return a < b ? -1 : a > b ? 1 : 0;
}

function hasValue(v: string | undefined | null): v is string {
  return typeof v === "string" && v.length > 0;
}

function resolveVersion(
  override: AtlasVersion | undefined,
  stored: string | undefined,
): AtlasVersion {
  if (override !== undefined) return override;
  if (
    stored !== undefined &&
    (SUPPORTED_ATLAS_VERSIONS as readonly string[]).includes(stored)
  ) {
    return stored as AtlasVersion;
  }
  return ATLAS_VERSION;
}
