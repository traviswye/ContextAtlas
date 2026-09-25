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
 *   contextatlas index --json                       # JSON summary instead of key=value
 *
 * See ADR-08 for --config-root / --config / source-root, ADR-11 for
 * --check staleness semantics, and ADR-12 for the subcommand surface.
 */

import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { createAdapter } from "./adapters/registry.js";
import { HELP_TEXT, parseArgs } from "./cli-args.js";
import { loadConfig } from "./config/parser.js";
import { runDoctorSubcommand } from "./doctor/runner.js";
import { runListExtractionSourcesSubcommand } from "./extraction/cli-list-extraction-sources.js";
import { runResolveSymbolsSubcommand } from "./extraction/cli-resolve-symbols.js";
import { runIndexSubcommand } from "./extraction/cli-runner.js";
import { runValidateAtlasSubcommand } from "./extraction/cli-validate-atlas.js";
import { runValidateExtractionSubcommand } from "./extraction/cli-validate-extraction.js";
import { loadAtlasForServer } from "./extraction/server-cache-load.js";
import { runGenerateAdrsSubcommand } from "./generation/cli-runner.js";
import { runValidateAdrsSubcommand } from "./generation/cli-validate-adrs.js";
import { runInitSubcommand } from "./init/runner.js";
import { log } from "./mcp/logger.js";
import { createServer } from "./mcp/server.js";
import { TOOLS } from "./mcp/schemas.js";
import { createObservabilityWriter } from "./observability/observe.js";
import { checkStaleness, exitCodeFor } from "./staleness.js";
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

  // 4. Load atlas.json into the cache (`server-cache-load.ts`). An empty
  //    cache (no symbols, claims or source keys) is seeded from it. With
  //    atlas.committed: true atlas.json is the source of truth (ADR-06),
  //    so a changed one (a pull, an /index-atlas refresh) is imported
  //    again, unless an `index` run over this cache is still running
  //    (a dead run's mark does not hold it off, round 2.3). With
  //    atlas.committed: false a non-empty cache is authoritative and
  //    kept, with a warning when atlas.json differs from it (v1.2
  //    Phase 2 review rounds 2.2 and 2.3). atlas.path resolves against
  //    configRoot same as local_cache.
  const atlasPath = pathResolve(configRoot, config.atlas.path);
  const symbolCount = (): number =>
    (db.prepare("SELECT COUNT(*) AS n FROM symbols").get() as { n: number }).n;
  const load = loadAtlasForServer(db, {
    atlasAbsPath: atlasPath,
    committed: config.atlas.committed,
  });
  switch (load.action) {
    case "seeded":
      log.info(`Importing atlas.json into fresh cache`, { path: atlasPath });
      log.info(`Atlas imported: ${symbolCount()} symbols`);
      break;
    case "reimported":
      if (load.abandonedRun !== undefined) {
        log.info(
          "a `contextatlas index` run over the local cache stopped before it " +
            `finished (process ${load.abandonedRun.pid} is gone), and ` +
            "atlas.json has changed since it started; that run's unsaved " +
            "work is dropped (`index` would not carry it over a changed " +
            "atlas.json either)",
          { path: atlasPath },
        );
      }
      log.info(
        "atlas.json changed since the local cache last imported or wrote it; " +
          `re-imported it (atlas.committed: true): ${symbolCount()} symbols`,
        { path: atlasPath },
      );
      break;
    case "kept-unfinished-run": {
      const who =
        load.owner === null
          ? "a `contextatlas index` run over this cache has not finished"
          : `a \`contextatlas index\` run over this cache (process ${load.owner.pid} ` +
            `on ${load.owner.host}) has not finished`;
      log.warn(
        `atlas.json differs from the local cache, but ${who}; serving the ` +
          "local cache as it stands. When that run finishes, restart the " +
          "server. If no `contextatlas index` run is in progress (the " +
          "process id was reused, or the run was on another machine sharing " +
          `this cache), delete the local cache (${cachePath}) and restart ` +
          "the server: it is rebuilt from atlas.json with no API calls.",
        { path: atlasPath },
      );
      break;
    }
    case "kept-uncommitted":
      log.warn(
        "atlas.committed is false, so the local cache is the source of truth " +
          "and atlas.json, which differs from it, is not loaded. If " +
          "`/index-atlas` wrote atlas.json, delete the local cache " +
          `(${cachePath}) and restart the server to load it; this discards ` +
          "anything only the cache holds (work of `contextatlas index` runs " +
          "in this mode). If atlas.json is left over from atlas.committed: " +
          `true, delete it. Using the local cache (${symbolCount()} symbols).`,
        { path: atlasPath },
      );
      break;
    case "kept-import-failed":
      log.warn(
        "atlas.json differs from the local cache but could not be imported; " +
          `serving the local cache as it stands (${symbolCount()} symbols). ` +
          "Fix atlas.json, then restart the server.",
        { path: atlasPath, err: load.error },
      );
      break;
    case "empty":
      log.warn(
        `No atlas.json at ${atlasPath} and local cache is empty. ` +
          "Queries will return ERR not_found until extraction runs.",
      );
      break;
    case "kept":
      log.info(`Using existing local cache (${symbolCount()} symbols)`);
      break;
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
    ...(observabilityWriter
      ? { observabilityWriter, observabilityCwd: configRoot }
      : {}),
  });

  log.info(`Registered tools: ${TOOLS.map((t) => t.name).join(", ")}`);

  // Fires on `notifications/initialized`, i.e. once the handshake has
  // completed and the negotiated version is fixed. getClientVersion /
  // getNegotiatedProtocolVersion are @deprecated in SDK v2 in favour of
  // the per-request `ctx.mcpReq.envelope` used by 2026-07-28-era
  // requests; this hand-wired stdio server only serves the 2025-era
  // initialize handshake, for which the SDK documents both accessors as
  // returning the initialize-scoped values. Revisit if the entry point
  // moves to serveStdio. Client-supplied name/version go in the
  // JSON-encoded meta so they cannot inject raw text into the log line.
  //
  // The SDK dispatches `notifications/initialized` even when the
  // preceding initialize request failed (e.g. invalid clientInfo), in
  // which case no version was negotiated. Log that as a warning rather
  // than a misleading success line.
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

  // 7. Shutdown closes the server, adapters, and DB cleanly. Run-once:
  //    a signal-driven shutdown calls server.close(), which closes the
  //    transport and fires server.onclose (below) — the guard keeps
  //    that second entry from re-running the teardown.
  let shuttingDown = false;
  const shutdown = (reason: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${reason}, shutting down`);
    (async () => {
      await server
        .close()
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

  // SDK v2's StdioServerTransport closes itself when stdin reaches EOF
  // (or a stdout write fails) and fires onclose; requests still in
  // flight at that point are aborted and NOT answered (SDK-documented;
  // 0.5.0 ignored EOF and answered them). Without this hook the process
  // would linger after the client hung up — the language-server child
  // keeps the event loop alive. Exiting here follows the MCP stdio
  // lifecycle (client closes stdin, then waits for the server to exit).
  server.onclose = () => shutdown("stdin EOF / transport close");

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info("Server ready — awaiting MCP client connection on stdio");
}

main().catch((err: unknown) => {
  log.error("Fatal error during startup", { err: String(err) });
  process.exit(1);
});
