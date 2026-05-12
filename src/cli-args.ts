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
 *   --verbose             (v0.2 Stream A #3) Accepted only with `index`.
 *                         Emits per-file unresolved-token detail to
 *                         stderr at the end of the run (grouped by
 *                         source file, with claim text and frontmatter-
 *                         vs-claim origin). Default stdout summary
 *                         unchanged; verbose affects the diagnostic
 *                         channel only.
 *
 *   --narrow-attribution=<drop|drop-with-fallback>
 *                         (v0.3 Theme 1.2 Fix 2) Accepted only with
 *                         `index`. Enables claim-attribution narrowing
 *                         to mitigate the muddy-bundle mechanism
 *                         documented in Phase 6 §5.1. `drop` removes
 *                         frontmatter inheritance entirely (the
 *                         cleanest experimental knob). `drop-with-
 *                         fallback` drops, but recovers claims that
 *                         would otherwise attach to zero symbols.
 *                         Overrides `extraction.narrow_attribution`
 *                         from the config file when both are specified.
 *                         Both `--narrow-attribution drop` and
 *                         `--narrow-attribution=drop` forms accepted.
 *
 *   --cc-only             (v0.6 Step 4.1) Accepted only with `init`.
 *                         Boolean opt-in for B13-flags single-
 *                         dependency architecture (claude-code-only)
 *                         per Q5 lock + v0.6 Step 4.0 Q4.0.5 + Q4.0.11
 *                         locks. Default false ("anthropic-api-claude-
 *                         code" current dual-dependency).
 *
 *   --observe             (v0.6 Step 6.2) Accepted with `init` (writes
 *                         `observability.enabled: true` into the config
 *                         file) and with `mcp` (per-session override
 *                         that enables observation logging without
 *                         editing the config file). The flag IS the
 *                         consent signal per Q6.0.4 hybrid wiring lock
 *                         + ADR-20 cohort observability contract.
 *                         Rejected with `index` or `doctor` (no MCP
 *                         tool surface to observe).
 *
 * Unknown arguments throw with actionable errors. Unknown
 * subcommand names get the "did you mean?" suggestion treatment when
 * they're close to a real name (prominently "reindex" → "index", per
 * ADR-12's note about muscle memory from ADR-11's pre-amendment text).
 *
 * Extracted from `src/index.ts` so it's testable without triggering
 * `main()` as a side effect of importing.
 */

export type Subcommand =
  | "mcp"
  | "index"
  | "doctor"
  | "init"
  | "generate-adrs"
  | "resolve-symbols"
  | "validate-atlas"
  | "validate-adrs";

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
  /**
   * True when `--verbose` was passed alongside `index`. Emits
   * per-file unresolved-token detail on stderr. Rejected on any
   * non-`index` invocation. Per v0.2 Stream A #3.
   */
  verbose: boolean;
  /**
   * Value of `--narrow-attribution=<value>` if passed; otherwise null.
   * When present, overrides `extraction.narrow_attribution` from the
   * config file. One of "drop" | "drop-with-fallback". Rejected on any
   * non-`index` invocation. Per v0.3 Theme 1.2 Fix 2 (Phase 6 §5.1
   * muddy-bundle mechanism).
   */
  narrowAttribution: "drop" | "drop-with-fallback" | null;
  /**
   * True when `--cc-only` was passed alongside `init`. Originally
   * a B13-flags opt-in at v0.6; deprecated at v0.7+ per Path-3
   * entry-point-determined architecture (ADR-02 v0.7 Step 1.4b
   * amendment). CLI cannot bridge to Skills mechanism; flag has
   * no functional effect at v0.7+; init emits stderr redirect
   * warning to `/index-atlas` Claude Code skill. Flag removed at
   * v0.8+ per honest deprecation cycle. Rejected on any non-
   * `init` invocation.
   */
  ccOnly: boolean;
  /**
   * True when `--observe` was passed. Accepted with `init` (writes
   * `observability.enabled: true` into the config file) and with
   * `mcp` (per-session override that enables observation logging
   * without editing the config). The flag IS the consent signal per
   * Q6.0.4 hybrid wiring lock + ADR-20 cohort observability contract.
   * Rejected on `index` or `doctor` invocations. v0.6 Step 6.2.
   */
  observe: boolean;
  /**
   * `--reference-context <path>` CLI flag value for the
   * `generate-adrs` subcommand (per v0.7 Step 2.1.a Travis SECOND
   * substantive reframe — reference-context-aided generate-adrs).
   * `null` when the flag is absent. Step 2.2.a.1 ships flag parsing;
   * Step 2.2.a.2 lands substantive consumption via
   * `GeneratorContext.referenceContextPath`.
   */
  referenceContext: string | null;
  /**
   * True when `--yes` (or alias `--no-confirm`) was passed alongside
   * `generate-adrs`. Bypasses the pre-flight cost-estimate
   * confirmation prompt — required for CI/CD / non-interactive
   * usage per v0.7 Step 2.2.a.2 Lock 3 two-phase cost reporting.
   * Default false (interactive y/N prompt before API call).
   */
  yes: boolean;
  /**
   * True when `--version` was passed. Causes the binary to print the
   * ContextAtlas version + exit 0 before any subcommand dispatch.
   * Standard POSIX-convention launch-readiness flag per v0.7 Step
   * 2.2.b.0 FO-4 fix.
   */
  version: boolean;
  /**
   * True when `--help` was passed. Causes the binary to print the
   * help text + exit 0 before any subcommand dispatch. Standard
   * POSIX-convention launch-readiness flag per v0.7 Step 2.2.b.0
   * FO-4 fix.
   */
  help: boolean;
}

export const KNOWN_SUBCOMMANDS: readonly Subcommand[] = [
  "index",
  "doctor",
  "init",
  "generate-adrs",
  "resolve-symbols",
  "validate-atlas",
  "validate-adrs",
];

/**
 * Built from KNOWN_SUBCOMMANDS so the usage string can never drift from
 * the actual set of accepted subcommands (substrate-consistency
 * invariant per v0.7 Step 2.1.a FO-1 fix).
 */
export const USAGE =
  `Usage: contextatlas [${KNOWN_SUBCOMMANDS.join("|")}] [--config-root <path>] [--config <file>] ` +
  "[--check] [--full] [--json] [--cc-only] [--observe] [--budget-warn <usd>] [--verbose] " +
  "[--narrow-attribution <drop|drop-with-fallback>] " +
  "(see ADR-08, ADR-11, ADR-12, ADR-20)";

/**
 * Help text emitted on `contextatlas --help`. v0.7 Step 2.2.b.0 FO-4
 * fix — substantive launch-readiness UX so v1.0 users get a useful
 * answer to `contextatlas --help` instead of the
 * Unknown-argument-error path. Subcommand list is rendered from
 * KNOWN_SUBCOMMANDS at module-eval time so this can't drift from the
 * accepted subcommand set.
 */
export const HELP_TEXT = `contextatlas — codebase-architectural context engine

Usage: contextatlas <subcommand> [options]

Subcommands:
  init                  Scaffold .contextatlas.yml config + onboarding pipeline
  doctor                Verify ContextAtlas setup + adapter prerequisites
  index                 Extract architectural claims into atlas (requires ANTHROPIC_API_KEY)
  generate-adrs         Generate ADRs from codebase (requires ANTHROPIC_API_KEY; one-time-per-repo)
  resolve-symbols       Enrich Skill-produced atlas with LSP-resolved symbol IDs (no API key needed)
  validate-atlas        Validate atlas.json against canonical schema (no API key needed)
  validate-adrs         Validate docs/adr/*.md against canonical depth-floor invariants (no API key needed)

Global options:
  --version             Show version + exit
  --help                Show this help + exit
  --config-root <path>  Override config root (default: cwd)
  --config <file>       Override config file path

Subcommand options (selected; see individual subcommand for full set):
  index, generate-adrs:
    --budget-warn <usd>   Emit warning if cumulative cost exceeds threshold
  index:
    --full                Bypass SHA-diff gating; re-extract everything
    --verbose             Per-file unresolved-token detail on stderr
    --narrow-attribution <drop|drop-with-fallback>
                          Override extraction.narrow_attribution config
  generate-adrs:
    --reference-context <path>
                          Walk reference documentation as prompt input
    --yes / --no-confirm  Bypass pre-flight cost-estimate confirmation prompt
  init:
    --observe             Enable observability (per ADR-20)
  mcp (default; no subcommand):
    --observe             Per-session observability override

See https://github.com/traviswye/contextatlas for full documentation
and architectural decision records.`;

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
};

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let configRoot: string | null = null;
  let configFile: string | null = null;
  let check = false;
  let full = false;
  let json = false;
  let budgetWarn: number | null = null;
  let verbose = false;
  let narrowAttribution: "drop" | "drop-with-fallback" | null = null;
  let ccOnly = false;
  let observe = false;
  let referenceContext: string | null = null;
  let yes = false;
  let version = false;
  let help = false;
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
    if (arg === "--verbose") {
      if (verbose) {
        throw new Error(`Flag --verbose specified more than once. ${USAGE}`);
      }
      verbose = true;
      i += 1;
      continue;
    }
    if (arg === "--narrow-attribution") {
      if (narrowAttribution !== null) {
        throw new Error(
          `Flag --narrow-attribution specified more than once. ${USAGE}`,
        );
      }
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(
          `Flag --narrow-attribution requires a value but none was given. ${USAGE}`,
        );
      }
      if (value === "" || value.startsWith("--")) {
        throw new Error(
          `Flag --narrow-attribution requires a non-empty value; got '${value}'. ${USAGE}`,
        );
      }
      narrowAttribution = parseNarrowAttribution(value);
      i += 2;
      continue;
    }
    if (arg.startsWith("--narrow-attribution=")) {
      if (narrowAttribution !== null) {
        throw new Error(
          `Flag --narrow-attribution specified more than once. ${USAGE}`,
        );
      }
      const value = arg.slice("--narrow-attribution=".length);
      if (value === "") {
        throw new Error(
          `Flag --narrow-attribution= requires a non-empty value. ${USAGE}`,
        );
      }
      narrowAttribution = parseNarrowAttribution(value);
      i += 1;
      continue;
    }
    if (arg === "--cc-only") {
      if (ccOnly) {
        throw new Error(`Flag --cc-only specified more than once. ${USAGE}`);
      }
      ccOnly = true;
      i += 1;
      continue;
    }
    if (arg === "--observe") {
      if (observe) {
        throw new Error(`Flag --observe specified more than once. ${USAGE}`);
      }
      observe = true;
      i += 1;
      continue;
    }
    if (arg === "--reference-context" || arg.startsWith("--reference-context=")) {
      if (referenceContext !== null) {
        throw new Error(
          `Flag --reference-context specified more than once. ${USAGE}`,
        );
      }
      let value: string;
      if (arg.startsWith("--reference-context=")) {
        value = arg.slice("--reference-context=".length);
        i += 1;
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("-")) {
          throw new Error(
            `Flag --reference-context requires a path argument. ${USAGE}`,
          );
        }
        value = next;
        i += 2;
      }
      if (value.length === 0) {
        throw new Error(
          `Flag --reference-context requires a non-empty path argument. ${USAGE}`,
        );
      }
      referenceContext = value;
      continue;
    }
    if (arg === "--yes" || arg === "--no-confirm") {
      if (yes) {
        throw new Error(
          `Flag --yes / --no-confirm specified more than once. ${USAGE}`,
        );
      }
      yes = true;
      i += 1;
      continue;
    }
    if (arg === "--version") {
      version = true;
      i += 1;
      continue;
    }
    if (arg === "--help") {
      help = true;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument '${arg}'. ${USAGE}`);
  }

  // --version + --help short-circuit before cross-flag validation
  // (POSIX convention: --version / --help take priority over other
  // flag combinations; index.ts dispatches on these before any
  // subcommand work runs).
  if (version || help) {
    return {
      subcommand,
      configRoot,
      configFile,
      check,
      full,
      json,
      budgetWarn,
      verbose,
      narrowAttribution,
      ccOnly,
      observe,
      referenceContext,
      yes,
      version,
      help,
    };
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
  if (
    json &&
    subcommand !== "index" &&
    subcommand !== "doctor" &&
    subcommand !== "init"
  ) {
    throw new Error(
      `Flag --json is only accepted with the 'index', 'doctor', or 'init' subcommand. ${USAGE}`,
    );
  }
  if (
    budgetWarn !== null &&
    subcommand !== "index" &&
    subcommand !== "generate-adrs"
  ) {
    throw new Error(
      `Flag --budget-warn is only accepted with the 'index' or 'generate-adrs' subcommand. ${USAGE}`,
    );
  }
  if (verbose && subcommand !== "index") {
    throw new Error(
      `Flag --verbose is only accepted with the 'index' subcommand. ${USAGE}`,
    );
  }
  if (narrowAttribution !== null && subcommand !== "index") {
    throw new Error(
      `Flag --narrow-attribution is only accepted with the 'index' subcommand. ${USAGE}`,
    );
  }
  if (ccOnly && subcommand !== "init") {
    throw new Error(
      `Flag --cc-only is only accepted with the 'init' subcommand. ${USAGE}`,
    );
  }
  if (observe && subcommand !== "init" && subcommand !== "mcp") {
    throw new Error(
      `Flag --observe is only accepted with the 'init' or 'mcp' subcommand ` +
        `(no MCP tool surface to observe under '${subcommand}'). ${USAGE}`,
    );
  }
  if (referenceContext !== null && subcommand !== "generate-adrs") {
    throw new Error(
      `Flag --reference-context is only accepted with the 'generate-adrs' subcommand. ${USAGE}`,
    );
  }
  if (yes && subcommand !== "generate-adrs") {
    throw new Error(
      `Flag --yes / --no-confirm is only accepted with the 'generate-adrs' subcommand. ${USAGE}`,
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
    verbose,
    narrowAttribution,
    ccOnly,
    observe,
    referenceContext,
    yes,
    version,
    help,
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

function parseNarrowAttribution(raw: string): "drop" | "drop-with-fallback" {
  if (raw === "drop" || raw === "drop-with-fallback") return raw;
  throw new Error(
    `Flag --narrow-attribution requires 'drop' or 'drop-with-fallback'; got '${raw}'. ${USAGE}`,
  );
}
