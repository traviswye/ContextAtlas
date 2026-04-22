#!/usr/bin/env node
/**
 * ContextAtlas MCP Server — entry point.
 *
 * Boots the server with real runtime context (config, storage, adapters),
 * wires the stdio transport, and hands control to the MCP event loop.
 * All logging goes to stderr (see src/mcp/logger.ts) — stdout is reserved
 * for the JSON-RPC protocol stream.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { createAdapter } from "./adapters/registry.js";
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
  const repoRoot = process.cwd();

  log.info(`ContextAtlas v${version} starting`);
  log.info(`MCP protocol version: ${LATEST_PROTOCOL_VERSION}`);
  log.info(`Repo root: ${repoRoot}`);

  // 1. Load config. Propagates an actionable error from loadConfig
  //    (names the absolute path, suggests creating .contextatlas.yml).
  const config = loadConfig(repoRoot);
  log.info(`Loaded config for languages=${config.languages.join(",")}`);

  // 2. Open the local cache DB. Ensure the parent directory exists
  //    (openDatabase does not create parents).
  const cachePath = pathResolve(repoRoot, config.atlas.localCache);
  mkdirSync(dirname(cachePath), { recursive: true });
  const db = openDatabase(cachePath);
  log.info(`Opened local cache at ${cachePath}`);

  // 3. If the cache is empty AND a committed atlas.json exists at the
  //    configured path, import it — the "new contributor clone" flow
  //    from ADR-06. If cache already has data, use it. If neither
  //    exists, warn but start anyway so the user sees `ERR not_found`
  //    on queries rather than a crash — and so Claude Code still
  //    discovers the tools via tools/list.
  const atlasPath = pathResolve(repoRoot, config.atlas.path);
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

  // 4. Initialize every declared adapter. Any failure is fatal —
  //    silent partial-adapter operation would produce confusing
  //    "symbol not found" results for languages the user declared.
  const adapters = new Map<LanguageCode, LanguageAdapter>();
  for (const lang of config.languages) {
    const adapter = createAdapter(lang);
    await adapter.initialize(repoRoot);
    adapters.set(lang, adapter);
    log.info(`Initialized ${lang} adapter`);
  }

  // 5. Construct the server WITH context.
  const server = createServer({
    name: "ContextAtlas",
    version,
    context: { db, adapters },
  });

  log.info(`Registered tools: ${TOOLS.map((t) => t.name).join(", ")}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info("Server ready — awaiting MCP client connection on stdio");

  // 6. Shutdown closes the server, adapters, and DB cleanly.
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
