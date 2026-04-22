/**
 * CLI argument parser for the MCP runtime binary.
 *
 * The binary accepts one flag: `--config-root <path>` (or the
 * `--config-root=<path>` equal-sign form). Unknown arguments and
 * malformed values throw with actionable error messages rather than
 * silently defaulting — a typo in the flag shouldn't quietly fall
 * back to `process.cwd()` and mask misconfigurations.
 *
 * Extracted from `src/index.ts` so it's testable without triggering
 * `main()` as a side effect of importing.
 */

export interface ParsedArgs {
  /**
   * Value of `--config-root` if passed; otherwise null. Callers
   * resolve null to `process.cwd()` themselves — this module does
   * not touch the filesystem or introduce cwd-dependent defaults.
   */
  configRoot: string | null;
}

const USAGE =
  "Usage: contextatlas [--config-root <path>]  (see ADR-08 for when this is needed)";

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let configRoot: string | null = null;
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === "--config-root") {
      if (configRoot !== null) {
        throw new Error(`Flag --config-root specified more than once. ${USAGE}`);
      }
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(
          `Flag --config-root requires a path value but none was given. ${USAGE}`,
        );
      }
      if (value === "" || value.startsWith("--")) {
        throw new Error(
          `Flag --config-root requires a non-empty path value; got '${value}'. ${USAGE}`,
        );
      }
      configRoot = value;
      i += 2;
      continue;
    }
    if (arg.startsWith("--config-root=")) {
      if (configRoot !== null) {
        throw new Error(`Flag --config-root specified more than once. ${USAGE}`);
      }
      const value = arg.slice("--config-root=".length);
      if (value === "") {
        throw new Error(
          `Flag --config-root= requires a non-empty path value. ${USAGE}`,
        );
      }
      configRoot = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument '${arg}'. ${USAGE}`);
  }
  return { configRoot };
}
