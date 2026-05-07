/**
 * PII filter for cohort observability per v0.6 Step 6.2 / Q6.0.7
 * hybrid (denylist + allowlist) sanitize strategy + Q6.2.3
 * sanitize approach lock at Step 6.2 surface review.
 *
 * Privacy-load-bearing dimension: if sanitize fails to strip PII,
 * observability framework violates ADR-20 cohort observability
 * contract. Test rigor refinement applied per Q6.0.7
 * (~12-15 tests; sanitize.test.ts).
 *
 * Hybrid strategy:
 *   - Denylist: PII_PATTERNS regex array (email shapes; common
 *     identity-leak patterns)
 *   - Allowlist: SAFE_FIELDS Set (preserved-as-is field names)
 *   - Path-stripping: absolute paths → relative-to-cwd or
 *     <home> substitution
 */

/**
 * PII_PATTERNS: v0.6 v1 minimal-defensible-baseline; extended at
 * v0.7+ per cohort empirical surface (Phase-10 §9 cycle-emergent
 * candidate); expansion follows pattern-discovery review at v0.7
 * cycle pre-planning. Per discipline #4 honest-scope-
 * acknowledgment (Q6.2.3 Refinement 2 lock).
 */
const PII_PATTERNS: readonly RegExp[] = [
  // Email addresses
  /[\w.+-]+@[\w.-]+\.\w+/g,
];

/**
 * Allowlist field names — preserved as-is during recursive walk
 * (no PII filtering applied to values; assumes upstream produces
 * safe content for these fields). Matches MCP tool surface
 * vocabulary + observation result fields.
 */
const SAFE_FIELDS: ReadonlySet<string> = new Set([
  "tool",
  "kind",
  "language",
  "depth",
  "include",
  "maxRefs",
  "status",
  "latency_ms",
  "result_count",
  "timestamp",
  "session_id",
  "contextatlas_version",
]);

const MAX_RECURSION_DEPTH = 64; // defensive bound against pathological nesting

/**
 * Strip absolute paths from a string: replace home-dir-prefixed
 * paths with `<home>` token; replace cwd-prefixed paths with
 * relative form. Handles Unix + Windows path separators.
 */
export function stripPaths(input: string, cwd: string): string {
  let out = input;

  // Home-dir Unix: /Users/<user>/... or /home/<user>/...
  out = out.replace(/(\/Users\/|\/home\/)[^\/\s"'`)]+/g, "<home>");
  // Home-dir Windows: C:\Users\<user>\... (case-insensitive drive)
  out = out.replace(/[A-Za-z]:\\Users\\[^\\\s"'`)]+/g, "<home>");

  // cwd-prefix → relative
  if (cwd.length > 0) {
    // Normalize cwd for matching (handle both separators)
    const cwdNormalized = cwd.replace(/\\/g, "/");
    const inputNormalized = out.replace(/\\/g, "/");
    if (inputNormalized.startsWith(cwdNormalized)) {
      // Compute the original-form replacement length
      out = "<cwd>" + out.slice(cwd.length);
    }
  }

  return out;
}

/**
 * Strip PII patterns (email; etc) from a string per PII_PATTERNS
 * denylist. Replace matches with `<redacted>` token.
 */
export function stripPII(input: string): string {
  let out = input;
  for (const pattern of PII_PATTERNS) {
    out = out.replace(pattern, "<redacted>");
  }
  return out;
}

export interface SanitizeContext {
  readonly cwd: string;
}

/**
 * Recursively sanitize an arbitrary input value for observability
 * logging. Applies path-stripping + PII denylist to string values;
 * preserves allowlist-named fields verbatim; defensive against
 * cycles + deep nesting.
 */
export function sanitize(input: unknown, ctx: SanitizeContext): unknown {
  return sanitizeRecursive(input, ctx, 0, new WeakSet());
}

function sanitizeRecursive(
  value: unknown,
  ctx: SanitizeContext,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (depth > MAX_RECURSION_DEPTH) {
    return "<recursion-limit>";
  }

  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return stripPII(stripPaths(value, ctx.cwd));
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return "<cycle>";
    seen.add(value);
    return value.map((item) =>
      sanitizeRecursive(item, ctx, depth + 1, seen),
    );
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return "<cycle>";
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (SAFE_FIELDS.has(key)) {
        // Allowlist: preserve verbatim (skip recursive sanitize for
        // primitive values; recurse for nested objects to allow
        // deep allowlist matching).
        if (typeof v === "object" && v !== null) {
          out[key] = sanitizeRecursive(v, ctx, depth + 1, seen);
        } else {
          out[key] = v;
        }
      } else {
        out[key] = sanitizeRecursive(v, ctx, depth + 1, seen);
      }
    }
    return out;
  }

  // Fallback for symbols, functions, etc — replace with type token.
  return `<${typeof value}>`;
}
