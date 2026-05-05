import { describe, expect, it } from "vitest";

import { runInitSubcommand } from "./runner.js";

/**
 * Step 4.1 scaffold tests. Substantive coverage builds at Step 4.2-4.5
 * per Q4.0.13 lock (config setup + routing + atlas creation + success
 * message). At Step 4.1 the contract under test is signature shape +
 * fail-loudly exit code.
 */

describe("runInitSubcommand — scaffold (Step 4.1)", () => {
  it("returns exit code 2 (not-yet-implemented; fail-loudly)", async () => {
    const result = await runInitSubcommand({
      configRoot: "/tmp/scaffold-test",
      ccOnly: false,
    });
    expect(result.exitCode).toBe(2);
  });

  it("accepts ccOnly true without throwing (signature shape)", async () => {
    const result = await runInitSubcommand({
      configRoot: "/tmp/scaffold-test",
      ccOnly: true,
    });
    expect(result.exitCode).toBe(2);
  });

  it("accepts json true without throwing (signature shape)", async () => {
    const result = await runInitSubcommand({
      configRoot: "/tmp/scaffold-test",
      json: true,
    });
    expect(result.exitCode).toBe(2);
  });
});
