import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { csharpEnvironmentChecks } from "./csharp-environment.js";

/**
 * C# environment doctor check suite. Mostly empirical against the
 * actual .NET install on the test machine (Travis .NET SDK 10.0.203
 * + csharp-ls 0.24.0.0 verified clean at v1.1 Phase 0). Tests don't
 * assert specific pass/warn/fail outcomes for environment-dependent
 * checks (dotnet version, csharp-ls findability) — they assert shape
 * (DoctorCheck contract holds; id format is canonical; status is in
 * the enum). Environment-correctness of specific assertions is
 * verified against the dev machine state in isolation; CI environments
 * may have different .NET / csharp-ls configurations which is exactly
 * what the doctor surfaces.
 */

describe("csharpEnvironmentChecks", () => {
  function makeTmpRoot(): string {
    return mkdtempSync(path.join(tmpdir(), "ca-csharp-env-"));
  }

  function makeProjectRoot(kind: "sln" | "slnx" | "csproj"): string {
    const root = makeTmpRoot();
    if (kind === "sln") {
      writeFileSync(
        path.join(root, "App.sln"),
        "Microsoft Visual Studio Solution File\n",
      );
    } else if (kind === "slnx") {
      writeFileSync(
        path.join(root, "App.slnx"),
        "<Solution></Solution>\n",
      );
    } else {
      writeFileSync(
        path.join(root, "App.csproj"),
        '<Project Sdk="Microsoft.NET.Sdk"></Project>\n',
      );
    }
    return root;
  }

  it("returns DoctorCheck records with canonical id format + lsp category", () => {
    const root = makeTmpRoot();
    try {
      const checks = csharpEnvironmentChecks(root);
      expect(checks.length).toBeGreaterThan(0);
      for (const c of checks) {
        expect(c.id).toMatch(/^lsp\.csharp\.[a-z_]+$/);
        expect(c.category).toBe("lsp");
        expect(["pass", "warn", "fail"]).toContain(c.status);
        expect(c.message).toBeTruthy();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("always-on checks fire (dotnet_version + csharp_ls_findable + project_files_detected)", () => {
    const root = makeTmpRoot();
    try {
      const checks = csharpEnvironmentChecks(root);
      const ids = new Set(checks.map((c) => c.id));
      expect(ids.has("lsp.csharp.dotnet_version")).toBe(true);
      expect(ids.has("lsp.csharp.csharp_ls_findable")).toBe(true);
      expect(ids.has("lsp.csharp.project_files_detected")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("csharp_ls_version check fires when csharp_ls_findable passes (Travis dev environment)", () => {
    const root = makeTmpRoot();
    try {
      const checks = csharpEnvironmentChecks(root);
      const findableCheck = checks.find(
        (c) => c.id === "lsp.csharp.csharp_ls_findable",
      );
      const versionCheck = checks.find(
        (c) => c.id === "lsp.csharp.csharp_ls_version",
      );
      if (findableCheck?.status === "fail") {
        // version check correctly suppressed when binary not findable
        expect(versionCheck).toBeUndefined();
      } else {
        // version check fires
        expect(versionCheck).toBeDefined();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("project_files_detected warns when no .sln/.slnx/.csproj at repoRoot", () => {
    const root = makeTmpRoot();
    try {
      const checks = csharpEnvironmentChecks(root);
      const projectCheck = checks.find(
        (c) => c.id === "lsp.csharp.project_files_detected",
      );
      expect(projectCheck).toBeDefined();
      expect(projectCheck?.status).toBe("warn");
      expect(projectCheck?.message).toContain("no .sln");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("project_files_detected passes when .sln present", () => {
    const root = makeProjectRoot("sln");
    try {
      const checks = csharpEnvironmentChecks(root);
      const projectCheck = checks.find(
        (c) => c.id === "lsp.csharp.project_files_detected",
      );
      expect(projectCheck?.status).toBe("pass");
      expect(projectCheck?.detail).toContain("App.sln");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("project_files_detected passes when .slnx present", () => {
    const root = makeProjectRoot("slnx");
    try {
      const checks = csharpEnvironmentChecks(root);
      const projectCheck = checks.find(
        (c) => c.id === "lsp.csharp.project_files_detected",
      );
      expect(projectCheck?.status).toBe("pass");
      expect(projectCheck?.detail).toContain("App.slnx");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("project_files_detected passes when .csproj present", () => {
    const root = makeProjectRoot("csproj");
    try {
      const checks = csharpEnvironmentChecks(root);
      const projectCheck = checks.find(
        (c) => c.id === "lsp.csharp.project_files_detected",
      );
      expect(projectCheck?.status).toBe("pass");
      expect(projectCheck?.detail).toContain("App.csproj");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
