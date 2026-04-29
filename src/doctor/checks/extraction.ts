/**
 * Extraction-prerequisites doctor checks.
 *
 * Filesystem + environment checks that don't depend on
 * `.contextatlas.yml`. These run in BOTH normal mode and
 * limited mode (no config).
 */

import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import type { CheckContext, DoctorCheck } from "../types.js";

const MIN_NODE_MAJOR = 20;

export function extractionChecks(ctx: CheckContext): DoctorCheck[] {
  const out: DoctorCheck[] = [];

  // 1. env.anthropic_api_key (WARN if missing — atlas-query mode unaffected)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (typeof apiKey === "string" && apiKey.length > 0) {
    out.push({
      id: "env.anthropic_api_key",
      category: "extraction",
      status: "pass",
      message: "set",
    });
  } else {
    out.push({
      id: "env.anthropic_api_key",
      category: "extraction",
      status: "warn",
      message: "ANTHROPIC_API_KEY not set",
      detail:
        "Atlas-query (MCP / find_by_intent / get_symbol_context) works without it; required for `contextatlas index` extraction. Export the key in your shell before running extraction.",
    });
  }

  // 2. runtime.node_version
  const nodeVersionMatch = /^v?(\d+)\./.exec(process.version);
  const nodeMajor = nodeVersionMatch ? parseInt(nodeVersionMatch[1]!, 10) : 0;
  if (nodeMajor >= MIN_NODE_MAJOR) {
    out.push({
      id: "runtime.node_version",
      category: "extraction",
      status: "pass",
      message: `${process.version} (>=${MIN_NODE_MAJOR})`,
    });
  } else {
    out.push({
      id: "runtime.node_version",
      category: "extraction",
      status: "fail",
      message: `${process.version} (<${MIN_NODE_MAJOR})`,
      detail: `package.json engines.node specifies >=${MIN_NODE_MAJOR}. Upgrade Node.`,
    });
  }

  // 3. deps.installed
  const nodeModulesPath = pathResolve(ctx.repoRoot, "node_modules");
  if (existsSync(nodeModulesPath)) {
    out.push({
      id: "deps.installed",
      category: "extraction",
      status: "pass",
      message: "node_modules/ present",
    });
  } else {
    out.push({
      id: "deps.installed",
      category: "extraction",
      status: "warn",
      message: "node_modules/ not found at repo root",
      detail:
        "Run `npm install` if running contextatlas from source. (May be PASS-by-design if running an installed binary.)",
    });
  }

  return out;
}
