/**
 * `.mcp.json` idempotent upsert per v0.6 Step 4.4 (Q4.0.10 + Q4.4.5 +
 * Q4.4.6 locks at Step 4.0 + Step 4.4 design adjudications). Auto-
 * registers contextatlas as an MCP server in repo-root `.mcp.json`.
 *
 * Idempotent behavior:
 *   - File absent → create with single contextatlas entry (status:
 *     "registered")
 *   - File exists with contextatlas server entry → leave as-is
 *     (status: "preserved"); does NOT overwrite path even if differs
 *     (user may have customized)
 *   - File exists without contextatlas entry → merge into existing
 *     mcpServers preserving other entries (status: "merged")
 *   - Existing JSON malformed → throw with actionable error
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

export type McpRegistrationResult =
  | { readonly status: "registered"; readonly path: string }
  | { readonly status: "preserved"; readonly path: string }
  | { readonly status: "merged"; readonly path: string };

export interface McpRegistrationOptions {
  readonly configRoot: string;
  /** Test seam: override binary path resolution per Q4.4.7 lock. */
  readonly binaryPathOverride?: string;
}

/**
 * Resolve absolute path to dist/index.js by walking up from this
 * module's __dirname to find package.json (mirrors src/index.ts:50-55
 * readPackageVersion pattern; analogous to
 * resolveContextatlasCommitSha pattern from cli-runner.ts:286-308).
 *
 * Per Q4.4.6 lock at Step 4.4 design adjudications. No exists-check
 * on resolved path per Q4.4 Point 7 lock (cohort installs built
 * package; v0.6 cohort scope acceptable; Q11-style refinement at
 * Step 4.5 if cohort feedback warrants).
 *
 * Falls back to `process.execPath` (node binary) when package walk
 * fails (atypical install layout); preserves init flow.
 */
export function resolveContextAtlasBinary(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 10; i++) {
    if (existsSync(pathResolve(dir, "package.json"))) {
      return pathResolve(dir, "dist", "index.js");
    }
    const parent = pathResolve(dir, "..");
    if (parent === dir) break; // reached fs root
    dir = parent;
  }
  return process.execPath;
}

/**
 * Idempotent upsert of contextatlas server entry into repo-root
 * `.mcp.json` per Q4.0.10 lock.
 */
export function upsertMcpRegistration(
  opts: McpRegistrationOptions,
): McpRegistrationResult {
  const path = pathResolve(opts.configRoot, ".mcp.json");
  const binaryPath =
    opts.binaryPathOverride ?? resolveContextAtlasBinary();
  const contextAtlasEntry = {
    command: "node",
    args: [binaryPath],
  };

  if (!existsSync(path)) {
    const fresh = {
      mcpServers: {
        contextatlas: contextAtlasEntry,
      },
    };
    writeFileSync(path, JSON.stringify(fresh, null, 2) + "\n", "utf8");
    return { status: "registered", path };
  }

  // Existing file — read, parse, merge.
  const raw = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `init: existing .mcp.json at ${path} is not valid JSON. ` +
        `Fix or remove the file then re-run \`contextatlas init\`. ` +
        `Parse error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      `init: existing .mcp.json at ${path} has unexpected shape ` +
        `(expected object with mcpServers field). Fix or remove the ` +
        `file then re-run \`contextatlas init\`.`,
    );
  }
  const obj = parsed as Record<string, unknown>;
  const mcpServers =
    obj.mcpServers !== undefined &&
    typeof obj.mcpServers === "object" &&
    obj.mcpServers !== null &&
    !Array.isArray(obj.mcpServers)
      ? (obj.mcpServers as Record<string, unknown>)
      : {};

  if (mcpServers.contextatlas !== undefined) {
    return { status: "preserved", path };
  }

  // Merge into existing mcpServers preserving other entries per
  // Q4.0.10 lock idempotent behavior.
  const merged = {
    ...obj,
    mcpServers: {
      ...mcpServers,
      contextatlas: contextAtlasEntry,
    },
  };
  writeFileSync(path, JSON.stringify(merged, null, 2) + "\n", "utf8");
  return { status: "merged", path };
}
