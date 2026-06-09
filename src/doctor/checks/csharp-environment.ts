/**
 * C# / .NET environment doctor checks per ADR-22 §Install Pattern
 * + v1.1 Phase 5.2 scope.
 *
 * Four C#-specific checks dispatched from `lsp.ts` `checkExecutable`
 * csharp branch. All checks use `category: "lsp"` per types.ts
 * category enum constraint (.NET environment is the substrate
 * csharp-ls spawns against; rolls up under LSP umbrella in doctor
 * output).
 *
 * Check inventory:
 *   1. dotnet_version          — version >= 8 (10+ recommended;
 *                                cohort-version anchor)
 *   2. csharp_ls_findable      — csharp-ls binary resolvable after
 *                                PATH enrichment (calls adapter's
 *                                enrichPathForDotnetTools first)
 *   3. csharp_ls_version       — version range [0.24.0, 1.0.0) per
 *                                ADR-22 §minimum-version pin +
 *                                major-version block
 *   4. project_files_detected  — .sln / .slnx / .csproj presence at
 *                                repoRoot (Roslyn workspace context)
 *
 * Non-applicable checks return null and are filtered out (e.g., the
 * version check is skipped when csharp-ls itself isn't findable —
 * the upstream check already surfaces a fail).
 *
 * Mirrors the ruby-environment.ts substrate-shape per Phase 5.2
 * precedent. Reasons for the smaller check count vs Ruby (10):
 *   - C# has no platform-conditional install pattern matrix
 *     parallel to Ruby's RubyInstaller / Homebrew / rbenv / RVM /
 *     chocolatey breadth — dotnet SDK ships from a single source
 *     (dotnet.microsoft.com) with consistent global-tool install
 *     semantics.
 *   - C# has no framework-conditional ecosystem parallel to Rails;
 *     no analog to ruby-lsp-rails / database.yml / tzinfo-data.
 *   - csharp-ls staleness signal (ADR-22 §maintenance-tail mitigation
 *     #2) deferred to v1.1.x — requires network call to GitHub
 *     release date; out of scope for offline-fast doctor.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

import { enrichPathForDotnetTools } from "../../adapters/csharp.js";
import type { DoctorCheck } from "../types.js";

const DOTNET_VERSION_MIN_MAJOR = 8;
const DOTNET_VERSION_RECOMMENDED_MAJOR = 10;
const CSHARP_LS_VERSION_MIN = "0.24.0";
const CSHARP_LS_VERSION_MAX_EXCLUSIVE = "1.0.0";
const SPAWN_TIMEOUT_MS = 10_000;

/**
 * Run all C# / .NET environment checks for `repoRoot`. Returns the
 * full check set with non-applicable checks filtered out.
 *
 * Enriches PATH for `%USERPROFILE%\.dotnet\tools` (Windows) /
 * `~/.dotnet/tools` (POSIX) at entry so csharp-ls is findable in
 * Bash/Git-Bash environments where the SDK installer only configures
 * PowerShell. Idempotent — the adapter also enriches PATH internally
 * before spawn.
 */
export function csharpEnvironmentChecks(repoRoot: string): DoctorCheck[] {
  enrichPathForDotnetTools();

  const dotnetCheck = checkDotnetVersion();
  const csharpLsFindable = checkCsharpLsFindable();
  // version check requires findable binary; suppress when upstream
  // already surfaced a fail to avoid duplicate noise.
  const csharpLsVersion =
    csharpLsFindable.status === "fail" ? null : checkCsharpLsVersion();

  const out: (DoctorCheck | null)[] = [
    dotnetCheck,
    csharpLsFindable,
    csharpLsVersion,
    checkProjectFilesDetected(repoRoot),
  ];

  return out.filter((c): c is DoctorCheck => c !== null);
}

// ---------------------------------------------------------------------------
// (1) dotnet_version — version >= 8 (10+ recommended)
// ---------------------------------------------------------------------------

function checkDotnetVersion(): DoctorCheck {
  const id = "lsp.csharp.dotnet_version";
  const dotnetBin = process.env.CONTEXTATLAS_DOTNET_BIN ?? "dotnet";
  const r = spawnSync(dotnetBin, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (r.error || r.status !== 0) {
    return {
      id,
      category: "lsp",
      status: "fail",
      message: `dotnet not resolvable on PATH (${dotnetBin})`,
      detail:
        `Install .NET SDK ${DOTNET_VERSION_MIN_MAJOR}+ ` +
        `(${DOTNET_VERSION_RECOMMENDED_MAJOR}+ recommended) from ` +
        "https://dotnet.microsoft.com/download and ensure `dotnet --version` " +
        "works in a plain shell. Set CONTEXTATLAS_DOTNET_BIN env var for " +
        "non-standard install paths. See ADR-22 §Install Pattern.",
    };
  }
  // Output format: "10.0.203" (or "8.0.404", etc.)
  const version = (r.stdout ?? "").trim();
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return {
      id,
      category: "lsp",
      status: "warn",
      message: "dotnet --version output did not parse",
      detail: `Raw output: ${version}`,
    };
  }
  const major = parseInt(match[1] ?? "0", 10);
  if (major < DOTNET_VERSION_MIN_MAJOR) {
    return {
      id,
      category: "lsp",
      status: "fail",
      message: `.NET SDK ${version} is below minimum ${DOTNET_VERSION_MIN_MAJOR}`,
      detail:
        `Upgrade to .NET SDK ${DOTNET_VERSION_MIN_MAJOR}+ ` +
        `(${DOTNET_VERSION_RECOMMENDED_MAJOR}+ recommended). csharp-ls ` +
        "0.24.x supports back through .NET 6.0 but ContextAtlas pins " +
        ".NET 8 LTS minimum per ADR-22 §Cohort-version support range.",
    };
  }
  if (major < DOTNET_VERSION_RECOMMENDED_MAJOR) {
    return {
      id,
      category: "lsp",
      status: "warn",
      message: `.NET SDK ${version} acceptable (minimum ${DOTNET_VERSION_MIN_MAJOR}); ${DOTNET_VERSION_RECOMMENDED_MAJOR}+ recommended`,
      detail:
        `.NET ${DOTNET_VERSION_RECOMMENDED_MAJOR} LTS is the cohort-` +
        "version anchor per ADR-22 §Cohort-version support range; .NET 8 " +
        "+ 9 are best-effort supported with substantively-similar behavior.",
    };
  }
  return {
    id,
    category: "lsp",
    status: "pass",
    message: `.NET SDK ${version} (>= ${DOTNET_VERSION_RECOMMENDED_MAJOR} recommended baseline)`,
  };
}

// ---------------------------------------------------------------------------
// (2) csharp_ls_findable — binary resolvable after PATH enrichment
// ---------------------------------------------------------------------------

function checkCsharpLsFindable(): DoctorCheck {
  const id = "lsp.csharp.csharp_ls_findable";
  const cliPath =
    process.env.CONTEXTATLAS_CSHARP_LSP_BIN ?? "csharp-ls";
  const whichCmd = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(whichCmd, [cliPath], {
    encoding: "utf8",
    windowsHide: true,
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (r.status !== 0 || (r.stdout ?? "").trim().length === 0) {
    return {
      id,
      category: "lsp",
      status: "fail",
      message: `csharp-ls not on PATH (${cliPath})`,
      detail:
        "Install via `dotnet tool install --global csharp-ls`. On Windows, " +
        "the binary lands at `%USERPROFILE%\\.dotnet\\tools\\csharp-ls.exe`; " +
        "the adapter enriches PATH automatically for Bash/Git-Bash where " +
        "the SDK installer only configures PowerShell. Set " +
        "CONTEXTATLAS_CSHARP_LSP_BIN env var for non-standard install " +
        "paths. See ADR-22 §Install Pattern.",
    };
  }
  return {
    id,
    category: "lsp",
    status: "pass",
    message: "csharp-ls resolved on PATH",
    detail: (r.stdout ?? "").trim().split(/\r?\n/)[0],
  };
}

// ---------------------------------------------------------------------------
// (3) csharp_ls_version — version range [0.24.0, 1.0.0)
// ---------------------------------------------------------------------------

function checkCsharpLsVersion(): DoctorCheck {
  const id = "lsp.csharp.csharp_ls_version";
  const cliPath =
    process.env.CONTEXTATLAS_CSHARP_LSP_BIN ?? "csharp-ls";
  const r = spawnSync(cliPath, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (r.error || r.status !== 0) {
    return {
      id,
      category: "lsp",
      status: "warn",
      message: "csharp-ls --version did not return cleanly",
      detail: `Stderr: ${(r.stderr ?? "").trim() || "(empty)"}`,
    };
  }
  // Output format: "csharp-ls, 0.24.0.0" or similar; parse semver triple.
  const raw = (r.stdout ?? "").trim();
  const match = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return {
      id,
      category: "lsp",
      status: "warn",
      message: "csharp-ls --version output did not parse",
      detail: `Raw output: ${raw}`,
    };
  }
  const version = `${match[1]}.${match[2]}.${match[3]}`;
  const major = parseInt(match[1] ?? "0", 10);
  const minor = parseInt(match[2] ?? "0", 10);

  // < 0.24.0 → fail (below minimum pin)
  if (major === 0 && minor < 24) {
    return {
      id,
      category: "lsp",
      status: "fail",
      message: `csharp-ls ${version} is below minimum ${CSHARP_LS_VERSION_MIN}`,
      detail:
        `Upgrade via \`dotnet tool update --global csharp-ls\`. Adapter ` +
        `pins csharp-ls >= ${CSHARP_LS_VERSION_MIN} per ADR-22 §minimum-` +
        "version pin (Phase 0 probe substrate empirical at csharp-ls " +
        "0.24.0.0).",
    };
  }
  // >= 1.0.0 → fail (major-version block per ADR-22)
  if (major >= 1) {
    return {
      id,
      category: "lsp",
      status: "fail",
      message: `csharp-ls ${version} is at or above major-version block ${CSHARP_LS_VERSION_MAX_EXCLUSIVE}`,
      detail:
        `Adapter accepts csharp-ls in range [${CSHARP_LS_VERSION_MIN}, ` +
        `${CSHARP_LS_VERSION_MAX_EXCLUSIVE}) per ADR-22 §minimum-version ` +
        "pin + major-version block. csharp-ls 1.0+ may introduce wrapper " +
        "shape changes requiring adapter-side validation. Downgrade via " +
        "`dotnet tool install --global csharp-ls --version 0.24.x` until " +
        "a v1.1.x adapter release validates the new major.",
    };
  }
  return {
    id,
    category: "lsp",
    status: "pass",
    message: `csharp-ls ${version} (in pinned range [${CSHARP_LS_VERSION_MIN}, ${CSHARP_LS_VERSION_MAX_EXCLUSIVE}))`,
  };
}

// ---------------------------------------------------------------------------
// (4) project_files_detected — .sln / .slnx / .csproj at repoRoot
// ---------------------------------------------------------------------------

function checkProjectFilesDetected(repoRoot: string): DoctorCheck {
  const id = "lsp.csharp.project_files_detected";
  if (!existsSync(repoRoot)) {
    return {
      id,
      category: "lsp",
      status: "warn",
      message: "repoRoot does not exist",
      detail: `Checked: ${repoRoot}`,
    };
  }
  let entries: string[];
  try {
    entries = readdirSync(repoRoot);
  } catch (err) {
    return {
      id,
      category: "lsp",
      status: "warn",
      message: "could not read repoRoot",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  const slns = entries.filter(
    (f) => f.endsWith(".sln") || f.endsWith(".slnx"),
  );
  const csprojs = entries.filter((f) => f.endsWith(".csproj"));

  if (slns.length === 0 && csprojs.length === 0) {
    return {
      id,
      category: "lsp",
      status: "warn",
      message: "no .sln / .slnx / .csproj at repoRoot",
      detail:
        "csharp-ls auto-discovers projects from solution / project files at " +
        "the workspace root. Without one, Roslyn workspace context is empty " +
        "and listSymbols may return no results. For solution-grouped repos, " +
        "ensure a .sln (or .slnx) sits at the same level as ContextAtlas " +
        "runs. Subdirectory .csproj files are not auto-discovered without " +
        "an enclosing solution file.",
    };
  }

  const detected = [...slns, ...csprojs];
  return {
    id,
    category: "lsp",
    status: "pass",
    message: `${detected.length} project file(s) at repoRoot`,
    detail: detected.join(", "),
  };
}
