#!/usr/bin/env node
/**
 * v0.5 Step 2.4 probe — single end-to-end Sonnet 4.6 round-trip
 * validation against the judge harness shipped at Step 2.3.
 *
 * Per Step 2 design proposal + Travis sign-off (2026-05-01):
 *   - gradeSingle ONLY (gradePair deferred to Step 6 calibration
 *     organic validation)
 *   - Placeholder rubric prompt; not the canonical Step 3 rubric
 *   - Real Step 9 anchor answer fragment: httpx/p4-stream-lifecycle
 *     ca trial answer field (verbatim inline-copy from
 *     ContextAtlas-benchmarks/runs/2026-04-29T05-36-15-709Z/httpx/
 *     p4-stream-lifecycle/ca.json)
 *   - 6 pass criteria asserted; PROBE PASS or PROBE FAIL: <reason>
 *
 * Run:
 *   npm run build
 *   ANTHROPIC_API_KEY=... node scripts/v0.5-step2-probe.mjs
 *
 * Cost estimate: ~$0.005 (one Sonnet 4.6 call; ~1.5k input + ~80
 * output tokens). Below v0.5 cost-discipline $1 sign-off threshold;
 * Travis pre-approved per Option A workflow (Travis runs locally;
 * output pasted back for interpretation).
 *
 * Discard after Step 2 closes — one-shot dev-time validation.
 */

import Anthropic from "@anthropic-ai/sdk";

import {
  createJudgeClient,
  JudgeParseError,
} from "../dist/grading/judge-client.js";
import { computeCostUsd } from "../dist/grading/pricing.js";

// ============================================================================
// Probe inputs
// ============================================================================

const RUBRIC_PROMPT = `You are evaluating an answer against a rubric. Score the answer on
four axes, each 0-3:

1. factual_correctness: Are the facts asserted accurate?
   (0=wrong; 1=mostly wrong; 2=mostly correct; 3=precise + verifiable)
2. completeness: Does the answer cover the prompt scope?
   (0=misses central thing; 1=major omissions; 2=minor gaps;
    3=full coverage)
3. actionability: Can the user proceed from this answer?
   (0=no concrete pointers; 1=vague; 2=concrete but missing why;
    3=concrete + governing constraint cited)
4. hallucination: Does the answer assert items that don't exist?
   (0=≥2 fabrications; 1=one fabrication; 2=slight overclaim;
    3=all references verifiable)

Output ONLY a JSON object with exactly these four keys mapping to
integer 0-3. No prose, no markdown fencing, no commentary.

Schema:
{"factual_correctness": 0|1|2|3, "completeness": 0|1|2|3,
 "actionability": 0|1|2|3, "hallucination": 0|1|2|3}`;

const PROMPT_TEXT = `In httpx, what happens when you call \`response.content\` on a streaming response? What lifecycle must you respect, and what are the rules around \`read()\` vs \`iter_bytes()\`?`;

const ANSWER_TEXT = `I have everything I need. Here's the complete answer:

## What happens when you call \`response.content\` on a streaming response

**It raises \`ResponseNotRead\`** — by design. Looking at \`Response.content\` in \`httpx/_models.py:635-639\`:

\`\`\`python
@property
def content(self) -> bytes:
    if not hasattr(self, "_content"):
        raise ResponseNotRead()
    return self._content
\`\`\`

The body is only materialized into \`self._content\` when something explicitly reads the stream. For non-streaming requests httpx does this for you before returning; for streaming it doesn't.

This is a deliberate architectural commitment from **ADR-05**, not an implementation detail:

> *"Accessing response.content on an unread streamed response must raise ResponseNotRead."* — surfaces lifecycle mistakes as errors rather than returning empty bodies or blocking.

> *"Buffer-by-default response behavior is a stable public commitment; switching to stream-by-default would be a major version breaking change."* — every existing \`response.content\` access would raise \`ResponseNotRead\` under stream-default.

## The lifecycle you must respect

Response bodies track **three states: Unread → Read → Closed.** Several hard rules govern transitions:

1. **Always use \`client.stream(...)\` as a context manager.** Per ADR-05: *"Streaming responses are opt-in via Client.stream/AsyncClient.stream, which must be used as a context manager. Exiting the context closes the underlying stream and releases the socket; without the context manager, cleanup is not guaranteed."* The stream lifecycle is bound to the response via \`BoundSyncStream\`/\`BoundAsyncStream\`, which record \`response.elapsed\` on close and propagate close to the transport.

2. **To access \`.content\`, you must first call \`.read()\` (or \`.aread()\`).** That populates \`self._content\`. After this, \`.content\`, \`.text\`, and \`.json()\` all work normally.

3. **Pick one: \`read()\` OR \`iter_bytes()\` — not both.** Per ADR-05: *"\`response.read()\` is idempotent (returns cached \`.content\`); \`iter_bytes()\` is not and raises \`StreamConsumed\` after prior read/iteration."* Iteration consumes; reading caches.

4. **Don't touch the response after the context exits.** *"Iteration or reads after read()/close() must raise \`StreamConsumed\` or \`StreamClosed\`."*

5. **\`response.elapsed\` is only meaningful after close** — it measures time-to-last-byte for streamed responses. TTFB must be measured manually.

## Typical patterns

\`\`\`python
# Wrong — raises ResponseNotRead
with client.stream("GET", url) as r:
    data = r.content   # ❌

# Right — iterate
with client.stream("GET", url) as r:
    for chunk in r.iter_bytes():
        ...
    # r.content still raises here — stream was consumed, not read

# Right — force materialization, then use .content/.text/.json()
with client.stream("GET", url) as r:
    r.read()
    data = r.content   # ✅
\`\`\`

## Adjacent gotchas worth knowing

- **Auth schemes can force materialization even inside \`stream()\`.** Schemes declaring \`requires_response_body\` (e.g. digest auth) materialize the first-leg body because auth runs before streaming iteration begins.
- **Event hooks fire before the body is materialized** and may opt-in by calling \`response.read()\`/\`aread()\`.
- **\`iter_raw\`/\`aiter_raw\`** return undecoded bytes — no gzip/brotli/zstd decompression — vs \`iter_bytes\` which decodes.
- **Pool pressure (soft constraint):** slow streaming consumers hold a pool slot for the entire iteration. Under HTTP/1.1 this also blocks other requests on the same connection — prefer HTTP/2 for high-throughput streaming.`;

// ============================================================================
// Probe execution + pass-criteria assertion
// ============================================================================

const AXES = [
  "factual_correctness",
  "completeness",
  "actionability",
  "hallucination",
];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("PROBE FAIL: ANTHROPIC_API_KEY env var not set");
    process.exit(1);
  }

  const anthropic = new Anthropic();
  const judge = createJudgeClient({ anthropic });

  console.log("Probe: invoking gradeSingle against Sonnet 4.6...");
  const startMs = Date.now();
  let result;
  try {
    result = await judge.gradeSingle({
      rubricPrompt: RUBRIC_PROMPT,
      prompt: PROMPT_TEXT,
      answer: ANSWER_TEXT,
    });
  } catch (err) {
    if (err instanceof JudgeParseError) {
      console.error(`PROBE FAIL: JudgeParseError — ${err.message}`);
      console.error("Response text (first 500 chars):");
      console.error(err.responseText.slice(0, 500));
      process.exit(1);
    }
    console.error("PROBE FAIL: unexpected error during gradeSingle");
    console.error(err);
    process.exit(1);
  }
  const elapsedMs = Date.now() - startMs;

  console.log(`\nProbe complete in ${elapsedMs}ms.\n`);
  console.log("Result:");
  console.log(JSON.stringify(result, null, 2));
  console.log();

  // ==========================================================================
  // Pass criteria assertions (6 criteria per Step 2.4 surface §6)
  // ==========================================================================

  const failures = [];

  // Criterion 1: scores parse into valid RubricResult
  for (const axis of AXES) {
    if (!(axis in result.scores)) {
      failures.push(`scores missing axis: ${axis}`);
    } else if (![0, 1, 2, 3].includes(result.scores[axis])) {
      failures.push(
        `scores.${axis} out of 0-3 range: ${result.scores[axis]}`,
      );
    }
  }

  // Criterion 2: input tokens in sanity range
  if (result.usage.inputTokens < 1000 || result.usage.inputTokens > 3000) {
    failures.push(
      `usage.inputTokens out of expected range [1000, 3000]: ${result.usage.inputTokens}`,
    );
  }

  // Criterion 3: output tokens in sanity range. Floor at 20: 4-axis
  // JSON at extreme compaction is ~25 tokens; floor 20 catches genuine
  // truncation while admitting compliant compact responses.
  if (result.usage.outputTokens < 20 || result.usage.outputTokens > 500) {
    failures.push(
      `usage.outputTokens out of expected range [20, 500]: ${result.usage.outputTokens}`,
    );
  }

  // Criterion 4: cost matches computeCostUsd exactly (strict equality;
  // both values flow through computeCostUsd with identical inputs)
  const expectedCost = computeCostUsd(result.usage, result.model);
  if (result.costUsd !== expectedCost) {
    failures.push(
      `costUsd mismatch: actual=${result.costUsd}, expected=${expectedCost}`,
    );
  }

  // Criterion 5: model is Sonnet 4.6 (default; not Opus)
  if (result.model !== "claude-sonnet-4-6") {
    failures.push(
      `model mismatch: actual=${result.model}, expected=claude-sonnet-4-6`,
    );
  }

  // Criterion 6: no JudgeParseError thrown; no retry triggered
  // (implicit; if either had occurred we would have exited above)

  if (failures.length === 0) {
    console.log("PROBE PASS — all 6 criteria satisfied.");
    console.log(`Cost: $${result.costUsd.toFixed(6)}`);
    process.exit(0);
  } else {
    console.error(`PROBE FAIL: ${failures.length} criterion failure(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("PROBE FAIL: top-level error");
  console.error(err);
  process.exit(1);
});
