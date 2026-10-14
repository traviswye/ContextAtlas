/**
 * MCP server hot reload of a committed atlas.json (v1.2 Phase 4; ADR-12
 * 2026-10-14 amendment, Phase 4 section).
 *
 * With `atlas.committed: true` the server watches atlas.json and
 * re-imports it into the local cache when it changes, so a pull, an
 * `/index-atlas` refresh or a `contextatlas index` run reaches the
 * running server without a restart. With `atlas.committed: false` the
 * cache is the source of truth and nothing is watched (lead decision
 * L-19): reloading atlas.json there would discard work only the cache
 * holds.
 *
 *   - Change detection: `fs.watch` on atlas.json's directory (writers
 *     replace the file by rename, which a watch on the file itself
 *     would lose), filtered to its name, debounced, then guarded by a
 *     content hash so a touch or a repeated event does nothing.
 *   - Own writes are skipped: `contextatlas index` shares the cache and
 *     stamps `generated_at` into it before each checkpoint or final
 *     export, so an atlas.json whose `generated_at` equals the cache's
 *     already is the cache. Re-importing a mid-run checkpoint would
 *     wipe the units stored after it.
 *   - Swap: the import is one transaction (`importAtlas`), run through
 *     {@link RequestGate.exclusive}: tool calls in flight finish against
 *     the previous state first, and calls arriving meanwhile wait.
 *   - Runs in progress: while a `contextatlas index` run holds the run
 *     lock (v1.2 Phase 5), a reload is deferred and retried, so a pull
 *     mid-run cannot replace the cache the run is writing.
 *   - Failure: a malformed or partially written atlas.json throws inside
 *     the transaction, which rolls back. The server keeps serving the
 *     previous state, warns, and retries on the next change.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname } from "node:path";

import { ATLAS_META_KEYS, importAtlas } from "../storage/atlas-importer.js";
import type { DatabaseInstance } from "../storage/db.js";
import type { AtlasFileV1 } from "../storage/types.js";

import { log } from "./logger.js";

/**
 * Serializes atlas swaps against tool calls. `run` wraps every tool
 * call; `exclusive` waits until no call is in flight, holds new calls
 * back, and runs its (synchronous) body alone.
 */
export class RequestGate {
  private inFlight = 0;
  private drainWaiters: Array<() => void> = [];
  private pending: Promise<void> | null = null;

  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.pending) await this.pending;
    this.inFlight++;
    try {
      return await fn();
    } finally {
      this.inFlight--;
      if (this.inFlight === 0) for (const wake of this.drainWaiters.splice(0)) wake();
    }
  }

  async exclusive<T>(fn: () => T): Promise<T> {
    while (this.pending) await this.pending;
    let release!: () => void;
    this.pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      if (this.inFlight > 0) {
        await new Promise<void>((resolve) => this.drainWaiters.push(resolve));
      }
      return fn();
    } finally {
      this.pending = null;
      release();
    }
  }
}

export type ReloadOutcome =
  | "reloaded"
  | "deferred"
  | "unchanged"
  | "already-current"
  | "missing"
  | "failed";

export interface AtlasReloaderOptions {
  db: DatabaseInstance;
  atlasPath: string;
  gate: RequestGate;
  /** Quiet period after the last change event. Default 500 ms. */
  debounceMs?: number;
  /** True while a `contextatlas index` run holds the run lock. */
  isIndexRunning?: () => boolean;
  /** Delay before retrying a deferred reload. Default 2000 ms. */
  retryMs?: number;
}

export class AtlasReloader {
  private readonly db: DatabaseInstance;
  private readonly atlasPath: string;
  private readonly gate: RequestGate;
  private readonly debounceMs: number;
  private readonly isIndexRunning: () => boolean;
  private readonly retryMs: number;
  private lastHash: string | null = null;
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private chain: Promise<ReloadOutcome> = Promise.resolve("unchanged");

  constructor(options: AtlasReloaderOptions) {
    this.db = options.db;
    this.atlasPath = options.atlasPath;
    this.gate = options.gate;
    this.debounceMs = options.debounceMs ?? 500;
    this.isIndexRunning = options.isIndexRunning ?? (() => false);
    this.retryMs = options.retryMs ?? 2000;
  }

  /**
   * Reload atlas.json if it changed since the last load and is not the
   * atlas the cache already holds. Calls are serialized; the result is
   * this call's outcome.
   */
  reloadIfChanged(): Promise<ReloadOutcome> {
    this.chain = this.chain.then(() => this.reloadOnce());
    return this.chain;
  }

  /** Start watching atlas.json's directory. Idempotent. */
  start(): void {
    if (this.watcher) return;
    const name = basename(this.atlasPath);
    try {
      this.watcher = watch(dirname(this.atlasPath), (_event, filename) => {
        if (filename !== null && filename.toString() !== name) return;
        this.schedule();
      });
      this.watcher.on("error", (err) => {
        log.warn(
          "atlas reload: the atlas.json watch failed; the server keeps serving " +
            "its current atlas and no longer reloads on change. Restart the " +
            "server to resume.",
          { path: this.atlasPath, err: String(err) },
        );
        this.stop();
      });
    } catch (err) {
      log.warn(
        "atlas reload: could not watch atlas.json's directory; the server " +
          "serves the atlas loaded at startup and does not reload on change.",
        { path: this.atlasPath, err: String(err) },
      );
    }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.watcher?.close();
    this.watcher = null;
  }

  private schedule(delayMs: number = this.debounceMs): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.reloadIfChanged();
    }, delayMs);
    this.timer.unref();
  }

  private async reloadOnce(): Promise<ReloadOutcome> {
    if (!existsSync(this.atlasPath)) return "missing";
    if (this.isIndexRunning()) {
      this.schedule(this.retryMs);
      return "deferred";
    }
    let text: string;
    try {
      text = readFileSync(this.atlasPath, "utf8");
    } catch (err) {
      return this.failed(err);
    }
    const hash = createHash("sha256").update(text).digest("hex");
    if (hash === this.lastHash) return "unchanged";

    let atlas: AtlasFileV1;
    try {
      atlas = JSON.parse(text) as AtlasFileV1;
    } catch (err) {
      return this.failed(err);
    }
    if (typeof atlas?.generated_at === "string" && atlas.generated_at === this.cacheGeneratedAt()) {
      this.lastHash = hash;
      return "already-current";
    }
    try {
      const startedAt = Date.now();
      await this.gate.exclusive(() => importAtlas(this.db, atlas));
      this.lastHash = hash;
      log.info("atlas reload: atlas.json changed; re-imported into the local cache", {
        path: this.atlasPath,
        generatedAt: atlas.generated_at,
        symbols: atlas.symbols?.length ?? 0,
        claims: atlas.claims?.length ?? 0,
        ms: Date.now() - startedAt,
      });
      return "reloaded";
    } catch (err) {
      return this.failed(err);
    }
  }

  private cacheGeneratedAt(): string | null {
    const row = this.db
      .prepare("SELECT value FROM atlas_meta WHERE key = ?")
      .get(ATLAS_META_KEYS.generatedAt) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private failed(err: unknown): ReloadOutcome {
    log.warn(
      "atlas reload: atlas.json could not be loaded (malformed, or still being " +
        "written); the server keeps serving the previous atlas and retries on " +
        "the next change. Run `contextatlas validate-atlas` if this persists.",
      { path: this.atlasPath, err: String(err) },
    );
    return "failed";
  }
}
