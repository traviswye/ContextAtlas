/**
 * Storage-layer type definitions.
 *
 * The shape of `atlas.json` is versioned public API per ADR-06 — changes
 * here require a schema version bump and a matching migration path. Keep
 * this interface in lock-step with DESIGN.md's "Atlas as Team Artifact"
 * section.
 *
 * Version history:
 *   - 1.0: initial shape — version, generated_at, generator, source_shas,
 *          symbols, claims.
 *   - 1.1: ADR-11 adds `extracted_at_sha` and `git_commits`. Readers of
 *          1.1 atlases tolerate absence of both fields (optional per
 *          spec); readers of 1.0 atlases simply have no git data.
 *   - 1.2: ADR-14 §Decision 4 adds optional `parent_id` on symbol
 *          entries. Used by the Go adapter to preserve interface →
 *          method relationships when interface methods are flattened
 *          from documentSymbol children to top-level Symbol records.
 *          1.0 / 1.1 atlases import cleanly (parent_id absent on every
 *          row); 1.2 atlases round-trip their parent_id values.
 *   - 1.3: v0.3 Theme 1.3 adds optional
 *          `generator.contextatlas_commit_sha` — the git HEAD SHA of
 *          the contextatlas binary that produced the atlas. Distinct
 *          from `extracted_at_sha` (which records the *target repo's*
 *          HEAD); this records the *tool's* HEAD for provenance
 *          alongside `contextatlas_version`. Optional: omitted when
 *          the binary is run from a non-git checkout (e.g., a
 *          published npm install). Earlier-version atlases import
 *          cleanly with the field absent.
 */

import type { Severity, SymbolId, SymbolKind } from "../types.js";

/** Newest-version atlas the exporter writes and the importer prefers. */
export const ATLAS_VERSION = "1.3" as const;

/** All atlas versions the importer accepts. */
export const SUPPORTED_ATLAS_VERSIONS = ["1.0", "1.1", "1.2", "1.3"] as const;
export type AtlasVersion = (typeof SUPPORTED_ATLAS_VERSIONS)[number];

export interface AtlasSymbolEntry {
  id: SymbolId;
  name: string;
  kind: SymbolKind;
  path: string;
  line: number;
  signature?: string;
  /**
   * Optional parent-symbol back-pointer (ADR-14 §Decision 4).
   * Present on flattened children (e.g., Go interface methods);
   * omitted on standalone top-level symbols. Introduced in atlas
   * schema v1.2.
   */
  parent_id?: SymbolId;
  file_sha: string;
}

export interface AtlasClaimEntry {
  source: string;
  source_path: string;
  source_sha: string;
  severity: Severity;
  claim: string;
  rationale?: string;
  excerpt?: string;
  symbol_ids: SymbolId[];
}

/**
 * Git commit record embedded in atlas.json (ADR-11). `files` is the
 * list of paths touched by the commit, relative to the source root,
 * sorted ascending for deterministic round-trip.
 */
export interface AtlasGitCommit {
  sha: string;
  date: string;
  message: string;
  author_email: string;
  files: string[];
}

export interface AtlasGeneratorInfo {
  contextatlas_version: string;
  /**
   * Git HEAD SHA of the contextatlas binary that produced the atlas
   * (atlas schema v1.3+, v0.3 Theme 1.3). Records the *tool's* HEAD
   * for provenance — distinct from `extracted_at_sha` on the atlas
   * envelope, which records the *target repo's* HEAD. Optional:
   * absent when contextatlas is run from a non-git checkout (e.g.,
   * `npm install`-ed binary) or when SHA resolution fails for any
   * other reason.
   */
  contextatlas_commit_sha?: string;
  extraction_model: string;
}

export interface AtlasFileV1 {
  version: AtlasVersion;
  generated_at: string;
  /**
   * Git HEAD SHA at extraction time (ADR-11). Present on v1.1 atlases
   * produced from git trees; absent on v1.0 atlases and on v1.1
   * atlases whose source root is not a git working tree.
   */
  extracted_at_sha?: string;
  generator: AtlasGeneratorInfo;
  source_shas: Record<string, string>;
  symbols: AtlasSymbolEntry[];
  claims: AtlasClaimEntry[];
  /**
   * Sorted by `date` descending (newest first), with `sha` as a
   * deterministic tiebreaker. Absent on v1.0 atlases. Present on v1.1
   * atlases; may be an empty array when the source root is not a
   * git tree.
   */
  git_commits?: AtlasGitCommit[];
}
