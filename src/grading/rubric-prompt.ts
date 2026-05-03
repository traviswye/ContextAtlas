/**
 * Canonical v0.5 LLM-judge rubric prompt.
 *
 * Per ADR-19 §1 (rubric design — 4 axes, 0-3 scale, worked-example
 * anchored) + §3 (anonymization, format-ignoring instruction,
 * anti-RLHF-bias discipline). Rubric DESIGN locked at Step 1; rubric
 * PROMPT TEXT commits here at Step 3 per F1 two-lock-point pattern.
 *
 * Two exported constants per Step 3 design lock:
 *   - RUBRIC_PROMPT_SINGLE: single-mode framing + shared body. Used
 *     by gradeSingle (Step 6 calibration; within-judge consistency
 *     regrade; Travis-intuition correlation).
 *   - RUBRIC_PROMPT_PAIRED: paired-mode framing + shared body. Used
 *     by gradePair (Step 8 production grading; A/B comparison).
 *
 * Pre-composed (not built at runtime) per ADR-02 EXTRACTION_PROMPT
 * single-source-of-truth precedent. Callers import the mode-specific
 * constant explicitly; judge-client.ts treats rubricPrompt as opaque
 * input (no magic defaults).
 *
 * Anchor provenance (honest labeling per Step 3 design lock):
 *   - "ALPHA H4 (real output)" + "CA H4 (real output)" inline are
 *     verbatim alpha vs ca opening fragments from Phase 5 §5.1
 *     h4-validator-typeflow trial outputs. Real grading substrate.
 *   - Axis 4 score-0 anchor is labeled "hypothetical-illustrative"
 *     per ADR-19 §1: real v0.3+v0.4 trial outputs did not produce
 *     score-0-level fabrication; the example shows what fabrication
 *     detection would catch, not what was observed. Disclosed
 *     transparently here AND in phase-9 reference doc.
 *   - Phase 5 §3.3 h6-fetch-signature pattern referenced in Axis 3
 *     trick-bucket override; pattern description sufficient (no
 *     verbatim quote — real h6 substrate too long for prompt body).
 *
 * Refinements to this canonical text require calibration evidence
 * parallel to v0.3 Step 9 docstring-prompt-calibration discipline.
 * Step 6 calibration ($10-25 envelope) is the canonical rubric's
 * empirical test. The prompt content, axis taxonomy, scale, and
 * anchor framing are frozen per ADR-19; call signatures and parsing
 * around it (in judge-client.ts) evolve with the harness.
 *
 * See:
 *   - docs/adr/ADR-19-llm-judge-methodology.md (rubric design + §3
 *     anonymization + format-ignoring instruction verbatim)
 *   - docs/adr/ADR-02-extraction-sole-api-caller.md (amended 2026-04-30
 *     to permit src/grading/ as second Anthropic API caller; single-
 *     source-of-truth pattern this module mirrors)
 *   - ContextAtlas-benchmarks/research/phase-5-reference-run.md §5.1
 *     (h4-validator-typeflow alpha vs ca opening fragments; rubric
 *     anchor substrate provenance) + §3.3 (h6-fetch-signature
 *     trick-bucket pattern; Axis 3 override anchor)
 */

/**
 * Single-mode canonical rubric prompt — framing prefix + body + schema.
 *
 * Used by gradeSingle for Step 6 calibration. Token budget: ~730.
 * Pre-composed; do not construct at runtime.
 */
export const RUBRIC_PROMPT_SINGLE = `You will grade an answer against a rubric. Score substance, not
presentation.

CRITICAL: ignore all of the following — none are quality signals:
markdown formatting choices; length alone (a tightly-precise short
answer can score equal to a thoroughly-explained long answer);
tone, voice, formality, hedging style; whether file references are
inline or grouped; whether ADR references appear in prose or block
quotes.

Evaluate substance against the rubric: factual correctness;
completeness; actionability; hallucination. Score each axis 0-3
per the rubric anchors.

RUBRIC

Score the answer on four axes, each 0-3. The four axes isolate
distinct quality failure modes; score each independently.

AXES:
1. factual_correctness: Are asserted facts about the code or
   architecture accurate?
2. completeness: Does the answer cover the prompt's actual scope?
3. actionability: Can the user proceed from this answer toward the
   change or understanding the prompt asks for?
4. hallucination: Does the answer assert specific items (files,
   symbols, ADRs, line numbers) that don't exist?

WORKED ANCHORS (Phase 5 h4-validator-typeflow real output substrate):

The two fragments below are verbatim opening lines from real Phase
5 §5.1 trial outputs. Both are answering the same prompt: how does
a validator's type flow through a handler's c.req.valid() and on
to the RPC client?

ALPHA H4 (real output):
"Using a validator (e.g. \`@hono/zod-validator\`'s \`zValidator\` or
the reference implementation in \`src/validator/validator.test.ts:
36-61\`) attaches types that flow from the schema → handler's
\`c.req.valid()\` → RPC client. Here's the chain:"

CA H4 (real output):
"The whole system is governed by **ADR-04** (documented in the
intent registry): the type-inference chain from route registration
→ handler Context → typed client must be preserved end-to-end,
with no codegen."

Both fragments are score 3 on factual_correctness AND score 3 on
hallucination — every asserted item (file:line in ALPHA H4; ADR-04
in CA H4) is verifiable. They DIFFER on actionability: CA H4 names
the governing constraint (ADR-04); ALPHA H4 describes the mechanism
without architectural framing. Per-axis anchors below reference
these fragments by label.

PER-AXIS SCALE ANCHORS:

[axis 1: factual_correctness]
0 = absent or wrong: asserts facts that contradict the codebase or
    referenced ADRs.
1 = partial: some correct facts mixed with errors; key claims
    undermined by inaccuracies.
2 = mostly correct: claims accurate but with one minor inaccuracy
    or unsupported inference.
3 = exemplary: like ALPHA H4 (cites verifiable file:line) OR like
    CA H4 (names verifiable ADR-04). All asserted facts verifiable.

[axis 2: completeness]
0 = misses central thing: prompt's primary question unaddressed.
1 = major omissions: covers a fragment but leaves the prompt's
    primary scope unanswered.
2 = minor gaps: covers main scope; one secondary aspect
    underspecified.
3 = full coverage: CA H4 demonstrates the architectural framing;
    full coverage requires both the architectural anchor AND the
    mechanical flow (route registration → handler Context → typed
    client → end-to-end with no codegen). Prompt scope fully
    addressed on both substantive dimensions.

[axis 3: actionability]
0 = no concrete pointers: vague guidance without actionable handles
    (no files, no symbols, no governing constraints).
1 = vague: gestures at next steps without naming specific files,
    symbols, or constraints the user can act on.
2 = concrete but missing why: like ALPHA H4 (concrete file:line
    pointers; describes mechanism without governing constraint
    framing).
3 = concrete + governing constraint cited: like CA H4 (file or
    symbol references PLUS named governing ADR or architectural
    constraint that explains why).

TRICK-BUCKET OVERRIDE (axis 3): For trivial-lookup prompts (e.g.,
"what is the signature of X?" — h6-fetch-signature pattern from
Phase 5), score actionability ≤ 1 if the answer carries irrelevant
ADR context that buries the lookup answer in over-extraction. A
factually-correct-but-bloated answer must NOT score 3 on
actionability; the over-extraction failure mode is what this
override surfaces.

[axis 4: hallucination]
0 = ≥2 fabrications (HYPOTHETICAL-ILLUSTRATIVE — real v0.3+v0.4
    trial outputs did not produce this level; example below shows
    what fabrication detection would catch, not what was observed):
    e.g., "as documented in ADR-99" when ADR-99 doesn't exist;
    "see \`validator.fabricatedMethod()\` at line 142" when no such
    symbol or line exists.
1 = one fabrication: a single specific item (file path, line
    number, ADR reference, symbol name) asserted that doesn't
    exist in the codebase or ADR set.
2 = slight overclaim: marginal extension beyond what evidence
    supports without explicit fabrication of specific items.
3 = all references verifiable: like ALPHA H4 (real file:line) OR
    like CA H4 (real ADR-04 referenced). No fabricated items.

EDGE CASES:

Truncated outputs: score what shipped. Truncation IS a quality
failure mode — typically lowers completeness, may lower
actionability. Do not infer-and-fill on truncated content.

Non-English content: out of v0.5 scope. Flag in notes if
encountered; score conservatively without full grading.

Format anomaly (markdown wrapping where unexpected; mixed
prose/code; unusual structure): handled by the format-ignoring
instruction in the framing above. Score substance, not
presentation.

Partial-right + partial-wrong: axes are scored INDEPENDENTLY. A
vague-but-correct answer scores high on factual_correctness and
high on hallucination, low on actionability. Do not average across
axes.

No-answer / honest refusal ("I don't know without more context"):
score factual_correctness 3 (refused honestly; no false claims);
hallucination 3 (no fabrication); completeness 0 (no scope
coverage); actionability 0 or 1 depending on whether the refusal
points at what additional context would help.

Tied outputs: no special handling. The 4-axis rubric IS the
instrument designed to surface ties at the call/token efficiency
layer with quality differences underneath (per ADR-19 §1). Apply
per-axis criteria as written; if substance genuinely matches, the
scores match.

OUTPUT FORMAT:

Output ONLY a JSON object with exactly four keys mapping to
integer 0-3. No prose, no markdown fencing, no commentary.

Schema:
{"factual_correctness": 0|1|2|3, "completeness": 0|1|2|3, "actionability": 0|1|2|3, "hallucination": 0|1|2|3}`;

/**
 * Paired-mode canonical rubric prompt — framing prefix (ADR-19 §3
 * verbatim) + body + paired schema.
 *
 * Used by gradePair for Step 8 production grading. Token budget:
 * ~780. Includes the "do not invent distinctions to break ties"
 * anti-RLHF discipline (paired-mode-specific; protects the rubric's
 * primary tied-outputs purpose per ADR-19 §1).
 *
 * Pre-composed; do not construct at runtime.
 */
export const RUBRIC_PROMPT_PAIRED = `You will grade two answers (presented as A and B) against a
rubric. Both answers respond to the same prompt; they may use
different formatting, phrasing, or structure. Score substance,
not presentation.

CRITICAL: ignore all of the following — none are quality signals:
markdown formatting choices; length alone (a tightly-precise short
answer can score equal to a thoroughly-explained long answer);
tone, voice, formality, hedging style; whether file references are
inline or grouped; whether ADR references appear in prose or block
quotes.

Evaluate substance against the rubric: factual correctness;
completeness; actionability; hallucination. Score each axis 0-3
per the rubric anchors.

If A and B are substantively equivalent, score them equally — do
not invent distinctions to break ties.

RUBRIC

Score each answer on four axes, each 0-3. The four axes isolate
distinct quality failure modes; score each independently.

AXES:
1. factual_correctness: Are asserted facts about the code or
   architecture accurate?
2. completeness: Does the answer cover the prompt's actual scope?
3. actionability: Can the user proceed from this answer toward the
   change or understanding the prompt asks for?
4. hallucination: Does the answer assert specific items (files,
   symbols, ADRs, line numbers) that don't exist?

WORKED ANCHORS (Phase 5 h4-validator-typeflow real output substrate):

The two fragments below are verbatim opening lines from real Phase
5 §5.1 trial outputs. Both are answering the same prompt: how does
a validator's type flow through a handler's c.req.valid() and on
to the RPC client?

ALPHA H4 (real output):
"Using a validator (e.g. \`@hono/zod-validator\`'s \`zValidator\` or
the reference implementation in \`src/validator/validator.test.ts:
36-61\`) attaches types that flow from the schema → handler's
\`c.req.valid()\` → RPC client. Here's the chain:"

CA H4 (real output):
"The whole system is governed by **ADR-04** (documented in the
intent registry): the type-inference chain from route registration
→ handler Context → typed client must be preserved end-to-end,
with no codegen."

Both fragments are score 3 on factual_correctness AND score 3 on
hallucination — every asserted item (file:line in ALPHA H4; ADR-04
in CA H4) is verifiable. They DIFFER on actionability: CA H4 names
the governing constraint (ADR-04); ALPHA H4 describes the mechanism
without architectural framing. Per-axis anchors below reference
these fragments by label.

PER-AXIS SCALE ANCHORS:

[axis 1: factual_correctness]
0 = absent or wrong: asserts facts that contradict the codebase or
    referenced ADRs.
1 = partial: some correct facts mixed with errors; key claims
    undermined by inaccuracies.
2 = mostly correct: claims accurate but with one minor inaccuracy
    or unsupported inference.
3 = exemplary: like ALPHA H4 (cites verifiable file:line) OR like
    CA H4 (names verifiable ADR-04). All asserted facts verifiable.

[axis 2: completeness]
0 = misses central thing: prompt's primary question unaddressed.
1 = major omissions: covers a fragment but leaves the prompt's
    primary scope unanswered.
2 = minor gaps: covers main scope; one secondary aspect
    underspecified.
3 = full coverage: CA H4 demonstrates the architectural framing;
    full coverage requires both the architectural anchor AND the
    mechanical flow (route registration → handler Context → typed
    client → end-to-end with no codegen). Prompt scope fully
    addressed on both substantive dimensions.

[axis 3: actionability]
0 = no concrete pointers: vague guidance without actionable handles
    (no files, no symbols, no governing constraints).
1 = vague: gestures at next steps without naming specific files,
    symbols, or constraints the user can act on.
2 = concrete but missing why: like ALPHA H4 (concrete file:line
    pointers; describes mechanism without governing constraint
    framing).
3 = concrete + governing constraint cited: like CA H4 (file or
    symbol references PLUS named governing ADR or architectural
    constraint that explains why).

TRICK-BUCKET OVERRIDE (axis 3): For trivial-lookup prompts (e.g.,
"what is the signature of X?" — h6-fetch-signature pattern from
Phase 5), score actionability ≤ 1 if the answer carries irrelevant
ADR context that buries the lookup answer in over-extraction. A
factually-correct-but-bloated answer must NOT score 3 on
actionability; the over-extraction failure mode is what this
override surfaces.

[axis 4: hallucination]
0 = ≥2 fabrications (HYPOTHETICAL-ILLUSTRATIVE — real v0.3+v0.4
    trial outputs did not produce this level; example below shows
    what fabrication detection would catch, not what was observed):
    e.g., "as documented in ADR-99" when ADR-99 doesn't exist;
    "see \`validator.fabricatedMethod()\` at line 142" when no such
    symbol or line exists.
1 = one fabrication: a single specific item (file path, line
    number, ADR reference, symbol name) asserted that doesn't
    exist in the codebase or ADR set.
2 = slight overclaim: marginal extension beyond what evidence
    supports without explicit fabrication of specific items.
3 = all references verifiable: like ALPHA H4 (real file:line) OR
    like CA H4 (real ADR-04 referenced). No fabricated items.

EDGE CASES:

Truncated outputs: score what shipped. Truncation IS a quality
failure mode — typically lowers completeness, may lower
actionability. Do not infer-and-fill on truncated content.

Non-English content: out of v0.5 scope. Flag in notes if
encountered; score conservatively without full grading.

Format anomaly (markdown wrapping where unexpected; mixed
prose/code; unusual structure): handled by the format-ignoring
instruction in the framing above. Score substance, not
presentation.

Partial-right + partial-wrong: axes are scored INDEPENDENTLY. A
vague-but-correct answer scores high on factual_correctness and
high on hallucination, low on actionability. Do not average across
axes.

No-answer / honest refusal ("I don't know without more context"):
score factual_correctness 3 (refused honestly; no false claims);
hallucination 3 (no fabrication); completeness 0 (no scope
coverage); actionability 0 or 1 depending on whether the refusal
points at what additional context would help.

Tied outputs: no special handling. The 4-axis rubric IS the
instrument designed to surface ties at the call/token efficiency
layer with quality differences underneath (per ADR-19 §1). Apply
per-axis criteria as written; if substance genuinely matches, the
scores match.

OUTPUT FORMAT:

Output ONLY a JSON object with exactly two keys "A" and "B", each
mapping to an object with the four axis keys mapping to integer
0-3. No prose, no markdown fencing, no commentary.

Schema:
{"A": {"factual_correctness": 0|1|2|3, "completeness": 0|1|2|3, "actionability": 0|1|2|3, "hallucination": 0|1|2|3}, "B": {"factual_correctness": 0|1|2|3, "completeness": 0|1|2|3, "actionability": 0|1|2|3, "hallucination": 0|1|2|3}}`;
