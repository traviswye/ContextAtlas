import { describe, expect, it } from "vitest";

import type { ConfigScaffoldResult } from "./config-scaffold.js";
import type { McpRegistrationResult } from "./mcp-registration.js";
import {
  renderSuccessMessage,
  type InitSuccessState,
} from "./success-message.js";

/**
 * Step 4.5 success message rendering tests per Q4.0.13 lock + Q4.0.8
 * sample shape verification + Q4.5.4 language-aware suggestions
 * coverage.
 */

function makeState(
  overrides: Partial<InitSuccessState> = {},
): InitSuccessState {
  const scaffoldResult: ConfigScaffoldResult = {
    status: "created",
    path: "/tmp/test/.contextatlas.yml",
  };
  const mcpResult: McpRegistrationResult = {
    status: "registered",
    path: "/tmp/test/.mcp.json",
  };
  return {
    scaffoldResult,
    atlasState: { kind: "extracted", symbolCount: 123 },
    smokeResult: {
      symbolId: "sym:ts:src/foo.ts:foo",
      symbolName: "foo",
      symbolKind: "function",
      claims: 5,
      references: 12,
      durationMs: 234,
    },
    mcpResult,
    detectedLanguages: ["typescript"],
    warnings: [],
    ...overrides,
  };
}

describe("renderSuccessMessage — header + 4-section structure", () => {
  it("renders header line '[OK] ContextAtlas init complete'", () => {
    const out = renderSuccessMessage(makeState());
    expect(out.startsWith("[OK] ContextAtlas init complete")).toBe(true);
  });

  it("includes all 4 sections (Setup / Smoke test / Try / Re-run)", () => {
    const out = renderSuccessMessage(makeState());
    expect(out).toContain("Setup:");
    expect(out).toContain("Smoke test:");
    expect(out).toContain("Try in your next Claude Code session:");
    expect(out).toContain("Re-run:");
  });
});

describe("renderSuccessMessage — Setup section", () => {
  it("config verb 'created' when scaffoldResult.status === 'created'", () => {
    const out = renderSuccessMessage(makeState());
    expect(out).toContain("- Config: .contextatlas.yml created");
  });

  it("config verb 'preserved' when scaffoldResult.status === 'preserved'", () => {
    const out = renderSuccessMessage(
      makeState({
        scaffoldResult: {
          status: "preserved",
          path: "/tmp/test/.contextatlas.yml",
        },
      }),
    );
    expect(out).toContain("- Config: .contextatlas.yml preserved");
  });

  it("atlas verb 'extracted' when atlasState.kind === 'extracted'", () => {
    const out = renderSuccessMessage(
      makeState({ atlasState: { kind: "extracted", symbolCount: 42 } }),
    );
    expect(out).toContain("- Atlas: .contextatlas/atlas.json (extracted; 42 symbols)");
  });

  it("atlas verb 'current' when atlasState.kind === 'current'", () => {
    const out = renderSuccessMessage(
      makeState({ atlasState: { kind: "current", symbolCount: 99 } }),
    );
    expect(out).toContain("- Atlas: .contextatlas/atlas.json (current; 99 symbols)");
  });

  it("MCP verb 'registered' when mcpResult.status === 'registered'", () => {
    const out = renderSuccessMessage(makeState());
    expect(out).toContain("- MCP: .mcp.json registered (contextatlas server)");
  });

  it("MCP verb verbose 'preserved (existing entry)' per Q4.5 Point 5 lock", () => {
    const out = renderSuccessMessage(
      makeState({
        mcpResult: { status: "preserved", path: "/tmp/test/.mcp.json" },
      }),
    );
    expect(out).toContain(
      "- MCP: .mcp.json preserved (existing entry) (contextatlas server)",
    );
  });

  it("MCP verb 'merged (added contextatlas to existing servers)'", () => {
    const out = renderSuccessMessage(
      makeState({
        mcpResult: { status: "merged", path: "/tmp/test/.mcp.json" },
      }),
    );
    expect(out).toContain(
      "- MCP: .mcp.json merged (added contextatlas to existing servers)",
    );
  });
});

describe("renderSuccessMessage — Smoke section", () => {
  it("includes [OK] marker + symbolId + claims/refs/duration", () => {
    const out = renderSuccessMessage(
      makeState({
        smokeResult: {
          symbolId: "sym:py:src/auth.py:authenticate",
          symbolName: "authenticate",
          symbolKind: "function",
          claims: 7,
          references: 15,
          durationMs: 187,
        },
      }),
    );
    expect(out).toContain(
      "[OK] get_symbol_context returned bundle for sym:py:src/auth.py:authenticate",
    );
    expect(out).toContain("(7 claims, 15 references, 187ms)");
  });
});

describe("renderSuccessMessage — Try section (Q4.5.4 language-aware)", () => {
  it("kind=function → 'foo function' suggestion", () => {
    const out = renderSuccessMessage(
      makeState({
        smokeResult: {
          symbolId: "sym:ts:src/foo.ts:foo",
          symbolName: "foo",
          symbolKind: "function",
          claims: 0,
          references: 0,
          durationMs: 0,
        },
      }),
    );
    expect(out).toContain('"What does the foo function do?"');
  });

  it("kind=class → 'FooClass class' suggestion", () => {
    const out = renderSuccessMessage(
      makeState({
        smokeResult: {
          symbolId: "sym:ts:src/foo.ts:FooClass",
          symbolName: "FooClass",
          symbolKind: "class",
          claims: 0,
          references: 0,
          durationMs: 0,
        },
      }),
    );
    expect(out).toContain('"What does the FooClass class do?"');
  });

  it("kind=method maps to 'function' noun (Q4.5.4 kind-tag)", () => {
    const out = renderSuccessMessage(
      makeState({
        smokeResult: {
          symbolId: "sym:py:src/auth.py:User.login",
          symbolName: "login",
          symbolKind: "method",
          claims: 0,
          references: 0,
          durationMs: 0,
        },
      }),
    );
    expect(out).toContain('"What does the login function do?"');
  });

  it("kind=variable maps to 'value' noun", () => {
    const out = renderSuccessMessage(
      makeState({
        smokeResult: {
          symbolId: "sym:ts:src/config.ts:DEFAULT_PORT",
          symbolName: "DEFAULT_PORT",
          symbolKind: "variable",
          claims: 0,
          references: 0,
          durationMs: 0,
        },
      }),
    );
    expect(out).toContain('"What does the DEFAULT_PORT value do?"');
  });

  it("kind=other maps to 'symbol' fallback (Q4.5 Point 3 lock)", () => {
    const out = renderSuccessMessage(
      makeState({
        smokeResult: {
          symbolId: "sym:ts:src/foo.ts:bar",
          symbolName: "bar",
          symbolKind: "other",
          claims: 0,
          references: 0,
          durationMs: 0,
        },
      }),
    );
    expect(out).toContain('"What does the bar symbol do?"');
  });

  it("includes generic find_by_intent suggestion with <intent> placeholder", () => {
    const out = renderSuccessMessage(makeState());
    expect(out).toContain(
      '"Find symbols related to <intent>" — invokes find_by_intent',
    );
  });
});

describe("renderSuccessMessage — Re-run section", () => {
  it("lists contextatlas doctor + index commands", () => {
    const out = renderSuccessMessage(makeState());
    expect(out).toContain("contextatlas doctor");
    expect(out).toContain("contextatlas index");
  });
});

describe("renderSuccessMessage — Advisory section", () => {
  it("absent when warnings empty (clean automated path)", () => {
    const out = renderSuccessMessage(makeState({ warnings: [] }));
    expect(out).not.toContain("Advisory:");
  });

  it("present with warnings list when warnings non-empty (automated-with-warning route)", () => {
    const out = renderSuccessMessage(
      makeState({
        warnings: ["README.md sparse (123 < 300 word threshold)"],
      }),
    );
    expect(out).toContain("Advisory:");
    expect(out).toContain("- README.md sparse (123 < 300 word threshold)");
    expect(out).toContain("(For best atlas quality, address advisory items");
  });
});
