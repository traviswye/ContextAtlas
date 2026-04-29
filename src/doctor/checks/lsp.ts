/**
 * LSP-category doctor checks (per configured language).
 *
 * Two checks per language: `executable_in_path` (binary findable)
 * + `spawn_test` (initialize + shutdown within ceiling). Skipped
 * entirely in limited mode.
 *
 * Spawn test stays minimal — initialize + shutdown — per Q5 lock.
 * Deeper LSP health (initialize → didOpen → diagnostic-arrival →
 * shutdown) is v0.5+ candidate.
 */

import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

import { createAdapter } from "../../adapters/registry.js";
import type { LanguageCode } from "../../types.js";
import type { CheckContext, DoctorCheck } from "../types.js";

const SPAWN_TIMEOUT_MS = 10_000;

export async function lspChecks(ctx: CheckContext): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = [];
  const config = ctx.config;
  if (config === null) return out; // Limited mode.

  for (const lang of config.languages) {
    out.push(...checkExecutable(lang));
    out.push(await checkSpawn(lang, ctx.repoRoot));
  }
  return out;
}

function checkExecutable(lang: LanguageCode): DoctorCheck[] {
  const out: DoctorCheck[] = [];
  // Resolution path differs per language: TS + Python use peer-
  // dependencies resolved via require.resolve from main repo's
  // node_modules; Go uses PATH-resolved gopls binary.
  if (lang === "typescript") {
    out.push(resolveNodeBin("typescript", "typescript-language-server/lib/cli.mjs"));
  } else if (lang === "python") {
    out.push(resolveNodeBin("python", "pyright/langserver.index.js"));
  } else if (lang === "go") {
    out.push(resolvePathBin("go"));
  }
  return out;
}

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
    return {
      id: `lsp.${lang}.executable_in_path`,
      category: "lsp",
      status: "fail",
      message: `${modulePath} not resolvable`,
      detail:
        err instanceof Error
          ? err.message
          : "install the peer dependency in your project's node_modules",
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
      await adapter.shutdown();
      const dt = Date.now() - t0;
      return {
        id,
        category: "lsp",
        status: "pass",
        message: `completed in ${dt}ms`,
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
