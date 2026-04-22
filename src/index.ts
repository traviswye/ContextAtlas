#!/usr/bin/env node
/**
 * ContextAtlas MCP Server — entry point.
 *
 * Boots the server with real runtime context (config, storage, adapters),
 * wires the stdio transport, and hands control to the MCP event loop.
 * All logging goes to stderr (see src/mcp/logger.ts) — stdout is reserved
 * for the JSON-RPC protocol stream.
 *
 * CLI:
 *   contextatlas                                    # common case: .contextatlas.yml at cwd
 *   contextatlas --config-root <dir>                # benchmarks-style: config lives elsewhere
 *   contextatlas --config-root <dir> --config <file> # pick one of many configs in <dir>
 *   contextatlas --config <file>                    # same as above but configRoot = cwd
 *
 * See ADR-08 for the config-root / config-file / source-root story.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { createAdapter } from "./adapters/registry.js";
import { parseArgs } from "./cli-args.js";
import { loadConfig } from "./config/parser.js";
import { log } from "./mcp/logger.js";
import { createServer } from "./mcp/server.js";
import { TOOLS } from "./mcp/schemas.js";
import { importAtlasFile } from "./storage/atlas-importer.js";
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
  const { configRoot: configRootArg, configFile: configFileArg } = parseArgs(
    process.argv.slice(2),
  );
  const configRoot = configRootArg
    ? pathResolve(configRootArg)
    : process.cwd();

  log.info(`ContextAtlas v${version} starting`);
  log.info(`MCP protocol version: ${LATEST_PROTOCOL_VERSION}`);
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

  // 3. Open the local cache DB. atlas.local_cache is resolved against
  //    configRoot — it lives with the committed atlas, not with source.
  const cachePath = pathResolve(configRoot, config.atlas.localCache);
  mkdirSync(dirname(cachePath), { recursive: true });
  const db = openDatabase(cachePath);
  log.info(`Opened local cache at ${cachePath}`);

  // 4. Import committed atlas.json into fresh cache if present.
  //    atlas.path resolves against configRoot same as local_cache.
  const atlasPath = pathResolve(configRoot, config.atlas.path);
  const symbolCount = (
    db.prepare("SELECT COUNT(*) AS n FROM symbols").get() as { n: number }
  ).n;
  if (symbolCount === 0 && existsSync(atlasPath)) {
    log.info(`Importing atlas.json into fresh cache`, { path: atlasPath });
    importAtlasFile(db, atlasPath);
    const newCount = (
      db.prepare("SELECT COUNT(*) AS n FROM symbols").get() as { n: number }
    ).n;
    log.info(`Atlas imported: ${newCount} symbols`);
  } else if (symbolCount === 0) {
    log.warn(
      `No atlas.json at ${atlasPath} and local cache is empty. ` +
        "Queries will return ERR not_found until extraction runs.",
    );
  } else {
    log.info(`Using existing local cache (${symbolCount} symbols)`);
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

  // 6. Construct the server WITH context.
  const server = createServer({
    name: "ContextAtlas",
    version,
    context: { db, adapters },
  });

  log.info(`Registered tools: ${TOOLS.map((t) => t.name).join(", ")}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info("Server ready — awaiting MCP client connection on stdio");

  // 7. Shutdown closes the server, adapters, and DB cleanly.
  const shutdown = (signal: string): void => {
    log.info(`Received ${signal}, shutting down`);
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
}

main().catch((err: unknown) => {
  log.error("Fatal error during startup", { err: String(err) });
  process.exit(1);
});
