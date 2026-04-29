/**
 * Text output formatter for doctor results — tabular human-readable
 * output with section headers per category.
 *
 * No ANSI color codes — keeps output pipeable + readable in any
 * terminal, including CI logs and Tee-Object on PowerShell. Status
 * markers use plain ASCII (`✓` / `⚠` / `✗`) which render in
 * UTF-8-capable terminals.
 */

import type {
  CheckCategory,
  CheckStatus,
  DoctorCheck,
  DoctorResult,
} from "../types.js";

const CATEGORY_LABEL: Record<CheckCategory, string> = {
  config: "Config",
  atlas: "Atlas",
  sha: "SHA / Schema",
  lsp: "LSP",
  extraction: "Extraction prerequisites",
};

const STATUS_MARK: Record<CheckStatus, string> = {
  pass: "✓",
  warn: "⚠",
  fail: "✗",
};

export function formatText(result: DoctorResult): string {
  const lines: string[] = [];
  lines.push(`ContextAtlas Doctor v${result.doctorVersion}`);
  lines.push(`Repo: ${result.repoRoot}`);
  lines.push("");

  // Group checks by category in declaration order.
  const grouped = new Map<CheckCategory, DoctorCheck[]>();
  for (const c of result.checks) {
    const arr = grouped.get(c.category) ?? [];
    arr.push(c);
    grouped.set(c.category, arr);
  }

  // Walk categories in fixed order (matches scope-doc).
  const order: CheckCategory[] = ["config", "atlas", "sha", "lsp", "extraction"];
  for (const cat of order) {
    const checks = grouped.get(cat);
    if (!checks || checks.length === 0) continue;
    lines.push(CATEGORY_LABEL[cat]);
    // Compute column widths from longest id seen in this category.
    const idWidth = Math.max(...checks.map((c) => c.id.length));
    for (const c of checks) {
      lines.push(`  ${STATUS_MARK[c.status]} ${c.id.padEnd(idWidth)}  ${c.message}`);
      if (c.detail) {
        // Indent detail under the check; wrap long lines is left
        // to the terminal.
        lines.push(`      → ${c.detail}`);
      }
    }
    lines.push("");
  }

  // Summary line.
  const { pass, warn, fail } = result.summary;
  lines.push(`Summary: ${pass} PASS, ${warn} WARN, ${fail} FAIL`);
  lines.push(`Exit code: ${result.exitCode}`);

  return lines.join("\n") + "\n";
}
