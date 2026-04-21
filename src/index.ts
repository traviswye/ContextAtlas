#!/usr/bin/env node
/**
 * ContextAtlas MCP Server — entry point.
 *
 * Boots the server, wires the stdio transport, and hands control to the
 * MCP event loop. All logging goes to stderr (see src/mcp/logger.ts) —
 * stdout is reserved for the JSON-RPC protocol stream.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { log } from "./mcp/logger.js";
import { createServer } from "./mcp/server.js";
import { TOOLS } from "./mcp/schemas.js";

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Works whether running from src/ (tsx/vitest) or dist/ (built).
  const pkgPath = join(here, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

export async function main(): Promise<void> {
  const version = readPackageVersion();
  const server = createServer({ name: "ContextAtlas", version });

  log.info(`ContextAtlas v${version} starting`);
  log.info(`MCP protocol version: ${LATEST_PROTOCOL_VERSION}`);
  log.info(`Registered tools: ${TOOLS.map((t) => t.name).join(", ")}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info("Server ready — awaiting MCP client connection on stdio");

  const shutdown = (signal: string): void => {
    log.info(`Received ${signal}, shutting down`);
    server
      .close()
      .catch((err: unknown) => log.error("Error during shutdown", { err: String(err) }))
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  log.error("Fatal error during startup", { err: String(err) });
  process.exit(1);
});
