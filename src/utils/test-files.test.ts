import { describe, expect, it } from "vitest";

import { isTestFile } from "./test-files.js";

describe("isTestFile", () => {
  it.each([
    "src/foo.test.ts",
    "src/bar.test.tsx",
    "src/baz.spec.ts",
    "src/qux.spec.tsx",
    "src\\components\\Thing.test.ts",
    "src/utils.test.mts",
    "src/utils.test.cts",
  ])("TypeScript test pattern: %s", (p) => {
    expect(isTestFile(p)).toBe(true);
  });

  it.each([
    "tests/test_orders.py",
    "orders_test.py",
    "tests/unit/test_payments.py",
    "src/orders/test_queue.py",
  ])("Python test pattern: %s", (p) => {
    expect(isTestFile(p)).toBe(true);
  });

  it.each([
    "tests/anything.ts",
    "tests/integration/something.py",
    "apps/web/tests/ui.tsx",
  ])("tests/ directory segment: %s", (p) => {
    expect(isTestFile(p)).toBe(true);
  });

  it.each([
    "src/orders/processor.ts",
    "src/orders/test_helpers.ts", // TS file starting with test_ is NOT a test by our convention
    "README.md",
    "spec/example.yml",
    "",
  ])("non-test: %s", (p) => {
    expect(isTestFile(p)).toBe(false);
  });
});
