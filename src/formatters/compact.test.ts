import { readFileSync, writeFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { ImpactBundle } from "../queries/impact-of-change.js";
import type { Claim, Reference, SymbolContextBundle } from "../types.js";

import { renderCompact, renderImpactCompact } from "./compact.js";

const GOLDEN_DIR = pathResolve("test/fixtures/bundles");
const UPDATE = process.env.UPDATE_GOLDENS === "1";

function checkGolden(name: string, actual: string): void {
  const path = pathResolve(GOLDEN_DIR, `${name}.txt`);
  if (UPDATE) {
    writeFileSync(path, actual, "utf8");
    return;
  }
  const expected = readFileSync(path, "utf8");
  expect(actual).toBe(expected);
}

// ---------------------------------------------------------------------------
// Complex fixture: OrderProcessor with 2 claims, 50 refs, 3 tests, no types
// ---------------------------------------------------------------------------

const CLAIMS: Claim[] = [
  {
    id: 1,
    source: "ADR-07",
    sourcePath: "docs/adr/ADR-07.md",
    sourceSha: "s",
    severity: "hard",
    claim: "must be idempotent",
    rationale: "enables safe retry on network failures",
    excerpt: "All order processing must be safely retryable.",
    symbolIds: ["sym:ts:src/orders/processor.ts:OrderProcessor"],
  },
  {
    id: 2,
    source: "ADR-11",
    sourcePath: "docs/adr/ADR-11.md",
    sourceSha: "s",
    severity: "hard",
    claim: "no synchronous I/O on the hot path",
    rationale: "latency sensitivity; hot path must stay <10ms",
    excerpt: "Order path must never block on I/O.",
    symbolIds: ["sym:ts:src/orders/processor.ts:OrderProcessor"],
  },
];

const COMPLEX: SymbolContextBundle = {
  version: "1.0",
  symbol: {
    id: "sym:ts:src/orders/processor.ts:OrderProcessor",
    name: "OrderProcessor",
    kind: "class",
    path: "src/orders/processor.ts",
    line: 42,
    signature: "class OrderProcessor extends BaseProcessor<Order>",
    language: "typescript",
    fileSha: "abc",
  },
  intent: CLAIMS,
  refs: {
    count: 50,
    clusters: [
      {
        module: "billing",
        count: 22,
        topIds: [
          "ref:ts:billing/charges.ts:88",
          "ref:ts:billing/refunds.ts:34",
          "ref:ts:billing/subscriptions.ts:55",
        ],
      },
      {
        module: "admin",
        count: 14,
        topIds: [
          "ref:ts:admin/orders.ts:12",
          "ref:ts:admin/panel.ts:55",
        ],
      },
      {
        module: "reports",
        count: 10,
        topIds: ["ref:ts:reports/monthly.ts:8"],
      },
      {
        module: "tests",
        count: 4,
        topIds: ["ref:ts:tests/integration.ts:1"],
      },
    ],
  },
  tests: {
    files: [
      "src/integration/orders.test.ts",
      "src/orders/flaky.test.ts",
      "src/orders/processor.test.ts",
    ],
    relatedCount: 3,
  },
};

// Same symbol, but with TypeInfo populated — used for the with-types golden.
const WITH_TYPES: SymbolContextBundle = {
  version: "1.0",
  symbol: {
    id: "sym:ts:src/orders/base.ts:BaseProcessor",
    name: "BaseProcessor",
    kind: "class",
    path: "src/orders/base.ts",
    line: 10,
    signature: "abstract class BaseProcessor<T>",
    language: "typescript",
    fileSha: "def",
  },
  intent: [
    {
      id: 3,
      source: "ADR-07",
      sourcePath: "docs/adr/ADR-07.md",
      sourceSha: "s",
      severity: "hard",
      claim: "must be idempotent",
      rationale: "applies to every concrete processor",
      excerpt: "All order processing must be safely retryable.",
      symbolIds: ["sym:ts:src/orders/base.ts:BaseProcessor"],
    },
  ],
  refs: {
    count: 6,
    clusters: [
      {
        module: "orders",
        count: 4,
        topIds: [
          "ref:ts:orders/processor.ts:42",
          "ref:ts:orders/refund.ts:15",
        ],
      },
      {
        module: "billing",
        count: 2,
        topIds: ["ref:ts:billing/charges.ts:88"],
      },
    ],
  },
  types: {
    implements: ["Retryable", "Auditable"],
    usedByTypes: ["OrderProcessor", "RefundProcessor"],
  },
  tests: {
    files: ["src/orders/base.test.ts"],
    relatedCount: 1,
  },
};

// Empty-intent fixture: utility function with refs but no claims, no types.
const EMPTY_INTENT: SymbolContextBundle = {
  version: "1.0",
  symbol: {
    id: "sym:ts:src/utils/format.ts:formatDate",
    name: "formatDate",
    kind: "function",
    path: "src/utils/format.ts",
    line: 5,
    signature: "function formatDate(d: Date): string",
    language: "typescript",
    fileSha: "ghi",
  },
  refs: {
    count: 3,
    clusters: [
      {
        module: "orders",
        count: 2,
        topIds: [
          "ref:ts:orders/processor.ts:12",
          "ref:ts:orders/queue.ts:33",
        ],
      },
      {
        module: "admin",
        count: 1,
        topIds: ["ref:ts:admin/panel.ts:50"],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Golden comparisons
// ---------------------------------------------------------------------------

describe("renderCompact — golden files", () => {
  it("complex-summary", () => {
    const out = renderCompact(COMPLEX, { depth: "summary", maxRefs: 50 });
    checkGolden("complex-summary", out);
  });

  it("complex-standard", () => {
    const out = renderCompact(COMPLEX, { depth: "standard", maxRefs: 50 });
    checkGolden("complex-standard", out);
  });

  it("complex-deep", () => {
    const out = renderCompact(COMPLEX, { depth: "deep", maxRefs: 50 });
    checkGolden("complex-deep", out);
  });

  it("complex-with-types-deep", () => {
    const out = renderCompact(WITH_TYPES, { depth: "deep", maxRefs: 50 });
    checkGolden("complex-with-types-deep", out);
  });

  it("empty-intent", () => {
    const out = renderCompact(EMPTY_INTENT, {
      depth: "standard",
      maxRefs: 50,
    });
    checkGolden("empty-intent", out);
  });
});

// ---------------------------------------------------------------------------
// Structural tests (not golden) — catch regressions on shape decisions
// that should hold regardless of specific content.
// ---------------------------------------------------------------------------

describe("renderCompact — structural invariants", () => {
  const minimal: SymbolContextBundle = {
    version: "1.0",
    symbol: {
      id: "sym:ts:a.ts:X",
      name: "X",
      kind: "class",
      path: "a.ts",
      line: 1,
      language: "typescript",
    },
  };

  it("ends in exactly one newline", () => {
    const out = renderCompact(minimal, { depth: "standard", maxRefs: 50 });
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  it("no leading whitespace on header line", () => {
    const out = renderCompact(minimal, { depth: "standard", maxRefs: 50 });
    const first = out.split("\n")[0]!;
    expect(first).toMatch(/^SYM /);
  });

  it("omits SIG when signature is absent", () => {
    const out = renderCompact(minimal, { depth: "standard", maxRefs: 50 });
    expect(out).not.toMatch(/^\s*SIG\b/m);
  });

  it("omits INTENT when no claims exist", () => {
    const out = renderCompact(
      { ...minimal, intent: [] },
      { depth: "standard", maxRefs: 50 },
    );
    expect(out).not.toMatch(/INTENT/);
  });

  it("summary depth omits REFS, TESTS, TYPES sections", () => {
    const refs: Reference[] = [
      {
        id: "ref:ts:a.ts:1",
        symbolId: "sym:ts:a.ts:X",
        path: "a.ts",
        line: 1,
      },
    ];
    const withAll: SymbolContextBundle = {
      ...minimal,
      refs: {
        count: 1,
        clusters: [{ module: "a.ts", count: 1, topIds: [refs[0]!.id] }],
      },
      tests: { files: ["x.test.ts"], relatedCount: 1 },
      types: { extends: ["A"], implements: [], usedByTypes: [] },
    };
    const out = renderCompact(withAll, { depth: "summary", maxRefs: 50 });
    expect(out).not.toMatch(/REFS/);
    expect(out).not.toMatch(/TESTS/);
    expect(out).not.toMatch(/TYPES/);
  });

  it("TYPES is rendered only at deep depth", () => {
    const withTypes: SymbolContextBundle = {
      ...minimal,
      types: { extends: ["A"], implements: [], usedByTypes: [] },
    };
    expect(
      renderCompact(withTypes, { depth: "standard", maxRefs: 50 }),
    ).not.toMatch(/TYPES/);
    expect(
      renderCompact(withTypes, { depth: "deep", maxRefs: 50 }),
    ).toMatch(/TYPES/);
  });

  it("DIAG lines are emitted at all depths when diagnostics present", () => {
    const withDiag: SymbolContextBundle = {
      ...minimal,
      diagnostics: [
        { severity: "error", message: "TS2304", path: "a.ts", line: 3 },
      ],
    };
    for (const depth of ["summary", "standard", "deep"] as const) {
      const out = renderCompact(withDiag, { depth, maxRefs: 50 });
      expect(out).toMatch(/DIAG error/);
    }
  });

  it("deep depth shows '... +N more' when refs.count exceeds rendered ids", () => {
    const bundle: SymbolContextBundle = {
      ...minimal,
      refs: {
        count: 50,
        clusters: [
          {
            module: "a",
            count: 50,
            topIds: ["ref:ts:a.ts:1", "ref:ts:a.ts:2"],
          },
        ],
      },
    };
    const out = renderCompact(bundle, { depth: "deep", maxRefs: 50 });
    expect(out).toMatch(/\.\.\. \+48 more/);
  });

  it("GIT block renders at every depth; per-commit COMMIT lines at standard+", () => {
    const bundle: SymbolContextBundle = {
      ...minimal,
      git: {
        lastTouched: "2026-04-20T10:00:00Z",
        lastTouchedAuthor: "alice@example.com",
        recentCommits: [
          {
            sha: "a".repeat(40),
            date: "2026-04-20T10:00:00Z",
            message: "fix: retry",
            authorEmail: "alice@example.com",
          },
          {
            sha: "b".repeat(40),
            date: "2026-04-19T10:00:00Z",
            message: "refactor",
            authorEmail: "bob@example.com",
          },
        ],
        hot: true,
        commitCount: 7,
        hotThreshold: 5,
      },
    };

    const summary = renderCompact(bundle, { depth: "summary", maxRefs: 50 });
    expect(summary).toMatch(/GIT last=2026-04-20T10:00:00Z by alice@example\.com hot \(7≥5 commits\)/);
    // Summary depth: no per-commit lines.
    expect(summary).not.toMatch(/COMMIT /);

    const standard = renderCompact(bundle, { depth: "standard", maxRefs: 50 });
    expect(standard).toMatch(/COMMIT aaaaaaa 2026-04-20 "fix: retry"/);
    expect(standard).toMatch(/COMMIT bbbbbbb 2026-04-19 "refactor"/);
  });

  it("renderImpactCompact produces IMPACT header, GIT_COCHANGE, RISK_SIGNALS in order", () => {
    const bundle: SymbolContextBundle = {
      version: "1.0",
      symbol: {
        id: "sym:ts:src/x.ts:X",
        name: "X",
        kind: "class",
        path: "src/x.ts",
        line: 1,
        language: "typescript",
      },
    };
    const impact: ImpactBundle = {
      bundle,
      coChange: [
        { filePath: "src/y.ts", coCommitCount: 9 },
        { filePath: "src/z.ts", coCommitCount: 3 },
      ],
      riskSignals: {
        hot: false,
        commitCount: 2,
        hotThreshold: 5,
        testFiles: 1,
        diagnostics: 0,
        hardClaims: 2,
        softClaims: 1,
        contextClaims: 0,
      },
    };
    const out = renderImpactCompact(impact);
    const lines = out.split("\n");
    expect(lines[0]).toBe("IMPACT sym:ts:src/x.ts:X");
    expect(out).toMatch(/GIT_COCHANGE \(top 2\)/);
    expect(out).toMatch(/src\/y\.ts\s+9 commits/);
    expect(out).toMatch(/RISK_SIGNALS/);
    expect(out).toMatch(/hot: no \(2<5 commits\)/);
    expect(out).toMatch(/intent_density: 2 hard \/ 1 soft \/ 0 context/);
  });

  it("renderImpactCompact omits GIT_COCHANGE when empty but keeps RISK_SIGNALS", () => {
    const impact: ImpactBundle = {
      bundle: {
        version: "1.0",
        symbol: {
          id: "sym:ts:src/x.ts:X",
          name: "X",
          kind: "class",
          path: "src/x.ts",
          line: 1,
          language: "typescript",
        },
      },
      coChange: [],
      riskSignals: {
        hot: false,
        commitCount: 0,
        hotThreshold: 5,
        testFiles: 0,
        diagnostics: 0,
        hardClaims: 0,
        softClaims: 0,
        contextClaims: 0,
      },
    };
    const out = renderImpactCompact(impact);
    expect(out).not.toMatch(/GIT_COCHANGE/);
    expect(out).toMatch(/RISK_SIGNALS/);
  });

  it("GIT block cold rendering shows 'cold' with count<threshold", () => {
    const bundle: SymbolContextBundle = {
      ...minimal,
      git: {
        lastTouched: "2026-04-20T10:00:00Z",
        lastTouchedAuthor: "alice@example.com",
        recentCommits: [],
        hot: false,
        commitCount: 2,
        hotThreshold: 5,
      },
    };
    const out = renderCompact(bundle, { depth: "standard", maxRefs: 50 });
    expect(out).toMatch(/GIT last=.* cold \(2<5 commits\)/);
  });
});
