/**
 * CLI glue for the `contextatlas show-generate-prompt` subcommand
 * (Path-γ pattern per Q2.2.a.2 lock; inheritance from Step 1.4b
 * `cli-show-prompt`).
 *
 * Outputs the canonical `GENERATE_ADRS_PROMPT` constant from
 * `src/generation/prompt.ts` to stdout. Consumed by the
 * `.claude/skills/generate-adrs/SKILL.md` Skills mechanism for
 * generate-adrs prompt loading via `` !`contextatlas
 * show-generate-prompt` `` dynamic context injection.
 *
 * Step 2.2.a.1: subcommand wires Path-γ mechanically against the
 * Step-2.2.a.1 placeholder prompt content (`src/generation/prompt.ts`
 * placeholder). Step 2.2.a.2 replaces placeholder with real prompt
 * content; this subcommand code does NOT change — it surfaces
 * whatever `GENERATE_ADRS_PROMPT` value is current. Path-γ
 * separation working as designed (mirrors Step 1.4b).
 *
 * The subcommand is read-only + idempotent + non-breaking addition.
 * Future extensions (prompt variants; validation modes) plug into
 * this subcommand surface without Skills updates.
 */

import { GENERATE_ADRS_PROMPT } from "./prompt.js";

export interface ShowGeneratePromptCliOptions {
  /**
   * Test seam — where prompt output goes. Defaults to
   * `process.stdout.write`. Lets tests assert on output content
   * without writing to real stdout.
   */
  writeStdout?: (chunk: string) => void;
}

export type ShowGeneratePromptExitCode = 0;

export interface ShowGeneratePromptCliResult {
  exitCode: ShowGeneratePromptExitCode;
}

/**
 * Run the `show-generate-prompt` subcommand. Always succeeds
 * (exit code 0). Outputs `GENERATE_ADRS_PROMPT` verbatim followed
 * by a trailing newline.
 */
export function runShowGeneratePromptSubcommand(
  options: ShowGeneratePromptCliOptions = {},
): ShowGeneratePromptCliResult {
  const writeStdout =
    options.writeStdout ?? ((chunk) => process.stdout.write(chunk));
  writeStdout(GENERATE_ADRS_PROMPT);
  writeStdout("\n");
  return { exitCode: 0 };
}
