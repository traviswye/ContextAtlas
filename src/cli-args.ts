/**
 * CLI argument parser for the MCP runtime binary.
 *
 * Three flags accepted, both value-taking flags supporting the
 * space-separated (`--flag value`) and equals-separated (`--flag=value`)
 * forms:
 *
 *   --config-root <path>  Directory that acts as the resolution base
 *                         for the config file and for the paths the
 *                         config names (atlas.path, atlas.local_cache,
 *                         source.root). Default: process.cwd().
 *
 *   --config <file>       Specific config file to load. When relative,
 *                         resolved against --config-root. When absent,
 *                         defaults to `<config-root>/.contextatlas.yml`.
 *
 *   --check               (ADR-11) Boolean-valued. When present, the
 *                         binary loads the committed atlas, compares
 *                         its `extracted_at_sha` against current git
 *                         HEAD, and exits with a status code indicating
 *                         staleness. No MCP server starts. See
 *                         src/index.ts for the exit-code contract.
 *
 * Unknown arguments and malformed values throw with actionable error
 * messages rather than silently defaulting — a typo in either flag
 * shouldn't quietly fall back to cwd/default-filename and mask
 * misconfigurations.
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
  /**
   * Value of `--config` if passed; otherwise null. Callers pass this
   * through to `loadConfig(root, configPath?)`, which resolves a
   * relative value against the root and uses an absolute value as-is.
   */
  configFile: string | null;
  /**
   * True when `--check` was passed. Signals the caller to short-circuit
   * into staleness-detection mode rather than start the MCP server.
   */
  check: boolean;
}

const USAGE =
  "Usage: contextatlas [--config-root <path>] [--config <file>] [--check]  " +
  "(see ADR-08 + ADR-11 for when these are needed)";

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let configRoot: string | null = null;
  let configFile: string | null = null;
  let check = false;
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === "--config-root") {
      if (configRoot !== null) {
        throw new Error(
          `Flag --config-root specified more than once. ${USAGE}`,
        );
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
        throw new Error(
          `Flag --config-root specified more than once. ${USAGE}`,
        );
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
    if (arg === "--config") {
      if (configFile !== null) {
        throw new Error(
          `Flag --config specified more than once. ${USAGE}`,
        );
      }
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(
          `Flag --config requires a file path value but none was given. ${USAGE}`,
        );
      }
      if (value === "" || value.startsWith("--")) {
        throw new Error(
          `Flag --config requires a non-empty file path value; got '${value}'. ${USAGE}`,
        );
      }
      configFile = value;
      i += 2;
      continue;
    }
    if (arg.startsWith("--config=")) {
      if (configFile !== null) {
        throw new Error(
          `Flag --config specified more than once. ${USAGE}`,
        );
      }
      const value = arg.slice("--config=".length);
      if (value === "") {
        throw new Error(
          `Flag --config= requires a non-empty file path value. ${USAGE}`,
        );
      }
      configFile = value;
      i += 1;
      continue;
    }
    if (arg === "--check") {
      if (check) {
        throw new Error(`Flag --check specified more than once. ${USAGE}`);
      }
      check = true;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument '${arg}'. ${USAGE}`);
  }
  return { configRoot, configFile, check };
}
