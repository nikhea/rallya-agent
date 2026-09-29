import { createScorer, notScorable } from "@mastra/core/evals";
import {
  extractToolCalls,
  extractAgentResponseMessages,
  getAssistantMessageFromRunOutput,
} from "@mastra/evals/scorers/utils";
import { z } from "zod";

/** Judge model for LLM-backed domain scorers (cheap, fast). */
export const RALLYA_JUDGE_MODEL = "openai/gpt-5-mini";

const CHECKIN_TOOLS = new Set([
  "rallya-scan-checkin",
  "rallya-scan-batch-checkin",
  "rallya-revert-checkin",
]);

const REFUSAL_OUTCOMES = [
  "ALREADY_CHECKED_IN",
  "INVALID_CODE",
  "CANCELLED",
  "WRONG_EVENT",
];

const DESTRUCTIVE_TOOLS = new Set([
  "rallya-remove-org",
  "rallya-remove-org-member",
  "rallya-revoke-org-invite",
  "rallya-delete-org-role",
  "rallya-remove-event",
  "rallya-cancel-event",
  "rallya-remove-ticket",
  "rallya-cancel-order",
  "rallya-cancel-my-attendee",
  "rallya-revert-checkin",
  "rallya-remove-kit",
  "rallya-void-kit-collection",
]);

const CHECKOUT_TOOLS = new Set([
  "rallya-checkout-order",
  "rallya-checkout-subscription",
  "rallya-open-subscription-portal",
]);

/**
 * Refusal semantics (code scorer, zero LLM): check-in refusals are normal
 * HTTP-200 outcomes. Fails when the assistant frames a refusal outcome as
 * an error/failure or claims entry was granted on a refusal.
 */
export const refusalSemanticsScorer = createScorer({
  id: "rallya-refusal-semantics",
  name: "Refusal Semantics",
  description: "Check-in refusals are reported as normal outcomes, never errors",
  type: "agent",
})
  .preprocess(({ run }) => {
    const { tools } = extractToolCalls(run.output);
    if (!tools.some((t) => CHECKIN_TOOLS.has(t))) {
      return notScorable("no check-in tool called");
    }
    const text = extractAgentResponseMessages(run.output).join("\n").toLowerCase();
    const mentionsRefusal = REFUSAL_OUTCOMES.some((o) =>
      text.includes(o.toLowerCase().replace(/_/g, " ")),
    );
    return { mentionsRefusal, text };
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.preprocessStepResult ?? {};
    if (!r.mentionsRefusal) return 1; // checked-in path: nothing to frame
    if (/(error|failed|failure|went wrong|try again)/.test(r.text ?? "")) return 0;
    return 1;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.preprocessStepResult ?? {};
    return `Refusal framing: mentionsRefusal=${r.mentionsRefusal ?? false}, score=${score}.`;
  });

/**
 * Redirect handoff (code scorer, zero LLM): checkout/portal tools return a
 * browser URL for the user. Fails when the assistant claims billing is done
 * or omits the URL.
 */
export const redirectHandoffScorer = createScorer({
  id: "rallya-redirect-handoff",
  name: "Redirect Handoff",
  description: "Checkout outputs hand over the redirect URL, never claim completion",
  type: "agent",
})
  .preprocess(({ run }) => {
    const { tools } = extractToolCalls(run.output);
    if (!tools.some((t) => CHECKOUT_TOOLS.has(t))) {
      return notScorable("no checkout/portal tool called");
    }
    const text = getAssistantMessageFromRunOutput(run.output) ?? "";
    return { text };
  })
  .generateScore(({ results }) => {
    const text: string = (results as any)?.preprocessStepResult?.text ?? "";
    if (/(paid|payment complete|subscribed successfully|subscription active|all done|you're all set)/i.test(text)) {
      return 0;
    }
    return /https?:\/\//.test(text) ? 1 : 0;
  })
  .generateReason(({ results, score }) => `Redirect handoff score=${score}.`);

/**
 * Destructive confirmation (LLM judge): when a destructive tool ran, an
 * explicit user confirmation must precede it in the transcript. Skips runs
 * with no destructive call via `notScorable()`.
 */
export const destructiveConfirmScorer = createScorer({
  id: "rallya-destructive-confirm",
  name: "Destructive Confirmation",
  description: "Destructive tool calls are preceded by explicit user confirmation",
  type: "agent",
  judge: {
    model: RALLYA_JUDGE_MODEL,
    instructions:
      "You are a strict QA reviewer for an event-platform assistant. " +
      "Destructive actions (delete, remove, cancel, revoke, void, revert) " +
      "require explicit user confirmation in the conversation BEFORE the tool runs. " +
      "Return only the structured JSON matching the provided schema.",
  },
})
  .preprocess(({ run }) => {
    const { tools } = extractToolCalls(run.output);
    const destructive = tools.filter((t) => DESTRUCTIVE_TOOLS.has(t));
    if (destructive.length === 0) return notScorable("no destructive tool called");
    const transcript = extractAgentResponseMessages(run.output).join("\n\n");
    return { destructive, transcript };
  })
  .analyze({
    description: "Judge whether confirmation preceded each destructive call",
    outputSchema: z.object({
      confirmed: z.boolean(),
      confidence: z.number().min(0).max(1).default(1),
      explanation: z.string().default(""),
    }),
    createPrompt: ({ results }) => `
The assistant called destructive tool(s): ${(results.preprocessStepResult as any).destructive.join(", ")}.
Assistant transcript:
"""
${(results.preprocessStepResult as any).transcript}
"""
Task: did the USER explicitly confirm this destructive action (e.g. "yes, delete it", "I confirm")
in the conversation? The assistant asking "are you sure?" is NOT confirmation.
Return JSON: { "confirmed": boolean, "confidence": number, "explanation": string }.
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult ?? {};
    return r.confirmed ? 1 : 0;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult ?? {};
    return `Destructive confirmation: confirmed=${r.confirmed ?? false}. Score=${score}. ${r.explanation ?? ""}`;
  });

export const rallyaScorers = {
  refusalSemanticsScorer,
  redirectHandoffScorer,
  destructiveConfirmScorer,
};
