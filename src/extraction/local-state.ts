/**
 * Local-only state under `.contextatlas/local/` (v1.2 Phase 3): the
 * pending queue and the run log. Never committed: the directory carries
 * its own `.gitignore` (`*`), so repositories initialized before this
 * phase ignore it without a root `.gitignore` change. The v1.3 session
 * overlay reuses this namespace (ADR-06: atlas.json stays pure).
 *
 *   - `pending.json` — sources a run found changed, added or new but did
 *     not extract: everything a `--structural` run saw, and whatever a
 *     model-calling run left unextracted. One entry per source key, so
 *     N edits to a file are one entry. Each run replaces the queue with
 *     its own view; `first_seen` carries over for keys still pending.
 *   - `runs.jsonl` — one JSON line per `contextatlas index` run, the
 *     newest last, trimmed to the last {@link RUN_LOG_MAX_LINES}.
 *
 * The pipeline computes the units (`ExtractionPipelineResult.
 * pendingUnits`); only the CLI writes these files, so library callers
 * (benchmarks, scripts) never get a `.contextatlas/local/` directory.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { resolve as pathResolve } from "node:path";

import type { ExtractionStream } from "../types.js";

/** A source the run did not extract, as the pipeline reports it. */
export interface PendingUnit {
  /** The `source_shas` key: a repo-relative path, or `commit:<sha>`. */
  readonly key: string;
  readonly stream: ExtractionStream;
  /** `changed`: keyed with another SHA. `added`: not keyed yet. */
  readonly reason: "changed" | "added";
  /** The SHA extraction would key it with (file SHA or commit sha). */
  readonly sha: string;
}

export interface PendingEntry extends PendingUnit {
  /** ISO time of the first run that queued this key. */
  readonly first_seen: string;
  /** ISO time of the latest run that queued it. */
  readonly last_seen: string;
}

export interface PendingQueueFile {
  readonly version: 1;
  readonly updated_at: string;
  readonly entries: readonly PendingEntry[];
}

export interface RunLogEntry {
  readonly at: string;
  readonly mode: "structural" | "incremental" | "full";
  readonly exit_code: number;
  readonly wall_clock_ms: number;
  readonly api_calls: number;
  readonly cost_usd: number;
  readonly atlas_exported: boolean;
  readonly pending_sources: number;
  readonly symbols_pruned: number;
  readonly extracted_at_sha: string | null;
}

export const RUN_LOG_MAX_LINES = 500;

const STREAM_ORDER: readonly ExtractionStream[] = ["adr", "docstring", "commit"];

/** `<configRoot>/.contextatlas/local`. */
export function localStateDir(configRoot: string): string {
  return pathResolve(configRoot, ".contextatlas", "local");
}

export function pendingQueuePath(configRoot: string): string {
  return pathResolve(localStateDir(configRoot), "pending.json");
}

export function runLogPath(configRoot: string): string {
  return pathResolve(localStateDir(configRoot), "runs.jsonl");
}

/**
 * The stored queue, or an empty one when the file is missing or
 * unreadable. The queue is rebuilt by every run, so a damaged file
 * costs only the `first_seen` times.
 */
export function readPendingQueue(configRoot: string): PendingEntry[] {
  const path = pendingQueuePath(configRoot);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<PendingQueueFile>;
    return Array.isArray(parsed.entries) ? [...parsed.entries] : [];
  } catch {
    return [];
  }
}

/**
 * Replace the queue with `units`, keeping `first_seen` for keys already
 * queued. Entries are ordered by stream (adr, docstring, commit), then
 * key. Returns the written entries.
 */
export function writePendingQueue(
  configRoot: string,
  units: readonly PendingUnit[],
  now: Date = new Date(),
): PendingEntry[] {
  const at = now.toISOString();
  const previous = new Map(readPendingQueue(configRoot).map((e) => [e.key, e]));
  const entries: PendingEntry[] = units.map((u) => ({
    key: u.key,
    stream: u.stream,
    reason: u.reason,
    sha: u.sha,
    first_seen: previous.get(u.key)?.first_seen ?? at,
    last_seen: at,
  }));
  entries.sort(
    (a, b) =>
      STREAM_ORDER.indexOf(a.stream) - STREAM_ORDER.indexOf(b.stream) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const file: PendingQueueFile = { version: 1, updated_at: at, entries };
  writeAtomic(configRoot, pendingQueuePath(configRoot), JSON.stringify(file, null, 2) + "\n");
  return entries;
}

/** Append one run to the run log, keeping the last {@link RUN_LOG_MAX_LINES}. */
export function appendRunLog(configRoot: string, entry: RunLogEntry): void {
  const path = runLogPath(configRoot);
  let lines: string[] = [];
  if (existsSync(path)) {
    lines = readFileSync(path, "utf8").split("\n").filter((l) => l.length > 0);
  }
  lines.push(JSON.stringify(entry));
  writeAtomic(configRoot, path, lines.slice(-RUN_LOG_MAX_LINES).join("\n") + "\n");
}

function writeAtomic(configRoot: string, path: string, text: string): void {
  ensureLocalStateDir(configRoot);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

function ensureLocalStateDir(configRoot: string): void {
  const dir = localStateDir(configRoot);
  mkdirSync(dir, { recursive: true });
  const ignore = pathResolve(dir, ".gitignore");
  if (!existsSync(ignore)) {
    writeFileSync(
      ignore,
      "# ContextAtlas local state (pending queue, run log). Never commit.\n*\n",
      "utf8",
    );
  }
}
