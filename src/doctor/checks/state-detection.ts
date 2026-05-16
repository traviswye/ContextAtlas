/**
 * H5 multi-dimension state-detection logic per v0.6 Step 3.3 (Q3.0.3
 * + Q3.0.7 locks at v0.6 Step 3.0; Q3.3.1-Q3.3.8 locks at v0.6 Step
 * 3.3 surface review).
 *
 * Detects 6 substrate dimensions independently (per Q3.3.1 single-
 * file lock + Q3.0.3 independent-detection lock):
 *   1. ADRs — pattern-match `^\d{4}-.*\.md$` in resolved ADR dir
 *      (config-driven OR canonical `docs/adr/` fallback per Q3.3.2)
 *   2. code — source files matching language extensions; binary
 *      present + substantive ≥5 advisory per Q3.3.3
 *   3. README — file existence + word count ≥300 per Q3.3.4 +
 *      Q3.0.7 placeholder
 *   4. DESIGN.md — file existence + word count ≥500 per Q3.3.4 +
 *      Q3.0.7 placeholder
 *   5. language — configured from `.contextatlas.yml` OR auto-detect
 *      via file-extension scan per Q3.3.5
 *   6. git — atlas committed + extracted_at_sha matches HEAD per
 *      Q3.3.6 (reuses A4 atlas-only-mode helpers from
 *      src/queries/atlas-only-mode.ts)
 *
 * Detection layer is independent per Travis observation lock at Step
 * 3.0 (H5 = detection layer; A6 doctor = consumer for verbose-mode
 * UX; cohort recruitment infrastructure = consumer for participant
 * selection criteria). Each consumer references H5 detection output
 * for its own purpose without coupling H5 implementation to consumer
 * concerns.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve, join as pathJoin } from "node:path";

import {
  detectAtlasOnlyAvailable,
  readHeadSha,
} from "../../queries/atlas-only-mode.js";
import type { LanguageCode } from "../../types.js";
import {
  ADR_NAMING_PATTERNS,
  enumerateAdrFiles,
} from "../../utils/adr-enumeration.js";
import type { CheckContext, DoctorCheck } from "../types.js";
import { walkForSourceFiles } from "./sample-symbol.js";

// ---------------------------------------------------------------------------
// Threshold placeholders per Q3.0.7 + Q3.3.4 + Q3.3.3 locks
// ---------------------------------------------------------------------------

const README_SUBSTANTIVE_WORD_THRESHOLD = 300;
const DESIGN_SUBSTANTIVE_WORD_THRESHOLD = 500;
const CODE_SUBSTANTIVE_FILE_THRESHOLD = 5;

const STATE_DETECTION_WALK_DEPTH = 4;

/**
 * Common language → extensions mapping for state-detection auto-
 * detect mode. Mirrors per-adapter extensions exports (GO_EXTENSIONS;
 * PYTHON_EXTENSIONS; TypeScriptAdapter extensions); kept as inline
 * mapping to avoid tight coupling to adapter modules at detection
 * layer.
 */
const LANGUAGE_EXTENSIONS: Record<string, readonly string[]> = {
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  python: [".py"],
  go: [".go"],
  ruby: [".rb"],
  rust: [".rs"],
  java: [".java"],
  csharp: [".cs"],
};

/**
 * ContextAtlasConfig-supported language subset (per LanguageCode
 * union in src/types.ts). Used by detectLanguagesFromFilesystem to
 * filter LANGUAGE_EXTENSIONS map down to languages init can write to
 * scaffold; missing-language case (e.g., Rust-only repo) flows to
 * new-project route per Q4.3.3 lock at v0.6 Step 4.3 surface review.
 */
const ATLAS_SUPPORTED_LANGUAGES: ReadonlySet<LanguageCode> = new Set<LanguageCode>([
  "typescript",
  "python",
  "go",
  "ruby",
]);

// ---------------------------------------------------------------------------
// Per-dimension detectors
// ---------------------------------------------------------------------------

/**
 * ADRs dimension: enumerate ADR files via the unified adr-enumeration
 * module (3 naming conventions × 2 extensions, recursive depth-2 walk
 * per Scope γ' lock at v0.7 Step 2.1.a). Config-driven path if
 * `.contextatlas.yml` specifies `adrs.path`; canonical `docs/adr/`
 * fallback otherwise.
 *
 * Before v0.7 Step 2.1.a the detector used a hard-coded Nygard regex
 * that diverged from the extraction-side walker; FO-2 fix unifies
 * both code paths on enumerateAdrFiles().
 */
function detectAdrs(ctx: CheckContext): DoctorCheck[] {
  // Resolve ADR directory: config-driven if specified; canonical fallback
  let adrDir: string;
  // ContextAtlasConfig has adrs.path per src/types.ts (v0.4 era)
  // Type narrowing: ctx.config can be null in limited mode
  const configuredPath = (ctx.config as { adrs?: { path?: string } } | null)
    ?.adrs?.path;
  if (configuredPath !== undefined && typeof configuredPath === "string") {
    adrDir = pathResolve(ctx.repoRoot, configuredPath);
  } else {
    adrDir = pathResolve(ctx.repoRoot, "docs", "adr");
  }

  if (!existsSync(adrDir)) {
    return [
      {
        id: "state-detection.adrs.count",
        category: "state-detection",
        status: "warn",
        message: "ADR directory not found",
        detail:
          `Expected ADR directory at ${adrDir}. ContextAtlas requires ` +
          `ADRs for atlas extraction substrate. Run ` +
          `\`contextatlas generate-adrs --yes\` to generate ADRs from ` +
          `your codebase, or create manually following supported ` +
          `naming conventions (Nygard \`0001-name.md|rst\`, ` +
          `\`ADR-NN-name.md|rst\`, or date-prefixed ` +
          `\`YYYY-MM-DD-name.md|rst\`).`,
      },
    ];
  }

  let adrFiles;
  try {
    adrFiles = enumerateAdrFiles(adrDir);
  } catch (err) {
    return [
      {
        id: "state-detection.adrs.count",
        category: "state-detection",
        status: "fail",
        message: "ADR directory unreadable",
        detail: err instanceof Error ? err.message : String(err),
      },
    ];
  }

  if (adrFiles.length === 0) {
    return [
      {
        id: "state-detection.adrs.count",
        category: "state-detection",
        status: "warn",
        message: "ADR directory exists but contains 0 ADRs matching supported conventions",
        detail:
          `ADR directory ${adrDir} contains no files matching the ` +
          `supported naming conventions (Nygard \`0001-name.md|rst\`, ` +
          `\`ADR-NN-name.md|rst\`, or date-prefixed \`YYYY-MM-DD-name.md|rst\`). ` +
          `ContextAtlas requires ADRs for atlas extraction substrate; add at ` +
          `least one ADR matching a supported convention.`,
      },
    ];
  }

  const mdCount = adrFiles.filter((f) => f.format === "md").length;
  const rstCount = adrFiles.filter((f) => f.format === "rst").length;
  const formatSummary = rstCount > 0 ? ` (${mdCount} .md + ${rstCount} .rst)` : "";

  return [
    {
      id: "state-detection.adrs.count",
      category: "state-detection",
      status: "pass",
      message: `${adrFiles.length} ADR(s) detected${formatSummary}`,
      detail:
        `Matched ${adrFiles.length} files in ${adrDir} against supported ` +
        `naming conventions (${ADR_NAMING_PATTERNS.length} patterns; ` +
        `.md + .rst extensions; recursive depth-2 walk).`,
    },
  ];
}

/**
 * code dimension: source files matching language extensions per
 * Q3.3.3 hybrid binary + substantive lock. Substantive threshold ≥5
 * source files.
 */
function detectCode(ctx: CheckContext): DoctorCheck[] {
  const extensions = collectLanguageExtensions(ctx);
  const files = walkForSourceFiles(
    ctx.repoRoot,
    extensions,
    STATE_DETECTION_WALK_DEPTH,
  );

  const out: DoctorCheck[] = [];

  if (files.length === 0) {
    out.push({
      id: "state-detection.code.present",
      category: "state-detection",
      status: "warn",
      message: "no source files detected",
      detail:
        `Repo walk (depth ${STATE_DETECTION_WALK_DEPTH}) found no files ` +
        `matching extensions: ${[...extensions].join(", ")}. May indicate ` +
        `new project state or unsupported language.`,
    });
    return out;
  }

  out.push({
    id: "state-detection.code.present",
    category: "state-detection",
    status: "pass",
    message: `${files.length} source file(s) detected`,
  });

  // Substantive advisory per Q3.3.3 hybrid pattern
  if (files.length < CODE_SUBSTANTIVE_FILE_THRESHOLD) {
    out.push({
      id: "state-detection.code.substantive",
      category: "state-detection",
      status: "warn",
      message: `code present but sparse (${files.length} < ${CODE_SUBSTANTIVE_FILE_THRESHOLD} threshold)`,
      detail:
        `Sparse code state may indicate new project or partial migration. ` +
        `Substantive threshold ${CODE_SUBSTANTIVE_FILE_THRESHOLD} files is ` +
        `placeholder; refinement candidate per cohort feedback at v0.6 ` +
        `cycle close.`,
    });
  } else {
    out.push({
      id: "state-detection.code.substantive",
      category: "state-detection",
      status: "pass",
      message: `code substantive (${files.length} >= ${CODE_SUBSTANTIVE_FILE_THRESHOLD} threshold)`,
    });
  }

  return out;
}

/**
 * README dimension: file existence binary + word count ≥300
 * substantive per Q3.3.4 + Q3.0.7 placeholder.
 */
function detectReadme(ctx: CheckContext): DoctorCheck[] {
  return detectMarkdownFile(
    ctx,
    "README.md",
    "readme",
    README_SUBSTANTIVE_WORD_THRESHOLD,
  );
}

/**
 * DESIGN.md dimension: file existence binary + word count ≥500
 * substantive per Q3.3.4 + Q3.0.7 placeholder.
 */
function detectDesignMd(ctx: CheckContext): DoctorCheck[] {
  return detectMarkdownFile(
    ctx,
    "DESIGN.md",
    "design_md",
    DESIGN_SUBSTANTIVE_WORD_THRESHOLD,
  );
}

/**
 * Shared markdown file detector (README + DESIGN.md). Returns
 * present + substantive checks per Q3.0.7 hybrid pattern.
 */
function detectMarkdownFile(
  ctx: CheckContext,
  filename: string,
  dimensionId: string,
  wordThreshold: number,
): DoctorCheck[] {
  const filePath = pathJoin(ctx.repoRoot, filename);
  const out: DoctorCheck[] = [];

  if (!existsSync(filePath)) {
    out.push({
      id: `state-detection.${dimensionId}.present`,
      category: "state-detection",
      status: "warn",
      message: `${filename} not found at repo root`,
      detail:
        `For best results, add ${filename} at repo root. ` +
        `Architectural narrative in ${filename} substantively improves ` +
        `\`contextatlas generate-adrs\` output quality (reference context ` +
        `for the LLM during ADR generation).`,
    });
    return out;
  }

  out.push({
    id: `state-detection.${dimensionId}.present`,
    category: "state-detection",
    status: "pass",
    message: `${filename} present at repo root`,
  });

  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (err) {
    out.push({
      id: `state-detection.${dimensionId}.substantive`,
      category: "state-detection",
      status: "fail",
      message: `${filename} unreadable`,
      detail: err instanceof Error ? err.message : String(err),
    });
    return out;
  }

  const wordCount = countWords(content);

  if (wordCount < wordThreshold) {
    out.push({
      id: `state-detection.${dimensionId}.substantive`,
      category: "state-detection",
      status: "warn",
      message: `${filename} sparse (${wordCount} < ${wordThreshold} word threshold)`,
      detail:
        `Substantive content threshold is placeholder per Q3.0.7 lock; ` +
        `refinement candidate per cohort feedback at v0.6 cycle close.`,
    });
  } else {
    out.push({
      id: `state-detection.${dimensionId}.substantive`,
      category: "state-detection",
      status: "pass",
      message: `${filename} substantive (${wordCount} >= ${wordThreshold} word threshold)`,
    });
  }

  return out;
}

/**
 * Languages dimension: configured from `.contextatlas.yml` OR auto-
 * detect via file-extension scan per Q3.3.5 hybrid lock. Reports
 * detected language list as info-level pass check.
 */
function detectLanguages(ctx: CheckContext): DoctorCheck[] {
  const configuredLanguages = (ctx.config as { languages?: readonly string[] } | null)
    ?.languages;

  if (configuredLanguages !== undefined && configuredLanguages.length > 0) {
    return [
      {
        id: "state-detection.languages.detected",
        category: "state-detection",
        status: "pass",
        message: `${configuredLanguages.length} language(s) configured`,
        detail: `Configured: ${configuredLanguages.join(", ")}`,
      },
    ];
  }

  // Auto-detect via file-extension scan
  const detected: string[] = [];
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    const files = walkForSourceFiles(
      ctx.repoRoot,
      new Set(exts),
      STATE_DETECTION_WALK_DEPTH,
    );
    if (files.length > 0) {
      detected.push(lang);
    }
  }

  if (detected.length === 0) {
    return [
      {
        id: "state-detection.languages.detected",
        category: "state-detection",
        status: "warn",
        message: "no recognized languages detected",
        detail:
          `Auto-detect scanned for: ${Object.keys(LANGUAGE_EXTENSIONS).join(", ")}. ` +
          `No source files matched. May indicate empty repo or unsupported language.`,
      },
    ];
  }

  return [
    {
      id: "state-detection.languages.detected",
      category: "state-detection",
      status: "pass",
      message: `${detected.length} language(s) auto-detected`,
      detail: `Auto-detected: ${detected.join(", ")}`,
    },
  ];
}

/**
 * git dimension: atlas committed + extracted_at_sha matches HEAD
 * per Q3.3.6 lock (reuses A4 atlas-only-mode helpers from
 * src/queries/atlas-only-mode.ts).
 */
async function detectGit(ctx: CheckContext): Promise<DoctorCheck[]> {
  const headSha = readHeadSha(ctx.repoRoot);
  if (headSha === null) {
    return [
      {
        id: "state-detection.git.atlas_consistent",
        category: "state-detection",
        status: "warn",
        message: "not a git repository (HEAD unreadable)",
        detail:
          `Repo at ${ctx.repoRoot} is not under git OR git command failed. ` +
          `ContextAtlas atlas-only-mode optimization requires git for HEAD ` +
          `consistency check.`,
      },
    ];
  }

  const atlasPath = pathJoin(ctx.repoRoot, ".contextatlas", "atlas.json");
  const result = await detectAtlasOnlyAvailable(atlasPath, headSha);

  if (result === null) {
    // Distinguish atlas-absent from SHA-mismatch via existsSync
    if (!existsSync(atlasPath)) {
      return [
        {
          id: "state-detection.git.atlas_consistent",
          category: "state-detection",
          status: "warn",
          message: "atlas.json not present",
          detail:
            `Expected at ${atlasPath}. Run \`contextatlas init\` (v0.6 ` +
            `onboarding pipeline) to extract atlas, OR \`contextatlas index\` ` +
            `directly.`,
        },
      ];
    }
    return [
      {
        id: "state-detection.git.atlas_consistent",
        category: "state-detection",
        status: "warn",
        message: "atlas.json stale (extracted_at_sha mismatches HEAD)",
        detail:
          `atlas.json at ${atlasPath} was extracted at a different commit ` +
          `than current HEAD (${headSha}). Re-run extraction to refresh.`,
      },
    ];
  }

  return [
    {
      id: "state-detection.git.atlas_consistent",
      category: "state-detection",
      status: "pass",
      message: "atlas.json consistent with HEAD",
      detail: `extracted_at_sha matches HEAD ${headSha}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collects all extensions to scan based on config.languages OR
 * fall back to all known languages.
 */
function collectLanguageExtensions(ctx: CheckContext): Set<string> {
  const out = new Set<string>();
  const configuredLanguages = (ctx.config as { languages?: readonly string[] } | null)
    ?.languages;

  if (configuredLanguages !== undefined && configuredLanguages.length > 0) {
    for (const lang of configuredLanguages) {
      const exts = LANGUAGE_EXTENSIONS[lang];
      if (exts !== undefined) {
        for (const ext of exts) out.add(ext);
      }
    }
  } else {
    // Limited mode / auto-detect: scan all known languages
    for (const exts of Object.values(LANGUAGE_EXTENSIONS)) {
      for (const ext of exts) out.add(ext);
    }
  }

  return out;
}

/**
 * Whitespace-split + filter-non-empty word count per Q3.3.4 raw-
 * count refinement (NOT markdown-stripped). Threshold placeholders
 * are heuristic; consistency across word-count operations matters
 * more than accuracy at v0.6.
 */
function countWords(content: string): number {
  return content.split(/\s+/).filter((w) => w.length > 0).length;
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

/**
 * Run all 6 dimension detectors and aggregate results into DoctorCheck
 * array. Per H5 detection-layer-separation observation lock at v0.6
 * Step 3.0: H5 produces state-detection checks; doctor consumes for
 * verbose-mode UX; cohort recruitment consumes for participant
 * selection criteria.
 */
/**
 * Returns ContextAtlasConfig-supported languages detected in the
 * filesystem (typescript / python / go / ruby subset per
 * LanguageCode union; filters out javascript/rust/java/csharp from
 * LANGUAGE_EXTENSIONS map). Pure helper — no config required;
 * avoids chicken-and-egg with config setup at runner Step 4.3
 * sequence per Q4.3.3 + Q4.3.4 locks.
 *
 * Used by `runInitSubcommand` at Step 4.3 detect-then-scaffold
 * reorder per Q4.3.4 lock + Q4.2.4 Q11-style refinement (replaces
 * STEP_4_2_LANGUAGES_PLACEHOLDER with H5-detected languages list).
 */
export function detectLanguagesFromFilesystem(
  repoRoot: string,
): readonly LanguageCode[] {
  const detected: LanguageCode[] = [];
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (!ATLAS_SUPPORTED_LANGUAGES.has(lang as LanguageCode)) continue;
    const files = walkForSourceFiles(
      repoRoot,
      new Set(exts),
      STATE_DETECTION_WALK_DEPTH,
    );
    if (files.length > 0) {
      detected.push(lang as LanguageCode);
    }
  }
  return detected;
}

export async function stateDetectionChecks(
  ctx: CheckContext,
): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = [];
  out.push(...detectAdrs(ctx));
  out.push(...detectCode(ctx));
  out.push(...detectReadme(ctx));
  out.push(...detectDesignMd(ctx));
  out.push(...detectLanguages(ctx));
  out.push(...(await detectGit(ctx)));
  return out;
}
