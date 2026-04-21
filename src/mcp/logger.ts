/**
 * Stderr-only logger for the ContextAtlas MCP server.
 *
 * DO NOT use console.log or process.stdout.write directly anywhere in this
 * codebase — stdout is reserved for the MCP protocol (JSON-RPC framing over
 * stdio). Any stray byte on stdout will corrupt the protocol stream and
 * cause the client to disconnect. Use this logger exclusively.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Minimum level that's actually emitted. `debug` is noisy and off by
 * default; enable by setting CONTEXTATLAS_LOG_LEVEL=debug. Everything
 * else always prints. Keeping this as a runtime env check (not a
 * compile-time config) so operators can turn it up without rebuilding.
 */
function currentMinLevel(): LogLevel {
  const raw = process.env.CONTEXTATLAS_LOG_LEVEL?.toLowerCase();
  return raw === "debug" ? "debug" : "info";
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function write(level: LogLevel, message: string, meta?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentMinLevel()]) return;
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}]`;
  const suffix = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
  process.stderr.write(`${prefix} ${message}${suffix}\n`);
}

export const log = {
  debug(message: string, meta?: unknown): void {
    write("debug", message, meta);
  },
  info(message: string, meta?: unknown): void {
    write("info", message, meta);
  },
  warn(message: string, meta?: unknown): void {
    write("warn", message, meta);
  },
  error(message: string, meta?: unknown): void {
    write("error", message, meta);
  },
};
