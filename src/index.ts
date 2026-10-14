#!/usr/bin/env node
/**
 * ContextAtlas binary — entry point.
 *
 * Per ADR-12, the binary supports two modes:
 *
 *   - **Default (no subcommand):** start the MCP server over stdio.
 *     This path is a hard external contract — MCP clients spawn the
 *     binary with no args and expect stdio JSON-RPC. All logging goes
 *     to stderr (see src/mcp/logger.ts); stdout is reserved for the
 *     JSON-RPC protocol stream.
 *   - **`index` subcommand:** run the extraction pipeline and exit.
 *     Produces `key=value` (or `--json`) summary on stdout.
 *
 * CLI:
 *   contextatlas                                    # MCP server over stdio
 *   contextatlas --config-root <dir>                # benchmarks-style: config lives elsewhere
 *   contextatlas --config-root <dir> --config <file> # pick one of many configs in <dir>
 *   contextatlas --config <file>                    # same as above but configRoot = cwd
 *   contextatlas --check                            # staleness probe; exits without starting MCP
 *   contextatlas index                              # run extraction pipeline
 *   contextatlas index --full                       # force full re-extract
 *   contextatlas index --structural                 # Tier 0: no model calls; queue changes
 *   contextatlas index --json                       # JSON summary instead of key=value
 *
 * See ADR-08 for --config-root / --config / source-root, ADR-11 for
 * --check staleness semantics, and ADR-12 for the subcommand surface.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";
import { serveStdio, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";

import { createAdapter } from "./adapters/registry.js";
import { HELP_TEXT, parseArgs } from "./cli-args.js";
import { loadConfig } from "./config/parser.js";
import { runDoctorSubcommand } from "./doctor/runner.js";
import { runListExtractionSourcesSubcommand } from "./extraction/cli-list-extraction-sources.js";
import { runResolveSymbolsSubcommand } from "./extraction/cli-resolve-symbols.js";
import { runIndexSubcommand } from "./extraction/cli-runner.js";
import { runValidateAtlasSubcommand } from "./extraction/cli-validate-atlas.js";
import { runValidateExtractionSubcommand } from "./extraction/cli-validate-extraction.js";
import { runGenerateAdrsSubcommand } from "./generation/cli-runner.js";
import { runValidateAdrsSubcommand } from "./generation/cli-validate-adrs.js";
import { runHooksSubcommand } from "./hooks/cli.js";
import { runInitSubcommand } from "./init/runner.js";
import { liveRunLock } from "./extraction/run-lock.js";
import { AtlasReloader, RequestGate } from "./mcp/atlas-reload.js";
import { log } from "./mcp/logger.js";
import { createServer } from "./mcp/server.js";
import { TOOLS } from "./mcp/schemas.js";
import { createObservabilityWriter } from "./observability/observe.js";
import { checkStaleness, exitCodeFor } from "./staleness.js";
import {
  atlasGeneratedAtMismatch,
  importAtlasFile,
  isCacheEmpty,
} from "./storage/atlas-importer.js";
import { openDatabase } from "./storage/db.js";
import type { LanguageAdapter, LanguageCode } from "./types.js";

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Works whether running from src/ (tsx/vitest) or dist/ (built).
  const pkgPath = join(here, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

export async function main(): Promise<void> {
  const version = readPackageVersion();

  // Parse CLI args. Flag parsing errors surface via main().catch → log +
  // exit 1, same path as a malformed config.
  const parsed = parseArgs(process.argv.slice(2));
  const {
    subcommand,
    configRoot: configRootArg,
    configFile: configFileArg,
    check,
  } = parsed;
  const configRoot = configRootArg
    ? pathResolve(configRootArg)
    : process.cwd();

  // v0.7 Step 2.2.b.0 FO-4 — --version + --help short-circuit before
  // any subcommand dispatch (POSIX-convention launch-readiness UX).
  // Read-only + idempotent + no config / adapter setup required.
  if (parsed.version) {
    process.stdout.write(`contextatlas ${version}\n`);
    process.exit(0);
  }
  if (parsed.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    process.exit(0);
  }

  // ADR-12 dispatch: the `index` subcommand runs the extraction
  // pipeline and exits. It does not load MCP-server-specific code
  // paths, does not start the stdio transport, and has its own
  // exit-code contract. Dispatch runs before config load so
  // subcommand-specific config-error semantics stay owned by
  // subcommand code.
  // v0.7 Step 2.3.b.0 — show-prompt + show-generate-prompt CLI
  // subcommands removed entirely per Travis β-bounded Lock 1.
  // Skills consume canonical prompts via Read tool against
  // `.contextatlas/prompts/extraction.md` +
  // `.contextatlas/prompts/generate-adrs.md` artifacts (init-
  // copied from the installed package at Step 2.3.a.0).
  // Empirical evidence at Step 2.3 re-verification showed agents
  // chose Bash injection of the deprecated subcommand even when
  // SKILL.md instructed Read tool; hard removal eliminates the
  // alternative path. R4 manifestation triage per Travis
  // foundational-substrate-consistency framing.

  // v0.7 Step 2.3.c.0 — validate-adrs subcommand. β-bounded
  // mechanical floor enforcement for ADR depth per Travis Lock 1 +
  // refinement adjudications. Reads docs/adr/*.md; validates each
  // ADR against canonical depth-floor invariants (frontmatter
  // present + canonical sections + ≥2 symbol-with-line citations
  // + ≥2 distinct named alternatives + ≥1 code block + ≥3
  // Rationale items + ≥3 Consequences items + 600-line ceiling
  // hard fail). Used as MANDATORY GATE (Phase C) in /generate-adrs
  // Skill workflow.
  if (subcommand === "validate-adrs") {
    const result = await runValidateAdrsSubcommand({
      configRoot,
      configFile: configFileArg,
    });
    process.exit(result.exitCode);
  }

  // v0.7 Step 2.3.b.0 — validate-atlas subcommand. β-bounded
  // mechanical schema validation at CLI boundary per Travis Lock 1.
  // Reads atlas.json; validates canonical AtlasFileV1 v1.4 shape;
  // structured remediation guidance to stderr on failure (exit 2);
  // exit 0 on success. Used as MANDATORY GATE in /index-atlas Skill
  // workflow between atlas write + resolve-symbols invocation.
  if (subcommand === "validate-atlas") {
    const result = await runValidateAtlasSubcommand({
      configRoot,
      configFile: configFileArg,
    });
    process.exit(result.exitCode);
  }

  // v0.7 Step 2.3.a.1 — resolve-symbols subcommand. Approach D
  // Skill→LSP bridge: enriches a Skill-produced claims-only atlas
  // with LSP-resolved symbol IDs + a fresh symbols[] inventory.
  // Zero API calls (local LSP subprocess only). Read-only on config;
  // atomic write on atlas.json.
  if (subcommand === "resolve-symbols") {
    const result = await runResolveSymbolsSubcommand({
      configRoot,
      configFile: configFileArg,
    });
    process.exit(result.exitCode);
  }

  // v0.7.1 Step 1.1.b.0 + Q1.1.G.α — list-extraction-sources
  // subcommand. Walks all three extraction streams (ADRs +
  // source-symbols-with-docstrings + filtered commits) and emits a
  // unified JSON manifest the /index-atlas Skill consumes via Bash +
  // Read at Phase A iteration discipline. Substrate-equivalence-by-
  // construction at source-discovery layer; mechanical floor for
  // Path D closure of v0.7 Step 2.3.b.0 substrate-equivalence claim
  // falsified empirically at v0.8 Step 1.1.b factorial. Zero
  // Anthropic API cost.
  if (subcommand === "list-extraction-sources") {
    const result = await runListExtractionSourcesSubcommand({
      configRoot,
      configFile: configFileArg,
      outputPath: parsed.output,
    });
    process.exit(result.exitCode);
  }

  // v0.7.1 Step 1.1.b.0 + Q1.1.G.α — validate-extraction subcommand.
  // β-bounded mechanical floor enforcement for atlas extraction
  // quality at the CLI boundary (parallel to Step 2.3.c.0
  // validate-adrs for ADR depth). Reads atlas.json; validates
  // per-ADR claims-count depth-floor (≥8; calibrated against v0.8
  // Stage 2.a CLI three-repo empirical mean of ~12.6) + per-source
  // coverage (every source_shas entry has ≥1 matching claim).
  // Used as MANDATORY GATE (Phase C extended) in /index-atlas Skill
  // workflow after validate-atlas + before resolve-symbols.
  if (subcommand === "validate-extraction") {
    const result = await runValidateExtractionSubcommand({
      configRoot,
      configFile: configFileArg,
    });
    process.exit(result.exitCode);
  }

  // v0.7 Step 2.2.a.1 — generate-adrs subcommand dispatches to the
  // Generator factory (skeleton at Step 2.2.a.1; substantive
  // generation work lands at Step 2.2.a.2). --reference-context CLI
  // flag wires into GeneratorContext.referenceContextPath per Path 1
  // scope expansion + Travis SECOND substantive reframe.
  if (subcommand === "generate-adrs") {
    const result = await runGenerateAdrsSubcommand({
      configRoot,
      configFile: configFileArg,
      contextatlasVersion: version,
      budgetWarnOverride: parsed.budgetWarn,
      skipConfirmation: parsed.yes,
      ...(parsed.referenceContext !== null
        ? { referenceContextPath: parsed.referenceContext }
        : {}),
    });
    process.exit(result.exitCode);
  }

  if (subcommand === "index") {
    const result = await runIndexSubcommand({
      configRoot,
      configFile: configFileArg,
      full: parsed.full,
      structural: parsed.structural,
      noExport: parsed.noExport,
      json: parsed.json,
      verbose: parsed.verbose,
      budgetWarnOverride: parsed.budgetWarn,
      narrowAttributionOverride: parsed.narrowAttribution,
      contextatlasVersion: version,
    });
    process.exit(result.exitCode);
  }

  // v0.4 Stream B Step 8 — Doctor subcommand reports diagnostic-only
  // self-check on ContextAtlas configuration + state.
  // v1.2 Phase 5 — git hooks for Tier 0 structural refresh.
  if (subcommand === "hooks" && parsed.hooksAction !== null) {
    const result = await runHooksSubcommand({
      configRoot,
      configFile: configFileArg,
      action: parsed.hooksAction,
    });
    process.exit(result.exitCode);
  }

  if (subcommand === "doctor") {
    const result = await runDoctorSubcommand({
      repoRoot: configRoot,
      json: parsed.json,
    });
    process.exit(result.exitCode);
  }

  // v0.6 Step 4 — Init subcommand orchestrates the v0.6 onboarding
  // pipeline (A4 lazy-spawn + A6 doctor + H5 state-detection + atlas
  // creation + smoke test + MCP registration). Per Q4.0.2 lock at
  // v0.6 Step 4.0 design adjudications.
  if (subcommand === "init") {
    const result = await runInitSubcommand({
      configRoot,
      configFile: configFileArg,
      ccOnly: parsed.ccOnly,
      observe: parsed.observe,
      json: parsed.json,
      yes: parsed.yes,
    });
    process.exit(result.exitCode);
  }

  log.info(`ContextAtlas v${version} starting`);
  // LATEST_PROTOCOL_VERSION is the SDK's ceiling for the initialize
  // handshake, NOT the version any given client ends up on — the
  // server echoes the client's requested version when it is supported.
  // The negotiated value is logged per client in `oninitialized` below.
  log.info(
    `MCP SDK max supported protocol version: ${LATEST_PROTOCOL_VERSION} ` +
      "(negotiated version is logged when a client initializes)",
  );
  log.info(`Config root: ${configRoot}`);

  // 1. Load config. When --config is passed, loadConfig resolves it
  //    against configRoot (relative) or uses it as-is (absolute),
  //    matching the library's existing loadConfig(root, configPath?)
  //    semantics. The resolved absolute path is logged unconditionally
  //    so "which config loaded?" is always answerable from the log.
  const config = configFileArg
    ? loadConfig(configRoot, configFileArg)
    : loadConfig(configRoot);
  const resolvedConfigPath = pathResolve(
    configRoot,
    configFileArg ?? ".contextatlas.yml",
  );
  log.info(
    `Loaded config at ${resolvedConfigPath} (languages: ${config.languages.join(", ")})`,
  );

  // 2. Derive source root from config's optional source.root, falling
  //    back to configRoot for the common single-root case. This is the
  //    ADR-08 runtime extension: config lives at configRoot, source
  //    lives at sourceRoot, adapters initialize against sourceRoot.
  const sourceRoot = config.source?.root
    ? pathResolve(configRoot, config.source.root)
    : configRoot;
  log.info(`Source root: ${sourceRoot}`);

  // 2b. --check short-circuit (ADR-11). Performs atlas-vs-HEAD SHA
  //     comparison, writes a human-readable message to stderr, and
  //     exits with the documented status code (0 current, 1 stale,
  //     2 unknown) without starting adapters or the MCP server.
  if (check) {
    const atlasPath = pathResolve(configRoot, config.atlas.path);
    const report = checkStaleness({ atlasPath, repoRoot: sourceRoot });
    log.info(`staleness: ${report.status}`, {
      atlasSha: report.atlasSha,
      currentSha: report.currentSha,
    });
    // Staleness message goes to stderr via logger so stdout stays
    // clean for any future machine-readable flag (e.g. --check --json).
    log.info(report.message);
    process.exit(exitCodeFor(report.status));
  }

  // 3. Open the local cache DB. atlas.local_cache is resolved against
  //    configRoot — it lives with the committed atlas, not with source.
  const cachePath = pathResolve(configRoot, config.atlas.localCache);
  mkdirSync(dirname(cachePath), { recursive: true });
  const db = openDatabase(cachePath);
  log.info(`Opened local cache at ${cachePath}`);

  // 4. Import committed atlas.json into fresh cache if present.
  //    atlas.path resolves against configRoot same as local_cache.
  //    "Fresh" is `isCacheEmpty` (no symbols, claims or source keys), the
  //    rule `contextatlas index` uses to seed a cache with
  //    atlas.committed: false. Counting symbols alone replaced a
  //    symbol-less cache (a docs-only repo) with a leftover atlas.json on
  //    every start (v1.2 Phase 2 review round 2). A cache that has
  //    content is served as it is, never re-imported (reload on change
  //    is v1.2 Phase 4); when atlas.json's generated_at differs from the
  //    cache's, the server says how to load it (v1.2 Phase 2).
  //
  //    With atlas.committed: true (v1.2 Phase 4) atlas.json is the source
  //    of truth: the reloader imports it now unless the cache already
  //    holds it (same generated_at), and watches it once the server is
  //    up. With false the cache is the truth (lead decision L-19): seed
  //    only, never reload, warn on a mismatch.
  const atlasPath = pathResolve(configRoot, config.atlas.path);
  const symbolCount = (
    db.prepare("SELECT COUNT(*) AS n FROM symbols").get() as { n: number }
  ).n;
  const gate = new RequestGate();
  const reloader = config.atlas.committed
    ? new AtlasReloader({
        db,
        atlasPath,
        gate,
        isIndexRunning: () => liveRunLock(configRoot) !== null,
      })
    : null;
  if (reloader !== null && existsSync(atlasPath)) {
    const outcome = await reloader.reloadIfChanged();
    if (outcome === "already-current") {
      log.info(`Using existing local cache (${symbolCount} symbols; matches atlas.json)`);
    } else if (outcome === "deferred") {
      log.info(
        "A contextatlas index run is in progress; serving the local cache until " +
          "it finishes, then atlas.json is checked again.",
      );
    } else if (outcome === "failed" && !isCacheEmpty(db)) {
      log.warn("Serving the existing local cache; atlas.json failed to load (see above).");
    }
  } else if (isCacheEmpty(db) && existsSync(atlasPath)) {
    log.info(`Importing atlas.json into fresh cache`, { path: atlasPath });
    importAtlasFile(db, atlasPath);
    const newCount = (
      db.prepare("SELECT COUNT(*) AS n FROM symbols").get() as { n: number }
    ).n;
    log.info(`Atlas imported: ${newCount} symbols`);
  } else if (isCacheEmpty(db)) {
    log.warn(
      `No atlas.json at ${atlasPath} and local cache is empty. ` +
        "Queries will return ERR not_found until extraction runs.",
    );
  } else {
    log.info(`Using existing local cache (${symbolCount} symbols)`);
    const mismatch = existsSync(atlasPath)
      ? atlasGeneratedAtMismatch(db, atlasPath)
      : null;
    if (mismatch !== null) {
      log.warn(
        `atlas.json (generated_at ${mismatch.atlasJson}) is not the atlas the ` +
          `local cache holds (generated_at ${mismatch.cache ?? "absent"}). With ` +
          "atlas.committed: false the local cache is the source of truth, so " +
          "the server serves it and neither imports nor watches atlas.json. To " +
          "serve atlas.json instead (for example after an /index-atlas run), " +
          "stop the server (exit Claude Code, or disconnect `contextatlas` in " +
          `/mcp), delete the local cache (${cachePath}), and restart: it is ` +
          "rebuilt from atlas.json with no API calls, discarding anything only " +
          "the cache holds. Or set atlas.committed: true to have the server " +
          "reload atlas.json whenever it changes.",
        { path: atlasPath },
      );
    }
  }

  // 5. Initialize every declared adapter against sourceRoot. Any
  //    failure is fatal. When config.source.root drove the resolution,
  //    surface that field in the error so users know where to look.
  const adapters = new Map<LanguageCode, LanguageAdapter>();
  for (const lang of config.languages) {
    const adapter = createAdapter(lang);
    try {
      await adapter.initialize(sourceRoot);
    } catch (err) {
      if (config.source?.root !== undefined) {
        log.error(
          `Adapter initialization failed: source.root resolved to '${sourceRoot}' ` +
            `(from config.source.root='${config.source.root}' relative to configRoot ` +
            `'${configRoot}'). Check that the path exists.`,
          { err: String(err) },
        );
      } else {
        log.error(
          `Adapter initialization failed at '${sourceRoot}'. ` +
            "This is the configRoot (no config.source.root set); either run the " +
            "binary from the source directory or set source.root in your config.",
          { err: String(err) },
        );
      }
      throw err;
    }
    adapters.set(lang, adapter);
    log.info(`Initialized ${lang} adapter at ${sourceRoot}`);
  }

  // 6. Construct the server WITH context. gitRecentCommits comes from
  //    config — same knob used during extraction for the "recent N" and
  //    hotness threshold (ADR-11). symbolContextBM25 (ADR-16) is the
  //    Step 6 Fix 3 flag — defaults false; when true, get_symbol_context
  //    BM25-ranks claims against an optional caller-provided query.
  //
  //    Observability (v0.6 Step 6.2 / Q6.0.4 hybrid + ADR-20): enabled
  //    when EITHER config.observability.enabled is true OR --observe
  //    flag was passed. --observe flag is per-session override (Q6.0.4
  //    hybrid lock) — does not require config edit.
  const observabilityEnabled =
    parsed.observe || config.observability?.enabled === true;
  const observabilityWriter = observabilityEnabled
    ? createObservabilityWriter({
        logPath: pathResolve(
          configRoot,
          config.observability?.logPath ?? ".contextatlas/observe-log.jsonl",
        ),
        contextatlasVersion: version,
      })
    : undefined;
  if (observabilityEnabled) {
    log.info(
      `Cohort observability enabled (ADR-20). Log path: ${pathResolve(
        configRoot,
        config.observability?.logPath ?? ".contextatlas/observe-log.jsonl",
      )}`,
    );
  }
  // 6b. Serve over stdio from a factory (v1.2 Phase 4, lead decision
  //     L-20). serveStdio builds one instance per connection, plus a
  //     discarded probe when a client opens with `server/discover`; it
  //     serves 2025-era `initialize` clients exactly as the hand-wired
  //     transport did, and 2026-07-28 clients too. Every instance shares
  //     the cache, adapters and reload gate, so a hot reload reaches all.
  const buildServer = ({ era }: { era: "legacy" | "modern" }): ReturnType<typeof createServer> => {
    const server = createServer({
      name: "ContextAtlas",
      version,
      context: {
        db,
        adapters,
        gitRecentCommits: config.git.recentCommits,
        ...(config.mcp?.symbolContextBM25 === true
          ? { symbolContextBM25: true }
          : {}),
      },
      gate,
      ...(observabilityWriter
        ? { observabilityWriter, observabilityCwd: configRoot }
        : {}),
    });
    if (era === "modern") {
      log.info("MCP connection: serving protocol revision 2026-07-28 (server/discover)");
      return server;
    }
    // Fires on `notifications/initialized` of a 2025-era connection.
    // getClientVersion / getNegotiatedProtocolVersion are @deprecated in
    // SDK v2 in favour of the per-request envelope of 2026-07-28-era
    // requests; for the 2025-era initialize handshake the SDK documents
    // both as returning the initialize-scoped values. Client-supplied
    // name/version go in the JSON-encoded meta so they cannot inject raw
    // text into the log line. The SDK dispatches the notification even
    // when the initialize request failed (no version negotiated); that is
    // logged as a warning.
    server.oninitialized = () => {
      const clientInfo = server.getClientVersion();
      const clientMeta = {
        clientName: clientInfo?.name ?? null,
        clientVersion: clientInfo?.version ?? null,
      };
      const negotiated = server.getNegotiatedProtocolVersion();
      if (negotiated === undefined) {
        log.warn(
          "MCP client sent notifications/initialized without a successful " +
            "initialize handshake (no protocol version negotiated)",
          clientMeta,
        );
        return;
      }
      log.info(
        `MCP client initialized (negotiated protocol version: ${negotiated})`,
        clientMeta,
      );
    };
    return server;
  };

  log.info(`Registered tools: ${TOOLS.map((t) => t.name).join(", ")}`);

  // 7. Shutdown stops the reloader and closes the connection, adapters
  //    and DB. Run-once: several triggers can fire for one exit.
  let handle: StdioServerHandle | null = null;
  let shuttingDown = false;
  const shutdown = (reason: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${reason}, shutting down`);
    reloader?.stop();
    (async () => {
      await handle
        ?.close()
        .catch((err: unknown) =>
          log.debug(`Error during server close: ${String(err)}`),
        );
      for (const [lang, adapter] of adapters) {
        await adapter
          .shutdown()
          .catch((err: unknown) =>
            log.error(`Error shutting down ${lang} adapter`, {
              err: String(err),
            }),
          );
      }
      db.close();
    })().finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // The MCP stdio lifecycle: the client closes stdin, then waits for the
  // server to exit. The transport closes itself on stdin EOF (requests
  // still in flight are aborted, not answered; SDK-documented), but the
  // language-server children and the atlas watch keep the event loop
  // alive, so exit explicitly. Keyed off stdin, not an instance's
  // onclose: serveStdio closes a discarded `server/discover` probe
  // instance while the connection stays up.
  process.stdin.once("end", () => shutdown("stdin EOF"));
  process.stdin.once("close", () => shutdown("stdin close"));

  handle = serveStdio(buildServer, {
    onerror: (err) => log.debug(`stdio: ${err.message}`),
  });
  reloader?.start();

  log.info("Server ready — awaiting MCP client connection on stdio");
}

main().catch((err: unknown) => {
  log.error("Fatal error during startup", { err: String(err) });
  process.exit(1);
});
