/**
 * `symbols[]` and claim links for `contextatlas resolve-symbols`, which
 * works on atlas.json rather than SQLite. `reconcileAtlasSymbols` moved
 * here from `cli-resolve-symbols.ts` (v1.2 Phase 2 review round 2.2).
 *
 * Fresh LSP symbols replace prior ones; prior symbols are kept only
 * where the run could not verify them (listing failed, or the language
 * is not configured), by the same `planSymbolPrune` rules the CLI
 * pipeline applies. A claim link to a symbol in neither list is dropped
 * as dangling.
 *
 * That rule needs the prior list. An `/index-atlas` refresh may write
 * `symbols: []` when the baseline array is too large to re-write, and
 * then a link into a file this run could not list had nothing to keep
 * it: it was dropped for good (a preserved CLI claim has no
 * `symbol_candidates` to link it again). So, for claim links `symbols`
 * does not list, the prior records are taken from the atlas.json
 * committed at HEAD ({@link readCommittedAtlasSymbols}); and a link
 * into an unverified file whose symbol is still in neither list is
 * reported ({@link unverifiableLinks}) so the caller can stop without
 * writing instead of dropping it.
 */

import { spawnSync } from "node:child_process";
import { basename, dirname } from "node:path";

import type { AtlasSymbolEntry } from "../storage/types.js";

import {
  planSymbolPrune,
  type SymbolCoverage,
  type SymbolLocation,
  type SymbolPrunePlan,
  type UnverifiedReason,
} from "./symbol-prune.js";

/**
 * Rebuild `symbols[]` for an atlas (v1.2 Phase 1 D6 parity with the
 * CLI pipeline's Stage 4a prune). Fresh LSP symbols replace prior
 * ones; prior symbols are kept only where the run could not verify
 * them (listing failed, or the language is not configured) — the same
 * `planSymbolPrune` rules the CLI applies. Before v1.2 the rebuild was
 * wholesale: stale symbols never survived, but neither did the symbols
 * of a file tsserver failed to list.
 */
export function reconcileAtlasSymbols(
  prior: readonly AtlasSymbolEntry[],
  fresh: readonly AtlasSymbolEntry[],
  coverage: SymbolCoverage,
): { symbols: AtlasSymbolEntry[]; plan: SymbolPrunePlan } {
  const plan = planSymbolPrune(
    prior.map((s) => ({ id: s.id, path: s.path })),
    coverage,
  );
  const pruned = new Set(plan.pruneIds);
  const freshIds = new Set(fresh.map((s) => s.id));
  const keptPrior = prior.filter(
    (s) => !pruned.has(s.id) && !freshIds.has(s.id),
  );
  return { symbols: [...fresh, ...keptPrior], plan };
}

/** Ids in `claims[].symbol_ids` that `symbols` does not list. */
export function unlistedLinkedIds(
  claims: ReadonlyArray<{ readonly symbol_ids?: readonly string[] }>,
  symbols: readonly AtlasSymbolEntry[],
): Set<string> {
  const listed = new Set(symbols.map((s) => s.id));
  const out = new Set<string>();
  for (const claim of claims) {
    const ids = Array.isArray(claim.symbol_ids) ? claim.symbol_ids : [];
    for (const id of ids) if (!listed.has(id)) out.add(id);
  }
  return out;
}

/**
 * The `symbols` array of the atlas.json committed at HEAD
 * (`git show HEAD:<atlas>`), or null when there is none: not a git tree,
 * git missing, the file not committed, or not parseable.
 */
export function readCommittedAtlasSymbols(
  atlasAbsPath: string,
  gitBinary = "git",
): AtlasSymbolEntry[] | null {
  const result = spawnSync(gitBinary, ["show", `HEAD:./${basename(atlasAbsPath)}`], {
    cwd: dirname(atlasAbsPath),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.error !== undefined || result.status !== 0) return null;
  try {
    const parsed = JSON.parse(result.stdout) as { symbols?: unknown };
    if (!Array.isArray(parsed.symbols)) return null;
    return parsed.symbols.filter(
      (s): s is AtlasSymbolEntry =>
        s !== null &&
        typeof s === "object" &&
        typeof (s as Record<string, unknown>).id === "string" &&
        typeof (s as Record<string, unknown>).path === "string",
    );
  } catch {
    return null;
  }
}

export interface UnverifiableLink {
  readonly id: string;
  readonly path: string;
  readonly reason: UnverifiedReason;
}

/**
 * Of `ids` (links whose symbol is in no list this run has), those whose
 * file exists but could not be verified this run: its listing failed,
 * or its language is not configured. Dropping them would lose links to
 * symbols that may well still exist. A link into a deleted, excluded or
 * freshly listed file is not returned: its symbol is known to be gone.
 */
export function unverifiableLinks(
  ids: Iterable<string>,
  coverage: SymbolCoverage,
): UnverifiableLink[] {
  const located: SymbolLocation[] = [];
  for (const id of ids) {
    const path = locateSymbolPath(id, coverage.fileExists);
    if (path !== null) located.push({ id, path });
  }
  const unverified = new Map(
    planSymbolPrune(located, coverage).unverified.map((u) => [u.path, u.reason]),
  );
  const out: UnverifiableLink[] = [];
  for (const { id, path } of located) {
    const reason = unverified.get(path);
    if (reason !== undefined) out.push({ id, path, reason });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The file a `sym:<lang>:<path>:<name>` id names (ADR-01), when it
 * exists. Names can contain colons (Ruby `A::B`), and so can paths in
 * principle, so each colon-delimited prefix after the language is tried.
 */
function locateSymbolPath(
  id: string,
  fileExists: (relPath: string) => boolean,
): string | null {
  if (!id.startsWith("sym:")) return null;
  const rest = id.slice("sym:".length);
  const afterLang = rest.indexOf(":");
  if (afterLang === -1) return null;
  const pathAndName = rest.slice(afterLang + 1);
  for (let i = pathAndName.indexOf(":"); i > 0; i = pathAndName.indexOf(":", i + 1)) {
    const candidate = pathAndName.slice(0, i);
    if (fileExists(candidate)) return candidate;
  }
  return null;
}

/**
 * The exit-1 message for claim links resolve-symbols can neither verify
 * nor keep (see {@link unverifiableLinks}).
 */
export function unverifiableLinksMessage(
  blocked: readonly UnverifiableLink[],
  atlasPath: string,
): string {
  const byPath = new Map<string, UnverifiableLink[]>();
  for (const link of blocked) {
    const list = byPath.get(link.path) ?? [];
    list.push(link);
    byPath.set(link.path, list);
  }
  const lines = [...byPath]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, 10)
    .map(([path, links]) => {
      const why =
        links[0]!.reason === "listing-failed"
          ? "its symbol listing failed"
          : "its language is not configured";
      return `  - ${path} (${why}): ${links.length} symbol${links.length === 1 ? "" : "s"}`;
    });
  const more = byPath.size > 10 ? `\n  - ... and ${byPath.size - 10} more files` : "";
  return (
    `resolve-symbols: claims link ${blocked.length} symbol${blocked.length === 1 ? "" : "s"} ` +
    `in files this run could not verify, and neither ${atlasPath}'s \`symbols\` ` +
    "nor the atlas.json committed at HEAD lists them, so those links could " +
    "not be kept. Nothing was written.\n" +
    `${lines.join("\n")}${more}\n` +
    "A listing failure is often transient: re-run `contextatlas resolve-symbols`. " +
    "If it persists, or the language is no longer configured, copy those " +
    "files' entries from the baseline atlas's `symbols` array into " +
    "atlas.json's `symbols` (or carry the whole baseline array forward) and " +
    "re-run. Do not empty the claims' `symbol_ids`: a claim without " +
    "`symbol_candidates` cannot be linked again.\n"
  );
}
