/**
 * `contextatlas init` offers the Tier 0 git hooks (v1.2 Phase 5).
 *
 * Opt-in: `--yes` installs them; on an interactive terminal (and not
 * `--json`) init asks, defaulting to no; otherwise (CI, piped stdin) it
 * installs nothing and prints how to. A failure never fails init.
 */

import { createInterface } from "node:readline/promises";

import { runHooksSubcommand } from "../hooks/cli.js";
import { log } from "../mcp/logger.js";

export type HooksOfferOutcome = "installed" | "declined" | "skipped" | "failed";

export interface HooksOfferOptions {
  configRoot: string;
  configFile?: string | null;
  /** `--yes`: install without asking. */
  yes?: boolean;
  json?: boolean;
  writeStderr: (chunk: string) => void;
  /** Test seam: answer the question (default: readline on a TTY, else null = cannot ask). */
  ask?: (question: string) => Promise<boolean | null>;
  /** Test seam: the entry script the hooks run. */
  entryOverride?: string;
}

const QUESTION =
  "Install git hooks that refresh ContextAtlas's local cache after each commit, " +
  "merge and branch checkout? They run in the background, make no model calls " +
  "and never modify atlas.json. [y/N] ";

export async function offerGitHooks(options: HooksOfferOptions): Promise<HooksOfferOutcome> {
  let install = options.yes === true;
  if (!install) {
    const answer = options.json === true ? null : await (options.ask ?? askOnTty)(QUESTION);
    if (answer === null) {
      options.writeStderr(
        "init: git hooks not installed. To refresh the local cache automatically " +
          "after commits, merges and checkouts, run `contextatlas hooks install` " +
          "(or re-run init with --yes).\n",
      );
      return "skipped";
    }
    if (!answer) return "declined";
    install = true;
  }
  const result = await runHooksSubcommand({
    configRoot: options.configRoot,
    configFile: options.configFile ?? null,
    action: "install",
    writeStdout: (c) => options.writeStderr(c),
    writeStderr: options.writeStderr,
    ...(options.entryOverride !== undefined ? { entryOverride: options.entryOverride } : {}),
  });
  if (result.exitCode !== 0) {
    log.warn("init: git hook installation failed; run `contextatlas hooks install` to retry");
    return "failed";
  }
  return "installed";
}

async function askOnTty(question: string): Promise<boolean | null> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
