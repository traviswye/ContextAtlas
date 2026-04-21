/**
 * Stderr-only logger for the ContextAtlas MCP server.
 *
 * DO NOT use console.log or process.stdout.write directly anywhere in this
 * codebase — stdout is reserved for the MCP protocol (JSON-RPC framing over
 * stdio). Any stray byte on stdout will corrupt the protocol stream and
 * cause the client to disconnect. Use this logger exclusively.
 */

type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, message: string, meta?: unknown): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}]`;
  const suffix = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
  process.stderr.write(`${prefix} ${message}${suffix}\n`);
}

export const log = {
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
