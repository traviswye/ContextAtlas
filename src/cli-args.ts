/**
 * CLI argument parser for the contextatlas binary.
 *
 * Two modes: subcommand-dispatched operations and the no-subcommand
 * default that starts the MCP server over stdio. The distinction
 * lives in {@link ParsedArgs.subcommand}.
 *
 * Per ADR-12: flags compose, subcommands partition. Subcommand parsing
 * runs before flag parsing — the first non-flag positional argument
 * is inspected against the known subcommand table. Flags may appear on
 * either side of the subcommand name, so both
 * `contextatlas --config-root /x index` and
 * `contextatlas index --config-root /x` parse the same way.
 *
 * Flags (all accepted by default subcommand; `index` filters per
 * ADR-12's spec):
 *
 *   --config-root <path>  (ADR-08) Directory that acts as the
 *                         resolution base for the config file and for
 *                         the paths the config names (atlas.path,
 *                         atlas.local_cache, source.root).
 *                         Default: process.cwd().
 *
 *   --config <file>       (ADR-08) Specific config file to load. When
 *                         relative, resolved against --config-root.
 *                         When absent, defaults to
 *                         `<config-root>/.contextatlas.yml`.
 *
 *   --check               (ADR-11) Boolean flag on the default
 *                         (no-subcommand) invocation. Produces a
 *                         staleness probe and exits. Rejected when
 *                         combined with any subcommand — see ADR-12.
 *
 *   --full                (ADR-12) Accepted only with `index`. Bypass
 *                         SHA-diff gating and re-extract every prose
 *                         file regardless of staleness.
 *
 *   --json                (ADR-12) Accepted only with `index`. Emit
 *                         the completion summary as a JSON object on
 *                         stdout instead of the default `key=value`
 *                         lines.
 *
 *   --budget-warn <usd>   (v0.2 Stream A #2) Accepted only with `index`.
 *                         When the cumulative extraction API cost
 *                         exceeds this threshold during a run, a
 *                         single warning is logged to stderr. Not a
 *                         hard cap — run continues. Overrides
 *                         `extraction.budget_warn_usd` from the config
 *                         file when both are specified.
 *
 * Unknown arguments throw with actionable errors. Unknown
 * subcommand names get the "did you mean?" suggestion treatment when
 * they're close to a real name (prominently "reindex" → "index", per
 * ADR-12's note about muscle memory from ADR-11's pre-amendment text).
 *
 * Extracted from `src/index.ts` so it's testable without triggering
 * `main()` as a side effect of importing.
 */

export type Subcommand = "mcp" | "index";

export interface ParsedArgs {
  /**
   * Which operation the user invoked. `"mcp"` is the no-subcommand
   * default — the binary starts the MCP server on stdio. Named
   * subcommands (v0.1: just `"index"`) short-circuit into their own
   * code paths before MCP setup runs.
   */
  subcommand: Subcommand;
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
   * Rejected when combined with any subcommand — see ADR-12.
   */
  check: boolean;
  /**
   * True when `--full` was passed alongside `index`. Bypasses SHA-diff
   * gating in the extraction pipeline. Rejected on any non-`index`
   * invocation. Per ADR-12.
   */
  full: boolean;
  /**
   * True when `--json` was passed alongside `index`. Switches the
   * completion summary from `key=value` lines to a single JSON
   * object. Rejected on any non-`index` invocation. Per ADR-12.
   */
  json: boolean;
  /**
   * Value of `--budget-warn <usd>` if passed; otherwise null. When
   * present, overrides `extraction.budget_warn_usd` from the config
   * file. Non-negative finite number. Rejected on any non-`index`
   * invocation. Per v0.2 Stream A #2.
   */
  budgetWarn: number | null;
}

const USAGE =
  "Usage: contextatlas [index] [--config-root <path>] [--config <file>] " +
  "[--check] [--full] [--json] [--budget-warn <usd>]  " +
  "(see ADR-08, ADR-11, ADR-12)";

const KNOWN_SUBCOMMANDS: readonly Subcommand[] = ["index"];

/**
 * Common mistakes mapped to the right subcommand name. Kept small and
 * explicit rather than using a fuzzy-match library — the surface is
 * tiny in v0.1 and a handful of common slips cover it. The ADR-11
 * pre-amendment text used `--reindex`, so muscle memory will reach
 * for it; that specific case gets the suggestion treatment.
 */
const SUBCOMMAND_SUGGESTIONS: Record<string, Subcommand> = {
  reindex: "index",
  extract: "index",
  refresh: "index",
  build: "index",
  init: "index",
};

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let configRoot: string | null = null;
  let configFile: string | null = null;
  let check = false;
  let full = false;
  let json = false;
  let budgetWarn: number | null = null;
  let subcommand: Subcommand = "mcp";
  let subcommandSeen = false;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    // Subcommand detection — any non-flag positional that matches the
    // known table. The first one wins; a second one throws.
    if (!arg.startsWith("-")) {
      if (subcommandSeen) {
        throw new Error(
          `Unexpected positional argument '${arg}'. Only one subcommand is allowed. ${USAGE}`,
        );
      }
      if ((KNOWN_SUBCOMMANDS as readonly string[]).includes(arg)) {
        subcommand = arg as Subcommand;
        subcommandSeen = true;
        i += 1;
        continue;
      }
      const suggestion = SUBCOMMAND_SUGGESTIONS[arg];
      if (suggestion) {
        throw new Error(
          `Unknown subcommand '${arg}'. Did you mean '${suggestion}'? ${USAGE}`,
        );
      }
      throw new Error(
        `Unknown subcommand '${arg}'. Known subcommands: ${KNOWN_SUBCOMMANDS.join(", ")}. ${USAGE}`,
      );
    }

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
    if (arg === "--full") {
      if (full) {
        throw new Error(`Flag --full specified more than once. ${USAGE}`);
      }
      full = true;
      i += 1;
      continue;
    }
    if (arg === "--json") {
      if (json) {
        throw new Error(`Flag --json specified more than once. ${USAGE}`);
      }
      json = true;
      i += 1;
      continue;
    }
    if (arg === "--budget-warn") {
      if (budgetWarn !== null) {
        throw new Error(
          `Flag --budget-warn specified more than once. ${USAGE}`,
        );
      }
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(
          `Flag --budget-warn requires a USD value but none was given. ${USAGE}`,
        );
      }
      if (value === "" || value.startsWith("--")) {
        throw new Error(
          `Flag --budget-warn requires a non-empty USD value; got '${value}'. ${USAGE}`,
        );
      }
      budgetWarn = parseBudgetWarn(value);
      i += 2;
      continue;
    }
    if (arg.startsWith("--budget-warn=")) {
      if (budgetWarn !== null) {
        throw new Error(
          `Flag --budget-warn specified more than once. ${USAGE}`,
        );
      }
      const value = arg.slice("--budget-warn=".length);
      if (value === "") {
        throw new Error(
          `Flag --budget-warn= requires a non-empty USD value. ${USAGE}`,
        );
      }
      budgetWarn = parseBudgetWarn(value);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument '${arg}'. ${USAGE}`);
  }

  // ADR-12 flag-vs-subcommand compatibility rules.
  if (check && subcommand !== "mcp") {
    throw new Error(
      `Flag --check cannot be combined with subcommand '${subcommand}'. ` +
        "The --check staleness probe is a standalone operation. " +
        "Run 'contextatlas --check' or 'contextatlas index' separately.",
    );
  }
  if (full && subcommand !== "index") {
    throw new Error(
      `Flag --full is only accepted with the 'index' subcommand. ${USAGE}`,
    );
  }
  if (json && subcommand !== "index") {
    throw new Error(
      `Flag --json is only accepted with the 'index' subcommand. ${USAGE}`,
    );
  }
  if (budgetWarn !== null && subcommand !== "index") {
    throw new Error(
      `Flag --budget-warn is only accepted with the 'index' subcommand. ${USAGE}`,
    );
  }

  return {
    subcommand,
    configRoot,
    configFile,
    check,
    full,
    json,
    budgetWarn,
  };
}

function parseBudgetWarn(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(
      `Flag --budget-warn requires a non-negative number (USD); got '${raw}'. ${USAGE}`,
    );
  }
  return n;
}
