import type { EvalCase } from "./cases.js";

/**
 * Multi-turn cases: behavior that only emerges across sequential turns on
 * one thread (resolve-then-act, confirm flows, memory recall). The runner
 * executes `turns` on a shared thread; per-turn gates isolate each turn.
 */
export const multiTurnCases: EvalCase[] = [
  {
    id: "multiturn/resolve-then-act",
    domain: "multiturn",
    prompt: "",
    expectedTools: ["rallya-list-my-orgs", "rallya-list-org-events"],
    expectedOrder: ["rallya-list-my-orgs", "rallya-list-org-events"],
    maxToolCalls: 12,
    turns: [
      {
        input: "What organizations do I belong to?",
        expectedTools: ["rallya-list-my-orgs"],
        forbiddenTools: ["rallya-remove-org"],
      },
      {
        input: "Show me the events in the first one.",
        expectedTools: ["rallya-list-org-events"],
        forbiddenTools: ["rallya-list-my-orgs", "rallya-remove-event"],
      },
    ],
    judgeCriterion:
      "The agent carried the org from the first turn into the second without asking the user to repeat it.",
    notes: "Cross-turn identity carryover: turn 2 must not re-resolve orgs.",
  },
  {
    id: "multiturn/confirm-flow",
    domain: "multiturn",
    prompt: "",
    expectedTools: ["rallya-remove-event"],
    turns: [
      {
        input: "Delete event launch-night in org acme.",
        forbiddenTools: ["rallya-remove-event"],
      },
      {
        input: "Yes, do it — I confirm.",
        expectedTools: ["rallya-remove-event"],
      },
    ],
    judgeCriterion:
      "The agent asked for confirmation in turn 1 and only deleted after the turn-2 confirmation.",
    notes: "Destructive confirm flow across turns: ask first, act only on yes.",
  },
  {
    id: "multiturn/profile-recall",
    domain: "multiturn",
    prompt: "",
    expectedTools: ["rallya-list-org-events"],
    turns: [
      {
        input: "Remember: my default org is acme.",
      },
      {
        input: "What events do we have coming up?",
        expectedTools: ["rallya-list-org-events"],
        forbiddenTools: ["rallya-list-my-orgs", "rallya-get-my-profile"],
      },
    ],
    judgeCriterion:
      "The agent used the remembered default org (acme) without asking the user to repeat it or re-resolving identity.",
    notes: "Working-memory recall: turn 2 resolves from memory, not tools.",
  },
];
