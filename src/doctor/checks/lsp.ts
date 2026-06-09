/**
 * LSP-category doctor checks (per configured language).
 *
 * Three checks per language: `executable_in_path` (binary findable)
 * + `spawn_test` (initialize + shutdown within ceiling) +
 * `deep_health_check` (initialize → listSymbols → findReferences
 * → shutdown sample-symbol traversal). Skipped entirely in limited
 * mode.
 *
 * `spawn_test` stays minimal per v0.4 Q5 lock. `deep_health_check`
 * shipped at v0.6 Step 3.2 per A6 + Q3.0.2 lock; catches adapter-
 * deep regressions like gopls workspace-load failure on
 * `go.mod`-less directories (v0.5+ candidate #6 motivating example)
 * that the minimal `spawn_test` misses.
 */

import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

import { createAdapter } from "../../adapters/registry.js";
import type { LanguageCode } from "../../types.js";
import type { CheckContext, DoctorCheck } from "../types.js";
import { csharpEnvironmentChecks } from "./csharp-environment.js";
import { rubyEnvironmentChecks } from "./ruby-environment.js";
import { findSampleSymbol } from "./sample-symbol.js";

const SPAWN_TIMEOUT_MS = 10_000;

/**
 * Soft-WARN threshold for spawn_test duration per v0.7 Step 2.2.d
 * FO-6 (β) diagnostic substrate. spawn_test that takes longer than
 * this surfaces as WARN with substantive observation that the
 * adapter is stressed (substantial codebase or LSP-server-internal
 * issue). Below threshold remains PASS with timing in message.
 */
const SPAWN_HEALTH_WARN_THRESHOLD_MS = 5_000;

/**
 * Extended ceiling for deep health check — initialize + listSymbols
 * + findReferences + shutdown can take longer than minimal
 * spawn_test, especially on first-run cold-start adapter init.
 */
const DEEP_HEALTH_TIMEOUT_MS = 30_000;

export async function lspChecks(ctx: CheckContext): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = [];
  const config = ctx.config;
  if (config === null) return out; // Limited mode.

  for (const lang of config.languages) {
    out.push(...checkExecutable(lang, ctx.repoRoot));
    out.push(await checkSpawn(lang, ctx.repoRoot));
    out.push(await checkDeepHealth(lang, ctx.repoRoot));
  }
  return out;
}

function checkExecutable(lang: LanguageCode, repoRoot: string): DoctorCheck[] {
  const out: DoctorCheck[] = [];
  // Resolution path differs per language: TS + Python use peer-
  // dependencies resolved via require.resolve from main repo's
  // node_modules; Go uses PATH-resolved gopls binary; Ruby
  // dispatches to the 10-check ruby-environment substrate per
  // ADR-21 §Install Pattern + v0.9 Substep 5.2; C# dispatches to
  // the 4-check csharp-environment substrate per ADR-22 §Install
  // Pattern + v1.1 Substep 5.2.
  if (lang === "typescript") {
    out.push(resolveNodeBin("typescript", "typescript-language-server/lib/cli.mjs"));
  } else if (lang === "python") {
    out.push(resolveNodeBin("python", "pyright/langserver.index.js"));
  } else if (lang === "go") {
    out.push(resolvePathBin("go"));
  } else if (lang === "ruby") {
    out.push(...rubyEnvironmentChecks(repoRoot));
  } else if (lang === "csharp") {
    out.push(...csharpEnvironmentChecks(repoRoot));
  }
  return out;
}

/**
 * Per-language peer-dependency install guidance for the
 * `lsp.<lang>.executable_in_path` FAIL path. v0.7 Step 2.2.b.0 FO-4
 * refinement: surface substantive install commands matching gopls's
 * existing precedent (`resolvePathBin` below). Empty guidance falls
 * back to the generic peer-dependency-in-node_modules hint.
 */
const PEER_DEP_INSTALL_GUIDANCE: Partial<Record<LanguageCode, string>> = {
  typescript:
    "Install via `npm install -g typescript-language-server` (global) " +
    "or `npm install --save-dev typescript-language-server` (per-project). " +
    "Per ADR-03 the TypeScript adapter requires typescript-language-server " +
    "as a peer dependency.",
  python:
    "Install via `npm install -g pyright` (global) or " +
    "`npm install --save-dev pyright` (per-project). Per ADR-13 the " +
    "Python adapter uses pyright as a peer dependency.",
};

function resolveNodeBin(lang: LanguageCode, modulePath: string): DoctorCheck {
  const require = createRequire(import.meta.url);
  try {
    const resolved = require.resolve(modulePath);
    return {
      id: `lsp.${lang}.executable_in_path`,
      category: "lsp",
      status: "pass",
      message: `${modulePath} resolved`,
      detail: resolved,
    };
  } catch (err) {
    const guidance = PEER_DEP_INSTALL_GUIDANCE[lang];
    const errMessage = err instanceof Error ? err.message : String(err);
    return {
      id: `lsp.${lang}.executable_in_path`,
      category: "lsp",
      status: "fail",
      message: `${modulePath} not resolvable`,
      detail:
        guidance !== undefined
          ? `${guidance} Underlying resolution error: ${errMessage}`
          : `Install the peer dependency in your project's node_modules. ` +
            `Underlying resolution error: ${errMessage}`,
    };
  }
}

function resolvePathBin(lang: LanguageCode): DoctorCheck {
  // Prefer CONTEXTATLAS_GOPLS_BIN env override, falling back to
  // `gopls` on PATH (matches go-adapter's default resolution).
  const goplsBin = process.env.CONTEXTATLAS_GOPLS_BIN ?? "gopls";
  // Use `where` on Windows; `which` on POSIX. spawnSync handles
  // both via process.env.PATH lookup directly via whichWrapper.
  const whichCmd = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(whichCmd, [goplsBin], { encoding: "utf8", windowsHide: true });
  if (r.status === 0 && (r.stdout ?? "").trim().length > 0) {
    return {
      id: `lsp.${lang}.executable_in_path`,
      category: "lsp",
      status: "pass",
      message: `gopls resolved`,
      detail: (r.stdout ?? "").trim().split(/\r?\n/)[0],
    };
  }
  return {
    id: `lsp.${lang}.executable_in_path`,
    category: "lsp",
    status: "fail",
    message: "gopls not in PATH",
    detail:
      "Install via `go install golang.org/x/tools/gopls@latest` (per ADR-14) or set CONTEXTATLAS_GOPLS_BIN env var.",
  };
}

async function checkSpawn(
  lang: LanguageCode,
  repoRoot: string,
): Promise<DoctorCheck> {
  const id = `lsp.${lang}.spawn_test`;
  let adapter;
  try {
    adapter = createAdapter(lang);
  } catch (err) {
    return {
      id,
      category: "lsp",
      status: "fail",
      message: `adapter construction failed`,
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const t0 = Date.now();
  const timeout = new Promise<DoctorCheck>((resolve) =>
    setTimeout(
      () =>
        resolve({
          id,
          category: "lsp",
          status: "fail",
          message: `spawn test exceeded ${SPAWN_TIMEOUT_MS / 1000}s ceiling`,
          detail:
            "LSP server may be slow to start; investigate via per-adapter probe scripts (scripts/probe-lsp-readiness.mjs).",
        }),
      SPAWN_TIMEOUT_MS,
    ),
  );

  const real = (async (): Promise<DoctorCheck> => {
    try {
      await adapter.initialize(repoRoot);
      const dtInit = Date.now() - t0;
      await adapter.shutdown();
      const dt = Date.now() - t0;
      // FO-6 (β) diagnostic substrate (v0.7 Step 2.2.d): WARN when
      // adapter spawn substantively exceeds the health threshold.
      // Substantive empirical signal that the adapter or codebase is
      // stressed (substantial-codebase first-analysis pass, LSP
      // server slow to respond, etc.). Below threshold remains PASS
      // with timing in message for substantive observability.
      if (dt > SPAWN_HEALTH_WARN_THRESHOLD_MS) {
        return {
          id,
          category: "lsp",
          status: "warn",
          message: `slow spawn (${dt}ms total; initialize ${dtInit}ms) — above ${SPAWN_HEALTH_WARN_THRESHOLD_MS}ms health threshold`,
          detail:
            `Adapter spawned + initialized + shutdown but took longer than ` +
            `expected. Substantive causes: (a) substantial codebase stressing ` +
            `LSP server's initial-analysis pass; (b) LSP server slow to ` +
            `respond; (c) cold filesystem cache. Bump ` +
            `\`lsp.initialize_timeout_ms\` in .contextatlas.yml if downstream ` +
            `commands surface timeout errors.`,
        };
      }
      return {
        id,
        category: "lsp",
        status: "pass",
        message: `completed in ${dt}ms (initialize ${dtInit}ms)`,
      };
    } catch (err) {
      return {
        id,
        category: "lsp",
        status: "fail",
        message: `spawn test failed`,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  })();

  return Promise.race([real, timeout]);
}

/**
 * Deep LSP health check per A6 + Q3.0.2 lock at v0.6 Step 3.0.
 * Sequence: createAdapter → initialize → findSampleSymbol (lists
 * symbols on first source file matching language extensions) →
 * findReferences against sample symbol → shutdown. Catches adapter-
 * deep failures (e.g., gopls workspace-load failure on `go.mod`-
 * less directories per v0.5+ candidate #6 motivating example) that
 * minimal `spawn_test` misses.
 *
 * Failure modes mapped to status:
 * - Adapter construction fail / initialize fail → fail
 * - findReferences throws → fail (deep regression target)
 * - No source files / no symbols → warn (can't run; not a fail)
 * - Timeout → fail
 *
 * Per Q3.0.2 lock: 1 symbol per language adapter detected; runtime
 * discovery from actual user-repo state per Adjudication 1 lock at
 * v0.6 Step 3.2 surface review.
 */
async function checkDeepHealth(
  lang: LanguageCode,
  repoRoot: string,
): Promise<DoctorCheck> {
  const id = `lsp.${lang}.deep_health_check`;
  let adapter;
  try {
    adapter = createAdapter(lang);
  } catch (err) {
    return {
      id,
      category: "lsp",
      status: "fail",
      message: `adapter construction failed`,
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const t0 = Date.now();
  const work = (async (): Promise<DoctorCheck> => {
    try {
      await adapter.initialize(repoRoot);
    } catch (err) {
      return {
        id,
        category: "lsp",
        status: "fail",
        message: `initialize failed`,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    let sample: { file: string; symbol: { id: string; name: string } } | null;
    try {
      sample = await findSampleSymbol(adapter, repoRoot);
    } catch (err) {
      try {
        await adapter.shutdown();
      } catch {
        // shutdown errors during failure recovery are best-effort;
        // primary failure already captured below
      }
      return {
        id,
        category: "lsp",
        status: "fail",
        message: `sample symbol discovery failed`,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    if (sample === null) {
      try {
        await adapter.shutdown();
      } catch {
        // best-effort shutdown; warn outcome already determined
      }
      return {
        id,
        category: "lsp",
        status: "warn",
        message: `no source files / symbols found for sample traversal`,
        detail:
          `repoRoot has no ${lang} source files OR adapter listSymbols ` +
          `returned empty for all candidates. Deep health check requires ` +
          `at least one symbol; consider running on a populated repo.`,
      };
    }

    try {
      await adapter.findReferences(sample.symbol.id as never);
    } catch (err) {
      try {
        await adapter.shutdown();
      } catch {
        // best-effort; primary findReferences failure captured below
      }
      return {
        id,
        category: "lsp",
        status: "fail",
        message: `findReferences traversal failed`,
        detail:
          (err instanceof Error ? err.message : String(err)) +
          ` (sample: ${sample.symbol.name} at ${sample.file})`,
      };
    }

    try {
      await adapter.shutdown();
    } catch (err) {
      return {
        id,
        category: "lsp",
        status: "fail",
        message: `shutdown failed after deep traversal`,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    const dt = Date.now() - t0;
    return {
      id,
      category: "lsp",
      status: "pass",
      message: `deep health completed in ${dt}ms`,
      detail: `sample: ${sample.symbol.name} at ${sample.file}`,
    };
  })();

  const timeout = new Promise<DoctorCheck>((resolve) =>
    setTimeout(
      () =>
        resolve({
          id,
          category: "lsp",
          status: "fail",
          message: `deep health check exceeded ${DEEP_HEALTH_TIMEOUT_MS / 1000}s ceiling`,
          detail:
            "Deep health includes sample symbol traversal; if exceeding " +
            "ceiling, adapter may be slow on listSymbols or findReferences " +
            "on this repo. Investigate via per-adapter probe scripts.",
        }),
      DEEP_HEALTH_TIMEOUT_MS,
    ),
  );

  return Promise.race([work, timeout]);
}
