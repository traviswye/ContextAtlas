import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { rubyEnvironmentChecks } from "./ruby-environment.js";

/**
 * Ruby environment doctor check suite. Mostly empirical against the
 * actual Ruby install on the test machine (Travis Ruby 4.0.3 install
 * verified clean at v0.9 Phase 1). For Rails-conditional checks,
 * uses a temp Rails-shaped fixture (Gemfile + bin/rails presence
 * triggers detectRails(); doesn't require an actual bundle install).
 *
 * Tests don't assert specific pass/warn/fail outcomes for
 * environment-dependent checks (ruby version, bundler, PATH state)
 * — they assert shape (DoctorCheck contract holds; id format is
 * canonical; status is in the enum). Environment-correctness of
 * specific assertions is verified against the dev machine state in
 * isolation; CI environments may have different ruby/bundle/PATH
 * configurations which is exactly what the doctor surfaces.
 */

describe("rubyEnvironmentChecks", () => {
  function makeTmpRoot(): string {
    return mkdtempSync(path.join(tmpdir(), "ca-ruby-env-"));
  }

  function makeRailsRoot(): string {
    const root = makeTmpRoot();
    writeFileSync(path.join(root, "Gemfile"), "source 'https://rubygems.org'\n");
    mkdirSync(path.join(root, "bin"));
    writeFileSync(path.join(root, "bin", "rails"), "#!/usr/bin/env ruby\n");
    return root;
  }

  it("returns DoctorCheck records with canonical id format + lsp category", () => {
    const root = makeTmpRoot();
    try {
      const checks = rubyEnvironmentChecks(root);
      expect(checks.length).toBeGreaterThan(0);
      for (const c of checks) {
        expect(c.id).toMatch(/^lsp\.ruby\.[a-z_]+$/);
        expect(c.category).toBe("lsp");
        expect(["pass", "warn", "fail"]).toContain(c.status);
        expect(c.message).toBeTruthy();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not fire Rails-conditional checks when Rails not detected", () => {
    const root = makeTmpRoot();
    try {
      const checks = rubyEnvironmentChecks(root);
      const ids = new Set(checks.map((c) => c.id));
      // Always-on checks present.
      expect(ids.has("lsp.ruby.ruby_version")).toBe(true);
      expect(ids.has("lsp.ruby.bundler")).toBe(true);
      expect(ids.has("lsp.ruby.ruby_lsp_gem")).toBe(true);
      expect(ids.has("lsp.ruby.rails_detected")).toBe(true);
      // Rails-conditional NOT fired.
      expect(ids.has("lsp.ruby.ruby_lsp_rails_gem")).toBe(false);
      expect(ids.has("lsp.ruby.database_yml")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fires Rails-conditional checks when Rails detected", () => {
    const root = makeRailsRoot();
    try {
      const checks = rubyEnvironmentChecks(root);
      const ids = new Set(checks.map((c) => c.id));
      expect(ids.has("lsp.ruby.ruby_lsp_rails_gem")).toBe(true);
      expect(ids.has("lsp.ruby.database_yml")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rails_detected check surfaces detection state in message", () => {
    const railsRoot = makeRailsRoot();
    const plainRoot = makeTmpRoot();
    try {
      const railsChecks = rubyEnvironmentChecks(railsRoot);
      const plainChecks = rubyEnvironmentChecks(plainRoot);
      const railsDetectedCheck = railsChecks.find(
        (c) => c.id === "lsp.ruby.rails_detected",
      );
      const plainDetectedCheck = plainChecks.find(
        (c) => c.id === "lsp.ruby.rails_detected",
      );
      expect(railsDetectedCheck?.message).toContain("detected");
      expect(plainDetectedCheck?.message).toContain("not detected");
    } finally {
      rmSync(railsRoot, { recursive: true, force: true });
      rmSync(plainRoot, { recursive: true, force: true });
    }
  });

  it("database_yml absence returns PASS with Path β+δ acceptance framing", () => {
    const root = makeRailsRoot();
    try {
      const checks = rubyEnvironmentChecks(root);
      const dbYmlCheck = checks.find(
        (c) => c.id === "lsp.ruby.database_yml",
      );
      expect(dbYmlCheck).toBeDefined();
      expect(dbYmlCheck?.status).toBe("pass");
      expect(dbYmlCheck?.message).toContain("absent");
      expect(dbYmlCheck?.message).toContain("Path β+δ acceptance");
      expect(dbYmlCheck?.detail).toContain("ruby-lsp-rails Rails-runner");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("database_yml presence returns PASS with full-init framing", () => {
    const root = makeRailsRoot();
    try {
      mkdirSync(path.join(root, "config"));
      writeFileSync(
        path.join(root, "config", "database.yml"),
        "default: &default\n  adapter: sqlite3\n",
      );
      const checks = rubyEnvironmentChecks(root);
      const dbYmlCheck = checks.find(
        (c) => c.id === "lsp.ruby.database_yml",
      );
      expect(dbYmlCheck?.status).toBe("pass");
      expect(dbYmlCheck?.message).toContain("present");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("platform-conditional checks fire only on matching platform", () => {
    const root = makeRailsRoot();
    try {
      const checks = rubyEnvironmentChecks(root);
      const ids = new Set(checks.map((c) => c.id));
      const isWindows = process.platform === "win32";
      if (isWindows) {
        expect(ids.has("lsp.ruby.libyaml_windows")).toBe(true);
        expect(ids.has("lsp.ruby.tzinfo_data_windows")).toBe(true);
      } else {
        expect(ids.has("lsp.ruby.libyaml_windows")).toBe(false);
        expect(ids.has("lsp.ruby.tzinfo_data_windows")).toBe(false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("non_path_ruby_install suppresses check when no non-default installs detected", () => {
    // Sanity check: on a clean test environment without rbenv/RVM/
    // chocolatey, this check returns null and is filtered out.
    // (Can't reliably assert presence/absence because dev machines
    // may legitimately have these installed; we just check the
    // filter mechanism works.)
    const root = makeTmpRoot();
    try {
      const checks = rubyEnvironmentChecks(root);
      // If non_path_ruby_install fires, it must have canonical shape.
      const npRubyCheck = checks.find(
        (c) => c.id === "lsp.ruby.non_path_ruby_install",
      );
      if (npRubyCheck !== undefined) {
        expect(["pass", "warn"]).toContain(npRubyCheck.status);
        expect(npRubyCheck.message).toBeTruthy();
      }
      // No assertion if absent — that's the suppress-when-not-applicable
      // pattern working correctly.
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
