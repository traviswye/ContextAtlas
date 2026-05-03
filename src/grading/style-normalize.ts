/**
 * Style-normalization stretch goal per ADR-19 §3.
 *
 * Step 8-conditional activation: invoked only when position-bias
 * verification triggers (>60/40 imbalance per ADR-19 §3) on the
 * Step 8 grading run. When triggered, the imbalanced subset (k=5-10
 * pairs) is re-rendered through this normalizer and re-graded; if
 * the re-graded imbalance clears the threshold, the leak was
 * format-based (per ADR-19 §3 branch). If not, the leak is
 * content-based — honest finding, not methodology failure.
 *
 * Implementation deviates from ADR-19 §3 letter on two points
 * (approved per Step 4 Decision E):
 *   1. Bullets stripped entirely (vs §3 "bullets → semicolons").
 *      Reason: list-grouping reconstruction adds parsing fragility;
 *      strip simpler.
 *   2. No 80-col wrap (vs §3 "wrap at 80 cols"). Reason: line-wrap
 *      shifts token boundaries; defeats determinism goal.
 *
 * Both deviations preserve §3 substantive requirement (remove
 * formatting bias) with simpler implementation. ADR-19 §3 not
 * amended — deviations are implementation refinements, not
 * methodology changes.
 *
 * Pure-text transformations only — no markdown library dependency
 * per CLAUDE.md dep-min principle. All transformations are regex-
 * based on the input string.
 *
 * Properties guaranteed:
 *   - Deterministic: same input → same output.
 *   - Idempotent: styleNormalize(styleNormalize(x)) === styleNormalize(x).
 *   - Source-code-ref preservation: file:line references and ADR
 *     references survive unchanged (legitimate quality signal).
 *
 * See:
 *   - docs/adr/ADR-19-llm-judge-methodology.md §3 (style-
 *     normalization stretch trigger; position-bias re-grade branch)
 *   - src/grading/position-bias.ts (trigger condition)
 *   - STEP-PLAN-V0.5.md Step 4 (double-blind harness implementation)
 */

/**
 * Apply style normalization to text. Strips markdown formatting
 * (headers, bullets, code fences, emphasis, inline code) and
 * normalizes whitespace. Source-code refs and ADR references pass
 * through unchanged.
 */
export function styleNormalize(text: string): string {
  let result = text;

  // 1. Strip code fence delimiters (preserve content inside fences).
  //    Match a fence line including optional language tag and the
  //    trailing newline so the content within doesn't gain extra
  //    leading blank lines.
  result = result.replace(/^```[^\n]*\n?/gm, "");
  result = result.replace(/^```\s*$/gm, "");

  // 2. Strip markdown headers (`#`, `##`, etc.) at line start. Trim
  //    leading whitespace before the header marker too.
  result = result.replace(/^[ \t]*#+\s*/gm, "");

  // 3. Strip bullet markers at line start (-, *, +) including any
  //    leading indentation. Bullets become flat prose lines per
  //    Decision E deviation.
  result = result.replace(/^[ \t]*[-*+][ \t]+/gm, "");

  // 4. Strip ordered-list markers (`1.`, `2.`, etc.) at line start.
  result = result.replace(/^[ \t]*\d+\.[ \t]+/gm, "");

  // 5. Strip inline bold/italic emphasis. Apply double-asterisk
  //    before single-asterisk so **bold** doesn't get partially
  //    matched. Underscore emphasis only when bounded by non-word
  //    chars (avoid mangling snake_case identifiers).
  result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
  result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1");
  result = result.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "$1");

  // 6. Strip inline-code backticks (preserve content). Run multiple
  //    times in case nested or adjacent backtick spans remain after
  //    one pass (e.g., emphasis-stripping exposed previously-nested
  //    backticks).
  let prev = "";
  while (prev !== result) {
    prev = result;
    result = result.replace(/`([^`\n]+)`/g, "$1");
  }

  // 7. Normalize whitespace: collapse runs of spaces/tabs to one
  //    space; collapse runs of 3+ newlines to two.
  result = result.replace(/[ \t]+/g, " ");
  result = result.replace(/\n{3,}/g, "\n\n");

  // 8. Trim each line independently (removes trailing spaces;
  //    removes leading spaces left by stripped markers).
  result = result
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  // 9. Trim outer whitespace.
  result = result.trim();

  return result;
}
