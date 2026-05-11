/**
 * Canonical generate-adrs prompt constant.
 *
 * STEP 2.2.a.1 PLACEHOLDER STATE: this constant currently holds an
 * obvious placeholder string per Travis Step 2.2.a.1 Observation 1.
 * Actual `GENERATE_ADRS_PROMPT` content is substantive interpretive
 * work — drafted inline at Step 2.2.a.2 surface for Travis review per
 * discipline #3 cadence applied to substantive interpretive scope.
 *
 * Path-γ forward-pointer: the `contextatlas show-generate-prompt`
 * CLI subcommand outputs whatever value `GENERATE_ADRS_PROMPT` has
 * at any given time. When Step 2.2.a.2 lands real prompt content,
 * the same subcommand will surface real output without any code
 * changes to the subcommand itself (Path-γ separation works as
 * designed; mirrors Step 1.4b `cli-show-prompt` pattern).
 *
 * Tests against this constant assert subcommand behavior (output
 * matches `GENERATE_ADRS_PROMPT` whatever its current value);
 * substantively independent of placeholder vs real content.
 */

export const GENERATE_ADRS_PROMPT =
  "[GENERATE_ADRS_PROMPT placeholder — actual prompt content drafted " +
  "at Step 2.2.a.2 substantive interpretive work surface per " +
  "discipline #3 cadence. The contextatlas show-generate-prompt CLI " +
  "subcommand will surface real prompt output once Step 2.2.a.2 " +
  "ships; subcommand code is unchanged.]";
