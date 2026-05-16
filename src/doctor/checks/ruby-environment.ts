/**
 * Ruby + Rails environment doctor checks per ADR-21 §Install Pattern
 * and v0.9 Stream A Substep 5.2 scope.
 *
 * Ten Ruby-specific checks dispatched from `lsp.ts` `checkExecutable`
 * Ruby branch. All checks use `category: "lsp"` per types.ts category
 * enum constraint (Ruby environment is the substrate ruby-lsp spawns
 * against; rolls up under LSP umbrella in doctor output).
 *
 * Check inventory:
 *   1. ruby_version            — version >= 3.3 (4.0+ recommended;
 *                                warn-not-error pattern)
 *   2. bundler                 — `bundle --version` resolvable
 *   3. ruby_lsp_gem            — ruby-lsp gem available via bundler
 *                                or direct gem-install (per
 *                                resolveSpawnPattern)
 *   4. rails_detected          — informational (Gemfile + bin/rails
 *                                presence per detectRails())
 *   5. ruby_lsp_rails_gem      — warn if Rails detected + gem missing
 *                                (graceful degrade per Path β+δ)
 *   6. multiple_ruby_installs  — PATH precedence warning if multiple
 *                                ruby binaries on PATH
 *   7. non_path_ruby_install   — rbenv/RVM/chocolatey detected but
 *                                not on PATH [Phase 4 cohort-UX
 *                                deferral absorbed]
 *   8. libyaml_windows         — Windows-only: ruby Psych load test
 *                                (libyaml dev headers may need
 *                                `ridk install`)
 *   9. tzinfo_data_windows     — Windows + Rails: tzinfo-data gem
 *                                presence (required for Rails-on-
 *                                Windows tz init)
 *  10. database_yml            — informational; absence OK at v1.0
 *                                per Path β+δ acceptance (ruby-lsp-
 *                                rails Rails-runner addon may fail
 *                                to initialize; core ruby-lsp
 *                                documentSymbol/hover/references
 *                                unaffected)
 *
 * Non-applicable checks return null and are filtered out at the
 * orchestrator (Rails-conditional checks fire only when
 * detectRails() === true; platform-conditional checks fire only on
 * matching platform).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join as pathJoin } from "node:path";

import { detectRails, resolveSpawnPattern } from "../../adapters/ruby.js";
import type { DoctorCheck } from "../types.js";

const RUBY_VERSION_MIN = "3.3";
const RUBY_VERSION_RECOMMENDED = "4.0";
const SPAWN_TIMEOUT_MS = 10_000;

/**
 * Run all Ruby environment checks for `repoRoot`. Returns the full
 * check set (always-on + Rails-conditional + platform-conditional)
 * with non-applicable checks filtered out.
 */
export function rubyEnvironmentChecks(repoRoot: string): DoctorCheck[] {
  const railsDetected = detectRails(repoRoot);
  const isWindows = process.platform === "win32";

  const out: (DoctorCheck | null)[] = [
    checkRubyVersion(),
    checkBundler(),
    checkRubyLspGem(railsDetected),
    checkRailsDetected(railsDetected),
    railsDetected ? checkRubyLspRailsGem(repoRoot) : null,
    checkMultipleRubyInstalls(),
    checkNonPathRubyInstall(),
    isWindows ? checkLibyamlWindows() : null,
    isWindows && railsDetected ? checkTzinfoDataWindows(repoRoot) : null,
    railsDetected ? checkDatabaseYml(repoRoot) : null,
  ];

  return out.filter((c): c is DoctorCheck => c !== null);
}

// ---------------------------------------------------------------------------
// (1) ruby_version — version >= 3.3 (4.0+ recommended)
// ---------------------------------------------------------------------------

function checkRubyVersion(): DoctorCheck {
  const id = "lsp.ruby.ruby_version";
  const r = spawnSync("ruby", ["--version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (r.error || r.status !== 0) {
    return {
      id,
      category: "lsp",
      status: "fail",
      message: "ruby not resolvable on PATH",
      detail:
        `Install Ruby ${RUBY_VERSION_MIN}+ (${RUBY_VERSION_RECOMMENDED}+ ` +
        "recommended per ADR-21 §Cohort-version range) and ensure " +
        "`ruby --version` works in a plain shell. Windows + " +
        "RubyInstaller users may need `ridk install` for full toolchain " +
        "setup. See ADR-21 §Install Pattern for environmental matrix.",
    };
  }
  // Output format: "ruby 3.3.0p0 (2024-01-01 revision ...) [...]"
  const match = (r.stdout ?? "").trim().match(/^ruby\s+(\d+)\.(\d+)/);
  if (!match) {
    return {
      id,
      category: "lsp",
      status: "warn",
      message: "ruby --version output did not parse",
      detail: `Raw output: ${(r.stdout ?? "").trim()}`,
    };
  }
  const major = parseInt(match[1] ?? "0", 10);
  const minor = parseInt(match[2] ?? "0", 10);
  const version = `${major}.${minor}`;
  // < 3.3 → fail
  if (major < 3 || (major === 3 && minor < 3)) {
    return {
      id,
      category: "lsp",
      status: "fail",
      message: `ruby ${version} is below minimum ${RUBY_VERSION_MIN}`,
      detail:
        `Upgrade Ruby to ${RUBY_VERSION_MIN}+ (${RUBY_VERSION_RECOMMENDED}+ ` +
        "recommended). ruby-lsp 0.26.x requires Ruby 3.3 minimum per " +
        "ADR-21 §Cohort-version range.",
    };
  }
  // 3.3 / 3.4 → warn (acceptable but below recommended)
  if (major < 4) {
    return {
      id,
      category: "lsp",
      status: "warn",
      message: `ruby ${version} acceptable (minimum ${RUBY_VERSION_MIN}); ${RUBY_VERSION_RECOMMENDED}+ recommended`,
      detail:
        "ruby-lsp 0.26.x supports 3.3+; Ruby 4.0+ recommended per ADR-21 " +
        "§Cohort-version range for performance + Rubydex-readiness at v1.1+.",
    };
  }
  // 4.0+ → pass
  return {
    id,
    category: "lsp",
    status: "pass",
    message: `ruby ${version} (>= ${RUBY_VERSION_RECOMMENDED} recommended baseline)`,
  };
}

// ---------------------------------------------------------------------------
// (2) bundler — `bundle --version` resolvable
// ---------------------------------------------------------------------------

function checkBundler(): DoctorCheck {
  const id = "lsp.ruby.bundler";
  const bundleBin =
    process.env.CONTEXTATLAS_BUNDLE_BIN ??
    (process.platform === "win32" ? "bundle.bat" : "bundle");
  const r = spawnSync(bundleBin, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (r.error || r.status !== 0) {
    return {
      id,
      category: "lsp",
      status: "fail",
      message: `bundler not resolvable (${bundleBin})`,
      detail:
        "Install via `gem install bundler` (bundled with Ruby 3.0+ but " +
        "may need refresh). Set CONTEXTATLAS_BUNDLE_BIN env var if your " +
        "install uses a non-standard binary name.",
    };
  }
  const version = (r.stdout ?? "").trim();
  return {
    id,
    category: "lsp",
    status: "pass",
    message: version || "bundler resolved",
  };
}

// ---------------------------------------------------------------------------
// (3) ruby_lsp_gem — ruby-lsp gem available via bundler-or-direct
// ---------------------------------------------------------------------------

function checkRubyLspGem(railsDetected: boolean): DoctorCheck {
  const id = "lsp.ruby.ruby_lsp_gem";
  const spawn = resolveSpawnPattern({ railsDetected });
  // For bundler pattern: `bundle exec ruby-lsp --version` proves
  // ruby-lsp is in the Gemfile.lock dep graph.
  // For direct pattern: `ruby-lsp --version` proves it's gem-installed
  // and resolvable.
  const args =
    spawn.pattern === "bundler"
      ? [...spawn.args, "--version"]
      : [...spawn.args, "--version"];
  const r = spawnSync(spawn.command, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (r.error || r.status !== 0) {
    return {
      id,
      category: "lsp",
      status: "fail",
      message: `ruby-lsp gem not resolvable (${spawn.pattern} pattern)`,
      detail:
        spawn.pattern === "bundler"
          ? "Add `gem 'ruby-lsp', '~> 0.26.0', require: false` under " +
            "`group :development` in Gemfile and run `bundle install`. " +
            "ADR-21 §Install Pattern documents the Bundler install pattern."
          : "Install via `gem install ruby-lsp` for the direct pattern, " +
            "or use Bundler with a Gemfile (recommended for project-pinned " +
            "version). Set CONTEXTATLAS_RUBY_LSP_BIN env var for non-" +
            "standard install paths.",
    };
  }
  return {
    id,
    category: "lsp",
    status: "pass",
    message: `ruby-lsp resolved via ${spawn.pattern} pattern`,
    detail: (r.stdout ?? "").trim() || undefined,
  };
}

// ---------------------------------------------------------------------------
// (4) rails_detected — informational
// ---------------------------------------------------------------------------

function checkRailsDetected(railsDetected: boolean): DoctorCheck {
  return {
    id: "lsp.ruby.rails_detected",
    category: "lsp",
    status: "pass",
    message: railsDetected
      ? "Rails detected (Gemfile + bin/rails present)"
      : "Rails not detected (no Gemfile or no bin/rails)",
    detail: railsDetected
      ? "ruby-lsp-rails addon will be loaded for Rails-specific symbol " +
        "awareness. Rails-conditional doctor checks will fire."
      : "Standalone Ruby fixture mode. ruby-lsp-rails addon will not " +
        "be loaded.",
  };
}

// ---------------------------------------------------------------------------
// (5) ruby_lsp_rails_gem — warn if Rails detected + gem missing
// ---------------------------------------------------------------------------

function checkRubyLspRailsGem(repoRoot: string): DoctorCheck {
  const id = "lsp.ruby.ruby_lsp_rails_gem";
  const bundleBin =
    process.env.CONTEXTATLAS_BUNDLE_BIN ??
    (process.platform === "win32" ? "bundle.bat" : "bundle");
  const isWindows = process.platform === "win32";
  const r = isWindows
    ? spawnSync(
        "cmd.exe",
        ["/c", bundleBin, "show", "ruby-lsp-rails"],
        {
          encoding: "utf8",
          windowsHide: true,
          cwd: repoRoot,
          timeout: SPAWN_TIMEOUT_MS,
        },
      )
    : spawnSync(bundleBin, ["show", "ruby-lsp-rails"], {
        encoding: "utf8",
        windowsHide: true,
        cwd: repoRoot,
        timeout: SPAWN_TIMEOUT_MS,
      });
  if (r.error || r.status !== 0) {
    return {
      id,
      category: "lsp",
      status: "warn",
      message: "ruby-lsp-rails gem not in Gemfile.lock",
      detail:
        "Add `gem 'ruby-lsp-rails', '~> 0.4.8', require: false` under " +
        "`group :development` in Gemfile and run `bundle install`. " +
        "ruby-lsp-rails enables Rails-specific symbol awareness " +
        "(associations, scopes, DSL macros). Graceful-degrades: core " +
        "ruby-lsp documentSymbol/hover/references work without it.",
    };
  }
  return {
    id,
    category: "lsp",
    status: "pass",
    message: "ruby-lsp-rails resolved via bundler",
    detail: (r.stdout ?? "").trim().split(/\r?\n/)[0],
  };
}

// ---------------------------------------------------------------------------
// (6) multiple_ruby_installs — PATH precedence warning
// ---------------------------------------------------------------------------

function checkMultipleRubyInstalls(): DoctorCheck {
  const id = "lsp.ruby.multiple_ruby_installs";
  const whichCmd = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(whichCmd, ["ruby"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (r.error || r.status !== 0) {
    return {
      id,
      category: "lsp",
      status: "pass",
      message: "ruby PATH lookup did not produce results (no precedence concern)",
    };
  }
  const lines = (r.stdout ?? "")
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
  if (lines.length <= 1) {
    return {
      id,
      category: "lsp",
      status: "pass",
      message: `single ruby install on PATH (${lines[0] ?? "n/a"})`,
    };
  }
  return {
    id,
    category: "lsp",
    status: "warn",
    message: `multiple ruby installs on PATH (${lines.length} found)`,
    detail:
      "Effective ruby is the first PATH match: " +
      `${lines[0]}. Other installs: ${lines.slice(1).join(", ")}. ` +
      "Per ADR-21 §Install Pattern + v0.9 Phase 1 finding: PATH " +
      "precedence determines which Ruby version is used by " +
      "`bundle exec` chains. Reorder PATH or uninstall unused " +
      "versions to ensure consistency.",
  };
}

// ---------------------------------------------------------------------------
// (7) non_path_ruby_install — rbenv/RVM/chocolatey detected off-PATH
//     [Phase 4 cohort-UX deferral absorbed here]
// ---------------------------------------------------------------------------

function checkNonPathRubyInstall(): DoctorCheck | null {
  const id = "lsp.ruby.non_path_ruby_install";
  const home = homedir();
  const detected: string[] = [];

  // rbenv (POSIX standard location)
  const rbenvShim = pathJoin(home, ".rbenv", "shims", "ruby");
  if (existsSync(rbenvShim)) detected.push(`rbenv shim at ${rbenvShim}`);

  // RVM (POSIX standard location)
  const rvmRubies = pathJoin(home, ".rvm", "rubies");
  if (existsSync(rvmRubies)) detected.push(`RVM rubies dir at ${rvmRubies}`);

  // Chocolatey ruby (Windows)
  if (process.platform === "win32") {
    for (const ver of ["ruby4.0", "ruby3.4", "ruby3.3"]) {
      const chocoPath = `C:\\tools\\${ver}\\bin\\ruby.exe`;
      if (existsSync(chocoPath)) {
        detected.push(`chocolatey ${ver} at ${chocoPath}`);
      }
    }
  }

  if (detected.length === 0) {
    // No non-PATH installs found — no warning needed; suppress check.
    return null;
  }

  // Check whether any of the detected installs is reachable via PATH
  // by checking `which ruby` output against the detected paths. If
  // the PATH-resolved ruby IS one of the detected installs, no warning
  // (cohort using rbenv/RVM/chocolatey correctly).
  const whichCmd = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(whichCmd, ["ruby"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: SPAWN_TIMEOUT_MS,
  });
  const pathRuby = (r.stdout ?? "")
    .trim()
    .split(/\r?\n/)[0]
    ?.toLowerCase();
  const detectedReachable = detected.some((d) => {
    const lowerD = d.toLowerCase();
    return pathRuby !== undefined && lowerD.includes(pathRuby);
  });

  if (detectedReachable) {
    return {
      id,
      category: "lsp",
      status: "pass",
      message: `non-default Ruby install in use (${detected.length} detected; reachable via PATH)`,
      detail: detected.join("; "),
    };
  }

  return {
    id,
    category: "lsp",
    status: "warn",
    message: `non-default Ruby install(s) detected but not on PATH`,
    detail:
      `Detected: ${detected.join("; ")}. ` +
      "Add to PATH (or use the installer's shim activation pattern — " +
      "`rbenv init`, `rvm use`, `refreshenv` for chocolatey) so the " +
      "intended Ruby is used by `bundle exec` chains. ADR-21 §Install " +
      "Pattern documents supported install variants.",
  };
}

// ---------------------------------------------------------------------------
// (8) libyaml_windows — Windows-only Psych load test
// ---------------------------------------------------------------------------

function checkLibyamlWindows(): DoctorCheck {
  const id = "lsp.ruby.libyaml_windows";
  // ruby -e "require 'psych'" — Psych is Ruby's YAML library; depends
  // on libyaml. If libyaml dev headers are missing, Psych load fails.
  const r = spawnSync("ruby", ["-e", "require 'psych'"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (r.error || r.status !== 0) {
    return {
      id,
      category: "lsp",
      status: "warn",
      message: "ruby Psych (YAML) load failed",
      detail:
        "Psych depends on libyaml. On Windows + RubyInstaller, run " +
        "`ridk install` and select option 3 (MSYS2 + MINGW dev tools) " +
        "to install libyaml dev headers. Substantive Rails-on-Windows " +
        "boot failures often trace to this gap per v0.9 Phase 1 " +
        "fixture-authoring discipline gap. Stderr: " +
        ((r.stderr ?? "").trim() || "(empty)"),
    };
  }
  return {
    id,
    category: "lsp",
    status: "pass",
    message: "ruby Psych loads cleanly (libyaml available)",
  };
}

// ---------------------------------------------------------------------------
// (9) tzinfo_data_windows — Windows + Rails: tzinfo-data gem presence
// ---------------------------------------------------------------------------

function checkTzinfoDataWindows(repoRoot: string): DoctorCheck {
  const id = "lsp.ruby.tzinfo_data_windows";
  const bundleBin =
    process.env.CONTEXTATLAS_BUNDLE_BIN ?? "bundle.bat";
  const r = spawnSync(
    "cmd.exe",
    ["/c", bundleBin, "show", "tzinfo-data"],
    {
      encoding: "utf8",
      windowsHide: true,
      cwd: repoRoot,
      timeout: SPAWN_TIMEOUT_MS,
    },
  );
  if (r.error || r.status !== 0) {
    return {
      id,
      category: "lsp",
      status: "warn",
      message: "tzinfo-data gem not in Gemfile.lock (Windows + Rails)",
      detail:
        "Rails-on-Windows requires tzinfo-data gem for timezone " +
        "initialization (tzinfo cannot find timezone data on Windows " +
        "without it; Rails boot crashes during Bootloader timezone " +
        "setup). Add to Gemfile: `gem 'tzinfo-data', platforms: %i[ " +
        "windows jruby ]`. v0.9 Phase 1 Substep 3 surface 4 empirical " +
        "evidence.",
    };
  }
  return {
    id,
    category: "lsp",
    status: "pass",
    message: "tzinfo-data gem resolved (Rails-on-Windows tz init OK)",
  };
}

// ---------------------------------------------------------------------------
// (10) database_yml — informational; absence OK per Path β+δ
// ---------------------------------------------------------------------------

function checkDatabaseYml(repoRoot: string): DoctorCheck {
  const id = "lsp.ruby.database_yml";
  const dbYmlPath = pathJoin(repoRoot, "config", "database.yml");
  if (existsSync(dbYmlPath)) {
    return {
      id,
      category: "lsp",
      status: "pass",
      message: "config/database.yml present (ruby-lsp-rails Rails-runner addon will initialize fully)",
    };
  }
  return {
    id,
    category: "lsp",
    status: "pass",
    message: "config/database.yml absent (OK per ADR-21 Path β+δ acceptance)",
    detail:
      "ruby-lsp-rails Rails-runner addon may fail to initialize " +
      "without database.yml (Rails Bootloader DB config crash). " +
      "Core ruby-lsp documentSymbol/hover/references/diagnostics " +
      "unaffected; Rails-specific DSL-macro symbol awareness via " +
      "the addon will degrade. v1.0 framing: absence is acceptable; " +
      "v1.1 candidate to address Rails-runner addon dependency more " +
      "robustly.",
  };
}
