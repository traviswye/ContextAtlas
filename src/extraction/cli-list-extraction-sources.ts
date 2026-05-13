/**
 * CLI glue for the `contextatlas list-extraction-sources` subcommand
 * (v0.7.1 Step 1.1.b.0 + Q1.1.G.α — substrate-equivalence closure at
 * /index-atlas Skill surface per Path D architecture).
 *
 * Walks all three extraction streams and emits a unified JSON manifest
 * the `/index-atlas` Skill consumes via Bash + Read. The manifest is the
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
 *               buildCommitExtractionBody (subject + body).
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
 *   2 — setup error (missing config / adapter init failure / git
 *       not on PATH)
 */

import { writeFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { createAdapter } from "../adapters/registry.js";
import { computeExcludePatterns } from "../config/exclude-patterns.js";
import { loadConfig } from "../config/parser.js";
import { log } from "../mcp/logger.js";
import type { LanguageAdapter, LanguageCode } from "../types.js";

import {
  buildCommitExtractionBody,
  makeDefaultCommitFilter,
  parseCommitLog,
  type CommitMetadata,
} from "./commit-message-extractor.js";
import { walkProseFiles, walkSourceFiles } from "./file-walker.js";
import { isExportedSymbol } from "./pipeline.js";
import { buildSymbolInventory } from "./resolver.js";

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
}

export interface ListExtractionSourcesCliResult {
  exitCode: ListExtractionSourcesExitCode;
}

/**
 * Per-ADR entry in the manifest. The Skill agent reads this entry,
 * feeds `content` to the canonical EXTRACTION_PROMPT, and emits
 * claims with `source: "adr:<path>"`, `source_path: <path>`,
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
 * channel that CLI's writeDocstringClaim populates inline.
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
 * `source: "commit:<sha>"`, `source_path: <sha>`, `source_sha: <sha>`.
 */
export interface CommitSource {
  source_type: "commit";
  sha: string;
  subject: string;
  body: string;
  author: string;
  date: string;
  extraction_body: string;
}

export interface ExtractionSourcesManifest {
  manifest_version: "1";
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

  const adapters = new Map<LanguageCode, LanguageAdapter>();
  try {
    for (const lang of config.languages) {
      const adapter = createAdapter(lang);
      try {
        await adapter.initialize(sourceRoot);
      } catch (err) {
        writeStderr(
          `list-extraction-sources: adapter initialization failed (${lang} at ${sourceRoot}): ${String(err)}\n`,
        );
        await shutdownAll(adapters);
        return { exitCode: 2 };
      }
      adapters.set(lang, adapter);
    }

    // Stream A — ADR discovery via existing walkProseFiles substrate.
    // The adrs+docs config drives walking; ProseFile records carry sha
    // and absolute path.
    const proseFiles = walkProseFiles(
      sourceRoot,
      config,
      options.configRoot,
    );
    const adrFiles = proseFiles.filter((p) => p.bucket === "adr");
    const adrs: AdrSource[] = [];
    for (const adr of adrFiles) {
      try {
        const content = await import("node:fs/promises").then((m) =>
          m.readFile(adr.absPath, "utf8"),
        );
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

    // Stream B — source files + symbol inventory + per-symbol
    // exported-with-docstring filter. Mirrors extractDocstringsForFile
    // pre-API-call filter chain at pipeline.ts:834-852 exactly.
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
    // Build per-file symbol-grouping so we can issue one listSymbols /
    // getDocstring sequence per file (parallel to extractDocstringsForFile
    // discipline at pipeline.ts:834).
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
      for (const sym of fileSymbols) {
        if (!isExportedSymbol(sym.name, sym.language)) continue;
        let docstring: string | null;
        try {
          docstring = await adapter.getDocstring(sym.id);
        } catch (err) {
          log.warn("list-extraction-sources: getDocstring failed", {
            symbolId: sym.id,
            err: String(err),
          });
          continue;
        }
        if (!docstring || docstring.trim().length === 0) continue;
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

    // Stream C — architectural-intent-filtered commits via existing
    // parseCommitLog + makeDefaultCommitFilter substrate. Skill iterates
    // per-commit, feeds extraction_body to canonical prompt.
    const commits: CommitSource[] = [];
    try {
      const filter = makeDefaultCommitFilter(
        config.extraction?.commitMessageFilter ?? [],
      );
      const allCommits = parseCommitLog(sourceRoot, () => true);
      const filtered = allCommits.filter((c: CommitMetadata) =>
        filter(c.subject, c.body),
      );
      for (const c of filtered) {
        commits.push({
          source_type: "commit",
          sha: c.sha,
          subject: c.subject,
          body: c.body,
          author: c.author,
          date: c.date,
          extraction_body: buildCommitExtractionBody(c),
        });
      }
    } catch (err) {
      // Commits stream is best-effort — non-git checkouts or missing
      // git binary surface a warning but do NOT fail the manifest. The
      // Skill workflow handles empty commits[] cleanly (no Stream C
      // claims; validate-extraction stream-coverage gate surfaces the
      // gap to user).
      log.warn("list-extraction-sources: git log walk failed", {
        sourceRoot,
        err: String(err),
      });
    }

    const manifest: ExtractionSourcesManifest = {
      manifest_version: "1",
      generated_at: new Date().toISOString(),
      config_root: options.configRoot,
      source_root: sourceRoot,
      sources: { adrs, docstrings, commits },
      summary: {
        adr_count: adrs.length,
        symbols_with_docstrings: docstrings.length,
        filtered_commits: commits.length,
      },
    };

    const manifestJson = JSON.stringify(manifest, null, 2);
    if (options.outputPath) {
      const absOut = pathResolve(options.configRoot, options.outputPath);
      writeFileSync(absOut, manifestJson + "\n", "utf8");
      writeStdout(
        `list-extraction-sources: wrote manifest to ${absOut} ` +
          `(${adrs.length} ADRs, ${docstrings.length} symbols-with-docstrings, ${commits.length} filtered commits)\n`,
      );
    } else {
      writeStdout(manifestJson + "\n");
    }
    return { exitCode: 0 };
  } finally {
    await shutdownAll(adapters);
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
