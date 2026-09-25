/**
 * CLI glue for the `contextatlas list-extraction-sources` subcommand
 * (v0.7.1 Step 1.1.b.0 + Q1.1.G.α — substrate-equivalence closure at
 * /index-atlas Skill surface per Path D architecture).
 *
 * Walks the extraction streams and emits a unified JSON manifest the
 * `/index-atlas` Skill consumes via Bash + Read. The manifest is the
 * mechanical-floor substrate that closes the v0.7 Step 2.3.b.0
 * substrate-equivalence claim falsified empirically at v0.8 Step 1.1.b
 * factorial three-repo scale.
 *
 *   Stream A — ADRs at config.adrs.path. Walks via existing
 *               walkProseFiles. Per-ADR entry includes content + sha.
 *   Stream B — Source-symbols-with-docstrings. Per-language LSP
 *               adapter walk + listSymbols + getDocstring filtered by
 *               isExportedSymbol. Per-symbol entry includes docstring
 *               text + symbol metadata + source path.
 *   Stream C — Architectural-intent-filtered commit messages. Walks
 *               via parseCommitLog + makeDefaultCommitFilter. Per-
 *               commit entry includes pre-built extraction body per
 *               buildCommitExtractionBody (subject + body) and the
 *               canonical `commit:<sha>` source_key (v1.2).
 *
 * `extraction.streams` (v1.2 Phase 2, lead decision L-12 iii) gates the
 * walk the same way it gates CLI `index`: a disabled stream's array is
 * empty, `summary.disabled_streams` names it, and the `--output` status
 * line says so. With the docstring stream off, no LSP adapter starts.
 * The Skill keeps a disabled stream's baseline claims frozen, as the
 * CLI does (L-11).
 *
 * `manifest_version` is "2" exactly when a stream is disabled, "1"
 * otherwise (v1.2 Phase 2 review fix). An `/index-atlas` copy from
 * before v1.2 drops every baseline key the manifest does not list, so
 * it would read a disabled stream's empty array as "every source was
 * deleted" and drop that stream's claims; it stops on any version but
 * "1" instead. The v1.2 SKILL.md accepts both. A stderr note names the
 * cause when "2" is emitted.
 *
 * A file whose `getDocstring` fails for any symbol is left out of
 * `sources.docstrings` entirely (review fix), matching the CLI's
 * all-or-nothing file rule (L-10 i): listing only the symbols that
 * read would make the Skill replace the file's claims without the
 * failed symbol's and pin the new SHA. Left out, the file keeps its
 * baseline key and claims (refresh rule 4) and the next walk retries.
 *
 * Manifest is JSON to stdout. Skill workflow reads the manifest once
 * via Read tool, iterates per-source, makes one canonical-extraction-
 * prompt call per source via session tokens (matches CLI's per-source
 * API-call iteration mechanically). The CLI's per-call loop IS the
 * substrate-equivalence floor; this subcommand pre-walks the source
 * registry so the Skill agent can iterate without re-implementing
 * walking machinery.
 *
 * Zero Anthropic API cost — all work is local (file walk + LSP +
 * git log). Subscription-bounded property preserved at the Skill
 * surface per ADR-02 §Decision Path-3 entry-point-determined cost
 * model.
 *
 * Exit codes:
 *   0 — manifest emitted successfully
 *   2 — setup error (missing or invalid config / adapter init
 *       failure). A non-git tree or a missing git binary is not an
 *       error: the commit stream is empty and a warning is logged.
 */

import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve as pathResolve } from "node:path";

import { createAdapter, type CreateAdapterOptions } from "../adapters/registry.js";
import { computeExcludePatterns } from "../config/exclude-patterns.js";
import { loadConfig } from "../config/parser.js";
import {
  disabledExtractionStreams,
  resolveExtractionStreams,
} from "../config/streams.js";
import { log } from "../mcp/logger.js";
import type {
  ContextAtlasConfig,
  ExtractionStream,
  LanguageAdapter,
  LanguageCode,
} from "../types.js";

import {
  buildCommitExtractionBody,
  makeDefaultCommitFilter,
  parseCommitLog,
  type CommitMetadata,
} from "./commit-log.js";
import { readFileDocstrings } from "./docstring-read.js";
import { walkProseFiles, walkSourceFiles } from "./file-walker.js";
import { buildSymbolInventory } from "./resolver.js";
import { commitSourceKey } from "./source-keys.js";

export type ListExtractionSourcesExitCode = 0 | 2;

export interface ListExtractionSourcesCliOptions {
  configRoot: string;
  configFile: string | null;
  /**
   * Where to write the manifest. When omitted, manifest goes to
   * stdout (Skill consumes via Bash stdout capture into a temp file +
   * Read). When provided, the file is written and a short status
   * message goes to stdout instead.
   */
  outputPath?: string | null;
  /** Test seam: stdout writer. */
  writeStdout?: (chunk: string) => void;
  /** Test seam: stderr writer. */
  writeStderr?: (chunk: string) => void;
  /**
   * Test seam: build the language adapter for `lang` (default
   * `createAdapter` from the adapter registry). Receives the options
   * built from `.contextatlas.yml` (`lsp.initialize_timeout_ms`).
   */
  createAdapterOverride?: (
    lang: LanguageCode,
    options?: CreateAdapterOptions,
  ) => LanguageAdapter;
}

export interface ListExtractionSourcesCliResult {
  exitCode: ListExtractionSourcesExitCode;
}

/**
 * Per-ADR entry in the manifest. The Skill agent reads this entry,
 * feeds `content` to the canonical EXTRACTION_PROMPT, and emits
 * claims with `source: "adr:<basename of path>"`, `source_path: <path>`,
 * `source_sha: <sha>`.
 */
export interface AdrSource {
  source_type: "adr";
  path: string;
  sha: string;
  content: string;
}

/**
 * Per-symbol entry for Stream B. The Skill agent reads this entry,
 * feeds `docstring` to the canonical EXTRACTION_PROMPT, and emits
 * claims with `source: "docstring:<source_path>"`,
 * `source_path: <source_path>`, `source_sha: <file_sha>`. The
 * `symbol_name` is included in symbol_candidates of each emitted
 * claim so resolve-symbols recovers the documented-symbol provenance
 * link that the CLI docstring stream (`extractDocstringFile`,
 * docstring-stream.ts) sets by exact symbol id.
 */
export interface DocstringSource {
  source_type: "docstring";
  symbol_id: string;
  symbol_name: string;
  symbol_kind: string;
  source_path: string;
  file_sha: string;
  line: number;
  docstring: string;
}

/**
 * Per-commit entry for Stream C. The Skill agent reads this entry,
 * feeds `extraction_body` to the canonical EXTRACTION_PROMPT (matches
 * buildCommitExtractionBody output exactly), and emits claims with
 * `source: "commit:<sha>"`, `source_path: "commit:<sha>"`,
 * `source_sha: <sha>`, keyed in `source_shas` as `"commit:<sha>"` →
 * `<sha>`. That key is `source_key`, so the Skill never builds keys
 * itself (v1.2 Phase 2, F-5). Atlases written before v1.2 may hold
 * the legacy bare-sha key and `source_path`; readers accept both.
 */
export interface CommitSource {
  source_type: "commit";
  sha: string;
  subject: string;
  body: string;
  author: string;
  date: string;
  extraction_body: string;
  /**
   * Canonical `source_shas` key and claim `source_path` for this
   * commit: `commit:<sha>`. Added in v1.2 (additive).
   */
  source_key: string;
}

/** Build the manifest entry for one filtered commit. */
export function toCommitSource(commit: CommitMetadata): CommitSource {
  return {
    source_type: "commit",
    sha: commit.sha,
    subject: commit.subject,
    body: commit.body,
    author: commit.author,
    date: commit.date,
    extraction_body: buildCommitExtractionBody(commit),
    source_key: commitSourceKey(commit.sha),
  };
}

/**
 * "1": every stream is enabled. "2": `summary.disabled_streams` is not
 * empty, and a disabled stream's empty array means "keep frozen", not
 * "no sources" (see the module header).
 */
export type ManifestVersion = "1" | "2";

export interface ExtractionSourcesManifest {
  manifest_version: ManifestVersion;
  generated_at: string;
  config_root: string;
  source_root: string;
  sources: {
    adrs: AdrSource[];
    docstrings: DocstringSource[];
    commits: CommitSource[];
  };
  summary: {
    adr_count: number;
    symbols_with_docstrings: number;
    filtered_commits: number;
    /**
     * Streams turned off by `extraction.streams`, in canonical order
     * (`[]` by default). Their arrays above are empty on purpose. Added
     * in v1.2; non-empty exactly when `manifest_version` is "2".
     */
    disabled_streams: ExtractionStream[];
  };
}

/**
 * Run the list-extraction-sources subcommand. Never throws — all
 * failure paths map to exit codes + actionable stderr messages.
 */
export async function runListExtractionSourcesSubcommand(
  options: ListExtractionSourcesCliOptions,
): Promise<ListExtractionSourcesCliResult> {
  const writeStdout =
    options.writeStdout ?? ((chunk) => process.stdout.write(chunk));
  const writeStderr =
    options.writeStderr ?? ((chunk) => process.stderr.write(chunk));

  let config;
  try {
    config = options.configFile
      ? loadConfig(options.configRoot, options.configFile)
      : loadConfig(options.configRoot);
  } catch (err) {
    writeStderr(
      `list-extraction-sources: failed to load config: ${String(err)}\n`,
    );
    return { exitCode: 2 };
  }

  const sourceRoot = config.source?.root
    ? pathResolve(options.configRoot, config.source.root)
    : options.configRoot;
  const streams = resolveExtractionStreams(config);
  const disabled = disabledExtractionStreams(streams);
  const makeAdapter = options.createAdapterOverride ?? createAdapter;
  // Same LSP timeout as `index` and resolve-symbols (review round 2.3):
  // without it a slow language server timed out here at the default and
  // the Skill's Phase A gate failed, or dropped files, where the CLI
  // succeeded.
  const adapterOptions =
    config.lsp?.initializeTimeoutMs !== undefined
      ? { initializeTimeoutMs: config.lsp.initializeTimeoutMs }
      : undefined;

  const adapters = new Map<LanguageCode, LanguageAdapter>();
  try {
    // LSP adapters serve only the docstring stream; with it disabled no
    // language server starts.
    if (streams.has("docstring")) {
      for (const lang of config.languages) {
        const adapter = makeAdapter(lang, adapterOptions);
        try {
          await adapter.initialize(sourceRoot);
        } catch (err) {
          writeStderr(
            `list-extraction-sources: adapter initialization failed (${lang} at ${sourceRoot}): ${String(err)}\n`,
          );
          return { exitCode: 2 };
        }
        adapters.set(lang, adapter);
      }
    }

    const adrs = streams.has("adr")
      ? await collectAdrSources(sourceRoot, config, options.configRoot)
      : [];
    const docstrings = streams.has("docstring")
      ? await collectDocstringSources(sourceRoot, config, adapters)
      : [];
    const commits = streams.has("commit")
      ? collectCommitSources(sourceRoot, config)
      : [];

    const manifestVersion: ManifestVersion = disabled.length > 0 ? "2" : "1";
    if (manifestVersion === "2") {
      writeStderr(
        `list-extraction-sources: extraction.streams disables ` +
          `${disabled.join(", ")}, so the manifest is manifest_version "2". ` +
          "An /index-atlas skill installed before v1.2 stops on it rather " +
          "than dropping the disabled streams' claims; refresh it (see the " +
          "extraction.skills_fresh check in `contextatlas doctor`).\n",
      );
    }
    const manifest: ExtractionSourcesManifest = {
      manifest_version: manifestVersion,
      generated_at: new Date().toISOString(),
      config_root: options.configRoot,
      source_root: sourceRoot,
      sources: { adrs, docstrings, commits },
      summary: {
        adr_count: adrs.length,
        symbols_with_docstrings: docstrings.length,
        filtered_commits: commits.length,
        disabled_streams: disabled,
      },
    };

    const manifestJson = JSON.stringify(manifest, null, 2);
    if (options.outputPath) {
      const absOut = pathResolve(options.configRoot, options.outputPath);
      writeFileSync(absOut, manifestJson + "\n", "utf8");
      const disabledNote =
        disabled.length > 0
          ? `; disabled by extraction.streams: ${disabled.join(", ")}`
          : "";
      writeStdout(
        `list-extraction-sources: wrote manifest to ${absOut} ` +
          `(${adrs.length} ADRs, ${docstrings.length} symbols-with-docstrings, ${commits.length} filtered commits${disabledNote})\n`,
      );
    } else {
      writeStdout(manifestJson + "\n");
    }
    return { exitCode: 0 };
  } finally {
    await shutdownAll(adapters);
  }
}

/**
 * Stream A — ADR discovery via the shared walkProseFiles walker. Only the
 * `adr` bucket is offered to the Skill; docs-bucket prose is CLI-only
 * until Phase 6 (lead decision L-12 v).
 */
async function collectAdrSources(
  sourceRoot: string,
  config: ContextAtlasConfig,
  configRoot: string,
): Promise<AdrSource[]> {
  const proseFiles = walkProseFiles(sourceRoot, config, configRoot);
  const adrs: AdrSource[] = [];
  for (const adr of proseFiles.filter((p) => p.bucket === "adr")) {
    try {
      const content = await readFile(adr.absPath, "utf8");
      adrs.push({
        source_type: "adr",
        path: adr.relPath,
        sha: adr.sha,
        content,
      });
    } catch (err) {
      log.warn("list-extraction-sources: failed to read ADR file", {
        path: adr.relPath,
        err: String(err),
      });
    }
  }
  return adrs;
}

/**
 * Stream B — source files + symbol inventory + per-symbol
 * exported-with-docstring filter, through the CLI docstring stream's own
 * read (`readFileDocstrings`, docstring-read.ts): isExportedSymbol, then
 * a non-empty getDocstring. A file with any getDocstring failure is left
 * out whole (see the module header).
 */
async function collectDocstringSources(
  sourceRoot: string,
  config: ContextAtlasConfig,
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>,
): Promise<DocstringSource[]> {
  const excludePatterns = computeExcludePatterns(config);
  const allExtensions = new Set<string>();
  for (const adapter of adapters.values()) {
    for (const ext of adapter.extensions) allExtensions.add(ext);
  }
  const sourceFiles = walkSourceFiles(
    sourceRoot,
    [...allExtensions],
    excludePatterns,
  );
  const inventory = await buildSymbolInventory(adapters, sourceFiles);

  const docstrings: DocstringSource[] = [];
  // Group the inventory's symbols by file so each file's getDocstring
  // calls go through the adapter that owns it (the same per-file unit
  // the CLI docstring stream works in).
  const symbolsByFile = new Map<string, typeof inventory.allSymbols>();
  for (const sym of inventory.allSymbols) {
    const existing = symbolsByFile.get(sym.path);
    if (existing) existing.push(sym);
    else symbolsByFile.set(sym.path, [sym]);
  }
  for (const [relPath, fileSymbols] of symbolsByFile) {
    // Pick the language adapter that owns this file's extension.
    const adapter = pickAdapterForPath(adapters, relPath);
    if (!adapter) continue;
    const read = await readFileDocstrings(adapter, fileSymbols);
    if (read.errors.length > 0) {
      log.warn(
        `list-extraction-sources: getDocstring failed for ${relPath}; the ` +
          "file is left out of the manifest, so /index-atlas keeps its " +
          "existing claims and key. Re-run to retry once the language " +
          "server answers.",
        { relPath, errors: read.errors.map((e) => e.error) },
      );
      continue;
    }
    const byId = new Map(fileSymbols.map((sym) => [sym.id, sym]));
    for (const { symbolId, docstring } of read.entries) {
      const sym = byId.get(symbolId);
      if (!sym) continue;
      docstrings.push({
        source_type: "docstring",
        symbol_id: sym.id,
        symbol_name: sym.name,
        symbol_kind: sym.kind,
        source_path: sym.path,
        file_sha: sym.fileSha ?? "",
        line: sym.line,
        docstring,
      });
    }
  }
  return docstrings;
}

/**
 * Stream C — architectural-intent-filtered commits via the shared
 * parseCommitLog + makeDefaultCommitFilter. Best-effort: a non-git
 * checkout or a missing git binary logs a warning and yields no commits
 * rather than failing the manifest (the CLI skips the stream the same
 * way).
 */
function collectCommitSources(
  sourceRoot: string,
  config: ContextAtlasConfig,
): CommitSource[] {
  try {
    const filter = makeDefaultCommitFilter(
      config.extraction?.commitMessageFilter ?? [],
    );
    return parseCommitLog(sourceRoot, () => true)
      .filter((c: CommitMetadata) => filter(c.subject, c.body))
      .map(toCommitSource);
  } catch (err) {
    log.warn("list-extraction-sources: git log walk failed", {
      sourceRoot,
      err: String(err),
    });
    return [];
  }
}

function pickAdapterForPath(
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>,
  relPath: string,
): LanguageAdapter | null {
  for (const adapter of adapters.values()) {
    for (const ext of adapter.extensions) {
      if (relPath.endsWith(ext)) return adapter;
    }
  }
  return null;
}

async function shutdownAll(
  adapters: ReadonlyMap<LanguageCode, LanguageAdapter>,
): Promise<void> {
  for (const [lang, adapter] of adapters) {
    try {
      await adapter.shutdown();
    } catch (err) {
      log.warn("list-extraction-sources: adapter shutdown error", {
        lang,
        err: String(err),
      });
    }
  }
}
