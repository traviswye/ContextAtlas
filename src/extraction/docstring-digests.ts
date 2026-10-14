/**
 * The docstring-unchanged noise filter (v1.2 Phase 6; ADR-12 2026-10-14
 * amendment, Phase 6 section).
 *
 * The docstring stream's input for a file is the list of its exported
 * symbols with a non-empty docstring (symbol id + text). Most edits to a
 * source file change code, not that list, yet any edit changes the file
 * SHA, so the SHA gate re-extracts (CLI, paid) or queues (Tier 0) the
 * file. A digest of the list, recorded with the SHA it was read at,
 * tells the two apart: when a changed file's current digest equals the
 * one recorded for the SHA its key holds, the claims were extracted
 * from identical input, and the key moves to the new SHA with no model
 * call (`carryUnchangedDocstringKeys`).
 *
 * Records keep every recent SHA known to share the digest (see
 * {@link DigestRecord}). The record is local (`.contextatlas/local/docstring-digests.json`),
 * passed into the pipeline by the CLI only. It is filled when the CLI
 * stores a docstring file, and bootstrapped by reading files whose key
 * already matches their content and that have no record yet (LSP only).
 * A file without a record, or whose read fails, goes through the SHA
 * gate as before. Symbol ids are part of the digest, so a renamed symbol
 * still re-extracts (its provenance link is by id).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { groupSymbolsByPath, readFileDocstrings, type FileDocstrings } from "./docstring-read.js";
import { selectDocstringFiles, type PlanDocstringInput } from "./extraction-plan.js";
import { ensureLocalStateDir, localStateDir } from "./local-state.js";

export interface DigestRecord {
  readonly digest: string;
  /**
   * File SHAs known to have this digest, newest last (at most
   * {@link MAX_SHAS_PER_FILE}). Several, because a cache-only Tier 0 run
   * carries a key without writing atlas.json, so the next run's Stage 0
   * import brings the older key back.
   */
  readonly shas: readonly string[];
}

export const MAX_SHAS_PER_FILE = 8;

/** The record after learning that `sha` has `digest`. */
export function withSha(prev: DigestRecord | undefined, sha: string, digest: string): DigestRecord {
  const shas = prev?.digest === digest ? prev.shas.filter((s) => s !== sha) : [];
  return { digest, shas: [...shas, sha].slice(-MAX_SHAS_PER_FILE) };
}

/** In-memory digest store the pipeline reads and updates. */
export interface DocstringDigestStore {
  get(relPath: string): DigestRecord | undefined;
  set(relPath: string, record: DigestRecord): void;
  delete(relPath: string): void;
}

/** Digest of a file's documented exported symbols; null when any read failed. */
export function docstringDigest(read: FileDocstrings): string | null {
  if (read.errors.length > 0) return null;
  const entries = read.entries
    .map((e) => [e.symbolId, e.docstring] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

export function docstringDigestPath(configRoot: string): string {
  return pathResolve(localStateDir(configRoot), "docstring-digests.json");
}

/** A file-backed store; call `save()` after the run. A damaged file starts empty. */
export function loadDocstringDigests(
  configRoot: string,
): DocstringDigestStore & { save(): void; readonly size: number } {
  const path = docstringDigestPath(configRoot);
  const files = new Map<string, DigestRecord>();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as {
        files?: Record<string, DigestRecord>;
      };
      for (const [k, v] of Object.entries(parsed.files ?? {})) {
        if (typeof v?.digest === "string" && Array.isArray(v.shas)) files.set(k, v);
      }
    } catch {
      // Rebuilt by the next runs' bootstrap.
    }
  }
  let dirty = false;
  return {
    get: (relPath) => files.get(relPath),
    set: (relPath, record) => {
      const prev = files.get(relPath);
      if (prev?.digest === record.digest && prev.shas.join() === record.shas.join()) return;
      files.set(relPath, record);
      dirty = true;
    },
    delete: (relPath) => {
      if (files.delete(relPath)) dirty = true;
    },
    get size() {
      return files.size;
    },
    save: () => {
      if (!dirty) return;
      ensureLocalStateDir(configRoot);
      const sorted = Object.fromEntries([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, files: sorted }) + "\n", "utf8");
      renameSync(tmp, path);
      dirty = false;
    },
  };
}

export interface CarryInput extends PlanDocstringInput {
  store: DocstringDigestStore;
  /** Rewrites a `source_shas` key (and nothing else). */
  setKey: (relPath: string, sha: string) => void;
}

/**
 * Move the key of every changed docstring file whose documented symbols
 * are unchanged to its current SHA, without a model call: the stored key
 * is one of the record's SHAs and the current digest equals the
 * record's. `input.baseline` is updated in place, so the docstring plan
 * that follows sees these files as unchanged. Returns the paths carried.
 * Not for `--full`, which re-extracts regardless.
 */
export async function carryUnchangedDocstringKeys(input: CarryInput): Promise<string[]> {
  const symbolsByPath = groupSymbolsByPath(input.inventory.allSymbols);
  const carried: string[] = [];
  for (const { file, adapter } of selectDocstringFiles({ ...input, full: false }).files) {
    const stored = input.baseline[file.relPath];
    const record = input.store.get(file.relPath);
    if (stored === undefined || record === undefined || !record.shas.includes(stored)) continue;
    const digest = docstringDigest(
      await readFileDocstrings(adapter, symbolsByPath.get(file.relPath) ?? []),
    );
    if (digest === null || digest !== record.digest) continue;
    input.setKey(file.relPath, file.sha);
    (input.baseline as Record<string, string>)[file.relPath] = file.sha;
    input.store.set(file.relPath, withSha(record, file.sha, digest));
    carried.push(file.relPath);
  }
  return carried;
}

/**
 * Record digests after a run: from the run's own reads for files it
 * stored, and by reading (LSP only) the other files whose key matches
 * their content but whose SHA the record does not know yet. This
 * bootstraps the filter on the first run with a store.
 */
export async function recordDocstringDigests(input: {
  sourceFiles: PlanDocstringInput["sourceFiles"];
  inventory: PlanDocstringInput["inventory"];
  adapters: PlanDocstringInput["adapters"];
  prosePaths?: PlanDocstringInput["prosePaths"];
  keysNow: Readonly<Record<string, string>>;
  store: DocstringDigestStore;
  /** Reads the run already made, by relPath. */
  reads?: ReadonlyMap<string, FileDocstrings>;
}): Promise<number> {
  const symbolsByPath = groupSymbolsByPath(input.inventory.allSymbols);
  let recorded = 0;
  const selection = selectDocstringFiles({
    sourceFiles: input.sourceFiles,
    inventory: input.inventory,
    adapters: input.adapters,
    baseline: {},
    full: true,
    ...(input.prosePaths !== undefined ? { prosePaths: input.prosePaths } : {}),
  });
  for (const { file, adapter } of selection.files) {
    if (input.keysNow[file.relPath] !== file.sha) continue;
    if (input.store.get(file.relPath)?.shas.includes(file.sha)) continue;
    const read =
      input.reads?.get(file.relPath) ??
      (await readFileDocstrings(adapter, symbolsByPath.get(file.relPath) ?? []));
    const digest = docstringDigest(read);
    if (digest === null) continue;
    input.store.set(file.relPath, withSha(input.store.get(file.relPath), file.sha, digest));
    recorded++;
  }
  return recorded;
}
