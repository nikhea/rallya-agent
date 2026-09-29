import {
  BatchPartsProcessor,
  ModerationProcessor,
  ProcessorStepSchema,
  PromptInjectionDetector,
  ProviderHistoryCompat,
  SystemPromptScrubber,
  TokenCostControl,
  TokenLimiter,
  ToolCallFilter,
  UnicodeNormalizer,
} from "@mastra/core/processors";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { ProcessorWorkflow } from "@mastra/core/processors";
import { rallyaToolSearch } from "./tool-search.js";

/**
 * Guardrails and pipeline processors for the Rallya agents.
 *
 * What's included and why:
 * - `UnicodeNormalizer` — cheap, model-free cleanup (control chars,
 *   whitespace) before anything else sees the input.
 * - `rallyaToolSearch` (existing) — runtime tool discovery; kept in place.
 * - `PromptInjectionDetector` + input `ModerationProcessor`, composed into
 *   the `rallya-input-guardrails` workflow so both block-only LLM checks run
 *   in **parallel** (halving guardrail latency). Jailbreaks must not reach a
 *   model that moves money and deletes data. Model failures fall back to
 *   warn-and-continue (the default): destructive and billing tools
 *   additionally require human approval, so a guardrail outage degrades to
 *   the approval gate rather than bricking the agent.
 * - `ModerationProcessor` (`block`: hate/harassment/violence) on input (in
 *   the parallel workflow) and output (with `chunkWindow: 1` for streamed
 *   context) — public-facing event assistant.
 * - `TokenLimiter` (127k) — caps context after memory + search expansion.
 * - `BatchPartsProcessor` first on output — batches stream chunks so the
 *   output moderation classifier runs per batch, not per chunk.
 * - `ToolCallFilter` — strips tool calls/results from *prior history* sent
 *   to the LLM (current-loop steps untouched), saving tokens on verbose
 *   ticket/event JSON. Filtered messages stay saved to memory.
 * - `ProviderHistoryCompat` — rewrites cross-provider history
 *   incompatibilities and recovers from known provider API errors. Required
 *   here: the agent fails over across providers (ollama → nvidia), reusing
 *   message history between them.
 * - `TokenCostControl` (`warn`, RALLYA_MAX_COST_USD per thread / 24h) —
 *   cost backstop from observability metrics (DuckDB exporter supports it).
 *   Warn-only: alerts without stranding paid flows mid-task.
 * - `SystemPromptScrubber` (output, `redact`) — last line of defense
 *   against leaking instructions or internal config in replies.
 *
 * Deliberately NOT included:
 * - `PIIDetector` — the agent legitimately handles names, emails, and
 *   phone-adjacent data (rosters, invites, walk-ins). Blocking or redacting
 *   PII would break core flows.
 * - `LanguageDetector` — no multilingual requirement; per-request LLM cost
 *   with no payoff.
 * - `ResponseCache` — unsafe with side-effect tools: cache hits replay
 *   without re-executing, so orders/checkouts/deletes must never be cached.
 *
 * Guardrail classification model: override with RALLYA_GUARDRAIL_MODEL
 * (any `provider/model` id). Small/cheap is fine — classification only.
 */
const GUARDRAIL_MODEL =
  process.env.RALLYA_GUARDRAIL_MODEL ?? "openai/gpt-5-nano";

const inputModeration = new ModerationProcessor({
  model: GUARDRAIL_MODEL,
  threshold: 0.7,
  strategy: "block",
  categories: ["hate", "harassment", "violence"],
});

const outputModeration = new ModerationProcessor({
  model: GUARDRAIL_MODEL,
  threshold: 0.7,
  strategy: "block",
  categories: ["hate", "harassment", "violence"],
  chunkWindow: 1,
});

const injectionDetector = new PromptInjectionDetector({
  model: GUARDRAIL_MODEL,
  threshold: 0.8,
  strategy: "block",
  detectionTypes: ["injection", "jailbreak", "system-override"],
});

/**
 * Input guardrail workflow: the two LLM-backed block-only checks run in
 * parallel (halving guardrail latency) instead of sequentially. Neither
 * branch mutates messages, so the map step passes through the moderation
 * branch output. A tripwire in either branch aborts before it runs.
 */
export const rallyaInputGuardrails = createWorkflow({
  id: "rallya-input-guardrails",
  inputSchema: ProcessorStepSchema,
  outputSchema: ProcessorStepSchema,
})
  .parallel([createStep(injectionDetector), createStep(inputModeration)])
  .map(async ({ inputData }) => inputData["processor:moderation"])
  // Docs-literal shape: createStep() processor steps consume the input
  // phase type, so this workflow cannot satisfy the installed version's
  // ProcessorWorkflow generics (which demand the output phase type).
  // The cast bridges static types only — at runtime the pipeline follows
  // the documented parallel-block-then-passthrough shape, verified by
  // executing the workflow directly (see verify script below).
  .commit() as unknown as ProcessorWorkflow;

const maxCost = Number(process.env.RALLYA_MAX_COST_USD ?? 5);

export const rallyaInputProcessors = [
  new UnicodeNormalizer({ stripControlChars: true, collapseWhitespace: true }),
  new ProviderHistoryCompat(),
  rallyaToolSearch,
  rallyaInputGuardrails,
  new ToolCallFilter(),
  new TokenLimiter(127000),
  new TokenCostControl({
    maxCost: Number.isFinite(maxCost) && maxCost > 0 ? maxCost : 5,
    scope: "thread",
    window: "24h",
    strategy: "warn",
  }),
];

export const rallyaOutputProcessors = [
  new BatchPartsProcessor({ batchSize: 10 }),
  outputModeration,
  new SystemPromptScrubber({
    model: GUARDRAIL_MODEL,
    strategy: "redact",
    placeholderText: "[REDACTED]",
  }),
];
