/**
 * Compact-format renderer for SymbolContextBundle (ADR-04).
 *
 * Three depth levels — "summary" / "standard" / "deep" — produce
 * progressively denser output. Optional sections are omitted entirely
 * when empty rather than rendered as placeholders, keeping bundles
 * lean. Diagnostics are always rendered when present, at every depth.
 *
 * See DESIGN.md's tool interface section for the exact shapes and
 * test/fixtures/bundles/ for the canonical golden examples.
 */

import type { FindByIntentMatch } from "../queries/find-by-intent.js";
import type { ImpactBundle } from "../queries/impact-of-change.js";
import type {
  BundleDepth,
  Claim,
  Diagnostic,
  SymbolContextBundle,
} from "../types.js";

const INDENT = "  ";
const INDENT2 = "    ";

export interface RenderOptions {
  depth: BundleDepth;
  maxRefs: number;
}

export function renderCompact(
  bundle: SymbolContextBundle,
  options: RenderOptions,
): string {
  const lines: string[] = [];
  const { symbol } = bundle;

  // Header
  lines.push(`SYM ${symbol.name}@${symbol.path}:${symbol.line} ${symbol.kind}`);

  // Signature
  if (symbol.signature) {
    lines.push(`${INDENT}SIG ${symbol.signature}`);
  }

  // Intent
  if (bundle.intent && bundle.intent.length > 0) {
    renderIntent(lines, bundle.intent, options.depth);
  }

  // Refs
  if (bundle.refs && options.depth !== "summary") {
    renderRefs(lines, bundle.refs, options);
  }

  // Types
  if (bundle.types && options.depth === "deep") {
    renderTypes(lines, bundle.types);
  }

  // Tests
  if (bundle.tests && bundle.tests.files.length > 0 && options.depth !== "summary") {
    renderTests(lines, bundle.tests, options.depth);
  }

  // Git — always shown when present (ADR-11). The header line carries
  // last-touched and hot-summary at every depth; per-commit lines
  // render at standard+.
  if (bundle.git) {
    renderGit(lines, bundle.git, options.depth);
  }

  // Diagnostics — always shown when present
  if (bundle.diagnostics && bundle.diagnostics.length > 0) {
    renderDiagnostics(lines, bundle.diagnostics);
  }

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function renderIntent(
  lines: string[],
  claims: readonly Claim[],
  depth: BundleDepth,
): void {
  if (depth === "summary") {
    const counts = { hard: 0, soft: 0, context: 0 };
    for (const c of claims) counts[c.severity]++;
    const topClaim = claims[0];
    const topFragment = topClaim
      ? `; top=${quote(topClaim.claim)} (${topClaim.source})`
      : "";
    lines.push(
      `${INDENT}INTENT hard:${counts.hard} soft:${counts.soft} context:${counts.context}${topFragment}`,
    );
    return;
  }

  for (const claim of claims) {
    lines.push(
      `${INDENT}INTENT ${claim.source} ${claim.severity} ${quote(claim.claim)}`,
    );
    if (claim.rationale) {
      lines.push(`${INDENT2}RATIONALE ${quote(claim.rationale)}`);
    }
    if (depth === "deep" && claim.excerpt) {
      lines.push(`${INDENT2}EXCERPT ${quote(claim.excerpt)}`);
    }
  }
}

function renderRefs(
  lines: string[],
  refs: NonNullable<SymbolContextBundle["refs"]>,
  options: RenderOptions,
): void {
  const clusterFragment = refs.clusters
    .map((c) => `${c.module}:${c.count}`)
    .join(" ");
  lines.push(
    `${INDENT}REFS ${refs.count} [${clusterFragment}]`,
  );

  if (options.depth === "standard") {
    // Show the top references drawn from the highest-count clusters.
    const top = pickTopRefs(refs, Math.min(3, options.maxRefs));
    for (const id of top) {
      lines.push(`${INDENT2}TOP ${id}`);
    }
    return;
  }

  // deep: render up to maxRefs refs, explicit REF lines, with a "more"
  // tail whenever the true ref count exceeds what we're rendering.
  // We compare to refs.count (authoritative total), not to the length
  // of the flattened topIds set (which is already bundle-builder-capped).
  const allIds = refs.clusters.flatMap((c) => c.topIds);
  const shown = allIds.slice(0, options.maxRefs);
  for (const id of shown) {
    lines.push(`${INDENT2}REF ${id}`);
  }
  if (refs.count > shown.length) {
    lines.push(`${INDENT2}... +${refs.count - shown.length} more`);
  }
}

function renderTypes(
  lines: string[],
  types: NonNullable<SymbolContextBundle["types"]>,
): void {
  const parts: string[] = [];
  if (types.extends && types.extends.length > 0) {
    parts.push(`extends=${formatNameList(types.extends, { singleUnwrapped: true })}`);
  } else {
    // When a symbol has implements/usedByTypes but no extends, still
    // emit "extends=" with empty brackets for consistency? DESIGN.md's
    // example shows `implements=[]` explicitly so readers aren't
    // guessing. Keep every requested field visible when any is set.
    parts.push("extends=[]");
  }
  parts.push(
    `implements=${formatNameList(types.implements ?? [], { allowEmpty: true })}`,
  );
  parts.push(
    `used_by=${formatNameList(types.usedByTypes ?? [], { allowEmpty: true })}`,
  );
  lines.push(`${INDENT}TYPES ${parts.join(" ")}`);
}

function renderTests(
  lines: string[],
  tests: NonNullable<SymbolContextBundle["tests"]>,
  depth: BundleDepth,
): void {
  const [first, ...rest] = tests.files;
  if (!first) return;
  const extra = rest.length;
  lines.push(
    `${INDENT}TESTS ${first}${extra > 0 ? ` (+${extra})` : ""}`,
  );
  if (depth === "deep") {
    for (const f of tests.files) {
      lines.push(`${INDENT2}TEST ${f}`);
    }
  }
}

function renderDiagnostics(
  lines: string[],
  diagnostics: readonly Diagnostic[],
): void {
  for (const d of diagnostics) {
    lines.push(
      `${INDENT}DIAG ${d.severity} ${quote(d.message)} @line:${d.line}`,
    );
  }
}

function renderGit(
  lines: string[],
  git: NonNullable<SymbolContextBundle["git"]>,
  depth: BundleDepth,
): void {
  const hotFragment = git.hot
    ? `hot (${git.commitCount}≥${git.hotThreshold} commits)`
    : `cold (${git.commitCount}<${git.hotThreshold} commits)`;
  lines.push(
    `${INDENT}GIT last=${git.lastTouched} by ${git.lastTouchedAuthor} ${hotFragment}`,
  );
  if (depth === "summary") return;
  // Summary depth stops at the header. Standard / deep render the
  // per-commit list. Recent commit count is already bounded at
  // bundle-build time by config.git.recentCommits.
  for (const c of git.recentCommits) {
    const shortSha = c.sha.slice(0, 7);
    const shortDate = c.date.slice(0, 10);
    lines.push(
      `${INDENT2}COMMIT ${shortSha} ${shortDate} ${quote(c.message)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function quote(text: string): string {
  return `"${text.replace(/"/g, '\\"')}"`;
}

/**
 * Compact-format renderer for `find_by_intent` results (ADR-09).
 * Uses the same `SYM` / `SIG` / `INTENT` vocabulary as the primitive
 * bundle so LLMs parsing `get_symbol_context` output read this
 * without re-learning conventions.
 *
 * Zero-matches renders as a single header line with no body — same
 * "omit empty sections" rule as `renderCompact`.
 */
export function renderMatchesCompact(
  matches: readonly FindByIntentMatch[],
  query: string,
): string {
  const header = `MATCHES ${matches.length} [query=${quote(query)}]`;
  const lines: string[] = [header];
  for (const m of matches) {
    lines.push(
      `${INDENT}SYM ${m.symbolId} ${m.path}:${m.line} ${m.kind}`,
    );
    if (m.signature) {
      lines.push(`${INDENT2}SIG ${m.signature}`);
    }
    lines.push(
      `${INDENT2}INTENT ${m.matchedIntent.source} ${m.matchedIntent.severity} ${quote(m.matchedIntent.claim)}`,
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Compact-format renderer for `impact_of_change` results (ADR-11).
 *
 * Header IMPACT line, then a primitive bundle in place (at depth
 * "deep"), then GIT_COCHANGE and RISK_SIGNALS blocks. The layout is
 * specified in ADR-11's "Response shape" section — changes require
 * an ADR amendment.
 */
export function renderImpactCompact(impact: ImpactBundle): string {
  const { bundle, coChange, riskSignals } = impact;
  const lines: string[] = [];
  lines.push(`IMPACT ${bundle.symbol.id}`);
  if (coChange.length > 0) {
    lines.push(`${INDENT}GIT_COCHANGE (top ${coChange.length})`);
    const maxWidth = Math.max(
      ...coChange.map((c) => c.filePath.length),
    );
    for (const c of coChange) {
      const padded = c.filePath.padEnd(maxWidth);
      lines.push(`${INDENT2}${padded}  ${c.coCommitCount} commits`);
    }
  }
  lines.push(`${INDENT}RISK_SIGNALS`);
  const hotFrag = riskSignals.hot
    ? `yes (${riskSignals.commitCount}≥${riskSignals.hotThreshold} commits)`
    : `no (${riskSignals.commitCount}<${riskSignals.hotThreshold} commits)`;
  lines.push(`${INDENT2}hot: ${hotFrag}`);
  lines.push(
    `${INDENT2}test_coverage: ${riskSignals.testFiles} test file(s) referenced`,
  );
  lines.push(`${INDENT2}diagnostics: ${riskSignals.diagnostics}`);
  lines.push(
    `${INDENT2}intent_density: ${riskSignals.hardClaims} hard / ` +
      `${riskSignals.softClaims} soft / ${riskSignals.contextClaims} context`,
  );
  // Primitive bundle rendered afterwards at deep depth so callers see
  // the full context alongside the blast-radius signals.
  const primitive = renderCompact(bundle, {
    depth: "deep",
    maxRefs: bundle.refs?.count ?? 0,
  });
  return lines.join("\n") + "\n" + primitive;
}

function formatNameList(
  names: readonly string[],
  options: { singleUnwrapped?: boolean; allowEmpty?: boolean } = {},
): string {
  if (names.length === 0) return "[]";
  if (options.singleUnwrapped && names.length === 1) {
    return names[0]!;
  }
  return `[${names.join(", ")}]`;
}

/**
 * Pick the top N reference IDs across clusters, drawing from the
 * largest clusters first. Used by "standard" depth to display up to
 * N TOP lines across the whole reference set, not per cluster.
 */
function pickTopRefs(
  refs: NonNullable<SymbolContextBundle["refs"]>,
  n: number,
): string[] {
  const out: string[] = [];
  for (const cluster of refs.clusters) {
    for (const id of cluster.topIds) {
      if (out.length >= n) return out;
      out.push(id);
    }
  }
  return out;
}
