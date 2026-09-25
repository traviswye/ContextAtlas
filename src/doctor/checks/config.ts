/**
 * Config-category doctor checks.
 *
 * Investigates `.contextatlas.yml` existence + parsing + per-field
 * validity. The runner has already attempted `loadConfig`; we read
 * `ctx.config` / `ctx.configError` to emit the right per-field
 * checks. `config.extraction_streams` also reads atlas.json, to count
 * the claims of disabled streams.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import {
  disabledExtractionStreams,
  extractionStreamOf,
  resolveExtractionStreams,
  usesDefaultExtractionStreams,
} from "../../config/streams.js";
import { streamFromClaimSource } from "../../extraction/source-keys.js";
import type { ContextAtlasConfig, ExtractionStream } from "../../types.js";
import type { CheckContext, DoctorCheck } from "../types.js";

export function configChecks(ctx: CheckContext): DoctorCheck[] {
  const out: DoctorCheck[] = [];

  // 1. config.exists
  const configExists = ctx.configPath !== null;
  out.push({
    id: "config.exists",
    category: "config",
    status: configExists ? "pass" : "fail",
    message: configExists
      ? `${ctx.configPath} exists`
      : ".contextatlas.yml not found at repo root",
    ...(configExists
      ? {}
      : {
          detail:
            "Create `.contextatlas.yml` at your repo root. See DESIGN.md's Config Schema section for the expected shape.",
        }),
  });
  if (!configExists) return out; // Subsequent checks need config to exist.

  // 2. config.parses
  if (ctx.configError !== null) {
    out.push({
      id: "config.parses",
      category: "config",
      status: "fail",
      message: "config failed to parse",
      detail: ctx.configError,
    });
    return out; // Subsequent checks need parsed config.
  }
  out.push({
    id: "config.parses",
    category: "config",
    status: "pass",
    message: "config valid YAML",
  });

  // ctx.config is non-null past this point.
  const config = ctx.config;
  if (config === null) return out;

  // 3. config.languages_valid
  const langs = config.languages;
  if (Array.isArray(langs) && langs.length > 0) {
    out.push({
      id: "config.languages_valid",
      category: "config",
      status: "pass",
      message: `[${langs.join(", ")}]`,
    });
  } else {
    out.push({
      id: "config.languages_valid",
      category: "config",
      status: "fail",
      message: "config.languages must be a non-empty array",
    });
  }

  // 4. config.adrs_path_resolves
  const adrAbsPath = pathResolve(ctx.repoRoot, config.adrs.path);
  if (existsSync(adrAbsPath)) {
    out.push({
      id: "config.adrs_path_resolves",
      category: "config",
      status: "pass",
      message: config.adrs.path,
    });
  } else {
    out.push({
      id: "config.adrs_path_resolves",
      category: "config",
      status: "fail",
      message: `config.adrs.path '${config.adrs.path}' does not resolve to an existing directory`,
      detail: `Resolved against repoRoot: ${adrAbsPath}`,
    });
  }

  // 5. config.exclude_pattern_valid (Step 2 / A4)
  const excludePatterns = config.extraction?.excludePattern ?? [];
  // Patterns came through the parser which already validated them
  // as non-empty strings. Defensive sanity check here.
  const allPatternsValid = excludePatterns.every(
    (p) => typeof p === "string" && p.length > 0,
  );
  out.push({
    id: "config.exclude_pattern_valid",
    category: "config",
    status: allPatternsValid ? "pass" : "fail",
    message:
      excludePatterns.length === 0
        ? "no user augmentations (defaults apply)"
        : `${excludePatterns.length} user augmentation${excludePatterns.length === 1 ? "" : "s"}`,
  });

  // 6. config.commit_message_filter_valid (Step 4)
  const commitFilters = config.extraction?.commitMessageFilter ?? [];
  let filtersCompile = true;
  let filterError: string | null = null;
  for (const p of commitFilters) {
    try {
      new RegExp(p, "i");
    } catch (err) {
      filtersCompile = false;
      filterError = `'${p}': ${err instanceof Error ? err.message : String(err)}`;
      break;
    }
  }
  out.push({
    id: "config.commit_message_filter_valid",
    category: "config",
    status: filtersCompile ? "pass" : "fail",
    message: filtersCompile
      ? commitFilters.length === 0
        ? "no user augmentations (defaults apply)"
        : `${commitFilters.length} user augmentation${commitFilters.length === 1 ? "" : "s"}`
      : "user pattern fails regex compile",
    ...(filterError ? { detail: filterError } : {}),
  });

  // 7. config.extraction_streams (v1.2 Phase 2; SCOPE D-1, L-11)
  out.push(extractionStreamsCheck(ctx.repoRoot, config));

  return out;
}

/**
 * Report the enabled extraction streams, and warn when a disabled
 * stream still has claims in atlas.json. Those claims are kept as they
 * are (frozen): extraction does not refresh them, so they go stale
 * while still being served to queries. The one exception, on both the
 * CLI and the Skill path, is a source file that no longer exists: its
 * docstring key and claims are still removed.
 *
 * Reads atlas.json the way the atlas checks do. A missing or
 * unparseable atlas only drops the claim count; `atlas.exists` and
 * `atlas.parses` report those problems.
 */
function extractionStreamsCheck(
  repoRoot: string,
  config: ContextAtlasConfig,
): DoctorCheck {
  const enabled = resolveExtractionStreams(config);
  const disabled = disabledExtractionStreams(enabled);
  let message = [...enabled].join(", ");
  if (usesDefaultExtractionStreams(config)) message += " (default)";
  if (disabled.length > 0) message += ` (disabled: ${disabled.join(", ")})`;

  const frozen = countAtlasClaimsByStream(
    pathResolve(repoRoot, config.atlas.path),
  );
  const stale = disabled.filter((s) => (frozen.get(s) ?? 0) > 0);
  if (stale.length === 0) {
    return {
      id: "config.extraction_streams",
      category: "config",
      status: "pass",
      message,
    };
  }

  const total = stale.reduce((n, s) => n + (frozen.get(s) ?? 0), 0);
  const counts = stale.map((s) => `${frozen.get(s)} ${s}`).join(" + ");
  return {
    id: "config.extraction_streams",
    category: "config",
    status: "warn",
    message:
      `${message}; atlas still holds ${counts} claim${total === 1 ? "" : "s"} ` +
      "from disabled streams",
    detail:
      `Claims of a disabled stream are kept frozen: extraction does not ` +
      `refresh them, so they go stale as the code changes but are still ` +
      `returned by queries (only the docstring claims of a source file ` +
      `that no longer exists are still removed). To keep them current, add ` +
      `${stale.join(" and ")} back to extraction.streams in ` +
      `.contextatlas.yml (or remove the key to run all three streams) ` +
      `and re-run extraction.`,
  };
}

/**
 * Claim counts per config stream in the atlas at `atlasPath`. Empty
 * when the file is missing or not a JSON object with a `claims` array.
 */
function countAtlasClaimsByStream(
  atlasPath: string,
): Map<ExtractionStream, number> {
  const counts = new Map<ExtractionStream, number>();
  if (!existsSync(atlasPath)) return counts;
  let atlas: unknown;
  try {
    atlas = JSON.parse(readFileSync(atlasPath, "utf8"));
  } catch {
    return counts;
  }
  const claims =
    typeof atlas === "object" && atlas !== null && "claims" in atlas
      ? (atlas as { claims: unknown }).claims
      : undefined;
  if (!Array.isArray(claims)) return counts;
  for (const claim of claims) {
    const source =
      typeof claim === "object" && claim !== null && "source" in claim
        ? (claim as { source: unknown }).source
        : undefined;
    if (typeof source !== "string") continue;
    const stream = extractionStreamOf(streamFromClaimSource(source));
    counts.set(stream, (counts.get(stream) ?? 0) + 1);
  }
  return counts;
}
