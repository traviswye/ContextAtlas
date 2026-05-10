/**
 * CLI glue for the `contextatlas show-prompt` subcommand
 * (Path-γ per v0.7 Step 1.4 design adjudication).
 *
 * Outputs the canonical EXTRACTION_PROMPT constant from
 * `src/extraction/prompt.ts` to stdout. Consumed by the
 * `.claude/skills/index-atlas/SKILL.md` Skills mechanism for
 * extraction prompt loading via `!`contextatlas show-prompt``
 * dynamic context injection.
 *
 * Architectural rationale (Path-γ vs Path-α/β):
 *   - Path-α (inline-bundle prompt in SKILL.md): 2-surface drift
 *     risk between SKILL.md + src/extraction/prompt.ts
 *   - Path-β (Skills reads from package-resolved path): leaks
 *     contextatlas package internals knowledge into Skills layer;
 *     edge cases for installed-dependency vs cloned-source-repo
 *     path resolution
 *   - Path-γ (CLI subcommand surfaces prompt): clean separation;
 *     ContextAtlas owns canonical prompt per ADR-02 §Decision
 *     permitted-modules invariant; Skills consumes via CLI
 *     invocation surface (cwd-independent; path-resolution-
 *     complexity centralized in CLI)
 *
 * The subcommand is read-only + idempotent + non-breaking
 * addition per Q9.0.6 α-light absorbed-item annotation pattern.
 * Future extensions (prompt variants; validation modes) plug
 * into this subcommand surface without Skills updates.
 */

import { EXTRACTION_PROMPT } from "./prompt.js";

export interface ShowPromptCliOptions {
  /**
   * Test seam — where prompt output goes. Defaults to
   * `process.stdout.write`. Lets tests assert on output content
   * without writing to real stdout.
   */
  writeStdout?: (chunk: string) => void;
}

export type ShowPromptExitCode = 0;

export interface ShowPromptCliResult {
  exitCode: ShowPromptExitCode;
}

/**
 * Run the `show-prompt` subcommand. Always succeeds (exit code 0).
 * Outputs EXTRACTION_PROMPT verbatim followed by a trailing
 * newline.
 */
export function runShowPromptSubcommand(
  options: ShowPromptCliOptions = {},
): ShowPromptCliResult {
  const writeStdout =
    options.writeStdout ?? ((chunk) => process.stdout.write(chunk));
  writeStdout(EXTRACTION_PROMPT);
  writeStdout("\n");
  return { exitCode: 0 };
}
