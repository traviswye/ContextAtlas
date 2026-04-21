/**
 * Storage-layer type definitions.
 *
 * The shape of `atlas.json` is versioned public API per ADR-06 — changes
 * here require a schema version bump and a matching migration path. Keep
 * this interface in lock-step with DESIGN.md's "Atlas as Team Artifact"
 * section.
 */

import type { Severity, SymbolId, SymbolKind } from "../types.js";

export const ATLAS_VERSION = "1.0" as const;

export interface AtlasSymbolEntry {
  id: SymbolId;
  name: string;
  kind: SymbolKind;
  path: string;
  line: number;
  signature?: string;
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

export interface AtlasGeneratorInfo {
  contextatlas_version: string;
  extraction_model: string;
}

export interface AtlasFileV1 {
  version: typeof ATLAS_VERSION;
  generated_at: string;
  generator: AtlasGeneratorInfo;
  source_shas: Record<string, string>;
  symbols: AtlasSymbolEntry[];
  claims: AtlasClaimEntry[];
}
