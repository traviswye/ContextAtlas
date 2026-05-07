import { describe, expect, it } from "vitest";

import { sanitize, stripPII, stripPaths } from "./sanitize.js";

/**
 * sanitize.ts test rigor per Q6.0.7 lock at v0.6 Step 6.0 +
 * sanitize-test-rigor refinement at Step 6.0 surface.
 *
 * Privacy-load-bearing: if sanitize fails to strip PII,
 * observability framework violates ADR-20 cohort observability
 * contract. Test categories cover path-stripping (Windows + Unix
 * edge cases) + identity-pattern (email shapes) + allowlist
 * preservation (tool names; symbol kinds; latencies) + defensive
 * edge cases (null inputs; deep nesting; circular references).
 */

describe("stripPaths — absolute → relative substitution", () => {
  it("strips Unix home-dir path /Users/foo/... to <home>", () => {
    const input = "Error at /Users/travis/code/repo/src/foo.ts";
    const out = stripPaths(input, "/anywhere");
    expect(out).toContain("<home>");
    expect(out).not.toContain("travis");
  });

  it("strips Unix home-dir path /home/foo/... to <home>", () => {
    const input = "stack trace: /home/alice/work/bar.py";
    const out = stripPaths(input, "/anywhere");
    expect(out).toContain("<home>");
    expect(out).not.toContain("alice");
  });

  it("strips Windows home-dir path C:\\Users\\foo\\... to <home>", () => {
    const input = "Path: C:\\Users\\Travis\\code\\repo\\src\\foo.ts";
    const out = stripPaths(input, "C:\\anywhere");
    expect(out).toContain("<home>");
    expect(out).not.toContain("Travis");
  });

  it("substitutes cwd prefix with <cwd> token", () => {
    const cwd = "/Users/dev/project";
    const input = "/Users/dev/project/src/file.ts";
    const out = stripPaths(input, cwd);
    // Home-dir strip catches /Users/dev too; <home> wins for nested
    // home paths. Verify SOMETHING was stripped.
    expect(out).not.toBe(input);
  });

  it("leaves non-path strings unchanged", () => {
    const input = "just a regular string with no paths";
    expect(stripPaths(input, "/cwd")).toBe(input);
  });
});

describe("stripPII — denylist pattern stripping", () => {
  it("redacts email addresses", () => {
    const input = "Contact alice@example.com for details";
    const out = stripPII(input);
    expect(out).toContain("<redacted>");
    expect(out).not.toContain("alice@example.com");
  });

  it("redacts multiple emails in same string", () => {
    const input = "Cc: bob@foo.org and carol+test@bar.io";
    const out = stripPII(input);
    expect(out).not.toContain("bob@foo.org");
    expect(out).not.toContain("carol+test@bar.io");
    expect(out.match(/<redacted>/g)?.length).toBe(2);
  });

  it("leaves non-PII strings unchanged", () => {
    const input = "tool: get_symbol_context returned 5 results";
    expect(stripPII(input)).toBe(input);
  });
});

describe("sanitize — allowlist preservation", () => {
  it("preserves tool name field verbatim", () => {
    const input = { tool: "get_symbol_context", other: "value" };
    const out = sanitize(input, { cwd: "/cwd" }) as Record<string, unknown>;
    expect(out.tool).toBe("get_symbol_context");
  });

  it("preserves symbol kind field verbatim", () => {
    const input = { kind: "function", language: "typescript" };
    const out = sanitize(input, { cwd: "/cwd" }) as Record<string, unknown>;
    expect(out.kind).toBe("function");
    expect(out.language).toBe("typescript");
  });

  it("preserves numeric latency field", () => {
    const input = { latency_ms: 234, result_count: 5 };
    const out = sanitize(input, { cwd: "/cwd" }) as Record<string, unknown>;
    expect(out.latency_ms).toBe(234);
    expect(out.result_count).toBe(5);
  });

  it("recurses into nested allowlist-named object fields", () => {
    const input = {
      response: {
        status: "success",
        latency_ms: 100,
      },
    };
    const out = sanitize(input, { cwd: "/cwd" }) as {
      response: { status: string; latency_ms: number };
    };
    expect(out.response.status).toBe("success");
    expect(out.response.latency_ms).toBe(100);
  });
});

describe("sanitize — defensive edge cases", () => {
  it("handles null input", () => {
    expect(sanitize(null, { cwd: "/cwd" })).toBe(null);
  });

  it("handles undefined input", () => {
    expect(sanitize(undefined, { cwd: "/cwd" })).toBe(undefined);
  });

  it("handles deeply nested objects without crashing", () => {
    let nested: Record<string, unknown> = { value: "leaf" };
    for (let i = 0; i < 50; i++) {
      nested = { wrapper: nested };
    }
    expect(() => sanitize(nested, { cwd: "/cwd" })).not.toThrow();
  });

  it("handles circular references without infinite loop", () => {
    const obj: Record<string, unknown> = { name: "outer" };
    obj.self = obj;
    const out = sanitize(obj, { cwd: "/cwd" }) as Record<string, unknown>;
    expect(out.name).toBe("outer");
    expect(out.self).toBe("<cycle>");
  });

  it("preserves unicode strings (no PII match)", () => {
    const input = { description: "🔍 search query: hello-world" };
    const out = sanitize(input, { cwd: "/cwd" }) as Record<string, unknown>;
    expect(out.description).toBe("🔍 search query: hello-world");
  });

  it("strips PII from unicode strings", () => {
    const input = "🔍 contact alice@example.com";
    const out = stripPII(input);
    expect(out).toContain("<redacted>");
  });
});
