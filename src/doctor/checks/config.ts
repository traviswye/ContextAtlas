/**
 * Config-category doctor checks.
 *
 * Investigates `.contextatlas.yml` existence + parsing + per-field
 * validity. The runner has already attempted `loadConfig`; we read
 * `ctx.config` / `ctx.configError` to emit the right per-field
 * checks.
 */

import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

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

  return out;
}
