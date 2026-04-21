/**
 * Parser for `.contextatlas.yml`.
 *
 * Strict per ADR-05: unknown keys (top-level or nested) are errors, not
 * warnings. The `version` field is the migration handle — locked at 1 in
 * this release. Every thrown error includes the resolved config file
 * path so multi-repo users can diagnose failures unambiguously.
 *
 * All paths coming out of this parser are normalized through
 * `normalizePath()` per ADR-01's ingest-boundary rule.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import yaml from "js-yaml";

import type { ContextAtlasConfig, LanguageCode } from "../types.js";
import { normalizePath } from "../utils/paths.js";

import {
  DEFAULT_ADRS_FORMAT,
  DEFAULT_ATLAS,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_DOCS_INCLUDE,
  DEFAULT_GIT_RECENT_COMMITS,
  DEFAULT_INDEX_MODEL,
} from "./defaults.js";

const VALID_LANGUAGES: readonly LanguageCode[] = ["typescript", "python"];
const VALID_ADR_FORMATS = ["markdown-frontmatter"] as const;
type ValidAdrFormat = (typeof VALID_ADR_FORMATS)[number];

const TOP_LEVEL_KEYS = [
  "version",
  "languages",
  "adrs",
  "docs",
  "git",
  "index",
  "atlas",
] as const;
const TOP_LEVEL_KEY_SET = new Set<string>(TOP_LEVEL_KEYS);

/**
 * Load and validate a ContextAtlas config file.
 *
 * @param repoRoot Absolute or relative path to the repo root; the
 *   caller is responsible for passing a sensible value (this parser
 *   does not normalize the root itself, per ADR-01's boundary rule).
 * @param configPath Optional explicit path (defaults to
 *   `.contextatlas.yml` inside `repoRoot`).
 */
export function loadConfig(
  repoRoot: string,
  configPath?: string,
): ContextAtlasConfig {
  const absConfigPath = pathResolve(
    repoRoot,
    configPath ?? DEFAULT_CONFIG_FILENAME,
  );
  if (!existsSync(absConfigPath)) {
    throw new Error(
      `ContextAtlas config not found at '${absConfigPath}'. ` +
        "Create a .contextatlas.yml at your repo root to configure ContextAtlas. " +
        "See DESIGN.md's Config Schema section for the expected shape.",
    );
  }

  const raw = readFileSync(absConfigPath, "utf8");
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    const e = err as {
      mark?: { line?: number; column?: number };
      reason?: string;
      message?: string;
    };
    const location = e.mark
      ? ` at line ${(e.mark.line ?? 0) + 1}, column ${(e.mark.column ?? 0) + 1}`
      : "";
    const detail = e.reason ?? e.message ?? String(err);
    throw new Error(
      `Invalid YAML in '${absConfigPath}'${location}: ${detail}`,
    );
  }

  return validate(parsed, absConfigPath);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(
  parsed: unknown,
  configPath: string,
): ContextAtlasConfig {
  if (!isObject(parsed)) {
    throw cfgError(
      configPath,
      `Config root must be a YAML mapping (object), got ${describeType(parsed)}.`,
    );
  }

  rejectUnknownKeys(parsed, TOP_LEVEL_KEY_SET, "", configPath);

  const version = parsed.version;
  if (version === undefined) {
    throw cfgError(
      configPath,
      "Missing required field 'version'. Add 'version: 1' at the top of the config.",
    );
  }
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw cfgError(
      configPath,
      `Invalid 'version': expected integer 1, got ${describeType(version)}.`,
    );
  }
  if (version !== 1) {
    throw cfgError(
      configPath,
      `Config targets version ${version} but this tool reads version 1. ` +
        "Please upgrade contextatlas or regenerate your config.",
    );
  }

  const languages = validateLanguages(parsed.languages, configPath);
  const adrs = validateAdrs(parsed.adrs, configPath);
  const docs = validateDocs(parsed.docs, configPath);
  const git = validateGit(parsed.git, configPath);
  const index = validateIndex(parsed.index, configPath);
  const atlas = validateAtlas(parsed.atlas, configPath);

  return { version: 1, languages, adrs, docs, git, index, atlas };
}

function validateLanguages(
  raw: unknown,
  configPath: string,
): LanguageCode[] {
  if (raw === undefined) {
    throw cfgError(
      configPath,
      "Missing required field 'languages'. Specify at least one: " +
        VALID_LANGUAGES.join(", ") +
        ".",
    );
  }
  if (!Array.isArray(raw)) {
    throw cfgError(
      configPath,
      `Invalid 'languages': expected array of language identifiers, got ${describeType(raw)}.`,
    );
  }
  if (raw.length === 0) {
    throw cfgError(
      configPath,
      "Config field 'languages' must not be empty. Specify at least one: " +
        VALID_LANGUAGES.join(", ") +
        ".",
    );
  }
  const out: LanguageCode[] = [];
  for (const lang of raw) {
    if (
      typeof lang !== "string" ||
      !VALID_LANGUAGES.includes(lang as LanguageCode)
    ) {
      throw cfgError(
        configPath,
        `Unknown language '${String(lang)}' in 'languages'. ` +
          "Use lowercase language identifiers. Valid: " +
          VALID_LANGUAGES.join(", ") +
          ".",
      );
    }
    out.push(lang as LanguageCode);
  }
  return out;
}

function validateAdrs(
  raw: unknown,
  configPath: string,
): ContextAtlasConfig["adrs"] {
  if (raw === undefined) {
    throw cfgError(
      configPath,
      "Missing required section 'adrs'. At minimum set 'adrs.path' to " +
        "the directory containing your ADR files (e.g. 'docs/adr/').",
    );
  }
  if (!isObject(raw)) {
    throw cfgError(
      configPath,
      `Invalid 'adrs': expected object, got ${describeType(raw)}.`,
    );
  }
  rejectUnknownKeys(
    raw,
    new Set(["path", "format", "symbol_field"]),
    "adrs.",
    configPath,
  );

  const path = raw.path;
  if (typeof path !== "string" || path.length === 0) {
    throw cfgError(
      configPath,
      "Missing required field 'adrs.path'. Set it to the directory " +
        "containing your ADR files (e.g. 'docs/adr/').",
    );
  }

  const format = raw.format ?? DEFAULT_ADRS_FORMAT;
  if (
    typeof format !== "string" ||
    !VALID_ADR_FORMATS.includes(format as ValidAdrFormat)
  ) {
    throw cfgError(
      configPath,
      `Invalid 'adrs.format': expected one of ${VALID_ADR_FORMATS.join(", ")}, got ${String(format)}.`,
    );
  }

  const symbolField = raw.symbol_field;
  if (symbolField !== undefined && typeof symbolField !== "string") {
    throw cfgError(
      configPath,
      `Invalid 'adrs.symbol_field': expected string, got ${describeType(symbolField)}.`,
    );
  }

  const out: ContextAtlasConfig["adrs"] = {
    path: normalizePath(path),
    format: format as ValidAdrFormat,
  };
  if (typeof symbolField === "string") {
    out.symbolField = symbolField;
  }
  return out;
}

function validateDocs(
  raw: unknown,
  configPath: string,
): ContextAtlasConfig["docs"] {
  if (raw === undefined) {
    return { include: DEFAULT_DOCS_INCLUDE.map((p) => normalizePath(p)) };
  }
  if (!isObject(raw)) {
    throw cfgError(
      configPath,
      `Invalid 'docs': expected object with 'include' field, got ${describeType(raw)}.`,
    );
  }
  rejectUnknownKeys(raw, new Set(["include"]), "docs.", configPath);
  const include = raw.include;
  if (!Array.isArray(include)) {
    throw cfgError(
      configPath,
      `Invalid 'docs.include': expected array of glob patterns, got ${describeType(include)}.`,
    );
  }
  const out: string[] = [];
  for (const pattern of include) {
    if (typeof pattern !== "string" || pattern.length === 0) {
      throw cfgError(
        configPath,
        `Invalid entry in 'docs.include': expected non-empty string, got ${describeType(pattern)}.`,
      );
    }
    out.push(normalizePath(pattern));
  }
  return { include: out };
}

function validateGit(
  raw: unknown,
  configPath: string,
): ContextAtlasConfig["git"] {
  if (raw === undefined) {
    return { recentCommits: DEFAULT_GIT_RECENT_COMMITS };
  }
  if (!isObject(raw)) {
    throw cfgError(
      configPath,
      `Invalid 'git': expected object, got ${describeType(raw)}.`,
    );
  }
  rejectUnknownKeys(raw, new Set(["recent_commits"]), "git.", configPath);
  const recent = raw.recent_commits ?? DEFAULT_GIT_RECENT_COMMITS;
  if (
    typeof recent !== "number" ||
    !Number.isInteger(recent) ||
    recent < 0
  ) {
    throw cfgError(
      configPath,
      `Invalid 'git.recent_commits': expected non-negative integer, got ${String(recent)}.`,
    );
  }
  return { recentCommits: recent };
}

function validateIndex(
  raw: unknown,
  configPath: string,
): ContextAtlasConfig["index"] {
  if (raw === undefined) {
    return { model: DEFAULT_INDEX_MODEL };
  }
  if (!isObject(raw)) {
    throw cfgError(
      configPath,
      `Invalid 'index': expected object, got ${describeType(raw)}.`,
    );
  }
  rejectUnknownKeys(raw, new Set(["model"]), "index.", configPath);
  const model = raw.model ?? DEFAULT_INDEX_MODEL;
  if (typeof model !== "string" || model.length === 0) {
    throw cfgError(
      configPath,
      `Invalid 'index.model': expected non-empty string, got ${describeType(model)}.`,
    );
  }
  return { model };
}

function validateAtlas(
  raw: unknown,
  configPath: string,
): ContextAtlasConfig["atlas"] {
  if (raw === undefined) {
    return {
      committed: DEFAULT_ATLAS.committed,
      path: normalizePath(DEFAULT_ATLAS.path),
      localCache: normalizePath(DEFAULT_ATLAS.localCache),
    };
  }
  if (!isObject(raw)) {
    throw cfgError(
      configPath,
      `Invalid 'atlas': expected object, got ${describeType(raw)}.`,
    );
  }
  rejectUnknownKeys(
    raw,
    new Set(["committed", "path", "local_cache"]),
    "atlas.",
    configPath,
  );

  const committed = raw.committed ?? DEFAULT_ATLAS.committed;
  if (typeof committed !== "boolean") {
    throw cfgError(
      configPath,
      `Invalid 'atlas.committed': expected boolean, got ${describeType(committed)}.`,
    );
  }
  const path = raw.path ?? DEFAULT_ATLAS.path;
  if (typeof path !== "string" || path.length === 0) {
    throw cfgError(
      configPath,
      `Invalid 'atlas.path': expected non-empty string.`,
    );
  }
  const localCache = raw.local_cache ?? DEFAULT_ATLAS.localCache;
  if (typeof localCache !== "string" || localCache.length === 0) {
    throw cfgError(
      configPath,
      `Invalid 'atlas.local_cache': expected non-empty string.`,
    );
  }
  return {
    committed,
    path: normalizePath(path),
    localCache: normalizePath(localCache),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  pathPrefix: string,
  configPath: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      const valid = Array.from(allowed).sort().join(", ");
      throw cfgError(
        configPath,
        `Unknown key '${pathPrefix}${key}'. Valid keys at this level: ${valid}.`,
      );
    }
  }
}

function cfgError(configPath: string, message: string): Error {
  return new Error(
    `Invalid ContextAtlas config at '${configPath}': ${message}`,
  );
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function describeType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
